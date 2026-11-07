"""Rebuild the exact, lossless sprite sheets used by the static atlas.

Run with Pillow 12.3.0 and libwebp 1.6.0 from the project checkout:
    python web-atlas/pixel/scripts/build-scene-sprites.py
"""

from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path

from PIL import Image, features

PIXEL = Path(__file__).resolve().parent.parent
REFERENCE = PIXEL / "reference" / "battle-preview"
GENERATED_REFERENCE = PIXEL / "reference" / "generated-sprites"
OUTPUT = PIXEL / "src" / "resources" / "assets"
ASSET_NAMES = {
    "infantry": "infantry",
    "vehicles": "vehicles",
    "terrain": "terrain",
    "roads": "roads",
    "nuke": "nuke",
    "tankCrew": "tank-crew",
    "equipmentWrecks": "equipment-wrecks",
}
GENERATED_ASSETS = {
    "coldWarUnits": ("cold-war-units", 3, 2),
    "contemporaryUnits": ("contemporary-units", 3, 2),
    "genericTerrain": ("generic-terrain", 3, 2),
    "japanTerrain": ("japan-terrain", 2, 2),
    "koreaUnits": ("korea-units", 3, 2),
    "hiroshimaCity": ("hiroshima-city", 3, 2),
    "nagasakiCity": ("nagasaki-city", 3, 2),
    "japanCivilians": ("japan-civilians", 3, 2),
    "japanSurfaces": ("japan-surfaces", 4, 2),
}
SCENES = {
    "ww1-western-front": {
        "required": ["infantry", "vehicles", "terrain"],
        "optional": ["roads", "tankCrew", "equipmentWrecks"],
        "animated": [],
    },
    "ww1-palestine": {
        "required": ["infantry", "vehicles", "terrain"],
        "optional": ["equipmentWrecks"],
        "animated": [],
    },
    "us-civil-south-carolina": {
        "required": ["infantry", "vehicles", "terrain"],
        "optional": ["roads", "equipmentWrecks"],
        "animated": [],
    },
    "cold-war-neutral": {
        "required": ["coldWarUnits", "genericTerrain"],
        "optional": [],
        "animated": [],
    },
    "contemporary-neutral": {
        "required": ["contemporaryUnits", "genericTerrain"],
        "optional": [],
        "animated": [],
    },
    "korea-osan": {
        "required": ["koreaUnits", "genericTerrain"],
        "optional": [],
        "animated": [],
    },
    "ww2-overview": {
        "required": ["infantry", "vehicles", "terrain"],
        "optional": ["roads", "tankCrew", "equipmentWrecks"],
        "animated": [],
    },
    "hiroshima": {
        "required": ["japanSurfaces", "hiroshimaCity", "japanCivilians", "tankCrew"],
        "optional": [],
        "animated": ["nuke"],
    },
    "nagasaki": {
        "required": ["japanSurfaces", "nagasakiCity", "japanCivilians", "tankCrew"],
        "optional": [],
        "animated": ["nuke"],
    },
}
# Chromium 155 rounds some partially transparent vehicle RGB channels differently
# when decoding the lossless WebP. Keep the byte-exact PNG for this sheet.
BROWSER_EXCLUSIONS = {"battle-topdown-vehicles": ["losslessWebp"]}


def encode(image, format, **options):
    result = BytesIO()
    image.save(result, format=format, **options)
    return result.getvalue()


def prepare(name, original, frame_grid):
    with Image.open(BytesIO(original)) as source:
        reference = source.convert("RGBA").tobytes()
        dimensions = (frame_grid["width"], frame_grid["height"])
        candidates = [
            ("originalPng", "png", original),
            ("optimizedPng", "png", encode(source, "PNG", optimize=True)),
            ("losslessWebp", "webp", encode(source, "WEBP", lossless=True, quality=100, method=6, exact=True)),
        ]
        for label, _, content in candidates:
            with Image.open(BytesIO(content)) as decoded:
                if decoded.size != dimensions or decoded.convert("RGBA").tobytes() != reference:
                    raise ValueError(f"{name}: {label} changed geometry or decoded RGBA")
    excluded = BROWSER_EXCLUSIONS.get(name, [])
    selected, extension, content = min(
        (candidate for candidate in candidates if candidate[0] not in excluded),
        key=lambda candidate: len(candidate[2]),
    )
    filename = f"{name}.{extension}"
    descriptor = {
        "path": filename,
        "format": selected,
        "bytes": len(content),
        "sha256": sha256(content).hexdigest(),
        "rgbaSha256": sha256(reference).hexdigest(),
        "originalSha256": sha256(original).hexdigest(),
        "frameGrid": frame_grid,
        "candidateBytes": {label: len(encoded) for label, _, encoded in candidates},
        "excludedByBrowserParity": excluded,
    }
    return descriptor, content


def main():
    webp = features.version("webp")
    if Image.__version__ != "12.3.0" or webp != "1.6.0":
        raise SystemExit("Expected Pillow 12.3.0 with libwebp 1.6.0 for byte-stable output")
    reference = json.loads((REFERENCE / "manifest.json").read_text(encoding="utf-8-sig"))
    frozen = {entry["path"]: entry for entry in reference["files"]}
    prepared = {}
    for key, stem in ASSET_NAMES.items():
        name = f"battle-topdown-{stem}"
        entry = frozen[f"{name}.png"]
        original = (REFERENCE / entry["path"]).read_bytes()
        if len(original) != entry["bytes"] or sha256(original).hexdigest() != entry["sha256"]:
            raise ValueError(f"Frozen source differs from manifest: {name}")
        prepared[key] = prepare(name, original, entry["frameGrid"])

    for key, (stem, columns, rows) in GENERATED_ASSETS.items():
        name = f"battle-topdown-{stem}"
        source = GENERATED_REFERENCE / f"{name}.png"
        grid = {"width": columns * 64, "height": rows * 64, "columns": columns, "rows": rows}
        descriptor, content = prepare(name, source.read_bytes(), grid)
        descriptor["originalPath"] = source.relative_to(PIXEL / "reference").as_posix()
        prepared[key] = descriptor, content

    files = {key: descriptor for key, (descriptor, _) in prepared.items()}
    version_input = json.dumps({"files": files, "scenes": SCENES}, sort_keys=True).encode()
    manifest = {
        "schema": 1,
        "version": f"battle-v1-{sha256(version_input).hexdigest()[:12]}",
        "encoder": {"pillow": Image.__version__, "libwebp": webp},
        "files": files,
        "scenes": SCENES,
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for descriptor, content in prepared.values():
        (OUTPUT / descriptor["path"]).write_bytes(content)
    (OUTPUT / "scene-sprites.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(manifest["version"], sum(item["bytes"] for item in files.values()), "bytes")


if __name__ == "__main__":
    main()
