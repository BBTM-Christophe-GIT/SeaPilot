import { describe, expect, it, vi } from 'vitest';
import {
  buildSharePointImportSqlFromExport,
  buildSharePointUpsertSql,
  runSharePointLinkedImportCli,
} from './sharePointLinkedImportCli';

describe('buildSharePointUpsertSql', () => {
  it('builds a safe upsert statement for a mapped SharePoint batch', () => {
    expect(
      buildSharePointUpsertSql({
        sourceKey: 'list-rh-personnel-bbtm',
        targetTable: 'people',
        conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
        rows: [
          {
            first_name: 'Jeanne',
            last_name: "D'ARMOR",
            active: true,
            weight_kg: 78.5,
            departed_on: null,
            sharepoint_list_id: 'list-1',
            sharepoint_item_id: '42',
          },
        ],
      }),
    ).toBe(
      [
        'insert into public."people" ("first_name", "last_name", "active", "weight_kg", "departed_on", "sharepoint_list_id", "sharepoint_item_id")',
        "values ('Jeanne', 'D''ARMOR', true, 78.5, null, 'list-1', '42')",
        'on conflict ("sharepoint_list_id", "sharepoint_item_id") do update set "first_name" = excluded."first_name", "last_name" = excluded."last_name", "active" = excluded."active", "weight_kg" = excluded."weight_kg", "departed_on" = excluded."departed_on";',
      ].join('\n'),
    );
  });

  it('serializes source payload objects as escaped jsonb', () => {
    const sql = buildSharePointUpsertSql({
      sourceKey: 'list-bbtm-clients',
      targetTable: 'clients',
      conflictColumns: ['sharepoint_list_id', 'sharepoint_item_id'],
      rows: [
        {
          name: 'Client test',
          sharepoint_list_id: 'clients',
          sharepoint_item_id: '1',
          source_payload: { Contact: "O'NEIL" },
        },
      ],
    });

    expect(sql).toContain(`'{"Contact":"O''NEIL"}'::jsonb`);
  });
});

describe('buildSharePointImportSqlFromExport', () => {
  it('maps an export bundle into one atomic database statement', () => {
    const sql = buildSharePointImportSqlFromExport({
      exportedAt: '2026-07-03T12:00:00.000Z',
      sources: [
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
    });

    expect(sql).toContain('do $sharepoint_import$');
    expect(sql).toContain('begin');
    expect(sql).toContain('insert into public."people"');
    expect(sql).toContain("'Julien'");
    expect(sql).toContain("'LECOCQ'");
    expect(sql).toContain('$sharepoint_import$;');
  });

  it('reconciles projects, contracts and documents inside the import transaction', () => {
    const sql = buildSharePointImportSqlFromExport({
      sources: [
        { sourceKey: 'list-bbtm-projets', items: [{ ID: '54', Title: 'P260 - Remorquage DENVER' }] },
        { sourceKey: 'library-documents-contractuels', items: [] },
      ],
    });

    expect(sql).toContain('perform public.resolve_sharepoint_project_links();');
    expect(sql).toContain('perform public.sync_sharepoint_project_contracts();');
    expect(sql).toContain('perform public.resolve_sharepoint_project_document_links();');
    expect(sql.indexOf('sync_sharepoint_project_contracts')).toBeLessThan(sql.indexOf('$sharepoint_import$;'));
  });
});

describe('runSharePointLinkedImportCli', () => {
  it('writes SQL to a temporary file and executes it with Supabase linked query', async () => {
    const readTextFile = vi.fn().mockResolvedValue(
      JSON.stringify({
        sources: [
          {
            sourceKey: 'list-rh-personnel-bbtm',
            items: [{ fields: { ID: 42, Title: 'LECOCQ', Pr_x00e9_nom: 'Julien' } }],
          },
        ],
      }),
    );
    const runCommand = vi.fn().mockResolvedValue({ exitCode: 0, stderr: '', stdout: '' });
    const writeTextFile = vi.fn().mockResolvedValue(undefined);
    const writeLine = vi.fn();

    await expect(
      runSharePointLinkedImportCli(['--file', 'C:\\exports\\rh.json'], {
        readTextFile,
        runCommand,
        tempSqlPath: () => 'C:\\exports\\rh.sql',
        writeLine,
        writeTextFile,
      }),
    ).resolves.toBe(0);

    expect(readTextFile).toHaveBeenCalledWith('C:\\exports\\rh.json');
    expect(writeTextFile).toHaveBeenCalledWith('C:\\exports\\rh.sql', expect.stringContaining('insert into public."people"'));
    expect(runCommand).toHaveBeenCalledWith('supabase', ['db', 'query', '--linked', '--file', 'C:\\exports\\rh.sql']);
    expect(writeLine).toHaveBeenCalledWith('Imported 1 row(s) from 1 source(s) through Supabase linked database.');
  });

  it('accepts UTF-8 BOM export files produced by PowerShell', async () => {
    const readTextFile = vi.fn().mockResolvedValue(
      `\uFEFF${JSON.stringify({
        sources: [
          {
            sourceKey: 'list-rh-personnel-bbtm',
            items: [{ fields: { ID: 42, Title: 'LECOCQ', Pr_x00e9_nom: 'Julien' } }],
          },
        ],
      })}`,
    );
    const runCommand = vi.fn().mockResolvedValue({ exitCode: 0, stderr: '', stdout: '' });
    const writeTextFile = vi.fn().mockResolvedValue(undefined);

    await expect(
      runSharePointLinkedImportCli(['--file', 'C:\\exports\\rh.json'], {
        readTextFile,
        runCommand,
        tempSqlPath: () => 'C:\\exports\\rh.sql',
        writeTextFile,
      }),
    ).resolves.toBe(0);

    expect(writeTextFile).toHaveBeenCalledWith('C:\\exports\\rh.sql', expect.stringContaining('insert into public."people"'));
  });
});
