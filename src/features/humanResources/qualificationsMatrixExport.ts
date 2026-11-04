import type { QualificationsMatrix } from './qualificationsMatrixModel';

/** Open synchronously from the click, then load the PDF renderer only on demand. */
export async function openQualificationsMatrix(matrix: QualificationsMatrix): Promise<boolean> {
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) return false;
  reportWindow.opener = null;
  reportWindow.document.title = 'Matrice des Qualifications';
  reportWindow.document.body.textContent = 'Préparation de la matrice des qualifications…';
  let pdfUrl: string | null = null;
  try {
    const { buildQualificationsMatrixPdf } = await import('./qualificationsMatrixPdf');
    const { blob, fileName } = await buildQualificationsMatrixPdf(matrix);
    if (reportWindow.closed) throw new Error('La fenêtre de la matrice a été fermée avant l’ouverture du PDF.');
    pdfUrl = URL.createObjectURL(new File([blob], fileName, { type: 'application/pdf' }));
    reportWindow.location.replace(pdfUrl);
    const openedUrl = pdfUrl;
    window.setTimeout(() => URL.revokeObjectURL(openedUrl), 5 * 60 * 1000);
    return true;
  } catch (cause) {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    reportWindow.close();
    throw cause;
  }
}
