-- Médoc Hand Cards — base de données du serveur Supabase
--
-- À coller EN ENTIER dans Supabase → SQL Editor → New query → Run.
-- Le fichier peut être relancé sans risque après une mise à jour : il ne supprime aucune donnée.
--
-- Principe : le téléphone ne peut RIEN écrire directement dans les tables. Toutes les actions
-- (ouvrir un pack, vendre, échanger…) passent par les fonctions ci-dessous, qui vérifient les règles
-- et font chaque action d'un seul bloc. C'est ce qui empêche la triche.

-- ════════════════════════════════════════════════════════════════════════════
-- Tables
-- ════════════════════════════════════════════════════════════════════════════

-- Règles du jeu (une seule ligne). Pour changer un prix ou une limite : modifier ici, dans Table Editor.
create table if not exists regles (
  id int primary key default 1 check (id = 1),
  depart int not null,              -- pièces d'un nouveau compte
  bonus_jour int not null,
  vente jsonb not null,             -- pièces pour un doublon, par rareté
  pack_bienvenue text not null,     -- premier pack offert
  echanges_par_jour int not null,   -- propositions d'échange par joueur et par jour
  echange_max_cartes int not null,  -- cartes au plus de chaque côté d'un échange
  echange_jours int not null        -- une proposition expire au bout de ce nombre de jours
);
insert into regles values (1, 3000, 1500, '{"bronze": 50, "argent": 150, "or": 400, "elite": 1200}', 'or', 10, 5, 7)
on conflict (id) do nothing;

-- Packs en vente. poids = chances relatives de chaque rareté ; garanti = rareté minimale de la 1re carte.
create table if not exists packs (
  id text primary key, nom text not null, prix int not null check (prix >= 0), n int not null check (n between 1 and 10),
  poids jsonb not null, garanti text, description text not null, ordre int not null
);
insert into packs values
  ('bronze', 'Bronze', 500, 5, '{"bronze": 70, "argent": 25, "or": 5, "elite": 0.5}', null, '5 cartes, surtout bronze', 1),
  ('argent', 'Argent', 1500, 5, '{"bronze": 25, "argent": 55, "or": 17, "elite": 3}', 'argent', '5 cartes, 1 argent ou mieux garantie', 2),
  ('or', 'Or', 3500, 5, '{"bronze": 8, "argent": 42, "or": 42, "elite": 8}', 'or', '5 cartes, 1 or ou mieux garantie', 3),
  ('elite', 'Élite', 9000, 3, '{"bronze": 0, "argent": 0, "or": 70, "elite": 30}', 'elite', '3 cartes or, 1 élite garantie', 4)
on conflict (id) do nothing;

-- Catalogue des cartes, rempli par l'outil admin.html (bouton « Synchroniser avec le site »).
create table if not exists cartes (
  id text primary key,                 -- nom simplifié, ne change jamais (ex. 'mael-benharoun')
  nom text not null,
  equipe text not null,
  poste text check (poste in ('AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB')),
  stats jsonb not null,                -- les 6 stats
  ovr int not null check (ovr between 1 and 99),
  rarete text not null check (rarete in ('bronze', 'argent', 'or', 'elite')),
  photo text,
  site jsonb not null,                 -- la carte de data/cartes.json (stats de medochandballstats.com)
  reglages jsonb,                      -- réglages faits dans l'outil (null = valeurs par défaut)
  actif boolean not null default true, -- false : plus tirée dans les packs, mais reste dans les clubs
  maj timestamptz not null default now()
);

