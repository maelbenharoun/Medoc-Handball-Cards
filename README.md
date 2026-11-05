# Médoc Hand Cards

Jeu mobile de cartes façon « Ultimate Team » avec les joueurs et joueuses du **Médoc Handball** (SG1, SG2, SF1, SF2, saison 2026-2027).
Les notes des cartes viennent de **medochandballstats.com** (même formule que la carte joueur du site).

## Ce qu'on peut faire

- **Packs** : Bronze, Argent, Or, Élite, avec ouverture animée et révélation « walkout » (équipe → poste → note) pour les cartes 85+.
- **Club** : l'album des 55 cartes, filtres par équipe, vente des doublons.
- **Mon 7** : aligner 6 joueurs de champ + 1 gardien(ne) sur le demi-terrain ; note d'équipe + bonus collectif quand on aligne des coéquipier(e)s.
- Pièces, bonus quotidien de 1 500 pièces, premier pack Or offert.
- Installable sur téléphone (PWA : « Ajouter à l'écran d'accueil ») et jouable hors ligne. La progression est sauvegardée sur le téléphone.

## Raretés

| Rareté | Note | Cartes |
|---|---|---|
| Élite (holographique) | 85+ | 8 |
| Or | 72 à 84 | 14 |
| Argent | 60 à 71 | 21 |
| Bronze | moins de 60 | 12 |

Les seuils se règlent dans `scripts/export_cartes.py` (liste `RARETES`), les chances des packs dans `app.js` (liste `PACKS`).

## Mettre les cartes à jour

Les cartes sont dans `data/cartes.json`. Pour les recalculer avec les dernières feuilles de match :

```bash
python scripts/export_cartes.py ../handball-pronos/medoc/pipeline/teams
```

Le script lit les `site_data.json` du dépôt `handball-pronos`, garde les joueurs ayant joué au moins un match cette saison (une seule carte par personne, dans l'équipe où elle a le plus joué) et n'exporte que le nom, l'équipe et les notes : aucun numéro de licence.

## Tester en local

```bash
python -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Publier

Settings → Pages → Source « Deploy from a branch », branche `main`, dossier `/ (root)`.
Le jeu est alors en ligne sur `https://maelbenharoun.github.io/medoc-handball-cards/` (ou sur un sous-domaine de medochandballstats.com).

## Fichiers

```
index.html            page unique (en-tête, vue, onglets)
style.css             design, cartes, animations
app.js                tout le jeu : tirages, sauvegarde, vues
sw.js                 cache hors ligne
manifest.webmanifest  installation sur téléphone
data/cartes.json      les cartes (généré)
scripts/export_cartes.py
assets/               logo du club et icônes
```

## Idées pour la suite

- Cartes spéciales « Équipe de la semaine » après chaque week-end (meilleurs buteurs de la journée).
- Packs par équipe (Pack SF, Pack SG).
- Défis : « Aligne un 7 100 % SF2 », « Note d'équipe 80+ » → récompenses en packs.
- Mini-match contre un 7 adverse simulé avec le modèle de pronostic.
- Échanges de doublons entre copains (nécessite des comptes : Supabase, déjà utilisé pour medochandballstats).
- Vraies photos des joueurs (avec leur accord).
