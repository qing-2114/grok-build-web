"""Build a rounded Windows .ico from public/grok-icon.png."""

import struct
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "grok-icon.png"
DST = ROOT / "public" / "grok-icon.ico"
PREVIEW = ROOT / "public" / "grok-icon-rounded.png"
SIZES = (16, 24, 32, 48, 64, 128, 256)
RADIUS = 0.22


def rounded(im: Image.Image, ratio: float = RADIUS) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    scale = 4
    mw, mh = w * scale, h * scale
    radius = max(1, int(min(mw, mh) * ratio))
    mask = Image.new("L", (mw, mh), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, mw - 1, mh - 1),
        radius=radius,
        fill=255,
    )
    mask = mask.resize((w, h), Image.Resampling.LANCZOS)
    out = im.copy()
    alpha = out.split()[-1]
    out.putalpha(ImageChops.multiply(alpha, mask))
    return out


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    src = src.resize((256, 256), Image.Resampling.LANCZOS)
    base = rounded(src)
    base.save(PREVIEW, format="PNG")
    frames: list[Image.Image] = []
    for size in SIZES:
        frame = src.resize((size, size), Image.Resampling.LANCZOS)
        frames.append(rounded(frame))
    write_ico(DST, frames)
    print(DST)


def write_ico(path: Path, images: list[Image.Image]) -> None:
    blobs: list[bytes] = []
    for im in images:
        buf = BytesIO()
        im.save(buf, format="PNG")
        blobs.append(buf.getvalue())
    count = len(images)
    offset = 6 + 16 * count
    with path.open("wb") as fh:
        fh.write(struct.pack("<HHH", 0, 1, count))
        for im, blob in zip(images, blobs, strict=True):
            w, h = im.size
            fh.write(
                struct.pack(
                    "<BBBBHHII",
                    0 if w >= 256 else w,
                    0 if h >= 256 else h,
                    0,
                    0,
                    1,
                    32,
                    len(blob),
                    offset,
                )
            )
            offset += len(blob)
        for blob in blobs:
            fh.write(blob)


if __name__ == "__main__":
    main()
