import type { SupabaseClient } from '@supabase/supabase-js';
import { getFleetCertificateCategory, getFleetCertificateCategoryParent } from '../fleetCertificates/fleetCertificateCategories';

export const SERVICE_NOTE_FILE_BUCKET = 'service-note-files';
export const SERVICE_NOTE_MAX_FILE_BYTES = 52_428_800;

export type ServiceNoteStatus = 'draft' | 'published' | 'archived';
export type ServiceNoteAttachmentKind = 'file' | 'procedure' | 'action_item' | 'fleet_certificate';

export interface ServiceNoteSignatureSnapshot {
  signatureId: number;
  signerPersonId: number;
  signerUserId: string;
  signerName: string;
  signedAt: string;
  versionNumber: number;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  sha256: string;
}

export interface ServiceNoteAttachment {
  id: number;
  noteId: number;
  kind: ServiceNoteAttachmentKind;
  displayName: string;
  storageBucket: string;
  storagePath: string;
  externalUrl: string;
  linkedRecordId: number | null;
  mimeType: string;
  fileSizeBytes: number | null;
  sortOrder: number;
}

export interface ServiceNoteRecipient {
  id: number;
  noteId: number;
  userId: string;
  personId: number | null;
  firstName: string;
  lastName: string;
  functionLabel: string;
}

export interface ServiceNoteSignature {
  id: number;
  noteId: number;
  recipientId: number;
  userId: string;
  personId: number;
  identitySnapshot: Record<string, unknown>;
  signatureSnapshot: ServiceNoteSignatureSnapshot;
  signedAt: string;
}

export interface ServiceNote {
  id: number;
  companyId: number;
  chronologyCode: string;
  subject: string;
  body: string;
  vesselId: number | null;
  vesselName: string;
  status: ServiceNoteStatus;
  authorPersonId: number | null;
  authorIdentitySnapshot: Record<string, unknown>;
  authorSignatureSnapshot: ServiceNoteSignatureSnapshot | null;
  authoredOn: string;
  publishedAt: string;
  sourceKind: 'seapilot' | 'sharepoint';
  sourceFileName: string;
  sourceWebUrl: string;
  sourceModifiedAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  attachments: ServiceNoteAttachment[];
  recipients: ServiceNoteRecipient[];
  signatures: ServiceNoteSignature[];
}

export interface ServiceNoteDraftInput {
  subject: string;
  body: string;
  vesselId: number | null;
  authoredOn: string;
}

export interface ServiceNoteLinkOption {
  id: number;
  kind: Exclude<ServiceNoteAttachmentKind, 'file'>;
  label: string;
  description: string;
  href: string;
  groupPath: string[];
}

export interface ServiceNoteNotification {
  noteId: number;
  chronologyCode: string;
  subject: string;
  publishedAt: string;
}

interface NoteRow {
  id: number | string;
  company_id: number | string;
  chronology_code: string | null;
  subject: string | null;
  body: string | null;
  vessel_id: number | string | null;
  status: string;
  author_person_id: number | string | null;
  author_identity_snapshot: Record<string, unknown> | null;
  author_signature_snapshot: Record<string, unknown> | null;
  authored_on: string;
  published_at: string | null;
  source_kind: 'seapilot' | 'sharepoint';
  source_file_name: string | null;
  source_web_url: string | null;
  source_modified_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  vessel: { name?: string | null; acronym?: string | null } | Array<{ name?: string | null; acronym?: string | null }> | null;
}

interface AttachmentRow {
  id: number | string;
  note_id: number | string;
  attachment_kind: ServiceNoteAttachmentKind;
  display_name: string;
  storage_bucket: string | null;
  storage_path: string | null;
  external_url: string | null;
  linked_record_id: number | string | null;
  mime_type: string | null;
  file_size_bytes: number | string | null;
  sort_order: number | string;
}

interface RecipientRow {
  id: number | string;
  note_id: number | string;
  user_id: string;
  person_id: number | string | null;
  first_name_snapshot: string | null;
  last_name_snapshot: string | null;
  function_snapshot: string | null;
}

interface SignatureRow {
  id: number | string;
  note_id: number | string;
  recipient_id: number | string;
  user_id: string;
  person_id: number | string;
  identity_snapshot: Record<string, unknown> | null;
  signature_snapshot: Record<string, unknown> | null;
  signed_at: string;
}

