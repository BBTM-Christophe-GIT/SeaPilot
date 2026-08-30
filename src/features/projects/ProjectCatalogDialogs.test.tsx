import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientCatalogDialog, TowedAssetCatalogDialog } from './ProjectCatalogDialogs';
import type { ClientRecord, ProjectTowedAssetRecord } from './projectQueries';

const clients: ClientRecord[] = [
  {
    active: true,
    address: '1 quai de la Douane',
    archivedAt: '',
    city: 'Brest',
    code: 'ATL',
    country: 'France',
    email: 'contact@atlantique.example',
    id: 50,
    logoStoragePath: '',
    logoUrl: '',
    name: 'Compagnie Atlantique',
    phone: '02 98 00 00 00',
    postalCode: '',
    representedBy: 'Marie MARTIN',
    sharePointItemId: '',
    sharePointListTitle: '',
    sourceLabel: 'seapilot',
    sourceModifiedAt: '',
    updatedAt: '2026-08-28T05:00:00Z',
    website: '',
  },
  {
    active: true,
    address: '',
    archivedAt: '',
    city: 'Cherbourg',
    code: 'NSE',
    country: 'France',
    email: '',
    id: 51,
    logoStoragePath: '',
    logoUrl: '',
    name: 'Naval Services',
    phone: '',
    postalCode: '',
    representedBy: '',
    sharePointItemId: '',
    sharePointListTitle: '',
    sourceLabel: 'seapilot',
    sourceModifiedAt: '',
    updatedAt: '2026-08-28T05:00:00Z',
    website: '',
  },
];

const towedAssets: ProjectTowedAssetRecord[] = [{
  active: true,
  assetType: 'Ponton',
  breadthOverallM: 12,
  classificationSociety: 'DNV',
  flag: 'FR',
  hullMachineryInsurer: 'Assureur A',
  id: 8,
  lengthOverallM: 48,
  liabilityInsurer: 'Assureur B',
  lightDisplacementT: 520,
  maxDraftM: 2.4,
  name: 'ARGO',
  ownerName: 'Armement Atlantique',
  photoStoragePath: '',
  photoUrl: '',
  registrationNumber: 'FR-001',
}];

function createClient() {
  const rpc = vi.fn(async (
    functionName: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }> => {
    if (functionName === 'clients_save') return { data: { id: Number(args?.target_client_id || 52) }, error: null };
    if (functionName === 'projects_save_towed_asset') return { data: Number(args?.target_towed_asset_id || 9), error: null };
    return { data: null, error: null };
  });
  const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
  const remove = vi.fn().mockResolvedValue({ data: {}, error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: '' }, error: null });
  return {
    client: {
      rpc,
      storage: { from: vi.fn(() => ({ createSignedUrl, remove, upload })) },
    },
    createSignedUrl,
    remove,
    rpc,
    upload,
  };
}

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:catalog-preview') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.stubGlobal('crypto', { randomUUID: () => 'catalog-media' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ features: [{ properties: { city: 'Brest', postcode: '29200', score: 0.9 } }] }),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ProjectCatalogDialogs', () => {
  it('filters client keywords and saves an automatically proposed, replaceable logo', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient();
    render(
      <ClientCatalogDialog
        canManage
        client={client as never}
        clients={clients}
        onChanged={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un client' }), 'Cherbourg');
    expect(screen.getByRole('option', { name: /Naval Services/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Compagnie Atlantique/ })).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Rechercher un client' }));
    await user.click(screen.getByRole('option', { name: /Compagnie Atlantique/ }));
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    await user.type(screen.getByLabelText('Site internet'), 'atlantique.example');
    await user.click(screen.getByRole('button', { name: 'Trouver le logo' }));
    expect(screen.getByLabelText('URL du logo')).toHaveValue('https://atlantique.example/favicon.ico');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('clients_save', expect.objectContaining({
      target_client_id: 50,
      target_logo_url: 'https://atlantique.example/favicon.ico',
      target_website: 'https://atlantique.example/',
    })));
    expect(await screen.findByText('Client enregistré dans Supabase.')).toBeInTheDocument();
  });

  it('creates a towed asset with every captured field and a private photo upload', async () => {
    const user = userEvent.setup();
    const { client, rpc, upload } = createClient();
    render(
      <TowedAssetCatalogDialog
        canManage
        client={client as never}
        onChanged={vi.fn()}
        onClose={vi.fn()}
        towedAssets={towedAssets}
      />,
    );

    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un remorqué' }), 'DNV');
    expect(screen.getByRole('option', { name: /ARGO/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    await user.type(screen.getByLabelText('Nom *'), 'BARGE 12');
    await user.type(screen.getByLabelText('Type d’engin, de navire ou de colis'), 'Barge de travaux');
    await user.type(screen.getByLabelText('Longueur hors tout (m)'), '32.5');
    await user.upload(screen.getByLabelText('Ajouter une photo'), new File(['photo'], 'barge.webp', { type: 'image/webp' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(upload).toHaveBeenCalledWith(
      'towed-assets/9/catalog-media.webp',
      expect.any(File),
      expect.objectContaining({ contentType: 'image/webp', upsert: false }),
    ));
    expect(rpc).toHaveBeenLastCalledWith('projects_save_towed_asset', expect.objectContaining({
      target_length_overall_m: 32.5,
      target_name: 'BARGE 12',
      target_photo_storage_path: 'towed-assets/9/catalog-media.webp',
    }));
    expect(await screen.findByText('Remorqué enregistré dans Supabase.')).toBeInTheDocument();
  });

  it('uses controlled archive RPCs for deletion and keeps the dialog open on conflicts', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient();
    rpc.mockImplementation(async (functionName: string) => (
      functionName === 'clients_archive'
        ? { data: null, error: { message: 'Ce client est utilisé par un projet actif et ne peut pas être supprimé.' } }
        : { data: null, error: null }
    ));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <ClientCatalogDialog
        canManage
        client={client as never}
        clients={clients}
        onChanged={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const detail = screen.getByRole('region', { name: 'Données du client' });
    await user.click(within(detail).getByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('utilisé par un projet actif');
    expect(screen.getByRole('dialog', { name: 'Liste des clients' })).toBeInTheDocument();
  });
});
