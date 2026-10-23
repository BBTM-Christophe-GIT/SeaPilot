// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ createEccodes: vi.fn() }));
vi.mock('node:module', () => ({ createRequire: () => () => ({ createEccodes: state.createEccodes }) }));

interface Message { numbers: Record<string, number>; strings: Record<string, string>; values: number[]; bitmap: number[] }
const TARGET = Date.parse('2026-10-22T13:00:00Z');
const POINT = { latitude: 50.2, longitude: -6.6 };
function bytes(marker = 0) {
  const result = new Uint8Array(20);
  result.set([71, 82, 73, 66]); result[7] = 2; result[8] = marker;
  return result;
}
function message(code: string, value: number, validHour = 13): Message {
  const [discipline, parameterCategory, parameterNumber] = code.split('/').map(Number);
  const wind = discipline === 0;
  return {
    numbers: { discipline, parameterCategory, parameterNumber, edition: 2, dataRepresentationTemplateNumber: 42, productDefinitionTemplateNumber: 0,
      dataDate: 20261022, dataTime: 1200, validityDate: 20261022, validityTime: validHour * 100, level: wind ? 10 : 0,
      gridDefinitionTemplateNumber: 0, Ni: 3, Nj: 2, numberOfPoints: 6, numberOfValues: 6, numberOfMissing: 0, bitmapPresent: 1, missingValue: 9999,
      scanningMode: 0, iScansNegatively: 0, jScansPositively: 0, jPointsAreConsecutive: 0, alternativeRowScanning: 0,
      iDirectionIncrementInDegrees: 1, jDirectionIncrementInDegrees: 1, latitudeOfFirstGridPointInDegrees: 51,
      longitudeOfFirstGridPointInDegrees: 352, latitudeOfLastGridPointInDegrees: 50, longitudeOfLastGridPointInDegrees: 354 },
    strings: { units: code === '0/2/1' ? 'm s**-1' : ['0/2/0', '10/0/7'].includes(code) ? 'Degree true' : code === '10/0/8' ? 'm' : 's',
      packingType: 'grid_ccsds', gridType: 'regular_ll', stepType: 'instant', typeOfLevel: wind ? 'heightAboveGround' : 'meanSea' },
    values: Array<number>(6).fill(value), bitmap: [1, 1, 1, 1, 1, 1],
  };
}
function fields(hour = 13) {
  return [message('0/2/1', 6.83, hour), message('0/2/0', 203.24, hour), message('10/0/8', 0.228, hour),
    message('10/0/9', 8.188, hour), message('10/0/7', 236.43, hour)];
}
function mask(item: Message, index: number) {
  item.bitmap[index] = 0; item.values[index] = 9999;
  item.numbers.numberOfValues -= 1; item.numbers.numberOfMissing += 1;
}
function coastalFields(ni = 5) {
  const records = fields();
  records.forEach((item, field) => {
    Object.assign(item.numbers, { Ni: ni, Nj: 3, numberOfPoints: ni * 3, numberOfValues: ni * 3,
      iDirectionIncrementInDegrees: 0.025, jDirectionIncrementInDegrees: 0.025,
      latitudeOfFirstGridPointInDegrees: 50.025, longitudeOfFirstGridPointInDegrees: 0,
      latitudeOfLastGridPointInDegrees: 49.975, longitudeOfLastGridPointInDegrees: (ni - 1) * 0.025 });
    item.bitmap = Array<number>(ni * 3).fill(1);
    item.values = Array.from({ length: ni * 3 }, (_, index) => [index + 1, 90 + index, (index + 1) / 10, 5 + index / 5, 180 + index][field]);
  });
  return records;
}
const COASTAL_POINT = { latitude: 50, longitude: 0.05 };
function engine(messages: Message[]) {
  const deletes: Array<ReturnType<typeof vi.fn>> = [];
  const events: string[] = [];
  const writeFile = vi.fn(() => { events.push('write'); });
  const unlink = vi.fn(() => { events.push('unlink'); });
  const forEachMessage = vi.fn((_path: string, callback: (handle: unknown) => void) => {
    events.push('read');
    for (const item of messages) {
      const release = vi.fn(); deletes.push(release);
      const handle = {
        getLong: (key: string) => item.numbers[key], getDouble: (key: string) => item.numbers[key],
        getString: (key: string) => item.strings[key], getDoubleArray: (key: string) => key === 'bitmap' ? item.bitmap : item.values,
      };
      try { callback(handle); } finally { release(); }
    }
  });
  const instance = { writeFile, forEachMessage, _module: { FS: { unlink } } };
  state.createEccodes.mockResolvedValue(instance);
  return { instance, writeFile, unlink, deletes, events };
}
async function load() { return import('./seaOperationGrib.js'); }

