"""Fiche de chaque joueur pour le jeu, d'après les stats de medochandballstats.com.

Sources (dépôt handball-pronos) : la ligne du joueur dans teams/<équipe>/site_data.json (saison en cours)
et sa fiche dans joueurs.json (toutes ses saisons au club, déroulé des feuilles de match).
Seulement des statistiques sportives : ni présence, ni horaires, ni trajets, ni numéro de licence.

La fiche est une liste de sections {id, titre, style, lignes: [{id, l, v, d?}]} ; l'outil admin.html
peut tout changer par-dessus (voir ficheDe dans cartes.js).
Les « stats rigolotes » sont celles des fiches du site (fonction viewPlayer de template2.html.txt) ;
on garde les 5 où le joueur se démarque le plus des autres joueurs du club.
"""

MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
NB_RIGOLOTES = 5


def f1(x):
    return f"{x:.1f}".replace(".", ",")


def pct(x):
    return f"{round(100 * x)} %"


def jour(d):
    a, m, j = d[:10].split("-")
    return f"{int(j)} {MOIS[int(m) - 1]} {a}"


def mmss(s):
    return f"{s // 60}’{s % 60:02d}"


def match_txt(m):
    """« contre X (SF1, 26 sept. 2026, gagné 33-28) » : score du club d'abord."""
    bp, bc = (int(x) for x in m["score"].split("-"))
    res = "gagné" if bp > bc else "nul" if bp == bc else "perdu"
    return f"{'contre' if m['lieu'] == 'dom' else 'à'} {m['adv']} ({m['equipe']}, {jour(m['date'])}, {res} {bp}-{bc})"


