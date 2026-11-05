-- Médoc Hand Cards — base de données du serveur Supabase
--
-- À coller EN ENTIER dans Supabase → SQL Editor → New query → Run.
-- Le fichier peut être relancé sans risque après une mise à jour : il ne supprime aucune donnée.
--
-- Principe : le téléphone ne peut RIEN écrire directement dans les tables. Toutes les actions
-- (ouvrir un booster, fusionner, entraîner…) passent par les fonctions ci-dessous, qui vérifient
-- les règles et font chaque action d'un seul bloc. C'est ce qui empêche la triche.
--
-- Les cartes : chaque joueur du club existe en 4 paliers, avec le même pouvoir pour tous :
--   Bronze 50 → 59 · Argent 60 → 74 · Or 75 → 89 · Ultime 90 → 99.
-- Une carte tirée arrive au bas de son palier ; on la fait monter en l'entraînant ou en la faisant jouer.
-- 3 exemplaires du même joueur au même palier + quelques pièces = 1 exemplaire au palier suivant.

-- ════════════════════════════════════════════════════════════════════════════
-- Réglages du jeu (une seule ligne, modifiable dans Table Editor → parametres)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists parametres (id int primary key default 1 check (id = 1), valeurs jsonb not null);
-- les nouvelles clés sont ajoutées sans écraser celles déjà modifiées à la main
insert into parametres values (1, '{
  "depart_pieces": 1000,
  "booster_minutes": 30, "booster_stock_max": 5, "booster_stock_depart": 1,
  "booster_chances": {"bronze": 80, "argent": 12, "or": 7, "ultime": 1},
  "booster_or_chances": {"or": 90, "ultime": 10},
  "fusion_nombre": 3,
  "fusion_cout": {"bronze": 200, "argent": 600, "or": 2000},
  "entrainement_cout": {"bronze": 40, "argent": 80, "or": 150, "ultime": 300},
  "entrainement_xp": 50,
  "xp_par_point": {"bronze": 100, "argent": 150, "or": 200, "ultime": 300},
  "vente": {"bronze": 10, "argent": 40, "or": 150, "ultime": 600},
  "niveau_xp_base": 100, "niveau_xp_pas": 40,
  "niveau_pieces": 100, "niveau_pieces_max": 2000, "niveau_or_tous": 5,
  "xp_fusion": 20, "xp_entrainement": 5
}'::jsonb)
on conflict (id) do update set valeurs = excluded.valeurs || parametres.valeurs;

create or replace function param(k text) returns jsonb language sql stable security definer set search_path = public as $$
  select valeurs -> k from parametres where id = 1
$$;
create or replace function parami(k text) returns int language sql stable security definer set search_path = public as $$
  select (valeurs ->> k)::int from parametres where id = 1
$$;

-- Les 4 paliers (fixes)
create or replace function palier_min(p text) returns int language sql immutable as $$
  select case p when 'bronze' then 50 when 'argent' then 60 when 'or' then 75 when 'ultime' then 90 end
$$;
create or replace function palier_max(p text) returns int language sql immutable as $$
  select case p when 'bronze' then 59 when 'argent' then 74 when 'or' then 89 when 'ultime' then 99 end
$$;
create or replace function palier_suivant(p text) returns text language sql immutable as $$
  select case p when 'bronze' then 'argent' when 'argent' then 'or' when 'or' then 'ultime' end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Tables
-- ════════════════════════════════════════════════════════════════════════════

-- Catalogue des cartes, rempli par l'outil admin.html (bouton « Synchroniser avec le site »).
create table if not exists cartes (
  id text primary key,                 -- nom simplifié, ne change jamais (ex. 'mael-benharoun')
  nom text not null,
  equipe text not null,
  poste text check (poste in ('AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB')),
  stats jsonb not null,                -- les 6 stats réglées dans l'outil (le profil du joueur)
  site jsonb not null,                 -- la carte de data/cartes.json (stats de medochandballstats.com)
  reglages jsonb,                      -- réglages faits dans l'outil (null = valeurs par défaut)
  actif boolean not null default true, -- false : plus tirée dans les boosters, mais reste dans les clubs
  maj timestamptz not null default now()
);
alter table cartes add column if not exists ecarts jsonb not null default '{}';   -- stat − note du profil : la forme du joueur
alter table cartes add column if not exists photos jsonb not null default '{}';   -- une photo par palier
alter table cartes add column if not exists photo text;
-- colonnes de la première version, plus utilisées
alter table cartes add column if not exists ovr int;
alter table cartes add column if not exists rarete text;
alter table cartes alter column ovr drop not null;
alter table cartes alter column rarete drop not null;

