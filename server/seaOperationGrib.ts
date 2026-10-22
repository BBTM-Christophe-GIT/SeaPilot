import { createRequire } from 'node:module';

export interface MfwamPointForecast {
  referenceTime: string;
  validTime: string;
  latitude: number;
  longitude: number;
  windSpeedMps: number | null;
  windDirectionDegrees: number | null;
  heightMeters: number | null;
  periodSeconds: number | null;
  swellDirectionDegrees: number | null;
}

export class SeaOperationGribError extends Error {
  readonly code: 'GRIB_INVALID_INPUT' | 'GRIB_UNSUPPORTED' | 'GRIB_POINT_OUTSIDE_GRID' | 'MFWAM_INCOMPLETE_FORECAST' | 'GRIB_DECODE_FAILED';
  readonly cause?: unknown;
  constructor(code: SeaOperationGribError['code'], message: string, cause?: unknown) {
    super(message);
    this.name = 'SeaOperationGribError';
    this.code = code;
    this.cause = cause;
  }
}

interface Handle {
  getLong(key: string): number;
  getDouble(key: string): number;
  getString(key: string): string;
  getDoubleArray(key: string): number[];
}
interface Eccodes {
  writeFile(path: string, bytes: Uint8Array): void;
  /** The upstream iterator deletes each handle and its iterator in finally. */
  forEachMessage(path: string, callback: (handle: Handle) => void): void;
  _module: { FS: { unlink(path: string): void } };
}
type Field = 'windSpeedMps' | 'windDirectionDegrees' | 'heightMeters' | 'periodSeconds' | 'swellDirectionDegrees';
interface FieldSpec { field: Field; units: readonly string[]; wind?: boolean; direction?: boolean }
// Météo-France MFWAM SP1: SHS/MPS/MDS are total swell, distinct from SWH/mer totale.
const PARAMETERS: Record<string, FieldSpec> = {
  '0/2/1': { field: 'windSpeedMps', units: ['m s**-1', 'm s-1', 'm/s'], wind: true },
  '0/2/0': { field: 'windDirectionDegrees', units: ['degree true', 'degrees true'], wind: true, direction: true },
  '10/0/8': { field: 'heightMeters', units: ['m'] },
  '10/0/9': { field: 'periodSeconds', units: ['s'] },
  '10/0/7': { field: 'swellDirectionDegrees', units: ['degree true', 'degrees true'], direction: true },
};
const FIELD_COUNT = 5;
const PATH = '/seapilot-mfwam.grib2';
const EPSILON = 1e-7;
const require = createRequire(import.meta.url);
let modulePromise: Promise<Eccodes> | undefined;
let queue: Promise<void> = Promise.resolve();

function unsupported(message: string): never {
  throw new SeaOperationGribError('GRIB_UNSUPPORTED', `GRIB MFWAM non pris en charge : ${message}.`);
}
function numeric(handle: Handle, key: string): number {
  const value = handle.getDouble(key);
  if (!Number.isFinite(value)) unsupported(`métadonnée ${key} invalide`);
  return value;
}
function integer(handle: Handle, key: string): number {
  const value = handle.getLong(key);
  if (!Number.isSafeInteger(value)) unsupported(`métadonnée ${key} invalide`);
  return value;
}
function longitude(value: number): number { return ((value + 180) % 360 + 360) % 360 - 180; }
function timestamp(date: number, time: number): string {
  if (!Number.isSafeInteger(date) || !Number.isSafeInteger(time) || date < 10000101 || date > 99991231 || time < 0 || time > 2359) unsupported('date invalide');
  const year = Math.floor(date / 10000);
  const month = Math.floor(date / 100) % 100;
  const day = date % 100;
  const hour = Math.floor(time / 100);
  const minute = time % 100;
  const instant = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (minute > 59 || instant.getUTCFullYear() !== year || instant.getUTCMonth() !== month - 1 || instant.getUTCDate() !== day) unsupported('date invalide');
  return instant.toISOString();
}

