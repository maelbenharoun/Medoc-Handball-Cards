'use strict';
/* Connexion au serveur Supabase du jeu (voir docs/SERVEUR.md).
   Laissés vides : le jeu affiche « Le jeu ouvre bientôt ».
   Ces deux valeurs sont publiques par nature (elles finissent dans le navigateur de chaque joueur) :
   la sécurité vient des règles de la base (supabase/schema.sql), pas de leur secret. On peut les committer.
   Où les trouver : Supabase → Project Settings → API (ou « Connect ») :
   - supabaseUrl : Project URL, du genre https://abcdefgh.supabase.co
   - supabaseCle : la clé « anon public » ou « publishable » (JAMAIS la clé « service_role » ou « secret ») */
const CONFIG = {
  supabaseUrl: 'https://afpbyjcgdqaistcwqbgp.supabase.co',
  supabaseCle: 'sb_publishable_OP87NXLUFp3lDxLBfz3aPw_EMQpepBY',
};
