import { CHECK_KEYS, CONDITION_LABELS, INSPECTOR, formatLiftingDate, type InspectionEntry, type LiftingInspection } from './liftingModel';

export function liftingReportFilename(report: LiftingInspection, draft = false): string {
  return `${report.vessel_snapshot.acronym || report.vessel_snapshot.name} - ${report.kind === 'towing' ? 'Registre des remorques' : 'Registre des Apparaux de Levage'} - ${report.inspection_year}${draft ? ' - BROUILLON' : ''}.pdf`;
}
export async function buildLiftingPdf(report: LiftingInspection, entries: InspectionEntry[], stamp?: Uint8Array) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdf = new jsPDF({ format: 'a4', orientation: 'landscape', unit: 'mm', compress: true });
  const draft = !stamp;
  const navy: [number, number, number] = [19, 51, 66];
  const title = report.kind === 'towing' ? 'REGISTRE DE SUIVI DES REMORQUES' : 'REGISTRE DES APPARAUX DE LEVAGE';
  const subtitle = report.kind === 'towing' ? 'Register of Towing Lines' : 'Register of Lifting Appliances';
  const vessel = report.vessel_snapshot;
  const clean = (s: string | null | undefined) => (s || '').replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/\u00a0/g, ' ');
  const good = entries.filter((entry) => entry.condition === 'good').length;
  const pending = entries.filter((entry) => entry.condition === 'pending').length;
  const bad = entries.length - good - pending;
  pdf.setFontSize(10); pdf.setTextColor(...navy);
  autoTable(pdf, {
    startY: 35, margin: { left: 14, right: 14 }, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.8 },
    body: [
      ['Navire / Ship', clean(vessel.name), 'Immatriculation / Official number', clean(vessel.registration_number)],
      ['Signal distinctif / Call sign', clean(vessel.call_sign), 'Port / Port of registry', clean(vessel.registration_port)],
      ['Armateur / Owner', 'BENJAMIN BON TRAVAUX MARITIMES', 'Vérificateur / Inspector', INSPECTOR],
      ['Émission / Issued on', formatLiftingDate(report.issued_on), 'Échéance / Valid until', formatLiftingDate(report.expires_on)],
    ], columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } },
  });
  const lastY = () => (pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 35;
  const values = { ok: 'OK', defect: 'DEF', na: 'S/O', pending: '-' };
  autoTable(pdf, {
    startY: lastY() + 7, margin: { top: 32, left: 14, right: 14, bottom: 18 },
    theme: 'grid', styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', textColor: navy },
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 248, 249] },
    head: [['Matériel / Item', 'ID', 'Description', 'CMU (T)\nSWL', ...CHECK_KEYS, 'Décision et observations / Action']],
    body: entries.map((entry) => [
      clean(entry.item_snapshot.material_type), clean(entry.item_snapshot.reference),
      clean(entry.item_snapshot.description) + (entry.item_snapshot.serial_number ? `\nN° ${clean(entry.item_snapshot.serial_number)}` : ''),
      entry.item_snapshot.swl_tonnes === null ? 'Non renseignée' : String(entry.item_snapshot.swl_tonnes).replace('.', ','),
      ...CHECK_KEYS.map((key) => values[entry.checks[key]] || '-'),
      `${CONDITION_LABELS[entry.condition]}${entry.observations ? `\n${clean(entry.observations)}` : ''}`,
    ]),
    columnStyles: { 0: { cellWidth: 23 }, 1: { cellWidth: 12 }, 2: { cellWidth: 66 }, 3: { cellWidth: 19 },
      4: { cellWidth: 10 }, 5: { cellWidth: 10 }, 6: { cellWidth: 10 }, 7: { cellWidth: 10 }, 8: { cellWidth: 10 }, 9: { cellWidth: 10 }, 10: { cellWidth: 10 } },
    rowPageBreak: 'avoid',
  });
  let y = lastY() + 7;
  if (y > 146) { pdf.addPage(); y = 36; }
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...navy);
  pdf.text('OK : satisfaisant | DEF : défaut | S/O : sans objet | - : non contrôlé. EG, NID, V1 à V5 : repères du registre source.', 14, y);
  y += 7;
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
  pdf.text(`${entries.length} matériels inscrits - ${good} maintenus en service - ${bad} avec réserve, retrait ou non présentés${pending ? ` - ${pending} à contrôler` : ''}.`, 14, y);
  y += 7; pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
  pdf.text('Les réparations et retraits mentionnés doivent être traités avant toute remise en service des matériels concernés.', 14, y);
  y += 10;
  pdf.text(`Examen réalisé par : ${INSPECTOR}`, 14, y);
  pdf.text(`Date : ${formatLiftingDate(report.issued_on)}`, 14, y + 7);
  if (stamp) pdf.addImage(stamp, 'PNG', 218, y - 3, 57, 32);
  else pdf.text('BROUILLON - non signé - ne vaut pas rapport finalisé', 14, y + 16);
  for (let page = 1; page <= pdf.getNumberOfPages(); page += 1) {
    pdf.setPage(page); pdf.setTextColor(...navy); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16);
    pdf.text(title, 14, 15); pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.text(subtitle, 14, 21);
    pdf.text(`${clean(vessel.name)} / ${report.inspection_year}${draft ? ' / BROUILLON' : ''}`, 283, 26, { align: 'right' });
    pdf.setDrawColor(195, 208, 214); pdf.line(14, 29, 283, 29); pdf.line(14, 196, 283, 196);
    pdf.setFontSize(8); pdf.text(`BBTM | Rapport LEV-${report.id} | Révision ${report.revision} | ${formatLiftingDate(report.issued_on)}`, 14, 202);
    pdf.text(`${page} / ${pdf.getNumberOfPages()}`, 283, 202, { align: 'right' });
  }
  return { blob: pdf.output('blob'), filename: liftingReportFilename(report, draft) };
}
export function saveLiftingBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