def candidates(J, g):
    """Toutes les stats rigolotes possibles : (clé, valeur de comparaison, titre, chiffre, phrase)."""
    C = []
    fd = J.get("fdm") or {}
    if (J.get("record") or {}).get("buts", 0) > 0:
        r = J["record"]
        C.append(("record", r["buts"], "Le record", str(r["buts"]), f"buts sur un match, {match_txt(r)}."))
    if J.get("dix"):
        C.append(("dix", J["dix"], "Le Club des 10", str(J["dix"]), f"match{'s' if J['dix'] > 1 else ''} à 10 buts ou plus. Rare : {g('seules quelques joueuses', 'seuls quelques joueurs')} du club y arrivent."))
    elif J.get("cinq"):
        C.append(("cinq", J["cinq"], "Le Club des 5", str(J["cinq"]), f"match{'s' if J['cinq'] > 1 else ''} à 5 buts ou plus sur {J['n']}."))
    v = J.get("victime")
    if v and v["buts"] >= 3:
        C.append(("victime", v["buts"] / max(1, v["mj"]), "La victime préférée", str(v["buts"]),
                  f"buts en {v['mj']} matchs contre {v['adv']}, l’adversaire qu’{g('elle', 'il')} punit le plus."))
    if (J.get("serie_but") or 0) >= 3:
        C.append(("serie_but", J["serie_but"], "La série", str(J["serie_but"]), "matchs de suite avec au moins un but."))
    va, vs = J.get("v_avec") or [0, 0], J.get("v_sans") or [0, 0]
    if va[1] >= 3 and vs[1] >= 3:
        a, b = va[0] / va[1], vs[0] / vs[1]
        C.append(("porte", abs(a - b), g("La porte-bonheur", "Le porte-bonheur") if a >= b else "Le chat noir ?", pct(a),
                  f"de victoires quand {g('elle', 'il')} est sur la feuille ({va[0]} sur {va[1]}), contre {pct(b)} sans {g('elle', 'lui')} ({vs[0]} sur {vs[1]}) dans les mêmes équipes et saisons."))
    if J.get("dom") is not None and J.get("ext") is not None and J["n"] >= 6 and J["bpm"] >= 1.5:
        d = J["dom"] - J["ext"]
        if abs(d) < 0.8:
            t, phr = "Partout chez " + g("elle", "lui"), f"buts par match à domicile ({f1(J['dom'])}) comme à l’extérieur ({f1(J['ext'])}) : le lieu ne change rien."
        else:
            t = g("Reine", "Roi") + " de la maison" if d > 0 else g("Taillée", "Taillé") + " pour la route"
            phr = f"buts par match {'à domicile' if d > 0 else 'à l’extérieur'}, contre {f1(min(J['dom'], J['ext']))} {'à l’extérieur' if d > 0 else 'à domicile'}."
        C.append(("lieu", abs(d), t, f1(max(J["dom"], J["ext"])), phr))
    if fd:
        n = fd.get("n") or 0
        if (fd.get("tirs") or 0) >= 10:
            r = fd["buts"] / fd["tirs"]
            t = g("La sniper", "Le sniper") if r >= 0.7 else "L’efficacité" if r >= 0.55 else "La gâchette facile"
            C.append(("tir", r if r >= 0.55 else 1 - r, t, pct(r), f"de réussite au tir : {fd['buts']} buts sur {fd['tirs']} tirs ({n} feuille{'s' if n > 1 else ''} détaillée{'s' if n > 1 else ''})."))
        if (fd.get("b7") or 0) >= 3:
            C.append(("b7", fd["b7"], "Le jet de 7 m", str(fd["b7"]), f"buts sur jet de 7 mètres. Quand il faut tirer le penalty, c’est souvent {g('elle', 'lui')}."))
        if fd.get("gagne"):
            der = f", la dernière {match_txt(fd['gagne_m'])}" if fd.get("gagne_m") else ""
            C.append(("gagne", fd["gagne"], "Le but de la gagne", str(fd["gagne"]), f"fois {g('elle', 'il')} a marqué le but qui donne l’avance définitive{der}."))
        if (fd.get("money") or 0) >= 2:
            C.append(("money", fd["money"], "Money time", str(fd["money"]), "buts dans les 5 dernières minutes de match."))
        if (fd.get("ouvre") or 0) >= 2:
            C.append(("ouvre", fd["ouvre"], g("L’ouvreuse", "L’ouvreur"), str(fd["ouvre"]), f"fois {g('elle', 'il')} a marqué le premier but du match pour le club."))
        if fd.get("early") is not None and fd["early"] <= 180:
            C.append(("early", -fd["early"], g("Pressée", "Pressé"), mmss(fd["early"]), "son but le plus rapide dans un match. Pas le temps de s’échauffer."))
        if fd.get("d2"):
            ab = fd["d2"] / max(1, n) >= 0.5
            plus = (f" et {fd['av']} avertissement{'s' if fd['av'] > 1 else ''}" if fd.get("av") else "") \
                + (f", plus {fd['dis']} carton{'s' if fd['dis'] > 1 else ''} rouge{'s' if fd['dis'] > 1 else ''}" if fd.get("dis") else "")
            C.append(("d2", fd["d2"] / max(1, n), g("L’abonnée aux 2 minutes", "L’abonné aux 2 minutes") if ab else "Le banc de pénalité", str(fd["d2"]),
                      f"exclusion{'s' if fd['d2'] > 1 else ''} de 2 minutes{plus} en {n} match{'s' if n > 1 else ''} détaillé{'s' if n > 1 else ''}."))
        elif n >= 5:
            C.append(("fairplay", n, "Fair-play", "0", f"exclusion en {n} matchs détaillés. Rien à signaler pour les arbitres."))
        if (fd.get("capt") or 0) >= 2:
            C.append(("capt", fd["capt"], "Le brassard", str(fd["capt"]), f"matchs comme capitaine."))
    A = J.get("arrets_gk") or J.get("arrets")
    if A and A[0] >= 20 and A[0] / max(1, A[1]) >= 3:
        C.append(("mur", A[0] / max(1, A[1]), "Le Mur", str(A[0]),
                  f"arrêts depuis 2023, {f1(A[0] / max(1, A[1]))} par match " + (f"joué dans les buts ({A[1]} match{'s' if A[1] > 1 else ''} avec au moins un arrêt)." if J.get("arrets_gk") else "d’après les statistiques officielles.")))
    if fd:
        n = fd.get("n") or 0
        if (fd.get("egal") or 0) >= 2:
            C.append(("egal", fd["egal"], g("L’égalisatrice", "L’égalisateur"), str(fd["egal"]), f"buts qui ramènent l’équipe à égalité, sur {n} feuille{'s' if n > 1 else ''} détaillée{'s' if n > 1 else ''}."))
        if (fd.get("menee") or 0) >= 5 and fd.get("nev"):
            C.append(("menee", fd["menee"] / fd["nev"], "Jamais sans combattre", str(fd["menee"]), f"buts marqués quand l’équipe était menée, soit {pct(fd['menee'] / fd['nev'])} de ses buts."))
        if fd.get("serie"):
            C.append(("show", fd["serie"][0], g("Le one-woman-show", "Le one-man-show"), str(fd["serie"][0]), f"buts de suite de l’équipe marqués par {g('elle', 'lui')}, {match_txt(fd['serie'][1])}."))
        if fd.get("eclair") and fd.get("gap") is not None and fd["gap"] >= 5:   # 0 s : deux buts notés à la même seconde
            C.append(("eclair", -fd["gap"], "Le doublé éclair", f"{fd['gap']} s", "entre deux de ses buts dans un même match"
                      + (f" ; {fd['eclair']} doublés en moins d’une minute en tout." if fd["eclair"] > 1 else ".")))
        if (fd.get("nev") or 0) >= 15:
            r = fd["mt2"] / fd["nev"]
            if r >= 0.65:
                C.append(("mitemps", r - 0.5, "Le diesel", pct(r), f"de ses buts après la pause : {g('elle', 'il')} monte en puissance."))
            elif r <= 0.35:
                C.append(("mitemps", 0.5 - r, "La fusée", pct(1 - r), f"de ses buts avant la pause : {g('elle', 'il')} attaque fort."))
    return C


