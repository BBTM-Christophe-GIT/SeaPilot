const SEAPILOT_VERCEL_PREVIEW_HOST = /^sea-pilot-[a-z0-9-]+-bbtm-app\.vercel\.app$/i;

export function isSeaPilotPreviewHostname(hostname: string): boolean {
  return SEAPILOT_VERCEL_PREVIEW_HOST.test(hostname.trim());
}

export function isSeaPilotPreviewDeployment(): boolean {
  return typeof window !== 'undefined' && isSeaPilotPreviewHostname(window.location.hostname);
}
