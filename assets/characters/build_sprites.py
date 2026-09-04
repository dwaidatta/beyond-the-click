#!/usr/bin/env python3
"""
Sprite sheet generator for Sunfruit Quest.

The cast is hand-authored pixel art. Rather than keeping the pixels in a
binary editor, each character is described here as spans of pixels per
row, which keeps the art diffable and reproducible: change a number,
re-run, and the PNG next to this file updates.

    python assets/characters/build_sprites.py

Frames are laid out left to right in one sheet per character, and every
character stands on the bottom edge of its frame so the game can blit it
against a single floor line.
"""

import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))


# --------------------------------------------------------------------------
# minimal PNG writer (no third-party dependencies)
# --------------------------------------------------------------------------

def write_png(path, w, h, pixels, palette):
    rows = []
    for y in range(h):
        row = bytearray([0])  # filter: none
        for x in range(w):
            key = pixels[y][x]
            row += bytes(palette[key]) if key else b"\x00\x00\x00\x00"
        rows.append(bytes(row))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


class Sheet(object):
    def __init__(self, fw, fh, frames, palette):
        self.fw, self.fh, self.frames = fw, fh, frames
        self.palette = palette
        self.w, self.h = fw * frames, fh
        self.px = [[None] * self.w for _ in range(self.h)]
        self.ox = 0

    def frame(self, index):
        self.ox = index * self.fw

    def put(self, x, y, key):
        x += self.ox
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = key

    def span(self, y, x0, x1, key):
        for x in range(x0, x1 + 1):
            self.put(x, y, key)

    def rows(self, table, dy=0):
        """table: {y: [(x0, x1, key), ...]} — later spans paint over earlier."""
        for y in sorted(table):
            for x0, x1, key in table[y]:
                self.span(y + dy, x0, x1, key)

    def sparkle(self, x, y, core, arm):
        self.put(x, y, core)
        self.put(x - 1, y, arm)
        self.put(x + 1, y, arm)
        self.put(x, y - 1, arm)
        self.put(x, y + 1, arm)

    def outline(self, key, index):
        """Wrap this frame's silhouette in a dark contour."""
        lo, hi = index * self.fw, (index + 1) * self.fw - 1
        add = []
        for y in range(self.h):
            for x in range(lo, hi + 1):
                if self.px[y][x] is not None:
                    continue
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if lo <= nx <= hi and 0 <= ny < self.h and self.px[ny][nx] not in (None, key):
                        add.append((x, y))
                        break
        for x, y in add:
            self.px[y][x] = key

    def save(self, name):
        write_png(os.path.join(HERE, name), self.w, self.h, self.px, self.palette)
        return name


# --------------------------------------------------------------------------
# palettes
# --------------------------------------------------------------------------

HERO_PAL = {
    "#": (40, 26, 46, 255),      # outline
    "1": (138, 90, 16, 255),     # hair darkest
    "2": (200, 138, 30, 255),    # hair dark
    "3": (242, 185, 66, 255),    # hair mid
    "4": (255, 224, 138, 255),   # hair light
    "5": (255, 248, 216, 255),   # hair highlight
    "6": (226, 160, 122, 255),   # skin shade
    "7": (255, 222, 191, 255),   # skin
    "8": (255, 245, 232, 255),   # skin light
    "e": (255, 255, 255, 255),   # eye white
    "9": (18, 97, 125, 255),     # iris dark
    "a": (47, 157, 196, 255),    # iris mid
    "b": (140, 226, 244, 255),   # iris light
    "w": (253, 246, 232, 255),   # blouse cream
    "v": (216, 199, 173, 255),   # blouse shade
    "c": (47, 163, 176, 255),    # pinafore mid
    "d": (23, 102, 120, 255),    # pinafore dark
    "l": (113, 210, 216, 255),   # pinafore light
    "g": (255, 95, 143, 255),    # neckerchief
    "h": (190, 45, 89, 255),     # neckerchief dark
    "i": (255, 210, 63, 255),    # gold
    "j": (186, 126, 16, 255),    # gold dark
    "y": (255, 249, 205, 255),   # gold light
    "z": (150, 100, 56, 255),    # leather
    "Z": (96, 60, 32, 255),      # leather dark
    "k": (86, 53, 29, 255),      # boot dark
    "m": (140, 92, 50, 255),     # boot light
    "n": (250, 243, 228, 255),   # sock
    "o": (200, 186, 164, 255),   # sock shade
    "p": (255, 148, 170, 255),   # blush
    "q": (188, 92, 96, 255),     # mouth
}

