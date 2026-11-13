"""Build the share card, 1200x630.

A panel card: name and positioning on the left, photo bled off the
right, hard edge between the two.

1200x630 either way, because LinkedIn, Slack and X lay a link card out
at 1.91:1 and centre-crop anything else to fit — which on a portrait
removes the head. JPEG, not WebP: scraper support for WebP is uneven and
an alpha channel composites against whatever colour the client uses.
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get("CARD_SOURCE", os.path.expanduser("~/Desktop/IMG_8914.JPG"))
OUT = os.path.join(os.path.dirname(HERE), "assets")

W, H = 1200, 630
BG = (227, 229, 230)          # --background #E3E5E6
INK = (17, 17, 17)            # --color #111
GREY = (120, 124, 126)
FACT = (90, 94, 96)

PHOTO_W = 500
PAD = 68

# The page loads Poppins from Google Fonts; rendering it here needs the
# files. Vendored beside this script (OFL, see tools/fonts/OFL.txt) so the
# card can be rebuilt years from now without a network.
F = os.path.join(HERE, "fonts")
f_name = ImageFont.truetype(f"{F}/Poppins-SemiBold.ttf", 60)
f_role = ImageFont.truetype(f"{F}/Poppins-Regular.ttf", 32)
f_fact = ImageFont.truetype(f"{F}/Poppins-Medium.ttf", 22)

src = Image.open(SRC).convert("RGB")
SW, SH = src.size                      # 1024 x 1024

# --------------------------------------------------------------------
# A — the panel card
# --------------------------------------------------------------------
card = Image.new("RGB", (W, H), BG)

# A native 500x630 crop: no resampling at all, so the face stays as sharp
# as the original. The earlier version scaled an 813x1024 region down into
# the same panel, which framed him far wider than his LinkedIn photo does.
# x centred on the face, y chosen to leave headroom rather than jacket.
cx, cy = 512, 300
left = max(0, min(SW - PHOTO_W, cx - PHOTO_W // 2))
top = max(0, min(SH - H, cy - int(H * 0.42)))
photo = src.crop((left, top, left + PHOTO_W, top + H))
card.paste(photo, (W - PHOTO_W, 0))
# No fade. Will: "no fading between the picture and the white part."

d = ImageDraw.Draw(card)
x, y = PAD, 128

d.text((x, y), "William Brendel", font=f_name, fill=INK); y += 76
d.text((x, y), "PhD", font=f_name, fill=GREY); y += 100
d.text((x, y), "Engineering & ML Executive", font=f_role, fill=INK); y += 74
d.line([(x, y), (x + 92, y)], fill=INK, width=3); y += 36

# His LinkedIn headline, adapted. Will: "Engineering & ML Executive •
# ex-FAANG • 3x Founder • +20yrs AI R&D • +10yrs Product & Leadership •
# Best seller author".
for line in ("ex-FAANG  ·  3x Founder  ·  Bestselling author",
             "20+ yrs AI R&D  ·  10+ yrs Product & Leadership"):
    assert d.textlength(line, font=f_fact) < W - PHOTO_W - PAD - 24, line
    d.text((x, y), line, font=f_fact, fill=FACT)
    y += 34

# quality 96 and subsampling=0, which is 4:4:4.
#
# The default JPEG encode is 4:2:0: chroma is stored at half resolution in
# both axes, which is invisible on a photograph and very visible on type,
# where every glyph edge is a hard colour transition. Text on a flat panel
# is the worst case for it. Will: "make sure the text is crisp after
# rendering. It looks a bit blurry right now."
#
# Costs about 100KB on a file with a 5MB ceiling.
card.save(f"{OUT}/og-card.jpg", "JPEG", quality=96, subsampling=0,
          optimize=True, progressive=True)

# the clean square, for the Person entity in the structured data
Image.open(SRC).convert("RGB").resize((1024, 1024), Image.LANCZOS).save(
    f"{OUT}/profile.jpg", "JPEG", quality=92, subsampling=0,
    optimize=True, progressive=True)

for f in ("og-card.jpg", "profile.jpg"):
    p = f"{OUT}/{f}"
    print(f, Image.open(p).size, f"{os.path.getsize(p)/1024:.0f} KB")
print(f"native crop at ({left},{top}) {PHOTO_W}x{H}, no upscale")
