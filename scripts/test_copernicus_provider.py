"""Offline transport fixtures; no Copernicus account, SDK install or data download."""

import builtins
import json
import logging
import math
import pathlib
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock, patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from server.copernicus_port_water_level import PORT_COPERNICUS_MODELS, SHOM_WMS, _shom_height, fetch_port_water_level, port_sample_distance
from server.copernicus_provider import MODELS, _sdk_opener, _utc, fetch_copernicus_point

ETA = "2026-10-26T10:07:00Z"


def metadata(model, bathy):
    west, south, east, north = model["extent"]
    dimensions = {
        "latitude": {"step": model["step"][1], "extent": [south, north], "reference_system": 4326},
        "longitude": {"step": model["step"][0], "extent": [west, east], "reference_system": 4326},
    }
    variables = {"deptho" if bathy else "zos": {
        "standardName": "sea_floor_depth_below_geoid" if bathy else "sea_surface_height_above_geoid",
        "unit": None if bathy and model is MODELS["NWS"] else "m",
    }}
    if bathy:
        variables["mask"] = {"standardName": "sea_binary_mask"}
    else:
        dimensions["time"] = {"step": "PT900S", "extent": ["2026-10-20T00:15:00Z", "2026-11-01T00:00:00Z"]}
    return {"id": f"{model['bathy' if bathy else 'sea']}_{model['version']}" + ("--ext--bathy" if bathy else ""),
            "properties": {"cube:dimensions": dimensions, "cube:variables": variables,
                           "admp_valid_start_date": "2026-10-20T00:15:00Z"}}


class Values:
    def __init__(self, value):
        self.value = value

    def __iter__(self):
        return iter(self.value)

    def item(self):
        if isinstance(self.value, (tuple, list)):
            raise ValueError("Not a scalar")
        return self.value


class Coordinate:
    def __init__(self, values):
        self.values = Values(values)


class Variable:
    def __init__(self, dataset, name, dims, standard_name, unit="m", indexers=None):
        self.dataset, self.name, self.dims = dataset, name, dims
        self.attrs = {"standard_name": standard_name}
        if unit is not None:
            self.attrs["units"] = unit
        self.indexers = indexers or {}

    def isel(self, indexers):
        if any(key not in self.dims for key in indexers):
            raise ValueError("Unknown dimension")
        if any(not isinstance(value, int) for value in indexers.values()):
            raise ValueError("Only scalar point reads are allowed")
        return Variable(self.dataset, self.name, self.dims, self.attrs["standard_name"], self.attrs.get("units"), indexers)

    def load(self, **kwargs):
        self.dataset.loads.append((self.name, dict(self.indexers), kwargs))
        if self.dataset.load_error:
            raise self.dataset.load_error
        return self

    @property
    def values(self):
        if self.name == "deptho":
            value = self.dataset.depth
        elif self.name == "mask":
            value = self.dataset.mask
        else:
            value = self.dataset.heights[self.indexers["time"]]
        return Values(value)


class Dataset:
    def __init__(self, model, latitude, longitude, bathy, kwargs):
        self.bathy, self.model, self.kwargs = bathy, model, kwargs
        self.loads, self.closed = [], False
        self.depth, self.mask, self.heights, self.load_error = 25.0, 1, [-1.0, 1.0], None
        west, south, _, _ = model["extent"]
        dx, dy = model["step"]
        lat = south + round((latitude-south)/dy)*dy
        lon = west + round((longitude-west)/dx)*dx
        self.coords = {"latitude": Coordinate([lat-dy, lat, lat+dy]), "longitude": Coordinate([lon-dx, lon, lon+dx]),
                       "depth": Coordinate([.5, 5.0]),
                       "time": Coordinate([kwargs.get("start_datetime", "2026-10-26T10:00:00Z"),
                                           kwargs.get("end_datetime", "2026-10-26T10:15:00Z")])}
        if self.coords["time"].values.value[0] == self.coords["time"].values.value[1]:
            self.coords["time"] = Coordinate([self.coords["time"].values.value[0]])
        self.variables = {
            "deptho": Variable(self, "deptho", ("latitude", "longitude"), "sea_floor_depth_below_geoid", None if model is MODELS["NWS"] else "m"),
            "mask": Variable(self, "mask", ("depth", "latitude", "longitude"), "sea_binary_mask", None),
            "zos": Variable(self, "zos", ("time", "latitude", "longitude"), "sea_surface_height_above_geoid"),
        }

    def __getitem__(self, name):
        return self.variables[name]

    def close(self):
        self.closed = True


