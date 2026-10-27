import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeaOperationGmdssReference } from './SeaOperationGmdssReference';

afterEach(() => vi.unstubAllGlobals());

describe('documentary GMDSS reference map', () => {
  it('starts collapsed without mounting an image or requesting network data, and opens with the native summary', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup(), { container } = render(<SeaOperationGmdssReference />);
    const summary = screen.getByText('Carte officielle des zones radio SMDSM');
    const disclosure = summary.closest('details')!;
    expect(disclosure).not.toHaveAttribute('open'); expect(container.querySelector('img')).toBeNull(); expect(fetch).not.toHaveBeenCalled();
    await user.click(summary);
    const image = await screen.findByRole('img', { name: /Carte illustrative MCA 2024/ });
    expect(disclosure).toHaveAttribute('open'); expect(image).toHaveAttribute('src', '/maps/gmdss/mca-2024.svg');
    expect(image).toHaveAttribute('width', '674.26'); expect(image).toHaveAttribute('height', '621');
    await user.click(summary);
    await waitFor(() => expect(container.querySelector('img')).toBeNull());
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves attribution, original access and official sources without presenting a waypoint coverage classification', () => {
    const { container } = render(<SeaOperationGmdssReference />);
    const disclosure = container.querySelector('details')!;
    disclosure.open = true; fireEvent(disclosure, new Event('toggle'));
    expect(screen.getByText(/Contains public sector information licensed under the Open Government Licence v3.0/)).toHaveTextContent('© Crown copyright 2024.');
    expect(screen.getByText(/Ce document n’est pas un calque géoréférencé/)).toHaveTextContent('ne garantit pas la couverture radio');
    expect(screen.getByText(/Cette carte ne classe automatiquement aucun waypoint/)).toHaveTextContent('terminal embarqué');
    expect(screen.getByRole('link', { name: 'Ouvrir la carte originale en pleine taille' })).toHaveAttribute('href', '/maps/gmdss/mca-2024.svg');
    expect(screen.getByRole('link', { name: 'Publication MCA et limites d’utilisation' })).toHaveAttribute('href', expect.stringContaining('gov.uk/government/publications/gmdss-sea-areas'));
    expect(screen.getByRole('link', { name: 'Open Government Licence v3.0' })).toHaveAttribute('href', 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/');
    expect(screen.getByRole('link', { name: 'OMI : définitions actuelles A1 à A4' })).toHaveAttribute('href', expect.stringContaining('MSC.496(105).pdf'));
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank'); expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('retains the exact published SVG without embedded font files or active external content', async () => {
    const bytes = await readFile('public/maps/gmdss/mca-2024.svg');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('cad0e07a71337b70034ae173bd1dd2c8e1b500a72b81f4e54f8d442569596f11');
    const source = bytes.toString('utf8');
    expect(source).not.toMatch(/<script\b|<foreignObject\b|@font-face|@import|(?:href|src)\s*=\s*["'](?:https?:|data:)/i);
  });
});
