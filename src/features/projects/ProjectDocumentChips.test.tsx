import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDocumentChips } from './ProjectDocumentChips';
import { ProjectDocumentDownloadError } from './projectDocumentAssets';
import type { ProjectDocumentCategory } from './projectDocumentCategories';
import type { ProjectDocumentRecord, ProjectOperationDocumentRecord } from './projectQueries';

const assetMocks = vi.hoisted(() => ({ download: vi.fn(), access: vi.fn() }));
vi.mock('./projectDocumentAssets', async (importOriginal) => ({
  ...await importOriginal<typeof import('./projectDocumentAssets')>(), downloadProjectFiles: assetMocks.download,
}));
vi.mock('./projectDocumentStorage', async (importOriginal) => ({
  ...await importOriginal<typeof import('./projectDocumentStorage')>(), createProjectDocumentAccessUrl: assetMocks.access,
}));
vi.mock('./ProjectDocumentThumbnail', () => ({
  ProjectDocumentThumbnail: () => <span className="project-document-thumbnail" aria-hidden="true">Vignette de test</span>,
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
  beforeEach(() => {
    assetMocks.download.mockReset().mockResolvedValue({ fileName: 'documents.zip', count: 2 });
    assetMocks.access.mockReset().mockResolvedValue('https://private.example/document');
    vi.spyOn(window, 'open').mockReturnValue({ opener: null, location: { href: '' }, close: vi.fn() } as unknown as Window);
  });
  afterEach(() => vi.restoreAllMocks());
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

  it('opens through the full filename and thumbnail, with icon download and no redundant Open or Details control', async () => {
    render(<ProjectDocumentChips {...props} documents={{ ...props.documents, attachments: [attachment] }} />);
    const chip = screen.getByText(attachment.fileName).closest('li')!;
    const open = within(chip).getByRole('button', { name: `Ouvrir le document : ${attachment.fileName}` });
    const thumbnail = open.querySelector('.project-document-thumbnail')!;
    expect(thumbnail).toBeInTheDocument();
    expect(open).toHaveTextContent(attachment.fileName);
    expect(within(chip).queryByText(/^Ouvrir$/)).not.toBeInTheDocument();
    expect(within(chip).queryByText(/^Détails$/)).not.toBeInTheDocument();
    expect(chip.querySelector('details')).not.toBeInTheDocument();
    expect(within(chip).getByRole('button', { name: `Télécharger ${attachment.fileName}` })).toBeVisible();
    expect(within(chip).getByRole('button', { name: 'Classer generated:7' })).toBeVisible();
    fireEvent.click(thumbnail);
    await waitFor(() => expect(assetMocks.access).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(open).toBeEnabled());
    fireEvent.click(within(open).getByText(attachment.fileName));
    await waitFor(() => expect(assetMocks.access).toHaveBeenCalledTimes(2));
    fireEvent.click(within(chip).getByRole('button', { name: `Télécharger ${attachment.fileName}` }));
    await waitFor(() => expect(assetMocks.download).toHaveBeenCalledWith(props.client,
      [expect.objectContaining({ id: 'generated:7', file: expect.objectContaining({ fileName: attachment.fileName }) })], expect.any(String), expect.any(AbortSignal)));
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

  it('selects only accessible files in a category and exposes its partial and complete selection states', () => {
    render(<ProjectDocumentChips {...props} documents={{ ...props.documents, attachments: [attachment], projectDocuments: [historical,
      { ...historical, id: 8, fileName: 'Fichier indisponible.pdf', fileUrl: '' },
    ] }} />);
    const category = screen.getByRole('checkbox', { name: 'Sélectionner tous les documents de Sécurité du projet' });
    const first = screen.getByRole('checkbox', { name: `Sélectionner ${attachment.fileName} pour le téléchargement` });
    const second = screen.getByRole('checkbox', { name: `Sélectionner ${historical.fileName} pour le téléchargement` });
    const unavailable = screen.getByText('Fichier indisponible.pdf').closest('li')!;
    const unavailableSelection = within(unavailable).queryByRole('checkbox', { name: /pour le téléchargement/ });
    if (unavailableSelection) expect(unavailableSelection).toBeDisabled();
    expect(within(unavailable).getByRole('button', { name: /Télécharger/ })).toBeDisabled();
    fireEvent.click(first);
    expect(category).not.toBeChecked();
    expect(category).toBePartiallyChecked();
    fireEvent.click(category);
    expect(category).toBeChecked();
    expect(first).toBeChecked();
    expect(second).toBeChecked();
    expect(screen.getByRole('button', { name: 'Télécharger la sélection (2)' })).toBeEnabled();
    fireEvent.click(category);
    expect(first).not.toBeChecked();
    expect(second).not.toBeChecked();
    expect(category).not.toBePartiallyChecked();
  });

  it('downloads a cross-category selection and a whole category with their namespaced file ids', async () => {
    render(<ProjectDocumentChips {...props} documents={{ ...props.documents, attachments: [attachment],
      projectDocuments: [historical], contractDocuments: [{ ...historical, categoryKey: 'dossier', fileName: 'Contrat signé.pdf' }],
    }} />);
    fireEvent.click(screen.getByRole('checkbox', { name: `Sélectionner ${attachment.fileName} pour le téléchargement` }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner Contrat signé.pdf pour le téléchargement' }));
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger la sélection (2)' }));
    await waitFor(() => expect(assetMocks.download).toHaveBeenCalledTimes(1));
    expect(assetMocks.download.mock.calls[0][1]).toEqual([
      expect.objectContaining({ id: 'generated:7', categoryLabel: 'Sécurité du projet' }),
      expect.objectContaining({ id: 'contract:7', categoryLabel: 'Plans et études' }),
    ]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Télécharger la catégorie Sécurité du projet' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger la catégorie Sécurité du projet' }));
    await waitFor(() => expect(assetMocks.download).toHaveBeenCalledTimes(2));
    expect(assetMocks.download.mock.calls[1][1]).toEqual([
      expect.objectContaining({ id: 'generated:7' }), expect.objectContaining({ id: 'project:7' }),
    ]);
  });

  it('excludes selected documents hidden by a category filter from the downloaded selection', async () => {
    const contract = { ...historical, categoryKey: 'dossier', fileName: 'Contrat signé.pdf' };
    const view = render(<ProjectDocumentChips {...props} documents={{ ...props.documents, attachments: [attachment], contractDocuments: [contract] }} />);
    fireEvent.click(screen.getByRole('checkbox', { name: `Sélectionner ${attachment.fileName} pour le téléchargement` }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner Contrat signé.pdf pour le téléchargement' }));
    expect(screen.getByRole('button', { name: 'Télécharger la sélection (2)' })).toBeVisible();
    view.rerender(<ProjectDocumentChips {...props} documents={{ ...props.documents, contractDocuments: [contract] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger la sélection (1)' }));
    await waitFor(() => expect(assetMocks.download).toHaveBeenCalledTimes(1));
    expect(assetMocks.download.mock.calls[0][1]).toEqual([expect.objectContaining({ id: 'contract:7' })]);
  });

  it('blocks repeat downloads while busy and reports private-file failures without a success message', async () => {
    let rejectDownload!: (error: Error) => void;
    assetMocks.download.mockReturnValue(new Promise((_resolve, reject) => { rejectDownload = reject; }));
    render(<ProjectDocumentChips {...props} documents={{ ...props.documents, attachments: [attachment] }} />);
    const download = screen.getByRole('button', { name: `Télécharger ${attachment.fileName}` });
    fireEvent.click(download);
    expect(download).toBeDisabled();
    fireEvent.click(download);
    expect(assetMocks.download).toHaveBeenCalledTimes(1);
    await act(async () => { rejectDownload(new Error('Accès privé refusé')); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Accès privé refusé');
    expect(download).toBeEnabled();
    expect(screen.queryByText(/\d+ fichiers? téléchargés?\./)).not.toBeInTheDocument();
  });

  it('reports each unavailable file when a category archive cannot be completed', async () => {
    assetMocks.download.mockRejectedValue(new ProjectDocumentDownloadError([
      { id: 'generated:7', fileName: attachment.fileName, message: 'Accès privé refusé' },
      { id: 'project:7', fileName: historical.fileName, message: 'Copie privée absente' },
    ]));
    render(<ProjectDocumentChips {...props} documents={{ ...props.documents, attachments: [attachment], projectDocuments: [historical] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger la catégorie Sécurité du projet' }));
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent(attachment.fileName);
    expect(error).toHaveTextContent('Accès privé refusé');
    expect(error).toHaveTextContent(historical.fileName);
    expect(error).toHaveTextContent('Copie privée absente');
    expect(screen.queryByText(/\d+ fichiers? téléchargés?\./)).not.toBeInTheDocument();
  });

  it('cancels pending work and does not publish stale feedback after the project or account scope is replaced', async () => {
    let resolveDownload!: (result: { fileName: string; count: number }) => void;
    assetMocks.download.mockReturnValue(new Promise(resolve => { resolveDownload = resolve; }));
    const view = render(<ProjectDocumentChips accessKey="account-a-project-880" {...props} documents={{ ...props.documents, attachments: [attachment] }} />);
    fireEvent.click(screen.getByRole('checkbox', { name: `Sélectionner ${attachment.fileName} pour le téléchargement` }));
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger la sélection (1)' }));
    const signal = assetMocks.download.mock.calls[0][3] as AbortSignal;
    view.rerender(<ProjectDocumentChips accessKey="account-b-project-881" {...props} client={{} as never} documents={{ ...props.documents, attachments: [{ ...attachment, projectId: 881, id: 8, fileName: 'Autre projet.pdf' }] }} />);
    expect(signal.aborted).toBe(true);
    await act(async () => { resolveDownload({ fileName: 'ancien-projet.zip', count: 1 }); });
    expect(screen.getByText('Autre projet.pdf')).toBeVisible();
    expect(screen.queryByText(/ancien-projet.zip/)).not.toBeInTheDocument();
    expect(screen.queryByText('1 fichier téléchargé.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Télécharger la sélection (1)' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Sélectionner Autre projet.pdf pour le téléchargement' })).not.toBeChecked();
  });

});
