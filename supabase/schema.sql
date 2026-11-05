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
  "xp_fusion": 20, "xp_entrainement": 5,
  "tactique_bonus": 4, "match_base": 27, "match_coef": 0.2,
  "pve_par_jour": 10, "seances_par_jour": 5, "defis_par_jour": 5, "defis_meme_adversaire": 2,
  "seance_xp_carte": 40, "seance_xp": 10,
  "pve_xp": {"gagne": 30, "nul": 15, "perdu": 5},
  "pve_xp_carte": {"gagne": 30, "nul": 20, "perdu": 10},
  "pve_pieces": {"gagne": 60, "nul": 30, "perdu": 10},
  "saison_matchs": 10, "saison_points_montee": 20, "saison_pieces": 300,
  "divisions": [{"nom": "Division Bronze", "base": 50, "pas": 0.9}, {"nom": "Division Argent", "base": 61, "pas": 1.2},
                {"nom": "Division Or", "base": 76, "pas": 1.2}, {"nom": "Division Ultime", "base": 89, "pas": 0.9}],
  "adversaires": ["Les Aigles", "Les Loups", "Les Requins", "Les Pirates", "Les Ours", "Les Lynx", "Les Faucons",
                  "Les Bisons", "Les Panthères", "Les Corsaires"],
  "pvp_xp": {"gagne": 40, "nul": 20, "perdu": 10},
  "pvp_pieces": {"gagne": 80, "nul": 40, "perdu": 20},
  "pvp_trophees": {"gagne": 20, "nul": 5, "perdu": -10},
  "pvp_defense_trophees": {"gagne": 5, "nul": 0, "perdu": -5},
  "pari_min": 10, "pari_max": 300, "pari_marge": 0.92, "cote_min": 1.05, "cote_max": 12, "paris_jours": 14, "xp_pari": 10,
  "annonces_max": 5, "annonce_jours": 7,
  "booster_poste_prix": 300, "seance_payante_prix": 150
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
alter table profils add column if not exists division int not null default 1;          -- championnat : 1 Bronze … 4 Ultime
alter table profils add column if not exists saison_journee int not null default 0;
alter table profils add column if not exists saison_points int not null default 0;
alter table profils add column if not exists saison_bilan jsonb not null default '{"v": 0, "n": 0, "d": 0}';
alter table profils add column if not exists trophees int not null default 0;          -- défis contre les autres joueurs
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

-- Matchs joués : championnat, séances, défis (et défense quand on est défié)
create table if not exists rencontres (
  id bigserial primary key,
  user_id uuid not null references profils on delete cascade,
  type text not null check (type in ('championnat', 'seance', 'defi', 'defense')),
  adversaire text not null,
  score int[],                       -- {moi, adversaire}
  resultat text check (resultat in ('gagne', 'nul', 'perdu')),
  detail jsonb,
  le timestamptz not null default now()
);
create index if not exists rencontres_user on rencontres (user_id, type, le);

-- Vrais matchs des poules SG1, SG2, SF1, SF2 (data/matchs.json, envoyé par l'outil) et les paris dessus
create table if not exists matchs (
  rid text primary key,                -- identifiant du match à la FFHB
  equipe text not null,                -- poule de quelle équipe du club : SG1, SG2, SF1, SF2
  competition text, journee int, date date not null, heure text,
  dom text not null, ext text not null,
  medoc text check (medoc in ('dom', 'ext')),   -- le Médoc joue-t-il, et où
  p1 numeric, pn numeric, p2 numeric,           -- probabilités du modèle de medochandballstats.com
  score_dom int, score_ext int, forfait text,
  maj timestamptz not null default now()
);
create index if not exists matchs_date on matchs (date);
create table if not exists paris (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profils on delete cascade,
  rid text not null references matchs,
  choix text not null check (choix in ('1', 'N', '2')),
  mise int not null check (mise > 0),
  cote numeric(5, 2) not null,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'gagne', 'perdu')),
  gain int not null default 0,
  cree_le timestamptz not null default now(), regle_le timestamptz,
  unique (user_id, rid)
);

