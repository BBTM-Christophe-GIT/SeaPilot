import { useEffect, useMemo, useState } from 'react';
import { FileDown } from 'lucide-react';
import type { OrgData } from './organigrammeModel';
import { groupOrgContacts, selectedOrgContacts, toggleOrgContacts, type OrgContactDocument } from './organigrammeContacts';

export function OrgPersonnelPanel({ data, kind, disabled }: { data: OrgData; kind: OrgContactDocument; disabled: boolean }) {
  const [selections, setSelections] = useState<Record<OrgContactDocument, Set<number> | null>>({ personnel: null, emergency: null });
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.url); }, [download]);
  const groups = useMemo(() => groupOrgContacts(data.people), [data.people]);
  const personnel = useMemo(() => selectedOrgContacts(data.people, selections.personnel, 'personnel'), [data.people, selections.personnel]);
  const emergency = useMemo(() => selectedOrgContacts(data.people, selections.emergency, 'emergency'), [data.people, selections.emergency]);
  const selected = kind === 'personnel' ? personnel : emergency;
  const ids = new Set(selected.map((person) => person.id));
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const query = normalize(search.trim());
  const visibleGroups = groups.map((group) => ({ ...group, visible: group.people.filter((person) => normalize(`${person.name} ${person.functionLabel} ${person.email || ''} ${person.phone || ''}`).includes(query)) })).filter((group) => group.visible.length);
  const locked = disabled || exporting;
  const missing = selected.filter((person) => !person.phone?.trim()).length;
  const setIds = (next: Set<number> | null) => setSelections((previous) => ({ ...previous, [kind]: next }));
  const update = (personIds: number[], checked: boolean) => setIds(toggleOrgContacts(ids, personIds, checked));
  async function exportPdf(both: boolean) {
    if (locked || !selected.length || (both && (!personnel.length || !emergency.length))) return;
    setExporting(true); setError('');
    try {
      const [{ buildOrgContactsPdf }, { downloadOrgBlob }] = await Promise.all([import('./organigrammeContactsPdf'), import('./organigrammeExport')]);
      const documents = both ? [{ kind: 'personnel' as const, people: personnel }, { kind: 'emergency' as const, people: emergency }] : [{ kind, people: selected }];
      const blob = await buildOrgContactsPdf(documents, data.asOf);
      const name = `BBTM_${both ? 'Personnel_et_urgences' : kind === 'personnel' ? 'Liste_du_personnel' : 'Numeros_urgence'}_${data.asOf}.pdf`;
      setDownload({ url: URL.createObjectURL(blob), name });
      downloadOrgBlob(blob, name);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Export impossible.'); }
    finally { setExporting(false); }
  }
  return <section className={`org-contacts org-controls${kind === 'emergency' ? ' org-contacts--emergency' : ''}`} aria-label={kind === 'personnel' ? 'Liste du personnel' : 'Numéros d’urgence'}>
    <div className="org-contact-heading"><div><h2>{kind === 'personnel' ? 'Liste du personnel' : 'Numéros d’urgence'}</h2><p>{kind === 'personnel' ? 'Classement par fonction. Cochez une fonction entière ou choisissez les personnes individuellement.' : 'Les sédentaires sont présélectionnés. Ajoutez ou retirez les personnes à joindre en cas d’urgence.'}</p></div>
      <div className="org-actions"><button type="button" className="org-primary" disabled={locked || !selected.length} onClick={() => void exportPdf(false)}><FileDown size={16} />{kind === 'personnel' ? 'Exporter le personnel en PDF' : 'Exporter les urgences en PDF'}</button><button type="button" disabled={locked || !personnel.length || !emergency.length} onClick={() => void exportPdf(true)}>Exporter les deux listes</button></div>
    </div>
    <p className="org-contact-help">Coordonnées issues des fiches RH. Chaque liste a sa propre sélection. Dans l’export regroupé, les urgences commencent sur une nouvelle page.</p>
    <div className="org-contact-toolbar"><label>Rechercher une personne ou une fonction<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <button type="button" disabled={locked} onClick={() => setIds(new Set(data.people.map((person) => person.id)))}>Tout sélectionner</button><button type="button" disabled={locked} onClick={() => setIds(new Set())}>Tout désélectionner</button>
      {kind === 'emergency' && <button type="button" disabled={locked} onClick={() => setIds(null)}>Rétablir les sédentaires</button>}
    </div>
    <p role="status">{selected.length} personne(s) sélectionnée(s) pour {kind === 'personnel' ? 'la liste du personnel' : 'les urgences'}{query ? ' · La recherche ne modifie pas la sélection exportée.' : ''}</p>
    {missing > 0 && <p className="org-notice">{missing} personne(s) sélectionnée(s) sans téléphone renseigné. Complétez leurs coordonnées dans RH / Brevets.</p>}
    {disabled && <p role="status">Actualisez les données avant d’exporter cette liste.</p>}
    {error && <p className="org-error" role="alert">{error}</p>}
    {download && <p className="org-download" role="status">Export prêt : <a href={download.url} download={download.name}>Télécharger {download.name}</a></p>}
    <fieldset disabled={locked} className="org-contact-selection"><legend className="org-sr-only">Personnes à inclure dans le PDF</legend>
      {visibleGroups.map((group) => {
        const count = group.people.filter((person) => ids.has(person.id)).length;
        return <section className="org-contact-group" key={group.functionLabel} aria-label={group.functionLabel}>
          <h3><label><input type="checkbox" checked={count === group.people.length} ref={(node) => { if (node) node.indeterminate = count > 0 && count < group.people.length; }} onChange={(event) => update(group.people.map((person) => person.id), event.target.checked)} aria-label={`Inclure la fonction ${group.functionLabel}`} />{group.functionLabel} <span>{count} / {group.people.length}</span></label></h3>
          <div className="org-contact-table-wrap"><table><thead><tr><th scope="col">Personne</th><th scope="col">Email</th><th scope="col">Téléphone</th></tr></thead><tbody>{group.visible.map((person) => <tr key={person.id}><td><label><input type="checkbox" checked={ids.has(person.id)} onChange={(event) => update([person.id], event.target.checked)} aria-label={`Inclure ${person.name}`} />{person.name}</label></td><td>{person.email || 'Non renseigné'}</td><td>{person.phone || 'Non renseigné'}</td></tr>)}</tbody></table></div>
        </section>;
      })}
      {!visibleGroups.length && <p>Aucune personne ne correspond à cette recherche.</p>}
    </fieldset>
    {exporting && <p role="status">Préparation du PDF…</p>}
  </section>;
}