interface Grid { ni: number; nj: number; points: number; firstLat: number; firstLon: number; latStep: number; lonStep: number }
interface Descriptor { ordinal: number; spec: FieldSpec; bitmap: number; packed: number; missing: number; missingValue: number; grid: Grid }
interface Group { referenceTime: string; validTime: string; fields: Map<Field, Descriptor> }
function readGrid(handle: Handle): Grid {
  if (integer(handle, 'gridDefinitionTemplateNumber') !== 0 || handle.getString('gridType') !== 'regular_ll') unsupported('la grille doit être latitude/longitude régulière');
  const ni = integer(handle, 'Ni');
  const nj = integer(handle, 'Nj');
  const points = integer(handle, 'numberOfPoints');
  if (ni < 2 || nj < 2 || ni * nj !== points || points > 10_000_000) unsupported('dimensions de grille invalides');
  const iNegative = integer(handle, 'iScansNegatively');
  const jPositive = integer(handle, 'jScansPositively');
  if (![0, 1].includes(iNegative) || ![0, 1].includes(jPositive)
    || integer(handle, 'scanningMode') !== iNegative * 128 + jPositive * 64
    || integer(handle, 'jPointsAreConsecutive') !== 0 || integer(handle, 'alternativeRowScanning') !== 0) unsupported('ordre de balayage non pris en charge');
  const di = numeric(handle, 'iDirectionIncrementInDegrees');
  const dj = numeric(handle, 'jDirectionIncrementInDegrees');
  const firstLat = numeric(handle, 'latitudeOfFirstGridPointInDegrees');
  const firstLon = longitude(numeric(handle, 'longitudeOfFirstGridPointInDegrees'));
  const lastLat = numeric(handle, 'latitudeOfLastGridPointInDegrees');
  const lastLon = longitude(numeric(handle, 'longitudeOfLastGridPointInDegrees'));
  const latStep = jPositive ? dj : -dj;
  const lonStep = iNegative ? -di : di;
  if (di <= 0 || dj <= 0 || di * (ni - 1) >= 360 || Math.abs(firstLat) > 90 || Math.abs(lastLat) > 90
    || Math.abs(firstLat + (nj - 1) * latStep - lastLat) > EPSILON
    || Math.abs(longitude(firstLon + (ni - 1) * lonStep - lastLon)) > EPSILON) unsupported('coordonnées de grille incohérentes');
  return { ni, nj, points, firstLat, firstLon, latStep, lonStep };
}
function nearest(grid: Grid, point: { latitude: number; longitude: number }) {
  let lonOffset = longitude(point.longitude - grid.firstLon);
  if (grid.lonStep > 0 && lonOffset < -EPSILON) lonOffset += 360;
  if (grid.lonStep < 0 && lonOffset > EPSILON) lonOffset -= 360;
  const x = lonOffset / grid.lonStep;
  const y = (point.latitude - grid.firstLat) / grid.latStep;
  if (x < -EPSILON || y < -EPSILON || x > grid.ni - 1 + EPSILON || y > grid.nj - 1 + EPSILON) {
    throw new SeaOperationGribError('GRIB_POINT_OUTSIDE_GRID', 'Le point est hors de la grille MFWAM.');
  }
  const i = Math.max(0, Math.min(grid.ni - 1, Math.round(x)));
  const j = Math.max(0, Math.min(grid.nj - 1, Math.round(y)));
  return { index: j * grid.ni + i, latitude: grid.firstLat + j * grid.latStep, longitude: longitude(grid.firstLon + i * grid.lonStep) };
}

function readDescriptor(handle: Handle, ordinal: number, spec: FieldSpec): Descriptor {
  if (integer(handle, 'edition') !== 2 || integer(handle, 'dataRepresentationTemplateNumber') !== 42
    || handle.getString('packingType') !== 'grid_ccsds' || handle.getString('stepType') !== 'instant'
    || integer(handle, 'productDefinitionTemplateNumber') !== 0) unsupported('seuls les champs instantanés GRIB2 CCSDS/AEC sont acceptés');
  if (!spec.units.includes(handle.getString('units').trim().toLowerCase())) unsupported(`unité du champ ${spec.field}`);
  const levelType = handle.getString('typeOfLevel');
  const level = numeric(handle, 'level');
  if (spec.wind ? levelType !== 'heightAboveGround' || level !== 10 : !['meanSea', 'surface'].includes(levelType) || level !== 0) unsupported(`niveau du champ ${spec.field}`);
  const grid = readGrid(handle);
  const bitmap = integer(handle, 'bitmapPresent');
  const packed = integer(handle, 'numberOfValues');
  const missing = integer(handle, 'numberOfMissing');
  if (![0, 1].includes(bitmap) || packed < 0 || missing < 0 || packed + missing !== grid.points || !bitmap && missing !== 0) unsupported('taille du masque mer/terre incohérente');
  return { ordinal, spec, grid, bitmap, packed, missing, missingValue: numeric(handle, 'missingValue') };
}
function sample(handle: Handle, descriptor: Descriptor, index: number): number | null {
  const values = handle.getDoubleArray('values');
  if (values.length !== descriptor.grid.points) unsupported('valeurs non développées sur la grille complète');
  if (descriptor.bitmap) {
    const bitmap = handle.getDoubleArray('bitmap');
    if (bitmap.length !== values.length) unsupported('masque de taille invalide');
    let packed = 0;
    for (const wet of bitmap) {
      if (wet !== 0 && wet !== 1) unsupported('masque binaire invalide');
      packed += wet;
    }
    if (packed !== descriptor.packed) unsupported('nombre de cellules du masque incohérent');
    if (bitmap[index] === 0) return null;
  }
  const value = values[index];
  if (value === descriptor.missingValue) return null;
  if (!Number.isFinite(value) || value < 0 || descriptor.spec.direction && value > 360) unsupported(`valeur du champ ${descriptor.spec.field} invalide`);
  return value;
}