function assertResult(error: { message?: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined || value === '' ? null : Number(value);
}

function mapSignatureSnapshot(value: Record<string, unknown> | null | undefined): ServiceNoteSignatureSnapshot | null {
  if (!value || !value.storage_bucket || !value.storage_path) return null;
  return {
    signatureId: Number(value.signature_id || 0),
    signerPersonId: Number(value.signer_person_id || 0),
    signerUserId: text(value.signer_user_id),
    signerName: text(value.signer_name),
    signedAt: text(value.signed_at),
    versionNumber: Number(value.version_number || 0),
    storageBucket: text(value.storage_bucket),
    storagePath: text(value.storage_path),
    mimeType: text(value.mime_type) || 'image/png',
    sha256: text(value.sha256),
  };
}

function relationVessel(row: NoteRow['vessel']): string {
  const vessel = Array.isArray(row) ? row[0] : row;
  return text(vessel?.name || vessel?.acronym);
}

const ISM_CHAPTER_LABELS: Record<string, string> = {
  '01': '01 - Généralités',
  '02': "02 - Politique en Matière de Sécurité et de Protection de l'Environnement",
  '03': '03 - Responsabilité et Autorité de la Compagnie',
  '04': '04 - Personne(s) Désignée(s)',
  '05': '05 - Responsabilité et Autorité du Capitaine',
  '06': '06 - Ressources et Personnel',
  '07': '07 - Établissement de Plans pour les Opérations à Bord',
  '08': "08 - Préparation aux Situations d'Urgence",
  '09': '09 - Rapports et Analyse des Non-conformités, Accidents et Incidents',
  '10': '10 - Maintenance du Navire et de son Équipement',
  '11': '11 - Documentation',
  '12': '12 - Vérification, Examen et Évaluation de la Compagnie',
  '13': '13 - Certification, Vérification et Contrôle',
  uncontrolled: 'Documents non contrôlés',
  unassigned: 'ISM - Chapitre non renseigné',
};

function ismChapterLabel(value: unknown): string {
  const raw = text(value).trim();
  const key = raw.match(/^\d{1,2}/u)?.[0]?.padStart(2, '0')
    || (raw.toLocaleLowerCase('fr').includes('non contr') ? 'uncontrolled' : 'unassigned');
  return ISM_CHAPTER_LABELS[key] || raw || ISM_CHAPTER_LABELS.unassigned;
}

function procedureLinkLabel(codeValue: unknown, titleValue: unknown): string {
  const code = text(codeValue).trim();
  const title = removeFileExtension(text(titleValue)).trim();
  const titleWithoutCode = code && title.toLocaleLowerCase('fr').startsWith(code.toLocaleLowerCase('fr'))
    ? title.slice(code.length).replace(/^\s*[-–—·]\s*/u, '').trim()
    : title;
  return [code, titleWithoutCode].filter(Boolean).join(' - ');
}

export function removeFileExtension(value: string): string {
  return value.trim().replace(/\.[^.\\]+$/u, '');
}

export function formatServiceNoteDate(value: string): string {
  if (!value) return 'Non renseignée';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

export function buildOfficeDesktopUrl(url: string): string {
  return `ms-word:ofe|u|${url.replace(/[?&]web=1\b/u, '').replace(/[?&]$/u, '')}`;
}

export async function fetchServiceNotes(client: SupabaseClient): Promise<ServiceNote[]> {
  const { data: noteData, error: noteError } = await client
    .from('qhse_service_notes')
    .select('id,company_id,chronology_code,subject,body,vessel_id,status,author_person_id,author_identity_snapshot,author_signature_snapshot,authored_on,published_at,source_kind,source_file_name,source_web_url,source_modified_at,created_by,created_at,updated_at,vessel:vessels!qhse_service_notes_vessel_id_fkey(name,acronym)')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false });
  assertResult(noteError, 'Impossible de charger les notes de service.');
  const noteRows = (noteData || []) as unknown as NoteRow[];
  if (!noteRows.length) return [];

  const noteIds = noteRows.map((row) => Number(row.id));
  const [attachmentResult, recipientResult, signatureResult] = await Promise.all([
    client.from('qhse_service_note_attachments').select('id,note_id,attachment_kind,display_name,storage_bucket,storage_path,external_url,linked_record_id,mime_type,file_size_bytes,sort_order').in('note_id', noteIds).order('sort_order'),
    client.from('qhse_service_note_recipients').select('id,note_id,user_id,person_id,first_name_snapshot,last_name_snapshot,function_snapshot').in('note_id', noteIds).order('last_name_snapshot'),
    client.from('qhse_service_note_signatures').select('id,note_id,recipient_id,user_id,person_id,identity_snapshot,signature_snapshot,signed_at').in('note_id', noteIds).order('signed_at'),
  ]);
  assertResult(attachmentResult.error, 'Impossible de charger les pièces jointes.');
  assertResult(recipientResult.error, 'Impossible de charger les destinataires.');
  assertResult(signatureResult.error, 'Impossible de charger les signatures.');

  const attachments = ((attachmentResult.data || []) as AttachmentRow[]).map<ServiceNoteAttachment>((row) => ({
    id: Number(row.id), noteId: Number(row.note_id), kind: row.attachment_kind,
    displayName: row.display_name, storageBucket: text(row.storage_bucket), storagePath: text(row.storage_path),
    externalUrl: text(row.external_url), linkedRecordId: numberOrNull(row.linked_record_id), mimeType: text(row.mime_type),
    fileSizeBytes: numberOrNull(row.file_size_bytes), sortOrder: Number(row.sort_order),
  }));
  const recipients = ((recipientResult.data || []) as RecipientRow[]).map<ServiceNoteRecipient>((row) => ({
    id: Number(row.id), noteId: Number(row.note_id), userId: row.user_id, personId: numberOrNull(row.person_id),
    firstName: text(row.first_name_snapshot), lastName: text(row.last_name_snapshot), functionLabel: text(row.function_snapshot),
  }));
  const signatures = ((signatureResult.data || []) as SignatureRow[]).map<ServiceNoteSignature>((row) => ({
    id: Number(row.id), noteId: Number(row.note_id), recipientId: Number(row.recipient_id), userId: row.user_id,
    personId: Number(row.person_id), identitySnapshot: row.identity_snapshot || {},
    signatureSnapshot: mapSignatureSnapshot(row.signature_snapshot) as ServiceNoteSignatureSnapshot, signedAt: row.signed_at,
  }));

  return noteRows.map<ServiceNote>((row) => ({
    id: Number(row.id), companyId: Number(row.company_id), chronologyCode: text(row.chronology_code),
    subject: text(row.subject), body: text(row.body), vesselId: numberOrNull(row.vessel_id), vesselName: relationVessel(row.vessel),
    status: row.status as ServiceNoteStatus, authorPersonId: numberOrNull(row.author_person_id),
    authorIdentitySnapshot: row.author_identity_snapshot || {}, authorSignatureSnapshot: mapSignatureSnapshot(row.author_signature_snapshot),
    authoredOn: row.authored_on, publishedAt: text(row.published_at), sourceKind: row.source_kind,
    sourceFileName: text(row.source_file_name), sourceWebUrl: text(row.source_web_url), sourceModifiedAt: text(row.source_modified_at),
    createdBy: text(row.created_by), createdAt: row.created_at, updatedAt: row.updated_at,
    attachments: attachments.filter((item) => item.noteId === Number(row.id)),
    recipients: recipients.filter((item) => item.noteId === Number(row.id)),
    signatures: signatures.filter((item) => item.noteId === Number(row.id)),
  }));
}

