import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReleaseNotes } from './ReleaseNotes';
import { RELEASE_NOTES, type ReleaseNote } from './releaseNotesCatalog';
import { createReleaseNoteStore, type ReleaseNoteState } from './releaseNoteQueries';

const older: ReleaseNote = { id: 'older', version: '3.9.0', publishedOn: '2026-09-01', title: 'Ancienne nouveauté', changes: ['Premier changement.'] };
const newer: ReleaseNote = { id: 'newer', version: '3.10.0', publishedOn: '2026-09-01', title: 'Nouvelle fonctionnalité', changes: ['Deuxième changement.'] };
function memoryStore(initial: ReleaseNoteState[] = []) {
  let rows = initial;
  return {
    load: vi.fn(async () => rows),
    save: vi.fn(async (ids: string[], read: boolean) => {
      const map = new Map(rows.map((row) => [row.note_id, row]));
      for (const note_id of ids) if (read || !map.has(note_id)) map.set(note_id, { note_id, read_at: read ? '2026-09-23' : null });
      rows = [...map.values()];
    }),
  };
}

describe('ReleaseNotes', () => {
  it('shows missed updates oldest first, defers without reopening, then acknowledges them permanently', async () => {
    const user = userEvent.setup();
    const store = memoryStore();
    const props = { client: {} as never, userId: 'alice', notes: [newer, older], storeOverride: store };
    const view = render(<ReleaseNotes {...props} />);
    let dialog = await screen.findByRole('dialog', { name: 'Note de mise à jour' });
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map((node) => node.textContent)).toEqual([older.title, newer.title]);
    await user.click(within(dialog).getByRole('button', { name: 'Lire plus tard' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('2 mises à jour non lues')).toHaveTextContent('2');
    view.unmount();
    render(<ReleaseNotes {...props} />);
    await screen.findByLabelText('2 mises à jour non lues');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Notes de mise à jour/ }));
    dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Ok' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByLabelText('2 mises à jour non lues')).not.toBeInTheDocument();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Read notes remain available from the version button.
    await user.click(screen.getByRole('button', { name: /Notes de mise à jour/ }));
    expect(within(await screen.findByRole('dialog')).getAllByRole('article')).toHaveLength(2);
  });

  it('opens on a new release and includes previously deferred notes', async () => {
    render(<ReleaseNotes client={{} as never} notes={[newer, older]} storeOverride={memoryStore([{ note_id: older.id, read_at: null }])} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('article')).toHaveLength(2);
  });

  it('excludes already read updates from the unread queue', async () => {
    render(<ReleaseNotes client={{} as never} notes={[newer, older]} storeOverride={memoryStore([{ note_id: older.id, read_at: '2026-09-02' }])} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(older.title)).not.toBeInTheDocument();
    expect(screen.getByLabelText('1 mise à jour non lue')).toHaveTextContent('1');
  });

  it.each(['Lire plus tard', 'Ok'])('keeps the dialog and unread count when saving %s fails', async (label) => {
    const user = userEvent.setup();
    const store = memoryStore();
    store.save.mockRejectedValueOnce(new Error('offline'));
    render(<ReleaseNotes client={{} as never} notes={[older]} storeOverride={store} />);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: label }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Votre choix n’a pas pu être enregistré');
    expect(screen.getByLabelText('1 mise à jour non lue')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: label }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('retries a failed load without falsely acknowledging unseen notes', async () => {
    const user = userEvent.setup();
    const store = memoryStore();
    store.load.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'));
    render(<ReleaseNotes client={{} as never} notes={[older]} storeOverride={store} />);
    await screen.findByText('Réessayer');
    await user.click(screen.getByRole('button', { name: /Notes de mise à jour/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Ok' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText(older.title)).toBeInTheDocument();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('treats Escape as read later', async () => {
    const user = userEvent.setup();
    const store = memoryStore();
    render(<ReleaseNotes client={{} as never} notes={[older]} storeOverride={store} />);
    const dialog = await screen.findByRole('dialog');
    within(dialog).getByRole('button', { name: 'Fermer' }).focus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(store.save).toHaveBeenCalledWith([older.id], false));
  });

  it('ships a unique, dated first note for the Levage change', () => {
    expect(new Set(RELEASE_NOTES.map((note) => note.id)).size).toBe(RELEASE_NOTES.length);
    expect(RELEASE_NOTES.find((note) => note.id === '3.51.0-lifting-sections')?.changes.join(' ')).toContain('Registre des Remorques');
    RELEASE_NOTES.forEach((note) => expect(Number.isNaN(Date.parse(note.publishedOn))).toBe(false));
  });

  it('scopes reads by account and never resets read state when deferring on another device', async () => {
    const eq = vi.fn().mockResolvedValue({ data: [], error: null });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ select: () => ({ eq }), upsert }));
    const store = createReleaseNoteStore({ from } as never, 'alice');
    await store.load();
    expect(eq).toHaveBeenCalledWith('user_id', 'alice');
    await store.save(['note-1'], false);
    expect(upsert).toHaveBeenLastCalledWith([{ user_id: 'alice', note_id: 'note-1' }], { onConflict: 'user_id,note_id', ignoreDuplicates: true });
    await store.save(['note-1'], true);
    expect(upsert).toHaveBeenLastCalledWith([{ user_id: 'alice', note_id: 'note-1', read_at: expect.any(String) }], { onConflict: 'user_id,note_id', ignoreDuplicates: false });
  });
});
