import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Tag,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AppDialog } from '../../components/AppDialog';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import { ServiceProviderEditorDialog } from './ServiceProviderEditorDialog';
import {
  fetchServiceProviders,
  groupServiceProviders,
  saveServiceProviderContact,
  saveServiceProviderSpecialty,
  saveServiceProviderWithPrimarySpecialty,
  serviceProviderDraft,
  serviceProviderTypeOptions,
  type ServiceProvider,
  type ServiceProviderContactDraft,
  type ServiceProviderDraft,
} from './serviceProviders';

interface ServiceProvidersPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

const EMPTY_CONTACT: ServiceProviderContactDraft = {
  fullName: '',
  roleLabel: '',
  email: '',
  phone: '',
  active: true,
};

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');
}

function evaluationLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Non évalué';
  return /^\d(?:[.,]\d)?$/.test(trimmed) ? `${trimmed.replace(',', '.')}/5` : trimmed;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="service-provider-detail"><dt>{label}</dt><dd>{value || 'Non renseigné'}</dd></div>;
}

export function ServiceProvidersPage({ client, roles }: ServiceProvidersPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const canManage = effectiveRoles.some((role) => role === 'admin' || role === 'direction');
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [state, setState] = useState<'active' | 'inactive' | 'all'>('active');
  const [providerEditor, setProviderEditor] = useState<{ id?: number; draft: ServiceProviderDraft } | null>(null);
  const [specialtyDraft, setSpecialtyDraft] = useState('');
  const [isSpecialtyOpen, setIsSpecialtyOpen] = useState(false);
  const [contactDraft, setContactDraft] = useState<ServiceProviderContactDraft>(EMPTY_CONTACT);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function reload(preferredId?: number) {
    setIsLoading(true);
    setError('');
    try {
      const loaded = await fetchServiceProviders(effectiveClient);
      setProviders(loaded);
      setSelectedProviderId((current) => {
        const requested = preferredId ?? current;
        return loaded.some((provider) => provider.id === requested) ? requested : loaded[0]?.id ?? null;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de charger les sociétés.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [effectiveClient]);

  const categories = useMemo(
    () => Array.from(new Set(providers.map((provider) => provider.category))).sort((left, right) => left.localeCompare(right, 'fr')),
    [providers],
  );
  const serviceTypes = useMemo(() => serviceProviderTypeOptions(providers), [providers]);
  const filteredProviders = useMemo(() => {
    const needle = normalized(query.trim());
    return providers.filter((provider) => {
      if (category && provider.category !== category) return false;
      if (state === 'active' && !provider.active) return false;
      if (state === 'inactive' && provider.active) return false;
      if (!needle) return true;
      return normalized([
        provider.name,
        provider.category,
        provider.serviceType,
        provider.activity,
        provider.city,
        ...provider.specialties.map((specialty) => specialty.name),
      ].join(' ')).includes(needle);
    });
  }, [category, providers, query, state]);
  const groups = useMemo(() => groupServiceProviders(filteredProviders), [filteredProviders]);
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) || null;
  const activeCount = providers.filter((provider) => provider.active).length;

  function openProviderEditor(provider?: ServiceProvider) {
    setProviderEditor({ id: provider?.id, draft: serviceProviderDraft(provider) });
    setMessage('');
    setError('');
  }

  async function submitProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!providerEditor || isSaving) return;
    if (!providerEditor.draft.name.trim()) {
      setError('Le nom de la société est obligatoire.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const saved = await saveServiceProviderWithPrimarySpecialty(effectiveClient, providerEditor.draft, providerEditor.id);
      setProviderEditor(null);
      setMessage(providerEditor.id ? 'Fiche société mise à jour.' : 'Société ajoutée au référentiel.');
      await reload(saved.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer la société.');
    } finally {
      setIsSaving(false);
    }
  }

  async function submitSpecialty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProvider || !specialtyDraft.trim() || isSaving) return;
    setIsSaving(true);
    setError('');
    try {
      await saveServiceProviderSpecialty(effectiveClient, selectedProvider, specialtyDraft);
      setIsSpecialtyOpen(false);
      setSpecialtyDraft('');
      setMessage('Spécialité ajoutée.');
      await reload(selectedProvider.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer la spécialité.');
    } finally {
      setIsSaving(false);
    }
  }

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProvider || !contactDraft.fullName.trim() || (!contactDraft.email.trim() && !contactDraft.phone.trim()) || isSaving) {
      if (!contactDraft.email.trim() && !contactDraft.phone.trim()) setError('Renseignez un email ou un téléphone.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      await saveServiceProviderContact(effectiveClient, selectedProvider, contactDraft);
      setIsContactOpen(false);
      setContactDraft(EMPTY_CONTACT);
      setMessage('Contact ajouté.');
      await reload(selectedProvider.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer le contact.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="service-providers-page">
      <header className="service-providers-command-header">
        <div>
          <span className="service-providers-title-line"><h1>Gestion des Sous-Traitants</h1><b>{activeCount} société{activeCount > 1 ? 's' : ''} active{activeCount > 1 ? 's' : ''}</b></span>
          <p>Référentiel fournisseurs et prestataires issu de « Administration - Prestataires - Fournisseurs ».</p>
        </div>
        {canManage ? <button className="service-provider-primary" onClick={() => openProviderEditor()} type="button"><Building2 aria-hidden="true" size={17} /><Plus aria-hidden="true" size={14} /> Ajouter une société</button> : null}
      </header>

      {message ? <p className="service-provider-message" role="status"><CheckCircle2 aria-hidden="true" size={16} />{message}</p> : null}
      {error ? <p className="service-provider-error" role="alert">{error}</p> : null}

      <div className="service-providers-workspace">
        <aside className="service-provider-directory" aria-label="Répertoire des sociétés">
          <label className="service-provider-search"><Search aria-hidden="true" size={17} /><span className="sr-only">Rechercher une société</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une société, un service ou une ville…" value={query} /></label>
          <div className="service-provider-filters">
            <label>Catégorie<select aria-label="Filtrer par catégorie" onChange={(event) => setCategory(event.target.value)} value={category}><option value="">Toutes les catégories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>État<select aria-label="Filtrer par état" onChange={(event) => setState(event.target.value as typeof state)} value={state}><option value="active">Actives</option><option value="inactive">Inactives</option><option value="all">Toutes</option></select></label>
          </div>
          {isLoading ? <p className="service-provider-empty" role="status">Chargement du référentiel…</p> : groups.length ? (
            <div className="service-provider-groups">
              {groups.map((group) => <section key={group.category} className="service-provider-group"><header><span>{group.category}</span><b>{group.providers.length}</b></header>{group.providers.map((provider) => <button aria-pressed={provider.id === selectedProviderId} className={provider.id === selectedProviderId ? 'is-selected' : ''} key={provider.id} onClick={() => setSelectedProviderId(provider.id)} type="button"><span className="service-provider-list-icon"><Building2 aria-hidden="true" size={16} /></span><span><strong>{provider.name}</strong><small>{provider.serviceType || provider.activity || provider.city || 'Société référencée'}</small></span><em>{provider.contacts.filter((contact) => contact.active).length}<small>contact{provider.contacts.filter((contact) => contact.active).length > 1 ? 's' : ''}</small></em><ChevronRight aria-hidden="true" size={15} /></button>)}</section>)}
            </div>
          ) : <p className="service-provider-empty">Aucune société ne correspond aux filtres.</p>}
        </aside>

        <article className="service-provider-profile">
          {selectedProvider ? <>
            <header className="service-provider-profile-header">
              <span className="service-provider-profile-icon"><Building2 aria-hidden="true" size={24} /></span>
              <div><small>Fiche société</small><span><h2>{selectedProvider.name}</h2><b className={selectedProvider.active ? 'is-active' : 'is-inactive'}>{selectedProvider.active ? 'Actif' : 'Inactif'}</b></span><p>{selectedProvider.category}{selectedProvider.city ? ` · ${selectedProvider.city}` : ''}</p></div>
            </header>
            <div className="service-provider-metrics" aria-label="Indicateurs de la société">
              <span><strong>{selectedProvider.specialties.filter((item) => item.active).length}</strong><small>Spécialités</small></span>
              <span><strong>{selectedProvider.contacts.filter((item) => item.active).length}</strong><small>Contacts</small></span>
              <span><strong>{evaluationLabel(selectedProvider.evaluation)}</strong><small>Évaluation</small></span>
            </div>
            <nav className="service-provider-profile-nav" aria-label="Sections de la fiche"><a href="#societe"><Building2 aria-hidden="true" size={15} />Société</a><a href="#specialites"><Tag aria-hidden="true" size={15} />Spécialités</a><a href="#contacts"><UsersRound aria-hidden="true" size={15} />Contacts</a></nav>
            <div className="service-provider-toolbar"><span><CheckCircle2 aria-hidden="true" size={16} /> Informations à jour</span>{canManage ? <div><button onClick={() => openProviderEditor(selectedProvider)} type="button"><Pencil aria-hidden="true" size={15} /> Modifier la fiche</button><button onClick={() => { setSpecialtyDraft(''); setIsSpecialtyOpen(true); setError(''); }} type="button"><Plus aria-hidden="true" size={15} /> Ajouter une spécialité</button><button className="is-primary" onClick={() => { setContactDraft(EMPTY_CONTACT); setIsContactOpen(true); setError(''); }} type="button"><UserRoundPlus aria-hidden="true" size={15} /> Ajouter un contact</button></div> : null}</div>
            <div className="service-provider-profile-content">
              <section id="societe"><h3>Informations société</h3><dl className="service-provider-details-grid"><Detail label="Adresse" value={[selectedProvider.address, selectedProvider.city].filter(Boolean).join(', ')} /><Detail label="Téléphone général" value={selectedProvider.phone} /><Detail label="Forme juridique" value={selectedProvider.legalForm} /><Detail label="Activité" value={selectedProvider.activity} /><Detail label="Email société" value={selectedProvider.companyEmail} /><Detail label="Email comptable" value={selectedProvider.accountingEmail} /><Detail label="Fournitures / services" value={selectedProvider.supplies || selectedProvider.serviceType} /></dl></section>
              <div>
                <section id="specialites"><div className="service-provider-section-heading"><h3>Spécialités</h3><span>{selectedProvider.specialties.filter((item) => item.active).length} active{selectedProvider.specialties.filter((item) => item.active).length > 1 ? 's' : ''}</span></div><ul className="service-provider-specialties">{selectedProvider.specialties.filter((item) => item.active).map((specialty) => <li key={specialty.id}><span><Tag aria-hidden="true" size={15} /></span><div><strong>{specialty.name}</strong><small>Spécialité active</small></div></li>)}</ul></section>
                <section id="contacts"><div className="service-provider-section-heading"><h3>Contacts</h3><span>{selectedProvider.contacts.filter((item) => item.active).length} actif{selectedProvider.contacts.filter((item) => item.active).length > 1 ? 's' : ''}</span></div><ul className="service-provider-contacts">{selectedProvider.contacts.filter((item) => item.active).map((contact) => <li key={contact.id}><span>{initials(contact.fullName)}</span><div><strong>{contact.fullName}</strong><small>{[contact.roleLabel, contact.phone].filter(Boolean).join(' · ')}</small></div>{contact.email ? <a aria-label={`Écrire à ${contact.fullName}`} href={`mailto:${contact.email}`}><Mail aria-hidden="true" size={16} /></a> : contact.phone ? <a aria-label={`Appeler ${contact.fullName}`} href={`tel:${contact.phone}`}><Phone aria-hidden="true" size={16} /></a> : null}</li>)}</ul></section>
              </div>
            </div>
          </> : <div className="service-provider-profile-empty"><Building2 aria-hidden="true" size={34} /><h2>Sélectionnez une société</h2><p>Sa fiche, ses spécialités et ses contacts apparaîtront ici.</p></div>}
        </article>
      </div>

      {providerEditor ? <ServiceProviderEditorDialog categories={categories} draft={providerEditor.draft} isSaving={isSaving} onChange={(draft) => setProviderEditor((current) => current ? { ...current, draft } : null)} onClose={() => setProviderEditor(null)} onSubmit={submitProvider} serviceTypes={serviceTypes} title={providerEditor.id ? 'Modifier la société' : 'Ajouter une société'} /> : null}

      {isSpecialtyOpen && selectedProvider ? <AppDialog footer={<div className="app-dialog__actions"><button className="is-secondary" disabled={isSaving} onClick={() => setIsSpecialtyOpen(false)} type="button">Annuler</button><button disabled={isSaving} type="submit">Ajouter</button></div>} icon={<Tag aria-hidden="true" size={20} />} isBusy={isSaving} onClose={() => setIsSpecialtyOpen(false)} onSubmit={submitSpecialty} title="Ajouter une spécialité"><label className="service-provider-dialog-field">Spécialité *<input autoFocus required value={specialtyDraft} onChange={(event) => setSpecialtyDraft(event.target.value)} /></label></AppDialog> : null}

      {isContactOpen && selectedProvider ? <AppDialog footer={<div className="app-dialog__actions"><button className="is-secondary" disabled={isSaving} onClick={() => setIsContactOpen(false)} type="button">Annuler</button><button disabled={isSaving} type="submit">Ajouter le contact</button></div>} icon={<UserRoundPlus aria-hidden="true" size={20} />} isBusy={isSaving} onClose={() => setIsContactOpen(false)} onSubmit={submitContact} title="Ajouter un contact"><div className="service-provider-contact-form"><label>Prénom NOM *<input autoFocus required value={contactDraft.fullName} onChange={(event) => setContactDraft((current) => ({ ...current, fullName: event.target.value }))} /></label><label>Fonction<input value={contactDraft.roleLabel} onChange={(event) => setContactDraft((current) => ({ ...current, roleLabel: event.target.value }))} /></label><label><Mail aria-hidden="true" size={14} /> Email<input type="email" value={contactDraft.email} onChange={(event) => setContactDraft((current) => ({ ...current, email: event.target.value }))} /></label><label><Phone aria-hidden="true" size={14} /> Téléphone<input value={contactDraft.phone} onChange={(event) => setContactDraft((current) => ({ ...current, phone: event.target.value }))} /></label><p><MapPin aria-hidden="true" size={15} /> Un email ou un téléphone est obligatoire.</p></div></AppDialog> : null}
    </section>
  );
}
