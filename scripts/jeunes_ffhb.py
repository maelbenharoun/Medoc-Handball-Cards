"""Buts des équipes -15 du club (-15F, -15G), lus sur ffhandball.fr, pour les joueurs de la semaine (demande de Maël, 21 nov. 2026).

Les -15 ne sont pas sur medochandballstats.com : on lit directement les pages publiques de la FFHB, comme scripts/resultats_ffhb.py.
- Compétitions U15 du comité de Gironde (filles → -15F, garçons → -15G), toutes les poules (phases comprises) où joue une équipe
  « MEDOC » ; pour chaque match joué, la liste des joueurs de la page du match (composant « rencontre-liste-joueurs » : nom,
  prénom, numéro, buts ; ni tirs, ni arrêts, ni licence).
- Seuls les joueurs qui ont une carte dans le jeu sont gardés (nom, numéro, buts) : data/jeunes.json ne contient pas les autres.
- Format proche de site_data.json du site ({club, teams, played_club}), relu par scripts/semaine.py avec les équipes du site.
- Un match déjà lu n'est pas relu (une liste pas encore publiée ou aux buts cachés l'est au passage suivant).

Lancé par l'action GitHub « resultats » (lundi et jeudi). Usage : python scripts/jeunes_ffhb.py [--essai]
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from resultats_ffhb import J, composant, page   # noqa: E402  (accès poli : 1 page par seconde, reprises)
import semaine                                   # noqa: E402

BASE = "https://www.ffhandball.fr/competitions/"
SAISON = 22   # 2026-2027
COMITE = "departemental/o-comite-de-gironde-61/"
GARDE = re.compile(r"U15|-15", re.I)
EXCLU = re.compile(r"^TQ |LOISIR|COUPE", re.I)
CLUB = re.compile(r"\bMEDOC\b", re.I)
FICHIER = Path(__file__).resolve().parent.parent / "data" / "jeunes.json"
MOTS_CLUB = {"HANDBALL", "HAND", "BALL", "CLUB", "HBC", "HB", "HBCC", "US", "AS", "ES", "JS", "SA", "SC", "CA", "AL", "ASL", "UA", "OC"}


def saison():
    return f"saison-{SAISON + 2004}-{SAISON + 2005}-{SAISON}/"


def slug(s):
    import unicodedata
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def equipe_jeu(comp):
    lib = (comp.get("libelle") or "").upper()
    if "FEMI" in lib or comp.get("genre") == "F":
        return "-15F"
    if "MASC" in lib or comp.get("genre") == "M":
        return "-15G"
    return None


def nom_club(lib):
    """« US PAREMPUYRE HANDBALL » → « Parempuyre » (comme les noms courts du site)."""
    m = [w for w in re.split(r"\s+", lib or "") if w and w.upper() not in MOTS_CLUB]
    return " ".join(w if w.isdigit() else w.capitalize() for w in m) or (lib or "").title()


def nom_joueur(j):
    prenom = "-".join(x.capitalize() for x in (j.get("prenom") or "").strip().split("-"))
    nom = " ".join("-".join(x.capitalize() for x in w.split("-")) for w in (j.get("nom") or "").strip().split())
    return f"{prenom} {nom}".strip()


def poules_club():
    """Poules U15 de Gironde où joue une équipe du club : [(équipe du jeu, url de la poule, ids des équipes du club, noms)]."""
    menu = composant(page(BASE + saison() + COMITE), "competitions---competition-main-menu")
    out = []
    for c in menu.get("competitions") or []:
        lib = c.get("libelle", "")
        eq = equipe_jeu(c)
        if not GARDE.search(lib) or EXCLU.search(lib) or not eq:
            continue
        cu = BASE + saison() + "departemental/" + slug(lib) + "-" + str(c["ext_competitionId"]) + "/"
        sel = composant(page(cu), "competitions---poule-selector")
        for p in sel.get("poules") or []:
            pu = cu + f"poule-{p['ext_pouleId']}/"
            ps = composant(page(pu), "competitions---poule-selector")
            opts = ps.get("equipe_options") or []
            club = {str(o["id"]) for o in opts if CLUB.search(o.get("libelle") or "")}
            if club:
                out.append((eq, pu, club, {str(o["id"]): o.get("libelle") or "" for o in opts}))
    return out


def rencontres(pu):
    rl = composant(page(pu), "competitions---rencontre-list")
    out = []
    for jn in J((rl.get("poule") or {}).get("journees")) or []:
        if (jn.get("date_debut") or "9999") > date.today().isoformat():
            continue
        out += composant(page(pu + f"journee-{int(jn['journee_numero'])}/"), "competitions---rencontre-list").get("rencontres") or []
    return out


def score(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def main():
    essai = "--essai" in sys.argv
    cartes = semaine.catalogue()
    ancien = json.loads(FICHIER.read_text(encoding="utf-8")) if FICHIER.exists() else {"equipes": {}}
    equipes = {}
    for eq, pu, club, noms in poules_club():
        de_eq = [c for c in cartes if eq in semaine.equipes_carte(c)]
        if not de_eq and not essai:
            print(f"{eq} : aucune carte connue (catalogue du serveur indisponible ?) : gardé tel quel")
            continue
        vieux = {e["rid"]: e for e in (ancien["equipes"].get(eq) or {}).get("played_club", [])}
        d = equipes.setdefault(eq, {"club": "medoc", "teams": {}, "played_club": []})
        for r in rencontres(pu):
            rid = str(r["ext_rencontreId"])
            e1, e2 = str(r.get("equipe1Id")), str(r.get("equipe2Id"))
            if e1 not in club and e2 not in club:
                continue
            hs, as_ = score(r.get("equipe1Score")), score(r.get("equipe2Score"))
            if hs is None or as_ is None or not r.get("date"):
                continue
            adv = e2 if e1 in club else e1
            d["teams"][adv] = {"nom": nom_club(noms.get(adv) or r.get("equipe2Libelle" if e1 in club else "equipe1Libelle"))}
            e = {"rid": rid, "date": r["date"][:10], "home": "medoc" if e1 in club else adv, "away": "medoc" if e2 in club else adv, "hs": hs, "as": as_}
            v = vieux.get(rid)
            if v and v.get("sheet"):
                e["sheet"] = v["sheet"]
            else:
                hp = page(pu + f"rencontre-{rid}/") or ""
                lj = composant(hp, "competitions---rencontre-liste-joueurs")
                if essai:   # diagnostic (sans nom) : la page, ses composants, la liste des joueurs
                    import re as _re
                    print("  page", rid, len(hp), "car.", sorted(set(_re.findall(r'name="(competitions---[a-z-]+)"', hp)))[:12],
                          "| hideButs", lj.get("hideButs"), "| joueurs", len(lj.get("statsJoueurs") or []),
                          "| du club", sum(1 for j in lj.get("statsJoueurs") or [] if str(j.get("equipeId")) in club), "| ids club", sorted(club),
                          "| fdm", bool(r.get("fdmCode")),
                          "| buts du club", sum(score(j.get("buts")) or 0 for j in lj.get("statsJoueurs") or [] if str(j.get("equipeId")) in club),
                          "| score du club", as_ if e2 in club else hs, "| champs", sorted({k for j in lj.get("statsJoueurs") or [] for k in j}))
                cote = "h" if e1 in club else "a"
                lignes = []
                for j in lj.get("statsJoueurs") or []:
                    if str(j.get("equipeId")) not in club:
                        continue
                    n = nom_joueur(j)
                    if essai or semaine.carte_de(n, de_eq):   # seulement les joueurs qui ont une carte (essai : tous)
                        lignes.append([n, str(j.get("numero") or ""), score(j.get("buts")) or 0])
                if lj.get("statsJoueurs") and not lj.get("hideButs"):   # buts cachés ou liste pas encore publiée : relu la prochaine fois
                    e["sheet"] = {cote: lignes, "a" if cote == "h" else "h": []}
            d["played_club"].append(e)
        print(f"{eq} : {len(d['played_club'])} matchs, {sum(1 for e in d['played_club'] if e.get('sheet'))} avec la liste des joueurs")
    # une équipe non lue cette fois (FFHB, catalogue) garde ses matchs d'avant
    for eq, v in ancien["equipes"].items():
        equipes.setdefault(eq, v)
    for d in equipes.values():
        d["played_club"].sort(key=lambda e: (e["date"], e["rid"]))
    contenu = {"maj": date.today().isoformat(), "saison": "2026-2027", "equipes": dict(sorted(equipes.items()))}
    if essai:   # sans aucun nom (journal public) : matchs, et par joueur une empreinte du nom, ses matchs et ses buts
        import hashlib
        for eq, d in contenu["equipes"].items():
            tot = {}
            for e in d["played_club"]:
                print(eq, e["date"], d["teams"].get(e["home"] if e["away"] == "medoc" else e["away"], {}).get("nom"), e["hs"], e["as"], len((e.get("sheet") or {}).get("h" if e["home"] == "medoc" else "a", [])), "joueurs")
                for l in (e.get("sheet") or {}).get("h" if e["home"] == "medoc" else "a", []):
                    k = hashlib.sha1("-".join(sorted(semaine.mots(l[0]))).encode()).hexdigest()[:8]
                    t = tot.setdefault(k, [0, 0]); t[0] += 1; t[1] += l[2]
            print(eq, " ".join(f"{k}:{m}/{b}" for k, (m, b) in sorted(tot.items())))
        return
    if {k: v for k, v in ancien.items() if k != "maj"} != {k: v for k, v in contenu.items() if k != "maj"}:
        FICHIER.write_text(json.dumps(contenu, ensure_ascii=False, indent=1), encoding="utf-8")
        print("data/jeunes.json mis à jour")


if __name__ == "__main__":
    main()
