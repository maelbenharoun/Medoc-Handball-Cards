"""Exporte les cartes des joueurs et joueuses de la saison (SG1, SG2, SF1, SF2) pour le jeu.

Source : les fichiers teams/<équipe>/site_data.json du dépôt handball-pronos
(ceux qui alimentent medochandballstats.com). Les notes sont calculées avec la
même formule que la carte FUT du site (fonction FUT de template2.html.txt).

Usage :
    python scripts/export_cartes.py ../handball-pronos/medoc/pipeline/teams

Sortie : data/cartes.json (noms, notes, numéro de maillot et fiche de stats sportives, aucun numéro de licence)
         data/matchs.json (calendrier et résultats des poules SG1, SG2, SF1, SF2, pour les paris du jeu)
         data/adversaires.json (vraies équipes par niveau du parcours : noms de clubs seulement).
"""
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

from fiches import fiche, valeurs_club

EQUIPES = ["sg1", "sg2", "sf1", "sf2"]

# Constantes reprises du site (template2.html.txt)
ABS_F, ABS_CAP, GK_MIN = 0.5, 4, 3

# Raretés selon la note générale
RARETES = [(85, "elite"), (72, "or"), (60, "argent"), (0, "bronze")]


def nclamp(x, a, b):
    # Math.round de JS (arrondi vers +∞ à .5)
    return max(a, min(b, int(x + 0.5) if x >= 0 else -int(-x + 0.5)))


def eff_of(p):
    return p["val"] if p.get("val") is not None else min(ABS_F * (p.get("bpm") or 0), ABS_CAP)


def is_gk(p):
    return (p.get("arrets_pm") or 0) >= GK_MIN


def fut(p):
    """Port Python de la fonction FUT du site."""
    mj = 0 if p.get("gbx") else (p.get("mj") or 0)
    gb3 = p.get("gb3")
    A = (p.get("arrets_pm") or 0) * mj + (gb3[0] if gb3 else 0)
    M = mj + (gb3[1] if gb3 else 0)
    gb = None
    if M and A >= 5 and A / M >= 2:
        moy = A / M if p.get("gbx") else (A + 5 * 2) / (M + 2)
        gb = nclamp(35 + 4 * moy, 30, 95)
    bpm = p.get("bpm") or 0
    if (is_gk(p) or (M and A / M >= GK_MIN)) and bpm < 0.5 and gb is not None:
        kind = "gb"
    elif gb is not None and bpm >= 0.5:
        kind = "mix"
    else:
        kind = "champ"
    n3 = p.get("n3") or [p["val_o"] if p.get("val_o") is not None else ABS_F * bpm, p.get("val_d") or 0, eff_of(p)]
    arr = A / M if M else 0
    if kind == "gb":
        return {"kind": kind, "gb": gb, "ovr": gb, "att": None, "def": None, "arr": arr}
    return {
        "kind": kind,
        "gb": gb if kind == "mix" else None,
        "att": nclamp(45 + 12 * n3[0], 30, 99),
        "def": nclamp(60 + 40 * n3[1], 25, 95),
        "ovr": nclamp(45 + 13 * n3[2], 30, 99),
        "arr": arr,
    }


