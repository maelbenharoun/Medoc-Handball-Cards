# Serveur Supabase : comptes, packs et échanges

Le jeu peut tourner de deux façons, selon `config.js` :

- **vide** (aujourd'hui) : sauvegarde sur le téléphone, sans comptes ni échanges ;
- **rempli** : chaque joueur a un compte (e-mail + mot de passe ou Google), sa partie est sur le serveur,
  et on peut échanger des cartes. C'est le serveur qui applique toutes les règles : modifier son téléphone ne sert à rien.

Le site reste sur GitHub Pages. Supabase fournit les comptes, la base de données et le stockage des photos (offre gratuite).

## Mise en route (une seule fois, environ 30 minutes)

### 1. Créer le projet

1. Sur <https://supabase.com>, crée un compte puis **New project**.
2. Nom : `medoc-hand-cards`. Choisis un mot de passe de base de données (garde-le, il ne sert pas dans le jeu).
3. Région : **West EU (Paris)** (les données des joueurs restent en Europe).

### 2. Créer la base

1. Menu **SQL Editor** → **New query**.
2. Colle **tout** le contenu de [`supabase/schema.sql`](../supabase/schema.sql), puis **Run**. Il doit afficher « Success ».

Ce fichier peut être relancé sans risque après une mise à jour du jeu : il ne supprime aucune donnée.

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

Tant que ce n'est pas fait, le bouton « Continuer avec Google » affiche « La connexion Google n'est pas encore activée ».

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

### 7. Remplir le catalogue

1. Ouvre l'outil (`admin.html`, ou 5 fois le logo dans le jeu) → **Compte** → connecte-toi.
2. Touche **Synchroniser avec le site** : les 55 cartes de `data/cartes.json`, avec tes réglages (`data/perso.json`), partent sur le serveur.

Ensuite, « Publier » enregistre directement tes modifications sur le serveur (photos comprises) : le jeu est à jour tout de suite.
Le jeton GitHub ne sert plus : supprime-le sur <https://github.com/settings/personal-access-tokens>.

## Au quotidien

- **Nouvelles feuilles de match** : lance `scripts/export_cartes.py`, pousse `data/cartes.json`, puis dans l'outil **Synchroniser avec le site**.
  Une carte absente du site n'est plus tirée dans les packs, mais reste dans les clubs de ceux qui l'ont.
- **Changer un prix, une chance, une limite** : **Table Editor** → tables `regles` et `packs`. Le jeu suit au prochain chargement.
- **Voir ce qui s'est passé** (litige, soupçon de triche) : table `mouvements` (packs, ventes, bonus, échanges, avec la date).
- **Offre gratuite** : un projet sans aucune visite pendant 7 jours est mis en pause par Supabase (un clic pour le relancer).
  Avec des joueurs réguliers, ça n'arrive pas.

Les anciennes parties sauvegardées sur les téléphones ne sont pas reprises : tout le monde repart de zéro avec le pack de bienvenue.
On ne peut pas faire confiance à une sauvegarde locale, qui se modifie facilement.

## Comment c'est construit

| Fichier | Rôle |
|---|---|
| `supabase/schema.sql` | Tables, règles d'accès et toutes les actions du serveur |
| `config.js` | Adresse du projet et clé publique (vide = mode local) |
| `serveur.js` | `CompteServeur` : connexion, actions, échanges, copie hors ligne. Charge `supabase-js` 2.118.0 depuis jsDelivr |
| `compte.js` | `CompteLocal` (mode sans serveur) et les règles par défaut |
| `app.js` | Écrans : connexion, profil, boutique, club, Mon 7, échanges |
| `admin.js` | Outil : publie sur Supabase (ou sur GitHub en mode local) |
| `confidentialite.html` | Données personnelles (à compléter : adresse de contact) |

### Tables

| Table | Contenu | Lisible par |
|---|---|---|
| `regles`, `packs` | Prix, chances, bonus, limites des échanges | tout le monde |
| `cartes` | Catalogue : stats, note, rareté, photo, stats du site, réglages de l'outil | tout le monde |
| `profils` | Pseudo, pièces, Mon 7, rôle (`joueur` ou `admin`) | le joueur lui-même |
| `possessions` | Cartes de chaque joueur et nombre d'exemplaires | le joueur lui-même |
| `echanges` | Propositions et leur statut | les deux joueurs concernés |
| `mouvements` | Journal de tout ce qui bouge | personne depuis le jeu |

**Aucune table n'est modifiable depuis le jeu.** Toutes les écritures passent par ces fonctions, qui vérifient tout et
font chaque action d'un seul bloc :

| Fonction | Rôle |
|---|---|
| `mon_etat`, `creer_profil`, `supprimer_mon_compte` | Compte (le profil demande l'accord « 15 ans ou parents d'accord ») |
| `ouvrir_pack` | Tirage sur le serveur, même règle que `tirerPack` de `compte.js` |
| `recuperer_bonus` | Une fois par jour, à l'heure de Paris |
| `vendre`, `vendre_doublons` | On garde toujours un exemplaire |
| `aligner`, `aligner_equipe` | Mon 7 : cartes possédées, gardien·ne au poste GB seulement |
| `chercher_joueurs`, `club_de` | Trouver un joueur et voir ses cartes pour lui proposer un échange |
| `proposer_echange` | 1 à 5 cartes de chaque côté, 10 propositions par jour, jamais le dernier exemplaire d'une carte du Mon 7 |
| `repondre_echange` | Tout est revérifié au moment d'accepter (cartes vendues entre-temps…), puis échange d'un coup. Expire après 7 jours |
| `annuler_echange`, `mes_echanges` | Annuler sa proposition, voir ses 50 derniers échanges |
| `admin_publier_cartes` | Catalogue, réservé au rôle `admin` |

Les photos sont dans le stockage `photos` : lisibles par tous, déposées et supprimées par l'admin seulement.

### Ce qui a été vérifié

Le schéma a été testé sur une base Postgres locale qui imite Supabase (78 vérifications), puis le jeu complet dans un navigateur
contre ce faux serveur (41 vérifications) : inscription, profil, packs et garanties, bonus, ventes, Mon 7, échange entre deux joueurs,
déconnexion, mot de passe oublié, hors ligne, suppression de compte, outil admin avec photo. Côté triche : écriture directe dans les tables,
appel des fonctions internes, cartes qu'on n'a pas, double acceptation, échange avec soi-même, limite du jour, rôle admin.
**Pas encore testé sur un vrai projet Supabase** : à vérifier lors de la mise en route (étapes 2 à 7).
