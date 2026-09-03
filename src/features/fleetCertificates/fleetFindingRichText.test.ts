import { describe, expect, it } from 'vitest';
import {
  fleetFindingActionToPlainText,
  fleetFindingActionToRichTextBlocks,
  sanitizeFleetFindingActionHtml,
} from './fleetFindingRichText';

describe('fleet finding corrective action rich text', () => {
  it('sanitizes unsafe markup and keeps supported formatting', () => {
    const value = sanitizeFleetFindingActionHtml('<p style="text-align:center;color:red"><strong>Réparer</strong><script>alert(1)</script></p><a href="javascript:alert(1)">Lien</a>');

    expect(value).toContain('<p style="text-align: center;"><strong>Réparer</strong></p>');
    expect(value).not.toContain('script');
    expect(value).not.toContain('javascript:');
  });

  it('converts headings, emphasis and lists into PDF-ready blocks', () => {
    const blocks = fleetFindingActionToRichTextBlocks('<h2>Plan</h2><p><strong>Remplacer</strong> puis <em>contrôler</em>.</p><ol><li>Préparer</li><li>Valider</li></ol>');

    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'list', 'list']);
    expect(blocks[1].runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'Remplacer', bold: true }),
      expect.objectContaining({ text: 'contrôler', italic: true }),
    ]));
    expect(fleetFindingActionToPlainText('<p>Première ligne</p><p>Deuxième ligne</p>')).toBe('Première ligne\nDeuxième ligne');
  });
});