async function decode(bytes: Uint8Array, point: { latitude: number; longitude: number }, targetTime: number): Promise<MfwamPointForecast> {
  modulePromise ??= Promise.resolve().then(async () => {
    const { createEccodes } = require('@meri-imperiumi/eccodes-wasm') as { createEccodes(): Promise<Eccodes> };
    return createEccodes();
  }).catch((error: unknown) => { modulePromise = undefined; throw error; });
  const eccodes = await modulePromise;
  let written = false;
  try {
    eccodes.writeFile(PATH, bytes);
    written = true;
    const groups = new Map<string, Group>();
    let ordinal = 0;
    eccodes.forEachMessage(PATH, (handle) => {
      ordinal += 1;
      const spec = PARAMETERS[['discipline', 'parameterCategory', 'parameterNumber'].map((key) => integer(handle, key)).join('/')];
      if (!spec) return;
      const referenceTime = timestamp(integer(handle, 'dataDate'), integer(handle, 'dataTime'));
      const validTime = timestamp(integer(handle, 'validityDate'), integer(handle, 'validityTime'));
      if (Date.parse(referenceTime) > Date.parse(validTime)) unsupported('échéance antérieure au run');
      const key = `${referenceTime}/${validTime}`;
      const group = groups.get(key) ?? { referenceTime, validTime, fields: new Map<Field, Descriptor>() };
      if (group.fields.has(spec.field)) unsupported(`champ ${spec.field} en double pour la même échéance`);
      group.fields.set(spec.field, readDescriptor(handle, ordinal, spec));
      groups.set(key, group);
    });
    const candidates = [...groups.values()].filter((group) => group.fields.size === FIELD_COUNT).sort((a, b) =>
      Math.abs(Date.parse(a.validTime) - targetTime) - Math.abs(Date.parse(b.validTime) - targetTime)
      || Date.parse(a.validTime) - Date.parse(b.validTime) || Date.parse(b.referenceTime) - Date.parse(a.referenceTime));
    const group = candidates[0];
    if (!group) throw new SeaOperationGribError('MFWAM_INCOMPLETE_FORECAST', 'Aucune échéance commune aux cinq champs vent et houle MFWAM.');
    const descriptors = [...group.fields.values()];
    const grid = descriptors[0].grid;
    if (descriptors.some((descriptor) => JSON.stringify(descriptor.grid) !== JSON.stringify(grid))) unsupported('les champs ne partagent pas la même grille');
    const cell = nearest(grid, point);
    const result: MfwamPointForecast = { referenceTime: group.referenceTime, validTime: group.validTime, latitude: cell.latitude, longitude: cell.longitude,
      windSpeedMps: null, windDirectionDegrees: null, heightMeters: null, periodSeconds: null, swellDirectionDegrees: null };
    const byOrdinal = new Map(descriptors.map((descriptor) => [descriptor.ordinal, descriptor]));
    ordinal = 0;
    eccodes.forEachMessage(PATH, (handle) => {
      const descriptor = byOrdinal.get(++ordinal);
      if (descriptor) result[descriptor.spec.field] = sample(handle, descriptor, cell.index);
    });
    return result;
  } finally {
    // ecCodes' iterator frees all C handles in finally; remove the input from MEMFS too.
    if (written) eccodes._module.FS.unlink(PATH);
  }
}

/** No interpolation or move to a neighbouring sea cell. Provider enforces its ETA horizon. */
export function decodeMfwamPoint(bytes: Uint8Array, point: { latitude: number; longitude: number }, targetTime: number): Promise<MfwamPointForecast> {
  if (!(bytes instanceof Uint8Array) || bytes.length < 20 || bytes[0] !== 71 || bytes[1] !== 82 || bytes[2] !== 73 || bytes[3] !== 66 || bytes[7] !== 2
    || !Number.isFinite(point?.latitude) || Math.abs(point.latitude) > 90 || !Number.isFinite(point?.longitude) || Math.abs(point.longitude) > 180
    || !Number.isFinite(targetTime) || !Number.isFinite(new Date(targetTime).getTime())) {
    return Promise.reject(new SeaOperationGribError('GRIB_INVALID_INPUT', 'Les données GRIB, les coordonnées ou l’ETA sont invalides.'));
  }
  const pending = queue.then(() => decode(bytes, point, targetTime)).catch((error: unknown) => {
    if (error instanceof SeaOperationGribError) throw error;
    throw new SeaOperationGribError('GRIB_DECODE_FAILED', 'Le fichier MFWAM ne peut pas être décodé.', error);
  });
  queue = pending.then(() => undefined, () => undefined);
  return pending;
}