GRAN_PAL = dict(HERO_PAL)
GRAN_PAL.update({
    "1": (150, 156, 180, 255),   # silver hair shade
    "2": (203, 209, 230, 255),
    "3": (238, 242, 252, 255),
    "4": (255, 255, 255, 255),
    "u": (168, 78, 104, 255),    # berry dress
    "U": (114, 46, 68, 255),
    "x": (206, 118, 146, 255),
    "r": (226, 142, 160, 255),   # knitted shawl, healed
    "R": (180, 96, 116, 255),
    "s": (141, 159, 151, 255),   # wool blanket, ailing
    "S": (94, 112, 104, 255),
    "F": (228, 214, 190, 255),   # apron
    "G": (186, 170, 144, 255),
})

SLIME_PALS = [
    {  # meadow green
        "#": (18, 54, 34, 255),
        "1": (29, 138, 82, 255), "2": (75, 224, 143, 255),
        "3": (150, 245, 190, 255), "4": (222, 255, 236, 255),
        "e": (255, 255, 255, 255), "9": (26, 19, 48, 255), "a": (90, 74, 130, 255),
    },
    {  # woodland blue
        "#": (14, 44, 74, 255),
        "1": (26, 111, 174, 255), "2": (92, 201, 255, 255),
        "3": (168, 228, 255, 255), "4": (226, 246, 255, 255),
        "e": (255, 255, 255, 255), "9": (18, 22, 56, 255), "a": (74, 82, 140, 255),
    },
    {  # ember red
        "#": (72, 20, 20, 255),
        "1": (176, 47, 47, 255), "2": (255, 122, 122, 255),
        "3": (255, 186, 186, 255), "4": (255, 232, 232, 255),
        "e": (255, 255, 255, 255), "9": (48, 16, 24, 255), "a": (128, 62, 70, 255),
    },
]

BOSS_PAL = {
    "#": (36, 10, 60, 255),
    "1": (92, 26, 160, 255), "2": (150, 62, 226, 255),
    "3": (199, 102, 255, 255), "4": (232, 184, 255, 255), "5": (248, 226, 255, 255),
    "e": (255, 255, 255, 255), "9": (42, 15, 63, 255),
    "a": (255, 176, 58, 255), "b": (255, 233, 168, 255),
    "i": (255, 210, 63, 255), "j": (201, 138, 15, 255), "y": (255, 246, 191, 255),
    "r": (255, 111, 156, 255), "R": (140, 23, 64, 255),
    "g": (79, 227, 255, 255), "n": (75, 224, 143, 255),
}

FRUIT_PAL = {
    "#": (110, 62, 4, 255),
    "1": (201, 128, 10, 255), "2": (255, 187, 46, 255),
    "3": (255, 226, 122, 255), "4": (255, 251, 220, 255),
    "5": (44, 158, 94, 255), "6": (143, 255, 189, 255),
    "7": (125, 82, 16, 255),
}


# ==========================================================================
# Sunny, the heroine — 40 x 56, four frames: idle / walk A / walk B / attack
#
# Short open hair: a soft chin-length bob with a side part. Her kit is a
# traveller's one — cream blouse, teal pinafore, leather belt, walking
# boots — so she reads as someone who set out up a mountain this morning.
# ==========================================================================

HERO_W, HERO_H, HERO_FRAMES = 40, 56, 4


