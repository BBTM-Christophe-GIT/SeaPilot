"""Authenticated UKC point gateway. Credentials and provider access stay server-side."""
from __future__ import annotations

import copy
import json
import math
import re
import threading
import time
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zoneinfo import ZoneInfo

from server.copernicus_provider import MODELS, fetch_copernicus_point

HEADERS = {"Cache-Control": "private, no-store", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff"}
MAX_BODY = 4096


class UkcError(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code
        super().__init__(code)


def finite(value):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def utc(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z", value):
        raise ValueError("invalid UTC")
    instant = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if instant.year < 1000:
        raise ValueError("invalid UTC year")
    return instant


def iso(value):
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def paris_eta(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", value):
        raise ValueError("invalid local ETA")
    local = datetime.fromisoformat(value)
    if local.year < 1000:
        raise ValueError("invalid local ETA year")
    zone = ZoneInfo("Europe/Paris")
    candidates = set()
    for fold in (0, 1):
        instant = local.replace(tzinfo=zone, fold=fold).astimezone(timezone.utc)
        if instant.astimezone(zone).replace(tzinfo=None) == local:
            candidates.add(instant)
    if len(candidates) != 1:
        raise ValueError("ambiguous or nonexistent ETA")
    return candidates.pop()


def identifier(value):
    return isinstance(value, str) and re.fullmatch(r"[1-9]\d{0,18}", value) is not None and int(value) <= 9223372036854775807


def validate_input(value):
    if not isinstance(value, dict) or not all(identifier(value.get(key)) for key in ("projectId", "vesselId")):
        raise ValueError("invalid identifiers")
    if not isinstance(value.get("pointId"), str) or not re.fullmatch(r"[A-Za-z0-9._:-]{1,100}", value["pointId"]):
        raise ValueError("invalid point")
    if not finite(value.get("latitude")) or not finite(value.get("longitude")) or abs(value["latitude"]) > 90 or abs(value["longitude"]) > 180:
        raise ValueError("invalid position")
    if not finite(value.get("draftMeters")) or not 0 < value["draftMeters"] <= 50:
        raise ValueError("invalid draught")
    eta = paris_eta(value.get("eta"))
    return {key: value[key] for key in ("projectId", "pointId", "vesselId", "latitude", "longitude", "eta", "draftMeters")}, eta


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def backend_json(url, key, jwt, payload=None):
    request = Request(url, data=None if payload is None else json.dumps(payload).encode(),
                      headers={"apikey": key, "Authorization": f"Bearer {jwt}", "Content-Type": "application/json", "Accept": "application/json"})
    try:
        with build_opener(NoRedirect()).open(request, timeout=10) as response:
            raw = response.read(65537)
            if len(raw) > 65536:
                raise UkcError(502, "UKC_SERVICE_UNAVAILABLE")
            return json.loads(raw)
    except HTTPError as error:
        if error.code == 401:
            raise UkcError(401, "UKC_AUTHENTICATION_REQUIRED") from None
        if error.code == 403:
            raise UkcError(403, "UKC_ACCESS_DENIED") from None
        raise UkcError(502, "UKC_SERVICE_UNAVAILABLE") from None


class SupabaseBackend:
    def __init__(self, jwt, env):
        self.jwt = jwt
        self.url = (env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL") or "").rstrip("/")
        self.key = env.get("SUPABASE_PUBLISHABLE_KEY") or env.get("SUPABASE_ANON_KEY") or env.get("VITE_SUPABASE_ANON_KEY")
        parsed = urlsplit(self.url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or not self.key:
            raise UkcError(503, "UKC_AUTH_NOT_CONFIGURED")

    def user(self):
        value = backend_json(f"{self.url}/auth/v1/user", self.key, self.jwt)
        if not isinstance(value, dict) or not isinstance(value.get("id"), str) or not re.fullmatch(r"[a-fA-F0-9-]{36}", value["id"]):
            raise UkcError(401, "UKC_AUTHENTICATION_REQUIRED")
        return value["id"]

    def context(self, project_id, vessel_id):
        return backend_json(f"{self.url}/rest/v1/rpc/sea_operation_ukc_context", self.key, self.jwt,
                            {"p_project_id": project_id, "p_vessel_id": vessel_id})


def contains(bounds, latitude, longitude):
    if not isinstance(bounds, dict) or any(not finite(bounds.get(key)) for key in ("west", "east", "south", "north")):
        return False
    west, east, south, north = (bounds[key] for key in ("west", "east", "south", "north"))
    if abs(west) > 180 or abs(east) > 180 or not -90 <= south < north <= 90 or west == east or west == 180 and east == -180:
        return False
    candidates = (-180, 180) if abs(longitude) == 180 else (longitude,)
    return south <= latitude <= north and any(west <= lon <= east if west < east else lon >= west or lon <= east for lon in candidates)


def build_estimate(point, eta, provider, fetched_at):
    """The TS consumer and SQL guard independently validate this recorded arithmetic."""
    if not isinstance(provider, dict):
        raise UkcError(502, "UKC_SERVICE_UNAVAILABLE")
    if provider.get("status") == "available" and fetched_at > eta:
        raise UkcError(502, "UKC_SERVICE_UNAVAILABLE")
    source, cell, water = (provider.get(key) for key in ("source", "cell", "waterLevel"))
    result = {"version": 1, **{key: point[key] for key in ("projectId", "pointId", "vesselId", "latitude", "longitude", "draftMeters")},
              "etaUtc": iso(eta), "fetchedAt": iso(fetched_at), "status": "unavailable", "message": "Données Copernicus indisponibles à cette position et cette ETA.",
              "source": source, "cell": cell, "waterLevel": water, "estimate": None}
    if source is not None:
        if not isinstance(source, dict) or source.get("model") not in MODELS:
            raise UkcError(502, "UKC_SERVICE_UNAVAILABLE")
        model = MODELS[source["model"]]
        expected = {"productId": model["product"], "seaLevelDatasetId": model["sea"], "bathymetryDatasetId": model["bathy"],
                    "datasetVersion": model["version"], "datum": "model-geoid", "sourceUrl": f"https://data.marine.copernicus.eu/product/{model['product']}/description"}
        if any(source.get(key) != value for key, value in expected.items()):
            raise UkcError(502, "UKC_SERVICE_UNAVAILABLE")
        if source.get("referenceTimeUtc") is not None:
            utc(source["referenceTimeUtc"])
        source = {"model": source["model"], **expected, "referenceTimeUtc": source.get("referenceTimeUtc")}
        result["source"] = source
    if provider.get("status") != "available":
        # Only fixed messages authored by our provider, never exception repr or request URLs.
        from server.copernicus_provider import MESSAGES
        result["source"], result["cell"], result["waterLevel"] = source, None, None
        result["message"] = MESSAGES.get(provider.get("code"), result["message"])
        return result
    if not source or not isinstance(cell, dict) or not isinstance(water, dict):
        raise UkcError(502, "UKC_SERVICE_UNAVAILABLE")
    cell = {key: cell.get(key) for key in ("latitude", "longitude", "bounds", "resolutionMeters", "depthMeters", "depthMinMeters", "depthMaxMeters")}
    water = {key: water.get(key) for key in ("timeBeforeUtc", "timeAfterUtc", "heightBeforeMeters", "heightAfterMeters")}
    result["cell"], result["waterLevel"] = cell, water
    if not finite(cell.get("latitude")) or not finite(cell.get("longitude")) or abs(cell["latitude"]) > 90 or abs(cell["longitude"]) > 180:
        raise UkcError(502, "UKC_SERVICE_UNAVAILABLE")
    if not contains(cell.get("bounds"), cell["latitude"], cell["longitude"]) or not contains(cell["bounds"], point["latitude"], point["longitude"]):
        raise UkcError(502, "UKC_SERVICE_UNAVAILABLE")
    if not finite(cell.get("resolutionMeters")) or cell["resolutionMeters"] <= 0 or not finite(cell.get("depthMeters")) or cell["depthMeters"] <= 10:
        raise UkcError(502, "UKC_SERVICE_UNAVAILABLE")
    for key in ("depthMinMeters", "depthMaxMeters"):
        if cell.get(key) is not None and not finite(cell[key]):
            raise UkcError(502, "UKC_SERVICE_UNAVAILABLE")
    lower, upper = cell.get("depthMinMeters"), cell.get("depthMaxMeters")
    if lower is not None and not 0 <= lower <= cell["depthMeters"] or upper is not None and upper < cell["depthMeters"]:
        raise UkcError(502, "UKC_SERVICE_UNAVAILABLE")
    before, after = utc(water.get("timeBeforeUtc")), utc(water.get("timeAfterUtc"))
    if not before <= eta <= after or not 0 <= (after-before).total_seconds() <= 900 or before.timestamp() % 900 or after.timestamp() % 900:
        raise UkcError(502, "UKC_SERVICE_UNAVAILABLE")
    if source.get("referenceTimeUtc") and utc(source["referenceTimeUtc"]) > before:
        raise UkcError(502, "UKC_SERVICE_UNAVAILABLE")
    start, end = water.get("heightBeforeMeters"), water.get("heightAfterMeters")
    if not finite(start) or not finite(end) or before == after and start != end:
        raise UkcError(502, "UKC_SERVICE_UNAVAILABLE")
    exact = eta in (before, after)
    height = start if eta == before else end if eta == after else start + (end-start) * (eta-before).total_seconds() / (after-before).total_seconds()
    clearance = cell["depthMeters"] + height - point["draftMeters"]
    variability = None if lower is None or upper is None else {"lowerMeters": lower + height - point["draftMeters"], "upperMeters": upper + height - point["draftMeters"]}
    if not finite(height) or not finite(clearance) or variability and not all(finite(value) for value in variability.values()):
        raise UkcError(502, "UKC_SERVICE_UNAVAILABLE")
    ids = ("bathymetryVertical", "waterLevel", "draft", "positionEffect", "temporalInterpolation")
    components = [{"id": name, "standardUncertaintyMeters": 0 if name == "temporalInterpolation" and exact else None} for name in ids]
    result.update(status="available", message="Estimation statique du modèle ; incertitude totale non quantifiée.", estimate={
        "kind": "static", "waterLevelMeters": height, "ukcMeters": clearance, "cellVariability": variability,
        "uncertainty": {"method": "sum-known-standard-uncertainties", "quantifiedMeters": None, "complete": False, "confidenceLevel": None,
                        "components": components, "missingComponents": [item["id"] for item in components if item["standardUncertaintyMeters"] is None]},
        "dynamicCorrectionsApplied": False})
    return result


class UkcGateway:
    def __init__(self, env, backend_factory=None, provider=fetch_copernicus_point, now=time.time):
        self.env, self.provider, self.now = env, provider, now
        self.backend_factory = backend_factory or (lambda jwt: SupabaseBackend(jwt, env))
        self.lock, self.slots = threading.Lock(), threading.BoundedSemaphore(2)
        self.users, self.cache = {}, {}

    def handle(self, method, headers, raw, request_origin):
        if method != "POST":
            return 405, {"error": "UKC_METHOD_NOT_ALLOWED"}
        try:
            headers = {key.lower(): value for key, value in headers.items()}
            if headers.get("origin") and headers["origin"] != request_origin or headers.get("sec-fetch-site") == "cross-site":
                raise UkcError(403, "UKC_ACCESS_DENIED")
            token = re.fullmatch(r"Bearer ([^\s]{1,16384})", headers.get("authorization", ""))
            if not token:
                raise UkcError(401, "UKC_AUTHENTICATION_REQUIRED")
            if not re.match(r"application/json(?:;|$)", headers.get("content-type", ""), re.I):
                raise UkcError(400, "UKC_INVALID_REQUEST")
            if len(raw) > MAX_BODY:
                raise UkcError(413, "UKC_INVALID_REQUEST")
            try:
                point, eta = validate_input(json.loads(raw))
            except (ValueError, TypeError, OverflowError):
                raise UkcError(400, "UKC_INVALID_REQUEST") from None
            backend = self.backend_factory(token.group(1))
            actor = backend.user()
            if not actor:
                raise UkcError(401, "UKC_AUTHENTICATION_REQUIRED")
            context = backend.context(point["projectId"], point["vesselId"])
            if not isinstance(context, dict) or context.get("projectId") != point["projectId"] or context.get("vesselId") != point["vesselId"]:
                raise UkcError(403, "UKC_ACCESS_DENIED")
            canonical = context.get("draftMeters")
            if not finite(canonical) or not 0 < canonical <= 50:
                raise UkcError(400, "UKC_DRAFT_REQUIRED")
            if canonical != point["draftMeters"]:
                raise UkcError(409, "UKC_DRAFT_CHANGED")
            current = self.now()
            with self.lock:
                self.users = {key: entry for key, entry in self.users.items() if entry[0] > current}
                expires, count = self.users.get(actor, (current + 60, 0))
                if count >= 30:
                    raise UkcError(429, "UKC_RATE_LIMIT")
                self.users[actor] = (expires, count+1)
                if len(self.users) > 512:
                    self.users.pop(next(iter(self.users)))
            stamp = datetime.fromtimestamp(current, timezone.utc)
            if eta < stamp:
                return 200, {"version": 1, **{key: point[key] for key in ("projectId", "pointId", "vesselId", "latitude", "longitude", "draftMeters")},
                             "etaUtc": iso(eta), "fetchedAt": iso(stamp), "status": "unavailable", "message": "L’ETA est passée : aucune nouvelle prévision UKC n’est calculée. Les captures enregistrées restent conservées.",
                             "source": None, "cell": None, "waterLevel": None, "estimate": None}
            username, password = self.env.get("COPERNICUSMARINE_SERVICE_USERNAME"), self.env.get("COPERNICUSMARINE_SERVICE_PASSWORD")
            if not username or not username.strip() or not password:
                raise UkcError(503, "UKC_NOT_CONFIGURED")
            key = (point["latitude"], point["longitude"], iso(eta))
            with self.lock:
                self.cache = {name: entry for name, entry in self.cache.items() if entry[0] > current}
                cached = self.cache.get(key)
            if cached:
                return 200, build_estimate(point, eta, copy.deepcopy(cached[1]), cached[2])
            if not self.slots.acquire(blocking=False):
                raise UkcError(503, "UKC_BUSY")
            try:
                source = self.provider(point["latitude"], point["longitude"], iso(eta), username, password)
                finished = datetime.fromtimestamp(self.now(), timezone.utc)
                result = build_estimate(point, eta, source, finished)
                if result["status"] == "available" and finished > eta:
                    raise UkcError(502, "UKC_SERVICE_UNAVAILABLE")
                if result["status"] == "available":
                    with self.lock:
                        self.cache[key] = (min(self.now()+900, eta.timestamp()), copy.deepcopy(source), finished)
                        if len(self.cache) > 64:
                            self.cache.pop(next(iter(self.cache)))
                return 200, result
            finally:
                self.slots.release()
        except UkcError as error:
            return error.status, {"error": error.code}
        except Exception:
            return 502, {"error": "UKC_SERVICE_UNAVAILABLE"}