export async function createServiceNoteDraft(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.rpc('service_note_create_draft');
  assertResult(error, 'Impossible de créer le brouillon.');
  return Number(data);
}

export async function saveServiceNoteDraft(client: SupabaseClient, noteId: number, input: ServiceNoteDraftInput): Promise<void> {
  const { error } = await client.from('qhse_service_notes').update({
    subject: input.subject.trim(), body: input.body,
    vessel_id: input.vesselId, authored_on: input.authoredOn, updated_at: new Date().toISOString(),
  }).eq('id', noteId).eq('status', 'draft');
  assertResult(error, 'Impossible d’enregistrer le brouillon.');
  window.dispatchEvent(new Event('service-notes:changed'));
}

function safeStorageName(value: string): string {
  const extension = value.includes('.') ? `.${value.split('.').pop()}` : '';
  const base = removeFileExtension(value).normalize('NFD').replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-zA-Z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 80) || 'piece-jointe';
  return `${base}${extension.toLowerCase()}`;
}

export async function uploadServiceNoteAttachment(client: SupabaseClient, note: ServiceNote, file: File): Promise<void> {
  if (file.size < 1 || file.size > SERVICE_NOTE_MAX_FILE_BYTES) throw new Error('Chaque pièce jointe doit peser moins de 50 Mo.');
  const { data: contextData, error: contextError } = await client.rpc('service_note_upload_context', { p_note_id: note.id });
  assertResult(contextError, 'Vous n’êtes pas autorisé à déposer cette pièce jointe.');
  const context = (contextData || {}) as { company_id?: number; note_id?: number; bucket?: string; path_prefix?: string };
  if (Number(context.note_id) !== note.id || Number(context.company_id) !== note.companyId || context.bucket !== SERVICE_NOTE_FILE_BUCKET || !context.path_prefix) {
    throw new Error('Le périmètre de dépôt est invalide.');
  }
  const storagePath = `${context.path_prefix}${crypto.randomUUID()}-${safeStorageName(file.name)}`;
  const { error: uploadError } = await client.storage.from(SERVICE_NOTE_FILE_BUCKET).upload(storagePath, file, {
    cacheControl: '3600', contentType: file.type || 'application/octet-stream', upsert: false,
  });
  assertResult(uploadError, 'Impossible de déposer la pièce jointe.');
  const { error } = await client.from('qhse_service_note_attachments').insert({
    company_id: note.companyId, note_id: note.id, attachment_kind: 'file', display_name: removeFileExtension(file.name),
    storage_bucket: SERVICE_NOTE_FILE_BUCKET, storage_path: storagePath, mime_type: file.type || 'application/octet-stream',
    file_size_bytes: file.size, sort_order: note.attachments.length,
  });
  if (error) {
    await client.storage.from(SERVICE_NOTE_FILE_BUCKET).remove([storagePath]);
    throw new Error(error.message || 'Impossible d’enregistrer la pièce jointe.');
  }
}

