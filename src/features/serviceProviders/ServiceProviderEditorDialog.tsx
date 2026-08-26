import { Building2 } from 'lucide-react';
import { useId, type FormEventHandler } from 'react';
import { AppDialog } from '../../components/AppDialog';
import type { ServiceProviderDraft } from './serviceProviders';

interface ServiceProviderEditorDialogProps {
  categories: string[];
  draft: ServiceProviderDraft;
  isSaving: boolean;
  onChange: (draft: ServiceProviderDraft) => void;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  serviceTypes: string[];
  title?: string;
}

export function ServiceProviderEditorDialog({
  categories,
  draft,
  isSaving,
  onChange,
  onClose,
  onSubmit,
  serviceTypes,
  title = 'Ajouter une société',
}: ServiceProviderEditorDialogProps) {
  const categoryListId = useId();
  const serviceTypeListId = useId();
  const update = <K extends keyof ServiceProviderDraft>(key: K, value: ServiceProviderDraft[K]) => onChange({ ...draft, [key]: value });

  return (
    <AppDialog
      description="Les informations sont enregistrées dans le référentiel Supabase et restent reliées à la source SharePoint lorsqu’elle existe."
      footer={<div className="app-dialog__actions"><button className="is-secondary" disabled={isSaving} onClick={onClose} type="button">Annuler</button><button disabled={isSaving} type="submit">{isSaving ? 'Enregistrement…' : 'Enregistrer la société'}</button></div>}
      icon={<Building2 aria-hidden="true" size={20} />}
      isBusy={isSaving}
      onClose={onClose}
      onSubmit={onSubmit}
      size="lg"
      title={title}
    >
      <div className="service-provider-form">
        <label>Nom de la société *<input autoFocus required value={draft.name} onChange={(event) => update('name', event.target.value)} /></label>
        <label>Catégorie<input list={categoryListId} value={draft.category} onChange={(event) => update('category', event.target.value)} /></label>
        <label>Type de service<input list={serviceTypeListId} value={draft.serviceType} onChange={(event) => update('serviceType', event.target.value)} /></label>
        <label>Ville<input value={draft.city} onChange={(event) => update('city', event.target.value)} /></label>
        <label className="is-wide">Activité<textarea rows={2} value={draft.activity} onChange={(event) => update('activity', event.target.value)} /></label>
        <label className="is-wide">Adresse<input value={draft.address} onChange={(event) => update('address', event.target.value)} /></label>
        <label>Téléphone<input value={draft.phone} onChange={(event) => update('phone', event.target.value)} /></label>
        <label>Forme juridique<input value={draft.legalForm} onChange={(event) => update('legalForm', event.target.value)} /></label>
        <label>Email société<input type="email" value={draft.companyEmail} onChange={(event) => update('companyEmail', event.target.value)} /></label>
        <label>Email comptable<input type="email" value={draft.accountingEmail} onChange={(event) => update('accountingEmail', event.target.value)} /></label>
        <label className="is-wide">Fournitures / services<textarea rows={2} value={draft.supplies} onChange={(event) => update('supplies', event.target.value)} /></label>
        <label>Évaluation<input placeholder="Ex. 4,5" value={draft.evaluation} onChange={(event) => update('evaluation', event.target.value)} /></label>
        <label className="service-provider-active-check"><input checked={draft.active} type="checkbox" onChange={(event) => update('active', event.target.checked)} /> Société active</label>
      </div>
      <datalist id={categoryListId}>{categories.map((category) => <option key={category} value={category} />)}</datalist>
      <datalist id={serviceTypeListId}>{serviceTypes.map((serviceType) => <option key={serviceType} value={serviceType} />)}</datalist>
    </AppDialog>
  );
}