def hero_hair_and_face():
    """Crown, side-swept fringe, the bob's side locks, and the face."""
    return {
        1:  [(17, 22, "2")],
        2:  [(15, 24, "2"), (17, 22, "3")],
        3:  [(13, 26, "2"), (15, 24, "3"), (17, 21, "4")],
        4:  [(12, 27, "2"), (14, 25, "3"), (16, 22, "4"), (17, 20, "5")],
        5:  [(11, 28, "2"), (13, 26, "3"), (15, 22, "4"), (16, 20, "5")],
        6:  [(11, 28, "2"), (12, 27, "3"), (14, 22, "4"), (15, 19, "5")],
        7:  [(11, 28, "2"), (12, 27, "3"), (13, 21, "4"), (14, 18, "5")],
        8:  [(10, 29, "2"), (11, 28, "3"), (13, 20, "4")],
        # side-swept fringe: one parting notch left of centre
        9:  [(10, 13, "2"), (11, 12, "3"), (14, 16, "3"), (17, 18, "7"),
             (19, 25, "3"), (24, 25, "2"), (26, 29, "2"), (27, 28, "3")],
        10: [(10, 13, "2"), (11, 12, "3"), (14, 25, "7"), (26, 29, "2"), (27, 28, "3")],
        11: [(10, 13, "2"), (11, 12, "3"), (14, 25, "7"), (26, 29, "2"), (27, 28, "3")],
        12: [(10, 13, "2"), (11, 12, "3"), (14, 25, "7"), (26, 29, "2"), (27, 28, "3")],
        13: [(10, 13, "2"), (11, 12, "3"), (14, 25, "7"), (26, 29, "2"), (27, 28, "3")],
        14: [(10, 13, "2"), (11, 11, "3"), (14, 25, "7"), (14, 14, "p"),
             (25, 25, "p"), (19, 19, "6"), (26, 29, "2"), (28, 28, "3")],
        15: [(10, 13, "2"), (15, 24, "7"), (19, 20, "q"), (26, 29, "2")],
        16: [(9, 13, "2"), (16, 23, "7"), (17, 22, "6"), (26, 30, "2")],
        # the bob flicks outward just below the jaw
        17: [(9, 13, "2"), (18, 21, "6"), (26, 30, "2")],
        18: [(10, 13, "1"), (11, 12, "2"), (26, 29, "1"), (27, 28, "2")],
        19: [(11, 13, "1"), (26, 28, "1")],
    }


def hero_eyes():
    """Three-wide anime eyes: lash line with an outer flick, glint, iris ramp."""
    return {
        10: [(14, 17, "#"), (22, 25, "#")],
        11: [(15, 15, "e"), (16, 17, "9"), (22, 23, "9"), (24, 24, "e")],
        12: [(15, 15, "e"), (16, 16, "a"), (17, 17, "9"),
             (22, 22, "9"), (23, 23, "a"), (24, 24, "e")],
        13: [(15, 15, "b"), (16, 17, "a"), (22, 23, "a"), (24, 24, "b")],
    }


def hero_body():
    """Blouse, neckerchief, teal pinafore with shoulder straps, belt, skirt.

    The torso stops a column short of the arms on each side so the outline
    pass can draw a clean seam between sleeve and body.
    """
    return {
        18: [(16, 23, "w")],
        19: [(15, 24, "w"), (17, 22, "v")],
        20: [(15, 24, "w"), (16, 17, "c"), (22, 23, "c"), (18, 21, "g")],
        21: [(15, 24, "w"), (16, 17, "c"), (22, 23, "c"), (19, 20, "h")],
        22: [(15, 24, "w"), (16, 23, "c"), (16, 16, "l")],
        23: [(15, 24, "w"), (16, 23, "c"), (16, 16, "l"), (23, 23, "d"), (19, 20, "i")],
        24: [(15, 24, "w"), (16, 23, "c"), (16, 16, "l"), (23, 23, "d")],
        25: [(15, 24, "c"), (16, 16, "l"), (23, 24, "d")],
        26: [(15, 24, "z"), (15, 15, "Z"), (23, 24, "Z"), (18, 21, "i"), (19, 20, "y")],
        27: [(15, 24, "c"), (17, 18, "l"), (23, 24, "d")],
        28: [(14, 25, "c"), (17, 18, "l"), (24, 25, "d")],
        29: [(14, 25, "c"), (15, 15, "d"), (17, 18, "l"), (22, 22, "d"), (24, 25, "d")],
        30: [(13, 26, "c"), (14, 14, "d"), (17, 18, "l"), (22, 22, "d"), (25, 26, "d")],
        31: [(13, 26, "c"), (14, 14, "d"), (16, 18, "l"), (22, 23, "d"), (25, 26, "d")],
        32: [(12, 27, "c"), (13, 13, "d"), (16, 18, "l"), (22, 23, "d"), (26, 27, "d")],
        33: [(12, 27, "c"), (13, 13, "d"), (16, 18, "l"), (22, 24, "d"), (26, 27, "d")],
        34: [(12, 27, "c"), (15, 18, "l"), (22, 25, "d"), (26, 27, "d")],
        35: [(12, 27, "i"), (12, 13, "j"), (26, 27, "j")],
    }


