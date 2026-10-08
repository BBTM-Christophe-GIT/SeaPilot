import { useEffect, useMemo, useState } from 'react';
import { FileDown } from 'lucide-react';
import type { OrgData } from './organigrammeModel';
import { groupOrgContacts, orgContactPeople, ORG_CONTACT_CONTENT, selectedOrgContacts, toggleOrgContacts, type OrgContactDocument } from './organigrammeContacts';
import { OrgExportFields, type OrgExportContent } from './OrgExportFields';

export function OrgPersonnelPanel({ data, kind, disabled, onSaveDefault, previewMode = false }: { data: OrgData; kind: OrgContactDocument; disabled: boolean; onSaveDefault?: (ids: number[]) => Promise<void>; previewMode?: boolean }) {
  const [selections, setSelections] = useState<Record<OrgContactDocument, Set<number> | null>>({ personnel: null, emergency: null });
  const [contents, setContents] = useState<Record<OrgContactDocument, OrgExportContent>>({ personnel: { ...ORG_CONTACT_CONTENT }, emergency: { ...ORG_CONTACT_CONTENT } });
  const content = contents[kind];
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.url); }, [download]);
  const people = useMemo(() => orgContactPeople(data), [data]);
  const groups = useMemo(() => groupOrgContacts(people), [people]);
  const personnel = useMemo(() => selectedOrgContacts(people, selections.personnel, 'personnel'), [people, selections.personnel]);
  const emergency = useMemo(() => selectedOrgContacts(people, selections.emergency, 'emergency', data.emergencyDefaultIds), [people, selections.emergency, data.emergencyDefaultIds]);
  const selected = kind === 'personnel' ? personnel : emergency;
  const ids = new Set(selected.map((person) => person.id));
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const query = normalize(search.trim());
  const visibleGroups = groups.map((group) => ({ ...group, visible: group.people.filter((person) => normalize(`${person.name} ${person.functionLabel} ${person.email || ''} ${person.phone || ''}`).includes(query)) })).filter((group) => group.visible.length);
  const locked = disabled || exporting || saving;
  const missingPhotos = (document: OrgContactDocument) => contents[document].showPhotos && (document === 'personnel' ? personnel : emergency).some((person) => person.photoUnavailable);
  const missing = selected.filter((person) => !person.phone?.trim()).length;
  const setIds = (next: Set<number> | null) => { setSelections((previous) => ({ ...previous, [kind]: next })); setSaved(''); };
  const update = (personIds: number[], checked: boolean) => setIds(toggleOrgContacts(ids, personIds, checked));
  async function exportPdf(both: boolean) {
    if (locked || !selected.length || missingPhotos(kind) || (both && (!personnel.length || !emergency.length || missingPhotos('personnel') || missingPhotos('emergency')))) return;
    setExporting(true); setError('');
    try {
      const [{ buildOrgContactsPdf }, { downloadOrgBlob }] = await Promise.all([import('./organigrammeContactsPdf'), import('./organigrammeExport')]);
      const documents = both ? [{ kind: 'personnel' as const, people: personnel, content: contents.personnel }, { kind: 'emergency' as const, people: emergency, content: contents.emergency }] : [{ kind, people: selected, content }];
      const blob = await buildOrgContactsPdf(documents, data.asOf);
      const name = `BBTM_${both ? 'Personnel_et_urgences' : kind === 'personnel' ? 'Liste_du_personnel' : 'Numeros_urgence'}_${data.asOf}.pdf`;
      setDownload({ url: URL.createObjectURL(blob), name });
      downloadOrgBlob(blob, name);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Export impossible.'); }
    finally { setExporting(false); }
  }
  async function saveDefault() {
    if (locked || !onSaveDefault) return;
    setSaving(true); setError(''); setSaved('');
    try {
      await onSaveDefault(emergency.map((person) => person.id));
      setSelections((previous) => ({ ...previous, emergency: null }));
      setSaved(previewMode ? 'Liste par défaut enregistrée dans cette démonstration.' : 'Liste d’urgence par défaut enregistrée pour l’entreprise.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.'); }
    finally { setSaving(false); }
  }
  return <section className={`org-contacts org-controls${kind === 'emergency' ? ' org-contacts--emergency' : ''}`} aria-label={kind === 'personnel' ? 'Liste du personnel' : 'Numéros d’urgence'}>
    <div className="org-contact-heading"><div><h2>{kind === 'personnel' ? 'Liste du personnel' : 'Numéros d’urgence'}</h2><p>{kind === 'personnel' ? 'Classement par fonction et nom de famille. Cochez un groupe de fonction ou choisissez les personnes individuellement.' : 'Choisissez les personnes à joindre en cas d’urgence. Vous pouvez enregistrer cette sélection comme liste par défaut.'}</p></div>
      <div className="org-actions"><button type="button" className="org-primary" disabled={locked || !selected.length || !!missingPhotos(kind)} onClick={() => void exportPdf(false)}><FileDown size={16} />{kind === 'personnel' ? 'Exporter le personnel en PDF' : 'Exporter les urgences en PDF'}</button><button type="button" disabled={locked || !personnel.length || !emergency.length || !!missingPhotos('personnel') || !!missingPhotos('emergency')} onClick={() => void exportPdf(true)}>Exporter les deux listes</button></div>
    </div>
    <p className="org-contact-help">Président, Julien LECOCQ, Christophe MINASSIAN et Sophie HAMEL en tête ; stagiaires en dernier.</p>
    <p className="org-contact-help">Coordonnées issues des fiches RH. Chaque liste a sa propre sélection. Dans l’export regroupé, les urgences commencent sur une nouvelle page.</p>
    <div className="org-contact-export-settings"><OrgExportFields options={content} disabled={locked} onChange={(key, value) => setContents((previous) => ({ ...previous, [kind]: { ...previous[kind], [key]: value } }))} /><p className="org-export-help">{kind === 'personnel' ? 'PDF sur une page A4, avec une mise en page ajustée à la sélection.' : 'Le PDF conserve une taille de texte lisible et ajoute des pages si nécessaire.'} Les colonnes ci-dessous reflètent les informations choisies.</p></div>
    {kind === 'emergency' && <div className="org-emergency-default"><p>{data.emergencyDefaultIds == null ? 'Liste par défaut : les sédentaires.' : 'Une liste personnalisée est enregistrée pour l’entreprise.'} Modifiez les cases des personnes, puis enregistrez pour la retrouver à la prochaine ouverture.</p><div className="org-actions"><button type="button" disabled={locked || !onSaveDefault} onClick={() => void saveDefault()}>{saving ? 'Enregistrement…' : 'Enregistrer comme liste par défaut'}</button><button type="button" disabled={locked} onClick={() => setIds(null)}>Charger la liste par défaut</button></div>{previewMode && <p>En démonstration, la liste mémorisée reste locale à cette préversion.</p>}</div>}
    <div className="org-contact-toolbar"><label>Rechercher une personne ou une fonction<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <button type="button" disabled={locked} onClick={() => setIds(new Set(data.people.map((person) => person.id)))}>Tout sélectionner</button><button type="button" disabled={locked} onClick={() => setIds(new Set())}>Tout désélectionner</button>
      {kind === 'emergency' && <button type="button" disabled={locked} onClick={() => setIds(new Set(data.people.filter((person) => person.population === 'sedentary').map((person) => person.id)))}>Rétablir les sédentaires</button>}
    </div>
    <p role="status">{selected.length} personne(s) sélectionnée(s) pour {kind === 'personnel' ? 'la liste du personnel' : 'les urgences'}{query ? ' · La recherche ne modifie pas la sélection exportée.' : ''}</p>
    {content.showPhones && missing > 0 && <p className="org-notice">{missing} personne(s) sélectionnée(s) sans téléphone renseigné. Complétez leurs coordonnées dans RH / Brevets.</p>}
    {missingPhotos(kind) && <p className="org-notice">Une photo sélectionnée est indisponible. Actualisez ou décochez Photos pour exporter.</p>}
    {disabled && <p role="status">Actualisez les données avant d’exporter cette liste.</p>}
    {error && <p className="org-error" role="alert">{error}</p>}
    {saved && <p role="status">{saved}</p>}
    {download && <p className="org-download" role="status">Export prêt : <a href={download.url} download={download.name}>Télécharger {download.name}</a></p>}
    <fieldset disabled={locked} className="org-contact-selection"><legend className="org-sr-only">Personnes à inclure dans le PDF</legend>
      {visibleGroups.map((group) => {
        const count = group.people.filter((person) => ids.has(person.id)).length;
        return <section className="org-contact-group" key={group.key} aria-label={group.functionLabel}>
          {content.showFunctions !== false && <h3><label><input type="checkbox" checked={count === group.people.length} ref={(node) => { if (node) node.indeterminate = count > 0 && count < group.people.length; }} onChange={(event) => update(group.people.map((person) => person.id), event.target.checked)} aria-label={`Inclure la fonction ${group.functionLabel}`} />{group.functionLabel} <span>{count} / {group.people.length}</span></label></h3>}
          <div className="org-contact-table-wrap"><table><thead><tr>{content.showPhotos && <th scope="col">Photo</th>}<th scope="col">Prénom NOM</th>{content.showEmails && <th scope="col">Email</th>}{content.showPhones && <th scope="col">Téléphone</th>}{content.showVessels && <th scope="col">Navire</th>}{content.showWatches && <th scope="col">Bordée</th>}</tr></thead><tbody>{group.visible.map((person) => <tr key={person.id}>{content.showPhotos && <td>{person.photoUrl ? <img className="org-contact-portrait" src={person.photoUrl} alt={`Photo de ${person.name}`} /> : '—'}</td>}<td><label><input type="checkbox" checked={ids.has(person.id)} onChange={(event) => update([person.id], event.target.checked)} aria-label={`Inclure ${person.name}`} />{person.name}</label></td>{content.showEmails && <td>{person.email || 'Non renseigné'}</td>}{content.showPhones && <td>{person.phone || 'Non renseigné'}</td>}{content.showVessels && <td>{person.vesselLabel || '—'}</td>}{content.showWatches && <td>{person.watchLabel || '—'}</td>}</tr>)}</tbody></table></div>
        </section>;
      })}
      {!visibleGroups.length && <p>Aucune personne ne correspond à cette recherche.</p>}
    </fieldset>
    {exporting && <p role="status">Préparation du PDF…</p>}
  </section>;
}
