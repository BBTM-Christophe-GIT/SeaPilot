import { getSharePointSourceByKey } from './sharePointInventory.ts';
import type { SharePointExportBundle, SharePointListItem } from './sharePointImport.ts';

type Microsoft365ListRow = Record<string, unknown>;

interface BuildSharePointListExportBundleInput {
  exportedAt: string;
  rows?: Microsoft365ListRow[];
  sourceKey?: string;
  sources?: {
    rows: Microsoft365ListRow[];
    sourceKey: string;
  }[];
}

interface ParsedArgs {
  iqyPathsBySourceKey: Record<string, string>;
  outputPath: string | null;
  sourceKeys: string[];
}

interface CommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

interface SharePointListExportCliDependencies {
  now(): Date;
  readTextFile?(path: string): Promise<string>;
  runCommand(command: string, args: string[]): Promise<CommandResult>;
  writeLine?(line: string): void;
  writeTextFile(path: string, content: string): Promise<void>;
}

interface Microsoft365ListItemCommandOptions {
  camlQuery?: string;
  listId?: string;
}

interface SharePointIqyMetadata {
  listId: string;
  siteUrl: string;
  viewId: string | null;
}

type Microsoft365View = {
  ListViewXml?: unknown;
  RowLimit?: unknown;
  Scope?: unknown;
  ViewQuery?: unknown;
};

export function buildSharePointListExportBundle({
  exportedAt,
  rows,
  sourceKey,
  sources,
}: BuildSharePointListExportBundleInput): SharePointExportBundle {
  const sourceRows = sources || (sourceKey ? [{ rows: rows || [], sourceKey }] : []);

  return {
    exportedAt,
    sources: sourceRows.map((source) => ({
      sourceKey: source.sourceKey,
      items: source.rows.map<SharePointListItem>((row) => ({
        id: (row.ID ?? row.Id ?? row.id) as string | number | undefined,
        fields: row as SharePointListItem['fields'],
      })),
    })),
  };
}

export function parseSharePointIqy(content: string): SharePointIqyMetadata {
  const urlLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('https://'));

  const listNameMatch = content.match(/^SharePointListName=(.+)$/im);
  const viewMatch = content.match(/^SharePointListView=(.+)$/im);

  if (!urlLine && !listNameMatch) {
    throw new Error('Invalid IQY file: missing SharePoint list URL or list id.');
  }

  const url = urlLine ? new URL(urlLine) : null;
  const vtiIndex = url?.pathname.toLowerCase().indexOf('/_vti_bin/') ?? -1;
  const listId = url?.searchParams.get('List') || listNameMatch?.[1]?.trim();
  const viewId = url?.searchParams.get('View') || viewMatch?.[1]?.trim() || null;

  if (!listId) {
    throw new Error('Invalid IQY file: missing SharePoint list id.');
  }

  return {
    listId,
    siteUrl: url && vtiIndex >= 0 ? `${url.origin}${url.pathname.slice(0, vtiIndex)}` : '',
    viewId,
  };
}

export function buildMicrosoft365ViewGetCommand(
  sourceKey: string,
  viewId: string,
  listIdOverride?: string,
): { command: string; args: string[] } {
  const source = getSharePointSourceByKey(sourceKey);
  const listId = listIdOverride || source?.listId;

  if (!source || !listId) {
    throw new Error(`SharePoint source ${sourceKey} does not define a list id.`);
  }

  return {
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
      source.siteUrl,
      '--listId',
      listId,
      '--id',
      viewId,
      '--output',
      'json',
    ],
  };
}

export function buildSharePointCamlQueryFromView({
  sourceKey,
  view,
}: {
  sourceKey: string;
  view: Microsoft365View;
}): string {
  const source = getSharePointSourceByKey(sourceKey);
  const scope = source?.sourceType === 'library' ? ' Scope="RecursiveAll"' : '';
  const viewQuery = typeof view.ViewQuery === 'string' ? view.ViewQuery : '';

  return `<View${scope}><Query>${viewQuery}</Query><RowLimit Paged="TRUE">5000</RowLimit></View>`;
}

export function buildMicrosoft365ListItemsCommand(
  sourceKey: string,
  options: Microsoft365ListItemCommandOptions = {},
): { command: string; args: string[] } {
  const source = getSharePointSourceByKey(sourceKey);
  const listId = options.listId || source?.listId;

  if (!source) {
    throw new Error(`Unknown SharePoint source ${sourceKey}.`);
  }

  const args = [
    '--package=@pnp/cli-microsoft365',
    'dlx',
    'm365',
    'spo',
    'listitem',
    'list',
    '--webUrl',
    source.siteUrl,
  ];

  if (listId) {
    args.push('--listId', listId);
  } else {
    args.push('--listTitle', source.title);
  }

  if (options.camlQuery) {
    args.push('--camlQuery', options.camlQuery);
  }

  args.push('--output', 'json');

  return {
    command: 'pnpm',
    args,
  };
}

function parseIqyArg(rawValue: string): { path: string; sourceKey: string } {
  const separatorIndex = rawValue.indexOf('=');

  if (separatorIndex <= 0) {
    throw new Error('Invalid --iqy value. Expected <source-key>=<path>.');
  }

  return {
    sourceKey: rawValue.slice(0, separatorIndex),
    path: rawValue.slice(separatorIndex + 1),
  };
}

