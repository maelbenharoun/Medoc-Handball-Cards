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
  "pvp_xp": {"gagne": 40, "nul": 20, "perdu": 10},
  "pvp_pieces": {"gagne": 80, "nul": 40, "perdu": 20},
  "pvp_trophees": {"gagne": 20, "nul": 5, "perdu": -10},
  "pvp_defense_trophees": {"gagne": 5, "nul": 0, "perdu": -5},
  "pari_min": 10, "pari_max": 300, "pari_marge": 0.92, "cote_min": 1.05, "cote_max": 12, "paris_jours": 14, "xp_pari": 10, "paris_par_semaine": 3,
  "annonces_max": 5, "annonce_jours": 7,
  "booster_poste_prix": 300, "seance_payante_prix": 150,
  "parcours": [
    {"nom": "Promotion", "groupe": "Départemental", "type": "poule", "base": 50},
    {"nom": "Honneur", "groupe": "Départemental", "type": "poule", "base": 53},
    {"nom": "Excellence", "groupe": "Départemental", "type": "poule", "base": 56},
    {"nom": "Honneur", "groupe": "Régional", "type": "poule", "base": 60},
    {"nom": "Excellence", "groupe": "Régional", "type": "poule", "base": 64},
    {"nom": "Pré-nationale", "groupe": "Régional", "type": "poule", "base": 68},
    {"nom": "Nationale 3", "groupe": "National", "type": "poule", "base": 72},
    {"nom": "Nationale 2", "groupe": "National", "type": "poule", "base": 76},
    {"nom": "Nationale 1", "groupe": "National", "type": "poule", "base": 80},
    {"nom": "Championnat d’Europe", "groupe": "International", "type": "tournoi", "base": 84,
     "equipes": ["Danemark", "Norvège", "Suède", "Espagne", "Allemagne", "Hongrie", "Pays-Bas", "Croatie", "Islande", "Portugal",
                 "Slovénie", "Monténégro", "Serbie", "Pologne", "Autriche", "Suisse"]},
    {"nom": "Championnat du monde", "groupe": "International", "type": "tournoi", "base": 88,
     "equipes": ["Danemark", "Norvège", "Suède", "Espagne", "Allemagne", "Hongrie", "Pays-Bas", "Croatie", "Égypte", "Brésil",
                 "Japon", "Corée du Sud", "Argentine", "Tunisie", "Qatar", "Portugal"]},
    {"nom": "Jeux olympiques", "groupe": "International", "type": "tournoi", "base": 91,
     "equipes": ["Danemark", "Norvège", "Suède", "Espagne", "Allemagne", "Hongrie", "Pays-Bas", "Croatie", "Égypte", "Slovénie",
                 "Monténégro", "Brésil"]},
    {"nom": "Légendes du handball", "groupe": "Légendes", "type": "legendes", "base": 99}],
  "legendes": [{"n": "Amandine Leynaud", "p": 1}, {"n": "Uwe Gensheimer", "p": 15}, {"n": "Mikkel Hansen", "p": 18},
               {"n": "Stine Oftedal", "p": 13}, {"n": "Kiril Lazarov", "p": 17}, {"n": "Luc Abalo", "p": 14}, {"n": "Pauletta Foppa", "p": 13}],
  "poule_equipes": 8, "poule_equipes_depart": 4, "poule_equipes_pas": 1, "poule_petite": 5, "poule_descente_petite": 1, "poule_tours": 2, "poule_ecart": 4, "poule_montee": 2, "poule_descente": 2,
  "tournoi_ecart": 2, "legendes_manches": 5,
  "points_match": {"gagne": 3, "nul": 2, "perdu": 1},
  "parcours_saison_pieces": 300, "parcours_tournoi_pieces": 1500, "parcours_legendes_pieces": 5000, "parcours_legendes_bonus_or": 2,
  "synchro_matchs_url": "https://raw.githubusercontent.com/maelbenharoun/Medoc-Handball-Cards/main/data/matchs.json", "jet7m_tirs_par_jour": 5, "jet7m_pieces_but": 50, "jet7m_bonus_parfait": 100,
  "mini_essais_par_jour": 5, "mini_pieces": 50, "mini_bonus_parfait": 100,
  "mini_gardien_tirs_par_jour": 25, "mini_gardien_pieces": 10,
  "tactique_bonus_base": 0.02, "tactique_bonus_max": 0.10, "tactique_pente": 0.4,
  "amis_max": 50, "echanges_amis_par_jour": 3, "echange_jours": 7,
  "messages_par_jour": 100, "message_longueur": 300, "defis_amis_par_jour": 5, "defi_ami_pieces": 30
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
-- Les 6 stats d'un joueur à une note (demande de Maël) : à note égale, tous les joueurs ont le même total de stats,
-- 240 en moyenne à 50 (40 par stat) et 480 à 99 (80 par stat). La forme du joueur (ses écarts, de somme nulle) répartit
-- ce total entre ses stats. Même calcul dans cartes.js (moyenneStats, statsAuNiveau).
create or replace function stat_note(p_note numeric, p_ecart numeric) returns int language sql immutable as $$
  select greatest(1, least(99, round(40 + (p_note - 50) * 40 / 49.0) + round(coalesce(p_ecart, 0))))::int
