import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QHSE_POLICY_AXIS_ICONS, QhsePolicyAxisIcon, normalizeQhsePolicyAxisIconKey, resolveQhsePolicyAxisIcon } from './qhsePolicyIcons';

describe('strategic axis symbols', () => {
  it.each([
    ['Sécurité', 'safety'],
    ['Ethique, lutte contre la corruption', 'ethics'],
    ['Santé, bien-être au travail et lutte contre les discriminations', 'health'],
    ['Environnement', 'environment'],
    ['Ecoute client', 'customer'],
    ['Sécurité informatique', 'cybersecurity'],
    ['CYBERSÉCURITÉ', 'cybersecurity'],
    ['Technique', 'general'],
  ] as const)('recognizes existing axis %s without reclassifying cyber safety', (name, expected) => {
    expect(resolveQhsePolicyAxisIcon({ name })).toBe(expected);
  });

  it('preserves the administrator’s explicit symbol choice, including the general symbol', () => {
    expect(resolveQhsePolicyAxisIcon({ name: 'Sécurité', iconKey: 'health' })).toBe('health');
    expect(resolveQhsePolicyAxisIcon({ name: 'Sécurité', iconKey: 'general' })).toBe('general');
    expect(normalizeQhsePolicyAxisIconKey('unknown')).toBe('general');
    expect(normalizeQhsePolicyAxisIconKey(null)).toBe('general');
  });

  it.each(QHSE_POLICY_AXIS_ICONS)('renders shared vector definition for $label with accessible labeling', ({ key, label, node }) => {
    render(<QhsePolicyAxisIcon iconKey={key} role="img" aria-label={label} />);
    const svg = screen.getByRole('img', { name: label });
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg.querySelectorAll('path, circle, rect')).toHaveLength(node.length);
  });
});
