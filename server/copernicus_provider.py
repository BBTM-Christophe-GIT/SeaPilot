"""Small point extracts through the official Copernicus Marine Toolbox 2.5.0.

The public STAC documents qualify model/version/grid/horizon before SDK reads.
Only the containing cell and the two bracketing quarter-hours are loaded.
No client-supplied URL, nearby-cell relocation or inferred LAT conversion.
"""

from __future__ import annotations

import json
import logging
import math
import os
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen

METADATA_ROOT = "https://s3.waw3-1.cloudferro.com/mdl-metadata/metadata/"
QUARTER_SECONDS = 900
MAX_METADATA_BYTES = 262_144

MODELS = {
    "NWS": {
        "product": "NWSHELF_ANALYSISFORECAST_PHY_004_013",
        "sea": "cmems_mod_nws_phy-ssh_anfc_1.5km-2D_PT15M-i",
        "bathy": "cmems_mod_nws_phy_anfc_1.5km_static",
        "version": "202511", "extent": (-16.0, 46.0, 13.0, 62.74324035644531),
        "step": (0.030303030303030304, 0.013513511183571681),
    },
    "IBI": {
        "product": "IBI_ANALYSISFORECAST_PHY_005_001",
        "sea": "cmems_mod_ibi_phy_anfc_0.027deg-2D_PT15M-i",
        "bathy": "cmems_mod_ibi_phy_anfc_0.027deg-3D_static",
        "version": "202411", "extent": (-19.0828411, 26.16535726, 5.084566999999999, 56.08294177),
        "step": (0.02777863, 0.02777863),
    },
}

MESSAGES = {
    "notConfigured": "La connexion Copernicus Marine n’est pas configurée.",
    "invalidInput": "La position ou l’ETA transmise à Copernicus est invalide.",
    "outsideCoverage": "Ce waypoint se situe hors de la couverture des modèles NWS et IBI.",
    "outsideHorizon": "L’ETA se situe hors des échéances disponibles des modèles Copernicus.",
    "updating": "Les données Copernicus sont en cours de mise à jour pour cette ETA.",
    "incompatibleMetadata": "Les références, unités ou mailles Copernicus ne permettent pas un calcul cohérent.",
    "maskedCell": "La cellule du waypoint est masquée ou sans donnée marine ; aucune cellule voisine n’est substituée.",
    "shallowWater": "Calcul indicatif indisponible : profondeur de modèle inférieure ou égale à 10 m, incompatible avec l’usage petits fonds.",
    "missingTime": "Les deux échéances encadrant l’ETA ne sont pas disponibles dans la même cellule.",
    "upstreamUnavailable": "Les données Copernicus sont momentanément indisponibles. Réessayez ultérieurement.",
}


