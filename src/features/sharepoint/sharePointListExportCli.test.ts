import { describe, expect, it, vi } from 'vitest';
import {
  buildMicrosoft365ListItemsCommand,
  buildMicrosoft365ViewGetCommand,
  buildSharePointCamlQueryFromView,
  buildSharePointListExportBundle,
  parseSharePointIqy,
  runSharePointListExportCli,
} from './sharePointListExportCli';

describe('buildSharePointListExportBundle', () => {
  it('wraps Microsoft 365 list rows in the SharePoint import bundle format', () => {
    expect(
      buildSharePointListExportBundle({
        exportedAt: '2026-07-03T12:00:00.000Z',
        rows: [
          {
            ID: 42,
            Title: 'LECOCQ',
            Pr_x00e9_nom: 'Julien',
            Modified: '2026-06-30T08:15:00Z',
          },
        ],
        sourceKey: 'list-rh-personnel-bbtm',
      }),
    ).toEqual({
      exportedAt: '2026-07-03T12:00:00.000Z',
      sources: [
        {
          sourceKey: 'list-rh-personnel-bbtm',
          items: [
            {
              id: 42,
              fields: {
                ID: 42,
                Title: 'LECOCQ',
                Pr_x00e9_nom: 'Julien',
                Modified: '2026-06-30T08:15:00Z',
              },
            },
          ],
        },
      ],
    });
  });

  it('wraps multiple SharePoint sources in one import bundle', () => {
    expect(
      buildSharePointListExportBundle({
        exportedAt: '2026-07-03T12:00:00.000Z',
        sources: [
          {
            rows: [{ ID: 42, Title: 'LECOCQ' }],
            sourceKey: 'list-rh-personnel-bbtm',
          },
          {
            rows: [{ Id: 99, FileLeafRef: 'Visite medicale.pdf' }],
            sourceKey: 'library-brevets-visites-medicales',
          },
        ],
      }),
    ).toEqual({
      exportedAt: '2026-07-03T12:00:00.000Z',
      sources: [
        {
          sourceKey: 'list-rh-personnel-bbtm',
          items: [{ id: 42, fields: { ID: 42, Title: 'LECOCQ' } }],
        },
        {
          sourceKey: 'library-brevets-visites-medicales',
          items: [{ id: 99, fields: { Id: 99, FileLeafRef: 'Visite medicale.pdf' } }],
        },
      ],
    });
  });
});

describe('buildMicrosoft365ListItemsCommand', () => {
  it('targets the configured SharePoint list by site url and list id', () => {
    expect(buildMicrosoft365ListItemsCommand('list-rh-personnel-bbtm')).toEqual({
      command: 'pnpm',
      args: [
        '--package=@pnp/cli-microsoft365',
        'dlx',
        'm365',
        'spo',
        'listitem',
        'list',
        '--webUrl',
        'https://bbtm668.sharepoint.com/sites/QHSE',
        '--listId',
        '3b6f504c-908a-4d3e-8319-a595acb54efe',
        '--output',
        'json',
      ],
    });
  });

  it('adds a CAML query when exporting an IQY-backed view', () => {
    expect(
      buildMicrosoft365ListItemsCommand('list-rh-personnel-bbtm', {
        camlQuery: "<View><Query></Query><RowLimit Paged='TRUE'>5000</RowLimit></View>",
      }),
    ).toEqual({
      command: 'pnpm',
      args: [
        '--package=@pnp/cli-microsoft365',
        'dlx',
        'm365',
        'spo',
        'listitem',
        'list',
        '--webUrl',
        'https://bbtm668.sharepoint.com/sites/QHSE',
        '--listId',
        '3b6f504c-908a-4d3e-8319-a595acb54efe',
        '--camlQuery',
        "<View><Query></Query><RowLimit Paged='TRUE'>5000</RowLimit></View>",
        '--output',
        'json',
      ],
    });
  });

  it('targets a document library by its verified live list id', () => {
    expect(
      buildMicrosoft365ListItemsCommand('library-documents-projets', {
        camlQuery: '<View Scope="RecursiveAll"><Query></Query><RowLimit Paged="TRUE">5000</RowLimit></View>',
      }),
    ).toEqual({
      command: 'pnpm',
      args: [
        '--package=@pnp/cli-microsoft365',
        'dlx',
        'm365',
        'spo',
        'listitem',
        'list',
        '--webUrl',
        'https://bbtm668.sharepoint.com/sites/QHSE',
        '--listId',
        '7559dfae-5ab9-4616-bb63-97819c606365',
        '--camlQuery',
        '<View Scope="RecursiveAll"><Query></Query><RowLimit Paged="TRUE">5000</RowLimit></View>',
        '--output',
        'json',
      ],
    });
  });
});