def hero_leg(sheet, cx, lift):
    """Bare thigh, cream knee sock with a teal band, leather walking boot."""
    for y in range(36, 39):
        sheet.span(y, cx - 2, cx + 1, "7")
        sheet.put(cx + 1, y, "6")
    sheet.span(39, cx - 2, cx + 1, "c")
    for y in range(40, 48 - lift):
        sheet.span(y, cx - 2, cx + 1, "n")
        sheet.put(cx + 1, y, "o")
    boot = 48 - lift
    for y in range(boot, boot + 6):
        sheet.span(y, cx - 3, cx + 2, "k")
    sheet.span(boot + 1, cx - 2, cx, "m")
    sheet.span(boot + 2, cx - 2, cx - 1, "m")
    sheet.span(boot + 4, cx - 3, cx + 2, "Z")


def hero_arm(sheet, cx, top, length):
    """Short puffed sleeve, then a bare forearm and hand."""
    sheet.span(top, cx - 2, cx + 1, "w")
    sheet.span(top + 1, cx - 2, cx + 1, "w")
    sheet.span(top + 2, cx - 2, cx + 1, "v")
    for y in range(top + 3, top + length):
        sheet.span(y, cx - 1, cx + 1, "7")
        sheet.put(cx + 1, y, "6")
    sheet.span(top + length, cx - 1, cx + 1, "8")
    sheet.span(top + length + 1, cx - 1, cx + 1, "7")
    return top + length + 1


STAR = {
    -3: [(0, 0, "y")],
    -2: [(-1, 1, "i")],
    -1: [(-3, 3, "i"), (-1, 1, "y")],
    0:  [(-2, 2, "i"), (0, 0, "y")],
    1:  [(-2, -1, "i"), (1, 2, "i")],
    2:  [(-3, -2, "j"), (2, 3, "j")],
}


def hero_wand(sheet, hx, hy, raised):
    """A short gold rod out of the hand with a five-point star at the tip,
    angled clear of the arm so the silhouette stays readable."""
    if raised:
        rod = [(0, -1), (0, -2), (1, -3), (1, -4)]
        sx, sy = hx + 2, hy - 7
    else:
        rod = [(1, -1), (2, -2), (3, -3), (3, -4)]
        sx, sy = hx + 5, hy - 6
    sheet.put(hx, hy, "j")
    for dx, dy in rod:
        sheet.put(hx + dx, hy + dy, "i")
    for dy in sorted(STAR):
        for x0, x1, key in STAR[dy]:
            sheet.span(sy + dy, sx + x0, sx + x1, key)


def build_hero():
    sheet = Sheet(HERO_W, HERO_H, HERO_FRAMES, HERO_PAL)
    hair = hero_hair_and_face()
    eyes = hero_eyes()
    body = hero_body()

    # (body bob, left foot lift, right foot lift, arm swing, attacking)
    poses = [
        (0, 0, 0, 0, False),
        (-1, 2, 0, 1, False),
        (-1, 0, 2, -1, False),
        (0, 0, 1, 0, True),
    ]

    for index, (bob, llift, rlift, swing, attack) in enumerate(poses):
        sheet.frame(index)
        hero_leg(sheet, 17, llift)
        hero_leg(sheet, 22, rlift)
        sheet.rows(body, dy=bob)

        if attack:
            hero_arm(sheet, 12, 21 + bob, 11)
            # right arm thrown up and out, wand overhead
            for i, (x, y) in enumerate(((25, 21), (26, 20), (27, 19), (28, 18))):
                sheet.span(y + bob, x, x + 2, "w" if i < 2 else "7")
            sheet.span(17 + bob, 29, 31, "8")
            hero_wand(sheet, 30, 17 + bob, True)
        else:
            hero_arm(sheet, 12, 21 + bob + swing, 11)
            hand = hero_arm(sheet, 27, 21 + bob - swing, 11)
            hero_wand(sheet, 28, hand, False)

        # hair goes on last: the bob falls in front of her shoulders
        sheet.rows(hair, dy=bob)
        sheet.rows(eyes, dy=bob)

        sheet.outline("#", index)
    return sheet.save("hero.png")


