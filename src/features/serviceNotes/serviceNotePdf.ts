import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceNote, ServiceNoteSignatureSnapshot } from './serviceNoteQueries';
import { formatServiceNoteDate } from './serviceNoteQueries';

interface SignatureAsset {
  snapshot: ServiceNoteSignatureSnapshot;
  bytes: Uint8Array;
}
export interface ServiceNotePdfInput {
  note: ServiceNote;
  authorSignature: SignatureAsset | null;
  recipientSignatures: Map<number, SignatureAsset>;
}

export interface ServiceNoteGeneratedPdf {
  blob: Blob;
  filename: string;
}

function safeFilename(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/[^a-z0-9-]+/giu, '-').replace(/^-+|-+$/gu, '');
}

function snapshotFormat(snapshot: ServiceNoteSignatureSnapshot): 'PNG' | 'JPEG' {
  return snapshot.mimeType.toLowerCase().includes('jpeg') || snapshot.mimeType.toLowerCase().includes('jpg') ? 'JPEG' : 'PNG';
}

async function downloadSignature(client: SupabaseClient, snapshot: ServiceNoteSignatureSnapshot | null): Promise<SignatureAsset | null> {
  if (!snapshot) return null;
  const { data, error } = await client.storage.from(snapshot.storageBucket).download(snapshot.storagePath);
  if (error || !data) throw new Error(`Impossible de charger la signature figée de ${snapshot.signerName || 'ce signataire'}.`);
  return { snapshot, bytes: new Uint8Array(await data.arrayBuffer()) };
}

export async function prepareServiceNotePdf(client: SupabaseClient, note: ServiceNote): Promise<ServiceNotePdfInput> {
  const [authorSignature, ...signatures] = await Promise.all([
    downloadSignature(client, note.authorSignatureSnapshot),
    ...note.signatures.map((signature) => downloadSignature(client, signature.signatureSnapshot)),
  ]);
  const recipientSignatures = new Map<number, SignatureAsset>();
  note.signatures.forEach((signature, index) => {
    const asset = signatures[index];
    if (asset) recipientSignatures.set(signature.recipientId, asset);
  });
  return { note, authorSignature, recipientSignatures };
}

