export type SeaOperationIsolatedPointIconName = 'buoy' | 'pin' | 'platform' | 'wind-farm' | 'mooring' | 'anchor';

export interface SeaOperationIsolatedPointIconDefinition {
  value: SeaOperationIsolatedPointIconName;
  label: string;
  /** Absolute 24×24 SVG paths: M/L/C/Z only, shared with the vector PDF renderer. */
  paths: readonly { d: string; fill?: boolean }[];
}

export const SEA_OPERATION_ISOLATED_POINT_ICONS: readonly SeaOperationIsolatedPointIconDefinition[] = [
  { value: 'buoy', label: 'Bouée', paths: [
    { d: 'M10.8 5 L10.8 3 C10.8 1.4 13.2 1.4 13.2 3 L13.2 5 M9.5 5 L14.5 5 M12 5 L7.5 13 M12 5 L16.5 13 M12 5 L12 13' },
    { d: 'M5 13 L19 13 L19 16 C19 18.8 16 19.4 12 19.4 C8 19.4 5 18.8 5 16 Z M5 15.2 L19 15.2' },
    { d: 'M1.5 17 C4.5 15 6.5 19 9.5 17 C12.5 15 14.5 19 17.5 17 C19.5 15.6 21 16.8 22.5 17 M12 19.4 L12 20.3 C9.2 21 14.2 22 12 23' },
  ] },
  { value: 'pin', label: 'Repère de position', paths: [
    { d: 'M12 20 C9.5 17 5.8 12.7 5.8 8.5 C5.8 0.4 18.2 0.4 18.2 8.5 C18.2 12.7 14.5 17 12 20 Z' },
    { d: 'M15.2 8.3 C15.2 12.6 8.8 12.6 8.8 8.3 C8.8 4 15.2 4 15.2 8.3 Z M8.2 19.8 C1.6 20.6 4.6 23 12 23 C19.4 23 22.4 20.6 15.8 19.8' },
  ] },
  { value: 'platform', label: 'Plate-forme offshore', paths: [
    { d: 'M2.5 14 L20.5 14 L20.5 15.8 L2.5 15.8 Z M5 15.8 L5 21 M10.8 15.8 L10.8 21 M17.7 15.8 L17.7 21 M4.2 14 L4.2 10 L8 10 L8 14 M14 14 L14 9.8 L17 9.8 L17 14' },
    { d: 'M9.5 14 L11 1.5 L12.2 1.5 L13.7 14 M10.8 4 L12.5 6 L10.2 8.5 L13 11 L9.7 13.5 M11.9 4 L10.5 6 L12.7 8.5 L10 11 L13.5 13.5 M5 10 L5.5 5.8 L6.2 5.8 L6.8 10 M17 10 L22.5 7.7 L22.5 12 M18 11.5 L18 14' },
    { d: 'M1 22.2 C3 20.5 4.5 23.8 6.5 22.2 C8.5 20.5 10 23.8 12 22.2 C14 20.5 15.5 23.8 17.5 22.2 C19.5 20.5 21 23.8 23 22.2' },
  ] },
  { value: 'wind-farm', label: 'Parc éolien', paths: [
    { d: 'M11.4 11 L10.7 23 L13.3 23 L12.6 11 Z M12 7.3 C10.8 4 11.4 1.9 12 1 C12.8 3 13.1 5.5 12 7.3 Z M10.5 10 C7.1 12.4 4.7 12.6 3.6 12.3 C5.6 10.4 8 9.2 10.5 10 Z M13.5 10 C16 9.2 18.4 10.4 20.4 12.3 C19.3 12.6 16.9 12.4 13.5 10 Z', fill: true },
    { d: 'M13.7 9 C13.7 11.3 10.3 11.3 10.3 9 C10.3 6.7 13.7 6.7 13.7 9 Z' },
    { d: 'M4 16 L3.4 23 L4.8 23 L4.3 16 M4.1 13 L4.1 10.5 M3.4 14.4 L1 15.7 M4.9 14.4 L7.2 15.7 M19.7 16 L19.2 23 L20.6 23 L20 16 M19.9 13 L19.9 10.5 M19.1 14.4 L16.8 15.7 M20.6 14.4 L23 15.7' },
    { d: 'M5.3 14.5 C5.3 16.1 2.9 16.1 2.9 14.5 C2.9 12.9 5.3 12.9 5.3 14.5 Z M21.1 14.5 C21.1 16.1 18.7 16.1 18.7 14.5 C18.7 12.9 21.1 12.9 21.1 14.5 Z' },
  ] },
  { value: 'mooring', label: 'Corps-mort', paths: [
    { d: 'M9.5 5.5 C9.5 10.2 2.5 10.2 2.5 5.5 C2.5 0.8 9.5 0.8 9.5 5.5 Z M2.5 5.5 L9.5 5.5 M5 2 L5 1 L7 1 L7 2 M8.5 8.3 C12.5 9.3 10.5 12.5 13 13.5' },
    { d: 'M12.5 13 C13.2 11.8 15.1 13.1 14.4 14.3 C13.7 15.5 11.8 14.2 12.5 13 Z M14 14.2 C14.7 13 16.6 14.3 15.9 15.5 C15.2 16.7 13.3 15.4 14 14.2 Z M15.5 15.4 C16.2 14.2 18.1 15.5 17.4 16.7 C16.7 17.9 14.8 16.6 15.5 15.4 Z M17 16.6 C17.7 15.4 19.6 16.7 18.9 17.9 C18.2 19.1 16.3 17.8 17 16.6 Z' },
    { d: 'M17 19 L17 18.3 C17 17.2 19 17.2 19 18.3 L19 19 M14.7 19 L21.3 19 L22.3 22 L13.7 22 Z M12.5 23 C15 24 21 24 23.5 23' },
  ] },
  { value: 'anchor', label: 'Ancre', paths: [
    { d: 'M14.2 4 C14.2 6.9 9.8 6.9 9.8 4 C9.8 1.1 14.2 1.1 14.2 4 Z M12 6.2 L12 22 M7 9 L17 9 M3.6 13.5 L3.6 16 C3.6 20 7.4 21.7 12 22 C16.6 21.7 20.4 20 20.4 16 L20.4 13.5 M1.4 16 L3.6 13.5 L6.2 15.8 M17.8 15.8 L20.4 13.5 L22.6 16' },
  ] },
];

export function isSeaOperationIsolatedPointIconName(value: unknown): value is SeaOperationIsolatedPointIconName {
  return typeof value === 'string' && SEA_OPERATION_ISOLATED_POINT_ICONS.some(icon => icon.value === value);
}

export function seaOperationIsolatedPointIcon(value: unknown): SeaOperationIsolatedPointIconDefinition | undefined {
  return SEA_OPERATION_ISOLATED_POINT_ICONS.find(icon => icon.value === value);
}

/** index is the original one-based ordinal, including preceding invalid positions. */
export function seaOperationIsolatedPointLabel(point: { number: string }, index: number): string {
  return point.number.trim() || `P${index}`;
}