$$;
-- et l'inverse : une moyenne de stats ramenée sur l'échelle des notes (pour comparer à une équipe de l'ordinateur)
create or replace function note_depuis_stat(p_stat numeric) returns numeric language sql immutable as $$
  select 50 + (p_stat - 40) * 49 / 40.0
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
-- tous les postes du joueur (le premier = principal, celui de la colonne poste) : il joue sans malus à chacun
alter table cartes add column if not exists postes text[] not null default '{}'
  check (postes <@ array['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB']);
update cartes set postes = array[poste] where postes = '{}' and poste is not null;
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
alter table profils add column if not exists division int not null default 1;          -- ancien championnat (remplacé par parcours)
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
-- défis entre ami(e)s (30 pièces au gagnant, 5 par jour) : deux types de plus
alter table rencontres drop constraint if exists rencontres_type_check;
alter table rencontres add constraint rencontres_type_check check (type in ('championnat', 'seance', 'defi', 'defense', 'defi_ami', 'defense_ami'));

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

-- Ami(e)s : une demande (« attente ») puis acceptée ; entre ami(e)s, des échanges de cartes directs (3 propositions par jour)
create table if not exists amis (
  de uuid not null references profils on delete cascade, pour uuid not null references profils on delete cascade,
  statut text not null default 'attente' check (statut in ('attente', 'accepte')), cree_le timestamptz not null default now(),
  primary key (de, pour), check (de <> pour)
);
create table if not exists echanges (
  id uuid primary key default gen_random_uuid(),
  de uuid not null references profils on delete cascade, pour uuid not null references profils on delete cascade,
  donne uuid references exemplaires on delete set null,      -- ma carte
  demande uuid references exemplaires on delete set null,    -- la sienne
  offre jsonb not null, cherche jsonb not null,              -- {carte, palier, note} au moment de la proposition
  statut text not null default 'ouvert' check (statut in ('ouvert', 'accepte', 'refuse', 'annule')),
  cree_le timestamptz not null default now(), fini_le timestamptz
);
create index if not exists echanges_pour on echanges (pour, statut);
-- messages entre ami(e)s (lus seulement par les fonctions du jeu)
create table if not exists messages_amis (
  id bigserial primary key, de uuid not null references profils on delete cascade, pour uuid not null references profils on delete cascade,
  texte text not null check (char_length(texte) between 1 and 500), lu boolean not null default false, cree_le timestamptz not null default now()
);
create index if not exists messages_pour on messages_amis (pour, lu);
create index if not exists messages_paire on messages_amis (least(de, pour), greatest(de, pour), cree_le);
create index if not exists echanges_de on echanges (de, cree_le);

-- Journal de tout ce qui bouge (pièces, cartes) : pour comprendre un litige ou repérer une triche.
create table if not exists mouvements (
  id bigserial primary key, user_id uuid, quoi text not null, detail jsonb, le timestamptz not null default now()
);
create index if not exists mouvements_user on mouvements (user_id, le);

-- Parcours : les vraies équipes de chaque niveau (data/adversaires.json, envoyé par l'outil ; noms de clubs seulement)
create table if not exists equipes_reelles (niveau int not null, nom text not null, primary key (niveau, nom));
alter table profils add column if not exists parcours jsonb;
alter table profils add column if not exists jet7m jsonb;
alter table profils add column if not exists minijeux jsonb;   -- autres mini-jeux : {jour, gardien: [...], contre: [...], suspension: [...]}
-- tir secret de l'arrêt réflexe, en attente de la réponse du gardien : à part, car chaque joueur peut lire sa ligne de profils
create table if not exists mini_attente (user_id uuid primary key references profils on delete cascade, colonne text not null, hauteur text not null,
  le timestamptz not null default now());
alter table mini_attente add column if not exists info jsonb;   -- contre-attaque : {defenseur: 'A' | 'B', engage: ms}      -- mini-jeu du jet de 7 m : {jour, tirs: ['but', 'arret', …]}   -- poule ou tournoi en cours, palmarès (voir match_championnat)

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
alter table equipes_reelles enable row level security;   -- aucune politique : lue seulement par les fonctions
alter table mini_attente enable row level security;      -- aucune politique : illisible depuis le jeu

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
revoke all on equipes_reelles from anon, authenticated;
revoke all on mini_attente from anon, authenticated;
revoke all on amis, echanges, messages_amis from anon, authenticated;
alter table messages_amis enable row level security;
alter table amis enable row level security;
alter table echanges enable row level security;

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
         ('equipe', 1, 30, 60, 'Modifie ton équipe'),
         ('championnat', 3, 80, 200, 'Joue 3 matchs de championnat'),
         ('victoire', 2, 100, 200, 'Gagne 2 matchs (championnat ou défi entre ami(e)s)'),
         ('defi', 2, 80, 150, 'Défie 2 fois tes ami(e)s'),
         ('pari', 1, 40, 80, 'Fais un pari sur un vrai match du club'),
         ('marche', 1, 40, 100, 'Publie ou accepte une annonce aux transferts')
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

-- Joueur au hasard parmi les cartes en jeu (d'un poste donné si demandé ; sinon tous).
-- Par poste, seul le poste PRINCIPAL compte : un joueur à plusieurs postes n'a pas plus de chances de sortir.
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
-- Taille d'une poule selon le niveau : 4 en Promotion, puis une équipe de plus par niveau (4 à 12)
create or replace function poule_taille(p_niveau int) returns int language sql stable security definer set search_path = public as $$
  select parami('poule_equipes_depart') + parami('poule_equipes_pas') * (p_niveau - 1)
$$;
-- Nombre de descentes : 1 dans les petites poules (5 équipes ou moins), 2 au-delà ; il reste toujours un milieu de tableau
create or replace function poule_descentes(p_n int) returns int language sql stable security definer set search_path = public as $$
  select case when p_n <= parami('poule_petite') then parami('poule_descente_petite') else parami('poule_descente') end
$$;
-- Ce que le jeu affiche du parcours (forces des équipes arrondies ; voir match_championnat)
create or replace function parcours_vue(pc jsonb) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare nv jsonb; v jsonb; j int; m jsonb; adv int; dom boolean;
begin
  if pc is null then return null; end if;
  nv := param('parcours') -> ((pc ->> 'niveau')::int - 1);
  v := jsonb_build_object('niveau', pc -> 'niveau', 'nom', nv ->> 'nom', 'groupe', nv ->> 'groupe', 'type', pc ->> 'type',
    'saison', pc -> 'saison', 'international', pc -> 'international', 'meilleur', pc -> 'meilleur', 'palmares', pc -> 'palmares',
    'legendesBattues', pc -> 'legendes_battues', 'niveaux', jsonb_array_length(param('parcours')));
  if pc ->> 'type' = 'poule' then
    j := (pc ->> 'journee')::int;
    if j < jsonb_array_length(pc -> 'calendrier') then
      select x into m from jsonb_array_elements(pc -> 'calendrier' -> j) x where (x ->> 0)::int = 0 or (x ->> 1)::int = 0;
      dom := (m ->> 0)::int = 0; adv := case when dom then (m ->> 1)::int else (m ->> 0)::int end;
    end if;
    v := v || jsonb_build_object('journee', j, 'journees', jsonb_array_length(pc -> 'calendrier'),
      'montee', parami('poule_montee'), 'descente', case when (pc ->> 'niveau')::int > 1 then poule_descentes(jsonb_array_length(pc -> 'equipes')) else 0 end,
      'classement', (select jsonb_agg(jsonb_build_object('nom', x ->> 'nom', 'moi', coalesce((x ->> 'moi')::boolean, false),
          'j', x -> 'j', 'v', x -> 'v', 'n', x -> 'n', 'd', x -> 'd', 'bp', x -> 'bp', 'bc', x -> 'bc', 'pts', x -> 'pts',
          'force', round((x ->> 'f')::numeric)) order by o) from jsonb_array_elements(poule_classement(pc -> 'equipes')) with ordinality a(x, o)),
      'prochain', case when adv is null then null else jsonb_build_object('nom', pc -> 'equipes' -> adv ->> 'nom',
          'force', round((pc -> 'equipes' -> adv ->> 'f')::numeric), 'domicile', dom) end);
  elsif pc ->> 'type' = 'tournoi' then
    v := v || jsonb_build_object('tour', pc -> 'tour', 'adversaires',
      (select jsonb_agg(jsonb_build_object('nom', x ->> 'nom', 'force', round((x ->> 'f')::numeric)) order by o)
       from jsonb_array_elements(pc -> 'adversaires') with ordinality a(x, o)));
  else
    v := v || jsonb_build_object('v', pc -> 'v', 'd', pc -> 'd', 'manches', parami('legendes_manches'),
      'force', nv -> 'base', 'joueurs', (select jsonb_agg(x ->> 'n') from jsonb_array_elements(param('legendes')) x));
  end if;
  return v;
end $$;

-- Mini-jeux : essais par jour et pièces par réussite (l'arrêt réflexe se joue en séries de 5 tirs : 25 tirs, 10 pièces par arrêt)
create or replace function mini_limite(p_jeu text) returns int language sql stable security definer set search_path = public as $$
  select case when p_jeu = 'gardien' then parami('mini_gardien_tirs_par_jour') else parami('mini_essais_par_jour') end
$$;
create or replace function mini_gain(p_jeu text) returns int language sql stable security definer set search_path = public as $$
  select case when p_jeu = 'gardien' then parami('mini_gardien_pieces') else parami('mini_pieces') end
$$;

-- Mini-jeux du jour (remis à zéro chaque jour)
create or replace function mini_jour(m jsonb) returns jsonb language sql stable as $$
  select case when m ->> 'jour' = aujourdhui()::text then m else jsonb_build_object('jour', aujourdhui()::text) end
$$;

create or replace function etat_de(p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profil', true, 'pseudo', p.pseudo, 'role', p.role, 'pieces', p.pieces,
    'niveau', p.niveau, 'xp', p.xp, 'xpNiveau', xp_niveau(p.niveau),
    'depart', p.depart, 'boosters', p.boosters, 'bonus', p.bonus, 'bonusOr', p.bonus_or, 'boostersOuverts', p.boosters_ouverts,
    'boosterMax', parami('booster_stock_max'),
    'prochainBooster', case when p.boosters >= parami('booster_stock_max') then null
      else greatest(0, ceil(extract(epoch from p.boosters_maj + make_interval(mins => parami('booster_minutes')) - now())))::int end,
    'equipe', p.equipe, 'tactique', p.tactique,
    'parcours', parcours_vue(p.parcours),
    'jet7m', jsonb_build_object('tirs', case when p.jet7m ->> 'jour' = aujourdhui()::text then p.jet7m -> 'tirs' else '[]'::jsonb end,
      'limite', parami('jet7m_tirs_par_jour'), 'piecesBut', parami('jet7m_pieces_but'), 'bonus', parami('jet7m_bonus_parfait')),
    'minijeux', jsonb_build_object('gardien', coalesce(mini_jour(p.minijeux) -> 'gardien', '[]'), 'contre', coalesce(mini_jour(p.minijeux) -> 'contre', '[]'),
      'suspension', coalesce(mini_jour(p.minijeux) -> 'suspension', '[]'),
      'limite', parami('mini_essais_par_jour'), 'pieces', parami('mini_pieces'), 'bonus', parami('mini_bonus_parfait'),
      'limites', jsonb_build_object('gardien', mini_limite('gardien'), 'contre', mini_limite('contre'), 'suspension', mini_limite('suspension')),
      'gains', jsonb_build_object('gardien', mini_gain('gardien'), 'contre', mini_gain('contre'), 'suspension', mini_gain('suspension'))),
    'trophees', p.trophees,
    'social', jsonb_build_object('demandes', (select count(*) from amis a where a.pour = p.user_id and a.statut = 'attente'),
      'echanges', (select count(*) from echanges x where x.pour = p.user_id and x.statut = 'ouvert'),
      'messages', (select count(*) from messages_amis m where m.pour = p.user_id and not m.lu)),
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
    -- au but : seulement si GB fait partie de ses postes ; sur le terrain : s'il a un poste de champ (ou aucun poste)
    if not exists (select 1 from exemplaires e join cartes c on c.id = e.carte_id
        where e.id::text = l.value and e.proprietaire = p_uid and e.verrou is null
          and case when l.key = 'GB' then 'GB' = any(c.postes)
              else cardinality(c.postes) = 0 or exists (select 1 from unnest(c.postes) x where x <> 'GB') end) then
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
    update profils set parcours = parcours_nouveau(1, null, pseudo) where user_id = auth.uid() and parcours is null;
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
    insert into profils (user_id, pseudo, pieces, boosters, boosters_maj, parcours)
      values (auth.uid(), p_pseudo, parami('depart_pieces'), parami('booster_stock_depart'), now(), parcours_nouveau(1, null, p_pseudo));
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
-- Seuls les joueurs dont c'est le poste PRINCIPAL sont tirés : avoir plusieurs postes ne donne pas plus de chances de sortir.
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
  if e.verrou is not null then raise exception 'Cette carte est proposée aux transferts'; end if;
  if exists (select 1 from jsonb_each_text(p.equipe) j where j.value = p_ex::text) then
    raise exception 'Cette carte joue dans ton équipe : retire-la d’abord';
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

-- Tactiques (demande de Maël) : un choix d'attaque et un dispositif défensif, écrits « attaque:défense ».
-- Chacun s'appuie sur deux stats ; le bonus dépend de la spécialisation des 6 joueurs de champ dans ces deux stats :
-- spé = (moyenne des deux stats) / (moyenne des 6 stats) − 1 ; bonus = base + pente × spé, entre 0 et le maximum
-- (2 % pour une équipe moyenne, jusqu'à 10 % pour une équipe très spécialisée, 0 % si elle est à l'opposé).
create or replace function tactique_stats(p_choix text) returns text[] language sql immutable as $$
  select case p_choix when 'duels' then array['tir', 'phy'] when 'enclenchement' then array['men', 'pas'] when 'rapide' then array['def', 'vit']
    when '06' then array['tir', 'def'] when '15' then array['men', 'phy'] when '33' then array['pas', 'vit'] end
$$;
create or replace function tactique_bonus(p_moy jsonb, p_choix text) returns numeric language sql stable security definer set search_path = public as $$
  with s as (select tactique_stats(p_choix) ks), t as (
    select ((p_moy ->> ks[1])::numeric + (p_moy ->> ks[2])::numeric) / 2 / nullif(((p_moy ->> 'tir')::numeric + (p_moy ->> 'pas')::numeric
      + (p_moy ->> 'def')::numeric + (p_moy ->> 'men')::numeric + (p_moy ->> 'phy')::numeric + (p_moy ->> 'vit')::numeric) / 6, 0) - 1 spe from s where ks is not null)
  select coalesce((select round(greatest(0, least((param('tactique_bonus_max') #>> '{}')::numeric,
    (param('tactique_bonus_base') #>> '{}')::numeric + (param('tactique_pente') #>> '{}')::numeric * spe)), 3) from t), 0)
$$;

-- Force d'une équipe {poste: exemplaire} : attaque, défense, note, et les tireurs avec leur poids.
-- Chaque joueur : note de l'exemplaire (−5 hors de ses postes) → ses 6 stats (stat_note, avec sa forme).
-- Attaque = tir, passes, vitesse des 6 joueurs de champ ; défense = défense, physique, mental + gardien(ne) ;
-- ramenées sur l'échelle des notes, puis le bonus des tactiques (en %).
create or replace function force_equipe(p_equipe jsonb, p_tactique text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l record; att numeric := 0; def numeric := 0; arr numeric := 0; notes numeric := 0; n int := 0;
  tireurs jsonb := '[]'; eqs jsonb := '{}'; maxi int; coll int; moy jsonb; b_att numeric; b_def numeric;
  m_tir numeric := 0; m_pas numeric := 0; m_def numeric := 0; m_men numeric := 0; m_phy numeric := 0; m_vit numeric := 0;
  s_tir numeric; s_pas numeric; s_vit numeric; s_def numeric; s_phy numeric; s_men numeric; s_ref numeric; s_pla numeric; ne int;
begin
  for l in select j.key as slot, e.note, c.postes, c.nom, c.equipe, c.ecarts
      from jsonb_each_text(p_equipe) j join exemplaires e on e.id::text = j.value join cartes c on c.id = e.carte_id loop
    -- −5 hors de ses postes (un joueur sans poste renseigné joue partout sans malus)
    ne := l.note - case when l.slot <> 'GB' and cardinality(l.postes) > 0 and not (l.slot = any(l.postes)) then 5 else 0 end;
    n := n + 1; notes := notes + ne;
    eqs := jsonb_set(eqs, array[l.equipe], to_jsonb(coalesce((eqs ->> l.equipe)::int, 0) + 1));
    s_men := stat_note(ne, (l.ecarts ->> 'men')::numeric);
    s_phy := stat_note(ne, (l.ecarts ->> 'phy')::numeric);
    if l.slot = 'GB' then
      s_ref := stat_note(ne, (l.ecarts ->> 'ref')::numeric);
      s_pla := stat_note(ne, (l.ecarts ->> 'pla')::numeric);
      arr := .5 * s_ref + .3 * s_pla + .2 * s_men;
    else
      s_tir := stat_note(ne, (l.ecarts ->> 'tir')::numeric);
      s_pas := stat_note(ne, (l.ecarts ->> 'pas')::numeric);
      s_vit := stat_note(ne, (l.ecarts ->> 'vit')::numeric);
      s_def := stat_note(ne, (l.ecarts ->> 'def')::numeric);
      att := att + (.5 * s_tir + .3 * s_pas + .2 * s_vit) / 6;
      def := def + (.5 * s_def + .3 * s_phy + .2 * s_men) / 6;
      m_tir := m_tir + s_tir / 6; m_pas := m_pas + s_pas / 6; m_def := m_def + s_def / 6;
      m_men := m_men + s_men / 6; m_phy := m_phy + s_phy / 6; m_vit := m_vit + s_vit / 6;
      tireurs := tireurs || jsonb_build_object('n', l.nom, 'p', greatest(1, s_tir - 25));
    end if;
  end loop;
  if n < 7 then raise exception 'Il faut 7 joueurs alignés dans ton équipe pour jouer'; end if;
  select max(value::int) into maxi from jsonb_each_text(eqs);
  coll := case when maxi >= 7 then 3 when maxi >= 5 then 2 when maxi >= 3 then 1 else 0 end;   -- coéquipier(e)s
  moy := jsonb_build_object('tir', round(m_tir, 1), 'pas', round(m_pas, 1), 'def', round(m_def, 1), 'men', round(m_men, 1), 'phy', round(m_phy, 1), 'vit', round(m_vit, 1));
  b_att := tactique_bonus(moy, split_part(coalesce(p_tactique, ''), ':', 1));
  b_def := tactique_bonus(moy, split_part(coalesce(p_tactique, ''), ':', 2));
  return jsonb_build_object(
    'att', round((note_depuis_stat(att) + coll) * (1 + b_att), 1),
    'def', round((note_depuis_stat(.6 * def + .4 * arr) + coll) * (1 + b_def), 1),
    'note', round(notes / n + coll), 'tireurs', tireurs, 'moyennes', moy, 'bonus', jsonb_build_object('attaque', b_att, 'defense', b_def));
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

-- « attaque:défense » (duels, enclenchement, rapide : 06, 15, 33) ; les anciennes valeurs restent acceptées (sans bonus)
create or replace function verifier_tactique(p_tactique text) returns text language plpgsql immutable as $$
begin
  if p_tactique in ('attaque', 'equilibre', 'defense') then return p_tactique; end if;
  if coalesce(p_tactique, '') !~ '^(duels|enclenchement|rapide):(06|15|33)$' then raise exception 'Tactique inconnue'; end if;
  return p_tactique;
end $$;
-- Garder ses choix tactiques (écran Équipe), sans jouer
create or replace function choisir_tactique(p_tactique text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  perform verifier_tactique(p_tactique);
  update profils set tactique = p_tactique where user_id = p.user_id;
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;

create or replace function compter_jour(p_uid uuid, p_type text) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from rencontres where user_id = p_uid and type = p_type and le >= debut_du_jour()
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Parcours contre l'ordinateur : Départemental → Régional → National (poules à classement),
-- puis International (tournois à élimination directe) et enfin les Légendes du handball.
-- profils.parcours garde la saison en cours :
--   poule    {niveau, type, saison, journee, equipes: [{nom, f, j, v, n, d, bp, bc, pts, moi?}], calendrier: [[[dom, ext], …], …]}
--   tournoi  {niveau, type, saison, tour (0 quart, 1 demie, 2 finale), adversaires: [{nom, f}]}
--   legendes {niveau, type, saison, v, d}
-- et toujours : international (plus de descente une fois sorti de Nationale 1), meilleur (plus haut niveau atteint),
-- palmares [{titre, saison}], legendes_battues.
-- ════════════════════════════════════════════════════════════════════════════

-- Calendrier aller-retour (méthode du cercle) : chacun rencontre tout le monde, une fois à domicile, une fois à l'extérieur
create or replace function calendrier(n int, tours int) returns jsonb language plpgsql immutable as $$
declare cal jsonb := '[]'; jr jsonb; r int; i int; a int; b int; t int;
begin
  for t in 1..tours loop
    for r in 0..n - 2 loop
      jr := '[]';
      for i in 0..n / 2 - 1 loop
        if i = 0 then a := n - 1; b := r; else a := (r + i) % (n - 1); b := (r - i + n - 1) % (n - 1); end if;
        jr := jr || case when (r + i + t) % 2 = 0 then jsonb_build_array(jsonb_build_array(a, b)) else jsonb_build_array(jsonb_build_array(b, a)) end;
      end loop;
      cal := cal || jsonb_build_array(jr);
    end loop;
  end loop;
  return cal;
end $$;

-- k vraies équipes pour un niveau (celles du niveau d'abord, puis des niveaux voisins s'il en manque)
create or replace function noms_reels(p_niveau int, k int) returns text[] language sql volatile security definer set search_path = public as $$
  select coalesce(array_agg(nom), '{}') from (
    select nom from (select distinct on (nom) nom, abs(niveau - p_niveau) d from equipes_reelles order by nom, abs(niveau - p_niveau)) x
    order by d, random() limit k) y
$$;

-- Nouvelle saison (poule), nouveau tirage (tournoi) ou nouvelle série (Légendes) au niveau donné
create or replace function parcours_nouveau(p_niveau int, p_ancien jsonb, p_pseudo text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare nv jsonb := param('parcours') -> (p_niveau - 1); typ text; base numeric; ec numeric; n int; noms text[]; eqs jsonb; i int; pc jsonb;
begin
  if nv is null then raise exception 'Niveau inconnu'; end if;
  typ := nv ->> 'type'; base := (nv ->> 'base')::numeric;
  pc := jsonb_build_object('niveau', p_niveau, 'type', typ, 'saison', coalesce((p_ancien ->> 'saison')::int, 0) + 1,
    'international', coalesce((p_ancien ->> 'international')::boolean, false) or typ <> 'poule',
    'meilleur', greatest(p_niveau, coalesce((p_ancien ->> 'meilleur')::int, 1)),
    'palmares', coalesce(p_ancien -> 'palmares', '[]'), 'legendes_battues', coalesce((p_ancien ->> 'legendes_battues')::int, 0));
  if typ = 'poule' then
    n := poule_taille(p_niveau); ec := parami('poule_ecart');
    noms := noms_reels(p_niveau, n - 1);
    eqs := jsonb_build_array(jsonb_build_object('nom', p_pseudo, 'moi', true, 'j', 0, 'v', 0, 'n', 0, 'd', 0, 'bp', 0, 'bc', 0, 'pts', 0));
    for i in 1..n - 1 loop   -- forces réparties de base − écart à base + écart
      eqs := eqs || jsonb_build_array(jsonb_build_object('nom', coalesce(noms[i], 'Équipe ' || i),
        'f', round((base - ec + 2 * ec * (i - 1) / greatest(1, n - 2) + random() - .5)::numeric, 1),
        'j', 0, 'v', 0, 'n', 0, 'd', 0, 'bp', 0, 'bc', 0, 'pts', 0));
    end loop;
    return pc || jsonb_build_object('journee', 0, 'equipes', eqs, 'calendrier', calendrier(n, parami('poule_tours')));
  elsif typ = 'tournoi' then
    ec := parami('tournoi_ecart');
    return pc || jsonb_build_object('tour', 0, 'adversaires', (select jsonb_agg(jsonb_build_object('nom', z.x, 'f', base + ec * (z.rg - 2)) order by z.rg)
      from (select y.x, row_number() over () rg from (select x from jsonb_array_elements_text(nv -> 'equipes') x order by random() limit 3) y) z));
  else
    return pc || jsonb_build_object('v', 0, 'd', 0);
  end if;
end $$;

-- Une ligne du classement après un match (points FFHB : 3 victoire, 2 nul, 1 défaite)
create or replace function poule_ligne(l jsonb, pour int, contre int) returns jsonb language sql stable security definer set search_path = public as $$
  select l || jsonb_build_object('j', (l ->> 'j')::int + 1,
    'v', (l ->> 'v')::int + (pour > contre)::int, 'n', (l ->> 'n')::int + (pour = contre)::int, 'd', (l ->> 'd')::int + (pour < contre)::int,
    'bp', (l ->> 'bp')::int + pour, 'bc', (l ->> 'bc')::int + contre,
    'pts', (l ->> 'pts')::int + (param('points_match') ->> case when pour > contre then 'gagne' when pour = contre then 'nul' else 'perdu' end)::int)
$$;

-- Classement : points, puis différence de buts, puis buts marqués ; i = place de l'équipe dans la liste
create or replace function poule_classement(eqs jsonb) returns jsonb language sql immutable as $$
  select jsonb_agg(x || jsonb_build_object('i', i - 1) order by (x ->> 'pts')::int desc, (x ->> 'bp')::int - (x ->> 'bc')::int desc,
    (x ->> 'bp')::int desc, x ->> 'nom')
  from jsonb_array_elements(eqs) with ordinality a(x, i)
$$;

-- Score d'un match entre deux équipes de l'ordinateur (même formule que simuler, sans le déroulé)
create or replace function score_ordi(fa numeric, fb numeric) returns int[] language plpgsql volatile as $$
declare base numeric := parami('match_base'); k numeric := (param('match_coef') #>> '{}')::numeric;
  a numeric := fa + random() * 2 - 1; b numeric := fb + random() * 2 - 1;
begin
  return array[greatest(8, round(base + k * (a - b) + (random() + random() + random() + random() - 2) * 5))::int,
               greatest(8, round(base + k * (b - a) + (random() + random() + random() + random() - 2) * 5))::int];
end $$;

-- Tirs au but (7 m) après un nul en tournoi : 5 tirs chacun, puis mort subite
create or replace function tirs_au_but(p_a jsonb, p_b jsonb) returns jsonb language plpgsql volatile as $$
declare pa numeric; pb numeric; a int := 0; b int := 0; i int := 0;
begin
  pa := least(.9, greatest(.5, .72 + .01 * ((p_a ->> 'att')::numeric - (p_b ->> 'def')::numeric)));
  pb := least(.9, greatest(.5, .72 + .01 * ((p_b ->> 'att')::numeric - (p_a ->> 'def')::numeric)));
  loop
    i := i + 1;
    a := a + (random() < pa)::int; b := b + (random() < pb)::int;
    exit when i >= 5 and a <> b;
    exit when i < 5 and (a > b + 5 - i or b > a + 5 - i);
    exit when i > 40;
  end loop;
  if a = b then a := a + 1; end if;
  return jsonb_build_object('a', a, 'b', b);
end $$;

-- Un match du parcours : la journée de la poule, le tour du tournoi ou une manche contre les Légendes
create or replace function match_championnat(p_tactique text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); pc jsonb; nv jsonb; niv int; typ text; mult numeric; fa jsonb; fb jsonb; r jsonb; res text;
  adv text; fadv numeric; dom boolean; eqs jsonb; m jsonb; a int; b int; sc int[]; j int; t int; tab jsonb; rang int; n int;
  montee boolean; descente boolean; nouveau int; passe boolean; etape jsonb; v int; d int; gagnes int;
  xp int; xpc int; v_pieces int; pts int := null; recompense int := 0; bonus_b int := 0; bonus_o int := 0;
  progres jsonb; niveaux jsonb; fin jsonb := null; titre text;
begin
  perform verifier_tactique(p_tactique);
  perform verifier_equipe(p.user_id, p.equipe);
  if compter_jour(p.user_id, 'championnat') >= parami('pve_par_jour') then
    raise exception 'Tu as joué tes % matchs de championnat du jour : reviens demain', parami('pve_par_jour');
  end if;
  pc := coalesce(p.parcours, parcours_nouveau(1, null, p.pseudo));
  niv := (pc ->> 'niveau')::int; nv := param('parcours') -> (niv - 1); typ := pc ->> 'type';
  mult := 1 + (niv - 1) / 4.0;   -- les gains grandissent avec le niveau : ×1 en Promotion, ×4 contre les Légendes
  fa := force_equipe(p.equipe, p_tactique);

  if typ = 'poule' then
    j := (pc ->> 'journee')::int; eqs := pc -> 'equipes';
    for m in select x from jsonb_array_elements(pc -> 'calendrier' -> j) x loop
      a := (m ->> 0)::int; b := (m ->> 1)::int;
      if a = 0 or b = 0 then   -- notre match
        dom := a = 0;
        fadv := (eqs -> (a + b) ->> 'f')::numeric; adv := eqs -> (a + b) ->> 'nom';
        r := simuler(fa, equipe_ordi(fadv));
        if dom then sc := array[(r ->> 'a')::int, (r ->> 'b')::int]; else sc := array[(r ->> 'b')::int, (r ->> 'a')::int]; end if;
      else                      -- les autres matchs de la journée
        sc := score_ordi((eqs -> a ->> 'f')::numeric, (eqs -> b ->> 'f')::numeric);
      end if;
      eqs := jsonb_set(eqs, array[a::text], poule_ligne(eqs -> a, sc[1], sc[2]));
      eqs := jsonb_set(eqs, array[b::text], poule_ligne(eqs -> b, sc[2], sc[1]));
    end loop;
    j := j + 1;
    pc := pc || jsonb_build_object('journee', j, 'equipes', eqs);
    res := r ->> 'resultat';
    pts := (param('points_match') ->> res)::int;
    tab := poule_classement(eqs); n := jsonb_array_length(tab);
    select o into rang from jsonb_array_elements(tab) with ordinality x(e, o) where (e ->> 'i')::int = 0;
    etape := jsonb_build_object('journee', j, 'journees', jsonb_array_length(pc -> 'calendrier'), 'rang', rang, 'domicile', dom);
    if j >= jsonb_array_length(pc -> 'calendrier') then   -- fin de saison
      montee := rang <= parami('poule_montee');
      descente := not montee and rang > n - poule_descentes(n) and niv > 1 and not coalesce((pc ->> 'international')::boolean, false);
      nouveau := niv + case when montee then 1 when descente then -1 else 0 end;
      recompense := round(parami('parcours_saison_pieces') * mult * case when rang = 1 then 2 when montee then 1.5 when descente then .5 else 1 end);
      bonus_b := case when rang = 1 then 1 else 0 end;
      -- sortie de Nationale 1 : place à l'International, et plus jamais de descente
      bonus_o := case when montee and param('parcours') -> (nouveau - 1) ->> 'type' <> 'poule' then 1 else 0 end;
      if rang = 1 then
        pc := jsonb_set(pc, '{palmares}', (pc -> 'palmares') || jsonb_build_array(jsonb_build_object(
          'titre', 'Champion ' || (nv ->> 'groupe') || ' ' || (nv ->> 'nom'), 'saison', pc -> 'saison')));
      end if;
      fin := jsonb_build_object('type', 'saison', 'rang', rang, 'equipes', n, 'montee', montee, 'descente', descente,
        'niveau', niv, 'nouveau', nouveau, 'nom', (nv ->> 'groupe') || ' ' || (nv ->> 'nom'),
        'nouveauNom', (param('parcours') -> (nouveau - 1) ->> 'groupe') || ' ' || (param('parcours') -> (nouveau - 1) ->> 'nom'),
        'international', param('parcours') -> (nouveau - 1) ->> 'type' <> 'poule',
        'pieces', recompense, 'booster', bonus_b, 'boosterOr', bonus_o, 'classement', parcours_vue(pc) -> 'classement');
      pc := parcours_nouveau(nouveau, pc, p.pseudo);
    end if;

  elsif typ = 'tournoi' then
    t := (pc ->> 'tour')::int;
    adv := pc -> 'adversaires' -> t ->> 'nom'; fadv := (pc -> 'adversaires' -> t ->> 'f')::numeric;
    fb := equipe_ordi(fadv);
    r := simuler(fa, fb);
    res := r ->> 'resultat';
    if res = 'nul' then r := r || jsonb_build_object('tab', tirs_au_but(fa, fb)); end if;
    passe := res = 'gagne' or (res = 'nul' and (r -> 'tab' ->> 'a')::int > (r -> 'tab' ->> 'b')::int);
    etape := jsonb_build_object('tour', t, 'passe', passe, 'tours', jsonb_array_length(pc -> 'adversaires'));
    if passe and t + 1 >= jsonb_array_length(pc -> 'adversaires') then   -- finale gagnée
      titre := 'Vainqueur ' || case when nv ->> 'nom' like 'Jeux%' then 'des ' else 'du ' end || (nv ->> 'nom');
      recompense := round(parami('parcours_tournoi_pieces') * mult); bonus_o := 1;
      pc := jsonb_set(pc, '{palmares}', (pc -> 'palmares') || jsonb_build_array(jsonb_build_object('titre', titre, 'saison', pc -> 'saison')));
      nouveau := least(niv + 1, jsonb_array_length(param('parcours')));
      fin := jsonb_build_object('type', 'tournoi', 'gagne', true, 'titre', titre, 'niveau', niv, 'nouveau', nouveau,
        'nouveauNom', param('parcours') -> (nouveau - 1) ->> 'nom', 'pieces', recompense, 'boosterOr', bonus_o);
      pc := parcours_nouveau(nouveau, pc, p.pseudo);
    elsif passe then
      pc := jsonb_set(pc, '{tour}', to_jsonb(t + 1));
    else                                          -- éliminé : nouveau tirage, au même niveau
      fin := jsonb_build_object('type', 'tournoi', 'gagne', false, 'tour', t, 'niveau', niv, 'nom', nv ->> 'nom');
      pc := parcours_nouveau(niv, pc, p.pseudo);
    end if;

  else   -- Légendes du handball : une série au meilleur des 5 manches (3 victoires)
    adv := nv ->> 'nom'; fadv := (nv ->> 'base')::numeric;
    fb := jsonb_build_object('att', round((fadv + random() * 2 - 1)::numeric, 1), 'def', round((fadv + random() * 2 - 1)::numeric, 1), 'note', fadv,
      'tireurs', (select jsonb_agg(jsonb_build_object('n', x ->> 'n', 'p', (x ->> 'p')::int)) from jsonb_array_elements(param('legendes')) x));
    r := simuler(fa, fb);
    res := r ->> 'resultat';
    if res = 'nul' then r := r || jsonb_build_object('tab', tirs_au_but(fa, fb)); end if;
    passe := res = 'gagne' or (res = 'nul' and (r -> 'tab' ->> 'a')::int > (r -> 'tab' ->> 'b')::int);
    v := (pc ->> 'v')::int + passe::int; d := (pc ->> 'd')::int + (not passe)::int;
    gagnes := parami('legendes_manches') / 2 + 1;
    etape := jsonb_build_object('v', v, 'd', d, 'manches', parami('legendes_manches'), 'passe', passe);
    if v >= gagnes then
      recompense := round(parami('parcours_legendes_pieces') * case when (pc ->> 'legendes_battues')::int = 0 then 2 else 1 end);
      bonus_o := parami('parcours_legendes_bonus_or');
      pc := pc || jsonb_build_object('legendes_battues', (pc ->> 'legendes_battues')::int + 1);
      if (pc ->> 'legendes_battues')::int = 1 then
        pc := jsonb_set(pc, '{palmares}', (pc -> 'palmares') || jsonb_build_array(jsonb_build_object('titre', 'Vainqueur des Légendes du handball', 'saison', pc -> 'saison')));
      end if;
      fin := jsonb_build_object('type', 'legendes', 'gagne', true, 'v', v, 'd', d, 'fois', (pc ->> 'legendes_battues')::int,
        'pieces', recompense, 'boosterOr', bonus_o);
      pc := parcours_nouveau(niv, pc, p.pseudo);
    elsif d >= gagnes then
      fin := jsonb_build_object('type', 'legendes', 'gagne', false, 'v', v, 'd', d);
      pc := parcours_nouveau(niv, pc, p.pseudo);
    else
      pc := pc || jsonb_build_object('v', v, 'd', d);
    end if;
  end if;

  xp := (param('pve_xp') ->> res)::int; xpc := (param('pve_xp_carte') ->> res)::int;
  v_pieces := round((param('pve_pieces') ->> res)::int * mult);
  update profils set tactique = p_tactique, parcours = pc, pieces = pieces + v_pieces + recompense,
    bonus = bonus + bonus_b, bonus_or = bonus_or + bonus_o where user_id = p.user_id;
  progres := xp_equipe(p.equipe, xpc);
  niveaux := gagner_xp(p.user_id, xp);
  perform progresser(p.user_id, 'championnat');
  if res = 'gagne' then perform progresser(p.user_id, 'victoire'); end if;
  insert into rencontres (user_id, type, adversaire, score, resultat, detail)
    values (p.user_id, 'championnat', adv, array[(r ->> 'a')::int, (r ->> 'b')::int], res,
      jsonb_build_object('niveau', niv, 'force', round(fadv), 'etape', etape, 'tab', r -> 'tab'));
  return jsonb_build_object('match', r, 'adversaire', adv, 'niveauAdversaire', round(fadv), 'note', fa -> 'note',
    'niveau', niv, 'type', typ, 'etape', etape,
    'gains', jsonb_build_object('xp', xp, 'xpCarte', xpc, 'pieces', v_pieces, 'points', pts), 'progres', progres, 'fin', fin,
    'niveaux', niveaux, 'etat', etat_de(p.user_id));
end $$;

-- Mini-jeu : jet de 7 mètres. Le jeu envoie le point visé, arrêté par le joueur sur un viseur qui se promène sur tout
-- le but et autour (x : 0 = poteau gauche, 1 = poteau droit ; y : 0 = barre, 1 = sol ; en dehors = à côté), et la puissance
-- arrêtée sur la jauge (elle donne la vitesse du tir ; trop fort, le tir part n'importe où). Le serveur fait deviner le
-- gardien (un point du but) : il arrête si le ballon passe à sa portée, d'autant plus courte que le tir est rapide.
-- Le jeu ne peut pas prouver ses touches : c'est la limite du jour (5 tirs, 100 pièces au plus) qui borne la triche.
drop function if exists tirer_7m(numeric, numeric);
create or replace function tirer_7m(p_x numeric, p_y numeric, p_puissance numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); j jsonb; tirs jsonb; n int; x numeric := p_x; y numeric := p_y; vitesse numeric; portee numeric; trop numeric;
  gx numeric; gy numeric; res text; v_pieces int := 0; v_bonus int := 0;
begin
  if p_x is null or p_y is null or p_puissance is null or p_x < -.5 or p_x > 1.5 or p_y < -.5 or p_y > 1.2 or p_puissance < 0 or p_puissance > 1 then
    raise exception 'Tir invalide';
  end if;
  j := case when p.jet7m ->> 'jour' = aujourdhui()::text then p.jet7m else jsonb_build_object('jour', aujourdhui(), 'tirs', '[]'::jsonb) end;
  tirs := j -> 'tirs'; n := jsonb_array_length(tirs);
  if n >= parami('jet7m_tirs_par_jour') then
    raise exception 'Tu as tiré tes % jets de 7 m du jour : reviens demain', parami('jet7m_tirs_par_jour');
  end if;
  -- point idéal de la jauge : 80 %. En dessous, le tir est plus lent ; au-dessus, il part de plus en plus de travers
  trop := greatest(0, p_puissance - .8) / .2;
  x := x + (random() - .5) * .44 * trop; y := y + (random() - .5) * .38 * trop;
  vitesse := least(p_puissance, .8) / .8;
  -- le gardien devine : à gauche, au centre ou à droite, en haut ou en bas
  gx := case when random() < .3 then .2 when random() < .3 / .7 then .8 else .5 end;   -- 30 % gauche, 30 % droite, 40 % centre
  gy := case when random() < .5 then .3 else .75 end;
  -- portée du gardien : plus courte si le tir est rapide, plus longue sur un tir mou ou près de son corps
  -- plus le tir est lent, plus le gardien a le temps d'aller le chercher (un tir très lent est rattrapé même dans l'angle)
  portee := .66 - .46 * vitesse + case when gx = .5 then .08 else 0 end;
  if x < 0 or x > 1 or y < 0 then res := 'dehors';
  elsif x < .05 or x > .95 or y < .05 then res := 'poteau';
  elsif abs(x - .5) < .2 then res := 'arret';    -- au centre (de .3 à .7), dans le corps du gardien : toujours arrêté
  -- il ne se déplace qu'en partie vers le côté deviné : les angles lui échappent plus que la mi-distance
  elsif sqrt(power(x - (.5 + (gx - .5) * .6), 2) + power((y - gy) * .67, 2)) < portee then res := 'arret';
  else res := 'but';
  end if;
  tirs := tirs || to_jsonb(res);
  if res = 'but' then v_pieces := parami('jet7m_pieces_but'); end if;
  if jsonb_array_length(tirs) = parami('jet7m_tirs_par_jour')
     and not exists (select 1 from jsonb_array_elements_text(tirs) e where e <> 'but') then v_bonus := parami('jet7m_bonus_parfait'); end if;
  update profils set pieces = pieces + v_pieces + v_bonus, jet7m = jsonb_build_object('jour', aujourdhui(), 'tirs', tirs) where user_id = p.user_id;
  perform noter(p.user_id, 'jet7m', jsonb_build_object('x', p_x, 'y', p_y, 'puissance', p_puissance, 'resultat', res, 'pieces', v_pieces + v_bonus));
  return jsonb_build_object('resultat', res, 'x', round(x, 3), 'y', round(y, 3), 'vitesse', round(vitesse, 2), 'gardien', jsonb_build_object('x', gx, 'y', gy),
    'pieces', v_pieces, 'bonus', v_bonus, 'tirs', tirs, 'restants', parami('jet7m_tirs_par_jour') - jsonb_array_length(tirs), 'etat', etat_de(p.user_id));
end $$;

-- Autres mini-jeux. Le jeu envoie ce que le joueur a fait (zone choisie, précision, moment du saut…) ; le serveur décide.
-- L'arrêt réflexe se joue en deux temps : mini_preparer tire la zone du tir et la durée de son vol (le jeu montre la
-- trajectoire dès que le ballon part) ; mini_jouer vérifie que le gardien a touché la bonne zone avant que le ballon arrive.
create or replace function mini_preparer(p_jeu text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); m jsonb; col text; hau text;
begin
  if p_jeu is null or p_jeu not in ('gardien', 'contre') then raise exception 'Mini-jeu inconnu'; end if;
  m := mini_jour(p.minijeux);
  if jsonb_array_length(coalesce(m -> p_jeu, '[]')) >= mini_limite(p_jeu) then
    raise exception 'Tu as joué tes % essais du jour : reviens demain', mini_limite(p_jeu);
  end if;
  if p_jeu = 'contre' then   -- 2 contre 1 : le défenseur sortira sur le porteur (A) ou sur le partenaire (B), à un moment donné
    insert into mini_attente (user_id, colonne, hauteur, info) values (p.user_id, 'contre', '-',
      jsonb_build_object('defenseur', case when random() < .8 then 'A' else 'B' end, 'engage', 800 + floor(random() * 600)::int))   -- 80 % sur le porteur
      on conflict (user_id) do update set colonne = excluded.colonne, hauteur = excluded.hauteur, info = excluded.info, le = now();
    return (select info from mini_attente where user_id = p.user_id);
  end if;
  col := case when random() < .4 then 'g' when random() < 2 / 3.0 then 'd' else 'c' end;
  hau := case when random() < .5 then 'h' else 'b' end;
  -- durée du vol du ballon : de plus en plus court au fil des tirs de la journée
  insert into mini_attente (user_id, colonne, hauteur, info) values (p.user_id, col, hau,
      jsonb_build_object('duree', greatest(520, 980 - 18 * jsonb_array_length(coalesce(m -> p_jeu, '[]')) - floor(random() * 120)::int)))
    on conflict (user_id) do update set colonne = excluded.colonne, hauteur = excluded.hauteur, info = excluded.info, le = now();
  return (select jsonb_build_object('colonne', colonne, 'hauteur', hauteur, 'duree', info -> 'duree') from mini_attente where user_id = p.user_id);
end $$;

create or replace function mini_jouer(p_jeu text, p_entrees jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); m jsonb; liste jsonb; a jsonb := null; res text; reussi boolean; v_pieces int := 0; v_bonus int := 0;
  x numeric; y numeric; succes text := case p_jeu when 'gardien' then 'arret' else 'but' end;
begin
  if p_jeu is null or p_jeu not in ('gardien', 'contre', 'suspension') then raise exception 'Mini-jeu inconnu'; end if;
  if jsonb_typeof(p_entrees) is distinct from 'object' then raise exception 'Essai invalide'; end if;
  m := mini_jour(p.minijeux); liste := coalesce(m -> p_jeu, '[]');
  if jsonb_array_length(liste) >= mini_limite(p_jeu) then
    raise exception 'Tu as joué tes % essais du jour : reviens demain', mini_limite(p_jeu);
  end if;
  begin
    if p_jeu = 'gardien' then
      select jsonb_build_object('colonne', t.colonne, 'hauteur', t.hauteur, 'duree', t.info -> 'duree') into a from mini_attente t where t.user_id = p.user_id and t.colonne <> 'contre';
      if a is null then raise exception 'Le tir n’est pas encore parti'; end if;
      if coalesce(p_entrees ->> 'colonne', '') not in ('g', 'c', 'd') or coalesce(p_entrees ->> 'hauteur', '') not in ('h', 'b') then raise exception 'Essai invalide'; end if;
      x := coalesce((p_entrees ->> 'temps')::numeric, 99999);   -- ms après le départ du ballon
      if x > coalesce((a ->> 'duree')::numeric, 700) + 60 then res := 'tard';             -- le ballon était déjà passé
      elsif p_entrees ->> 'colonne' = a ->> 'colonne' and p_entrees ->> 'hauteur' = a ->> 'hauteur' then res := 'arret';
      elsif p_entrees ->> 'colonne' = a ->> 'colonne' and random() < .35 then res := 'arret';   -- bon côté, mauvaise hauteur : parfois du bout des doigts
      else res := 'but'; end if;
      delete from mini_attente where user_id = p.user_id;
    elsif p_jeu = 'contre' then
      -- 2 contre 1 : passe dessinée (qualite = dans la course du partenaire) ou on garde le ballon ; le serveur sait sur qui sort le défenseur
      select t.info into a from mini_attente t where t.user_id = p.user_id and t.colonne = 'contre';
      if a is null then raise exception 'La contre-attaque n’est pas encore lancée'; end if;
      if jsonb_typeof(p_entrees -> 'passe') is distinct from 'boolean' then raise exception 'Essai invalide'; end if;
      x := coalesce((p_entrees ->> 'qualite')::numeric, 0); y := coalesce((p_entrees ->> 'temps')::numeric, 99999);
      if x < 0 or x > 1 then raise exception 'Essai invalide'; end if;
      -- pas de gardien (demande de Maël) : une passe dans la course, ou le ballon gardé au bon moment, c'est le but
      if (p_entrees ->> 'passe')::boolean then
        if y > (a ->> 'engage')::numeric + 900 then res := 'neutralise';                    -- trop tard : il est déjà sur toi
        elsif a ->> 'defenseur' = 'A' then                                                 -- bonne lecture : il sort sur toi
          res := case when x < .35 and random() < .75 then 'interception' when random() < (1 - x) * .3 then 'interception' else 'but' end;
        else                                                                               -- il couvrait ton partenaire
          res := case when random() < .7 then 'interception' else 'but' end;
        end if;
      elsif a ->> 'defenseur' = 'B' then res := 'but';                                     -- il est parti sur ton partenaire : tu vas au but
      else res := case when random() < .9 then 'neutralise' else 'but' end;
      end if;
      delete from mini_attente where user_id = p.user_id;
    else
      -- tir en suspension (demande de Maël) : plus de trajectoire, on tire au bon moment. vitesse = remplissage de la barre
      -- de course (0-1), hauteur = où en est le saut au moment du tir (1 = sommet). Élan = barre × hauteur (chacune comptée
      -- pleine à partir de 95 %) : au sommet du saut avec une barre pleine, toujours but ; sinon but avec une chance de élan².
      -- Raté : contré si le tir part bas dans le saut (ou une fois sur deux), sinon arrêté. reponse = le côté du gardien.
      if (p_entrees ->> 'vitesse') is null or (p_entrees ->> 'hauteur') is null then raise exception 'Essai invalide'; end if;
      declare vit numeric := least(1, greatest(0, (p_entrees ->> 'vitesse')::numeric)); hau numeric := least(1, greatest(0, (p_entrees ->> 'hauteur')::numeric)); elan numeric;
      begin
        elan := least(1, vit / .95) * least(1, hau / .95);
        if elan >= 1 or random() < elan * elan then res := 'but';
        elsif hau < .6 or random() < .5 then res := 'contre';
        else res := 'arret';
        end if;
        a := jsonb_build_object('x', case when random() < .5 then .2 else .8 end, 'y', case when random() < .5 then .3 else .75 end);
      end;
    end if;
  exception when invalid_text_representation then raise exception 'Essai invalide';
  end;
  reussi := res = succes;
  liste := liste || to_jsonb(res);
  if reussi then v_pieces := mini_gain(p_jeu); end if;
  if jsonb_array_length(liste) = mini_limite(p_jeu)
     and not exists (select 1 from jsonb_array_elements_text(liste) e where e <> succes) then v_bonus := parami('mini_bonus_parfait'); end if;
  update profils set minijeux = jsonb_set(m, array[p_jeu], liste), pieces = pieces + v_pieces + v_bonus where user_id = p.user_id;
  perform noter(p.user_id, 'mini-' || p_jeu, jsonb_build_object('entrees', p_entrees, 'resultat', res, 'pieces', v_pieces + v_bonus));
  return jsonb_build_object('resultat', res, 'reussi', reussi, 'reponse', a, 'pieces', v_pieces, 'bonus', v_bonus, 'essais', liste,
    'restants', mini_limite(p_jeu) - jsonb_array_length(liste), 'etat', etat_de(p.user_id));
end $$;

-- Séance d'entraînement d'équipe : de l'expérience pour les joueurs alignés, sans risque
create or replace function seance_equipe() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); progres jsonb; niveaux jsonb;
begin
  if p.equipe = '{}'::jsonb then raise exception 'Aligne d’abord des joueurs dans ton équipe'; end if;
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
  if p.equipe = '{}'::jsonb then raise exception 'Aligne d’abord des joueurs dans ton équipe'; end if;
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
-- paris faits cette semaine (du lundi au dimanche, heure de Paris) : 3 au plus (réglage paris_par_semaine)
create or replace function paris_semaine(p_uid uuid) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from paris where user_id = p_uid
    and (cree_le at time zone 'Europe/Paris')::date >= date_trunc('week', aujourdhui())::date
$$;
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
    'min', parami('pari_min'), 'max', parami('pari_max'),
    'parSemaine', parami('paris_par_semaine'), 'cetteSemaine', paris_semaine(p.user_id));
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
  if paris_semaine(p.user_id) >= parami('paris_par_semaine') then
    raise exception 'Déjà % paris cette semaine : de nouveaux lundi', parami('paris_par_semaine');
  end if;
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
    -- « Toutes » montre aussi mes propres annonces (demande de Maël) ; « Pour moi » seulement celles des autres
    select annonce_json(a) j from annonces a where a.statut = 'ouverte' and (p_filtre <> 'pour_moi' or a.vendeur <> p.user_id)
    order by a.cree_le desc limit 100) t
    where p_filtre <> 'pour_moi' or (j ->> 'possible')::boolean), '[]');
end $$;

create or replace function publier_annonce(p_ex uuid, p_carte text, p_palier text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profils := moi(); e exemplaires; id_annonce uuid;
begin
  perform expirer_annonces();
  select * into e from exemplaires where id = p_ex and proprietaire = p.user_id;
  if not found then raise exception 'Carte absente de ton club'; end if;
  if e.verrou is not null then raise exception 'Cette carte est déjà proposée aux transferts'; end if;
  if exists (select 1 from jsonb_each_text(p.equipe) j where j.value = p_ex::text) then
    raise exception 'Cette carte joue dans ton équipe : retire-la d’abord';
  end if;
  if p_palier not in ('bronze', 'argent', 'or', 'ultime') then raise exception 'Palier inconnu'; end if;
  if not exists (select 1 from cartes where id = p_carte) then raise exception 'Joueur inconnu'; end if;
  if p_carte = e.carte_id and p_palier = e.palier then raise exception 'Tu cherches la même carte que celle que tu proposes'; end if;
  -- demande de Maël : on n'échange au marché que des cartes de même valeur (même palier) ; entre ami(e)s, tout est permis
  if p_palier <> e.palier then raise exception 'Aux transferts, on échange seulement des cartes du même palier'; end if;
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
  if a.palier_cherche <> a.offre ->> 'palier' then raise exception 'Aux transferts, on échange seulement des cartes du même palier'; end if;
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
-- Social : classement des poules, ami(e)s, échanges entre ami(e)s
-- ════════════════════════════════════════════════════════════════════════════

-- Niveau de poule de chaque joueur inscrit (pseudo et niveau seulement), du plus haut au plus bas, et ma place
create or replace function classement_poules() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  return jsonb_build_object('joueurs', coalesce((select jsonb_agg(t order by t.niveau desc, t.pts desc, lower(t.pseudo)) from (
      select pr.pseudo, coalesce((pr.parcours ->> 'niveau')::int, 1) niveau,
        param('parcours') -> (coalesce((pr.parcours ->> 'niveau')::int, 1) - 1) ->> 'nom' nom,
        param('parcours') -> (coalesce((pr.parcours ->> 'niveau')::int, 1) - 1) ->> 'groupe' groupe,
        coalesce((select (x ->> 'pts')::int from jsonb_array_elements(pr.parcours -> 'equipes') x where (x ->> 'moi')::boolean), 0) pts,
        pr.user_id = p.user_id moi
      from profils pr order by 2 desc limit 500) t), '[]'));
end $$;

create or replace function ami_de(p_pseudo text) returns profils language plpgsql stable security definer set search_path = public as $$
declare a profils;
begin
  select * into a from profils where lower(pseudo) = lower(trim(coalesce(p_pseudo, '')));
  if not found then raise exception 'Joueur introuvable'; end if;
  return a;
end $$;
create or replace function sont_amis(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from amis where statut = 'accepte' and ((de = a and pour = b) or (de = b and pour = a)))
$$;
-- Ajouter un(e) ami(e) : envoie une demande (ou accepte la sienne si elle m'en a déjà envoyé une)
create or replace function ajouter_ami(p_pseudo text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a profils := ami_de(p_pseudo);
begin
  if a.user_id = p.user_id then raise exception 'C’est toi !'; end if;
  if sont_amis(p.user_id, a.user_id) then raise exception 'Vous êtes déjà ami(e)s'; end if;
  if exists (select 1 from amis where de = a.user_id and pour = p.user_id) then
    update amis set statut = 'accepte' where de = a.user_id and pour = p.user_id;
  else
    if (select count(*) from amis where p.user_id in (de, pour)) >= parami('amis_max') then raise exception 'Tu as déjà % ami(e)s ou demandes', parami('amis_max'); end if;
    insert into amis (de, pour) values (p.user_id, a.user_id) on conflict do nothing;
  end if;
  perform noter(p.user_id, 'ami', jsonb_build_object('pseudo', a.pseudo));
  return mes_amis();
end $$;
create or replace function repondre_ami(p_pseudo text, p_accepte boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a profils := ami_de(p_pseudo);
begin
  if not exists (select 1 from amis where de = a.user_id and pour = p.user_id and statut = 'attente') then raise exception 'Pas de demande de sa part'; end if;
  if p_accepte then update amis set statut = 'accepte' where de = a.user_id and pour = p.user_id;
  else delete from amis where de = a.user_id and pour = p.user_id; end if;
  return mes_amis();
end $$;
create or replace function retirer_ami(p_pseudo text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a profils := ami_de(p_pseudo);
begin
  delete from amis where (de = p.user_id and pour = a.user_id) or (de = a.user_id and pour = p.user_id);
  update echanges set statut = 'annule', fini_le = now() where statut = 'ouvert' and ((de = p.user_id and pour = a.user_id) or (de = a.user_id and pour = p.user_id));
  return mes_amis();
end $$;

-- Messages entre ami(e)s : la conversation (50 derniers), lue en l'ouvrant ; une pastille sur la bulle pour les non lus
create or replace function conversation(p_pseudo text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a profils := ami_de(p_pseudo);
begin
  if not sont_amis(p.user_id, a.user_id) then raise exception 'Vous n’êtes pas ami(e)s'; end if;
  update messages_amis set lu = true where de = a.user_id and pour = p.user_id and not lu;
  return jsonb_build_object('pseudo', a.pseudo, 'messages', coalesce((select jsonb_agg(jsonb_build_object('moi', t.de = p.user_id, 'texte', t.texte, 'le', t.cree_le) order by t.cree_le, t.id)
    from (select * from messages_amis m where (m.de = p.user_id and m.pour = a.user_id) or (m.de = a.user_id and m.pour = p.user_id) order by m.cree_le desc, m.id desc limit 50) t), '[]'),
    'etat', etat_de(p.user_id));
end $$;
create or replace function envoyer_message(p_pseudo text, p_texte text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a profils := ami_de(p_pseudo); t text := btrim(coalesce(p_texte, ''));
begin
  if not sont_amis(p.user_id, a.user_id) then raise exception 'Vous n’êtes pas ami(e)s'; end if;
  if t = '' then raise exception 'Message vide'; end if;
  if char_length(t) > parami('message_longueur') then raise exception 'Message trop long (% caractères au plus)', parami('message_longueur'); end if;
  if (select count(*) from messages_amis where de = p.user_id and cree_le >= debut_du_jour()) >= parami('messages_par_jour') then
    raise exception 'Tu as envoyé % messages aujourd’hui : reviens demain', parami('messages_par_jour');
  end if;
  insert into messages_amis (de, pour, texte) values (p.user_id, a.user_id, t);
  return conversation(p_pseudo);
end $$;

-- Défi entre ami(e)s : vos deux équipes (chacune avec sa tactique) ; le gagnant remporte 30 pièces ; 5 défis par jour
create or replace function defier_ami(p_pseudo text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a profils := ami_de(p_pseudo); fa jsonb; fb jsonb; r jsonb; res text; res_d text; gain int := parami('defi_ami_pieces');
  g_moi int := 0; g_lui int := 0;
begin
  if not sont_amis(p.user_id, a.user_id) then raise exception 'Vous n’êtes pas ami(e)s'; end if;
  if compter_jour(p.user_id, 'defi_ami') >= parami('defis_amis_par_jour') then
    raise exception 'Tu as lancé tes % défis entre ami(e)s du jour : reviens demain', parami('defis_amis_par_jour');
  end if;
  perform verifier_equipe(p.user_id, p.equipe);
  fa := force_equipe(p.equipe, p.tactique);
  begin fb := force_equipe(a.equipe, a.tactique);
  exception when others then raise exception '% n’a pas encore d’équipe complète', a.pseudo; end;
  r := simuler(fa, fb);
  res := r ->> 'resultat'; res_d := case res when 'gagne' then 'perdu' when 'perdu' then 'gagne' else 'nul' end;
  if res = 'gagne' then g_moi := gain; elsif res = 'perdu' then g_lui := gain; end if;
  update profils set pieces = pieces + g_moi where user_id = p.user_id;
  update profils set pieces = pieces + g_lui where user_id = a.user_id;
  insert into rencontres (user_id, type, adversaire, score, resultat, detail) values
    (p.user_id, 'defi_ami', a.pseudo, array[(r ->> 'a')::int, (r ->> 'b')::int], res, jsonb_build_object('pieces', g_moi)),
    (a.user_id, 'defense_ami', p.pseudo, array[(r ->> 'b')::int, (r ->> 'a')::int], res_d, jsonb_build_object('pieces', g_lui));
  -- les quêtes « défis » et « victoires » : les défis se font entre ami(e)s
  perform progresser(p.user_id, 'defi');
  if res = 'gagne' then perform progresser(p.user_id, 'victoire'); end if;
  perform noter(p.user_id, 'defi-ami', jsonb_build_object('contre', a.pseudo, 'resultat', res, 'pieces', g_moi));
  if g_lui > 0 then perform noter(a.user_id, 'defi-ami-gagne', jsonb_build_object('contre', p.pseudo, 'pieces', g_lui)); end if;
  return jsonb_build_object('match', r, 'adversaire', a.pseudo, 'note', fa -> 'note', 'noteAdversaire', fb -> 'note',
    'gains', jsonb_build_object('pieces', g_moi), 'etat', etat_de(p.user_id));
end $$;

-- Carte libre d'un joueur : à lui, pas au marché, pas dans son équipe
create or replace function carte_libre(p_uid uuid, p_ex uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from exemplaires e where e.id = p_ex and e.proprietaire = p_uid and e.verrou is null)
    and not exists (select 1 from profils pr, jsonb_each_text(pr.equipe) j where pr.user_id = p_uid and j.value = p_ex::text)
$$;
create or replace function expirer_echanges() returns void language sql security definer set search_path = public as $$
  update echanges set statut = 'annule', fini_le = now() where statut = 'ouvert' and cree_le < now() - make_interval(days => parami('echange_jours'))
$$;
create or replace function echange_json(x echanges, p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', x.id, 'de', (select pseudo from profils where user_id = x.de), 'pour', (select pseudo from profils where user_id = x.pour),
    'moi', x.de = p_uid, 'offre', x.offre, 'cherche', x.cherche, 'statut', x.statut, 'cree_le', x.cree_le, 'fini_le', x.fini_le)
$$;
-- Mes ami(e)s, les demandes, les échanges en cours, et combien de propositions il me reste aujourd'hui
create or replace function mes_amis() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  perform expirer_echanges();
  return jsonb_build_object(
    'amis', coalesce((select jsonb_agg(jsonb_build_object('pseudo', pr.pseudo, 'niveau', coalesce((pr.parcours ->> 'niveau')::int, 1),
        'nom', param('parcours') -> (coalesce((pr.parcours ->> 'niveau')::int, 1) - 1) ->> 'nom',
        'nonLus', (select count(*) from messages_amis m where m.de = pr.user_id and m.pour = p.user_id and not m.lu),
        'echange', exists (select 1 from echanges x where x.statut = 'ouvert' and ((x.de = p.user_id and x.pour = pr.user_id) or (x.de = pr.user_id and x.pour = p.user_id))),
        'equipe', (select count(*) from jsonb_object_keys(pr.equipe)) = 7) order by lower(pr.pseudo))
      from amis a join profils pr on pr.user_id = case when a.de = p.user_id then a.pour else a.de end
      where a.statut = 'accepte' and p.user_id in (a.de, a.pour)), '[]'),
    'recues', coalesce((select jsonb_agg(pr.pseudo order by a.cree_le) from amis a join profils pr on pr.user_id = a.de where a.pour = p.user_id and a.statut = 'attente'), '[]'),
    'envoyees', coalesce((select jsonb_agg(pr.pseudo order by a.cree_le) from amis a join profils pr on pr.user_id = a.pour where a.de = p.user_id and a.statut = 'attente'), '[]'),
    'echanges', coalesce((select jsonb_agg(echange_json(x, p.user_id) order by x.cree_le desc) from echanges x
      where p.user_id in (x.de, x.pour) and (x.statut = 'ouvert' or x.fini_le >= now() - interval '7 days')), '[]'),
    'restants', greatest(0, parami('echanges_amis_par_jour') - (select count(*) from echanges where de = p.user_id and cree_le >= debut_du_jour())),
    'limite', parami('echanges_amis_par_jour'),
    'defis', greatest(0, parami('defis_amis_par_jour') - compter_jour(p.user_id, 'defi_ami')), 'defisLimite', parami('defis_amis_par_jour'),
    'defiPieces', parami('defi_ami_pieces'));
end $$;
-- Les cartes qu'un(e) ami(e) peut échanger (hors équipe et marché)
create or replace function club_ami(p_pseudo text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a profils := ami_de(p_pseudo);
begin
  if not sont_amis(p.user_id, a.user_id) then raise exception 'Vous n’êtes pas ami(e)s'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'carte', e.carte_id, 'palier', e.palier, 'note', e.note) order by e.note desc)
    from exemplaires e where e.proprietaire = a.user_id and carte_libre(a.user_id, e.id)), '[]');
end $$;
-- Proposer un échange à un(e) ami(e) : ma carte contre la sienne, quels que soient les paliers ; 3 propositions par jour
create or replace function proposer_echange(p_pseudo text, p_donne uuid, p_demande uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a profils := ami_de(p_pseudo); e1 exemplaires; e2 exemplaires; id_x uuid;
begin
  if not sont_amis(p.user_id, a.user_id) then raise exception 'Vous n’êtes pas ami(e)s'; end if;
  if (select count(*) from echanges where de = p.user_id and cree_le >= debut_du_jour()) >= parami('echanges_amis_par_jour') then
    raise exception 'Tu as déjà proposé % échanges aujourd’hui : reviens demain', parami('echanges_amis_par_jour');
  end if;
  if not carte_libre(p.user_id, p_donne) then raise exception 'Ta carte doit être à toi, hors de ton équipe et des transferts'; end if;
  if not carte_libre(a.user_id, p_demande) then raise exception 'Cette carte n’est plus disponible'; end if;
  if exists (select 1 from echanges where statut = 'ouvert' and (donne = p_donne or demande = p_demande)) then raise exception 'Un échange est déjà proposé avec cette carte'; end if;
  -- une seule proposition à la fois entre deux ami(e)s (demande de Maël)
  if exists (select 1 from echanges where statut = 'ouvert' and ((de = p.user_id and pour = a.user_id) or (de = a.user_id and pour = p.user_id))) then
    raise exception 'Un échange est déjà en cours avec % : attends sa réponse', a.pseudo;
  end if;
  select * into e1 from exemplaires where id = p_donne; select * into e2 from exemplaires where id = p_demande;
  insert into echanges (de, pour, donne, demande, offre, cherche) values (p.user_id, a.user_id, p_donne, p_demande,
    jsonb_build_object('carte', e1.carte_id, 'palier', e1.palier, 'note', e1.note), jsonb_build_object('carte', e2.carte_id, 'palier', e2.palier, 'note', e2.note))
    returning id into id_x;
  perform noter(p.user_id, 'echange-propose', jsonb_build_object('echange', id_x, 'pour', a.pseudo));
  return mes_amis();
end $$;
create or replace function repondre_echange(p_id uuid, p_accepte boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); x echanges; v profils;
begin
  perform expirer_echanges();
  select * into x from echanges where id = p_id for update;
  if not found or x.statut <> 'ouvert' or x.pour <> p.user_id then raise exception 'Cet échange n’est plus ouvert'; end if;
  if not p_accepte then update echanges set statut = 'refuse', fini_le = now() where id = p_id; return mes_amis(); end if;
  select * into v from profils where user_id = x.de for update;
  if not sont_amis(p.user_id, x.de) then raise exception 'Vous n’êtes plus ami(e)s'; end if;
  if not carte_libre(x.de, x.donne) then raise exception 'Sa carte n’est plus disponible'; end if;
  if not carte_libre(p.user_id, x.demande) then raise exception 'Ta carte doit être hors de ton équipe et des transferts'; end if;
  update exemplaires set proprietaire = p.user_id where id = x.donne;
  update exemplaires set proprietaire = x.de where id = x.demande;
  update echanges set statut = 'accepte', fini_le = now() where id = p_id;
  update echanges set statut = 'annule', fini_le = now() where statut = 'ouvert' and id <> p_id and (donne in (x.donne, x.demande) or demande in (x.donne, x.demande));
  perform noter(p.user_id, 'echange', jsonb_build_object('echange', p_id, 'recu', x.donne, 'donne', x.demande));
  perform noter(x.de, 'echange', jsonb_build_object('echange', p_id, 'recu', x.demande, 'donne', x.donne));
  return mes_amis() || jsonb_build_object('etat', etat_de(p.user_id));
end $$;
create or replace function annuler_echange(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  update echanges set statut = 'annule', fini_le = now() where id = p_id and de = p.user_id and statut = 'ouvert';
  if not found then raise exception 'Cet échange n’est plus ouvert'; end if;
  return mes_amis();
end $$;

-- Les écarts de chaque joueur : somme nulle (même total que les autres à note égale), et sur tout le catalogue chaque
-- stat a une moyenne nulle (champ et gardiens à part) : aucune stat n'est en moyenne plus forte que les autres.
-- Relancer ne change rien (les écarts déjà normalisés restent les mêmes).
create or replace function normaliser_ecarts() returns void language plpgsql security definer set search_path = public as $$
declare fam text; ks text[]; k text; moy jsonb;
begin
  for fam in select unnest(array['champ', 'gb']) loop
    ks := case fam when 'gb' then array['ref', 'pla', 'rel', 'men', 'phy', 'vit'] else array['tir', 'pas', 'def', 'men', 'phy', 'vit'] end;
    -- 1. chaque joueur : écarts centrés (somme nulle)
    update cartes c set ecarts = (select jsonb_object_agg(k2, round(coalesce((c.ecarts ->> k2)::numeric, 0)
        - (select avg(coalesce((c.ecarts ->> k3)::numeric, 0)) from unnest(ks) k3))) from unnest(ks) k2)
      where coalesce(c.poste = 'GB', false) = (fam = 'gb');
    -- 2. moyenne de chaque stat sur le catalogue, retirée à tous
    select jsonb_object_agg(k2, (select avg((c.ecarts ->> k2)::numeric) from cartes c where c.actif and coalesce(c.poste = 'GB', false) = (fam = 'gb'))) into moy from unnest(ks) k2;
    if moy is null then continue; end if;
    update cartes c set ecarts = (select jsonb_object_agg(k2, round((c.ecarts ->> k2)::numeric - coalesce((moy ->> k2)::numeric, 0))) from unnest(ks) k2)
      where coalesce(c.poste = 'GB', false) = (fam = 'gb');
  end loop;
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
  insert into cartes (id, nom, equipe, poste, postes, stats, ecarts, photos, photo, site, reglages, actif, maj)
    select x ->> 'id', x ->> 'nom', x ->> 'equipe', x ->> 'poste',
      coalesce((select array_agg(v) from jsonb_array_elements_text(x -> 'postes') v), case when x ->> 'poste' is null then '{}' else array[x ->> 'poste'] end),
      x -> 'stats', coalesce(x -> 'ecarts', '{}'),
      coalesce(x -> 'photos', '{}'), x ->> 'photo', x -> 'site', nullif(x -> 'reglages', 'null'::jsonb), true, now()
    from jsonb_array_elements(p_cartes) x
    on conflict (id) do update set nom = excluded.nom, equipe = excluded.equipe, poste = excluded.poste, postes = excluded.postes, stats = excluded.stats,
      ecarts = excluded.ecarts, photos = excluded.photos, photo = excluded.photo, site = excluded.site,
      reglages = excluded.reglages, actif = true, maj = now();
  if p_complet then
    update cartes set actif = false, maj = now()
      where actif and id not in (select x ->> 'id' from jsonb_array_elements(p_cartes) x);
    get diagnostics n = row_count;
  end if;
  perform normaliser_ecarts();
  perform noter(auth.uid(), 'admin-cartes', jsonb_build_object('cartes', jsonb_array_length(p_cartes), 'retirees', n));
  return jsonb_build_object('cartes', jsonb_array_length(p_cartes), 'retirees', n);
end $$;

-- Vrais matchs (data/matchs.json) : ajout ou mise à jour, puis règlement des paris dont le résultat est connu
create or replace function maj_matchs(p_matchs jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; regles int;
begin
  if jsonb_typeof(p_matchs) <> 'array' then raise exception 'Liste de matchs invalide'; end if;
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
  return jsonb_build_object('matchs', n, 'parisRegles', regles);
end $$;
create or replace function admin_publier_matchs(p_matchs jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not est_admin() then raise exception 'Réservé à l’administrateur'; end if;
  r := maj_matchs(p_matchs);
  perform noter(auth.uid(), 'admin-matchs', jsonb_build_object('matchs', r -> 'matchs', 'paris_regles', r -> 'parisRegles'));
  return r;
end $$;

-- Paiement automatique des paris (demande de Maël : « le lundi matin, les paris gagnants payés tout seuls ») :
-- l'action GitHub « resultats » lit les scores sur ffhandball.fr (lundi et jeudi, très tôt) et met à jour data/matchs.json
-- dans le dépôt ; le serveur relit ce fichier (pg_net) puis met à jour les matchs et règle les paris (pg_cron, en bas du fichier).
-- Le fichier n'est modifiable que par le dépôt : personne ne peut envoyer de faux scores. Fonctions internes (pas accordées au jeu).
create table if not exists synchro_matchs (
  id bigserial primary key, demande bigint, demande_le timestamptz not null default now(),
  lu_le timestamptz, resultat jsonb
);
revoke all on synchro_matchs from anon, authenticated;
create or replace function synchro_matchs_demander() returns bigint language plpgsql security definer set search_path = public as $$
declare d bigint;
begin
  d := net.http_get(url := param('synchro_matchs_url') #>> '{}', timeout_milliseconds := 20000);
  insert into synchro_matchs (demande) values (d);
  return d;
end $$;
-- lit la dernière réponse arrivée (quelques minutes après la demande) ; sans réponse valable, rien ne change
create or replace function synchro_matchs_lire() returns jsonb language plpgsql security definer set search_path = public as $$
declare s synchro_matchs; rep record; r jsonb;
begin
  select * into s from synchro_matchs where lu_le is null order by id desc limit 1;
  if not found then return null; end if;
  select status_code, content into rep from net._http_response where id = s.demande;
  if not found then return null; end if;   -- pas encore arrivée : on réessaiera au passage suivant
  begin
    if rep.status_code <> 200 then raise exception 'réponse %', rep.status_code; end if;
    r := maj_matchs(rep.content::jsonb -> 'matchs');
  exception when others then r := jsonb_build_object('erreur', sqlerrm);
  end;
  update synchro_matchs set lu_le = now(), resultat = r where id = s.id;
  perform noter(null, 'synchro-matchs', r);
  return r;
end $$;

-- Vraies équipes du parcours (data/adversaires.json : {"niveaux": {"1": [noms…], …}}) : remplace toute la liste.
-- Les poules déjà commencées gardent leurs équipes ; les nouvelles saisons prennent la nouvelle liste.
create or replace function admin_publier_adversaires(p_niveaux jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not est_admin() then raise exception 'Réservé à l’administrateur'; end if;
  if jsonb_typeof(p_niveaux) <> 'object' then raise exception 'Liste invalide'; end if;
  delete from equipes_reelles where true;
  insert into equipes_reelles (niveau, nom)
    select k::int, left(trim(v), 60) from jsonb_each(p_niveaux) e(k, l), jsonb_array_elements_text(l) v
    where k ~ '^[0-9]{1,2}$' and trim(v) <> '' on conflict do nothing;
  get diagnostics n = row_count;
  perform noter(auth.uid(), 'admin-adversaires', jsonb_build_object('equipes', n));
  return jsonb_build_object('equipes', n);
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
  matchs_paris(), parier(text, text, int), tirer_7m(numeric, numeric, numeric), mini_preparer(text), mini_jouer(text, jsonb),
  marche(text), publier_annonce(uuid, text, text), retirer_annonce(uuid), accepter_annonce(uuid),
  choisir_tactique(text), classement_poules(), ajouter_ami(text), repondre_ami(text, boolean), retirer_ami(text), mes_amis(), club_ami(text),
  proposer_echange(text, uuid, uuid), repondre_echange(uuid, boolean), annuler_echange(uuid), conversation(text), envoyer_message(text, text), defier_ami(text), admin_publier_matchs(jsonb), admin_publier_adversaires(jsonb),
  admin_publier_cartes(jsonb, boolean), est_admin()
to authenticated;

-- Écarts des cartes déjà publiées : remis à la nouvelle règle (sans effet s'ils le sont déjà)
select normaliser_ecarts();

-- Paiement des paris le lundi matin : demande du fichier des matchs à 5 h et 7 h (UTC : 6 h et 8 h l'hiver à Paris,
-- 7 h et 9 h l'été), lecture 5 minutes après, et toutes les 10 minutes du lundi matin si une demande attend encore.
-- Le jeudi aussi, pour suivre les matchs déplacés. Seulement sur Supabase (pg_cron et pg_net) : ignoré ailleurs.
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
    perform cron.schedule('mhc-matchs-demande', '0 5,7 * * 1,4', 'select public.synchro_matchs_demander()');
    perform cron.schedule('mhc-matchs-lecture', '5-55/10 5-8 * * 1,4', 'select public.synchro_matchs_lire()');
  end if;
end $cron$;
-- Annonces ouvertes entre paliers différents (avant la règle du même palier) : retirées, la carte est rendue
with x as (update annonces set statut = 'retiree' where statut = 'ouverte' and palier_cherche <> offre ->> 'palier' returning exemplaire)
update exemplaires set verrou = null where id in (select exemplaire from x);
