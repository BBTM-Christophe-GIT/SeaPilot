import type { SupabaseClient } from '@supabase/supabase-js';
import { Download, FileSignature } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PersonRecord } from './peopleQueries';
import {
  downloadEmploymentContract, loadEmploymentContracts,
  type EmploymentContractRecord,
} from './employmentContractQueries';
import './employmentContracts.css';

export function saveEmploymentContractBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function EmploymentContractsSection({ client, person }: { client: SupabaseClient; person: PersonRecord }) {
  const [contracts, setContracts] = useState<EmploymentContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setContracts([]);
    setError('');
    loadEmploymentContracts(client, person.id)
      .then((items) => { if (active) { setContracts(items); setError(''); } })
      .catch(() => { if (active) setError('Impossible de charger les contrats de travail.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, person.id]);

  async function download(contract: EmploymentContractRecord) {
    setBusy(true); setError('');
    try { saveEmploymentContractBlob(await downloadEmploymentContract(client, contract), contract.fileName); }
    catch { setError('Impossible de télécharger le contrat.'); }
    finally { setBusy(false); }
  }

  return <section aria-label="Contrats de travail" className="hr-contract-documents sp-panel">
    <div className="hr-profile-section-title"><h3><FileSignature size={18} aria-hidden="true" /> Contrats de travail</h3><span>{contracts.length}</span></div>
    <p className="hr-contract-help">Accès réservé à Administrateur et Direction. La génération se fait depuis « Contrat et dates ».</p>
    {loading ? <p role="status">Chargement des contrats…</p> : contracts.length ? <ul className="hr-contract-list">
      {contracts.map((contract) => <li key={contract.id}>
        <div><strong>{contract.title}</strong><small>{contract.contractType} · {new Date(contract.createdAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} · PDF</small></div>
        <button className="sp-button sp-button--secondary" disabled={busy} type="button" onClick={() => void download(contract)} aria-label={`Télécharger ${contract.fileName}`}><Download size={16} aria-hidden="true" /> Télécharger</button>
      </li>)}
    </ul> : <p>Aucun contrat généré pour ce collaborateur.</p>}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </section>;
}
