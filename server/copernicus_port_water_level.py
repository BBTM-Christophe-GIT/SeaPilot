"""Qualified sea-level forecasts near ports, independent of the UKC estimate."""
from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree

from server.copernicus_provider import (
    MODELS, CopernicusProviderError, _axis, _bracketing_times, _inside, _iso,
    _load_metadata, _numeric, _qualify_axis, _qualify_metadata, _sdk_opener,
    _times, _utc, _variable,
)

EARTH_RADIUS_METERS = 6_371_008.8
PORT_SAMPLE_RADIUS_METERS = 2_000
PORT_COPERNICUS_MODELS = {
    **MODELS,
    "MED": {
        "product": "MEDSEA_ANALYSISFORECAST_PHY_006_013",
        "sea": "cmems_mod_med_phy-ssh_anfc_4.2km_PT15M-i",
        "version": "202611",
        "extent": (-17.29166603088379, 30.1875, 36.29166793823242, 45.97916793823242),
        "step": (0.041666668644218384, 0.04166667002172143),
    },
}
PORT_WATER_LEVEL_SOURCES = {
    f"copernicus-{name.lower()}": (
        "model-geoid", f"https://data.marine.copernicus.eu/product/{model['product']}/description",
    )
    for name, model in PORT_COPERNICUS_MODELS.items()
}
PORT_WATER_LEVEL_SOURCES.update({
    "shom-tolosa": ("model-mean-sea-level", "https://www.shom.fr/fr/copernicus"),
    "shom-hycom": ("model-mean-sea-level", "https://www.shom.fr/fr/copernicus"),
})
SHOM_WMS = "https://services.data.shom.fr/ncwms2/wms"
# Published regional SSH layers, from fine to coarse. The Mediterranean
# HYCOM product publishes surge only, without a total water level.
SHOM_LAYERS = (
    ("NIVEAUX_TOLOSA_R1110_PASCA-200M", "shom-tolosa", (-0.001, 49.699, 3.001, 51.501)),
    ("NIVEAUX_TOLOSA_R1120_NORMANDIE-200M", "shom-tolosa", (-3.001, 48.399, 1.501, 50.101)),
    ("NIVEAUX_TOLOSA_R1130_ARMOR-200M", "shom-tolosa", (-5.501, 46.899, -1.349, 49.101)),
    ("NIVEAUX_TOLOSA_R1140_AQUI-200M", "shom-tolosa", (-2.601, 43.199, -0.399, 47.501)),
    ("NIVEAUX_TOLOSA_R1100_FACADE-1KM", "shom-tolosa", (-6.005, 42.995, 3.005, 52.005)),
    ("NIVEAUX_TOLOSA_R1000_ATL-5KM", "shom-tolosa", (-9.025, 42.975, 10.025, 62.025)),
    ("NIVEAUX_HYCOM2D_R3000_ANG-CG", "shom-hycom", (-64.861, -8.395, -19.293, 34.325)),
    ("NIVEAUX_HYCOM2D_R5110_MAY-CG", "shom-hycom", (44.653, -13.408, 45.671, -12.281)),
    ("NIVEAUX_HYCOM2D_R5100_MAY-CG", "shom-hycom", (42.509, -13.818, 46.954, -10.800)),
    ("NIVEAUX_HYCOM2D_R5200_REU-CG", "shom-hycom", (53.610, -22.573, 60.564, -18.004)),
    ("NIVEAUX_HYCOM2D_R5000_OIN-CG", "shom-hycom", (32.029, -29.942, 67.527, -7.988)),
)


def port_sample_distance(latitude, longitude, sample_latitude, sample_longitude):
    start, end = math.radians(latitude), math.radians(sample_latitude)
    delta = math.radians(sample_longitude - longitude)
    a = math.sin((end - start) / 2) ** 2 + math.cos(start) * math.cos(end) * math.sin(delta / 2) ** 2
    return 2 * EARTH_RADIUS_METERS * math.asin(math.sqrt(min(1, a)))


def _sample(source, latitude, longitude, height):
    datum, source_url = PORT_WATER_LEVEL_SOURCES[source]
    return {"heightMeters": height, "sampleLatitude": latitude, "sampleLongitude": longitude,
            "source": source, "sourceUrl": source_url, "datum": datum}


def _interpolate(eta, before, after, start, end):
    if before == after:
        return start
    return start + (end - start) * (eta - before).total_seconds() / (after - before).total_seconds()


def _degrees(radius, latitude):
    latitude_delta = math.degrees(radius / EARTH_RADIUS_METERS)
    return latitude_delta, latitude_delta / math.cos(math.radians(latitude))


