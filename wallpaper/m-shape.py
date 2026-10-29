"""The wallpaper M's outline, straightened to face forward: for the upright screensaver M.

  python -I m-shape.py <m-logo.png>

The logo's letters are closed up into one shape, its outer edge traced and simplified; then a perspective correction
maps the four outer corners of the slanted M onto a flat rectangle, so the legs, the V and the proportions stay the
old M's own and only the angle goes. Prints the polygon (0..1, clockwise) and the width/height ratio.
"""
import json
import sys

from PIL import Image, ImageFilter

im = Image.open(sys.argv[1]).convert('RGBA')
a = im.getchannel('A').point(lambda p: 255 if p > 40 else 0)
# close the gaps between letters and words: grow by 15 px, shrink back (odd filter sizes)
sil = a.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.MinFilter(15))
w, h = sil.size
px = sil.load()
on = lambda x, y: 0 <= x < w and 0 <= y < h and px[x, y] > 0

# outer edge, Moore neighbour tracing from the first set pixel
start = next((x, y) for y in range(h) for x in range(w) if on(x, y))
dirs = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]
x, y, d, pts = start[0], start[1], 6, []
for _ in range(w * h * 4):
    pts.append((x, y))
    for k in range(8):
        nd = (d + 6 + k) % 8
        if on(x + dirs[nd][0], y + dirs[nd][1]):
            x, y, d = x + dirs[nd][0], y + dirs[nd][1], nd
            break
    if (x, y) == start:
        break


def rdp(p, eps):  # Ramer-Douglas-Peucker
    if len(p) < 3:
        return p
    (x1, y1), (x2, y2) = p[0], p[-1]
    n = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5 or 1
    dist = [abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / n for x, y in p]
    i = max(range(len(p)), key=dist.__getitem__)
    return rdp(p[:i + 1], eps)[:-1] + rdp(p[i:], eps) if dist[i] > eps else [p[0], p[-1]]


# a closed loop: split it at the point farthest from the start, simplify both halves
far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
poly = rdp(pts[:far + 1], 3.0)[:-1] + rdp(pts[far:] + [pts[0]], 3.0)[:-1]

# the slanted M's four outer corners
tl = min(poly, key=lambda p: p[0] + p[1]); br = max(poly, key=lambda p: p[0] + p[1])
tr = max(poly, key=lambda p: p[0] - p[1]); bl = min(poly, key=lambda p: p[0] - p[1])


def homography(src, dst):  # 3x3 projective map from 4 points to 4 points (solved by Gaussian elimination)
    A, b = [], []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    n = 8
    M = [r + [bb] for r, bb in zip(A, b)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(M[r][c])); M[c], M[piv] = M[piv], M[c]
        for r in range(n):
            if r != c:
                f = M[r][c] / M[c][c]
                M[r] = [rv - f * cv for rv, cv in zip(M[r], M[c])]
    s = [M[i][n] / M[i][i] for i in range(n)]
    return s + [1]


H = homography([tl, tr, br, bl], [(0, 0), (1, 0), (1, 1), (0, 1)])


def apply(p):
    x, y = p
    d = H[6] * x + H[7] * y + H[8]
    return ((H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d)


flat = [apply(p) for p in poly]
dist = lambda p, q: ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2) ** 0.5
ratio = ((dist(tl, tr) + dist(bl, br)) / 2) / ((dist(tl, bl) + dist(tr, br)) / 2)
print(json.dumps({'ratio': round(ratio, 3), 'points': len(flat), 'polygon': [[round(x, 3), round(y, 3)] for x, y in flat]}))