-- Un compte joueur (l'e-mail reste dans auth.users, géré par Supabase).
create table if not exists profils (
  user_id uuid primary key references auth.users on delete cascade,
  pseudo text not null check (pseudo ~ '^[A-Za-z0-9À-ÖØ-öø-ÿ_.-]{3,20}$'),
  pieces int not null check (pieces >= 0),
  equipe jsonb not null default '{}',        -- Mon 7 : {poste: id de l'exemplaire}
  role text not null default 'joueur' check (role in ('joueur', 'admin')),
  accord_le timestamptz not null default now(),  -- « j'ai 15 ans ou plus, ou l'accord de mes parents »
  cree_le timestamptz not null default now()
);
alter table profils add column if not exists niveau int not null default 1;
alter table profils add column if not exists xp int not null default 0;
alter table profils add column if not exists depart boolean not null default false;   -- booster de départ ouvert
alter table profils add column if not exists boosters int not null default 1;         -- boosters gratuits en stock
alter table profils add column if not exists boosters_maj timestamptz not null default now();
alter table profils add column if not exists bonus int not null default 0;            -- boosters gagnés (niveaux…)
alter table profils add column if not exists bonus_or int not null default 0;         -- boosters « Or ou mieux »
alter table profils add column if not exists boosters_ouverts int not null default 0;
alter table profils add column if not exists tactique text not null default 'equilibre';
create unique index if not exists profils_pseudo on profils (lower(pseudo));

-- Chaque carte possédée : un joueur du club, à un palier, avec sa note et son expérience
create table if not exists exemplaires (
  id uuid primary key default gen_random_uuid(),
  proprietaire uuid not null references profils on delete cascade,
  carte_id text not null references cartes,
  palier text not null check (palier in ('bronze', 'argent', 'or', 'ultime')),
  note int not null check (note between 50 and 99),
  xp int not null default 0 check (xp >= 0),
  verrou text,                       -- « marche » : en vente au marché des transferts
  origine text,
  obtenu_le timestamptz not null default now()
);
create index if not exists exemplaires_proprio on exemplaires (proprietaire, carte_id, palier);

-- Quêtes du jour de chaque joueur
create table if not exists quetes (
  user_id uuid not null references profils on delete cascade,
  jour date not null,
  quete text not null,
  progres int not null default 0,
  reclamee boolean not null default false,
  primary key (user_id, jour, quete)
);

-- Journal de tout ce qui bouge (pièces, cartes) : pour comprendre un litige ou repérer une triche.
create table if not exists mouvements (
  id bigserial primary key, user_id uuid, quoi text not null, detail jsonb, le timestamptz not null default now()
);
create index if not exists mouvements_user on mouvements (user_id, le);

-- ════════════════════════════════════════════════════════════════════════════
-- Accès : lecture seulement de ce qui nous concerne, aucune écriture directe
-- ════════════════════════════════════════════════════════════════════════════
alter table parametres enable row level security;
alter table cartes enable row level security;
alter table profils enable row level security;
alter table exemplaires enable row level security;
alter table quetes enable row level security;
alter table mouvements enable row level security;

drop policy if exists lecture on parametres;  create policy lecture on parametres for select using (true);
drop policy if exists lecture on cartes;      create policy lecture on cartes for select using (true);
drop policy if exists lecture on profils;     create policy lecture on profils for select using (user_id = auth.uid());
drop policy if exists lecture on exemplaires; create policy lecture on exemplaires for select using (proprietaire = auth.uid());
drop policy if exists lecture on quetes;      create policy lecture on quetes for select using (user_id = auth.uid());
-- mouvements : aucune politique, donc illisible depuis le jeu

revoke insert, update, delete, truncate on parametres, cartes, profils, exemplaires, quetes, mouvements from anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Outils internes (non appelables depuis le jeu, voir les droits en bas)
-- ════════════════════════════════════════════════════════════════════════════

-- Date du jour en France (quêtes et limites du jour suivent l'heure de Paris, pas celle du téléphone)
create or replace function aujourdhui() returns date language sql stable as $$
  select (now() at time zone 'Europe/Paris')::date
$$;
create or replace function debut_du_jour() returns timestamptz language sql stable as $$
  select aujourdhui()::timestamp at time zone 'Europe/Paris'
$$;

-- Profil du joueur connecté, verrouillé jusqu'à la fin de l'action (deux actions ne se mélangent jamais)
create or replace function moi() returns profils language plpgsql security definer set search_path = public as $$
declare p profils;
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour jouer'; end if;
  select * into p from profils where user_id = auth.uid() for update;
  if not found then raise exception 'Crée d’abord ton profil de joueur'; end if;
  return p;
end $$;

create or replace function est_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where user_id = auth.uid() and role = 'admin')
$$;

create or replace function noter(p_uid uuid, p_quoi text, p_detail jsonb) returns void language sql security definer set search_path = public as $$
  insert into mouvements (user_id, quoi, detail) values (p_uid, p_quoi, p_detail)
$$;

-- XP nécessaire pour passer du niveau n au suivant
create or replace function xp_niveau(n int) returns int language sql stable security definer set search_path = public as $$
  select parami('niveau_xp_base') + parami('niveau_xp_pas') * (n - 1)
$$;

-- Boosters gratuits : un de plus toutes les 30 minutes, jusqu'à 5 en stock (le compteur ne tourne pas stock plein)
create or replace function boosters_a_jour(p_uid uuid) returns void language plpgsql security definer set search_path = public as $$
declare p profils; minutes int := parami('booster_minutes'); maxi int := parami('booster_stock_max'); n int;
begin
  select * into p from profils where user_id = p_uid;
  if p.boosters >= maxi then
    update profils set boosters_maj = now() where user_id = p_uid;
    return;
  end if;
  n := floor(extract(epoch from now() - p.boosters_maj) / (minutes * 60));
  if n <= 0 then return; end if;
  if p.boosters + n >= maxi then
    update profils set boosters = maxi, boosters_maj = now() where user_id = p_uid;
  else
    update profils set boosters = boosters + n, boosters_maj = boosters_maj + make_interval(mins => n * minutes) where user_id = p_uid;
  end if;
end $$;

-- Catalogue des quêtes du jour : [id, objectif, xp, pièces, texte]
create or replace function quetes_catalogue() returns table (id text, objectif int, xp int, pieces int, texte text)
language sql immutable as $$
  values ('booster', 2, 50, 100, 'Ouvre 2 boosters'),
         ('entrainement', 3, 60, 120, 'Fais 3 séances d’entraînement'),
         ('fusion', 1, 120, 250, 'Fais une fusion'),
         ('vente', 2, 40, 80, 'Vends 2 cartes en trop'),
         ('equipe', 1, 30, 60, 'Modifie ton Mon 7')
$$;

-- 3 quêtes par jour, choisies au hasard mais toujours les mêmes pour un joueur et un jour
create or replace function quetes_du_jour(p_uid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from quetes where user_id = p_uid and jour = aujourdhui()) then return; end if;
  insert into quetes (user_id, jour, quete)
    select p_uid, aujourdhui(), q.id from quetes_catalogue() q
    order by md5(p_uid::text || aujourdhui()::text || q.id) limit 3
  on conflict do nothing;
end $$;

-- Fait avancer les quêtes du jour d'un type
create or replace function progresser(p_uid uuid, p_quete text, p_n int default 1) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform quetes_du_jour(p_uid);
  update quetes set progres = progres + p_n where user_id = p_uid and jour = aujourdhui() and quete = p_quete;
end $$;

-- Gagne de l'expérience de compte ; chaque niveau donne des pièces et un booster (Or ou mieux tous les 5 niveaux)
create or replace function gagner_xp(p_uid uuid, p_xp int) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils; gains jsonb := '[]'; v_pieces int; orr boolean;
begin
  update profils set xp = xp + p_xp where user_id = p_uid returning * into p;
  while p.xp >= xp_niveau(p.niveau) loop
    v_pieces := least(parami('niveau_pieces') * (p.niveau + 1), parami('niveau_pieces_max'));
    orr := (p.niveau + 1) % parami('niveau_or_tous') = 0;
    update profils set xp = xp - xp_niveau(niveau), niveau = niveau + 1, pieces = pieces + v_pieces,
      bonus = bonus + case when orr then 0 else 1 end, bonus_or = bonus_or + case when orr then 1 else 0 end
      where user_id = p_uid returning * into p;
    gains := gains || jsonb_build_object('niveau', p.niveau, 'pieces', v_pieces, 'booster', case when orr then 'or' else 'bonus' end);
    perform noter(p_uid, 'niveau', jsonb_build_object('niveau', p.niveau, 'pieces', v_pieces));
  end loop;
  return gains;
end $$;

-- Expérience d'un exemplaire : chaque palier de XP donne +1 point, jusqu'au plafond du palier
create or replace function xp_carte(p_ex uuid, p_xp int) returns void language plpgsql security definer set search_path = public as $$
declare e exemplaires; cout int;
begin
  select * into e from exemplaires where id = p_ex for update;
  if e.note >= palier_max(e.palier) then return; end if;
  cout := (param('xp_par_point') ->> e.palier)::int;
  e.xp := e.xp + p_xp;
  while e.xp >= cout and e.note < palier_max(e.palier) loop
    e.xp := e.xp - cout; e.note := e.note + 1;
  end loop;
  if e.note >= palier_max(e.palier) then e.xp := 0; end if;
  update exemplaires set note = e.note, xp = e.xp where id = p_ex;
end $$;

-- Palier au hasard selon des chances {"bronze": 80, …}
create or replace function tirer_palier(p_chances jsonb) returns text language plpgsql volatile as $$
declare tot numeric; x numeric; r record;
begin
  select sum(value::numeric) into tot from jsonb_each_text(p_chances) where value::numeric > 0;
  x := random() * tot;
  for r in select key, value::numeric v from jsonb_each_text(p_chances) where value::numeric > 0
      order by array_position(array['bronze', 'argent', 'or', 'ultime'], key) loop
    x := x - r.v;
    if x <= 0 then return r.key; end if;
  end loop;
  return r.key;
end $$;

-- Joueur au hasard parmi les cartes en jeu (d'un poste donné si demandé ; sinon tous)
create or replace function tirer_carte(p_poste text default null, p_sauf text[] default '{}') returns text
language plpgsql volatile security definer set search_path = public as $$
declare c text;
begin
  if p_poste is not null then
    select id into c from cartes where actif and poste = p_poste and id <> all(p_sauf) order by random() limit 1;
    -- poste pas encore renseigné dans l'outil : un joueur de champ quelconque (jamais un gardien sur le terrain)
    if c is null and p_poste <> 'GB' then
      select id into c from cartes where actif and poste is distinct from 'GB' and id <> all(p_sauf) order by random() limit 1;
    end if;
  else
    select id into c from cartes where actif and id <> all(p_sauf) order by random() limit 1;
  end if;
  return c;
end $$;

create or replace function creer_exemplaire(p_uid uuid, p_carte text, p_palier text, p_origine text) returns uuid
language sql security definer set search_path = public as $$
  insert into exemplaires (proprietaire, carte_id, palier, note, origine)
  values (p_uid, p_carte, p_palier, palier_min(p_palier), p_origine) returning id
$$;

-- État complet d'un joueur, dans le format qu'attend le jeu (serveur.js)
create or replace function etat_de(p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profil', true, 'pseudo', p.pseudo, 'role', p.role, 'pieces', p.pieces,
    'niveau', p.niveau, 'xp', p.xp, 'xpNiveau', xp_niveau(p.niveau),
    'depart', p.depart, 'boosters', p.boosters, 'bonus', p.bonus, 'bonusOr', p.bonus_or, 'boostersOuverts', p.boosters_ouverts,
    'boosterMax', parami('booster_stock_max'),
    'prochainBooster', case when p.boosters >= parami('booster_stock_max') then null
      else greatest(0, ceil(extract(epoch from p.boosters_maj + make_interval(mins => parami('booster_minutes')) - now())))::int end,
    'equipe', p.equipe, 'tactique', p.tactique,
    'exemplaires', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'carte', e.carte_id, 'palier', e.palier, 'note', e.note,
        'xp', e.xp, 'verrou', e.verrou) order by e.obtenu_le) from exemplaires e where e.proprietaire = p.user_id), '[]'),
    'quetes', coalesce((select jsonb_agg(jsonb_build_object('id', q.quete, 'progres', least(q.progres, c.objectif), 'objectif', c.objectif,
        'xp', c.xp, 'pieces', c.pieces, 'texte', c.texte, 'reclamee', q.reclamee) order by c.id)
      from quetes q join quetes_catalogue() c on c.id = q.quete where q.user_id = p.user_id and q.jour = aujourdhui()), '[]'))
  from profils p where p.user_id = p_uid
