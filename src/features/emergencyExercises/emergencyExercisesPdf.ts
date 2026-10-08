import { EXERCISE_FOOTER, EXERCISE_MONTHS, exerciseFilename, type ExerciseReport } from './emergencyExercisesModel';

export async function buildExercisePdf(report: ExerciseReport, logo: Uint8Array, generatedAt = new Date()) {
  if (!report.person) throw new Error('Sélectionnez un marin pour exporter son carnet.');
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const filename = exerciseFilename(report.person.name, report.year);
  pdf.setProperties({ title: 'CARNET DES EXERCICES ET TBT', subject: `${report.person.name} - ${report.year}`, creator: 'SeaPilot - BBTM' });
  const header = () => {
    pdf.setFillColor(16, 43, 70); pdf.rect(0, 0, 210, 3, 'F');
    pdf.addImage(logo, 'PNG', 10, 9, 17, 17);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor(21, 96, 130);
    pdf.text('CARNET DES EXERCICES ET TBT', 32, 17);
    pdf.setTextColor(16, 43, 70); pdf.setFontSize(11);
    pdf.text(pdf.splitTextToSize(`${report.person!.name} - ${report.year}`, 166), 32, 24);
  };
  header();
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(84, 103, 124);
  pdf.text(`Rapport généré le ${generatedAt.toLocaleDateString('fr-FR')}. Total exercices (TBT inclus) : ${report.total}.`, 10, 36);
  pdf.text(`Périmètre : ${report.vessel?.name || 'Toute la flotte'} - DPR soumis et validés.`, 10, 41);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(16, 43, 70);
  pdf.text('Répartition mensuelle', 10, 53);
  const max = Math.max(1, ...report.months), base = 100, chartHeight = 34;
  pdf.setDrawColor(220, 228, 238); pdf.setLineWidth(0.2);
  for (let tick = 0; tick <= 4; tick++) pdf.line(10, base - tick * chartHeight / 4, 200, base - tick * chartHeight / 4);
  report.months.forEach((count, index) => {
    const x = 10 + index * 190 / 12 + 3, height = count / max * chartHeight;
    pdf.setFillColor(21, 96, 130);
    if (count) pdf.rect(x, base - height, 9, height, 'F');
    pdf.setFontSize(8); pdf.setTextColor(21, 96, 130); pdf.text(String(count), x + 4.5, base - height - 2, { align: 'center' });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(84, 103, 124);
    pdf.text(EXERCISE_MONTHS[index], x + 4.5, base + 6, { align: 'center' });
  });
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(16, 43, 70);
  pdf.text('Détail par type d’exercice', 10, 118);
  autoTable(pdf, {
    startY: 123, margin: { left: 10, right: 10, top: 36, bottom: 22 },
    head: [["Type d'exercice", ...EXERCISE_MONTHS, 'Total']],
    body: report.rows.map((row) => [row.name.replace(/[–—]/g, '-'), ...row.months.map((n) => n || ''), row.total]),
    styles: { font: 'helvetica', fontSize: 6.8, cellPadding: 1.8, halign: 'center', valign: 'middle', lineColor: [223, 230, 239], lineWidth: 0.1 },
    headStyles: { fillColor: [236, 242, 248], textColor: [16, 43, 70], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: { 0: { cellWidth: 52, halign: 'left', fontStyle: 'bold' }, 13: { cellWidth: 12, fontStyle: 'bold', fillColor: [236, 242, 248] } },
    rowPageBreak: 'avoid',
    didParseCell: (cell) => {
      if (cell.section === 'body' && report.rows[cell.row.index]?.priority) cell.cell.styles.fillColor = [255, 241, 242];
    },
    didDrawPage: (page) => { if (page.pageNumber > 1) header(); },
  });
  if (!report.rows.length) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(84, 103, 124);
    pdf.text('Aucun exercice ni TBT pour ce marin et cette année dans le périmètre sélectionné.', 10, 142);
  }
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page); pdf.setDrawColor(206, 222, 242); pdf.setLineWidth(0.2); pdf.line(10, 282, 200, 282);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5); pdf.setTextColor(92, 112, 141);
    pdf.text(EXERCISE_FOOTER, 10, 286);
  }
  return { blob: pdf.output('blob'), filename };
}
export async function downloadExercisePdf(report: ExerciseReport) {
  const response = await fetch('/bbtm-report-logo.png');
  if (!response.ok) throw new Error('Le logo du carnet est indisponible. Réessayez.');
  const output = await buildExercisePdf(report, new Uint8Array(await response.arrayBuffer()));
  const url = URL.createObjectURL(output.blob);
  const link = document.createElement('a'); link.href = url; link.download = output.filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
