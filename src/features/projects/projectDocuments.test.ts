import { describe, expect, it } from 'vitest';
import type { ProjectDocumentRecord } from './projectQueries';
import { deduplicateProjectDocuments, getSharePointDocumentLinkState } from './projectDocuments';

function document(overrides: Partial<ProjectDocumentRecord> = {}): ProjectDocumentRecord {
  return {
    categoryKey: 'project_document',
    fileExtension: 'pdf',
    fileName: 'rapport.pdf',
    fileSizeBytes: 10,
    fileUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/P1086/rapport.pdf',
    folderPath: '/sites/QHSE/Documents Projets/P1086',
    id: 1,
    isFolder: false,
    mimeType: 'application/pdf',
    notes: '',
    projectCode: 'P1086',
    projectId: 880,
    projectSharePointItemId: '880',
    projectTitle: 'Campagne Atlantique',
    sharePointDriveId: 'drive-projects',
    sharePointDriveItemId: 'item-1',
    sharePointItemId: '1',
    sharePointListId: '',
    sharePointListTitle: 'Documents Projets',
    sourceModifiedAt: '2026-07-15T08:00:00Z',
    sourceSharePointId: '1',
    sourceLabel: 'SharePoint',
    title: 'rapport.pdf',
    ...overrides,
  };
}

describe('getSharePointDocumentLinkState', () => {
  it('keeps an original protected QHSE SharePoint URL unchanged', () => {
    const url = 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/P1086/rapport.pdf?web=1';
    expect(getSharePointDocumentLinkState(url)).toEqual({ status: 'available', href: url });
  });

  it.each([
    ['', 'missing'],
    ['not-an-url', 'invalid'],
    ['http://bbtm668.sharepoint.com/sites/QHSE/file.pdf', 'invalid'],
    ['https://evil.example/sites/QHSE/file.pdf', 'invalid'],
    ['https://bbtm668.sharepoint.com/sites/Other/file.pdf', 'invalid'],
  ])('classifies %s as %s', (url, status) => {
    expect(getSharePointDocumentLinkState(url).status).toBe(status);
  });
});

describe('deduplicateProjectDocuments', () => {
  it('collapses the same drive item and keeps the newest complete metadata', () => {
    const result = deduplicateProjectDocuments([
      document({ fileUrl: '', id: 1, sourceModifiedAt: '2026-07-14T08:00:00Z' }),
      document({ id: 2, sourceModifiedAt: '2026-07-15T08:00:00Z' }),
    ]);

    expect(result.duplicateCount).toBe(1);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe(2);
  });

  it('does not merge rows without a shared stable identity', () => {
    const result = deduplicateProjectDocuments([
      document({ id: 1, sharePointDriveId: '', sharePointDriveItemId: '', sourceSharePointId: '' }),
      document({ id: 2, sharePointDriveId: '', sharePointDriveItemId: '', sourceSharePointId: '', fileUrl: '' }),
    ]);

    expect(result).toMatchObject({ duplicateCount: 0, documents: [{ id: 1 }, { id: 2 }] });
  });
});
