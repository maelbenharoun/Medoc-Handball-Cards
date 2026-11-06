"""Exporte la fiche de chaque match à venir des poules SG1, SG2, SF1, SF2 pour les paris du jeu (« Voir la fiche du match »).

C'est un résumé du « Face-à-face en chiffres » et de l'analyse du match de medochandballstats.com (fonctions
versus() et teamStats() de template2.html.txt) : classement, niveau estimé, buts marqués et encaissés, forme,
bilan à domicile ou à l'extérieur, matchs déjà joués entre les deux, prono et score probable.
Statistiques d'équipes seulement : aucun nom de joueur, aucun numéro de licence.

Usage :
    python scripts/export_face.py ../handball-pronos/medoc/pipeline/teams

Sortie : data/face.json ({maj, home (avantage du terrain du modèle), matchs: {rid: fiche}}), lu par le jeu
(chargé à l'ouverture d'une fiche). Ne touche à aucun autre fichier.
"""
import json
import sys
from datetime import date, timedelta
from pathlib import Path

EQUIPES = ["sg1", "sg2", "sf1", "sf2"]


def stats_equipe(results, tid):
    """Même calcul que teamStats() du site : buts marqués / encaissés par match, écart, mi-temps, plus large victoire."""
    s = {"j": 0, "bp": 0, "bc": 0, "mtn": 0, "d1": 0}
    best = None
    for r in results:
        if r.get("forfait") or r.get("hs") is None or tid not in (str(r["home"]), str(r["away"])):
            continue
        h = str(r["home"]) == tid
        bp, bc = (r["hs"], r["as"]) if h else (r["as"], r["hs"])
        s["j"] += 1; s["bp"] += bp; s["bc"] += bc
        mt = r.get("mt")
        if mt and mt[0] is not None:
            s["mtn"] += 1; s["d1"] += (mt[0] - mt[1]) if h else (mt[1] - mt[0])
        if best is None or bp - bc > best:
            best = bp - bc
    j = s["j"]
    return {
        "j": j,
        "att": round(s["bp"] / j, 1) if j else None,
        "def": round(s["bc"] / j, 1) if j else None,
        "gd": round((s["bp"] - s["bc"]) / j, 1) if j else None,
        "m1": round(s["d1"] / s["mtn"], 1) if s["mtn"] else None,
        "best": best if best is not None and best > 0 else None,
    }


def rang(valeurs, tid, cle, asc=False):
    """Place de l'équipe dans la poule pour une stat (1 = meilleure attaque, ou meilleure défense avec asc)."""
    v = valeurs[tid][cle]
    if v is None:
        return None
    autres = [x[cle] for t, x in valeurs.items() if x["j"] and x[cle] is not None]
    return 1 + sum(1 for x in autres if (x < v if asc else x > v))


def fiches(d):
    noms = {tid: (t.get("short") or t.get("nom") or tid) for tid, t in d["teams"].items()}
    results = d.get("results", [])
    st = {tid: stats_equipe(results, tid) for tid in d["teams"]}
    nb_equipes = len(d["teams"])

    def cote(tid, lieu):
        t = d["teams"][tid]
        c = t.get("classement") or {}
        rec = (t.get("rec") or {}).get(lieu) or {}
        forme = [x["res"] for x in (t.get("forme") or []) if not x.get("forfait")][:5]   # du plus récent au plus ancien
        p0 = (t.get("parcours") or [None])[0] or {}
        return {
            "nom": noms[tid],
            "place": c.get("place"), "pts": c.get("pts"), "j": c.get("j"),
            "g": c.get("g"), "n": c.get("n"), "p": c.get("p"),
            "niveau": round(t["rating"], 1) if t.get("rating") is not None else None,
            "depart": round(t["depart"], 1) if t.get("depart") is not None else None,
            **st[tid],
            "rangAtt": rang(st, tid, "att"), "rangDef": rang(st, tid, "def", asc=True),
            "bilan": {k: rec.get(k, 0) for k in ("j", "g", "n", "p")},
            "forme": "".join(forme),
            "p1": (t.get("sim") or {}).get("p1"),
            "conserve": p0.get("continuite"),
        }

    out = {}
    debut, fin = (date.today() - timedelta(days=1)).isoformat(), (date.today() + timedelta(days=35)).isoformat()
    for m in d.get("calendar", []):
        if not m.get("date") or not m.get("p") or not debut <= m["date"] <= fin:   # les paris : les 5 semaines à venir
            continue
        dom, ext = str(m["home"]), str(m["away"])
        deja = [{"date": r["date"], "dom": noms.get(str(r["home"]), str(r["home"])), "ext": noms.get(str(r["away"]), str(r["away"])),
                 "score": [r["hs"], r["as"]]}
                for r in results if r.get("hs") is not None and {str(r["home"]), str(r["away"])} == {dom, ext}]
        out[str(m["rid"])] = {
            "equipes": nb_equipes,
            "p": m["p"], "mu": m.get("mu"), "score": m.get("score"),
            "dom": cote(dom, "dom"), "ext": cote(ext, "ext"),
            "deja": deja,
        }
    return out


def main(src):
    src = Path(src)
    matchs, home = {}, None
    for key in EQUIPES:
        d = json.loads((src / key / "site_data.json").read_text(encoding="utf-8"))
        home = home or (d.get("model") or {}).get("home")
        matchs.update(fiches(d))
    sortie = Path(__file__).resolve().parent.parent / "data" / "face.json"
    sortie.write_text(json.dumps({"maj": date.today().isoformat(), "home": round(home, 2) if home else None, "matchs": matchs},
                                 ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(matchs)} fiches de match → {sortie}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "../handball-pronos/medoc/pipeline/teams")
