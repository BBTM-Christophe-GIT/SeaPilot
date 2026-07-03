import {
  buildSharePointImportBatchesFromExport,
  buildSharePointImportReport,
  type SharePointExportBundle,
  type SharePointUpsertBatch,
} from './sharePointImport.ts';

type SqlValue = string | number | boolean | null;

interface CommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

interface LinkedImportCliDependencies {
  readTextFile(path: string): Promise<string>;
  runCommand(command: string, args: string[]): Promise<CommandResult>;
  tempSqlPath(bundlePath: string): string;
  writeLine?(line: string): void;
  writeTextFile(path: string, content: string): Promise<void>;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function sqlLiteral(value: SqlValue): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return `'${value.replaceAll('\u0000', '').replaceAll("'", "''")}'`;
}

function columnsForRows(rows: SharePointUpsertBatch['rows']): string[] {
  const columns: string[] = [];

  for (const row of rows) {
    for (const column of Object.keys(row)) {
      if (!columns.includes(column)) {
        columns.push(column);
      }
    }
  }

  return columns;
}

export function buildSharePointUpsertSql(batch: SharePointUpsertBatch): string {
  if (batch.rows.length === 0) {
    return '';
  }

  const columns = columnsForRows(batch.rows);
  const updateColumns = columns.filter((column) => !batch.conflictColumns.includes(column));
  const values = batch.rows
    .map((row) => `(${columns.map((column) => sqlLiteral((row[column] ?? null) as SqlValue)).join(', ')})`)
    .join(',\n');
  const updateClause =
    updateColumns.length > 0
      ? `do update set ${updateColumns
          .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`)
          .join(', ')}`
      : 'do nothing';

  return [
    `insert into public.${quoteIdentifier(batch.targetTable)} (${columns.map(quoteIdentifier).join(', ')})`,
    `values ${values}`,
    `on conflict (${batch.conflictColumns.map(quoteIdentifier).join(', ')}) ${updateClause};`,
  ].join('\n');
}

export function buildSharePointImportSqlFromExport(bundle: SharePointExportBundle): string {
  const statements = buildSharePointImportBatchesFromExport(bundle)
    .map(buildSharePointUpsertSql)
    .filter(Boolean);

  if (statements.length === 0) {
    return '-- No rows to import.\n';
  }

  return `begin;\n\n${statements.join('\n\n')}\n\ncommit;\n`;
}

function parseArgs(args: string[]): { filePath: string | null } {
  let filePath: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--file') {
      filePath = args[index + 1] || null;
      index += 1;
    }
  }

  return { filePath };
}

function parseBundle(rawContent: string): SharePointExportBundle {
  const bundle = JSON.parse(rawContent) as SharePointExportBundle;

  if (!Array.isArray(bundle.sources)) {
    throw new Error('Invalid SharePoint export bundle: sources must be an array.');
  }

  return bundle;
}

function write(dependencies: LinkedImportCliDependencies, line: string) {
  dependencies.writeLine?.(line);
}

export async function runSharePointLinkedImportCli(
  args: string[],
  dependencies: LinkedImportCliDependencies,
): Promise<number> {
  const { filePath } = parseArgs(args);

  if (!filePath) {
    write(dependencies, 'Missing required argument: --file <path>');
    return 1;
  }

  try {
    const bundle = parseBundle(await dependencies.readTextFile(filePath));
    const sqlPath = dependencies.tempSqlPath(filePath);
    await dependencies.writeTextFile(sqlPath, buildSharePointImportSqlFromExport(bundle));

    const result = await dependencies.runCommand('supabase', ['db', 'query', '--linked', '--file', sqlPath]);

    if (result.exitCode !== 0) {
      write(dependencies, result.stderr || result.stdout || 'Supabase linked import failed.');
      return result.exitCode;
    }

    const report = buildSharePointImportReport(
      buildSharePointImportBatchesFromExport(bundle).map((batch) => ({
        sourceKey: batch.sourceKey,
        targetTable: batch.targetTable,
        rowCount: batch.rows.length,
      })),
    );

    write(
      dependencies,
      `Imported ${report.totalRows} row(s) from ${report.totalSources} source(s) through Supabase linked database.`,
    );
    return 0;
  } catch (error) {
    write(dependencies, error instanceof Error ? error.message : 'SharePoint linked import failed.');
    return 1;
  }
}
