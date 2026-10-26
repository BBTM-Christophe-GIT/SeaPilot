import type { SeaOperationPayload, SeaOperationWaypoint } from './seaOperationModel';
import { formatSeaLatitude, formatSeaLongitude, formatSeaPosition } from './seaOperationCoordinates';
import { effectiveSeaOperationUkc, seaOperationUkcReference, waypointUkcSnapshot } from './seaOperationWaypointSnapshots';

const metres = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const distance = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const utcDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' });
const utc = (time: string) => `${utcDate.format(new Date(time))} UTC`;
const uncertaintyLabels = {
  bathymetryVertical: 'profondeur', waterLevel: 'niveau d’eau', draft: 'tirant d’eau',
  positionEffect: 'position dans la maille', temporalInterpolation: 'interpolation temporelle',
} as const;

/** Read only the recorded capture matching every input; never fetch data during presentation. */
export function seaOperationUkcPresentation(payload: SeaOperationPayload | undefined, point: SeaOperationWaypoint) {
  const automatic = point.ukcMode === 'automatic';
  const rawValue = payload ? effectiveSeaOperationUkc(payload, point) : automatic ? '' : point.ukc;
  const capture = automatic && payload ? waypointUkcSnapshot(point, seaOperationUkcReference(payload)) : undefined;
  const available = capture?.status === 'available' && capture.estimate && capture.source && capture.cell && capture.waterLevel;
  const formatted = available ? `${metres.format(capture.estimate!.ukcMeters)} m` : rawValue;
  const caption = !automatic ? '' : available ? 'Estimation statique indicative · incertitude totale non quantifiée.' : 'UKC automatique indisponible pour cette position et cette ETA.';
  const details: string[] = [];
  if (available) {
    const { source, cell, waterLevel, estimate } = capture;
    details.push(
      `UKC statique indicative : ${metres.format(estimate!.ukcMeters)} m à l’ETA du ${utc(capture.etaUtc)}.`,
      `Calcul : profondeur ${metres.format(cell!.depthMeters)} m + niveau d’eau ${metres.format(estimate!.waterLevelMeters)} m − tirant d’eau du navire conservé ${metres.format(capture.draftMeters)} m.`,
      `Copernicus Marine Service ${source!.model} · produit ${source!.productId} · version ${source!.datasetVersion}. Profondeur et niveau d’eau partagent le géoïde du modèle ; aucun zéro LAT n’est appliqué.`,
      `Maille de ${distance.format(cell!.resolutionMeters)} m, centre ${formatSeaPosition(cell!)}. Limites : ${formatSeaLatitude(cell!.bounds.south)} à ${formatSeaLatitude(cell!.bounds.north)} ; ${formatSeaLongitude(cell!.bounds.west)} à ${formatSeaLongitude(cell!.bounds.east)}.`,
      `Niveaux encadrant l’ETA : ${metres.format(waterLevel!.heightBeforeMeters)} m le ${utc(waterLevel!.timeBeforeUtc)} ; ${metres.format(waterLevel!.heightAfterMeters)} m le ${utc(waterLevel!.timeAfterUtc)}.`,
      `Jeux de données : profondeur ${source!.bathymetryDatasetId} ; niveau d’eau ${source!.seaLevelDatasetId}.`,
      `Données consultées le ${utc(capture.fetchedAt)}. ${source!.referenceTimeUtc ? `Réseau du modèle : ${utc(source!.referenceTimeUtc)}.` : 'Heure du réseau du modèle non fournie par la source.'}`,
      `Incertitude totale non quantifiée : composantes non documentées pour ${estimate!.uncertainty.missingComponents.map(id => uncertaintyLabels[id]).join(', ')}. Aucun intervalle de confiance n’est attribué.`,
      'Squat, mouvements du navire et autres corrections dynamiques non appliqués. Comparaison indicative, sans décision GO automatique.',
      'Generated using E.U. Copernicus Marine Service Information.',
    );
    if (estimate!.cellVariability) details.push(`Dispersion locale des profondeurs : UKC entre ${metres.format(estimate!.cellVariability.lowerMeters)} et ${metres.format(estimate!.cellVariability.upperMeters)} m. Cette dispersion n’est pas une incertitude de mesure.`);
  } else if (automatic) details.push(capture?.message || caption);
  const sourceUrls = available ? [capture.source!.sourceUrl, `https://doi.org/${capture.source!.model === 'NWS' ? '10.48670/moi-00054' : '10.48670/moi-00027'}`] : [];
  return { rawValue, automatic, approximate: Boolean(available), displayValue: available ? `≈ ${formatted}` : rawValue,
    pdfValue: available ? `~ ${formatted}` : rawValue, caption, details,
    sourceFootnote: [...details, ...sourceUrls].join('\n'), sourceUrls, capture };
}