# ==========================================================================
# Grandma — 40 x 56, two frames: ailing / healed
# ==========================================================================

def build_granny():
    """Grandma: an oatmeal kerchief knotted over silver hair, a berry dress
    under a long apron, a knitted shawl round her shoulders. She keeps her
    own warm complexion in both frames — being unwell shows in the stoop,
    the cane, the closed eyes and the plain wool blanket she has swapped
    her shawl for, never in her colour."""
    sheet = Sheet(HERO_W, HERO_H, 2, GRAN_PAL)

    for index in range(2):
        well = index == 1
        wrap, wrap_s = ("r", "R") if well else ("s", "S")
        stoop = 0 if well else 1

        sheet.frame(index)

        sheet.rows({           # kerchief, hugging the skull
            4:  [(17, 22, "F")],
            5:  [(15, 24, "F"), (16, 21, "w")],
            6:  [(14, 25, "F"), (15, 21, "w"), (23, 25, "G")],
            7:  [(14, 25, "F"), (15, 20, "w"), (24, 25, "G")],
            8:  [(14, 25, "F"), (15, 19, "w"), (24, 25, "G")],
            9:  [(14, 25, "F"), (24, 25, "G")],
            10: [(14, 25, "G")],
        }, dy=stoop)
        sheet.rows({           # a scatter of berry dots on the cloth
            6: [(18, 18, "x")],
            8: [(16, 16, "x"), (21, 21, "x")],
            9: [(19, 19, "x"), (23, 23, "x")],
        }, dy=stoop)
        sheet.rows({           # knot and trailing corner at her left
            9:  [(25, 28, "F")],
            10: [(25, 29, "F"), (27, 29, "G")],
            11: [(26, 29, "G")],
            12: [(26, 28, "F")],
            13: [(26, 28, "G")],
            14: [(27, 28, "G")],
        }, dy=stoop)

        sheet.rows({           # silver hair under the kerchief edge
            10: [(13, 14, "3"), (25, 26, "3")],
            11: [(13, 26, "3"), (16, 17, "2"), (21, 22, "2")],
            12: [(13, 14, "3"), (25, 26, "3")],
            13: [(13, 14, "2"), (25, 26, "2")],
            14: [(13, 14, "2"), (25, 26, "2")],
            15: [(13, 14, "1"), (25, 26, "1")],
        }, dy=stoop)

        sheet.rows({           # face
            11: [(16, 23, "7")],
            12: [(15, 24, "7")],
            13: [(15, 24, "7")],
            14: [(15, 24, "7")],
            15: [(15, 24, "7")],
            16: [(15, 24, "7"), (15, 15, "6"), (24, 24, "6")],
            17: [(15, 24, "7"), (19, 20, "6")],
            18: [(16, 23, "7")],
            19: [(16, 23, "7")],
            20: [(16, 23, "7"), (17, 22, "6")],
            21: [(18, 21, "6")],
        }, dy=stoop)
        sheet.rows({           # soft brows
            13: [(16, 18, "1"), (21, 23, "1")],
        }, dy=stoop)

        if well:               # open eyes, laugh lines, a broad smile
            sheet.rows({
                14: [(16, 18, "#"), (21, 23, "#")],
                15: [(16, 16, "e"), (17, 17, "9"), (18, 18, "e"),
                     (21, 21, "e"), (22, 22, "9"), (23, 23, "e")],
                16: [(16, 16, "6"), (23, 23, "6"), (15, 15, "6"), (24, 24, "6")],
                17: [(15, 15, "p"), (24, 24, "p")],
                19: [(18, 21, "q")],
                20: [(19, 20, "q")],
            }, dy=stoop)
        else:                  # eyes closed, a small tired mouth
            sheet.rows({
                15: [(16, 18, "#"), (21, 23, "#")],
                16: [(15, 15, "6"), (24, 24, "6")],
                17: [(15, 15, "p"), (24, 24, "p")],
                19: [(19, 20, "q")],
            }, dy=stoop)

        sheet.rows({           # lace collar over the bodice
            22: [(17, 22, "u")],
            23: [(16, 23, "w")],
        }, dy=stoop)

        sheet.rows({           # shawl, or the wool blanket she is wrapped in
            24: [(16, 23, wrap)],
            25: [(14, 25, wrap), (15, 17, "4" if well else "3")],
            26: [(13, 26, wrap), (23, 26, wrap_s)],
            27: [(12, 27, wrap), (24, 27, wrap_s)],
            28: [(12, 27, wrap), (24, 27, wrap_s)],
            29: [(12, 27, wrap), (24, 27, wrap_s)],
            30: [(13, 26, wrap), (23, 26, wrap_s)],
            31: [(14, 25, wrap_s)],
            32: [(14, 14, wrap_s), (16, 16, wrap_s), (18, 18, wrap_s),
                 (21, 21, wrap_s), (23, 23, wrap_s), (25, 25, wrap_s)],
        }, dy=stoop)

        sheet.rows({           # arms, held clear of the body
            27: [(10, 12, wrap), (27, 29, wrap)],
            28: [(10, 12, wrap), (27, 29, wrap)],
            29: [(10, 12, wrap_s), (27, 29, wrap_s)],
            30: [(10, 12, "7"), (27, 29, "7")],
            31: [(10, 12, "7"), (27, 29, "7")],
            32: [(10, 12, "6"), (27, 29, "6")],
        }, dy=stoop)

        sheet.rows({           # bodice below the shawl
            31: [(15, 24, "u"), (15, 16, "x"), (23, 24, "U")],
            32: [(15, 24, "u"), (23, 24, "U")],
        }, dy=stoop)

        skirt = {}             # berry dress falling to the ankles
        for i, y in enumerate(range(33, 48)):
            spread = i // 4
            lo, hi = 15 - spread, 24 + spread
            spans = [(lo, hi, "u"), (lo, lo + 1, "x"), (hi - 2, hi, "U")]
            if i % 5 == 2:
                spans.append((lo + 2, hi - 3, "x"))
            skirt[y] = spans
        skirt[48] = [(12, 27, "U")]
        sheet.rows(skirt, dy=stoop)

        apron = {33: [(18, 21, "F")]}   # narrow apron, dress showing either side
        for i, y in enumerate(range(34, 45)):
            spread = i // 7
            apron[y] = [(17 - spread, 22 + spread, "F"),
                        (21 + spread, 22 + spread, "G")]
        apron[45] = [(16, 23, "G")]
        apron[38] = apron[38] + [(18, 21, "G")]
        apron[39] = apron[39] + [(18, 18, "G"), (21, 21, "G")]
        apron[40] = apron[40] + [(18, 21, "G")]
        sheet.rows(apron, dy=stoop)

        sheet.rows({           # stockinged ankles and soft slippers
            49: [(16, 18, "n"), (21, 23, "n")],
            50: [(16, 18, "n"), (21, 23, "n")],
            51: [(15, 19, "k"), (20, 24, "k")],
            52: [(15, 19, "k"), (20, 24, "k"), (16, 18, "m"), (21, 23, "m")],
            53: [(14, 19, "k"), (20, 25, "k")],
            54: [(14, 19, "Z"), (20, 25, "Z")],
        }, dy=stoop)

        if well:               # a glow of returning health
            for x, y in ((8, 11), (32, 14), (7, 26), (33, 31)):
                sheet.sparkle(x, y, "4", "3")
        else:                  # walking cane, gripped in her right hand
            for y in range(31, 54):
                sheet.put(31, y + stoop, "z")
                sheet.put(32, y + stoop, "Z")
            sheet.rows({
                29: [(30, 32, "z")],
                30: [(29, 30, "z"), (32, 33, "z")],
            }, dy=stoop)

        sheet.outline("#", index)
    return sheet.save("granny.png")


