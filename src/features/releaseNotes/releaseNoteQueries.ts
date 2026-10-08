import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReleaseNoteState { note_id: string; read_at: string | null }
export interface ReleaseNoteStore {
  load: () => Promise<ReleaseNoteState[]>;
  save: (ids: string[], read: boolean) => Promise<void>;
}

export function createReleaseNoteStore(client: SupabaseClient, userId: string): ReleaseNoteStore {
  return {
    async load() {
      const { data, error } = await client.from('user_release_note_states').select('note_id, read_at').eq('user_id', userId);
      if (error) throw error;
      return data || [];
    },
    async save(ids, read) {
      if (!ids.length) return;
      const { error } = await client.from('user_release_note_states').upsert(
        ids.map((note_id) => ({ user_id: userId, note_id, ...(read ? { read_at: new Date().toISOString() } : {}) })),
        { onConflict: 'user_id,note_id', ignoreDuplicates: !read },
      );
      // Deferring never overwrites an acknowledgement saved by another device.
      if (error) throw error;
    },
  };
}

export function createPreviewReleaseNoteStore(): ReleaseNoteStore {
  const key = 'seapilot.preview.release-notes.v1';
  function load(): ReleaseNoteState[] {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((row): row is ReleaseNoteState => row && typeof row.note_id === 'string' && (row.read_at === null || typeof row.read_at === 'string')) : [];
  }
  return {
    load: async () => load(),
    async save(ids, read) {
      const states = new Map(load().map((row) => [row.note_id, row]));
      for (const note_id of ids) if (read || !states.has(note_id)) states.set(note_id, { note_id, read_at: read ? new Date().toISOString() : null });
      localStorage.setItem(key, JSON.stringify([...states.values()]));
    },
  };
}