describe('buildMicrosoft365ViewGetCommand', () => {
  it('targets a configured list view by id', () => {
    expect(buildMicrosoft365ViewGetCommand('list-rh-personnel-bbtm', '123FB305-86A2-4E02-B30D-75E5CCDF3EE5')).toEqual({
      command: 'pnpm',
      args: [
        '--package=@pnp/cli-microsoft365',
        'dlx',
        'm365',
        'spo',
        'list',
        'view',
        'get',
        '--webUrl',
        'https://bbtm668.sharepoint.com/sites/QHSE',
        '--listId',
        '3b6f504c-908a-4d3e-8319-a595acb54efe',
        '--id',
        '123FB305-86A2-4E02-B30D-75E5CCDF3EE5',
        '--output',
        'json',
      ],
    });
  });
});

describe('parseSharePointIqy', () => {
  it('extracts list and view metadata from an IQY file', () => {
    expect(
      parseSharePointIqy(`WEB
1
https://bbtm668.sharepoint.com/sites/QHSE/_vti_bin/owssvr.dll?XMLDATA=1&List=3b6f504c-908a-4d3e-8319-a595acb54efe&View=123FB305-86A2-4E02-B30D-75E5CCDF3EE5&RowLimit=0&RootFolder=

SharePointListView=123FB305-86A2-4E02-B30D-75E5CCDF3EE5
SharePointListName=3b6f504c-908a-4d3e-8319-a595acb54efe
`),
    ).toEqual({
      listId: '3b6f504c-908a-4d3e-8319-a595acb54efe',
      siteUrl: 'https://bbtm668.sharepoint.com/sites/QHSE',
      viewId: '123FB305-86A2-4E02-B30D-75E5CCDF3EE5',
    });
  });
});

describe('buildSharePointCamlQueryFromView', () => {
  it('wraps a list view query with a paged row limit', () => {
    expect(
      buildSharePointCamlQueryFromView({
        sourceKey: 'list-rh-personnel-bbtm',
        view: {
          ViewQuery: '<Where><Eq><FieldRef Name="Actif" /><Value Type="Boolean">1</Value></Eq></Where>',
        },
      }),
    ).toBe(
      '<View><Query><Where><Eq><FieldRef Name="Actif" /><Value Type="Boolean">1</Value></Eq></Where></Query><RowLimit Paged="TRUE">5000</RowLimit></View>',
    );
  });

  it('exports document libraries recursively', () => {
    expect(
      buildSharePointCamlQueryFromView({
        sourceKey: 'library-brevets-visites-medicales',
        view: {
          ViewQuery: '',
        },
      }),
    ).toBe('<View Scope="RecursiveAll"><Query></Query><RowLimit Paged="TRUE">5000</RowLimit></View>');
  });
});

