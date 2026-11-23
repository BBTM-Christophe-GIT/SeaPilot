import type { SupabaseClient } from '@supabase/supabase-js';
import { buildFleetBrochurePdf, fleetBrochureFileName } from '../fleet/fleetBrochure';
import { fetchFleetVessel, resolveFleetVesselPhotoUrl } from '../fleet/fleetQueries';
import { generateProjectQuoteDocument, type GeneratedProjectDocument, type ProjectOfferDocumentInput } from './projectDocumentGeneration';
import { createProjectDocumentAccessUrl, projectAttachmentMimeType } from './projectDocumentStorage';
import type { ProjectOperationDocumentRecord } from './projectQueries';

interface ProjectQuoteExportInput {
  offer: ProjectOfferDocumentInput;
  brochureVessels: ReadonlyArray<{ id: number; name: string }>;
  annexFiles: readonly File[];
  annexDocuments: readonly ProjectOperationDocumentRecord[];
}

async function renderBrochure(
  client: SupabaseClient,
  selectedVessel: { id: number; name: string },
): Promise<GeneratedProjectDocument> {
  try {
    const vessel = await fetchFleetVessel(client, selectedVessel.id);
    if (!vessel) throw new Error('Navire indisponible.');
    const photoUrl = await resolveFleetVesselPhotoUrl(client, vessel);
    return {
      blob: await buildFleetBrochurePdf(vessel, photoUrl),
      fileName: fleetBrochureFileName(vessel.name),
      mimeType: 'application/pdf',
    };
  } catch (error) {
    throw new Error(`Impossible de préparer la brochure de ${selectedVessel.name}.`, { cause: error });
  }
}

async function downloadAnnex(client: SupabaseClient, annex: ProjectOperationDocumentRecord): Promise<GeneratedProjectDocument> {
  const url = await createProjectDocumentAccessUrl(client, annex);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Impossible de télécharger l’annexe ${annex.fileName}.`);
  const blob = await response.blob();
  return {
    blob,
    fileName: annex.fileName,
    mimeType: annex.mimeType || projectAttachmentMimeType(new File([], annex.fileName)),
  };
}

function uniqueAttachments(attachments: GeneratedProjectDocument[], offerFileName: string): GeneratedProjectDocument[] {
  const names = new Set([offerFileName.toLocaleLowerCase('fr-FR')]);
  return attachments.map((attachment) => {
    const originalName = attachment.fileName;
    let fileName = originalName;
    let index = 2;
    while (names.has(fileName.toLocaleLowerCase('fr-FR'))) {
      const dot = originalName.lastIndexOf('.');
      fileName = dot > 0
        ? `${originalName.slice(0, dot)} (${index})${originalName.slice(dot)}`
        : `${originalName} (${index})`;
      index += 1;
    }
    names.add(fileName.toLocaleLowerCase('fr-FR'));
    return { ...attachment, fileName };
  });
}

export async function buildProjectQuoteExport(client: SupabaseClient, input: ProjectQuoteExportInput) {
  const [offer, brochures, existingAnnexes] = await Promise.all([
    generateProjectQuoteDocument(input.offer),
    Promise.all(input.brochureVessels.map((vessel) => renderBrochure(client, vessel))),
    Promise.all(input.annexDocuments.map((annex) => downloadAnnex(client, annex))),
  ]);
  const newAnnexes = input.annexFiles.map((file) => ({
    blob: file,
    fileName: file.name,
    mimeType: projectAttachmentMimeType(file),
  }));
  const attachments = uniqueAttachments([...brochures, ...existingAnnexes, ...newAnnexes], offer.fileName);
  if (attachments.length === 0) return { offer, pdfs: [offer] };

  const [{ PDFDocument }, offerBytes] = await Promise.all([import('pdf-lib'), offer.blob.arrayBuffer()]);
  const pdf = await PDFDocument.load(offerBytes);
  for (const attachment of attachments) {
    await pdf.attach(await attachment.blob.arrayBuffer(), attachment.fileName, { mimeType: attachment.mimeType });
  }
  const blob = new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' });
  const offerWithAttachments = { ...offer, blob };
  return {
    offer: offerWithAttachments,
    pdfs: [offerWithAttachments, ...attachments.filter((attachment) => attachment.mimeType === 'application/pdf')],
  };
}
