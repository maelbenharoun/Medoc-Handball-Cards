# Médoc Hand Cards

Jeu mobile de cartes à collectionner avec les joueurs et joueuses du **Médoc Handball** (SG1, SG2, SF1, SF2, saison 2026-2027).
Tout se passe en ligne, sur un serveur **Supabase** qui applique les règles : comptes, cartes, matchs, paris et marché.
Mise en route du serveur et liste complète des règles : [`docs/SERVEUR.md`](docs/SERVEUR.md).

## Ce qu'on peut faire

- **Intro du jour** : à la première ouverture de la journée, le logo du club au milieu et 10 cartes autour (`INTRO_CARTES` dans `app.js`) ;
  toucher le logo fait s'envoler les cartes et ouvre le jeu (ou la connexion). `?intro` dans l'adresse pour la revoir.
- **Cartes à 4 paliers**, avec le même pouvoir pour tous les joueurs : Bronze 50 → 59, Argent 60 → 74, Or 75 → 89, Ultime 90 → 99.
  Une carte arrive au bas de son palier ; chaque palier a sa photo. Les 6 stats (Tir, Passes, Défense, Mental, Physique, Vitesse ;
  Réflexes, Placement, Relance… pour les gardien·ne·s) gardent la forme du vrai joueur. À note égale, tous les joueurs ont le même
  total de stats : 240 en moyenne à 50 (40 par stat), 480 à 99 (80 par stat) ; sur tout le catalogue, chaque stat a la même moyenne.
- **Montée de palier** (fusion) : les 3 cartes se rejoignent dans un éclair, la carte se retourne au nouveau palier et sa note
  et ses stats montent sous nos yeux (`?demo=montee`).
- **Accueil** : le booster gratuit en haut, puis un carrousel des boosters par poste (le choisi et ses deux voisins), chacun avec un joueur
  du club en photo (`BOOSTERS_POSTE` dans `app.js`). Sachets métallisés aux bords dentelés et reflets holographiques, sur un fond animé
  (rayons, halos, lignes du terrain, ballons). Les quêtes sont dans l'icône en haut à droite (pastille quand une récompense attend).
- **Ouverture des boosters** : le booster flotte ; au toucher, une découpe lumineuse court le long du haut, le rabat est arraché,
  la lumière prend la couleur du meilleur palier et la carte sort du sachet face cachée (indices équipe → poste → palier pour l'Or et l'Ultime),
  on la touche pour la retourner, puis « Envoyer au club ». « Tout révéler » pour aller vite.
- **Boosters** : un booster de départ de 7 joueurs (un par poste), puis un booster gratuit d'un joueur toutes les 30 minutes
  (5 au plus en stock : 80 % Bronze, 12 % Argent, 7 % Or, 1 % Ultime), et des boosters gagnés en montant de niveau.
- **Fiche de chaque joueur** (toucher une carte) : sa saison et ses 5 stats rigolotes les plus marquantes (celles des fiches de medochandballstats.com).
  Tout se modifie dans l'outil.
- **Club** : ta collection, entraîner ses cartes (de 50 à 59, de 60 à 74…), **fusionner** 3 fois le même joueur au même palier pour passer au palier suivant, vendre.
- **Équipe** : 6 joueurs de champ + 1 gardien(ne), placés en défense devant leur but selon le dispositif choisi (0-6, 1-5, 3-3).
  Hors de son poste, un joueur perd 5 points ; bonus collectif entre coéquipier(e)s. **Tactiques** : une attaque (Duels : tir et physique ;
  Enclenchement : mental et passes ; Jeu rapide : défense et vitesse) et un dispositif (0-6 : tir et défense ; 1-5 : mental et physique ;
  3-3 : passes et vitesse). Chacun donne un bonus selon les moyennes de stats de l'équipe : 2 % pour une équipe moyenne, jusqu'à 10 %
  si elle est spécialisée, 0 % si elle est à l'opposé.
