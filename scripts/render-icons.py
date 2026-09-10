"""
Redraws the install PNGs from `src/Lorex.Web/public/icon.svg`, which is the only source
of the mark.

The PNGs were hand-cut binaries with no way to redraw them, so editing the SVG left them
behind silently. This reads the geometry back out of the SVG and rasterises it with the
standard library alone: the mark is a plate and two strokes, which does not justify an
imaging dependency.

    python scripts/render-icons.py
"""

import re
import struct
import xml.etree.ElementTree as ElementTree
import zlib
from pathlib import Path

SVG = Path(__file__).resolve().parent.parent / "src" / "Lorex.Web" / "public" / "icon.svg"
NS = "{http://www.w3.org/2000/svg}"

# The maskable icon holds the same art at 72%, so the platform can crop to its own shape
# without touching the mark. It is the padding the previous maskable icon already used.
TARGETS = [
    ("icon-192.png", 192, 1.0),
    ("icon-512.png", 512, 1.0),
    ("icon-maskable-512.png", 512, 0.72),
    ("apple-touch-icon.png", 180, 1.0),
]

SAMPLES = 4  # 4x4 supersampling, and only along the edge of a stroke.


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def read_mark():
    """The plate colour, the stroke, and the segments the path draws.

    Deliberately narrow: it understands the one shape this icon is, and raises rather
    than guessing if the SVG grows a construct it cannot rasterise.
    """
    root = ElementTree.parse(SVG).getroot()
    view = [float(n) for n in root.get("viewBox").split()]
    if view[:2] != [0.0, 0.0] or view[2] != view[3]:
        raise SystemExit("icon.svg must use a square viewBox anchored at the origin")

    plate = root.find(f"{NS}rect")
    path = root.find(f"{NS}path")
    if plate is None or path is None:
        raise SystemExit("icon.svg must be one <rect> plate and one stroked <path>")
    if path.get("fill", "none") != "none":
        raise SystemExit("icon.svg's path must be stroked, not filled")
    # The rasteriser measures distance to the segment, which is a round cap by definition.
    if path.get("stroke-linecap") != "round":
        raise SystemExit("icon.svg's path must set stroke-linecap=\"round\"")

    numbers = r"(-?[\d.]+)"
    segments = [
        tuple(float(n) for n in match)
        for match in re.findall(rf"M\s*{numbers}\s+{numbers}\s+L\s*{numbers}\s+{numbers}", path.get("d"))
    ]
    if not segments:
        raise SystemExit("icon.svg's path must be move/line segments only")

    return {
        "view": view[2],
        "plate": hex_rgb(plate.get("fill")),
        "ink": hex_rgb(path.get("stroke")),
        "half": float(path.get("stroke-width")) / 2,
        "segments": segments,
    }


def distance(px, py, segments):
    """Shortest distance from a point to any of the drawn segments."""
    best = float("inf")
    for x1, y1, x2, y2 in segments:
        dx, dy = x2 - x1, y2 - y1
        span = dx * dx + dy * dy
        along = ((px - x1) * dx + (py - y1) * dy) / span if span else 0.0
        along = min(1.0, max(0.0, along))
        ox, oy = px - (x1 + along * dx), py - (y1 + along * dy)
        best = min(best, (ox * ox + oy * oy) ** 0.5)
    return best


def render(mark, size, scale):
    """One icon, as PNG scanlines. Coverage is sampled only where a stroke has an edge."""
    view, half, segments = mark["view"], mark["half"], mark["segments"]
    plate, ink = mark["plate"], mark["ink"]
    centre = view / 2
    unit = view / size / scale  # One output pixel, in the SVG's own units.
    margin = unit * 0.708  # Half a pixel diagonal: the widest a pixel can straddle an edge.
    step = unit / SAMPLES
    weight = 1.0 / (SAMPLES * SAMPLES)

    def to_svg(coordinate):
        return (coordinate * view / size - centre) / scale + centre

    rows = []
    for y in range(size):
        row = bytearray()
        sy = to_svg(y + 0.5)
        for x in range(size):
            sx = to_svg(x + 0.5)
            gap = distance(sx, sy, segments) - half
            if gap <= -margin:
                coverage = 1.0
            elif gap >= margin:
                coverage = 0.0
            else:
                hits = 0
                top = sy - unit / 2 + step / 2
                left = sx - unit / 2 + step / 2
                for j in range(SAMPLES):
                    for i in range(SAMPLES):
                        if distance(left + i * step, top + j * step, segments) <= half:
                            hits += 1
                coverage = hits * weight
            row += bytes(round(p + (k - p) * coverage) for p, k in zip(plate, ink))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    def chunk(kind, payload):
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB, no alpha.
    body = zlib.compress(b"".join(b"\x00" + row for row in rows), 9)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", body) + chunk(b"IEND", b"")
    )


def main():
    mark = read_mark()
    for name, size, scale in TARGETS:
        target = SVG.parent / name
        write_png(target, size, render(mark, size, scale))
        print(f"{name} {size}x{size} at {scale:g} -> {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
