# Serveur Supabase : mise en route et fonctionnement

Le jeu tourne entièrement avec un serveur Supabase : comptes, cartes, matchs, paris et marché.
Le site reste sur GitHub Pages ; Supabase fournit les comptes, la base de données et le stockage des photos (offre gratuite).
**C'est le serveur qui applique toutes les règles** : modifier son téléphone ne sert à rien.
Tant que `config.js` est vide, le jeu affiche « Le jeu ouvre bientôt ».

## Mise en route (une seule fois, environ 30 minutes)

### 1. Créer le projet

1. Sur <https://supabase.com>, crée un compte puis **New project**.
2. Nom : `medoc-hand-cards`. Choisis un mot de passe de base de données (garde-le, il ne sert pas dans le jeu).
3. Région : **West EU (Paris)** (les données des joueurs restent en Europe).

### 2. Créer la base

1. Menu **SQL Editor** → **New query**.
2. Colle **tout** le contenu de [`supabase/schema.sql`](../supabase/schema.sql), puis **Run**. Il doit afficher « Success ».

Ce fichier peut être relancé sans risque après chaque mise à jour du jeu : il ne supprime aucune donnée,
et il ajoute les nouveaux réglages sans écraser ceux que tu as modifiés.

### 3. Régler la connexion

Dans **Authentication** :

- **Sign In / Providers → Email** : laisse « Enable » et « Confirm email » activés. Mets la longueur minimale du mot de passe à **8**.
- **URL Configuration** :
  - *Site URL* : `https://maelbenharoun.github.io/Medoc-Handball-Cards/`
  - *Redirect URLs* : ajoute `https://maelbenharoun.github.io/Medoc-Handball-Cards/` et `https://maelbenharoun.github.io/Medoc-Handball-Cards/admin.html`
- **Emails** : traduis les modèles « Confirm signup » et « Reset password » en français si tu veux.
  **Important** : l'envoi d'e-mails fourni par Supabase est limité à quelques messages par heure et réservé aux essais.
  Avant d'ouvrir le jeu à tout le club, branche un service d'envoi (*SMTP Settings*), par exemple Brevo ou Resend, qui ont une offre gratuite.

### 4. Connexion Google (facultatif)

1. Sur <https://console.cloud.google.com> : crée un projet, puis **APIs & Services → OAuth consent screen** (type « External », nom « Médoc Hand Cards »).
2. **Credentials → Create credentials → OAuth client ID**, type « Web application ».
   *Authorized redirect URIs* : l'adresse de rappel indiquée par Supabase dans **Authentication → Providers → Google**
   (du genre `https://abcdefgh.supabase.co/auth/v1/callback`).
3. Copie le *Client ID* et le *Client secret* dans **Authentication → Providers → Google**, puis active-le.

### 5. Brancher le jeu

Dans **Project Settings → API** (ou le bouton **Connect**), copie :

- *Project URL* → `supabaseUrl` dans [`config.js`](../config.js) ;
- la clé **anon public** (ou **publishable**) → `supabaseCle`.

**Jamais** la clé `service_role` ou `secret` : elle donne tous les droits. La clé « anon/publishable » est faite pour être publique.
Commit et push sur `main` : 1 à 2 minutes plus tard, le jeu en ligne demande de se connecter.

### 6. Devenir administrateur

1. Dans le jeu, crée ton compte et ton profil comme un joueur.
2. Dans **SQL Editor**, lance (avec ton pseudo) :
   ```sql
   update profils set role = 'admin' where pseudo = 'TonPseudo';
   ```

### 7. Remplir le catalogue et les matchs

1. **Avant** : dans l'outil, donne un poste de jeu à chaque carte (filtre « Sans poste »). Le booster de départ tire un joueur par poste ;
   tant qu'un poste n'est pas renseigné, il prend un joueur de champ au hasard.
2. Ouvre l'outil (`admin.html`, ou 5 fois le logo dans le jeu, connecté en admin) → **Compte** → connecte-toi.
3. Touche **Synchroniser avec le site** : les cartes de `data/cartes.json` (avec tes réglages de `data/perso.json`)
   et les matchs de `data/matchs.json` partent sur le serveur.

Ensuite, « Publier » enregistre directement tes modifications sur le serveur (photos comprises) : le jeu est à jour tout de suite.
Le jeton GitHub ne sert plus : supprime-le sur <https://github.com/settings/personal-access-tokens>.

