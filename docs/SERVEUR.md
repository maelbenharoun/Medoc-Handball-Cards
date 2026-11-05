# Serveur (Supabase) : comptes, échanges de cartes

Plan pour passer d'un jeu solo sauvegardé sur le téléphone à un jeu en ligne avec des comptes et des échanges.
Rien de tout ça n'est en place : ce document dit ce qui est déjà prêt dans le code et ce qu'il restera à faire.

## Le principe

**Le serveur devient la seule source de vérité.** Aujourd'hui, tout se passe dans le téléphone : on peut modifier sa sauvegarde
(`localStorage`) et se donner des pièces ou des cartes. Sans échanges, ça ne gêne personne. Avec des échanges, une carte
« trichée » pourrait être donnée à un autre joueur. Donc, avec le serveur :

- le téléphone **affiche** et **demande** (« ouvre un pack Or ») ;
- le serveur **vérifie et décide** (assez de pièces ? quelles cartes sortent ?) et enregistre ;
- aucune règle de l'économie ne reste applicable côté téléphone.

Le site reste statique sur GitHub Pages. Supabase fournit les comptes, la base de données (Postgres) et le stockage des photos.

## Déjà prêt dans le code

| Quoi | Où | Pourquoi |
|---|---|---|
| Toutes les actions qui modifient la sauvegarde passent par un seul module | `compte.js` (`Compte`) | Pour passer au serveur, on réécrit ce fichier, pas le jeu |
| Chaque action renvoie une promesse avec son résultat (`{ids, nouveaux}`, `{gain}`…) et peut être refusée avec un message | `compte.js` | Même forme qu'un appel au serveur ; le jeu sait déjà afficher un refus |
| Le tirage d'un pack est une fonction pure `tirerPack(pack, catalogue, alea)` | `compte.js` | Sert de référence à porter côté serveur (mêmes chances, même garantie) |
| Les règles (prix, chances, ventes, bonus) sont regroupées | `compte.js` (`PACKS`, `VENTE`, `DEPART`, `BONUS_JOUR`) | Elles partiront sur le serveur ; le jeu ne gardera que l'affichage |
| L'aperçu des modifications non publiées n'apparaît que dans le navigateur de l'admin | `cartes.js` (`outilConnecte`) | Les joueurs voient toujours les cartes officielles |
| Alerte si une carte disparaît à l'export | `scripts/export_cartes.py` | L'id d'une carte doit rester stable : des joueurs la possèdent |

## La base de données (première version)

```sql
-- catalogue : les cartes du jeu (aujourd'hui cartes.json + perso.json fusionnés par cartes.js)
create table cartes (
  id text primary key,              -- nom simplifié, ne change jamais (ex. 'mael-benharoun')
  nom text not null, equipe text not null, poste text, stats jsonb not null,
  ovr int not null, rarete text not null, photo text, actif boolean default true,
  stats_site jsonb                  -- stats de medochandballstats.com (matchs, buts…) pour la fiche
);

-- un compte joueur
create table profils (
  user_id uuid primary key references auth.users on delete cascade,
  pseudo text unique not null,
  pieces int not null default 3000 check (pieces >= 0),
  packs_ouverts int not null default 0,
  dernier_bonus date, bienvenue boolean default false,
  equipe jsonb not null default '{}',   -- Mon 7 : {poste: exemplaire_id}
  role text not null default 'joueur'   -- 'admin' pour Maël
);

-- chaque carte possédée est un exemplaire unique : c'est ce qui s'échange
create table exemplaires (
  id uuid primary key default gen_random_uuid(),
  carte_id text not null references cartes, proprietaire uuid not null references profils,
  obtenu_le timestamptz default now(), origine text    -- 'pack:or', 'echange:<id>'…
);

create table echanges (
  id uuid primary key default gen_random_uuid(),
  de uuid not null references profils, vers uuid not null references profils,
  offre uuid[] not null, demande uuid[] not null,      -- exemplaires proposés / demandés
  statut text not null default 'propose',              -- propose, accepte, refuse, annule, expire
  cree_le timestamptz default now(), traite_le timestamptz
);

-- journal de tout ce qui bouge (pièces, cartes) : pour comprendre un litige ou repérer une triche
create table mouvements (id bigserial primary key, user_id uuid, quoi text, detail jsonb, le timestamptz default now());
```

**Différence avec aujourd'hui** : la sauvegarde locale compte les cartes (`possede: {id: 3}`) ; le serveur garde des
**exemplaires** (3 lignes), parce qu'on échange un exemplaire précis.

