import { describe, expect, it } from 'vitest';
import { disciplinaryWordBody } from './disciplinaryWordBody';

describe('Word rich text compatibility', () => {
  it('keeps legacy plain letters, angle brackets and line breaks readable', () => {
    const body = disciplinaryWordBody('Premier paragraphe & <exemple>.\nDeuxième ligne.\n\nDernier paragraphe.');
    expect(body.xml).toContain('&amp; &lt;exemple&gt;');
    expect(body.xml).toContain('<w:br/>');
    expect(body.xml.match(/<w:p>/g)).toHaveLength(2);
    expect(body.numbering).toBe('');
  });
  it('retains formatting across nested paragraphs and strips executable links', () => {
    const body = disciplinaryWordBody('<div style="text-align:right;font-family:Arial"><p><b>Premier</b></p><p><em>Deuxième</em></p><blockquote>Citation</blockquote><a href="javascript:alert(1)">Libellé</a></div>');
    expect(body.xml.match(/<w:p>/g)).toHaveLength(4);
    expect(body.xml).toContain('w:ascii="Arial"'); expect(body.xml).toContain('w:val="right"');
    expect(body.xml).toContain('<w:b/>'); expect(body.xml).toContain('<w:i/>'); expect(body.xml).toContain('<w:ind w:left="360"/>');
    expect(body.relationships).toBe(''); expect(body.xml).not.toContain('javascript:');
  });
});
