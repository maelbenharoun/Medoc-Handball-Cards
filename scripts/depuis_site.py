"""Met à jour les cotes et les fiches des matchs à parier d'après la page publique de medochandballstats.com.

Lancé par l'action GitHub « site » (.github/workflows/site.yml) toutes les heures : dès que le site a été republié,
data/matchs.json (calendrier, probabilités du modèle) et data/face.json (fiches des matchs) sont refaits, et le serveur
les reprend à sa synchro suivante (synchro_matchs_* dans supabase/schema.sql).
La page publique ne contient que ce que tout visiteur voit (les données réservées en sont retirées par acces.py) :
calendrier, résultats, classements et statistiques d'équipes ; aucun numéro de licence.
Les scores déjà connus (lus sur ffhandball.fr par scripts/resultats_ffhb.py) ne sont jamais effacés.

Usage : python scripts/depuis_site.py                 (télécharge la page)
        python scripts/depuis_site.py page.html       (une page déjà téléchargée)
"""
import json
import sys
import urllib.request
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_cartes import EQUIPES, matchs_de   # noqa: E402  (même calcul que l'export complet)
from export_face import fiches                 # noqa: E402

ADRESSES = ["https://raw.githubusercontent.com/maelbenharoun/medochandballstats/main/index.html", "https://medochandballstats.com/"]
DATA = Path(__file__).resolve().parent.parent / "data"


class _Donnees(HTMLParser):
    """Le bloc <script type="application/json" id="data"> de la page : {teams_order, data: {sg1: site_data, …}}."""
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.dedans, self.morceaux = False, []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "script" and a.get("id") == "data" and a.get("type") == "application/json":
            self.dedans = True

    def handle_endtag(self, tag):
        if tag == "script":
            self.dedans = False

    def handle_data(self, x):
        if self.dedans:
            self.morceaux.append(x)


def page():
    for url in ADRESSES:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "medoc-hand-cards (mise à jour des paris)"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8")
        except Exception as e:   # l'autre adresse prend le relais
            print(f"{url} : {e}")
    raise SystemExit("page du site introuvable")


def donnees(html):
    p = _Donnees()
    p.feed(html)
    brut = "".join(p.morceaux).strip()
    if not brut:
        raise SystemExit("données introuvables dans la page (le site a peut-être changé)")
    return json.loads(brut)["data"]


def ecrire_si_change(f, contenu, cle_maj="maj"):
    """N'écrit que si quelque chose a changé (hors date de mise à jour) : pas de commit inutile."""
    avant = json.loads(f.read_text(encoding="utf-8")) if f.exists() else None
    if avant is not None and {k: v for k, v in avant.items() if k != cle_maj} == {k: v for k, v in contenu.items() if k != cle_maj}:
        return False
    f.write_text(json.dumps(contenu, ensure_ascii=False, **({"indent": 1} if f.name == "matchs.json" else {"separators": (",", ":")})), encoding="utf-8")
    return True


def main():
    html = Path(sys.argv[1]).read_text(encoding="utf-8") if len(sys.argv) > 1 else page()
    D = donnees(html)
    manque = [k for k in EQUIPES if k not in D]
    if manque:
        raise SystemExit(f"équipes absentes de la page : {', '.join(manque)}")
    # 1. les matchs (calendrier, probabilités) ; un score déjà connu n'est jamais effacé
    f = DATA / "matchs.json"
    ancien = {m["rid"]: m for m in json.loads(f.read_text(encoding="utf-8"))["matchs"]} if f.exists() else {}
    matchs = {}
    for k in EQUIPES:
        for m in matchs_de(k, D[k]):
            a = ancien.get(m["rid"])
            if a and a.get("score") and not m.get("score"):
                m.update(score=a["score"], p=a.get("p"), date=a["date"], heure=a.get("heure"))
            elif a and not m.get("heure") and a.get("heure"):
                m["heure"] = a["heure"]
            matchs[m["rid"]] = m
    liste = sorted(matchs.values(), key=lambda m: (m["date"], m.get("heure") or "", m["equipe"], m["rid"]))
    a_change = ecrire_si_change(f, {"maj": date.today().isoformat(), "matchs": liste})
    # 2. les fiches des matchs à parier (face-à-face)
    fm, home = {}, None
    for k in EQUIPES:
        home = home or (D[k].get("model") or {}).get("home")
        fm.update(fiches(D[k]))
    b_change = ecrire_si_change(DATA / "face.json", {"maj": date.today().isoformat(), "home": round(home, 2) if home else None, "matchs": fm})
    print(f"site du {', '.join(sorted({str(D[k].get('generated')) for k in EQUIPES}))} : {len(liste)} matchs{' (mis à jour)' if a_change else ''}, "
          f"{len(fm)} fiches{' (mises à jour)' if b_change else ''}")


if __name__ == "__main__":
    main()
