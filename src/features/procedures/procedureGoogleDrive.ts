import { launcherOpenUri } from '../documents/localDriveLauncher';
const DRIVE_ID = /^[a-zA-Z0-9_-]{10,200}$/;
const OFFICE_FILE = /\.(docx?|xlsx?|pptx?|odt|ods|odp|txt)$/i;

export interface ProcedureDriveLink {
  fileId: string;
  relativePath: string;
}

export function googleDriveFileUrl(fileId: string): string {
  if (!DRIVE_ID.test(fileId)) throw new Error('Lien Google Drive invalide.');
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function parseProcedureDriveLink(fileUrl: string, path: string): ProcedureDriveLink {
  let url: URL;
  try { url = new URL(fileUrl.trim()); }
  catch { throw new Error('Renseignez le lien du fichier Google Drive.'); }
  const fileId = url.hostname === 'drive.google.com'
    ? url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)(?:\/view)?\/?$/)?.[1]
      || (url.pathname === '/open' ? url.searchParams.get('id') : null)
    : url.hostname === 'docs.google.com'
      ? url.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)(?:\/(edit|view|preview))?\/?$/)?.[2]
      : null;
  if (url.protocol !== 'https:' || url.port || url.username || url.password
    || !fileId || !DRIVE_ID.test(fileId)) throw new Error('Utilisez le lien Google Drive du fichier Office.');
  return { fileId, relativePath: validateDriveRelativePath(path) };
}

export function validateDriveRelativePath(path: string): string {
  const normalized = path.trim().replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (!normalized || normalized.length > 500 || !OFFICE_FILE.test(normalized)
    || parts.some((part) => !part || part === '.' || part === '..' || /[<>:"|?*]/.test(part)
      || Array.from(part).some((character) => character.charCodeAt(0) < 32)
      || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error('Indiquez le chemin du fichier Office dans le dossier synchronisé, par exemple URG/Procedure.docx.');
  }
  return normalized;
}

export function buildGoogleDriveDesktopUri(relativePath: string): string {
  return launcherOpenUri('procedures', validateDriveRelativePath(relativePath));
}
