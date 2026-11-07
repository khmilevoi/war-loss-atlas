"""Pack the generated raster sources into the atlas's 64 px sprite grid."""

from pathlib import Path

from PIL import Image, ImageStat


REFERENCE = Path(__file__).resolve().parent.parent / "reference" / "generated-sprites"
CELL = 64


def cells(image, columns, rows):
    width, height = image.width // columns, image.height // rows
    for row in range(rows):
        for column in range(columns):
            yield image.crop((column * width, row * height, (column + 1) * width, (row + 1) * height))


def cut_object(cell):
    # The source carries a low-alpha halo. Keep only the opaque silhouette.
    alpha = cell.getchannel("A").point(lambda value: 255 if value >= 224 else 0)
    cell.putalpha(alpha)
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("Empty generated object")
    return cell.crop(bounds)


def place_object(cell):
    result = Image.new("RGBA", (CELL, CELL))
    result.paste(cell, ((CELL - cell.width) // 2, (CELL - cell.height) // 2), cell.getchannel("A"))
    return result


def object_frame(cell, target_width, target_height):
    cell = cut_object(cell)
    cell.thumbnail((target_width, target_height), Image.Resampling.NEAREST)
    return place_object(cell)


def ground_frame(cell, edge, match_tone=False):
    # Exclude the source sheet's gutters and use a common edge for mixed tiles.
    inset = min(cell.size) // 16
    ground = cell.crop((inset, inset, cell.width - inset, cell.height - inset)).convert("RGB")
    ground = ground.resize((CELL, CELL), Image.Resampling.NEAREST)
    if match_tone:
        offsets = [base - median for base, median in zip(edge, ImageStat.Stat(ground).median)]
        lookup = [max(0, min(255, value + offset)) for offset in offsets for value in range(256)]
        ground = ground.point(lookup)
    for y in range(CELL):
        for x in range(CELL):
            distance = min(x, y, CELL - 1 - x, CELL - 1 - y)
            if distance < 3:
                rgb = ground.getpixel((x, y))
                blended = tuple((tone * distance + base * (3 - distance)) // 3 for tone, base in zip(rgb, edge))
                ground.putpixel((x, y), blended)
    return ground.convert("RGBA")


def pack(name, columns, rows, frame, source_version="", *, trim_edge=False):
    with Image.open(REFERENCE / "originals" / f"{name}{source_version}.png") as original:
        source = original.convert("RGBA")
    if trim_edge:
        source = source.crop((0, 0, source.width - source.width % columns, source.height - source.height % rows))
    if source.width % columns or source.height % rows:
        raise ValueError(f"Invalid source grid: {name}")
    sheet = Image.new("RGBA", (columns * CELL, rows * CELL))
    for index, cell in enumerate(cells(source, columns, rows)):
        sheet.paste(frame(index, cell), ((index % columns) * CELL, (index // columns) * CELL))
    sheet.save(REFERENCE / f"battle-topdown-{name}.png", optimize=True)


def surface_frame(_, cell):
    inset = min(cell.size) // 32
    tile = cell.crop((inset, inset, cell.width - inset, cell.height - inset)).convert("RGB")
    tile = tile.resize((CELL, CELL), Image.Resampling.NEAREST)
    # Match opposite edges without putting a single flat colour on the seam.
    for _ in range(2):
        for depth in range(4):
            weight = (4 - depth) / 8
            for y in range(CELL):
                left = tile.getpixel((depth, y))
                right = tile.getpixel((CELL - 1 - depth, y))
                tile.putpixel((depth, y), tuple(round(a * (1 - weight) + b * weight) for a, b in zip(left, right)))
                tile.putpixel((CELL - 1 - depth, y), tuple(round(b * (1 - weight) + a * weight) for a, b in zip(left, right)))
        tile = tile.transpose(Image.Transpose.TRANSPOSE)
    return tile.convert("RGBA")


def main():
    for name in ("cold-war-units", "contemporary-units", "korea-units"):
        pack(name, 3, 2, unit_frame, "-overhead")
    pack("generic-terrain", 3, 2, generic_frame)
    pack("japan-terrain", 2, 2, lambda _, cell: ground_frame(cell, (197, 170, 151)), "-overhead")
    for name in ("hiroshima-city", "nagasaki-city"):
        pack(name, 3, 2, lambda _, cell: object_frame(cell, 55, 55), "-overhead-polished")
    pack("japan-civilians", 3, 2, lambda index, cell: unit_frame(index % 3, cell), "-overhead-polished")
    pack("japan-surfaces", 4, 2, surface_frame, "-overhead", trim_edge=True)


def unit_frame(index, cell):
    if index >= 3:
        return object_frame(cell, 58, 42)

    # The original infantry silhouettes use 3 px blocks in the 64 px cells.
    width, height = (15, 13) if index == 2 else (19, 14)
    reduced = cut_object(cell).resize((width, height), Image.Resampling.NEAREST)
    opaque = [pixel[:3] for pixel in reduced.get_flattened_data() if pixel[3]]
    samples = Image.new("RGB", (len(opaque), 1))
    samples.putdata(opaque)
    palette = samples.quantize(colors=9, dither=Image.Dither.NONE)
    flat = reduced.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE).convert("RGBA")
    flat.putalpha(reduced.getchannel("A"))
    return place_object(flat.resize((width * 3, height * 3), Image.Resampling.NEAREST))


def generic_frame(index, cell):
    if index < 3:
        return ground_frame(cell, (103, 97, 71), match_tone=True)
    return object_frame(cell, 22, 20)


if __name__ == "__main__":
    main()
