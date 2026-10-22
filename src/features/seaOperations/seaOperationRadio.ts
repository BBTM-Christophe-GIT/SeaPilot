import type { SeaOperationWaypoint } from './seaOperationModel';
import { seaDistanceToRouteNm, seaWaypointPosition, type SeaPosition } from './seaOperationNavigation';

export interface SeaRadioContact {
  id: string;
  name: string;
  kind: 'rescue' | 'port';
  area: string;
  vhf: string;
  phone?: string;
  mmsi?: string;
  source: string;
  sourceLabel: string;
  /** Rounded geographic reference, for directory proximity only; never an SAR or VTS boundary. */
  position: SeaPosition;
  proximityNm: number;
}

export const SEA_RADIO_VERIFIED_ON = '2026-10-22';
const frenchContacts = 'https://mer.gouv.fr/regles-de-securite-pour-les-loisirs-nautiques-en-mer';
const ukWest = 'https://assets.admiralty.co.uk/public/documents/2026-07/5602%202026%20July%20V1.0.pdf';
const ukEast = 'https://assets.admiralty.co.uk/public/documents/2026-10/5605%202026%20Aug%20V1.0.pdf';
const ukSolent = 'https://assets.admiralty.co.uk/public/documents/2024-02/5600.pdf';

/** Non-exhaustive preparation directory. Channels are sourced; location matching is explicitly approximate. */
export const SEA_RADIO_CONTACTS: readonly SeaRadioContact[] = [
  { id: 'cross-gris-nez', kind: 'rescue', name: 'CROSS Gris-Nez', area: 'Manche Est / mer du Nord', vhf: '16', phone: '+33 3 21 87 21 87', mmsi: '002275100', source: ukEast, sourceLabel: 'UKHO · août 2026', position: { latitude: 50.87, longitude: 1.58 }, proximityNm: 80 },
  { id: 'cross-jobourg', kind: 'rescue', name: 'CROSS Jobourg', area: 'Manche centrale', vhf: '16', phone: '+33 2 33 52 16 16', source: frenchContacts, sourceLabel: 'Ministère chargé de la Mer', position: { latitude: 49.69, longitude: -1.91 }, proximityNm: 80 },
  { id: 'cross-corsen', kind: 'rescue', name: 'CROSS Corsen', area: 'Manche Ouest / Iroise', vhf: '16', phone: '+33 2 98 89 31 31', source: frenchContacts, sourceLabel: 'Ministère chargé de la Mer', position: { latitude: 48.42, longitude: -4.78 }, proximityNm: 80 },
  { id: 'cross-etel', kind: 'rescue', name: 'CROSS Étel', area: 'Atlantique français', vhf: '16', phone: '+33 2 97 55 35 35', source: frenchContacts, sourceLabel: 'Ministère chargé de la Mer', position: { latitude: 47.65, longitude: -3.21 }, proximityNm: 80 },
  { id: 'falmouth', kind: 'rescue', name: 'HM Coastguard Falmouth', area: 'Sud-ouest de l’Angleterre', vhf: '16', phone: '+44 1326 317575', mmsi: '002320014', source: ukWest, sourceLabel: 'UKHO · juillet 2026', position: { latitude: 50.15, longitude: -5.05 }, proximityNm: 80 },
  { id: 'solent', kind: 'rescue', name: 'HM Coastguard · JRCC UK', area: 'Solent / sud de l’Angleterre', vhf: '16', phone: '+44 2392 552100', mmsi: '002320011', source: ukSolent, sourceLabel: 'UKHO · août 2026', position: { latitude: 50.86, longitude: -1.24 }, proximityNm: 80 },
  { id: 'dover', kind: 'rescue', name: 'HM Coastguard Dover', area: 'Pas de Calais / sud-est de l’Angleterre', vhf: '16', phone: '+44 1304 210008', mmsi: '002320010', source: ukEast, sourceLabel: 'UKHO · août 2026', position: { latitude: 51.14, longitude: 1.35 }, proximityNm: 80 },
  { id: 'plymouth-port', kind: 'port', name: 'Plymouth · Longroom Port Control', area: 'Dockyard Port of Plymouth', vhf: '14', phone: '+44 1752 663225', source: 'https://www.royalnavy.mod.uk/khm/plymouth/contact', sourceLabel: 'King’s Harbour Master', position: { latitude: 50.35, longitude: -4.15 }, proximityNm: 10 },
  { id: 'cherbourg-port', kind: 'port', name: 'Cherbourg · Capitainerie', area: 'Port de commerce et de pêche', vhf: '12', phone: '+33 2 33 20 41 25', source: 'https://portsdenormandie.fr/en/harbour-masters-office/cherbourg', sourceLabel: 'Ports de Normandie', position: { latitude: 49.65, longitude: -1.62 }, proximityNm: 10 },
  { id: 'dieppe-port', kind: 'port', name: 'Dieppe · Capitainerie', area: 'Port de commerce et de pêche', vhf: '12', phone: '+33 2 35 84 10 55', source: 'https://portsdenormandie.fr/fr/capitaineries/dieppe', sourceLabel: 'Ports de Normandie', position: { latitude: 49.93, longitude: 1.09 }, proximityNm: 10 },
  { id: 'brest-approaches', kind: 'port', name: 'Brest Approches · Vigie du Portzic', area: 'Accès à la rade de Brest', vhf: '08 / 16', phone: '+33 2 98 49 11 96', source: 'https://msi.pub.kubic.nga.mil/api/publications/download?key=16694491%2FSFH00000%2FPub143bk.pdf', sourceLabel: 'NGA · Sailing Directions 143', position: { latitude: 48.36, longitude: -4.53 }, proximityNm: 10 },
  { id: 'portsmouth-port', kind: 'port', name: 'Portsmouth · KHM', area: 'Portsmouth Harbour', vhf: '11', source: 'https://www.royalnavy.mod.uk/khm/portsmouth/safety-and-regulations/solent-pilotage-and-vts', sourceLabel: 'King’s Harbour Master', position: { latitude: 50.79, longitude: -1.11 }, proximityNm: 10 },
  { id: 'southampton-port', kind: 'port', name: 'Southampton VTS', area: 'Solent / Southampton Water', vhf: '12', source: 'https://www.royalnavy.mod.uk/khm/portsmouth/safety-and-regulations/solent-pilotage-and-vts', sourceLabel: 'King’s Harbour Master', position: { latitude: 50.87, longitude: -1.39 }, proximityNm: 10 },
  { id: 'lorient-port', kind: 'port', name: 'Lorient Port Control', area: 'Port de commerce / rade', vhf: '12', source: 'https://www.bretagne.bzh/app/uploads/5.-Reglement-particulier-de-police_port-de-LORIENT-avril-2025.pdf', sourceLabel: 'Région Bretagne · avril 2025', position: { latitude: 47.72, longitude: -3.36 }, proximityNm: 10 },
];

export function seaOperationRadioContacts(waypoints: readonly Pick<SeaOperationWaypoint, 'latitude' | 'longitude'>[]) {
  const positions = waypoints.map(seaWaypointPosition);
  return {
    validPoints: positions.filter(Boolean).length,
    invalidPoints: positions.filter((position) => !position).length,
    contacts: SEA_RADIO_CONTACTS.map((contact) => ({ ...contact, distanceNm: seaDistanceToRouteNm(contact.position, positions) }))
      .filter((contact) => contact.distanceNm <= contact.proximityNm)
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.distanceNm - b.distanceNm),
  };
}
