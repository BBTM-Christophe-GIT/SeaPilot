import { getSharePointSourceByKey } from './sharePointInventory.ts';
import type { SharePointExportBundle, SharePointListItem } from './sharePointImport.ts';

type Microsoft365ListRow = Record<string, unknown>;

interface BuildSharePointListExportBundleInput {
  exportedAt: string;
  rows: Microsoft365ListRow[];
  sourceKey: string;
}

interface ParsedArgs {
  outputPath: string | null;
  sourceKey: string | null;
}

interface CommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

interface SharePointListExportCliDependencies {
  now(): Date;
  runCommand(command: string, args: string[]): Promise<CommandResult>;
  writeLine?(line: string): void;
  writeTextFile(path: string, content: string): Promise<void>;
}

export function buildSharePointListExportBundle({
  exportedAt,
  rows,
  sourceKey,
}: BuildSharePointListExportBundleInput): SharePointExportBundle {
  return {
    exportedAt,
    sources: [
      {
        sourceKey,
        items: rows.map<SharePointListItem>((row) => ({
          id: (row.ID ?? row.Id ?? row.id) as string | number | undefined,
          fields: row as SharePointListItem['fields'],
        })),
      },
    ],
  };
}

export function buildMicrosoft365ListItemsCommand(sourceKey: string): { command: string; args: string[] } {
  const source = getSharePointSourceByKey(sourceKey);

  if (!source?.listId) {
    throw new Error(`SharePoint source ${sourceKey} does not define a list id.`);
  }

  return {
    command: 'pnpm',
    args: [
      '--package=@pnp/cli-microsoft365',
      'dlx',
      'm365',
      'spo',
      'listitem',
      'list',
      '--webUrl',
      source.siteUrl,
      '--listId',
      source.listId,
      '--output',
      'json',
    ],
  };
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    outputPath: null,
    sourceKey: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--source-key') {
      parsed.sourceKey = args[index + 1] || null;
      index += 1;
    }

    if (arg === '--output') {
      parsed.outputPath = args[index + 1] || null;
      index += 1;
    }
  }

  return parsed;
}

function parseMicrosoft365Rows(rawOutput: string): Microsoft365ListRow[] {
  const parsed = JSON.parse(rawOutput) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('Microsoft 365 list export did not return a JSON array.');
  }

  return parsed as Microsoft365ListRow[];
}

function write(dependencies: SharePointListExportCliDependencies, line: string) {
  dependencies.writeLine?.(line);
}

export async function runSharePointListExportCli(
  args: string[],
  dependencies: SharePointListExportCliDependencies,
): Promise<number> {
  const parsed = parseArgs(args);

  if (!parsed.sourceKey) {
    write(dependencies, 'Missing required argument: --source-key <source-key>');
    return 1;
  }

  if (!parsed.outputPath) {
    write(dependencies, 'Missing required argument: --output <path>');
    return 1;
  }

  try {
    const command = buildMicrosoft365ListItemsCommand(parsed.sourceKey);
    const result = await dependencies.runCommand(command.command, command.args);

    if (result.exitCode !== 0) {
      write(dependencies, result.stderr || result.stdout || 'Microsoft 365 list export failed.');
      return result.exitCode;
    }

    const rows = parseMicrosoft365Rows(result.stdout);
    const bundle = buildSharePointListExportBundle({
      exportedAt: dependencies.now().toISOString(),
      rows,
      sourceKey: parsed.sourceKey,
    });

    await dependencies.writeTextFile(parsed.outputPath, `${JSON.stringify(bundle, null, 2)}\n`);
    write(dependencies, `Exported ${rows.length} item(s) from ${parsed.sourceKey} to ${parsed.outputPath}.`);
    return 0;
  } catch (error) {
    write(dependencies, error instanceof Error ? error.message : 'SharePoint list export failed.');
    return 1;
  }
}
