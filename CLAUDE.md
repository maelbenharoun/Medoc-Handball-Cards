# Médoc Hand Cards — consignes pour Claude

- Répondre et commenter en français.
- Site statique sans build : HTML/CSS/JS vanilla. Ne pas ajouter de framework ni de dépendance sans le demander.
- Maël préfère des modifications ciblées sur ses fichiers plutôt qu'une réécriture complète.
- Les cartes du site (`data/cartes.json`) sont générées par `scripts/export_cartes.py` depuis le dépôt privé `maelbenharoun/handball-pronos` (`medoc/pipeline/teams/<équipe>/site_data.json`). La formule des notes du site est un portage de la fonction `FUT` de `medoc/pipeline/template2.html.txt` : si elle change sur le site, la reporter ici. Dans le jeu, elle ne sert plus qu'aux stats par défaut.
- Les réglages propres au jeu (poste, 6 stats, note forcée, photo) sont dans `data/perso.json`, écrit par l'outil `admin.html`. Ne jamais l'écraser ni le régénérer depuis un script. La logique des cartes (poids par poste, raretés, rendu) est dans `cartes.js`, partagé entre le jeu et l'outil.
- Ne jamais exporter de numéro de licence ni de donnée personnelle autre que nom, équipe et statistiques sportives. Seule exception : les photos ajoutées par Maël avec l'outil, avec l'accord de la personne (de ses parents si elle est mineure). Ne jamais en ajouter d'autre façon.
- Sauvegarde du joueur : `localStorage`, clé `mhc-v1`. Changer le format = incrémenter la version et prévoir une migration.
- Toute modification de la partie (pièces, cartes, Mon 7, échanges) passe par une action de `Compte`, qui renvoie une promesse. `app.js` ne fait que lire `Compte.etat`. `Compte` vaut `CompteServeur` (`serveur.js`, Supabase) si `config.js` est rempli, sinon `CompteLocal` (`compte.js`). Les deux doivent garder la même interface.
- Avec le serveur, c'est `supabase/schema.sql` qui fait foi pour les règles : une règle changée dans `compte.js` (tirage, prix, ventes) doit l'être aussi dans le SQL. Le fichier doit rester relançable sans perte de données (`create … if not exists`, `create or replace`, aucun `drop table`). Le jeu ne doit jamais pouvoir écrire directement dans une table : seulement via les fonctions accordées en bas du fichier.
- `config.js` ne contient que l'adresse du projet et la clé publique (anon/publishable). Jamais la clé `service_role`/`secret`.
- Seule dépendance autorisée : `supabase-js` (version fixée dans `serveur.js`, chargée depuis jsDelivr en mode serveur).
- Après une modification des fichiers servis, changer `VERSION` dans `sw.js` pour que les téléphones récupèrent la nouvelle version.
- Tester sur une largeur de téléphone (390 px) avant de pousser.
