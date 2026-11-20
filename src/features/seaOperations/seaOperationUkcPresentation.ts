import type { SeaOperationPayload, SeaOperationWaypoint } from './seaOperationModel';
import { formatSeaLatitude, formatSeaLongitude, formatSeaPosition } from './seaOperationCoordinates';
import { seaDistanceToRouteNm, seaWaypointPosition } from './seaOperationNavigation';
import { effectiveSeaOperationUkc, seaOperationUkcFallback, seaOperationUkcReference, seaOperationUkcThreshold, storedSeaOperationUkcThreshold, waypointUkcSnapshot } from './seaOperationWaypointSnapshots';
import { isVesselDraftMeters } from './seaOperationUkc';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';

const metres = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const draught = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 20 });
const distance = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const utcDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' });
const utc = (time: string) => `${utcDate.format(new Date(time))} UTC`;
const uncertaintyLabels = {
  bathymetryVertical: 'profondeur', waterLevel: 'niveau d’eau', draft: 'tirant d’eau',
  positionEffect: 'position dans la maille', temporalInterpolation: 'interpolation temporelle',
} as const;
const unavailableLabel = 'UKC indisponible';

export function seaOperationUkcPrerequisite(payload: SeaOperationPayload | undefined, point: SeaOperationWaypoint): string | undefined {
  if (!seaWaypointPosition(point)) return 'Coordonnées du waypoint absentes ou invalides.';
  try { seaOperationEtaUtc(point.eta); } catch (error) { return (error as Error).message; }
  if (!payload) return undefined;
  if (!isVesselDraftMeters(payload.vessel.draftMeters)) return 'Renseignez le tirant d’eau dans Navires.';
  if (!payload.planning?.projectId && !payload.transit) return 'Sélectionnez un projet du planning ou renseignez le Transit.';
  return undefined;
}

/** Read only the recorded capture matching every input; never fetch data during presentation. */
export function seaOperationUkcPresentation(payload: SeaOperationPayload | undefined, point: SeaOperationWaypoint, showDraftThreshold = false) {
  const automatic = point.ukcMode === 'automatic';
  const reference = payload ? seaOperationUkcReference(payload) : undefined;
  const rawValue = payload ? effectiveSeaOperationUkc(payload, point) : automatic ? '' : point.ukc;
  const capture = reference ? waypointUkcSnapshot(point, reference) : undefined;
  const thresholdMeters = reference ? (showDraftThreshold ? seaOperationUkcThreshold : storedSeaOperationUkcThreshold)(point, reference) : undefined;
  const threshold = thresholdMeters !== undefined;
  const fallbackMeters = reference && !showDraftThreshold ? seaOperationUkcFallback(point, reference) : undefined;
  const fallback = fallbackMeters !== undefined;
  const { source, cell, waterLevel, estimate } = capture ?? {};
  const available = capture?.status === 'available' && estimate && source && cell && waterLevel;
  let formatted = rawValue;
  if (available) formatted = `${metres.format(estimate!.ukcMeters)} m`;
  else if (threshold && isVesselDraftMeters(reference?.draftMeters)) formatted = `UKC > ${draught.format(reference.draftMeters)} + 3 m`;
  else if (fallback) formatted = `${metres.format(fallbackMeters)} m`;
  const unavailableReason = capture?.status === 'unavailable' ? capture.message
    : seaOperationUkcPrerequisite(payload, point) ?? 'Aucune estimation enregistrée pour cette position et cette ETA.';
  const caption = !automatic ? '' : available ? 'Indicative · Incertitude non quantifiée' : `${unavailableLabel} · ${unavailableReason}`;
  const details: string[] = [];
  if (available && capture) {
    details.push(
      `UKC statique indicative : ${metres.format(estimate!.ukcMeters)} m à l’ETA du ${utc(capture.etaUtc)}.`,
      `Calcul : profondeur ${metres.format(cell!.depthMeters)} m + niveau d’eau ${metres.format(estimate!.waterLevelMeters)} m − tirant d’eau du navire conservé ${metres.format(capture.draftMeters)} m.`,
    );
  } else if (automatic) {
    details.push(caption);
    if (threshold) details.push(`Seuil théorique à vérifier : ${formatted} (tirant d’eau du navire + 3 m). Le Capitaine vérifie l’UKC à partir des données nautiques officielles.`);
    else if (fallback) details.push(`Profondeur théorique de repli de ${formatted} (tirant d’eau du navire + 5 m), réservée à la validation de la fiche.`);
  }
  if (source) {
    details.push(`Copernicus Marine Service ${source.model} · produit ${source.productId} · version ${source.datasetVersion}.`,
      `Jeux de données de profondeur ${source.bathymetryDatasetId} et de niveau d’eau ${source.seaLevelDatasetId}.`);
    if (available) details.push('Référentiel vertical commun de la profondeur et du niveau d’eau : géoïde du modèle.');
    details.push(source.referenceTimeUtc ? `Cycle du modèle du ${utc(source.referenceTimeUtc)}.` : 'Heure du réseau du modèle non fournie par la source.');
  }
  const cellPosition = cell ?? capture?.cellPosition;
  if (cellPosition && capture) {
    const distanceMeters = seaDistanceToRouteNm(cellPosition, [capture]) * 1852;
    details.push(`${cell ? `Maille de ${distance.format(cell.resolutionMeters)} m` : 'Maille examinée'}, centre ${formatSeaPosition(cellPosition)}, à ${distance.format(distanceMeters)} m du waypoint.`);
    if (cell) details.push(`Limites de la maille de ${formatSeaLatitude(cell.bounds.south)} à ${formatSeaLatitude(cell.bounds.north)} et de ${formatSeaLongitude(cell.bounds.west)} à ${formatSeaLongitude(cell.bounds.east)}.`);
  }
  if (waterLevel) details.push(`Niveaux d’eau du modèle : ${metres.format(waterLevel.heightBeforeMeters)} m le ${utc(waterLevel.timeBeforeUtc)} et ${metres.format(waterLevel.heightAfterMeters)} m le ${utc(waterLevel.timeAfterUtc)}.`);
  if (capture) details.push(`Données consultées le ${utc(capture.fetchedAt)}.`);
  if (available && estimate) {
    details.push(`Incertitude non quantifiée. Composantes non documentées pour ${estimate.uncertainty.missingComponents.map(id => uncertaintyLabels[id]).join(', ')}.`,
      'Estimation statique sans correction de squat ou de mouvement du navire.');
    if (estimate.cellVariability) details.push(`Dispersion locale des profondeurs : UKC entre ${metres.format(estimate.cellVariability.lowerMeters)} et ${metres.format(estimate.cellVariability.upperMeters)} m.`);
  }
  if (source && (cell || waterLevel)) details.push('Generated using E.U. Copernicus Marine Service Information.');
  const sourceUrls = source ? [source.sourceUrl, `https://doi.org/${source.model === 'NWS' ? '10.48670/moi-00054' : '10.48670/moi-00027'}`] : [];
  const label = available ? 'Indicative' : threshold ? 'Seuil théorique à vérifier' : fallback ? 'Profondeur de repli' : 'Automatique';
  return { rawValue, automatic, approximate: Boolean(available), fallback, threshold, label,
    displayValue: available ? `≈ ${formatted}` : formatted, pdfValue: available ? `~ ${formatted}` : formatted, caption, details,
    sourceFootnote: [...details, ...sourceUrls].join('\n'), sourceUrls, capture };
}
