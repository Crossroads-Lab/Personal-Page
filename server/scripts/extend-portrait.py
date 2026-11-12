"""
Extend the portrait downward, using only pixels already in the photograph.

  python3 server/scripts/extend-portrait.py <source.png> <out.png> 350

Three attempts, and the third is the one that ships.

  1. Clamp the edge and blur it with depth. Sharp in theory, mush on
     screen, and mush is the first thing anyone notices.
  2. Mirror the last rows. Sharp, and it carries the real grain — but a
     reflection at full strength duplicates the chrome chair foot, and a
     duplicated object is a worse tell than a blur.
  3. Mirror, then fade hard and early toward the floor's own tone. What is
     left reads as a figure on a bright floor with the light falling off,
     which is what the photograph already looks like.

Nothing here invents content. It cannot: a deterministic continuation can
extend tone and texture, not a shoe. For real continuation — the shoe, the
chair base, the contact shadow — see design/v2/SPEC.md section 2, which is
a generative expand done by hand in an image tool. This exists so the cut
has something to eat until then.
"""
import sys
from PIL import Image

MIRROR = 150          # rows reflected; more than is ever on screen
FADE_START = 0.45     # floor tone the reflection already carries at the join
FADE_END = 1.00       # and by the bottom of it
FADE_POWER = 0.70     # < 1 fades early, which is what kills the tell

src, dst, extra = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert("RGB")
W, H = im.size

out = Image.new("RGB", (W, H + extra))
out.paste(im, (0, 0))

# The tone a reflection settles into: the floor beside the chair, which is
# the left third of the bottom edge and is plain sweep.
floor = im.crop((0, H - 12, int(W * 0.30), H)).resize((1, 1), Image.BOX).getpixel((0, 0))
flat = Image.new("RGB", (W, 1), floor)

block = im.crop((0, H - MIRROR, W, H)).transpose(Image.FLIP_TOP_BOTTOM)
for i in range(MIRROR):
    t = i / MIRROR
    amount = min(1.0, FADE_START + (FADE_END - FADE_START) * (t ** FADE_POWER))
    out.paste(Image.blend(block.crop((0, i, W, i + 1)), flat, amount), (0, H + i))

tail = extra - MIRROR
if tail > 0:
    seed = out.crop((0, H + MIRROR - 1, W, H + MIRROR))
    out.paste(seed.resize((W, tail), Image.NEAREST), (0, H + MIRROR))

out.save(dst)
print(f"{dst}: {W}x{H} -> {out.size[0]}x{out.size[1]}  floor tone {floor}")
