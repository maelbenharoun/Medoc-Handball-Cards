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
2. Ouvre l'outil (`admin.html`, ou 5 fois le logo dans le jeu) → **Compte** → connecte-toi.
3. Touche **Synchroniser avec le site** : les cartes de `data/cartes.json` (avec tes réglages de `data/perso.json`)
   et les matchs de `data/matchs.json` partent sur le serveur.

Ensuite, « Publier » enregistre directement tes modifications sur le serveur (photos comprises) : le jeu est à jour tout de suite.
Le jeton GitHub ne sert plus : supprime-le sur <https://github.com/settings/personal-access-tokens>.

## Au quotidien

- **Nouvelles feuilles de match** (chaque semaine) : lance `scripts/export_cartes.py`, pousse `data/cartes.json` et `data/matchs.json`,
  puis dans l'outil **Synchroniser avec le site**. Les paris des matchs joués sont réglés à ce moment-là.
  Pour ne mettre à jour que les matchs : bouton **Matchs et paris seulement**.
  Une carte absente du site n'est plus tirée dans les boosters, mais reste dans les clubs de ceux qui l'ont.
- **Changer un réglage** (chances des boosters, coûts, gains, limites du jour, divisions…) : **Table Editor** → table `parametres`,
  colonne `valeurs`. Le jeu suit au prochain chargement.
- **Voir ce qui s'est passé** (litige, soupçon de triche) : table `mouvements` (boosters, fusions, ventes, matchs, paris, transferts, avec la date).
- **Offre gratuite** : un projet sans aucune visite pendant 7 jours est mis en pause par Supabase (un clic pour le relancer).

## Les règles du jeu (réglages par défaut, table `parametres`)

| Quoi | Règle |
|---|---|
| **Paliers** | Bronze 50 → 59 · Argent 60 → 74 · Or 75 → 89 · Ultime 90 → 99, même pouvoir pour tous les joueurs. Une carte arrive au bas de son palier |
| **Forme du joueur** | Les 6 stats réglées dans l'outil donnent les écarts (ex. TIR +4, DÉF −6), gardés à chaque palier |
| **Booster de départ** | 7 joueurs, un par poste, alignés dans Mon 7 |
| **Booster gratuit** | 1 joueur toutes les 30 minutes, 5 au plus en stock : 80 % Bronze, 12 % Argent, 7 % Or, 1 % Ultime |
| **Entraînement** | Séance payée (40 / 80 / 150 / 300 pièces selon le palier) : +50 XP à la carte. 100 / 150 / 200 / 300 XP par point |
| **Fusion** | 3 fois le même joueur au même palier → 1 au palier suivant (200 / 600 / 2 000 pièces). Les 3 moins entraînés sont pris |
| **Vente** | 10 / 40 / 150 / 600 pièces (pas une carte de Mon 7 ni une carte au marché) |
| **Niveau du compte** | XP gagnée partout ; chaque niveau donne des pièces et un booster bonus, tous les 5 niveaux un booster Or ou Ultime |
| **Quêtes** | 3 par jour, tirées parmi 11 (boosters, entraînement, matchs, défis, paris, marché…) |
| **Matchs** | Simulés sur le serveur : notes (−5 hors poste), forme, collectif, tactique (attaque / équilibre / défense), hasard |
| **Championnat** | 4 divisions de 10 journées, adversaires de plus en plus forts, 20 points pour monter. 10 matchs par jour |
| **Séance d'équipe** | +40 XP aux joueurs de Mon 7, 5 par jour |
| **Défis** | Contre le 7 d'un autre joueur (il défend avec sa dernière tactique) : trophées, classement. 5 par jour, 2 par adversaire |
| **Paris** | 1N2 sur les vrais matchs des 14 prochains jours (SG1, SG2, SF1, SF2). Cote = 0,92 / probabilité du modèle, entre 1,05 et 12. Mise de 10 à 300, fermés au coup d'envoi |
| **Marché** | Annonce « ma carte contre telle carte à tel palier », 5 annonces au plus, 7 jours. La carte est réservée tant que l'annonce est ouverte ; note et XP sont gardées |

## Comment c'est construit

| Fichier | Rôle |
|---|---|
| `supabase/schema.sql` | Tables, règles d'accès et toutes les actions du serveur |
| `config.js` | Adresse du projet et clé publique (vide = jeu fermé) |
| `serveur.js` | `Compte` : connexion, actions, copie hors ligne. Charge `supabase-js` 2.118.0 depuis jsDelivr |
| `cartes.js` | Paliers, forme des joueurs, rendu des cartes (partagé avec l'outil) |
| `app.js` | Écrans : accueil, club, Mon 7, jouer, marché, paris, connexion |
| `admin.js` | Outil : cartes, photos par palier, synchronisation (Supabase, ou GitHub sans serveur) |
| `scripts/export_cartes.py` | `data/cartes.json` et `data/matchs.json` depuis `handball-pronos` |

**Aucune table n'est modifiable depuis le jeu.** Le jeu lit ce qui le concerne (ses cartes, ses quêtes, ses paris…) et passe
par des fonctions du serveur pour tout le reste : `ouvrir_depart`, `ouvrir_booster`, `fusionner`, `entrainer`, `vendre`, `aligner`,
`reclamer_quete`, `match_championnat`, `seance_equipe`, `defier`, `parier`, `publier_annonce`, `accepter_annonce`…
Chacune vérifie tout et fait l'action d'un seul bloc. Les fonctions internes (tirage, XP, moteur de match) ne sont pas appelables.

### Ce qui a été vérifié

Le schéma a été testé sur une base Postgres locale qui imite Supabase (164 vérifications : règles, limites, tentatives de triche,
équilibre du moteur de match sur 2 000 matchs par écart de niveau, chances des boosters sur 3 000 tirages, paris réglés, transferts),
puis le jeu dans un navigateur de téléphone contre ce faux serveur (76 vérifications sur les trois parties).
**Pas encore testé sur un vrai projet Supabase** : à vérifier lors de la mise en route.
