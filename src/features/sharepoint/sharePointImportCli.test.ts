import { describe, expect, it, vi } from 'vitest';
import { runSharePointImportCli } from './sharePointImportCli';

const exportBundle = {
  exportedAt: '2026-07-01T22:00:00Z',
  sources: [
    {
      sourceKey: 'list-bbtm-flotte',
      items: [
        {
          fields: {
            ID: 12,
            Title: 'COTENTIN',
            Acronyme: 'CTN',
          },
        },
      ],
    },
    {
      sourceKey: 'list-rh-personnel-bbtm',
      items: [
        {
          fields: {
            ID: 42,
            Title: 'LECOCQ',
            Pr_x00e9_nom: 'Julien',
          },
        },
      ],
    },
  ],
};

describe('runSharePointImportCli', () => {
  it('reads an export bundle and reports batches without writing in dry-run mode', async () => {
    const readTextFile = vi.fn().mockResolvedValue(JSON.stringify(exportBundle));
    const createClient = vi.fn();
    const writeLine = vi.fn();

    await expect(
      runSharePointImportCli(
        ['--file', 'C:/exports/sharepoint.json', '--dry-run'],
        {},
        {
          createClient,
          readTextFile,
          writeLine,
        },
      ),
    ).resolves.toBe(0);

    expect(readTextFile).toHaveBeenCalledWith('C:/exports/sharepoint.json');
    expect(createClient).not.toHaveBeenCalled();
    expect(writeLine).toHaveBeenCalledWith('Dry run: 2 source(s), 2 row(s) ready to import.');
  });

  it('imports an export bundle using Supabase service credentials', async () => {
    const readTextFile = vi.fn().mockResolvedValue(JSON.stringify(exportBundle));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    const client = { from };
    const createClient = vi.fn().mockReturnValue(client);
    const writeLine = vi.fn();

    await expect(
      runSharePointImportCli(
        ['--file', 'C:/exports/sharepoint.json'],
        {
          SUPABASE_URL: 'http://127.0.0.1:54321',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        },
        {
          createClient,
          readTextFile,
          writeLine,
        },
      ),
    ).resolves.toBe(0);

    expect(createClient).toHaveBeenCalledWith('http://127.0.0.1:54321', 'service-role-key');
    expect(from).toHaveBeenCalledWith('vessels');
    expect(from).toHaveBeenCalledWith('people');
    expect(writeLine).toHaveBeenCalledWith('Imported 2 row(s) from 2 source(s).');
  });

  it('can resolve imported planning links after import', async () => {
    const readTextFile = vi.fn().mockResolvedValue(JSON.stringify(exportBundle));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          target_table: 'planning_days',
          resolved_people: 1,
          resolved_vessels: 1,
        },
      ],
      error: null,
    });
    const from = vi.fn().mockReturnValue({ upsert });
    const client = { from, rpc };
    const createClient = vi.fn().mockReturnValue(client);
    const writeLine = vi.fn();

    await expect(
      runSharePointImportCli(
        ['--file', 'C:/exports/sharepoint.json', '--resolve-planning-links'],
        {
          SUPABASE_URL: 'http://127.0.0.1:54321',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        },
        {
          createClient,
          readTextFile,
          writeLine,
        },
      ),
    ).resolves.toBe(0);

    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_planning_links');
    expect(writeLine).toHaveBeenCalledWith('Resolved planning links: 1 people link(s), 1 vessel link(s).');
  });

  it('can resolve imported HR document links after import', async () => {
    const readTextFile = vi.fn().mockResolvedValue(JSON.stringify(exportBundle));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const rpc = vi.fn().mockImplementation((functionName: string) => {
      if (functionName === 'resolve_sharepoint_hr_document_links') {
        return Promise.resolve({
          data: [
            {
              target_table: 'hr_documents',
              resolved_documents: 3,
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected RPC ${functionName}`);
    });
    const from = vi.fn().mockReturnValue({ upsert });
    const client = { from, rpc };
    const createClient = vi.fn().mockReturnValue(client);
    const writeLine = vi.fn();

    await expect(
      runSharePointImportCli(
        ['--file', 'C:/exports/sharepoint.json', '--resolve-hr-document-links'],
        {
          SUPABASE_URL: 'http://127.0.0.1:54321',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        },
        {
          createClient,
          readTextFile,
          writeLine,
        },
      ),
    ).resolves.toBe(0);

    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_hr_document_links');
    expect(writeLine).toHaveBeenCalledWith('Resolved HR document links: 3 document link(s).');
  });

  it('can resolve imported fleet certificate links after import', async () => {
    const readTextFile = vi.fn().mockResolvedValue(JSON.stringify(exportBundle));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const rpc = vi.fn().mockImplementation((functionName: string) => {
      if (functionName === 'resolve_sharepoint_fleet_certificate_links') {
        return Promise.resolve({
          data: [
            {
              target_table: 'fleet_certificates',
              resolved_certificates: 4,
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected RPC ${functionName}`);
    });
    const from = vi.fn().mockReturnValue({ upsert });
    const client = { from, rpc };
    const createClient = vi.fn().mockReturnValue(client);
    const writeLine = vi.fn();

    await expect(
      runSharePointImportCli(
        ['--file', 'C:/exports/sharepoint.json', '--resolve-fleet-certificate-links'],
        {
          SUPABASE_URL: 'http://127.0.0.1:54321',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        },
        {
          createClient,
          readTextFile,
          writeLine,
        },
      ),
    ).resolves.toBe(0);

    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_fleet_certificate_links');
    expect(writeLine).toHaveBeenCalledWith('Resolved fleet certificate links: 4 certificate link(s).');
  });

  it('can resolve imported published procedure links after import', async () => {
    const readTextFile = vi.fn().mockResolvedValue(JSON.stringify(exportBundle));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const rpc = vi.fn().mockImplementation((functionName: string) => {
      if (functionName === 'resolve_sharepoint_published_procedure_links') {
        return Promise.resolve({
          data: [
            {
              target_table: 'published_procedures',
              resolved_publications: 2,
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected RPC ${functionName}`);
    });
    const from = vi.fn().mockReturnValue({ upsert });
    const client = { from, rpc };
    const createClient = vi.fn().mockReturnValue(client);
    const writeLine = vi.fn();

    await expect(
      runSharePointImportCli(
        ['--file', 'C:/exports/sharepoint.json', '--resolve-published-procedure-links'],
        {
          SUPABASE_URL: 'http://127.0.0.1:54321',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        },
        {
          createClient,
          readTextFile,
          writeLine,
        },
      ),
    ).resolves.toBe(0);

    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_published_procedure_links');
    expect(writeLine).toHaveBeenCalledWith('Resolved published procedure links: 2 publication link(s).');
  });

  it('can resolve imported project links after import', async () => {
    const readTextFile = vi.fn().mockResolvedValue(JSON.stringify(exportBundle));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const rpc = vi.fn().mockImplementation((functionName: string) => {
      if (functionName === 'resolve_sharepoint_project_links') {
        return Promise.resolve({
          data: [
            {
              target_table: 'projects',
              resolved_clients: 2,
              resolved_vessels: 3,
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected RPC ${functionName}`);
    });
    const from = vi.fn().mockReturnValue({ upsert });
    const client = { from, rpc };
    const createClient = vi.fn().mockReturnValue(client);
    const writeLine = vi.fn();

    await expect(
      runSharePointImportCli(
        ['--file', 'C:/exports/sharepoint.json', '--resolve-project-links'],
        {
          SUPABASE_URL: 'http://127.0.0.1:54321',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        },
        {
          createClient,
          readTextFile,
          writeLine,
        },
      ),
    ).resolves.toBe(0);

    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_project_links');
    expect(writeLine).toHaveBeenCalledWith('Resolved project links: 2 client link(s), 3 vessel link(s).');
  });

  it('can resolve imported project document links after import', async () => {
    const readTextFile = vi.fn().mockResolvedValue(JSON.stringify(exportBundle));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const rpc = vi.fn().mockImplementation((functionName: string) => {
      if (functionName === 'resolve_sharepoint_project_document_links') {
        return Promise.resolve({
          data: [
            {
              target_table: 'project_documents',
              resolved_documents: 6,
            },
            {
              target_table: 'contract_documents',
              resolved_documents: 2,
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected RPC ${functionName}`);
    });
    const from = vi.fn().mockReturnValue({ upsert });
    const client = { from, rpc };
    const createClient = vi.fn().mockReturnValue(client);
    const writeLine = vi.fn();

    await expect(
      runSharePointImportCli(
        ['--file', 'C:/exports/sharepoint.json', '--resolve-project-document-links'],
        {
          SUPABASE_URL: 'http://127.0.0.1:54321',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        },
        {
          createClient,
          readTextFile,
          writeLine,
        },
      ),
    ).resolves.toBe(0);

    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_project_document_links');
    expect(writeLine).toHaveBeenCalledWith('Resolved project document links: 8 document link(s).');
  });

  it('can resolve imported DPR links after import', async () => {
    const readTextFile = vi.fn().mockResolvedValue(JSON.stringify(exportBundle));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const rpc = vi.fn().mockImplementation((functionName: string) => {
      if (functionName === 'resolve_sharepoint_dpr_links') {
        return Promise.resolve({
          data: [
            {
              target_table: 'dpr_items',
              resolved_projects: 3,
              resolved_vessels: 2,
              resolved_dpr_items: 0,
            },
            {
              target_table: 'dpr_archives',
              resolved_projects: 1,
              resolved_vessels: 0,
              resolved_dpr_items: 1,
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected RPC ${functionName}`);
    });
    const from = vi.fn().mockReturnValue({ upsert });
    const client = { from, rpc };
    const createClient = vi.fn().mockReturnValue(client);
    const writeLine = vi.fn();

    await expect(
      runSharePointImportCli(
        ['--file', 'C:/exports/sharepoint.json', '--resolve-dpr-links'],
        {
          SUPABASE_URL: 'http://127.0.0.1:54321',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        },
        {
          createClient,
          readTextFile,
          writeLine,
        },
      ),
    ).resolves.toBe(0);

    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_dpr_links');
    expect(writeLine).toHaveBeenCalledWith(
      'Resolved DPR links: 4 project link(s), 2 vessel link(s), 1 DPR archive link(s).',
    );
  });

  it('can resolve imported operation links after import', async () => {
    const readTextFile = vi.fn().mockResolvedValue(JSON.stringify(exportBundle));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const rpc = vi.fn().mockImplementation((functionName: string) => {
      if (functionName === 'resolve_sharepoint_operation_links') {
        return Promise.resolve({
          data: [
            {
              target_table: 'purchase_requests',
              resolved_projects: 2,
              resolved_vessels: 0,
              resolved_actions: 0,
            },
            {
              target_table: 'action_items',
              resolved_projects: 1,
              resolved_vessels: 1,
              resolved_actions: 0,
            },
            {
              target_table: 'action_documents',
              resolved_projects: 0,
              resolved_vessels: 0,
              resolved_actions: 3,
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected RPC ${functionName}`);
    });
    const from = vi.fn().mockReturnValue({ upsert });
    const client = { from, rpc };
    const createClient = vi.fn().mockReturnValue(client);
    const writeLine = vi.fn();

    await expect(
      runSharePointImportCli(
        ['--file', 'C:/exports/sharepoint.json', '--resolve-operation-links'],
        {
          SUPABASE_URL: 'http://127.0.0.1:54321',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        },
        {
          createClient,
          readTextFile,
          writeLine,
        },
      ),
    ).resolves.toBe(0);

    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_operation_links');
    expect(writeLine).toHaveBeenCalledWith(
      'Resolved operation links: 3 project link(s), 1 vessel link(s), 3 action document link(s).',
    );
  });

  it('can resolve imported document links after import', async () => {
    const readTextFile = vi.fn().mockResolvedValue(JSON.stringify(exportBundle));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const rpc = vi.fn().mockImplementation((functionName: string) => {
      if (functionName === 'resolve_sharepoint_document_links') {
        return Promise.resolve({
          data: [
            {
              target_table: 'technical_documents',
              resolved_people: 2,
              resolved_vessels: 4,
            },
            {
              target_table: 'work_time_documents',
              resolved_people: 3,
              resolved_vessels: 0,
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected RPC ${functionName}`);
    });
    const from = vi.fn().mockReturnValue({ upsert });
    const client = { from, rpc };
    const createClient = vi.fn().mockReturnValue(client);
    const writeLine = vi.fn();

    await expect(
      runSharePointImportCli(
        ['--file', 'C:/exports/sharepoint.json', '--resolve-document-links'],
        {
          SUPABASE_URL: 'http://127.0.0.1:54321',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        },
        {
          createClient,
          readTextFile,
          writeLine,
        },
      ),
    ).resolves.toBe(0);

    expect(rpc).toHaveBeenCalledWith('resolve_sharepoint_document_links');
    expect(writeLine).toHaveBeenCalledWith('Resolved document links: 5 people link(s), 4 vessel link(s).');
  });

  it('returns an error when the file argument is missing', async () => {
    const writeLine = vi.fn();

    await expect(
      runSharePointImportCli([], {}, { createClient: vi.fn(), readTextFile: vi.fn(), writeLine }),
    ).resolves.toBe(1);

    expect(writeLine).toHaveBeenCalledWith('Missing required argument: --file <path>');
  });
});