export async function buildServiceNotePdf(input: ServiceNotePdfInput): Promise<ServiceNoteGeneratedPdf> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const document = new jsPDF({ compress: true, format: 'a4', orientation: 'portrait', unit: 'mm' });
  const { note } = input;
  const navy: [number, number, number] = [8, 45, 70];
  const teal: [number, number, number] = [20, 137, 145];
  const pale: [number, number, number] = [238, 246, 247];
  const authorName = String(note.authorIdentitySnapshot.display_name || note.authorIdentitySnapshot.signer_name || 'Non renseigné');
  const audienceLabel = note.scope === 'vessels'
    ? note.targetVessels.map((vessel) => vessel.name).join(', ') || 'Navire(s) sélectionné(s)'
    : note.scope === 'people'
      ? `${note.targetPersonIds.length || note.recipients.length} personne${(note.targetPersonIds.length || note.recipients.length) > 1 ? 's' : ''}`
      : 'Tous les utilisateurs';

  const drawPageHeader = () => {
    document.setFillColor(...navy);
    document.rect(0, 0, 210, 9, 'F');
    document.setFont('helvetica', 'bold');
    document.setTextColor(...navy);
    document.setFontSize(19);
    document.text('Note de Service', 105, 23, { align: 'center' });
    document.setDrawColor(...teal);
    document.setLineWidth(0.8);
    document.line(18, 29, 192, 29);
  };

  drawPageHeader();
  autoTable(document, {
    startY: 36,
    margin: { left: 18, right: 18 },
    theme: 'grid',
    body: [
      ['Objet', note.subject],
      ['Numéro chrono', note.chronologyCode || (note.status === 'recalled' ? 'Retiré lors du rappel' : 'Automatique')],
      ['Prénom NOM', authorName],
      ['Date', formatServiceNoteDate(note.authoredOn)],
      ['Périmètre', audienceLabel],
    ],
    columnStyles: { 0: { cellWidth: 39, fontStyle: 'bold', fillColor: pale }, 1: { cellWidth: 135 } },
    styles: { font: 'helvetica', fontSize: 9, textColor: navy, lineColor: [177, 194, 202], cellPadding: 3 },
  });
  const metadataEnd = (document as typeof document & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 75;
  if (input.authorSignature) {
    document.setFontSize(7);
    document.setTextColor(84, 105, 116);
    document.text('Signature de l’émetteur', 145, metadataEnd + 6);
    document.addImage(input.authorSignature.bytes, snapshotFormat(input.authorSignature.snapshot), 144, metadataEnd + 8, 42, 16, undefined, 'FAST');
  }

  document.setFillColor(...pale);
  document.roundedRect(18, metadataEnd + 7, 116, 18, 2, 2, 'F');
  document.setFont('helvetica', 'bold');
  document.setFontSize(8.5);
  document.setTextColor(...navy);
  document.text(`Diffusion · ${audienceLabel}`, 22, metadataEnd + 13, { maxWidth: 106 });
  document.setFont('helvetica', 'normal');
  document.setFontSize(7.6);
  document.text('À lire et signer individuellement. Une seule note rassemble toutes les signatures.', 22, metadataEnd + 18, { maxWidth: 106 });

  let cursorY = metadataEnd + 33;
  document.setFont('helvetica', 'bold');
  document.setFontSize(9);
  document.text('Pièce(s) jointe(s) et référence(s)', 18, cursorY);
  cursorY += 5;
  document.setFont('helvetica', 'normal');
  document.setFontSize(8.4);
  const inventory = note.attachments.length ? note.attachments.map((item) => `• ${item.displayName}`) : ['Aucune pièce jointe'];
  inventory.forEach((line) => {
    const wrapped = document.splitTextToSize(line, 172) as string[];
    document.text(wrapped, 20, cursorY);
    cursorY += Math.max(4.4, wrapped.length * 4.2);
  });

  cursorY += 3;
  document.setFont('helvetica', 'bold');
  document.text('Message', 18, cursorY);
  cursorY += 6;
  document.setFont('helvetica', 'normal');
  document.setFontSize(9.2);
  const bodyLines = document.splitTextToSize(note.body || 'Aucun contenu.', 174) as string[];
  const pageOneLines = bodyLines.slice(0, 42);
  document.text(pageOneLines, 18, cursorY, { lineHeightFactor: 1.35 });
  if (bodyLines.length > pageOneLines.length) {
    document.setTextColor(...teal);
    document.setFontSize(7.5);
    document.text('Le message se poursuit sur la page suivante.', 18, 279);
  }
  document.setDrawColor(177, 194, 202);
  document.line(18, 287, 192, 287);
  document.setFontSize(6.5);
  document.setTextColor(105, 119, 126);
  document.text('Document généré par SeaPilot · registre de signatures partagé', 18, 292);

  document.addPage();
  drawPageHeader();
  if (bodyLines.length > pageOneLines.length) {
    document.setFont('helvetica', 'bold');
    document.setFontSize(9);
    document.text('Suite du message', 18, 37);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8.7);
    document.text(bodyLines.slice(pageOneLines.length), 18, 43, { lineHeightFactor: 1.3, maxWidth: 174 });
  }
  const signatureStartY = bodyLines.length > pageOneLines.length ? 92 : 38;
  document.setFont('helvetica', 'bold');
  document.setTextColor(...navy);
  document.setFontSize(11);
  document.text('Registre commun de lecture et de signature', 18, signatureStartY);
  const signatureByRecipient = new Map(note.signatures.map((signature) => [signature.recipientId, signature]));
  const recipients = note.recipients.length
    ? note.recipients
    : note.signatures.map((signature) => ({
        id: signature.recipientId, noteId: note.id, userId: signature.userId, personId: signature.personId,
        firstName: String(signature.identitySnapshot.first_name || ''), lastName: String(signature.identitySnapshot.last_name || ''),
        functionLabel: String(signature.identitySnapshot.function_label || ''),
      }));
  autoTable(document, {
    startY: signatureStartY + 5,
    margin: { left: 18, right: 18, bottom: 15 },
    head: [['Nom et Prénom', 'Date et signature']],
    body: recipients.map((recipient) => {
      const signature = signatureByRecipient.get(recipient.id);
      return [
        [`${recipient.firstName} ${recipient.lastName}`.trim() || 'Compte sans profil lié', recipient.functionLabel].filter(Boolean).join('\n'),
        signature ? (signature.signatureKind === 'historical_assumed' ? 'Signature historique validée' : `Signé le ${formatServiceNoteDate(signature.signedAt)}`) : 'Signature en attente',
      ];
    }),
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
    styles: { minCellHeight: 19, fontSize: 8.2, textColor: navy, lineColor: [177, 194, 202], cellPadding: 3, valign: 'middle' },
    columnStyles: { 0: { cellWidth: 83 }, 1: { cellWidth: 91 } },
    didDrawCell: (hook) => {
      if (hook.section !== 'body' || hook.column.index !== 1) return;
      const recipient = recipients[hook.row.index];
      const signature = recipient ? signatureByRecipient.get(recipient.id) : undefined;
      const asset = signature ? input.recipientSignatures.get(signature.recipientId) : undefined;
      if (!asset) return;
      document.addImage(asset.bytes, snapshotFormat(asset.snapshot), hook.cell.x + 42, hook.cell.y + 3, 39, 12, undefined, 'FAST');
    },
  });

  const filename = `${safeFilename(`${note.chronologyCode}-${note.subject}`) || 'note-de-service'}.pdf`;
  return { blob: document.output('blob'), filename };
}

export async function downloadServiceNotePdf(client: SupabaseClient, note: ServiceNote): Promise<void> {
  const generated = await buildServiceNotePdf(await prepareServiceNotePdf(client, note));
  const url = URL.createObjectURL(generated.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = generated.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
