import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FleetCapacityPlans } from './FleetCapacityPlans';
import { FLEET_CAPACITY_PLANS_BUCKET } from './fleetCapacityPlanQueries';

const vessel = { companyId: 8, id: 104 };

function storageFixture() {
  const objects = new Map<string, Blob>();
  const list = vi.fn(async (folder: string) => ({
    data: [...objects.keys()].filter(path => path.startsWith(`${folder}/`))
      .map(path => ({ id: path, name: path.slice(folder.length + 1) })),
    error: null,
  }));
  const upload = vi.fn(async (path: string, blob: Blob) => {
    objects.set(path, blob);
    return { error: null };
  });
  const remove = vi.fn(async (paths: string[]) => ({
    data: paths.filter(path => objects.delete(path)).map(name => ({ name })), error: null,
  }));
  const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://storage.example/signed' }, error: null }));
  const from = vi.fn(() => ({ list, upload, createSignedUrl, remove }));
  return { client: { storage: { from } } as unknown as SupabaseClient, from, list, upload, createSignedUrl, remove, objects };
}

describe('Plans de capacités', () => {
  it('adds several plans, preserves display names and scopes consultation to a single vessel', async () => {
    const storage = storageFixture();
    const uploadView = render(<FleetCapacityPlans client={storage.client} vessel={vessel} canManage />);
    await screen.findByText('Aucun plan enregistré.');
    const files = [new File(['pdf'], 'Plan côté bâbord.pdf'), new File(['png'], 'Plan pont 2.png', { type: 'image/png' })];
    fireEvent.change(screen.getByLabelText('Ajouter des plans'), { target: { files } });
    await screen.findByText(files[1].name);
    const paths = [...storage.objects.keys()];
    expect(paths).toHaveLength(2);
    expect(paths.every(path => /^8\/104\/[0-9a-f-]+\.[A-Za-z0-9_-]+$/.test(path))).toBe(true);
    expect(storage.objects.get(paths[0])?.type).toBe('application/pdf');
    expect(storage.from).toHaveBeenCalledWith(FLEET_CAPACITY_PLANS_BUCKET);
    uploadView.unmount();

    const readerView = render(<FleetCapacityPlans client={storage.client} vessel={vessel} canManage={false} />);
    const download = await screen.findByRole('button', { name: `Télécharger ${files[0].name}` });
    expect(screen.queryByLabelText('Ajouter des plans')).toBeNull();
    expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      fireEvent.click(download);
      await waitFor(() => expect(click).toHaveBeenCalledOnce());
      expect(storage.createSignedUrl).toHaveBeenCalledWith(paths[0], 300, { download: files[0].name });
    } finally {
      click.mockRestore();
    }
    readerView.unmount();

    render(<FleetCapacityPlans client={storage.client} vessel={{ ...vessel, id: 105 }} canManage />);
    await screen.findByText('Aucun plan enregistré.');
    expect(screen.queryByText(files[0].name)).toBeNull();
  });

  it('reports an unsupported file and removes an uploaded plan', async () => {
    const storage = storageFixture();
    render(<FleetCapacityPlans client={storage.client} vessel={vessel} canManage />);
    await screen.findByText('Aucun plan enregistré.');
    const files = [new File(['invalid'], 'Tableur.xlsx'), new File(['valid'], 'Pont.pdf')];
    fireEvent.change(screen.getByLabelText('Ajouter des plans'), { target: { files } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Tableur.xlsx');
    expect(storage.upload).toHaveBeenCalledOnce();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Supprimer Pont.pdf' }));
      await screen.findByText('Aucun plan enregistré.');
      expect(storage.remove).toHaveBeenCalledOnce();
      expect(storage.objects.size).toBe(0);
    } finally {
      confirm.mockRestore();
    }
  });
});