describe('runSharePointListExportCli', () => {
  it('exports library metadata recursively without downloading file content', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stdout: JSON.stringify([{ ID: 990, FileLeafRef: 'rapport.pdf', FileRef: '/sites/QHSE/Documents Projets/rapport.pdf' }]),
      stderr: '',
      exitCode: 0,
    });
    const writeTextFile = vi.fn().mockResolvedValue(undefined);

    await expect(
      runSharePointListExportCli(
        ['--source-key', 'library-documents-projets', '--output', 'C:\\exports\\projects-documents.json'],
        {
          now: () => new Date('2026-07-16T12:00:00.000Z'),
          runCommand,
          writeTextFile,
        },
      ),
    ).resolves.toBe(0);

    expect(runCommand).toHaveBeenCalledWith('pnpm', expect.arrayContaining([
      'listitem',
      'list',
      '--listId',
      '7559dfae-5ab9-4616-bb63-97819c606365',
      '--camlQuery',
      '<View Scope="RecursiveAll"><Query></Query><RowLimit Paged="TRUE">5000</RowLimit></View>',
    ]));
    expect(writeTextFile).toHaveBeenCalledWith(
      'C:\\exports\\projects-documents.json',
      expect.stringContaining('"FileRef": "/sites/QHSE/Documents Projets/rapport.pdf"'),
    );
  });

  it('exports a configured source to a bundle file', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stdout: JSON.stringify([{ ID: 42, Title: 'LECOCQ', Pr_x00e9_nom: 'Julien' }]),
      stderr: '',
      exitCode: 0,
    });
    const writeTextFile = vi.fn().mockResolvedValue(undefined);
    const writeLine = vi.fn();

    await expect(
      runSharePointListExportCli(
        ['--source-key', 'list-rh-personnel-bbtm', '--output', 'C:\\exports\\rh.json'],
        {
          now: () => new Date('2026-07-03T12:00:00.000Z'),
          readTextFile: vi.fn(),
          runCommand,
          writeLine,
          writeTextFile,
        },
      ),
    ).resolves.toBe(0);

    expect(runCommand).toHaveBeenCalledWith('pnpm', [
      '--package=@pnp/cli-microsoft365',
      'dlx',
      'm365',
      'spo',
      'listitem',
      'list',
      '--webUrl',
      'https://bbtm668.sharepoint.com/sites/QHSE',
      '--listId',
      '3b6f504c-908a-4d3e-8319-a595acb54efe',
      '--output',
      'json',
    ]);
    expect(writeTextFile).toHaveBeenCalledWith(
      'C:\\exports\\rh.json',
      `${JSON.stringify(
        {
          exportedAt: '2026-07-03T12:00:00.000Z',
          sources: [
            {
              sourceKey: 'list-rh-personnel-bbtm',
              items: [
                {
                  id: 42,
                  fields: {
                    ID: 42,
                    Title: 'LECOCQ',
                    Pr_x00e9_nom: 'Julien',
                  },
                },
              ],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    expect(writeLine).toHaveBeenCalledWith('Exported 1 item(s) from list-rh-personnel-bbtm to C:\\exports\\rh.json.');
  });

  it('exports multiple IQY-backed sources to one bundle', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ ViewQuery: '<Where><Eq><FieldRef Name="Actif" /><Value Type="Boolean">1</Value></Eq></Where>' }),
        stderr: '',
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify([{ ID: 42, Title: 'LECOCQ' }]),
        stderr: '',
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ ViewQuery: '' }),
        stderr: '',
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify([{ ID: 99, FileLeafRef: 'Visite medicale.pdf' }]),
        stderr: '',
        exitCode: 0,
      });
    const writeTextFile = vi.fn().mockResolvedValue(undefined);
    const writeLine = vi.fn();
    const readTextFile = vi
      .fn()
      .mockResolvedValueOnce(
        'https://bbtm668.sharepoint.com/sites/QHSE/_vti_bin/owssvr.dll?XMLDATA=1&List=3b6f504c-908a-4d3e-8319-a595acb54efe&View=123FB305-86A2-4E02-B30D-75E5CCDF3EE5',
      )
      .mockResolvedValueOnce(
        'https://bbtm668.sharepoint.com/sites/QHSE/_vti_bin/owssvr.dll?XMLDATA=1&List=c5382a31-dba6-42f7-9b13-b648d7e3106b&View=C1327586-D4AC-403E-A16C-9823171EFBD2',
      );

    await expect(
      runSharePointListExportCli(
        [
          '--source-key',
          'list-rh-personnel-bbtm',
          '--iqy',
          'list-rh-personnel-bbtm=C:\\Downloads\\RH.iqy',
          '--source-key',
          'library-brevets-visites-medicales',
          '--iqy',
          'library-brevets-visites-medicales=C:\\Downloads\\Brevets.iqy',
          '--output',
          'C:\\exports\\rh-full.json',
        ],
        {
          now: () => new Date('2026-07-03T12:00:00.000Z'),
          readTextFile,
          runCommand,
          writeLine,
          writeTextFile,
        },
      ),
    ).resolves.toBe(0);

    expect(runCommand).toHaveBeenNthCalledWith(1, 'pnpm', [
      '--package=@pnp/cli-microsoft365',
      'dlx',
      'm365',
      'spo',
      'list',
      'view',
      'get',
      '--webUrl',
      'https://bbtm668.sharepoint.com/sites/QHSE',
      '--listId',
      '3b6f504c-908a-4d3e-8319-a595acb54efe',
      '--id',
      '123FB305-86A2-4E02-B30D-75E5CCDF3EE5',
      '--output',
      'json',
    ]);
    expect(writeTextFile).toHaveBeenCalledWith(
      'C:\\exports\\rh-full.json',
      expect.stringContaining('"sourceKey": "library-brevets-visites-medicales"'),
    );
    expect(writeLine).toHaveBeenCalledWith(
      'Exported 2 item(s) from 2 source(s) to C:\\exports\\rh-full.json.',
    );
  });
});