-- Marché des transferts : une carte contre une carte
create table if not exists annonces (
  id uuid primary key default gen_random_uuid(),
  vendeur uuid not null references profils on delete cascade,
  exemplaire uuid references exemplaires on delete set null,   -- la carte proposée (bloquée tant que l'annonce est ouverte)
  offre jsonb not null,                                         -- {carte, palier, note} au moment de l'annonce
  carte_cherchee text not null references cartes,
  palier_cherche text not null check (palier_cherche in ('bronze', 'argent', 'or', 'ultime')),
  statut text not null default 'ouverte' check (statut in ('ouverte', 'conclue', 'retiree')),
  acheteur uuid references profils on delete set null,
  cree_le timestamptz not null default now(), conclue_le timestamptz
);
create index if not exists annonces_ouvertes on annonces (statut, carte_cherchee, palier_cherche);

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
alter table rencontres enable row level security;
alter table matchs enable row level security;
alter table paris enable row level security;
alter table annonces enable row level security;

drop policy if exists lecture on parametres;  create policy lecture on parametres for select using (true);
drop policy if exists lecture on cartes;      create policy lecture on cartes for select using (true);
drop policy if exists lecture on profils;     create policy lecture on profils for select using (user_id = auth.uid());
drop policy if exists lecture on exemplaires; create policy lecture on exemplaires for select using (proprietaire = auth.uid());
drop policy if exists lecture on quetes;      create policy lecture on quetes for select using (user_id = auth.uid());
drop policy if exists lecture on rencontres;  create policy lecture on rencontres for select using (user_id = auth.uid());
drop policy if exists lecture on matchs;      create policy lecture on matchs for select using (true);
drop policy if exists lecture on paris;       create policy lecture on paris for select using (user_id = auth.uid());
drop policy if exists lecture on annonces;    create policy lecture on annonces for select using (auth.uid() in (vendeur, acheteur));
-- mouvements : aucune politique, donc illisible depuis le jeu

revoke insert, update, delete, truncate on parametres, cartes, profils, exemplaires, quetes, mouvements, rencontres, matchs, paris, annonces from anon, authenticated;

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
         ('equipe', 1, 30, 60, 'Modifie ton Mon 7'),
         ('championnat', 3, 80, 200, 'Joue 3 matchs de championnat'),
         ('victoire', 2, 100, 200, 'Gagne 2 matchs (championnat ou défi)'),
         ('defi', 2, 80, 150, 'Lance 2 défis'),
         ('seance', 1, 40, 80, 'Fais une séance d’entraînement d’équipe'),
         ('pari', 1, 40, 80, 'Fais un pari sur un vrai match du club'),
         ('marche', 1, 40, 100, 'Publie ou accepte une annonce au marché')
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
    'division', p.division, 'divisionNom', param('divisions') -> (p.division - 1) ->> 'nom',
    'saison', jsonb_build_object('journee', p.saison_journee, 'points', p.saison_points, 'bilan', p.saison_bilan,
      'matchs', parami('saison_matchs'), 'montee', parami('saison_points_montee'),
      'adversaire', param('adversaires') ->> (p.saison_journee % jsonb_array_length(param('adversaires'))),
      'niveauAdversaire', round(((param('divisions') -> (p.division - 1) ->> 'base')::numeric
        + (param('divisions') -> (p.division - 1) ->> 'pas')::numeric * p.saison_journee))::int),
    'trophees', p.trophees,
    'jour', jsonb_build_object(
      'championnat', (select count(*) from rencontres r where r.user_id = p.user_id and r.type = 'championnat' and r.le >= debut_du_jour()),
      'seance', (select count(*) from rencontres r where r.user_id = p.user_id and r.type = 'seance' and r.le >= debut_du_jour()),
      'defi', (select count(*) from rencontres r where r.user_id = p.user_id and r.type = 'defi' and r.le >= debut_du_jour())),
    'limites', jsonb_build_object('championnat', parami('pve_par_jour'), 'seance', parami('seances_par_jour'), 'defi', parami('defis_par_jour')),
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
    perform expirer_annonces();
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

-- Booster d'un poste, acheté en pièces : un joueur de ce poste (mêmes chances que le booster gratuit).
-- Seuls les joueurs dont le poste est renseigné dans l'outil sont tirés.
create or replace function ouvrir_booster_poste(p_poste text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); prix int := parami('booster_poste_prix'); c text; ex uuid;
begin
  if p_poste not in ('AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB') then raise exception 'Poste inconnu'; end if;
  if p.pieces < prix then raise exception 'Il faut % pièces pour ce booster', prix; end if;
  select id into c from cartes where actif and poste = p_poste order by random() limit 1;
  if c is null then raise exception 'Aucun joueur n’a encore ce poste'; end if;
  ex := creer_exemplaire(p.user_id, c, tirer_palier(param('booster_chances')), 'booster:' || p_poste);
  update profils set pieces = pieces - prix, boosters_ouverts = boosters_ouverts + 1 where user_id = p.user_id;
  perform progresser(p.user_id, 'booster');
  perform noter(p.user_id, 'booster', jsonb_build_object('type', 'poste', 'poste', p_poste, 'prix', prix, 'exemplaire', ex, 'carte', c));
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
-- Matchs : moteur, championnat, séance, défis
-- ════════════════════════════════════════════════════════════════════════════

-- Force d'une équipe {poste: exemplaire} : attaque, défense, note, et les tireurs avec leur poids.
-- Chaque joueur : note de l'exemplaire (−5 hors de son poste) + sa forme (écarts) → ses 6 stats.
-- Attaque = tir, passes, vitesse des 6 joueurs de champ ; défense = défense, physique, mental + gardien(ne).
create or replace function force_equipe(p_equipe jsonb, p_tactique text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l record; att numeric := 0; def numeric := 0; arr numeric := 0; notes numeric := 0; n int := 0;
  tireurs jsonb := '[]'; eqs jsonb := '{}'; maxi int; coll int; t int := parami('tactique_bonus');
  s_tir numeric; s_pas numeric; s_vit numeric; s_def numeric; s_phy numeric; s_men numeric; s_ref numeric; s_pla numeric; ne int;
begin
  for l in select j.key as slot, e.note, c.poste, c.nom, c.equipe, c.ecarts
      from jsonb_each_text(p_equipe) j join exemplaires e on e.id::text = j.value join cartes c on c.id = e.carte_id loop
    ne := l.note - case when l.slot <> 'GB' and l.poste is not null and l.poste <> l.slot then 5 else 0 end;
    n := n + 1; notes := notes + ne;
    eqs := jsonb_set(eqs, array[l.equipe], to_jsonb(coalesce((eqs ->> l.equipe)::int, 0) + 1));
    s_men := greatest(1, least(99, ne + coalesce((l.ecarts ->> 'men')::int, 0)));
    s_phy := greatest(1, least(99, ne + coalesce((l.ecarts ->> 'phy')::int, 0)));
    if l.slot = 'GB' then
      s_ref := greatest(1, least(99, ne + coalesce((l.ecarts ->> 'ref')::int, 0)));
      s_pla := greatest(1, least(99, ne + coalesce((l.ecarts ->> 'pla')::int, 0)));
      arr := .5 * s_ref + .3 * s_pla + .2 * s_men;
    else
      s_tir := greatest(1, least(99, ne + coalesce((l.ecarts ->> 'tir')::int, 0)));
      s_pas := greatest(1, least(99, ne + coalesce((l.ecarts ->> 'pas')::int, 0)));
      s_vit := greatest(1, least(99, ne + coalesce((l.ecarts ->> 'vit')::int, 0)));
      s_def := greatest(1, least(99, ne + coalesce((l.ecarts ->> 'def')::int, 0)));
      att := att + (.5 * s_tir + .3 * s_pas + .2 * s_vit) / 6;
      def := def + (.5 * s_def + .3 * s_phy + .2 * s_men) / 6;
      tireurs := tireurs || jsonb_build_object('n', l.nom, 'p', greatest(1, s_tir - 30));
    end if;
  end loop;
  if n < 7 then raise exception 'Il faut 7 joueurs alignés dans ton Mon 7 pour jouer'; end if;
  select max(value::int) into maxi from jsonb_each_text(eqs);
  coll := case when maxi >= 7 then 3 when maxi >= 5 then 2 when maxi >= 3 then 1 else 0 end;   -- coéquipier(e)s
  return jsonb_build_object(
    'att', round(att + coll + case p_tactique when 'attaque' then t when 'defense' then -t else 0 end, 1),
    'def', round(.6 * def + .4 * arr + coll + case p_tactique when 'defense' then t when 'attaque' then -t else 0 end, 1),
    'note', round(notes / n + coll), 'tireurs', tireurs);
end $$;

-- Équipe de l'ordinateur d'un niveau donné
create or replace function equipe_ordi(p_niveau numeric) returns jsonb language sql volatile as $$
  select jsonb_build_object('att', round((p_niveau + random() * 2 - 1)::numeric, 1), 'def', round((p_niveau + random() * 2 - 1)::numeric, 1), 'note', round(p_niveau),
    'tireurs', (select jsonb_agg(jsonb_build_object('n', 'n°' || k, 'p', 10)) from unnest(array[3, 7, 9, 10, 14, 21]) k))
$$;

-- Un tireur au hasard, selon son poids (les meilleurs tireurs marquent plus)
create or replace function tireur(p_tireurs jsonb) returns text language sql volatile as $$
  with t as (select x ->> 'n' n, sum((x ->> 'p')::numeric) over (order by i) cum, sum((x ->> 'p')::numeric) over () tot
             from jsonb_array_elements(p_tireurs) with ordinality a(x, i)), r as (select random() v)
  select n from t, r where cum >= v * tot order by cum limit 1
$$;

-- Match de 60 minutes : buts attendus selon attaque contre défense, un peu de hasard, puis le déroulé
create or replace function simuler(p_a jsonb, p_b jsonb) returns jsonb language plpgsql volatile as $$
declare ea numeric; eb numeric; ba int; bb int; buts jsonb := '[]'; i int;
  base numeric := parami('match_base'); k numeric := (param('match_coef') #>> '{}')::numeric;
begin
  ea := base + k * ((p_a ->> 'att')::numeric - (p_b ->> 'def')::numeric);
  eb := base + k * ((p_b ->> 'att')::numeric - (p_a ->> 'def')::numeric);
  ba := greatest(8, round(ea + (random() + random() + random() + random() - 2) * 5));
  bb := greatest(8, round(eb + (random() + random() + random() + random() - 2) * 5));
  for i in 1..ba loop buts := buts || jsonb_build_object('m', 1 + floor(random() * 60)::int, 'c', 'a', 'n', tireur(p_a -> 'tireurs')); end loop;
  for i in 1..bb loop buts := buts || jsonb_build_object('m', 1 + floor(random() * 60)::int, 'c', 'b', 'n', tireur(p_b -> 'tireurs')); end loop;
  select coalesce(jsonb_agg(x order by (x ->> 'm')::int, random()), '[]') into buts from jsonb_array_elements(buts) x;
  return jsonb_build_object('a', ba, 'b', bb, 'buts', buts,
    'resultat', case when ba > bb then 'gagne' when ba = bb then 'nul' else 'perdu' end);
end $$;

-- Les 7 cartes alignées gagnent de l'expérience
create or replace function xp_equipe(p_equipe jsonb, p_xp int) returns jsonb language plpgsql security definer set search_path = public as $$
declare l record; avant int; apres int; progres jsonb := '[]';
begin
  for l in select e.id, e.note, c.nom from jsonb_each_text(p_equipe) j join exemplaires e on e.id::text = j.value join cartes c on c.id = e.carte_id loop
    perform xp_carte(l.id, p_xp);
    select note into apres from exemplaires where id = l.id;
    if apres > l.note then progres := progres || jsonb_build_object('nom', l.nom, 'avant', l.note, 'apres', apres); end if;
  end loop;
  return progres;
end $$;

create or replace function verifier_tactique(p_tactique text) returns text language plpgsql immutable as $$
begin
  if p_tactique not in ('attaque', 'equilibre', 'defense') then raise exception 'Tactique inconnue'; end if;
  return p_tactique;
end $$;

create or replace function compter_jour(p_uid uuid, p_type text) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from rencontres where user_id = p_uid and type = p_type and le >= debut_du_jour()
$$;

-- Championnat contre l'ordinateur : 10 journées, adversaires de plus en plus forts ;
-- 20 points ou plus en fin de saison = montée dans la division supérieure
create or replace function match_championnat(p_tactique text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); dv jsonb; j int; niv numeric; adv text; fa jsonb; r jsonb; res text; pts int;
  xp int; xpc int; v_pieces int; niveaux jsonb; progres jsonb; bilan jsonb; fin jsonb := null; recompense int; cle text;
begin
  perform verifier_tactique(p_tactique);
  perform verifier_equipe(p.user_id, p.equipe);
  if compter_jour(p.user_id, 'championnat') >= parami('pve_par_jour') then
    raise exception 'Tu as joué tes % matchs de championnat du jour : reviens demain', parami('pve_par_jour');
  end if;
  dv := param('divisions') -> (p.division - 1);
  j := p.saison_journee + 1;
  niv := (dv ->> 'base')::numeric + (dv ->> 'pas')::numeric * (j - 1) + random() * 2 - 1;
  adv := param('adversaires') ->> ((j - 1) % jsonb_array_length(param('adversaires')));
  fa := force_equipe(p.equipe, p_tactique);
  r := simuler(fa, equipe_ordi(niv));
  res := r ->> 'resultat';
  pts := case res when 'gagne' then 3 when 'nul' then 1 else 0 end;
  xp := (param('pve_xp') ->> res)::int; xpc := (param('pve_xp_carte') ->> res)::int;
  v_pieces := (param('pve_pieces') ->> res)::int * p.division;
  cle := case res when 'gagne' then 'v' when 'nul' then 'n' else 'd' end;   -- bilan : victoires, nuls, défaites
  bilan := jsonb_set(p.saison_bilan, array[cle], to_jsonb(coalesce((p.saison_bilan ->> cle)::int, 0) + 1));
  update profils set tactique = p_tactique, pieces = pieces + v_pieces, saison_journee = j,
    saison_points = saison_points + pts, saison_bilan = bilan where user_id = p.user_id;
  -- fin de saison : récompense, montée éventuelle, nouvelle saison
  if j >= parami('saison_matchs') then
    recompense := parami('saison_pieces') * p.division * case when p.saison_points + pts >= parami('saison_points_montee') then 2 else 1 end;
    fin := jsonb_build_object('points', p.saison_points + pts, 'montee', p.saison_points + pts >= parami('saison_points_montee') and p.division < 4,
      'champion', p.saison_points + pts >= parami('saison_points_montee'), 'pieces', recompense, 'division', p.division);
    update profils set pieces = pieces + recompense, saison_journee = 0, saison_points = 0, saison_bilan = '{"v": 0, "n": 0, "d": 0}',
      division = least(4, division + case when (fin ->> 'montee')::boolean then 1 else 0 end),
      bonus = bonus + case when (fin ->> 'champion')::boolean then 1 else 0 end where user_id = p.user_id;
  end if;
  progres := xp_equipe(p.equipe, xpc);
  niveaux := gagner_xp(p.user_id, xp);
  perform progresser(p.user_id, 'championnat');
  if res = 'gagne' then perform progresser(p.user_id, 'victoire'); end if;
  insert into rencontres (user_id, type, adversaire, score, resultat, detail)
    values (p.user_id, 'championnat', adv, array[(r ->> 'a')::int, (r ->> 'b')::int], res, jsonb_build_object('journee', j, 'niveau', round(niv)));
  return jsonb_build_object('match', r, 'adversaire', adv, 'niveauAdversaire', round(niv), 'note', fa -> 'note', 'journee', j,
    'gains', jsonb_build_object('xp', xp, 'xpCarte', xpc, 'pieces', v_pieces, 'points', pts), 'progres', progres, 'finSaison', fin,
    'niveaux', niveaux, 'etat', etat_de(p.user_id));
end $$;

-- Séance d'entraînement d'équipe : de l'expérience pour les joueurs alignés, sans risque
create or replace function seance_equipe() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); progres jsonb; niveaux jsonb;
begin
  if p.equipe = '{}'::jsonb then raise exception 'Aligne d’abord des joueurs dans ton Mon 7'; end if;
  if compter_jour(p.user_id, 'seance') >= parami('seances_par_jour') then
    raise exception 'Tes joueurs ont fait leurs % séances du jour : reviens demain', parami('seances_par_jour');
  end if;
  progres := xp_equipe(p.equipe, parami('seance_xp_carte'));
  niveaux := gagner_xp(p.user_id, parami('seance_xp'));
  perform progresser(p.user_id, 'seance');
  insert into rencontres (user_id, type, adversaire, detail) values (p.user_id, 'seance', 'Entraînement', jsonb_build_object('progres', progres));
  return jsonb_build_object('xpCarte', parami('seance_xp_carte'), 'progres', progres, 'niveaux', niveaux, 'etat', etat_de(p.user_id));
end $$;

-- Séance d'équipe payante : même gain que la séance gratuite, en pièces, sans limite par jour
create or replace function seance_payante() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); prix int := parami('seance_payante_prix'); progres jsonb; niveaux jsonb;
begin
  if p.equipe = '{}'::jsonb then raise exception 'Aligne d’abord des joueurs dans ton Mon 7'; end if;
  if p.pieces < prix then raise exception 'Il faut % pièces pour cette séance', prix; end if;
  update profils set pieces = pieces - prix where user_id = p.user_id;
  progres := xp_equipe(p.equipe, parami('seance_xp_carte'));
  niveaux := gagner_xp(p.user_id, parami('seance_xp'));
  perform progresser(p.user_id, 'seance');
  perform noter(p.user_id, 'seance-payante', jsonb_build_object('prix', prix, 'progres', progres));
  return jsonb_build_object('xpCarte', parami('seance_xp_carte'), 'prix', prix, 'progres', progres, 'niveaux', niveaux, 'etat', etat_de(p.user_id));
end $$;

-- Défi contre le Mon 7 d'un autre joueur (il n'a pas besoin d'être connecté : il défend avec sa dernière tactique)
create or replace function defier(p_pseudo text, p_tactique text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a profils; fa jsonb; fb jsonb; r jsonb; res text; res_d text; tr int; tr_d int;
  xp int; v_pieces int; progres jsonb; niveaux jsonb;
begin
  perform verifier_tactique(p_tactique);
  select * into a from profils where lower(pseudo) = lower(btrim(p_pseudo)) for update;
  if not found then raise exception 'Joueur introuvable'; end if;
  if a.user_id = p.user_id then raise exception 'Tu ne peux pas te défier toi-même'; end if;
  if compter_jour(p.user_id, 'defi') >= parami('defis_par_jour') then
    raise exception 'Tu as lancé tes % défis du jour : reviens demain', parami('defis_par_jour');
  end if;
  if (select count(*) from rencontres where user_id = p.user_id and type = 'defi' and adversaire = a.pseudo and le >= debut_du_jour())
     >= parami('defis_meme_adversaire') then
    raise exception 'Tu as déjà défié % % fois aujourd’hui', a.pseudo, parami('defis_meme_adversaire');
  end if;
  perform verifier_equipe(p.user_id, p.equipe);
  fa := force_equipe(p.equipe, p_tactique);
  begin
    fb := force_equipe(a.equipe, a.tactique);
  exception when others then
    raise exception '% n’a pas encore d’équipe complète', a.pseudo;
  end;
  r := simuler(fa, fb);
  res := r ->> 'resultat';
  res_d := case res when 'gagne' then 'perdu' when 'perdu' then 'gagne' else 'nul' end;
  tr := (param('pvp_trophees') ->> res)::int; tr_d := (param('pvp_defense_trophees') ->> res_d)::int;
  xp := (param('pvp_xp') ->> res)::int; v_pieces := (param('pvp_pieces') ->> res)::int;
  update profils set tactique = p_tactique, trophees = greatest(0, trophees + tr), pieces = pieces + v_pieces where user_id = p.user_id;
  update profils set trophees = greatest(0, trophees + tr_d) where user_id = a.user_id;
  progres := xp_equipe(p.equipe, (param('pve_xp_carte') ->> res)::int);
  niveaux := gagner_xp(p.user_id, xp);
  perform progresser(p.user_id, 'defi');
  if res = 'gagne' then perform progresser(p.user_id, 'victoire'); end if;
  insert into rencontres (user_id, type, adversaire, score, resultat, detail) values
    (p.user_id, 'defi', a.pseudo, array[(r ->> 'a')::int, (r ->> 'b')::int], res, jsonb_build_object('trophees', tr)),
    (a.user_id, 'defense', p.pseudo, array[(r ->> 'b')::int, (r ->> 'a')::int], res_d, jsonb_build_object('trophees', tr_d));
  return jsonb_build_object('match', r, 'adversaire', a.pseudo, 'note', fa -> 'note', 'noteAdversaire', fb -> 'note',
    'gains', jsonb_build_object('xp', xp, 'pieces', v_pieces, 'trophees', tr), 'progres', progres, 'niveaux', niveaux, 'etat', etat_de(p.user_id));
end $$;

-- Adversaires proposés : des joueurs avec un 7 complet, proches en trophées
create or replace function adversaires() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  return coalesce((select jsonb_agg(t) from (
    select a.pseudo, a.niveau, a.trophees,
      (select round(avg(e.note)) from jsonb_each_text(a.equipe) j join exemplaires e on e.id::text = j.value) as note
    from profils a where a.user_id <> p.user_id and (select count(*) from jsonb_object_keys(a.equipe)) = 7
    order by abs(a.trophees - p.trophees), random() limit 8) t), '[]');
end $$;

-- Classement des défis : les 20 premiers, et ma place
create or replace function classement() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  return jsonb_build_object(
    'top', coalesce((select jsonb_agg(t order by t.trophees desc, t.pseudo) from (
      select pseudo, trophees, niveau from profils order by trophees desc, lower(pseudo) limit 20) t), '[]'),
    'rang', (select count(*) + 1 from profils where trophees > p.trophees), 'trophees', p.trophees);
end $$;

-- Mes 20 derniers matchs (dont les défis reçus)
create or replace function mes_rencontres() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  return coalesce((select jsonb_agg(t order by t.le desc) from (
    select type, adversaire, score, resultat, detail, le from rencontres where user_id = p.user_id and type <> 'seance'
    order by le desc limit 20) t), '[]');
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Paris sur les vrais matchs (pièces du jeu seulement)
-- ════════════════════════════════════════════════════════════════════════════

-- Coup d'envoi (heure de Paris ; midi si l'heure n'est pas connue) : les paris ferment à ce moment-là
create or replace function coup_envoi(m matchs) returns timestamptz language sql stable as $$
  select (m.date + coalesce(nullif(m.heure, ''), '12:00')::time) at time zone 'Europe/Paris'
$$;
-- Cote d'une issue : marge / probabilité du modèle, entre cote_min et cote_max
create or replace function cote(p numeric) returns numeric language sql stable security definer set search_path = public as $$
  select case when p is null or p <= 0 then (param('cote_max') #>> '{}')::numeric
    else greatest((param('cote_min') #>> '{}')::numeric, least((param('cote_max') #>> '{}')::numeric,
      round((param('pari_marge') #>> '{}')::numeric / p, 2))) end
$$;
create or replace function issue(m matchs) returns text language sql immutable as $$
  select case when m.score_dom is null or m.score_ext is null then null
    when m.score_dom > m.score_ext then '1' when m.score_dom = m.score_ext then 'N' else '2' end
$$;
create or replace function match_json(m matchs, p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('rid', m.rid, 'equipe', m.equipe, 'competition', m.competition, 'journee', m.journee, 'date', m.date,
    'heure', m.heure, 'dom', m.dom, 'ext', m.ext, 'medoc', m.medoc, 'score', case when m.score_dom is null then null else jsonb_build_array(m.score_dom, m.score_ext) end,
    'cotes', jsonb_build_object('1', cote(m.p1), 'N', cote(m.pn), '2', cote(m.p2)), 'ouvert', coup_envoi(m) > now() and m.score_dom is null,
    'pari', (select jsonb_build_object('choix', x.choix, 'mise', x.mise, 'cote', x.cote, 'statut', x.statut, 'gain', x.gain)
             from paris x where x.rid = m.rid and x.user_id = p_uid))
$$;

-- Matchs des prochains jours, et résultats de la dernière semaine
create or replace function matchs_paris() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  return jsonb_build_object(
    'aVenir', coalesce((select jsonb_agg(match_json(m, p.user_id) order by coup_envoi(m), m.equipe) from matchs m
      where m.score_dom is null and coup_envoi(m) > now() and m.date <= aujourdhui() + parami('paris_jours')), '[]'),
    'resultats', coalesce((select jsonb_agg(match_json(m, p.user_id) order by m.date desc, m.equipe) from matchs m
      where m.score_dom is not null and m.date >= aujourdhui() - 7), '[]'),
    'mesParis', coalesce((select jsonb_agg(match_json(m, p.user_id) order by x.cree_le desc) from paris x join matchs m on m.rid = x.rid
      where x.user_id = p.user_id and x.cree_le >= now() - interval '30 days'), '[]'),
    'min', parami('pari_min'), 'max', parami('pari_max'));
end $$;

create or replace function parier(p_rid text, p_choix text, p_mise int) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); m matchs; c numeric;
begin
  select * into m from matchs where rid = p_rid;
  if not found then raise exception 'Match introuvable'; end if;
  if m.score_dom is not null or coup_envoi(m) <= now() then raise exception 'Les paris sont fermés pour ce match'; end if;
  if m.date > aujourdhui() + parami('paris_jours') then raise exception 'Trop tôt pour parier sur ce match'; end if;
  if p_choix not in ('1', 'N', '2') then raise exception 'Choix inconnu'; end if;
  if p_mise is null or p_mise < parami('pari_min') or p_mise > parami('pari_max') then
    raise exception 'Mise entre % et % pièces', parami('pari_min'), parami('pari_max');
  end if;
  if p.pieces < p_mise then raise exception 'Pas assez de pièces'; end if;
  if exists (select 1 from paris where user_id = p.user_id and rid = p_rid) then raise exception 'Tu as déjà parié sur ce match'; end if;
  c := cote(case p_choix when '1' then m.p1 when 'N' then m.pn else m.p2 end);
  insert into paris (user_id, rid, choix, mise, cote) values (p.user_id, p_rid, p_choix, p_mise, c);
  update profils set pieces = pieces - p_mise where user_id = p.user_id;
  perform progresser(p.user_id, 'pari');
  perform noter(p.user_id, 'pari', jsonb_build_object('match', p_rid, 'choix', p_choix, 'mise', p_mise, 'cote', c));
  return jsonb_build_object('cote', c, 'gainPossible', floor(p_mise * c), 'etat', etat_de(p.user_id));
end $$;

-- Règle les paris des matchs qui ont un résultat (appelé à chaque envoi des matchs par l'outil)
create or replace function regler_paris() returns int language plpgsql security definer set search_path = public as $$
declare x record; n int := 0; gagne boolean;
begin
  for x in select pa.*, issue(m) as res from paris pa join matchs m on m.rid = pa.rid
      where pa.statut = 'en_cours' and m.score_dom is not null and m.score_ext is not null for update of pa loop
    gagne := x.choix = x.res;
    update paris set statut = case when gagne then 'gagne' else 'perdu' end, gain = case when gagne then floor(x.mise * x.cote) else 0 end,
      regle_le = now() where id = x.id;
    if gagne then update profils set pieces = pieces + floor(x.mise * x.cote) where user_id = x.user_id; end if;
    perform gagner_xp(x.user_id, parami('xp_pari'));
    perform noter(x.user_id, 'pari-regle', jsonb_build_object('match', x.rid, 'gagne', gagne, 'gain', case when gagne then floor(x.mise * x.cote) else 0 end));
    n := n + 1;
  end loop;
  return n;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Marché des transferts : une carte contre une carte
-- ════════════════════════════════════════════════════════════════════════════

-- Les annonces trop vieilles sont retirées et leur carte rendue
create or replace function expirer_annonces() returns void language sql security definer set search_path = public as $$
  with vieilles as (update annonces set statut = 'retiree' where statut = 'ouverte'
    and cree_le < now() - make_interval(days => parami('annonce_jours')) returning exemplaire)
  update exemplaires set verrou = null where id in (select exemplaire from vieilles)
$$;

create or replace function annonce_json(a annonces) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', a.id, 'vendeur', (select pseudo from profils where user_id = a.vendeur), 'moi', a.vendeur = auth.uid(),
    'offre', a.offre, 'cherche', jsonb_build_object('carte', a.carte_cherchee, 'palier', a.palier_cherche), 'statut', a.statut,
    'acheteur', (select pseudo from profils where user_id = a.acheteur), 'cree_le', a.cree_le,
    'expire_le', a.cree_le + make_interval(days => parami('annonce_jours')),
    -- un de mes exemplaires libres correspond à ce qui est cherché ?
    'possible', a.vendeur <> auth.uid() and exists (select 1 from exemplaires e where e.proprietaire = auth.uid() and e.carte_id = a.carte_cherchee
      and e.palier = a.palier_cherche and e.verrou is null
      and not exists (select 1 from profils pr, jsonb_each_text(pr.equipe) j where pr.user_id = auth.uid() and j.value = e.id::text)))
$$;

-- p_filtre : 'tout' (les annonces ouvertes des autres), 'pour_moi' (celles que je peux accepter), 'mes' (les miennes)
create or replace function marche(p_filtre text default 'tout') returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  perform expirer_annonces();
  if p_filtre = 'mes' then
    return coalesce((select jsonb_agg(annonce_json(a) order by a.cree_le desc) from annonces a
      where p.user_id in (a.vendeur, a.acheteur) and (a.statut = 'ouverte' or a.conclue_le >= now() - interval '7 days')), '[]');
  end if;
  return coalesce((select jsonb_agg(j order by (j ->> 'cree_le') desc) from (
    select annonce_json(a) j from annonces a where a.statut = 'ouverte' and a.vendeur <> p.user_id order by a.cree_le desc limit 100) t
    where p_filtre <> 'pour_moi' or (j ->> 'possible')::boolean), '[]');
end $$;

create or replace function publier_annonce(p_ex uuid, p_carte text, p_palier text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profils := moi(); e exemplaires; id_annonce uuid;
begin
  perform expirer_annonces();
  select * into e from exemplaires where id = p_ex and proprietaire = p.user_id;
  if not found then raise exception 'Carte absente de ton club'; end if;
  if e.verrou is not null then raise exception 'Cette carte est déjà au marché'; end if;
  if exists (select 1 from jsonb_each_text(p.equipe) j where j.value = p_ex::text) then
    raise exception 'Cette carte joue dans ton Mon 7 : retire-la d’abord';
  end if;
  if p_palier not in ('bronze', 'argent', 'or', 'ultime') then raise exception 'Palier inconnu'; end if;
  if not exists (select 1 from cartes where id = p_carte) then raise exception 'Joueur inconnu'; end if;
  if p_carte = e.carte_id and p_palier = e.palier then raise exception 'Tu cherches la même carte que celle que tu proposes'; end if;
  if (select count(*) from annonces where vendeur = p.user_id and statut = 'ouverte') >= parami('annonces_max') then
    raise exception 'Tu as déjà % annonces ouvertes', parami('annonces_max');
  end if;
  insert into annonces (vendeur, exemplaire, offre, carte_cherchee, palier_cherche)
    values (p.user_id, p_ex, jsonb_build_object('carte', e.carte_id, 'palier', e.palier, 'note', e.note), p_carte, p_palier)
    returning id into id_annonce;
  update exemplaires set verrou = 'marche' where id = p_ex;
  perform progresser(p.user_id, 'marche');
  perform noter(p.user_id, 'annonce', jsonb_build_object('annonce', id_annonce, 'offre', e.carte_id, 'cherche', p_carte, 'palier', p_palier));
  return jsonb_build_object('id', id_annonce, 'etat', etat_de(p.user_id));
end $$;

create or replace function retirer_annonce(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a annonces;
begin
  update annonces set statut = 'retiree' where id = p_id and vendeur = p.user_id and statut = 'ouverte' returning * into a;
  if not found then raise exception 'Cette annonce n’est plus ouverte'; end if;
  update exemplaires set verrou = null where id = a.exemplaire;
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;

-- Accepter une annonce : je donne un de mes exemplaires de la carte cherchée (le moins entraîné, hors Mon 7)
create or replace function accepter_annonce(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a annonces; mon_ex uuid; v profils;
begin
  perform expirer_annonces();
  select * into a from annonces where id = p_id for update;
  if not found or a.statut <> 'ouverte' then raise exception 'Cette annonce n’est plus ouverte'; end if;
  if a.vendeur = p.user_id then raise exception 'C’est ton annonce'; end if;
  select * into v from profils where user_id = a.vendeur for update;
  select e.id into mon_ex from exemplaires e where e.proprietaire = p.user_id and e.carte_id = a.carte_cherchee and e.palier = a.palier_cherche
    and e.verrou is null and not exists (select 1 from jsonb_each_text(p.equipe) j where j.value = e.id::text)
    order by e.note, e.xp limit 1;
  if mon_ex is null then raise exception 'Il te faut un exemplaire libre (hors Mon 7) de la carte demandée, au bon palier'; end if;
  if not exists (select 1 from exemplaires where id = a.exemplaire and proprietaire = a.vendeur) then
    raise exception 'La carte proposée n’est plus disponible';
  end if;
  update exemplaires set proprietaire = p.user_id, verrou = null where id = a.exemplaire;
  update exemplaires set proprietaire = a.vendeur where id = mon_ex;
  update annonces set statut = 'conclue', acheteur = p.user_id, conclue_le = now() where id = p_id;
  perform nettoyer_equipe(a.vendeur); perform nettoyer_equipe(p.user_id);
  perform progresser(p.user_id, 'marche');
  perform noter(p.user_id, 'transfert', jsonb_build_object('annonce', p_id, 'recu', a.exemplaire, 'donne', mon_ex));
  perform noter(a.vendeur, 'transfert', jsonb_build_object('annonce', p_id, 'recu', mon_ex, 'donne', a.exemplaire));
  return jsonb_build_object('recu', a.exemplaire, 'donne', mon_ex, 'etat', etat_de(p.user_id));
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

-- Vrais matchs (data/matchs.json) : ajout ou mise à jour, puis règlement des paris dont le résultat est connu
create or replace function admin_publier_matchs(p_matchs jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; regles int;
begin
  if not est_admin() then raise exception 'Réservé à l’administrateur'; end if;
  insert into matchs (rid, equipe, competition, journee, date, heure, dom, ext, medoc, p1, pn, p2, score_dom, score_ext, forfait, maj)
    select x ->> 'rid', x ->> 'equipe', x ->> 'competition', (x ->> 'j')::int, (x ->> 'date')::date, x ->> 'heure', x ->> 'dom', x ->> 'ext',
      x ->> 'medoc', (x -> 'p' ->> 0)::numeric, (x -> 'p' ->> 1)::numeric, (x -> 'p' ->> 2)::numeric,
      (x -> 'score' ->> 0)::int, (x -> 'score' ->> 1)::int, x ->> 'forfait', now()
    from jsonb_array_elements(p_matchs) x
    on conflict (rid) do update set equipe = excluded.equipe, competition = excluded.competition, journee = excluded.journee,
      date = excluded.date, heure = excluded.heure, dom = excluded.dom, ext = excluded.ext, medoc = excluded.medoc,
      -- les probabilités sont figées une fois le match joué
      p1 = case when excluded.score_dom is null then excluded.p1 else coalesce(matchs.p1, excluded.p1) end,
      pn = case when excluded.score_dom is null then excluded.pn else coalesce(matchs.pn, excluded.pn) end,
      p2 = case when excluded.score_dom is null then excluded.p2 else coalesce(matchs.p2, excluded.p2) end,
      score_dom = excluded.score_dom, score_ext = excluded.score_ext, forfait = excluded.forfait, maj = now();
  n := jsonb_array_length(p_matchs);
  regles := regler_paris();
  perform noter(auth.uid(), 'admin-matchs', jsonb_build_object('matchs', n, 'paris_regles', regles));
  return jsonb_build_object('matchs', n, 'parisRegles', regles);
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
  ouvrir_depart(), ouvrir_booster(text), ouvrir_booster_poste(text), fusionner(text, text), entrainer(uuid), vendre(uuid),
  aligner(text, uuid), aligner_equipe(jsonb), reclamer_quete(text), chercher_joueurs(text),
  match_championnat(text), seance_equipe(), seance_payante(), defier(text, text), adversaires(), classement(), mes_rencontres(),
  matchs_paris(), parier(text, text, int),
  marche(text), publier_annonce(uuid, text, text), retirer_annonce(uuid), accepter_annonce(uuid), admin_publier_matchs(jsonb),
  admin_publier_cartes(jsonb, boolean), est_admin()
to authenticated;
