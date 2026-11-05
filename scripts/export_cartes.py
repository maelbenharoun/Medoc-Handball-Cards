"""Exporte les cartes des joueurs et joueuses de la saison (SG1, SG2, SF1, SF2) pour le jeu.

Source : les fichiers teams/<équipe>/site_data.json du dépôt handball-pronos
(ceux qui alimentent medochandballstats.com). Les notes sont calculées avec la
même formule que la carte FUT du site (fonction FUT de template2.html.txt).

Usage :
    python scripts/export_cartes.py ../handball-pronos/medoc/pipeline/teams

Sortie : data/cartes.json (noms + notes uniquement, aucun numéro de licence).
"""
import json
import sys
import unicodedata
from datetime import date
from pathlib import Path

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


def main(src):
    src = Path(src)
    par_nom = {}
    for key in EQUIPES:
        d = json.loads((src / key / "site_data.json").read_text(encoding="utf-8"))
        team = d["team"]
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
            }
            # Une seule carte par personne : l'équipe où elle a le plus joué
            old = par_nom.get(carte["id"])
            if old is None or carte["mj"] > old["mj"]:
                par_nom[carte["id"]] = carte

    cartes = sorted(par_nom.values(), key=lambda c: (-c["ovr"], c["nom"]))
    for c in cartes:
        c["rarete"] = next(r for seuil, r in RARETES if c["ovr"] >= seuil)
    out = Path(__file__).resolve().parent.parent / "data" / "cartes.json"
    out.write_text(json.dumps({"saison": "2026-2027", "maj": date.today().isoformat(), "cartes": cartes},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    compte = {}
    for c in cartes:
        compte[c["rarete"]] = compte.get(c["rarete"], 0) + 1
    print(f"{len(cartes)} cartes → {out}  {compte}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "../handball-pronos/medoc/pipeline/teams")