def _copernicus(name, latitude, longitude, eta, username, password, opener, metadata_loader):
    model = PORT_COPERNICUS_MODELS[name]
    grid = _qualify_metadata(metadata_loader(model, False), model, False, eta)
    before, after = _bracketing_times(eta)
    latitude_radius, longitude_radius = _degrees(PORT_SAMPLE_RADIUS_METERS + 1, latitude)
    sea = opener(
        dataset_id=model["sea"], dataset_version=model["version"], username=username, password=password,
        variables=["zos"], service="arco-geo-series", start_datetime=_iso(before), end_datetime=_iso(after),
        minimum_latitude=latitude - latitude_radius, maximum_latitude=latitude + latitude_radius,
        minimum_longitude=longitude - longitude_radius, maximum_longitude=longitude + longitude_radius,
        coordinates_selection_method="outside", raise_if_updating=True,
    )
    try:
        latitudes, longitudes = _axis(sea, "latitude"), _axis(sea, "longitude")
        _qualify_axis(latitudes, grid["latitude"])
        _qualify_axis(longitudes, grid["longitude"])
        times = _times(sea)
        if before not in times or after not in times:
            return None
        zos = _variable(sea, "zos", "sea_surface_height_above_geoid", ["time", "latitude", "longitude"])
        candidates = sorted(
            (port_sample_distance(latitude, longitude, lat, lon), lat_index, lon_index)
            for lat_index, lat in enumerate(latitudes) for lon_index, lon in enumerate(longitudes)
        )
        for distance, lat_index, lon_index in candidates:
            if distance > PORT_SAMPLE_RADIUS_METERS:
                break
            indices = {"latitude": lat_index, "longitude": lon_index}
            try:
                start = _numeric(zos, {**indices, "time": times.index(before)}, "missingWaterLevel")
                end = start if before == after else _numeric(
                    zos, {**indices, "time": times.index(after)}, "missingWaterLevel",
                )
            except CopernicusProviderError as error:
                if error.code != "missingWaterLevel":
                    raise
                continue
            if abs(start) <= 100 and abs(end) <= 100:
                return _sample(f"copernicus-{name.lower()}", latitudes[lat_index], longitudes[lon_index],
                               _interpolate(eta, before, after, start, end))
        return None
    finally:
        sea.close()


def _shom_height(layer, latitude, longitude, instant):
    params = {
        "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetFeatureInfo", "LAYERS": layer,
        "QUERY_LAYERS": layer, "STYLES": "", "CRS": "CRS:84", "WIDTH": 1, "HEIGHT": 1, "I": 0, "J": 0,
        "INFO_FORMAT": "text/xml", "FEATURE_COUNT": 1, "TIME": _iso(instant),
        "BBOX": f"{longitude - .001:.8f},{latitude - .001:.8f},{longitude + .001:.8f},{latitude + .001:.8f}",
    }
    request = Request(f"{SHOM_WMS}?{urlencode(params)}", headers={"User-Agent": "SeaPilot-Port-Water-Level/1"})
    try:
        with urlopen(request, timeout=4) as response:
            if not response.geturl().startswith(f"{SHOM_WMS}?"):
                return None
            raw = response.read(8_193)
        if len(raw) > 8_192 or b"<!" in raw:
            return None
        data = ElementTree.fromstring(raw)
        sample_latitude, sample_longitude = float(data.findtext("latitude")), float(data.findtext("longitude"))
        if (data.tag != "FeatureInfoResponse"
                or not abs(sample_latitude - latitude) <= .000001
                or not abs(sample_longitude - longitude) <= .000001
                or data.findtext("Feature/layer") != layer
                or data.findtext("Feature/FeatureInfo/id") != "ssh"):
            return None
        if _utc(data.findtext("Feature/FeatureInfo/time")) != instant:
            return None
        height = float(data.findtext("Feature/FeatureInfo/value"))
        return height if abs(height) <= 100 else None
    except (OSError, ValueError, TypeError, ElementTree.ParseError, CopernicusProviderError):
        return None


def _shom(latitude, longitude, eta, read_height):
    before = eta.replace(minute=0, second=0, microsecond=0)
    after = before if eta == before else before + timedelta(hours=1)
    layers = tuple((f"{layer}/ssh", source) for layer, source, (west, south, east, north) in SHOM_LAYERS
                   if west <= longitude <= east and south <= latitude <= north)
    if not layers:
        return None

    def forecast(candidate):
        layer, source, lat, lon = candidate
        start = read_height(layer, lat, lon, before)
        if start is None:
            return None
        end = start if before == after else read_height(layer, lat, lon, after)
        if end is not None:
            return _sample(source, lat, lon, _interpolate(eta, before, after, start, end))
        return None

    # Try the port at every available resolution before checking nearby water.
    # At most two four-point rings on the finest applicable layer are queried.
    layer, source = layers[0]
    with ThreadPoolExecutor(max_workers=4) as workers:
        exact = ((name, origin, latitude, longitude) for name, origin in layers)
        result = next((value for value in workers.map(forecast, exact) if value is not None), None)
        if result is not None:
            return result
        for radius in (750, 1_500):
            dy, dx = _degrees(radius, latitude)
            positions = ((latitude + dy, longitude), (latitude, longitude + dx),
                         (latitude - dy, longitude), (latitude, longitude - dx))
            nearby = ((layer, source, lat, lon) for lat, lon in positions)
            result = next((value for value in workers.map(forecast, nearby) if value is not None), None)
            if result is not None:
                return result
    return None


def fetch_port_water_level(latitude, longitude, eta_utc, username, password, *,
                           _opener=_sdk_opener, _metadata_loader=_load_metadata, _read_shom=_shom_height):
    """Fetch a forecast at the selected port, or an explicitly nearby water sample."""
    eta = _utc(eta_utc)
    if username and username.strip() and password:
        for name, model in PORT_COPERNICUS_MODELS.items():
            if _inside(model, latitude, longitude):
                try:
                    sample = _copernicus(name, latitude, longitude, eta, username, password, _opener, _metadata_loader)
                    if sample is not None:
                        return sample
                except Exception:
                    # SDK failures can include credentials. Use only the public fallback.
                    continue
    return _shom(latitude, longitude, eta, _read_shom)
