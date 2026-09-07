import { describe, expect, it } from 'vitest';
import {
  projectDescriptionHasContent,
  projectDescriptionToPlainText,
  sanitizeProjectDescriptionHtml,
} from './projectDescription';

describe('projectDescription', () => {
  it('normalizes historical plain text into safe rich text', () => {
    expect(sanitizeProjectDescriptionHtml('Transit aller\nPuis opération')).toBe(
      '<p>Transit aller<br>Puis opération</p>',
    );
  });

  it('sanitizes rich content and exposes a plain-text fallback', () => {
    const description = sanitizeProjectDescriptionHtml(
      '<h2>Mission</h2><p onclick="alert(1)"><strong>Inspection</strong> en mer.</p><script>alert(1)</script>',
    );

    expect(description).toBe('<h2>Mission</h2><p><strong>Inspection</strong> en mer.</p>');
    expect(projectDescriptionToPlainText(description)).toBe('Mission\nInspection en mer.');
  });

  it('does not persist empty formatting markup', () => {
    expect(sanitizeProjectDescriptionHtml('<p><br></p>')).toBe('');
    expect(projectDescriptionHasContent('<p><br></p>')).toBe(false);
  });
});
