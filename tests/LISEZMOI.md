# Tests de Médoc Hand Cards

Rien de ce dossier n'est chargé par le jeu : ce sont les vérifications à lancer avant de mettre à jour la base ou de pousser sur `main`.

## Installer (une fois)

```bash
cd tests && npm install
```

Playwright (le navigateur des tests) doit être installé à part ; dans les sessions Claude il l'est déjà.

## Les tests

| Commande | Ce qu'elle vérifie | Durée |
|---|---|---|
| `node tests/test_droits.js` | Le jeu ne peut appeler que les fonctions dont il se sert : la liste `grant execute` de `schema.sql` est exactement celle des appels de `serveur.js` et d'`admin.js` ; rien pour un visiteur ; aucune table modifiable ; corrections de l'audit (récompenses de club, légendes, suppression de compte) | 20 s |
| `node tests/test_parite.js` | Les règles écrites deux fois (dans le jeu pour l'affichage, sur le serveur pour le vrai calcul) donnent les mêmes résultats : paliers, stats à chaque note, note au poste, collectif, note d'équipe, moyennes, bonus des tactiques, défis de composition. 300 équipes au hasard (`PARITE_N=1000` pour plus, `PARITE_GRAINE=…` pour rejouer un échec) | 1 min |
| `node tests/test_concurrence.js` | 12 appels au même instant ne créent jamais une carte, des pièces ou une récompense en double ; le schéma se relance sur un vrai Postgres qui contient déjà des données | 15 s |
| `node tests/test_boosters_lot.js` | Boosters par 10 : la règle du serveur (prix, 10 cartes de la bonne équipe, staff, jamais de légende, réglage borné) et la scène dans le navigateur à 390 et 320 px (éventail, 10 cartes à retourner, vue en grand, bouton retour, mode « moins d'animations ») | 1 min |
| `node tests/test_voir_equipe.js` | « Voir l'équipe » du classement : ce que renvoie `equipe_publique` (note = celle du match, rien de privé, légendes visibles avec leur carte, équipe incomplète, staff), puis la fenêtre à 390 px | 30 s |
| `node tests/test_fusion.js` | Après une fusion, retour sur la fiche du joueur (avec son retour d'origine), fusions d'affilée, historique propre pour le bouton retour du téléphone | 30 s |
| `node tests/test_match_direct.js` | Match en direct : changement de tactique libre à chaque tranche, temps mort qui dévoile la vraie tactique adverse (limites : 3 par match, 2 par période, pas à la mi-temps), l'entraîneur adverse qui change sans temps mort, puis un match dans le navigateur à 390 px (panneau Tactique, temps mort, mi-temps obligatoire avec bilan) | 1 min |
| `node tests/test_entrainement.js` | S'entraîner aux mini-jeux : une série d'arrêt réflexe à l'entraînement ne coûte aucun essai ni ne rapporte de pièce ; « Jouer pour de vrai » enchaîne et compte (WebGL logiciel, 390 px) | 1 min |
| `node tests/economie.js` | Pas un test : la simulation de l'économie (pièces par jour, jours pour les grands objectifs, selon le rythme de jeu) | 1 min |

`test_concurrence.js` a besoin d'un vrai Postgres (PGlite n'a qu'une connexion) :

```bash
PGTEST_URL=postgres://utilisateur:motdepasse@127.0.0.1:5432/postgres node tests/test_concurrence.js
```

Le rôle doit pouvoir créer une base ; la base `mhc_concurrence` est recréée à chaque lancement. Sans `PGTEST_URL`, le test est sauté.

## Essayer un réglage sans toucher au serveur

```bash
ECO_PROFIL=Régulier ECO_REGLAGES='{"booster_equipe_prix": 300}' node tests/economie.js
```

Les hypothèses du modèle (rythme de jeu, adresse aux mini-jeux, taux de victoire) sont en haut de `economie.js`. C'est un modèle, pas une mesure : il sert à comparer deux réglages, pas à prédire un jour précis.

## Le harnais

- `base.js` : une base Postgres dans Node (PGlite) avec ce qu'un projet Supabase fournit (rôles `anon` et `authenticated`, `auth.uid()`, stockage), puis `supabase/schema.sql`. `rpc()` appelle une fonction comme le ferait un joueur connecté.
- `fauxsupabase.js` : un faux serveur Supabase pour Playwright (connexion, fonctions, tables, photos). Les signatures des fonctions sont lues dans la base : rien à tenir à jour à la main. Il remplace `config.js` quel que soit le port et coupe tout appel au vrai Supabase (un test sur un port non prévu avait pris la vraie configuration).

## Ce qui manque encore

Une cinquantaine de tests plus anciens (boosters, matchs en direct, mini-jeux, outil admin…) n'existent que dans le dossier temporaire des sessions Claude. Ils utilisent déjà ce harnais ; il reste à les copier ici et à les faire lancer par une action GitHub.
