import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Building2,
  Camera,
  Globe2,
  ImagePlus,
  Pencil,
  Plus,
  Search,
  Ship,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import {
  archiveClient,
  archiveProjectTowedAsset,
  saveClient,
  saveProjectTowedAsset,
  type ClientWriteInput,
  type ProjectTowedAssetWriteInput,
} from './projectMutations';
import type { ClientRecord, ProjectTowedAssetRecord } from './projectQueries';
import {
  discoverClientLogoUrl,
  normalizeProjectCatalogUrl,
  removeProjectCatalogImage,
  resolveProjectCatalogImageUrl,
  uploadProjectCatalogImage,
  validateProjectCatalogImage,
} from './projectCatalogMedia';

interface CatalogDialogProps {
  canManage: boolean;
  client: SupabaseClient;
  onChanged: () => void;
  onClose: () => void;
}

interface ClientCatalogDialogProps extends CatalogDialogProps {
  clients: ClientRecord[];
}

interface TowedAssetCatalogDialogProps extends CatalogDialogProps {
  towedAssets: ProjectTowedAssetRecord[];
}

type EditorMode = 'view' | 'edit' | 'create';

function searchableText(values: Array<string | number | null>): string {
  return values
    .filter((value) => value !== null && value !== '')
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR');
}

function queryMatches(values: Array<string | number | null>, query: string): boolean {
  const normalized = searchableText([query]);
  return !normalized || searchableText(values).includes(normalized);
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('fr-FR'))
    .join('') || '—';
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayValue(value: string | number | null): string {
  return value === '' || value === null ? 'Non renseigné' : String(value);
}

function useFilePreview(file: File | null): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) {
      setUrl('');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url;
}

function useCatalogImageUrl(client: SupabaseClient, storagePath: string, externalUrl: string): string {
  const [url, setUrl] = useState(externalUrl);
  useEffect(() => {
    let active = true;
    setUrl(externalUrl);
    void resolveProjectCatalogImageUrl(client, storagePath, externalUrl)
      .then((resolved) => { if (active) setUrl(resolved); })
      .catch(() => { if (active) setUrl(externalUrl); });
    return () => { active = false; };
  }, [client, externalUrl, storagePath]);
  return url;
}

function CatalogImage({ alt, fallback, url }: { alt: string; fallback: string; url: string }) {
  const [failedUrl, setFailedUrl] = useState('');
  if (!url || failedUrl === url) {
    return <span className="project-catalog-image-fallback" aria-hidden="true">{fallback}</span>;
  }
  return <img alt={alt} onError={() => setFailedUrl(url)} src={url} />;
}

function ClientDetails({ client, imageUrl }: { client: ClientRecord; imageUrl: string }) {
  return (
    <div className="project-catalog-view">
      <div className="project-catalog-identity">
        <div className="project-catalog-image is-logo">
          <CatalogImage alt={`Logo de ${client.name}`} fallback={initials(client.name)} url={imageUrl} />
        </div>
        <div>
          <h3>{client.name}</h3>
          <p>{client.code || 'Client sans code'}</p>
        </div>
      </div>
      <dl className="project-catalog-data-grid">
        <div><dt>Représenté par</dt><dd>{displayValue(client.representedBy)}</dd></div>
        <div><dt>Courriel</dt><dd>{displayValue(client.email)}</dd></div>
        <div><dt>Téléphone</dt><dd>{displayValue(client.phone)}</dd></div>
        <div><dt>Site internet</dt><dd>{client.website ? <a href={client.website} rel="noreferrer" target="_blank">{client.website}</a> : 'Non renseigné'}</dd></div>
        <div className="is-wide"><dt>Adresse</dt><dd>{displayValue(client.address)}</dd></div>
        <div><dt>Ville</dt><dd>{displayValue(client.city)}</dd></div>
        <div><dt>Pays</dt><dd>{displayValue(client.country)}</dd></div>
        <div><dt>Statut</dt><dd>{client.active ? 'Actif' : 'Inactif'}</dd></div>
      </dl>
    </div>
  );
}