# ==========================================================================
# Slimes — 28 x 24, three colourways
# ==========================================================================

SLIME_BODY = {
    2:  [(13, 14, "2")],
    3:  [(12, 15, "2")],
    4:  [(11, 16, "2"), (12, 14, "3")],
    5:  [(10, 17, "2"), (11, 14, "3")],
    6:  [(8, 19, "2"), (9, 13, "3"), (10, 12, "4")],
    7:  [(7, 20, "2"), (8, 12, "3"), (9, 11, "4")],
    8:  [(6, 21, "2"), (7, 11, "3"), (8, 10, "4"), (19, 21, "1")],
    9:  [(5, 22, "2"), (6, 10, "3"), (19, 22, "1")],
    10: [(4, 23, "2"), (5, 9, "3"), (20, 23, "1")],
    11: [(4, 23, "2"), (5, 8, "3"), (20, 23, "1")],
    12: [(3, 24, "2"), (21, 24, "1")],
    13: [(3, 24, "2"), (21, 24, "1")],
    14: [(3, 24, "2"), (4, 5, "3"), (21, 24, "1")],
    15: [(3, 24, "2"), (20, 24, "1")],
    16: [(3, 24, "2"), (19, 24, "1")],
    17: [(3, 24, "1"), (4, 20, "2")],
    18: [(3, 24, "1"), (5, 19, "2")],
    19: [(4, 23, "1"), (7, 17, "2")],
    20: [(5, 22, "1")],
    21: [(7, 20, "1")],
}

