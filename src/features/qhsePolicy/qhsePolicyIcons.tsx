import { createLucideIcon, type IconNode, type LucideProps } from 'lucide-react';

export type QhsePolicyAxisIconKey = 'safety' | 'ethics' | 'health' | 'environment' | 'customer' | 'cybersecurity' | 'general';

// A single vector definition keeps the screen and printed report consistent.
// Curves use absolute cubic segments so the PDF can draw the same paths directly.
export const QHSE_POLICY_AXIS_ICONS = [
  { key: 'safety', label: 'Sécurité', node: [
    ['path', { d: 'M 12 2 C 15 4 17 5 20 5 L 20 13 C 20 18 16 20.5 12 22 C 8 20.5 4 18 4 13 L 4 5 C 7 5 9 4 12 2 Z', key: 'shield' }],
    ['path', { d: 'M 8.5 12 L 11 14.5 L 15.5 10', key: 'check' }],
  ] },
  { key: 'ethics', label: 'Éthique, lutte contre la corruption', node: [
    ['path', { d: 'M 12 3 L 12 21 M 7 21 L 17 21 M 3 7 L 4 7 C 7 7 9 6 12 5 C 15 6 17 7 20 7 L 21 7', key: 'scale' }],
    ['path', { d: 'M 5 8 L 2 16 C 3.5 18 6.5 18 8 16 L 5 8 M 19 8 L 16 16 C 17.5 18 20.5 18 22 16 L 19 8', key: 'pans' }],
  ] },
  { key: 'health', label: 'Santé, bien-être au travail et lutte contre les discriminations', node: [
    ['path', { d: 'M 12 6 C 7 0 2 3 2 8.5 C 2 11.5 4 13.5 6.5 16 M 12 6 C 17 0 22 3 22 8.5 C 22 10.5 21 12 19.5 13.5', key: 'heart' }],
    ['path', { d: 'M 6.5 16 L 10.5 20 C 12 21.5 14 19.5 12.5 18 L 11 16.5 M 12.5 18 C 14 19.5 16 17.5 14.5 16 L 13 14.5 M 14.5 16 C 16 17.5 18 15.5 16.5 14 L 15 12.5 M 16.5 14 C 18 15.5 20 13.5 18.5 12 L 16.5 10 C 15.5 9 14 9 13 10 L 11.5 11.5 C 10 13 8 11 9.5 9.5 L 13 6', key: 'hands' }],
  ] },
  { key: 'environment', label: 'Environnement', node: [
    ['path', { d: 'M 11 20 C 4 20 2 13 7 8 C 10 5 16 6 19 2 C 20 4 21 7 21 10 C 21 15.5 16 20 11 20 Z M 2 21 C 2 17 5 15 8 14.5 C 10 14 12 13 13 12', key: 'leaf' }],
  ] },
  { key: 'customer', label: 'Écoute client', node: [
    ['path', { d: 'M 6 8.5 C 6 0 19 0 19 8.5 C 19 14.5 13 14.5 13 18.5 C 13 23 6 23 6 18.5 M 15 8.5 C 15 5 10 5 10 8.5 L 10 9.5 C 10 12.5 7 10.5 8 13', key: 'ear' }],
  ] },
  { key: 'cybersecurity', label: 'Sécurité informatique', node: [
    ['rect', { x: '3', y: '10', width: '18', height: '12', rx: '2', key: 'lock' }],
    ['path', { d: 'M 7 10 L 7 7 C 7 0.3 17 0.3 17 7 L 17 10', key: 'shackle' }],
    ['circle', { cx: '12', cy: '16', r: '1', key: 'keyhole' }],
  ] },
  { key: 'general', label: 'Autre axe stratégique', node: [
    ['circle', { cx: '12', cy: '12', r: '10', key: 'outer' }],
    ['circle', { cx: '12', cy: '12', r: '6', key: 'middle' }],
    ['circle', { cx: '12', cy: '12', r: '2', key: 'inner' }],
  ] },
] satisfies Array<{ key: QhsePolicyAxisIconKey; label: string; node: IconNode }>;

export function normalizeQhsePolicyAxisIconKey(value: unknown): QhsePolicyAxisIconKey {
  return QHSE_POLICY_AXIS_ICONS.find((icon) => icon.key === value)?.key ?? 'general';
}

export function resolveQhsePolicyAxisIcon(axis: { name: string; iconKey?: QhsePolicyAxisIconKey }): QhsePolicyAxisIconKey {
  if (QHSE_POLICY_AXIS_ICONS.some((icon) => icon.key === axis.iconKey)) return axis.iconKey!;
  const name = axis.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/informat|cyber|numerique/.test(name)) return 'cybersecurity';
  if (/sante|bien.?etre|discrimin/.test(name)) return 'health';
  if (/ethique|corruption/.test(name)) return 'ethics';
  if (/environ|ecolog/.test(name)) return 'environment';
  if (/client|ecoute/.test(name)) return 'customer';
  if (/securite|surete/.test(name)) return 'safety';
  return 'general';
}

export function qhsePolicyAxisIconDefinition(key: QhsePolicyAxisIconKey) {
  return QHSE_POLICY_AXIS_ICONS.find((icon) => icon.key === key) ?? QHSE_POLICY_AXIS_ICONS[6];
}

export function qhsePolicyAxisIconLabel(key: QhsePolicyAxisIconKey) {
  return qhsePolicyAxisIconDefinition(key).label;
}

const components = Object.fromEntries(QHSE_POLICY_AXIS_ICONS.map((icon) => [icon.key, createLucideIcon(`qhse-${icon.key}`, icon.node)]));

export function QhsePolicyAxisIcon({ iconKey, ...props }: LucideProps & { iconKey: QhsePolicyAxisIconKey }) {
  const Icon = components[normalizeQhsePolicyAxisIconKey(iconKey)];
  return <Icon {...props} />;
}