function assertMatchingIqyList(sourceKey: string, iqy: SharePointIqyMetadata) {
  const source = getSharePointSourceByKey(sourceKey);

  if (!source?.listId) {
    throw new Error(`SharePoint source ${sourceKey} does not define a list id.`);
  }

  if (source.listId.toLowerCase() !== iqy.listId.toLowerCase()) {
    throw new Error(`IQY list id ${iqy.listId} does not match SharePoint source ${sourceKey}.`);
  }
}

async function readIqyMetadata(
  sourceKey: string,
  dependencies: SharePointListExportCliDependencies,
  path: string | undefined,
): Promise<SharePointIqyMetadata | null> {
  if (!path) {
    return null;
  }

  if (!dependencies.readTextFile) {
    throw new Error('Cannot read IQY file: readTextFile dependency is not configured.');
  }

  const iqy = parseSharePointIqy(await dependencies.readTextFile(path));
  assertMatchingIqyList(sourceKey, iqy);
  return iqy;
}

async function fetchCamlQueryForIqyView(
  sourceKey: string,
  dependencies: SharePointListExportCliDependencies,
  iqy: SharePointIqyMetadata | null,
): Promise<string | undefined> {
  if (!iqy?.viewId) {
    return undefined;
  }

  const command = buildMicrosoft365ViewGetCommand(sourceKey, iqy.viewId, iqy.listId);
  const result = await dependencies.runCommand(command.command, command.args);

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || 'Microsoft 365 SharePoint view export failed.');
  }

  return buildSharePointCamlQueryFromView({
    sourceKey,
    view: JSON.parse(result.stdout) as Microsoft365View,
  });
}

async function exportSourceRows(
  sourceKey: string,
  dependencies: SharePointListExportCliDependencies,
  iqyPath: string | undefined,
): Promise<Microsoft365ListRow[]> {
  const iqy = await readIqyMetadata(sourceKey, dependencies, iqyPath);
  const source = getSharePointSourceByKey(sourceKey);
  const iqyCamlQuery = await fetchCamlQueryForIqyView(sourceKey, dependencies, iqy);
  const camlQuery =
    iqyCamlQuery ||
    (source?.sourceType === 'library'
      ? buildSharePointCamlQueryFromView({ sourceKey, view: { ViewQuery: '' } })
      : undefined);
  const command = buildMicrosoft365ListItemsCommand(sourceKey, {
    camlQuery,
    listId: iqy?.listId,
  });
  const result = await dependencies.runCommand(command.command, command.args);

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || 'Microsoft 365 list export failed.');
  }

  return parseMicrosoft365Rows(result.stdout);
}

function sourceKeysToExport(parsed: ParsedArgs): string[] {
  const sourceKeys = parsed.sourceKeys.length > 0 ? parsed.sourceKeys : Object.keys(parsed.iqyPathsBySourceKey);

  return Array.from(new Set(sourceKeys));
}

function totalRowCount(sources: { rows: Microsoft365ListRow[] }[]): number {
  return sources.reduce((total, source) => total + source.rows.length, 0);
}

function outputSummary(sourceCount: number, rowCount: number, outputPath: string): string {
  if (sourceCount === 1) {
    return `Exported ${rowCount} item(s) from 1 source(s) to ${outputPath}.`;
  }

  return `Exported ${rowCount} item(s) from ${sourceCount} source(s) to ${outputPath}.`;
}

function legacyOutputSummary(sourceKey: string, rowCount: number, outputPath: string): string {
  return `Exported ${rowCount} item(s) from ${sourceKey} to ${outputPath}.`;
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

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    iqyPathsBySourceKey: {},
    outputPath: null,
    sourceKeys: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--source-key') {
      const sourceKeyValue = args[index + 1];

      if (sourceKeyValue) {
        parsed.sourceKeys.push(sourceKeyValue);
      }

      index += 1;
    }

    if (arg === '--iqy') {
      const iqyValue = args[index + 1] || '';
      const iqy = parseIqyArg(iqyValue);
      parsed.iqyPathsBySourceKey[iqy.sourceKey] = iqy.path;
      index += 1;
    }

    if (arg === '--output') {
      parsed.outputPath = args[index + 1] || null;
      index += 1;
    }
  }

  return parsed;
}

export async function runSharePointListExportCli(
  args: string[],
  dependencies: SharePointListExportCliDependencies,
): Promise<number> {
  const parsed = parseArgs(args);
  const sourceKeys = sourceKeysToExport(parsed);

  if (sourceKeys.length === 0) {
    write(dependencies, 'Missing required argument: --source-key <source-key>');
    return 1;
  }

  if (!parsed.outputPath) {
    write(dependencies, 'Missing required argument: --output <path>');
    return 1;
  }

  try {
    const sources = [];

    for (const sourceKeyToExport of sourceKeys) {
      sources.push({
        rows: await exportSourceRows(sourceKeyToExport, dependencies, parsed.iqyPathsBySourceKey[sourceKeyToExport]),
        sourceKey: sourceKeyToExport,
      });
    }

    const rowsCount = totalRowCount(sources);
    const bundle = buildSharePointListExportBundle({
      exportedAt: dependencies.now().toISOString(),
      sources,
    });

    await dependencies.writeTextFile(parsed.outputPath, `${JSON.stringify(bundle, null, 2)}\n`);

    if (sourceKeys.length === 1 && !parsed.iqyPathsBySourceKey[sourceKeys[0]]) {
      write(dependencies, legacyOutputSummary(sourceKeys[0], rowsCount, parsed.outputPath));
    } else {
      write(dependencies, outputSummary(sources.length, rowsCount, parsed.outputPath));
    }

    return 0;
  } catch (error) {
    write(dependencies, error instanceof Error ? error.message : 'SharePoint list export failed.');
    return 1;
  }
}