def slug(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    return "-".join("".join(c if c.isalnum() else " " for c in s).split())


def mots(nom):
    """Mots d'un nom, sans accents ni majuscules : « VALENTIN julie » et « Julie Valentin » donnent les mêmes."""
    return frozenset(slug(nom).split("-")) - {""}


def numeros(fdm_path, rids, cartes):
    """Numéro de maillot le plus porté cette saison, d'après les feuilles de match du club (fdm.json).
    On ne lit que le numéro et le nom de chaque ligne : jamais la licence."""
    if not fdm_path.exists():
        print(f"(pas de {fdm_path} : numéros de maillot non mis à jour)")
        return {}
    fdm = json.loads(fdm_path.read_text(encoding="utf-8"))
    par_carte = {c["id"]: mots(c["nom"]) for c in cartes}
    comptes = {}   # id de carte → {numéro: [nombre de matchs, date du dernier]}
    for rid, date_m in rids.items():
        feuille = fdm.get(rid)
        if not feuille:
            continue
        for bloc in feuille.get("blocks", []):
            for ligne in bloc.get("p", []):
                num, nom = str(ligne[0]).strip(), ligne[1]
                if not num.isdigit() or not 0 <= int(num) <= 99:
                    continue
                m = mots(nom)
                # le nom de la carte doit être contenu dans celui de la feuille (noms composés, deuxièmes noms)
                trouves = [cid for cid, mc in par_carte.items() if mc and mc <= m]
                if len(trouves) != 1:
                    continue
                n = comptes.setdefault(trouves[0], {}).setdefault(int(num), [0, ""])
                n[0] += 1
                n[1] = max(n[1], date_m)
    return {cid: max(nums.items(), key=lambda x: (x[1][0], x[1][1]))[0] for cid, nums in comptes.items()}


PETITS = {"de", "du", "des", "la", "le", "les", "et", "sur", "en", "d", "l"}


def joli(nom):
    """« HBC BAZADAIS 1 » → « HBC Bazadais 1 » ; les noms déjà écrits normalement ne changent pas."""
    nom = re.sub(r"\s*\([^)]*\)\s*$", "", nom).strip()   # « Entente Brive / Objat (N3F) » → sans la parenthèse
    if nom != nom.upper():
        return nom
    mots_ = []
    for i, m in enumerate(nom.split()):
        parts = []
        for j, x in enumerate(m.split("'")):
            low = x.lower()
            if low in ("st", "ste"):
                parts.append(low.capitalize())
            elif len(x) <= 3 and not low in PETITS or any(ch.isdigit() for ch in x):
                parts.append(x)                     # sigles (HBC, AS, ES, 33…)
            elif low in PETITS and (i or j):
                parts.append(low)
            else:
                parts.append("-".join(w.capitalize() for w in low.split("-")))
        mots_.append("'".join(parts))
    return " ".join(mots_)


def adversaires(racine, sites):
    """Vraies équipes pour chaque niveau du parcours (1 Promotion … 9 Nationale 1), sans les équipes du Médoc.
    Départemental : poules +16 de la collecte Gironde ; régional et national : poules d'Excellence régionale
    (avec la force du modèle), complétées par les équipes de Prénationale, N3 et N2 connues du crawl."""
    vus, niveaux = set(), {str(n): [] for n in range(1, 10)}

    def ajoute(n, nom):
        nom = joli(nom)
        cle = slug(nom)
        if "medoc" in cle or cle in vus or not cle:
            return
        vus.add(cle)
        niveaux[str(n)].append(nom)

    g = racine / "donnees" / "gironde"
    saisons = sorted(x for x in g.glob("saison-*") if (x / "poules.json").exists())
    if saisons:
        poules = json.loads((saisons[-1] / "poules.json").read_text(encoding="utf-8"))
        rencontres = json.loads((saisons[-1] / "matchs.json").read_text(encoding="utf-8"))
        comp = {p["pid"]: p["comp"] for p in poules}
        def niveau_dep(c):
            if "U18" in c or "+16" not in c:
                return None
            if "PROMOTION" in c: return 1
            if "PRE-REGIONALE" in c: return 4
            if "HONNEUR" in c: return 2
            if "EXCELLENCE" in c: return 3
            return None
        for m in rencontres.values():
            n = niveau_dep(comp.get(m[0], ""))
            if n:
                ajoute(n, m[5]); ajoute(n, m[6])
    # Excellence régionale : équipes classées par la force du modèle (les plus fortes servent aux niveaux au-dessus)
    regionales = {}
    for d in sites:
        if "regional" not in (d.get("source") or ""):
            continue
        for tid, t in d.get("teams", {}).items():
            if str(tid) != str(d.get("club")):
                nom = joli(t.get("short") or t.get("nom") or "")
                regionales[slug(nom)] = (t.get("rating") or 0, nom)
    crawl = racine / "medoc" / "pipeline" / "crawl_index.json"
    connues = {6: [], 7: [], 8: []}
    if crawl.exists():
        for t in json.loads(crawl.read_text(encoding="utf-8")).get("club_teams", []):
            c = t.get("comp", "")
            n = 8 if "NATIONALE 2" in c else 7 if "NATIONALE 3" in c else 6 if "PRENATIONALE" in c else None
            if n:
                connues[n].append(t["team"])
    for n in (8, 7, 6):
        for nom in connues[n]:
            ajoute(n, nom)
    restes = [nom for _, nom in sorted(regionales.values(), reverse=True)]
    for n in (9, 8, 7, 6):   # les plus fortes équipes régionales complètent les niveaux au-dessus
        while len(niveaux[str(n)]) < 7 and restes:
            ajoute(n, restes.pop(0))
    for nom in restes:
        ajoute(5, nom)
    return niveaux


def matchs_de(key, d):
    """Matchs à venir (avec les probabilités du modèle) et joués (avec le score) de la poule d'une équipe."""
    noms = {tid: (t.get("short") or t.get("nom") or tid) for tid, t in d["teams"].items()}
    club = str(d["club"])
    base = {"equipe": key.upper(), "competition": f'{d.get("competition", "")} · {d.get("poule", "")}'.strip(" ·")}

    def ligne(m, **extra):
        dom, ext = str(m["home"]), str(m["away"])
        return {**base, "rid": str(m["rid"]), "j": m.get("j"), "date": m["date"], "heure": m.get("heure"),
                "dom": noms.get(dom, dom), "ext": noms.get(ext, ext),
                "medoc": "dom" if dom == club else "ext" if ext == club else None, **extra}

    a_venir = [ligne(m, p=m.get("p"), score=None) for m in d.get("calendar", []) if m.get("date")]
    joues = [ligne(m, p=None, score=[m["hs"], m["as"]], forfait=m.get("forfait"))
             for m in d.get("results", []) if m.get("date") and m.get("hs") is not None]
    return joues + a_venir


def main(src):
    src = Path(src)
    matchs = {}
    sites = []
    rids = {}   # matchs joués par les équipes du club cette saison → date (pour les numéros de maillot)
    par_nom = {}
    for key in EQUIPES:
        d = json.loads((src / key / "site_data.json").read_text(encoding="utf-8"))
        sites.append(d)
        team = d["team"]
        for m in matchs_de(key, d):
            matchs[m["rid"]] = m
        for m in d.get("played_club", []):
            rids[str(m["rid"])] = m.get("date") or ""
        for p in d["teams"][str(d["club"])].get("players", []):
            if not (p.get("mj") or 0):
                continue  # inscrit mais pas encore joué cette saison
            f = fut(p)
            tir = p.get("tir") or [0, 0]
            carte = {
                "id": slug(p["nom"]),
                "nom": p["nom"],
                "equipe": key.upper(),
                "genre": team.get("genre", "F" if key.startswith("sf") else "M"),
                "poste": {"gb": "GB", "mix": "JDC·GB", "champ": "JDC"}[f["kind"]],
                "ovr": f["ovr"],
                "att": f["att"],
                "def": f["def"],
                "tir": round(100 * tir[0] / tir[1]) if tir[1] else None,
                "gb": f["gb"],
                "arr": round(f["arr"], 1),
                "mj": p["mj"],
                "buts": p.get("buts") or 0,
                "bpm": round(p.get("bpm") or 0, 1),
                "record": p.get("max") or 0,
                "recrue": bool(p.get("recrue")),
                "_p": p,
            }
            # Une seule carte par personne : l'équipe où elle a le plus joué
            old = par_nom.get(carte["id"])
            if old is None or carte["mj"] > old["mj"]:
                par_nom[carte["id"]] = carte

    cartes = sorted(par_nom.values(), key=lambda c: (-c["ovr"], c["nom"]))
    # fiche de chaque joueur (stats du site, toutes ses saisons au club, stats rigolotes)
    jf = src.parent / "joueurs.json"
    joueurs = json.loads(jf.read_text(encoding="utf-8"))["joueurs"] if jf.exists() else {}
    club = valeurs_club(joueurs, {})
    for c in cartes:
        c["fiche"] = fiche(c, c.pop("_p"), joueurs.get(c["id"]), club)
    print(f"fiches : {sum(len(c['fiche']) > 1 for c in cartes)}/{len(cartes)} avec leurs stats rigolotes")
    nums = numeros(src.parent / "fdm.json", rids, cartes)
    for c in cartes:
        c["numero"] = nums.get(c["id"])
    print(f"numéros de maillot : {sum(c['numero'] is not None for c in cartes)}/{len(cartes)} cartes")
    for c in cartes:
        c["rarete"] = next(r for seuil, r in RARETES if c["ovr"] >= seuil)
    out = Path(__file__).resolve().parent.parent / "data" / "cartes.json"
    # L'id (nom simplifié) identifie la carte dans les sauvegardes, data/perso.json et, plus tard, la base
    # du serveur : une carte qui disparaît (nom corrigé sur le site, joueur parti) serait perdue pour ses propriétaires.
    if out.exists():
        avant = {c["id"]: c["nom"] for c in json.loads(out.read_text(encoding="utf-8"))["cartes"]}
        partis = sorted(set(avant) - {c["id"] for c in cartes})
        if partis:
            print("⚠ Cartes qui disparaissent (à vérifier avant de publier) :",
                  ", ".join(f"{avant[i]} ({i})" for i in partis))
    out.write_text(json.dumps({"saison": "2026-2027", "maj": date.today().isoformat(), "cartes": cartes},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    sortie = out.parent / "matchs.json"
    liste = sorted(matchs.values(), key=lambda m: (m["date"], m.get("heure") or "", m["equipe"], m["rid"]))
    sortie.write_text(json.dumps({"maj": date.today().isoformat(), "matchs": liste}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(liste)} matchs → {sortie}")
    racine = src.resolve().parents[2]
    bec = racine / "bec" / "pipeline" / "teams"
    for f in sorted(bec.glob("*/site_data.json")) if bec.exists() else []:
        sites.append(json.loads(f.read_text(encoding="utf-8")))
    niv = adversaires(racine, sites)
    (out.parent / "adversaires.json").write_text(json.dumps({"maj": date.today().isoformat(), "niveaux": niv}, ensure_ascii=False, indent=1), encoding="utf-8")
    print("adversaires par niveau :", {k: len(v) for k, v in niv.items()})
    compte = {}
    for c in cartes:
        compte[c["rarete"]] = compte.get(c["rarete"], 0) + 1
    print(f"{len(cartes)} cartes → {out}  {compte}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "../handball-pronos/medoc/pipeline/teams")
