import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FLEET_CERTIFICATE_BUCKET,
  FleetCertificateRenewalReceiptError,
  submitFleetCertificateRenewal,
  type FleetCertificateRecord,
  type SubmitFleetCertificateRenewalInput,
} from './fleetCertificateQueries';

const objectId = '11111111-2222-4333-8444-555555555555';
const normalizedName = 'NAVIRE TEST - Certificat de sécurité - 2026.pdf';
const uploadedPath = `99/TST/701/renewals/${objectId}-NAVIRE-TEST---Certificat-de-securite---2026.pdf`;

function certificate(overrides: Partial<FleetCertificateRecord> = {}): FleetCertificateRecord {
  return {
    id: 701,
    companyId: 99,
    vesselId: 33,
    vesselName: 'NAVIRE TEST',
    vesselAcronym: 'TST',
    categoryKey: 'certificate',
    categoryLabel: 'Certificat',
    documentTitle: 'Certificat de sécurité',
    title: 'Certificat de sécurité',
    status: 'expired',
    issuedOn: '2024-01-10',
    expiresOn: '2025-01-10',
    plannedOn: '2026-11-01',
    alarmOn: '2024-10-12',
    providerName: 'Prestataire test',
    visitLocation: 'Port test',
    workflowStatus: 'planned',
    renewalNotes: 'Ancien suivi',
    renamingRuleKey: 'vessel-title-issued-year',
    originalFileName: 'ancien-certificat.pdf',
    fileName: 'NAVIRE TEST - Certificat de sécurité - 2024.pdf',
    sourceLabel: 'test-fixture',
    fileUrl: '',
    storageBucket: FLEET_CERTIFICATE_BUCKET,
    storagePath: '99/TST/legacy/ancien-certificat.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 100,
    currentVersionNo: 47,
    isActiveFleet: true,
    notes: 'Document actif conservé',
    updatedAt: '2025-01-01T12:00:00Z',
    ...overrides,
  };
}

function renewalInput(): SubmitFleetCertificateRenewalInput {
  return {
    file: new File(['new certificate'], 'scan-renouvellement.pdf', { type: 'application/pdf' }),
    issuedOn: '2026-11-04',
    expiresOn: '2027-11-04',
    notes: '  Nouveau document reçu  ',
  };
}

function createClient(receipt: unknown = 903) {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn().mockResolvedValue({ data: receipt, error: null });
  const from = vi.fn();
  const storageFrom = vi.fn().mockReturnValue({ upload, remove });
  const client = { rpc, from, storage: { from: storageFrom } };
  return { client, from, remove, rpc, storageFrom, upload };
}

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue(objectId) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('submitFleetCertificateRenewal', () => {
  it('uploads a fresh UUID object before submitting its metadata and returns the RPC version ID', async () => {
    const { client, remove, rpc, storageFrom, upload } = createClient();
    const current = certificate();
    const input = renewalInput();

    const submission: Promise<number> = submitFleetCertificateRenewal(client as never, current, input);
    await expect(submission).resolves.toBe(903);

    expect(storageFrom).toHaveBeenCalledWith(FLEET_CERTIFICATE_BUCKET);
    expect(upload).toHaveBeenCalledExactlyOnceWith(uploadedPath, input.file, {
      contentType: 'application/pdf',
      upsert: false,
    });
    expect(uploadedPath).not.toBe(current.storagePath);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('submit_fleet_certificate_renewal', {
      p_certificate_id: current.id,
      p_original_file_name: input.file.name,
      p_normalized_file_name: normalizedName,
      p_storage_path: uploadedPath,
      p_mime_type: 'application/pdf',
      p_file_size_bytes: input.file.size,
      p_issued_on: '2026-11-04',
      p_expires_on: '2027-11-04',
      p_notes: 'Nouveau document reçu',
    });
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    { receipt: '903', expected: 903 },
    { receipt: Number.MAX_SAFE_INTEGER, expected: Number.MAX_SAFE_INTEGER },
  ])('accepts the safe positive version ID $receipt as a number', async ({ receipt, expected }) => {
    const { client, remove } = createClient(receipt);

    const submission: Promise<number> = submitFleetCertificateRenewal(client as never, certificate(), renewalInput());

    await expect(submission).resolves.toBe(expected);
    expect(remove).not.toHaveBeenCalled();
  });

  it('waits for the upload to succeed before calling the RPC', async () => {
    const { client, rpc, upload } = createClient();
    let finishUpload!: (result: { error: null }) => void;
    upload.mockReturnValueOnce(new Promise((resolve) => { finishUpload = resolve; }));

    const submission = submitFleetCertificateRenewal(client as never, certificate(), renewalInput());

    expect(upload).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
    finishUpload({ error: null });
    await expect(submission).resolves.toBe(903);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it('does not call the RPC or remove the current document when upload fails', async () => {
    const { client, remove, rpc, upload } = createClient();
    const uploadError = { message: 'Upload refused', statusCode: '403' };
    upload.mockResolvedValueOnce({ error: uploadError });

    await expect(submitFleetCertificateRenewal(client as never, certificate(), renewalInput())).rejects.toBe(uploadError);

    expect(rpc).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes only the fresh upload and preserves the RPC error when submission fails', async () => {
    const { client, remove, rpc } = createClient();
    const current = certificate();
    const rpcError = { message: 'Submission refused', code: '42501' };
    rpc.mockResolvedValueOnce({ data: null, error: rpcError });

    await expect(submitFleetCertificateRenewal(client as never, current, renewalInput())).rejects.toBe(rpcError);

    expect(remove).toHaveBeenCalledExactlyOnceWith([uploadedPath]);
    expect(remove.mock.calls[0][0]).not.toContain(current.storagePath);
  });

  it.each([
    { label: 'null', receipt: null },
    { label: 'zero', receipt: 0 },
    { label: 'fraction', receipt: 1.5 },
    { label: 'unsafe integer string', receipt: '9007199254740992' },
  ])('retains the committed upload when the successful RPC receipt is $label', async ({ receipt }) => {
    const { client, remove, rpc, upload } = createClient();
    rpc.mockResolvedValueOnce({ data: receipt, error: null });

    await expect(submitFleetCertificateRenewal(client as never, certificate(), renewalInput()))
      .rejects.toBeInstanceOf(FleetCertificateRenewalReceiptError);

    expect(upload).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps the expired active certificate unchanged and uses the server ID instead of guessing from its version number', async () => {
    const { client, from, remove } = createClient(903);
    const current = Object.freeze(certificate());
    const original = { ...current };

    await expect(submitFleetCertificateRenewal(client as never, current, renewalInput())).resolves.toBe(903);

    expect(current).toEqual(original);
    expect(current).toMatchObject({
      status: 'expired',
      expiresOn: '2025-01-10',
      currentVersionNo: 47,
      storagePath: '99/TST/legacy/ancien-certificat.pdf',
      workflowStatus: 'planned',
    });
    expect(from).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
