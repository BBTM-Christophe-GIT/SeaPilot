import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  WorkingTimeActiveSignature,
  WorkingTimeSignatureSnapshot,
  WorkingTimeValidationEvent,
  WorkingTimeWorkspace,
  WorkingTimeWorkspaceRegister,
} from './workingTimeQueries';

export interface WorkingTimePdfSigner {
  label: string;
  personId: number | null;
  signerName: string;
  snapshot: WorkingTimeSignatureSnapshot | null;
}

interface SignatureEvidence {
  personId: number;
  snapshot: WorkingTimeSignatureSnapshot | null;
  occurredAt: string;
  id: number;
}

interface SignatureRow {
  id: number | string;
  person_id: number | string;
  version_number: number | string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number | string;
  sha256: string;
  valid_from: string;
}

/** The register holder's canonical HR function is independent of the exporter. */
export function isWorkingTimeCaptainRegister(register: Pick<WorkingTimeWorkspaceRegister, 'functionLabel'>): boolean {
  return register.functionLabel === 'Capitaine';
}

function latestEvidence(evidence: SignatureEvidence[]): SignatureEvidence | null {
  return evidence.sort((left, right) => {
    const timeDifference = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    return timeDifference || right.id - left.id;
  })[0] || null;
}

function personName(workspace: WorkingTimeWorkspace, personId: number | null): string {
  const person = [...workspace.readablePeople, ...workspace.editablePeople]
    .find((candidate) => candidate.personId === personId);
  return person ? `${person.firstName} ${person.lastName}`.trim() : '';
}

/** Resolve identities from this register's evidence, never from the logged-in user. */
export function resolveWorkingTimePdfSigners(
  workspace: WorkingTimeWorkspace,
  register: WorkingTimeWorkspaceRegister,
  audit: WorkingTimeValidationEvent[],
): WorkingTimePdfSigner[] {
  const approvals = workspace.dayApprovals.filter((approval) => approval.registerId === register.id
    && approval.companyId === register.companyId && approval.personId === register.personId
    && approval.localWorkDate >= register.periodStart && approval.localWorkDate <= register.periodEnd);
  const holderEvidence: SignatureEvidence[] = audit.flatMap((event) => {
    const snapshot = event.signatureSnapshot;
    return (event.eventType === 'sailor_signed' || event.eventType === 'captain_validated')
      && snapshot?.signerPersonId === register.personId
      ? [{ personId: register.personId, snapshot, occurredAt: event.occurredAt, id: event.id }]
      : [];
  });
  for (const approval of approvals) {
    const snapshot = approval.subjectSignatureSnapshot;
    if (snapshot?.signerPersonId === register.personId) {
      holderEvidence.push({ personId: register.personId, snapshot,
        occurredAt: snapshot.signedAt || approval.submittedAt || approval.validatedAt || '', id: approval.id });
    }
  }
  const holder: WorkingTimePdfSigner = {
    label: isWorkingTimeCaptainRegister(register) ? 'Capitaine / Valideur' : 'Marin',
    personId: register.personId,
    signerName: register.personName,
    snapshot: latestEvidence(holderEvidence)?.snapshot || null,
  };
  if (isWorkingTimeCaptainRegister(register)) return [holder];

  const validatorEvidence: SignatureEvidence[] = audit.flatMap((event) => {
    const snapshot = event.signatureSnapshot;
    return event.eventType === 'captain_validated' && snapshot?.signerPersonId
      ? [{ personId: snapshot.signerPersonId, snapshot, occurredAt: event.occurredAt, id: event.id }]
      : [];
  });
  for (const approval of approvals) {
    if (approval.status !== 'validated') continue;
    const snapshot = approval.approverSignatureSnapshot;
    const personId = approval.validatedByPersonId || snapshot?.signerPersonId;
    if (personId) {
      validatorEvidence.push({ personId,
        snapshot: snapshot?.signerPersonId === personId ? snapshot : null,
        occurredAt: approval.validatedAt || snapshot?.signedAt || '', id: approval.id });
    }
  }
  const validator = latestEvidence(validatorEvidence);
  const designatedApproval = [...approvals].filter((approval) => approval.approverPersonId)
    .sort((left, right) => right.localWorkDate.localeCompare(left.localWorkDate) || right.id - left.id)[0];
  const validatorPersonId = validator?.personId || register.requestedCaptainPersonId
    || designatedApproval?.approverPersonId || null;
  return [holder, {
    label: 'Capitaine / Valideur',
    personId: validatorPersonId,
    signerName: personName(workspace, validatorPersonId) || validator?.snapshot?.signerName || 'la personne désignée',
    snapshot: validator?.snapshot || null,
  }];
}

/** Refresh the displayed images at export time, with the existing table RLS. */
export async function fetchLatestWorkingTimePdfSignatures(
  client: SupabaseClient,
  companyId: number,
  personIds: number[],
): Promise<WorkingTimeActiveSignature[]> {
  const scope = Array.from(new Set(personIds.filter((id) => id > 0)));
  if (!scope.length) return [];
  const { data, error } = await client.from('working_time_profile_signatures')
    .select('id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,valid_from')
    .eq('company_id', companyId)
    .in('person_id', scope)
    .is('valid_to', null)
    .order('version_number', { ascending: false });
  if (error) throw new Error('Impossible de charger les dernières signatures enregistrées.');
  const latest = new Map<number, WorkingTimeActiveSignature>();
  for (const row of (data || []) as SignatureRow[]) {
    const personId = Number(row.person_id);
    // Also enforce the target identity locally so an unrelated profile can never be substituted.
    if (!scope.includes(personId) || (latest.get(personId)?.versionNumber || 0) >= Number(row.version_number)) continue;
    latest.set(personId, {
      id: Number(row.id), personId, versionNumber: Number(row.version_number),
      storageBucket: row.storage_bucket, storagePath: row.storage_path,
      mimeType: row.mime_type, fileSizeBytes: Number(row.file_size_bytes), sha256: row.sha256,
      validFrom: row.valid_from,
    });
  }
  return [...latest.values()];
}