- **Jouer** : deux portes. **Championnat** : un parcours contre l'ordinateur, du Départemental au National en poules de 8 avec classement et de vraies équipes
  tirées des feuilles de match (4 équipes en Promotion, une de plus à chaque niveau jusqu'à 12 en Nationale 1 ; les 2 premiers montent, le dernier descend, les 2 derniers dans les poules de 6 et plus), puis l'International en tournois à élimination
  directe (Europe, Monde, Jeux olympiques : plus de descente) et enfin les Légendes du handball. Les matchs se rechargent : 1 toutes les 2 h, 10 en réserve au plus. Matchs simulés selon les notes,
  les postes et la tactique. Pour entraîner un joueur : sa carte, dans le Club ; les défis se font entre ami(e)s.
- **Gagner des pièces** (Jouer) : 4 grandes tuiles animées, une par mini-jeu, avec un **tuto rapide** à la première partie
  de chaque jeu (le « ? » de la tuile le remontre). Le **jet de 7 mètres** (en 3D comme les autres mini-jeux) : un viseur se promène sur tout le but et autour, puis une jauge de puissance avec un point idéal (80 %) :
  en dessous le tir est plus lent et le gardien a le temps, au-dessus il part de travers. Au centre, toujours arrêté ; dans les angles, ça rentre.
  5 tirs par jour, 50 pièces par but, 100 de bonus pour un 5 sur 5.
- **Mini-jeux en vraie 3D** (`jeux3d.js`, three.js chargé seulement à l'ouverture) : l'arrêt réflexe (caméra derrière ton but,
  trajectoire du ballon montrée dès qu'il part, toucher la bonne zone ; parades de handball ; 5 séries de 5 tirs, 10 pièces par arrêt),
  la contre-attaque en 2 contre 1 sans gardien (dessiner la passe dans la course du partenaire, ou garder le ballon si le défenseur,
  qui sort sur le porteur 8 fois sur 10, part sur lui), le tir en suspension (appuis rapides pour remplir la barre de course, qui se bloque puis
  s'efface avant le saut ; en l'air, toucher au bon moment : barre pleine et tir au sommet du saut = but à coup sûr). Personnages : avatar libre Microsoft Rocketbox (MIT, `modeles/`), maillot de Médoc
  repeint d'après les photos du club, adversaires en bleu, gardiens en jogging (`scripts/modeles3d/`).
  5 essais par jour, 50 pièces par réussite, 100 de bonus pour une journée parfaite.
  Démos sans pièces : `?demo=7m`, `?demo=gardien`, `?demo=contre`, `?demo=suspension`.
- **Niveau et quêtes** : de l'XP partout, des récompenses à chaque niveau, 3 quêtes par jour.
- **Social** : le **classement** (niveau de poule de chaque joueur), les **transferts** (une carte contre une carte du même palier),
  les **paris** sur les vrais matchs des poules SG et SF, avec les cotes du modèle de pronostic de medochandballstats.com (pièces du jeu seulement).
  Chaque match a sa **fiche** (« Voir la fiche du match ») : le pronostic et le face-à-face en chiffres du site.
  3 paris au plus par semaine. Les matchs sont rangés par semaine ; les paris gagnants sont **payés automatiquement le lundi matin** (voir plus bas).
- **Musique et bruitages** (`sons.js`) : un thème original et tous les bruitages (boosters, révélations par palier, fusion,
  sifflet, tirs, filet, poteau, foule, pièces…) sont synthétisés dans le navigateur (Web Audio) : aucun fichier son.
  Musique et bruitages se coupent séparément dans la fenêtre du compte.
- **Ami(e)s** (la bulle en bas à droite, partout sauf pendant les mini-jeux) : ajouter un pseudo, puis pour chaque ami(e) : **messages**
  (pastille sur sa bulle), **échange** de n'importe quelles cartes (une proposition à la fois entre deux ami(e)s, 3 par jour),
  **défi** entre vos deux équipes (30 pièces au gagnant, 5 par jour).
- **Comptes** : e-mail + mot de passe ou Google, pseudo, suppression du compte depuis le jeu. Installable sur téléphone (PWA) ; hors ligne, le club reste consultable.

## Gérer les cartes (outil)

`admin.html` (accès discret depuis le jeu, seulement connecté avec le compte admin : toucher 5 fois le logo en haut à gauche), avec le compte administrateur, permet carte par carte :

- de choisir le **poste de jeu** (le booster de départ en tire un par poste) ;
- de régler la **forme du joueur** avec les 6 stats ;
- de modifier **toute la fiche du joueur** : présentation, titres, intitulés, valeurs et phrases, lignes ou sections en plus, ou masquées.
  Une ligne non modifiée suit les stats du site à chaque mise à jour ;
- d'ajouter **une photo par palier**, recadrée en carré. Uniquement avec l'accord de la personne, et de ses parents si elle est mineure : le jeu est public.

Les modifications vont d'abord dans un **brouillon** (le jeu ouvert dans le même navigateur les montre en aperçu), puis **Publier** les envoie au serveur.
**Synchroniser avec le site** envoie toutes les cartes et les matchs, et règle les paris des matchs joués.
Sans serveur configuré, l'outil publie encore dans le dépôt GitHub (`data/perso.json` + `assets/photos/`) avec un jeton.

## Mettre les cartes et les matchs à jour

```bash
python scripts/export_cartes.py ../handball-pronos/medoc/pipeline/teams
```

Le script lit les `site_data.json` du dépôt `handball-pronos` et écrit :
- `data/cartes.json` : les joueurs ayant joué au moins un match cette saison (une carte par personne, dans l'équipe où elle a le plus joué),
  avec seulement le nom, l'équipe, les stats et le numéro de maillot le plus porté cette saison (lu dans les feuilles de match
  `fdm.json`, numéro et nom seulement) : aucun numéro de licence. Un numéro réglé dans l'outil passe avant.
  Chaque carte a aussi sa **fiche** (`scripts/fiches.py`, d'après `joueurs.json` du site) : stats sportives seulement,
  ni présence, ni horaires, ni trajets ;
- `data/matchs.json` : le calendrier et les résultats des poules SG1, SG2, SF1 et SF2, avec les probabilités du modèle ;
- `data/adversaires.json` : les vraies équipes de chaque niveau du parcours (noms de clubs seulement), tirées des poules +16 de Gironde
  collectées dans `handball-pronos` (Promotion → Pré-régionale) et des poules suivies par le site (Régional, National).

Il ne touche pas à `data/perso.json`. Ensuite : pousser, puis **Synchroniser avec le site** dans l'outil.

La fiche des matchs à parier (5 semaines à venir) se met à jour à part, sans toucher aux cartes :

```bash
python scripts/export_face.py ../handball-pronos/medoc/pipeline/teams
```

Il écrit `data/face.json` : statistiques d'équipes seulement (classement, niveau estimé, buts, forme, bilan), aucun nom de joueur.

### Paiement automatique des paris (lundi matin)

Rien à faire : l'action GitHub **resultats** (`.github/workflows/resultats.yml`, lundi et jeudi à 3 h 17 UTC) lit les scores et
les horaires des 4 poules sur ffhandball.fr (`scripts/resultats_ffhb.py`) et met à jour `data/matchs.json`. Le serveur relit ce
fichier à 5 h et 7 h UTC (pg_cron et pg_net, fin de `supabase/schema.sql`), met les matchs à jour et paie les paris gagnants.
Les probabilités des matchs à venir restent celles de `scripts/export_cartes.py` (à relancer de temps en temps).
Pour lancer l'action à la main : onglet Actions du dépôt → resultats → Run workflow.

## Tester en local

```bash
python -m http.server 8000
# puis ouvrir http://localhost:8000 (le jeu) ou http://localhost:8000/admin.html (l'outil)
```

Sans `config.js` rempli, le jeu affiche « Le jeu ouvre bientôt ». Le mode hors ligne (service worker) est désactivé en local ;
pour le tester, ouvrir `http://localhost:8000/?sw`.

## Fichiers

```
index.html            le jeu (en-tête, vue, onglets)
style.css             design, cartes, animations
config.js             adresse et clé publique du serveur Supabase (vide = jeu fermé)
cartes.js             cartes : paliers, postes, forme des joueurs, rendu (partagé jeu + outil)
serveur.js            le compte du joueur sur le serveur : connexion, actions
app.js                les écrans : accueil, club, équipe, jouer, social, ami(e)s, connexion
admin.html/.js/.css   l'outil de gestion des cartes
confidentialite.html  données personnelles
sw.js                 cache hors ligne
manifest.webmanifest  installation sur téléphone
data/cartes.json      les cartes du site (généré par le script)
data/matchs.json      les matchs des poules (généré par le script)
data/face.json        la fiche des matchs à parier (scripts/export_face.py)
data/adversaires.json les équipes du parcours (généré par le script)
data/perso.json       les réglages des cartes (outil, mode sans serveur)
scripts/export_cartes.py
scripts/fiches.py     la fiche de chaque joueur (stats du site, stats rigolotes)
scripts/export_face.py la fiche des matchs à parier (face-à-face du site)
scripts/resultats_ffhb.py les scores des matchs à parier (action GitHub « resultats »)
sons.js               musique et bruitages (synthétisés, sans fichier)
supabase/schema.sql   base de données et règles du serveur (à coller dans Supabase)
docs/SERVEUR.md       mise en route du serveur et règles du jeu
assets/               logo du club, icônes, photos/
```

## Idées pour la suite

- Cartes spéciales « Équipe de la semaine » après chaque week-end (meilleurs buteurs de la journée).
- Boosters par équipe (SF, SG) en récompense de quêtes.
- Défis spéciaux : « Aligne un 7 100 % SF2 », « Note d'équipe 80+ ».
