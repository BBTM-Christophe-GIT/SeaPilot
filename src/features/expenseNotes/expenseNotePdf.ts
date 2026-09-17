import { FUEL_LABELS, type ExpenseNote } from './expenseNoteModel';

async function receiptImage(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Conversion du justificatif indisponible.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Image illisible.')), 'image/jpeg', 0.8));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { bitmap.close(); }
}

export async function generateExpenseNotePdf(note: ExpenseNote, files: File[]): Promise<Blob> {
  const [{ jsPDF }, { autoTable }, { PDFDocument }] = await Promise.all([import('jspdf'), import('jspdf-autotable'), import('pdf-lib')]);
  const summary = new jsPDF();
  const money = (value: number) => `${Number(value).toFixed(2).replace('.', ',')} EUR`;
  summary.setFillColor(12, 38, 61);
  summary.rect(0, 0, 210, 34, 'F');
  summary.setTextColor(255, 255, 255);
  summary.setFontSize(19);
  summary.text('SeaPilot | Notes de frais', 14, 15);
  summary.setFontSize(10);
  summary.text(`${note.kind === 'mileage' ? 'Indemnités kilométriques' : 'Dépense'} - ${note.expense_on}`, 14, 25);
  autoTable(summary, {
    startY: 42, theme: 'striped', styles: { fontSize: 10, cellPadding: 3, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold' } },
    body: [
      ['Référence', note.id], ['Émetteur', note.issuer_name], ['Saisi par', note.creator_name], ['Navire', note.vessel_name],
      ['Objet', note.title], ['Mode de paiement', note.payment_method], ['Montant', money(note.amount)],
      ['Description', note.description || 'Sans commentaire'], ['Justificatifs', String(note.receipt_count)],
    ],
  });
  if (note.mileage) {
    const details = note.mileage;
    summary.addPage();
    summary.setTextColor(12, 38, 61);
    summary.setFontSize(16);
    summary.text('Détail des déplacements', 14, 18);
    autoTable(summary, { startY: 26, theme: 'striped', styles: { fontSize: 10 }, body: [
      ['Demandeur', note.issuer_name], ['Fonction', details.function], ['Date ou période', details.period],
      ['Véhicule', details.vehicle], ['Puissance fiscale', details.fiscalPower], ['Carburant', FUEL_LABELS[details.fuel]],
    ] });
    autoTable(summary, {
      head: [['Date', 'Trajet', 'Motif', 'Km', 'Taux', 'Montant']],
      body: details.trips.map((trip) => [trip.date, trip.route, trip.reason, trip.km, details.fuel === 'electric' ? 'Manuel' : '0,606', money(trip.amount)]),
      foot: [
        ['', '', '', '', 'Sous-total', money(Number(note.amount) - details.tolls)],
        ['', '', '', '', 'Péages', money(details.tolls)], ['', '', '', '', 'Total', money(note.amount)],
      ],
      theme: 'grid', styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [23, 103, 127] }, footStyles: { fillColor: [23, 103, 127] },
    });
  }
  const merged = await PDFDocument.create();
  for (const file of files) {
    try {
      if (file.type === 'application/pdf') {
        const receipt = await PDFDocument.load(await file.arrayBuffer());
        for (const page of await merged.copyPages(receipt, receipt.getPageIndices())) merged.addPage(page);
      } else {
        const embedded = await merged.embedJpg(await receiptImage(file));
        const page = merged.addPage([595.28, 841.89]);
        const ratio = Math.min(555.28 / embedded.width, 801.89 / embedded.height);
        const width = embedded.width * ratio;
        const height = embedded.height * ratio;
        page.drawImage(embedded, { x: (595.28 - width) / 2, y: (841.89 - height) / 2, width, height });
      }
    } catch { throw new Error(`${file.name} ne peut pas être intégré au PDF. Vérifiez que le fichier est lisible et sans mot de passe.`); }
  }
  const summaryDoc = await PDFDocument.load(summary.output('arraybuffer'));
  for (const page of await merged.copyPages(summaryDoc, summaryDoc.getPageIndices())) merged.addPage(page);
  merged.setTitle(`${note.kind === 'mileage' ? 'Indemnités kilométriques' : 'Dépense'} - ${note.issuer_name}`);
  merged.setAuthor(note.issuer_name);
  const bytes = await merged.save();
  if (bytes.length > 4_000_000) throw new Error('Le PDF dépasse la limite d’envoi de 4 Mo. Réduisez le nombre ou la taille des justificatifs.');
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}