class CopernicusProviderError(Exception):
    """Fixed public error; never contains an upstream exception or credentials."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(MESSAGES[code])


def _finite(value):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def _utc(value):
    if not isinstance(value, str) or len(value) > 64 or not value.endswith("Z"):
        raise CopernicusProviderError("invalidInput")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.utcoffset() != timedelta(0):
            raise ValueError()
        return result
    except (ValueError, OverflowError):
        raise CopernicusProviderError("invalidInput") from None


def _iso(value):
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _inside(model, latitude, longitude):
    west, south, east, north = model["extent"]
    return west <= longitude <= east and south <= latitude <= north


def _source(name):
    model = MODELS[name]
    return {
        "model": name, "productId": model["product"], "seaLevelDatasetId": model["sea"],
        "bathymetryDatasetId": model["bathy"], "datasetVersion": model["version"],
        "datum": "model-geoid", "referenceTimeUtc": None,
        "sourceUrl": f"https://data.marine.copernicus.eu/product/{model['product']}/description",
    }


def _unavailable(code, name=None):
    return {"status": "unavailable", "code": code, "message": MESSAGES[code],
            "source": _source(name) if name else None, "cell": None, "waterLevel": None}


def _metadata_id(model, bathy):
    return f"{model['bathy' if bathy else 'sea']}_{model['version']}" + ("--ext--bathy" if bathy else "")


def _load_metadata(model, bathy):
    """The SDK itself lists these public STAC documents in clients-config-v1."""
    url = f"{METADATA_ROOT}{model['product']}/{_metadata_id(model, bathy)}/dataset.stac.json"
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "SeaPilot-Copernicus/1"})
    with urlopen(request, timeout=8) as response:
        # Metadata requests have no credentials. A redirect must stay on this fixed host.
        if not response.geturl().startswith(METADATA_ROOT):
            raise CopernicusProviderError("incompatibleMetadata")
        raw = response.read(MAX_METADATA_BYTES + 1)
        if len(raw) > MAX_METADATA_BYTES:
            raise CopernicusProviderError("incompatibleMetadata")
        return json.loads(raw)


def _qualify_metadata(metadata, model, bathy, eta):
    try:
        if metadata["id"] != _metadata_id(model, bathy):
            raise ValueError()
        props = metadata["properties"]
        if props.get("admp_in_preparation") or props.get("admp_retired_date"):
            raise ValueError()
        variables = props["cube:variables"]
        variable = variables["deptho" if bathy else "zos"]
        expected = "sea_floor_depth_below_geoid" if bathy else "sea_surface_height_above_geoid"
        if variable["standardName"] != expected:
            raise ValueError()
        # NWS static deptho omits its units attribute; its PUM explicitly defines metres.
        if variable.get("unit") != "m" and not (bathy and model is MODELS["NWS"] and variable.get("unit") is None):
            raise ValueError()
        dimensions = props["cube:dimensions"]
        for axis, expected_step in (("longitude", model["step"][0]), ("latitude", model["step"][1])):
            step = dimensions[axis]["step"]
            extent = dimensions[axis]["extent"]
            if not _finite(step) or abs(step - expected_step) > 0.00001 or len(extent) != 2 or not all(map(_finite, extent)):
                raise ValueError()
        if bathy:
            if variables["mask"]["standardName"] != "sea_binary_mask":
                raise ValueError()
            return dimensions
        updating = props.get("admp_updating_start_date")
        if updating and eta >= _utc(updating):
            raise CopernicusProviderError("updating")
        temporal = dimensions["time"]
        if temporal.get("step") not in ("PT900S", "PT15M"):
            raise ValueError()
        start, end = map(_utc, temporal["extent"])
        if props.get("admp_valid_start_date"):
            start = max(start, _utc(props["admp_valid_start_date"]))
        if not start <= eta <= end:
            raise CopernicusProviderError("outsideHorizon")
        return dimensions
    except CopernicusProviderError as error:
        if error.code == "invalidInput":
            raise CopernicusProviderError("incompatibleMetadata") from None
        raise
    except (KeyError, TypeError, ValueError, IndexError):
        raise CopernicusProviderError("incompatibleMetadata") from None


def _sdk_opener(**kwargs):
    # Official SDK settings are read at import time. Do not allow interactive login.
    os.environ.setdefault("COPERNICUSMARINE_HTTPS_TIMEOUT", "10")
    os.environ.setdefault("COPERNICUSMARINE_HTTPS_RETRIES", "0")
    import copernicusmarine  # Kept lazy: missing credentials / unit tests never import the SDK.
    # SDK 2.5.0 configures both loggers to INFO on import; silence them afterwards.
    for name in ("copernicusmarine", "copernicusmarine_blank_logger"):
        logger = logging.getLogger(name)
        logger.setLevel(logging.CRITICAL + 1)
        logger.disabled = True
        logger.propagate = False
    return copernicusmarine.open_dataset(**kwargs)


def _axis(dataset, name):
    try:
        values = [float(value) for value in dataset.coords[name].values]
        if not 2 <= len(values) <= 9 or not all(map(math.isfinite, values)):
            raise ValueError()
        if any(a >= b for a, b in zip(values, values[1:])):
            raise ValueError()
        return values
    except (KeyError, TypeError, ValueError, OverflowError):
        raise CopernicusProviderError("incompatibleMetadata") from None


def _locate(values, target):
    index = min(range(len(values)), key=lambda item: abs(values[item] - target))
    before = values[index - 1] if index else 2 * values[0] - values[1]
    after = values[index + 1] if index + 1 < len(values) else 2 * values[-1] - values[-2]
    lower, upper = (before + values[index]) / 2, (values[index] + after) / 2
    if target < lower or target > upper:
        raise CopernicusProviderError("incompatibleMetadata")
    return index, values[index], lower, upper


def _times(dataset):
    try:
        result = []
        for value in dataset.coords["time"].values:
            if isinstance(value, datetime):
                point = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
            elif isinstance(value, str) or (type(value).__module__.startswith("numpy") and type(value).__name__ == "datetime64"):
                text = str(value)
                point = datetime.fromisoformat(text.replace("Z", "+00:00"))
                point = point.replace(tzinfo=timezone.utc) if point.tzinfo is None else point.astimezone(timezone.utc)
            else:
                raise ValueError()
            if point.timestamp() % QUARTER_SECONDS:
                raise ValueError()
            result.append(point)
        if not 1 <= len(result) <= 3 or any(a >= b for a, b in zip(result, result[1:])):
            raise ValueError()
        return result
    except (KeyError, TypeError, ValueError, OverflowError):
        raise CopernicusProviderError("incompatibleMetadata") from None


def _numeric(variable, indexers):
    try:
        value = float(variable.isel(indexers).load(scheduler="synchronous").values.item())
        if not math.isfinite(value):
            raise CopernicusProviderError("maskedCell")
        return value
    except CopernicusProviderError:
        raise
    except (TypeError, ValueError, OverflowError):
        raise CopernicusProviderError("incompatibleMetadata") from None


def _variable(dataset, name, standard_name, required_dims, allow_missing_units=False):
    try:
        variable = dataset[name]
        if variable.attrs.get("standard_name") != standard_name or set(variable.dims) != set(required_dims):
            raise ValueError()
        units = variable.attrs.get("units")
        if units != "m" and not (allow_missing_units and units is None):
            raise ValueError()
        return variable
    except (KeyError, TypeError, ValueError):
        raise CopernicusProviderError("incompatibleMetadata") from None


def _extract(name, latitude, longitude, eta, username, password, opener):
    model = MODELS[name]
    seconds = eta.timestamp()
    before = datetime.fromtimestamp(math.floor(seconds / QUARTER_SECONDS) * QUARTER_SECONDS, timezone.utc)
    after = before if eta == before else before + timedelta(seconds=QUARTER_SECONDS)
    common = {"dataset_version": model["version"], "username": username, "password": password,
              "minimum_longitude": longitude - model["step"][0] * 1.01,
              "maximum_longitude": longitude + model["step"][0] * 1.01,
              "minimum_latitude": latitude - model["step"][1] * 1.01,
              "maximum_latitude": latitude + model["step"][1] * 1.01,
              "coordinates_selection_method": "outside", "raise_if_updating": True}
    sea = bathy = None
    try:
        sea = opener(dataset_id=model["sea"], variables=["zos"], service="arco-geo-series",
                     start_datetime=_iso(before), end_datetime=_iso(after), **common)
        bathy = opener(dataset_id=model["bathy"], dataset_part="bathy", variables=["deptho", "mask"],
                       service="static-arco", **common)
        sea_lat, sea_lon = _axis(sea, "latitude"), _axis(sea, "longitude")
        bathy_lat, bathy_lon = _axis(bathy, "latitude"), _axis(bathy, "longitude")
        if len(sea_lat) != len(bathy_lat) or len(sea_lon) != len(bathy_lon) or any(abs(a-b) > 1e-7 for a, b in zip(sea_lat + sea_lon, bathy_lat + bathy_lon)):
            raise CopernicusProviderError("incompatibleMetadata")
        lat_index, cell_lat, south, north = _locate(sea_lat, latitude)
        lon_index, cell_lon, west, east = _locate(sea_lon, longitude)
        for values, expected_step in ((sea_lat, model["step"][1]), (sea_lon, model["step"][0])):
            if any(abs((b-a) - expected_step) > 0.00001 for a, b in zip(values, values[1:])):
                raise CopernicusProviderError("incompatibleMetadata")
        times = _times(sea)
        if before not in times or after not in times:
            raise CopernicusProviderError("missingTime")
        deptho = _variable(bathy, "deptho", "sea_floor_depth_below_geoid", ["latitude", "longitude"], name == "NWS")
        zos = _variable(sea, "zos", "sea_surface_height_above_geoid", ["time", "latitude", "longitude"])
        xy = {"latitude": lat_index, "longitude": lon_index}
        mask = bathy["mask"]
        if mask.attrs.get("standard_name") != "sea_binary_mask":
            raise CopernicusProviderError("incompatibleMetadata")
        vertical_dims = set(mask.dims) - {"latitude", "longitude"}
        if len(vertical_dims) > 1 or not vertical_dims.issubset({"depth", "elevation"}):
            raise CopernicusProviderError("incompatibleMetadata")
        mask_index = dict(xy)
        for dim in vertical_dims:
            levels = [float(value) for value in bathy.coords[dim].values]
            if not 1 <= len(levels) <= 100 or not all(map(math.isfinite, levels)):
                raise CopernicusProviderError("incompatibleMetadata")
            mask_index[dim] = min(range(len(levels)), key=lambda item: abs(levels[item]))
        if _numeric(mask, mask_index) != 1:
            raise CopernicusProviderError("maskedCell")
        depth = _numeric(deptho, xy)
        if depth <= 0 or depth > 12_000:
            raise CopernicusProviderError("maskedCell")
        if depth <= 10:
            raise CopernicusProviderError("shallowWater")
        height_before = _numeric(zos, {**xy, "time": times.index(before)})
        height_after = height_before if before == after else _numeric(zos, {**xy, "time": times.index(after)})
        if abs(height_before) > 100 or abs(height_after) > 100:
            raise CopernicusProviderError("incompatibleMetadata")
        resolution = max((north-south) * 111_195.08, (east-west) * 111_195.08 * math.cos(math.radians(cell_lat)))
        return {"status": "available", "message": "Estimation statique issue d’un modèle ; incertitude totale non quantifiée.",
                "source": _source(name), "cell": {"latitude": cell_lat, "longitude": cell_lon,
                    "bounds": {"west": west, "east": east, "south": south, "north": north},
                    "resolutionMeters": resolution, "depthMeters": depth, "depthMinMeters": None, "depthMaxMeters": None},
                "waterLevel": {"timeBeforeUtc": _iso(before), "timeAfterUtc": _iso(after),
                    "heightBeforeMeters": height_before, "heightAfterMeters": height_after}}
    finally:
        for dataset in (bathy, sea):
            if dataset is not None:
                try:
                    dataset.close()
                except Exception:
                    pass


def fetch_copernicus_point(latitude: float, longitude: float, eta_utc: str, username: str, password: str,
                           model_preference="automatic", *, _opener=None, _metadata_loader=None):
    """Return JSON-safe source/cell/tide blocks. The gateway owns request identity and UKC maths.

    Auto fallback is allowed for geographic coverage or published horizon only.
    A shallow, masked or incompatible NWS cell never triggers a coarser IBI search.
    """
    if not isinstance(username, str) or not username.strip() or not isinstance(password, str) or not password:
        return _unavailable("notConfigured")
    try:
        if not _finite(latitude) or not _finite(longitude) or abs(latitude) > 90 or abs(longitude) > 180 or model_preference not in ("automatic", "NWS", "IBI"):
            raise CopernicusProviderError("invalidInput")
        eta = _utc(eta_utc)
    except CopernicusProviderError as error:
        return _unavailable(error.code)
    opener = _opener or _sdk_opener
    metadata_loader = _metadata_loader or _load_metadata
    last_code = "outsideCoverage"
    candidates = ("NWS", "IBI") if model_preference == "automatic" else (model_preference,)
    for name in candidates:
        model = MODELS[name]
        if not _inside(model, latitude, longitude):
            continue
        try:
            sea_metadata = metadata_loader(model, False)
            sea_dims = _qualify_metadata(sea_metadata, model, False, eta)
            bathy_dims = _qualify_metadata(metadata_loader(model, True), model, True, eta)
            for axis in ("latitude", "longitude"):
                if sea_dims[axis] != bathy_dims[axis]:
                    raise CopernicusProviderError("incompatibleMetadata")
            return _extract(name, latitude, longitude, eta, username, password, opener)
        except CopernicusProviderError as error:
            if error.code == "outsideHorizon" and model_preference == "automatic":
                last_code = error.code
                continue
            return _unavailable(error.code, name)
        except Exception:
            # No exception repr: SDK errors may include account/configuration details.
            return _unavailable("upstreamUnavailable", name)
    return _unavailable(last_code)
