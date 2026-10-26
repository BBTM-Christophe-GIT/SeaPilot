"""Prepare offline reference points; never receives vessel routes or operation data."""
import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import urllib.request
import zipfile

SOURCES = {
    "france-ports.zip": (
        "https://services.sandre.eaufrance.fr/telechargement/geo/PTS/PortMaritime_FRA/Port_Maritime_FRA.geojson.zip",
        "e6dfa72fa5abf5931b0c99136ef305421596c400123ee17d4d2051be154b6820"),
    "wpi.csv": (
        "https://msi.nga.mil/api/publications/download?key=16920959%2FSFH00000%2FUpdatedPub150.csv&type=view",
        "315644f1e77966291633145fd351c2762b37702d115926b9ed074b39e8e21667"),
    "cities.zip": (
        "https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_populated_places_simple.zip",
        "2963ee08f7743f13f37d5243acd77a2f7a510e26a36c7e04b920f1b381f2b251"),
}


def source(cache, name):
    url, expected = SOURCES[name]
    path = cache / name
    if not path.exists():
        with urllib.request.urlopen(url, timeout=60) as response:
            path.write_bytes(response.read())
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"Source changed: {name}; review provenance before updating its hash")
    return data


def position(longitude, latitude):
    longitude, latitude = float(longitude), float(latitude)
    if not math.isfinite(latitude) or not math.isfinite(longitude) or not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ValueError("Invalid WGS84 reference point")
    return round(longitude, 6), round(latitude, 6)


def dbf_rows(data):
    count = struct.unpack_from("<I", data, 4)[0]
    header_size, row_size = struct.unpack_from("<HH", data, 8)
    fields = []
    for offset in range(32, header_size - 1, 32):
        field = data[offset:offset + 32]
        fields.append((field[:11].split(b"\0")[0].decode("ascii"), chr(field[11]), field[16]))
    for index in range(count):
        row = data[header_size + index * row_size:header_size + (index + 1) * row_size]
        if row[:1] != b" ":
            raise ValueError("Unexpected deleted Natural Earth record")
        result, cursor = {}, 1
        for name, kind, size in fields:
            value = row[cursor:cursor + size].decode("utf-8").strip(); cursor += size
            result[name] = (None if not value or set(value) == {"*"} else float(value)) if kind == "N" else value
        yield result


def shape_points(data):
    if struct.unpack_from("<i", data, 32)[0] != 1:
        raise ValueError("Expected a point shapefile")
    offset = 100
    while offset < len(data):
        size = struct.unpack_from(">i", data, offset + 4)[0] * 2
        record = data[offset + 8:offset + 8 + size]
        if struct.unpack_from("<i", record)[0] != 1:
            raise ValueError("Expected a non-null point")
        yield position(*struct.unpack_from("<dd", record, 4))
        offset += size + 8


def prepare(cache):
    archive = zipfile.ZipFile(io.BytesIO(source(cache, "france-ports.zip")))
    french = json.loads(archive.read("Port_Maritime_FRA.geojson"))
    if french.get("crs", {}).get("properties", {}).get("name") != "urn:ogc:def:crs:OGC:1.3:CRS84":
        raise ValueError("Expected SANDRE CRS84")
    ports = []
    for feature in french["features"]:
        properties, geometry = feature["properties"], feature["geometry"]
        if geometry["type"] != "Point":
            raise ValueError("Expected SANDRE point")
        longitude, latitude = position(*geometry["coordinates"])
        commune = properties.get("CdCommune") or ""
        department = commune[:3] if commune.startswith(("97", "98")) else commune[:2]
        ports.append(["sandre", properties["CdPort"], properties["NomPort"], properties.get("LbCommune") or "", department,
                      "", longitude, latitude, str(properties.get("CdPrecisionCoordPort") or "0")])
    for row in csv.DictReader(io.StringIO(source(cache, "wpi.csv").decode("utf-8-sig"))):
        if row["Country Code"] != "United Kingdom":
            continue
        longitude, latitude = position(row["Longitude"], row["Latitude"])
        locode = "".join(character for character in row["UN/LOCODE"].upper() if character.isalnum())
        if len(locode) != 5 or not locode.startswith("GB"):
            locode = ""  # Malformed source LOCODEs are never repaired by guessing.
        ports.append(["wpi", str(int(float(row["World Port Index Number"]))), row["Main Port Name"], "", "", locode,
                      longitude, latitude, "unknown"])
    archive = zipfile.ZipFile(io.BytesIO(source(cache, "cities.zip")))
    if archive.read("ne_10m_populated_places_simple.VERSION.txt").decode().strip() != "5.1.2":
        raise ValueError("Unexpected Natural Earth version")
    records = list(dbf_rows(archive.read("ne_10m_populated_places_simple.dbf")))
    points = list(shape_points(archive.read("ne_10m_populated_places_simple.shp")))
    if len(records) != len(points):
        raise ValueError("Mismatching Natural Earth shape/attribute records")
    cities = [[str(int(row["ne_id"])), row["name"], *point, int(row["scalerank"]), int(row["pop_max"] or 0)]
              for row, point in zip(records, points)]
    ports.sort(key=lambda row: (row[0], row[1])); cities.sort(key=lambda row: row[0])
    if len({(row[0], row[1]) for row in ports}) != len(ports) or len({row[0] for row in cities}) != len(cities):
        raise ValueError("Duplicate reference identities")
    return {"version": 1, "retrievedOn": "2026-10-26", "ports": ports, "cities": cities}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(); args.cache_dir.mkdir(parents=True, exist_ok=True)
    result = prepare(args.cache_dir)
    target = Path(__file__).resolve().parents[1] / "src/features/seaOperations/mapData/places.json"
    encoded = (json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    if args.check:
        if target.read_bytes() != encoded:
            raise ValueError("Regenerated places do not match checked-in data")
    else:
        target.write_bytes(encoded)
    print(json.dumps({"ports": len(result["ports"]), "cities": len(result["cities"]), "bytes": len(encoded),
                      "sha256": hashlib.sha256(encoded).hexdigest()}))


if __name__ == "__main__":
    main()