## Au quotidien

- **Nouvelles feuilles de match** (chaque semaine) : lance `scripts/export_cartes.py`, pousse `data/cartes.json` et `data/matchs.json`,
  puis dans l'outil **Synchroniser avec le site**. Les paris des matchs joués sont réglés à ce moment-là.
  Pour ne mettre à jour que les matchs et les équipes du parcours : bouton **Matchs, paris et équipes du parcours**.
  Une carte absente du site n'est plus tirée dans les boosters, mais reste dans les clubs de ceux qui l'ont.
- **Changer un réglage** (chances des boosters, coûts, gains, limites du jour, niveaux du parcours…) : **Table Editor** → table `parametres`,
  colonne `valeurs`. Le jeu suit au prochain chargement.
- **Voir ce qui s'est passé** (litige, soupçon de triche) : table `mouvements` (boosters, fusions, ventes, matchs, paris, transferts, avec la date).
- **Offre gratuite** : un projet sans aucune visite pendant 7 jours est mis en pause par Supabase (un clic pour le relancer).

## Les règles du jeu (réglages par défaut, table `parametres`)

| Quoi | Règle |
|---|---|
| **Paliers** | Bronze 50 → 59 · Argent 60 → 74 · Or 75 → 89 · Ultime 90 → 99, même pouvoir pour tous les joueurs. Une carte arrive au bas de son palier |
| **Forme du joueur** | Les 6 stats réglées dans l'outil donnent les écarts (ex. TIR +4, DÉF −6), de somme nulle, gardés en proportion à chaque palier. Stat = moyenne de la note × (1 + écart / 40), avec une moyenne de 40 à la note 50 et de 80 à 99 (`stat_note`) : à note égale, même total de stats pour tous (240 → 480). `normaliser_ecarts` (à chaque publication des cartes) met aussi chaque stat à la même moyenne sur tout le catalogue |
| **Postes** | Plusieurs par joueur (le premier = principal). Pas de malus à ses postes, −5 ailleurs ; GB parmi ses postes = il peut aller au but. Bonus de stats par poste (ailier : vitesse, tir ; arrière : tir, physique ; demi-centre : passes, mental ; pivot : physique, défense), moyenné s'il en a plusieurs |
| **Booster mystère** | 300 pièces (`booster_hasard_prix`, `ouvrir_booster_hasard`) : une carte au hasard parmi toutes, joueur de n'importe quelle équipe ou carte staff (1 fois sur 10, `staff_chance`), mêmes chances de palier que le booster gratuit ; jamais de légende |
| **Booster par équipe** | 500 pièces (`booster_equipe_prix`) : un joueur de l'équipe choisie (SF1, SF2, SG1, SG2), mêmes chances de palier que le booster gratuit (`ouvrir_booster_equipe`). Les anciens boosters par poste (`ouvrir_booster_poste`) ne sont plus proposés : trop peu de joueurs par poste |
| **Boosters par 10** | `ouvrir_boosters_lot(p_equipe)` : 10 boosters (`booster_lot`) d'une équipe, ou mystère avec `'?'`, payés et ouverts d'un coup au prix de 10 fois un seul. Chaque carte est tirée comme dans le booster seul (mêmes chances, staff 1 fois sur 10 dans le mystère, jamais de légende). |
| **Choix du coach** | 400 pièces, 3 par jour (`choix_coach_*`) : 3 joueurs différents d'un poste (poste **principal** : avoir plusieurs postes ne donne pas plus de chances de sortir), chacun à un palier tiré comme le booster gratuit, sont montrés puis mélangés ; on en retourne un. `choix_coach_preparer(poste)` paie et tire les cartes et leur place secrète (table `choix_coach`, jamais lisible par le jeu ; un choix en attente est renvoyé tel quel), `choix_coach_choisir(place)` donne la carte de cette place et révèle les autres |
| **Séance payante** | Retirée du jeu (demande de Maël : l'entraînement par joueur, dans le Club, suffit) ; la fonction reste sur le serveur |
| **Booster de départ** | 7 joueurs, un par poste, alignés dans l'équipe |
| **Booster gratuit** | 1 carte toutes les 30 minutes, 5 au plus en stock : 80 % Bronze, 12 % Argent, 7 % Or, 1 % Ultime ; 1 fois sur 10 une carte staff à la place d'un joueur (`staff_chance`), très rarement une légende |
| **Entraînement** | Séance payée (40 / 80 / 150 / 300 pièces selon le palier) : +50 XP à la carte. 100 / 150 / 200 / 300 XP par point |
| **Fusion** | 3 fois le même joueur au même palier → 1 au palier suivant (200 / 600 / 2 000 pièces). Les 3 moins entraînés sont pris |
| **Vente** | 10 / 40 / 150 / 600 pièces (pas une carte de l'équipe ni une carte au marché) |
| **Niveau du compte** | XP gagnée partout ; chaque niveau donne des pièces et un booster bonus, tous les 5 niveaux un booster Or ou Ultime |
| **Quêtes** | 3 par jour (et 4 de la semaine, voir plus bas), tirées parmi 10 (boosters, entraînement, matchs, défis, paris, marché…) |
| **Matchs** | Simulés sur le serveur : stats des joueurs (−5 hors poste), collectif, tactiques, hasard. Tactique « attaque:défense » (`duels`, `enclenchement`, `rapide` : `06`, `15`, `33`) ; chaque choix s'appuie sur deux stats, bonus = 2 % + 0,4 × spécialisation, entre 0 et 10 % (`tactique_bonus`, réglages `tactique_bonus_*`), sur l'attaque ou la défense |
| **Match en direct** | « À la Football Manager » : `match_commencer(type, cible, tactique, consigne, simuler)` crée le match (championnat : un match de la réserve ; défi d'un(e) ami(e) : son équipe joue avec sa tactique), gardé dans `matchs_direct` (jamais lisible par le jeu). `match_bloc` joue 5 minutes, possession par possession (forces, pierre-feuille-ciseaux des tactiques `match_contre`, consigne prudent / normal / pression, fatigue, exclusions, élan d'un temps mort, contre-attaques, 7 m) et ne renvoie que ce qui vient d'être joué ; la défense adverse se voit, son attaque se devine (d'où partent ses tirs). Tactique et consigne ne changent qu'au coup d'envoi, à la mi-temps (l'adversaire peut s'adapter) ou sur un temps mort (3 par match, 2 par période). `match_en_cours` pour reprendre ; un match oublié depuis la veille est fini tout seul (simulé). Simuler (`simuler = true`) ou `match_simuler_fin` : le reste sans adaptation, gains × `match_simule_gain` (0,95) au prorata des blocs simulés. Réglé sur des équipes de même force (`match_contre` = 0,05 : prendre le dessus compte plus que le plus gros bonus) : simuler rapporte environ 7 % de moins qu'un joueur moyen, 24 % de moins qu'un joueur qui lit bien le jeu. Les anciens appels `match_championnat` et `defier_ami` simulent. Le bonus de tactique suit la tactique jouée (`match_tactique`) et n'est montré qu'au résumé de fin (`match_resume`). L'entraîneur adverse (`match_ordi`) a 3 temps morts et un style selon le niveau (`match_ia`, `match_ia_niveau`) : imprévisible (Départemental), lent (Régional), réfléchi (National, défis entre ami(e)s ; `match_ordi_reaction`), rapide (International), légendaire (Légendes : change à chaque tranche et anticipe) |
| **Parcours** | 13 niveaux : Départemental (Promotion, Honneur, Excellence), Régional (Honneur, Excellence, Pré-nationale), National (N3, N2, N1) en poules de 8 avec de vraies équipes (`data/adversaires.json`), aller-retour sur 14 journées, points FFHB 3 / 2 / 1 ; les 2 premiers montent, les 2 derniers descendent (pas sous la Promotion). Sortir de N1 = International pour de bon : Championnat d'Europe, du monde, Jeux olympiques en élimination directe (quart, demie, finale ; tirs au but sur un nul ; éliminé = nouveau tirage). Puis les Légendes du handball (force 99, série au meilleur des 5). Gains × 1 à × 4 selon le niveau. 10 matchs par jour |
| **Jet de 7 m** | Mini-jeu : point visé (x, y) et puissance envoyés par le jeu, gardien et résultat décidés par le serveur (`tirer_7m`) : centre toujours arrêté, point idéal de puissance 80 %. 5 tirs par jour, 50 pièces par but, +100 pour 5/5 (`jet7m_*` dans `parametres`) |
| **Mini-jeux** | Arrêt réflexe (`mini_preparer` tire la zone et la durée du vol dans `mini_attente` ; le jeu montre la trajectoire dès que le ballon part ; arrêt seulement si la bonne zone est touchée avant l'arrivée du ballon ; 25 tirs par jour, 10 pièces par arrêt), contre-attaque 2 contre 1 sans gardien (`mini_preparer` : le défenseur sort sur le porteur 80 % du temps ; passe dessinée ou ballon gardé), tir en suspension 3D (barre de course et hauteur au moment du tir : élan = barre × hauteur, chacune pleine dès 95 % ; élan plein = but, sinon but avec une chance de élan²) (`mini_jouer`). 5 essais par jour, 50 pièces par réussite, +100 pour une journée parfaite (`mini_*` dans `parametres`) |
| **Séance d'équipe** | Retirée du jeu (voir Séance payante) |
| **Défis** | Seulement entre ami(e)s (`defier_ami`, ils comptent pour les quêtes « défis » et « victoires ») ; l'ancien défi contre n'importe qui (`defier`) n'est plus proposé |
| **Transferts** | Par listes : `maj_listes_transfert(veux, donne)` (7 joueurs + palier au plus chacune ; à donner = une carte libre au palier choisi), `mes_transferts()` (listes, échanges compatibles avec les listes des autres, compteurs, historique), `transferer(pseudo, donne, recoit, palier)` (vérifie les 4 lignes des listes et les cartes libres, échange les moins entraînées). Tables `listes_transfert`, `transferts_faits` (jamais lisibles par le jeu) |
| **Joueurs de la semaine** | Pour chaque équipe du club qui a des cartes (SG1, SG2, SF1, SF2), le meilleur des vrais matchs de la semaine : buts + arrêts / 2, d'après les feuilles de match de la page publique du site (`scripts/semaine.py`, appelé par l'action « site », écrit `data/semaine.json`). Pas de répétition : dans une équipe, un joueur déjà élu cette saison ne l'est plus tant que tous ceux qui ont marqué des points ne l'ont pas été ; une semaine choisie ne change plus. La synchro des matchs relit aussi ce fichier (`synchro_semaine_url`, `maj_semaine`, table `joueurs_semaine` jamais lisible par le jeu). Pendant la semaine qui suit (`semaine_actuelle`, jusqu'à 3 semaines si le site tarde) : +3 en match (`semaine_forme`, dans `force_equipe`) et booster de la semaine (`ouvrir_booster_semaine` : 400 pièces, 3 par jour, 45 / 35 / 17 / 3 %) |
| **Passe de saison** | Saisons de 4 semaines depuis `passe_debut` (2 nov. 2026) ; toute l'XP gagnée (`gagner_xp`) avance le passe (table `passe`) ; 30 paliers de 400 XP ; récompense de chaque palier (`passe_recompense`) : des pièces, un booster tous les 3, 2 boosters + 200 pièces tous les 5, un booster Or tous les 10, 2 Or + 2 000 pièces au 30e. `reclamer_passe` récupère d'un coup tous les paliers atteints |
| **Quêtes de la semaine** | 4 par semaine (lundi → dimanche), tirées parmi 9 (`quetes_semaine_catalogue` : 15 matchs, 10 victoires, 40 parties de mini-jeux, 2 défis de composition…), elles avancent avec les mêmes actions que les quêtes du jour (`progresser`) ; `reclamer_quete_semaine` |
| **Défis de composition** | On donne des cartes libres qui suivent une règle (n cartes, joueurs différents, palier minimum, tant de tel poste / équipe / genre / palier, un à chaque poste, équipes différentes, note moyenne) : elles disparaissent, la récompense arrive (pièces, boosters, boosters Or). 3 défis de la semaine et 1 du mois, tirés selon la date dans `compo_catalogue` (réglage `compo_par_semaine`), une fois chacun (`defis_faits`). `faire_defi(défi, cartes)` vérifie tout (`compo_erreur` : cartes au joueur, hors équipe, hors échange entre ami(e)s) |
| **Légendes du club** | Cartes créées dans l'outil avec la case « Légende du club » (colonne `legende`) : une seule édition (Ultime, 100 de note générale, `legende_note` = 100 ; les stats gardent la forme du joueur). Seul le booster gratuit les tire, 1 fois sur 500 (`legende_chance` = 0,002) ; publiées avec `actif = false`, elles ne sortent dans aucun autre tirage ; ni transferts ni défis. La politique de lecture de `cartes` les cache à tous sauf à l'admin ; chaque joueur reçoit les siennes dans `etat_de` (`legendes`) |
| **Pronostics** | Sur les vrais matchs du club des 7 prochains jours (`mes_pronostics`, `pronostiquer(rid, dom, ext, buteur)`, modifiable jusqu'au coup d'envoi) : score exact 5 points, bon vainqueur 2 (+1 avec le bon écart), meilleur buteur du club dans ce match 3 (`prono_points`) ; 1 point = 20 pièces (`prono_pieces_point`). Le meilleur buteur vient des feuilles du site (`scripts/semaine.py` → `buteurs` de `data/semaine.json` → table `buteurs_match`) ; `regler_pronostics` paie après chaque synchro (le score par `maj_matchs`, le buteur par `maj_semaine`). Classements de la semaine et de la saison. Table `pronostics` jamais lisible par le jeu |
| **Ligue de la semaine** | 8 divisions (Division 7 → Élite, `ligue_divisions`), groupes de 10 (`ligue_taille`) formés à la première visite de la semaine, complétés par des équipes de l'ordinateur (force selon la division, `ligue_force`) : un joueur qui arrive prend la place de la moins jouée. 5 matchs par jour (`ligue_matchs_jour`), 2 fois le même adversaire au plus ; contre un autre joueur, son équipe défend et il prend aussi ses points. Victoire 3 points, nul 1 ; 40 / 20 / 10 pièces (`ligue_pieces`). Les équipes de l'ordinateur gagnent environ 1 à 2 points par jour depuis la création du groupe (`ligue_jours_bot`), plus ceux pris contre les joueurs. Lundi (`ligue_cloturer`, à la visite suivante) : récompenses selon la place (`ligue_recompenses`), les 3 premiers montent, les 3 derniers descendent (`ligue_montee`, `ligue_descente`), bilan montré une fois. `mes_ligue`, `ligue_jouer('u:…' ou 'b:…')`, tables `ligue_*` |
| **Clubs de joueurs** | `club_creer(nom)` (3 à 24 caractères, nom unique), `club_rejoindre`, `club_quitter` (le président passe la main au plus ancien ; club vide supprimé), 20 membres au plus (`club_membres_max`). Objectif commun de la semaine : les victoires des membres (championnat, ligue, défis entre ami(e)s, comptées depuis leur arrivée) ; paliers 25 / 50 / 100 (`club_paliers`) → booster, 2 boosters, booster Or (`club_recompenses`), chaque membre réclame la sienne (`club_reclamer`). Classement des clubs et recherche (`mon_club(texte)`) |
| **Albums** | Par équipe (SF1, SF2, SG1, SG2) et par palier : une carte de chaque joueur actif de l'équipe à ce palier ou mieux → récompense une fois (`albums_recompenses` : 300 pièces, 2 boosters, booster Or, 2 Or + 2 000 pièces ; `reclamer_album(equipe, palier)`, table `albums_faits`) |
| **Capitaine et liens** | `choisir_capitaine(exemplaire)` : un joueur de l'équipe, +2 en match (`capitaine_bonus`, dans `force_equipe`). Sur le terrain, les voisins de la même équipe du club sont reliés en doré (c'est le collectif qui compte déjà) |
| **Cartes staff** | 10 cartes qui ne jouent pas (`staff_catalogue`), au format des cartes joueurs sans stats. Elles ne s'obtiennent que dans les boosters gratuit et mystère, 1 fois sur 10 (`staff_chance`, `donner_staff_hasard`, palier tiré comme un joueur ; table `staff_cartes`, un palier par exemplaire ; `acheter_staff` refuse et n'est plus accordé). Elles s'améliorent comme les joueurs : 3 identiques du même palier fusionnent vers le suivant aux mêmes coûts que les joueurs (`fusionner_staff`, `fusion_nombre`, `fusion_cout`). Une seule place dans l'équipe (`profils.staff`, `choisir_staff`, la première obtenue y va toute seule) : seul le passif de la carte placée compte, à la valeur de son meilleur exemplaire (`staff_actif`, `staff_val`). Passifs Bronze / Argent / Or / Ultime : préparateur physique +25 / 50 / 75 / 100 % d'XP à l'entraînement ; kiné, matchs de championnat rechargés 10 / 20 / 30 / 40 % plus vite ; coach des ailiers +1 / 2 / 3 / 4 aux ailiers ; manager +5 / 10 / 15 / 20 % de pièces en championnat et en ligue ; entraîneur des gardiens +1 / 2 / 3 / 4 au but ; coach de la base arrière +1 / 2 / 2 / 3 aux arrières et au demi-centre ; coach polyvalent −4 / 3 / 2 / 1 hors poste au lieu de −5 ; préparateur mental, capitaine +1 / 2 / 3 / 4 de plus ; entraîneur adjoint +1 / 2 / 3 / 4 % d'attaque ; coach défensif +1 / 2 / 3 / 4 % de défense. L'outil (bouton « Cartes staff ») met une vraie personne sur chaque carte : nom, description, une photo par palier (`admin_publier_staff`, table `staff_reglages`, lue par `staff_vue` / `catalogue_staff` et `etat_de` ; photos https seulement, nom 40 caractères, description 160) ; le passif ne se règle pas |
| **Personnalisation** | Avatar, cadre et fond du profil (`choisir_perso(type, id)`, `perso_catalogue`) : certains d'office, les autres débloqués par le niveau, le passe (10, 20, 30), les albums, la ligue (division 4, Élite), un club ou une légende. Les autres les voient dans les classements, la ligue et les clubs (`perso_public`) |
| **Classement** | `classement_poules` : pseudo et niveau de poule de chaque joueur, du plus haut au plus bas. « Voir l'équipe » : `equipe_publique(pseudo)` donne les 7 alignés d'un joueur (carte, palier, note, capitaine), sa tactique, sa carte staff et sa note d'équipe calculée comme en match ; ses légendes y sont, avec leur carte. Rien d'autre (ni pièces, ni cartes hors équipe). |
| **Ami(e)s** | Demande puis acceptation (`ajouter_ami`, `repondre_ami`, `retirer_ami`, 50 au plus). Messages (`envoyer_message`, `conversation` ; 300 caractères, 100 par jour ; lus seulement par les deux ami(e)s). Échanges directs de n'importe quelles cartes, hors équipe et marché (`proposer_echange`, `repondre_echange`, `annuler_echange`) : une proposition à la fois entre deux ami(e)s, 3 par jour, 7 jours au plus. Défi entre ami(e)s (`defier_ami`) : 30 pièces au gagnant, 5 par jour |
| **Matchs de championnat** | Une réserve : 1 match de plus toutes les 2 h, 10 au plus (`match_minutes`, `match_stock_max`) ; elle remplace la limite de 10 matchs par jour |
| **Paiement des paris** | Automatique le lundi matin : `synchro_matchs_demander` (pg_net) relit `data/matchs.json` du dépôt (réglage `synchro_matchs_url`), mis à jour depuis ffhandball.fr par l'action GitHub « resultats » ; `synchro_matchs_lire` met les matchs à jour (`maj_matchs`) et règle les paris. pg_cron : toutes les 3 h (UTC), lecture 5, 15 et 25 min après ; seuls les paris des matchs d'avant le lundi de la semaine sont payés (`regler_paris(p_avant)`), donc le lundi matin. Cotes et fiches : action GitHub « site », toutes les heures, d'après la page publique du site. Fonctions internes, jamais accordées au jeu ; chaque synchro est notée (`mouvements`, « synchro-matchs ») |
| **Paris** | 3 au plus par semaine, du lundi au dimanche (`paris_par_semaine`). 1N2 sur les vrais matchs des 14 prochains jours (SG1, SG2, SF1, SF2). Cote = 0,92 / probabilité du modèle, entre 1,05 et 12. Mise de 10 à 300, fermés au coup d'envoi |
| **Marché** | Annonce « ma carte contre telle carte du même palier » (pas d'échange entre paliers différents), 5 annonces au plus, 7 jours. La carte est réservée tant que l'annonce est ouverte ; note et XP sont gardées |

## Comment c'est construit

| Fichier | Rôle |
|---|---|
| `supabase/schema.sql` | Tables, règles d'accès et toutes les actions du serveur |
| `config.js` | Adresse du projet et clé publique (vide = jeu fermé) |
| `serveur.js` | `Compte` : connexion, actions, copie hors ligne. Charge `supabase-js` 2.118.0 depuis jsDelivr |
| `cartes.js` | Paliers, forme des joueurs, rendu des cartes (partagé avec l'outil) |
| `app.js` | Écrans : accueil, club (albums, staff), équipe, jouer (championnat, ligue, défis), social (classement, transferts, paris, pronos, clubs), ami(e)s, connexion |
| `admin.js` | Outil : cartes, photos par palier, synchronisation (Supabase, ou GitHub sans serveur) |
| `scripts/export_cartes.py` | `data/cartes.json` et `data/matchs.json` depuis `handball-pronos` |

**Aucune table n'est modifiable depuis le jeu.** Le jeu lit ce qui le concerne (ses cartes, ses quêtes, ses paris…) et passe
par des fonctions du serveur pour tout le reste : `ouvrir_depart`, `ouvrir_booster`, `fusionner`, `entrainer`, `vendre`, `aligner`,
`reclamer_quete`, `match_commencer`, `parier`, `transferer`… (64 fonctions, la liste `grant execute` en bas de `schema.sql`).
Chacune vérifie tout et fait l'action d'un seul bloc. Les fonctions internes (tirage, XP, moteur de match) ne sont pas appelables.

### Audit du 12 novembre 2026

- **Droits** : la liste accordée = exactement ce que `serveur.js` et `admin.js` appellent. 13 fonctions que le jeu n'appelait plus ont
  été retirées (`ouvrir_booster_poste`, `seance_equipe`, `seance_payante`, `defier`, `adversaires`, `classement`, `match_championnat`,
  `defier_ami`, `marche`, `publier_annonce`, `retirer_annonce`, `accepter_annonce`, `chercher_joueurs`) : elles donnaient encore, à qui
  appelait le serveur sans passer par le jeu, ce que Maël avait retiré. Elles restent définies (tests du moteur), sans droit.
- **Corrigé** : `club_reclamer` acceptait un palier 0 ou négatif (un index négatif relit un tableau jsonb depuis la fin : chaque
  récompense de club s'encaissait deux fois) ; une légende apparaissait dans le club montré à un(e) ami(e) et pouvait s'échanger ;
  supprimer son compte laissait son club sans président(e), ou vide dans le classement (`club_partir`).
- **Accès simultanés** : chaque action commence par `moi()`, qui verrouille le profil du joueur ; les échanges verrouillent les
  deux profils. Vérifié sur un vrai Postgres (12 appels au même instant : jamais de carte, de pièce ou de récompense en double).
- **Restent, par choix de conception** (à décider par Maël) : les comptes se créent sans confirmation d'e-mail ni captcha (réglage
  Supabase), donc plusieurs comptes peuvent nourrir un compte principal par les échanges entre ami(e)s (3 propositions par jour et
  par compte, tous paliers) ; les mini-jeux font confiance au jeu (un script y gagne le maximum du jour, environ 1 400 pièces contre
  700 à 1 000 pour un bon joueur) ; rejoindre un club le dimanche donne ses récompenses sans y avoir contribué.

### Tests dans le dépôt (`tests/`, voir `tests/LISEZMOI.md`)

`node tests/test_droits.js` (droits et corrections de l'audit) · `node tests/test_parite.js` (règles écrites deux fois, dans le jeu
et sur le serveur : mêmes résultats sur des centaines d'équipes au hasard) · `node tests/test_concurrence.js` (accès simultanés et
relance du schéma, sur un vrai Postgres) · `node tests/economie.js` (simulation de l'économie d'après les réglages).

### Ce qui a été vérifié

Le schéma a été testé sur une base Postgres locale qui imite Supabase (164 vérifications : règles, limites, tentatives de triche,
équilibre du moteur de match sur 2 000 matchs par écart de niveau, chances des boosters sur 3 000 tirages, paris réglés, transferts),
puis le jeu dans un navigateur de téléphone contre ce faux serveur (76 vérifications sur les trois parties).
**Pas encore testé sur un vrai projet Supabase** : à vérifier lors de la mise en route.