class Transport:
    def __init__(self, latitude=50.0, longitude=0.0):
        self.latitude, self.longitude = latitude, longitude
        self.calls, self.datasets, self.metadata_calls = [], [], []
        self.change_metadata, self.change_dataset = lambda data, model, bathy: None, lambda data, bathy: None
        self.error = None

    def metadata(self, model, bathy):
        self.metadata_calls.append((model, bathy))
        result = metadata(model, bathy)
        self.change_metadata(result, model, bathy)
        return result

    def open(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        model = next(item for item in PORT_COPERNICUS_MODELS.values() if kwargs["dataset_id"] in (item["sea"], item.get("bathy")))
        bathy = kwargs["dataset_id"] == model.get("bathy")
        result = Dataset(model, self.latitude, self.longitude, bathy, kwargs)
        self.change_dataset(result, bathy)
        self.datasets.append(result)
        return result

    def run(self, eta=ETA, **kwargs):
        return fetch_copernicus_point(self.latitude, self.longitude, eta, "fixture-user", "fixture-password",
                                     _opener=self.open, _metadata_loader=self.metadata, **kwargs)


class CopernicusProviderTests(unittest.TestCase):
    def test_port_water_level_uses_qualified_sea_level_only_and_interpolates_same_cell(self):
        transport = Transport(latitude=49.926557, longitude=1.080533)
        read_shom = Mock()
        result = fetch_port_water_level(transport.latitude, transport.longitude, ETA, "fixture-user", "fixture-password",
                                        _opener=transport.open, _metadata_loader=transport.metadata, _read_shom=read_shom)
        self.assertEqual(result["source"], "copernicus-nws")
        self.assertEqual(result["datum"], "model-geoid")
        self.assertAlmostEqual(result["heightMeters"], -1 + 2 * 7 / 15)
        self.assertLessEqual(port_sample_distance(transport.latitude, transport.longitude, result["sampleLatitude"],
                                                 result["sampleLongitude"]), 2_000)
        self.assertEqual(transport.metadata_calls, [(MODELS["NWS"], False)])
        self.assertEqual([call["variables"] for call in transport.calls], [["zos"]])
        self.assertTrue(transport.datasets[0].closed)
        read_shom.assert_not_called()

    def test_port_water_level_uses_shom_without_secrets_and_records_nearby_bracket(self):
        latitude, longitude = 49.761481, .367817
        eta = "2026-10-26T10:15:00Z"

        def read_shom(layer, lat, lon, instant):
            if not layer.endswith("-200M/ssh") or lat <= latitude or lon != longitude:
                return None
            return 0 if instant.hour == 10 else 2

        opener, metadata = Mock(), Mock()
        result = fetch_port_water_level(latitude, longitude, eta, None, None, _opener=opener,
                                        _metadata_loader=metadata, _read_shom=read_shom)
        self.assertEqual(result["source"], "shom-tolosa")
        self.assertEqual(result["datum"], "model-mean-sea-level")
        self.assertEqual(result["heightMeters"], .5)
        self.assertAlmostEqual(port_sample_distance(latitude, longitude, result["sampleLatitude"],
                                                   result["sampleLongitude"]), 750.0)
        opener.assert_not_called()
        metadata.assert_not_called()
        self.assertIsNone(fetch_port_water_level(latitude, longitude, eta, None, None,
                                                _read_shom=lambda layer, lat, lon, instant: 0 if instant.hour == 10 else None))

    def test_mediterranean_copernicus_port_level_does_not_enable_waypoint_ukc(self):
        transport = Transport(latitude=43.3125, longitude=5.3541667)
        read_shom = Mock()
        result = fetch_port_water_level(transport.latitude, transport.longitude, ETA, "fixture-user", "fixture-password",
                                        _opener=transport.open, _metadata_loader=transport.metadata, _read_shom=read_shom)
        self.assertEqual(result["source"], "copernicus-med")
        self.assertEqual(result["datum"], "model-geoid")
        self.assertEqual(transport.calls[0]["dataset_version"], "202611")
        self.assertEqual(transport.run()["code"], "outsideCoverage")
        read_shom.assert_not_called()

    @patch("server.copernicus_port_water_level.urlopen")
    def test_shom_requires_reported_point_layer_and_timestamp(self, urlopen):
        layer = "NIVEAUX_TOLOSA_R1120_NORMANDIE-200M/ssh"
        response = MagicMock()
        response.geturl.return_value = SHOM_WMS + "?fixed"
        urlopen.return_value.__enter__.return_value = response
        raw = f"""<FeatureInfoResponse><latitude>49.9</latitude><longitude>1.1</longitude>
            <Feature><layer>{layer}</layer><FeatureInfo><id>ssh</id>
            <time>2026-10-26T10:00:00.000Z</time><value>0</value></FeatureInfo></Feature></FeatureInfoResponse>""".encode()
        requested = _utc("2026-10-26T10:00:00Z")
        response.read.return_value = raw
        self.assertEqual(_shom_height(layer, 49.9, 1.1, requested), 0)
        self.assertIsNone(_shom_height(layer, 49.9, 1.1, _utc("2026-10-26T11:00:00Z")))
        for original, replacement in ((b"49.9", b"NaN"), (b"id>ssh", b"id>surge"), (b"value>0", b"value>NaN")):
            response.read.return_value = raw.replace(original, replacement)
            self.assertIsNone(_shom_height(layer, 49.9, 1.1, requested))

    def test_lazy_sdk_import_cannot_reenable_account_or_blank_console_logging(self):
        loggers = [logging.getLogger(name) for name in ("copernicusmarine", "copernicusmarine_blank_logger")]
        previous = [(logger.level, logger.disabled, logger.propagate) for logger in loggers]
        real_import = builtins.__import__
        def imported(name, *args, **kwargs):
            if name != "copernicusmarine":
                return real_import(name, *args, **kwargs)
            # Reproduce the official SDK logger.py dictConfig reset during its first import.
            for logger in loggers:
                logger.setLevel(logging.INFO)
                logger.disabled = False
                logger.propagate = True
            return sdk
        def opened(**_kwargs):
            for logger in loggers:
                self.assertFalse(logger.isEnabledFor(logging.INFO))
                self.assertTrue(logger.disabled)
                self.assertFalse(logger.propagate)
            return "synthetic-lazy-dataset"
        sdk = SimpleNamespace(open_dataset=Mock(side_effect=opened))
        try:
            with patch("builtins.__import__", side_effect=imported):
                self.assertEqual(_sdk_opener(dataset_id="synthetic-id"), "synthetic-lazy-dataset")
            sdk.open_dataset.assert_called_once_with(dataset_id="synthetic-id")
        finally:
            for logger, (level, disabled, propagate) in zip(loggers, previous):
                logger.setLevel(level)
                logger.disabled = disabled
                logger.propagate = propagate

    def test_nws_extract_is_bounded_to_target_cell_and_two_quarter_hours(self):
        transport = Transport()
        result = transport.run()
        self.assertEqual(result["status"], "available")
        self.assertEqual(result["source"]["model"], "NWS")
        self.assertEqual(result["source"]["datum"], "model-geoid")
        self.assertIsNone(result["source"]["referenceTimeUtc"])
        self.assertEqual(result["source"]["datasetVersion"], "202511")
        self.assertEqual(result["cell"]["depthMeters"], 25)
        self.assertIsNone(result["cell"]["depthMinMeters"])
        self.assertIsNone(result["cell"]["depthMaxMeters"])
        self.assertEqual(result["waterLevel"], {"timeBeforeUtc": "2026-10-26T10:00:00Z", "timeAfterUtc": "2026-10-26T10:15:00Z",
                                               "heightBeforeMeters": -1.0, "heightAfterMeters": 1.0})
        self.assertEqual(len(transport.calls), 2)
        self.assertEqual(transport.calls[0]["variables"], ["zos"])
        self.assertEqual(transport.calls[0]["start_datetime"], "2026-10-26T10:00:00Z")
        self.assertEqual(transport.calls[0]["end_datetime"], "2026-10-26T10:15:00Z")
        self.assertTrue(transport.calls[0]["raise_if_updating"])
        self.assertEqual(transport.calls[1]["dataset_part"], "bathy")
        self.assertEqual(transport.calls[1]["variables"], ["deptho", "mask"])
        self.assertTrue(all(item.closed for item in transport.datasets))
        self.assertEqual([name for dataset in transport.datasets for name, _, _ in dataset.loads], ["zos", "zos", "mask", "deptho"])
        self.assertTrue(all(all(isinstance(index, int) for index in indices.values()) for dataset in transport.datasets for _, indices, _ in dataset.loads))
        self.assertTrue(all("scheduler" in options for dataset in transport.datasets for _, _, options in dataset.loads))
        self.assertGreater(result["cell"]["resolutionMeters"], 1500)

    def test_exact_eta_loads_only_one_water_level_and_preserves_zero(self):
        transport = Transport()
        transport.change_dataset = lambda data, bathy: setattr(data, "heights", [0])
        result = transport.run("2026-10-26T10:00:00Z")
        self.assertEqual(result["status"], "available")
        self.assertEqual(result["waterLevel"]["heightBeforeMeters"], 0)
        self.assertEqual(result["waterLevel"]["heightAfterMeters"], 0)
        self.assertEqual(sum(name == "zos" for dataset in transport.datasets for name, _, _ in dataset.loads), 1)

    def test_atlantic_point_outside_nws_uses_ibi_same_product_version(self):
        transport = Transport(44.0, -3.0)
        result = transport.run()
        self.assertEqual(result["status"], "available")
        self.assertEqual(result["source"]["model"], "IBI")
        self.assertEqual(result["source"]["datasetVersion"], "202411")
        self.assertTrue(all(call["dataset_version"] == "202411" for call in transport.calls))
        self.assertTrue(all("_ibi_" in call["dataset_id"] for call in transport.calls))

    def test_offshore_and_coastal_points_use_their_containing_cells(self):
        for latitude, longitude, depth in [(49.2, -5.1, 104.7377548), (49.994327, .95218, 28.5661049)]:
            with self.subTest(latitude=latitude, longitude=longitude):
                transport = Transport(latitude, longitude)
                transport.change_dataset = lambda data, bathy: setattr(data, "depth", depth)
                result = transport.run()
                self.assertEqual(result["status"], "available")
                self.assertEqual(result["cell"]["depthMeters"], depth)
                bounds = result["cell"]["bounds"]
                self.assertLessEqual(bounds["south"], latitude)
                self.assertLessEqual(latitude, bounds["north"])
                self.assertLessEqual(bounds["west"], longitude)
                self.assertLessEqual(longitude, bounds["east"])

    def test_nws_horizon_can_fall_back_to_ibi_before_any_nws_data_read(self):
        transport = Transport()
        def narrow(data, model, bathy):
            if model is MODELS["NWS"] and not bathy:
                data["properties"]["cube:dimensions"]["time"]["extent"][1] = "2026-10-26T09:00:00Z"
        transport.change_metadata = narrow
        result = transport.run()
        self.assertEqual(result["status"], "available")
        self.assertEqual(result["source"]["model"], "IBI")
        self.assertTrue(all("_ibi_" in call["dataset_id"] for call in transport.calls))

    def test_no_nws_shallow_or_masked_cell_fallback_to_ibi(self):
        for depth, mask, expected in [
            (10, 1, "shallowWater"), (9, 1, "shallowWater"), (21.2, 0, "maskedCell"), (float("nan"), 1, "missingDepth"),
        ]:
            with self.subTest(depth=depth, mask=mask):
                transport = Transport()
                def change(data, bathy):
                    data.depth, data.mask = depth, mask
                transport.change_dataset = change
                result = transport.run()
                self.assertEqual(result["code"], expected)
                self.assertEqual(result["source"]["model"], "NWS")
                if expected == "shallowWater":
                    self.assertEqual(result["cell"]["depthMeters"], depth)
                else:
                    self.assertIsNone(result["cell"])
                    self.assertEqual(set(result["cellPosition"]), {"latitude", "longitude"})
                self.assertTrue(all("_nws_" in call["dataset_id"] for call in transport.calls))
                self.assertTrue(all(item.closed for item in transport.datasets))
                self.assertEqual(sum(name == "zos" for dataset in transport.datasets for name, _, _ in dataset.loads), 0)

    def test_ibi_also_refuses_shallow_depth_as_a_conservative_product_rule(self):
        transport = Transport(44, -3)
        transport.change_dataset = lambda data, bathy: setattr(data, "depth", 8)
        self.assertEqual(transport.run()["code"], "shallowWater")

    def test_two_models_outside_horizon_or_coverage_load_no_data(self):
        transport = Transport()
        result = transport.run("2027-01-01T12:00:00Z")
        self.assertEqual(result["code"], "outsideHorizon")
        self.assertEqual(result["source"]["model"], "IBI")
        self.assertEqual(transport.calls, [])
        transport = Transport(0, 0)
        self.assertEqual(transport.run()["code"], "outsideCoverage")
        self.assertEqual(transport.metadata_calls, [])

    def test_final_published_quarter_is_available_but_one_minute_later_is_outside_horizon(self):
        transport = Transport()
        def limit(data, model, bathy):
            if not bathy:
                data["properties"]["cube:dimensions"]["time"]["extent"][1] = "2026-10-26T10:15:00Z"
        transport.change_metadata = limit
        self.assertEqual(transport.run("2026-10-26T10:15:00Z")["status"], "available")
        self.assertEqual(transport.run("2026-10-26T10:16:00Z")["code"], "outsideHorizon")
        self.assertEqual(len(transport.calls), 2)

    def test_missing_credentials_do_not_import_sdk_or_make_requests(self):
        for user, password in [(None, "test"), ("user", ""), (" ", "test")]:
            transport = Transport()
            result = fetch_copernicus_point(50, 0, ETA, user, password, _opener=transport.open, _metadata_loader=transport.metadata)
            self.assertEqual(result["code"], "notConfigured")
            self.assertEqual(transport.calls, [])
            self.assertEqual(transport.metadata_calls, [])

    def test_invalid_inputs_never_reach_network(self):
        for lat, lon, eta in [(91, 0, ETA), (50, 181, ETA), (math.nan, 0, ETA), (True, 0, ETA), (50, 0, "10:00"), (50, 0, "2026-10-26T10:00:00")]:
            transport = Transport()
            result = fetch_copernicus_point(lat, lon, eta, "user", "password", _opener=transport.open, _metadata_loader=transport.metadata)
            self.assertEqual(result["code"], "invalidInput")
            self.assertEqual(transport.metadata_calls, [])

    def test_metadata_version_units_or_vertical_reference_mismatch_stops_without_fallback(self):
        for mutation, expected in [
            (lambda data: data.update(id="other_version"), "incompatibleMetadata"),
            (lambda data: data["properties"]["cube:variables"]["zos"].update(
                standardName="sea_surface_height_above_sea_level"), "unconfirmedDatum"),
            (lambda data: data["properties"]["cube:variables"]["zos"].update(unit="cm"), "incompatibleMetadata"),
            (lambda data: data["properties"].update(admp_retired_date="2026-01-01T00:00:00Z"), "incompatibleMetadata"),
            (lambda data: data["properties"]["cube:dimensions"]["latitude"].update(reference_system=3857), "incompatibleGrid"),
        ]:
            transport = Transport()
            def change(data, model, bathy):
                if not bathy:
                    mutation(data)
            transport.change_metadata = change
            result = transport.run()
            self.assertEqual(result["code"], expected)
            if expected == "unconfirmedDatum":
                self.assertIsNone(result["source"])
            else:
                self.assertEqual(result["source"]["model"], "NWS")
            self.assertEqual(transport.calls, [])

    def test_updating_dataset_is_not_silently_replaced_by_ibi(self):
        transport = Transport()
        transport.change_metadata = lambda data, model, bathy: data["properties"].update(admp_updating_start_date="2026-10-26T09:00:00Z")
        self.assertEqual(transport.run()["code"], "updating")
        self.assertEqual(transport.calls, [])

    def test_bad_metadata_time_is_reported_as_a_source_problem_not_invalid_user_eta(self):
        transport = Transport()
        def change(data, model, bathy):
            if not bathy:
                data["properties"]["cube:dimensions"]["time"]["extent"][1] = "not-a-time"
        transport.change_metadata = change
        self.assertEqual(transport.run()["code"], "incompatibleMetadata")
        self.assertEqual(transport.calls, [])

    def test_sdk_mismatched_grid_or_cf_metadata_is_rejected_and_closed(self):
        for mutation, expected in [
            (lambda data: data.coords["longitude"].values.value.__setitem__(1, .001), "incompatibleGrid"),
            (lambda data: data.variables["deptho"].attrs.update(standard_name="depth_below_LAT"), "unconfirmedDatum"),
        ]:
            transport = Transport()
            def change(data, bathy):
                if bathy:
                    mutation(data)
            transport.change_dataset = change
            result = transport.run()
            self.assertEqual(result["code"], expected)
            self.assertTrue(all(item.closed for item in transport.datasets))

    def test_identical_shifted_or_clipped_grids_do_not_define_a_containing_cell(self):
        for change_axis in (lambda values: [value + .001 for value in values], lambda values: values[1:]):
            transport = Transport(49.994327, .95218)
            def change(data, bathy):
                longitude = data.coords["longitude"].values
                longitude.value = change_axis(longitude.value)
            transport.change_dataset = change
            self.assertEqual(transport.run()["code"], "incompatibleGrid")
            self.assertEqual(sum(len(data.loads) for data in transport.datasets), 0)

    def test_extract_requests_both_adjacent_centers_unless_at_the_published_grid_edge(self):
        model = MODELS["NWS"]
        west, south, east, north = model["extent"]
        dx, dy = model["step"]

        def clip_to_request(data, bathy):
            for axis, bounds in (("longitude", (west, east)), ("latitude", (south, north))):
                low = max(bounds[0], data.kwargs[f"minimum_{axis}"])
                high = min(bounds[1], data.kwargs[f"maximum_{axis}"])
                coords = data.coords[axis].values
                coords.value = [value for value in coords.value if low <= value <= high]

        for latitude, longitude in [(south + 300.49 * dy, west + 400.49 * dx), (south, west)]:
            with self.subTest(latitude=latitude, longitude=longitude):
                transport = Transport(latitude, longitude)
                transport.change_dataset = clip_to_request
                result = transport.run()
                self.assertEqual(result["status"], "available")
                bounds = result["cell"]["bounds"]
                self.assertLessEqual(bounds["south"], latitude)
                self.assertLessEqual(latitude, bounds["north"])
                self.assertLessEqual(bounds["west"], longitude)
                self.assertLessEqual(longitude, bounds["east"])

    def test_missing_bracketing_time_or_masked_water_level_never_extrapolates(self):
        transport = Transport()
        transport.change_dataset = lambda data, bathy: setattr(data.coords["time"].values, "value", ["2026-10-26T10:00:00Z"])
        result = transport.run()
        self.assertEqual(result["code"], "missingTime")
        self.assertEqual(result["cell"]["depthMeters"], 25)
        transport = Transport()
        transport.change_dataset = lambda data, bathy: setattr(data, "heights", [1, float("nan")])
        result = transport.run()
        self.assertEqual(result["code"], "missingWaterLevel")
        self.assertEqual(result["cell"]["depthMeters"], 25)

    def test_oversized_coordinate_extract_is_rejected_before_loading(self):
        transport = Transport()
        transport.change_dataset = lambda data, bathy: setattr(data.coords["latitude"].values, "value", [49+i*.01 for i in range(1000)])
        self.assertEqual(transport.run()["code"], "incompatibleGrid")
        self.assertEqual(sum(len(data.loads) for data in transport.datasets), 0)

    def test_sdk_exception_is_sanitized_with_no_credentials_or_upstream_url(self):
        transport = Transport()
        transport.error = RuntimeError("fixture-password fixture-user https://provider.invalid/?password=fixture-password")
        result = transport.run()
        self.assertEqual(result["code"], "upstreamUnavailable")
        serialized = json.dumps(result)
        self.assertNotIn("fixture-password", serialized)
        self.assertNotIn("fixture-user", serialized)
        self.assertNotIn("provider.invalid", serialized)


if __name__ == "__main__":
    unittest.main()