-- Un compte joueur (l'e-mail reste dans auth.users, géré par Supabase).
create table if not exists profils (
  user_id uuid primary key references auth.users on delete cascade,
  pseudo text not null check (pseudo ~ '^[A-Za-z0-9À-ÖØ-öø-ÿ_.-]{3,20}$'),
  pieces int not null check (pieces >= 0),
  packs_ouverts int not null default 0,
  dernier_bonus date,
  bienvenue boolean not null default false,  -- pack de bienvenue déjà ouvert
  equipe jsonb not null default '{}',        -- Mon 7 : {poste: carte}
  role text not null default 'joueur' check (role in ('joueur', 'admin')),
  accord_le timestamptz not null default now(),  -- « j'ai 15 ans ou plus, ou l'accord de mes parents »
  cree_le timestamptz not null default now()
);
create unique index if not exists profils_pseudo on profils (lower(pseudo));

-- Les cartes de chaque joueur, avec le nombre d'exemplaires.
create table if not exists possessions (
  proprietaire uuid not null references profils on delete cascade,
  carte_id text not null references cartes,
  nombre int not null check (nombre >= 0),
  primary key (proprietaire, carte_id)
);

-- Échanges : offre = cartes données par « de », demande = cartes données par « vers » (une entrée par exemplaire).
create table if not exists echanges (
  id uuid primary key default gen_random_uuid(),
  de uuid not null references profils on delete cascade,
  vers uuid not null references profils on delete cascade,
  offre text[] not null,
  demande text[] not null,
  statut text not null default 'propose' check (statut in ('propose', 'accepte', 'refuse', 'annule')),
  cree_le timestamptz not null default now(),
  traite_le timestamptz
);
create index if not exists echanges_vers on echanges (vers, statut);
create index if not exists echanges_de on echanges (de, cree_le);

-- Journal de tout ce qui bouge (pièces, cartes) : pour comprendre un litige ou repérer une triche.
create table if not exists mouvements (
  id bigserial primary key, user_id uuid, quoi text not null, detail jsonb, le timestamptz not null default now()
);
create index if not exists mouvements_user on mouvements (user_id, le);

-- ════════════════════════════════════════════════════════════════════════════
-- Accès : lecture seulement de ce qui nous concerne, aucune écriture directe
-- ════════════════════════════════════════════════════════════════════════════
alter table regles enable row level security;
alter table packs enable row level security;
alter table cartes enable row level security;
alter table profils enable row level security;
alter table possessions enable row level security;
alter table echanges enable row level security;
alter table mouvements enable row level security;

drop policy if exists lecture on regles;      create policy lecture on regles for select using (true);
drop policy if exists lecture on packs;       create policy lecture on packs for select using (true);
drop policy if exists lecture on cartes;      create policy lecture on cartes for select using (true);
drop policy if exists lecture on profils;     create policy lecture on profils for select using (user_id = auth.uid());
drop policy if exists lecture on possessions; create policy lecture on possessions for select using (proprietaire = auth.uid());
drop policy if exists lecture on echanges;    create policy lecture on echanges for select using (auth.uid() in (de, vers));
-- mouvements : aucune politique, donc illisible depuis le jeu

revoke insert, update, delete, truncate on regles, packs, cartes, profils, possessions, echanges, mouvements from anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Outils internes (non appelables depuis le jeu, voir les droits en bas)
-- ════════════════════════════════════════════════════════════════════════════

-- Date du jour en France (le bonus quotidien suit l'heure de Paris, pas celle du téléphone)
create or replace function aujourdhui() returns date language sql stable as $$
  select (now() at time zone 'Europe/Paris')::date
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

-- État complet d'un joueur, dans le format qu'attend le jeu (compte.js)
create or replace function etat_de(p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profil', true, 'pseudo', p.pseudo, 'role', p.role, 'pieces', p.pieces, 'packs', p.packs_ouverts,
    'dernierBonus', coalesce(p.dernier_bonus::text, ''), 'bonusDispo', p.dernier_bonus is distinct from aujourdhui(),
    'bienvenue', p.bienvenue, 'equipe', p.equipe,
    'possede', coalesce((select jsonb_object_agg(carte_id, nombre) from possessions where proprietaire = p.user_id and nombre > 0), '{}'))
  from profils p where p.user_id = p_uid
$$;

create or replace function noter(p_uid uuid, p_quoi text, p_detail jsonb) returns void language sql security definer set search_path = public as $$
  insert into mouvements (user_id, quoi, detail) values (p_uid, p_quoi, p_detail)
$$;

-- Vérifie qu'un joueur peut donner ces cartes : assez d'exemplaires, et il garde au moins
-- un exemplaire de chaque carte alignée dans son Mon 7. p_qui : null = le joueur connecté, sinon son pseudo.
create or replace function verifier_cartes(p_uid uuid, p_equipe jsonb, p_cartes text[], p_qui text) returns void
language plpgsql security definer set search_path = public as $$
declare l record;
begin
  for l in
    select x as carte, count(*) as k, (select nom from cartes where id = x) as nom,
      coalesce((select nombre from possessions where proprietaire = p_uid and carte_id = x), 0) as n,
      exists (select 1 from jsonb_each_text(p_equipe) e where e.value = x) as aligne
    from unnest(p_cartes) x group by x
  loop
    if l.nom is null then raise exception 'Carte inconnue'; end if;
    if l.n < l.k then
      raise exception '%', case when p_qui is null then format('Tu n’as pas assez d’exemplaires de %s', l.nom)
        else format('%s n’a pas (ou plus) assez d’exemplaires de %s', p_qui, l.nom) end;
    end if;
    if l.aligne and l.n - l.k < 1 then
      raise exception '%', case when p_qui is null then format('La carte %s est dans ton Mon 7 : retire-la d’abord ou garde un exemplaire', l.nom)
        else format('%s a besoin de la carte %s dans son Mon 7', p_qui, l.nom) end;
    end if;
  end loop;
end $$;

-- Fait passer des exemplaires d'un joueur à un autre (vérifier avant !)
create or replace function deplacer(p_de uuid, p_vers uuid, p_cartes text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  update possessions po set nombre = po.nombre - x.k
    from (select c, count(*)::int k from unnest(p_cartes) c group by c) x
    where po.proprietaire = p_de and po.carte_id = x.c;
  delete from possessions where proprietaire = p_de and nombre = 0;
  insert into possessions (proprietaire, carte_id, nombre)
    select p_vers, c, count(*) from unnest(p_cartes) c group by c
    on conflict (proprietaire, carte_id) do update set nombre = possessions.nombre + excluded.nombre;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Compte
-- ════════════════════════════════════════════════════════════════════════════

-- État du joueur connecté ; {"profil": false} s'il n'a pas encore créé son profil
create or replace function mon_etat() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour jouer'; end if;
  return coalesce(etat_de(auth.uid()), '{"profil": false}'::jsonb);
end $$;

create or replace function creer_profil(p_pseudo text, p_accord boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r regles;
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
  select * into r from regles;
  begin
    insert into profils (user_id, pseudo, pieces) values (auth.uid(), p_pseudo, r.depart);
  exception when unique_violation then
    raise exception 'Ce pseudo est déjà pris';
  end;
  perform noter(auth.uid(), 'profil', jsonb_build_object('pseudo', p_pseudo));
  return jsonb_build_object('etat', etat_de(auth.uid()));
end $$;

-- Supprime le compte, ses cartes, ses échanges et son journal (droit à l'effacement)
create or replace function supprimer_mon_compte() returns void language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Connecte-toi d’abord'; end if;
  delete from mouvements where user_id = u;
  delete from auth.users where id = u;   -- efface aussi le profil, les cartes et les échanges (en cascade)
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Jeu (mêmes actions que compte.js)
-- ════════════════════════════════════════════════════════════════════════════

-- Ouvre un pack : même tirage que tirerPack() dans compte.js
create or replace function ouvrir_pack(p_pack text) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p profils := moi();
  k packs; r regles; offert boolean;
  ordre text[] := array['bronze', 'argent', 'or', 'elite'];
  ids text[] := '{}'; nouveaux text[];
  i int; rmin int; tot numeric; x numeric; rar text; c text;
begin
  select * into k from packs where id = p_pack;
  if not found then raise exception 'Pack inconnu'; end if;
  select * into r from regles;
  offert := p_pack = r.pack_bienvenue and not p.bienvenue;
  if not offert and p.pieces < k.prix then raise exception 'Pas assez de pièces'; end if;

  for i in 1..k.n loop
    -- rareté : au moins la garantie pour la 1re carte, parmi celles qui ont des cartes et des chances
    rmin := case when i = 1 then coalesce(array_position(ordre, k.garanti), 1) else 1 end;
    select sum((k.poids ->> o)::numeric) into tot from unnest(ordre) with ordinality t(o, rg)
      where rg >= rmin and coalesce((k.poids ->> o)::numeric, 0) > 0 and exists (select 1 from cartes where rarete = o and actif);
    rar := null;
    if tot > 0 then
      x := random() * tot;
      for rar in select o from unnest(ordre) with ordinality t(o, rg)
          where rg >= rmin and coalesce((k.poids ->> o)::numeric, 0) > 0 and exists (select 1 from cartes where rarete = o and actif)
          order by rg loop
        x := x - (k.poids ->> rar)::numeric;
        exit when x <= 0;
      end loop;
    end if;
    -- carte au hasard dans cette rareté, jamais deux fois la même dans un pack
    select id into c from cartes where actif and rarete = coalesce(rar, 'bronze') and id <> all(ids) order by random() limit 1;
    if c is null then select id into c from cartes where actif and id <> all(ids) order by random() limit 1; end if;
    exit when c is null;
    ids := ids || c;
  end loop;
  if cardinality(ids) = 0 then raise exception 'Le catalogue est vide'; end if;

  select array_agg(id order by ovr desc, nom) into ids from cartes where id = any(ids);
  select coalesce(array_agg(x2), '{}') into nouveaux from unnest(ids) x2
    where not exists (select 1 from possessions where proprietaire = p.user_id and carte_id = x2 and nombre > 0);
  update profils set pieces = pieces - case when offert then 0 else k.prix end, bienvenue = bienvenue or offert,
    packs_ouverts = packs_ouverts + 1 where user_id = p.user_id;
  insert into possessions (proprietaire, carte_id, nombre) select p.user_id, x2, 1 from unnest(ids) x2
    on conflict (proprietaire, carte_id) do update set nombre = possessions.nombre + 1;
  perform noter(p.user_id, 'pack', jsonb_build_object('pack', p_pack, 'offert', offert, 'cartes', ids));
  return jsonb_build_object('ids', to_jsonb(ids), 'nouveaux', to_jsonb(nouveaux), 'etat', etat_de(p.user_id));
end $$;

create or replace function recuperer_bonus() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); r regles;
begin
  if p.dernier_bonus = aujourdhui() then raise exception 'Bonus déjà récupéré aujourd’hui'; end if;
  select * into r from regles;
  update profils set pieces = pieces + r.bonus_jour, dernier_bonus = aujourdhui() where user_id = p.user_id;
  perform noter(p.user_id, 'bonus', jsonb_build_object('gain', r.bonus_jour));
  return jsonb_build_object('gain', r.bonus_jour, 'etat', etat_de(p.user_id));
end $$;

-- Vend un exemplaire en double (on garde toujours le dernier : Mon 7 n'est jamais touché)
create or replace function vendre(p_carte text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); r regles; n int; gain int;
begin
  select nombre into n from possessions where proprietaire = p.user_id and carte_id = p_carte;
  if coalesce(n, 0) < 2 then raise exception 'Pas de doublon à vendre'; end if;
  select * into r from regles;
  select (r.vente ->> rarete)::int into gain from cartes where id = p_carte;
  update possessions set nombre = nombre - 1 where proprietaire = p.user_id and carte_id = p_carte;
  update profils set pieces = pieces + gain where user_id = p.user_id;
  perform noter(p.user_id, 'vente', jsonb_build_object('carte', p_carte, 'gain', gain));
  return jsonb_build_object('gain', gain, 'etat', etat_de(p.user_id));
end $$;

create or replace function vendre_doublons() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); r regles; gain int;
begin
  select * into r from regles;
  select coalesce(sum((po.nombre - 1) * (r.vente ->> c.rarete)::int), 0) into gain
    from possessions po join cartes c on c.id = po.carte_id where po.proprietaire = p.user_id and po.nombre > 1;
  update possessions set nombre = 1 where proprietaire = p.user_id and nombre > 1;
  update profils set pieces = pieces + gain where user_id = p.user_id;
  if gain > 0 then perform noter(p.user_id, 'vente', jsonb_build_object('doublons', true, 'gain', gain)); end if;
  return jsonb_build_object('gain', gain, 'etat', etat_de(p.user_id));
end $$;

-- Mon 7 : vérifie qu'une carte peut jouer à ce poste (gardien·ne au poste GB, joueurs de champ ailleurs)
create or replace function verifier_poste(p_uid uuid, p_poste text, p_carte text) returns void
language plpgsql security definer set search_path = public as $$
declare cp text;
begin
  if p_poste not in ('AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB') then raise exception 'Poste inconnu'; end if;
  if not exists (select 1 from possessions where proprietaire = p_uid and carte_id = p_carte and nombre > 0) then
    raise exception 'Carte absente du club';
  end if;
  select poste into cp from cartes where id = p_carte;
  if (p_poste = 'GB') <> (cp is not distinct from 'GB') then raise exception 'Cette carte ne peut pas jouer à ce poste'; end if;
end $$;

create or replace function aligner(p_poste text, p_carte text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); e jsonb;
begin
  if p_carte is null then
    e := p.equipe - p_poste;
  else
    perform verifier_poste(p.user_id, p_poste, p_carte);
    select coalesce(jsonb_object_agg(key, value), '{}') into e from jsonb_each(p.equipe)
      where value <> to_jsonb(p_carte) and key <> p_poste;
    e := e || jsonb_build_object(p_poste, p_carte);
  end if;
  update profils set equipe = e where user_id = p.user_id;
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;

create or replace function aligner_equipe(p_equipe jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); l record;
begin
  if jsonb_typeof(p_equipe) <> 'object' then raise exception 'Équipe invalide'; end if;
  if (select count(distinct value) <> count(*) from jsonb_each_text(p_equipe)) then raise exception 'Une carte ne joue qu’à un poste'; end if;
  for l in select key, value from jsonb_each_text(p_equipe) loop perform verifier_poste(p.user_id, l.key, l.value); end loop;
  update profils set equipe = p_equipe where user_id = p.user_id;
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Échanges
-- ════════════════════════════════════════════════════════════════════════════

create or replace function chercher_joueurs(p_texte text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  return coalesce((select jsonb_agg(pseudo order by lower(pseudo)) from (
    select pseudo from profils where user_id <> p.user_id and position(lower(btrim(p_texte)) in lower(pseudo)) > 0
    order by lower(pseudo) limit 20) t), '[]');
end $$;

-- Club d'un autre joueur, pour choisir ce qu'on lui demande
create or replace function club_de(p_pseudo text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a profils;
begin
  select * into a from profils where lower(pseudo) = lower(btrim(p_pseudo));
  if not found then raise exception 'Joueur introuvable'; end if;
  return jsonb_build_object('pseudo', a.pseudo, 'equipe', a.equipe,
    'possede', coalesce((select jsonb_object_agg(carte_id, nombre) from possessions where proprietaire = a.user_id and nombre > 0), '{}'));
end $$;

create or replace function proposer_echange(p_pseudo text, p_offre text[], p_demande text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a profils; r regles; n int; nouvel uuid;
begin
  select * into r from regles;
  select * into a from profils where lower(pseudo) = lower(btrim(p_pseudo));
  if not found then raise exception 'Joueur introuvable'; end if;
  if a.user_id = p.user_id then raise exception 'Tu ne peux pas échanger avec toi-même'; end if;
  if coalesce(cardinality(p_offre), 0) not between 1 and r.echange_max_cartes
     or coalesce(cardinality(p_demande), 0) not between 1 and r.echange_max_cartes then
    raise exception 'Il faut entre 1 et % cartes de chaque côté', r.echange_max_cartes;
  end if;
  select count(*) into n from echanges where de = p.user_id and cree_le >= (aujourdhui()::timestamp at time zone 'Europe/Paris');
  if n >= r.echanges_par_jour then raise exception 'Tu as fait tes % propositions du jour, reviens demain', r.echanges_par_jour; end if;
  perform verifier_cartes(p.user_id, p.equipe, p_offre, null);
  perform verifier_cartes(a.user_id, a.equipe, p_demande, a.pseudo);
  insert into echanges (de, vers, offre, demande) values (p.user_id, a.user_id, p_offre, p_demande) returning id into nouvel;
  perform noter(p.user_id, 'echange-propose', jsonb_build_object('echange', nouvel, 'vers', a.pseudo, 'offre', p_offre, 'demande', p_demande));
  return jsonb_build_object('id', nouvel);
end $$;

create or replace function repondre_echange(p_id uuid, p_accepte boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profils := moi(); e echanges; d profils; r regles;
begin
  select * into r from regles;
  select * into e from echanges where id = p_id for update;
  if not found or e.vers <> p.user_id then raise exception 'Échange introuvable'; end if;
  if e.statut <> 'propose' then raise exception 'Cet échange n’est plus en attente'; end if;
  if e.cree_le < now() - make_interval(days => r.echange_jours) then raise exception 'Cet échange a expiré'; end if;
  if not p_accepte then
    update echanges set statut = 'refuse', traite_le = now() where id = p_id;
    return jsonb_build_object('etat', etat_de(p.user_id));
  end if;
  select * into d from profils where user_id = e.de for update;
  -- tout est revérifié au moment d'accepter : les cartes ont pu être vendues ou échangées entre-temps
  perform verifier_cartes(e.de, d.equipe, e.offre, d.pseudo);
  perform verifier_cartes(p.user_id, p.equipe, e.demande, null);
  perform deplacer(e.de, p.user_id, e.offre);
  perform deplacer(p.user_id, e.de, e.demande);
  update echanges set statut = 'accepte', traite_le = now() where id = p_id;
  perform noter(e.de, 'echange', jsonb_build_object('echange', p_id, 'donne', e.offre, 'recoit', e.demande));
  perform noter(p.user_id, 'echange', jsonb_build_object('echange', p_id, 'donne', e.demande, 'recoit', e.offre));
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;

create or replace function annuler_echange(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  update echanges set statut = 'annule', traite_le = now() where id = p_id and de = p.user_id and statut = 'propose';
  if not found then raise exception 'Cet échange n’est plus en attente'; end if;
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;

-- Les 50 derniers échanges du joueur (statut « expire » pour une proposition trop ancienne)
create or replace function mes_echanges() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); r regles;
begin
  select * into r from regles;
  return coalesce((select jsonb_agg(t order by t.cree_le desc) from (
    select e.id, e.offre, e.demande, e.cree_le, e.traite_le, e.de = p.user_id as envoye,
      case when e.statut = 'propose' and e.cree_le < now() - make_interval(days => r.echange_jours) then 'expire' else e.statut end as statut,
      (select pseudo from profils where user_id = case when e.de = p.user_id then e.vers else e.de end) as avec
    from echanges e where p.user_id in (e.de, e.vers) order by e.cree_le desc limit 50) t), '[]');
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Administration (outil admin.html, compte avec role = 'admin')
-- ════════════════════════════════════════════════════════════════════════════

-- Ajoute ou met à jour des cartes du catalogue. p_complet = true : toute carte absente de la liste
-- n'est plus tirée dans les packs (elle reste dans les clubs de ceux qui l'ont).
create or replace function admin_publier_cartes(p_cartes jsonb, p_complet boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if not est_admin() then raise exception 'Réservé à l’administrateur'; end if;
  insert into cartes (id, nom, equipe, poste, stats, ovr, rarete, photo, site, reglages, actif, maj)
    select x ->> 'id', x ->> 'nom', x ->> 'equipe', x ->> 'poste', x -> 'stats', (x ->> 'ovr')::int, x ->> 'rarete',
      x ->> 'photo', x -> 'site', nullif(x -> 'reglages', 'null'::jsonb), true, now()
    from jsonb_array_elements(p_cartes) x
    on conflict (id) do update set nom = excluded.nom, equipe = excluded.equipe, poste = excluded.poste, stats = excluded.stats,
      ovr = excluded.ovr, rarete = excluded.rarete, photo = excluded.photo, site = excluded.site, reglages = excluded.reglages,
      actif = true, maj = now();
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
  ouvrir_pack(text), recuperer_bonus(), vendre(text), vendre_doublons(), aligner(text, text), aligner_equipe(jsonb),
  chercher_joueurs(text), club_de(text), proposer_echange(text, text[], text[]), repondre_echange(uuid, boolean),
  annuler_echange(uuid), mes_echanges(), admin_publier_cartes(jsonb, boolean), est_admin()
to authenticated;
