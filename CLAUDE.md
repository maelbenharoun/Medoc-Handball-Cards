# Médoc Hand Cards — consignes pour Claude

- Répondre et commenter en français.
- Site statique sans build : HTML/CSS/JS vanilla, aucune dépendance. Ne pas ajouter de framework sans le demander.
- Maël préfère des modifications ciblées sur ses fichiers plutôt qu'une réécriture complète.
- Les cartes (`data/cartes.json`) sont générées par `scripts/export_cartes.py` depuis le dépôt privé `maelbenharoun/handball-pronos` (`medoc/pipeline/teams/<équipe>/site_data.json`). La formule des notes est un portage de la fonction `FUT` de `medoc/pipeline/template2.html.txt` : si elle change sur le site, la reporter ici.
- Ne jamais exporter de numéro de licence ni de donnée personnelle autre que nom, équipe et statistiques sportives.
- Sauvegarde du joueur : `localStorage`, clé `mhc-v1`. Changer le format = incrémenter la version et prévoir une migration.
- Après une modification des fichiers servis, changer `VERSION` dans `sw.js` pour que les téléphones récupèrent la nouvelle version.
- Tester sur une largeur de téléphone (390 px) avant de pousser.
