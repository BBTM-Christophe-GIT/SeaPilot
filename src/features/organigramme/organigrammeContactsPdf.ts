import type { OrgPerson } from './organigrammeModel';
import { groupOrgContacts, type OrgContactDocument } from './organigrammeContacts';

export interface OrgContactsSheet { kind: OrgContactDocument; people: OrgPerson[] }

export async function buildOrgContactsPdf(documents: OrgContactsSheet[], asOf: string, logoBytes?: Uint8Array): Promise<Blob> {
  if (!documents.length || documents.some((document) => !document.people.length)) throw new Error('Sélectionnez au moins une personne pour chaque liste à exporter.');
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  if (!logoBytes) {
    const response = await fetch('/bbtm-report-logo.png');
    if (!response.ok) throw new Error('Impossible de charger le logo BBTM.');
    logoBytes = new Uint8Array(await response.arrayBuffer());
  }
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: documents.length > 1 ? 'BBTM - Personnel et numéros d’urgence' : documents[0].kind === 'personnel' ? 'BBTM - Liste du personnel' : 'BBTM - Numéros d’urgence', subject: `Situation au ${asOf}`, creator: 'SeaPilot' });
  const navy: [number, number, number] = [18, 54, 75];
  const logo = pdf.getImageProperties(logoBytes);
  const logoScale = Math.min(22 / logo.width, 16 / logo.height);
  documents.forEach((document, index) => {
    // A separate sheet is mandatory even if the preceding list leaves space on its last page.
    if (index) pdf.addPage();
    const people = groupOrgContacts(document.people).flatMap((group) => group.people);
    const title = document.kind === 'personnel' ? 'Liste du personnel' : 'Numéros d’urgence';
    autoTable(pdf, {
      startY: 43, margin: { top: 43, left: 12, right: 12, bottom: 18 },
      head: [['Fonction', 'Nom / prénom', 'Email', 'Téléphone']],
      body: people.map((person) => [person.functionLabel, person.name, person.email || 'Non renseigné', person.phone || 'Non renseigné']),
      theme: 'grid', rowPageBreak: 'avoid', showHead: 'everyPage',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.5, textColor: navy, lineColor: [215, 227, 232], lineWidth: 0.15, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [243, 248, 249] },
      columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 43 }, 2: { cellWidth: 68 }, 3: { cellWidth: 37, fontStyle: document.kind === 'emergency' ? 'bold' : 'normal' } },
      didDrawPage: () => {
        pdf.setFillColor(...navy); pdf.rect(0, 0, 210, 3, 'F');
        pdf.addImage(logoBytes!, 'PNG', 12, 8, logo.width * logoScale, logo.height * logoScale);
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(17); pdf.setTextColor(...navy); pdf.text(title, 41, 17);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
        pdf.text(`BBTM · Situation au ${asOf.split('-').reverse().join('/')}`, 41, 24);
        pdf.setFontSize(8); pdf.text(`${people.length} personne(s) · Classement par fonction`, 12, 34);
        pdf.setDrawColor(27, 136, 140); pdf.line(12, 38, 198, 38);
      },
    });
  });
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page); pdf.setDrawColor(204, 220, 227); pdf.line(12, 283, 198, 283);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(82, 105, 120);
    pdf.text('SeaPilot · Coordonnées issues des fiches RH / Brevets', 12, 289);
    pdf.text(`${page} / ${pdf.getNumberOfPages()}`, 198, 289, { align: 'right' });
  }
  return pdf.output('blob');
}
