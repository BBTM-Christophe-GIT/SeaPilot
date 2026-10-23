"""Build offline Natural Earth land rings; never reads routes or operational data.

See src/features/seaOperations/mapData/README.md for pinned dependencies/provenance.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import sys
import tempfile
import urllib.request
import zipfile

import numpy
import shapefile
import shapely
from shapely.geometry import Polygon, box, shape


EUROPE_BOUNDS = (-15.0, 40.0, 12.0, 58.0)  # west, south, east, north
DECIMALS = 3
SOURCES = (
    {
        "stem": "ne_50m_land", "version": "4.1.0", "output": "world-land.json",
        "url": "https://naturalearth.s3.amazonaws.com/50m_physical/ne_50m_land.zip",
        "sha256": "0b8e670cf80dce9cbebe2a193bc44ba5602758c22e1fa603980553646d7ff162",
        "tolerance": 0.03, "bounds": None,
    },
    {
        "stem": "ne_10m_land", "version": "5.1.1", "output": "europe-land.json",
        "url": "https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_land.zip",
        "sha256": "e547d749445eaa0964aba76738090ec88f5e63c4585122170f98c67a7ea922dc",
        "tolerance": 0.003, "bounds": EUROPE_BOUNDS,
    },
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def archive_for(source: dict, cache_dir: Path) -> bytes:
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{source['stem']}.zip"
    if path.exists():
        data = path.read_bytes()
    else:
        request = urllib.request.Request(source["url"], headers={"User-Agent": "SeaPilot-offline-map-data/1"})
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read(20_000_001)
        if len(data) > 20_000_000:
            raise ValueError("Natural Earth archive exceeds the 20 MB generation limit")
        if sha256(data) != source["sha256"]:
            raise ValueError(f"Source checksum changed for {source['stem']}; review an update explicitly")
        path.write_bytes(data)
    if sha256(data) != source["sha256"]:
        raise ValueError(f"Cached source checksum mismatch: {path}")
    return data


def polygons(geometry):
    if geometry.is_empty:
        return
    if geometry.geom_type == "Polygon":
        yield geometry
    elif geometry.geom_type in ("MultiPolygon", "GeometryCollection"):
        for part in geometry.geoms:
            yield from polygons(part)


def coordinate(value: float):
    result = round(value, DECIMALS)
    return int(result) if result.is_integer() else result


def canonical_ring(coords) -> list[list[float]] | None:
    points = []
    for lon, lat in coords:
        point = (coordinate(lon), coordinate(lat))
        if not points or point != points[-1]:
            points.append(point)
    if len(points) > 1 and points[-1] == points[0]:
        points.pop()
    if len(points) < 3:
        return None
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1]))
    if abs(area) < 1e-12:
        return None
    if area < 0:
        points.reverse()
    start = min(range(len(points)), key=points.__getitem__)
    points = points[start:] + points[:start]
    return [list(point) for point in points + points[:1]]


def validate_rings(rings: list, bounds) -> None:
    if not rings:
        raise ValueError("Empty land asset")
    west, south, east, north = bounds or (-180, -90, 180, 90)
    for ring in rings:
        if len(ring) < 4 or ring[0] != ring[-1] or not Polygon(ring).is_valid:
            raise ValueError("Invalid or open output land ring")
        for lon, lat in ring:
            if not math.isfinite(lon) or not math.isfinite(lat) or not (west <= lon <= east and south <= lat <= north):
                raise ValueError("Output coordinate outside its declared coverage")


def build(source: dict, cache_dir: Path):
    data = archive_for(source, cache_dir)
    rings = []
    clip = box(*source["bounds"]) if source["bounds"] else None
    repaired = 0
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        stem = source["stem"]
        version = archive.read(f"{stem}.VERSION.txt").decode("utf8").strip()
        if version != source["version"]:
            raise ValueError(f"Unexpected Natural Earth version: {version}")
        if "WGS_1984" not in archive.read(f"{stem}.prj").decode("utf8"):
            raise ValueError("Expected WGS84 geographic source coordinates")
        reader = shapefile.Reader(shp=io.BytesIO(archive.read(f"{stem}.shp")), shx=io.BytesIO(archive.read(f"{stem}.shx")))
        for feature in reader.iterShapes():
            geometry = shape(feature.__geo_interface__)
            if clip is not None and not geometry.intersects(clip):
                continue
            if not geometry.is_valid:
                geometry = shapely.make_valid(geometry)
                repaired += 1
            if clip is not None:
                geometry = geometry.intersection(clip)
            geometry = geometry.simplify(source["tolerance"], preserve_topology=True)
            for polygon in polygons(geometry):
                ring = canonical_ring(polygon.exterior.coords)
                if ring is None:
                    continue
                rounded = Polygon(ring)
                if not rounded.is_valid:
                    repaired += 1
                    for part in polygons(shapely.make_valid(rounded)):
                        candidate = canonical_ring(part.exterior.coords)
                        if candidate is not None:
                            rings.append(candidate)
                else:
                    rings.append(ring)
        reader.close()
    rings.sort()
    validate_rings(rings, source["bounds"])
    encoded = (json.dumps(rings, separators=(",", ":"), ensure_ascii=True, allow_nan=False) + "\n").encode("ascii")
    return encoded, {"file": source["output"], "sourceVersion": source["version"], "rings": len(rings),
        "coordinates": sum(map(len, rings)), "bytes": len(encoded), "sha256": sha256(encoded), "repairedGeometries": repaired}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=Path(tempfile.gettempdir()) / "seapilot-natural-earth")
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parents[1] / "src/features/seaOperations/mapData")
    parser.add_argument("--check", action="store_true", help="Rebuild in memory and require byte-identical tracked JSON; do not write assets")
    args = parser.parse_args()
    versions = {"shapely": shapely.__version__, "pyshp": shapefile.__version__, "numpy": numpy.__version__}
    if versions != {"shapely": "2.1.2", "pyshp": "2.3.1", "numpy": "2.2.6"}:
        raise ValueError(f"Use the pinned generation dependencies from README, got {versions}")
    if shapely.geos_version_string != "3.13.1":
        raise ValueError(f"Use the pinned binary Shapely wheel with GEOS 3.13.1, got {shapely.geos_version_string}")
    outputs = [build(source, args.cache_dir) for source in SOURCES]
    for data, report in outputs:
        target = args.output_dir / report["file"]
        if args.check:
            if not target.exists() or target.read_bytes() != data:
                raise ValueError(f"Generated asset differs: {target}")
        else:
            args.output_dir.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
    total = sum(len(data) for data, _ in outputs)
    if total >= 700_000:
        print(f"Warning: combined assets exceed the 700 kB target ({total} bytes)", file=sys.stderr)
    print(json.dumps({"dependencies": versions, "geos": shapely.geos_version_string, "checked": args.check,
        "totalBytes": total, "outputs": [report for _, report in outputs]}, indent=2))


if __name__ == "__main__":
    main()