beforeEach(() => { vi.resetModules(); state.createEccodes.mockReset(); });

describe('MFWAM GRIB point decoder', () => {
  it('samples the exact nearest regular-grid cell with native units and actual metadata timestamps', async () => {
    const runtime = engine(fields());
    const { decodeMfwamPoint } = await load();
    await expect(decodeMfwamPoint(bytes(), POINT, TARGET)).resolves.toEqual({ referenceTime: '2026-10-22T12:00:00.000Z', validTime: '2026-10-22T13:00:00.000Z',
      latitude: 50, longitude: -7, windSpeedMps: 6.83, windDirectionDegrees: 203.24, heightMeters: 0.228, periodSeconds: 8.188, swellDirectionDegrees: 236.43 });
    expect(runtime.deletes).toHaveLength(10);
    expect(runtime.deletes.every((release) => release.mock.calls.length === 1)).toBe(true);
    expect(runtime.unlink).toHaveBeenCalledOnce();
  });

  it('keeps a masked land cell empty when every wet neighbour is beyond ten kilometres', async () => {
    const records = fields(); records.forEach((item) => mask(item, 4)); engine(records);
    const { decodeMfwamPoint } = await load();
    await expect(decodeMfwamPoint(bytes(), POINT, TARGET)).resolves.toMatchObject({ latitude: 50, longitude: -7,
      windSpeedMps: null, windDirectionDegrees: null, heightMeters: null, periodSeconds: null, swellDirectionDegrees: null });
  });

  it('selects the closest marine cell geodesically and samples every component from that same cell', async () => {
    const records = coastalFields();
    records.slice(2).forEach((item) => mask(item, 7));
    engine(records);
    const { decodeMfwamPoint } = await load();
    const result = await decodeMfwamPoint(bytes(), COASTAL_POINT, TARGET);
    // West/east are nearer in kilometres than the north/south cells, although all are one grid step away.
    expect(result).toMatchObject({ latitude: 50, longitude: expect.closeTo(0.025, 10), marineFallback: true,
      windSpeedMps: 7, windDirectionDegrees: 96, heightMeters: 0.7, periodSeconds: 6.2, swellDirectionDegrees: 186,
      referenceTime: '2026-10-22T12:00:00.000Z', validTime: '2026-10-22T13:00:00.000Z' });
    expect(result.windSpeedMps).not.toBe(records[0].values[7]);
  });

  it('breaks equally distant marine-cell ties by stable grid index', async () => {
    const records = coastalFields();
    records.slice(2).forEach((item) => mask(item, 7));
    engine(records);
    const { decodeMfwamPoint } = await load();
    const first = await decodeMfwamPoint(bytes(), COASTAL_POINT, TARGET);
    const second = await decodeMfwamPoint(bytes(), COASTAL_POINT, TARGET);
    expect(first.longitude).toBeCloseTo(0.025, 10);
    expect(second).toEqual(first);
  });

  it('keeps a partially available requested marine cell instead of moving solely to complete its other fields', async () => {
    const records = coastalFields();
    mask(records[0], 7); mask(records[3], 7); records[2].values[7] = 0;
    engine(records);
    const { decodeMfwamPoint } = await load();
    const result = await decodeMfwamPoint(bytes(), COASTAL_POINT, TARGET);
    expect(result).toMatchObject({ latitude: 50, longitude: expect.closeTo(0.05, 10), windSpeedMps: null, heightMeters: 0, periodSeconds: null });
    expect(result.marineFallback).toBeUndefined();
  });

  it('does not mistake a nearby wind-only land cell for a usable marine cell and preserves partial fields at the chosen sea cell', async () => {
    const records = coastalFields();
    records.slice(2).forEach((item) => mask(item, 7));
    mask(records[2], 6); mask(records[3], 6);
    mask(records[0], 8); mask(records[3], 8);
    engine(records);
    const { decodeMfwamPoint } = await load();
    const result = await decodeMfwamPoint(bytes(), COASTAL_POINT, TARGET);
    expect(result).toMatchObject({ longitude: expect.closeTo(0.075, 10), marineFallback: true, heightMeters: 0.9,
      periodSeconds: null, windSpeedMps: null, windDirectionDegrees: 98, swellDirectionDegrees: 188 });
  });

  it('returns the requested cell with missing marine values when no marine neighbour exists inside the radius', async () => {
    const records = coastalFields();
    records.slice(2).forEach((item) => { for (let index = 0; index < item.values.length; index++) mask(item, index); });
    engine(records);
    const { decodeMfwamPoint } = await load();
    const result = await decodeMfwamPoint(bytes(), COASTAL_POINT, TARGET);
    expect(result).toMatchObject({ longitude: expect.closeTo(0.05, 10), windSpeedMps: 8, heightMeters: null, periodSeconds: null, swellDirectionDegrees: null });
    expect(result.marineFallback).toBeUndefined();
  });

  it('measures the ten-kilometre search from the requested coordinates, including the natural half-cell offset', async () => {
    const records = coastalFields(8);
    records.slice(2).forEach((item) => {
      for (let index = 0; index < item.values.length; index++) if (index !== 14) mask(item, index);
    });
    engine(records);
    const { decodeMfwamPoint } = await load();
    // The marine cell at 0.15 E is about 9.8 km from the request, but 10.7 km from its nearest grid cell at 0 E.
    const result = await decodeMfwamPoint(bytes(), { latitude: 50, longitude: 0.0124 }, TARGET);
    expect(result).toMatchObject({ longitude: expect.closeTo(0.15, 10), marineFallback: true, heightMeters: 1.5 });
  });

  it('rejects a marine neighbour just outside ten kilometres even when its grid index is close', async () => {
    const records = coastalFields(8);
    records.slice(2).forEach((item) => {
      for (let index = 0; index < item.values.length; index++) if (index !== 14) mask(item, index);
    });
    engine(records);
    const { decodeMfwamPoint } = await load();
    const result = await decodeMfwamPoint(bytes(), { latitude: 50, longitude: 0.01 }, TARGET);
    expect(result).toMatchObject({ longitude: 0, heightMeters: null, periodSeconds: null });
    expect(result.marineFallback).toBeUndefined();
  });

  it('never substitutes a neighbouring hour to find marine values', async () => {
    const records = coastalFields();
    records.slice(2).forEach((item) => { for (let index = 0; index < item.values.length; index++) mask(item, index); });
    const later = coastalFields(); later.forEach((item) => { item.numbers.validityTime = 1400; });
    engine([...records, ...later]);
    const { decodeMfwamPoint } = await load();
    const result = await decodeMfwamPoint(bytes(), COASTAL_POINT, TARGET);
    expect(result).toMatchObject({ validTime: '2026-10-22T13:00:00.000Z', heightMeters: null, periodSeconds: null });
    expect(result.marineFallback).toBeUndefined();
  });

  it('preserves partially missing fields at the same cell', async () => {
    const records = fields(); mask(records[0], 4); records[3].values[4] = 9999; engine(records);
    const { decodeMfwamPoint } = await load();
    await expect(decodeMfwamPoint(bytes(), POINT, TARGET)).resolves.toMatchObject({ windSpeedMps: null, periodSeconds: null, heightMeters: 0.228, windDirectionDegrees: 203.24 });
  });

  it('selects the nearest complete common forecast time, never combining hours or substituting total sea state', async () => {
    engine([...fields(13), ...fields(14), ...fields(15).slice(0, 4), message('10/0/3', 9, 15)]);
    const { decodeMfwamPoint } = await load();
    expect((await decodeMfwamPoint(bytes(), POINT, Date.parse('2026-10-22T14:55Z'))).validTime).toBe('2026-10-22T14:00:00.000Z');
  });

  it('does not combine fields from different model reference runs', async () => {
    const records = fields(); records.slice(3).forEach((item) => { item.numbers.dataTime = 600; });
    const runtime = engine(records);
    const { decodeMfwamPoint } = await load();
    await expect(decodeMfwamPoint(bytes(), POINT, TARGET)).rejects.toMatchObject({ code: 'MFWAM_INCOMPLETE_FORECAST' });
    expect(runtime.unlink).toHaveBeenCalledOnce();
  });

  it.each(['units', 'level', 'packing', 'scan', 'coordinates', 'bitmap', 'array', 'direction', 'negative', 'nonfinite', 'date', 'duplicate'])(
    'fails clearly on unsupported or inconsistent %s instead of returning zeros', async (kind) => {
      const records = fields();
      if (kind === 'units') records[0].strings.units = 'kn';
      if (kind === 'level') records[0].numbers.level = 100;
      if (kind === 'packing') records[0].numbers.dataRepresentationTemplateNumber = 40;
      if (kind === 'scan') records[0].numbers.scanningMode = 32;
      if (kind === 'coordinates') { records[0].numbers.latitudeOfFirstGridPointInDegrees += 1; records[0].numbers.latitudeOfLastGridPointInDegrees += 1; }
      if (kind === 'bitmap') records[0].bitmap[4] = 0;
      if (kind === 'array') records[0].values.pop();
      if (kind === 'direction') records[1].values[4] = 361;
      if (kind === 'negative') records[0].values[4] = -1;
      if (kind === 'nonfinite') records[3].values[4] = Infinity;
      if (kind === 'date') records[0].numbers.validityDate = 20260230;
      if (kind === 'duplicate') records.push(message('0/2/0', 90));
      const runtime = engine(records);
      const { decodeMfwamPoint } = await load();
      await expect(decodeMfwamPoint(bytes(), POINT, TARGET)).rejects.toMatchObject({ code: 'GRIB_UNSUPPORTED' });
      expect(runtime.unlink).toHaveBeenCalledOnce();
      expect(runtime.deletes.every((release) => release.mock.calls.length === 1)).toBe(true);
    },
  );

  it('rejects coordinates outside the grid instead of clamping them to a coastal cell', async () => {
    engine(fields()); const { decodeMfwamPoint } = await load();
    await expect(decodeMfwamPoint(bytes(), { latitude: 52, longitude: -7 }, TARGET)).rejects.toMatchObject({ code: 'GRIB_POINT_OUTSIDE_GRID' });
  });

  it('uses the actual reversed row scan when its coordinates agree', async () => {
    const records = fields();
    records.forEach((item) => Object.assign(item.numbers, { scanningMode: 192, iScansNegatively: 1, jScansPositively: 1,
      latitudeOfFirstGridPointInDegrees: 50, longitudeOfFirstGridPointInDegrees: 354, latitudeOfLastGridPointInDegrees: 51, longitudeOfLastGridPointInDegrees: 352 }));
    records[0].values = [1, 2, 3, 4, 5, 6]; engine(records);
    const { decodeMfwamPoint } = await load();
    expect((await decodeMfwamPoint(bytes(), POINT, TARGET)).windSpeedMps).toBe(2);
  });

  it('initializes one WASM instance and serializes input files with cleanup before the next request', async () => {
    const runtime = engine(fields());
    const { decodeMfwamPoint } = await load();
    await Promise.all([decodeMfwamPoint(bytes(1), POINT, TARGET), decodeMfwamPoint(bytes(2), POINT, TARGET)]);
    expect(state.createEccodes).toHaveBeenCalledOnce();
    expect(runtime.events).toEqual(['write', 'read', 'read', 'unlink', 'write', 'read', 'read', 'unlink']);
  });

  it('releases the queue and retries initialization after an upstream failure', async () => {
    const runtime = engine(fields());
    state.createEccodes.mockRejectedValueOnce(new Error('WASM unavailable')).mockResolvedValue(runtime.instance);
    const { decodeMfwamPoint } = await load();
    await expect(decodeMfwamPoint(bytes(), POINT, TARGET)).rejects.toMatchObject({ code: 'GRIB_DECODE_FAILED', cause: expect.any(Error) });
    await expect(decodeMfwamPoint(bytes(), POINT, TARGET)).resolves.toMatchObject({ heightMeters: 0.228 });
    expect(state.createEccodes).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed input before loading WASM', async () => {
    const { decodeMfwamPoint } = await load();
    await expect(decodeMfwamPoint(new Uint8Array(20), POINT, TARGET)).rejects.toMatchObject({ code: 'GRIB_INVALID_INPUT' });
    await expect(decodeMfwamPoint(bytes(), { ...POINT, latitude: NaN }, TARGET)).rejects.toMatchObject({ code: 'GRIB_INVALID_INPUT' });
    await expect(decodeMfwamPoint(bytes(), POINT, NaN)).rejects.toMatchObject({ code: 'GRIB_INVALID_INPUT' });
    expect(state.createEccodes).not.toHaveBeenCalled();
  });
});