## Les règles d'accès

- Lecture : chacun lit le catalogue, son profil, ses exemplaires, ses échanges ; les pseudos et les cartes des autres
  seulement pour proposer un échange.
- **Aucune écriture directe** dans les tables par le téléphone (Row Level Security sans politique d'écriture).
- Toutes les écritures passent par des fonctions du serveur (`security definer`), qui font chaque action en une seule transaction :

| Fonction | Remplace dans `compte.js` | Vérifie |
|---|---|---|
| `ouvrir_pack(pack)` | `ouvrirPack` | pièces suffisantes ou pack de bienvenue ; tirage fait **sur le serveur** |
| `recuperer_bonus()` | `recupererBonus` | une fois par jour (date du serveur, pas du téléphone) |
| `vendre(exemplaire)` / `vendre_doublons()` | `vendre` / `vendreDoublons` | l'exemplaire est à lui, c'est un doublon, il n'est pas dans Mon 7 ni dans un échange en cours |
| `aligner(poste, exemplaire)` / `aligner_equipe(…)` | `aligner` / `alignerEquipe` | l'exemplaire est à lui |
| `proposer_echange(vers, offre, demande)` | nouveau | les exemplaires offerts sont à lui, les demandés à l'autre, aucun n'est déjà engagé |
| `repondre_echange(id, accepte)` | nouveau | revérifie tout au moment d'accepter, puis échange les propriétaires d'un coup |
| `annuler_echange(id)` | nouveau | seulement celui qui a proposé |

Le tirage côté serveur reprend exactement `tirerPack` (mêmes poids, carte garantie en premier, pas deux fois la même carte dans un pack).

## Le catalogue et l'outil admin

1. Un script remplit la table `cartes` depuis `data/cartes.json` + `data/perso.json` (même fusion que `cartes.js`).
2. Ensuite, l'outil `admin.html` écrit directement dans Supabase : connexion avec le compte de Maël (`role = 'admin'`),
   photos dans le stockage Supabase. **Le jeton GitHub ne sert plus : le supprimer** sur github.com/settings/personal-access-tokens.
3. Les stats du site continuent d'arriver chaque semaine par le script d'export. Elles ne touchent pas aux stats réglées à la main.

## Les échanges : règles à décider

- Échange carte contre carte seulement, ou aussi des pièces ? (Recommandé au début : cartes seulement, pour éviter le commerce de pièces.)
- Limite d'échanges par jour, pour freiner les comptes créés juste pour donner leurs cartes à un compte principal.
- Une carte alignée dans Mon 7 ne peut pas être échangée sans la retirer d'abord.
- Une proposition expire au bout de quelques jours.

## Les sauvegardes actuelles

On ne peut pas faire confiance à une sauvegarde locale (elle se modifie facilement). Trois possibilités, à décider au moment du lancement :

1. **Repartir de zéro** pour tout le monde avec le pack de bienvenue (le plus juste, recommandé) ;
2. reprendre les cartes possédées, mais pas les pièces ;
3. donner un bonus de départ selon le nombre de packs ouverts.

## Données personnelles

Avec des comptes, le jeu gardera des adresses e-mail : c'est une donnée personnelle (RGPD).

- Une page « confidentialité » : quelles données, pourquoi, combien de temps, comment supprimer son compte.
- **Moins de 15 ans : accord des parents** pour créer un compte (règle française). Beaucoup de licenciés sont mineurs.
- Pseudo libre (pas forcément le vrai nom) et suppression du compte possible depuis le jeu.
- Photos : toujours seulement avec l'accord de la personne (des parents pour un mineur).

## Ordre des étapes

1. Créer le projet Supabase (ou réutiliser celui de medochandballstats) et les tables ci-dessus.
2. Remplir le catalogue avec le script.
3. Écrire les fonctions du serveur (packs, bonus, ventes, Mon 7), avec des tests qui comparent au `tirerPack` du jeu.
4. Réécrire `compte.js` pour appeler ces fonctions (connexion par lien magique envoyé par e-mail).
   Choix à faire à ce moment-là : la bibliothèque officielle `supabase-js` (une dépendance, chargée depuis un CDN),
   ou de simples `fetch` vers l'API de Supabase (aucune dépendance, un peu plus de code).
5. Mode hors ligne : consulter son club sans réseau, mais ouvrir un pack ou échanger demande une connexion.
6. Ajouter les échanges (écran « Échanges », liste des joueurs, propositions).
7. Passer l'outil admin sur Supabase et supprimer le jeton GitHub.
