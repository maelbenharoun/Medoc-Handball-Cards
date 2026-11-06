"""Met à jour les scores et les horaires des matchs à parier (data/matchs.json) d'après ffhandball.fr.

Lancé par l'action GitHub « resultats » (.github/workflows/resultats.yml) le lundi et le jeudi très tôt ; le serveur
relit ensuite data/matchs.json et paie les paris gagnants (synchro_matchs_* dans supabase/schema.sql).
Ne change que les scores, les dates et les heures des matchs déjà connus (les probabilités du modèle restent celles
de scripts/export_cartes.py). Pages publiques des poules seulement : scores et noms de clubs, aucune donnée personnelle.

Usage : python scripts/resultats_ffhb.py            (écrit data/matchs.json s'il y a du nouveau)
        python scripts/resultats_ffhb.py --essai    (affiche sans rien écrire)
"""
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime
from html.parser import HTMLParser
from pathlib import Path

# les poules des 4 équipes du club (site_data.json → « source » sur medochandballstats.com)
POULES = {
    "SG1": "https://www.ffhandball.fr/competitions/saison-2026-2027-22/regional/excellence-regionale-masculine-32443/poule-190624/",
    "SG2": "https://www.ffhandball.fr/competitions/saison-2026-2027-22/departemental/gironde-16-masculins-honneur-excellence-32459/poule-190874/",
    "SF1": "https://www.ffhandball.fr/competitions/saison-2026-2027-22/regional/excellence-regionale-feminine-32433/poule-190618/",
    "SF2": "https://www.ffhandball.fr/competitions/saison-2026-2027-22/departemental/gironde-16-feminines-honneur-32465/poule-190880/",
}
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
PAUSE = 1.0   # secondes entre deux pages (accès poli, comme la collecte de handball-pronos)
FICHIER = Path(__file__).resolve().parent.parent / "data" / "matchs.json"


def page(url, essais=4):
    for t in range(essais):
        time.sleep(PAUSE)
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 429 or e.code >= 500:
                time.sleep(20 * (t + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(10 * (t + 1))
    raise RuntimeError(f"ffhandball.fr ne répond pas : {url}")


class _Composants(HTMLParser):
    """Les pages « compétitions » portent leurs données en JSON dans <smartfire-component name=… attributes=…>."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.trouves = {}

    def handle_starttag(self, tag, attrs):
        if tag == "smartfire-component":
            d = dict(attrs)
            if d.get("name") and d.get("attributes"):
                try:
                    self.trouves.setdefault(d["name"], json.loads(d["attributes"]))
                except ValueError:
                    pass


def composant(html, nom):
    p = _Composants()
    p.feed(html or "")
    return p.trouves.get(nom) or {}


def J(v):
    return json.loads(v) if isinstance(v, str) else (v or {})


def score(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def rencontres_poule(url):
    rl = composant(page(url), "competitions---rencontre-list")
    out = []
    for jn in J((rl.get("poule") or {}).get("journees")) or []:
        n = int(jn["journee_numero"])
        rl2 = composant(page(url + f"journee-{n}/"), "competitions---rencontre-list")
        out += rl2.get("rencontres") or []
    return out


def main():
    essai = "--essai" in sys.argv
    d = json.loads(FICHIER.read_text(encoding="utf-8"))
    par_rid = {m["rid"]: m for m in d["matchs"]}
    changes = []
    for eq, url in POULES.items():
        rs = rencontres_poule(url)
        print(f"{eq} : {len(rs)} rencontres lues")
        for r in rs:
            m = par_rid.get(str(r.get("ext_rencontreId")))
            if not m:
                continue
            avant = (m.get("score"), m.get("date"), m.get("heure"))
            s1, s2 = score(r.get("equipe1Score")), score(r.get("equipe2Score"))
            if s1 is not None and s2 is not None and m.get("score") is None:
                # match joué : le score ; les probabilités restent figées (le serveur les garde aussi)
                m["score"] = [s1, s2]
            quand = r.get("date")   # « 2026-11-07T19:00:00+01:00 »
            if quand and m.get("score") is None:
                try:
                    t = datetime.fromisoformat(quand)
                    m["date"], h = t.date().isoformat(), t.strftime("%H:%M")
                    m["heure"] = h if h != "00:00" else m.get("heure")
                except ValueError:
                    pass
            if (m.get("score"), m.get("date"), m.get("heure")) != avant:
                changes.append(f'{eq} J{m.get("j")} {m["dom"]} – {m["ext"]} : {avant} → {(m.get("score"), m.get("date"), m.get("heure"))}')
    print("\n".join(changes) or "rien de nouveau")
    if changes and not essai:
        d["maj"] = date.today().isoformat()
        d["matchs"].sort(key=lambda m: (m["date"], m.get("heure") or "", m["equipe"]))
        FICHIER.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{len(changes)} changements → {FICHIER}")


if __name__ == "__main__":
    main()