export async function linkServiceNoteRecord(client: SupabaseClient, note: ServiceNote, option: ServiceNoteLinkOption): Promise<void> {
  const { error } = await client.from('qhse_service_note_attachments').insert({
    company_id: note.companyId, note_id: note.id, attachment_kind: option.kind, display_name: option.label,
    external_url: option.href, linked_record_id: option.id, sort_order: note.attachments.length,
  });
  assertResult(error, 'Impossible de lier cet élément.');
}

export async function deleteServiceNoteAttachment(client: SupabaseClient, attachment: ServiceNoteAttachment): Promise<void> {
  const { error } = await client.from('qhse_service_note_attachments').delete().eq('id', attachment.id);
  assertResult(error, 'Impossible de retirer cette pièce jointe.');
  if (attachment.storageBucket && attachment.storagePath) {
    const { error: storageError } = await client.storage.from(attachment.storageBucket).remove([attachment.storagePath]);
    assertResult(storageError, 'La référence a été retirée, mais le fichier n’a pas pu être supprimé.');
  }
}

export async function fetchServiceNoteLinkOptions(client: SupabaseClient): Promise<ServiceNoteLinkOption[]> {
  const [procedures, actions, certificates] = await Promise.all([
    client.from('published_procedures').select('id,procedure_code,title,ism_chapter').order('ism_chapter').order('procedure_code'),
    client.from('action_items').select('id,title,vessel_name,deviation_type,action_type,audit_type,category_key').order('vessel_name').order('deviation_type').order('title'),
    client.from('fleet_certificates').select('id,document_title,title,vessel_name,category_key,category_label').eq('is_active_fleet', true).order('vessel_name').order('category_label').order('document_title'),
  ]);
  assertResult(procedures.error, 'Impossible de charger les procédures QHSE.');
  assertResult(actions.error, 'Impossible de charger le plan d’action.');
  assertResult(certificates.error, 'Impossible de charger les certificats flotte.');
  return [
    ...((procedures.data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: Number(row.id), kind: 'procedure' as const, label: procedureLinkLabel(row.procedure_code, row.title),
      description: 'Procédure QHSE', href: `/modules/procedures?document=${row.id}`,
      groupPath: [ismChapterLabel(row.ism_chapter)],
    })),
    ...((actions.data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: Number(row.id), kind: 'action_item' as const, label: text(row.title),
      description: 'Plan d’action', href: `/modules/actionPlan?action=${row.id}`,
      groupPath: [text(row.vessel_name) || 'Sans navire / lieu', text(row.deviation_type || row.action_type || row.audit_type || row.category_key) || 'Sans type d’écart'],
    })),
    ...((certificates.data || []) as Array<Record<string, unknown>>).map((row) => {
      const category = getFleetCertificateCategory(text(row.category_key), text(row.category_label));
      const parent = getFleetCertificateCategoryParent(category);
      return {
        id: Number(row.id), kind: 'fleet_certificate' as const, label: removeFileExtension(text(row.document_title || row.title)),
        description: 'Certificat flotte', href: `/modules/certificates?certificate=${row.id}`,
        groupPath: [text(row.vessel_name) || 'Sans navire', ...(parent ? [parent.label, category.label] : [category.label || 'Sans catégorie'])],
      };
    }),
  ];
}

