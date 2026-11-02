import type { SupabaseClient } from '@supabase/supabase-js';

export const HOME_READ_CACHE_TTL_MS = 30_000;
const MAX_CONTEXTS_PER_CLIENT = 8;
interface CachedRead { value: unknown; expiresAt: number; timer: ReturnType<typeof setTimeout> }
interface ClientReads { revision: number; values: Map<string, CachedRead>; unsubscribe?: () => void }
const clients = new WeakMap<SupabaseClient, ClientReads>();
const stores = new Set<WeakRef<ClientReads>>();

function clear(store: ClientReads): void {
  store.revision += 1;
  store.values.forEach((entry) => clearTimeout(entry.timer));
  store.values.clear();
}

function reads(client: SupabaseClient): ClientReads {
  let store = clients.get(client);
  if (!store) {
    store = { revision: 0, values: new Map() };
    clients.set(client, store);
    for (const reference of stores) if (!reference.deref()) stores.delete(reference);
    stores.add(new WeakRef(store));
    // Supabase callbacks must stay synchronous. No token, session or private payload is stored here.
    const current = store;
    const subscription = client.auth?.onAuthStateChange?.((event) => { if (event !== 'INITIAL_SESSION') clear(current); });
    current.unsubscribe = subscription?.data?.subscription?.unsubscribe;
  }
  return store;
}

/** Short-lived, memory-only values; account changes invalidate even requests already in flight. */
export function cachedHomeRead<T>(client: SupabaseClient, key: string, create: () => T): T {
  const store = reads(client);
  const now = Date.now();
  for (const [storedKey, entry] of store.values) {
    if (entry.expiresAt <= now) { clearTimeout(entry.timer); store.values.delete(storedKey); }
  }
  const existing = store.values.get(key);
  if (existing) return existing.value as T;
  while (store.values.size >= MAX_CONTEXTS_PER_CLIENT) {
    const first = store.values.entries().next().value as [string, CachedRead] | undefined;
    if (!first) break;
    clearTimeout(first[1].timer); store.values.delete(first[0]);
  }
  const value = create();
  const timer = setTimeout(() => {
    if (store.values.get(key)?.value === value) store.values.delete(key);
  }, HOME_READ_CACHE_TTL_MS);
  store.values.set(key, { value, expiresAt: now + HOME_READ_CACHE_TTL_MS, timer });
  return value;
}

export function discardHomeRead(client: SupabaseClient, key: string, value: unknown): void {
  const store = clients.get(client);
  const entry = store?.values.get(key);
  if (!store || !entry || entry.value !== value) return;
  clearTimeout(entry.timer); store.values.delete(key);
}

export function homeReadRevision(client: SupabaseClient): number { return reads(client).revision; }
export function assertHomeReadRevision(client: SupabaseClient, revision: number): void {
  if (reads(client).revision !== revision) throw new Error('Le contexte de lecture a changé. Actualisez les données.');
}

export function invalidateHomeReadCache(client?: SupabaseClient): void {
  if (client) { const store = clients.get(client); if (store) clear(store); return; }
  for (const reference of stores) {
    const store = reference.deref();
    if (store) clear(store); else stores.delete(reference);
  }
}

export function homeReadContext(namespace: string, roles: readonly string[], personId: number | null, moduleKeys: readonly string[] | undefined, date: string): string {
  return JSON.stringify([namespace, [...new Set(roles)].sort(), personId, moduleKeys === undefined ? null : [...new Set(moduleKeys)].sort(), date]);
}
