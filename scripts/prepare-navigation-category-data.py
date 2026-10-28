"""Pin SHOM navigation-category boundaries without simplifying their coordinates.

Uses only Python's standard library. See
docs/deployment/navigation-categories-overlay.md for source and legal limitations.
"""
from __future__ import annotations

import argparse
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import tempfile
import urllib.request


SOURCE_CRS = "urn:ogc:def:crs:EPSG::4326"
MAX_SOURCE_BYTES = 1_000_000
SOURCE_TIMESTAMP = re.compile(rb'(?<="timeStamp":")[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z(?=")')
OUTPUT = Path(__file__).resolve().parents[1] / "src/features/seaOperations/mapData/shom-navigation-categories.json"
SOURCES = (
    {
        "category": 2,
        "filename": "categorie2-wfs1.geojson",
        "url": "https://services.data.shom.fr/INSPIRE/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=DAM_LIMIT_CAT_NAVIGATION_WFS:categorie2_lines_3857&srsName=EPSG:4326&outputFormat=application/json",
        "retrieved_raw_sha256": "fd220c668b9c11e04aa3ffd99f07da9ac26cf91c3534751ee4fdc7700864b6ef",
        "content_sha256": "def473e19d9d2fa0d66c5046c6e5152f8a07e8312cd59274c58c3a57fb77faa3",
        "features": 3,
        "lines": 3,
        "coordinates": 2013,
        "bounds": ("-10.11074194", "38.52088119", "13.76234309", "54.57840393"),
    },
    {
        "category": 3,
        "filename": "categorie3-wfs1.geojson",
        "url": "https://services.data.shom.fr/INSPIRE/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=DAM_LIMIT_CAT_NAVIGATION_WFS:categorie3_lines_3857&srsName=EPSG:4326&outputFormat=application/json",
        "retrieved_raw_sha256": "4c0b418a7b9da190cb8e1b653febd52f17b6f844da31a0e00ccf66b1272d35da",
        "content_sha256": "45f7797da5de5ae3f9d58a97167a0a68cbd3de50a3020958d125f220c4dd1e46",
        "features": 8,
        "lines": 8,
        "coordinates": 5491,
        "bounds": ("-5.65255648", "41.13829746", "10.00864778", "51.43576969"),
    },
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def source_content_sha256(data: bytes) -> str:
    # GeoServer changes only this top-level response timestamp on every request.
    # Normalize its value in the original bytes, leaving every other byte intact.
    document = json.loads(data, parse_float=Decimal, parse_constant=reject_constant)
    if not isinstance(document, dict) or not isinstance(document.get("timeStamp"), str):
        raise ValueError("Expected a top-level SHOM service timeStamp")
    matches = list(SOURCE_TIMESTAMP.finditer(data))
    if len(matches) != 1 or matches[0].group().decode("ascii") != document["timeStamp"]:
        raise ValueError("Expected exactly one ISO8601 SHOM service timeStamp")
    match = matches[0]
    return sha256(data[:match.start()] + b"<service-timeStamp>" + data[match.end():])


def source_bytes(source: dict, cache_dir: Path) -> bytes:
    path = cache_dir / source["filename"]
    cached = path.exists()
    if cached:
        data = path.read_bytes()
    else:
        request = urllib.request.Request(source["url"], headers={"User-Agent": "SeaPilot-offline-navigation-categories/1"})
        with urllib.request.urlopen(request, timeout=60) as response:
            if response.status != 200:
                raise ValueError(f"Unexpected source HTTP status: {response.status}")
            data = response.read(MAX_SOURCE_BYTES + 1)
    if len(data) > MAX_SOURCE_BYTES:
        raise ValueError(f"SHOM source exceeds {MAX_SOURCE_BYTES} bytes: {source['filename']}")
    if source_content_sha256(data) != source["content_sha256"]:
        location = "Cached SHOM source checksum mismatch" if cached else "SHOM source changed"
        raise ValueError(f"{location}: {path}; review provenance before updating its hash")
    if not cached:
        cache_dir.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    return data


def reject_constant(value: str) -> None:
    raise ValueError(f"Invalid JSON number in SHOM source: {value}")


def category_lines(source: dict, data: bytes) -> list:
    # Decimal retains every published decimal digit; no binary float conversion,
    # rounding, simplification, sorting, joining, or ring closure is performed.
    document = json.loads(data, parse_float=Decimal, parse_constant=reject_constant)
    if document.get("type") != "FeatureCollection":
        raise ValueError("Expected a SHOM GeoJSON FeatureCollection")
    if document.get("crs") != {"type": "name", "properties": {"name": SOURCE_CRS}}:
        raise ValueError("Expected explicitly requested WGS84 EPSG:4326 coordinates")
    for key in ("totalFeatures", "numberMatched", "numberReturned"):
        if type(document.get(key)) is not int or document[key] != source["features"]:
            raise ValueError(f"Incomplete or changed SHOM feature count: {key}")
    features = document.get("features")
    if not isinstance(features, list) or len(features) != source["features"]:
        raise ValueError("Incomplete SHOM feature array")
    lines = []
    for feature in features:
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise ValueError("Expected SHOM GeoJSON features")
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict) or geometry.get("type") != "MultiLineString":
            raise ValueError("Expected SHOM MultiLineString boundaries")
        parts = geometry.get("coordinates")
        if not isinstance(parts, list) or not parts:
            raise ValueError("Empty SHOM boundary geometry")
        for line in parts:
            if not isinstance(line, list) or len(line) < 2:
                raise ValueError("Invalid SHOM boundary part")
            for point in line:
                if not isinstance(point, list) or len(point) != 2:
                    raise ValueError("Expected two-dimensional [longitude, latitude] coordinates")
                if any(type(value) not in (int, Decimal) or not Decimal(value).is_finite() for value in point):
                    raise ValueError("Expected finite decimal SHOM coordinates")
                longitude, latitude = point
                if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
                    raise ValueError("SHOM coordinate outside WGS84 geographic bounds")
            if line[0] == line[-1]:
                raise ValueError("The pinned SHOM boundaries are open lines, not closed rings")
            lines.append(line)
    points = [point for line in lines for point in line]
    if len(lines) != source["lines"] or len(points) != source["coordinates"]:
        raise ValueError("Changed SHOM line or coordinate count")
    bounds = (min(point[0] for point in points), min(point[1] for point in points),
              max(point[0] for point in points), max(point[1] for point in points))
    if bounds != tuple(Decimal(value) for value in source["bounds"]):
        raise ValueError("Changed SHOM coverage or longitude/latitude axis order")
    return lines


