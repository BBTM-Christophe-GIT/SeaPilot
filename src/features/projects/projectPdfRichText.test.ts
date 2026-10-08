import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PROJECT_PDF_FALLBACK_FONT_FAMILY,
  resolveProjectPdfFontFamily,
} from './projectPdfRichText';

describe('project PDF rich text fonts', () => {
  const originalFonts = document.fonts;

  afterEach(() => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: originalFonts,
    });
    vi.restoreAllMocks();
  });

  it('falls back to system fonts when Firefox reports a network error for missing Aptos', async () => {
    const load = vi.fn().mockRejectedValue(new DOMException('A network error occurred.', 'NetworkError'));
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load },
    });

    await expect(resolveProjectPdfFontFamily()).resolves.toBe(PROJECT_PDF_FALLBACK_FONT_FAMILY);
    expect(load).toHaveBeenCalledWith('400 16px Aptos');
    expect(load).toHaveBeenCalledWith('700 16px Aptos');
  });
});
