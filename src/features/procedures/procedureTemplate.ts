export const PROCEDURE_TEMPLATE_URL = '/templates/procedure.docx';
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Copy the supplied Word template without changing its layout, fields or styles. */
export async function createProcedureTemplateFile(reference: string, title: string): Promise<File> {
  const response = await fetch(PROCEDURE_TEMPLATE_URL);
  if (!response.ok) throw new Error('Le modèle Procédure.docx est indisponible. Réessayez.');
  const contents = await response.arrayBuffer();
  const signature = new Uint8Array(contents, 0, Math.min(4, contents.byteLength));
  // A missing asset can return the SPA HTML with HTTP 200 on the hosting platform.
  if (signature.length !== 4 || ![0x50, 0x4b, 0x03, 0x04].every((value, index) => signature[index] === value)) {
    throw new Error('Le modèle Procédure.docx est invalide. Réessayez.');
  }
  const name = [reference.trim(), title.trim()].filter(Boolean).join(' - ')
    .replace(/[<>:"/\\|?*]/g, '-').replace(/\p{Cc}/gu, '-').slice(0, 180).replace(/[. ]+$/, '') || 'Procédure';
  return new File([contents], `${name}.docx`, { type: DOCX_MIME_TYPE });
}
