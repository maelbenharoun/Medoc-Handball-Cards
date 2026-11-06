# Médoc Hand Cards

Jeu mobile de cartes à collectionner avec les joueurs et joueuses du **Médoc Handball** (SG1, SG2, SF1, SF2, saison 2026-2027).
Tout se passe en ligne, sur un serveur **Supabase** qui applique les règles : comptes, cartes, matchs, paris et marché.
Mise en route du serveur et liste complète des règles : [`docs/SERVEUR.md`](docs/SERVEUR.md).

## Ce qu'on peut faire

- **Intro du jour** : à la première ouverture de la journée, le logo du club au milieu et 10 cartes autour (`INTRO_CARTES` dans `app.js`) ;
  toucher le logo fait s'envoler les cartes et ouvre le jeu (ou la connexion). `?intro` dans l'adresse pour la revoir.
- **Cartes à 4 paliers**, avec le même pouvoir pour tous les joueurs : Bronze 50 → 59, Argent 60 → 74, Or 75 → 89, Ultime 90 → 99.
  Une carte arrive au bas de son palier ; chaque palier a sa photo. Les 6 stats (Tir, Passes, Défense, Mental, Physique, Vitesse ;
  Réflexes, Placement, Relance… pour les gardien·ne·s) gardent la forme du vrai joueur.
- **Ouverture des boosters** : le booster flotte ; au toucher, une découpe lumineuse court le long du haut, le rabat est arraché,
  la lumière prend la couleur du meilleur palier et la carte sort du sachet face cachée (indices équipe → poste → palier pour l'Or et l'Ultime),
  on la touche pour la retourner, puis « Envoyer au club ». « Tout révéler » pour aller vite.
- **Boosters** : un booster de départ de 7 joueurs (un par poste), puis un booster gratuit d'un joueur toutes les 30 minutes
  (5 au plus en stock : 80 % Bronze, 12 % Argent, 7 % Or, 1 % Ultime), et des boosters gagnés en montant de niveau.
- **Fiche de chaque joueur** (toucher une carte) : sa saison et ses 5 stats rigolotes les plus marquantes (celles des fiches de medochandballstats.com).
  Tout se modifie dans l'outil.
- **Club** : entraîner ses cartes (de 50 à 59, de 60 à 74…), **fusionner** 3 fois le même joueur au même palier pour passer au palier suivant, vendre.
- **Mon 7** : 6 joueurs de champ + 1 gardien(ne). Hors de son poste, un joueur perd 5 points ; bonus collectif entre coéquipier(e)s.
- **Jouer** : un parcours contre l'ordinateur, du Départemental au National en poules de 8 avec classement et de vraies équipes
  tirées des feuilles de match (les 2 premiers montent, les 2 derniers descendent), puis l'International en tournois à élimination
  directe (Europe, Monde, Jeux olympiques : plus de descente) et enfin les Légendes du handball. Séances d'entraînement d'équipe,
  défis contre le 7 des autres joueurs avec trophées et classement. Matchs simulés selon les notes, les postes et la tactique.
- **Jet de 7 mètres** (onglet Jouer) : une barre de visée va et vient le long du but, puis une jauge de puissance ; le serveur fait plonger le gardien.
  5 tirs par jour, 15 pièces par but, 25 de plus pour un 5 sur 5 (100 pièces par jour au plus).
- **Niveau et quêtes** : de l'XP partout, des récompenses à chaque niveau, 3 quêtes par jour.
- **Paris** sur les vrais matchs des poules SG et SF, avec les cotes du modèle de pronostic de medochandballstats.com (pièces du jeu seulement).
- **Marché des transferts** : une carte contre une carte avec les autres joueurs.
- **Comptes** : e-mail + mot de passe ou Google, pseudo, suppression du compte depuis le jeu. Installable sur téléphone (PWA) ; hors ligne, le club reste consultable.

## Gérer les cartes (outil)

`admin.html` (accès discret depuis le jeu : toucher 5 fois le logo en haut à gauche), avec le compte administrateur, permet carte par carte :

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
app.js                les écrans : accueil, club, Mon 7, jouer, marché, paris, connexion
admin.html/.js/.css   l'outil de gestion des cartes
confidentialite.html  données personnelles
sw.js                 cache hors ligne
manifest.webmanifest  installation sur téléphone
data/cartes.json      les cartes du site (généré par le script)
data/matchs.json      les matchs des poules (généré par le script)
data/adversaires.json les équipes du parcours (généré par le script)
data/perso.json       les réglages des cartes (outil, mode sans serveur)
scripts/export_cartes.py
scripts/fiches.py     la fiche de chaque joueur (stats du site, stats rigolotes)
supabase/schema.sql   base de données et règles du serveur (à coller dans Supabase)
docs/SERVEUR.md       mise en route du serveur et règles du jeu
assets/               logo du club, icônes, photos/
```

## Idées pour la suite

- Cartes spéciales « Équipe de la semaine » après chaque week-end (meilleurs buteurs de la journée).
- Boosters par équipe (SF, SG) en récompense de quêtes.
- Défis spéciaux : « Aligne un 7 100 % SF2 », « Note d'équipe 80+ ».
