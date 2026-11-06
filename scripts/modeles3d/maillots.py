# Maillots peints sur le modèle Rocketbox Sports_Male_02, d'après les photos du club :
# Médoc = maillot blanc, fines rayures noires en biais sur les épaules (en V vers la poitrine) et les manches,
# points gris dégradés sous les rayures, col et bords marine, numéro noir à droite de la poitrine, écusson à gauche,
# sponsor au ventre, grand numéro dans le dos. Gardien Médoc = rouge à manches longues, rayures noires, pantalon noir.
# Adversaires en bleu, gardien adverse en vert.
# On rastérise le maillage dans l'espace UV pour connaître la position 3D (pose en T) de chaque texel :
# les motifs sont dessinés en 3D, donc ils tombent juste malgré le découpage de la texture.
import sys, json, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
C, T, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
N = 1024
pos = np.fromfile(f'{C}/pos.bin', np.float32).reshape(-1, 3)
nor = np.fromfile(f'{C}/nor.bin', np.float32).reshape(-1, 3)
uv = np.fromfile(f'{C}/uv.bin', np.float32).reshape(-1, 2)
P = np.stack([pos[:, 0], pos[:, 2], -pos[:, 1]], 1)        # X (gauche du porteur = +X), Y haut, Z avant
NN = np.stack([nor[:, 0], nor[:, 2], -nor[:, 1]], 1)
groupes = json.load(open(f'{C}/geo.json'))['groups']
carteP = np.zeros((N, N, 3), np.float32); carteN = np.zeros((N, N, 3), np.float32); couvert = np.zeros((N, N), bool)
for gr in groupes:
    if gr['materialIndex'] != 0: continue
    for t in range(gr['start'], gr['start'] + gr['count'], 3):
        a = uv[t:t + 3] * [N, -N] + [0, N]                       # pixels (v vers le haut)
        x0, y0 = np.floor(a.min(0)).astype(int); x1, y1 = np.ceil(a.max(0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, N - 1), min(y1, N - 1)
        if x1 < x0 or y1 < y0: continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
        d = (a[1, 1] - a[2, 1]) * (a[0, 0] - a[2, 0]) + (a[2, 0] - a[1, 0]) * (a[0, 1] - a[2, 1])
        if abs(d) < 1e-9: continue
        l0 = ((a[1, 1] - a[2, 1]) * (gx - a[2, 0]) + (a[2, 0] - a[1, 0]) * (gy - a[2, 1])) / d
        l1 = ((a[2, 1] - a[0, 1]) * (gx - a[2, 0]) + (a[0, 0] - a[2, 0]) * (gy - a[2, 1])) / d
        l2 = 1 - l0 - l1
        m = (l0 > -.02) & (l1 > -.02) & (l2 > -.02)
        if not m.any(): continue
        L = np.stack([l0[m], l1[m], l2[m]], 1)
        yy, xx = (gy[m] - .5).astype(int), (gx[m] - .5).astype(int)
        carteP[yy, xx] = L @ P[t:t + 3]; carteN[yy, xx] = L @ NN[t:t + 3]; couvert[yy, xx] = True
X, Y, Z = carteP[..., 0], carteP[..., 1], carteP[..., 2]; Nz = carteN[..., 2]
AX = np.abs(X)

orig = np.asarray(Image.open(f'{T}/m301_body_color.tga').convert('RGB').resize((N, N), Image.LANCZOS)).astype(np.float32)
r, g, b = orig[..., 0], orig[..., 1], orig[..., 2]
mx = orig.max(-1); mn = orig.min(-1); s = (mx - mn) / np.maximum(mx, 1)
peau = (r > g) & (g > b) & (s > .14) & (s < .62) & (mx > 70)
liseret = (s > .6) & (r > 140) & (r > g * 1.5)
k = N / 768
def boite(x0, y0, x1, y1):
    m = np.zeros((N, N), bool); m[int(y0 * k):int(y1 * k), int(x0 * k):int(x1 * k)] = True; return m
# boîtes de la texture d'origine, recoupées avec la position 3D (les boîtes débordent sur le maillot)
chaussure = (boite(150, 548, 320, 768) | boite(470, 548, 640, 768)) & (~couvert | (Y < 14))
chaussette = (boite(0, 232, 210, 432) | boite(558, 232, 768, 432)) & (~couvert | (Y < 52))
short = (boite(0, 0, 222, 165) | boite(546, 0, 768, 165)) & (~couvert | ((Y < 100) & (Y > 40)))
fond = (mx < 6) & ~couvert
tissu = ~peau & ~chaussure & ~fond
maillot = tissu & ~short & ~chaussette
# tout le torse est du maillot (l'ancien logo orange passait pour de la peau), sauf le cou
maillot |= couvert & ~fond & (AX <= 16) & (Y > 96) & (Y < 147) & ~short & ~chaussette
# peau des bras (manches longues du gardien) et des jambes (pantalon)
bras = ~fond & ~maillot & couvert & (AX > 16) & (AX < 55) & (Y > 80) & ((AX > 25) | (Y > 108))
jambe = ~fond & ~chaussure & ~chaussette & ~short & couvert & (Y > 8) & (Y < 98) & (AX < 22)
liseret = liseret & couvert & (((Y > 141) & (AX < 14)) | (AX > 24))

def hexa(c): return np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
def lisse(e0, e1, x): t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
rng = np.random.default_rng(3)
grain = np.asarray(Image.fromarray((rng.random((N, N)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.7))).astype(np.float32) / 255
grain = (.96 + .07 * grain)[..., None]

def rayures(epaisseur, periode, f):
    """1 dans une rayure : bande de largeur epaisseur (0-1) de la période"""
    ph = (f / periode) % 1
    return (ph < epaisseur).astype(np.float32)

# poids des rayures sur le torse (V des épaules vers la poitrine) et sur les manches
torse = AX <= 17
f_torse = (20 * AX - 18 * Y) / 26.9                  # lignes qui descendent de l'épaule vers le milieu
w_torse = lisse(0, 15, Y - 116 - .35 * AX)
f_manche = np.where(X > 0, 1, -1) * X * .85 + Y * .5
w_manche = .78 * lisse(13, 21, AX)

police = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
serif = '/usr/share/fonts/truetype/freefont/FreeSerifBoldItalic.ttf'
EC = 14                                               # pixels par cm des décalcomanies
X0, X1, Y0, Y1 = -24, 24, 88, 154
def toile(): return Image.new('RGBA', ((X1 - X0) * EC, (Y1 - Y0) * EC), (0, 0, 0, 0))
def cm(x, y): return ((x - X0) * EC, (Y1 - y) * EC)
def numero(im, txt, x, y, h, coul, contour):
    f = ImageFont.truetype(police, int(h * EC * 1.25))
    ImageDraw.Draw(im).text(cm(x, y), txt, font=f, fill=coul, anchor='mm', stroke_width=max(2, int(h * EC * .05)), stroke_fill=contour)
def ecusson(im, x, y, coul):
    d = ImageDraw.Draw(im); R = 3.1 * EC; cx, cy = cm(x, y)
    d.ellipse((cx - R, cy - R, cx + R, cy + R), outline=coul, width=int(.35 * EC))
    # petit joueur qui tire : tête, corps, bras levé, ballon
    u = EC * .9
    d.ellipse((cx - .35 * u, cy - 1.75 * u, cx + .35 * u, cy - 1.05 * u), fill=coul)
    d.line((cx, cy - 1, cx - .2 * u, cy + 1.1 * u), fill=coul, width=int(.32 * u))
    d.line((cx - .1 * u, cy - .6 * u, cx + 1.1 * u, cy - 1.5 * u), fill=coul, width=int(.25 * u))
    d.line((cx - .2 * u, cy + 1.1 * u, cx - 1 * u, cy + 2 * u), fill=coul, width=int(.25 * u))
    d.line((cx - .2 * u, cy + 1.1 * u, cx + .7 * u, cy + 1.9 * u), fill=coul, width=int(.25 * u))
    d.ellipse((cx + 1 * u, cy - 2.2 * u, cx + 1.6 * u, cy - 1.6 * u), fill=coul)
def sponsor(im, coul):
    d = ImageDraw.Draw(im)
    d.text(cm(0, 109), 'La Table', font=ImageFont.truetype(serif, int(2.3 * EC)), fill=coul, anchor='mm')
    d.text(cm(0, 104.5), 'de ma Dame', font=ImageFont.truetype(serif, int(3.1 * EC)), fill=coul, anchor='mm')
    cx, cy = cm(-1, 112.4); u = EC * .7     # couronne
    d.polygon([(cx - 2 * u, cy + u), (cx - 2 * u, cy - u), (cx - u, cy), (cx, cy - 1.4 * u), (cx + u, cy), (cx + 2 * u, cy - u), (cx + 2 * u, cy + u)], fill=coul)

def decal(im, dos):
    """échantillonne une décalcomanie (face avant ou dos) sur les texels du maillot"""
    a = np.asarray(im).astype(np.float32)
    u = (np.where(dos, -X, X) - X0) * EC; v = (Y1 - Y) * EC
    ok = maillot & couvert & ((Nz < -.3) if dos else (Nz > .3)) & (u >= 0) & (v >= 0) & (u < a.shape[1] - 1) & (v < a.shape[0] - 1)
    px = a[v[ok].astype(int), u[ok].astype(int)]
    return ok, px

def tenue(nom, base, motif, lis, shorts, chaus, num, num_coul, num_contour, gardien=False, pois=None, spons=None, ecu=None, w_motif=1.0, bande='#d8d8d8'):
    out = orig.copy()
    B, M = hexa(base), hexa(motif)
    zone = maillot | (bras if gardien else np.zeros_like(maillot))
    # rayures : torse en V, manches (le gardien en a jusqu'au poignet, plus fines vers le coude)
    ep = np.where(torse, .5 * w_torse, np.where(AX > 30, .42 if gardien else w_manche, w_manche)) * w_motif
    if gardien: ep = np.where(AX > 30, .5 * lisse(53, 34, AX) + .1, ep) * w_motif
    f = np.where(torse, f_torse, f_manche)
    ray = rayures(ep, 2.5 if not gardien else 2.2, f) * couvert
    col = B[None, None] * (1 - ray[..., None]) + M[None, None] * ray[..., None]
    # points dégradés sous les rayures, devant
    if pois is not None:
        pas = 1.45
        gxp = np.round(X / pas) * pas; gyp = np.round(Y / pas) * pas
        gxp = np.where((np.round(Y / pas) % 2) == 1, np.round(X / pas - .5) * pas + pas / 2, gxp)
        dist = np.hypot(X - gxp, Y - gyp)
        wp = lisse(97, 124, Y) * (1 - lisse(124, 134, Y - .0 * AX)) * lisse(-.2, .5, Nz) * (1 - .35 * lisse(8, 16, AX))
        dans = (dist < pas * .48 * wp) & torse & (ray < .5)
        col[dans] = hexa(pois)
    out[zone] = col[zone] * grain[zone]
    # col et bords de manches
    bord = liseret & tissu
    out[bord] = hexa(lis) * grain[bord]
    # short, chaussettes, pantalon du gardien
    out[tissu & short] = hexa(shorts) * grain[tissu & short]
    out[tissu & chaussette] = hexa(chaus) * grain[tissu & chaussette]
    if gardien:   # bas de jogging : la couleur du short répétée jusqu'à la chaussure
        pant = (jambe | (tissu & short) | (tissu & chaussette) | (chaussure & couvert & (Y > 9.5) & (Y < 30))) & couvert
        pant = pant | (np.asarray(Image.fromarray((pant * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0) & ~couvert
        out[pant] = hexa(shorts) * grain[pant]
    # décalcomanies
    av = toile()
    numero(av, num, -8.5, 128.5, 11, num_coul, num_contour)
    if ecu: ecusson(av, 8.5, 129, ecu)
    if spons: sponsor(av, spons)
    ar = toile(); numero(ar, num, 0, 124, 20, num_coul, num_contour)
    for dos, im in ((False, av), (True, ar)):
        ok, px = decal(im, dos)
        al = px[:, 3:4] / 255
        out[ok] = out[ok] * (1 - al) + px[:, :3] * al
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(f'{OUT}/corps-{nom}.jpg', quality=85, optimize=True, progressive=True)

tenue('medoc', '#f4f4f2', '#16171c', '#141c33', '#111214', '#f2f2f2', '7', '#101114', '#ffffff', pois='#9c9ea3', spons='#16171c', ecu='#1b2a55')
tenue('adv', '#1f4fa8', '#173c80', '#ffffff', '#111214', '#1f4fa8', '9', '#ffffff', '#0e2450', w_motif=.0)
tenue('gb-medoc', '#d8352b', '#151515', '#111111', '#141414', '#141414', '1', '#111111', '#ffffff', gardien=True, spons='#151515', ecu='#151515', bande='#d8352b')
tenue('gb-adv', '#2f9e62', '#16402a', '#ffffff', '#141414', '#2f9e62', '12', '#ffffff', '#123a24', gardien=True, w_motif=0)
Image.open(f'{T}/m301_head_color.tga').convert('RGB').resize((N, N), Image.LANCZOS).save(f'{OUT}/tete.jpg', quality=86, optimize=True, progressive=True)
nrm = Image.open(f'{T}/m301_body_normal.tga').convert('RGB').resize((N, N), Image.LANCZOS)
nrm.resize((512, 512), Image.LANCZOS).save(f'{OUT}/corps-n.jpg', quality=90, optimize=True)
# gardiens : jambes du pantalon lisses (sans le relief des chaussettes ni du genou)
na = np.asarray(nrm).copy(); pant = (jambe | (tissu & short) | (tissu & chaussette)) & couvert
na[Image.fromarray(pant).filter(ImageFilter.MaxFilter(5)) and np.asarray(Image.fromarray((pant * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0] = (128, 128, 255)
Image.fromarray(na).resize((512, 512), Image.LANCZOS).save(f'{OUT}/corps-n-gb.jpg', quality=90, optimize=True)
Image.open(f'{T}/m301_head_normal.tga').convert('RGB').resize((512, 512), Image.LANCZOS).save(f'{OUT}/tete-n.jpg', quality=90, optimize=True)
print('ok', couvert.mean())
