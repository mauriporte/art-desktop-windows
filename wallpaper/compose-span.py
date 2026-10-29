"""A.R.T. black-wood wallpaper for a multi-screen layout, used with Windows' "Span" fit.

  python compose-span.py <wood.png> <m-logo.png> <out.png> <screens> [dx,dy]
  screens: "x,y,w,h;x,y,w,h;..." in Windows' desktop coordinates, e.g. "0,0,1920,1080;1920,430,1920,1080"
  dx,dy: nudge the M from its default spot, in px

Span stretches one picture over the bounding box of all screens, so each screen's part is drawn at exactly its
place: its own full piece of wood (centre-cropped, never squashed) and the M well inside its bottom-right corner.
"""
import sys
from PIL import Image, ImageFilter, ImageOps

wood_src, logo_src, out, spec = sys.argv[1:5]
dx, dy = (int(v) for v in (sys.argv[5] if len(sys.argv) > 5 else '0,0').split(','))
screens = [tuple(int(v) for v in s.split(',')) for s in spec.split(';') if s]
x0, y0 = min(s[0] for s in screens), min(s[1] for s in screens)
W, H = max(s[0] + s[2] for s in screens) - x0, max(s[1] + s[3] for s in screens) - y0
wood = Image.open(wood_src).convert('RGB')
wood = wood.crop((4, 4, wood.width - 4, wood.height - 4))  # the source has a bright line along its right edge: trim all edges


def fit(img, w, h):  # centre crop to the target shape, then scale (as JLD's compose.py)
    r = max(w / img.width, h / img.height)
    im = img.resize((round(img.width * r), round(img.height * r)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def logo(size):  # the M in warm wood-cream (as on the tablet and the Linux desktop)
    src = Image.open(logo_src)
    if src.mode == 'RGBA':  # a cut-out logo: its own transparency is the shape
        a = src.getchannel('A').resize((size, size), Image.LANCZOS).point(lambda p: int(p / 255 * 170))
    else:  # a logo on a dark background: keep the bright letters only
        m = ImageOps.autocontrast(src.convert('L')).resize((size, size), Image.LANCZOS)
        a = m.point(lambda p: 0 if p < 110 else int(min(1, (p - 110) / 110) * 170))
    l = Image.new('RGB', (size, size), (226, 205, 170))
    l.putalpha(a)
    return l


canvas = Image.new('RGB', (W, H), (5, 5, 5))  # outside every screen: never visible
for sx, sy, sw, sh in screens:
    part = fit(wood, sw, sh)
    s = int(min(sw, sh) * 0.26)          # M size: about a quarter of the screen height
    margin = int(min(sw, sh) * 0.09)     # well clear of the edges (and of the docks)
    L = logo(s)
    shadow = Image.new('RGBA', L.size, (0, 0, 0, 0))
    shadow.putalpha(L.getchannel('A').point(lambda p: int(p * 0.8)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(5))
    pos = (sw - s - margin + dx, sh - s - margin + dy)
    part.paste(shadow, (pos[0] + 4, pos[1] + 5), shadow)
    part.paste(L, pos, L)
    canvas.paste(part, (sx - x0, sy - y0))
canvas.save(out, optimize=True)
print(f'{out}: {W}x{H}, {len(screens)} screens')
