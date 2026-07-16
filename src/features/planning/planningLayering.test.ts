import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('planning sticky column layering', () => {
  it('keeps fixed labels above timeline bars and below sticky calendar headers', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/index.css'), 'utf8');
    const rules = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g));

    function zIndexFor(selector: string): number {
      const rule = rules.find((match) => {
        const selectors = match[1].split(',').map((candidate) => candidate.trim());
        return selectors.includes(selector) && /z-index:\s*\d+/.test(match[2]);
      });
      const zIndex = rule?.[2].match(/z-index:\s*(\d+)/)?.[1];

      expect(zIndex, `missing z-index for ${selector}`).toBeDefined();
      return Number(zIndex);
    }

    const header = zIndexFor('.planning-calendar-days');
    const corner = zIndexFor('.planning-calendar-corner');
    const rowLabel = zIndexFor('.planning-row-label');
    const absence = zIndexFor('.planning-absence-bar');
    const movePreview = zIndexFor('.planning-move-preview');

    expect(rowLabel).toBeGreaterThan(absence);
    expect(rowLabel).toBeGreaterThan(movePreview);
    expect(header).toBeGreaterThan(rowLabel);
    expect(corner).toBeGreaterThan(header);
  });
});
