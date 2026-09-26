import { fleetIllustration } from '../fleet/fleetDisplay';
import type { OrgVessel } from './organigrammeModel';

const icons = new Map<string, Promise<string>>();
async function embedVesselIcon(source: string): Promise<string> {
  const response = await fetch(source);
  if (!response.ok) throw new Error('Illustration indisponible.');
  const url = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image indisponible.');
    const scale = Math.min(192 / image.naturalWidth, 128 / image.naturalHeight);
    context.drawImage(image, (192 - image.naturalWidth * scale) / 2, (128 - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
    return canvas.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

export async function loadOrgVesselIcons(vessels: OrgVessel[]): Promise<OrgVessel[]> {
  return Promise.all(vessels.map(async (vessel) => {
    const iconUrl = fleetIllustration(vessel, vessel.iconUrl);
    if (!iconUrl) return vessel;
    if (!icons.has(iconUrl)) icons.set(iconUrl, embedVesselIcon(iconUrl).catch(() => { icons.delete(iconUrl); return ''; }));
    return { ...vessel, iconUrl, iconDataUrl: await icons.get(iconUrl) };
  }));
}
