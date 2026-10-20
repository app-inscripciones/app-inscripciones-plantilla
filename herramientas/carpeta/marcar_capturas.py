"""Arma las imágenes del manual de instalación a partir de capturas reales: recuadros rojos numerados en lo que
hay que tocar y desenfoque de correos, números, claves y direcciones. Uso: python3 marcar_capturas.py <carpeta-capturas>
Las capturas originales no se guardan en el repositorio; solo las ya marcadas (textos/img)."""
import os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageFile
ImageFile.LOAD_TRUNCATED_IMAGES = True
ORIG = sys.argv[1] if len(sys.argv) > 1 else '.'
DEST = os.path.join(os.path.dirname(__file__), 'textos', 'img')
ROJO = (220, 30, 30)
try: FUENTE = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 30)
except OSError: FUENTE = ImageFont.load_default()

# nombre: (archivo, recorte o None, [(x1,y1,x2,y2,'número')], [zonas a desenfocar])
CAPTURAS = {
    'google-2pasos-activa': ('f4230aaf-image.png', None, [(190, 625, 1190, 687, '1'), (162, 736, 552, 794, '')], [(740, 536, 885, 570)]),
    'google-contrasena-app': ('a36d2550-image.jpg', (0, 250, 1080, 2300), [(108, 1776, 972, 1936, '1'), (684, 2106, 927, 2222, '2')], [(132, 116, 816, 226), (110, 1430, 900, 1580)]),
    'github-robot': ('c339a851-image.png', None, [(700, 567, 1068, 629, '')], [(520, 770, 1240, 917)]),
    'github-2pasos': ('9e603659-image.png', None, [(88, 447, 436, 495, '1'), (486, 740, 842, 792, '2')], [(170, 8, 455, 74)]),
    'supabase-llaves': ('a86f7f0d-image.png', None, [(1316, 470, 1530, 512, '1')], [(684, 616, 946, 646)]),
    'supabase-llave-1': ('51db0d4f-image.png', None, [(584, 102, 970, 217, '1'), (586, 493, 968, 600, '2'), (801, 815, 970, 857, '4')], []),
    'supabase-llave-2': ('f7564733-image.png', None, [(604, 116, 981, 166, '3'), (821, 652, 981, 692, '4')], [(612, 0, 858, 28)]),
    'github-plantilla': ('c246c26b-image.png', (0, 80, 1895, 520), [(1535, 221, 1704, 264, '1')], [(1820, 90, 1880, 140)]),
    'github-copia-formulario': ('99b8ce8c-image.png', (480, 135, 1360, 930), [(1221, 346, 1322, 388, '1'), (725, 499, 1341, 549, '2'), (535, 635, 1341, 685, '3'), (1184, 788, 1322, 839, '4'), (1173, 870, 1342, 922, '5')], [(543, 507, 705, 543)]),
    'github-copia-lista': ('be1bc007-image.png', (0, 0, 1890, 300), [(368, 106, 612, 142, '')], [(88, 14, 160, 42), (408, 240, 482, 262)]),
    'github-actions-instalar': ('c0636021-image.png', (0, 62, 1900, 500), [(371, 116, 457, 152, '1'), (8, 296, 150, 322, '2')], [(90, 78, 162, 102), (760, 366, 824, 384)]),
    'github-registro': ('22453613-image.png', (940, 100, 1905, 965), [(1185, 385, 1645, 432, '1'), (1185, 465, 1645, 511, '2'), (1185, 584, 1645, 630, '3'), (1185, 703, 1645, 751, '4'), (1185, 863, 1645, 914, '5')], []),
    'github-instalar-boton': ('25319ed1-image.png', (0, 62, 1910, 500), [(6, 231, 266, 264, '1'), (1526, 170, 1645, 209, '2')], [(94, 77, 166, 101)]),
    'github-secretos': ('a824c1d8-image.png', (0, 0, 1560, 910), [(805, 58, 895, 98, '1'), (374, 688, 614, 716, '2'), (370, 718, 614, 747, '3'), (999, 604, 1164, 644, '4')], [(88, 21, 162, 47)]),
    'github-secreto-nuevo': ('45298c87-image.png', (620, 100, 1530, 560), [(643, 228, 1512, 264, '1'), (643, 296, 1512, 497, '2'), (642, 506, 738, 542, '3')], []),
    'supabase-entrar': ('5947f649-image.png', (0, 60, 740, 960), [(122, 297, 610, 358, '1')], [(128, 616, 604, 658), (128, 714, 604, 756)]),
    'cloudflare-registro': ('9421675e-image.png', (560, 120, 1300, 965), [(649, 263, 1219, 323, '1')], []),
    'github-instalar-formulario': ('98b6c0b6-image.png', (1466, 62, 1912, 970), [(1477, 211, 1903, 246, '1'), (1477, 300, 1903, 335, '2'), (1477, 389, 1903, 424, '3'), (1477, 478, 1903, 514, '4'), (1789, 925, 1904, 962, '5')], []),
    'supabase-autorizar': ('81666ce3-image.png', (690, 90, 1200, 680), [(943, 465, 1157, 503, '1')], [(730, 316, 1000, 352)]),
    'supabase-organizacion': ('ca38d780-image.png', (530, 110, 1390, 675), [(824, 250, 1361, 302, '1'), (826, 392, 1359, 439, '2'), (826, 509, 1359, 556, '3'), (1187, 618, 1361, 658, '4')], [(838, 262, 1010, 292)]),
    'supabase-llave-3': ('9407ea2e-image.png', None, [(864, 864, 988, 900, '5')], []),
    'cloudflare-inicio': ('1559008c-image.png', (0, 60, 1905, 975), [(1834, 78, 1872, 114, '1')], [(84, 82, 262, 110), (230, 18, 740, 44)]),
    'cloudflare-menu': ('f2216e43-image.png', (1180, 0, 1906, 420), [(1838, 28, 1866, 60, '1'), (1640, 126, 1864, 170, '2')], [(1646, 84, 1866, 114), (80, 30, 260, 58)]),
    'cloudflare-llaves': ('5b192ab9-image.png', None, [(14, 304, 304, 347, '1'), (1688, 120, 1862, 175, '2')], []),
    'cloudflare-plantillas': ('80217df8-image.png', (600, 100, 1610, 905), [(1445, 228, 1576, 283, '1')], []),
    'cloudflare-llave-1': ('1965b2a2-image.png', (600, 110, 1600, 800), [(638, 232, 1208, 287, '1'), (639, 384, 1567, 439, '2'), (639, 455, 1567, 511, '3'), (639, 666, 1195, 721, '4')], []),
    'cloudflare-llave-2': ('2e8dbb15-image.png', (610, 60, 1610, 902), [(630, 448, 1596, 632, ''), (630, 646, 1596, 782, ''), (1382, 846, 1598, 901, '5')], [(856, 296, 1138, 326)]),
    'cloudflare-llave-3': ('98481e71-image.png', (620, 100, 1620, 430), [(638, 216, 1600, 294, ''), (1454, 358, 1604, 413, '6')], [(722, 242, 1080, 270)]),
    'cloudflare-llave-creada': ('15427e03-image.png', (620, 100, 1620, 630), [(654, 235, 1584, 298, '1'), (1534, 251, 1568, 283, '2'), (654, 444, 1584, 540, '✗')], [(668, 246, 1530, 290), (672, 462, 1505, 520)]),
    'github-secretos-listos': ('dc8b6422-image.png', (360, 95, 1530, 900), [(649, 650, 1518, 838, '')], [(88, 20, 162, 46)]),
    'github-repo-pestanas': ('e58725f5-image.png', (0, 0, 1520, 300), [(370, 64, 446, 94, 'A'), (806, 64, 888, 94, 'S')], [(86, 24, 156, 52), (406, 250, 476, 272)]),
    'github-instalar-panel-2': ('9073b013-image.png', None, [(16, 152, 444, 190, '1'), (16, 241, 444, 279, '2'), (16, 330, 444, 368, '3'), (16, 419, 444, 457, '4'), (329, 866, 444, 904, '5')], []),
    'github-actions-lista': ('900bf596-image.png', (0, 25, 1680, 545), [(6, 248, 130, 274, '')], [(86, 28, 156, 54), (756, 506, 816, 524)]),
    'github-instalar-corriendo': ('3d869b75-image.png', (0, 110, 1910, 540), [(593, 222, 705, 270, '1'), (1726, 141, 1864, 177, '✗')], [(96, 28, 166, 54), (372, 248, 444, 268)]),
    'panel-primer-ingreso': ('88b04393-image.png', (0, 0, 1900, 900), [(354, 192, 780, 222, '1'), (358, 242, 1543, 894, '2')], []),
    'panel-ingresar': ('ff29524d-image.png', (560, 90, 1360, 600), [(701, 331, 1219, 405, '1'), (701, 409, 1219, 497, '2')], []),
    'github-instalacion-terminada': ('cd51517a-image.png', (0, 100, 1890, 770), [(222, 223, 310, 262, '1'), (355, 595, 625, 630, '2'), (1726, 133, 1846, 168, '✗')], [(96, 20, 166, 46), (372, 240, 444, 260), (436, 648, 1240, 724)]),
}

def marcar(nombre, archivo, recorte, marcas, borrosos):
    im = Image.open(os.path.join(ORIG, archivo)).convert('RGB')
    for (x1, y1, x2, y2) in borrosos:
        zona = im.crop((x1, y1, x2, y2)).filter(ImageFilter.GaussianBlur(14))
        im.paste(zona, (x1, y1))
    d = ImageDraw.Draw(im)
    for (x1, y1, x2, y2, num) in marcas:
        d.rounded_rectangle((x1, y1, x2, y2), radius=8, outline=ROJO, width=5)
        if num:
            r = 22; cx, cy = x1 - 4, y1 - 4
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=ROJO)
            d.text((cx, cy), num, fill='white', font=FUENTE, anchor='mm')
    if recorte: im = im.crop(recorte)
    if im.width > 1400: im = im.resize((1400, round(im.height * 1400 / im.width)))
    im.save(os.path.join(DEST, nombre + '.png'), optimize=True)

if __name__ == '__main__':
    os.makedirs(DEST, exist_ok=True)
    for n, (a, rc, m, b) in CAPTURAS.items():
        if os.path.exists(os.path.join(ORIG, a)): marcar(n, a, rc, m, b); print('ok', n)
        else: print('falta', a)
