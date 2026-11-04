import type { SupabaseClient } from '@supabase/supabase-js';
import { FileDown } from 'lucide-react';
import { useState } from 'react';
import { getPersonEmploymentPeriods, getHrEnimClassification, type PersonRecord } from './peopleQueries';
import {
  buildEmploymentContractFileName, calculateEmploymentContractEndDate, createEmploymentContractDraft,
  validateEmploymentContractDraft, type EmploymentContractDetails, type EmploymentContractDurationUnit,
  type EmploymentContractType,
} from './employmentContractModel';
import { downloadEmploymentContractSigner, saveEmploymentContract } from './employmentContractQueries';
import { saveEmploymentContractBlob } from './EmploymentContractsSection';
import './employmentContracts.css';

export function EmploymentContractProfileFields({ client, person, details, disabled = false }: {
  client: SupabaseClient;
  person: PersonRecord;
  details: Partial<EmploymentContractDetails>;
  disabled?: boolean;
}) {
  const [duration, setDuration] = useState('');
  const [durationUnit, setDurationUnit] = useState<EmploymentContractDurationUnit>('months');
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const currentPeriod = getPersonEmploymentPeriods(person).at(-1);
  const contractType = (currentPeriod?.contractType || person.contractType).toUpperCase();
  const supported = contractType === 'CDI' || contractType === 'CDD';
  const classification = getHrEnimClassification(person.functionLabel);
  const recordedPerson = {
    ...person, hiredOn: currentPeriod?.hiredOn || person.hiredOn,
    enimFunctionCode: person.enimFunctionCode || classification.functionCode,
    enimCategory: person.enimCategory ?? classification.category,
  };
  const locked = disabled || busy;

  async function generate() {
    if (locked || !supported) return;
    setIssues([]); setNotice('');
    const draft = createEmploymentContractDraft(recordedPerson, contractType as EmploymentContractType, details);
    if (draft.type === 'CDD') {
      try { draft.endDate = calculateEmploymentContractEndDate(draft.startDate, duration, durationUnit); }
      catch (cause) {
        setIssues([cause instanceof Error ? cause.message : 'Renseignez une durée de CDD valide.']);
        return;
      }
    }
    const validation = validateEmploymentContractDraft(draft);
    if (validation.length) { setIssues(validation); return; }
    setBusy(true);
    try {
      const { generateEmploymentContractPdf } = await import('./employmentContractPdf');
      const { signature, blob: signatureBlob } = await downloadEmploymentContractSigner(client);
      const blob = await generateEmploymentContractPdf(draft, {
        bytes: new Uint8Array(await signatureBlob.arrayBuffer()), mimeType: signature.mimeType,
      });
      const fileName = buildEmploymentContractFileName(draft);
      await saveEmploymentContract(client, { personId: person.id, contractType: draft.type,
        fileName, file: blob, inputData: { ...draft, employerRepresentative: signature.signerName,
          employerSignatureId: signature.id, employerSignerPersonId: signature.personId,
          employerSignatureSha256: signature.sha256 } });
      setNotice(`Contrat ${draft.type} généré et enregistré dans Documents.`);
      saveEmploymentContractBlob(blob, fileName);
    } catch (cause) {
      setIssues([cause instanceof Error ? cause.message : 'Impossible de générer et classer le contrat.']);
    } finally { setBusy(false); }
  }

  return <section className="sp-panel hr-contract-profile" aria-label="Génération du contrat de travail">
    {contractType === 'CDD' ? <div className="hr-contract-fields">
      <label><span>Durée du CDD</span><input type="number" inputMode="numeric" min="1" step="1"
        value={duration} disabled={locked} onChange={(event) => { setDuration(event.target.value); setNotice(''); }} /></label>
      <label><span>Unité de durée</span><select value={durationUnit} disabled={locked}
        onChange={(event) => { setDurationUnit(event.target.value as EmploymentContractDurationUnit); setNotice(''); }}>
        <option value="days">Jours</option><option value="weeks">Semaines</option><option value="months">Mois</option>
      </select></label>
    </div> : null}
    <div className="hr-contract-generate-row">
      <button className="sp-button sp-button--primary" type="button" disabled={locked || !supported} onClick={() => void generate()}>
        <FileDown size={17} aria-hidden="true" /> {busy ? 'Génération…' : 'Générer le contrat'}
      </button>
      <p className="hr-contract-help">{supported
        ? `Modèle ${contractType} BBTM · informations enregistrées dans la fiche RH · classement dans Documents.`
        : 'Renseignez un type de contrat CDI ou CDD dans la fiche RH.'}</p>
    </div>
    {contractType === 'CDD' ? <p className="hr-contract-help">La date de fin est calculée depuis la date de début enregistrée, dernier jour inclus.</p> : null}
    {disabled ? <p className="hr-contract-help">Enregistrez la fiche RH avant de générer le contrat.</p> : null}
    {issues.length ? <div className="form-error" role="alert"><strong>Vérifiez les informations de la fiche RH.</strong><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section>;
}