export async function publishServiceNote(client: SupabaseClient, noteId: number): Promise<void> {
  const { error } = await client.rpc('publish_service_note', { p_note_id: noteId });
  assertResult(error, 'Impossible de diffuser la note de service.');
  window.dispatchEvent(new Event('service-notes:changed'));
}

export async function signServiceNote(client: SupabaseClient, noteId: number): Promise<void> {
  const { error } = await client.rpc('sign_service_note', { p_note_id: noteId });
  assertResult(error, 'Impossible de signer la note de service.');
  window.dispatchEvent(new Event('service-notes:changed'));
}

export async function createServiceNoteAttachmentUrl(client: SupabaseClient, attachment: ServiceNoteAttachment): Promise<string> {
  if (attachment.externalUrl) return attachment.externalUrl;
  if (!attachment.storageBucket || !attachment.storagePath) return '';
  const { data, error } = await client.storage.from(attachment.storageBucket).createSignedUrl(attachment.storagePath, 900);
  assertResult(error, 'Impossible d’ouvrir la pièce jointe.');
  return data?.signedUrl || '';
}

export async function createServiceNoteSignatureUrl(client: SupabaseClient, snapshot: ServiceNoteSignatureSnapshot | null): Promise<string> {
  if (!snapshot) return '';
  const { data, error } = await client.storage.from(snapshot.storageBucket).createSignedUrl(snapshot.storagePath, 900);
  assertResult(error, 'Impossible d’afficher la signature.');
  return data?.signedUrl || '';
}

export async function fetchUnsignedServiceNoteNotifications(client: SupabaseClient): Promise<ServiceNoteNotification[]> {
  const { data: userData, error: userError } = await client.auth.getUser();
  assertResult(userError, 'Impossible d’identifier le compte courant.');
  const userId = userData.user?.id;
  if (!userId) return [];
  const [recipientResult, signatureResult] = await Promise.all([
    client.from('qhse_service_note_recipients').select('note_id').eq('user_id', userId),
    client.from('qhse_service_note_signatures').select('note_id').eq('user_id', userId),
  ]);
  assertResult(recipientResult.error, 'Impossible de charger les notifications.');
  assertResult(signatureResult.error, 'Impossible de charger les signatures.');
  const signedIds = new Set(((signatureResult.data || []) as Array<{ note_id: number }>).map((row) => Number(row.note_id)));
  const noteIds = ((recipientResult.data || []) as Array<{ note_id: number }>).map((row) => Number(row.note_id)).filter((id) => !signedIds.has(id));
  if (!noteIds.length) return [];
  const { data, error } = await client.from('qhse_service_notes').select('id,chronology_code,subject,published_at').in('id', noteIds).eq('status', 'published').order('published_at', { ascending: false });
  assertResult(error, 'Impossible de charger les notes à signer.');
  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    noteId: Number(row.id), chronologyCode: text(row.chronology_code), subject: text(row.subject), publishedAt: text(row.published_at),
  }));
}