def rigolotes(J, g, club):
    """Les 5 stats rigolotes les plus marquantes : la place du joueur parmi tous ceux du club (ceux qui n'ont pas
    cette stat comptent derrière lui, donc une stat rare compte plus) ; à égalité, l'ordre des fiches du site."""
    C = candidates(J, g)
    total = club.get("_total") or 1
    def rang(cle, v):
        autres = club.get(cle) or []
        return (total - len(autres) + sum(x <= v for x in autres)) / total
    return sorted(C, key=lambda c: -rang(c[0], c[1]))[:NB_RIGOLOTES]


def valeurs_club(joueurs, genres):
    """Pour chaque stat rigolote, les valeurs de tous les joueurs du club (pour savoir qui se démarque)."""
    club = {}
    for jid, J in joueurs.items():
        g = (lambda f, m: f) if genres.get(jid, J.get("g")) == "F" else (lambda f, m: m)
        for c in candidates(J, g):
            club.setdefault(c[0], []).append(c[1])
    club["_total"] = len(joueurs)
    return club


def fiche(carte, p, J, club):
    """p : sa ligne de la saison (site_data.json) ; J : sa fiche au club (joueurs.json) ou None."""
    g = (lambda f, m: f) if carte["genre"] == "F" else (lambda f, m: m)
    S = []
    # cette saison
    L = [{"id": "mj", "l": "Matchs joués", "v": str(p["mj"])},
         {"id": "buts", "l": "Buts", "v": str(p.get("buts") or 0)},
         {"id": "bpm", "l": "Buts par match", "v": f1(p.get("bpm") or 0)}]
    if p.get("max"):
        L.append({"id": "max", "l": "Record en un match", "v": f"{p['max']} buts"})
    tir = p.get("tir") or [0, 0]
    if tir[1]:
        L.append({"id": "tir", "l": "Réussite au tir", "v": f"{pct(tir[0] / tir[1])} ({tir[0]} sur {tir[1]})"})
    if p.get("part"):
        L.append({"id": "part", "l": "Part des buts de l’équipe", "v": pct(p["part"])})
    if p.get("last3"):
        L.append({"id": "last3", "l": "3 derniers matchs", "v": " · ".join(str(x) for x in p["last3"]) + " buts"})
    if p.get("min"):
        L.append({"id": "min", "l": "Minutes par match (estimées)", "v": str(round(p["min"][0]))})
    if (p.get("gk_mj") or 0) >= 2 and (p.get("arrets_pm") or 0) >= 2:
        L.append({"id": "arr", "l": "Arrêts par match dans les buts", "v": f1(p.get("arrets_pm") or 0)})
    S.append({"id": "saison", "titre": "Cette saison", "style": "lignes", "lignes": L})
    if not J:
        return S
    # stats rigolotes
    S.append({"id": "fun", "titre": "Stats rigolotes", "style": "fun",
              "lignes": [{"id": c[0], "l": c[2], "v": c[3], "d": c[4]} for c in rigolotes(J, g, club)]})
    # au club
    deb = J.get("debut") or ""
    L = [{"id": "depuis", "l": "Au club depuis", "v": f"{MOIS[int(deb[5:7]) - 1]} {deb[:4]}" if deb else "–"},
         {"id": "n", "l": "Matchs au club", "v": str(J["n"])},
         {"id": "buts", "l": "Buts au club", "v": str(J["buts"])},
         {"id": "bpm", "l": "Buts par match", "v": f1(J.get("bpm") or 0)}]
    va = J.get("v_avec") or [0, 0]
    if va[1]:
        L.append({"id": "vic", "l": f"Victoires quand {g('elle', 'il')} joue", "v": f"{va[0]} sur {va[1]} ({pct(va[0] / va[1])})"})
    S.append({"id": "club", "titre": "Au club", "style": "lignes", "lignes": L})
    # saison par saison (la plus récente d'abord)
    L = []
    for s in reversed(J.get("saisons") or []):
        bil = f" · {s.get('g', 0)} V, {s.get('n', 0)} N, {s.get('p', 0)} D" if s.get("mj") else ""
        L.append({"id": f"{s['saison']}-{s['equipe']}", "l": f"{s['saison']} · {s['equipe']}",
                  "v": f"{s['mj']} match{'s' if s['mj'] > 1 else ''} · {s['buts']} but{'s' if s['buts'] > 1 else ''}{bil}"})
    if L:
        S.append({"id": "saisons", "titre": "Saison par saison", "style": "lignes", "lignes": L})
    # derniers matchs
    L = []
    for d, eq, adv, lieu, score, b in J.get("last") or []:
        bp, bc = (int(x) for x in score.split("-"))
        res = "Victoire" if bp > bc else "Nul" if bp == bc else "Défaite"
        L.append({"id": d, "l": f"{jour(d)} · {'contre' if lieu == 'dom' else 'à'} {adv}", "v": f"{res} {bp}-{bc} · {b} but{'s' if b > 1 else ''}"})
    if L:
        S.append({"id": "derniers", "titre": "Derniers matchs", "style": "lignes", "lignes": L})
    return S
