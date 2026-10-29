import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectDocumentChips } from './ProjectDocumentChips';
import type { ProjectDocumentCategory } from './projectDocumentCategories';
import type { ProjectDocumentRecord, ProjectOperationDocumentRecord } from './projectQueries';

vi.mock('./ProjectStoredDocumentLink', () => ({
  ProjectStoredDocumentLink: ({ document }: { document: { fileName: string } }) => <button type="button" aria-label={`Ouvrir le document : ${document.fileName}`}>Ouvrir</button>,
}));
vi.mock('./ProjectDocumentClassificationEditor', () => ({
  ProjectDocumentCategoryAction: ({ documentId }: { documentId: string }) => <button type="button" aria-label={`Classer ${documentId}`}>Classer</button>,
}));

const attachment: ProjectOperationDocumentRecord = {
  id: 7, projectId: 880, planningOccurrenceId: null, documentType: 'project_attachment',
  categoryKey: 'hse', subcategoryKey: 'hse_audits', expiresOn: '2027-10-30',
  fileName: 'Rapport de sécurité et audit du projet.pdf', mimeType: 'application/pdf', fileSizeBytes: 2048,
  sharePointWebUrl: '', sharePointFolderPath: '', storageBucket: 'project-files',
  storagePath: 'projects/880/attachments/report.pdf', createdAt: '2026-10-29T10:00:00Z',
};
const historical: ProjectDocumentRecord = {
  id: 7, projectId: 880, projectSharePointItemId: '880', projectCode: 'P1086', projectTitle: 'Projet de test',
  categoryKey: 'hse_audits', subcategoryKey: '', title: 'Plan historique', sourceLabel: 'SharePoint',
  sourceSharePointId: '7', fileUrl: 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/plan.pdf',
  notes: '', sharePointListId: 'list', sharePointListTitle: 'Documents Projets', sharePointItemId: '7',
  sharePointDriveId: 'drive', sharePointDriveItemId: 'plan', fileName: 'Plan de prévention.pdf',
  folderPath: '/sites/QHSE/Documents Projets', mimeType: 'application/pdf', fileExtension: 'pdf',
  fileSizeBytes: 1024, sourceModifiedAt: '2026-10-28T10:00:00Z', isFolder: false,
  storageBucket: '', storagePath: '', storageSha256: '', storageMigratedAt: '',
};
const categories: ProjectDocumentCategory[] = [
  { active: true, displayOrder: 80, key: 'hse', label: 'Sécurité du projet', parentKey: null },
  { active: true, displayOrder: 81, key: 'hse_audits', label: 'Audits de sécurité', parentKey: 'hse' },
  { active: false, displayOrder: 5, key: 'dossier', label: 'Plans et études', parentKey: null },
];
const categoryLabels = new Map(categories.map(category => [category.key, category.label]));
const props = {
  client: {} as never, canManage: true, categories, categoryLabels,
  documents: { attachments: [] as ProjectOperationDocumentRecord[], projectDocuments: [] as ProjectDocumentRecord[], contractDocuments: [] as ProjectDocumentRecord[] },
};

describe('ProjectDocumentChips', () => {
  it('groups mixed sources under their real root category, respecting custom names, retired entries and catalogue order', () => {
    render(<ProjectDocumentChips {...props} documents={{
      attachments: [attachment],
      projectDocuments: [historical, { ...historical, id: 8, categoryKey: 'legacy', fileName: 'Pièce ancienne.pdf' }, { ...historical, id: 9, categoryKey: '', fileName: 'Pièce sans classement.pdf' }],
      contractDocuments: [{ ...historical, categoryKey: 'dossier', fileName: 'Contrat signé.pdf' }],
    }} />);

    expect(screen.getAllByRole('list').map(list => list.getAttribute('aria-label'))).toEqual([
      'Documents · Plans et études', 'Documents · Sécurité du projet', 'Documents · legacy', 'Documents · Sans catégorie',
    ]);
    const safety = within(screen.getByRole('region', { name: 'Sécurité du projet' }));
    expect(safety.getByText('2 documents')).toBeVisible();
    expect(safety.getAllByRole('listitem')).toHaveLength(2);
    expect(safety.getByText(attachment.fileName)).toBeVisible();
    expect(safety.getByText(historical.fileName)).toBeVisible();
    expect(safety.getByRole('button', { name: 'Classer generated:7' })).toBeVisible();
    expect(safety.getByRole('button', { name: 'Classer project:7' })).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Plans et études' })).getByRole('button', { name: 'Classer contract:7' })).toBeVisible();
    expect(screen.getByText('Pièce ancienne.pdf')).toBeVisible();
    expect(screen.getByText('Pièce sans classement.pdf')).toBeVisible();
  });

  it('keeps a full filename, file icon and actions in one chip while revealing metadata on demand', () => {
    render(<ProjectDocumentChips {...props} documents={{ ...props.documents, attachments: [attachment] }} />);
    const chip = screen.getByText(attachment.fileName).closest('li')!;
    expect(chip.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
    expect(within(chip).getByRole('button', { name: `Ouvrir le document : ${attachment.fileName}` })).toBeVisible();
    expect(within(chip).getByRole('button', { name: 'Classer generated:7' })).toBeVisible();
    const expiry = within(chip).getByText(/^Échéance :/);
    expect(expiry).not.toBeVisible();
    fireEvent.click(within(chip).getByText('Détails'));
    expect(expiry).toBeVisible();
    expect(chip.querySelector('details')).toHaveAttribute('open');
    expect(within(chip).getByText(/Sécurité du projet · Audits de sécurité · PDF/)).toBeVisible();
  });

  it('preserves unavailable historical files and loading errors without inventing an opening action', () => {
    render(<ProjectDocumentChips {...props} contractDocumentsUnavailable documents={{ ...props.documents, projectDocuments: [
      { ...historical, id: 1, fileName: 'URL absente.pdf', fileUrl: '' },
      { ...historical, id: 2, fileName: 'URL interdite.pdf', fileUrl: 'https://evil.example/plan.pdf' },
    ] }} />);
    expect(screen.getByText('URL SharePoint absente')).toBeVisible();
    expect(screen.getByText('URL SharePoint invalide ou non autorisée')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Ouvrir le document/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Documents contractuels indisponibles');
    expect(screen.getByText('URL absente.pdf')).toBeVisible();
    expect(screen.getByText('URL interdite.pdf')).toBeVisible();
  });
});