SLIME_FACE = {
    10: [(8, 11, "#"), (16, 19, "#")],
    11: [(8, 8, "e"), (9, 11, "9"), (16, 16, "e"), (17, 19, "9")],
    12: [(8, 8, "e"), (9, 10, "9"), (11, 11, "a"),
         (16, 16, "e"), (17, 18, "9"), (19, 19, "a")],
    13: [(8, 9, "9"), (10, 11, "a"), (16, 17, "9"), (18, 19, "a")],
    16: [(11, 16, "#")],
    17: [(12, 15, "#")],
}


def build_slimes():
    palette = {}
    for i, pal in enumerate(SLIME_PALS):
        for k, v in pal.items():
            palette[k + str(i)] = v
    sheet = Sheet(28, 24, 3, palette)

    for index in range(3):
        sheet.frame(index)
        tag = str(index)
        for table in (SLIME_BODY, SLIME_FACE):
            sheet.rows({y: [(a, b, k + tag) for a, b, k in spans]
                        for y, spans in table.items()})
        if index == 2:   # the ember slime scowls
            sheet.rows({9: [(7, 10, "#" + tag), (17, 20, "#" + tag)]})
        sheet.outline("#" + tag, index)
    return sheet.save("slimes.png")


# ==========================================================================
# The Sunpeak Slime King — 48 x 48
# ==========================================================================

BOSS_SILHOUETTE = [
    (11, 17, 30), (12, 15, 32), (13, 13, 34), (14, 11, 36), (15, 10, 37),
    (16, 9, 38), (17, 8, 39), (18, 7, 40), (19, 6, 41), (20, 6, 41),
    (21, 5, 42), (22, 5, 42), (23, 4, 43), (24, 4, 43), (25, 4, 43),
    (26, 4, 43), (27, 4, 43), (28, 4, 43), (29, 4, 43), (30, 4, 43),
    (31, 5, 42), (32, 5, 42), (33, 6, 41), (34, 6, 41), (35, 7, 40),
    (36, 8, 39), (37, 9, 38), (38, 10, 37), (39, 11, 36), (40, 13, 34),
    (41, 15, 32), (42, 18, 29),
]


