import { describe, expect, it } from 'vitest';
import {
  sanitizeServiceNoteHtml, serviceNoteBodyHasContent, serviceNoteBodyToPlainText, serviceNoteBodyToRichTextBlocks,
} from './serviceNoteRichText';

describe('service note rich text', () => {
  it('keeps supported formatting and removes executable or unsupported content', () => {
    const html = sanitizeServiceNoteHtml('<h2 onclick="alert(1)">Titre</h2><p style="text-align:center;color:red;font-family:Aptos"><strong>Important</strong> <a href="javascript:alert(1)">danger</a></p><script>alert(1)</script>');
    expect(html).toContain('<h2>Titre</h2>');
    expect(html).toContain('text-align: center');
    expect(html).toContain('font-family: Aptos');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('color: red');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<script');
  });

  it('keeps legacy plain text readable and detects visually empty HTML', () => {
    expect(serviceNoteBodyToPlainText('Bonjour\n\nBien cordialement,')).toBe('Bonjour\nBien cordialement,');
    expect(serviceNoteBodyHasContent('<p><br></p>')).toBe(false);
    expect(serviceNoteBodyHasContent('<p>Une consigne</p>')).toBe(true);
  });

  it('converts formatted content into PDF-ready semantic blocks and runs', () => {
    const blocks = serviceNoteBodyToRichTextBlocks('<h2>Titre</h2><p style="text-align:right"><strong>Texte</strong> <em>important</em></p><ol><li>Étape</li></ol>');
    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'list']);
    expect(blocks[1].align).toBe('right');
    expect(blocks[1].runs.some((run) => run.bold && run.text === 'Texte')).toBe(true);
    expect(blocks[1].runs.some((run) => run.italic && run.text === 'important')).toBe(true);
    expect(blocks[2].runs[0].text).toBe('1. ');
  });
});
