import { describe, expect, it } from 'vitest';
import { isSeaPilotPreviewHostname } from './previewMode';

describe('SeaPilot preview mode', () => {
  it('recognizes Vercel preview hosts owned by the BBTM app team', () => {
    expect(isSeaPilotPreviewHostname('sea-pilot-e8fmpzh4d-bbtm-app.vercel.app')).toBe(true);
    expect(isSeaPilotPreviewHostname('sea-pilot-git-planning-bbtm-app.vercel.app')).toBe(true);
  });

  it('never enables the bypass on production or unrelated hosts', () => {
    expect(isSeaPilotPreviewHostname('sea-pilot-ten.vercel.app')).toBe(false);
    expect(isSeaPilotPreviewHostname('sea-pilot.example.com')).toBe(false);
    expect(isSeaPilotPreviewHostname('malicious-bbtm-app.vercel.app')).toBe(false);
  });
});
