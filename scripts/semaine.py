"""Joueurs de la semaine (demande de Maël) : pour chaque équipe du club qui a des cartes, le meilleur joueur des vrais matchs de la
semaine (du lundi au dimanche), d'après les feuilles de match de la page publique de medochandballstats.com (buts, tirs, arrêts).

- Points d'un joueur sur la semaine : buts + arrêts / 2 (une gardienne à 16 arrêts vaut une joueuse à 8 buts) ; à égalité, la
  meilleure réussite au tir, puis le moins de tirs.
- Pas de répétition (demande de Maël) : dans une équipe, un joueur déjà élu cette saison ne peut plus l'être tant que tous ceux
  qui ont marqué des points ne l'ont pas été ; un même joueur n'est jamais élu pour deux équipes la même semaine.
- Une semaine déjà choisie ne change plus (le jeu l'a peut-être déjà montrée) : l'historique est gardé dans data/semaine.json.
- Seuls les nom, équipe et statistiques sportives sortent de la page (aucune autre donnée personnelle).

Appelé par scripts/depuis_site.py (action GitHub « site ») ; le serveur relit data/semaine.json avec data/matchs.json.
"""
import json
from datetime import date, timedelta
from pathlib import Path

from export_cartes import mots

DATA = Path(__file__).resolve().parent.parent / "data"
DEBUT_SAISON = date(2026, 8, 1)


def lundi(j):
    j = date.fromisoformat(j) if isinstance(j, str) else j
    return j - timedelta(days=j.weekday())


def carte_de(nom, cartes):
    """La carte d'un nom de feuille : les mots du nom de la carte doivent être contenus dans ceux de la feuille (un seul joueur)."""
    m = mots(nom.replace("--", " "))
    trouves = [c for c in cartes if (mc := mots(c["nom"].replace("--", " "))) and mc <= m]
    return trouves[0] if len(trouves) == 1 else None


def lignes_club(k, d, cartes, avant):
    """Matchs joués du club (équipe k) avant le lundi `avant` : par semaine, les lignes de la feuille du côté du club."""
    club, noms = str(d["club"]), {tid: (t.get("short") or t.get("nom") or tid) for tid, t in d.get("teams", {}).items()}
    semaines = {}
    for e in d.get("played_club", []):
        if not e.get("sheet") or not e.get("date") or e.get("forfait"):
            continue
        j = date.fromisoformat(e["date"])
        if j < DEBUT_SAISON or lundi(j) >= avant:
            continue
        cote = "h" if str(e["home"]) == club else "a" if str(e["away"]) == club else None
        if not cote:
            continue
        adv = noms.get(str(e["away" if cote == "h" else "home"]), "")
        score = [e["hs"], e["as"]] if cote == "h" else [e["as"], e["hs"]]
        m = {"rid": str(e["rid"]), "date": e["date"], "adv": adv, "score": score, "lieu": "dom" if cote == "h" else "ext"}
        s = semaines.setdefault(lundi(j).isoformat(), {"matchs": [], "joueurs": {}})
        s["matchs"].append(m)
        for ligne in e["sheet"].get(cote, []):
            c = carte_de(str(ligne[0]), cartes)
            if not c:
                continue
            buts, tirs, arrets = int(ligne[2] or 0), int(ligne[3] or 0), int(ligne[5] or 0)
            x = s["joueurs"].setdefault(c["id"], {"carte": c["id"], "nom": c["nom"], "buts": 0, "tirs": 0, "arrets": 0, "rid": m["rid"]})
            x["buts"] += buts; x["tirs"] += max(tirs, buts); x["arrets"] += arrets
    return semaines


def points(x):
    return x["buts"] + x["arrets"] / 2


def choisir(candidats, deja):
    """Le meilleur des candidats pas encore élus ; si tous l'ont été, le cycle repart (le moins souvent élu d'abord)."""
    vivants = [x for x in candidats if points(x) > 0]
    if not vivants:
        return None
    frais = [x for x in vivants if deja.get(x["carte"], 0) == 0]
    pool = frais or [x for x in vivants if deja.get(x["carte"], 0) == min(deja.get(y["carte"], 0) for y in vivants)]
    return max(pool, key=lambda x: (points(x), x["buts"] / x["tirs"] if x["tirs"] else 0, -x["tirs"], x["nom"]))


def joueurs_semaine(D, cartes, ancien=None, aujourdhui=None):
    """Toutes les semaines finies de la saison (celles d'avant le lundi d'aujourd'hui), les anciennes gardées telles quelles."""
    aujourdhui = aujourdhui or date.today()
    avant = lundi(aujourdhui)
    gardees = {s["lundi"]: s for s in (ancien or {}).get("semaines", [])}
    par_equipe = {}   # équipe → semaine → lignes
    for k, d in D.items():
        eq = k.upper()
        if not any(c["equipe"] == eq for c in cartes):
            continue   # équipe sans cartes (jeunes) : pas de joueur de la semaine
        par_equipe[eq] = lignes_club(k, d, cartes, avant)   # un joueur d'une autre équipe du club peut être élu
    lundis = sorted({l for s in par_equipe.values() for l in s} | set(gardees))
    deja = {eq: {} for eq in par_equipe}
    semaines = []
    for l in lundis:
        g = gardees.get(l, {"lundi": l, "equipes": {}})
        equipes = dict(g.get("equipes", {}))
        pris = {x["carte"] for x in equipes.values()}
        for eq in sorted(par_equipe):
            if eq in equipes or l not in par_equipe[eq]:
                continue
            s = par_equipe[eq][l]
            x = choisir([y for y in s["joueurs"].values() if y["carte"] not in pris], deja[eq])
            if not x:
                continue
            m = next(m for m in s["matchs"] if m["rid"] == x["rid"])
            equipes[eq] = {"carte": x["carte"], "nom": x["nom"], "buts": x["buts"], "tirs": x["tirs"], "arrets": x["arrets"],
                           "matchs": len(s["matchs"]), "match": {k: m[k] for k in ("date", "adv", "score", "lieu")}}
            pris.add(x["carte"])
        for eq, x in equipes.items():
            deja.setdefault(eq, {})[x["carte"]] = deja.setdefault(eq, {}).get(x["carte"], 0) + 1
        if equipes:
            semaines.append({"lundi": l, "equipes": dict(sorted(equipes.items()))})
    return {"maj": aujourdhui.isoformat(), "saison": "2026-2027", "semaines": semaines}


def maj(D, aujourdhui=None):
    """Met data/semaine.json à jour ; renvoie (contenu, a_change)."""
    cartes = json.loads((DATA / "cartes.json").read_text(encoding="utf-8"))["cartes"]
    f = DATA / "semaine.json"
    ancien = json.loads(f.read_text(encoding="utf-8")) if f.exists() else None
    nouveau = joueurs_semaine(D, cartes, ancien, aujourdhui)
    if ancien and ancien.get("semaines") == nouveau["semaines"]:
        return nouveau, False
    f.write_text(json.dumps(nouveau, ensure_ascii=False, indent=1), encoding="utf-8")
    return nouveau, True
