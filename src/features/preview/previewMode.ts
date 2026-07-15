const SEAPILOT_VERCEL_PREVIEW_HOST = /^sea-pilot-[a-z0-9-]+-bbtm-app\.vercel\.app$/i;

export function isSeaPilotPreviewHostname(hostname: string): boolean {
  return SEAPILOT_VERCEL_PREVIEW_HOST.test(hostname.trim());
}

export function isSeaPilotLocalPreview(hostname: string, search: string): boolean {
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(hostname.trim().toLowerCase());
  return localHost && new URLSearchParams(search).get('preview') === '1';
}

export function isSeaPilotPreviewDeployment(): boolean {
  return typeof window !== 'undefined'
    && (isSeaPilotPreviewHostname(window.location.hostname)
      || isSeaPilotLocalPreview(window.location.hostname, window.location.search));
}
