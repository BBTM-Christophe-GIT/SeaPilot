import { Download, Eye, Image, Network, Settings2, Ship, Users } from 'lucide-react';
import { orgCategoryLabel, orgPopulatedVessels, type OrgData, type OrgOptions } from './organigrammeModel';
import { fleetIllustration } from '../fleet/fleetDisplay';

interface Props {
  data: OrgData | null;
  options: OrgOptions;
  onChange: (options: OrgOptions) => void;
  asOf: string;
  onDateChange: (date: string) => void;
  disabled: boolean;
  canExport: boolean;
  imageFormat: 'png' | 'svg';
  onImageFormatChange: (format: 'png' | 'svg') => void;
  onExportImage: () => void;
  onEdit: (editor: 'watches' | 'structure') => void;
}

export function OrgChartSettings({ data, options, onChange, asOf, onDateChange, disabled, canExport, imageFormat, onImageFormatChange, onExportImage, onEdit }: Props) {
  const vessels = data ? orgPopulatedVessels(data) : [];
  const count = vessels.filter((vessel) => options.vesselIds === null || options.vesselIds.includes(vessel.id)).length;
  return <aside className="org-inspector" aria-label="Réglages de l’organigramme">
    <header className="org-inspector-heading"><Settings2 size={20} aria-hidden="true" /><div><h2>Réglages</h2><p>Composez votre document.</p></div></header>
    <section className="org-inspector-section" aria-label="Présentation">
      <h3><Network size={16} aria-hidden="true" />Présentation</h3>
      <div className="org-tabs org-view-tabs" role="group" aria-label="Présentation de l’organigramme">
        <button type="button" aria-pressed={options.view === 'vessels'} onClick={() => onChange({ ...options, view: 'vessels' })}>Par navire</button>
        <button type="button" aria-pressed={options.view === 'functions'} onClick={() => onChange({ ...options, view: 'functions' })}>Par fonction</button>
      </div>
      <label className="org-date-field">Situation au<input type="date" aria-label="Date de situation" value={asOf} onChange={(event) => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) onDateChange(event.target.value); }} /></label>
    </section>
    <fieldset className="org-inspector-section org-vessel-filter" disabled={disabled} aria-describedby="org-vessel-help">
      <legend><Ship size={16} aria-hidden="true" />Navires à afficher <span>{count} / {vessels.length}</span></legend>
      <div className="org-vessel-actions">
        <button type="button" aria-pressed={options.vesselIds === null} onClick={() => onChange({ ...options, vesselIds: null })}>Tous les navires</button>
        <button type="button" aria-pressed={options.vesselIds?.length === 0} onClick={() => onChange({ ...options, vesselIds: [] })}>Aucun navire</button>
      </div>
      <div className="org-vessel-choices">{vessels.map((vessel) => <label key={vessel.id}><input type="checkbox" checked={options.vesselIds === null || options.vesselIds.includes(vessel.id)} onChange={(event) => {
        const ids = options.vesselIds ?? vessels.map((choice) => choice.id);
        onChange({ ...options, vesselIds: event.target.checked ? [...ids, vessel.id] : ids.filter((id) => id !== vessel.id) });
      }} /><span className="org-vessel-icon"><Ship size={24} aria-hidden="true" />{fleetIllustration(vessel, vessel.iconUrl) && <img src={fleetIllustration(vessel, vessel.iconUrl)} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}</span>{vessel.name}</label>)}</div>
      <p id="org-vessel-help">Les navires sans équipage sont masqués.</p>
    </fieldset>
    <section className="org-inspector-section" aria-label="Affichage">
      <h3><Eye size={16} aria-hidden="true" />Affichage</h3>
      <div className="org-options">{([{ key: 'includeOffice', label: orgCategoryLabel(data || {}, 'office') }, { key: 'includeExternal', label: orgCategoryLabel(data || {}, 'external') }, { key: 'includeUnassigned', label: orgCategoryLabel(data || {}, 'unassigned') }, { key: 'showVessels', label: 'Afficher les navires' }] as const).map(({ key, label }) => <label key={key}><input type="checkbox" checked={options[key]} disabled={key === 'includeUnassigned' && options.vesselIds !== null} onChange={(event) => onChange({ ...options, [key]: event.target.checked })} />{label}</label>)}</div>
      <div className="org-editor-actions">
        <button type="button" className="org-accent" disabled={!data} onClick={() => onEdit('watches')}><Users size={16} aria-hidden="true" />Composer les bordées</button>
        <button type="button" disabled={!data} onClick={() => onEdit('structure')}><Settings2 size={16} aria-hidden="true" />Modifier la structure</button>
      </div>
    </section>
    <section className="org-inspector-section" aria-label="Exports">
      <h3><Image size={16} aria-hidden="true" />Exports</h3>
      <fieldset className="org-export-fields">
        <legend>Informations à inclure</legend>
        {([
          { key: 'showPhotos', label: 'Photos', accessible: 'Inclure les photos dans les exports', checked: options.showPhotos !== false },
          { key: 'showEmails', label: 'E-mails', accessible: 'Inclure les e-mails dans les exports', checked: !!options.showEmails },
          { key: 'showPhones', label: 'Téléphones', accessible: 'Inclure les téléphones dans les exports', checked: !!options.showPhones },
          { key: 'showFunctions', label: 'Fonctions', accessible: 'Inclure les fonctions dans les exports', checked: options.showFunctions !== false },
          { key: 'showVessels', label: 'Navires', accessible: 'Inclure les navires dans les exports', checked: options.showVessels },
          { key: 'showWatches', label: 'Bordées', accessible: 'Inclure les bordées dans les exports', checked: options.showWatches !== false },
        ] as const).map(({ key, label, accessible, checked }) => <label key={key}><input type="checkbox" aria-label={accessible} checked={checked} onChange={(event) => onChange({ ...options, [key]: event.target.checked })} />{label}</label>)}
      </fieldset>
      <p className="org-export-help">L’aperçu reflète le contenu des exports PDF, PNG et SVG. Les noms restent toujours visibles.</p>
      <div className="org-image-export"><select aria-label="Format image" value={imageFormat} onChange={(event) => onImageFormatChange(event.target.value as 'png' | 'svg')}><option value="png">PNG</option><option value="svg">SVG</option></select><button type="button" className="org-primary" disabled={!canExport} onClick={onExportImage}><Download size={16} aria-hidden="true" />Exporter l’image</button></div>
    </section>
  </aside>;
}
