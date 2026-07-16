import type { ProjectDocumentRecord } from './projectQueries';

const SHAREPOINT_HOST = 'bbtm668.sharepoint.com';
const SHAREPOINT_SITE_PATH = '/sites/qhse';

export type SharePointDocumentLinkState =
  | { status: 'available'; href: string }
  | { status: 'missing' | 'invalid'; href: null };

export interface DeduplicatedProjectDocuments {
  documents: ProjectDocumentRecord[];
  duplicateCount: number;
}

export function getSharePointDocumentLinkState(rawUrl: string): SharePointDocumentLinkState {
  const value = rawUrl.trim();

  if (!value) {
    return { status: 'missing', href: null };
  }

  try {
    const parsed = new URL(value);
    const path = decodeURIComponent(parsed.pathname).toLowerCase();
    const isAllowed =
      parsed.protocol === 'https:' &&
      parsed.hostname.toLowerCase() === SHAREPOINT_HOST &&
      !parsed.username &&
      !parsed.password &&
      (path === SHAREPOINT_SITE_PATH || path.startsWith(`${SHAREPOINT_SITE_PATH}/`));

    return isAllowed ? { status: 'available', href: value } : { status: 'invalid', href: null };
  } catch {
    return { status: 'invalid', href: null };
  }
}

function documentIdentity(document: ProjectDocumentRecord): string {
  if (document.sharePointDriveId && document.sharePointDriveItemId) {
    return `drive:${document.sharePointDriveId}:${document.sharePointDriveItemId}`;
  }

  if (document.sharePointListId && document.sharePointItemId) {
    return `list:${document.sharePointListId}:${document.sharePointItemId}`;
  }

  if (document.sourceSharePointId && document.sharePointListTitle) {
    return `source:${document.sharePointListTitle}:${document.sourceSharePointId}`;
  }

  const linkState = getSharePointDocumentLinkState(document.fileUrl);
  if (linkState.status === 'available') {
    return `url:${linkState.href.toLocaleLowerCase('fr')}`;
  }

  return `row:${document.id}`;
}

function documentPreference(document: ProjectDocumentRecord): number {
  const modifiedAt = Date.parse(document.sourceModifiedAt) || 0;
  const hasValidLink = getSharePointDocumentLinkState(document.fileUrl).status === 'available' ? 1 : 0;
  const completeness = [document.fileName, document.folderPath, document.mimeType, document.fileExtension].filter(Boolean)
    .length;

  return modifiedAt * 100 + hasValidLink * 10 + completeness;
}

export function deduplicateProjectDocuments(
  documents: ProjectDocumentRecord[],
): DeduplicatedProjectDocuments {
  const identityIndexes = new Map<string, number>();
  const uniqueDocuments: ProjectDocumentRecord[] = [];
  let duplicateCount = 0;

  for (const document of documents) {
    const identity = documentIdentity(document);
    const existingIndex = identityIndexes.get(identity);

    if (existingIndex === undefined) {
      identityIndexes.set(identity, uniqueDocuments.length);
      uniqueDocuments.push(document);
      continue;
    }

    duplicateCount += 1;
    if (documentPreference(document) > documentPreference(uniqueDocuments[existingIndex])) {
      uniqueDocuments[existingIndex] = document;
    }
  }

  return { documents: uniqueDocuments, duplicateCount };
}
