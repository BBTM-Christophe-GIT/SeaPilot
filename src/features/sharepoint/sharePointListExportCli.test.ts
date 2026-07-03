import { describe, expect, it, vi } from 'vitest';
import {
  buildMicrosoft365ListItemsCommand,
  buildSharePointListExportBundle,
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
});

describe('runSharePointListExportCli', () => {
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
});