def build_boss():
    sheet = Sheet(48, 48, 1, BOSS_PAL)
    sheet.frame(0)

    body = {}
    for y, x0, x1 in BOSS_SILHOUETTE:
        if y >= 34:
            spans = [(x0, x1, "1"), (x0 + 4, x1 - 4, "2")]
        else:
            spans = [(x0, x1, "2"), (x0, min(x0 + 4, x1), "3"),
                     (max(x1 - 4, x0), x1, "1")]
            if 14 <= y <= 22:
                spans.append((x0 + 2, min(x0 + 6, x1), "4"))
        body[y] = spans
    sheet.rows(body)
    sheet.rows({13: [(16, 19, "5"), (20, 21, "4")], 14: [(15, 18, "5")]})

    sheet.rows({                   # crown
        1:  [(23, 24, "y")],
        2:  [(15, 16, "y"), (23, 24, "i"), (31, 32, "y")],
        3:  [(15, 16, "i"), (22, 25, "i"), (31, 32, "i")],
        4:  [(15, 17, "i"), (22, 25, "i"), (30, 32, "i")],
        5:  [(14, 17, "i"), (21, 26, "i"), (30, 33, "i")],
        6:  [(14, 18, "i"), (20, 27, "i"), (29, 33, "i")],
        7:  [(13, 34, "i"), (19, 20, "j"), (27, 28, "j")],
        8:  [(13, 34, "i"), (14, 33, "y")],
        9:  [(13, 34, "j"), (17, 18, "g"), (23, 24, "r"), (29, 30, "n")],
        10: [(13, 34, "j")],
    })

    sheet.rows({                   # glowering face
        20: [(12, 19, "#"), (28, 35, "#")],
        21: [(13, 20, "#"), (27, 34, "#")],
        22: [(14, 20, "e"), (27, 33, "e")],
        23: [(14, 14, "e"), (15, 20, "a"), (27, 32, "a"), (33, 33, "e")],
        24: [(14, 14, "e"), (15, 19, "9"), (20, 20, "a"),
             (27, 27, "a"), (28, 32, "9"), (33, 33, "e")],
        25: [(15, 19, "9"), (28, 32, "9"), (15, 16, "b"), (31, 32, "b")],
        26: [(15, 20, "9"), (27, 32, "9")],
        27: [(16, 19, "a"), (28, 31, "a")],
        31: [(18, 29, "#")],
        32: [(17, 30, "#"), (19, 20, "5"), (27, 28, "5")],
        33: [(19, 28, "#"), (20, 20, "5"), (27, 27, "5")],
        34: [(21, 26, "#")],
    })

    sheet.rows({                   # brooch
        36: [(23, 24, "i")],
        37: [(22, 25, "i"), (23, 24, "y")],
        38: [(22, 25, "i")],
        39: [(23, 24, "j")],
    })

    sheet.outline("#", 0)
    return sheet.save("boss.png")


# ==========================================================================
# The Golden Sunfruit — 28 x 32
# ==========================================================================

FRUIT_ORB = [
    (9, 11, 16), (10, 9, 18), (11, 7, 20), (12, 6, 21), (13, 5, 22),
    (14, 4, 23), (15, 4, 23), (16, 3, 24), (17, 3, 24), (18, 3, 24),
    (19, 3, 24), (20, 4, 23), (21, 4, 23), (22, 5, 22), (23, 6, 21),
    (24, 7, 20), (25, 9, 18), (26, 11, 16),
]


def build_fruit():
    sheet = Sheet(28, 32, 1, FRUIT_PAL)
    sheet.frame(0)

    sheet.rows({                   # leaf and stem
        2: [(17, 21, "5")],
        3: [(16, 23, "5"), (17, 20, "6")],
        4: [(15, 23, "5"), (16, 19, "6")],
        5: [(15, 21, "5"), (16, 18, "6")],
        6: [(14, 18, "5")],
        7: [(13, 14, "7")],
        8: [(13, 14, "7")],
    })

    for y, x0, x1 in FRUIT_ORB:
        if y >= 22:
            sheet.span(y, x0, x1, "1")
            sheet.span(y, x0 + 3, x1 - 3, "2")
        else:
            sheet.span(y, x0, x1, "2")
            sheet.span(y, x0, min(x0 + 3, x1), "3")
            sheet.span(y, max(x1 - 3, x0), x1, "1")
    sheet.rows({
        12: [(8, 11, "4")],
        13: [(7, 10, "4")],
        14: [(7, 8, "4")],
        17: [(19, 20, "4")],
    })
    for x, y in ((1, 6), (25, 22), (24, 8)):
        sheet.sparkle(x, y, "4", "3")

    sheet.outline("#", 0)
    return sheet.save("sunfruit.png")


if __name__ == "__main__":
    for name in (build_hero(), build_granny(), build_slimes(), build_boss(), build_fruit()):
        print("wrote", name)
