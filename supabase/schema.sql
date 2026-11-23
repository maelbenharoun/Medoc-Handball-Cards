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
  "fusion_report": 0.5,
  "fusion_cout": {"bronze": 200, "argent": 600, "or": 2000},
  "entrainement_cout": {"bronze": 40, "argent": 80, "or": 150, "ultime": 300},
  "entrainement_xp": 50,
  "xp_par_point": {"bronze": 100, "argent": 150, "or": 200, "ultime": 300},
  "vente": {"bronze": 10, "argent": 40, "or": 150, "ultime": 600},
  "niveau_xp_base": 100, "niveau_xp_pas": 40,
  "niveau_pieces": 100, "niveau_pieces_max": 2000, "niveau_or_tous": 5,
  "xp_fusion": 20, "xp_entrainement": 5,
  "tactique_bonus": 4, "match_base": 27, "match_coef": 0.2, "match_regularite": 0.04, "match_contre": 0.10, "exclusion_defense": 1.5, "exclusion_attaque": 0.8, "match_ordi_reaction": 0.4, "match_simule_gain": 0.95, "match_simule_lecture": 0.35, "match_banc_poids": 0.5, "fatigue_rythme": {"prudent": 0.0225, "normal": 0.03, "pression": 0.04}, "fatigue_repos": 0.04, "fatigue_mi_temps": 0.6, "fatigue_temps_mort": 0.06, "fatigue_malus": 80, "fatigue_seuil": 0.3, "fatigue_endurance": 0.4, "fatigue_gardien": 0.33, "fatigue_ordi": 4, "fatigue_endurance_ecart": 0.2, "blessure_minute": 0.0002, "blessure_fatigue": 0.1, "blessure_fatigue_seuil": 0.35, "blessure_chance": 0.003, "blessure_malus": 15, "blessures_max": 1, "blessure_gravites": [{"nom": "légère", "p": 0.55, "min": 0, "max": 0}, {"nom": "moyenne", "p": 0.3, "min": 1, "max": 1}, {"nom": "sérieuse", "p": 0.12, "min": 2, "max": 3}, {"nom": "grave", "p": 0.03, "min": 4, "max": 6}], "championnat_gain": 0.5,
  "pve_par_jour": 10, "match_minutes": 60, "match_stock_max": 10, "seances_par_jour": 5, "defis_par_jour": 5, "defis_meme_adversaire": 2,
  "seance_xp_carte": 40, "seance_xp": 10,
  "pve_xp": {"gagne": 30, "nul": 15, "perdu": 5},
  "pve_xp_carte": {"gagne": 30, "nul": 20, "perdu": 10},
  "pve_pieces": {"gagne": 60, "nul": 30, "perdu": 10},
  "championnat_victoire": {"12": 170, "13": 200},
  "pvp_xp": {"gagne": 40, "nul": 20, "perdu": 10},
  "pvp_pieces": {"gagne": 80, "nul": 40, "perdu": 20},
  "pvp_trophees": {"gagne": 20, "nul": 5, "perdu": -10},
  "pvp_defense_trophees": {"gagne": 5, "nul": 0, "perdu": -5},
  "pari_min": 10, "pari_max": 300, "pari_marge": 0.92, "cote_min": 1.05, "cote_max": 12, "paris_jours": 14, "xp_pari": 10, "paris_par_semaine": 3,
  "annonces_max": 5, "annonce_jours": 7, "transfert_liste_max": 7,
  "booster_poste_prix": 300, "seance_payante_prix": 150,
  "parcours": [
    {"nom": "Promotion", "groupe": "Départemental", "type": "poule", "base": 50},
    {"nom": "Honneur", "groupe": "Départemental", "type": "poule", "base": 53},
    {"nom": "Excellence", "groupe": "Départemental", "type": "poule", "base": 56},
    {"nom": "Honneur", "groupe": "Régional", "type": "poule", "base": 62},
    {"nom": "Excellence", "groupe": "Régional", "type": "poule", "base": 67},
    {"nom": "Pré-nationale", "groupe": "Régional", "type": "poule", "base": 72},
    {"nom": "Nationale 3", "groupe": "National", "type": "poule", "base": 77},
    {"nom": "Nationale 2", "groupe": "National", "type": "poule", "base": 82},
    {"nom": "Nationale 1", "groupe": "National", "type": "poule", "base": 87},
    {"nom": "Championnat d’Europe", "groupe": "International", "type": "tournoi", "base": 90,
     "equipes": ["Danemark", "Norvège", "Suède", "Espagne", "Allemagne", "Hongrie", "Pays-Bas", "Croatie", "Islande", "Portugal",
                 "Slovénie", "Monténégro", "Serbie", "Pologne", "Autriche", "Suisse"]},
    {"nom": "Championnat du monde", "groupe": "International", "type": "tournoi", "base": 93,
     "equipes": ["Danemark", "Norvège", "Suède", "Espagne", "Allemagne", "Hongrie", "Pays-Bas", "Croatie", "Égypte", "Brésil",
                 "Japon", "Corée du Sud", "Argentine", "Tunisie", "Qatar", "Portugal"]},
    {"nom": "Jeux olympiques", "groupe": "International", "type": "tournoi", "base": 96,
     "equipes": ["Danemark", "Norvège", "Suède", "Espagne", "Allemagne", "Hongrie", "Pays-Bas", "Croatie", "Égypte", "Slovénie",
                 "Monténégro", "Brésil"]},
    {"nom": "Légendes du handball", "groupe": "Légendes", "type": "legendes", "base": 99}],
  "legendes": [{"n": "Amandine Leynaud", "p": 1}, {"n": "Uwe Gensheimer", "p": 15}, {"n": "Mikkel Hansen", "p": 18},
               {"n": "Stine Oftedal", "p": 13}, {"n": "Kiril Lazarov", "p": 17}, {"n": "Luc Abalo", "p": 14}, {"n": "Pauletta Foppa", "p": 13}],
  "legendes_equipes": [{"nom": "Les Bleues championnes du monde", "f": 99, "joueurs": [{"n": "Cléopâtre Darleux", "p": 1, "poste": "GB"}, {"n": "Manon Houette", "p": 14, "poste": "AG"}, {"n": "Allison Pineau", "p": 16, "poste": "ARG"}, {"n": "Grace Zaadi", "p": 15, "poste": "DC"}, {"n": "Alexandra Lacrabère", "p": 16, "poste": "ARD"}, {"n": "Pauline Coatanea", "p": 13, "poste": "AD"}, {"n": "Béatrice Edwige", "p": 13, "poste": "PIV"}]}, {"nom": "Allemagne", "f": 100, "joueurs": [{"n": "Andreas Wolff", "p": 1, "poste": "GB"}, {"n": "Dominik Klein", "p": 14, "poste": "AG"}, {"n": "Pascal Hens", "p": 16, "poste": "ARG"}, {"n": "Daniel Stephan", "p": 15, "poste": "DC"}, {"n": "Kai Häfner", "p": 16, "poste": "ARD"}, {"n": "Patrick Groetzki", "p": 13, "poste": "AD"}, {"n": "Christian Schwarzer", "p": 13, "poste": "PIV"}]}, {"nom": "Croatie", "f": 101, "joueurs": [{"n": "Vlado Šola", "p": 1, "poste": "GB"}, {"n": "Manuel Štrlek", "p": 14, "poste": "AG"}, {"n": "Domagoj Duvnjak", "p": 16, "poste": "ARG"}, {"n": "Ivano Balić", "p": 15, "poste": "DC"}, {"n": "Petar Metličić", "p": 16, "poste": "ARD"}, {"n": "Ivan Čupić", "p": 13, "poste": "AD"}, {"n": "Igor Vori", "p": 13, "poste": "PIV"}]}, {"nom": "Les reines d’Europe", "f": 102, "joueurs": [{"n": "Sandra Toft", "p": 1, "poste": "GB"}, {"n": "Camilla Herrem", "p": 14, "poste": "AG"}, {"n": "Cristina Neagu", "p": 16, "poste": "ARG"}, {"n": "Andrea Lekić", "p": 15, "poste": "DC"}, {"n": "Katarina Bulatović", "p": 16, "poste": "ARD"}, {"n": "Jovanka Radičević", "p": 13, "poste": "AD"}, {"n": "Heidi Løke", "p": 13, "poste": "PIV"}]}, {"nom": "Norvège", "f": 103, "joueurs": [{"n": "Katrine Lunde", "p": 1, "poste": "GB"}, {"n": "Magnus Jøndal", "p": 14, "poste": "AG"}, {"n": "Henny Reistad", "p": 16, "poste": "ARG"}, {"n": "Sander Sagosen", "p": 15, "poste": "DC"}, {"n": "Nora Mørk", "p": 16, "poste": "ARD"}, {"n": "Kristian Bjørnsen", "p": 13, "poste": "AD"}, {"n": "Bjarte Myrhol", "p": 13, "poste": "PIV"}]}, {"nom": "Danemark", "f": 104, "joueurs": [{"n": "Niklas Landin", "p": 1, "poste": "GB"}, {"n": "Magnus Landin", "p": 14, "poste": "AG"}, {"n": "Mads Mensah Larsen", "p": 16, "poste": "ARG"}, {"n": "Rasmus Lauge", "p": 15, "poste": "DC"}, {"n": "Mathias Gidsel", "p": 16, "poste": "ARD"}, {"n": "Hans Lindberg", "p": 13, "poste": "AD"}, {"n": "Henrik Toft Hansen", "p": 13, "poste": "PIV"}]}, {"nom": "Les Experts", "f": 105, "joueurs": [{"n": "Thierry Omeyer", "p": 1, "poste": "GB"}, {"n": "Michaël Guigou", "p": 14, "poste": "AG"}, {"n": "Jérôme Fernandez", "p": 16, "poste": "ARG"}, {"n": "Daniel Narcisse", "p": 15, "poste": "DC"}, {"n": "Xavier Barachet", "p": 16, "poste": "ARD"}, {"n": "Guillaume Joli", "p": 13, "poste": "AD"}, {"n": "Bertrand Gille", "p": 13, "poste": "PIV"}]}, {"nom": "Les grands clubs", "f": 106, "joueurs": [{"n": "Arpad Sterbik", "p": 1, "poste": "GB"}, {"n": "Aitor Ariño", "p": 14, "poste": "AG"}, {"n": "Aron Pálmarsson", "p": 16, "poste": "ARG"}, {"n": "Nikola Karabatic", "p": 15, "poste": "DC"}, {"n": "Ólafur Stefánsson", "p": 16, "poste": "ARD"}, {"n": "Víctor Tomás", "p": 13, "poste": "AD"}, {"n": "Julen Aguinagalde", "p": 13, "poste": "PIV"}]}, {"nom": "Les géants", "f": 107, "joueurs": [{"n": "Kari Aalvik Grimsbø", "p": 1, "poste": "GB"}, {"n": "Guðjón Valur Sigurðsson", "p": 14, "poste": "AG"}, {"n": "Anja Andersen", "p": 16, "poste": "ARG"}, {"n": "Jackson Richardson", "p": 15, "poste": "DC"}, {"n": "Dika Mem", "p": 16, "poste": "ARD"}, {"n": "Linn Jørum Sulland", "p": 13, "poste": "AD"}, {"n": "Ludovic Fabregas", "p": 13, "poste": "PIV"}]}, {"nom": "Le 7 de rêve", "f": 108, "joueurs": [{"n": "Amandine Leynaud", "p": 1, "poste": "GB"}, {"n": "Uwe Gensheimer", "p": 14, "poste": "AG"}, {"n": "Mikkel Hansen", "p": 16, "poste": "ARG"}, {"n": "Stine Oftedal", "p": 15, "poste": "DC"}, {"n": "Kiril Lazarov", "p": 16, "poste": "ARD"}, {"n": "Luc Abalo", "p": 13, "poste": "AD"}, {"n": "Pauletta Foppa", "p": 13, "poste": "PIV"}]}],
  "parcours_legendes_rejouer_pieces": 2500,
  "poule_equipes": 8, "poule_equipes_depart": 4, "poule_equipes_pas": 1, "poule_petite": 5, "poule_descente_petite": 1, "poule_tours": 2, "poule_ecart": 4, "poule_montee": 2, "poule_descente": 2,
  "tournoi_ecart": 2, "legendes_manches": 5, "tournoi_poule_equipes": 6, "tournoi_poule_tours": 1, "tournoi_poule_qualifies": 2,
  "points_match": {"gagne": 3, "nul": 2, "perdu": 1},
  "parcours_saison_pieces": 300, "parcours_tournoi_pieces": 1500, "parcours_legendes_pieces": 5000, "parcours_legendes_bonus_or": 2,
  "synchro_matchs_url": "https://raw.githubusercontent.com/maelbenharoun/Medoc-Handball-Cards/main/data/matchs.json", "jet7m_tirs_par_jour": 5, "jet7m_pieces_but": 50, "jet7m_bonus_parfait": 100,
  "mini_essais_par_jour": 5, "mini_pieces": 50, "mini_bonus_parfait": 100,
  "mini_gardien_tirs_par_jour": 25, "mini_gardien_pieces": 10,
  "tactique_bonus_base": 0.02, "tactique_bonus_max": 0.10, "tactique_pente": 0.4,
  "amis_max": 50, "echanges_amis_par_jour": 3, "echange_jours": 7,
  "messages_par_jour": 100, "message_longueur": 300, "defis_amis_par_jour": 5, "defi_ami_pieces": 30,
  "synchro_semaine_url": "https://raw.githubusercontent.com/maelbenharoun/Medoc-Handball-Cards/main/data/semaine.json",
  "semaine_forme": 3, "booster_semaine_prix": 400, "booster_semaine_par_jour": 3,
  "booster_semaine_chances": {"bronze": 45, "argent": 35, "or": 17, "ultime": 3},
  "passe_debut": "2026-11-02", "passe_semaines": 4, "passe_paliers": 30, "passe_xp_palier": 400,
  "compo_par_semaine": 3,
  "booster_equipe_prix": 500, "booster_hasard_prix": 300, "staff_chance": 0.1, "booster_lot": 10, "choix_coach_prix": 400, "choix_coach_par_jour": 3,
  "legende_chance": 0.002, "legende_chance_mystere": 0.002, "legende_note": 100,
  "prono_pieces_point": 20, "prono_points": {"exact": 5, "issue": 2, "ecart": 1, "buteur": 3},
  "ligue_matchs_jour": 5, "ligue_taille": 10, "ligue_divisions": 8, "ligue_montee": 3, "ligue_descente": 3, "ligue_meme_adversaire": 2,
  "ligue_pieces": {"gagne": 40, "nul": 20, "perdu": 10},
  "ligue_recompenses": {"1": {"or": 1, "pieces": 1000}, "2": {"bonus": 2, "pieces": 700}, "3": {"bonus": 1, "pieces": 500}, "autres": {"pieces": 200}},
  "club_membres_max": 20, "club_paliers": [25, 50, 100], "club_recompenses": [{"bonus": 1}, {"bonus": 2}, {"or": 1}],
  "albums_recompenses": {"bronze": {"pieces": 300}, "argent": {"bonus": 2}, "or": {"or": 1}, "ultime": {"or": 2, "pieces": 2000}},
  "capitaine_bonus": 2, "staff_prix": 500,
  "marche_prix": {"bronze": [50, 300], "argent": [200, 1000], "or": [750, 4000], "ultime": [3000, 15000]}, "marche_taxe": 0.1,
  "marche_ventes_max": 5, "marche_jours": 3, "marche_achats_par_jour": 5,
  "boite_par_jour": 5, "boite_nouveau": true, "boite_attente_minutes": 60,
  "club_demande_heures": 8, "club_demande_duree_heures": 24, "club_demande_nombre": {"bronze": 4, "argent": 2, "or": 1}, "club_demande_or_jours": 7,
  "pvp_arenes": [{"nom": "Départemental", "min": 0}, {"nom": "Régional", "min": 300, "recompense": {"pieces": 500, "bonus": 1}},
    {"nom": "National", "min": 700, "recompense": {"pieces": 1000, "bonus": 2}}, {"nom": "Championnat d’Europe", "min": 1200, "recompense": {"pieces": 2000, "or": 1}},
    {"nom": "Championnat du monde", "min": 1800, "recompense": {"pieces": 3000, "or": 1}}, {"nom": "Jeux olympiques", "min": 2500, "recompense": {"pieces": 5000, "or": 2}},
    {"nom": "Légendes", "min": 3300, "recompense": {"pieces": 8000, "or": 3}}],
  "pvp_trophees_base": 30, "pvp_trophees_ecart": 20, "pvp_trophees_min": 10, "pvp_trophees_max": 50,
  "classe_pieces": {"gagne": 60, "nul": 25, "perdu": 10}, "pvp_gains_par_jour": 10, "pvp_ami_pieces": 30,
  "pvp_fantome_secondes": 120, "pvp_accepter_secondes": 15, "pvp_prepa_secondes": 60, "pvp_pause_secondes": 20, "pvp_envoi_secondes": 15, "pvp_mi_temps_secondes": 30, "pvp_tranche_secondes": 12,
  "pvp_marge_secondes": 3, "pvp_absent_secondes": 30, "pvp_invitation_secondes": 120,
  "pvp_saison_seuil": 1000, "pvp_saison_recompenses": [{"pieces": 200}, {"pieces": 400, "bonus": 1}, {"pieces": 800, "bonus": 2}, {"pieces": 1200, "or": 1},
    {"pieces": 2000, "or": 1}, {"pieces": 3000, "or": 2}, {"pieces": 5000, "or": 3}],
  "momentum_valeurs": {"but": 20, "but_dessus": 28, "7m-but": 14, "arret": 12, "7m-arret": 20, "perte": 10, "rate": 5, "excl": 10},
  "momentum_max": 100, "momentum_effet": 0.10,
  "sept_chance": 0.34, "sept_max_mi_temps": 1, "sept_tir_secondes": 12, "sept_gardien_secondes": 8,
  "en_ligne_minutes": 2, "salon_longueur": 300, "salon_intervalle_secondes": 3, "salon_par_jour": 200, "salon_jours": 7,
  "momentum_ia": {"hasard": 0.3, "lent": 0.5, "reflechi": 0.75, "rapide": 0.9, "legende": 1},
  "club_dons_par_jour": 10, "club_don_pieces": {"bronze": 20, "argent": 60, "or": 250}, "club_don_xp": {"bronze": 5, "argent": 15, "or": 50}
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
-- ce total entre ses stats, en proportion (demande de Maël) : l'écart est donné pour une moyenne de 40 et grandit avec elle,
-- stat = moyenne × (1 + écart / 40). Même calcul dans cartes.js (moyenneExacte, statsAuNiveau).
create or replace function stat_note(p_note numeric, p_ecart numeric) returns int language sql immutable as $$
  select greatest(1, least(99, round((40 + (p_note - 50) * 40 / 49.0) * (1 + coalesce(p_ecart, 0) / 40.0))))::int
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
-- 1 ou 2 équipes par joueur (demande de Maël, 21 nov. 2026), la première = la principale (aussi dans equipe) ; vide = seulement equipe.
-- Une légende fait partie de toutes les équipes (elle compte dans le collectif de n'importe quelle équipe, force_equipe)
alter table cartes add column if not exists equipes text[] not null default '{}';
-- les équipes d'une carte (hors légende, qui est de toutes) : equipes si renseigné, sinon equipe
create or replace function equipes_de(p_equipe text, p_equipes text[]) returns text[] language sql immutable as $$
  select case when cardinality(coalesce(p_equipes, '{}')) > 0 then p_equipes else array[p_equipe] end
$$;
-- genre d'une équipe d'après son code (SG1, -18G, -15G : garçons ; SF1, -18F1, -15F : filles ; autre : aucun) ; une légende ne
-- compte que pour les équipes de son genre (demande de Maël, 21 nov. 2026 : Dono avec les garçons, Annette avec les filles),
-- son genre = site.genre de sa carte (« M » / « F » ; autre = toutes les équipes). Même règle que genreEquipe dans cartes.js
create or replace function equipe_genre(p_equipe text) returns text language sql immutable as $$
  select case when p_equipe ~ 'G' then 'M' when p_equipe ~ 'F' then 'F' end
$$;
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
-- Légendes du club (demande de Maël) : cartes créées dans l'outil, en une seule édition (Ultime, cadre à part). Elles restent
-- « inactives » pour tous les autres tirages (boosters, équipe, coach, semaine, défis) : seul le booster gratuit les tire,
-- 1 fois sur 500 (legende_chance). Le jeu ne les voit que si on en a une (etat_de → legendes) ; l'admin les voit toutes.
alter table cartes add column if not exists legende boolean not null default false;

-- Un compte joueur (l'e-mail reste dans auth.users, géré par Supabase).
create table if not exists profils (
  user_id uuid primary key references auth.users on delete cascade,
  pseudo text not null check (pseudo ~ '^[A-Za-z0-9À-ÖØ-öø-ÿ_.-]{3,20}$'),
  pieces int not null check (pieces >= 0),
  equipe jsonb not null default '{}',        -- l'équipe (ex « Mon 7 ») : {poste: id de l'exemplaire}
  role text not null default 'joueur' check (role in ('joueur', 'admin')),
  accord_le timestamptz not null default now(),  -- « j'ai 15 ans ou plus, ou l'accord de mes parents »
  cree_le timestamptz not null default now()
);
alter table profils add column if not exists niveau int not null default 1;
alter table profils add column if not exists xp int not null default 0;
alter table profils add column if not exists depart boolean not null default false;   -- booster de départ ouvert
alter table profils add column if not exists boosters int not null default 1;         -- boosters gratuits en stock
alter table profils add column if not exists boosters_maj timestamptz not null default now();
-- matchs de championnat en réserve (1 de plus toutes les 2 h, 10 au plus) ; les comptes existants commencent pleins
alter table profils add column if not exists matchs int not null default 10;
alter table profils add column if not exists matchs_maj timestamptz not null default now();
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
-- une légende a 100 de note générale (demande de Maël) ; les autres cartes plafonnent à 99 (palier_max)
alter table exemplaires drop constraint if exists exemplaires_note_check;
alter table exemplaires add constraint exemplaires_note_check check (note between 50 and 100);

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
-- le match en direct en cours de chaque joueur (voir « Match en direct » plus bas)
create table if not exists matchs_direct (
  user_id uuid primary key references profils on delete cascade,
  etat jsonb not null, cree_le timestamptz not null default now(), maj timestamptz not null default now()
);
revoke all on matchs_direct from anon, authenticated;

-- Matchs à deux en direct (23 nov. 2026, demande de Maël : « les défis sont nazes » : en temps réel, temps morts de 20 secondes,
-- classement avec des trophées façon Clash Royale). Le serveur joue le match comme en championnat (tranches de 5 minutes), les deux
-- joueurs choisissent en même temps. File d'attente (pvp_file) façon LoL, fantôme après 2 minutes ; invitations entre ami(e)s.
-- Rien n'est lisible par le jeu : tout passe par les fonctions pvp_*.
create table if not exists pvp_file (user_id uuid primary key references profils on delete cascade, trophees int not null default 0,
  entree timestamptz not null default now(), vu timestamptz not null default now());
create table if not exists pvp_matchs (
  id uuid primary key default gen_random_uuid(),
  a uuid references profils on delete set null, b uuid references profils on delete set null,
  classe boolean not null default true,
  etat jsonb not null, meta jsonb not null default '{}',
  statut text not null default 'direct' check (statut in ('propose', 'prepa', 'direct', 'fini', 'annule')),
  attente int, resultat jsonb,
  cree_le timestamptz not null default now(), maj timestamptz not null default now()
);
-- En ligne et salon (demande de Maël, 23 nov. 2026) : une pastille verte pour qui a joué dans les 2 dernières minutes (sauf s'il a
-- choisi d'apparaître hors ligne) ; un salon de discussion ouvert à tous les joueurs, messages gardés 7 jours, modéré par l'admin
alter table profils add column if not exists vu_le timestamptz;
alter table profils add column if not exists invisible boolean not null default false;
alter table profils add column if not exists salon_muet timestamptz;
create table if not exists salon_messages (
  id bigserial primary key,
  user_id uuid not null references profils on delete cascade,
  texte text not null,
  supprime boolean not null default false,
  le timestamptz not null default now()
);
create index if not exists salon_messages_le on salon_messages (le);
alter table salon_messages enable row level security;
revoke all on salon_messages from anon, authenticated;
-- 23 nov. 2026 : « Match trouvé » à accepter (propose), présentation des équipes (prepa), match refusé (annule)
alter table pvp_matchs drop constraint if exists pvp_matchs_statut_check;
alter table pvp_matchs add constraint pvp_matchs_statut_check check (statut in ('propose', 'prepa', 'direct', 'fini', 'annule'));
create index if not exists pvp_matchs_a on pvp_matchs (a, statut);
create index if not exists pvp_matchs_b on pvp_matchs (b, statut);
create table if not exists pvp_invitations (id uuid primary key default gen_random_uuid(),
  de uuid not null references profils on delete cascade, pour uuid not null references profils on delete cascade,
  statut text not null default 'attente' check (statut in ('attente', 'acceptee', 'refusee', 'annulee', 'expiree')),
  match uuid, cree_le timestamptz not null default now());
create index if not exists pvp_invitations_pour on pvp_invitations (pour, statut);
create table if not exists pvp_arenes_faites (user_id uuid not null references profils on delete cascade, arene int not null,
  le timestamptz not null default now(), primary key (user_id, arene));
alter table profils add column if not exists trophees_max int not null default 0;
alter table profils add column if not exists pvp_saison date;
alter table profils add column if not exists pvp_matchs_saison int not null default 0;
alter table pvp_file enable row level security;
alter table pvp_matchs enable row level security;
alter table pvp_invitations enable row level security;
alter table pvp_arenes_faites enable row level security;
revoke all on pvp_file, pvp_matchs, pvp_invitations, pvp_arenes_faites from anon, authenticated;

-- défis entre ami(e)s (30 pièces au gagnant, 5 par jour) : deux types de plus
alter table rencontres drop constraint if exists rencontres_type_check;
-- tous les types en une fois (la ligue comprise) : le fichier doit se relancer même quand des matchs de ligue existent déjà
alter table rencontres add constraint rencontres_type_check check (type in ('championnat', 'seance', 'defi', 'defense', 'defi_ami', 'defense_ami', 'ligue', 'defense_ligue', 'pvp'));

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
-- Transferts par listes (demande de Maël) : jusqu'à 7 joueurs voulus et 7 qu'on peut donner (joueur + palier) ; le jeu montre les échanges
-- compatibles avec les listes des autres (il veut un des miens, il donne un de ceux que je veux, même palier) et l'échange se fait d'un toucher
create table if not exists listes_transfert (
  user_id uuid not null references profils on delete cascade,
  sens text not null check (sens in ('veux', 'donne')),
  carte text not null references cartes on delete cascade,
  palier text not null check (palier in ('bronze', 'argent', 'or', 'ultime')),
  cree_le timestamptz not null default now(),
  primary key (user_id, sens, carte, palier)
);
create index if not exists listes_transfert_carte on listes_transfert (sens, carte, palier);
create table if not exists transferts_faits (
  id uuid primary key default gen_random_uuid(),
  a uuid references profils on delete set null, b uuid references profils on delete set null,   -- a a lancé l'échange
  carte_a text not null, carte_b text not null, palier text not null,                            -- a donne carte_a, b donne carte_b
  le timestamptz not null default now()
);
alter table profils add column if not exists transferts_vus timestamptz;   -- pour signaler un transfert fait par un autre avec nos listes

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
alter table listes_transfert enable row level security;
alter table transferts_faits enable row level security;
revoke all on listes_transfert, transferts_faits from anon, authenticated;
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
create or replace function matchs_a_jour(p_uid uuid) returns void language plpgsql security definer set search_path = public as $$
declare p profils; minutes int := parami('match_minutes'); maxi int := parami('match_stock_max'); n int;
begin
  select * into p from profils where user_id = p_uid for update;   -- deux appels à la fois : le second attend (pas de double recharge)
  minutes := round(minutes * (1 - staff_val(p_uid, 'kine') / 100.0));   -- kiné
  if p.matchs >= maxi then update profils set matchs_maj = now() where user_id = p_uid; return; end if;
  n := floor(extract(epoch from now() - p.matchs_maj) / (minutes * 60));
  if n <= 0 then return; end if;
  if p.matchs + n >= maxi then update profils set matchs = maxi, matchs_maj = now() where user_id = p_uid;
  else update profils set matchs = matchs + n, matchs_maj = matchs_maj + make_interval(mins => n * minutes) where user_id = p_uid;
  end if;
end $$;
create or replace function boosters_a_jour(p_uid uuid) returns void language plpgsql security definer set search_path = public as $$
declare p profils; minutes int := parami('booster_minutes'); maxi int := parami('booster_stock_max'); n int;
begin
  select * into p from profils where user_id = p_uid for update;   -- deux appels à la fois : le second attend (pas de double recharge)
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
         ('marche', 1, 40, 100, 'Vends, achète, donne ou échange une carte (Social → Transferts)')
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
  -- les quêtes de la semaine avancent avec les mêmes actions
  perform quetes_de_la_semaine(p_uid);
  update quetes_semaine set progres = progres + p_n where user_id = p_uid and lundi = date_trunc('week', aujourdhui())::date and quete = p_quete;
end $$;

-- Gagne de l'expérience de compte ; chaque niveau donne des pièces et un booster (Or ou mieux tous les 5 niveaux)
create or replace function gagner_xp(p_uid uuid, p_xp int) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils; gains jsonb := '[]'; v_pieces int; orr boolean;
begin
  update profils set xp = xp + p_xp where user_id = p_uid returning * into p;
  if p_xp > 0 then
    insert into passe (user_id, saison, xp) values (p_uid, passe_saison(), p_xp)
    on conflict (user_id, saison) do update set xp = passe.xp + excluded.xp;
  end if;
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

-- ════════════════════════════════════════════════════════════════════════════
-- Pour ne pas tourner en rond (demande de Maël) : joueurs de la semaine, passe de saison et quêtes de la semaine, défis de composition
-- ════════════════════════════════════════════════════════════════════════════

-- Joueurs de la semaine : pour chaque équipe du club, le meilleur joueur des vrais matchs de la semaine (data/semaine.json, fait par
-- scripts/semaine.py d'après les feuilles du site, sans répétition dans une équipe ; relu avec data/matchs.json). Pendant la semaine
-- qui suit, ils sont « en forme » (+3 en match) et sortent dans le booster de la semaine. Le jeu ne peut rien y écrire.
create table if not exists joueurs_semaine (lundi date not null, equipe text not null, carte text not null, stats jsonb not null default '{}',
  primary key (lundi, equipe));
alter table joueurs_semaine enable row level security;
revoke all on joueurs_semaine from anon, authenticated;
-- Passe de saison : XP gagnée pendant la saison (4 semaines) et dernier palier dont la récompense est récupérée
create table if not exists passe (user_id uuid not null references profils on delete cascade, saison int not null, xp int not null default 0,
  reclame int not null default 0, primary key (user_id, saison));
alter table passe enable row level security;
revoke all on passe from anon, authenticated;
-- Quêtes de la semaine (du lundi au dimanche)
create table if not exists quetes_semaine (user_id uuid not null references profils on delete cascade, lundi date not null, quete text not null,
  progres int not null default 0, reclamee boolean not null default false, primary key (user_id, lundi, quete));
alter table quetes_semaine enable row level security;
revoke all on quetes_semaine from anon, authenticated;
-- Défis de composition réussis (une fois par défi et par période : semaine ou mois) et les cartes données
create table if not exists defis_faits (user_id uuid not null references profils on delete cascade, periode date not null, defi text not null,
  cartes jsonb not null default '[]', le timestamptz not null default now(), primary key (user_id, periode, defi));
alter table defis_faits enable row level security;
revoke all on defis_faits from anon, authenticated;
-- Choix du coach en attente : les 3 cartes montrées et leur place secrète après le mélange (jamais lisible par le jeu)
create table if not exists choix_coach (user_id uuid primary key references profils on delete cascade, poste text not null,
  cartes jsonb not null, places int[] not null, le timestamptz not null default now());
alter table choix_coach enable row level security;
revoke all on choix_coach from anon, authenticated;

-- Semaine affichée : la dernière semaine finie qui a des joueurs (jusqu'à 3 semaines en arrière, si le site tarde à être republié)
create or replace function semaine_actuelle() returns date language sql stable security definer set search_path = public as $$
  select max(lundi) from joueurs_semaine
  where lundi < date_trunc('week', aujourdhui())::date and lundi >= date_trunc('week', aujourdhui())::date - 21
$$;
create or replace function en_forme(p_carte text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from joueurs_semaine where lundi = semaine_actuelle() and carte = p_carte)
$$;
create or replace function semaine_vue(p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('lundi', semaine_actuelle(), 'forme', parami('semaine_forme'),
    'prix', parami('booster_semaine_prix'), 'parJour', parami('booster_semaine_par_jour'),
    'achetes', (select count(*) from mouvements m where m.user_id = p_uid and m.quoi = 'booster' and m.detail ->> 'type' = 'semaine'
      and m.le >= debut_du_jour()),
    'chances', param('booster_semaine_chances'),
    'joueurs', coalesce((select jsonb_agg(jsonb_build_object('equipe', j.equipe, 'carte', j.carte, 'stats', j.stats) order by j.equipe)
      from joueurs_semaine j join cartes c on c.id = j.carte where j.lundi = semaine_actuelle()), '[]'))
$$;
-- relu par la synchro des matchs : remplace les joueurs des semaines du fichier (le fichier fait foi, il ne change plus une semaine finie)
create or replace function maj_semaine(p jsonb) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if jsonb_typeof(p -> 'semaines') <> 'array' then raise exception 'Fichier des joueurs de la semaine invalide'; end if;
  insert into joueurs_semaine (lundi, equipe, carte, stats)
    select (s ->> 'lundi')::date, e.key, e.value ->> 'carte', e.value - 'carte'
    from jsonb_array_elements(p -> 'semaines') s, jsonb_each(s -> 'equipes') e
    where e.value ->> 'carte' in (select id from cartes)
  on conflict (lundi, equipe) do update set carte = excluded.carte, stats = excluded.stats;
  get diagnostics n = row_count;
  -- meilleur buteur du club dans chaque match (pour les pronostics)
  if jsonb_typeof(p -> 'buteurs') = 'object' then
    insert into buteurs_match (rid, carte, buts) select b.key, b.value ->> 'carte', coalesce((b.value ->> 'buts')::int, 0) from jsonb_each(p -> 'buteurs') b
      where b.value ->> 'carte' in (select id from cartes)
    on conflict (rid) do update set carte = excluded.carte, buts = excluded.buts;
    perform regler_pronostics();
  end if;
  return n;
end $$;

-- Passe de saison : saisons de 4 semaines depuis passe_debut ; 30 paliers de 400 XP (toute l'XP gagnée compte)
create or replace function passe_saison() returns int language sql stable security definer set search_path = public as $$
  select greatest(1, floor((aujourdhui() - (param('passe_debut') #>> '{}')::date) / (7 * parami('passe_semaines')))::int + 1)
$$;
create or replace function passe_debut_saison(n int) returns date language sql stable security definer set search_path = public as $$
  select (param('passe_debut') #>> '{}')::date + (n - 1) * 7 * parami('passe_semaines')
$$;
-- récompense d'un palier : des pièces ; un booster tous les 3 ; 2 boosters tous les 5 ; un booster Or tous les 10 ; le 30e : 2 Or
create or replace function passe_recompense(n int) returns jsonb language sql immutable as $$
  select case when n = 30 then '{"or": 2, "pieces": 2000}'::jsonb
    when n % 10 = 0 then jsonb_build_object('or', 1, 'pieces', 50 * n)
    when n % 5 = 0 then jsonb_build_object('bonus', 2, 'pieces', 200)
    when n % 3 = 0 then '{"bonus": 1}'::jsonb
    else jsonb_build_object('pieces', 100 + 10 * n) end
$$;
create or replace function passe_vue(p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('saison', passe_saison(), 'debut', passe_debut_saison(passe_saison()),
    'fin', passe_debut_saison(passe_saison() + 1) - 1, 'xp', coalesce(x.xp, 0), 'reclame', coalesce(x.reclame, 0),
    'xpPalier', parami('passe_xp_palier'), 'paliers', parami('passe_paliers'),
    'palier', least(parami('passe_paliers'), coalesce(x.xp, 0) / parami('passe_xp_palier')),
    'recompenses', (select jsonb_agg(passe_recompense(k) order by k) from generate_series(1, parami('passe_paliers')) k))
  from (select 1) u left join passe x on x.user_id = p_uid and x.saison = passe_saison()
$$;

-- Quêtes de la semaine : [id, objectif, xp, pièces, texte] ; 4 par semaine, toujours les mêmes pour un joueur et une semaine
create or replace function quetes_semaine_catalogue() returns table (id text, objectif int, xp int, pieces int, texte text)
language sql immutable as $$
  values ('championnat', 15, 300, 400, 'Joue 15 matchs de championnat'),
         ('victoire', 10, 300, 400, 'Gagne 10 matchs'),
         ('mini', 40, 250, 300, 'Joue 40 parties de mini-jeux'),
         ('compo', 2, 300, 300, 'Réussis 2 défis de composition'),
         ('booster', 10, 250, 300, 'Ouvre 10 boosters'),
         ('entrainement', 10, 250, 300, 'Fais 10 séances d’entraînement'),
         ('fusion', 3, 300, 400, 'Fais 3 fusions'),
         ('defi', 5, 250, 300, 'Défie 5 fois tes ami(e)s'),
         ('pari', 2, 200, 250, 'Fais 2 paris sur de vrais matchs')
$$;
create or replace function quetes_de_la_semaine(p_uid uuid) returns void language plpgsql security definer set search_path = public as $$
declare l date := date_trunc('week', aujourdhui())::date;
begin
  if exists (select 1 from quetes_semaine where user_id = p_uid and lundi = l) then return; end if;
  insert into quetes_semaine (user_id, lundi, quete)
    select p_uid, l, q.id from quetes_semaine_catalogue() q order by md5(p_uid::text || l::text || q.id) limit 4
  on conflict do nothing;
end $$;

-- Défis de composition (comme les « défis de création d'équipe » des jeux de foot) : on donne des cartes libres qui suivent la règle,
-- elles disparaissent, on reçoit la récompense. Règle : n cartes ; differents (joueurs tous différents) ; palier_min ;
-- conds [{n, palier | equipe | genre | poste (principal)}] ; un_par_poste (les 7 postes principaux) ; equipes (équipes différentes) ;
-- note_moy. 3 défis de la semaine (tirés dans la liste, les mêmes pour tous) et 1 défi du mois.
create or replace function compo_catalogue() returns table (id text, periode text, titre text, texte text, regle jsonb, recompense jsonb)
language sql immutable as $$
  values ('ailes', 'semaine', 'Les ailes', '2 ailiers gauches et 2 ailiers droits', '{"n": 4, "conds": [{"n": 2, "poste": "AG"}, {"n": 2, "poste": "AD"}]}'::jsonb, '{"bonus": 1, "pieces": 200}'::jsonb),
         ('base', 'semaine', 'La base arrière', 'Un arrière gauche, un demi-centre, un arrière droit', '{"n": 3, "conds": [{"n": 1, "poste": "ARG"}, {"n": 1, "poste": "DC"}, {"n": 1, "poste": "ARD"}]}', '{"bonus": 1, "pieces": 150}'),
         ('sf1', 'semaine', '100 % SF1', '3 joueuses différentes de SF1', '{"n": 3, "differents": true, "conds": [{"n": 3, "equipe": "SF1"}]}', '{"bonus": 1, "pieces": 200}'),
         ('sf2', 'semaine', '100 % SF2', '3 joueuses différentes de SF2', '{"n": 3, "differents": true, "conds": [{"n": 3, "equipe": "SF2"}]}', '{"bonus": 1, "pieces": 200}'),
         ('sg1', 'semaine', '100 % SG1', '3 joueurs différents de SG1', '{"n": 3, "differents": true, "conds": [{"n": 3, "equipe": "SG1"}]}', '{"bonus": 1, "pieces": 200}'),
         ('sg2', 'semaine', '100 % SG2', '3 joueurs différents de SG2', '{"n": 3, "differents": true, "conds": [{"n": 3, "equipe": "SG2"}]}', '{"bonus": 1, "pieces": 200}'),
         ('argent', 'semaine', 'Collection d’argent', '4 cartes Argent, toutes différentes', '{"n": 4, "differents": true, "conds": [{"n": 4, "palier": "argent"}]}', '{"or": 1}'),
         ('mixte', 'semaine', 'Mixte', '2 filles et 2 garçons', '{"n": 4, "conds": [{"n": 2, "genre": "F"}, {"n": 2, "genre": "M"}]}', '{"bonus": 2}'),
         ('menage', 'semaine', 'Grand ménage', '6 cartes Bronze, toutes différentes', '{"n": 6, "differents": true, "conds": [{"n": 6, "palier": "bronze"}]}', '{"bonus": 2, "pieces": 100}'),
         ('murailles', 'semaine', 'Les murailles', '2 gardien(ne)s', '{"n": 2, "conds": [{"n": 2, "poste": "GB"}]}', '{"bonus": 1, "pieces": 300}'),
         ('pivots', 'semaine', 'Le cœur du jeu', '2 pivots et un demi-centre', '{"n": 3, "conds": [{"n": 2, "poste": "PIV"}, {"n": 1, "poste": "DC"}]}', '{"bonus": 1, "pieces": 200}'),
         ('lourd', 'semaine', 'Du lourd', '3 cartes, note moyenne de 70 ou plus', '{"n": 3, "note_moy": 70}', '{"or": 1, "pieces": 300}'),
         ('equipe7', 'mois', 'Une équipe complète', '7 cartes, une à chaque poste', '{"n": 7, "un_par_poste": true}', '{"or": 2, "pieces": 1000}'),
         ('club', 'mois', 'Tout le club', '4 cartes Argent ou mieux, de 4 équipes différentes', '{"n": 4, "palier_min": "argent", "equipes": 4}', '{"or": 2, "pieces": 800}'),
         ('tresor', 'mois', 'Le trésor', '3 cartes Or, toutes différentes', '{"n": 3, "differents": true, "conds": [{"n": 3, "palier": "or"}]}', '{"or": 3, "pieces": 1500}')
$$;
create or replace function compo_periode(p text) returns date language sql stable as $$
  select case when p = 'mois' then date_trunc('month', aujourdhui())::date else date_trunc('week', aujourdhui())::date end
$$;
-- les défis du moment : 3 de la semaine, 1 du mois (tirés selon la date, les mêmes pour tout le monde)
create or replace function compo_actifs() returns setof text language sql stable security definer set search_path = public as $$
  (select id from compo_catalogue() where periode = 'semaine' order by md5(compo_periode('semaine')::text || id) limit greatest(0, parami('compo_par_semaine')))
  union all
  (select id from compo_catalogue() where periode = 'mois' order by md5(compo_periode('mois')::text || id) limit 1)
$$;
create or replace function compo_vue(p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'periode', c.periode, 'titre', c.titre, 'texte', c.texte, 'regle', c.regle,
      'recompense', c.recompense, 'fait', exists (select 1 from defis_faits f where f.user_id = p_uid and f.defi = c.id and f.periode = compo_periode(c.periode)))
    order by c.periode desc, c.id), '[]')
  from compo_catalogue() c where c.id in (select compo_actifs())
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Pronostics du week-end, ligue de la semaine, clubs de joueurs, albums, capitaine, staff, personnalisation (demande de Maël)
-- ════════════════════════════════════════════════════════════════════════════

-- Pronostics : le score des vrais matchs du club et leur meilleur buteur, avant le coup d'envoi ; des points, et des pièces
create table if not exists pronostics (user_id uuid not null references profils on delete cascade, rid text not null references matchs on delete cascade,
  dom int not null check (dom between 0 and 80), ext int not null check (ext between 0 and 80), buteur text, points int, payes int not null default 0,
  le timestamptz not null default now(), primary key (user_id, rid));
alter table pronostics enable row level security;
revoke all on pronostics from anon, authenticated;
-- meilleur buteur du club dans chaque match (data/semaine.json, d'après les feuilles du site)
create table if not exists buteurs_match (rid text primary key, carte text not null, buts int not null default 0);
alter table buteurs_match enable row level security;
revoke all on buteurs_match from anon, authenticated;

-- Ligue de la semaine : groupes de 10 (joueurs de même division + équipes de l'ordinateur pour compléter), du lundi au dimanche
create table if not exists ligue_groupes (id bigserial primary key, lundi date not null, division int not null, bots jsonb not null default '[]',
  cree_le timestamptz not null default now());
create table if not exists ligue_membres (groupe bigint not null references ligue_groupes on delete cascade, user_id uuid not null references profils on delete cascade,
  lundi date not null, points int not null default 0, joues int not null default 0, gagnes int not null default 0, nuls int not null default 0, perdus int not null default 0,
  primary key (groupe, user_id), unique (user_id, lundi));
alter table ligue_membres add column if not exists clos boolean not null default false;   -- semaine finie et récompensée
create table if not exists ligue_matchs (id bigserial primary key, groupe bigint not null references ligue_groupes on delete cascade,
  user_id uuid not null references profils on delete cascade, adversaire text not null, score int[], resultat text, le timestamptz not null default now());
create index if not exists ligue_matchs_user on ligue_matchs (user_id, le);
alter table ligue_groupes enable row level security;
alter table ligue_membres enable row level security;
alter table ligue_matchs enable row level security;
revoke all on ligue_groupes, ligue_membres, ligue_matchs from anon, authenticated;
alter table profils add column if not exists ligue_div int not null default 8;        -- 8 : la plus basse, 1 : la meilleure
alter table profils add column if not exists ligue_meilleure int not null default 8;
alter table profils add column if not exists ligue_bilan jsonb;                         -- résultat de la semaine passée, montré une fois
-- (les types de la ligue sont dans rencontres_type_check, plus haut)

-- Clubs de joueurs : 20 au plus, un objectif commun chaque semaine (victoires de tous les membres)
create table if not exists clubs (id bigserial primary key, nom text not null, cree_par uuid references profils on delete set null, cree_le timestamptz not null default now());
create unique index if not exists clubs_nom on clubs (lower(nom));
create table if not exists clubs_membres (user_id uuid primary key references profils on delete cascade, club bigint not null references clubs on delete cascade,
  role text not null default 'membre' check (role in ('president', 'membre')), rejoint_le timestamptz not null default now());
create table if not exists clubs_recompenses (user_id uuid not null references profils on delete cascade, lundi date not null, palier int not null,
  primary key (user_id, lundi, palier));
alter table clubs enable row level security;
alter table clubs_membres enable row level security;
alter table clubs_recompenses enable row level security;
revoke all on clubs, clubs_membres, clubs_recompenses from anon, authenticated;

-- Échanges (23 nov. 2026, demande de Maël : les listes de transferts ne donnaient aucun échange avec 17 joueurs et 452 cartes-paliers ;
-- il fallait quelqu'un qui veut ma carte ET donne celle que je veux, au même palier). Trois façons d'échanger sans attendre l'inverse :
-- marché à pièces (ventes), boîte à échanges (boite), demandes au club (club_demandes, club_dons). Tables lues par les fonctions seulement.
create table if not exists ventes (
  id uuid primary key default gen_random_uuid(),
  vendeur uuid not null references profils on delete cascade,
  exemplaire uuid references exemplaires on delete set null,       -- bloqué (verrou « vente ») tant que la vente est ouverte
  carte text not null references cartes, palier text not null check (palier in ('bronze', 'argent', 'or', 'ultime')), note int not null,
  prix int not null check (prix > 0),
  statut text not null default 'ouverte' check (statut in ('ouverte', 'vendue', 'retiree', 'expiree')),
  acheteur uuid references profils on delete set null,
  cree_le timestamptz not null default now(), fini_le timestamptz
);
create index if not exists ventes_statut on ventes (statut, cree_le);
create index if not exists ventes_vendeur on ventes (vendeur, statut);
-- boîte : un dépôt attend (« attente ») qu'un autre joueur dépose une carte du même palier, au plus boite_attente_minutes ; ensuite le
-- jeu sert le déposant et sa carte reste dans la boîte (« libre ») pour le prochain. boite_faits : un dépôt et ce qu'il a rapporté.
create table if not exists boite_faits (id bigserial primary key, user_id uuid not null references profils on delete cascade,
  donne text not null, recu text, palier text not null, le timestamptz not null default now(), fini_le timestamptz);
create table if not exists boite (id bigserial primary key, carte text not null references cartes on delete cascade,
  palier text not null check (palier in ('bronze', 'argent', 'or', 'ultime')), note int not null,
  depose_par uuid references profils on delete set null, depose_le timestamptz not null default now(),
  statut text not null default 'attente' check (statut in ('attente', 'libre')), fait bigint references boite_faits on delete set null);
create index if not exists boite_palier on boite (palier, statut);
create index if not exists boite_faits_jour on boite_faits (user_id, le);
create table if not exists club_demandes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profils on delete cascade, club bigint not null references clubs on delete cascade,
  carte text not null references cartes, palier text not null check (palier in ('bronze', 'argent', 'or')),
  voulu int not null check (voulu > 0), recu int not null default 0,
  statut text not null default 'ouverte' check (statut in ('ouverte', 'pleine', 'fermee')),
  cree_le timestamptz not null default now(), fini_le timestamptz
);
create index if not exists club_demandes_club on club_demandes (club, statut);
create index if not exists club_demandes_joueur on club_demandes (user_id, cree_le);
create table if not exists club_dons (id bigserial primary key, demande uuid references club_demandes on delete cascade,
  de uuid references profils on delete set null, pour uuid references profils on delete cascade,
  carte text not null, palier text not null, le timestamptz not null default now());
create index if not exists club_dons_de on club_dons (de, le);
create index if not exists club_dons_pour on club_dons (pour, le);
alter table ventes enable row level security;
alter table boite enable row level security;
alter table boite_faits enable row level security;
alter table club_demandes enable row level security;
alter table club_dons enable row level security;
revoke all on ventes, boite, boite_faits, club_demandes, club_dons from anon, authenticated;

-- Albums : une équipe complète à un palier (au moins une carte de chaque joueur en jeu, à ce palier ou mieux)
create table if not exists albums_faits (user_id uuid not null references profils on delete cascade, equipe text not null, palier text not null,
  le timestamptz not null default now(), primary key (user_id, equipe, palier));
alter table albums_faits enable row level security;
revoke all on albums_faits from anon, authenticated;

-- Capitaine (un exemplaire de l'équipe : +2 de note en match), staff (ne joue pas, aide le club), personnalisation du profil
alter table profils add column if not exists capitaine uuid;
create table if not exists staff_cartes (id bigserial primary key, user_id uuid not null references profils on delete cascade, staff text not null,
  palier text not null default 'bronze' check (palier in ('bronze', 'argent', 'or', 'ultime')), le timestamptz not null default now());
create index if not exists staff_cartes_user on staff_cartes (user_id, staff);
alter table staff_cartes enable row level security;
revoke all on staff_cartes from anon, authenticated;
create table if not exists staff_reglages (id text primary key, nom text, intro text, photos jsonb not null default '{}', maj timestamptz not null default now());
alter table staff_reglages enable row level security;
revoke all on staff_reglages from anon, authenticated;   -- lu par etat_de et catalogue_staff, écrit par admin_publier_staff
alter table profils add column if not exists staff text;   -- la carte staff placée dans l'équipe (une seule place)
alter table profils add column if not exists perso jsonb not null default '{}';   -- {avatar, cadre, fond}
alter table profils add column if not exists remplacants jsonb not null default '{}';
-- compos enregistrées (3 emplacements, compo_enregistrer / compo_charger)
alter table profils add column if not exists compos jsonb not null default '[]';
-- blessure d'une carte (demande de Maël, 20 nov. 2026 : « certaines prennent plusieurs matchs ») : matchs encore à manquer, gravité
alter table exemplaires add column if not exists blessure int not null default 0;
alter table exemplaires add column if not exists blessure_g text;
-- protection contre les blessures (demande de Maël, 20 nov. 2026, jamais affichée : « ça évitera la frustration ») : une carte qui
-- vient d'arriver (booster, fusion, choix du coach, transfert, échange…) ne peut pas se blesser pendant les 5 matchs qui suivent
-- (championnat ou défi entre ami(e)s). Les cartes d'avant n'en ont pas (null) ; le jeu ne la reçoit pas (etat_de).
alter table exemplaires add column if not exists protection int;
alter table exemplaires alter column protection set default 5;   -- un remplaçant par poste (demande de Maël) : {poste: id de l'exemplaire}

create or replace function lundi_courant() returns date language sql stable as $$ select date_trunc('week', aujourdhui())::date $$;
create or replace function debut_semaine() returns timestamptz language sql stable as $$ select lundi_courant()::timestamp at time zone 'Europe/Paris' $$;

-- ── staff
create or replace function staff_catalogue() returns table (id text, nom text, role text, effet text, valeurs int[]) language sql immutable as $$
  -- effet : {v} = la valeur du palier (Bronze, Argent, Or, Ultime)
  values ('prepa', 'Préparateur physique', 'Entraînement', '+{v} % d’XP à chaque entraînement d’un joueur', array[25, 50, 75, 100]),
         ('kine', 'Kiné', 'Récupération', 'Matchs de championnat rechargés {v} % plus vite', array[10, 20, 30, 40]),
         ('ailiers', 'Coach des ailiers', 'Ailes', '+{v} de note à tes ailiers (AG, AD) en match', array[1, 2, 3, 4]),
         ('manager', 'Manager', 'Finances', '+{v} % de pièces gagnées en championnat et en ligue', array[5, 10, 15, 20]),
         ('gardiens', 'Entraîneur des gardiens', 'But', '+{v} de note à ta gardienne ou ton gardien en match', array[1, 2, 3, 4]),
         ('base', 'Coach de la base arrière', 'Base arrière', '+{v} de note aux arrières et au demi-centre en match', array[1, 2, 2, 3]),
         ('polyvalent', 'Coach polyvalent', 'Postes', 'Hors de son poste, un joueur perd {v} au lieu de 5', array[4, 3, 2, 1]),
         ('mental', 'Préparateur mental', 'Capitaine', 'Ton capitaine gagne {v} de plus en match', array[1, 2, 3, 4]),
         ('adjoint', 'Entraîneur adjoint', 'Attaque', '+{v} % d’attaque en match', array[1, 2, 3, 4]),
         ('defense', 'Coach défensif', 'Défense', '+{v} % de défense en match', array[1, 2, 3, 4])
$$;
create or replace function staff_rang(p_palier text) returns int language sql immutable as $$
  select array_position(array['bronze', 'argent', 'or', 'ultime'], p_palier)
$$;
-- le meilleur exemplaire d'une carte staff (c'est lui qui compte quand la carte est placée)
create or replace function staff_meilleur(p_uid uuid, p_staff text) returns text language sql stable security definer set search_path = public as $$
  select palier from staff_cartes where user_id = p_uid and staff = p_staff order by staff_rang(palier) desc limit 1
$$;
-- la carte staff active d'un joueur (placée dans son équipe et possédée), sinon null
create or replace function staff_actif(p_uid uuid) returns text language sql stable security definer set search_path = public as $$
  select p.staff from profils p where p.user_id = p_uid and exists (select 1 from staff_cartes s where s.user_id = p_uid and s.staff = p.staff)
$$;
-- une carte staff telle que le jeu et l'outil la montrent : passif, valeurs par palier, et la personne réglée dans l'outil
create or replace function staff_vue(p_id text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', k.id, 'nom', k.nom, 'role', k.role, 'effet', k.effet, 'valeurs', to_jsonb(k.valeurs),
    'personne', r.nom, 'intro', r.intro, 'photos', coalesce(r.photos, '{}'))
  from staff_catalogue() k left join staff_reglages r on r.id = k.id where k.id = p_id
$$;
-- les 10 cartes staff (lisibles par tous : c'est ce que montre la page Staff ; l'outil en part)
create or replace function catalogue_staff() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(staff_vue(k.id) order by k.ord), '[]') from (select id, row_number() over () ord from staff_catalogue()) k
$$;
-- la valeur du passif d'une carte si elle est placée (selon son meilleur palier), sinon 0
create or replace function staff_val(p_uid uuid, p_staff text) returns int language sql stable security definer set search_path = public as $$
  select coalesce((select k.valeurs[staff_rang(staff_meilleur(p_uid, k.id))] from staff_catalogue() k where k.id = p_staff and staff_actif(p_uid) = p_staff), 0)
$$;

-- ── albums
create or replace function albums_vue(p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('equipe', e.equipe, 'palier', pal, 'total', e.n,
      'possede', (select count(distinct c.id) from cartes c join exemplaires x on x.carte_id = c.id and x.proprietaire = p_uid
        where c.actif and e.equipe = any(equipes_de(c.equipe, c.equipes)) and array_position(array['bronze', 'argent', 'or', 'ultime'], x.palier) >= array_position(array['bronze', 'argent', 'or', 'ultime'], pal)),
      'fait', exists (select 1 from albums_faits f where f.user_id = p_uid and f.equipe = e.equipe and f.palier = pal),
      'recompense', param('albums_recompenses') -> pal)
    order by e.equipe, array_position(array['bronze', 'argent', 'or', 'ultime'], pal)), '[]')
  from (select t equipe, count(*) n from cartes c, unnest(equipes_de(c.equipe, c.equipes)) t where c.actif group by t) e, unnest(array['bronze', 'argent', 'or', 'ultime']) pal
$$;

-- ── personnalisation : ce qui est débloqué se calcule (rien à enregistrer)
create or replace function perso_catalogue() returns table (id text, type text, nom text, condition text) language sql immutable as $$
  values ('logo', 'avatar', 'Logo du club', ''), ('maillot', 'avatar', 'Maillot de Médoc', ''), ('ballon', 'avatar', 'Ballon', ''),
         ('gardien', 'avatar', 'Cage', 'Niveau 5'), ('trophee', 'avatar', 'Trophée', 'Atteindre la division 4 de la ligue'),
         ('couronne', 'avatar', 'Couronne', 'Posséder une légende du club'),
         ('simple', 'cadre', 'Simple', ''), ('bronze', 'cadre', 'Bronze', 'Finir un album Bronze'), ('argent', 'cadre', 'Argent', 'Finir un album Argent'),
         ('or', 'cadre', 'Or', 'Finir un album Or'), ('ultime', 'cadre', 'Ultime', 'Palier 30 du passe de saison'), ('legende', 'cadre', 'Légende', 'Posséder une légende du club'),
         ('nuit', 'fond', 'Nuit', ''), ('parquet', 'fond', 'Parquet', 'Palier 10 du passe de saison'), ('tribune', 'fond', 'Tribune', 'Palier 20 du passe de saison'),
         ('club', 'fond', 'Couleurs du club', 'Être dans un club'), ('elite', 'fond', 'Élite', 'Atteindre la division 1 de la ligue')
$$;
create or replace function perso_debloques(p_uid uuid) returns text[] language sql stable security definer set search_path = public as $$
  with p as (select * from profils where user_id = p_uid),
       passe_max as (select coalesce(max(least(parami('passe_paliers'), xp / parami('passe_xp_palier'))), 0) m from passe where user_id = p_uid),
       leg as (select exists (select 1 from exemplaires e join cartes c on c.id = e.carte_id where e.proprietaire = p_uid and c.legende) v)
  select array_agg(k.id) from perso_catalogue() k, p, passe_max, leg where case k.id
    when 'gardien' then p.niveau >= 5
    when 'trophee' then p.ligue_meilleure <= 4
    when 'couronne' then leg.v
    when 'bronze' then exists (select 1 from albums_faits where user_id = p_uid and palier = 'bronze')
    when 'argent' then exists (select 1 from albums_faits where user_id = p_uid and palier = 'argent')
    when 'or' then exists (select 1 from albums_faits where user_id = p_uid and palier = 'or')
    when 'ultime' then passe_max.m >= 30
    when 'legende' then leg.v
    when 'parquet' then passe_max.m >= 10
    when 'tribune' then passe_max.m >= 20
    when 'club' then exists (select 1 from clubs_membres where user_id = p_uid)
    when 'elite' then p.ligue_meilleure <= 1
    else true end
$$;
-- ce que les autres voient de mon profil (classements, ligue, club) : seulement des choix débloqués
create or replace function perso_public(p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('avatar', coalesce(p.perso ->> 'avatar', 'logo'), 'cadre', coalesce(p.perso ->> 'cadre', 'simple'), 'fond', coalesce(p.perso ->> 'fond', 'nuit'))
  from profils p where p.user_id = p_uid
$$;

-- ── ligue : noms des divisions et équipes de l'ordinateur
create or replace function ligue_nom(d int) returns text language sql immutable as $$ select case when d <= 1 then 'Élite' else 'Division ' || (d - 1) end $$;
create or replace function ligue_force(d int) returns numeric language sql immutable as $$ select 52 + (8 - d) * 5 $$;
-- points d'une équipe de l'ordinateur : ceux pris contre les joueurs, plus ses matchs entre ordinateurs (environ 1 à 2 points par jour selon sa force)
-- jours de matchs entre ordinateurs : depuis la création du groupe (quelqu'un qui arrive le dimanche n'a pas une semaine de retard)
create or replace function ligue_jours_bot(g ligue_groupes) returns int language sql stable as $$
  select least(7, greatest(0, least(aujourdhui(), g.lundi + 6) - greatest(g.lundi, (g.cree_le at time zone 'Europe/Paris')::date) + 1))
$$;
create or replace function ligue_points_bot(b jsonb, g ligue_groupes) returns int language sql stable as $$
  select coalesce((b ->> 'pts')::int, 0) + floor(coalesce((b ->> 'rythme')::numeric, 1.2) * ligue_jours_bot(g))::int
$$;
create or replace function ligue_classement(g ligue_groupes, p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x ->> 'points')::int desc, (x ->> 'gagnes')::int desc, x ->> 'nom'), '[]') from (
    select jsonb_build_object('id', 'u:' || m.user_id, 'nom', pr.pseudo, 'humain', true, 'moi', m.user_id = p_uid, 'points', m.points, 'joues', m.joues,
      'gagnes', m.gagnes, 'nuls', m.nuls, 'perdus', m.perdus, 'perso', perso_public(m.user_id),
      'contreMoi', (select count(*) from ligue_matchs lm where lm.groupe = g.id and lm.user_id = p_uid and lm.adversaire = 'u:' || m.user_id)) x
    from ligue_membres m join profils pr on pr.user_id = m.user_id where m.groupe = g.id
    union all
    select jsonb_build_object('id', 'b:' || (b ->> 'id'), 'nom', b ->> 'nom', 'humain', false, 'moi', false, 'points', ligue_points_bot(b, g),
      'joues', coalesce((b ->> 'joues')::int, 0) + ligue_jours_bot(g), 'gagnes', coalesce((b ->> 'g')::int, 0),
      'nuls', 0, 'perdus', 0, 'note', round((b ->> 'force')::numeric),
      'contreMoi', (select count(*) from ligue_matchs lm where lm.groupe = g.id and lm.user_id = p_uid and lm.adversaire = 'b:' || (b ->> 'id')))
    from jsonb_array_elements(g.bots) b) t(x)
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
-- la plus forte Légende déjà battue (0 à 10) ; avant les 10 équipes, battre « les Légendes » (force 99) vaut la Légende 1
create or replace function legendes_max(pc jsonb) returns int language sql stable as $$
  select coalesce((pc ->> 'legendes_max')::int, case when coalesce((pc ->> 'legendes_battues')::int, 0) > 0 then 1 else 0 end)
$$;
-- la Légende à affronter : la suivante de la plus forte battue (de 1 à 10 ; après la 10e, on rejoue la 10e)
create or replace function legende_rang(pc jsonb) returns int language sql stable security definer set search_path = public as $$
  select greatest(1, least(coalesce((pc ->> 'legende')::int, legendes_max(pc) + 1), jsonb_array_length(param('legendes_equipes'))))
$$;
create or replace function parcours_vue(pc jsonb) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare nv jsonb; v jsonb; j int; m jsonb; adv int; dom boolean; rg int; le jsonb;
begin
  if pc is null then return null; end if;
  nv := param('parcours') -> ((pc ->> 'niveau')::int - 1);
  v := jsonb_build_object('niveau', pc -> 'niveau', 'nom', nv ->> 'nom', 'groupe', nv ->> 'groupe', 'type', pc ->> 'type',
    'saison', pc -> 'saison', 'international', pc -> 'international', 'meilleur', pc -> 'meilleur', 'palmares', pc -> 'palmares',
    'legendesBattues', pc -> 'legendes_battues', 'niveaux', jsonb_array_length(param('parcours')));
  if pc ->> 'type' = 'poule' or (pc ->> 'type' = 'tournoi' and pc ->> 'phase' = 'poule') then
    j := (pc ->> 'journee')::int;
    if j < jsonb_array_length(pc -> 'calendrier') then
      select x into m from jsonb_array_elements(pc -> 'calendrier' -> j) x where (x ->> 0)::int = 0 or (x ->> 1)::int = 0;
      dom := (m ->> 0)::int = 0; adv := case when dom then (m ->> 1)::int else (m ->> 0)::int end;
    end if;
    v := v || jsonb_build_object('journee', j, 'journees', jsonb_array_length(pc -> 'calendrier'),
      'phase', pc -> 'phase',
      'montee', case when pc ->> 'type' = 'tournoi' then parami('tournoi_poule_qualifies') else parami('poule_montee') end,
      'descente', case when pc ->> 'type' = 'tournoi' or (pc ->> 'niveau')::int <= 1 then 0 else poule_descentes(jsonb_array_length(pc -> 'equipes')) end,
      'classement', (select jsonb_agg(jsonb_build_object('nom', x ->> 'nom', 'moi', coalesce((x ->> 'moi')::boolean, false),
          'j', x -> 'j', 'v', x -> 'v', 'n', x -> 'n', 'd', x -> 'd', 'bp', x -> 'bp', 'bc', x -> 'bc', 'pts', x -> 'pts',
          'force', round((x ->> 'f')::numeric)) order by o) from jsonb_array_elements(poule_classement(pc -> 'equipes')) with ordinality a(x, o)),
      'prochain', case when adv is null then null else jsonb_build_object('nom', pc -> 'equipes' -> adv ->> 'nom',
          'force', round((pc -> 'equipes' -> adv ->> 'f')::numeric), 'domicile', dom) end);
  elsif pc ->> 'type' = 'tournoi' then
    v := v || jsonb_build_object('phase', coalesce(pc ->> 'phase', 'finale'), 'tour', pc -> 'tour', 'adversaires',
      (select jsonb_agg(jsonb_build_object('nom', x ->> 'nom', 'force', round((x ->> 'f')::numeric)) order by o)
       from jsonb_array_elements(pc -> 'adversaires') with ordinality a(x, o)));
  else
    -- les 10 équipes de Légendes (demande de Maël, 20 nov. 2026) : Légende 1 à 99, puis +1 à chaque équipe, Légende 10 = le 7 de rêve
    rg := legende_rang(pc); le := param('legendes_equipes') -> (rg - 1);
    v := v || jsonb_build_object('v', pc -> 'v', 'd', pc -> 'd', 'manches', parami('legendes_manches'), 'nom', 'Légende ' || rg,
      'rang', rg, 'rangs', jsonb_array_length(param('legendes_equipes')), 'equipe', le ->> 'nom', 'max', legendes_max(pc),
      'force', le -> 'f', 'joueurs', (select jsonb_agg(x ->> 'n') from jsonb_array_elements(le -> 'joueurs') x));
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
    'equipe', p.equipe, 'remplacants', p.remplacants, 'tactique', p.tactique, 'compos', coalesce(p.compos, '[]'),
    'matchDirect', (select jsonb_build_object('type', d.etat ->> 'type', 'adversaire', d.etat #>> '{b,nom}', 'minute', (d.etat ->> 't')::int / 60,
      'score', d.etat -> 'score') from matchs_direct d where d.user_id = p.user_id),
    'invisible', p.invisible,
    'enLigne', (select coalesce(jsonb_agg(x.pseudo order by lower(x.pseudo)), '[]') from (select x.pseudo from profils x
      where x.vu_le > now() - make_interval(mins => parami('en_ligne_minutes')) and not x.invisible and x.pseudo is not null and x.user_id <> p.user_id
      order by x.vu_le desc limit 200) x),
    'pvp', jsonb_build_object('trophees', p.trophees,
      'match', (select m.id from pvp_matchs m where m.statut in ('propose', 'prepa', 'direct') and p.user_id in (m.a, m.b) order by m.cree_le desc limit 1),
      'file', (select extract(epoch from f.entree) from pvp_file f where f.user_id = p.user_id),
      'invitations', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'de', pr.pseudo,
          'reste', greatest(0, parami('pvp_invitation_secondes') - floor(extract(epoch from now() - i.cree_le))::int)) order by i.cree_le)
        from pvp_invitations i join profils pr on pr.user_id = i.de where i.pour = p.user_id and i.statut = 'attente'
          and i.cree_le > now() - make_interval(secs => parami('pvp_invitation_secondes'))), '[]')),
    'matchs', p.matchs, 'matchMax', parami('match_stock_max'),
    'prochainMatch', case when p.matchs >= parami('match_stock_max') then null
      else greatest(0, ceil(extract(epoch from p.matchs_maj + make_interval(mins => parami('match_minutes')) - now())))::int end,
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
      'messages', (select count(*) from messages_amis m where m.pour = p.user_id and not m.lu),
      'transferts', (select count(*) from transferts_faits t where t.b = p.user_id and t.le > coalesce(p.transferts_vus, '-infinity'))
        + (select count(*) from ventes v where v.vendeur = p.user_id and v.statut = 'vendue' and v.fini_le > coalesce(p.transferts_vus, '-infinity'))
        + (select count(*) from club_dons d where d.pour = p.user_id and d.le > coalesce(p.transferts_vus, '-infinity'))
        + (select count(*) from boite_faits b where b.user_id = p.user_id and b.fini_le > b.le + interval '2 seconds' and b.fini_le > coalesce(p.transferts_vus, '-infinity')),
      -- échanges de la boîte faits après coup (un autre joueur a déposé, ou l'heure est passée) : le jeu le dit au retour
      'boite', (select count(*) from boite_faits b where b.user_id = p.user_id and b.fini_le > b.le + interval '2 seconds' and b.fini_le > coalesce(p.transferts_vus, '-infinity')),
      -- demandes de mon club que je peux remplir (un doublon libre de ce joueur à ce palier)
      'clubDemandes', (select count(*) from club_demandes d join clubs_membres m on m.club = d.club and m.user_id = p.user_id
        where d.statut = 'ouverte' and d.user_id <> p.user_id and d.recu < d.voulu
          and d.cree_le > now() - make_interval(hours => parami('club_demande_duree_heures'))
          and (select count(*) from exemplaires x where x.proprietaire = p.user_id and x.carte_id = d.carte and x.palier = d.palier) >= 2
          and exists (select 1 from exemplaires x where x.proprietaire = p.user_id and x.carte_id = d.carte and x.palier = d.palier and x.verrou is null
            and not exists (select 1 from jsonb_each_text(p.equipe) j where j.value = x.id::text)
            and not exists (select 1 from jsonb_each_text(coalesce(p.remplacants, '{}')) j where j.value = x.id::text)))),
    'jour', jsonb_build_object(
      'championnat', (select count(*) from rencontres r where r.user_id = p.user_id and r.type = 'championnat' and r.le >= debut_du_jour()),
      'seance', (select count(*) from rencontres r where r.user_id = p.user_id and r.type = 'seance' and r.le >= debut_du_jour()),
      'defi', (select count(*) from rencontres r where r.user_id = p.user_id and r.type = 'defi' and r.le >= debut_du_jour())),
    'limites', jsonb_build_object('championnat', parami('pve_par_jour'), 'seance', parami('seances_par_jour'), 'defi', parami('defis_par_jour')),
    'exemplaires', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'carte', e.carte_id, 'palier', e.palier, 'note', e.note,
        'xp', e.xp, 'verrou', e.verrou, 'blessure', e.blessure, 'blessureG', e.blessure_g) order by e.obtenu_le) from exemplaires e where e.proprietaire = p.user_id), '[]'),
    'quetes', coalesce((select jsonb_agg(jsonb_build_object('id', q.quete, 'progres', least(q.progres, c.objectif), 'objectif', c.objectif,
        'xp', c.xp, 'pieces', c.pieces, 'texte', c.texte, 'reclamee', q.reclamee) order by c.id)
      from quetes q join quetes_catalogue() c on c.id = q.quete where q.user_id = p.user_id and q.jour = aujourdhui()), '[]'),
    'quetesSemaine', coalesce((select jsonb_agg(jsonb_build_object('id', q.quete, 'progres', least(q.progres, c.objectif), 'objectif', c.objectif,
        'xp', c.xp, 'pieces', c.pieces, 'texte', c.texte, 'reclamee', q.reclamee) order by c.id)
      from quetes_semaine q join quetes_semaine_catalogue() c on c.id = q.quete
      where q.user_id = p.user_id and q.lundi = date_trunc('week', aujourdhui())::date), '[]'),
    'finSemaine', date_trunc('week', aujourdhui())::date + 6,
    'semaine', semaine_vue(p.user_id), 'passe', passe_vue(p.user_id), 'defis', compo_vue(p.user_id),
    'legendes', coalesce((select jsonb_agg(to_jsonb(c)) from cartes c where c.legende
      and exists (select 1 from exemplaires e where e.proprietaire = p.user_id and e.carte_id = c.id)), '[]'),
    'capitaine', p.capitaine, 'albums', albums_vue(p.user_id),
    'staff', jsonb_build_object('actif', staff_actif(p.user_id), 'prix', parami('staff_prix'),
      'liste', (select jsonb_agg(staff_vue(k.id) || jsonb_build_object('meilleur', staff_meilleur(p.user_id, k.id),
        'exemplaires', (select coalesce(jsonb_object_agg(s.palier, s.n), '{}') from (select palier, count(*) n from staff_cartes where user_id = p.user_id and staff = k.id group by palier) s)))
        from (select id, row_number() over () ord from staff_catalogue()) k)),
    'perso', perso_public(p.user_id), 'persoDebloques', to_jsonb(perso_debloques(p.user_id)),
    'persoCatalogue', (select jsonb_agg(jsonb_build_object('id', k.id, 'type', k.type, 'nom', k.nom, 'condition', k.condition)) from perso_catalogue() k),
    'ligue', jsonb_build_object('division', p.ligue_div, 'nom', ligue_nom(p.ligue_div), 'meilleure', p.ligue_meilleure,
      'bilan', case when p.ligue_bilan is not null and not coalesce((p.ligue_bilan ->> 'vu')::boolean, false) then p.ligue_bilan end),
    'club', (select jsonb_build_object('id', c.id, 'nom', c.nom) from clubs c join clubs_membres m on m.club = c.id where m.user_id = p.user_id),
    'choixCoach', jsonb_build_object('prix', parami('choix_coach_prix'), 'parJour', parami('choix_coach_par_jour'),
      'faits', (select count(*) from mouvements m where m.user_id = p.user_id and m.quoi = 'choix-coach' and m.le >= debut_du_jour()),
      'attente', (select jsonb_build_object('poste', x.poste, 'cartes', x.cartes) from choix_coach x where x.user_id = p.user_id)))
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

-- Compos enregistrées (demande de Rémi, 23 nov. 2026) : 3 emplacements par joueur (profils.compos), chacun garde les titulaires et
-- les remplaçants (exemplaire + carte : un exemplaire fusionné ou vendu est remplacé au chargement par le meilleur exemplaire du même
-- joueur encore au club), le capitaine, la tactique et la carte staff
create or replace function compo_postes(p_uid uuid, p_postes jsonb) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(j.key, jsonb_build_object('ex', j.value, 'carte', x.carte_id)), '{}')
  from jsonb_each_text(coalesce(p_postes, '{}')) j join exemplaires x on x.id::text = j.value and x.proprietaire = p_uid
$$;
create or replace function compo_enregistrer(p_slot int) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); arr jsonb := case when jsonb_typeof(p.compos) = 'array' then p.compos else '[]' end;
begin
  if p_slot is null or p_slot < 1 or p_slot > 3 then raise exception 'Emplacement inconnu'; end if;
  if (select count(*) from jsonb_each(coalesce(p.equipe, '{}'))) = 0 then raise exception 'Aligne d''abord ton équipe'; end if;
  while jsonb_array_length(arr) < 3 loop arr := arr || 'null'::jsonb; end loop;
  arr := jsonb_set(arr, array[(p_slot - 1)::text], jsonb_build_object(
    'equipe', compo_postes(p.user_id, p.equipe), 'remplacants', compo_postes(p.user_id, p.remplacants),
    'capitaine', (select carte_id from exemplaires where id = p.capitaine and proprietaire = p.user_id),
    'tactique', p.tactique, 'staff', p.staff, 'le', now()));
  update profils set compos = arr where user_id = p.user_id;
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;
create or replace function compo_charger(p_slot int) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); c jsonb; eq jsonb := '{}'; rp jsonb := '{}'; pris text[] := '{}'; manque text[] := '{}'; l record; ex text; cap uuid;
begin
  if p_slot is null or p_slot < 1 or p_slot > 3 then raise exception 'Emplacement inconnu'; end if;
  c := case when jsonb_typeof(p.compos) = 'array' then p.compos -> (p_slot - 1) end;
  if c is null or jsonb_typeof(c) <> 'object' then raise exception 'Cette compo est vide'; end if;
  -- titulaires puis remplaçants : l'exemplaire enregistré s'il est encore au club, sinon le meilleur du même joueur ; il doit
  -- pouvoir jouer à ce poste (mêmes règles que verifier_equipe : au but s'il est gardien, sur le terrain s'il a un poste de champ)
  for l in select 'equipe' qui, j.key poste, j.value v from jsonb_each(coalesce(c -> 'equipe', '{}')) j
           union all select 'banc', j.key, j.value from jsonb_each(coalesce(c -> 'remplacants', '{}')) j order by 1 desc loop
    select x.id::text into ex from exemplaires x join cartes k on k.id = x.carte_id
      where x.proprietaire = p.user_id and x.carte_id = l.v ->> 'carte' and not (x.carte_id = any(pris))
        and case when l.poste = 'GB' then 'GB' = any(k.postes) else cardinality(k.postes) = 0 or exists (select 1 from unnest(k.postes) z where z <> 'GB') end
      order by (x.id::text = l.v ->> 'ex') desc, x.note desc limit 1;
    if ex is null then manque := manque || coalesce((select nom from cartes where id = l.v ->> 'carte'), '?');
    else
      pris := pris || (l.v ->> 'carte');
      if l.qui = 'equipe' then eq := eq || jsonb_build_object(l.poste, ex); else rp := rp || jsonb_build_object(l.poste, ex); end if;
    end if;
  end loop;
  perform verifier_equipe(p.user_id, eq);
  perform verifier_remplacants(p.user_id, eq, rp);
  select x.id into cap from jsonb_each_text(eq) j join exemplaires x on x.id::text = j.value where x.carte_id = c ->> 'capitaine' limit 1;
  update profils set equipe = eq, remplacants = rp, capitaine = cap,
    tactique = case when c ->> 'tactique' ~ '^(duels|enclenchement|rapide):(06|15|33)$' then c ->> 'tactique' else tactique end,
    staff = case when c ->> 'staff' is null or exists (select 1 from staff_cartes s where s.user_id = p.user_id and s.staff = c ->> 'staff') then c ->> 'staff' else staff end
    where user_id = p.user_id;
  perform listes_nettoyer(p.user_id);
  perform progresser(p.user_id, 'equipe');
  return jsonb_build_object('etat', etat_de(p.user_id), 'manquants', to_jsonb(manque));
end $$;
-- Retire de l'équipe et du banc les cartes qui n'y ont plus leur place (vendues, fusionnées, au marché)
create or replace function nettoyer_equipe(p_uid uuid) returns void language sql security definer set search_path = public as $$
  update profils set equipe = coalesce((select jsonb_object_agg(j.key, j.value) from jsonb_each(equipe) j
    where exists (select 1 from exemplaires e where e.id::text = j.value #>> '{}' and e.proprietaire = p_uid and e.verrou is null)), '{}'),
    remplacants = coalesce((select jsonb_object_agg(j.key, j.value) from jsonb_each(remplacants) j
    where exists (select 1 from exemplaires e where e.id::text = j.value #>> '{}' and e.proprietaire = p_uid and e.verrou is null)), '{}')
  where user_id = p_uid
$$;
-- une carte de l'équipe : titulaire ou remplaçant (ni à vendre, ni à échanger, ni à donner)
create or replace function en_equipe(p_uid uuid, p_ex text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils pr where pr.user_id = p_uid and (exists (select 1 from jsonb_each_text(pr.equipe) j where j.value = p_ex)
    or exists (select 1 from jsonb_each_text(pr.remplacants) j where j.value = p_ex)))
$$;
-- les remplaçants (un par poste) : mêmes règles que l'équipe, et jamais un joueur déjà titulaire
create or replace function verifier_remplacants(p_uid uuid, p_equipe jsonb, p_remp jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(p_remp) <> 'object' then raise exception 'Remplaçants invalides'; end if;
  perform verifier_equipe(p_uid, p_remp);
  if exists (select 1 from jsonb_each_text(p_remp) r join exemplaires er on er.id::text = r.value
      join jsonb_each_text(p_equipe) j on true join exemplaires ej on ej.id::text = j.value where er.carte_id = ej.carte_id) then
    raise exception 'Ce joueur est déjà titulaire';
  end if;
end $$;
-- après un changement de l'équipe : les remplaçants déjà titulaires (même joueur) quittent le banc
create or replace function banc_sans_titulaires(p_equipe jsonb, p_remp jsonb) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(r.key, r.value), '{}') from jsonb_each(p_remp) r
  where not exists (select 1 from exemplaires er join jsonb_each_text(p_equipe) j on true join exemplaires ej on ej.id::text = j.value
    where er.id::text = r.value #>> '{}' and er.carte_id = ej.carte_id)
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
    perform matchs_a_jour(auth.uid());
    perform quetes_du_jour(auth.uid());
    perform quetes_de_la_semaine(auth.uid());
    perform boite_servir();
    update profils set parcours = parcours_nouveau(1, null, pseudo) where user_id = auth.uid() and parcours is null;
    update profils set vu_le = now() where user_id = auth.uid();   -- en ligne
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
declare u uuid := auth.uid(); v_pseudo text;
begin
  if u is null then raise exception 'Connecte-toi d’abord'; end if;
  select pseudo into v_pseudo from profils where user_id = u;
  perform club_partir(u);   -- son club ne reste ni sans président(e), ni vide dans le classement
  delete from mouvements where user_id = u;
  -- son pseudo ne reste pas dans l'historique des matchs des autres (défis entre ami(e)s, ligue) : page de confidentialité
  if v_pseudo is not null then
    update rencontres set adversaire = 'Joueur supprimé'
      where user_id <> u and adversaire in (v_pseudo, 'Fantôme de ' || v_pseudo) and type in ('defi', 'defense', 'defi_ami', 'defense_ami', 'defense_ligue', 'pvp');
  end if;
  delete from auth.users where id = u;   -- efface aussi le profil, les cartes et les quêtes (en cascade)
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Cartes : boosters, fusion, entraînement, vente, équipe
-- ════════════════════════════════════════════════════════════════════════════

-- Booster de départ : 7 joueurs, un par poste, alignés tout de suite dans l'équipe
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
-- Une carte staff au hasard (palier tiré comme celui d'un joueur) ; la première va dans l'équipe. Renvoie {id, palier}.
create or replace function donner_staff_hasard(p_uid uuid, p_chances jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text; v_palier text := tirer_palier(p_chances);
begin
  select id into v_id from staff_catalogue() order by random() limit 1;
  insert into staff_cartes (user_id, staff, palier) values (p_uid, v_id, v_palier);
  update profils set staff = coalesce(staff_actif(p_uid), v_id) where user_id = p_uid;
  return jsonb_build_object('id', v_id, 'palier', v_palier);
end $$;

create or replace function ouvrir_booster(p_type text default 'gratuit') returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profils; c text; ex uuid; niveaux jsonb; st jsonb;
begin
  p := moi();
  perform boosters_a_jour(p.user_id);
  select * into p from profils where user_id = p.user_id;
  if p_type = 'gratuit' and p.boosters < 1 then raise exception 'Pas encore de booster : le prochain arrive bientôt'; end if;
  if p_type = 'bonus' and p.bonus < 1 then raise exception 'Pas de booster bonus'; end if;
  if p_type = 'or' and p.bonus_or < 1 then raise exception 'Pas de booster Or'; end if;
  if p_type not in ('gratuit', 'bonus', 'or') then raise exception 'Booster inconnu'; end if;
  -- booster gratuit : une légende du club, très rarement (seulement là, jamais annoncé dans le jeu)
  if p_type = 'gratuit' and random() < coalesce((param('legende_chance') #>> '{}')::numeric, 0) then
    select id into c from cartes where legende order by random() limit 1;
  end if;
  if c is not null then
    ex := creer_exemplaire(p.user_id, c, 'ultime', 'booster:legende');
    update exemplaires set note = greatest(palier_min('ultime'), least(100, parami('legende_note'))) where id = ex;
  elsif p_type = 'gratuit' and random() < coalesce((param('staff_chance') #>> '{}')::numeric, 0) then
    st := donner_staff_hasard(p.user_id, param('booster_chances'));   -- une carte staff (demande de Maël)
  else
    c := tirer_carte();
    if c is null then raise exception 'Le catalogue est vide'; end if;
    ex := creer_exemplaire(p.user_id, c, tirer_palier(param(case when p_type = 'or' then 'booster_or_chances' else 'booster_chances' end)), 'booster:' || p_type);
  end if;
  update profils set
    boosters = boosters - case when p_type = 'gratuit' then 1 else 0 end,
    -- stock plein : le compteur repart au moment où on ouvre
    boosters_maj = case when p_type = 'gratuit' and boosters >= parami('booster_stock_max') then now() else boosters_maj end,
    bonus = bonus - case when p_type = 'bonus' then 1 else 0 end,
    bonus_or = bonus_or - case when p_type = 'or' then 1 else 0 end,
    boosters_ouverts = boosters_ouverts + 1
  where user_id = p.user_id;
  perform progresser(p.user_id, 'booster');
  perform noter(p.user_id, 'booster', jsonb_build_object('type', p_type, 'exemplaire', ex, 'carte', c, 'staff', st));
  return jsonb_build_object('ids', case when ex is null then '[]'::jsonb else jsonb_build_array(ex) end, 'staff', st, 'etat', etat_de(p.user_id));
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
-- Report de l'entraînement (demande de Maël, 20 nov. 2026 : « si on entraîne un joueur jusqu'à 89 puis qu'on le fusionne, on perd tout
-- le bénéfice de l'entraînement ») : l'XP mise dans les cartes fusionnées (lue dans leur note : points au-dessus du bas du palier × XP
-- par point, plus l'XP en cours) est additionnée, et fusion_report (la moitié) passe à la nouvelle carte, au coût du palier suivant,
-- sans dépasser son plafond. À la moitié, monter des cartes basses pour les fusionner ne coûte jamais moins cher que d'entraîner
-- directement au palier du dessus (Or 89 + deux Or 75 → Ultime 94 ; Argent 74 → Or 80 ; Bronze 59 → Argent 63)
-- Listes de transferts : une ligne « à donner » dont le joueur n'a plus de carte libre (fusionnée, vendue, échangée, alignée dans
-- l'équipe) s'en va d'elle-même. Avant (bug signalé par un joueur, 19 nov. 2026), elle restait, et l'enregistrement des listes,
-- qui revérifie chaque ligne, refusait toute modification : avec deux lignes mortes, on ne pouvait même plus les retirer.
create or replace function listes_nettoyer(p_uid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  delete from listes_transfert l where l.user_id = p_uid and l.sens = 'donne' and libres_nombre(p_uid, l.carte, l.palier) = 0;
end $$;
create or replace function fusionner(p_carte text, p_palier text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); suivant text := palier_suivant(p_palier); n int := parami('fusion_nombre'); cout int;
  pris uuid[]; ex uuid; e jsonb; niveaux jsonb; report int;
begin
  if suivant is null then raise exception 'Une carte Ultime ne peut plus fusionner : entraîne-la jusqu’à 99'; end if;
  cout := (param('fusion_cout') ->> p_palier)::int;
  if p.pieces < cout then raise exception 'Il faut % pièces pour cette fusion', cout; end if;
  -- les moins entraînés (on garde les plus forts) ; à égalité, d'abord ceux qui ne jouent pas dans l'équipe (titulaires et remplaçants)
  select array_agg(id) into pris from (
    select e2.id from exemplaires e2 where e2.proprietaire = p.user_id and e2.carte_id = p_carte and e2.palier = p_palier and e2.verrou is null
    order by e2.note, e2.xp, en_equipe(p.user_id, e2.id::text) limit n) t;
  if coalesce(cardinality(pris), 0) < n then raise exception 'Il faut % exemplaires libres de ce joueur au même palier', n; end if;
  select floor(coalesce((param('fusion_report') #>> '{}')::numeric, 0)
      * sum(greatest(0, x.note - palier_min(x.palier)) * (param('xp_par_point') ->> x.palier)::int + x.xp))::int
    into report from exemplaires x where x.id = any(pris);
  ex := creer_exemplaire(p.user_id, p_carte, suivant, 'fusion');
  if coalesce(report, 0) > 0 then perform xp_carte(ex, report); end if;
  -- si un des exemplaires fusionnés jouait dans l'équipe (ou sur le banc), le nouveau prend sa place
  select coalesce(jsonb_object_agg(j.key, case when j.value #>> '{}' = any(pris::text[]) then to_jsonb(ex::text) else j.value end), '{}')
    into e from jsonb_each(p.equipe) j;
  delete from exemplaires where id = any(pris);
  update profils set pieces = pieces - cout, equipe = e,
    remplacants = banc_sans_titulaires(e, coalesce((select jsonb_object_agg(j.key, case when j.value #>> '{}' = any(pris::text[]) then to_jsonb(ex::text) else j.value end)
      from jsonb_each(p.remplacants) j), '{}'))
    where user_id = p.user_id;
  perform listes_nettoyer(p.user_id);
  perform progresser(p.user_id, 'fusion');
  niveaux := gagner_xp(p.user_id, parami('xp_fusion'));
  perform noter(p.user_id, 'fusion', jsonb_build_object('carte', p_carte, 'de', p_palier, 'vers', suivant, 'cout', cout, 'exemplaire', ex, 'report', report));
  return jsonb_build_object('id', ex, 'report', report, 'niveaux', niveaux, 'etat', etat_de(p.user_id));
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
  perform xp_carte(p_ex, round(parami('entrainement_xp') * (1 + staff_val(p.user_id, 'prepa') / 100.0))::int);   -- préparateur physique
  select note into apres from exemplaires where id = p_ex;
  perform progresser(p.user_id, 'entrainement');
  niveaux := gagner_xp(p.user_id, parami('xp_entrainement'));
  perform noter(p.user_id, 'entrainement', jsonb_build_object('exemplaire', p_ex, 'cout', cout, 'note', apres));
  return jsonb_build_object('avant', e.note, 'apres', apres, 'niveaux', niveaux, 'etat', etat_de(p.user_id));
end $$;

-- Vend un exemplaire (pas s'il joue dans l'équipe, remplaçants compris, ni s'il est au marché)
create or replace function vendre(p_ex uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); e exemplaires; gain int;
begin
  select * into e from exemplaires where id = p_ex and proprietaire = p.user_id;
  if not found then raise exception 'Carte absente de ton club'; end if;
  if e.verrou is not null then raise exception 'Cette carte est en vente au marché des transferts'; end if;
  if en_equipe(p.user_id, p_ex::text) then
    raise exception 'Cette carte joue dans ton équipe (titulaire ou remplaçant) : retire-la d’abord';
  end if;
  gain := (param('vente') ->> e.palier)::int;
  delete from exemplaires where id = p_ex;
  update profils set pieces = pieces + gain where user_id = p.user_id;
  perform listes_nettoyer(p.user_id);
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
  update profils set equipe = e, remplacants = banc_sans_titulaires(e, remplacants) where user_id = p.user_id;
  perform progresser(p.user_id, 'equipe');
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;

create or replace function aligner_equipe(p_equipe jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  perform verifier_equipe(p.user_id, p_equipe);
  update profils set equipe = p_equipe, remplacants = banc_sans_titulaires(p_equipe, remplacants) where user_id = p.user_id;
  perform listes_nettoyer(p.user_id);
  perform progresser(p.user_id, 'equipe');
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;
-- l'équipe et ses remplaçants ensemble (demande de Maël : un remplaçant à chaque poste) ; sert aussi à échanger un titulaire et son remplaçant
create or replace function aligner_remplacants(p_equipe jsonb, p_remplacants jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  perform verifier_equipe(p.user_id, p_equipe);
  perform verifier_remplacants(p.user_id, p_equipe, p_remplacants);
  if exists (select 1 from jsonb_each_text(p_remplacants) r join jsonb_each_text(p_equipe) j on j.value = r.value) then
    raise exception 'Une carte ne peut pas être titulaire et remplaçante';
  end if;
  update profils set equipe = p_equipe, remplacants = p_remplacants,
    capitaine = case when exists (select 1 from jsonb_each_text(p_equipe) j where j.value = capitaine::text) then capitaine end
    where user_id = p.user_id;
  perform listes_nettoyer(p.user_id);
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
  tireurs jsonb := '[]'; joueurs jsonb := '{}'; eqs jsonb := '{}'; maxi int; coll int; moy jsonb; b_att numeric; b_def numeric;
  m_tir numeric := 0; m_pas numeric := 0; m_def numeric := 0; m_men numeric := 0; m_phy numeric := 0; m_vit numeric := 0;
  s_tir numeric; s_pas numeric; s_vit numeric; s_def numeric; s_phy numeric; s_men numeric; s_ref numeric; s_pla numeric; s_rel numeric; ne int;
  proprio uuid; cap uuid; st text; sv int := 0; nts jsonb := '{}'; nleg_m int := 0; nleg_f int := 0; nleg_x int := 0; t text;
begin
  -- l'équipe d'un joueur : son capitaine et son staff comptent
  select e.proprietaire into proprio from jsonb_each_text(p_equipe) j join exemplaires e on e.id::text = j.value limit 1;
  if proprio is not null then
    select capitaine into cap from profils where user_id = proprio;
    st := staff_actif(proprio); sv := staff_val(proprio, st);
  end if;
  for l in select j.key as slot, e.id eid, e.note, c.postes, c.nom, c.equipe, c.equipes, c.legende, c.ecarts, en_forme(c.id) forme, c.site ->> 'genre' genre
      from jsonb_each_text(p_equipe) j join exemplaires e on e.id::text = j.value join cartes c on c.id = e.carte_id loop
    -- −5 hors de ses postes (un joueur sans poste renseigné joue partout sans malus) ; joueur de la semaine : +3 (au plus 99)
    ne := l.note - case when l.slot <> 'GB' and cardinality(l.postes) > 0 and not (l.slot = any(l.postes)) then case when st = 'polyvalent' then sv else 5 end else 0 end;
    if l.forme and ne < 99 then ne := least(99, ne + parami('semaine_forme')); end if;
    if l.eid = cap then ne := ne + parami('capitaine_bonus') + case when st = 'mental' then sv else 0 end; end if;   -- capitaine : +2 (plus le préparateur mental)
    -- carte staff : entraîneur des gardiens, coach des ailiers, coach de la base arrière
    ne := ne + case when st = 'gardiens' and l.slot = 'GB' or st = 'ailiers' and l.slot in ('AG', 'AD') or st = 'base' and l.slot in ('ARG', 'DC', 'ARD') then sv else 0 end;
    n := n + 1; notes := notes + ne; joueurs := joueurs || jsonb_build_object(l.slot, l.nom); nts := nts || jsonb_build_object(l.slot, ne);
    -- coéquipier(e)s : un joueur compte pour chacune de ses équipes, une légende pour toutes celles de son genre
    if l.legende then
      if l.genre = 'M' then nleg_m := nleg_m + 1; elsif l.genre = 'F' then nleg_f := nleg_f + 1; else nleg_x := nleg_x + 1; end if;
    else foreach t in array equipes_de(l.equipe, l.equipes) loop eqs := jsonb_set(eqs, array[t], to_jsonb(coalesce((eqs ->> t)::int, 0) + 1)); end loop;
    end if;
    s_men := stat_note(ne, (l.ecarts ->> 'men')::numeric);
    s_phy := stat_note(ne, (l.ecarts ->> 'phy')::numeric);
    s_vit := stat_note(ne, (l.ecarts ->> 'vit')::numeric);
    -- chaque stat compte en attaque ET en défense (demande de Maël, 20 nov. 2026 : avant, l'attaque ne venait que de TIR, PAS,
    -- VIT et la défense que de DÉF, PHY, MEN ; un joueur au profil extrême valait bien plus qu'un autre de même note). Les stats
    -- « d'attaque » pèsent un peu plus en attaque, celles « de défense » un peu plus en défense ; sur attaque + défense, chaque stat
    -- pèse presque autant (0,30 à 0,35) : à note égale, les joueurs se valent beaucoup plus (écart entre cartes divisé par 2 à 4)
    if l.slot = 'GB' then
      s_ref := stat_note(ne, (l.ecarts ->> 'ref')::numeric);
      s_pla := stat_note(ne, (l.ecarts ->> 'pla')::numeric);
      s_rel := stat_note(ne, (l.ecarts ->> 'rel')::numeric);
      arr := .30 * s_ref + .20 * s_pla + .15 * s_men + .15 * s_rel + .10 * s_phy + .10 * s_vit;
    else
      s_tir := stat_note(ne, (l.ecarts ->> 'tir')::numeric);
      s_pas := stat_note(ne, (l.ecarts ->> 'pas')::numeric);
      s_def := stat_note(ne, (l.ecarts ->> 'def')::numeric);
      att := att + (.25 * s_tir + .20 * s_pas + .15 * s_vit + .15 * s_men + .15 * s_phy + .10 * s_def) / 6;
      def := def + (.25 * s_def + .20 * s_phy + .15 * s_men + .15 * s_vit + .15 * s_pas + .10 * s_tir) / 6;
      m_tir := m_tir + s_tir / 6; m_pas := m_pas + s_pas / 6; m_def := m_def + s_def / 6;
      m_men := m_men + s_men / 6; m_phy := m_phy + s_phy / 6; m_vit := m_vit + s_vit / 6;
      tireurs := tireurs || jsonb_build_object('n', l.nom, 'p', greatest(1, s_tir - 25));
    end if;
  end loop;
  if n < 7 then raise exception 'Il faut 7 joueurs alignés dans ton équipe pour jouer'; end if;
  select greatest(coalesce(max(value::int + case equipe_genre(key) when 'M' then nleg_m when 'F' then nleg_f else nleg_m + nleg_f end), 0),
      nleg_m, nleg_f) + nleg_x into maxi from jsonb_each_text(eqs);
  coll := case when maxi >= 7 then 3 when maxi >= 5 then 2 when maxi >= 3 then 1 else 0 end;   -- coéquipier(e)s
  moy := jsonb_build_object('tir', round(m_tir, 1), 'pas', round(m_pas, 1), 'def', round(m_def, 1), 'men', round(m_men, 1), 'phy', round(m_phy, 1), 'vit', round(m_vit, 1));
  b_att := tactique_bonus(moy, split_part(coalesce(p_tactique, ''), ':', 1));
  b_def := tactique_bonus(moy, split_part(coalesce(p_tactique, ''), ':', 2));
  return jsonb_build_object(
    'att', round((note_depuis_stat(att) + coll) * (1 + b_att) * case when st = 'adjoint' then 1 + .01 * sv else 1 end, 1),
    'def', round((note_depuis_stat(.6 * def + .4 * arr) + coll) * (1 + b_def) * case when st = 'defense' then 1 + .01 * sv else 1 end, 1),
    'note', least(99, round(notes / n + coll)), 'tireurs', tireurs, 'joueurs', joueurs, 'moyennes', moy, 'bonus', jsonb_build_object('attaque', b_att, 'defense', b_def),
    -- note de chaque joueur à son poste et collectif : ce que le jeu recalcule de son côté (noteAuPoste, noteEquipe dans app.js) ;
    -- tests/test_parite.js compare les deux sur des centaines d'équipes au hasard
    'notes', nts, 'collectif', coll);
end $$;

-- Équipe de l'ordinateur d'un niveau donné
create or replace function equipe_ordi(p_niveau numeric) returns jsonb language sql volatile as $$
  select jsonb_build_object('att', round((p_niveau + random() * 2 - 1)::numeric, 1), 'def', round((p_niveau + random() * 2 - 1)::numeric, 1), 'note', round(p_niveau),
    'tireurs', (select jsonb_agg(jsonb_build_object('n', 'n°' || k, 'p', 10)) from unnest(array[3, 7, 9, 10, 14, 21]) k),
    'joueurs', '{"AG": "n°9", "ARG": "n°10", "DC": "n°7", "ARD": "n°14", "AD": "n°21", "PIV": "n°3", "GB": "n°1"}'::jsonb)
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
-- puis International (une phase de poule, puis élimination directe) et enfin les Légendes du handball.
-- profils.parcours garde la saison en cours :
--   poule    {niveau, type, saison, journee, equipes: [{nom, f, j, v, n, d, bp, bc, pts, moi?}], calendrier: [[[dom, ext], …], …]}
--   tournoi  {niveau, type, saison, phase 'poule' (comme une poule : journee, equipes, calendrier) puis 'finale' :
--             tour (0 quart, 1 demie, 2 finale), adversaires: [{nom, f}]} ; sans phase (tirés avant le 20 nov. 2026) = élimination directe
--   legendes {niveau, type, saison, v, d}
-- et toujours : international (plus de descente une fois sorti de Nationale 1), meilleur (plus haut niveau atteint),
-- palmares [{titre, saison}], legendes_battues.
-- ════════════════════════════════════════════════════════════════════════════

-- Calendrier aller-retour (méthode du cercle) : chacun rencontre tout le monde, une fois à domicile, une fois à l'extérieur
-- Calendrier aller-retour (méthode du cercle). Nombre impair d'équipes (poules qui grandissent d'une équipe par niveau) :
-- une équipe fantôme sert d'exemption ; la journée où le joueur (équipe 0) serait exempt est jouée avec la suivante,
-- pour qu'il joue à chaque journée. Chacun joue 2 × (n − 1) matchs, une fois à domicile et une fois à l'extérieur contre chaque équipe.
create or replace function calendrier(n int, tours int) returns jsonb language plpgsql immutable as $$
declare brut jsonb; cal jsonb := '[]'; jr jsonb; attente jsonb := '[]';
begin
  if n % 2 = 0 then return calendrier_pair(n, tours); end if;
  brut := calendrier_pair(n + 1, tours);
  for jr in select (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements(j) x where (x ->> 0)::int < n and (x ->> 1)::int < n)
            from jsonb_array_elements(brut) j loop
    if exists (select 1 from jsonb_array_elements(jr) x where (x ->> 0)::int = 0 or (x ->> 1)::int = 0) then
      cal := cal || jsonb_build_array(attente || jr); attente := '[]';
    else attente := attente || jr;   -- journée d'exemption du joueur : jouée avec la suivante
    end if;
  end loop;
  if jsonb_array_length(attente) > 0 then   -- exemption à la toute fin : avec la dernière journée
    cal := jsonb_set(cal, array[(jsonb_array_length(cal) - 1)::text], (cal -> (jsonb_array_length(cal) - 1)) || attente);
  end if;
  return cal;
end $$;
create or replace function calendrier_pair(n int, tours int) returns jsonb language plpgsql immutable as $$
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
    -- phase de poule (demande de Maël, 20 nov. 2026 : « le jeu se fait trop rapidement ») : tournoi_poule_equipes équipes, chacun
    -- rencontre les autres (tournoi_poule_tours fois), les tournoi_poule_qualifies premiers vont en quart de finale
    n := parami('tournoi_poule_equipes'); ec := parami('poule_ecart');
    select array_agg(x) into noms from (select x from jsonb_array_elements_text(nv -> 'equipes') x order by random() limit n - 1) y;
    eqs := jsonb_build_array(jsonb_build_object('nom', p_pseudo, 'moi', true, 'j', 0, 'v', 0, 'n', 0, 'd', 0, 'bp', 0, 'bc', 0, 'pts', 0));
    for i in 1..n - 1 loop
      eqs := eqs || jsonb_build_array(jsonb_build_object('nom', coalesce(noms[i], 'Sélection ' || i),
        'f', round((base - ec + 2 * ec * (i - 1) / greatest(1, n - 2) + random() - .5)::numeric, 1),
        'j', 0, 'v', 0, 'n', 0, 'd', 0, 'bp', 0, 'bc', 0, 'pts', 0));
    end loop;
    return pc || jsonb_build_object('phase', 'poule', 'tour', 0, 'journee', 0, 'equipes', eqs, 'calendrier', calendrier(n, parami('tournoi_poule_tours')));
  else
    return pc || jsonb_build_object('v', 0, 'd', 0, 'legende', legende_rang(p_ancien), 'legendes_max', legendes_max(p_ancien));
  end if;
end $$;

-- le tableau final d'un tournoi (quart, demie, finale) : des équipes de la compétition, de préférence hors de la poule
create or replace function tournoi_tableau(nv jsonb, p_exclure jsonb) returns jsonb language sql volatile security definer set search_path = public as $$
  select jsonb_agg(jsonb_build_object('nom', z.x, 'f', (nv ->> 'base')::numeric + parami('tournoi_ecart') * (z.rg - 2)) order by z.rg)
  from (select y.x, row_number() over () rg from (select x from jsonb_array_elements_text(nv -> 'equipes') x
    order by (select count(*) from jsonb_array_elements(coalesce(p_exclure, '[]')) e where e ->> 'nom' = x), random() limit 3) y) z
$$;
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

-- Tirs au but choisis (demande de Maël, 23 nov. 2026, après le retour de Guit : « j'ai perdu les 5 ou 6 dernières séances ») : un nul en
-- tournoi (tableau final) ou contre une Légende arrête le match sur un menu ; le joueur choisit 5 tireurs (seul leur TIR compte) et son
-- gardien (moyenne de MENTAL et RÉFLEXES). Chance de marquer = 72 % + 1 % par point d'écart entre le tireur et le gardien d'en face
-- (50 à 90 %) ; l'adversaire (sans stats par joueur) tire et garde selon sa note. 5 tirs chacun, puis mort subite (les tireurs reviennent
-- dans l'ordre). « Simuler » choisit tout seul : les 5 meilleurs TIR et le meilleur gardien.
create or replace function tab_requis(p_uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select parcours ->> 'type' = 'legendes' or (parcours ->> 'type' = 'tournoi' and coalesce(parcours ->> 'phase', 'finale') <> 'poule')
    from profils where user_id = p_uid), false)
$$;
create or replace function match_tab_candidats(e jsonb) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare j jsonb; nb numeric := coalesce((e #>> '{b,note}')::numeric, ((e #>> '{b,att}')::numeric + (e #>> '{b,def}')::numeric) / 2, 75);
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nom', c.nom, 'poste', s.poste, 'titulaire', s.tit,
      'tir', stat_note(x.note, (c.ecarts ->> 'tir')::numeric),
      'gb', case when 'GB' = any(c.postes) then round((stat_note(x.note, (c.ecarts ->> 'men')::numeric) + stat_note(x.note, (c.ecarts ->> 'ref')::numeric)) / 2.0) end)
    order by s.tit desc, s.ord), '[]') into j
  from (select q.value id, q.key poste, true tit, array_position(array['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB'], q.key) ord from jsonb_each_text(coalesce(e -> 'a' -> 'equipe', '{}')) q
        union all select q.value, q.key, false, 7 + array_position(array['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB'], q.key) from jsonb_each_text(coalesce(e -> 'a' -> 'banc', '{}')) q) s
  join exemplaires x on x.id::text = s.id join cartes c on c.id = x.carte_id
  where not (coalesce(e -> 'a' -> 'blesses', '[]') ? s.id);
  return jsonb_build_object('joueurs', j, 'adversaire', jsonb_build_object('nom', e #>> '{b,nom}', 'tir', stat_note(nb, 0), 'gb', stat_note(nb, 0)));
end $$;
-- la séance : p_tireurs (exemplaires, dans l'ordre) et p_gardien ; null = choix automatique (Simuler)
create or replace function match_tab_jouer(e jsonb, p_tireurs text[], p_gardien text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare cand jsonb := match_tab_candidats(e); js jsonb := cand -> 'joueurs'; adv jsonb := cand -> 'adversaire'; tirs numeric[] := '{}'; noms text[] := '{}';
  gbn numeric := 50; gnom text; n int; i int := 0; k int; a int := 0; b int := 0; ok boolean; okb boolean; seq jsonb := '[]'; t text;
begin
  if p_gardien is null then
    select x ->> 'id' into p_gardien from jsonb_array_elements(js) x where x ->> 'gb' is not null order by (x ->> 'gb')::numeric desc limit 1;
  end if;
  if p_tireurs is null then
    select array_agg(id) into p_tireurs from (select x ->> 'id' id from jsonb_array_elements(js) x where x ->> 'id' is distinct from p_gardien
      order by (x ->> 'tir')::numeric desc limit 5) z;
  end if;
  select (x ->> 'gb')::numeric, x ->> 'nom' into gbn, gnom from jsonb_array_elements(js) x where x ->> 'id' = p_gardien;
  gbn := coalesce(gbn, 50);
  foreach t in array coalesce(p_tireurs, '{}') loop
    select tirs || (x ->> 'tir')::numeric, noms || (x ->> 'nom') into tirs, noms from jsonb_array_elements(js) x where x ->> 'id' = t;
  end loop;
  n := coalesce(array_length(tirs, 1), 0);
  if n = 0 then tirs := array[50]; noms := array['?']; n := 1; end if;
  loop
    i := i + 1; k := (i - 1) % n + 1;
    ok := random() < least(.9, greatest(.5, .72 + .01 * (tirs[k] - (adv ->> 'gb')::numeric)));
    okb := random() < least(.9, greatest(.5, .72 + .01 * ((adv ->> 'tir')::numeric - gbn)));
    a := a + ok::int; b := b + okb::int;
    seq := seq || jsonb_build_object('n', noms[k], 'a', ok, 'b', okb);
    exit when i >= 5 and a <> b;
    exit when i < 5 and (a > b + 5 - i or b > a + 5 - i);
    exit when i > 40;
  end loop;
  if a = b then a := a + 1; end if;
  return (e - 'tab_attente' - 'tab_jeu') || jsonb_build_object('tab', jsonb_build_object('a', a, 'b', b, 'tirs', seq, 'gardien', gnom,
    'adversaire', adv));
end $$;
-- le choix du joueur, depuis le menu des tirs au but : 5 tireurs différents (moins s'il n'en a pas assez), son gardien à part ;
-- p_jouer (demande de Maël, 24 nov. 2026) : la séance se joue tir par tir aux mini-jeux (match_tab_tir) au lieu d'être tirée d'un coup
drop function if exists match_tirs_au_but(text[], text);
create or replace function match_tirs_au_but(p_tireurs text[], p_gardien text, p_jouer boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); cur matchs_direct; e jsonb; js jsonb; nmax int; n int := jsonb_array_length(coalesce((select etat -> 'ev' from matchs_direct where user_id = auth.uid()), '[]'));
begin
  select * into cur from matchs_direct where user_id = p.user_id for update;
  if not found then raise exception 'Pas de match en cours'; end if;
  e := cur.etat;
  if not coalesce((e ->> 'tab_attente')::boolean, false) then raise exception 'Pas de tirs au but à jouer'; end if;
  js := match_tab_candidats(e) -> 'joueurs';
  if p_gardien is null or not exists (select 1 from jsonb_array_elements(js) x where x ->> 'id' = p_gardien and x ->> 'gb' is not null) then
    raise exception 'Choisis un gardien de ton équipe';
  end if;
  select least(5, count(*)) into nmax from jsonb_array_elements(js) x where x ->> 'id' <> p_gardien;
  if coalesce(array_length(p_tireurs, 1), 0) <> nmax or (select count(distinct t) from unnest(p_tireurs) t) <> nmax
     or exists (select 1 from unnest(p_tireurs) t where t = p_gardien or not exists (select 1 from jsonb_array_elements(js) x where x ->> 'id' = t)) then
    raise exception 'Choisis % tireurs différents de ton équipe (pas ton gardien)', nmax;
  end if;
  if p_jouer then
    e := match_tab_preparer(e, p_tireurs, p_gardien);
    update matchs_direct set etat = e, maj = now() where user_id = p.user_id;
    return jsonb_build_object('tabJeu', match_tab_vue(e));
  end if;
  e := match_tab_jouer(e, p_tireurs, p_gardien);
  return match_conclure(p.user_id, e, coalesce((e ->> 'tab_gain')::numeric, 1)) || jsonb_build_object('vue', match_vue(e, n));
end $$;
-- tirs au but joués aux mini-jeux (demande de Maël, 24 nov. 2026) : on tire et l'adversaire tire chacun son tour (nous d'abord), 5 chacun
-- puis mort subite avec les mêmes tireurs dans l'ordre ; notre tir = mini-jeu du jet de 7 m contre leur gardien, leur tir = mini-jeu de
-- l'arrêt (même duel que les jets de 7 m du match, sept_duel : TIR de nos tireurs, MEN et RÉF de notre gardien, l'adversaire à sa note)
create or replace function match_tab_preparer(e jsonb, p_tireurs text[], p_gardien text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare cand jsonb := match_tab_candidats(e); js jsonb := cand -> 'joueurs'; adv jsonb := cand -> 'adversaire'; t text;
  noms jsonb := '[]'; tirs jsonb := '[]'; gbn numeric; gnom text;
begin
  select (x ->> 'gb')::numeric, x ->> 'nom' into gbn, gnom from jsonb_array_elements(js) x where x ->> 'id' = p_gardien;
  foreach t in array p_tireurs loop
    select noms || to_jsonb(x ->> 'nom'), tirs || (x -> 'tir') into noms, tirs from jsonb_array_elements(js) x where x ->> 'id' = t;
  end loop;
  e := e || jsonb_build_object('tab_jeu', jsonb_build_object('noms', noms, 'tirs', tirs, 'gardien', gnom, 'gb', coalesce(gbn, 50), 'adv', adv,
    'na', 0, 'nb', 0, 'a', 0, 'b', 0, 'seq', '[]'::jsonb));
  return match_tab_prochain(e);
end $$;
-- le tir suivant : le nôtre (tireur suivant, contre leur gardien) ou le leur (où et à quelle vitesse, contre notre gardien)
create or replace function match_tab_prochain(e jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare tj jsonb := e -> 'tab_jeu'; na int := (tj ->> 'na')::int; nb int := (tj ->> 'nb')::int; n int := jsonb_array_length(tj -> 'noms'); k jsonb;
  vt numeric; vg numeric;
begin
  if na <= nb then   -- à nous
    k := jsonb_build_object('qui', 'a', 'n', tj -> 'noms' ->> (na % n), 'tir', tj -> 'tirs' -> (na % n), 'gb', tj #> '{adv,gb}', 'num', na + 1);
  else
    vt := (tj #>> '{adv,tir}')::numeric; vg := (tj ->> 'gb')::numeric;
    k := jsonb_build_object('qui', 'b', 'n', 'Tireur ' || (nb % 5 + 1), 'tir', vt, 'gb', vg, 'num', nb + 1,
      'col', case when random() < .35 then 'g' when random() < .54 then 'd' else 'c' end, 'hau', case when random() < .5 then 'h' else 'b' end,
      'duree', greatest(480, least(1100, round(900 - 6 * (vt - vg) - random() * 150))));
  end if;
  return jsonb_set(e, '{tab_jeu,k}', k);
end $$;
-- ce que le jeu voit de la séance (le tir à arrêter compris, comme pour un jet de 7 m du match)
create or replace function match_tab_vue(e jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('a', tj -> 'a', 'b', tj -> 'b', 'na', tj -> 'na', 'nb', tj -> 'nb', 'seq', tj -> 'seq', 'gardien', tj -> 'gardien',
    'adversaire', tj #> '{adv,nom}', 'k', tj -> 'k', 'max', least(5, jsonb_array_length(tj -> 'noms')))
  from (select e -> 'tab_jeu' tj) z
$$;
-- un tir de la séance : p_entrees = notre tir (x, y, puissance) ou notre arrêt (colonne, hauteur, temps), selon le tour
create or replace function match_tab_tir(p_entrees jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); cur matchs_direct; e jsonb; tj jsonb; k jsonb; d jsonb; but boolean; na int; nb int; a int; b int; seq jsonb; fini boolean;
  n0 int; lim int := 5;
begin
  select * into cur from matchs_direct where user_id = p.user_id for update;
  if not found then raise exception 'Pas de match en cours'; end if;
  e := cur.etat; tj := e -> 'tab_jeu';
  if tj is null then raise exception 'Pas de tirs au but à jouer'; end if;
  if jsonb_typeof(p_entrees) is distinct from 'object' then raise exception 'Tir invalide'; end if;
  n0 := jsonb_array_length(coalesce(e -> 'ev', '[]'));
  k := tj -> 'k';
  if k ->> 'qui' = 'a' then
    if not (p_entrees ? 'x' and p_entrees ? 'y' and p_entrees ? 'puissance') then raise exception 'Tir invalide'; end if;
    d := sept_duel(k, p_entrees - 'long', null);
  else
    if not coalesce(p_entrees ->> 'colonne' in ('g', 'c', 'd') and p_entrees ->> 'hauteur' in ('h', 'b'), false) then raise exception 'Arrêt invalide'; end if;
    d := sept_duel(k, null, p_entrees);
  end if;
  but := d ->> 'resultat' = 'but';
  na := (tj ->> 'na')::int; nb := (tj ->> 'nb')::int; a := (tj ->> 'a')::int; b := (tj ->> 'b')::int; seq := tj -> 'seq';
  if k ->> 'qui' = 'a' then
    na := na + 1; a := a + but::int; seq := seq || jsonb_build_object('n', k ->> 'n', 'a', but);
  else
    nb := nb + 1; b := b + but::int;
    seq := jsonb_set(seq, array[(jsonb_array_length(seq) - 1)::text], (seq -> (jsonb_array_length(seq) - 1)) || jsonb_build_object('b', but));
  end if;
  -- 5 tirs chacun, même avec moins de tireurs (ils tirent dans l'ordre), puis mort subite
  fini := (na <= lim and nb <= lim and (a > b + (lim - nb) or b > a + (lim - na)))
       or (na > lim and na = nb and a <> b) or (na = lim and nb = lim and a <> b) or na > 40;
  tj := tj || jsonb_build_object('na', na, 'nb', nb, 'a', a, 'b', b, 'seq', seq);
  d := d || jsonb_build_object('qui', k ->> 'qui', 'n', k ->> 'n');
  if not fini then
    e := match_tab_prochain(jsonb_set(e, '{tab_jeu}', tj));
    update matchs_direct set etat = e, maj = now() where user_id = p.user_id;
    return jsonb_build_object('tir', d, 'tabJeu', match_tab_vue(e));
  end if;
  if a = b then a := a + 1; end if;
  e := (e - 'tab_attente' - 'tab_jeu') || jsonb_build_object('tab', jsonb_build_object('a', a, 'b', b, 'tirs', seq, 'gardien', tj ->> 'gardien', 'adversaire', tj -> 'adv'));
  return match_conclure(p.user_id, e, coalesce((e ->> 'tab_gain')::numeric, 1)) || jsonb_build_object('vue', match_vue(e, n0), 'tir', d, 'joue', true);
end $$;
-- Un match du parcours : la journée de la poule, le tour du tournoi ou une manche contre les Légendes
create or replace function championnat_conclure(p_uid uuid, p_tactique text, fa jsonb, fb_m jsonb, r jsonb, p_gain numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profils; pc jsonb; nv jsonb; niv int; typ text; mult numeric; fb jsonb; res text;
  adv text; fadv numeric; dom boolean; eqs jsonb; m jsonb; a int; b int; sc int[]; j int; t int; tab jsonb; rang int; n int;
  montee boolean; descente boolean; nouveau int; passe boolean; etape jsonb; v int; d int; gagnes int;
  xp int; xpc int; v_pieces int; pts int := null; recompense int := 0; bonus_b int := 0; bonus_o int := 0;
  progres jsonb; niveaux jsonb; fin jsonb := null; titre text; rg int; le jsonb; premiere boolean;
begin
  select * into p from profils where user_id = p_uid;
  pc := coalesce(p.parcours, parcours_nouveau(1, null, p.pseudo));
  niv := (pc ->> 'niveau')::int; nv := param('parcours') -> (niv - 1); typ := pc ->> 'type';
  mult := 1 + (niv - 1) / 4.0;   -- les gains grandissent avec le niveau : ×1 en Promotion, ×4 contre les Légendes

  if typ = 'poule' or (typ = 'tournoi' and pc ->> 'phase' = 'poule') then
    j := (pc ->> 'journee')::int; eqs := pc -> 'equipes';
    for m in select x from jsonb_array_elements(pc -> 'calendrier' -> j) x loop
      a := (m ->> 0)::int; b := (m ->> 1)::int;
      if a = 0 or b = 0 then   -- notre match
        dom := a = 0;
        fadv := (eqs -> (a + b) ->> 'f')::numeric; adv := eqs -> (a + b) ->> 'nom';
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
    etape := jsonb_build_object('journee', j, 'journees', jsonb_array_length(pc -> 'calendrier'), 'rang', rang, 'domicile', dom)
      || case when typ = 'tournoi' then jsonb_build_object('phase', 'poule') else '{}' end;
    if typ = 'tournoi' and j >= jsonb_array_length(pc -> 'calendrier') then   -- fin de la phase de poule du tournoi
      if rang <= parami('tournoi_poule_qualifies') then
        etape := etape || jsonb_build_object('qualifie', true);
        pc := (pc - 'journee' - 'calendrier' - 'equipes') || jsonb_build_object('phase', 'finale', 'tour', 0, 'adversaires', tournoi_tableau(nv, eqs));
      else
        etape := etape || jsonb_build_object('qualifie', false);
        fin := jsonb_build_object('type', 'tournoi', 'gagne', false, 'phase', 'poule', 'rang', rang, 'equipes', n, 'niveau', niv, 'nom', nv ->> 'nom');
        pc := parcours_nouveau(niv, pc, p.pseudo);
      end if;
    elsif typ = 'poule' and j >= jsonb_array_length(pc -> 'calendrier') then   -- fin de saison
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
    fb := fb_m;
    res := r ->> 'resultat';
    if res = 'nul' and r -> 'tab' is null then r := r || jsonb_build_object('tab', tirs_au_but(fa, fb)); end if;
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

  else   -- Légendes du handball : une série au meilleur des 5 manches (3 victoires) contre la Légende du moment (1 à 10)
    rg := legende_rang(pc); le := param('legendes_equipes') -> (rg - 1);
    adv := 'Légende ' || rg || ' · ' || (le ->> 'nom'); fadv := (le ->> 'f')::numeric;
    fb := fb_m;
    res := r ->> 'resultat';
    if res = 'nul' and r -> 'tab' is null then r := r || jsonb_build_object('tab', tirs_au_but(fa, fb)); end if;
    passe := res = 'gagne' or (res = 'nul' and (r -> 'tab' ->> 'a')::int > (r -> 'tab' ->> 'b')::int);
    v := (pc ->> 'v')::int + passe::int; d := (pc ->> 'd')::int + (not passe)::int;
    gagnes := parami('legendes_manches') / 2 + 1;
    etape := jsonb_build_object('v', v, 'd', d, 'manches', parami('legendes_manches'), 'passe', passe);
    if v >= gagnes then
      -- une Légende battue pour la première fois : la grosse récompense, un titre, et la Légende suivante ; la 10e se rejoue
      -- ensuite pour une petite récompense (analyse du 20 nov. 2026 : une seule équipe de Légendes rejouée sans fin faisait
      -- l'essentiel des pièces des meilleurs joueurs)
      premiere := rg > legendes_max(pc);
      recompense := case when premiere then round(parami('parcours_legendes_pieces') * (1 + (rg - 1) / 9.0)) else parami('parcours_legendes_rejouer_pieces') end;
      bonus_o := case when premiere then parami('parcours_legendes_bonus_or') else 0 end;
      pc := pc || jsonb_build_object('legendes_battues', (pc ->> 'legendes_battues')::int + 1,
        'legendes_max', greatest(rg, legendes_max(pc)), 'legende', least(rg + 1, jsonb_array_length(param('legendes_equipes'))));
      if premiere then
        pc := jsonb_set(pc, '{palmares}', (pc -> 'palmares') || jsonb_build_array(jsonb_build_object('titre', 'Vainqueur de Légende ' || rg || ' (' || (le ->> 'nom') || ')', 'saison', pc -> 'saison')));
      end if;
      fin := jsonb_build_object('type', 'legendes', 'gagne', true, 'v', v, 'd', d, 'fois', (pc ->> 'legendes_battues')::int, 'rang', rg, 'equipe', le ->> 'nom',
        'premiere', premiere, 'suivante', case when premiere and rg < jsonb_array_length(param('legendes_equipes')) then rg + 1 end,
        'pieces', recompense, 'boosterOr', bonus_o);
      pc := parcours_nouveau(niv, pc, p.pseudo);
    elsif d >= gagnes then
      fin := jsonb_build_object('type', 'legendes', 'gagne', false, 'v', v, 'd', d, 'rang', rg, 'equipe', le ->> 'nom');
      pc := parcours_nouveau(niv, pc, p.pseudo);
    else
      pc := pc || jsonb_build_object('v', v, 'd', d);
    end if;
  end if;

  -- un match simulé rapporte un peu moins (p_gain) que le même match joué en direct ; championnat_gain : depuis le 14 nov. 2026 (demande
  -- de Maël), un match par heure au lieu de 2 h, chaque match rapporte moitié moins (pièces, XP du joueur et des cartes)
  p_gain := p_gain * coalesce((param('championnat_gain') #>> '{}')::numeric, 1);
  xp := round((param('pve_xp') ->> res)::int * p_gain); xpc := round((param('pve_xp_carte') ->> res)::int * p_gain);
  v_pieces := round((param('pve_pieces') ->> res)::int * mult * p_gain * (1 + staff_val(p_uid, 'manager') / 100.0));   -- manager
  -- victoires des plus hauts niveaux (demande de Maël, 23 nov. 2026 : on n'y gagne plus qu'un match sur deux, ils rapportaient moins
  -- que le Championnat du monde) : pièces d'une victoire jouée en direct fixées par niveau (championnat_victoire : JO 170, Légendes 200,
  -- au lieu de 113 et 120) ; simulée, ×0,95 comme les autres ; le Manager s'ajoute
  if res = 'gagne' and param('championnat_victoire') ? niv::text then
    v_pieces := round((param('championnat_victoire') ->> niv::text)::int * p_gain / coalesce((param('championnat_gain') #>> '{}')::numeric, 1)
      * (1 + staff_val(p_uid, 'manager') / 100.0));
  end if;
  update profils set tactique = p_tactique, parcours = pc, pieces = pieces + v_pieces + recompense,
    bonus = bonus + bonus_b, bonus_or = bonus_or + bonus_o where user_id = p.user_id;
  -- les remplaçants gagnent la même expérience que les titulaires (retour de Guilhem, 21 nov. 2026 : « les remplaçants ne prennent
  -- pas d'XP »)
  progres := xp_equipe(p.equipe || coalesce((select jsonb_object_agg('banc_' || r.key, r.value) from jsonb_each(coalesce(p.remplacants, '{}')) r
    where r.value #>> '{}' <> all (array(select jsonb_array_elements_text(jsonb_path_query_array(p.equipe, '$.*'))))), '{}'), xpc);
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

-- l'ancien appel (anciens téléphones) : le match est simulé
create or replace function match_championnat(p_tactique text) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return match_commencer('championnat', null, p_tactique, 'normal', true);
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- Match en direct, « à la Football Manager » (demande de Maël) : joué possession par possession, par blocs de 5 minutes.
-- Le serveur ne calcule le bloc suivant que quand le jeu le demande, avec la tactique du moment : impossible de voir la suite
-- à l'avance ou de rejouer un match. Les choix comptent : la défense adverse se voit (à contrer avec la bonne attaque),
-- son attaque se devine (d'où viennent ses buts) ; 3 temps morts (2 par période) et la mi-temps pour changer.
-- « Simuler » joue tout de suite : un adjoint coache à ta place (match_adjoint, une tranche sur deux il contre leur défense), et
-- rapporte un peu moins (match_simule_gain).
-- ════════════════════════════════════════════════════════════════════════════
-- (la table matchs_direct est créée avec les autres tables, en haut du fichier)

create or replace function tac_attaque(p_tactique text) returns text language sql immutable as $$
  select case split_part(coalesce(p_tactique, ''), ':', 1) when 'duels' then 'duels' when 'enclenchement' then 'enclenchement' when 'rapide' then 'rapide'
    when 'attaque' then 'rapide' when 'defense' then 'enclenchement' else 'duels' end
$$;
create or replace function tac_defense(p_tactique text) returns text language sql immutable as $$
  select case when split_part(coalesce(p_tactique, ''), ':', 2) in ('06', '15', '33') then split_part(p_tactique, ':', 2)
    when p_tactique = 'defense' then '06' when p_tactique = 'attaque' then '33' else '15' end
$$;
-- tactique au format « attaque:défense » (anciennes valeurs attaque, equilibre, defense converties) : pour le match en direct entre joueurs
create or replace function tac_complete(p_tactique text) returns text language sql immutable as $$
  select tac_attaque(p_tactique) || ':' || tac_defense(p_tactique)
$$;
-- pierre-feuille-ciseaux : les duels battent le 0-6 et butent sur le 1-5 ; l'enclenchement bat le 3-3 et bute sur le 0-6 ;
-- le jeu rapide bat le 1-5 et bute sur le 3-3. +1 : l'attaque prend le dessus, −1 : la défense, 0 : rien de spécial
create or replace function contre_tactique(p_att text, p_def text) returns int language sql immutable as $$
  select case p_att when 'duels' then case p_def when '06' then 1 when '15' then -1 else 0 end
    when 'enclenchement' then case p_def when '33' then 1 when '06' then -1 else 0 end
    when 'rapide' then case p_def when '15' then 1 when '33' then -1 else 0 end else 0 end
$$;
-- l'attaque qui bat une défense, la défense qui bat une attaque
create or replace function tactique_bat_def(p_def text) returns text language sql immutable as $$
  select y from unnest(array['duels', 'enclenchement', 'rapide']) y where contre_tactique(y, p_def) = 1
$$;
create or replace function tactique_bat_att(p_att text) returns text language sql immutable as $$
  select y from unnest(array['06', '15', '33']) y where contre_tactique(p_att, y) = -1
$$;
-- d'où part le tir selon l'attaque : c'est ce qui permet de deviner l'attaque adverse
create or replace function zone_tirage(p_att text) returns text language sql volatile as $$
  select case p_att
    when 'duels' then case when r < .5 then 'arrieres' when r < .7 then 'ailes' when r < .85 then 'pivot' else 'contre' end
    when 'enclenchement' then case when r < .4 then 'pivot' when r < .7 then 'arrieres' when r < .9 then 'ailes' else 'contre' end
    else case when r < .35 then 'contre' when r < .7 then 'ailes' when r < .9 then 'arrieres' else 'pivot' end end
  from (select random() r) x
$$;
-- le joueur qui tire depuis une zone (ou un joueur de champ au hasard)
create or replace function joueur_zone(p_joueurs jsonb, p_zone text) returns text language sql volatile as $$
  select coalesce(p_joueurs ->> (case p_zone
      when 'ailes' then (array['AG', 'AD'])[1 + floor(random() * 2)::int]
      when 'arrieres' then (array['ARG', 'DC', 'ARD'])[1 + floor(random() * 3)::int]
      when 'pivot' then 'PIV'
      when 'contre' then (array['AG', 'AD', 'DC'])[1 + floor(random() * 3)::int]
      when '7m' then (array['DC', 'ARG', 'ARD'])[1 + floor(random() * 3)::int]
      else (array['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV'])[1 + floor(random() * 6)::int] end), 'un joueur')
$$;
create or replace function stats_vides() returns jsonb language sql immutable as $$
  select '{"tirs": 0, "buts": 0, "arrets": 0, "pertes": 0, "excl": 0, "sept": 0, "xg": 0, "zones": {"ailes": 0, "arrieres": 0, "pivot": 0, "contre": 0, "7m": 0}}'::jsonb
$$;
-- tactique d'une équipe en match : le bonus de l'onglet Équipe suit la tactique jouée (recalculé depuis les moyennes
-- des stats de l'équipe ; l'ordinateur n'en a pas). Changer pour contrer l'adversaire peut donc coûter son bonus.
create or replace function match_tactique(eq jsonb, p_att text, p_def text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ba numeric := coalesce((eq #>> '{bonus,attaque}')::numeric, 0); bd numeric := coalesce((eq #>> '{bonus,defense}')::numeric, 0);
  na numeric := 0; nd numeric := 0;
begin
  if jsonb_typeof(eq -> 'moyennes') = 'object' then na := tactique_bonus(eq -> 'moyennes', p_att); nd := tactique_bonus(eq -> 'moyennes', p_def); end if;
  return eq || jsonb_build_object('attaque', p_att, 'defense', p_def,
    'att', round((eq ->> 'att')::numeric / (1 + ba) * (1 + na), 2), 'def', round((eq ->> 'def')::numeric / (1 + bd) * (1 + nd), 2),
    'bonus', jsonb_build_object('attaque', na, 'defense', nd));
end $$;
-- Style de l'entraîneur adverse selon le niveau du parcours (demande de Maël) : Départemental imprévisible (il change au hasard,
-- sans lire le jeu), Régional lent à réagir, National réfléchi, International rapide, Légendes : il s'adapte à chaque tranche de
-- 5 minutes, sans temps mort, et anticipe nos changements. reac = chance de réagir par tranche, neutre = s'il cherche à prendre
-- le dessus quand rien ne le gêne (0 jamais, 0,5 seulement s'il est mené, 1 toujours), mi = chances de changer à la mi-temps,
-- anticipe = chance qu'il prête au joueur de changer pour le contrer (il choisit en conséquence).
create or replace function match_ia(p_style text) returns jsonb language sql stable security definer set search_path = public as $$
  select (case p_style
    when 'hasard' then '{"style": "hasard", "nom": "imprévisible", "reac": 0.15, "neutre": 0, "mi": [0.5, 0.4], "anticipe": 0, "hasard": true}'
    when 'lent' then '{"style": "lent", "nom": "lent à réagir", "reac": 0.2, "neutre": 0, "mi": [0.5, 0.4], "anticipe": 0, "lecture": 0.5}'
    when 'rapide' then '{"style": "rapide", "nom": "rapide", "reac": 0.75, "neutre": 1, "mi": [1, 0.9], "anticipe": 0, "lecture": 0.8}'
    when 'legende' then '{"style": "legende", "nom": "légendaire", "reac": 1, "neutre": 1, "mi": [1, 1], "anticipe": 0.6, "continu": true, "lecture": 0.9}'
    else '{"style": "reflechi", "nom": "réfléchi", "reac": 0.4, "neutre": 0.5, "mi": [0.8, 0.7], "anticipe": 0, "lecture": 0.65}' end)::jsonb
    || case when p_style in ('hasard', 'lent', 'rapide', 'legende') then '{}'::jsonb
      else jsonb_build_object('reac', coalesce((param('match_ordi_reaction') #>> '{}')::numeric, .4)) end
$$;
create or replace function match_ia_niveau(pc jsonb) returns text language sql stable security definer set search_path = public as $$
  select case when pc ->> 'type' = 'legendes' then 'legende'
    else case param('parcours') -> (coalesce((pc ->> 'niveau')::int, 1) - 1) ->> 'groupe'
      when 'Départemental' then 'hasard' when 'Régional' then 'lent' when 'National' then 'reflechi' when 'International' then 'rapide' else 'legende' end end
$$;
-- Ce que l'entraîneur des Légendes a remarqué de notre façon de jouer (demande de Maël, 21 nov. 2026) : pour chaque tranche passée,
-- si on a gardé sa tactique (1), contré ce qu'on voyait (2) ou joué un coup d'avance, en contrant son contre (3) ; en attaque d'après
-- sa défense visible, en défense d'après notre défense (son attaque est cachée). {a: [n1, n2, n3], d: [...], n: tranches comptées,
-- att, def : la façon la plus fréquente, celle qu'il vise 6 fois sur 10}. Sert à sa décision (match_ordi) et à l'indice du jeu (match_vue)
create or replace function ia_lecture(p_blocs jsonb) returns jsonb language plpgsql immutable as $$
declare sa numeric[] := array[.5, 0, 0]; sd numeric[] := array[.5, 0, 0]; pr jsonb; cu jsonb; c1 text; c2 text; n int := 0;
begin
  for pr, cu in select lag(j) over (order by k), j from jsonb_array_elements(coalesce(p_blocs, '[]')) with ordinality y(j, k) loop
    if pr is null then continue; end if;
    n := n + 1;
    c1 := tactique_bat_def(pr ->> 'bd'); c2 := tactique_bat_att(tactique_bat_def(pr ->> 'ad'));
    if cu ->> 'aa' = pr ->> 'aa' then sa[1] := sa[1] + 1; end if;
    if cu ->> 'aa' = c1 then sa[2] := sa[2] + 1; end if;
    if cu ->> 'aa' = tactique_bat_def(tactique_bat_att(c1)) then sa[3] := sa[3] + 1; end if;
    if cu ->> 'ad' = pr ->> 'ad' then sd[1] := sd[1] + 1; end if;
    if cu ->> 'ad' = c2 then sd[2] := sd[2] + 1; end if;
    if cu ->> 'ad' = tactique_bat_att(tactique_bat_def(c2)) then sd[3] := sd[3] + 1; end if;
  end loop;
  return jsonb_build_object('a', to_jsonb(sa), 'd', to_jsonb(sd), 'n', n,
    'att', case when sa[1] >= sa[2] and sa[1] >= sa[3] then 1 when sa[2] >= sa[3] then 2 else 3 end,
    'def', case when sd[1] >= sd[2] and sd[1] >= sd[3] then 1 when sd[2] >= sd[3] then 2 else 3 end);
end $$;
-- l'entraîneur adverse, à la fin de chaque tranche : il change de tactique (sans temps mort, comme le joueur depuis le 14 nov. 2026,
-- demande de Maël) quand il se voit contré (notre attaque bat sa défense, notre défense bat son attaque) ou, selon son style, quand
-- il peut prendre le dessus ; sa réactivité dépend de son style (reac). Il prend un temps mort (3 par match, 2 par période) quand il
-- change alors qu'il est mené de 3 buts ou plus : l'élan. À la mi-temps, il change aussi ; les Légendes s'adaptent à chaque tranche. Mené de 4 en fin de match, il presse ; devant
-- de 5, il gère. Sa défense se voit ; son attaque, non (« change d'attaque »).
create or replace function match_ordi(e jsonb, p_mi_temps boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare a jsonb := e -> 'a'; b jsonb := e -> 'b'; att text := b ->> 'attaque'; def text := b ->> 'defense'; natt text; ndef text;
  bl int := (e ->> 'bloc')::int; per text := case when bl < 6 then 'p1' else 'p2' end; t int := (e ->> 't')::int;
  tmb jsonb := coalesce(e -> 'tmb', '{"restants": 3, "p1": 0, "p2": 0}'); ecart int := (e #>> '{score,1}')::int - (e #>> '{score,0}')::int;
  cons text := coalesce(b ->> 'consigne', 'normal'); ncons text; tm boolean := false;
  ia jsonb := coalesce(e -> 'ia', match_ia('reflechi')); p numeric := (ia ->> 'anticipe')::numeric; reac numeric := (ia ->> 'reac')::numeric;
  aa text := a ->> 'attaque'; ad text := a ->> 'defense'; aa2 text; ad2 text; x text; v numeric; vmax numeric; ud numeric; ua numeric; u numeric; nch int; nb int;
  casse boolean := false;
begin
  -- notre momentum bloqué : il prend un temps mort pour le casser, s'il lui en reste (plus ou moins vite selon son style, momentum_ia)
  if not p_mi_temps and e ->> 'momv' = 'a' and (tmb ->> 'restants')::int > 0 and (tmb ->> per)::int < 2 and t > 0 and t < 3600
    and random() < coalesce((param('momentum_ia') ->> coalesce(ia ->> 'style', 'reflechi'))::numeric, .75) then
    tmb := tmb || jsonb_build_object('restants', (tmb ->> 'restants')::int - 1, per, (tmb ->> per)::int + 1);
    b := b || jsonb_build_object('elan', t + 180, 'fatigue', greatest(0, (b ->> 'fatigue')::numeric - .02));
    e := jsonb_set(e, '{ev}', (e -> 'ev') || jsonb_build_object('t', t, 'c', 'b', 'ty', 'temps-mort', 's', e -> 'score'));
    e := match_mom_casser(e || jsonb_build_object('tmb', tmb, 'b', b), 'b', 'tm');
    casse := true;
  end if;
  ncons := case when bl >= 8 and ecart <= -4 then 'pression' when bl >= 9 and ecart >= 5 then 'prudent' when ecart > -2 and cons = 'pression' then 'normal' else cons end;
  if ia ? 'hasard' then
    -- imprévisible : il ne lit pas le jeu, il change au hasard de temps en temps
    select y into ndef from unnest(array['06', '15', '33']) y where y <> def order by random() limit 1;
    select y into natt from unnest(array['duels', 'enclenchement', 'rapide']) y where y <> att order by random() limit 1;
    ncons := cons;
    if p_mi_temps then
      if random() >= (ia #>> '{mi,0}')::numeric then ndef := def; end if;
      if random() >= (ia #>> '{mi,1}')::numeric then natt := att; end if;
    elsif random() < reac then
      tm := not casse and ecart <= -3 and (tmb ->> 'restants')::int > 0 and (tmb ->> per)::int < 2;
      if random() < .5 then ndef := def; else natt := att; end if;
    else
      return e;
    end if;
  else
    -- La tactique qu'il veut contrer (aa2 en attaque, ad2 en défense). Sans anticipation (p = 0) : la nôtre de la tranche jouée.
    -- Légendes (demande de Maël, 21 nov. 2026 : avant, il supposait toujours que le joueur allait contrer la défense qu'il voyait,
    -- le réflexe de tout le monde, et le contrait 10 tranches sur 12 ; un coup d'avance le battait 10 fois sur 12) : il apprend notre
    -- façon de jouer. À chaque tranche passée, il note si on a gardé notre tactique, contré ce qu'on voyait, ou joué un coup d'avance
    -- (contré son contre) ; il vise la façon la plus fréquente avec la chance « anticipe » (0,6), sinon une des trois au hasard.
    -- Mesure (8 000 matchs) : une façon de jouer fixe, quelle qu'elle soit, a le dessus 1,5 à 2,5 tranches sur 12 et est contrée 8 fois ;
    -- qui varie a le dessus 4 à 5 fois sur 12 (avant les temps morts)
    aa2 := aa; ad2 := ad;
    if p > 0 then
      declare lec jsonb := ia_lecture(e -> 'blocs'); c1 text; c2 text; ja int; jd int;
      begin
        ja := case when random() < p then (lec ->> 'att')::int else 1 + floor(random() * 3)::int end;
        jd := case when random() < p then (lec ->> 'def')::int else 1 + floor(random() * 3)::int end;
        c1 := tactique_bat_def(def);
        aa2 := case ja when 1 then aa when 2 then c1 else tactique_bat_def(tactique_bat_att(c1)) end;
        c2 := tactique_bat_att(tactique_bat_def(ad));
        ad2 := case jd when 1 then ad when 2 then c2 else tactique_bat_att(tactique_bat_def(c2)) end;
      end;
    end if;
    ndef := def; vmax := -contre_tactique(aa2, def);
    ud := vmax;
    foreach x in array array['06', '15', '33'] loop
      v := -contre_tactique(aa2, x);
      if v > vmax + .001 then vmax := v; ndef := x; end if;
    end loop;
    ud := (vmax - ud) / 2;   -- 1 s'il était contré, ½ si c'était neutre, 0 s'il avait déjà le dessus
    natt := att; vmax := contre_tactique(att, ad2);
    ua := vmax;
    foreach x in array array['duels', 'enclenchement', 'rapide'] loop
      v := contre_tactique(x, ad2);
      if v > vmax + .001 then vmax := v; natt := x; end if;
    end loop;
    ua := (vmax - ua) / 2;
    if p_mi_temps then
      if ud <= 0 or random() >= (ia #>> '{mi,0}')::numeric then ndef := def; end if;
      if ua <= 0 or random() >= (ia #>> '{mi,1}')::numeric then natt := att; end if;
    else
      -- urgence : 1 quand il est contré ; quand c'est neutre, selon son style (le réfléchi seulement s'il est mené)
      u := greatest(ud, ua);
      if u < 1 then u := u * case when (ia ->> 'neutre')::numeric >= 1 then 1 when (ia ->> 'neutre')::numeric > 0 and ecart < 0 then 1 else 0 end; end if;
      u := greatest(u, case when ncons <> cons then .8 else 0 end);
      if ia ? 'continu' then
        if u <= 0 or random() >= reac then natt := att; ndef := def; ncons := cons; end if;   -- Légendes : à chaque tranche, sans temps mort
      elsif random() < reac * u then
        tm := not casse and ecart <= -3 and (tmb ->> 'restants')::int > 0 and (tmb ->> per)::int < 2;   -- mené : il prend aussi un temps mort, pour l'élan
      else
        natt := att; ndef := def; ncons := cons;   -- pas de changement (sauf s'il varie son attaque, plus bas)
      end if;
      if ud <= 0 or (ud < 1 and (ia ->> 'neutre')::numeric = 0) then ndef := def; end if;
      if ua <= 0 or (ua < 1 and (ia ->> 'neutre')::numeric = 0) then natt := att; end if;
      -- il varie aussi son attaque de lui-même, même quand elle marche (sinon elle se devinait d'après notre défense)
      if natt = att and not tm and random() < (1 - coalesce((ia ->> 'lecture')::numeric, 1)) * .6 then
        natt := case when random() < .5 and b ? 'pref_att' and b ->> 'pref_att' <> att then b ->> 'pref_att'
          else (select y from unnest(array['duels', 'enclenchement', 'rapide']) y where y <> att order by random() limit 1) end;
      end if;
    end if;
    -- Pas toujours le contre exact (retour d'un joueur, 20 nov. 2026 : son attaque se devinait à coup sûr d'après notre défense,
    -- et allait toujours avec la même défense). Quand il change, il prend le contre avec la chance « lecture » de son style,
    -- sinon son jeu préféré (celui du coup d'envoi) ou un autre au hasard ; attaque et défense tirées chacune de leur côté.
    if natt <> att and random() >= coalesce((ia ->> 'lecture')::numeric, 1) then
      natt := case when random() < .5 and b ? 'pref_att' and b ->> 'pref_att' <> att then b ->> 'pref_att'
        else (select y from unnest(array['duels', 'enclenchement', 'rapide']) y where y <> att order by random() limit 1) end;
    end if;
    if ndef <> def and random() >= coalesce((ia ->> 'lecture')::numeric, 1) then
      ndef := case when random() < .5 and b ? 'pref_def' and b ->> 'pref_def' <> def then b ->> 'pref_def'
        else (select y from unnest(array['06', '15', '33']) y where y <> def order by random() limit 1) end;
    end if;
  end if;
  if natt = att and ndef = def and ncons = cons then return e; end if;
  if tm then
    tmb := tmb || jsonb_build_object('restants', (tmb ->> 'restants')::int - 1, per, (tmb ->> per)::int + 1);
    b := b || jsonb_build_object('elan', t + 180, 'fatigue', greatest(0, (b ->> 'fatigue')::numeric - .02));
    e := jsonb_set(e, '{ev}', (e -> 'ev') || jsonb_build_object('t', t, 'c', 'b', 'ty', 'temps-mort', 's', e -> 'score'));
    e := match_mom_casser(e || jsonb_build_object('tmb', tmb), 'b', 'tm');
  end if;
  if ndef <> def then e := jsonb_set(e, '{ev}', (e -> 'ev') || jsonb_build_object('t', t, 'c', 'b', 'ty', 'defense', 'v', ndef, 's', e -> 'score')); end if;
  if natt <> att then e := jsonb_set(e, '{ev}', (e -> 'ev') || jsonb_build_object('t', t, 'c', 'b', 'ty', 'attaque', 's', e -> 'score')); end if;
  if ncons <> cons then e := jsonb_set(e, '{ev}', (e -> 'ev') || jsonb_build_object('t', t, 'c', 'b', 'ty', 'consigne', 'v', ncons, 's', e -> 'score')); end if;
  return e || jsonb_build_object('b', match_tactique(b, natt, ndef) || jsonb_build_object('consigne', ncons));
end $$;
-- un match qui commence : les deux équipes (forces, joueurs, tactiques, consignes) ; a = le joueur, b = l'adversaire
create or replace function match_nouveau(p_type text, p_ctx jsonb, fa jsonb, fb jsonb, p_tactique text, p_consigne text, p_b_attaque text, p_b_defense text)
returns jsonb language sql volatile security definer set search_path = public as $$
  select jsonb_build_object('type', p_type, 'ctx', p_ctx, 'bloc', 0, 't', 0, 'score', '[0, 0]'::jsonb,
    'balle', case when random() < .5 then 'a' else 'b' end, 'ev', '[]'::jsonb, 'tm', jsonb_build_object('restants', 3, 'p1', 0, 'p2', 0), 'simules', 0,
    'a', fa || jsonb_build_object('tactique', p_tactique, 'attaque', tac_attaque(p_tactique), 'defense', tac_defense(p_tactique), 'consigne', p_consigne,
      'fatigue', 0, 'exclu', 0, 'elan', 0, 'stats', stats_vides()),
    'b', match_tactique(fb, p_b_attaque, p_b_defense) || jsonb_build_object('consigne', 'normal', 'fatigue', 0, 'exclu', 0, 'elan', 0, 'stats', stats_vides(),
      'pref_att', p_b_attaque, 'pref_def', p_b_defense, 'fo', coalesce((param('fatigue_ordi') #>> '{}')::numeric, 4)),
    'tmb', jsonb_build_object('restants', 3, 'p1', 0, 'p2', 0))
$$;
-- Remplaçants en match (demande de Maël, 19 nov. 2026) : chaque joueur a sa fatigue (fp : {exemplaire: fatigue}). Sur le terrain,
-- elle monte selon la consigne ; sur le banc, elle redescend. La fatigue de l'équipe (celle du moteur) = fw × la moyenne des 7 sur le
-- terrain + (1 − fw) × fe, la fatigue du groupe (le rythme du match, comme avant : les changements n'y font rien) ; fw =
-- match_banc_poids = 0,5 (mesure du 19 nov. : avec la moyenne seule, faire tourner un banc du même niveau à chaque tranche faisait
-- passer de 24 à 43 % de victoires). Sans changement, rien ne change par rapport à avant. p_terrain : ajouté à ceux sur le terrain,
-- p_banc : retiré à ceux du banc, p_fois : multiplie tout (mi-temps). Une équipe sans fp (l'ordinateur, un match commencé avant)
-- garde sa fatigue d'équipe.
-- Fatigue de chaque joueur (demande de Maël, 20 nov. 2026 : « la fatigue de tous les joueurs est homogène », « bien plus rapide »,
-- aucun joueur ne doit pouvoir jouer 60 minutes sans être dans le rouge) : une équipe qui a fcfg (réglages copiés au coup d'envoi par
-- match_banc_init) suit chaque joueur de 0 (frais) à 1 (épuisé). Sur le terrain, sa fatigue monte au rythme de la consigne × son
-- endurance (fr : de 0,8 à 1,2, d'après VIT + PHY comparées à la moyenne de son poste : aucun poste n'est avantagé) ; sur le banc, elle
-- redescend (repos) ; la mi-temps et un temps mort en retirent à tous (p_tous). Au-delà du seuil, chaque joueur sur le terrain perd
-- malus × (fatigue − seuil)² points de note, ramenés sur l'attaque et la défense comme une blessure (fma, fmd). Ancienne fatigue
-- (sans fcfg) : un match commencé avant, et l'équipe de l'ordinateur (fatigue d'équipe, sans fp).
-- l'ancienne version (4 paramètres) rendrait les appels ambigus : on la retire avant (aucune donnée ne dépend d'une fonction)
drop function if exists match_fat(jsonb, numeric, numeric, numeric);
create or replace function match_fat(eq jsonb, p_terrain numeric, p_banc numeric, p_fois numeric default 1, p_tous numeric default 0) returns jsonb
language plpgsql immutable as $$
declare fp jsonb := '{}'; s numeric := 0; n int := 0; l record; v numeric; sur boolean; fe numeric; w numeric := coalesce((eq ->> 'fw')::numeric, 1);
  k text; mm numeric; ms numeric; mal numeric; ma numeric := 0; md numeric := 0;
begin
  if coalesce(jsonb_typeof(eq -> 'fp'), '') <> 'object' then
    v := round(greatest(0, ((eq ->> 'fatigue')::numeric + p_terrain) * p_fois - p_tous), 4);
    if eq ? 'fo' then   -- l'ordinateur : sa fatigue lui retire des points de note, comme à nos joueurs (fma, fmd)
      return eq || jsonb_build_object('fatigue', v, 'fma', round((eq ->> 'fo')::numeric * least(v, 4 / 3.0), 2), 'fmd', round((eq ->> 'fo')::numeric * least(v, 4 / 3.0), 2));
    end if;
    return jsonb_set(eq, '{fatigue}', to_jsonb(v));
  end if;
  if eq ? 'fcfg' then
    mm := coalesce((eq #>> '{fcfg,m}')::numeric, 80); ms := coalesce((eq #>> '{fcfg,s}')::numeric, .3);
    for l in select key, value::numeric v from jsonb_each_text(eq -> 'fp') loop
      select j.key into k from jsonb_each_text(eq -> 'equipe') j where j.value = l.key limit 1;
      v := round(least(1, greatest(0, (l.v + case when k is not null then p_terrain * coalesce((eq -> 'fr' ->> l.key)::numeric, 1)
        * case when k = 'GB' then coalesce((eq #>> '{fcfg,gb}')::numeric, 1) else 1 end else -p_banc end) * p_fois - p_tous)), 4);
      fp := fp || jsonb_build_object(l.key, v);
      if k is not null then
        s := s + v; n := n + 1; mal := mm * greatest(0, v - ms) ^ 2;
        if k = 'GB' then md := md + .4 * mal; else ma := ma + mal / 6; md := md + .6 * mal / 6; end if;
      end if;
    end loop;
    return eq || jsonb_build_object('fp', fp, 'fatigue', round(case when n > 0 then s / n else 0 end, 4), 'fma', round(ma, 2), 'fmd', round(md, 2));
  end if;
  fe := round(greatest(0, (coalesce((eq ->> 'fe')::numeric, 0) + p_terrain) * p_fois), 4);
  for l in select key, value::numeric v from jsonb_each_text(eq -> 'fp') loop
    sur := exists (select 1 from jsonb_each_text(eq -> 'equipe') j where j.value = l.key);
    v := round(greatest(0, (l.v + case when sur then p_terrain else -p_banc end) * p_fois), 4);
    fp := fp || jsonb_build_object(l.key, v);
    if sur then s := s + v; n := n + 1; end if;
  end loop;
  return eq || jsonb_build_object('fp', fp, 'fe', fe, 'fatigue', round(w * case when n > 0 then s / n else 0 end + (1 - w) * fe, 4));
end $$;
create or replace function match_fatiguer(eq jsonb, sec numeric) returns jsonb language sql immutable as $$
  select case when eq ? 'fcfg' then
      match_fat(eq, sec / 60.0 * coalesce((eq -> 'fcfg' -> 'rythme' ->> coalesce(eq ->> 'consigne', 'normal'))::numeric, .03),
        sec / 60.0 * coalesce((eq #>> '{fcfg,repos}')::numeric, .04))
    -- l'ordinateur (et l'adversaire d'un défi), match commencé depuis le 21 nov. 2026 (« fo ») : fatigue de 0 à 1 sur une période
    -- (consigne normale ; pression × 4/3, prudent × 3/4), remise à 0 à la mi-temps ; elle lui retire jusqu'à fo (4) points de note,
    -- 2 en moyenne : ce que perd une de nos équipes qui fait bien tourner son banc (remplaçants plus faibles 8 minutes sur 30)
    when eq ? 'fo' then match_fat(eq, sec / 1800.0 * case eq ->> 'consigne' when 'pression' then 4 / 3.0 when 'prudent' then .75 else 1 end, 0)
    else match_fat(eq, sec / 3600.0 * case eq ->> 'consigne' when 'pression' then .22 when 'prudent' then .06 else .1 end, sec / 3600.0 * .15) end
$$;
-- endurance d'une carte : multiplie la vitesse à laquelle elle se fatigue (0,8 à 1,2). VIT + PHY (écarts de forme) comparées à la
-- moyenne des cartes du même poste principal : VIT + PHY avantageait les ailiers (+20 en moyenne) et pénalisait les demi-centres
-- (−10) ; comparées à leur poste, chaque poste a la même endurance moyenne, seul l'écart entre joueurs d'un même poste compte
create or replace function endurance_carte(p_carte text) returns numeric language sql stable security definer set search_path = public as $$
  select least(1 + ec, greatest(1 - ec, 1 - pente * (vp - coalesce(moy, vp)) / 40))
  from (select coalesce((c.ecarts ->> 'vit')::numeric, 0) + coalesce((c.ecarts ->> 'phy')::numeric, 0) vp,
      (select avg(coalesce((x.ecarts ->> 'vit')::numeric, 0) + coalesce((x.ecarts ->> 'phy')::numeric, 0)) from cartes x
        where x.actif and not x.legende and x.poste is not distinct from c.poste) moy,
      coalesce((param('fatigue_endurance') #>> '{}')::numeric, .4) pente, coalesce((param('fatigue_endurance_ecart') #>> '{}')::numeric, .2) ec
    from cartes c where c.id = p_carte) t
$$;
-- au coup d'envoi : qui est sur le terrain (equipe), le banc valable (banc : un remplaçant par poste, encore au club), leurs noms (bn)
-- et leur note à ce poste (nb, calculée comme s'il était titulaire), tout le monde frais
create or replace function match_banc_init(p_uid uuid, p_equipe jsonb, p_remp jsonb, p_tactique text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare banc jsonb := '{}'; bn jsonb := '{}'; nb jsonb := '{}'; fp jsonb := '{}'; l record; f jsonb;
begin
  for l in select key, value from jsonb_each_text(p_equipe) loop fp := fp || jsonb_build_object(l.value, 0); end loop;
  for l in select r.key, r.value, c.nom from jsonb_each_text(coalesce(p_remp, '{}')) r join exemplaires e on e.id::text = r.value join cartes c on c.id = e.carte_id
      where r.key in ('AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB') loop
    begin
      perform verifier_remplacants(p_uid, p_equipe, jsonb_build_object(l.key, l.value));
      f := force_equipe(p_equipe || jsonb_build_object(l.key, l.value), p_tactique);
    exception when others then continue;
    end;
    banc := banc || jsonb_build_object(l.key, l.value); bn := bn || jsonb_build_object(l.key, l.nom);
    nb := nb || jsonb_build_object(l.key, f -> 'notes' -> l.key); fp := fp || jsonb_build_object(l.value, 0);
  end loop;
  return jsonb_build_object('equipe', p_equipe, 'banc', banc, 'bn', bn, 'nb', nb, 'fp', fp, 'fe', 0,
    'fw', coalesce((param('match_banc_poids') #>> '{}')::numeric, .5),
    'fr', (select coalesce(jsonb_object_agg(f.key, round(coalesce(endurance_carte(x.carte_id), 1), 3)), '{}') from jsonb_each(fp) f join exemplaires x on x.id::text = f.key),
    'pr', (select coalesce(jsonb_agg(f.key), '[]') from jsonb_each(fp) f join exemplaires x on x.id::text = f.key where coalesce(x.protection, 0) > 0),
    'fcfg', jsonb_build_object('rythme', coalesce(param('fatigue_rythme'), '{"prudent": 0.0225, "normal": 0.03, "pression": 0.04}'),
      'repos', coalesce(param('fatigue_repos'), '0.04'), 'mt', coalesce(param('fatigue_mi_temps'), '0.6'), 'tm', coalesce(param('fatigue_temps_mort'), '0.06'),
      'm', coalesce(param('fatigue_malus'), '80'), 's', coalesce(param('fatigue_seuil'), '0.3'), 'gb', coalesce(param('fatigue_gardien'), '0.33'),
      'bm', coalesce(param('blessure_minute'), '0.0002'), 'bf', coalesce(param('blessure_fatigue'), '0.1'), 'bs', coalesce(param('blessure_fatigue_seuil'), '0.35')));
end $$;
-- changements (entre deux tranches) : le titulaire de chaque poste demandé et son remplaçant échangent leurs places ; la force de
-- l'équipe (attaque, défense, tireurs, bonus de la tactique jouée) est recalculée ; chaque changement est raconté au fil
-- Blessures (demande de Maël, 20 nov. 2026 : « pour forcer les changements ») : un joueur blessé joue diminué (blessure_malus = 15
-- points de note à son poste, ramenés sur l'attaque et la défense de l'équipe comme dans force_equipe : 1/6 de l'attaque et 0,6/6 de
-- la défense pour un joueur de champ, 0,4 de la défense pour le gardien) tant qu'il n'est pas remplacé, et ne peut plus revenir de ce
-- match (liste « blesses » de l'équipe, des exemplaires).
create or replace function match_malus_blessure(a jsonb, k text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m numeric := coalesce((param('blessure_malus') #>> '{}')::numeric, 15);
begin
  return a || jsonb_build_object('att', round((a ->> 'att')::numeric - case when k = 'GB' then 0 else m / 6 end, 2),
    'def', round((a ->> 'def')::numeric - case when k = 'GB' then .4 * m else .6 * m / 6 end, 2));
end $$;
-- la gravité d'une blessure (blessure_gravites : nom, chance, matchs d'absence après celui-ci entre min et max)
create or replace function blessure_tirer() returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r numeric := random(); c numeric := 0; g jsonb; der jsonb;
begin
  for g in select x from jsonb_array_elements(param('blessure_gravites')) x loop
    der := g; c := c + (g ->> 'p')::numeric;
    if r < c then exit; end if;
  end loop;
  if der is null then return jsonb_build_object('g', 'légère', 'm', 0); end if;
  return jsonb_build_object('g', der ->> 'nom', 'm', (der ->> 'min')::int + floor(random() * ((der ->> 'max')::int - (der ->> 'min')::int + 1))::int);
end $$;
create or replace function match_blesser(a jsonb, k text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare id text := a -> 'equipe' ->> k;
begin
  if id is null or coalesce(a -> 'blesses', '[]') ? id then return a; end if;
  return match_malus_blessure(a || jsonb_build_object('blesses', coalesce(a -> 'blesses', '[]') || to_jsonb(id)), k);
end $$;
create or replace function match_changer_e(e jsonb, p_uid uuid, p_postes text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a jsonb := e -> 'a'; eq jsonb; banc jsonb; k text; t_id text; r_id text; f jsonb; ev jsonb := '[]';
begin
  if coalesce(jsonb_typeof(a -> 'banc'), '') <> 'object' then raise exception 'Pas de remplaçant dans ce match'; end if;
  eq := a -> 'equipe'; banc := a -> 'banc';
  for k in select distinct x from unnest(p_postes) x loop
    if not banc ? k then raise exception 'Pas de remplaçant à ce poste'; end if;
    t_id := eq ->> k; r_id := banc ->> k;
    if coalesce(a -> 'blesses', '[]') ? r_id then raise exception 'Blessure : % ne peut pas revenir dans ce match', a -> 'bn' ->> k; end if;
    eq := eq || jsonb_build_object(k, r_id); banc := banc || jsonb_build_object(k, t_id);
    ev := ev || jsonb_build_object('t', (e ->> 't')::int, 'c', 'a', 'ty', 'changement', 'p', k, 'n', a -> 'bn' ->> k, 'o', a -> 'joueurs' ->> k, 's', e -> 'score');
    a := a || jsonb_build_object('bn', (a -> 'bn') || jsonb_build_object(k, a -> 'joueurs' ->> k), 'nb', (a -> 'nb') || jsonb_build_object(k, a -> 'notes' -> k));
  end loop;
  if jsonb_array_length(ev) = 0 then return e; end if;
  begin
    perform verifier_equipe(p_uid, eq);
    f := force_equipe(eq, a ->> 'tactique');
  exception when others then raise exception 'Un de ces joueurs n’est plus dans ton club';
  end;
  a := a || match_tactique(f, a ->> 'attaque', a ->> 'defense') || jsonb_build_object('equipe', eq, 'banc', banc);
  -- un blessé resté sur le terrain à un autre poste garde son malus (la force vient d'être recalculée)
  for k in select j.key from jsonb_each_text(eq) j where coalesce(a -> 'blesses', '[]') ? j.value loop a := match_malus_blessure(a, k); end loop;
  return jsonb_set(e || jsonb_build_object('a', match_fat(a, 0, 0)), '{ev}', (e -> 'ev') || ev);
end $$;
-- joue les possessions jusqu'à la seconde p_fin
create or replace function match_avancer(e jsonb, p_fin int) returns jsonb language plpgsql volatile as $$
declare x text; y text; eqx jsonb; eqy jsonb; t int; duree int; p numeric; ps numeric; pen numeric; perte numeric; r numeric; zn text;
  nom text; gb text; ty text; ctr int; sc jsonb; contre_pour text; cx text; cy text; fx numeric; fy numeric; ea jsonb; kb text; dev numeric; sb text;
  reg numeric := coalesce((param('match_regularite') #>> '{}')::numeric, 0);
  pbl numeric := coalesce((param('blessure_chance') #>> '{}')::numeric, 0); bmax int := coalesce(parami('blessures_max'), 2);
  m numeric := (param('match_contre') #>> '{}')::numeric; base numeric := parami('match_base');
  k numeric := (param('match_coef') #>> '{}')::numeric; POSS constant numeric := 55;
  exd numeric := coalesce((param('exclusion_defense') #>> '{}')::numeric, 1.25); exa numeric := coalesce((param('exclusion_attaque') #>> '{}')::numeric, 1);
  mval jsonb := coalesce(param('momentum_valeurs'), '{}'); dm numeric;
  mmax numeric := coalesce((param('momentum_max') #>> '{}')::numeric, 100); meff numeric := coalesce((param('momentum_effet') #>> '{}')::numeric, 0);
  mom numeric; mlock boolean;
begin
  t := (e ->> 't')::int; sc := e -> 'score';
  while t < p_fin loop
    x := e ->> 'balle'; y := case x when 'a' then 'b' else 'a' end; eqx := e -> x; eqy := e -> y;
    contre_pour := e ->> 'contre';
    duree := case when contre_pour = x then 8 + floor(random() * 7)::int else 22 + floor(random() * 23)::int end;
    duree := least(duree, p_fin - t);   -- la dernière possession de la tranche s'arrête à sa fin (fatigue, blessures : le temps vraiment joué)
    t := t + duree;
    cx := eqx ->> 'consigne'; cy := eqy ->> 'consigne';
    -- chances de marquer sur la possession : forces (comme avant), tactiques, consignes, fatigue, exclusions, temps mort
    p := (base + k * ((eqx ->> 'att')::numeric - coalesce((eqx ->> 'fma')::numeric, 0) - (eqy ->> 'def')::numeric + coalesce((eqy ->> 'fmd')::numeric, 0))) / POSS;
    ctr := contre_tactique(eqx ->> 'attaque', eqy ->> 'defense');
    p := p * (1 + m * ctr);
    p := p * case cx when 'pression' then 1.04 when 'prudent' then .975 else 1 end * case cy when 'pression' then .97 when 'prudent' then 1.01 else 1 end;
    -- fatigue d'équipe (l'ordinateur, un match d'avant) ; la fatigue de chacun est déjà dans les forces (fma, fmd)
    p := p * (1 - .5 * case when eqx ? 'fcfg' or eqx ? 'fo' then 0 else (eqx ->> 'fatigue')::numeric end) * (1 + .5 * case when eqy ? 'fcfg' or eqy ? 'fo' then 0 else (eqy ->> 'fatigue')::numeric end);
    -- 2 minutes (retour de Guit, 23 nov. 2026 : « pas si pénalisant ») : l'équipe à 5 défend bien moins bien (× exclusion_defense, 1,5)
    -- et attaque moins bien (× exclusion_attaque, 0,8) : ~0,6 à 0,7 but par exclusion (0,25 avant, seulement en défense)
    if (eqy ->> 'exclu')::int > t then p := p * exd; end if;
    if (eqx ->> 'exclu')::int > t then p := p * exa; end if;
    if (eqx ->> 'elan')::int > t then p := p * 1.05; end if;
    if (eqy ->> 'elan')::int > t then p := p * .95; end if;
    -- momentum (demande de Maël, 23 nov. 2026) : l'équipe qui l'a bloqué marque plus facilement (+10 %), l'autre moins (−10 %),
    -- jusqu'à un temps mort de l'autre équipe ou la mi-temps (match_mom_casser)
    if e ->> 'momv' = x then p := p * (1 + meff); elsif e ->> 'momv' = y then p := p * (1 - meff); end if;
    mlock := false;
    if contre_pour = x then p := p * 1.35; zn := 'contre'; else zn := zone_tirage(eqx ->> 'attaque'); end if;
    e := e - 'contre';
    perte := case cx when 'prudent' then .08 when 'pression' then .13 else .11 end;
    pen := least(.88, greatest(.55, .75 + .01 * ((eqx ->> 'att')::numeric - coalesce((eqx ->> 'fma')::numeric, 0) - (eqy ->> 'def')::numeric + coalesce((eqy ->> 'fmd')::numeric, 0))));
    gb := coalesce(eqy -> 'joueurs' ->> 'GB', 'le gardien');
    -- régularité (retour de Maël, 20 nov. 2026 : trop d'aléatoire, la même équipe face au même adversaire avait des résultats trop
    -- différents) : xg = les buts que l'équipe « méritait » jusque-là (somme des chances de marquer de ses possessions) ; une équipe en
    -- dessous marque un peu plus facilement ses tirs, une équipe au-dessus un peu moins (match_regularite par but d'écart). La force et la
    -- tactique gardent tout leur effet (elles font le xg) : seule la chance pèse moins sur un match entier
    dev := coalesce((eqx #>> '{stats,xg}')::numeric, 0) - (eqx #>> '{stats,buts}')::int;
    eqx := jsonb_set(eqx, '{stats,xg}', to_jsonb(round(coalesce((eqx #>> '{stats,xg}')::numeric, 0) + p, 3)));
    r := random();
    if r < perte then
      ty := 'perte'; nom := joueur_zone(eqx -> 'joueurs', 'champ'); zn := null;
      eqx := jsonb_set(eqx, '{stats,pertes}', to_jsonb((eqx #>> '{stats,pertes}')::int + 1));
      if random() < .55 then e := e || jsonb_build_object('contre', y); end if;
    elsif r < perte + .06 and e ? 'sept_jeu' and not e ? 'sept'
      and coalesce((e #>> array['sept_n', x, case when t < 1800 then 'p1' else 'p2' end])::int, 0) < coalesce(parami('sept_max_mi_temps'), 1)
      and random() < coalesce((param('sept_chance') #>> '{}')::numeric, 0) then
      -- jet de 7 m joué au mini-jeu (demande de Maël, 23 nov. 2026) : la tranche s'arrête là ; match_7m_resoudre le tire, puis la reprend
      nom := joueur_zone(eqx -> 'joueurs', '7m');
      e := e || jsonb_build_object(x, eqx, y, eqy, 'sept', sept_preparer(e, x, t, nom, gb, eqx, eqy),
        'sept_n', jsonb_set(coalesce(e -> 'sept_n', '{"a": {"p1": 0, "p2": 0}, "b": {"p1": 0, "p2": 0}}'), array[x, case when t < 1800 then 'p1' else 'p2' end],
          to_jsonb(coalesce((e #>> array['sept_n', x, case when t < 1800 then 'p1' else 'p2' end])::int, 0) + 1)));
      e := jsonb_set(e, '{ev}', (e -> 'ev') || jsonb_build_object('t', t, 'c', x, 'ty', 'sept', 'n', nom, 'g', gb, 's', sc));
      return e || jsonb_build_object('t', t, 'score', sc);
    elsif r < perte + .06 then   -- jet de 7 m
      zn := '7m'; nom := joueur_zone(eqx -> 'joueurs', '7m');
      eqx := jsonb_set(eqx, '{stats,sept}', to_jsonb((eqx #>> '{stats,sept}')::int + 1));
      eqx := jsonb_set(eqx, '{stats,tirs}', to_jsonb((eqx #>> '{stats,tirs}')::int + 1));
      if random() < least(.95, greatest(.4, pen + reg * dev)) then ty := '7m-but'; else ty := '7m-arret'; eqy := jsonb_set(eqy, '{stats,arrets}', to_jsonb((eqy #>> '{stats,arrets}')::int + 1)); end if;
    else
      nom := joueur_zone(eqx -> 'joueurs', zn);
      ps := least(.92, greatest(.1, (p - .06 * pen) / (1 - perte - .06) + reg * dev));
      eqx := jsonb_set(eqx, '{stats,tirs}', to_jsonb((eqx #>> '{stats,tirs}')::int + 1));
      if random() < ps then ty := 'but';
      elsif random() < .65 then ty := 'arret'; eqy := jsonb_set(eqy, '{stats,arrets}', to_jsonb((eqy #>> '{stats,arrets}')::int + 1));
      elsif random() < .3 then ty := 'poteau'; else ty := 'dehors'; end if;
    end if;
    if ty in ('but', '7m-but') then
      sc := jsonb_set(sc, array[case x when 'a' then '0' else '1' end], to_jsonb((sc ->> case x when 'a' then 0 else 1 end)::int + 1));
      eqx := jsonb_set(eqx, '{stats,buts}', to_jsonb((eqx #>> '{stats,buts}')::int + 1));
      eqx := jsonb_set(eqx, array['stats', 'zones', zn], to_jsonb((eqx -> 'stats' -> 'zones' ->> zn)::int + 1));
    end if;
    -- chaque action pousse la barre de momentum (demande de Maël, 23 nov. 2026) : un but vers l'équipe qui marque (plus quand son
    -- attaque a le dessus sur leur défense), un arrêt, une perte de balle ou un tir raté vers l'équipe qui défend (momentum_valeurs) ;
    -- à 100, elle se bloque (momv) et ne bouge plus jusqu'à ce qu'on la casse
    dm := null;
    if not e ? 'momv' then
      dm := case ty when 'but' then case when ctr > 0 then coalesce((mval ->> 'but_dessus')::numeric, 28) else coalesce((mval ->> 'but')::numeric, 20) end
        when '7m-but' then coalesce((mval ->> '7m-but')::numeric, 14) when 'arret' then -coalesce((mval ->> 'arret')::numeric, 12)
        when '7m-arret' then -coalesce((mval ->> '7m-arret')::numeric, 20) when 'perte' then -coalesce((mval ->> 'perte')::numeric, 10)
        else -coalesce((mval ->> 'rate')::numeric, 5) end;
      mom := least(mmax, greatest(-mmax, coalesce((e ->> 'mom')::numeric, 0) + case x when 'a' then 1 else -1 end * dm));
      e := e || jsonb_build_object('mom', mom);
      mlock := abs(mom) >= mmax;
    end if;
    e := jsonb_set(e, '{ev}', (e -> 'ev') || (jsonb_build_object('t', t, 'c', x, 'ty', ty, 'n', nom, 'g', gb, 'z', zn, 's', sc, 'x', eqx #> '{stats,xg}')
      || case when dm is not null then jsonb_build_object('m', e -> 'mom') else '{}'::jsonb end));
    if mlock then
      e := e || jsonb_build_object('momv', case when mom > 0 then 'a' else 'b' end);
      e := jsonb_set(e, '{ev}', (e -> 'ev') || jsonb_build_object('t', t, 'c', e ->> 'momv', 'ty', 'momentum', 'm', e -> 'mom', 's', sc));
    end if;
    -- faute en défense : 2 minutes (plus souvent sous pression, moins en jouant prudent)
    if ty <> 'perte' and random() < .045 * (case cy when 'pression' then 1.6 when 'prudent' then .6 else 1 end) and (eqy ->> 'exclu')::int <= t then
      eqy := jsonb_set(eqy, '{exclu}', to_jsonb(t + 120)); eqy := jsonb_set(eqy, '{stats,excl}', to_jsonb((eqy #>> '{stats,excl}')::int + 1));
      mlock := false; dm := null;
      if not e ? 'momv' then   -- l'équipe restée à 6 gagne du momentum
        dm := coalesce((mval ->> 'excl')::numeric, 10);
        mom := least(mmax, greatest(-mmax, coalesce((e ->> 'mom')::numeric, 0) + case x when 'a' then 1 else -1 end * dm));
        e := e || jsonb_build_object('mom', mom);
        mlock := abs(mom) >= mmax;
      end if;
      e := jsonb_set(e, '{ev}', (e -> 'ev') || (jsonb_build_object('t', t, 'c', y, 'ty', 'excl', 'n', joueur_zone(eqy -> 'joueurs', 'champ'), 's', sc)
        || case when dm is not null then jsonb_build_object('m', e -> 'mom') else '{}'::jsonb end));
      if mlock then
        e := e || jsonb_build_object('momv', case when mom > 0 then 'a' else 'b' end);
        e := jsonb_set(e, '{ev}', (e -> 'ev') || jsonb_build_object('t', t, 'c', e ->> 'momv', 'ty', 'momentum', 'm', e -> 'mom', 's', sc));
      end if;
    end if;
    -- fatigue : par minute jouée, selon la consigne ; sur le banc, on récupère (match_fatiguer, match_fat)
    eqx := match_fatiguer(eqx, duree);
    eqy := match_fatiguer(eqy, duree);
    -- blessure (notre équipe, a ; les deux équipes en match à deux, pvp) : chaque joueur sur le terrain a son risque, par minute jouée,
    -- qui grimpe avec SA fatigue au-delà d'un seuil (bm + bf × (fatigue − bs)²) ; blessure_chance (0,003) sert d'échelle (0 = aucune blessure, tests)
    foreach sb in array case when e ? 'pvp' then array['a', 'b'] else array['a'] end loop
    ea := case when x = sb then eqx else eqy end;
    kb := null;
    if jsonb_typeof(ea -> 'fp') = 'object' and jsonb_array_length(coalesce(ea -> 'blesses', '[]')) < bmax and pbl > 0 then
      if ea ? 'fcfg' then
        with r as (select j.key, duree / 60.0 * pbl / .003 * ((ea #>> '{fcfg,bm}')::numeric + (ea #>> '{fcfg,bf}')::numeric
              * greatest(0, coalesce((ea -> 'fp' ->> j.value)::numeric, 0) - (ea #>> '{fcfg,bs}')::numeric) ^ 2) h
            from jsonb_each_text(ea -> 'equipe') j where not coalesce(ea -> 'blesses', '[]') ? j.value and not coalesce(ea -> 'pr', '[]') ? j.value)
        select case when random() < (select sum(h) from r) then (select r.key from r where h > 0 order by -ln(1 - random()) / h limit 1) end into kb;
      elsif random() < pbl * (1 + 4 * (ea ->> 'fatigue')::numeric) then
        select j.key into kb from jsonb_each_text(ea -> 'equipe') j where not coalesce(ea -> 'blesses', '[]') ? j.value and not coalesce(ea -> 'pr', '[]') ? j.value
          order by -ln(1 - random()) / (1 + 5 * coalesce((ea -> 'fp' ->> j.value)::numeric, 0)) limit 1;
      end if;
      if kb is not null then
        ea := match_blesser(ea, kb);
        e := jsonb_set(e, '{ev}', (e -> 'ev') || (blessure_tirer() || jsonb_build_object('t', t, 'c', sb, 'ty', 'blessure', 'p', kb, 'n', ea -> 'joueurs' ->> kb,
          'id', ea -> 'equipe' ->> kb,
          'r', coalesce(coalesce(ea -> 'banc', '{}') ? kb and not coalesce(ea -> 'blesses', '[]') ? (ea -> 'banc' ->> kb), false), 's', sc)));
        if x = sb then eqx := ea; else eqy := ea; end if;
      end if;
    end if;
    end loop;
    e := e || jsonb_build_object(x, eqx, y, eqy, 'balle', y);
  end loop;
  return e || jsonb_build_object('t', t, 'score', sc);
end $$;
-- le momentum retombe : à la mi-temps (tout), ou sur un temps mort de l'équipe p_par quand la barre penche vers l'autre équipe
-- (bloquée ou non) ; événement « momentum-fin » (v = elle était bloquée)
create or replace function match_mom_casser(e jsonb, p_par text, p_cause text) returns jsonb language plpgsql immutable as $$
declare mom numeric := coalesce((e ->> 'mom')::numeric, 0); v text := e ->> 'momv'; adv text := case p_par when 'a' then 'b' else 'a' end;
begin
  if p_cause = 'mi-temps' then
    if mom = 0 and v is null then return e; end if;
    e := (e - 'momv') || jsonb_build_object('mom', 0);
    return jsonb_set(e, '{ev}', (e -> 'ev') || jsonb_build_object('t', (e ->> 't')::int, 'c', v, 'ty', 'momentum-fin', 'par', 'mi-temps', 'm', 0,
      'v', v is not null, 's', e -> 'score'));
  end if;
  if not (adv = 'a' and mom > 0 or adv = 'b' and mom < 0) then return e; end if;
  e := (e - 'momv') || jsonb_build_object('mom', 0);
  return jsonb_set(e, '{ev}', (e -> 'ev') || jsonb_build_object('t', (e ->> 't')::int, 'c', adv, 'ty', 'momentum-fin', 'par', 'tm', 'm', 0,
    'v', v is not null, 's', e -> 'score'));
end $$;
-- Jets de 7 m joués au mini-jeu (demande de Maël, 23 nov. 2026). sept = {c (qui tire), t, n (tireur), g (gardien), tir, gb (niveaux),
-- phase : 'tir' (le tireur, un joueur, vise) ou 'gardien' (le tir part : zone col/hau, durée du vol), limite (Classé : sans tir à temps,
-- « trop long », ballon à l'adversaire ; sans réaction du gardien, le ballon passe)}. L'ordinateur tire : la zone est tirée tout de suite.
-- niveaux d'un jet de 7 m (demande de Maël, 23 nov. 2026, comme les tirs au but) : la stat TIR du tireur, la moyenne de MEN et RÉF du
-- gardien ; une équipe de l'ordinateur (sans exemplaires) tire et garde à sa note (stat moyenne à cette note)
create or replace function sept_stat(eq jsonb, p_poste text, p_gardien boolean) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when p_gardien then (stat_note(x.note, (c.ecarts ->> 'men')::numeric) + stat_note(x.note, (c.ecarts ->> 'ref')::numeric)) / 2.0
       else stat_note(x.note, (c.ecarts ->> 'tir')::numeric) end
     from exemplaires x join cartes c on c.id = x.carte_id where x.id::text = eq -> 'equipe' ->> p_poste),
    stat_note(coalesce((eq ->> 'note')::numeric, ((eq ->> 'att')::numeric + (eq ->> 'def')::numeric) / 2, 75), 0))
$$;
create or replace function sept_preparer(e jsonb, x text, t int, nom text, gb text, eqx jsonb, eqy jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare poste text := coalesce((select k from unnest(array['DC', 'ARG', 'ARD']) k where eqx -> 'joueurs' ->> k = nom limit 1), 'DC');
  niv_t numeric := sept_stat(eqx, poste, false);
  niv_g numeric := sept_stat(eqy, 'GB', true); s jsonb;
begin
  s := jsonb_build_object('c', x, 't', t, 'n', nom, 'g', gb, 'tir', round(niv_t, 1), 'gb', round(niv_g, 1),
    'limite', pvp_maintenant() + parami('sept_tir_secondes'), 'phase', 'tir');
  if x = 'b' and not e ? 'pvp' then   -- l'ordinateur tire : où, et à quelle vitesse (plus son tireur est fort face à notre gardien, plus c'est rapide)
    s := s || jsonb_build_object('phase', 'gardien', 'col', case when random() < .35 then 'g' when random() < .54 then 'd' else 'c' end,
      'hau', case when random() < .5 then 'h' else 'b' end, 'duree', greatest(480, least(1100, round(900 - 6 * (niv_t - niv_g) - random() * 150))));
  end if;
  return s;
end $$;
-- la barre de momentum après une action jouée hors du moteur (jet de 7 m) : l'événement, puis le blocage éventuel
create or replace function match_mom_ev(e jsonb, ev jsonb, p_vers text, p_val numeric) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare mmax numeric := coalesce((param('momentum_max') #>> '{}')::numeric, 100); mom numeric;
begin
  if not e ? 'momv' then
    mom := least(mmax, greatest(-mmax, coalesce((e ->> 'mom')::numeric, 0) + case p_vers when 'a' then 1 else -1 end * coalesce(p_val, 0)));
    e := e || jsonb_build_object('mom', mom); ev := ev || jsonb_build_object('m', mom);
  end if;
  e := jsonb_set(e, '{ev}', (e -> 'ev') || ev);
  if not e ? 'momv' and abs(mom) >= mmax then
    e := e || jsonb_build_object('momv', case when mom > 0 then 'a' else 'b' end);
    e := jsonb_set(e, '{ev}', (e -> 'ev') || jsonb_build_object('t', ev -> 't', 'c', e ->> 'momv', 'ty', 'momentum', 'm', mom, 's', ev -> 's'));
  end if;
  return e;
end $$;
-- le point visé par le tireur (mini-jeu du jet de 7 m : x, y de 0 à 1 depuis le coin haut gauche ; puissance idéale 80 %, au-delà le
-- tir part de travers) : {x, y, vitesse}
create or replace function sept_point(p_tir jsonb) returns jsonb language plpgsql volatile as $$
declare x numeric := (p_tir ->> 'x')::numeric; y numeric := (p_tir ->> 'y')::numeric; pu numeric := (p_tir ->> 'puissance')::numeric; trop numeric;
begin
  if x is null or y is null or pu is null or x < -.5 or x > 1.5 or y < -.5 or y > 1.2 or pu < 0 or pu > 1 then raise exception 'Tir invalide'; end if;
  trop := greatest(0, pu - .8) / .2;
  x := x + (random() - .5) * .44 * trop; y := y + (random() - .5) * .38 * trop;
  return jsonb_build_object('x', round(x, 3), 'y', round(y, 3), 'vitesse', round(least(pu, .8) / .8, 3));
end $$;
-- Classé : le tireur a visé ; à côté, c'est fini ; sinon le ballon part vers la zone du but, que le gardien doit deviner à temps
create or replace function match_7m_viser(e jsonb, p_tir jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare s jsonb := e -> 'sept'; pt jsonb := sept_point(p_tir); x numeric := (pt ->> 'x')::numeric; y numeric := (pt ->> 'y')::numeric; d int;
begin
  -- vu du gardien (derrière son but, face au terrain), la gauche du tireur est à droite de l'écran
  d := greatest(450, least(1100, round(1000 - 450 * (pt ->> 'vitesse')::numeric - 4 * ((s ->> 'tir')::numeric - (s ->> 'gb')::numeric))));
  s := s || pt || jsonb_build_object('phase', 'gardien', 'col', case when x < 1 / 3.0 then 'd' when x > 2 / 3.0 then 'g' else 'c' end,
    'hau', case when y < .5 then 'h' else 'b' end, 'duree', d, 'limite', pvp_maintenant() + d / 1000.0 + parami('sept_gardien_secondes'));
  if x < 0 or x > 1 or y < 0 then s := s || '{"hors": "dehors"}'; elsif x < .05 or x > .95 or y < .05 then s := s || '{"hors": "poteau"}'; end if;
  e := e || jsonb_build_object('sept', s);
  if s ? 'hors' then return match_7m_resoudre(e, null, '{"temps": 0}'); end if;   -- à côté : pas besoin du gardien
  return e;
end $$;
-- le jet de 7 m tiré : p_tir = le tir du joueur contre le gardien de l'ordinateur ({x, y, puissance}, formule du mini-jeu corrigée par
-- les niveaux), ou {"long": true} (trop long) ; p_gb = la parade du joueur ({colonne, hauteur, temps}) contre le tir prévu (sept.col, hau,
-- duree) ; les deux nuls : tiré par la formule du moteur (simulation). Le résultat au fil (et la barre de momentum), sept_der pour le jeu.
-- un duel tireur-gardien de 7 m (jet de 7 m en match, tirs au but joués aux mini-jeux) : s = {tir, gb} et, pour un tir à arrêter,
-- {col, hau, duree} ; p_tir = notre tir (x, y, puissance) contre le gardien de l'ordinateur, p_gb = notre arrêt (colonne, hauteur, temps),
-- ni l'un ni l'autre = tiré par la formule ; renvoie {resultat} et le détail pour l'animation
create or replace function sept_duel(s jsonb, p_tir jsonb, p_gb jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare res text; d jsonb := '{}'; pt jsonb; niv_t numeric := (s ->> 'tir')::numeric; niv_g numeric := (s ->> 'gb')::numeric;
  vit numeric; gx numeric; gy numeric; portee numeric; px numeric; py numeric; tps numeric; pen numeric;
begin
  if coalesce((p_tir ->> 'long')::boolean, false) then
    res := 'long';
  elsif p_tir is not null then
    pt := sept_point(p_tir); px := (pt ->> 'x')::numeric; py := (pt ->> 'y')::numeric; vit := (pt ->> 'vitesse')::numeric;
    gx := case when random() < .3 then .2 when random() < .3 / .7 then .8 else .5 end; gy := case when random() < .5 then .3 else .75 end;
    portee := least(.9, greatest(.1, .66 - .46 * vit + case when gx = .5 then .08 else 0 end + .004 * (niv_g - niv_t)));
    res := case when px < 0 or px > 1 or py < 0 then 'dehors' when px < .05 or px > .95 or py < .05 then 'poteau' when abs(px - .5) < .2 then 'arret'
      when sqrt(power(px - (.5 + (gx - .5) * .6), 2) + power((py - gy) * .67, 2)) < portee then 'arret' else 'but' end;
    d := pt || jsonb_build_object('gardien', jsonb_build_object('x', gx, 'y', gy));
  elsif p_gb is not null and s ? 'col' then
    if s ? 'hors' then res := s ->> 'hors';
    else
      tps := coalesce((p_gb ->> 'temps')::numeric, 99999);
      if tps > (s ->> 'duree')::numeric + 60 then res := 'but';
      elsif p_gb ->> 'colonne' = s ->> 'col' and p_gb ->> 'hauteur' = s ->> 'hau' then res := 'arret';
      elsif p_gb ->> 'colonne' = s ->> 'col' and random() < .35 then res := 'arret';
      else res := 'but'; end if;
      if res = 'but' and not s ? 'x' and random() < .06 then res := case when random() < .5 then 'poteau' else 'dehors' end; end if;   -- l'ordinateur rate parfois
    end if;
    d := jsonb_build_object('colonne', s -> 'col', 'hauteur', s -> 'hau', 'duree', s -> 'duree', 'x', s -> 'x', 'y', s -> 'y', 'vitesse', s -> 'vitesse');
  else
    pen := least(.88, greatest(.55, .75 + .01 * (niv_t - niv_g)));
    res := case when random() < pen then 'but' when random() < .7 then 'arret' when random() < .5 then 'poteau' else 'dehors' end;
  end if;
  return d || jsonb_build_object('resultat', res);
end $$;
create or replace function match_7m_resoudre(e jsonb, p_tir jsonb, p_gb jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare s jsonb := e -> 'sept'; x text; y text; eqx jsonb; eqy jsonb; t int; sc jsonb; res text; d jsonb := '{}'; ev jsonb; pt jsonb;
  niv_t numeric; niv_g numeric; vit numeric; gx numeric; gy numeric; portee numeric; px numeric; py numeric; tps numeric; pen numeric;
  mval jsonb := coalesce(param('momentum_valeurs'), '{}');
begin
  if s is null then return e; end if;
  x := s ->> 'c'; y := case x when 'a' then 'b' else 'a' end; eqx := e -> x; eqy := e -> y; t := (s ->> 't')::int; sc := e -> 'score';
  niv_t := (s ->> 'tir')::numeric; niv_g := (s ->> 'gb')::numeric;
  d := sept_duel(s, p_tir, p_gb); res := d ->> 'resultat'; d := d - 'resultat';
  if res = 'long' then
    eqx := jsonb_set(eqx, '{stats,pertes}', to_jsonb((eqx #>> '{stats,pertes}')::int + 1));
    ev := jsonb_build_object('t', t, 'c', x, 'ty', 'perte', 'n', s -> 'n', 'long', true, 's', sc);
    e := e || jsonb_build_object(x, eqx, y, eqy);
    e := match_mom_ev(e, ev, y, coalesce((mval ->> 'perte')::numeric, 10));
  else
    eqx := jsonb_set(eqx, '{stats,sept}', to_jsonb((eqx #>> '{stats,sept}')::int + 1));
    eqx := jsonb_set(eqx, '{stats,tirs}', to_jsonb((eqx #>> '{stats,tirs}')::int + 1));
    eqx := jsonb_set(eqx, '{stats,xg}', to_jsonb(round(coalesce((eqx #>> '{stats,xg}')::numeric, 0) + least(.88, greatest(.55, .75 + .01 * (niv_t - niv_g))), 3)));
    if res = 'but' then
      sc := jsonb_set(sc, array[case x when 'a' then '0' else '1' end], to_jsonb((sc ->> case x when 'a' then 0 else 1 end)::int + 1));
      eqx := jsonb_set(eqx, '{stats,buts}', to_jsonb((eqx #>> '{stats,buts}')::int + 1));
      eqx := jsonb_set(eqx, '{stats,zones,7m}', to_jsonb((eqx #>> '{stats,zones,7m}')::int + 1));
    elsif res = 'arret' then
      eqy := jsonb_set(eqy, '{stats,arrets}', to_jsonb((eqy #>> '{stats,arrets}')::int + 1));
    end if;
    ev := jsonb_build_object('t', t, 'c', x, 'ty', case res when 'but' then '7m-but' when 'arret' then '7m-arret' else res end,
      'n', s -> 'n', 'g', s -> 'g', 'z', '7m', 's', sc, 'x', eqx #> '{stats,xg}', 'joue', true);
    e := e || jsonb_build_object(x, eqx, y, eqy, 'score', sc);
    e := match_mom_ev(e, ev, case when res = 'but' then x else y end,
      case res when 'but' then coalesce((mval ->> '7m-but')::numeric, 14) when 'arret' then coalesce((mval ->> '7m-arret')::numeric, 20) else coalesce((mval ->> 'rate')::numeric, 5) end);
  end if;
  return (e - 'sept') || jsonb_build_object('balle', y, 't', t, 'sept_der', d || jsonb_build_object('resultat', res, 'c', x));
end $$;
-- un bloc de 5 minutes ; à la mi-temps, l'adversaire peut s'adapter et l'équipe récupère un peu
-- Une tranche : on garde l'état du match à son début (debut, sans le fil ; debut_n = longueur du fil à ce moment ; servi = quand elle
-- a été jouée, servi_t = sa première seconde) pour pouvoir y revenir : un changement de joueurs se fait à la seconde où on le
-- demande, au milieu de la tranche déjà jouée (match_rembobiner, match_changer)
create or replace function match_bloc_jouer(e jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare b int := (e ->> 'bloc')::int;
begin
  if b >= 12 then return e; end if;
  e := e || jsonb_build_object('blocs', coalesce(e -> 'blocs', '[]') || jsonb_build_object('aa', e #>> '{a,attaque}', 'ad', e #>> '{a,defense}',
    'ba', e #>> '{b,attaque}', 'bd', e #>> '{b,defense}'));
  e := e || jsonb_build_object('debut', e - 'debut' - 'ev', 'debut_n', jsonb_array_length(e -> 'ev'),
    'servi', extract(epoch from clock_timestamp()), 'servi_t', (e ->> 't')::int);
  return match_bloc_suite(e);
end $$;
-- la fin d'une tranche, depuis la seconde où le match en est (t) : les possessions, puis la mi-temps ou l'entraîneur adverse
create or replace function match_bloc_suite(e jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare b int := (e ->> 'bloc')::int;
begin
  e := match_avancer(e, (b + 1) * 300);
  if e ? 'sept' then return e; end if;   -- un jet de 7 m à jouer : la tranche reprendra après (match_7m_resoudre)
  e := jsonb_set(e, '{bloc}', to_jsonb(b + 1));
  if b + 1 = 6 then
    e := jsonb_set(e, '{ev}', (e -> 'ev') || jsonb_build_object('t', 1800, 'ty', 'mi-temps', 's', e -> 'score'));
    e := match_mom_casser(e, null, 'mi-temps');
    e := e || jsonb_build_object('a', case when e -> 'a' ? 'fcfg' then match_fat(e -> 'a', 0, 0, 1, (e #>> '{a,fcfg,mt}')::numeric) else match_fat(e -> 'a', 0, 0, .5) end,
      'b', case when e -> 'b' ? 'fcfg' then match_fat(e -> 'b', 0, 0, 1, (e #>> '{b,fcfg,mt}')::numeric) when e -> 'b' ? 'fo' then match_fat(e -> 'b', 0, 0, 0) else match_fat(e -> 'b', 0, 0, .5) end);
    if not e ? 'pvp' then e := match_ordi(e, true); end if;   -- en match à deux, chaque équipe a son entraîneur humain
    e := jsonb_set(e, '{balle}', to_jsonb(case when random() < .5 then 'a' else 'b' end));
  elsif b + 1 < 12 and not e ? 'pvp' then
    e := match_ordi(e, false);
  end if;
  return e;
end $$;
-- le match tel qu'il était à la seconde h de la tranche jouée en dernier : l'état du début de la tranche, plus ce que le fil a
-- déjà raconté jusqu'à h (score, stats, exclusions, qui a le ballon, contre-attaque en cours, fatigue) ; la suite est oubliée
create or replace function match_rembobiner(e jsonb, h int) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d jsonb := e -> 'debut'; n0 int := (e ->> 'debut_n')::int; t0 int; dt numeric; x jsonb; i int := 0; garde jsonb := '[]'; sc jsonb;
  st jsonb := jsonb_build_object('a', e #> '{debut,a,stats}', 'b', e #> '{debut,b,stats}');
  ex jsonb := jsonb_build_object('a', coalesce((e #>> '{debut,a,exclu}')::int, 0), 'b', coalesce((e #>> '{debut,b,exclu}')::int, 0));
  der jsonb; prochain jsonb; c text; o text; balle text; contre text; bl jsonb := '[]'; blb jsonb := '[]'; ra jsonb; rb jsonb; kbl text; POSS constant text[] := array['but', '7m-but', '7m-arret', 'arret', 'poteau', 'dehors', 'perte'];
  mom numeric := coalesce((e #>> '{debut,mom}')::numeric, 0); momv text := e #>> '{debut,momv}';
begin
  t0 := (d ->> 't')::int; dt := greatest(0, h - t0); sc := d -> 'score'; balle := d ->> 'balle'; contre := d ->> 'contre';
  for x in select v from jsonb_array_elements(e -> 'ev') with ordinality z(v, k) where k > n0 order by k loop
    if (x ->> 't')::int > h then
      if prochain is null and x ->> 'ty' = any(POSS) then prochain := x; end if;
      continue;
    end if;
    garde := garde || x; c := x ->> 'c'; o := case c when 'a' then 'b' else 'a' end;
    if x ? 's' then sc := x -> 's'; end if;
    if x ->> 'ty' in ('but', 'arret', 'poteau', 'dehors', '7m-but', '7m-arret') then st := jsonb_set(st, array[c, 'tirs'], to_jsonb((st #>> array[c, 'tirs'])::int + 1)); end if;
    if x ->> 'ty' in ('but', '7m-but') then
      st := jsonb_set(st, array[c, 'buts'], to_jsonb((st #>> array[c, 'buts'])::int + 1));
      st := jsonb_set(st, array[c, 'zones', x ->> 'z'], to_jsonb((st #>> array[c, 'zones', x ->> 'z'])::int + 1));
    end if;
    if x ->> 'ty' in ('arret', '7m-arret') then st := jsonb_set(st, array[o, 'arrets'], to_jsonb((st #>> array[o, 'arrets'])::int + 1)); end if;
    if x ->> 'ty' like '7m%' then st := jsonb_set(st, array[c, 'sept'], to_jsonb((st #>> array[c, 'sept'])::int + 1)); end if;
    if x ->> 'ty' = 'perte' then st := jsonb_set(st, array[c, 'pertes'], to_jsonb((st #>> array[c, 'pertes'])::int + 1)); end if;
    if x ->> 'ty' = 'excl' then
      st := jsonb_set(st, array[c, 'excl'], to_jsonb((st #>> array[c, 'excl'])::int + 1));
      ex := jsonb_set(ex, array[c], to_jsonb(greatest((ex ->> c)::int, (x ->> 't')::int + 120)));
    end if;
    if x ->> 'ty' = any(POSS) then der := x; end if;
    if x ->> 'ty' = 'blessure' then if c = 'b' then blb := blb || to_jsonb(x ->> 'p'); else bl := bl || to_jsonb(x ->> 'p'); end if; end if;
    if x ? 'x' and c in ('a', 'b') then st := jsonb_set(st, array[c, 'xg'], x -> 'x'); end if;
    if x ? 'm' then mom := (x ->> 'm')::numeric; end if;
    if x ->> 'ty' = 'momentum' then momv := c; elsif x ->> 'ty' = 'momentum-fin' then momv := null; end if;
  end loop;
  if der is not null then
    balle := case der ->> 'c' when 'a' then 'b' else 'a' end;
    -- après une perte de balle, la contre-attaque qui suivait (elle se voit à la possession suivante)
    contre := case when der ->> 'ty' = 'perte' and prochain ->> 'c' = balle and prochain ->> 'z' = 'contre' then balle end;
  end if;
  d := (d - 'contre') || case when contre is not null then jsonb_build_object('contre', contre) else '{}' end;
  ra := match_fatiguer((d -> 'a') || jsonb_build_object('stats', st -> 'a', 'exclu', (ex ->> 'a')::int), dt);
  for kbl in select jsonb_array_elements_text(bl) loop ra := match_blesser(ra, kbl); end loop;
  rb := match_fatiguer((d -> 'b') || jsonb_build_object('stats', st -> 'b', 'exclu', (ex ->> 'b')::int), dt);
  for kbl in select jsonb_array_elements_text(blb) loop rb := match_blesser(rb, kbl); end loop;   -- match à deux : l'autre équipe aussi
  return (d - 'momv') || jsonb_build_object('ev', (select coalesce(jsonb_agg(v order by k), '[]') from jsonb_array_elements(e -> 'ev') with ordinality z(v, k) where k <= n0) || garde,
    't', h, 'score', sc, 'balle', balle, 'mom', mom,
    'a', ra,
    'b', rb,
    'debut', e -> 'debut', 'debut_n', n0, 'servi', e -> 'servi', 'servi_t', e -> 'servi_t')
    || case when momv is not null then jsonb_build_object('momv', momv) else '{}'::jsonb end;
end $$;
-- ce que le jeu voit d'un match en cours : tout, sauf l'attaque adverse (à deviner) et les forces exactes
create or replace function match_vue(e jsonb, p_depuis int default 0) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('type', e ->> 'type', 'bloc', (e ->> 'bloc')::int, 'minute', (e ->> 't')::int / 60.0, 'score', e -> 'score',
    'tempsMorts', e -> 'tm', 'tempsMortsAdv', coalesce(e -> 'tmb', '{"restants": 3}'),
    'fini', (e ->> 'bloc')::int >= 12,
    'sept', case when e ? 'sept' then jsonb_build_object('c', e #>> '{sept,c}', 't', (e #>> '{sept,t}')::int, 'n', e #>> '{sept,n}', 'g', e #>> '{sept,g}', 'phase', e #>> '{sept,phase}',
      'reste', greatest(0, round(coalesce((e #>> '{sept,limite}')::numeric, 0) - extract(epoch from clock_timestamp())::numeric, 1)))
      || case when e #>> '{sept,c}' = 'b' and e #>> '{sept,phase}' = 'gardien' then jsonb_build_object('col', e #>> '{sept,col}', 'hau', e #>> '{sept,hau}',
        'duree', (e #>> '{sept,duree}')::int) else '{}'::jsonb end end,
    'nous', jsonb_build_object('nom', e #>> '{a,nom}', 'note', e -> 'a' -> 'note', 'joueurs', e -> 'a' -> 'joueurs', 'tactique', e #>> '{a,tactique}',
      'consigne', e #>> '{a,consigne}', 'stats', e -> 'a' -> 'stats',
      -- chaque poste : le titulaire et son remplaçant, leur note à ce poste et leur fatigue (0 = frais)
      'effectif', case when jsonb_typeof(e -> 'a' -> 'banc') = 'object' then (select jsonb_object_agg(k, jsonb_build_object(
        'n', e -> 'a' -> 'joueurs' ->> k, 'note', e -> 'a' -> 'notes' -> k, 'f', e -> 'a' -> 'fp' -> (e -> 'a' -> 'equipe' ->> k),
        'r', e -> 'a' -> 'bn' ->> k, 'rnote', e -> 'a' -> 'nb' -> k, 'rf', e -> 'a' -> 'fp' -> (e -> 'a' -> 'banc' ->> k),
        'bl', coalesce(e -> 'a' -> 'blesses', '[]') ? (e -> 'a' -> 'equipe' ->> k), 'rbl', coalesce(e -> 'a' -> 'blesses', '[]') ? (e -> 'a' -> 'banc' ->> k)))
        from unnest(array['AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB']) k) end),
    'eux', jsonb_build_object('nom', e #>> '{b,nom}', 'note', e -> 'b' -> 'note', 'joueurs', e -> 'b' -> 'joueurs', 'defense', e #>> '{b,defense}',
      'entraineur', coalesce(e #>> '{ia,nom}', 'réfléchi'),
      -- Légendes : ce qu'il a remarqué de notre façon de jouer (l'indice du panneau Tactique), à partir de 2 tranches comptées
      'lecture', case when coalesce((e #>> '{ia,anticipe}')::numeric, 0) > 0 then
        (select case when (l ->> 'n')::int >= 2 then jsonb_build_object('att', (l ->> 'att')::int, 'def', (l ->> 'def')::int) end from ia_lecture(e -> 'blocs') l) end,
      'stats', e -> 'b' -> 'stats'),
    'evenements', coalesce((select jsonb_agg(x) from jsonb_array_elements(e -> 'ev') with ordinality z(x, i) where i > p_depuis), '[]'),
    'tirsAuBut', case when coalesce((e ->> 'tab_attente')::boolean, false) and not e ? 'tab_jeu' then match_tab_candidats(e) end,
    'tabJeu', case when e ? 'tab_jeu' then match_tab_vue(e) end)
$$;
-- le résultat, dans le format d'avant (a, b, buts, résultat) + les événements et les stats
create or replace function match_resultat(e jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('a', (e #>> '{score,0}')::int, 'b', (e #>> '{score,1}')::int,
    'resultat', case when (e #>> '{score,0}')::int > (e #>> '{score,1}')::int then 'gagne' when (e #>> '{score,0}')::int = (e #>> '{score,1}')::int then 'nul' else 'perdu' end,
    'buts', coalesce((select jsonb_agg(jsonb_build_object('m', 1 + least(59, (x ->> 't')::int / 60), 'c', x ->> 'c', 'n', x ->> 'n')) from jsonb_array_elements(e -> 'ev') x
      where x ->> 'ty' in ('but', '7m-but')), '[]'),
    'stats', jsonb_build_object('a', e -> 'a' -> 'stats', 'b', e -> 'b' -> 'stats'), 'simules', (e ->> 'simules')::int)
    || case when e ? 'tab' then jsonb_build_object('tab', e -> 'tab') else '{}'::jsonb end
$$;

-- résumé tactique de fin de match (le jeu le montre avec le résultat) : pour chaque tranche, si notre attaque et notre défense prenaient
-- le dessus (1), étaient contrées (−1) ou neutres (0), les tactiques des deux équipes (l'attaque adverse est révélée), le bonus de
-- notre équipe pour chaque choix, le style de l'entraîneur adverse
create or replace function match_resume(e jsonb) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'blocs', coalesce((select jsonb_agg(jsonb_build_object('att', contre_tactique(x ->> 'aa', x ->> 'bd'), 'def', -contre_tactique(x ->> 'ba', x ->> 'ad'),
      'aa', x ->> 'aa', 'ad', x ->> 'ad', 'ba', x ->> 'ba', 'bd', x ->> 'bd') order by i) from jsonb_array_elements(coalesce(e -> 'blocs', '[]')) with ordinality z(x, i)), '[]'),
    'bonus', (select jsonb_object_agg(k, case when jsonb_typeof(e -> 'a' -> 'moyennes') = 'object' then tactique_bonus(e -> 'a' -> 'moyennes', k) else 0 end)
      from unnest(array['duels', 'enclenchement', 'rapide', '06', '15', '33']) k),
    'entraineur', coalesce(e #>> '{ia,nom}', 'réfléchi'), 'tempsMorts', 3 - (e #>> '{tm,restants}')::int,
    'tempsMortsAdv', 3 - coalesce((e #>> '{tmb,restants}')::int, 3),
    'changementsAdv', (select count(*) from jsonb_array_elements(e -> 'ev') x where x ->> 'c' = 'b' and x ->> 'ty' in ('defense', 'attaque')))
$$;
-- l'adversaire du prochain match du parcours (sans rien changer)
create or replace function championnat_adversaire(pc jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare typ text := pc ->> 'type'; niv int := (pc ->> 'niveau')::int; nv jsonb := param('parcours') -> (niv - 1);
  m jsonb; a int; b int; fadv numeric; adv text; fb jsonb; dom boolean := true; t int; le jsonb;
begin
  if typ = 'poule' or (typ = 'tournoi' and pc ->> 'phase' = 'poule') then
    for m in select x from jsonb_array_elements(pc -> 'calendrier' -> (pc ->> 'journee')::int) x loop
      a := (m ->> 0)::int; b := (m ->> 1)::int;
      if a = 0 or b = 0 then dom := a = 0; fadv := (pc -> 'equipes' -> (a + b) ->> 'f')::numeric; adv := pc -> 'equipes' -> (a + b) ->> 'nom'; end if;
    end loop;
    fb := equipe_ordi(fadv);
  elsif typ = 'tournoi' then
    t := (pc ->> 'tour')::int; adv := pc -> 'adversaires' -> t ->> 'nom'; fadv := (pc -> 'adversaires' -> t ->> 'f')::numeric;
    fb := equipe_ordi(fadv);
  else
    le := param('legendes_equipes') -> (legende_rang(pc) - 1);
    adv := 'Légende ' || legende_rang(pc) || ' · ' || (le ->> 'nom'); fadv := (le ->> 'f')::numeric;
    fb := jsonb_build_object('att', round((fadv + random() * 2 - 1)::numeric, 1), 'def', round((fadv + random() * 2 - 1)::numeric, 1), 'note', fadv,
      'tireurs', (select jsonb_agg(jsonb_build_object('n', x ->> 'n', 'p', (x ->> 'p')::int)) from jsonb_array_elements(le -> 'joueurs') x where x ->> 'poste' <> 'GB'),
      'joueurs', (select jsonb_object_agg(x ->> 'poste', x ->> 'n') from jsonb_array_elements(le -> 'joueurs') x));
  end if;
  return jsonb_build_object('nom', adv, 'f', fadv, 'equipe', fb || jsonb_build_object('nom', adv), 'domicile', dom);
end $$;

-- fin du match : les gains et la suite (parcours, défi entre ami(e)s), puis le match en cours est effacé
drop function if exists match_conclure(uuid, jsonb, numeric);
create or replace function match_conclure(p_uid uuid, e jsonb, p_gain numeric, p_auto boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb := match_resultat(e); s jsonb;
begin
  -- un nul qui se départage (tournoi, Légendes) : tirs au but ; en direct, le match s'arrête sur le menu des tireurs (match_tirs_au_but)
  if e ->> 'type' = 'championnat' and r ->> 'resultat' = 'nul' and not e ? 'tab' and tab_requis(p_uid) then
    if p_auto then
      e := match_tab_jouer(e, null, null); r := match_resultat(e);
    else
      update matchs_direct set etat = e || jsonb_build_object('tab_attente', true, 'tab_gain', p_gain), maj = now() where user_id = p_uid;
      return jsonb_build_object('direct', true, 'tirsAuBut', match_tab_candidats(e));
    end if;
  end if;
  delete from matchs_direct where user_id = p_uid;   -- avant : l'état renvoyé n'a plus de match en cours
  -- blessures : chaque match joué (championnat, défi) compte pour les absences en cours ; puis celles de ce match, sur la carte
  update exemplaires set blessure = blessure - 1, blessure_g = case when blessure > 1 then blessure_g end where proprietaire = p_uid and blessure > 0;
  update exemplaires set protection = protection - 1 where proprietaire = p_uid and protection > 0;
  update exemplaires x set blessure = greatest(x.blessure, (v ->> 'm')::int), blessure_g = v ->> 'g'
    from jsonb_array_elements(e -> 'ev') v where v ->> 'ty' = 'blessure' and v ->> 'c' = 'a' and coalesce((v ->> 'm')::int, 0) > 0
      and x.id::text = v ->> 'id' and x.proprietaire = p_uid;
  if e ->> 'type' = 'championnat' then
    s := championnat_conclure(p_uid, e #>> '{a,tactique}', e -> 'a', e -> 'b', r, p_gain);
  elsif e ->> 'type' = 'classe' then
    s := pvp_fantome_conclure(p_uid, e, r, p_gain);
  else
    s := defi_ami_conclure(p_uid, (e #>> '{ctx,ami}')::uuid, e -> 'a', e -> 'b', r, p_gain);
  end if;
  perform noter(p_uid, 'match', jsonb_build_object('type', e ->> 'type', 'score', e -> 'score', 'gain', p_gain, 'simules', e -> 'simules'));
  return s || jsonb_build_object('direct', (e ->> 'simules')::int < 12, 'gain', p_gain, 'resume', match_resume(e),
    'match', (s -> 'match') || jsonb_build_object('stats', r -> 'stats', 'evenements', e -> 'ev'));
end $$;
-- joue tous les blocs qui restent, sans adaptation
-- « Simuler » : un adjoint coache à ta place (demande de Maël, 14 nov. 2026 : simuler perdait bien plus souvent qu'un joueur actif).
-- Avant chaque tranche, avec la probabilité match_simule_lecture, il passe à l'attaque qui bat leur défense du moment ; il garde ta
-- défense et ta consigne et ne prend pas de temps mort : moins bien qu'un joueur attentif, mieux qu'une tactique figée.
create or replace function match_adjoint(e jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare d text := e #>> '{b,defense}'; ma text := e #>> '{a,defense}'; att text;
  t int := (e ->> 't')::int; per text := case when (e ->> 't')::int < 1800 then 'p1' else 'p2' end;
begin
  -- leur momentum bloqué : il prend un temps mort pour le casser, s'il nous en reste
  if e ->> 'momv' = 'b' and t > 0 and t < 3600 and (e #>> '{tm,restants}')::int > 0 and coalesce((e -> 'tm' ->> per)::int, 0) < 2 then
    e := match_tm_prendre(e);
  end if;
  if d is null or ma is null or random() >= coalesce((param('match_simule_lecture') #>> '{}')::numeric, 0) then return e; end if;
  select y into att from unnest(array['duels', 'enclenchement', 'rapide']) y where contre_tactique(y, d) = 1;
  if att is null or att = e #>> '{a,attaque}' then return e; end if;
  if (e ->> 'bloc')::int > 0 then
    e := jsonb_set(e, '{ev}', (e -> 'ev') || jsonb_build_object('t', (e ->> 't')::int, 'c', 'a', 'ty', 'tactique', 'v', att || ':' || ma,
      'cons', coalesce(e #>> '{a,consigne}', 'normal'), 'adj', true, 's', e -> 'score'));
  end if;
  -- l'attaque jouée change, pas la tactique choisie par le joueur (e.a.tactique, enregistrée dans son onglet Équipe en fin de match)
  return e || jsonb_build_object('a', match_tactique(e -> 'a', att, ma));
end $$;
-- l'adjoint fait aussi les changements, avant chaque tranche : à chaque poste, il met sur le terrain celui des deux qui vaudra le plus
-- pendant les 5 minutes à venir : sa note au poste, moins le malus de sa fatigue à la fin de la tranche, moins un coût pour le risque
-- de blessure (300 × (fatigue − seuil des blessures)²), avec 1 point de marge. Ancienne fatigue (match commencé avant) : note −
-- fatigue × 58 × fw (30 × fw pour le but), 2 points de marge.
create or replace function match_adjoint_changer(e jsonb, p_uid uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb := e -> 'a'; k text; vt numeric; vr numeric; kf numeric; postes text[] := '{}'; w numeric := coalesce((e #>> '{a,fw}')::numeric, 1);
  ft numeric; fb numeric; r5 numeric; mm numeric; ms numeric; bs numeric;
begin
  if coalesce(jsonb_typeof(a -> 'banc'), '') <> 'object' or (e ->> 'bloc')::int >= 12 then return e; end if;
  r5 := 5 * coalesce((a -> 'fcfg' -> 'rythme' ->> coalesce(a ->> 'consigne', 'normal'))::numeric, .03);
  mm := coalesce((a #>> '{fcfg,m}')::numeric, 80); ms := coalesce((a #>> '{fcfg,s}')::numeric, .3); bs := coalesce((a #>> '{fcfg,bs}')::numeric, .35);
  for k in select jsonb_object_keys(a -> 'banc') loop
    if coalesce(a -> 'blesses', '[]') ? (a -> 'banc' ->> k) then continue; end if;
    if coalesce(a -> 'blesses', '[]') ? (a -> 'equipe' ->> k) then postes := postes || k; continue; end if;
    if a ? 'fcfg' then
      ft := coalesce((a -> 'fp' ->> (a -> 'equipe' ->> k))::numeric, 0) + r5 * coalesce((a -> 'fr' ->> (a -> 'equipe' ->> k))::numeric, 1)
        * case when k = 'GB' then coalesce((a #>> '{fcfg,gb}')::numeric, 1) else 1 end;
      fb := coalesce((a -> 'fp' ->> (a -> 'banc' ->> k))::numeric, 0) + r5 * coalesce((a -> 'fr' ->> (a -> 'banc' ->> k))::numeric, 1)
        * case when k = 'GB' then coalesce((a #>> '{fcfg,gb}')::numeric, 1) else 1 end;
      vt := (a -> 'notes' ->> k)::numeric - mm * greatest(0, ft - ms) ^ 2 - 300 * greatest(0, ft - bs) ^ 2;
      vr := (a -> 'nb' ->> k)::numeric - mm * greatest(0, fb - ms) ^ 2 - 300 * greatest(0, fb - bs) ^ 2;
      if vr > vt + 1 then postes := postes || k; end if;
      continue;
    end if;
    kf := w * case when k = 'GB' then 30 else 58 end;
    vt := (a -> 'notes' ->> k)::numeric - kf * coalesce((a -> 'fp' ->> (a -> 'equipe' ->> k))::numeric, 0);
    vr := (a -> 'nb' ->> k)::numeric - kf * coalesce((a -> 'fp' ->> (a -> 'banc' ->> k))::numeric, 0);
    if vr > vt + 2 then postes := postes || k; end if;
  end loop;
  if cardinality(postes) = 0 then return e; end if;
  begin return match_changer_e(e, p_uid, postes);
  exception when others then return e;   -- une carte vendue entre-temps : il ne change rien
  end;
end $$;
-- la seconde à laquelle le jeu demande une action au milieu d'une tranche déjà jouée : pas plus tôt que ce que le récit a montré
-- à la vitesse ×1 depuis que la tranche est servie (sinon on rejouerait une tranche dont on connaît la fin), pas plus tard que sa fin
create or replace function match_seconde(e jsonb, p_seconde int) returns int language plpgsql stable as $$
declare fin int := (e ->> 't')::int; h int := least(fin, greatest(0, coalesce(p_seconde, fin)));
begin
  if not (e ? 'debut') or ((e ->> 'bloc')::int < 1 and not e ? 'sept') then return fin; end if;   -- 7 m en attente dans la 1re tranche : on peut y revenir
  return least(fin, greatest(h, (e #>> '{debut,t}')::int,
    (e ->> 'servi_t')::int + floor((extract(epoch from clock_timestamp()) - (e ->> 'servi')::numeric) * 25)::int));
end $$;
-- une tranche interrompue (temps mort pris au milieu) : on garde l'état du moment pour pouvoir y revenir, puis la fin de la tranche
create or replace function match_reprendre_tranche(e jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if (e ->> 't')::int <= (e ->> 'bloc')::int * 300 then return e; end if;
  e := e || jsonb_build_object('debut', e - 'debut' - 'ev', 'debut_n', jsonb_array_length(e -> 'ev'),
    'servi', extract(epoch from clock_timestamp()), 'servi_t', (e ->> 't')::int);
  return match_bloc_suite(e);
end $$;
-- au coup d'envoi, les cartes encore blessées : un titulaire absent est remplacé par son remplaçant (s'il est valide), sinon il joue
-- diminué ; un remplaçant blessé ne peut pas entrer. Raconté au fil (« absent »).
create or replace function match_absents(e jsonb, p_uid uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb := e -> 'a'; l record; postes text[] := '{}'; ev jsonb := '[]'; rid text; ok boolean;
begin
  if coalesce(jsonb_typeof(a -> 'fp'), '') <> 'object' then return e; end if;
  -- remplaçants blessés : sur la liste (ils ne peuvent pas entrer)
  for l in select j.key, j.value from jsonb_each_text(coalesce(a -> 'banc', '{}')) j join exemplaires x on x.id::text = j.value where x.blessure > 0 loop
    a := a || jsonb_build_object('blesses', coalesce(a -> 'blesses', '[]') || to_jsonb(l.value));
  end loop;
  for l in select j.key, j.value, x.blessure, x.blessure_g from jsonb_each_text(a -> 'equipe') j join exemplaires x on x.id::text = j.value where x.blessure > 0 loop
    rid := a -> 'banc' ->> l.key;
    ok := rid is not null and not coalesce(a -> 'blesses', '[]') ? rid;
    ev := ev || jsonb_build_object('t', 0, 'c', 'a', 'ty', 'absent', 'p', l.key, 'n', a -> 'joueurs' ->> l.key, 'm', l.blessure, 'g', l.blessure_g, 'r', ok, 's', e -> 'score');
    if ok then
      a := a || jsonb_build_object('blesses', coalesce(a -> 'blesses', '[]') || to_jsonb(l.value)); postes := postes || l.key;
    else
      a := match_blesser(a, l.key);   -- pas de remplaçant valide : il joue, diminué
    end if;
  end loop;
  e := jsonb_set(e || jsonb_build_object('a', a), '{ev}', (e -> 'ev') || ev);
  if cardinality(postes) > 0 then e := match_changer_e(e, p_uid, postes); end if;
  return e;
end $$;
create or replace function match_finir_simule(p_uid uuid, e jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare reste int := 12 - (e ->> 'bloc')::int; g numeric := (param('match_simule_gain') #>> '{}')::numeric;
begin
  e := e - 'sept_jeu';
  if e ? 'sept' then e := match_7m_resoudre(e, null, null); end if;   -- un jet de 7 m en attente : tiré par la formule
  e := match_reprendre_tranche(e);
  while (e ->> 'bloc')::int < 12 loop e := match_bloc_jouer(match_adjoint(match_adjoint_changer(e, p_uid))); end loop;
  e := jsonb_set(e, '{simules}', to_jsonb((e ->> 'simules')::int + reste));
  return match_conclure(p_uid, e, round(1 - (1 - g) * reste / 12.0, 4), true);
end $$;

-- commencer un match : championnat (un match de la réserve) ou défi d'un(e) ami(e) ; p_simuler : tout de suite, gains réduits
create or replace function match_commencer(p_type text, p_cible text, p_tactique text, p_consigne text, p_simuler boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a profils; cur matchs_direct; adv jsonb; fa jsonb; fb jsonb; e jsonb; batt text; bdef text; ctx jsonb;
begin
  select * into cur from matchs_direct where user_id = p.user_id;
  if found then
    if cur.maj < now() - interval '1 day' then perform match_finir_simule(p.user_id, cur.etat);   -- oublié depuis la veille : terminé tout seul
    else raise exception 'Tu as un match en cours : reprends-le ou simule la fin'; end if;
    select * into p from profils where user_id = p.user_id;
  end if;
  -- l'ancien défi contre l'équipe d'un(e) ami(e) coachée par l'ordinateur est retiré (demande de Maël, 23 nov. 2026) : on se défie en direct (pvp_inviter) ;
  -- un défi déjà commencé se termine normalement
  if p_type <> 'championnat' then raise exception 'Match inconnu'; end if;
  if coalesce(p_consigne, 'normal') not in ('normal', 'prudent', 'pression') then raise exception 'Consigne inconnue'; end if;
  perform verifier_tactique(p_tactique);
  perform verifier_equipe(p.user_id, p.equipe);
  fa := force_equipe(p.equipe, p_tactique) || jsonb_build_object('nom', p.pseudo) || match_banc_init(p.user_id, p.equipe, p.remplacants, p_tactique);
  if p_type = 'championnat' then
    perform matchs_a_jour(p.user_id);
    if (select matchs from profils where user_id = p.user_id) < 1 then
      raise exception 'Plus de match pour l’instant : un nouveau arrive toutes les % minutes', parami('match_minutes');
    end if;
    update profils set matchs = matchs - 1, matchs_maj = case when matchs >= parami('match_stock_max') then now() else matchs_maj end
      where user_id = p.user_id;
    if p.parcours is null then update profils set parcours = parcours_nouveau(1, null, p.pseudo) where user_id = p.user_id returning * into p; end if;
    adv := championnat_adversaire(p.parcours);
    fb := adv -> 'equipe';
    batt := (array['duels', 'enclenchement', 'rapide'])[1 + floor(random() * 3)::int];
    bdef := (array['06', '15', '33'])[1 + floor(random() * 3)::int];
    ctx := jsonb_build_object('domicile', adv -> 'domicile');
  else
    a := ami_de(p_cible);
    if not sont_amis(p.user_id, a.user_id) then raise exception 'Vous n’êtes pas ami(e)s'; end if;
    if compter_jour(p.user_id, 'defi_ami') >= parami('defis_amis_par_jour') then
      raise exception 'Tu as lancé tes % défis entre ami(e)s du jour : reviens demain', parami('defis_amis_par_jour');
    end if;
    begin fb := force_equipe(a.equipe, a.tactique) || jsonb_build_object('nom', a.pseudo);
    exception when others then raise exception '% n’a pas encore d’équipe complète', a.pseudo; end;
    batt := tac_attaque(a.tactique); bdef := tac_defense(a.tactique);   -- l'ami(e) joue avec sa tactique
    ctx := jsonb_build_object('ami', a.user_id);
  end if;
  update profils set tactique = p_tactique where user_id = p.user_id;
  e := match_nouveau(p_type, ctx, fa, fb, p_tactique, coalesce(p_consigne, 'normal'), batt, bdef);
  e := e || jsonb_build_object('ia', match_ia(case when p_type = 'championnat' then match_ia_niveau(p.parcours) else 'reflechi' end));
  e := match_absents(e, p.user_id);
  if p_simuler then return match_finir_simule(p.user_id, e); end if;
  e := e || '{"sept_jeu": true}';   -- jets de 7 m joués au mini-jeu
  insert into matchs_direct (user_id, etat) values (p.user_id, e);
  return jsonb_build_object('direct', true, 'vue', match_vue(e), 'etat', etat_de(p.user_id));
end $$;
-- le bloc suivant du match en cours. Tactique et consigne ne changent qu'au coup d'envoi, à la mi-temps ou sur un temps mort
-- (3 par match, 2 par période au plus) ; le dernier bloc termine le match
-- un temps mort du joueur, à la fin d'une tranche (3 par match, 2 par période) : élan pendant 3 minutes, un peu de fraîcheur, et
-- surtout (demande de Maël, 14 nov. 2026) la tactique adverse du moment dévoilée, attaque comprise (elle est cachée le reste du temps)
create or replace function match_tm_prendre(e jsonb) returns jsonb language plpgsql stable as $$
declare t int := (e ->> 't')::int; per text := case when t < 1800 then 'p1' else 'p2' end;
begin
  if t <= 0 or t >= 3600 then raise exception 'Pas de temps mort maintenant'; end if;
  if (e #>> '{tm,restants}')::int < 1 then raise exception 'Plus de temps mort'; end if;
  if (e -> 'tm' ->> per)::int >= 2 then raise exception 'Déjà 2 temps morts dans cette période'; end if;
  e := jsonb_set(e, '{tm}', (e -> 'tm') || jsonb_build_object('restants', (e #>> '{tm,restants}')::int - 1, per, (e -> 'tm' ->> per)::int + 1));
  e := jsonb_set(e, '{a,elan}', to_jsonb((e ->> 't')::int + 180));
  e := e || jsonb_build_object('a', case when e -> 'a' ? 'fcfg' then match_fat(e -> 'a', 0, 0, 1, (e #>> '{a,fcfg,tm}')::numeric) else match_fat(e -> 'a', -.02, 0) end);
  e := jsonb_set(e, '{ev}', (e -> 'ev') || jsonb_build_object('t', (e ->> 't')::int, 'c', 'a', 'ty', 'temps-mort', 's', e -> 'score',
    'va', e #>> '{b,attaque}', 'vd', e #>> '{b,defense}'));
  return match_mom_casser(e, 'a', 'tm');   -- il casse le momentum de l'adversaire
end $$;
-- la tactique et la consigne du joueur pour la tranche suivante : il peut en changer à chaque tranche, sans temps mort
-- (demande de Maël, 14 nov. 2026 ; avant : seulement au coup d'envoi, à la mi-temps et sur un temps mort)
create or replace function match_regler(e jsonb, p_tactique text, p_consigne text, p_temps_mort boolean) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t int := (e ->> 't')::int; cons text := coalesce(p_consigne, 'normal');
begin
  if p_temps_mort then e := match_tm_prendre(e); end if;   -- ancienne façon de prendre un temps mort (jeu pas encore à jour)
  perform verifier_tactique(p_tactique);
  if cons not in ('normal', 'prudent', 'pression') then raise exception 'Consigne inconnue'; end if;
  if t > 0 and t < 3600 and (p_tactique is distinct from e #>> '{a,tactique}' or cons is distinct from e #>> '{a,consigne}') then
    e := jsonb_set(e, '{ev}', (e -> 'ev') || jsonb_build_object('t', (e ->> 't')::int, 'c', 'a', 'ty', 'tactique', 'v', p_tactique, 'cons', cons, 's', e -> 'score'));
  end if;
  return e || jsonb_build_object('a', match_tactique(e -> 'a', tac_attaque(p_tactique), tac_defense(p_tactique))
    || jsonb_build_object('tactique', p_tactique, 'consigne', cons));
end $$;
create or replace function match_bloc(p_tactique text, p_consigne text, p_temps_mort boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profils := moi(); cur matchs_direct; e jsonb; n int;
begin
  select * into cur from matchs_direct where user_id = p.user_id for update;
  if not found then raise exception 'Pas de match en cours'; end if;
  e := cur.etat; n := jsonb_array_length(e -> 'ev');
  if e ? 'sept' then raise exception 'Jet de 7 m en cours'; end if;
  -- la dernière tranche jouée, le jeu la raconte (on peut encore faire des changements) ; le résultat vient à l'appel suivant
  if (e ->> 'bloc')::int >= 12 then return match_conclure(p.user_id, e, 1) || jsonb_build_object('vue', match_vue(e, n)); end if;
  e := match_regler(e, p_tactique, p_consigne, p_temps_mort);
  -- après un temps mort pris au milieu d'une tranche : la fin de cette tranche (avec les réglages choisis pendant le temps mort)
  if (e ->> 't')::int > (e ->> 'bloc')::int * 300 then e := match_reprendre_tranche(e); else e := match_bloc_jouer(e); end if;
  update matchs_direct set etat = e, maj = now() where user_id = p.user_id;
  return jsonb_build_object('direct', true, 'vue', match_vue(e, n));
end $$;
-- le match en cours, tel quel (reprendre après avoir quitté)
create or replace function match_en_cours() returns jsonb language sql security definer set search_path = public as $$
  select match_vue(etat) from matchs_direct where user_id = auth.uid()
$$;
-- simuler la fin du match en cours : les blocs restants sans adaptation, gains réduits au prorata
-- temps mort demandé par le jeu, tout de suite (demande de Maël, 20 nov. 2026) : à la seconde que montre le récit (p_seconde,
-- bornée par match_seconde). Le serveur revient à cette seconde, prend le temps mort et s'arrête là : la fin de la tranche est jouée
-- au prochain match_bloc, avec la tactique choisie pendant le temps mort. Renvoie la tactique adverse du moment et « reprise ».
-- (L'ancienne fonction sans paramètre est remplacée : avec une valeur par défaut, le jeu pas encore à jour l'appelle encore.)
drop function if exists match_temps_mort();
-- le jet de 7 m du match en cours (Championnat VS Ordi, fantôme du Classé) : notre tir ({x, y, puissance}) ou notre parade
-- ({colonne, hauteur, temps}) ; puis la fin de la tranche est jouée. Renvoie le détail du tir (tir) et la suite du fil (vue).
create or replace function match_7m(p_entrees jsonb, p_depuis int) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); cur matchs_direct; e jsonb; d jsonb; n0 int;
begin
  select * into cur from matchs_direct where user_id = p.user_id for update;
  if not found then raise exception 'Pas de match en cours'; end if;
  e := cur.etat;
  if not e ? 'sept' then raise exception 'Pas de jet de 7 m en cours'; end if;
  n0 := jsonb_array_length(e -> 'ev');   -- le jet de 7 m est le dernier événement : on renvoie ce qui suit (p_depuis ne sert plus)
  if jsonb_typeof(p_entrees) is distinct from 'object' then raise exception 'Jet de 7 m invalide'; end if;
  if e #>> '{sept,c}' = 'a' then
    e := match_7m_resoudre(e, p_entrees, null);
  else
    if coalesce(p_entrees ->> 'colonne', '') not in ('g', 'c', 'd') or coalesce(p_entrees ->> 'hauteur', '') not in ('h', 'b') then raise exception 'Jet de 7 m invalide'; end if;
    e := match_7m_resoudre(e, null, jsonb_build_object('colonne', p_entrees ->> 'colonne', 'hauteur', p_entrees ->> 'hauteur',
      'temps', coalesce((p_entrees ->> 'temps')::numeric, 99999)));
  end if;
  d := e -> 'sept_der';
  e := match_reprendre_tranche(e);
  update matchs_direct set etat = e, maj = now() where user_id = p.user_id;
  return jsonb_build_object('tir', d, 'vue', match_vue(e, n0));
end $$;
create or replace function match_temps_mort(p_seconde int default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); cur matchs_direct; e jsonb; n int; h int;
begin
  select * into cur from matchs_direct where user_id = p.user_id for update;
  if not found then raise exception 'Pas de match en cours'; end if;
  e := cur.etat;
  h := match_seconde(e, p_seconde);
  -- un jet de 7 m en attente plus loin dans la tranche (retour de Guilhem, 24 nov. 2026 : blessure puis 7 m dans la même tranche, plus
  -- rien de possible) : le temps mort, pris avant, revient à sa seconde et le 7 m, pas encore raconté, n'a pas eu lieu
  if e ? 'sept' and h >= (e #>> '{sept,t}')::int then raise exception 'Jet de 7 m en cours'; end if;
  if h = 1800 and (e ->> 'bloc')::int = 6 then raise exception 'C’est la mi-temps : change ce que tu veux sans temps mort'; end if;
  if h < (e ->> 't')::int then e := match_rembobiner(e, h); end if;
  n := jsonb_array_length(e -> 'ev');
  e := match_tm_prendre(e);
  update matchs_direct set etat = e, maj = now() where user_id = p.user_id;
  return jsonb_build_object('vue', match_vue(e, n), 'reprise', h,
    'adverse', jsonb_build_object('attaque', e #>> '{b,attaque}', 'defense', e #>> '{b,defense}'));
end $$;
-- changements demandés par le jeu, tout de suite (demande de Maël, 20 nov. 2026 : « dès qu'on appuie, et le temps ne s'arrête pas ») :
-- p_seconde = la seconde que le récit montre. Le serveur a déjà joué la tranche jusqu'au bout : il revient à cette seconde (ce qui
-- est déjà raconté ne change pas), fait entrer les remplaçants et rejoue la fin de la tranche. Le jeu ne peut pas revenir plus tôt
-- que ce que le récit a montré à la vitesse ×1 (25 secondes de match par seconde depuis que la tranche est servie : un téléphone
-- lent prend du retard, même en ×4), sinon il pourrait rejouer une tranche entière dont il connaît déjà la fin. Renvoie les nouveaux événements et « reprise » : le jeu garde
-- ceux qu'il avait jusqu'à cette seconde et remplace la suite.
create or replace function match_changer(p_postes jsonb, p_seconde int) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); cur matchs_direct; e jsonb; n int; ps text[]; h int; fin int; b int;
begin
  select * into cur from matchs_direct where user_id = p.user_id for update;
  if not found then raise exception 'Pas de match en cours'; end if;
  e := cur.etat; fin := (e ->> 't')::int; b := (e ->> 'bloc')::int;
  if jsonb_typeof(p_postes) <> 'array' or jsonb_array_length(p_postes) = 0 or jsonb_array_length(p_postes) > 7 then raise exception 'Changements invalides'; end if;
  select array_agg(x) into ps from jsonb_array_elements_text(p_postes) x;
  if exists (select 1 from unnest(ps) x where x not in ('AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB')) then raise exception 'Poste inconnu'; end if;
  h := match_seconde(e, p_seconde);
  if e ? 'sept' and h >= (e #>> '{sept,t}')::int then raise exception 'Jet de 7 m en cours'; end if;   -- avant : retour à h, le 7 m n'a pas eu lieu
  if b >= 12 and h >= fin then raise exception 'Le match est fini'; end if;
  if h < fin then
    -- au milieu de la tranche : retour à la seconde h, changements, puis la fin de la tranche rejouée
    e := match_rembobiner(e, h); n := jsonb_array_length(e -> 'ev');
    e := match_changer_e(e, p.user_id, ps);
    e := e || jsonb_build_object('debut', e - 'debut' - 'ev', 'debut_n', jsonb_array_length(e -> 'ev'));
    e := match_bloc_suite(e);
  else
    -- au bout de ce qui est joué (fin de tranche, ou pendant un temps mort pris au milieu) : le changement s'ajoute là
    n := jsonb_array_length(e -> 'ev');
    e := match_changer_e(e, p.user_id, ps);
  end if;
  update matchs_direct set etat = e, maj = now() where user_id = p.user_id;
  return jsonb_build_object('vue', match_vue(e, n), 'reprise', h);
end $$;
create or replace function match_simuler_fin() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); cur matchs_direct;
begin
  select * into cur from matchs_direct where user_id = p.user_id for update;
  if not found then raise exception 'Pas de match en cours'; end if;
  -- Classé contre un fantôme : pas de simulation (demande de Maël, 23 nov. 2026)
  if cur.etat ->> 'type' = 'classe' then raise exception 'Pas de simulation en Classé : joue le match jusqu’au bout'; end if;
  return match_finir_simule(p.user_id, cur.etat);
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Matchs à deux en direct (23 nov. 2026, demande de Maël) : file d'attente classée façon LoL (fantôme après 2 minutes), trophées et
-- arènes façon Clash Royale, saisons d'un mois, invitations entre ami(e)s. Un seul état de match (etat) : a = le premier joueur,
-- b = le second ; le moteur est le même qu'en championnat, rendu symétrique (blessures, banc et fatigue des deux côtés, pas
-- d'entraîneur ordinateur). Le joueur b voit et joue le match « en miroir » (pvp_miroir : a et b échangés), avec les fonctions du
-- championnat. Les deux joueurs choisissent en secret pendant la tranche (pvp_choix) ; la tranche suivante part quand les deux ont
-- fini de la regarder, ou à l'heure prévue (meta.prochain). Temps mort : 20 secondes pour les deux, le match revient à la seconde
-- où il a été demandé. Un joueur absent est coaché par son adjoint (match_adjoint) ; si les deux s'en vont, pvp_cron finit le match.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function pvp_miroir_ev(x jsonb) returns jsonb language sql immutable as $$
  select x || case when x ->> 'c' in ('a', 'b') then jsonb_build_object('c', case x ->> 'c' when 'a' then 'b' else 'a' end) else '{}'::jsonb end
    || case when jsonb_typeof(x -> 's') = 'array' then jsonb_build_object('s', jsonb_build_array(x #> '{s,1}', x #> '{s,0}')) else '{}'::jsonb end
    || case when jsonb_typeof(x -> 'm') = 'number' then jsonb_build_object('m', -(x ->> 'm')::numeric) else '{}'::jsonb end
$$;
create or replace function pvp_miroir(e jsonb) returns jsonb language plpgsql immutable as $$
declare r jsonb;
begin
  if e is null or jsonb_typeof(e) <> 'object' then return e; end if;
  r := (e - 'contre') || jsonb_build_object('a', e -> 'b', 'b', e -> 'a',
    'tm', coalesce(e -> 'tmb', jsonb_build_object('restants', 3, 'p1', 0, 'p2', 0)), 'tmb', coalesce(e -> 'tm', jsonb_build_object('restants', 3, 'p1', 0, 'p2', 0)));
  if e ? 'score' then r := r || jsonb_build_object('score', jsonb_build_array(e #> '{score,1}', e #> '{score,0}')); end if;
  if e ->> 'balle' in ('a', 'b') then r := r || jsonb_build_object('balle', case e ->> 'balle' when 'a' then 'b' else 'a' end); end if;
  if e ->> 'contre' in ('a', 'b') then r := r || jsonb_build_object('contre', case e ->> 'contre' when 'a' then 'b' else 'a' end); end if;
  if e ? 'mom' then r := r || jsonb_build_object('mom', -coalesce((e ->> 'mom')::numeric, 0)); end if;
  r := r - 'momv';
  if jsonb_typeof(e -> 'sept') = 'object' then r := r || jsonb_build_object('sept', (e -> 'sept') || jsonb_build_object('c', case e #>> '{sept,c}' when 'a' then 'b' else 'a' end)); end if;
  if jsonb_typeof(e -> 'sept_n') = 'object' then r := r || jsonb_build_object('sept_n', jsonb_build_object('a', e #> '{sept_n,b}', 'b', e #> '{sept_n,a}')); end if;
  if jsonb_typeof(e -> 'sept_der') = 'object' then r := r || jsonb_build_object('sept_der', (e -> 'sept_der') || jsonb_build_object('c', case e #>> '{sept_der,c}' when 'a' then 'b' else 'a' end)); end if;
  if e ->> 'momv' in ('a', 'b') then r := r || jsonb_build_object('momv', case e ->> 'momv' when 'a' then 'b' else 'a' end); end if;
  if jsonb_typeof(e -> 'ev') = 'array' then
    r := r || jsonb_build_object('ev', (select coalesce(jsonb_agg(pvp_miroir_ev(x) order by i), '[]') from jsonb_array_elements(e -> 'ev') with ordinality z(x, i)));
  end if;
  if jsonb_typeof(e -> 'blocs') = 'array' then
    r := r || jsonb_build_object('blocs', (select coalesce(jsonb_agg(jsonb_build_object('aa', x -> 'ba', 'ad', x -> 'bd', 'ba', x -> 'aa', 'bd', x -> 'ad') order by i), '[]')
      from jsonb_array_elements(e -> 'blocs') with ordinality z(x, i)));
  end if;
  if jsonb_typeof(e -> 'debut') = 'object' then r := r || jsonb_build_object('debut', pvp_miroir(e -> 'debut')); end if;
  return r;
end $$;
create or replace function pvp_cote(e jsonb, p_cote text) returns jsonb language sql immutable as $$
  select case when p_cote = 'b' then pvp_miroir(e) else e end
$$;
create or replace function pvp_maintenant() returns numeric language sql volatile as $$ select extract(epoch from clock_timestamp())::numeric $$;
-- l'arène d'un nombre de trophées (0 = la première)
create or replace function pvp_arene(p_trophees int) returns int language sql stable security definer set search_path = public as $$
  select coalesce(max(i - 1), 0)::int from jsonb_array_elements(param('pvp_arenes')) with ordinality z(x, i) where (x ->> 'min')::int <= coalesce(p_trophees, 0)
$$;
-- trophées gagnés par le vainqueur (et perdus par le vaincu) : plus si l'adversaire en avait plus, moins s'il en avait moins
create or replace function pvp_trophees_gain(p_gagnant int, p_perdant int) returns int language sql stable security definer set search_path = public as $$
  select least(parami('pvp_trophees_max'), greatest(parami('pvp_trophees_min'),
    round(parami('pvp_trophees_base') + (coalesce(p_perdant, 0) - coalesce(p_gagnant, 0))::numeric / greatest(1, parami('pvp_trophees_ecart'))))::int)
$$;
-- saison d'un mois : au changement de mois, une récompense selon l'arène atteinte (si on a joué), puis les trophées au-dessus du seuil
-- redescendent de moitié (comme Clash Royale) ; renvoie la récompense donnée (ou null)
create or replace function pvp_saison_maj(p_uid uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils; debut date := date_trunc('month', aujourdhui())::date; r jsonb; seuil int := parami('pvp_saison_seuil'); ar int;
begin
  select * into p from profils where user_id = p_uid;
  if not found then return null; end if;
  if p.pvp_saison is null then update profils set pvp_saison = debut where user_id = p_uid; return null; end if;
  if p.pvp_saison >= debut then return null; end if;
  ar := pvp_arene(p.trophees);
  if p.pvp_matchs_saison > 0 then
    r := param('pvp_saison_recompenses') -> least(ar, jsonb_array_length(param('pvp_saison_recompenses')) - 1);
    if r is not null then perform donner_recompense(p_uid, r); end if;
  end if;
  update profils set pvp_saison = debut, pvp_matchs_saison = 0,
    trophees = case when trophees > seuil then seuil + (trophees - seuil) / 2 else trophees end where user_id = p_uid;
  perform noter(p_uid, 'pvp-saison', jsonb_build_object('trophees', p.trophees, 'arene', ar, 'recompense', r));
  return case when r is not null then jsonb_build_object('arene', param('pvp_arenes') -> ar ->> 'nom', 'recompense', r, 'trophees', p.trophees) end;
end $$;
-- trophées d'un match classé (contre un vrai joueur ou un fantôme) : nouveau total, arène, récompense d'une arène atteinte la première fois
create or replace function pvp_trophees_donner(p_uid uuid, p_delta int) returns jsonb language plpgsql security definer set search_path = public as $$
declare avant int; apres int; ar0 int; ar1 int; i int; r jsonb; nouvelle jsonb := null;
begin
  select trophees into avant from profils where user_id = p_uid;
  apres := greatest(0, avant + p_delta);
  update profils set trophees = apres, trophees_max = greatest(trophees_max, apres), pvp_matchs_saison = pvp_matchs_saison + 1 where user_id = p_uid;
  ar0 := pvp_arene(avant); ar1 := pvp_arene(apres);
  for i in 1 .. ar1 loop
    insert into pvp_arenes_faites (user_id, arene) values (p_uid, i) on conflict do nothing;
    if found then
      r := param('pvp_arenes') -> i -> 'recompense';
      if r is not null then perform donner_recompense(p_uid, r); end if;
      nouvelle := jsonb_build_object('nom', param('pvp_arenes') -> i ->> 'nom', 'recompense', r);
    end if;
  end loop;
  return jsonb_build_object('avant', avant, 'apres', apres, 'delta', apres - avant, 'arene', param('pvp_arenes') -> ar1 ->> 'nom', 'nouvelle', nouvelle);
end $$;
-- pièces d'un match classé : selon le résultat et l'arène, pour les pvp_gains_par_jour premiers matchs de la journée
create or replace function pvp_pieces(p_uid uuid, p_res text, p_gain numeric) returns int language sql stable security definer set search_path = public as $$
  select case when (select count(*) from rencontres r where r.user_id = p_uid and r.type = 'pvp' and r.le >= debut_du_jour()
      and coalesce((r.detail ->> 'pieces')::int, 0) > 0) >= parami('pvp_gains_par_jour') then 0
    else round(coalesce((param('classe_pieces') ->> p_res)::numeric, 0) * (1 + .25 * pvp_arene((select trophees from profils where user_id = p_uid))) * coalesce(p_gain, 1))::int end
$$;
-- blessures et protection après un match, pour le joueur d'un côté (comme match_conclure)
create or replace function pvp_blessures(p_uid uuid, e jsonb, p_cote text) returns void language sql security definer set search_path = public as $$
  update exemplaires set blessure = blessure - 1, blessure_g = case when blessure > 1 then blessure_g end where proprietaire = p_uid and blessure > 0;
  update exemplaires set protection = protection - 1 where proprietaire = p_uid and protection > 0;
  update exemplaires x set blessure = greatest(x.blessure, (v ->> 'm')::int), blessure_g = v ->> 'g'
    from jsonb_array_elements(e -> 'ev') v where v ->> 'ty' = 'blessure' and v ->> 'c' = p_cote and coalesce((v ->> 'm')::int, 0) > 0
      and x.id::text = v ->> 'id' and x.proprietaire = p_uid;
$$;

-- ── le match à deux
create or replace function pvp_equipe(p profils) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform verifier_equipe(p.user_id, p.equipe);
  return force_equipe(p.equipe, p.tactique) || jsonb_build_object('nom', p.pseudo) || match_banc_init(p.user_id, p.equipe, p.remplacants, p.tactique);
end $$;
create or replace function pvp_nouveau(p_a uuid, p_b uuid, p_classe boolean, p_attente int) returns uuid language plpgsql security definer set search_path = public as $$
declare pa profils; pb profils; fa jsonb; fb jsonb; e jsonb; v_id uuid; t numeric := pvp_maintenant();
begin
  select * into pa from profils where user_id = p_a; select * into pb from profils where user_id = p_b;
  fa := pvp_equipe(pa); fb := pvp_equipe(pb);
  e := match_nouveau('pvp', jsonb_build_object('classe', p_classe), fa, fb, tac_complete(pa.tactique), 'normal',
    tac_attaque(coalesce(pb.tactique, 'duels:06')), tac_defense(coalesce(pb.tactique, 'duels:06')));
  e := e || jsonb_build_object('pvp', true,
    'b', ((e -> 'b') - 'pref_att' - 'pref_def' - 'fo') || jsonb_build_object('tactique', tac_complete(pb.tactique), 'consigne', 'normal'));
  e := match_absents(e, p_a);
  e := pvp_miroir(match_absents(pvp_miroir(e), p_b));
  e := e || '{"sept_jeu": true}';   -- jets de 7 m joués au mini-jeu
  insert into pvp_matchs (a, b, classe, etat, attente, meta) values (p_a, p_b, p_classe, e, p_attente, jsonb_build_object(
    'choix', jsonb_build_object('a', jsonb_build_object('tac', e #>> '{a,tactique}', 'cons', 'normal'), 'b', jsonb_build_object('tac', e #>> '{b,tactique}', 'cons', 'normal')),
    'postes', jsonb_build_object('a', '[]'::jsonb, 'b', '[]'::jsonb), 'pret', jsonb_build_object('a', -1, 'b', -1),
    'vu', jsonb_build_object('a', t, 'b', t), 'gen', 0, 'prochain', t + parami('pvp_envoi_secondes'),
    'trophees', jsonb_build_object('a', pa.trophees, 'b', pb.trophees)))
    returning pvp_matchs.id into v_id;
  return v_id;
end $$;
-- les choix d'un côté pour la tranche qui part : tactique, consigne (raconté à l'équipe ; l'adversaire ne voit que ce qui se voit),
-- changements ; un joueur absent est coaché par son adjoint
create or replace function pvp_appliquer(e jsonb, meta jsonb, p_cote text, p_uid uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare ee jsonb := pvp_cote(e, p_cote); ch jsonb := meta -> 'choix' -> p_cote; ps text[]; n int; vieux text; vc text; nouveau text; nc text;
  absent boolean := pvp_maintenant() - coalesce((meta -> 'vu' ->> p_cote)::numeric, 0) > parami('pvp_absent_secondes');
begin
  if ch ->> 'tac' ~ '^(duels|enclenchement|rapide):(06|15|33)$' then
    vieux := ee #>> '{a,tactique}'; vc := coalesce(ee #>> '{a,consigne}', 'normal');
    nouveau := ch ->> 'tac'; nc := coalesce(ch ->> 'cons', vc);
    n := jsonb_array_length(ee -> 'ev');
    ee := match_regler(ee, nouveau, nc, false);
    if jsonb_array_length(ee -> 'ev') > n then
      -- ce qui a changé : l'adversaire verra la nouvelle défense et la consigne, pas l'attaque (pvp_vue)
      ee := jsonb_set(ee, array['ev', (jsonb_array_length(ee -> 'ev') - 1)::text], (ee -> 'ev' -> -1) || jsonb_build_object('ch', jsonb_build_object(
        'att', split_part(vieux, ':', 1) is distinct from split_part(nouveau, ':', 1), 'def', split_part(vieux, ':', 2) is distinct from split_part(nouveau, ':', 2),
        'cons', vc is distinct from nc)));
    end if;
  end if;
  select array_agg(distinct x) into ps from jsonb_array_elements_text(coalesce(meta -> 'postes' -> p_cote, '[]')) x
    where x in ('AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB');
  if cardinality(ps) > 0 then
    begin ee := match_changer_e(ee, p_uid, ps); exception when others then null; end;   -- un changement devenu impossible est oublié
  end if;
  if absent and (ee ->> 'bloc')::int > 0 then
    begin ee := match_adjoint(match_adjoint_changer(ee, p_uid)); exception when others then null; end;
  end if;
  return pvp_cote(ee, p_cote);
end $$;
-- fait avancer le match si c'est l'heure (ou si les deux joueurs sont prêts) : fin d'un temps mort, tranche suivante, fin du match
create or replace function pvp_avancer(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare m pvp_matchs; e jsonb; mt jsonb; t numeric := pvp_maintenant(); b int; pz jsonb; dur numeric; tr int := parami('pvp_tranche_secondes');
  marge int := parami('pvp_marge_secondes'); h int; i int := 0;
begin
  select * into m from pvp_matchs where id = p_id for update;
  if not found or m.statut <> 'direct' then return; end if;
  e := m.etat; mt := m.meta;
  loop
    i := i + 1; exit when i > 3;
    b := (e ->> 'bloc')::int; pz := mt -> 'pause';
    if e ? 'sept' then
      -- un jet de 7 m : on attend le tireur, puis le gardien ; sans réponse à temps, « trop long » (ballon à l'adversaire, demande de
      -- Maël) ou, pour le gardien, le ballon passe
      exit when t < coalesce((e #>> '{sept,limite}')::numeric, 0);
      if e #>> '{sept,phase}' = 'tir' then e := match_7m_resoudre(e, '{"long": true}', null);
      else e := match_7m_resoudre(e, null, '{"colonne": "c", "hauteur": "b", "temps": 99999}'); end if;
      h := (e ->> 't')::int;
      e := match_reprendre_tranche(e); b := (e ->> 'bloc')::int;
      mt := mt || jsonb_build_object('prochain', t + (b * 300 - h) / 25.0 + marge + case when b = 6 then parami('pvp_mi_temps_secondes') else 0 end);
      continue;
    end if;
    if jsonb_typeof(pz) = 'object' then
      -- un temps mort : 20 secondes, ou moins si les deux joueurs sont prêts
      exit when t < (pz ->> 'jusqu')::numeric and not (coalesce((pz #>> '{pret,a}')::boolean, false) and coalesce((pz #>> '{pret,b}')::boolean, false));
      e := pvp_appliquer(e, mt, 'a', m.a); e := pvp_appliquer(e, mt, 'b', m.b);
      mt := mt || jsonb_build_object('pause', null, 'postes', jsonb_build_object('a', '[]'::jsonb, 'b', '[]'::jsonb));
      h := (e ->> 't')::int;
      if h > b * 300 then
        e := match_reprendre_tranche(e); b := (e ->> 'bloc')::int;
        dur := (b * 300 - h) / 25.0;
        mt := mt || jsonb_build_object('prochain', t + dur + marge + case when b = 6 then parami('pvp_mi_temps_secondes') else 0 end);
      else
        mt := mt || jsonb_build_object('prochain', t);
      end if;
      continue;
    end if;
    exit when not (t >= (mt ->> 'prochain')::numeric
      or ((mt #>> '{pret,a}')::int >= b and (mt #>> '{pret,b}')::int >= b));
    if b >= 12 then
      -- la dernière tranche est racontée : le résultat
      m.etat := e; m.meta := mt;
      perform pvp_conclure(m);
      return;
    end if;
    e := pvp_appliquer(e, mt, 'a', m.a); e := pvp_appliquer(e, mt, 'b', m.b);
    e := match_bloc_jouer(e); b := (e ->> 'bloc')::int;
    mt := mt || jsonb_build_object('postes', jsonb_build_object('a', '[]'::jsonb, 'b', '[]'::jsonb),
      'prochain', t + tr + marge + case when b = 6 then parami('pvp_mi_temps_secondes') else 0 end);
    exit;
  end loop;
  update pvp_matchs set etat = e, meta = mt, maj = now() where id = p_id;
end $$;
-- la fin d'un match à deux : résultat, trophées (match classé) ou pièces du défi (entre ami(e)s), blessures, historique
create or replace function pvp_conclure(m pvp_matchs) returns void language plpgsql security definer set search_path = public as $$
declare e jsonb := m.etat; r jsonb := match_resultat(m.etat); ra text; rb text; pa profils; pb profils; ga int := 0; gb int := 0;
  ta jsonb := null; tb jsonb := null; d int; xa int; xb int; na jsonb; nb jsonb; res jsonb;
begin
  -- les deux profils, toujours dans le même ordre (pas d'interblocage)
  perform 1 from profils where user_id in (m.a, m.b) order by user_id for update;
  select * into pa from profils where user_id = m.a; select * into pb from profils where user_id = m.b;
  ra := r ->> 'resultat'; rb := case ra when 'gagne' then 'perdu' when 'perdu' then 'gagne' else 'nul' end;
  if m.classe then
    if ra <> 'nul' then
      d := case when ra = 'gagne' then pvp_trophees_gain(pa.trophees, pb.trophees) else pvp_trophees_gain(pb.trophees, pa.trophees) end;
      if m.a is not null then ta := pvp_trophees_donner(m.a, case when ra = 'gagne' then d else -d end); end if;
      if m.b is not null then tb := pvp_trophees_donner(m.b, case when rb = 'gagne' then d else -d end); end if;
    else
      if m.a is not null then ta := pvp_trophees_donner(m.a, 0); end if;
      if m.b is not null then tb := pvp_trophees_donner(m.b, 0); end if;
    end if;
    if m.a is not null then ga := pvp_pieces(m.a, ra, 1); end if;
    if m.b is not null then gb := pvp_pieces(m.b, rb, 1); end if;
  else
    -- défi entre ami(e)s : 30 pièces au gagnant, pour ses defis_amis_par_jour premiers défis gagnés de la journée
    ga := case when ra = 'gagne' and (select count(*) from rencontres x where x.user_id = m.a and x.type = 'pvp' and x.le >= debut_du_jour()
      and not coalesce((x.detail ->> 'classe')::boolean, true) and coalesce((x.detail ->> 'pieces')::int, 0) > 0) < parami('defis_amis_par_jour') then parami('pvp_ami_pieces') else 0 end;
    gb := case when rb = 'gagne' and (select count(*) from rencontres x where x.user_id = m.b and x.type = 'pvp' and x.le >= debut_du_jour()
      and not coalesce((x.detail ->> 'classe')::boolean, true) and coalesce((x.detail ->> 'pieces')::int, 0) > 0) < parami('defis_amis_par_jour') then parami('pvp_ami_pieces') else 0 end;
  end if;
  xa := (param('pve_xp') ->> ra)::int; xb := (param('pve_xp') ->> rb)::int;
  if m.a is not null then
    perform pvp_blessures(m.a, e, 'a');
    update profils set pieces = pieces + ga where user_id = m.a;
    na := gagner_xp(m.a, xa);
    insert into rencontres (user_id, type, adversaire, score, resultat, detail) values (m.a, 'pvp', coalesce(pb.pseudo, 'Joueur supprimé'),
      array[(r ->> 'a')::int, (r ->> 'b')::int], ra, jsonb_build_object('classe', m.classe, 'trophees', ta -> 'delta', 'pieces', ga, 'match', m.id));
    if ra = 'gagne' then perform progresser(m.a, 'victoire'); end if;
    if not m.classe then perform progresser(m.a, 'defi'); end if;
    perform noter(m.a, 'pvp', jsonb_build_object('contre', pb.pseudo, 'resultat', ra, 'pieces', ga, 'trophees', ta -> 'delta', 'classe', m.classe));
  end if;
  if m.b is not null then
    perform pvp_blessures(m.b, e, 'b');
    update profils set pieces = pieces + gb where user_id = m.b;
    nb := gagner_xp(m.b, xb);
    insert into rencontres (user_id, type, adversaire, score, resultat, detail) values (m.b, 'pvp', coalesce(pa.pseudo, 'Joueur supprimé'),
      array[(r ->> 'b')::int, (r ->> 'a')::int], rb, jsonb_build_object('classe', m.classe, 'trophees', tb -> 'delta', 'pieces', gb, 'match', m.id));
    if rb = 'gagne' then perform progresser(m.b, 'victoire'); end if;
    if not m.classe then perform progresser(m.b, 'defi'); end if;
    perform noter(m.b, 'pvp', jsonb_build_object('contre', pa.pseudo, 'resultat', rb, 'pieces', gb, 'trophees', tb -> 'delta', 'classe', m.classe));
  end if;
  res := jsonb_build_object(
    'a', jsonb_build_object('match', jsonb_build_object('a', (r ->> 'a')::int, 'b', (r ->> 'b')::int, 'resultat', ra), 'adversaire', pb.pseudo, 'classe', m.classe,
      'gains', jsonb_build_object('pieces', ga, 'xp', xa, 'trophees', ta -> 'delta'), 'trophees', ta, 'niveaux', na, 'resume', match_resume(e)),
    'b', jsonb_build_object('match', jsonb_build_object('a', (r ->> 'b')::int, 'b', (r ->> 'a')::int, 'resultat', rb), 'adversaire', pa.pseudo, 'classe', m.classe,
      'gains', jsonb_build_object('pieces', gb, 'xp', xb, 'trophees', tb -> 'delta'), 'trophees', tb, 'niveaux', nb, 'resume', match_resume(pvp_miroir(e))));
  update pvp_matchs set statut = 'fini', etat = e, meta = m.meta, resultat = res, maj = now() where id = m.id;
end $$;
-- ce que le joueur d'un côté voit : le match en miroir s'il est b ; les changements de tactique adverses réduits à ce qui se voit
-- (la nouvelle défense et la consigne ; l'attaque reste cachée) ; le compte à rebours, la pause, le résultat
create or replace function pvp_vue_json(m pvp_matchs, p_cote text, p_depuis int) returns jsonb language plpgsql security definer set search_path = public as $$
declare ee jsonb := pvp_cote(m.etat, p_cote); o text := case p_cote when 'a' then 'b' else 'a' end; v jsonb; t numeric := pvp_maintenant();
  meta jsonb := m.meta; pz jsonb := m.meta -> 'pause'; adv profils;
begin
  select * into adv from profils where user_id = case p_cote when 'a' then m.b else m.a end;
  v := match_vue(ee, greatest(0, coalesce(p_depuis, 0)));
  v := v || jsonb_build_object('evenements', (select coalesce(jsonb_agg(case when x ->> 'c' = 'b' and x ->> 'ty' = 'tactique' then
      jsonb_build_object('t', x -> 't', 'c', 'b', 'ty', 'tactique-adv', 's', x -> 's',
        'def', case when coalesce((x #>> '{ch,def}')::boolean, true) then split_part(x ->> 'v', ':', 2) end,
        'att', coalesce((x #>> '{ch,att}')::boolean, true), 'cons', case when coalesce((x #>> '{ch,cons}')::boolean, false) then x ->> 'cons' end)
      when x ->> 'c' = 'b' and x ->> 'ty' = 'temps-mort' then x - 'va' - 'vd'
      else x end order by i), '[]') from jsonb_array_elements(v -> 'evenements') with ordinality z(x, i)),
    'eux', (v -> 'eux') || jsonb_build_object('entraineur', null, 'lecture', null));
  return v || jsonb_build_object('pvp', jsonb_build_object('id', m.id, 'cote', p_cote, 'classe', m.classe, 'statut', m.statut,
    'gen', coalesce((meta ->> 'gen')::int, 0), 'n', jsonb_array_length(ee -> 'ev'), 'h', (ee ->> 't')::int,
    'prochain', greatest(0, round(coalesce((meta ->> 'prochain')::numeric, t) - t, 1)),
    'pause', case when jsonb_typeof(pz) = 'object' then jsonb_build_object('reste', greatest(0, round((pz ->> 'jusqu')::numeric - t, 1)),
      'moi', pz ->> 'par' = p_cote, 'h', (pz ->> 'h')::int, 'pret', coalesce((pz -> 'pret' ->> p_cote)::boolean, false), 'pretEux', coalesce((pz -> 'pret' ->> o)::boolean, false)) end,
    'pretEux', coalesce((meta -> 'pret' ->> o)::int, -1) >= (ee ->> 'bloc')::int,
    'absentEux', t - coalesce((meta -> 'vu' ->> o)::numeric, t) > parami('pvp_absent_secondes'),
    'choix', jsonb_build_object('tac', meta -> 'choix' -> p_cote ->> 'tac', 'cons', meta -> 'choix' -> p_cote ->> 'cons', 'postes', coalesce(meta -> 'postes' -> p_cote, '[]')),
    'adversaire', jsonb_build_object('pseudo', adv.pseudo, 'trophees', meta -> 'trophees' -> o, 'perso', perso_public(adv.user_id)),
    'trophees', meta -> 'trophees' -> p_cote,
    'fin', case when m.statut = 'fini' then m.resultat -> p_cote end));
end $$;
-- le match à deux du joueur (en cours, ou fini depuis moins de 10 minutes : le jeu montre le résultat)
create or replace function pvp_mon_match(p_uid uuid) returns pvp_matchs language sql stable security definer set search_path = public as $$
  select * from pvp_matchs m where p_uid in (m.a, m.b) and m.statut <> 'annule' and (m.statut in ('propose', 'prepa', 'direct') or m.maj > now() - interval '10 minutes')
  order by (m.statut in ('propose', 'prepa', 'direct')) desc, m.cree_le desc limit 1
$$;
-- Ordre des verrous : le match d'abord, puis les profils (moi(), et les deux profils à la fin du match) : deux joueurs qui
-- interrogent le même match au même instant ne se bloquent jamais l'un l'autre
create or replace function pvp_vue(p_depuis int default 0) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils; m pvp_matchs; c text;
begin
  m := pvp_mon_match(auth.uid());
  if m.id is not null then perform 1 from pvp_matchs where id = m.id for update; end if;
  p := moi();
  if m.id is null then return jsonb_build_object('aucun', true); end if;
  c := case when m.a = p.user_id then 'a' else 'b' end;
  if m.statut in ('propose', 'prepa') then
    m := pvp_phase_maj(m.id);
    if m.statut <> 'direct' then return pvp_phase_json(m, c); end if;
  end if;
  if m.statut = 'direct' then
    update pvp_matchs set meta = jsonb_set(meta, array['vu', c], to_jsonb(pvp_maintenant())) where id = m.id;
    perform pvp_avancer(m.id);
    select * into m from pvp_matchs where id = m.id;
  end if;
  return pvp_vue_json(m, c, p_depuis);
end $$;
-- les choix du joueur pour la suite : tactique, consigne, changements (ils partent avec la tranche suivante, ou à la fin d'un temps
-- mort) ; p_pret = la tranche qu'il a fini de regarder ; p_pret_pause = prêt à reprendre après un temps mort
create or replace function pvp_choix(p_tactique text, p_consigne text, p_postes jsonb, p_pret int, p_pret_pause boolean, p_depuis int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils; m pvp_matchs; c text; mt jsonb;
begin
  m := pvp_mon_match(auth.uid());
  if m.id is null or m.statut <> 'direct' then raise exception 'Pas de match en cours'; end if;
  select * into m from pvp_matchs where id = m.id for update;   -- le match d'abord, puis le profil (voir pvp_vue)
  p := moi();
  c := case when m.a = p.user_id then 'a' else 'b' end; mt := m.meta;
  if p_tactique is not null then
    perform verifier_tactique(p_tactique);
    if coalesce(p_consigne, 'normal') not in ('normal', 'prudent', 'pression') then raise exception 'Consigne inconnue'; end if;
    mt := jsonb_set(mt, array['choix', c], jsonb_build_object('tac', p_tactique, 'cons', coalesce(p_consigne, 'normal')));
  end if;
  if p_postes is not null then
    if jsonb_typeof(p_postes) <> 'array' or jsonb_array_length(p_postes) > 7
      or exists (select 1 from jsonb_array_elements_text(p_postes) x where x not in ('AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB')) then
      raise exception 'Changements invalides';
    end if;
    mt := jsonb_set(mt, array['postes', c], p_postes);
  end if;
  if p_pret is not null then mt := jsonb_set(mt, array['pret', c], to_jsonb(least(12, greatest(-1, p_pret)))); end if;
  if coalesce(p_pret_pause, false) and jsonb_typeof(mt -> 'pause') = 'object' then
    mt := jsonb_set(mt, array['pause', 'pret'], coalesce(mt #> '{pause,pret}', '{}') || jsonb_build_object(c, true));
  end if;
  mt := jsonb_set(mt, array['vu', c], to_jsonb(pvp_maintenant()));
  update pvp_matchs set meta = mt, maj = now() where id = m.id;
  perform pvp_avancer(m.id);
  select * into m from pvp_matchs where id = m.id;
  return pvp_vue_json(m, c, p_depuis);
end $$;
-- Classé : le jet de 7 m. Le tireur vise ({x, y, puissance}) ; puis le gardien devine ({colonne, hauteur, temps}) ; la fin de la
-- tranche est jouée dès que le jet est tiré
create or replace function pvp_7m(p_entrees jsonb, p_depuis int) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils; m pvp_matchs; c text; e jsonb; s jsonb; mt jsonb; h int; b int; t numeric := pvp_maintenant(); fini boolean := false;
begin
  m := pvp_mon_match(auth.uid());
  if m.id is null or m.statut <> 'direct' then raise exception 'Pas de match en cours'; end if;
  select * into m from pvp_matchs where id = m.id for update;   -- le match d'abord, puis le profil (voir pvp_vue)
  p := moi();
  c := case when m.a = p.user_id then 'a' else 'b' end; e := m.etat; mt := m.meta; s := e -> 'sept';
  if s is null then raise exception 'Pas de jet de 7 m en cours'; end if;
  if jsonb_typeof(p_entrees) is distinct from 'object' then raise exception 'Jet de 7 m invalide'; end if;
  if s ->> 'c' = c and s ->> 'phase' = 'tir' then
    e := match_7m_viser(e, p_entrees);
  elsif s ->> 'c' <> c and s ->> 'phase' = 'gardien' then
    if coalesce(p_entrees ->> 'colonne', '') not in ('g', 'c', 'd') or coalesce(p_entrees ->> 'hauteur', '') not in ('h', 'b') then raise exception 'Jet de 7 m invalide'; end if;
    e := match_7m_resoudre(e, null, jsonb_build_object('colonne', p_entrees ->> 'colonne', 'hauteur', p_entrees ->> 'hauteur',
      'temps', coalesce((p_entrees ->> 'temps')::numeric, 99999)));
  else
    raise exception 'Pas à toi de jouer';
  end if;
  if not e ? 'sept' then
    fini := true; h := (e ->> 't')::int;
    e := match_reprendre_tranche(e); b := (e ->> 'bloc')::int;
    mt := mt || jsonb_build_object('prochain', t + (b * 300 - h) / 25.0 + parami('pvp_marge_secondes') + case when b = 6 then parami('pvp_mi_temps_secondes') else 0 end);
  end if;
  mt := jsonb_set(mt, array['vu', c], to_jsonb(t));
  update pvp_matchs set etat = e, meta = mt, maj = now() where id = m.id;
  select * into m from pvp_matchs where id = m.id;
  return pvp_vue_json(m, c, p_depuis) || jsonb_build_object('tir', case when fini then pvp_cote(e, c) -> 'sept_der' end);
end $$;
-- temps mort : tout de suite, à la seconde où en est le récit (calculée par le serveur), 20 secondes pour les deux équipes ;
-- l'élan et leur tactique du moment pour celui qui le prend (comme en championnat)
create or replace function pvp_temps_mort() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils; m pvp_matchs; c text; e jsonb; mt jsonb; h int; t numeric := pvp_maintenant(); fin int;
begin
  m := pvp_mon_match(auth.uid());
  if m.id is null or m.statut <> 'direct' then raise exception 'Pas de match en cours'; end if;
  select * into m from pvp_matchs where id = m.id for update;   -- le match d'abord, puis le profil (voir pvp_vue)
  p := moi();
  c := case when m.a = p.user_id then 'a' else 'b' end; e := m.etat; mt := m.meta;
  if jsonb_typeof(mt -> 'pause') = 'object' then raise exception 'Le jeu est déjà arrêté'; end if;
  if e ? 'sept' then raise exception 'Jet de 7 m en cours'; end if;
  fin := (e ->> 't')::int;
  if (e ->> 'bloc')::int < 1 or (e ->> 'bloc')::int >= 12 and fin >= 3600 and t >= (mt ->> 'prochain')::numeric then raise exception 'Pas de temps mort maintenant'; end if;
  h := case when e ? 'servi' then least(fin, greatest((e #>> '{debut,t}')::int, (e ->> 'servi_t')::int + floor((t - (e ->> 'servi')::numeric) * 25)::int)) else fin end;
  if h = 1800 and (e ->> 'bloc')::int = 6 then raise exception 'C’est la mi-temps : change ce que tu veux sans temps mort'; end if;
  if h >= 3600 then raise exception 'Le match est fini'; end if;
  if h < fin then e := match_rembobiner(e, h); end if;
  e := pvp_cote(match_tm_prendre(pvp_cote(e, c)), c);
  mt := mt || jsonb_build_object('pause', jsonb_build_object('jusqu', t + parami('pvp_pause_secondes'), 'par', c, 'h', h, 'pret', '{}'::jsonb),
    'gen', coalesce((mt ->> 'gen')::int, 0) + 1);
  mt := jsonb_set(mt, array['vu', c], to_jsonb(t));
  update pvp_matchs set etat = e, meta = mt, maj = now() where id = m.id;
  select * into m from pvp_matchs where id = m.id;
  return pvp_vue_json(m, c, 0) || jsonb_build_object('adverse', jsonb_build_object('attaque', pvp_cote(e, c) #>> '{b,attaque}', 'defense', pvp_cote(e, c) #>> '{b,defense}'));
end $$;

-- ── la file d'attente classée (façon LoL) : le plus proche en trophées parmi ceux qui cherchent ; personne après 2 minutes : un fantôme
create or replace function pvp_fantome(p profils, p_attente int) returns jsonb language plpgsql security definer set search_path = public as $$
declare a profils; fb jsonb; fa jsonb; e jsonb; ar int := pvp_arene(p.trophees); st text;
begin
  -- l'équipe d'un vrai joueur proche en trophées, jouée par l'ordinateur
  for a in select * from profils x where x.user_id <> p.user_id and (select count(*) from jsonb_object_keys(x.equipe)) = 7
      order by abs(x.trophees - p.trophees), random() limit 10 loop
    begin
      fb := force_equipe(a.equipe, a.tactique) || jsonb_build_object('nom', 'Fantôme de ' || a.pseudo);
      exit;
    exception when others then fb := null;
    end;
  end loop;
  if fb is null then raise exception 'Aucun adversaire pour l’instant : réessaie dans un moment'; end if;
  fa := force_equipe(p.equipe, p.tactique) || jsonb_build_object('nom', p.pseudo) || match_banc_init(p.user_id, p.equipe, p.remplacants, p.tactique);
  e := match_nouveau('classe', jsonb_build_object('fantome', a.user_id, 'pseudo', a.pseudo, 'trophees', a.trophees, 'attente', p_attente), fa, fb,
    tac_complete(p.tactique), 'normal', tac_attaque(coalesce(a.tactique, 'duels:06')), tac_defense(coalesce(a.tactique, 'duels:06')));
  st := case when ar <= 1 then 'lent' when ar <= 3 then 'reflechi' when ar <= 5 then 'rapide' else 'legende' end;
  e := e || jsonb_build_object('ia', match_ia(st), 'sept_jeu', true);
  e := match_absents(e, p.user_id);
  insert into matchs_direct (user_id, etat) values (p.user_id, e);
  return match_vue(e);
end $$;
create or replace function pvp_fantome_conclure(p_uid uuid, e jsonb, r jsonb, p_gain numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils; res text := r ->> 'resultat'; tr jsonb := null; g int; x int; niveaux jsonb;
begin
  select * into p from profils where user_id = p_uid for update;
  -- contre le fantôme (l'ordinateur), aucun trophée gagné ni perdu (demande de Maël, 23 nov. 2026) : seulement les pièces et l'XP
  g := pvp_pieces(p_uid, res, p_gain); x := round((param('pve_xp') ->> res)::int * p_gain);
  update profils set pieces = pieces + g, tactique = coalesce(e #>> '{a,tactique}', tactique) where user_id = p_uid;
  niveaux := gagner_xp(p_uid, x);
  insert into rencontres (user_id, type, adversaire, score, resultat, detail) values (p_uid, 'pvp', e #>> '{b,nom}',
    array[(r ->> 'a')::int, (r ->> 'b')::int], res, jsonb_build_object('classe', true, 'fantome', true, 'trophees', tr -> 'delta', 'pieces', g));
  if res = 'gagne' then perform progresser(p_uid, 'victoire'); end if;
  perform noter(p_uid, 'pvp', jsonb_build_object('contre', e #>> '{b,nom}', 'resultat', res, 'pieces', g, 'trophees', tr -> 'delta', 'fantome', true));
  return jsonb_build_object('match', r, 'adversaire', e #>> '{b,nom}', 'classe', true, 'fantome', true, 'note', e #> '{a,note}', 'noteAdversaire', e #> '{b,note}',
    'gains', jsonb_build_object('pieces', g, 'xp', x, 'trophees', tr -> 'delta'), 'trophees', tr, 'niveaux', niveaux, 'etat', etat_de(p_uid));
end $$;
-- Salon « En ligne » : la liste de qui est là et les messages (les plus récents, 80 au plus), lisibles par tous les joueurs connectés
create or replace function salon_vue(p profils, p_depuis bigint) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'pseudo', pr.pseudo, 'perso', perso_public(s.user_id), 'texte', s.texte, 'le', s.le,
        'moi', s.user_id = p.user_id) order by s.id), '[]')
      from (select * from salon_messages s where s.id > coalesce(p_depuis, 0) and not s.supprime and s.le > now() - make_interval(days => parami('salon_jours'))
        order by s.id desc limit 80) s join profils pr on pr.user_id = s.user_id),
    'supprimes', (select coalesce(jsonb_agg(s.id), '[]') from salon_messages s where s.supprime and s.le > now() - make_interval(days => parami('salon_jours'))),
    'enLigne', (select coalesce(jsonb_agg(jsonb_build_object('pseudo', x.pseudo, 'perso', perso_public(x.user_id), 'niveau', x.niveau, 'moi', x.user_id = p.user_id)
        order by x.user_id <> p.user_id, lower(x.pseudo)), '[]')
      from (select * from profils x where x.pseudo is not null and (x.user_id = p.user_id or x.vu_le > now() - make_interval(mins => parami('en_ligne_minutes')) and not x.invisible)
        order by x.vu_le desc limit 100) x),
    'muet', case when p.salon_muet > now() then p.salon_muet end, 'admin', p.role = 'admin', 'longueur', parami('salon_longueur'))
$$;
create or replace function salon_lire(p_depuis bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  update profils set vu_le = now() where user_id = p.user_id;
  return salon_vue(p, p_depuis);
end $$;
create or replace function salon_ecrire(p_texte text, p_depuis bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); t text := btrim(regexp_replace(coalesce(p_texte, ''), '\s+', ' ', 'g')); d timestamptz;
begin
  if p.salon_muet > now() then raise exception 'Tu ne peux plus écrire dans le salon pour l’instant'; end if;
  if t = '' then raise exception 'Message vide'; end if;
  if char_length(t) > parami('salon_longueur') then raise exception 'Message trop long (% caractères au plus)', parami('salon_longueur'); end if;
  select max(le) into d from salon_messages where user_id = p.user_id;
  if d > now() - make_interval(secs => parami('salon_intervalle_secondes')) then raise exception 'Doucement : un message toutes les % secondes', parami('salon_intervalle_secondes'); end if;
  if (select count(*) from salon_messages where user_id = p.user_id and le >= debut_du_jour()) >= parami('salon_par_jour') then
    raise exception 'Tu as écrit % messages aujourd’hui : reviens demain', parami('salon_par_jour');
  end if;
  insert into salon_messages (user_id, texte) values (p.user_id, t);
  delete from salon_messages where le < now() - make_interval(days => parami('salon_jours'));
  update profils set vu_le = now() where user_id = p.user_id;
  return salon_vue(p, p_depuis);
end $$;
-- modération (admin) : effacer un message ; empêcher un joueur d'écrire pendant p_heures (0 = de nouveau permis)
create or replace function salon_supprimer(p_id bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  if p.role <> 'admin' then raise exception 'Réservé à l’admin'; end if;
  update salon_messages set supprime = true where id = p_id;
  return salon_vue(p, 0);
end $$;
create or replace function salon_muet(p_pseudo text, p_heures int) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  if p.role <> 'admin' then raise exception 'Réservé à l’admin'; end if;
  update profils set salon_muet = case when coalesce(p_heures, 0) > 0 then now() + make_interval(hours => least(p_heures, 24 * 30)) end
    where lower(pseudo) = lower(p_pseudo);
  if not found then raise exception 'Joueur inconnu'; end if;
  return salon_vue(p, 0);
end $$;
-- apparaître hors ligne (fenêtre du compte)
create or replace function regler_presence(p_invisible boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  update profils set invisible = coalesce(p_invisible, false) where user_id = p.user_id;
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;
-- Avant le match (demande de Maël, 23 nov. 2026, comme dans LoL) : « Match trouvé ! » à accepter en 15 s, sans voir l'adversaire
-- (propose) ; un refus ou un silence annule le match et remet dans la file celui qui avait accepté ; puis une présentation des deux
-- équipes, 60 s au plus ou jusqu'à ce que les deux soient prêts (prepa) ; puis le match (direct). On peut faire autre chose pendant la file.
create or replace function pvp_phase_maj(p_id uuid) returns pvp_matchs language plpgsql security definer set search_path = public as $$
declare m pvp_matchs; t numeric := pvp_maintenant(); s text; u uuid;
begin
  select * into m from pvp_matchs where id = p_id for update;
  if not found then return m; end if;
  if m.statut = 'propose' then
    if coalesce((m.meta #>> '{accepte,a}')::boolean, false) and coalesce((m.meta #>> '{accepte,b}')::boolean, false) then
      m.statut := 'prepa'; m.meta := m.meta || jsonb_build_object('prochain', t + parami('pvp_prepa_secondes'), 'pret_prepa', '{}'::jsonb);
    elsif t >= coalesce((m.meta ->> 'limite')::numeric, 0) then
      foreach s in array array['a', 'b'] loop
        u := case s when 'a' then m.a else m.b end;
        if u is not null and coalesce((m.meta #>> array['accepte', s])::boolean, false) then
          insert into pvp_file (user_id, trophees, entree) select u, x.trophees, now() - make_interval(secs => coalesce(m.attente, 0)) from profils x where x.user_id = u
            on conflict (user_id) do update set vu = now();
        end if;
      end loop;
      m.statut := 'annule';
    end if;
  elsif m.statut = 'prepa' then
    if coalesce((m.meta #>> '{pret_prepa,a}')::boolean, false) and coalesce((m.meta #>> '{pret_prepa,b}')::boolean, false)
      or t >= coalesce((m.meta ->> 'prochain')::numeric, 0) then
      m.statut := 'direct';
      m.meta := m.meta || jsonb_build_object('prochain', t + parami('pvp_envoi_secondes'), 'vu', jsonb_build_object('a', t, 'b', t));
    end if;
  end if;
  update pvp_matchs set statut = m.statut, meta = m.meta, maj = now() where id = m.id;
  return m;
end $$;
-- ce que le jeu voit avant le match : à accepter (rien sur l'adversaire), présentation (son équipe, ses stats, ses bonus), ou le match
create or replace function pvp_phase_json(m pvp_matchs, p_cote text) returns jsonb language plpgsql security definer set search_path = public as $$
declare t numeric := pvp_maintenant(); o text := case p_cote when 'a' then 'b' else 'a' end; adv profils;
begin
  if m.statut = 'propose' then
    return jsonb_build_object('propose', jsonb_build_object('id', m.id, 'reste', greatest(0, round((m.meta ->> 'limite')::numeric - t, 1)),
      'accepte', coalesce((m.meta #>> array['accepte', p_cote])::boolean, false)));
  elsif m.statut = 'prepa' then
    select * into adv from profils where user_id = case p_cote when 'a' then m.b else m.a end;
    return jsonb_build_object('prepa', jsonb_build_object('id', m.id, 'classe', m.classe, 'reste', greatest(0, round((m.meta ->> 'prochain')::numeric - t, 1)),
      'pret', coalesce((m.meta #>> array['pret_prepa', p_cote])::boolean, false), 'pretEux', coalesce((m.meta #>> array['pret_prepa', o])::boolean, false),
      'adversaire', jsonb_build_object('pseudo', adv.pseudo, 'trophees', adv.trophees, 'perso', perso_public(adv.user_id)),
      'equipe', case when adv.pseudo is not null then equipe_publique(adv.pseudo) end));
  elsif m.statut = 'annule' then
    return jsonb_build_object('annule', true);
  end if;
  return jsonb_build_object('match', pvp_vue_json(m, p_cote, 0));
end $$;
-- accepter (ou refuser) le match trouvé ; pendant la présentation : « Prêt »
create or replace function pvp_accepter(p_oui boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils; m pvp_matchs; c text; o text; u uuid;
begin
  m := pvp_mon_match(auth.uid());
  if m.id is null or m.statut not in ('propose', 'prepa') then raise exception 'Pas de match à accepter'; end if;
  m := pvp_phase_maj(m.id);   -- le match d'abord, puis le profil (voir pvp_vue)
  p := moi();
  c := case when m.a = p.user_id then 'a' else 'b' end; o := case c when 'a' then 'b' else 'a' end;
  if m.statut = 'propose' then
    if not coalesce(p_oui, false) then
      u := case o when 'a' then m.a else m.b end;   -- l'autre retourne dans la file s'il avait accepté
      if u is not null and coalesce((m.meta #>> array['accepte', o])::boolean, false) then
        insert into pvp_file (user_id, trophees, entree) select u, x.trophees, now() - make_interval(secs => coalesce(m.attente, 0)) from profils x where x.user_id = u
          on conflict (user_id) do update set vu = now();
      end if;
      update pvp_matchs set statut = 'annule', maj = now() where id = m.id;
      delete from pvp_file where user_id = p.user_id;
      return jsonb_build_object('annule', true);
    end if;
    update pvp_matchs set meta = jsonb_set(meta, array['accepte', c], 'true') where id = m.id;
  elsif m.statut = 'prepa' and coalesce(p_oui, false) then
    update pvp_matchs set meta = jsonb_set(meta, '{pret_prepa}', coalesce(meta -> 'pret_prepa', '{}') || jsonb_build_object(c, true)) where id = m.id;
  end if;
  m := pvp_phase_maj(m.id);
  return pvp_phase_json(m, c);
end $$;
create or replace function pvp_chercher() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils; m pvp_matchs; f pvp_file; o pvp_file; att int; v_id uuid; v jsonb; est int;
begin
  -- un match à accepter ou en présentation : sa phase (le match d'abord, puis le profil : voir pvp_vue)
  m := pvp_mon_match(auth.uid());
  if m.id is not null and m.statut in ('propose', 'prepa') then
    m := pvp_phase_maj(m.id);
    p := moi();
    if m.statut in ('propose', 'prepa') then return pvp_phase_json(m, case when m.a = p.user_id then 'a' else 'b' end); end if;
  else
    p := moi();
  end if;
  perform pvp_saison_maj(p.user_id);
  select * into p from profils where user_id = p.user_id;
  -- déjà dans un match à deux : on y va
  m := pvp_mon_match(p.user_id);
  if m.id is not null and m.statut = 'direct' then
    delete from pvp_file where user_id = p.user_id;
    return jsonb_build_object('match', pvp_vue_json(m, case when m.a = p.user_id then 'a' else 'b' end, 0));
  end if;
  if exists (select 1 from matchs_direct where user_id = p.user_id) then raise exception 'Termine d’abord ton match en cours (Championnat VS Ordi)'; end if;
  perform verifier_equipe(p.user_id, p.equipe);
  insert into pvp_file (user_id, trophees) values (p.user_id, p.trophees)
    on conflict (user_id) do update set vu = now(), trophees = excluded.trophees;
  -- une recherche à la fois sur tout le serveur : deux joueurs ne s'affrontent jamais deux fois en même temps
  perform pg_advisory_xact_lock(424242);
  delete from pvp_file where vu < now() - interval '15 seconds';
  select * into f from pvp_file where user_id = p.user_id;
  if f.user_id is null then
    insert into pvp_file (user_id, trophees) values (p.user_id, p.trophees) returning * into f;
  end if;
  att := floor(extract(epoch from now() - f.entree))::int;
  select * into o from pvp_file x where x.user_id <> p.user_id order by abs(x.trophees - p.trophees), x.entree limit 1;
  if o.user_id is not null then
    delete from pvp_file where user_id in (p.user_id, o.user_id);
    -- celui qui attendait depuis le plus longtemps est a
    if o.entree <= f.entree then v_id := pvp_nouveau(o.user_id, p.user_id, true, greatest(att, floor(extract(epoch from now() - o.entree))::int));
    else v_id := pvp_nouveau(p.user_id, o.user_id, true, att); end if;
    -- « Match trouvé ! » : les deux doivent accepter
    update pvp_matchs set statut = 'propose', meta = meta || jsonb_build_object('accepte', jsonb_build_object('a', false, 'b', false),
      'limite', pvp_maintenant() + parami('pvp_accepter_secondes')) where pvp_matchs.id = v_id;
    select * into m from pvp_matchs where pvp_matchs.id = v_id;
    perform noter(p.user_id, 'pvp-trouve', jsonb_build_object('match', v_id, 'attente', att));
    return pvp_phase_json(m, case when m.a = p.user_id then 'a' else 'b' end);
  end if;
  if att >= parami('pvp_fantome_secondes') then
    delete from pvp_file where user_id = p.user_id;
    v := pvp_fantome(p, att);
    return jsonb_build_object('fantome', true, 'vue', v, 'etat', etat_de(p.user_id));
  end if;
  select coalesce(round(avg(x.attente))::int, parami('pvp_fantome_secondes')) into est
    from (select attente from pvp_matchs where classe and attente is not null order by cree_le desc limit 20) x;
  return jsonb_build_object('attente', att, 'estime', least(parami('pvp_fantome_secondes'), greatest(10, est)), 'seuilFantome', parami('pvp_fantome_secondes'),
    'enFile', (select count(*) from pvp_file));
end $$;
create or replace function pvp_annuler() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  delete from pvp_file where user_id = p.user_id;
  return jsonb_build_object('ok', true);
end $$;

-- ── l'écran du mode classé : trophées, arène, arènes et leurs récompenses, classement, fin de saison
create or replace function pvp_accueil() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); r jsonb; ar int;
begin
  r := pvp_saison_maj(p.user_id);
  select * into p from profils where user_id = p.user_id;
  ar := pvp_arene(p.trophees);
  return jsonb_build_object('trophees', p.trophees, 'max', p.trophees_max, 'arene', ar, 'saisonRecompense', r,
    'arenes', (select jsonb_agg(x || jsonb_build_object('i', i - 1, 'atteinte', i - 1 <= ar or exists (select 1 from pvp_arenes_faites f where f.user_id = p.user_id and f.arene = i - 1)) order by i)
      from jsonb_array_elements(param('pvp_arenes')) with ordinality z(x, i)),
    'saisonFin', (date_trunc('month', aujourdhui()) + interval '1 month')::date, 'saisonSeuil', parami('pvp_saison_seuil'),
    'saisonRecompenses', param('pvp_saison_recompenses'),
    'gainsRestants', greatest(0, parami('pvp_gains_par_jour') - (select count(*) from rencontres x where x.user_id = p.user_id and x.type = 'pvp'
      and x.le >= debut_du_jour() and coalesce((x.detail ->> 'pieces')::int, 0) > 0)),
    'pieces', param('classe_pieces'), 'fantome', parami('pvp_fantome_secondes'),
    'classement', coalesce((select jsonb_agg(t order by t.trophees desc, lower(t.pseudo)) from (
      select x.pseudo, x.trophees, param('pvp_arenes') -> pvp_arene(x.trophees) ->> 'nom' arene, x.user_id = p.user_id moi, perso_public(x.user_id) perso
      from profils x where x.trophees > 0 order by x.trophees desc, lower(x.pseudo) limit 10) t), '[]'),
    -- le top 10, puis le joueur à son rang s'il n'y est pas (demande de Maël, 23 nov. 2026)
    'rang', (select count(*) + 1 from profils x where x.trophees > p.trophees),
    'moi', jsonb_build_object('pseudo', p.pseudo, 'trophees', p.trophees, 'arene', param('pvp_arenes') -> pvp_arene(p.trophees) ->> 'nom',
      'perso', perso_public(p.user_id), 'rang', (select count(*) + 1 from profils x where x.trophees > p.trophees)),
    'derniers', coalesce((select jsonb_agg(jsonb_build_object('adversaire', x.adversaire, 'score', x.score, 'resultat', x.resultat,
        'trophees', x.detail -> 'trophees', 'fantome', coalesce((x.detail ->> 'fantome')::boolean, false), 'classe', coalesce((x.detail ->> 'classe')::boolean, true), 'le', x.le) order by x.le desc)
      from (select * from rencontres x where x.user_id = p.user_id and x.type = 'pvp' order by x.le desc limit 8) x), '[]'));
end $$;

-- ── défi en direct entre ami(e)s : une invitation de 2 minutes ; acceptée, un match à deux non classé (30 pièces au gagnant)
create or replace function pvp_inviter(p_pseudo text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a profils := ami_de(p_pseudo); v_id uuid;
begin
  if not sont_amis(p.user_id, a.user_id) then raise exception 'Vous n’êtes pas ami(e)s'; end if;
  if (pvp_mon_match(p.user_id)).statut = 'direct' then raise exception 'Tu as déjà un match en cours'; end if;
  if exists (select 1 from matchs_direct where user_id = p.user_id) then raise exception 'Termine d’abord ton match en cours (Championnat VS Ordi)'; end if;
  perform verifier_equipe(p.user_id, p.equipe);
  if (select count(*) from jsonb_object_keys(a.equipe)) < 7 then raise exception '% n’a pas encore d’équipe complète', a.pseudo; end if;
  update pvp_invitations set statut = 'annulee' where de = p.user_id and statut = 'attente';
  insert into pvp_invitations (de, pour) values (p.user_id, a.user_id) returning pvp_invitations.id into v_id;
  perform noter(p.user_id, 'pvp-invite', jsonb_build_object('pour', a.pseudo));
  return jsonb_build_object('invitation', v_id, 'pour', a.pseudo, 'secondes', parami('pvp_invitation_secondes'));
end $$;
-- celui qui invite attend la réponse
create or replace function pvp_attendre(p_invitation uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); i pvp_invitations; m pvp_matchs; ecoule int;
begin
  select * into i from pvp_invitations where id = p_invitation and de = p.user_id;
  if not found then raise exception 'Invitation inconnue'; end if;
  ecoule := floor(extract(epoch from now() - i.cree_le))::int;
  if i.statut = 'attente' and ecoule >= parami('pvp_invitation_secondes') then
    update pvp_invitations set statut = 'expiree' where id = i.id; i.statut := 'expiree';
  end if;
  if i.statut = 'acceptee' then
    m := pvp_phase_maj(i.match);
    return jsonb_build_object('statut', 'acceptee') || pvp_phase_json(m, 'a');
  end if;
  return jsonb_build_object('statut', i.statut, 'attente', ecoule, 'secondes', parami('pvp_invitation_secondes'),
    'pour', (select pseudo from profils where user_id = i.pour));
end $$;
create or replace function pvp_repondre(p_invitation uuid, p_oui boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); i pvp_invitations; v_id uuid; m pvp_matchs;
begin
  select * into i from pvp_invitations where id = p_invitation and pour = p.user_id for update;
  if not found or i.statut <> 'attente' or i.cree_le < now() - make_interval(secs => parami('pvp_invitation_secondes')) then
    raise exception 'Cette invitation n’est plus valable';
  end if;
  if not coalesce(p_oui, false) then
    update pvp_invitations set statut = 'refusee' where id = i.id;
    return jsonb_build_object('ok', true);
  end if;
  perform 1 from profils where user_id in (p.user_id, i.de) order by user_id for update;
  if (pvp_mon_match(p.user_id)).statut in ('propose', 'prepa', 'direct') or (pvp_mon_match(i.de)).statut in ('propose', 'prepa', 'direct') then raise exception 'Un de vous deux a déjà un match en cours'; end if;
  if exists (select 1 from matchs_direct where user_id = p.user_id) then raise exception 'Termine d’abord ton match en cours (Championnat VS Ordi)'; end if;
  delete from pvp_file where user_id in (p.user_id, i.de);
  v_id := pvp_nouveau(i.de, p.user_id, false, null);
  -- les deux ont déjà dit oui : directement la présentation des équipes
  update pvp_matchs set statut = 'prepa', meta = meta || jsonb_build_object('prochain', pvp_maintenant() + parami('pvp_prepa_secondes'), 'pret_prepa', '{}'::jsonb)
    where pvp_matchs.id = v_id;
  update pvp_invitations set statut = 'acceptee', match = v_id where pvp_invitations.id = i.id;
  select * into m from pvp_matchs where pvp_matchs.id = v_id;
  return pvp_phase_json(m, 'b');
end $$;
create or replace function pvp_annuler_invitation(p_invitation uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  update pvp_invitations set statut = 'annulee' where id = p_invitation and de = p.user_id and statut = 'attente';
  return jsonb_build_object('ok', true);
end $$;
-- invitations reçues (bulle des ami(e)s)
create or replace function pvp_invitations_de(p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'de', pr.pseudo,
      'reste', greatest(0, parami('pvp_invitation_secondes') - floor(extract(epoch from now() - i.cree_le))::int)) order by i.cree_le), '[]')
  from pvp_invitations i join profils pr on pr.user_id = i.de
  where i.pour = p_uid and i.statut = 'attente' and i.cree_le > now() - make_interval(secs => parami('pvp_invitation_secondes'))
$$;

-- ── tâche de fond (pg_cron, chaque minute) : file et invitations périmées ; un match à deux dont les joueurs sont partis avance
-- seul (avec leurs adjoints) ; un match oublié depuis plus de 10 minutes est joué jusqu'au bout
create or replace function pvp_cron() returns int language plpgsql security definer set search_path = public as $$
declare m pvp_matchs; n int := 0; e jsonb; meta jsonb;
begin
  delete from pvp_file where vu < now() - interval '1 minute';
  update pvp_invitations set statut = 'expiree' where statut = 'attente' and cree_le < now() - make_interval(secs => parami('pvp_invitation_secondes'));
  for m in select * from pvp_matchs where statut in ('propose', 'prepa') for update skip locked loop perform pvp_phase_maj(m.id); end loop;
  for m in select * from pvp_matchs where statut = 'direct' and maj < now() - interval '30 seconds' for update skip locked loop
    if m.maj < now() - interval '10 minutes' then
      e := m.etat - 'sept_jeu'; meta := m.meta || jsonb_build_object('pause', null, 'vu', jsonb_build_object('a', 0, 'b', 0));
      if e ? 'sept' then e := match_7m_resoudre(e, null, null); end if;
      if (e ->> 't')::int > (e ->> 'bloc')::int * 300 then e := match_reprendre_tranche(e); end if;
      while (e ->> 'bloc')::int < 12 loop
        e := pvp_appliquer(e, meta, 'a', m.a); e := pvp_appliquer(e, meta, 'b', m.b); e := match_bloc_jouer(e);
      end loop;
      m.etat := e; m.meta := meta;
      perform pvp_conclure(m);
    else
      perform pvp_avancer(m.id);
    end if;
    n := n + 1;
  end loop;
  return n;
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
  perform progresser(p.user_id, 'mini');
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
      -- pleine à partir de 99 %) : au sommet du saut avec une barre pleine, toujours but ; sinon but avec une chance de élan³
      -- (20 nov. 2026, Maël : « trop facile » ; avant : 95 % et élan²).
      -- Raté : contré si le tir part bas dans le saut (ou une fois sur deux), sinon arrêté. reponse = le côté du gardien.
      if (p_entrees ->> 'vitesse') is null or (p_entrees ->> 'hauteur') is null then raise exception 'Essai invalide'; end if;
      declare vit numeric := least(1, greatest(0, (p_entrees ->> 'vitesse')::numeric)); hau numeric := least(1, greatest(0, (p_entrees ->> 'hauteur')::numeric)); elan numeric;
      begin
        elan := least(1, vit / .99) * least(1, hau / .99);
        if elan >= 1 or random() < elan ^ 3 then res := 'but';
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
  if p_jeu <> 'gardien' or jsonb_array_length(liste) % 5 = 0 then perform progresser(p.user_id, 'mini'); end if;
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

-- Défi contre l'équipe d'un autre joueur (il n'a pas besoin d'être connecté : il défend avec sa dernière tactique)
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
-- règle les paris des matchs joués ; p_avant : seulement les matchs d'avant cette date (la synchro automatique ne paie
-- que les matchs d'avant le lundi de la semaine : les paris sont payés le lundi matin)
drop function if exists regler_paris();
create or replace function regler_paris(p_avant date default null) returns int language plpgsql security definer set search_path = public as $$
declare x record; n int := 0; gagne boolean;
begin
  for x in select pa.*, issue(m) as res from paris pa join matchs m on m.rid = pa.rid
      where pa.statut = 'en_cours' and m.score_dom is not null and m.score_ext is not null and (p_avant is null or m.date < p_avant) for update of pa loop
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
      and not en_equipe(auth.uid(), e.id::text)))
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
declare p profils := moi(); e exemplaires;
begin
  -- ancien appel (anciens téléphones) : l'annonce devient une ligne de chaque liste de transferts, sans bloquer la carte
  select * into e from exemplaires where id = p_ex and proprietaire = p.user_id;
  if not found then raise exception 'Carte absente de ton club'; end if;
  if p_palier <> e.palier then raise exception 'Aux transferts, on échange seulement des cartes du même palier'; end if;
  if not exists (select 1 from cartes where id = p_carte and not legende) then raise exception 'Joueur inconnu'; end if;
  insert into listes_transfert (user_id, sens, carte, palier) values (p.user_id, 'donne', e.carte_id, e.palier), (p.user_id, 'veux', p_carte, p_palier)
    on conflict do nothing;
  perform progresser(p.user_id, 'marche');
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;

create or replace function retirer_annonce(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a annonces;
begin
  update annonces set statut = 'retiree' where id = p_id and vendeur = p.user_id and statut = 'ouverte' returning * into a;
  if not found then raise exception 'Cette annonce n’est plus ouverte'; end if;
  update exemplaires set verrou = null where id = a.exemplaire;
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;

-- un exemplaire libre (hors équipe, ni réservé ni en échange) de ce joueur à ce palier : le moins entraîné
create or replace function ex_libre(p_uid uuid, p_carte text, p_palier text) returns uuid language sql stable security definer set search_path = public as $$
  select e.id from exemplaires e where e.proprietaire = p_uid and e.carte_id = p_carte and e.palier = p_palier and e.verrou is null
    and not en_equipe(p_uid, e.id::text)
  order by e.note, e.xp limit 1
$$;
create or replace function libres_nombre(p_uid uuid, p_carte text, p_palier text) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from exemplaires e where e.proprietaire = p_uid and e.carte_id = p_carte and e.palier = p_palier and e.verrou is null
    and not en_equipe(p_uid, e.id::text)
$$;
-- mes listes, les échanges possibles avec les listes des autres, combien cherchent / donnent ce qui m'intéresse, mes derniers transferts
create or replace function mes_transferts() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); r jsonb;
begin
  perform listes_nettoyer(p.user_id);   -- les lignes mortes d'avant la correction partent à l'ouverture des Transferts
  r := jsonb_build_object('max', parami('transfert_liste_max'),
    'veux', coalesce((select jsonb_agg(jsonb_build_object('carte', l.carte, 'palier', l.palier) order by l.cree_le)
      from listes_transfert l where l.user_id = p.user_id and l.sens = 'veux'), '[]'),
    'donne', coalesce((select jsonb_agg(jsonb_build_object('carte', l.carte, 'palier', l.palier, 'libres', libres_nombre(p.user_id, l.carte, l.palier)) order by l.cree_le)
      from listes_transfert l where l.user_id = p.user_id and l.sens = 'donne'), '[]'),
    -- compatible : il veut un joueur que je donne, il donne un joueur que je veux, même palier, et chacun a encore une carte libre
    'possibles', coalesce((select jsonb_agg(jsonb_build_object('pseudo', o.pseudo, 'donne', c.donne, 'recoit', c.recoit, 'palier', c.palier,
        'ami', sont_amis(p.user_id, o.user_id)) order by sont_amis(p.user_id, o.user_id) desc, o.pseudo, c.palier, c.donne, c.recoit)
      from (select distinct ov.user_id, d.carte donne, od.carte recoit, d.palier
        from listes_transfert d
        join listes_transfert ov on ov.sens = 'veux' and ov.carte = d.carte and ov.palier = d.palier and ov.user_id <> p.user_id
        join listes_transfert od on od.sens = 'donne' and od.user_id = ov.user_id and od.palier = d.palier and od.carte <> d.carte
        join listes_transfert w on w.user_id = p.user_id and w.sens = 'veux' and w.carte = od.carte and w.palier = od.palier
        where d.user_id = p.user_id and d.sens = 'donne'
          and ex_libre(p.user_id, d.carte, d.palier) is not null and ex_libre(ov.user_id, od.carte, od.palier) is not null) c
      join profils o on o.user_id = c.user_id), '[]'),
    'cherchent', (select count(distinct ov.user_id) from listes_transfert d join listes_transfert ov on ov.sens = 'veux' and ov.carte = d.carte
      and ov.palier = d.palier and ov.user_id <> p.user_id where d.user_id = p.user_id and d.sens = 'donne'),
    'donnent', (select count(distinct od.user_id) from listes_transfert w join listes_transfert od on od.sens = 'donne' and od.carte = w.carte
      and od.palier = w.palier and od.user_id <> p.user_id where w.user_id = p.user_id and w.sens = 'veux'),
    'historique', coalesce((select jsonb_agg(h order by h ->> 'le' desc) from (select jsonb_build_object(
        'avec', (select pseudo from profils where user_id = case when t.a = p.user_id then t.b else t.a end),
        'donne', case when t.a = p.user_id then t.carte_a else t.carte_b end, 'recoit', case when t.a = p.user_id then t.carte_b else t.carte_a end,
        'palier', t.palier, 'le', t.le, 'nouveau', t.b = p.user_id and t.le > coalesce(p.transferts_vus, '-infinity')) h
      from transferts_faits t where p.user_id in (t.a, t.b) order by t.le desc limit 10) x), '[]'));
  update profils set transferts_vus = now() where user_id = p.user_id;   -- vus : la pastille s'efface
  return r || jsonb_build_object('etat', etat_de(p.user_id));
end $$;
-- enregistrer mes deux listes d'un coup : [{carte, palier}] ; on ne peut donner qu'un joueur dont on a une carte libre au palier choisi
create or replace function maj_listes_transfert(p_veux jsonb, p_donne jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); m int := parami('transfert_liste_max'); x jsonb;
begin
  if jsonb_typeof(p_veux) is distinct from 'array' or jsonb_typeof(p_donne) is distinct from 'array' then raise exception 'Listes invalides'; end if;
  for x in select v from jsonb_array_elements(p_veux || p_donne) v loop
    if coalesce(x ->> 'palier', '') not in ('bronze', 'argent', 'or', 'ultime') then raise exception 'Palier inconnu'; end if;
    if not exists (select 1 from cartes where id = x ->> 'carte' and not legende) then raise exception 'Joueur inconnu'; end if;
  end loop;
  if (select count(distinct (v ->> 'carte', v ->> 'palier')) from jsonb_array_elements(p_veux) v) > m
    or (select count(distinct (v ->> 'carte', v ->> 'palier')) from jsonb_array_elements(p_donne) v) > m then
    raise exception '% joueurs au plus dans chaque liste', m;
  end if;
  for x in select v from jsonb_array_elements(p_donne) v loop
    if libres_nombre(p.user_id, x ->> 'carte', x ->> 'palier') < 1 and not exists (select 1 from listes_transfert l
        where l.user_id = p.user_id and l.sens = 'donne' and l.carte = x ->> 'carte' and l.palier = x ->> 'palier') then
      raise exception 'Tu n’as pas de carte libre (hors équipe) de ce joueur à ce palier';
    end if;
  end loop;
  select coalesce(jsonb_agg(v), '[]') into p_donne from jsonb_array_elements(p_donne) v where libres_nombre(p.user_id, v ->> 'carte', v ->> 'palier') >= 1;
  if exists (select 1 from jsonb_array_elements(p_veux) v, jsonb_array_elements(p_donne) w where v ->> 'carte' = w ->> 'carte' and v ->> 'palier' = w ->> 'palier') then
    raise exception 'Un même joueur ne peut pas être dans les deux listes au même palier';
  end if;
  delete from listes_transfert where user_id = p.user_id;
  insert into listes_transfert (user_id, sens, carte, palier, cree_le)
    select p.user_id, 'veux', v ->> 'carte', v ->> 'palier', now() + i * interval '1 millisecond' from jsonb_array_elements(p_veux) with ordinality z(v, i)
    on conflict do nothing;
  insert into listes_transfert (user_id, sens, carte, palier, cree_le)
    select p.user_id, 'donne', v ->> 'carte', v ->> 'palier', now() + i * interval '1 millisecond' from jsonb_array_elements(p_donne) with ordinality z(v, i)
    on conflict do nothing;
  perform progresser(p.user_id, 'marche');
  return mes_transferts() || jsonb_build_object('etat', etat_de(p.user_id));
end $$;
-- faire un échange compatible avec les listes d'un autre joueur (ses listes valent son accord) : chacun donne sa carte libre la moins entraînée
create or replace function transferer(p_pseudo text, p_donne text, p_recoit text, p_palier text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profils := moi(); o profils; e1 uuid; e2 uuid;
begin
  select * into o from profils where lower(pseudo) = lower(trim(p_pseudo));
  if not found or o.user_id = p.user_id then raise exception 'Joueur inconnu'; end if;
  -- l'autre profil est verrouillé à son tour (le mien l'est déjà par moi()) : ses propres actions attendent la fin de l'échange.
  -- Deux échanges croisés au même instant : Postgres en annule un (interblocage), sans rien abîmer.
  perform 1 from profils where user_id in (p.user_id, o.user_id) order by user_id for update;
  if p_donne = p_recoit then raise exception 'Échange impossible'; end if;
  if not (exists (select 1 from listes_transfert where user_id = p.user_id and sens = 'donne' and carte = p_donne and palier = p_palier)
      and exists (select 1 from listes_transfert where user_id = p.user_id and sens = 'veux' and carte = p_recoit and palier = p_palier)
      and exists (select 1 from listes_transfert where user_id = o.user_id and sens = 'veux' and carte = p_donne and palier = p_palier)
      and exists (select 1 from listes_transfert where user_id = o.user_id and sens = 'donne' and carte = p_recoit and palier = p_palier)) then
    raise exception 'Cet échange n’est plus possible : les listes ont changé';
  end if;
  e1 := ex_libre(p.user_id, p_donne, p_palier); e2 := ex_libre(o.user_id, p_recoit, p_palier);
  if e1 is null or e2 is null then raise exception 'Cet échange n’est plus possible : une des cartes n’est plus libre'; end if;
  update exemplaires set proprietaire = o.user_id, protection = 5 where id = e1;
  update exemplaires set proprietaire = p.user_id, protection = 5 where id = e2;
  -- les joueurs voulus sont obtenus ; on garde un joueur à donner tant qu'il en reste une carte libre
  delete from listes_transfert where palier = p_palier and ((user_id = p.user_id and sens = 'veux' and carte = p_recoit)
    or (user_id = o.user_id and sens = 'veux' and carte = p_donne));
  delete from listes_transfert where palier = p_palier and user_id = p.user_id and sens = 'donne' and carte = p_donne and libres_nombre(p.user_id, p_donne, p_palier) = 0;
  delete from listes_transfert where palier = p_palier and user_id = o.user_id and sens = 'donne' and carte = p_recoit and libres_nombre(o.user_id, p_recoit, p_palier) = 0;
  insert into transferts_faits (a, b, carte_a, carte_b, palier) values (p.user_id, o.user_id, p_donne, p_recoit, p_palier);
  perform nettoyer_equipe(o.user_id); perform nettoyer_equipe(p.user_id);
  perform progresser(p.user_id, 'marche'); perform progresser(o.user_id, 'marche');
  perform noter(p.user_id, 'transfert', jsonb_build_object('avec', o.user_id, 'recu', e2, 'donne', e1));
  perform noter(o.user_id, 'transfert', jsonb_build_object('avec', p.user_id, 'recu', e1, 'donne', e2));
  return mes_transferts() || jsonb_build_object('exRecu', e2, 'exDonne', e1, 'etat', etat_de(p.user_id));
end $$;

-- Accepter une annonce : je donne un de mes exemplaires de la carte cherchée (le moins entraîné, hors équipe)
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
    and e.verrou is null and not en_equipe(p.user_id, e.id::text)
    order by e.note, e.xp limit 1;
  if mon_ex is null then raise exception 'Il te faut un exemplaire libre (hors équipe) de la carte demandée, au bon palier'; end if;
  if not exists (select 1 from exemplaires where id = a.exemplaire and proprietaire = a.vendeur) then
    raise exception 'La carte proposée n’est plus disponible';
  end if;
  update exemplaires set proprietaire = p.user_id, verrou = null, protection = 5 where id = a.exemplaire;
  update exemplaires set proprietaire = a.vendeur, protection = 5 where id = mon_ex;
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
        pr.user_id = p.user_id moi, perso_public(pr.user_id) perso
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
create or replace function defi_ami_conclure(p_uid uuid, p_ami uuid, fa jsonb, fb jsonb, r jsonb, p_gain numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profils; a profils; res text; res_d text; gain int := parami('defi_ami_pieces'); g_moi int := 0; g_lui int := 0;
begin
  select * into p from profils where user_id = p_uid; select * into a from profils where user_id = p_ami;
  res := r ->> 'resultat'; res_d := case res when 'gagne' then 'perdu' when 'perdu' then 'gagne' else 'nul' end;
  -- simulé : un peu moins pour moi ; mon ami(e) gagne toujours la somme entière
  if res = 'gagne' then g_moi := round(gain * p_gain); elsif res = 'perdu' then g_lui := gain; end if;
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
-- l'ancien appel (anciens téléphones) : le défi est simulé
create or replace function defier_ami(p_pseudo text) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return match_commencer('defi_ami', p_pseudo, coalesce((select tactique from profils where user_id = auth.uid()), 'duels:06'), 'normal', true);
end $$;

-- Carte libre d'un joueur : à lui, pas au marché, pas dans son équipe
create or replace function carte_libre(p_uid uuid, p_ex uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from exemplaires e where e.id = p_ex and e.proprietaire = p_uid and e.verrou is null)
    and not en_equipe(p_uid, p_ex::text)
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
    from exemplaires e join cartes c on c.id = e.carte_id where e.proprietaire = a.user_id and not c.legende and carte_libre(a.user_id, e.id)), '[]');
end $$;
-- « Voir l'équipe » depuis le classement (demande de Maël) : ce que joue un autre joueur, en lecture seule. Les 7 alignés (carte,
-- palier, note, capitaine), sa tactique, sa carte staff et, si ses 7 sont visibles, la note d'équipe telle que le match la calcule
-- (force_equipe : postes, forme, capitaine, staff, collectif). Les légendes alignées se voient aussi (demande de Maël : seule
-- exception à « une légende n'apparaît chez personne d'autre ») ; leur carte est jointe, le jeu ne les a pas dans son catalogue.
-- Rien d'autre (ni pièces, ni club, ni cartes libres).
-- remplaçants et bonus de chaque tactique (demande de Maël, 21 nov. 2026) : le banc (toujours au club, pas titulaire) et, pour les 6
-- tactiques, le bonus de son équipe (tactiques) et celui de l'équipe des remplaçants (tactiques_r : le remplaçant de chaque poste,
-- sinon le titulaire), calculés comme en match (force_equipe, tactique_bonus)
create or replace function equipe_publique(p_pseudo text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a profils := ami_de(p_pseudo); vis jsonb; f jsonb; st text; niv int; bn jsonb; fr jsonb;
  tac jsonb; tac_r jsonb; ch text;
begin
  select coalesce(jsonb_object_agg(j.key, j.value), '{}') into vis
    from jsonb_each_text(a.equipe) j join exemplaires e on e.id::text = j.value and e.proprietaire = a.user_id
    where j.key in ('AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB');
  select coalesce(jsonb_object_agg(j.key, j.value), '{}') into bn
    from jsonb_each_text(coalesce(a.remplacants, '{}')) j join exemplaires e on e.id::text = j.value and e.proprietaire = a.user_id
    where j.key in ('AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB') and not exists (select 1 from jsonb_each_text(vis) v where v.value = j.value);
  if (select count(*) from jsonb_object_keys(vis)) = 7 then
    f := force_equipe(vis, a.tactique);
    begin fr := case when bn <> '{}' then force_equipe(vis || bn, a.tactique) end; exception when others then fr := null; end;
    tac := '{}'; tac_r := '{}';
    foreach ch in array array['duels', 'enclenchement', 'rapide', '06', '15', '33'] loop
      tac := tac || jsonb_build_object(ch, tactique_bonus(f -> 'moyennes', ch));
      if fr is not null then tac_r := tac_r || jsonb_build_object(ch, tactique_bonus(fr -> 'moyennes', ch)); end if;
    end loop;
  end if;
  st := staff_actif(a.user_id); niv := coalesce((a.parcours ->> 'niveau')::int, 1);
  return jsonb_build_object('pseudo', a.pseudo, 'moi', a.user_id = p.user_id, 'perso', perso_public(a.user_id),
    'niveau', niv, 'poule', param('parcours') -> (niv - 1) ->> 'nom', 'groupe', param('parcours') -> (niv - 1) ->> 'groupe',
    'tactique', a.tactique, 'note', f -> 'note', 'collectif', f -> 'collectif', 'notes', f -> 'notes',
    'staff', case when st is null then null else jsonb_build_object('id', st, 'palier', staff_meilleur(a.user_id, st)) end,
    'joueurs', coalesce((select jsonb_agg(jsonb_build_object('poste', j.key, 'carte', e.carte_id, 'palier', e.palier, 'note', e.note, 'capitaine', e.id = a.capitaine,
        'legende', case when c.legende then to_jsonb(c) end))
      from jsonb_each_text(vis) j join exemplaires e on e.id::text = j.value join cartes c on c.id = e.carte_id), '[]'),
    'remplacants', coalesce((select jsonb_agg(jsonb_build_object('poste', j.key, 'carte', e.carte_id, 'palier', e.palier, 'note', e.note,
        'legende', case when c.legende then to_jsonb(c) end))
      from jsonb_each_text(bn) j join exemplaires e on e.id::text = j.value join cartes c on c.id = e.carte_id), '[]'),
    'tactiques', tac, 'tactiques_r', case when tac_r <> '{}' then tac_r end);
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
  if exists (select 1 from exemplaires e join cartes c on c.id = e.carte_id where e.id in (p_donne, p_demande) and c.legende) then
    raise exception 'Cette carte ne s’échange pas';
  end if;
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
  update exemplaires set proprietaire = p.user_id, protection = 5 where id = x.donne;
  update exemplaires set proprietaire = x.de, protection = 5 where id = x.demande;
  update echanges set statut = 'accepte', fini_le = now() where id = p_id;
  update echanges set statut = 'annule', fini_le = now() where statut = 'ouvert' and id <> p_id and (donne in (x.donne, x.demande) or demande in (x.donne, x.demande));
  perform listes_nettoyer(p.user_id); perform listes_nettoyer(x.de);
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
-- répété jusqu'à ce que plus rien ne bouge (les arrondis) : la relancer ne change rien ; seuls les décalages d'au moins ½ point comptent
declare fam text; ks text[]; moy jsonb; avant text; it int;
begin
  for it in 1 .. 6 loop
    select string_agg(id || ecarts::text, '|' order by id) into avant from cartes;
    for fam in select unnest(array['champ', 'gb']) loop
      ks := case fam when 'gb' then array['ref', 'pla', 'rel', 'men', 'phy', 'vit'] else array['tir', 'pas', 'def', 'men', 'phy', 'vit'] end;
      -- 1. chaque joueur : écarts centrés (somme nulle)
      update cartes c set ecarts = (select jsonb_object_agg(k2, round(coalesce((c.ecarts ->> k2)::numeric, 0) - x.m)) from unnest(ks) k2)
        from (select c2.id, (select avg(coalesce((c2.ecarts ->> k3)::numeric, 0)) from unnest(ks) k3) m from cartes c2) x
        where x.id = c.id and abs(x.m) >= .5 and coalesce(c.poste = 'GB', false) = (fam = 'gb');
      -- 2. moyenne de chaque stat sur le catalogue (cartes en jeu), retirée à tous
      select jsonb_object_agg(k2, (select avg((c.ecarts ->> k2)::numeric) from cartes c where c.actif and coalesce(c.poste = 'GB', false) = (fam = 'gb'))) into moy from unnest(ks) k2;
      if moy is null then continue; end if;
      update cartes c set ecarts = (select jsonb_object_agg(k2, round((c.ecarts ->> k2)::numeric
          - case when abs(coalesce((moy ->> k2)::numeric, 0)) >= .5 then (moy ->> k2)::numeric else 0 end)) from unnest(ks) k2)
        where coalesce(c.poste = 'GB', false) = (fam = 'gb')
          and exists (select 1 from unnest(ks) k2 where abs(coalesce((moy ->> k2)::numeric, 0)) >= .5);
    end loop;
    exit when avant is not distinct from (select string_agg(id || ecarts::text, '|' order by id) from cartes);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Administration (outil admin.html, compte avec role = 'admin')
-- ════════════════════════════════════════════════════════════════════════════

-- Ajoute ou met à jour des cartes du catalogue. p_complet = true : toute carte absente de la liste
-- n'est plus tirée dans les boosters (elle reste dans les clubs de ceux qui l'ont).
-- Cartes staff : la vraie personne de chaque carte (nom, description, une photo par palier), réglée dans l'outil.
-- Le passif ne change pas (règle du jeu). nom vide = la carte reprend son nom de poste.
create or replace function admin_publier_staff(p_staff jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare x jsonb; n int := 0; v_nom text; v_intro text; v_photos jsonb;
begin
  if not est_admin() then raise exception 'Réservé à l’administrateur'; end if;
  if jsonb_typeof(p_staff) <> 'array' then raise exception 'Liste de cartes staff attendue'; end if;
  for x in select * from jsonb_array_elements(p_staff) loop
    if not exists (select 1 from staff_catalogue() k where k.id = x ->> 'id') then raise exception 'Carte staff inconnue : %', x ->> 'id'; end if;
    v_nom := nullif(btrim(coalesce(x ->> 'nom', '')), ''); v_intro := nullif(btrim(coalesce(x ->> 'intro', '')), '');
    if length(v_nom) > 40 or length(v_intro) > 160 then raise exception 'Nom (40 caractères) ou description (160) trop longs'; end if;
    v_photos := coalesce(x -> 'photos', '{}');
    if jsonb_typeof(v_photos) <> 'object' or exists (select 1 from jsonb_each(v_photos) e
        where e.key not in ('bronze', 'argent', 'or', 'ultime') or jsonb_typeof(e.value) <> 'string' or e.value #>> '{}' !~ '^https://' or length(e.value #>> '{}') > 500) then
      raise exception 'Photos invalides';
    end if;
    insert into staff_reglages (id, nom, intro, photos, maj) values (x ->> 'id', v_nom, v_intro, v_photos, now())
      on conflict (id) do update set nom = excluded.nom, intro = excluded.intro, photos = excluded.photos, maj = now();
    n := n + 1;
  end loop;
  return jsonb_build_object('staff', n, 'catalogue', catalogue_staff());
end $$;

create or replace function admin_publier_cartes(p_cartes jsonb, p_complet boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if not est_admin() then raise exception 'Réservé à l’administrateur'; end if;
  if exists (select 1 from jsonb_array_elements(p_cartes) x where coalesce(x ->> 'id', '') !~ '^[a-z0-9-]{2,60}$' or coalesce(btrim(x ->> 'nom'), '') = '') then
    raise exception 'Carte invalide (identifiant ou nom)';
  end if;
  insert into cartes (id, nom, equipe, poste, postes, stats, ecarts, photos, photo, site, reglages, legende, actif, maj, equipes)
    select x ->> 'id', x ->> 'nom', x ->> 'equipe', x ->> 'poste',
      coalesce((select array_agg(v) from jsonb_array_elements_text(x -> 'postes') v), case when x ->> 'poste' is null then '{}' else array[x ->> 'poste'] end),
      x -> 'stats', coalesce(x -> 'ecarts', '{}'),
      coalesce(x -> 'photos', '{}'), x ->> 'photo', x -> 'site', nullif(x -> 'reglages', 'null'::jsonb),
      coalesce((x ->> 'legende')::boolean, false), not coalesce((x ->> 'legende')::boolean, false), now(),
      coalesce((select (array_agg(v order by o))[1:2] from jsonb_array_elements_text(case when jsonb_typeof(x -> 'equipes') = 'array' then x -> 'equipes' else '[]' end) with ordinality q(v, o)), '{}')
    from jsonb_array_elements(p_cartes) x
    on conflict (id) do update set nom = excluded.nom, equipe = excluded.equipe, equipes = excluded.equipes, poste = excluded.poste, postes = excluded.postes, stats = excluded.stats,
      ecarts = excluded.ecarts, photos = excluded.photos, photo = excluded.photo, site = excluded.site,
      reglages = excluded.reglages, legende = excluded.legende, actif = excluded.actif, maj = now();
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
drop function if exists maj_matchs(jsonb);
create or replace function maj_matchs(p_matchs jsonb, p_regler_avant date default null) returns jsonb language plpgsql security definer set search_path = public as $$
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
  regles := regler_paris(p_regler_avant);
  perform regler_pronostics();
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
-- l'action GitHub « resultats » lit les scores sur ffhandball.fr (lundi et jeudi, très tôt) et l'action « site » reprend les
-- cotes de medochandballstats.com dès qu'il est republié ; toutes deux mettent à jour data/matchs.json dans le dépôt.
-- Le serveur relit ce fichier toutes les 3 h (pg_net, pg_cron en bas du fichier) : matchs et cotes à jour, et paiement des
-- paris des matchs d'avant le lundi de la semaine (donc le lundi matin, ou le jour suivant si le lundi a échoué).
-- Le fichier n'est modifiable que par le dépôt : personne ne peut envoyer de faux scores. Fonctions internes (pas accordées au jeu).
create table if not exists synchro_matchs (
  id bigserial primary key, demande bigint, demande_le timestamptz not null default now(),
  lu_le timestamptz, resultat jsonb
);
revoke all on synchro_matchs from anon, authenticated;
alter table synchro_matchs add column if not exists demande_semaine bigint;
create or replace function synchro_matchs_demander() returns bigint language plpgsql security definer set search_path = public as $$
declare d bigint;
begin
  d := net.http_get(url := param('synchro_matchs_url') #>> '{}', timeout_milliseconds := 20000);
  insert into synchro_matchs (demande, demande_semaine)
    values (d, net.http_get(url := param('synchro_semaine_url') #>> '{}', timeout_milliseconds := 20000));
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
    r := maj_matchs(rep.content::jsonb -> 'matchs', date_trunc('week', aujourdhui())::date);   -- paie les matchs d'avant ce lundi
  exception when others then r := jsonb_build_object('erreur', sqlerrm);
  end;
  -- joueurs de la semaine (data/semaine.json) : une erreur ici n'empêche pas la mise à jour des matchs
  begin
    select status_code, content into rep from net._http_response where id = s.demande_semaine;
    if found and rep.status_code = 200 then r := r || jsonb_build_object('semaine', maj_semaine(rep.content::jsonb)); end if;
  exception when others then r := r || jsonb_build_object('erreurSemaine', sqlerrm);
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
-- Joueurs de la semaine, passe de saison, quêtes de la semaine, défis de composition : les actions du jeu
-- ════════════════════════════════════════════════════════════════════════════

-- Booster de la semaine : un des joueurs de la semaine, chances meilleures que le booster gratuit ; payé en pièces, 3 par jour
create or replace function ouvrir_booster_semaine() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); prix int := parami('booster_semaine_prix'); c text; ex uuid; pal text;
begin
  if (select count(*) from mouvements m where m.user_id = p.user_id and m.quoi = 'booster' and m.detail ->> 'type' = 'semaine'
      and m.le >= debut_du_jour()) >= parami('booster_semaine_par_jour') then
    raise exception 'Tu as ouvert tes % boosters de la semaine du jour : reviens demain', parami('booster_semaine_par_jour');
  end if;
  if p.pieces < prix then raise exception 'Il faut % pièces pour ce booster', prix; end if;
  select j.carte into c from joueurs_semaine j join cartes k on k.id = j.carte
    where j.lundi = semaine_actuelle() and k.actif order by random() limit 1;
  if c is null then raise exception 'Pas encore de joueurs de la semaine : reviens après le week-end'; end if;
  pal := tirer_palier(param('booster_semaine_chances'));
  ex := creer_exemplaire(p.user_id, c, pal, 'booster:semaine');
  update profils set pieces = pieces - prix, boosters_ouverts = boosters_ouverts + 1 where user_id = p.user_id;
  perform progresser(p.user_id, 'booster');
  perform noter(p.user_id, 'booster', jsonb_build_object('type', 'semaine', 'prix', prix, 'exemplaire', ex, 'carte', c, 'palier', pal));
  return jsonb_build_object('ids', jsonb_build_array(ex), 'etat', etat_de(p.user_id));
end $$;

-- Passe de saison : récupère d'un coup les récompenses de tous les paliers atteints
create or replace function reclamer_passe() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); x passe; s int := passe_saison(); atteint int; k int; r jsonb; tot jsonb := '{"pieces": 0, "bonus": 0, "or": 0}';
begin
  select * into x from passe where user_id = p.user_id and saison = s for update;
  if not found then raise exception 'Gagne de l’XP pour avancer dans le passe'; end if;
  atteint := least(parami('passe_paliers'), x.xp / parami('passe_xp_palier'));
  if atteint <= x.reclame then raise exception 'Rien à récupérer pour l’instant'; end if;
  for k in x.reclame + 1 .. atteint loop
    r := passe_recompense(k);
    tot := jsonb_build_object('pieces', (tot ->> 'pieces')::int + coalesce((r ->> 'pieces')::int, 0),
      'bonus', (tot ->> 'bonus')::int + coalesce((r ->> 'bonus')::int, 0), 'or', (tot ->> 'or')::int + coalesce((r ->> 'or')::int, 0));
  end loop;
  update passe set reclame = atteint where user_id = p.user_id and saison = s;
  update profils set pieces = pieces + (tot ->> 'pieces')::int, bonus = bonus + (tot ->> 'bonus')::int, bonus_or = bonus_or + (tot ->> 'or')::int
    where user_id = p.user_id;
  perform noter(p.user_id, 'passe', jsonb_build_object('saison', s, 'de', x.reclame + 1, 'a', atteint, 'gains', tot));
  return jsonb_build_object('de', x.reclame + 1, 'a', atteint, 'gains', tot, 'etat', etat_de(p.user_id));
end $$;

-- Récompense d'une quête de la semaine terminée
create or replace function reclamer_quete_semaine(p_quete text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); q quetes_semaine; c record; niveaux jsonb; l date := date_trunc('week', aujourdhui())::date;
begin
  select * into q from quetes_semaine where user_id = p.user_id and lundi = l and quete = p_quete for update;
  select * into c from quetes_semaine_catalogue() k where k.id = p_quete;
  if c.id is null or q.user_id is null then raise exception 'Quête inconnue'; end if;
  if q.reclamee then raise exception 'Récompense déjà récupérée'; end if;
  if q.progres < c.objectif then raise exception 'Quête pas encore terminée'; end if;
  update quetes_semaine set reclamee = true where user_id = p.user_id and lundi = l and quete = p_quete;
  update profils set pieces = pieces + c.pieces where user_id = p.user_id;
  niveaux := gagner_xp(p.user_id, c.xp);
  perform noter(p.user_id, 'quete-semaine', jsonb_build_object('quete', p_quete, 'xp', c.xp, 'pieces', c.pieces));
  return jsonb_build_object('xp', c.xp, 'pieces', c.pieces, 'niveaux', niveaux, 'etat', etat_de(p.user_id));
end $$;

-- Ce qui manque à des cartes pour suivre la règle d'un défi (null : tout est bon). Les cartes doivent être au joueur et libres.
create or replace function compo_erreur(p_uid uuid, p_regle jsonb, p_ex uuid[]) returns text language plpgsql stable security definer set search_path = public as $$
declare n int := (p_regle ->> 'n')::int; k record; c jsonb; v int;
begin
  if p_ex is null or cardinality(p_ex) <> n or (select count(distinct x) from unnest(p_ex) x) <> n then
    return format('Il faut %s cartes différentes', n);
  end if;
  if (select count(*) from unnest(p_ex) x where carte_libre(p_uid, x)) <> n then
    return 'Une carte n’est plus libre (dans ton équipe, aux transferts ou plus dans ton club)';
  end if;
  if exists (select 1 from exemplaires e join cartes c on c.id = e.carte_id where e.id = any(p_ex) and c.legende) then
    return 'Une légende ne se donne pas';
  end if;
  if exists (select 1 from echanges x where x.statut = 'ouvert' and (x.de = p_uid and x.donne = any(p_ex) or x.pour = p_uid and x.demande = any(p_ex))) then
    return 'Une carte est proposée dans un échange avec un(e) ami(e)';
  end if;
  select count(distinct e.carte_id) nd, count(distinct c.equipe) neq, avg(e.note) moy,
      min(array_position(array['bronze', 'argent', 'or', 'ultime'], e.palier)) pmin,
      count(distinct c.poste) filter (where c.poste is not null) npostes
    into k from exemplaires e join cartes c on c.id = e.carte_id where e.id = any(p_ex);
  if (p_regle ->> 'differents')::boolean and k.nd < n then return 'Les joueurs doivent tous être différents'; end if;
  if p_regle ? 'palier_min' and k.pmin < array_position(array['bronze', 'argent', 'or', 'ultime'], p_regle ->> 'palier_min') then
    return 'Une carte n’a pas le palier demandé';
  end if;
  if p_regle ? 'equipes' and k.neq < (p_regle ->> 'equipes')::int then return format('Il faut %s équipes différentes', p_regle ->> 'equipes'); end if;
  if p_regle ? 'note_moy' and k.moy < (p_regle ->> 'note_moy')::numeric then return format('La note moyenne doit atteindre %s', p_regle ->> 'note_moy'); end if;
  if (p_regle ->> 'un_par_poste')::boolean and (select count(distinct c.poste) from exemplaires e join cartes c on c.id = e.carte_id
      where e.id = any(p_ex) and c.poste is not null) < 7 then
    return 'Il faut un joueur à chaque poste (son poste principal)';
  end if;
  for c in select * from jsonb_array_elements(coalesce(p_regle -> 'conds', '[]')) loop
    select count(*) into v from exemplaires e join cartes ca on ca.id = e.carte_id where e.id = any(p_ex)
      and (not c ? 'palier' or e.palier = c ->> 'palier') and (not c ? 'equipe' or ca.equipe = c ->> 'equipe')
      and (not c ? 'genre' or ca.site ->> 'genre' = c ->> 'genre') and (not c ? 'poste' or ca.poste = c ->> 'poste');
    if v < (c ->> 'n')::int then return 'Les cartes ne suivent pas toute la règle'; end if;
  end loop;
  return null;
end $$;

-- Réussir un défi de composition : les cartes données disparaissent, la récompense arrive
create or replace function faire_defi(p_defi text, p_ex uuid[]) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); d record; per date; err text; r jsonb; donnees jsonb;
begin
  select * into d from compo_catalogue() c where c.id = p_defi and c.id in (select compo_actifs());
  if d.id is null then raise exception 'Ce défi n’est plus proposé'; end if;
  per := compo_periode(d.periode);
  if exists (select 1 from defis_faits where user_id = p.user_id and periode = per and defi = p_defi) then raise exception 'Défi déjà réussi'; end if;
  err := compo_erreur(p.user_id, d.regle, p_ex);
  if err is not null then raise exception '%', err; end if;
  select jsonb_agg(jsonb_build_object('carte', e.carte_id, 'palier', e.palier, 'note', e.note)) into donnees from exemplaires e where e.id = any(p_ex);
  delete from exemplaires where id = any(p_ex) and proprietaire = p.user_id;
  -- listes de transferts : plus rien à donner de ce joueur à ce palier → la ligne s'en va
  delete from listes_transfert l where l.user_id = p.user_id and l.sens = 'donne' and libres_nombre(p.user_id, l.carte, l.palier) = 0;
  r := d.recompense;
  update profils set pieces = pieces + coalesce((r ->> 'pieces')::int, 0), bonus = bonus + coalesce((r ->> 'bonus')::int, 0),
    bonus_or = bonus_or + coalesce((r ->> 'or')::int, 0) where user_id = p.user_id;
  insert into defis_faits (user_id, periode, defi, cartes) values (p.user_id, per, p_defi, donnees);
  perform progresser(p.user_id, 'compo');
  perform noter(p.user_id, 'defi-compo', jsonb_build_object('defi', p_defi, 'cartes', donnees, 'recompense', r));
  return jsonb_build_object('recompense', r, 'etat', etat_de(p.user_id));
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Boosters par équipe et choix du coach (demande de Maël : 5 à 9 joueurs par poste, c'était trop peu pour des boosters par poste)
-- ════════════════════════════════════════════════════════════════════════════

-- Booster d'une équipe du club (SF1, SF2, SG1, SG2 : 12 à 16 joueurs), acheté en pièces, mêmes chances que le booster gratuit
create or replace function ouvrir_booster_equipe(p_equipe text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); prix int := parami('booster_equipe_prix'); c text; ex uuid;
begin
  if p_equipe is null or not exists (select 1 from cartes where actif and p_equipe = any(equipes_de(equipe, equipes))) then raise exception 'Équipe inconnue'; end if;
  if p.pieces < prix then raise exception 'Il faut % pièces pour ce booster', prix; end if;
  select id into c from cartes where actif and p_equipe = any(equipes_de(equipe, equipes)) order by random() limit 1;
  ex := creer_exemplaire(p.user_id, c, tirer_palier(param('booster_chances')), 'booster:' || p_equipe);
  update profils set pieces = pieces - prix, boosters_ouverts = boosters_ouverts + 1 where user_id = p.user_id;
  perform progresser(p.user_id, 'booster');
  perform noter(p.user_id, 'booster', jsonb_build_object('type', 'equipe', 'equipe', p_equipe, 'prix', prix, 'exemplaire', ex, 'carte', c));
  return jsonb_build_object('ids', jsonb_build_array(ex), 'etat', etat_de(p.user_id));
end $$;

-- Booster mystère (demande de Maël) : une carte au hasard parmi toutes (joueurs de toutes les équipes, et cartes staff
-- 1 fois sur 10), mêmes chances de palier que le booster gratuit ; une légende 1 fois sur 500 (legende_chance_mystere)
-- Une légende du club, avec la chance de la clé donnée (sinon null) ; booster mystère : legende_chance_mystere (demande de Maël,
-- 21 nov. 2026 : les légendes sortent aussi du booster mystère, seul ou par 10 ; 1 sur 500 comme le booster gratuit)
create or replace function tirer_legende(p_cle text) returns text language sql volatile security definer set search_path = public as $$
  select case when random() < coalesce((param(p_cle) #>> '{}')::numeric, 0) then (select id from cartes where legende order by random() limit 1) end
$$;
-- une légende tirée devient un exemplaire Ultime à sa note de légende
create or replace function donner_legende(p_uid uuid, p_carte text, p_origine text) returns uuid language plpgsql security definer set search_path = public as $$
declare ex uuid;
begin
  ex := creer_exemplaire(p_uid, p_carte, 'ultime', p_origine);
  update exemplaires set note = greatest(palier_min('ultime'), least(100, parami('legende_note'))) where id = ex;
  return ex;
end $$;
create or replace function ouvrir_booster_hasard() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils; prix int := parami('booster_hasard_prix'); c text; ex uuid; st jsonb;
begin
  select * into p from profils where user_id = auth.uid() for update;
  if not found then raise exception 'Crée ton profil d''abord'; end if;
  if p.pieces < prix then raise exception 'Il faut % pièces pour ce booster', prix; end if;
  c := tirer_legende('legende_chance_mystere');
  if c is not null then
    ex := donner_legende(p.user_id, c, 'booster:hasard-legende');
  elsif random() < coalesce((param('staff_chance') #>> '{}')::numeric, 0) then
    st := donner_staff_hasard(p.user_id, param('booster_chances'));
  else
    c := tirer_carte();
    if c is null then raise exception 'Le catalogue est vide'; end if;
    ex := creer_exemplaire(p.user_id, c, tirer_palier(param('booster_chances')), 'booster:hasard');
  end if;
  update profils set pieces = pieces - prix, boosters_ouverts = boosters_ouverts + 1 where user_id = p.user_id;
  perform progresser(p.user_id, 'booster');
  perform noter(p.user_id, 'booster', jsonb_build_object('type', 'hasard', 'prix', prix, 'exemplaire', ex, 'carte', c, 'staff', st));
  return jsonb_build_object('ids', case when ex is null then '[]'::jsonb else jsonb_build_array(ex) end, 'staff', st, 'etat', etat_de(p.user_id));
end $$;

-- Boosters par 10 (demande de Maël) : 10 boosters d'une équipe, ou 10 boosters mystère (p_equipe = '?'), payés et ouverts d'un
-- coup (`booster_lot` boosters au prix de `booster_lot` fois un seul). Chaque carte est tirée exactement comme dans le booster
-- seul : mêmes chances de palier, carte staff 1 fois sur 10 et légende 1 fois sur 500 dans le mystère (jamais dans un booster
-- d'équipe). Renvoie {ids, staffs}.
create or replace function ouvrir_boosters_lot(p_equipe text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); n int := greatest(2, least(20, parami('booster_lot'))); mystere boolean := p_equipe = '?';
  prix int; c text; ex uuid; ids uuid[] := '{}'; staffs jsonb := '[]'::jsonb;
begin
  if p_equipe is null or (not mystere and not exists (select 1 from cartes where actif and p_equipe = any(equipes_de(equipe, equipes)))) then raise exception 'Équipe inconnue'; end if;
  prix := n * parami(case when mystere then 'booster_hasard_prix' else 'booster_equipe_prix' end);
  if p.pieces < prix then raise exception 'Il faut % pièces pour ces % boosters', prix, n; end if;
  for i in 1 .. n loop
    c := case when mystere then tirer_legende('legende_chance_mystere') end;
    if c is not null then
      ids := ids || donner_legende(p.user_id, c, 'booster:hasard-legende');
    elsif mystere and random() < coalesce((param('staff_chance') #>> '{}')::numeric, 0) then
      staffs := staffs || donner_staff_hasard(p.user_id, param('booster_chances'));
    else
      if mystere then c := tirer_carte(); else select id into c from cartes where actif and p_equipe = any(equipes_de(equipe, equipes)) order by random() limit 1; end if;
      if c is null then raise exception 'Le catalogue est vide'; end if;
      ex := creer_exemplaire(p.user_id, c, tirer_palier(param('booster_chances')), 'booster:' || case when mystere then 'hasard' else p_equipe end);
      ids := ids || ex;
    end if;
  end loop;
  update profils set pieces = pieces - prix, boosters_ouverts = boosters_ouverts + n where user_id = p.user_id;
  perform progresser(p.user_id, 'booster', n);
  perform noter(p.user_id, 'booster', jsonb_build_object('type', 'lot', 'equipe', p_equipe, 'nombre', n, 'prix', prix, 'exemplaires', ids, 'staffs', staffs));
  return jsonb_build_object('ids', to_jsonb(ids), 'staffs', staffs, 'etat', etat_de(p.user_id));
end $$;

-- Choix du coach (dans l'esprit du « choix miracle » de Pokémon TCG Pocket) : 3 joueurs d'un poste (poste principal) sont
-- montrés, puis mélangés face cachée ; on en retourne un et on le garde. Le mélange est tiré ici et gardé secret (table illisible
-- par le jeu) : le jeu ne peut pas savoir où est la meilleure carte. Payé à la préparation ; un choix commencé reste en attente
-- (on ne peut pas relancer le tirage en quittant).
create or replace function choix_coach_preparer(p_poste text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); prix int := parami('choix_coach_prix'); x choix_coach; tir jsonb := '[]'; c record;
begin
  select * into x from choix_coach where user_id = p.user_id;
  if found then return jsonb_build_object('poste', x.poste, 'cartes', x.cartes, 'etat', etat_de(p.user_id)); end if;
  if p_poste is null or p_poste not in ('AG', 'ARG', 'DC', 'ARD', 'AD', 'PIV', 'GB') then raise exception 'Poste inconnu'; end if;
  if (select count(*) from mouvements m where m.user_id = p.user_id and m.quoi = 'choix-coach' and m.le >= debut_du_jour()) >= parami('choix_coach_par_jour') then
    raise exception 'Tu as fait tes % choix du coach du jour : reviens demain', parami('choix_coach_par_jour');
  end if;
  if p.pieces < prix then raise exception 'Il faut % pièces pour le choix du coach', prix; end if;
  if (select count(*) from cartes where actif and poste = p_poste) < 3 then raise exception 'Pas assez de joueurs à ce poste'; end if;
  for c in select id from cartes where actif and poste = p_poste order by random() limit 3 loop
    tir := tir || jsonb_build_object('carte', c.id, 'palier', tirer_palier(param('booster_chances')));
  end loop;
  insert into choix_coach (user_id, poste, cartes, places)
    values (p.user_id, p_poste, tir, (select array_agg(k order by random()) from generate_series(0, 2) k));
  update profils set pieces = pieces - prix where user_id = p.user_id;
  perform noter(p.user_id, 'choix-coach', jsonb_build_object('poste', p_poste, 'prix', prix, 'cartes', tir));
  return jsonb_build_object('poste', p_poste, 'cartes', tir, 'etat', etat_de(p.user_id));
end $$;
-- p_i : la place touchée après le mélange (0 à 2, de gauche à droite) ; places[i] = la carte montrée qui y était
create or replace function choix_coach_choisir(p_i int) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); x choix_coach; k int; ex uuid; t jsonb;
begin
  select * into x from choix_coach where user_id = p.user_id for update;
  if not found then raise exception 'Pas de choix du coach en cours'; end if;
  if p_i is null or p_i not between 0 and 2 then raise exception 'Choisis une des 3 cartes'; end if;
  k := x.places[p_i + 1]; t := x.cartes -> k;
  ex := creer_exemplaire(p.user_id, t ->> 'carte', t ->> 'palier', 'choix-coach');
  delete from choix_coach where user_id = p.user_id;
  update profils set boosters_ouverts = boosters_ouverts + 1 where user_id = p.user_id;
  perform progresser(p.user_id, 'booster');
  perform noter(p.user_id, 'booster', jsonb_build_object('type', 'choix-coach', 'poste', x.poste, 'exemplaire', ex, 'carte', t ->> 'carte'));
  return jsonb_build_object('id', ex, 'carte', k, 'places', to_jsonb(x.places), 'cartes', x.cartes, 'etat', etat_de(p.user_id));
end $$;

-- Légendes : 100 de note générale (demande de Maël ; avant, 95) ; les exemplaires déjà tirés suivent
update parametres set valeurs = valeurs || '{"legende_note": 100}' where (valeurs ->> 'legende_note')::int = 95;
-- booster d'équipe : 300 → 500 pièces (demande de Maël ; une valeur réglée autrement depuis n'est pas touchée)
update parametres set valeurs = valeurs || '{"booster_equipe_prix": 500}' where (valeurs ->> 'booster_equipe_prix')::int = 300;
-- championnat (demande de Maël, 14 nov. 2026) : un match toutes les heures au lieu de 2 h, et des gains par match divisés par 2
-- (championnat_gain = 0,5, pièces et XP des matchs de championnat seulement ; la ligue garde les siens)
update parametres set valeurs = valeurs || '{"match_minutes": 60}' where (valeurs ->> 'match_minutes')::int = 120;
-- l'adjoint de « Simuler » lit moins bien le jeu adverse (retour d'un joueur, 20 nov. 2026 : simuler faisait mieux que jouer soi-même) :
-- mesure à force égale, simuler gagnait 34 à 51 % des matchs, autant qu'un joueur actif contre l'entraîneur réfléchi ; à 0,2, juste
-- au-dessus de qui garde sa tactique (33 à 53 %), nettement sous qui contre leur défense à chaque tranche (44 à 62 %)
-- 20 nov. 2026 (même jour) : avec la régularité des matchs (match_regularite = 0,04), la tactique compte bien plus et un adjoint à 0,2
-- ne gagnait plus que 22 à 30 % des matchs à force égale : 0,35 le remet entre qui garde sa tactique et qui joue activement
update parametres set valeurs = valeurs || '{"match_simule_lecture": 0.35}' where (valeurs ->> 'match_simule_lecture')::numeric in (0.5, 0.2);
-- 20 nov. 2026 (fatigue de chaque joueur) : au plus 1 blessure par match (Maël : « 2 blessures par match c'est trop ») ; seulement si
-- la valeur est encore l'ancienne
update parametres set valeurs = valeurs || '{"blessures_max": 1}' where (valeurs ->> 'blessures_max')::int = 2;
-- 21 nov. 2026 (Maël) : prendre le dessus compte double, 10 % de chances de marquer en plus ou en moins (match_contre 0,05 → 0,10) :
-- il doit compter plus que le plus gros bonus de tactique (10 % d'attaque ≈ +7 à 8 % de chances) ; seulement si encore à 0,05
update parametres set valeurs = valeurs || '{"match_contre": 0.10}' where (valeurs ->> 'match_contre')::numeric = 0.05;
-- 23 nov. 2026 : après la présentation des équipes (60 s), le coup d'envoi n'attend plus que 15 s (30 avant)
update parametres set valeurs = valeurs || '{"pvp_envoi_secondes": 15}' where (valeurs ->> 'pvp_envoi_secondes')::int = 30;
-- primes des Légendes (demande de Maël, 23 nov. 2026) : la première victoire contre une Légende ne change pas (5 000 à 10 000 pièces),
-- les suivantes rapportent la moitié de la première prime de base (2 500 au lieu de 1 000) ; seulement si la valeur est encore l'ancienne
update parametres set valeurs = valeurs || '{"parcours_legendes_rejouer_pieces": 2500}' where (valeurs ->> 'parcours_legendes_rejouer_pieces')::int in (1000, 1500);
-- 21 nov. 2026 (Maël, retour de Rémi : « variation de fatigue entre les joueurs pas assez marquée ») : endurance de 0,65 à 1,35
-- (0,8 à 1,2 avant), pente doublée ; seulement si encore aux anciennes valeurs
update parametres set valeurs = valeurs || '{"fatigue_endurance": 0.8, "fatigue_endurance_ecart": 0.35}'
  where (valeurs ->> 'fatigue_endurance')::numeric = 0.4 and (valeurs ->> 'fatigue_endurance_ecart')::numeric = 0.2;
-- 21 nov. 2026 (Maël) : les joueurs qui ont joué cette saison pour 2 équipes du jeu (feuilles de match du site, scripts/export_cartes.py)
-- sont dans les deux ; seulement si la carte n'a pas encore de 2e équipe et a toujours la même équipe principale (l'outil peut la changer)
update cartes c set equipes = v.eqs from (values
  ('annaele-bibey', array['SF1', 'SF2']),
  ('caroline-franchini', array['SF1', 'SF2']),
  ('celia-ait-ininou', array['SF2', 'SF1']),
  ('hugo-estrade', array['SG1', 'SG2']),
  ('leonie-celhay', array['SF1', 'SF2']),
  ('norah-de-wilde', array['SF1', 'SF2']),
  ('sohen-abadie', array['SG1', 'SG2'])) v(id, eqs)
  where c.id = v.id and cardinality(c.equipes) = 0 and c.equipe = v.eqs[1];
-- Seniors qui jouent aussi en -18 (feuilles de match données par Maël, 21 nov. 2026) : l'équipe où ils ont le plus joué devient la
-- principale (demande de Maël), l'équipe senior la 2e. Écrit aussi dans les réglages (comme l'outil : ★ = principale), sinon une
-- publication complète depuis l'outil les remettrait à leur seule équipe du site. Seulement si la carte est encore à son équipe senior,
-- sans 2e équipe. Sohen Abadie (SG1 3 matchs, SG2 1, -18G 1) garde SG1/SG2 : 2 équipes au plus.
update cartes c set equipe = v.eqs[1], equipes = v.eqs, reglages = coalesce(c.reglages, '{}') || jsonb_build_object('equipes', to_jsonb(v.eqs)), maj = now()
  from (values
  ('margot-arzel', array['-18F1', 'SF2']),
  ('chiara-geneves', array['-18F1', 'SF2']),
  ('dorian-bondy', array['-18G', 'SG2']),
  ('baptiste-braquessac', array['-18G', 'SG2'])) v(id, eqs)
  where c.id = v.id and cardinality(c.equipes) = 0 and c.equipe = v.eqs[2];
-- Régional, National et International plus durs (demande de Maël, 20 nov. 2026 : on y gagnait 72 à 95 % des matchs) : la force de base
-- de chaque niveau, seulement si elle est encore à l'ancienne valeur ; les poules et tournois déjà tirés gardent leurs adversaires
update parametres set valeurs = jsonb_set(valeurs, '{parcours}', (select jsonb_agg(case
    when (x ->> 'base')::int = (array[0, 0, 0, 60, 64, 68, 72, 76, 80, 84, 88, 91, 0])[i] then x || jsonb_build_object('base', (array[0, 0, 0, 62, 67, 72, 77, 82, 87, 90, 93, 96, 0])[i])
    else x end order by i) from jsonb_array_elements(valeurs -> 'parcours') with ordinality z(x, i)))
  where jsonb_array_length(valeurs -> 'parcours') = 13 and (valeurs #>> '{parcours,3,base}')::int = 60 and (valeurs #>> '{parcours,8,base}')::int = 80;
update exemplaires e set note = least(100, parami('legende_note')) from cartes c
  where c.id = e.carte_id and c.legende and e.note < least(100, parami('legende_note'));

-- ════════════════════════════════════════════════════════════════════════════
-- Pronostics, ligue, clubs, albums, capitaine, staff, personnalisation : les actions du jeu
-- ════════════════════════════════════════════════════════════════════════════

-- une récompense {pieces, bonus, or} versée au joueur
create or replace function donner_recompense(p_uid uuid, r jsonb) returns void language sql security definer set search_path = public as $$
  update profils set pieces = pieces + coalesce((r ->> 'pieces')::int, 0), bonus = bonus + coalesce((r ->> 'bonus')::int, 0),
    bonus_or = bonus_or + coalesce((r ->> 'or')::int, 0) where user_id = p_uid
$$;

-- ── pronostics du week-end
-- points d'un pronostic : score exact 5 ; sinon bon vainqueur (ou nul) 2, +1 avec le bon écart ; meilleur buteur 3
create or replace function prono_calcul(d int, e int, b text, sd int, se int, vrai text) returns int language sql stable security definer set search_path = public as $$
  select case when sd is null then null else
    (case when d = sd and e = se then (param('prono_points') ->> 'exact')::int
          when sign(d - e) = sign(sd - se) then (param('prono_points') ->> 'issue')::int + case when d - e = sd - se then (param('prono_points') ->> 'ecart')::int else 0 end
          else 0 end)
    + case when b is not null and b = vrai then (param('prono_points') ->> 'buteur')::int else 0 end end
$$;
-- relu après chaque synchro des matchs et des buteurs : points calculés, pièces versées pour les points pas encore payés
create or replace function regler_pronostics() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update pronostics p set points = prono_calcul(p.dom, p.ext, p.buteur, m.score_dom, m.score_ext, (select b.carte from buteurs_match b where b.rid = m.rid))
    from matchs m where m.rid = p.rid and m.score_dom is not null;
  with a as (select user_id, sum(points - payes) d from pronostics where points > payes group by user_id)
  update profils pr set pieces = pr.pieces + a.d * parami('prono_pieces_point') from a where a.user_id = pr.user_id;
  update pronostics set payes = points where points > payes;
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function prono_match_json(m matchs, p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('rid', m.rid, 'equipe', m.equipe, 'date', m.date, 'heure', m.heure, 'dom', m.dom, 'ext', m.ext, 'medoc', m.medoc,
    'score', case when m.score_dom is null then null else jsonb_build_array(m.score_dom, m.score_ext) end,
    'ouvert', m.score_dom is null and coup_envoi(m) > now(),
    'buteur', (select jsonb_build_object('carte', b.carte, 'buts', b.buts) from buteurs_match b where b.rid = m.rid),
    'prono', (select jsonb_build_object('dom', x.dom, 'ext', x.ext, 'buteur', x.buteur, 'points', x.points) from pronostics x where x.user_id = p_uid and x.rid = m.rid))
$$;
create or replace function mes_pronostics() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); dern date;
begin
  perform regler_pronostics();
  select date_trunc('week', max(m.date))::date into dern from pronostics x join matchs m on m.rid = x.rid where x.points is not null;
  return jsonb_build_object(
    'aVenir', coalesce((select jsonb_agg(prono_match_json(m, p.user_id) order by coup_envoi(m), m.equipe) from matchs m
      where m.medoc is not null and m.score_dom is null and coup_envoi(m) > now() and m.date <= aujourdhui() + 7), '[]'),
    'passes', coalesce((select jsonb_agg(prono_match_json(m, p.user_id) order by m.date desc, m.equipe) from matchs m
      where m.medoc is not null and m.score_dom is not null and m.date >= aujourdhui() - 21
        and exists (select 1 from pronostics x where x.user_id = p.user_id and x.rid = m.rid)), '[]'),
    'semaine', dern, 'piecesPoint', parami('prono_pieces_point'), 'bareme', param('prono_points'),
    'classementSemaine', coalesce((select jsonb_agg(t order by t.points desc, t.pseudo) from (
      select pr.pseudo, sum(x.points)::int points, pr.user_id = p.user_id moi, perso_public(pr.user_id) perso
      from pronostics x join matchs m on m.rid = x.rid join profils pr on pr.user_id = x.user_id
      where x.points is not null and m.date between dern and dern + 6 group by pr.user_id, pr.pseudo order by 2 desc limit 20) t), '[]'),
    'classementSaison', coalesce((select jsonb_agg(t order by t.points desc, t.pseudo) from (
      select pr.pseudo, sum(x.points)::int points, pr.user_id = p.user_id moi, perso_public(pr.user_id) perso
      from pronostics x join profils pr on pr.user_id = x.user_id where x.points is not null group by pr.user_id, pr.pseudo order by 2 desc limit 20) t), '[]'),
    'mesPoints', (select coalesce(sum(points), 0) from pronostics where user_id = p.user_id));
end $$;
create or replace function pronostiquer(p_rid text, p_dom int, p_ext int, p_buteur text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); m matchs;
begin
  select * into m from matchs where rid = p_rid;
  if not found or m.medoc is null then raise exception 'Match inconnu'; end if;
  if m.score_dom is not null or coup_envoi(m) <= now() then raise exception 'Trop tard : le match a commencé'; end if;
  if m.date > aujourdhui() + 7 then raise exception 'Pronostics ouverts une semaine avant le match'; end if;
  if p_dom is null or p_ext is null or p_dom not between 0 and 80 or p_ext not between 0 and 80 then raise exception 'Score invalide'; end if;
  if p_buteur is not null and not exists (select 1 from cartes where id = p_buteur and actif and m.equipe = any(equipes_de(equipe, equipes))) then raise exception 'Buteur inconnu'; end if;
  insert into pronostics (user_id, rid, dom, ext, buteur) values (p.user_id, p_rid, p_dom, p_ext, p_buteur)
    on conflict (user_id, rid) do update set dom = excluded.dom, ext = excluded.ext, buteur = excluded.buteur, le = now();
  perform noter(p.user_id, 'prono', jsonb_build_object('rid', p_rid, 'dom', p_dom, 'ext', p_ext, 'buteur', p_buteur));
  return mes_pronostics();
end $$;

-- ── ligue de la semaine
-- fin de semaine (au premier passage du lundi suivant) : rang dans le groupe, montée ou descente, récompense
create or replace function ligue_cloturer(p_uid uuid) returns void language plpgsql security definer set search_path = public as $$
declare m ligue_membres; g ligue_groupes; cl jsonb; rang int; n int; d int; r jsonb; f numeric;
begin
  select * into m from ligue_membres where user_id = p_uid and lundi < lundi_courant() and not clos order by lundi desc limit 1 for update;
  if not found then return; end if;
  select * into g from ligue_groupes where id = m.groupe;
  cl := ligue_classement(g, p_uid);
  select i into rang from jsonb_array_elements(cl) with ordinality t(x, i) where (x ->> 'moi')::boolean;
  n := jsonb_array_length(cl);
  select ligue_div into d from profils where user_id = p_uid;
  f := 1 + .25 * (8 - g.division);   -- plus haut, plus gros
  r := coalesce(param('ligue_recompenses') -> rang::text, param('ligue_recompenses') -> 'autres');
  r := r || jsonb_build_object('pieces', round(coalesce((r ->> 'pieces')::int, 0) * f));
  perform donner_recompense(p_uid, r);
  d := case when rang <= parami('ligue_montee') then greatest(1, g.division - 1)
            when rang > n - parami('ligue_descente') then least(parami('ligue_divisions'), g.division + 1) else g.division end;
  update profils set ligue_div = d, ligue_meilleure = least(ligue_meilleure, d),
    ligue_bilan = jsonb_build_object('rang', rang, 'sur', n, 'avant', g.division, 'apres', d, 'nomAvant', ligue_nom(g.division), 'nomApres', ligue_nom(d), 'recompense', r, 'vu', false)
    where user_id = p_uid;
  update ligue_membres set clos = true where groupe = m.groupe and user_id = p_uid;   -- la semaine est close pour ce joueur
  perform noter(p_uid, 'ligue-fin', jsonb_build_object('rang', rang, 'division', d, 'recompense', r));
end $$;
-- le groupe de la semaine du joueur (créé ou rejoint à la première visite)
create or replace function ligue_groupe(p_uid uuid) returns ligue_groupes language plpgsql security definer set search_path = public as $$
declare p profils; g ligue_groupes; v_bots jsonb := '[]'; v_nom text; i int := 0; f numeric; b jsonb;
begin
  perform ligue_cloturer(p_uid);
  select * into p from profils where user_id = p_uid;
  select g2.* into g from ligue_groupes g2 join ligue_membres m on m.groupe = g2.id where m.user_id = p_uid and m.lundi = lundi_courant();
  if found then return g; end if;
  -- un groupe de sa division avec une place (une équipe de l'ordinateur la lui laisse), sinon un nouveau groupe
  select g2.* into g from ligue_groupes g2 where g2.lundi = lundi_courant() and g2.division = p.ligue_div and jsonb_array_length(g2.bots) > 0
    order by g2.id limit 1 for update;
  if found then
    -- l'équipe de l'ordinateur la moins jouée cède sa place
    select x into b from jsonb_array_elements(g.bots) x order by coalesce((x ->> 'joues')::int, 0), x ->> 'id' limit 1;
    update ligue_groupes lg set bots = (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements(lg.bots) x where x ->> 'id' <> b ->> 'id') where id = g.id returning * into g;
  else
    f := ligue_force(p.ligue_div);
    for v_nom in select e.nom from equipes_reelles e order by random() limit parami('ligue_taille') - 1 loop
      i := i + 1; v_bots := v_bots || jsonb_build_object('id', i, 'nom', v_nom, 'force', round((f + random() * 6 - 3)::numeric, 1), 'rythme', round((.6 + random() * 1.5)::numeric, 2), 'pts', 0, 'joues', 0, 'g', 0);
    end loop;
    while i < parami('ligue_taille') - 1 loop
      i := i + 1; v_bots := v_bots || jsonb_build_object('id', i, 'nom', 'Équipe ' || i, 'force', round((f + random() * 6 - 3)::numeric, 1), 'rythme', round((.6 + random() * 1.5)::numeric, 2), 'pts', 0, 'joues', 0, 'g', 0);
    end loop;
    insert into ligue_groupes (lundi, division, bots) values (lundi_courant(), p.ligue_div, v_bots) returning * into g;
  end if;
  insert into ligue_membres (groupe, user_id, lundi) values (g.id, p_uid, lundi_courant());
  return g;
end $$;
create or replace function ligue_vue(p_uid uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare g ligue_groupes := ligue_groupe(p_uid); p profils;
begin
  select * into p from profils where user_id = p_uid;
  return jsonb_build_object('division', g.division, 'nom', ligue_nom(g.division), 'lundi', g.lundi, 'fin', g.lundi + 6,
    'classement', ligue_classement(g, p_uid), 'montee', parami('ligue_montee'), 'descente', parami('ligue_descente'),
    'divisions', parami('ligue_divisions'), 'recompenses', param('ligue_recompenses'), 'facteur', 1 + .25 * (8 - g.division),
    'jouesAujourdhui', (select count(*) from ligue_matchs where user_id = p_uid and le >= debut_du_jour()),
    'parJour', parami('ligue_matchs_jour'), 'memeAdversaire', parami('ligue_meme_adversaire'), 'bilan', p.ligue_bilan);
end $$;
create or replace function mes_ligue() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); v jsonb;
begin
  v := ligue_vue(p.user_id);
  if p.ligue_bilan is not null and not coalesce((p.ligue_bilan ->> 'vu')::boolean, false) then
    update profils set ligue_bilan = ligue_bilan || '{"vu": true}' where user_id = p.user_id;
  end if;
  return v || jsonb_build_object('etat', etat_de(p.user_id));
end $$;
create or replace function ligue_jouer(p_adv text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); g ligue_groupes; fa jsonb; fb jsonb; r jsonb; res text; o profils; b jsonb; v_nom text; pts int; gain int; niveaux jsonb;
begin
  g := ligue_groupe(p.user_id);
  if (select count(*) from ligue_matchs where user_id = p.user_id and le >= debut_du_jour()) >= parami('ligue_matchs_jour') then
    raise exception 'Tu as joué tes % matchs de ligue du jour : reviens demain', parami('ligue_matchs_jour');
  end if;
  if (select count(*) from ligue_matchs where groupe = g.id and user_id = p.user_id and adversaire = p_adv) >= parami('ligue_meme_adversaire') then
    raise exception 'Tu as déjà joué % fois contre cette équipe cette semaine', parami('ligue_meme_adversaire');
  end if;
  fa := force_equipe(p.equipe, p.tactique);
  if p_adv like 'u:%' then
    select pr.* into o from profils pr join ligue_membres m on m.user_id = pr.user_id where m.groupe = g.id and 'u:' || pr.user_id = p_adv and pr.user_id <> p.user_id;
    if not found then raise exception 'Adversaire inconnu'; end if;
    begin fb := force_equipe(o.equipe, o.tactique);
    exception when others then raise exception 'L’équipe de % n’est pas complète : choisis un autre adversaire', o.pseudo; end;
    v_nom := o.pseudo;
  elsif p_adv like 'b:%' then
    select x into b from jsonb_array_elements(g.bots) x where 'b:' || (x ->> 'id') = p_adv;
    if b is null then raise exception 'Adversaire inconnu'; end if;
    fb := equipe_ordi((b ->> 'force')::numeric); v_nom := b ->> 'nom';
  else raise exception 'Adversaire inconnu'; end if;
  r := simuler(fa, fb); res := r ->> 'resultat';
  pts := case res when 'gagne' then 3 when 'nul' then 1 else 0 end;
  gain := round(((param('ligue_pieces') ->> res))::int * (1 + staff_val(p.user_id, 'manager') / 100.0));   -- manager
  update ligue_membres set points = points + pts, joues = joues + 1, gagnes = gagnes + (res = 'gagne')::int, nuls = nuls + (res = 'nul')::int,
    perdus = perdus + (res = 'perdu')::int where groupe = g.id and user_id = p.user_id;
  if o.user_id is not null then   -- l'autre joueur défend : il prend aussi ses points
    update ligue_membres set points = points + case res when 'perdu' then 3 when 'nul' then 1 else 0 end, joues = joues + 1,
      gagnes = gagnes + (res = 'perdu')::int, nuls = nuls + (res = 'nul')::int, perdus = perdus + (res = 'gagne')::int
      where groupe = g.id and user_id = o.user_id;
    insert into rencontres (user_id, type, adversaire, score, resultat, detail) values (o.user_id, 'defense_ligue', p.pseudo, array[(r ->> 'b')::int, (r ->> 'a')::int],
      case res when 'gagne' then 'perdu' when 'perdu' then 'gagne' else 'nul' end, '{}');
  else
    update ligue_groupes lg set bots = (select jsonb_agg(case when x ->> 'id' = b ->> 'id' then x || jsonb_build_object(
        'pts', coalesce((x ->> 'pts')::int, 0) + case res when 'perdu' then 3 when 'nul' then 1 else 0 end,
        'joues', coalesce((x ->> 'joues')::int, 0) + 1, 'g', coalesce((x ->> 'g')::int, 0) + (res = 'perdu')::int) else x end) from jsonb_array_elements(lg.bots) x)
      where id = g.id;
  end if;
  insert into ligue_matchs (groupe, user_id, adversaire, score, resultat) values (g.id, p.user_id, p_adv, array[(r ->> 'a')::int, (r ->> 'b')::int], res);
  insert into rencontres (user_id, type, adversaire, score, resultat, detail) values (p.user_id, 'ligue', v_nom, array[(r ->> 'a')::int, (r ->> 'b')::int], res,
    jsonb_build_object('pieces', gain));
  update profils set pieces = pieces + gain where user_id = p.user_id;
  if res = 'gagne' then perform progresser(p.user_id, 'victoire'); end if;
  niveaux := gagner_xp(p.user_id, (param('pve_xp') ->> res)::int);
  perform noter(p.user_id, 'ligue', jsonb_build_object('contre', v_nom, 'resultat', res, 'score', jsonb_build_array(r -> 'a', r -> 'b')));
  return jsonb_build_object('match', r, 'adversaire', v_nom, 'note', fa -> 'note', 'noteAdversaire', fb -> 'note', 'points', pts, 'pieces', gain,
    'niveaux', niveaux, 'ligue', ligue_vue(p.user_id), 'etat', etat_de(p.user_id));
end $$;

-- ── clubs de joueurs
create or replace function club_victoires(p_club bigint) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from rencontres r join clubs_membres m on m.user_id = r.user_id
  where m.club = p_club and r.resultat = 'gagne' and r.type in ('championnat', 'defi_ami', 'pvp', 'ligue') and r.le >= greatest(debut_semaine(), m.rejoint_le)
$$;
create or replace function club_vue(p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'nom', c.nom, 'victoires', club_victoires(c.id), 'max', parami('club_membres_max'),
    'membres', (select jsonb_agg(jsonb_build_object('pseudo', pr.pseudo, 'niveau', pr.niveau, 'role', m.role, 'moi', pr.user_id = p_uid, 'perso', perso_public(pr.user_id),
        'victoires', (select count(*) from rencontres r where r.user_id = m.user_id and r.resultat = 'gagne' and r.type in ('championnat', 'defi_ami', 'pvp', 'ligue')
          and r.le >= greatest(debut_semaine(), m.rejoint_le))) order by m.role desc, m.rejoint_le)
      from clubs_membres m join profils pr on pr.user_id = m.user_id where m.club = c.id),
    'paliers', (select jsonb_agg(jsonb_build_object('palier', i, 'objectif', (o #>> '{}')::int, 'recompense', param('club_recompenses') -> (i - 1)::int,
        'atteint', club_victoires(c.id) >= (o #>> '{}')::int,
        'reclame', exists (select 1 from clubs_recompenses x where x.user_id = p_uid and x.lundi = lundi_courant() and x.palier = i)) order by i)
      from jsonb_array_elements(param('club_paliers')) with ordinality t(o, i)))
  from clubs c join clubs_membres mm on mm.club = c.id where mm.user_id = p_uid
$$;
create or replace function clubs_liste(p_texte text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t order by t.victoires desc, t.membres desc, t.nom), '[]') from (
    select c.id, c.nom, (select count(*) from clubs_membres m where m.club = c.id)::int membres, club_victoires(c.id) victoires from clubs c
    where p_texte is null or position(lower(btrim(p_texte)) in lower(c.nom)) > 0 order by 4 desc, 3 desc limit 20) t
$$;
create or replace function mon_club(p_texte text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  return jsonb_build_object('club', club_vue(p.user_id), 'clubs', clubs_liste(nullif(btrim(coalesce(p_texte, '')), '')), 'max', parami('club_membres_max'));
end $$;
create or replace function club_creer(p_nom text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); v_nom text := regexp_replace(btrim(coalesce(p_nom, '')), '\s+', ' ', 'g'); v_id bigint;
begin
  if exists (select 1 from clubs_membres where user_id = p.user_id) then raise exception 'Tu es déjà dans un club'; end if;
  if v_nom !~ '^[A-Za-z0-9À-ÖØ-öø-ÿ _.''-]{3,24}$' then raise exception 'Nom de club : 3 à 24 lettres ou chiffres'; end if;
  if exists (select 1 from clubs c where lower(c.nom) = lower(v_nom)) then raise exception 'Ce nom de club est déjà pris'; end if;
  insert into clubs (nom, cree_par) values (v_nom, p.user_id) returning clubs.id into v_id;
  insert into clubs_membres (user_id, club, role) values (p.user_id, v_id, 'president');
  perform noter(p.user_id, 'club-creer', jsonb_build_object('club', v_nom));
  return mon_club() || jsonb_build_object('etat', etat_de(p.user_id));
end $$;
create or replace function club_rejoindre(p_club bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  if exists (select 1 from clubs_membres where user_id = p.user_id) then raise exception 'Quitte d’abord ton club'; end if;
  perform 1 from clubs where id = p_club for update;
  if not found then raise exception 'Club inconnu'; end if;
  if (select count(*) from clubs_membres where club = p_club) >= parami('club_membres_max') then raise exception 'Ce club est complet'; end if;
  insert into clubs_membres (user_id, club) values (p.user_id, p_club);
  perform noter(p.user_id, 'club-rejoindre', jsonb_build_object('club', p_club));
  return mon_club() || jsonb_build_object('etat', etat_de(p.user_id));
end $$;
-- sortie d'un club (fonction interne) : le club vide disparaît, sinon le plus ancien membre devient président(e). Renvoie le club quitté.
create or replace function club_partir(p_uid uuid) returns bigint language plpgsql security definer set search_path = public as $$
declare m clubs_membres;
begin
  select * into m from clubs_membres where user_id = p_uid;
  if not found then return null; end if;
  perform 1 from clubs where id = m.club for update;
  delete from clubs_membres where user_id = p_uid;
  update club_demandes set statut = 'fermee', fini_le = now() where user_id = p_uid and statut = 'ouverte';
  if not exists (select 1 from clubs_membres where club = m.club) then delete from clubs where id = m.club;
  elsif m.role = 'president' then
    update clubs_membres set role = 'president' where user_id = (select user_id from clubs_membres where club = m.club order by rejoint_le limit 1);
  end if;
  return m.club;
end $$;
create or replace function club_quitter() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); m clubs_membres;
begin
  m.club := club_partir(p.user_id);
  if m.club is null then raise exception 'Tu n’es dans aucun club'; end if;
  perform noter(p.user_id, 'club-quitter', jsonb_build_object('club', m.club));
  return mon_club() || jsonb_build_object('etat', etat_de(p.user_id));
end $$;
create or replace function club_reclamer(p_palier int) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); m clubs_membres; obj int; r jsonb;
begin
  select * into m from clubs_membres where user_id = p.user_id;
  if not found then raise exception 'Tu n’es dans aucun club'; end if;
  -- un index négatif relit un tableau jsonb depuis la fin : palier 0 = la dernière récompense une seconde fois (audit du 12 nov. 2026)
  if p_palier is null or p_palier < 1 or p_palier > jsonb_array_length(param('club_paliers')) then raise exception 'Palier inconnu'; end if;
  obj := (param('club_paliers') ->> (p_palier - 1))::int; r := param('club_recompenses') -> (p_palier - 1);
  if obj is null or r is null then raise exception 'Palier inconnu'; end if;
  if club_victoires(m.club) < obj then raise exception 'Objectif pas encore atteint'; end if;
  insert into clubs_recompenses (user_id, lundi, palier) values (p.user_id, lundi_courant(), p_palier) on conflict do nothing;
  if not found then raise exception 'Récompense déjà récupérée'; end if;
  perform donner_recompense(p.user_id, r);
  perform noter(p.user_id, 'club-recompense', jsonb_build_object('palier', p_palier, 'recompense', r));
  return mon_club() || jsonb_build_object('recompense', r, 'etat', etat_de(p.user_id));
end $$;

-- ── albums
create or replace function reclamer_album(p_equipe text, p_palier text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); a jsonb; r jsonb;
begin
  select x into a from jsonb_array_elements(albums_vue(p.user_id)) x where x ->> 'equipe' = p_equipe and x ->> 'palier' = p_palier;
  if a is null then raise exception 'Album inconnu'; end if;
  if (a ->> 'fait')::boolean then raise exception 'Album déjà récompensé'; end if;
  if (a ->> 'possede')::int < (a ->> 'total')::int then raise exception 'Album pas encore complet'; end if;
  r := param('albums_recompenses') -> p_palier;
  insert into albums_faits (user_id, equipe, palier) values (p.user_id, p_equipe, p_palier);
  perform donner_recompense(p.user_id, r);
  perform noter(p.user_id, 'album', jsonb_build_object('equipe', p_equipe, 'palier', p_palier, 'recompense', r));
  return jsonb_build_object('recompense', r, 'etat', etat_de(p.user_id));
end $$;

-- ── capitaine
create or replace function choisir_capitaine(p_ex uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  if p_ex is not null and not exists (select 1 from jsonb_each_text(p.equipe) j where j.value = p_ex::text) then
    raise exception 'Le capitaine doit jouer dans ton équipe';
  end if;
  update profils set capitaine = p_ex where user_id = p.user_id;
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;

-- ── staff
-- Les cartes staff ne s'achètent plus (demande de Maël) : elles sortent seulement des boosters (gratuit et mystère, donner_staff_hasard).
-- L'ancien appel reste défini pour répondre clairement à une vieille version du jeu, mais n'est plus accordé.
create or replace function acheter_staff(p_staff text) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Les cartes staff se trouvent seulement dans les boosters';
end $$;
-- fusion, comme les joueurs : 3 exemplaires d'un palier → 1 du palier suivant, mêmes coûts (fusion_nombre, fusion_cout)
create or replace function fusionner_staff(p_staff text, p_palier text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils; suivant text := palier_suivant(p_palier); n int := parami('fusion_nombre'); cout int;
begin
  select * into p from profils where user_id = auth.uid() for update;
  if not found then raise exception 'Crée ton profil d''abord'; end if;
  if suivant is null then raise exception 'Une carte staff Ultime ne peut plus fusionner'; end if;
  if (select count(*) from staff_cartes where user_id = p.user_id and staff = p_staff and palier = p_palier) < n then
    raise exception 'Il faut % cartes staff % identiques', n, p_palier;
  end if;
  cout := (param('fusion_cout') ->> p_palier)::int;
  if p.pieces < cout then raise exception 'Il faut % pièces pour cette fusion', cout; end if;
  update profils set pieces = pieces - cout where user_id = p.user_id;
  delete from staff_cartes where id in (select id from staff_cartes where user_id = p.user_id and staff = p_staff and palier = p_palier order by id limit n);
  insert into staff_cartes (user_id, staff, palier) values (p.user_id, p_staff, suivant);
  perform progresser(p.user_id, 'fusion');
  perform noter(p.user_id, 'fusion-staff', jsonb_build_object('staff', p_staff, 'de', p_palier, 'vers', suivant, 'cout', cout));
  return jsonb_build_object('staff', p_staff, 'palier', suivant, 'etat', etat_de(p.user_id));
end $$;
create or replace function choisir_staff(p_staff text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  if p_staff is not null and not exists (select 1 from staff_cartes where user_id = p.user_id and staff = p_staff) then
    raise exception 'Tu n''as pas cette carte staff';
  end if;
  update profils set staff = p_staff where user_id = p.user_id;
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;

-- ── personnalisation
create or replace function choisir_perso(p_type text, p_id text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi();
begin
  if not exists (select 1 from perso_catalogue() k where k.id = p_id and k.type = p_type) then raise exception 'Choix inconnu'; end if;
  if not (p_id = any(perso_debloques(p.user_id))) then raise exception 'Pas encore débloqué'; end if;
  update profils set perso = perso || jsonb_build_object(p_type, p_id) where user_id = p.user_id;
  return jsonb_build_object('etat', etat_de(p.user_id));
end $$;

-- Catalogue : les légendes ne se lisent pas (l'admin, si) ; celles qu'on possède arrivent par etat_de
drop policy if exists lecture on cartes;
-- ════════════════════════════════════════════════════════════════════════════
-- Échanges (23 nov. 2026) : marché à pièces, boîte à échanges, demandes au club
-- ════════════════════════════════════════════════════════════════════════════
create or replace function nombre_cartes(p_uid uuid, p_carte text) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from exemplaires where proprietaire = p_uid and carte_id = p_carte
$$;
-- un doublon = au moins 2 cartes du même joueur AU MÊME PALIER (retour de Rémi, 23 nov. 2026 : avec une Bibey Ultime et une Bibey
-- d'un autre palier, la boîte proposait sa seule Ultime comme doublon)
create or replace function nombre_cartes_palier(p_uid uuid, p_carte text, p_palier text) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from exemplaires where proprietaire = p_uid and carte_id = p_carte and palier = p_palier
$$;
-- une carte qu'on peut céder : libre (hors équipe, banc et ventes), pas proposée à un(e) ami(e) ; la moins entraînée
create or replace function ex_cedable(p_uid uuid, p_carte text, p_palier text) returns uuid language sql stable security definer set search_path = public as $$
  select e.id from exemplaires e where e.proprietaire = p_uid and e.carte_id = p_carte and e.palier = p_palier and e.verrou is null
    and not en_equipe(p_uid, e.id::text) and not exists (select 1 from echanges x where x.statut = 'ouvert' and e.id in (x.donne, x.demande))
  order by e.note, e.xp limit 1
$$;
create or replace function marche_expirer() returns void language sql security definer set search_path = public as $$
  with x as (update ventes set statut = 'expiree', fini_le = now() where statut = 'ouverte'
    and cree_le < now() - make_interval(days => parami('marche_jours')) returning exemplaire)
  update exemplaires set verrou = null where id in (select exemplaire from x) and verrou = 'vente'
$$;
create or replace function club_demande_ouverte(d club_demandes) returns boolean language sql stable security definer set search_path = public as $$
  select d.statut = 'ouverte' and d.recu < d.voulu and d.cree_le > now() - make_interval(hours => parami('club_demande_duree_heures'))
$$;
create or replace function secondes_avant(p_t timestamptz) returns int language sql stable as $$
  select greatest(0, ceil(extract(epoch from p_t - now())))::int
$$;
-- tout ce que montre l'écran Transferts (marché, boîte, demandes du club, historique)
create or replace function echanges_vue(p_uid uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare pr profils; m clubs_membres; vus timestamptz; der timestamptz; der_or timestamptz;
begin
  select * into pr from profils where user_id = p_uid;
  select * into m from clubs_membres where user_id = p_uid;
  vus := coalesce(pr.transferts_vus, '-infinity');
  select max(cree_le) into der from club_demandes where user_id = p_uid;
  select max(cree_le) into der_or from club_demandes where user_id = p_uid and palier = 'or';
  return jsonb_build_object(
    'marche', jsonb_build_object(
      'ventes', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'carte', v.carte, 'palier', v.palier, 'note', v.note, 'prix', v.prix,
          'vendeur', o.pseudo, 'ami', sont_amis(p_uid, v.vendeur), 'expire', v.cree_le + make_interval(days => parami('marche_jours'))) order by v.cree_le desc)
        from (select * from ventes where statut = 'ouverte' and vendeur <> p_uid order by cree_le desc limit 300) v join profils o on o.user_id = v.vendeur), '[]'),
      'mes', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'carte', v.carte, 'palier', v.palier, 'note', v.note, 'prix', v.prix, 'statut', v.statut,
          'acheteur', (select pseudo from profils where user_id = v.acheteur), 'expire', v.cree_le + make_interval(days => parami('marche_jours')),
          'gain', floor(v.prix * (1 - coalesce((param('marche_taxe') #>> '{}')::numeric, 0)))::int)
          order by v.statut <> 'ouverte', coalesce(v.fini_le, v.cree_le) desc)
        from ventes v where v.vendeur = p_uid and (v.statut = 'ouverte' or (v.statut = 'vendue' and v.fini_le >= now() - interval '7 days'))), '[]'),
      'prix', param('marche_prix'), 'taxe', param('marche_taxe'), 'max', parami('marche_ventes_max'), 'jours', parami('marche_jours'),
      'achatsRestants', greatest(0, parami('marche_achats_par_jour') - (select count(*) from ventes where acheteur = p_uid and fini_le >= debut_du_jour())),
      'achatsLimite', parami('marche_achats_par_jour')),
    'boite', jsonb_build_object(
      'restants', greatest(0, parami('boite_par_jour') - (select count(*) from boite_faits where user_id = p_uid and le >= debut_du_jour())),
      'limite', parami('boite_par_jour'), 'minutes', parami('boite_attente_minutes'),
      'attente', coalesce((select jsonb_agg(jsonb_build_object('carte', f.donne, 'palier', f.palier, 'fin', f.le + make_interval(mins => parami('boite_attente_minutes')))
          order by f.le) from boite_faits f where f.user_id = p_uid and f.recu is null), '[]')),
    'club', case when m.user_id is null then null else jsonb_build_object(
      'nom', (select nom from clubs where id = m.club),
      'demandes', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'pseudo', o.pseudo, 'moi', d.user_id = p_uid, 'carte', d.carte, 'palier', d.palier,
          'voulu', d.voulu, 'recu', d.recu, 'fin', d.cree_le + make_interval(hours => parami('club_demande_duree_heures')),
          'possible', d.user_id <> p_uid and nombre_cartes_palier(p_uid, d.carte, d.palier) >= 2 and ex_cedable(p_uid, d.carte, d.palier) is not null)
          order by d.user_id = p_uid desc, d.cree_le desc)
        from club_demandes d join profils o on o.user_id = d.user_id where d.club = m.club and club_demande_ouverte(d)), '[]'),
      'prochaine', secondes_avant(der + make_interval(hours => parami('club_demande_heures'))),
      'prochaineOr', secondes_avant(der_or + make_interval(days => parami('club_demande_or_jours'))),
      'donsRestants', greatest(0, parami('club_dons_par_jour') - (select count(*) from club_dons where de = p_uid and le >= debut_du_jour())),
      'donsLimite', parami('club_dons_par_jour'), 'nombre', param('club_demande_nombre'), 'pieces', param('club_don_pieces'), 'xp', param('club_don_xp'),
      'heures', parami('club_demande_heures'), 'duree', parami('club_demande_duree_heures'), 'orJours', parami('club_demande_or_jours')) end,
    -- les 15 derniers mouvements (ventes, achats, dons, cartes reçues du club, anciens transferts)
    'historique', coalesce((select jsonb_agg(h order by h ->> 'le' desc) from (select h from (
        select jsonb_build_object('type', 'vente', 'avec', (select pseudo from profils where user_id = v.acheteur), 'carte', v.carte, 'palier', v.palier,
          'prix', floor(v.prix * (1 - coalesce((param('marche_taxe') #>> '{}')::numeric, 0)))::int, 'le', v.fini_le, 'nouveau', v.fini_le > vus) h
          from ventes v where v.vendeur = p_uid and v.statut = 'vendue'
        union all select jsonb_build_object('type', 'achat', 'avec', (select pseudo from profils where user_id = v.vendeur), 'carte', v.carte, 'palier', v.palier,
          'prix', v.prix, 'le', v.fini_le, 'nouveau', false) from ventes v where v.acheteur = p_uid and v.statut = 'vendue'
        union all select jsonb_build_object('type', 'don', 'avec', (select pseudo from profils where user_id = d.pour), 'carte', d.carte, 'palier', d.palier,
          'le', d.le, 'nouveau', false) from club_dons d where d.de = p_uid
        union all select jsonb_build_object('type', 'recu', 'avec', (select pseudo from profils where user_id = d.de), 'carte', d.carte, 'palier', d.palier,
          'le', d.le, 'nouveau', d.le > vus) from club_dons d where d.pour = p_uid
        union all select jsonb_build_object('type', 'boite', 'carte', b.recu, 'donne', b.donne, 'palier', b.palier, 'le', b.fini_le,
          'nouveau', b.fini_le > b.le + interval '2 seconds' and b.fini_le > vus) from boite_faits b where b.user_id = p_uid and b.recu is not null
        union all select jsonb_build_object('type', 'transfert', 'avec', (select pseudo from profils where user_id = case when t.a = p_uid then t.b else t.a end),
          'carte', case when t.a = p_uid then t.carte_b else t.carte_a end, 'donne', case when t.a = p_uid then t.carte_a else t.carte_b end,
          'palier', t.palier, 'le', t.le, 'nouveau', t.b = p_uid and t.le > vus) from transferts_faits t where p_uid in (t.a, t.b)
      ) z order by h ->> 'le' desc limit 15) y), '[]'));
end $$;
create or replace function mes_echanges() returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); r jsonb;
begin
  perform marche_expirer();
  perform boite_servir();
  r := echanges_vue(p.user_id);
  update profils set transferts_vus = now() where user_id = p.user_id;   -- vus : la pastille de Social s'efface
  return r || jsonb_build_object('etat', etat_de(p.user_id));
end $$;

-- ── marché à pièces (façon Ultimate Team) : une carte libre mise en vente à un prix borné par palier ; n'importe qui l'achète
-- d'un toucher ; le vendeur reçoit le prix moins la taxe. Prix plancher = 5 fois la vente au jeu (demande de Maël, 23 nov. 2026 :
-- « remonte les prix sans augmenter le max ») : une carte garde sa valeur, et passer des cartes d'un compte à un autre coûte cher.
create or replace function marche_vendre(p_ex uuid, p_prix int) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); e exemplaires; b jsonb;
begin
  perform marche_expirer();
  select * into e from exemplaires where id = p_ex and proprietaire = p.user_id;
  if not found then raise exception 'Carte absente de ton club'; end if;
  if exists (select 1 from cartes where id = e.carte_id and legende) then raise exception 'Cette carte ne se vend pas'; end if;
  if e.verrou is not null then raise exception 'Cette carte est déjà en vente'; end if;
  if en_equipe(p.user_id, p_ex::text) then raise exception 'Cette carte joue dans ton équipe (titulaire ou remplaçant) : retire-la d’abord'; end if;
  if exists (select 1 from echanges x where x.statut = 'ouvert' and p_ex in (x.donne, x.demande)) then
    raise exception 'Cette carte est proposée dans un échange entre ami(e)s';
  end if;
  b := param('marche_prix') -> e.palier;
  if p_prix is null or p_prix < (b ->> 0)::int or p_prix > (b ->> 1)::int then
    raise exception 'Prix d’une carte % : entre % et % pièces', initcap(e.palier), b ->> 0, b ->> 1;
  end if;
  if (select count(*) from ventes where vendeur = p.user_id and statut = 'ouverte') >= parami('marche_ventes_max') then
    raise exception '% cartes en vente au plus : retire-en une ou attends qu’elle parte', parami('marche_ventes_max');
  end if;
  update exemplaires set verrou = 'vente' where id = p_ex;
  insert into ventes (vendeur, exemplaire, carte, palier, note, prix) values (p.user_id, p_ex, e.carte_id, e.palier, e.note, p_prix);
  perform progresser(p.user_id, 'marche');
  perform noter(p.user_id, 'marche-vente', jsonb_build_object('carte', e.carte_id, 'palier', e.palier, 'prix', p_prix));
  return echanges_vue(p.user_id) || jsonb_build_object('etat', etat_de(p.user_id));
end $$;
create or replace function marche_retirer(p_vente uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); v ventes;
begin
  update ventes set statut = 'retiree', fini_le = now() where id = p_vente and vendeur = p.user_id and statut = 'ouverte' returning * into v;
  if not found then raise exception 'Cette vente n’est plus ouverte'; end if;
  update exemplaires set verrou = null where id = v.exemplaire and verrou = 'vente';
  return echanges_vue(p.user_id) || jsonb_build_object('etat', etat_de(p.user_id));
end $$;
create or replace function marche_acheter(p_vente uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); v ventes; gain int;
begin
  perform marche_expirer();
  select * into v from ventes where id = p_vente for update;
  if not found or v.statut <> 'ouverte' then raise exception 'Cette carte n’est plus en vente'; end if;
  if v.vendeur = p.user_id then raise exception 'C’est ta propre vente'; end if;
  if (select count(*) from ventes where acheteur = p.user_id and fini_le >= debut_du_jour()) >= parami('marche_achats_par_jour') then
    raise exception 'Tu as déjà acheté % cartes aujourd’hui : reviens demain', parami('marche_achats_par_jour');
  end if;
  if p.pieces < v.prix then raise exception 'Il te faut % pièces', v.prix; end if;
  perform 1 from profils where user_id = v.vendeur for update;   -- le vendeur est verrouillé à son tour
  if not exists (select 1 from exemplaires where id = v.exemplaire and proprietaire = v.vendeur and verrou = 'vente') then
    raise exception 'Cette carte n’est plus disponible';
  end if;
  gain := floor(v.prix * (1 - coalesce((param('marche_taxe') #>> '{}')::numeric, 0)));
  update profils set pieces = pieces - v.prix where user_id = p.user_id;
  update profils set pieces = pieces + gain where user_id = v.vendeur;
  update exemplaires set proprietaire = p.user_id, verrou = null, protection = 5 where id = v.exemplaire;
  update ventes set statut = 'vendue', acheteur = p.user_id, fini_le = now() where id = v.id;
  perform progresser(p.user_id, 'marche'); perform progresser(v.vendeur, 'marche');
  perform noter(p.user_id, 'marche-achat', jsonb_build_object('vente', v.id, 'carte', v.carte, 'palier', v.palier, 'prix', v.prix, 'exemplaire', v.exemplaire));
  perform noter(v.vendeur, 'marche-vendu', jsonb_build_object('vente', v.id, 'carte', v.carte, 'palier', v.palier, 'prix', v.prix, 'gain', gain));
  return echanges_vue(p.user_id) || jsonb_build_object('recu', v.exemplaire, 'etat', etat_de(p.user_id));
end $$;

-- ── boîte à échanges (façon Pokémon GO) : on dépose un doublon libre ; s'il y a dans la boîte une carte du même palier déposée par un
-- autre joueur (jamais la même carte, de préférence un joueur qu'on n'a pas), l'échange se fait tout de suite, d'abord avec quelqu'un
-- qui attend (il reçoit notre carte). Sinon notre carte attend dans la boîte (demande de Maël, 23 nov. 2026 : « pour éviter que la
-- boîte soit toujours vide, ne la remplis qu'au bout d'une heure ») : un autre joueur peut la prendre pendant boite_attente_minutes ;
-- passé ce temps, le jeu nous sert une carte du même palier et la nôtre reste dans la boîte pour le suivant. Le jeu prévient
-- (pastille, social.boite) quand un échange s'est fait pendant notre absence.
create or replace function boite_carte_jeu(p_uid uuid, p_sauf text) returns text language sql volatile security definer set search_path = public as $$
  select c.id from cartes c where c.actif and not c.legende and c.id <> p_sauf
  order by case when coalesce((param('boite_nouveau') #>> '{}')::boolean, true) and exists (select 1 from exemplaires y where y.proprietaire = p_uid and y.carte_id = c.id)
    then 1 else 0 end, random() limit 1
$$;
-- les dépôts qui attendent depuis plus d'une heure : le jeu sert le déposant (appelé par les actions, mon_etat et pg_cron)
create or replace function boite_servir() returns int language plpgsql security definer set search_path = public as $$
declare b boite; v_recu text; n int := 0;
begin
  for b in select * from boite where statut = 'attente' and depose_le < now() - make_interval(mins => parami('boite_attente_minutes'))
      order by depose_le for update skip locked loop
    if b.depose_par is not null and exists (select 1 from profils where user_id = b.depose_par) then
      v_recu := boite_carte_jeu(b.depose_par, b.carte);
      if v_recu is null then continue; end if;
      insert into exemplaires (proprietaire, carte_id, palier, note, origine) values (b.depose_par, v_recu, b.palier, palier_min(b.palier), 'boite');
      update boite_faits set recu = v_recu, fini_le = now() where id = b.fait;
      perform noter(b.depose_par, 'boite-recu', jsonb_build_object('donne', b.carte, 'recu', v_recu, 'palier', b.palier, 'par', 'jeu'));
    end if;
    update boite set statut = 'libre' where id = b.id;
    n := n + 1;
  end loop;
  return n;
end $$;
create or replace function boite_echanger(p_carte text, p_palier text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); ex uuid; e exemplaires; b boite; nv uuid; f bigint; nouv boolean := coalesce((param('boite_nouveau') #>> '{}')::boolean, true);
begin
  if p_palier is null or p_palier not in ('bronze', 'argent', 'or', 'ultime') then raise exception 'Palier inconnu'; end if;
  if not exists (select 1 from cartes where id = p_carte and not legende) then raise exception 'Cette carte ne s’échange pas'; end if;
  if (select count(*) from boite_faits where user_id = p.user_id and le >= debut_du_jour()) >= parami('boite_par_jour') then
    raise exception 'Tu as fait tes % échanges de la boîte aujourd’hui : reviens demain', parami('boite_par_jour');
  end if;
  if nombre_cartes_palier(p.user_id, p_carte, p_palier) < 2 then raise exception 'Seulement les doublons : il te faut 2 cartes de ce joueur à ce palier (tu en gardes une)'; end if;
  ex := ex_cedable(p.user_id, p_carte, p_palier);
  if ex is null then raise exception 'Il te faut une carte libre de ce joueur à ce palier (hors équipe, banc et ventes)'; end if;
  perform boite_servir();
  select * into e from exemplaires where id = ex;
  delete from exemplaires where id = ex;
  insert into boite_faits (user_id, donne, palier) values (p.user_id, p_carte, p_palier) returning id into f;
  -- une carte d'un autre joueur, du même palier : d'abord quelqu'un qui attend, puis un joueur que je n'ai pas encore
  select * into b from boite x where x.palier = p_palier and x.carte <> p_carte and x.depose_par is distinct from p.user_id
      and exists (select 1 from cartes c where c.id = x.carte and c.actif and not c.legende)
    order by (x.statut = 'attente') desc,
      case when nouv and exists (select 1 from exemplaires y where y.proprietaire = p.user_id and y.carte_id = x.carte) then 1 else 0 end, x.depose_le
    limit 1 for update skip locked;
  if b.id is null then
    -- personne pour l'instant : ma carte attend dans la boîte
    insert into boite (carte, palier, note, depose_par, fait) values (p_carte, p_palier, e.note, p.user_id, f);
    perform listes_nettoyer(p.user_id);
    perform progresser(p.user_id, 'marche');
    perform noter(p.user_id, 'boite-depot', jsonb_build_object('donne', p_carte, 'palier', p_palier));
    return echanges_vue(p.user_id) || jsonb_build_object('attente', true, 'minutes', parami('boite_attente_minutes'), 'etat', etat_de(p.user_id));
  end if;
  delete from boite where id = b.id;
  insert into exemplaires (proprietaire, carte_id, palier, note, origine) values (p.user_id, b.carte, p_palier, b.note, 'boite') returning id into nv;
  update boite_faits set recu = b.carte, fini_le = now() where id = f;
  if b.statut = 'attente' and b.depose_par is not null then
    -- il attendait : il reçoit ma carte (le jeu le lui dira), et rien ne reste dans la boîte
    perform 1 from profils where user_id = b.depose_par for update;
    insert into exemplaires (proprietaire, carte_id, palier, note, origine) values (b.depose_par, p_carte, p_palier, e.note, 'boite');
    update boite_faits set recu = p_carte, fini_le = now() where id = b.fait;
    perform noter(b.depose_par, 'boite-recu', jsonb_build_object('donne', b.carte, 'recu', p_carte, 'palier', p_palier, 'par', 'joueur'));
  else
    -- carte déjà « libre » (son déposant a été servi par le jeu) : la mienne la remplace pour le suivant
    insert into boite (carte, palier, note, depose_par, statut, fait) values (p_carte, p_palier, e.note, p.user_id, 'libre', f);
  end if;
  perform listes_nettoyer(p.user_id);
  perform progresser(p.user_id, 'marche');
  perform noter(p.user_id, 'boite', jsonb_build_object('donne', p_carte, 'recu', b.carte, 'palier', p_palier, 'exemplaire', nv));
  return echanges_vue(p.user_id) || jsonb_build_object('id', nv, 'etat', etat_de(p.user_id));
end $$;

-- ── demandes au club (façon Clash Royale) : toutes les 8 h, une carte demandée à son club (Bronze ×4, Argent ×2, Or ×1 une fois par
-- semaine) ; les membres donnent un doublon libre d'un toucher et gagnent pièces et XP ; la demande dure 24 h
create or replace function club_demander(p_carte text, p_palier text) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); m clubs_membres; n int; der timestamptz; s int;
begin
  select * into m from clubs_membres where user_id = p.user_id;
  if not found then raise exception 'Rejoins d’abord un club de joueurs (Social → Clubs)'; end if;
  n := (param('club_demande_nombre') ->> p_palier)::int;
  if p_palier is null or n is null or n < 1 then raise exception 'On ne demande que des cartes Bronze, Argent ou Or'; end if;
  if not exists (select 1 from cartes where id = p_carte and actif and not legende) then raise exception 'Joueur inconnu'; end if;
  select max(cree_le) into der from club_demandes where user_id = p.user_id;
  s := secondes_avant(der + make_interval(hours => parami('club_demande_heures')));
  if s > 0 then raise exception 'Prochaine demande dans % h % min', s / 3600, ceil((s % 3600) / 60.0)::int; end if;
  if p_palier = 'or' and exists (select 1 from club_demandes where user_id = p.user_id and palier = 'or'
      and cree_le > now() - make_interval(days => parami('club_demande_or_jours'))) then
    raise exception 'Une seule demande Or tous les % jours', parami('club_demande_or_jours');
  end if;
  update club_demandes set statut = 'fermee', fini_le = now() where user_id = p.user_id and statut = 'ouverte';
  insert into club_demandes (user_id, club, carte, palier, voulu) values (p.user_id, m.club, p_carte, p_palier, n);
  perform progresser(p.user_id, 'marche');
  perform noter(p.user_id, 'club-demande', jsonb_build_object('carte', p_carte, 'palier', p_palier, 'voulu', n));
  return echanges_vue(p.user_id) || jsonb_build_object('etat', etat_de(p.user_id));
end $$;
create or replace function club_donner(p_demande uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p profils := moi(); d club_demandes; ex uuid; v_pieces int; v_xp int; niveaux jsonb;
begin
  select * into d from club_demandes where id = p_demande for update;
  if not found or not club_demande_ouverte(d) then raise exception 'Cette demande est terminée'; end if;
  if d.user_id = p.user_id then raise exception 'C’est ta propre demande'; end if;
  if not exists (select 1 from clubs_membres where user_id = p.user_id and club = d.club) then raise exception 'Cette demande vient d’un autre club'; end if;
  if not exists (select 1 from clubs_membres where user_id = d.user_id and club = d.club) then raise exception 'Ce joueur a quitté le club'; end if;
  if (select count(*) from club_dons where de = p.user_id and le >= debut_du_jour()) >= parami('club_dons_par_jour') then
    raise exception 'Tu as déjà donné % cartes aujourd’hui : reviens demain', parami('club_dons_par_jour');
  end if;
  perform 1 from profils where user_id = d.user_id for update;   -- celui qui reçoit est verrouillé à son tour
  if nombre_cartes_palier(p.user_id, d.carte, d.palier) < 2 then raise exception 'Tu ne donnes que tes doublons : il te faut 2 cartes de ce joueur à ce palier (tu en gardes une)'; end if;
  ex := ex_cedable(p.user_id, d.carte, d.palier);
  if ex is null then raise exception 'Il te faut une carte libre de ce joueur à ce palier (hors équipe, banc et ventes)'; end if;
  update exemplaires set proprietaire = d.user_id, protection = 5 where id = ex;
  update club_demandes set recu = recu + 1, statut = case when recu + 1 >= voulu then 'pleine' else statut end,
    fini_le = case when recu + 1 >= voulu then now() else fini_le end where id = d.id;
  insert into club_dons (demande, de, pour, carte, palier) values (d.id, p.user_id, d.user_id, d.carte, d.palier);
  v_pieces := coalesce((param('club_don_pieces') ->> d.palier)::int, 0); v_xp := coalesce((param('club_don_xp') ->> d.palier)::int, 0);
  update profils set pieces = pieces + v_pieces where user_id = p.user_id;
  niveaux := gagner_xp(p.user_id, v_xp);
  perform listes_nettoyer(p.user_id);
  perform progresser(p.user_id, 'marche');
  perform noter(p.user_id, 'club-don', jsonb_build_object('demande', d.id, 'carte', d.carte, 'palier', d.palier, 'pieces', v_pieces, 'exemplaire', ex));
  perform noter(d.user_id, 'club-recu', jsonb_build_object('demande', d.id, 'carte', d.carte, 'palier', d.palier, 'exemplaire', ex));
  return echanges_vue(p.user_id) || jsonb_build_object('pieces', v_pieces, 'xp', v_xp, 'niveaux', niveaux, 'etat', etat_de(p.user_id));
end $$;

create policy lecture on cartes for select using (not legende
  or exists (select 1 from profils pr where pr.user_id = auth.uid() and pr.role = 'admin'));   -- sans fonction : les visiteurs lisent aussi le catalogue

-- ════════════════════════════════════════════════════════════════════════════
-- Droits : le jeu ne peut appeler QUE ces fonctions-là, et seulement une fois connecté
-- ════════════════════════════════════════════════════════════════════════════
revoke execute on all functions in schema public from public, anon, authenticated;
-- Audit du 12 nov. 2026 : 13 fonctions que le jeu n'appelle plus ne sont plus accordées (elles restent définies pour les tests du
-- moteur) : ouvrir_booster_poste, seance_equipe, seance_payante, defier, adversaires, classement, match_championnat, defier_ami,
-- marche, publier_annonce, retirer_annonce, accepter_annonce, chercher_joueurs. Elles donnaient encore, à qui appelait le serveur
-- sans passer par le jeu, des choses retirées par Maël (boosters par poste, séances, défis contre n'importe qui).
-- tests/test_droits.js compare cette liste aux appels de serveur.js et d'admin.js : l'une ne change pas sans l'autre.
grant execute on function
  mon_etat(), creer_profil(text, boolean), supprimer_mon_compte(),
  ouvrir_depart(), ouvrir_booster(text), fusionner(text, text), entrainer(uuid), vendre(uuid),
  aligner(text, uuid), aligner_equipe(jsonb), aligner_remplacants(jsonb, jsonb), reclamer_quete(text), mes_rencontres(),
  matchs_paris(), parier(text, text, int), tirer_7m(numeric, numeric, numeric), mini_preparer(text), mini_jouer(text, jsonb),
  salon_lire(bigint), salon_ecrire(text, bigint), salon_supprimer(bigint), salon_muet(text, int), regler_presence(boolean),
  pvp_chercher(), pvp_annuler(), pvp_accepter(boolean), pvp_vue(int), pvp_choix(text, text, jsonb, int, boolean, int), pvp_temps_mort(), pvp_accueil(),
  pvp_inviter(text), pvp_attendre(uuid), pvp_repondre(uuid, boolean), pvp_annuler_invitation(uuid),
  mes_echanges(), marche_vendre(uuid, int), marche_retirer(uuid), marche_acheter(uuid), boite_echanger(text, text), club_demander(text, text), club_donner(uuid),
  choisir_tactique(text), classement_poules(), ajouter_ami(text), repondre_ami(text, boolean), retirer_ami(text), mes_amis(), club_ami(text),
  proposer_echange(text, uuid, uuid), repondre_echange(uuid, boolean), annuler_echange(uuid), conversation(text), envoyer_message(text, text),
  admin_publier_matchs(jsonb), admin_publier_adversaires(jsonb),
  match_commencer(text, text, text, text, boolean), match_bloc(text, text, boolean), match_en_cours(), match_simuler_fin(), match_tirs_au_but(text[], text, boolean), match_tab_tir(jsonb), match_7m(jsonb, int), pvp_7m(jsonb, int), compo_enregistrer(int), compo_charger(int),
  ouvrir_booster_semaine(), reclamer_passe(), reclamer_quete_semaine(text), faire_defi(text, uuid[]),
  ouvrir_booster_equipe(text), ouvrir_booster_hasard(), ouvrir_boosters_lot(text), equipe_publique(text), match_temps_mort(int), match_changer(jsonb, int), choix_coach_preparer(text), choix_coach_choisir(int),
  mes_pronostics(), pronostiquer(text, int, int, text), mes_ligue(), ligue_jouer(text),
  mon_club(text), club_creer(text), club_rejoindre(bigint), club_quitter(), club_reclamer(int),
  reclamer_album(text, text), choisir_capitaine(uuid), fusionner_staff(text, text), choisir_staff(text), choisir_perso(text, text),
  admin_publier_cartes(jsonb, boolean), admin_publier_staff(jsonb), catalogue_staff(), est_admin()
to authenticated;

-- Écarts des cartes déjà publiées : remis à la nouvelle règle (sans effet s'ils le sont déjà)
select normaliser_ecarts();
-- Heures de recharge parties dans le futur (deux appels simultanés, avant le verrou) : ramenées à maintenant
update profils set boosters_maj = now() where boosters_maj > now();
update profils set matchs_maj = now() where matchs_maj > now();

-- Synchro des matchs toutes les 3 h (UTC) : demande du fichier, lecture 5, 15 et 25 minutes après (la réponse arrive en quelques
-- secondes). Les scores du lundi (action « resultats » à 3 h 17 UTC) sont relus à 6 h UTC : paris payés vers 7 h l'hiver à Paris.
-- Seulement sur Supabase (pg_cron et pg_net) : ignoré ailleurs.
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
    perform cron.schedule('mhc-matchs-demande', '0 */3 * * *', 'select public.synchro_matchs_demander()');
    perform cron.schedule('mhc-matchs-lecture', '5,15,25 */3 * * *', 'select public.synchro_matchs_lire()');
    perform cron.schedule('mhc-boite', '*/5 * * * *', 'select public.boite_servir()');
    perform cron.schedule('mhc-pvp', '* * * * *', 'select public.pvp_cron()');
  end if;
end $cron$;
-- Annonces ouvertes entre paliers différents (avant la règle du même palier) : retirées, la carte est rendue
insert into listes_transfert (user_id, sens, carte, palier)
  select vendeur, 'donne', offre ->> 'carte', offre ->> 'palier' from annonces where statut = 'ouverte' and offre ->> 'carte' in (select id from cartes)
  union select vendeur, 'veux', carte_cherchee, palier_cherche from annonces where statut = 'ouverte'
  on conflict do nothing;
with x as (update annonces set statut = 'retiree' where statut = 'ouverte' returning exemplaire)
update exemplaires set verrou = null where id in (select exemplaire from x) and verrou = 'marche';
with x as (update annonces set statut = 'retiree' where statut = 'ouverte' and palier_cherche <> offre ->> 'palier' returning exemplaire)
update exemplaires set verrou = null where id in (select exemplaire from x);
