# Médoc Hand Cards

Jeu mobile de cartes façon « Ultimate Team » avec les joueurs et joueuses du **Médoc Handball** (SG1, SG2, SF1, SF2, saison 2026-2027).
Chaque carte a un **poste de jeu** et **6 stats** propres au jeu (Tir, Passes, Défense, Mental, Physique, Vitesse ; Réflexes, Placement, Relance, Mental, Physique, Vitesse pour les gardien·ne·s), réglables avec l'outil de gestion. Les valeurs de départ viennent des stats de **medochandballstats.com**.

## Ce qu'on peut faire

- **Packs** : Bronze, Argent, Or, Élite, avec ouverture animée et révélation « walkout » (équipe → poste → note) pour les cartes 85+.
- **Club** : l'album des 55 cartes, filtres par équipe, vente des doublons.
- **Mon 7** : aligner 6 joueurs de champ + 1 gardien(ne) sur le demi-terrain (AG, ARG, DC, ARD, AD, PIV, GB). Un joueur hors de son poste perd 5 points ; bonus collectif quand on aligne des coéquipier(e)s. L'alignement automatique cherche la meilleure répartition.
- Pièces, bonus quotidien de 1 500 pièces, premier pack Or offert.
- **Échanges** (avec le serveur) : chercher un joueur par son pseudo, lui proposer jusqu'à 5 cartes contre 5 des siennes, accepter ou refuser les propositions reçues.
- **Comptes** (avec le serveur) : e-mail + mot de passe ou Google, pseudo, suppression du compte depuis le jeu. Voir [`docs/SERVEUR.md`](docs/SERVEUR.md).
- Installable sur téléphone (PWA : « Ajouter à l'écran d'accueil »). Sans serveur, la progression est sauvegardée sur le téléphone ; avec, elle est sur le serveur et le club reste consultable hors ligne.

## Raretés

| Rareté | Note | Cartes |
|---|---|---|
| Élite (holographique) | 85+ | 8 |
| Or | 72 à 84 | 14 |
| Argent | 60 à 71 | 21 |
| Bronze | moins de 60 | 12 |

La rareté dépend de la note générale, calculée à partir des 6 stats avec des poids selon le poste (un ailier compte surtout la Vitesse et le Tir, un demi-centre les Passes, un pivot le Physique…). La répartition ci-dessus est celle de départ : elle bouge quand on modifie les stats.

Les seuils et les poids se règlent dans `cartes.js` (`SEUILS`, `POIDS`), les prix et chances des packs, les ventes et le bonus dans `compte.js` (`PACKS`, `VENTE`, `REGLES`) et, avec le serveur, dans les tables `packs` et `regles` de Supabase. Le malus hors poste est dans `app.js` (`MALUS_HORS_POSTE`).

## Gérer les cartes (outil)

`admin.html` (accès discret depuis le jeu : toucher 5 fois le logo en haut à gauche) permet, carte par carte :

- de choisir le **poste de jeu** ;
- de régler les **6 stats** (la note et la rareté suivent), ou de **forcer la note** ;
- d'ajouter une **photo**, recadrée en carré (zoom, position). Uniquement avec l'accord de la personne, et de ses parents si elle est mineure : le dépôt et le site sont publics.

Les modifications vont d'abord dans un **brouillon** gardé dans le navigateur : le jeu ouvert dans ce même navigateur les montre déjà en aperçu (seulement une fois l'outil connecté à GitHub : les joueurs ne voient jamais d'aperçu). **Publier** les enregistre ensuite dans le dépôt en un seul commit (`data/perso.json` + `assets/photos/`), et le jeu en ligne est à jour 1 à 2 minutes plus tard.

Pour publier, il faut une fois un jeton GitHub, créé sur <https://github.com/settings/personal-access-tokens/new> :
- Repository access : *Only select repositories* → ce dépôt ;
- Permissions → Repository → *Contents : Read and write*.

Le jeton se colle dans l'outil (bouton « GitHub ») et reste dans ce navigateur. Une carte jamais réglée garde des stats par défaut, recalculées à chaque export depuis le site (sa note reste alors celle du site).

## Mettre les cartes à jour

Les cartes sont dans `data/cartes.json`. Pour les recalculer avec les dernières feuilles de match :

```bash
python scripts/export_cartes.py ../handball-pronos/medoc/pipeline/teams
```

Le script lit les `site_data.json` du dépôt `handball-pronos`, garde les joueurs ayant joué au moins un match cette saison (une seule carte par personne, dans l'équipe où elle a le plus joué) et n'exporte que le nom, l'équipe et les notes : aucun numéro de licence. Il ne touche pas à `data/perso.json` : les réglages faits avec l'outil sont conservés.

## Tester en local

```bash
python -m http.server 8000
# puis ouvrir http://localhost:8000 (le jeu) ou http://localhost:8000/admin.html (l'outil)
```

Le mode hors ligne (service worker) est désactivé en local pour que le cache ne masque pas les modifications. Pour le tester, ouvrir `http://localhost:8000/?sw`, puis couper le réseau dans les outils du navigateur.

## Publier

Settings → Pages → Source « Deploy from a branch », branche `main`, dossier `/ (root)`.
Le jeu est alors en ligne sur `https://maelbenharoun.github.io/medoc-handball-cards/` (ou sur un sous-domaine de medochandballstats.com).

## Fichiers

```
index.html            le jeu (en-tête, vue, onglets)
style.css             design, cartes, animations
cartes.js             cartes : postes, 6 stats, notes, raretés, rendu (partagé jeu + outil)
config.js             adresse et clé publique du serveur Supabase (vide = sans serveur)
compte.js             compte sur le téléphone : règles par défaut, tirage, sauvegarde locale
serveur.js            compte en ligne (Supabase) : connexion, actions, échanges
confidentialite.html  données personnelles
app.js                le jeu : affichage des vues et de l'ouverture des packs
admin.html/.js/.css   l'outil de gestion des cartes
sw.js                 cache hors ligne
manifest.webmanifest  installation sur téléphone
data/cartes.json      les cartes du site (généré par le script)
data/perso.json       les réglages du jeu (écrit par l'outil)
scripts/export_cartes.py
docs/SERVEUR.md       mise en route du serveur Supabase
supabase/schema.sql   base de données du serveur (à coller dans Supabase)
assets/               logo du club, icônes, photos/ (ajoutées par l'outil)
```

## Idées pour la suite

- Cartes spéciales « Équipe de la semaine » après chaque week-end (meilleurs buteurs de la journée).
- Packs par équipe (Pack SF, Pack SG).
- Défis : « Aligne un 7 100 % SF2 », « Note d'équipe 80+ » → récompenses en packs.
- Mini-match contre un 7 adverse simulé avec le modèle de pronostic.