def encode_categories(categories: list[dict]) -> bytes:
    # The output contract contains only categories and numeric coordinate arrays.
    # Decimal's string representation serializes source numbers without rounding.
    encoded_categories = []
    for entry in categories:
        encoded_lines = ["[" + ",".join("[" + ",".join(str(value) for value in point) + "]" for point in line) + "]"
                         for line in entry["lines"]]
        encoded_categories.append('{"category":' + str(entry["category"]) + ',"lines":[' + ",".join(encoded_lines) + "]}")
    encoded = ('{"categories":[' + ",".join(encoded_categories) + "]}\n").encode("ascii")
    if json.loads(encoded, parse_float=Decimal, parse_constant=reject_constant) != {"categories": categories}:
        raise ValueError("Generated SHOM coordinates differ from the source")
    return encoded


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=Path(tempfile.gettempdir()) / "seapilot-navigation-categories",
                        help="Directory containing verified public WFS responses; missing responses are downloaded")
    parser.add_argument("--check", action="store_true",
                        help="Rebuild in memory and require byte-identical tracked JSON; do not write the asset")
    args = parser.parse_args()
    categories = [{"category": source["category"], "lines": category_lines(source, source_bytes(source, args.cache_dir))}
                  for source in SOURCES]
    encoded = encode_categories(categories)
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_bytes() != encoded:
            raise ValueError(f"Generated SHOM asset differs: {OUTPUT}")
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_bytes(encoded)
    print(json.dumps({"checked": args.check, "file": OUTPUT.name, "bytes": len(encoded), "sha256": sha256(encoded),
                      "categories": [{"category": source["category"], "features": source["features"],
                                      "lines": source["lines"], "coordinates": source["coordinates"]} for source in SOURCES]}))


if __name__ == "__main__":
    main()