function emptyClientForm(): ClientWriteInput {
  return {
    active: true,
    address: '',
    city: '',
    clientId: null,
    code: '',
    country: '',
    email: '',
    expectedUpdatedAt: '',
    logoStoragePath: '',
    logoUrl: '',
    name: '',
    phone: '',
    representedBy: '',
    website: '',
  };
}

function clientForm(client?: ClientRecord): ClientWriteInput {
  if (!client) return emptyClientForm();
  return {
    active: client.active,
    address: client.address,
    city: client.city,
    clientId: client.id,
    code: client.code,
    country: client.country,
    email: client.email,
    expectedUpdatedAt: client.updatedAt,
    logoStoragePath: client.logoStoragePath,
    logoUrl: client.logoUrl,
    name: client.name,
    phone: client.phone,
    representedBy: client.representedBy,
    website: client.website,
  };
}

export function ClientCatalogDialog({
  canManage,
  client,
  clients,
  onChanged,
  onClose,
}: ClientCatalogDialogProps) {
  const availableClients = useMemo(
    () => clients.filter((item) => !item.archivedAt),
    [clients],
  );
  const [items, setItems] = useState(availableClients);
  const [selectedId, setSelectedId] = useState<number | null>(availableClients[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<EditorMode>('view');
  const [form, setForm] = useState<ClientWriteInput>(() => clientForm(availableClients[0]));
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const websiteInputId = useId();

  useEffect(() => {
    setItems(availableClients);
    setSelectedId((current) => availableClients.some((item) => item.id === current)
      ? current
      : availableClients[0]?.id ?? null);
  }, [availableClients]);

  const filteredItems = useMemo(
    () => items.filter((item) => queryMatches([
      item.name, item.code, item.representedBy, item.email, item.phone,
      item.address, item.city, item.country, item.website,
    ], query)),
    [items, query],
  );
  const selected = items.find((item) => item.id === selectedId);
  const storedImageUrl = useCatalogImageUrl(client, selected?.logoStoragePath || '', selected?.logoUrl || '');
  const filePreview = useFilePreview(logoFile);
  const editorImageUrl = filePreview || (logoRemoved ? '' : storedImageUrl || form.logoUrl);

  function update<K extends keyof ClientWriteInput>(key: K, value: ClientWriteInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectClient(clientId: number) {
    const next = items.find((item) => item.id === clientId);
    setSelectedId(clientId);
    setForm(clientForm(next));
    setLogoFile(null);
    setLogoRemoved(false);
    setMode('view');
    setErrorMessage('');
    setSuccessMessage('');
  }

  function beginCreate() {
    setSelectedId(null);
    setForm(emptyClientForm());
    setLogoFile(null);
    setLogoRemoved(false);
    setMode('create');
    setErrorMessage('');
    setSuccessMessage('');
  }

  function beginEdit() {
    if (!selected) return;
    setForm(clientForm(selected));
    setLogoFile(null);
    setLogoRemoved(false);
    setMode('edit');
    setErrorMessage('');
    setSuccessMessage('');
  }

  function cancelEdit() {
    setForm(clientForm(selected));
    setLogoFile(null);
    setLogoRemoved(false);
    setMode('view');
    setErrorMessage('');
  }

  function chooseLogo(file: File | undefined) {
    if (!file) return;
    try {
      validateProjectCatalogImage(file);
      setLogoFile(file);
      setLogoRemoved(false);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible d’ajouter ce logo.");
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    let uploadedPath = '';
    try {
      const normalizedWebsite = normalizeProjectCatalogUrl(form.website);
      const normalizedLogoUrl = logoRemoved || logoFile ? '' : normalizeProjectCatalogUrl(form.logoUrl);
      const originalId = form.clientId;
      let savedId = originalId;
      if (savedId === null) {
        savedId = await saveClient(client, {
          ...form,
          logoStoragePath: '',
          logoUrl: normalizedLogoUrl,
          website: normalizedWebsite,
        });
      }
      if (logoFile) {
        uploadedPath = await uploadProjectCatalogImage(client, 'clients', savedId, logoFile);
      }
      const effectivePath = uploadedPath || (logoRemoved ? '' : form.logoStoragePath);
      if (originalId !== null || uploadedPath) {
        await saveClient(client, {
          ...form,
          clientId: savedId,
          expectedUpdatedAt: originalId === null ? '' : form.expectedUpdatedAt,
          logoStoragePath: effectivePath,
          logoUrl: uploadedPath ? '' : normalizedLogoUrl,
          website: normalizedWebsite,
        });
      }
      if (form.logoStoragePath && form.logoStoragePath !== effectivePath) {
        void removeProjectCatalogImage(client, form.logoStoragePath).catch(() => undefined);
      }

      const optimistic: ClientRecord = {
        ...(selected || {
          archivedAt: '',
          id: savedId,
          sharePointItemId: '',
          sharePointListTitle: '',
          sourceLabel: 'seapilot',
          sourceModifiedAt: '',
        }),
        ...form,
        id: savedId,
        logoStoragePath: effectivePath,
        logoUrl: uploadedPath ? '' : normalizedLogoUrl,
        updatedAt: '',
        website: normalizedWebsite,
      };
      setItems((current) => [...current.filter((item) => item.id !== savedId), optimistic]
        .sort((left, right) => left.name.localeCompare(right.name, 'fr')));
      setSelectedId(savedId);
      setForm(clientForm(optimistic));
      setLogoFile(null);
      setLogoRemoved(false);
      setMode('view');
      setSuccessMessage('Client enregistré dans Supabase.');
      onChanged();
    } catch (error) {
      if (uploadedPath) void removeProjectCatalogImage(client, uploadedPath).catch(() => undefined);
      setErrorMessage(error instanceof Error ? error.message : "Impossible d’enregistrer le client.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeClient() {
    if (!selected || !window.confirm(`Supprimer « ${selected.name} » de la liste des clients ?`)) return;
    setIsSaving(true);
    setErrorMessage('');
    try {
      await archiveClient(client, selected.id);
      if (selected.logoStoragePath) {
        void removeProjectCatalogImage(client, selected.logoStoragePath).catch(() => undefined);
      }
      const remaining = items.filter((item) => item.id !== selected.id);
      setItems(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setForm(clientForm(remaining[0]));
      setSuccessMessage('Client supprimé de la liste active.');
      onChanged();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de supprimer le client.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppDialog
      description={`${items.length} client${items.length > 1 ? 's' : ''} dans le catalogue`}
      icon={<Building2 aria-hidden="true" size={20} />}
      isBusy={isSaving}
      onClose={onClose}
      size="fullscreen"
      title="Liste des clients"
    >
      <div className="project-catalog-workspace">
        <aside className="project-catalog-sidebar">
          <div className="project-catalog-sidebar-actions">
            <label className="project-catalog-search">
              <Search aria-hidden="true" size={17} />
              <span className="sr-only">Rechercher un client</span>
              <input onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un client…" type="search" value={query} />
            </label>
            {canManage ? <button className="project-catalog-add" onClick={beginCreate} type="button"><Plus aria-hidden="true" size={17} />Ajouter</button> : null}
          </div>
          <div className="project-catalog-list" role="listbox" aria-label="Clients">
            {filteredItems.map((item) => (
              <button
                aria-selected={item.id === selectedId}
                className={item.id === selectedId ? 'is-selected' : undefined}
                key={item.id}
                onClick={() => selectClient(item.id)}
                role="option"
                type="button"
              >
                <span className="project-catalog-list-avatar">{initials(item.name)}</span>
                <span><strong>{item.name}</strong><small>{[item.code, item.city || item.country].filter(Boolean).join(' · ') || 'Sans coordonnées'}</small></span>
              </button>
            ))}
            {filteredItems.length === 0 ? <p className="project-catalog-empty-list">Aucun client trouvé.</p> : null}
          </div>
        </aside>

        <section className="project-catalog-detail" aria-label="Données du client">
          <div className="project-catalog-detail-toolbar">
            <span>{mode === 'create' ? 'Nouveau client' : mode === 'edit' ? 'Modification' : 'Fiche client'}</span>
            {mode === 'view' && selected && canManage ? <div>
              <button onClick={beginEdit} type="button"><Pencil aria-hidden="true" size={16} />Modifier</button>
              <button className="is-danger" disabled={isSaving} onClick={() => void removeClient()} type="button"><Trash2 aria-hidden="true" size={16} />Supprimer</button>
            </div> : null}
          </div>

          {mode === 'view' && selected ? <ClientDetails client={selected} imageUrl={storedImageUrl} /> : null}
          {mode === 'view' && !selected ? <div className="project-catalog-empty-detail"><Building2 aria-hidden="true" size={34} /><p>Sélectionnez un client.</p></div> : null}
          {mode !== 'view' ? (
            <form className="project-catalog-form" onSubmit={submit}>
              <div className="project-catalog-media-editor">
                <div className="project-catalog-image is-logo">
                  <CatalogImage alt="Aperçu du logo" fallback={initials(form.name)} url={editorImageUrl} />
                </div>
                <div>
                  <strong>Logo de l’entreprise</strong>
                  <div className="project-catalog-media-actions">
                    <label><Upload aria-hidden="true" size={16} />Importer<input accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseLogo(event.target.files?.[0])} type="file" /></label>
                    {(editorImageUrl || form.logoStoragePath || form.logoUrl) ? <button onClick={() => { setLogoFile(null); setLogoRemoved(true); update('logoUrl', ''); }} type="button"><X aria-hidden="true" size={16} />Retirer</button> : null}
                  </div>
                </div>
              </div>
              <div className="project-catalog-form-grid">
                <label className="is-wide"><span>Nom du client *</span><input autoFocus required onChange={(event) => update('name', event.target.value)} value={form.name} /></label>
                <label><span>Code</span><input onChange={(event) => update('code', event.target.value)} value={form.code} /></label>
                <label><span>Représenté par</span><input onChange={(event) => update('representedBy', event.target.value)} value={form.representedBy} /></label>
                <label><span>Courriel</span><input onChange={(event) => update('email', event.target.value)} type="email" value={form.email} /></label>
                <label><span>Téléphone</span><input onChange={(event) => update('phone', event.target.value)} type="tel" value={form.phone} /></label>
                <label className="is-wide"><span>Adresse</span><textarea onChange={(event) => update('address', event.target.value)} value={form.address} /></label>
                <label><span>Ville</span><input onChange={(event) => update('city', event.target.value)} value={form.city} /></label>
                <label><span>Pays</span><input onChange={(event) => update('country', event.target.value)} value={form.country} /></label>
                <div className="project-catalog-field is-wide">
                  <label htmlFor={websiteInputId}>Site internet</label>
                  <span className="project-catalog-inline-field"><Globe2 aria-hidden="true" size={17} /><input id={websiteInputId} inputMode="url" onChange={(event) => update('website', event.target.value)} placeholder="https://entreprise.fr" type="text" value={form.website} /><button onClick={() => { try { update('logoUrl', discoverClientLogoUrl(form.website)); setLogoFile(null); setLogoRemoved(false); setErrorMessage(''); } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Logo introuvable.'); } }} type="button"><ImagePlus aria-hidden="true" size={16} />Trouver le logo</button></span>
                </div>
                <label className="is-wide"><span>URL du logo</span><input inputMode="url" onChange={(event) => { update('logoUrl', event.target.value); setLogoFile(null); setLogoRemoved(false); }} placeholder="https://…/logo.png" type="text" value={form.logoUrl} /></label>
                <label className="project-catalog-active"><input checked={form.active} onChange={(event) => update('active', event.target.checked)} type="checkbox" />Client actif</label>
              </div>
              <div className="project-catalog-form-actions">
                <button disabled={isSaving} onClick={cancelEdit} type="button">Annuler</button>
                <button className="is-primary" disabled={isSaving} type="submit">{isSaving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </form>
          ) : null}
          {errorMessage ? <p className="project-catalog-message is-error" role="alert">{errorMessage}</p> : null}
          {successMessage ? <p className="project-catalog-message is-success" role="status">{successMessage}</p> : null}
        </section>
      </div>
    </AppDialog>
  );
}

function emptyTowedAssetForm(): ProjectTowedAssetWriteInput {
  return {
    assetType: '',
    breadthOverallM: null,
    classificationSociety: '',
    flag: '',
    hullMachineryInsurer: '',
    id: null,
    lengthOverallM: null,
    liabilityInsurer: '',
    lightDisplacementT: null,
    maxDraftM: null,
    name: '',
    ownerName: '',
    photoStoragePath: '',
    photoUrl: '',
    registrationNumber: '',
  };
}

function towedAssetForm(asset?: ProjectTowedAssetRecord): ProjectTowedAssetWriteInput {
  if (!asset) return emptyTowedAssetForm();
  return {
    assetType: asset.assetType,
    breadthOverallM: asset.breadthOverallM,
    classificationSociety: asset.classificationSociety,
    flag: asset.flag,
    hullMachineryInsurer: asset.hullMachineryInsurer,
    id: asset.id,
    lengthOverallM: asset.lengthOverallM,
    liabilityInsurer: asset.liabilityInsurer,
    lightDisplacementT: asset.lightDisplacementT,
    maxDraftM: asset.maxDraftM,
    name: asset.name,
    ownerName: asset.ownerName,
    photoStoragePath: asset.photoStoragePath,
    photoUrl: asset.photoUrl,
    registrationNumber: asset.registrationNumber,
  };
}

function TowedAssetDetails({ asset, imageUrl }: { asset: ProjectTowedAssetRecord; imageUrl: string }) {
  return (
    <div className="project-catalog-view">
      <div className="project-catalog-identity">
        <div className="project-catalog-image is-photo">
          <CatalogImage alt={`Photo de ${asset.name}`} fallback={initials(asset.name)} url={imageUrl} />
        </div>
        <div><h3>{asset.name}</h3><p>{asset.assetType || 'Type non renseigné'}</p></div>
      </div>
      <dl className="project-catalog-data-grid">
        <div><dt>Longueur hors tout</dt><dd>{asset.lengthOverallM === null ? 'Non renseigné' : `${asset.lengthOverallM} m`}</dd></div>
        <div><dt>Largeur hors tout</dt><dd>{asset.breadthOverallM === null ? 'Non renseigné' : `${asset.breadthOverallM} m`}</dd></div>
        <div><dt>Tirant d’eau max</dt><dd>{asset.maxDraftM === null ? 'Non renseigné' : `${asset.maxDraftM} m`}</dd></div>
        <div><dt>Déplacement lège</dt><dd>{asset.lightDisplacementT === null ? 'Non renseigné' : `${asset.lightDisplacementT} T`}</dd></div>
        <div><dt>Pavillon</dt><dd>{displayValue(asset.flag)}</dd></div>
        <div><dt>Société de classification</dt><dd>{displayValue(asset.classificationSociety)}</dd></div>
        <div><dt>N° d’enregistrement</dt><dd>{displayValue(asset.registrationNumber)}</dd></div>
        <div><dt>Propriétaire</dt><dd>{displayValue(asset.ownerName)}</dd></div>
        <div><dt>Assureur corps et machine</dt><dd>{displayValue(asset.hullMachineryInsurer)}</dd></div>
        <div><dt>Assureur RC</dt><dd>{displayValue(asset.liabilityInsurer)}</dd></div>
      </dl>
    </div>
  );
}

export function TowedAssetCatalogDialog({
  canManage,
  client,
  onChanged,
  onClose,
  towedAssets,
}: TowedAssetCatalogDialogProps) {
  const availableAssets = useMemo(() => towedAssets.filter((item) => item.active), [towedAssets]);
  const [items, setItems] = useState(availableAssets);
  const [selectedId, setSelectedId] = useState<number | null>(availableAssets[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<EditorMode>('view');
  const [form, setForm] = useState<ProjectTowedAssetWriteInput>(() => towedAssetForm(availableAssets[0]));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    setItems(availableAssets);
    setSelectedId((current) => availableAssets.some((item) => item.id === current)
      ? current
      : availableAssets[0]?.id ?? null);
  }, [availableAssets]);

  const filteredItems = useMemo(
    () => items.filter((item) => queryMatches([
      item.name, item.assetType, item.flag, item.classificationSociety,
      item.registrationNumber, item.ownerName, item.hullMachineryInsurer, item.liabilityInsurer,
    ], query)),
    [items, query],
  );
  const selected = items.find((item) => item.id === selectedId);
  const storedImageUrl = useCatalogImageUrl(client, selected?.photoStoragePath || '', selected?.photoUrl || '');
  const filePreview = useFilePreview(photoFile);
  const editorImageUrl = filePreview || (photoRemoved ? '' : storedImageUrl || form.photoUrl);

  function update<K extends keyof ProjectTowedAssetWriteInput>(key: K, value: ProjectTowedAssetWriteInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectAsset(assetId: number) {
    const next = items.find((item) => item.id === assetId);
    setSelectedId(assetId);
    setForm(towedAssetForm(next));
    setPhotoFile(null);
    setPhotoRemoved(false);
    setMode('view');
    setErrorMessage('');
    setSuccessMessage('');
  }

  function beginCreate() {
    setSelectedId(null);
    setForm(emptyTowedAssetForm());
    setPhotoFile(null);
    setPhotoRemoved(false);
    setMode('create');
    setErrorMessage('');
    setSuccessMessage('');
  }

  function beginEdit() {
    if (!selected) return;
    setForm(towedAssetForm(selected));
    setPhotoFile(null);
    setPhotoRemoved(false);
    setMode('edit');
    setErrorMessage('');
    setSuccessMessage('');
  }

  function cancelEdit() {
    setForm(towedAssetForm(selected));
    setPhotoFile(null);
    setPhotoRemoved(false);
    setMode('view');
    setErrorMessage('');
  }

  function choosePhoto(file: File | undefined) {
    if (!file) return;
    try {
      validateProjectCatalogImage(file);
      setPhotoFile(file);
      setPhotoRemoved(false);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible d’ajouter cette photo.");
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    let uploadedPath = '';
    try {
      const normalizedPhotoUrl = photoRemoved || photoFile ? '' : normalizeProjectCatalogUrl(form.photoUrl);
      const originalId = form.id;
      let savedId = originalId;
      if (savedId === null) {
        savedId = await saveProjectTowedAsset(client, {
          ...form,
          photoStoragePath: '',
          photoUrl: normalizedPhotoUrl,
        });
      }
      if (photoFile) {
        uploadedPath = await uploadProjectCatalogImage(client, 'towed-assets', savedId, photoFile);
      }
      const effectivePath = uploadedPath || (photoRemoved ? '' : form.photoStoragePath);
      if (originalId !== null || uploadedPath) {
        await saveProjectTowedAsset(client, {
          ...form,
          id: savedId,
          photoStoragePath: effectivePath,
          photoUrl: uploadedPath ? '' : normalizedPhotoUrl,
        });
      }
      if (form.photoStoragePath && form.photoStoragePath !== effectivePath) {
        void removeProjectCatalogImage(client, form.photoStoragePath).catch(() => undefined);
      }

      const optimistic: ProjectTowedAssetRecord = {
        ...form,
        active: true,
        id: savedId,
        photoStoragePath: effectivePath,
        photoUrl: uploadedPath ? '' : normalizedPhotoUrl,
      };
      setItems((current) => [...current.filter((item) => item.id !== savedId), optimistic]
        .sort((left, right) => left.name.localeCompare(right.name, 'fr')));
      setSelectedId(savedId);
      setForm(towedAssetForm(optimistic));
      setPhotoFile(null);
      setPhotoRemoved(false);
      setMode('view');
      setSuccessMessage('Remorqué enregistré dans Supabase.');
      onChanged();
    } catch (error) {
      if (uploadedPath) void removeProjectCatalogImage(client, uploadedPath).catch(() => undefined);
      setErrorMessage(error instanceof Error ? error.message : "Impossible d’enregistrer le remorqué.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeAsset() {
    if (!selected || !window.confirm(`Supprimer « ${selected.name} » de la liste des remorqués ?`)) return;
    setIsSaving(true);
    setErrorMessage('');
    try {
      await archiveProjectTowedAsset(client, selected.id);
      if (selected.photoStoragePath) {
        void removeProjectCatalogImage(client, selected.photoStoragePath).catch(() => undefined);
      }
      const remaining = items.filter((item) => item.id !== selected.id);
      setItems(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setForm(towedAssetForm(remaining[0]));
      setSuccessMessage('Remorqué supprimé de la liste active.');
      onChanged();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de supprimer le remorqué.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppDialog
      description={`${items.length} remorqué${items.length > 1 ? 's' : ''} dans le catalogue`}
      icon={<Ship aria-hidden="true" size={20} />}
      isBusy={isSaving}
      onClose={onClose}
      size="fullscreen"
      title="Liste des remorqués"
    >
      <div className="project-catalog-workspace">
        <aside className="project-catalog-sidebar">
          <div className="project-catalog-sidebar-actions">
            <label className="project-catalog-search">
              <Search aria-hidden="true" size={17} />
              <span className="sr-only">Rechercher un remorqué</span>
              <input onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un remorqué…" type="search" value={query} />
            </label>
            {canManage ? <button className="project-catalog-add" onClick={beginCreate} type="button"><Plus aria-hidden="true" size={17} />Ajouter</button> : null}
          </div>
          <div className="project-catalog-list" role="listbox" aria-label="Remorqués">
            {filteredItems.map((item) => (
              <button
                aria-selected={item.id === selectedId}
                className={item.id === selectedId ? 'is-selected' : undefined}
                key={item.id}
                onClick={() => selectAsset(item.id)}
                role="option"
                type="button"
              >
                <span className="project-catalog-list-avatar"><Ship aria-hidden="true" size={17} /></span>
                <span><strong>{item.name}</strong><small>{[item.assetType, item.flag].filter(Boolean).join(' · ') || 'Sans caractéristiques'}</small></span>
              </button>
            ))}
            {filteredItems.length === 0 ? <p className="project-catalog-empty-list">Aucun remorqué trouvé.</p> : null}
          </div>
        </aside>

        <section className="project-catalog-detail" aria-label="Données du remorqué">
          <div className="project-catalog-detail-toolbar">
            <span>{mode === 'create' ? 'Nouveau remorqué' : mode === 'edit' ? 'Modification' : 'Fiche remorqué'}</span>
            {mode === 'view' && selected && canManage ? <div>
              <button onClick={beginEdit} type="button"><Pencil aria-hidden="true" size={16} />Modifier</button>
              <button className="is-danger" disabled={isSaving} onClick={() => void removeAsset()} type="button"><Trash2 aria-hidden="true" size={16} />Supprimer</button>
            </div> : null}
          </div>

          {mode === 'view' && selected ? <TowedAssetDetails asset={selected} imageUrl={storedImageUrl} /> : null}
          {mode === 'view' && !selected ? <div className="project-catalog-empty-detail"><Ship aria-hidden="true" size={34} /><p>Sélectionnez un remorqué.</p></div> : null}
          {mode !== 'view' ? (
            <form className="project-catalog-form" onSubmit={submit}>
              <div className="project-catalog-media-editor">
                <div className="project-catalog-image is-photo">
                  <CatalogImage alt="Aperçu de la photo" fallback={initials(form.name)} url={editorImageUrl} />
                </div>
                <div>
                  <strong>Photo du remorqué</strong>
                  <div className="project-catalog-media-actions">
                    <label><Camera aria-hidden="true" size={16} />Ajouter une photo<input accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])} type="file" /></label>
                    {(editorImageUrl || form.photoStoragePath || form.photoUrl) ? <button onClick={() => { setPhotoFile(null); setPhotoRemoved(true); update('photoUrl', ''); }} type="button"><X aria-hidden="true" size={16} />Retirer</button> : null}
                  </div>
                </div>
              </div>
              <div className="project-catalog-form-grid">
                <label><span>Nom *</span><input autoFocus required onChange={(event) => update('name', event.target.value)} value={form.name} /></label>
                <label><span>Type d’engin, de navire ou de colis</span><input onChange={(event) => update('assetType', event.target.value)} value={form.assetType} /></label>
                <label><span>Longueur hors tout (m)</span><input min="0" onChange={(event) => update('lengthOverallM', optionalNumber(event.target.value))} step="0.01" type="number" value={form.lengthOverallM ?? ''} /></label>
                <label><span>Largeur hors tout (m)</span><input min="0" onChange={(event) => update('breadthOverallM', optionalNumber(event.target.value))} step="0.01" type="number" value={form.breadthOverallM ?? ''} /></label>
                <label><span>Tirant d’eau max (m)</span><input min="0" onChange={(event) => update('maxDraftM', optionalNumber(event.target.value))} step="0.01" type="number" value={form.maxDraftM ?? ''} /></label>
                <label><span>Déplacement lège (T)</span><input min="0" onChange={(event) => update('lightDisplacementT', optionalNumber(event.target.value))} step="0.01" type="number" value={form.lightDisplacementT ?? ''} /></label>
                <label><span>Pavillon</span><input maxLength={2} onChange={(event) => update('flag', event.target.value.toUpperCase())} placeholder="FR" value={form.flag} /></label>
                <label><span>Société de classification</span><input onChange={(event) => update('classificationSociety', event.target.value)} value={form.classificationSociety} /></label>
                <label><span>N° d’enregistrement</span><input onChange={(event) => update('registrationNumber', event.target.value)} value={form.registrationNumber} /></label>
                <label><span>Propriétaire (si différent de l’affréteur)</span><input onChange={(event) => update('ownerName', event.target.value)} value={form.ownerName} /></label>
                <label><span>Assureur corps et machine</span><input onChange={(event) => update('hullMachineryInsurer', event.target.value)} value={form.hullMachineryInsurer} /></label>
                <label><span>Assureur RC</span><input onChange={(event) => update('liabilityInsurer', event.target.value)} value={form.liabilityInsurer} /></label>
                <label className="is-wide"><span>URL d’une photo</span><input inputMode="url" onChange={(event) => { update('photoUrl', event.target.value); setPhotoFile(null); setPhotoRemoved(false); }} placeholder="https://…/photo.jpg" type="text" value={form.photoUrl} /></label>
              </div>
              <div className="project-catalog-form-actions">
                <button disabled={isSaving} onClick={cancelEdit} type="button">Annuler</button>
                <button className="is-primary" disabled={isSaving} type="submit">{isSaving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </form>
          ) : null}
          {errorMessage ? <p className="project-catalog-message is-error" role="alert">{errorMessage}</p> : null}
          {successMessage ? <p className="project-catalog-message is-success" role="status">{successMessage}</p> : null}
        </section>
      </div>
    </AppDialog>
  );
}