$$;

-- Vérifie que les cartes d'une équipe {poste: exemplaire} sont au joueur, libres, au bon poste et toutes différentes
create or replace function verifier_equipe(p_uid uuid, p_equipe jsonb) returns void language plpgsql security definer set search_path = public as $$
declare l record;
begin
  if jsonb_typeof(p_equipe) <> 'object' then raise exception 'Équipe invalide'; end if;
  for l in select key, value from jsonb_each_text(p_equipe) loop
    if l.key not in ('AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB') then raise exception 'Poste inconnu'; end if;
    if not exists (select 1 from exemplaires e join cartes c on c.id = e.carte_id
        where e.id::text = l.value and e.proprietaire = p_uid and e.verrou is null
          and (l.key = 'GB') = (c.poste is not distinct from 'GB')) then
      raise exception 'Une carte ne peut pas jouer à ce poste, ou n’est plus dans ton club';
    end if;
  end loop;
  if (select count(distinct e.carte_id) <> count(*) from jsonb_each_text(p_equipe) j join exemplaires e on e.id::text = j.value) then
    raise exception 'Un même joueur ne peut être aligné qu’une fois';
  end if;
end $$;

-- Retire de Mon 7 les cartes qui n'y ont plus leur place (vendues, fusionnées, au marché)
create or replace function nettoyer_equipe(p_uid uuid) returns void language sql security definer set search_path = public as $$
  update profils set equipe = coalesce((select jsonb_object_agg(j.key, j.value) from jsonb_each(equipe) j
    where exists (select 1 from exemplaires e where e.id::text = j.value #>> '{}' and e.proprietaire = p_uid and e.verrou is null)), '{}')
  where user_id = p_uid
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Compte
-- ════════════════════════════════════════════════════════════════════════════

-- État du joueur connecté ; {"profil": false} s'il n'a pas encore créé son profil
create or replace function mon_etat() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour jouer'; end if;
  if exists (select 1 from profils where user_id = auth.uid()) then
    perform boosters_a_jour(auth.uid());
    perform quetes_du_jour(auth.uid());
  end if;
  return coalesce(etat_de(auth.uid()), '{"profil": false}'::jsonb);
end $$;

create or replace function creer_profil(p_pseudo text, p_accord boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour jouer'; end if;
  if exists (select 1 from profils where user_id = auth.uid()) then raise exception 'Tu as déjà un profil'; end if;
  if not coalesce(p_accord, false) then
    raise exception 'Il faut avoir 15 ans ou plus, ou l’accord de tes parents, pour créer un compte';
  end if;
  p_pseudo := btrim(p_pseudo);
  if p_pseudo !~ '^[A-Za-z0-9À-ÖØ-öø-ÿ_.-]{3,20}$' then
    raise exception 'Pseudo : 3 à 20 caractères (lettres, chiffres, point, tiret, tiret bas)';
  end if;
  begin
    insert into profils (user_id, pseudo, pieces, boosters, boosters_maj)
      values (auth.uid(), p_pseudo, parami('depart_pieces'), parami('booster_stock_depart'), now());
  exception when unique_violation then
    raise exception 'Ce pseudo est déjà pris';
  end;
  perform quetes_du_jour(auth.uid());
  perform noter(auth.uid(), 'profil', jsonb_build_object('pseudo', p_pseudo));
  return jsonb_build_object('etat', etat_de(auth.uid()));
end $$;

-- Supprime le compte, ses cartes et son journal (droit à l'effacement)
create or replace function supprimer_mon_compte() returns void language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Connecte-toi d’abord'; end if;
  delete from mouvements where user_id = u;
  delete from auth.users where id = u;   -- efface aussi le profil, les cartes et les quêtes (en cascade)
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Cartes : boosters, fusion, entraînement, vente, Mon 7
-- ════════════════════════════════════════════════════════════════════════════

-- Booster de départ : 7 joueurs, un par poste, alignés tout de suite dans Mon 7
create or replace function ouvrir_depart() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); poste text; c text; ids uuid[] := '{}'; pris text[] := '{}'; e jsonb := '{}'; ex uuid;
begin
  if p.depart then raise exception 'Tu as déjà ouvert ton booster de départ'; end if;
  foreach poste in array array['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB'] loop
    c := tirer_carte(poste, pris);
    if c is null then raise exception 'Le catalogue n’a pas assez de cartes : reviens bientôt'; end if;
    pris := pris || c;
    ex := creer_exemplaire(p.user_id, c, tirer_palier(param('booster_chances')), 'depart');
    ids := ids || ex;
    e := e || jsonb_build_object(poste, ex);
  end loop;
  update profils set depart = true, equipe = e, boosters_ouverts = boosters_ouverts + 1 where user_id = p.user_id;
  perform noter(p.user_id, 'depart', jsonb_build_object('exemplaires', ids));
  return jsonb_build_object('ids', to_jsonb(ids), 'etat', etat_de(p.user_id));
end $$;

-- Booster d'un joueur : p_type 'gratuit' (stock qui se recharge), 'bonus' (gagné) ou 'or' (Or ou mieux)
create or replace function ouvrir_booster(p_type text default 'gratuit') returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profils; c text; ex uuid; niveaux jsonb;
begin
  p := moi();
  perform boosters_a_jour(p.user_id);
  select * into p from profils where user_id = p.user_id;
  if p_type = 'gratuit' and p.boosters < 1 then raise exception 'Pas encore de booster : le prochain arrive bientôt'; end if;
  if p_type = 'bonus' and p.bonus < 1 then raise exception 'Pas de booster bonus'; end if;
  if p_type = 'or' and p.bonus_or < 1 then raise exception 'Pas de booster Or'; end if;
  if p_type not in ('gratuit', 'bonus', 'or') then raise exception 'Booster inconnu'; end if;
  c := tirer_carte();
  if c is null then raise exception 'Le catalogue est vide'; end if;
  ex := creer_exemplaire(p.user_id, c, tirer_palier(param(case when p_type = 'or' then 'booster_or_chances' else 'booster_chances' end)), 'booster:' || p_type);
  update profils set
    boosters = boosters - case when p_type = 'gratuit' then 1 else 0 end,
    -- stock plein : le compteur repart au moment où on ouvre
    boosters_maj = case when p_type = 'gratuit' and boosters >= parami('booster_stock_max') then now() else boosters_maj end,
    bonus = bonus - case when p_type = 'bonus' then 1 else 0 end,
    bonus_or = bonus_or - case when p_type = 'or' then 1 else 0 end,
    boosters_ouverts = boosters_ouverts + 1
  where user_id = p.user_id;
  perform progresser(p.user_id, 'booster');
  perform noter(p.user_id, 'booster', jsonb_build_object('type', p_type, 'exemplaire', ex, 'carte', c));
  return jsonb_build_object('ids', jsonb_build_array(ex), 'etat', etat_de(p.user_id));
end $$;

-- Fusion : 3 exemplaires du même joueur au même palier (les moins entraînés) → 1 au palier suivant
create or replace function fusionner(p_carte text, p_palier text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); suivant text := palier_suivant(p_palier); n int := parami('fusion_nombre'); cout int;
  pris uuid[]; ex uuid; e jsonb; niveaux jsonb;
begin
  if suivant is null then raise exception 'Une carte Ultime ne peut plus fusionner : entraîne-la jusqu’à 99'; end if;
  cout := (param('fusion_cout') ->> p_palier)::int;
  if p.pieces < cout then raise exception 'Il faut % pièces pour cette fusion', cout; end if;
  -- les moins entraînés (on garde les plus forts) ; à égalité, d'abord ceux qui ne jouent pas dans Mon 7
  select array_agg(id) into pris from (
    select e2.id from exemplaires e2 where e2.proprietaire = p.user_id and e2.carte_id = p_carte and e2.palier = p_palier and e2.verrou is null
    order by e2.note, e2.xp, exists (select 1 from jsonb_each_text(p.equipe) j where j.value = e2.id::text) limit n) t;
  if coalesce(cardinality(pris), 0) < n then raise exception 'Il faut % exemplaires libres de ce joueur au même palier', n; end if;
  ex := creer_exemplaire(p.user_id, p_carte, suivant, 'fusion');
  -- si un des exemplaires fusionnés jouait dans Mon 7, le nouveau prend sa place
  select coalesce(jsonb_object_agg(j.key, case when j.value #>> '{}' = any(pris::text[]) then to_jsonb(ex::text) else j.value end), '{}')
    into e from jsonb_each(p.equipe) j;
  delete from exemplaires where id = any(pris);
  update profils set pieces = pieces - cout, equipe = e where user_id = p.user_id;
  perform progresser(p.user_id, 'fusion');
  niveaux := gagner_xp(p.user_id, parami('xp_fusion'));
  perform noter(p.user_id, 'fusion', jsonb_build_object('carte', p_carte, 'de', p_palier, 'vers', suivant, 'cout', cout, 'exemplaire', ex));
  return jsonb_build_object('id', ex, 'niveaux', niveaux, 'etat', etat_de(p.user_id));
end $$;

-- Séance d'entraînement payée en pièces pour un exemplaire
create or replace function entrainer(p_ex uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); e exemplaires; cout int; apres int; niveaux jsonb;
begin
  select * into e from exemplaires where id = p_ex and proprietaire = p.user_id;
  if not found then raise exception 'Carte absente de ton club'; end if;
  if e.note >= palier_max(e.palier) then raise exception 'Cette carte est au maximum de son palier : fusionne pour monter'; end if;
  cout := (param('entrainement_cout') ->> e.palier)::int;
  if p.pieces < cout then raise exception 'Il faut % pièces pour cette séance', cout; end if;
  update profils set pieces = pieces - cout where user_id = p.user_id;
  perform xp_carte(p_ex, parami('entrainement_xp'));
  select note into apres from exemplaires where id = p_ex;
  perform progresser(p.user_id, 'entrainement');
  niveaux := gagner_xp(p.user_id, parami('xp_entrainement'));
  perform noter(p.user_id, 'entrainement', jsonb_build_object('exemplaire', p_ex, 'cout', cout, 'note', apres));
  return jsonb_build_object('avant', e.note, 'apres', apres, 'niveaux', niveaux, 'etat', etat_de(p.user_id));
end $$;

-- Vend un exemplaire (pas s'il joue dans Mon 7 ou s'il est au marché)
create or replace function vendre(p_ex uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); e exemplaires; gain int;
begin
  select * into e from exemplaires where id = p_ex and proprietaire = p.user_id;
  if not found then raise exception 'Carte absente de ton club'; end if;
  if e.verrou is not null then raise exception 'Cette carte est au marché des transferts'; end if;
  if exists (select 1 from jsonb_each_text(p.equipe) j where j.value = p_ex::text) then
    raise exception 'Cette carte joue dans ton Mon 7 : retire-la d’abord';
  end if;
  gain := (param('vente') ->> e.palier)::int;
  delete from exemplaires where id = p_ex;
  update profils set pieces = pieces + gain where user_id = p.user_id;
  perform progresser(p.user_id, 'vente');
  perform noter(p.user_id, 'vente', jsonb_build_object('carte', e.carte_id, 'palier', e.palier, 'note', e.note, 'gain', gain));
  return jsonb_build_object('gain', gain, 'etat', etat_de(p.user_id));
end $$;

create or replace function aligner(p_poste text, p_ex uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); e jsonb;
begin
  if p_poste not in ('AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB') then raise exception 'Poste inconnu'; end if;
  if p_ex is null then
    e := p.equipe - p_poste;
  else
    select coalesce(jsonb_object_agg(key, value), '{}') into e from jsonb_each(p.equipe)
      where value <> to_jsonb(p_ex::text) and key <> p_poste;
    e := e || jsonb_build_object(p_poste, p_ex);
    -- même joueur déjà aligné ailleurs (autre exemplaire) : il change de poste
    select coalesce(jsonb_object_agg(j.key, j.value), '{}') into e from jsonb_each(e) j
      where j.key = p_poste or (select carte_id from exemplaires where id::text = j.value #>> '{}')
        is distinct from (select carte_id from exemplaires where id = p_ex);
  end if;
  perform verifier_equipe(p.user_id, e);
  update profils set equipe = e where user_id = p.user_id;
  perform progresser(p.user_id, 'equipe');
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;

create or replace function aligner_equipe(p_equipe jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  perform verifier_equipe(p.user_id, p_equipe);
  update profils set equipe = p_equipe where user_id = p.user_id;
  perform progresser(p.user_id, 'equipe');
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;

-- Récompense d'une quête terminée
create or replace function reclamer_quete(p_quete text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); q quetes; c record; niveaux jsonb;
begin
  select * into q from quetes where user_id = p.user_id and jour = aujourdhui() and quete = p_quete for update;
  select * into c from quetes_catalogue() k where k.id = p_quete;
  if not found or q.user_id is null then raise exception 'Quête inconnue'; end if;
  if q.reclamee then raise exception 'Récompense déjà récupérée'; end if;
  if q.progres < c.objectif then raise exception 'Quête pas encore terminée'; end if;
  update quetes set reclamee = true where user_id = p.user_id and jour = aujourdhui() and quete = p_quete;
  update profils set pieces = pieces + c.pieces where user_id = p.user_id;
  niveaux := gagner_xp(p.user_id, c.xp);
  perform noter(p.user_id, 'quete', jsonb_build_object('quete', p_quete, 'xp', c.xp, 'pieces', c.pieces));
  return jsonb_build_object('xp', c.xp, 'pieces', c.pieces, 'niveaux', niveaux, 'etat', etat_de(p.user_id));
end $$;

create or replace function chercher_joueurs(p_texte text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  return coalesce((select jsonb_agg(pseudo order by lower(pseudo)) from (
    select pseudo from profils where user_id <> p.user_id and position(lower(btrim(p_texte)) in lower(pseudo)) > 0
    order by lower(pseudo) limit 20) t), '[]');
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Administration (outil admin.html, compte avec role = 'admin')
-- ════════════════════════════════════════════════════════════════════════════

-- Ajoute ou met à jour des cartes du catalogue. p_complet = true : toute carte absente de la liste
-- n'est plus tirée dans les boosters (elle reste dans les clubs de ceux qui l'ont).
create or replace function admin_publier_cartes(p_cartes jsonb, p_complet boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if not est_admin() then raise exception 'Réservé à l’administrateur'; end if;
  insert into cartes (id, nom, equipe, poste, stats, ecarts, photos, photo, site, reglages, actif, maj)
    select x ->> 'id', x ->> 'nom', x ->> 'equipe', x ->> 'poste', x -> 'stats', coalesce(x -> 'ecarts', '{}'),
      coalesce(x -> 'photos', '{}'), x ->> 'photo', x -> 'site', nullif(x -> 'reglages', 'null'::jsonb), true, now()
    from jsonb_array_elements(p_cartes) x
    on conflict (id) do update set nom = excluded.nom, equipe = excluded.equipe, poste = excluded.poste, stats = excluded.stats,
      ecarts = excluded.ecarts, photos = excluded.photos, photo = excluded.photo, site = excluded.site,
      reglages = excluded.reglages, actif = true, maj = now();
  if p_complet then
    update cartes set actif = false, maj = now()
      where actif and id not in (select x ->> 'id' from jsonb_array_elements(p_cartes) x);
    get diagnostics n = row_count;
  end if;
  perform noter(auth.uid(), 'admin-cartes', jsonb_build_object('cartes', jsonb_array_length(p_cartes), 'retirees', n));
  return jsonb_build_object('cartes', jsonb_array_length(p_cartes), 'retirees', n);
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Photos des cartes : lisibles par tous, déposées et supprimées par l'admin seulement
-- ════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict (id) do nothing;
drop policy if exists "photos admin lecture" on storage.objects;
drop policy if exists "photos admin ajout" on storage.objects;
drop policy if exists "photos admin suppression" on storage.objects;
create policy "photos admin lecture" on storage.objects for select to authenticated using (bucket_id = 'photos' and public.est_admin());
create policy "photos admin ajout" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and public.est_admin());
create policy "photos admin suppression" on storage.objects for delete to authenticated using (bucket_id = 'photos' and public.est_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- Droits : le jeu ne peut appeler QUE ces fonctions-là, et seulement une fois connecté
-- ════════════════════════════════════════════════════════════════════════════
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  mon_etat(), creer_profil(text, boolean), supprimer_mon_compte(),
  ouvrir_depart(), ouvrir_booster(text), fusionner(text, text), entrainer(uuid), vendre(uuid),
  aligner(text, uuid), aligner_equipe(jsonb), reclamer_quete(text), chercher_joueurs(text),
  admin_publier_cartes(jsonb, boolean), est_admin()
to authenticated;
