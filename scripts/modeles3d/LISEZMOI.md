# Modèles 3D des mini-jeux

Personnage : `Assets/Avatars/Professions/Sports_Male_02` du dépôt [microsoft/Microsoft-Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox)
(licence MIT, copie dans `modeles/LICENCE-rocketbox.txt`), animations `m_idle_neutral_01`, `m_run_fast_01`, `m_run_neutral_01`
(dossier `all_animations_max_motextr_xy`, avancée retirée) et `m_cheer_01`.

1. `npm i three@0.180.0` dans un dossier de travail, y copier ces scripts.
2. `node geo.mjs <Sports_Male_02.fbx> <dossier>` : écrit la géométrie (positions, normales, UV) pour `maillots.py`.
3. `python3 maillots.py <dossier> <Textures de Sports_Male_02> <sortie>` : les tenues, peintes sur la position 3D de chaque texel
   (maillot de Médoc d'après les photos du club, adversaires bleus, gardiens en jogging rouge ou vert), la tête et les normales.
4. `node glb.mjs <sortie>/joueur.glb` (chemin du dépôt Rocketbox en haut du script) : un seul GLB, modèle + 4 animations, sans textures.
5. Copier `joueur.glb` et les `.jpg` dans `modeles/`, puis changer `V` dans `jeux3d.js`.
