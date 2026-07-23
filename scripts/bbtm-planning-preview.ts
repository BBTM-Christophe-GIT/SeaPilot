import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  buildBbtmImportPreviewFromSources,
  buildBbtmImportSql,
  type BbtmCatalog,
  type BbtmCatalogPerson,
  type BbtmCatalogVessel,
} from '../src/features/planning/bbtmPlanningImport.ts';

const execFileAsync = promisify(execFile);

interface CliOptions {
  sources: string[];
  cutoff: string;
  output: string;
  supabaseWorkdir: string;
  catalogPath: string;
}

function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string>();
  const sources: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith('--')) continue;
    const value = args[index + 1] || '';
    if (key === '--source') sources.push(resolve(value));
    else values.set(key, value);
    index += 1;
  }
  const output = values.get('--output');
  const cutoff = values.get('--cutoff') || '2026-06-30';
  if (!sources.length || !output) {
    throw new Error('Usage: --source <classeur.xlsx> [--source <autre.xlsx>] --output <preview.json> [--cutoff 2026-06-30]');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error('La date limite doit être au format AAAA-MM-JJ.');
  return {
    sources,
    output: resolve(output),
    cutoff,
    supabaseWorkdir: resolve(values.get('--supabase-workdir') || process.cwd()),
    catalogPath: values.get('--catalog') ? resolve(values.get('--catalog')!) : '',
  };
}

async function fetchSeaPilotCatalog(supabaseWorkdir: string): Promise<BbtmCatalog> {
  const sql = [
    "select 'people' as kind,",
    "json_agg(json_build_object('id', id, 'name', trim(concat_ws(' ', first_name, last_name)), 'active', active) order by last_name, first_name) as rows",
    'from public.people',
    'union all',
    "select 'vessels', json_agg(json_build_object('id', id, 'name', name, 'active', active) order by name)",
    'from public.vessels;',
  ].join(' ');
  const tempDirectory = await mkdtemp(join(tmpdir(), 'seapilot-bbtm-catalog-'));
  const sqlPath = join(tempDirectory, 'catalog.sql');
  await writeFile(sqlPath, sql, 'utf8');
  try {
    const supabaseArgs = ['db', 'query', '--linked', '--output-format', 'json', '--file', sqlPath];
    const executable = process.platform === 'win32' ? 'cmd.exe' : 'supabase';
    const args = process.platform === 'win32'
      ? [
          '/d',
          '/c',
          `supabase.cmd ${supabaseArgs
            .map((argument) => `"${argument.replace(/"/g, '""')}"`)
            .join(' ')}`,
        ]
      : supabaseArgs;
    const { stdout } = await execFileAsync(executable, args, {
      cwd: supabaseWorkdir,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      windowsVerbatimArguments: process.platform === 'win32',
    });
    const payload = JSON.parse(stdout) as { rows?: Array<{ kind: string; rows: unknown[] }> };
    const people = (payload.rows?.find((row) => row.kind === 'people')?.rows || []) as BbtmCatalogPerson[];
    const vessels = (payload.rows?.find((row) => row.kind === 'vessels')?.rows || []) as BbtmCatalogVessel[];
    if (!people.length || !vessels.length) throw new Error('Catalogue SeaPilot incomplet ou inaccessible.');
    return { people, vessels };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log('Lecture du classeur et du catalogue SeaPilot…');
  const catalogPromise = options.catalogPath
    ? readFile(options.catalogPath, 'utf8').then((content) => JSON.parse(content) as BbtmCatalog)
    : fetchSeaPilotCatalog(options.supabaseWorkdir);
  const [sources, catalog] = await Promise.all([
    Promise.all(options.sources.map(async (sourceFile) => ({ sourceFile, buffer: await readFile(sourceFile) }))),
    catalogPromise,
  ]);
  console.log(`Catalogue chargé : ${catalog.people.length} personnes, ${catalog.vessels.length} navires/lieux.`);
  console.log('Reconstruction des périodes et proposition des bordées…');
  const preview = await buildBbtmImportPreviewFromSources(sources, catalog, {
    cutoffDate: options.cutoff,
  });
  console.log('Prévisualisation calculée, écriture du manifeste…');
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(preview, null, 2)}\n`, 'utf8');
  const sqlBundle = buildBbtmImportSql(preview);
  const outputStem = options.output.toLowerCase().endsWith('.json') ? options.output.slice(0, -5) : options.output;
  const applyPath = `${outputStem}.apply.sql`;
  const rollbackPath = `${outputStem}.rollback.sql`;
  await Promise.all([
    writeFile(applyPath, sqlBundle.applySql, 'utf8'),
    writeFile(rollbackPath, sqlBundle.rollbackSql, 'utf8'),
  ]);
  console.log(
    [
      `Aperçu écrit dans ${options.output}`,
      `${preview.metrics.importablePeriods} périodes importables`,
      `${preview.metrics.blockedPeriods} périodes bloquées`,
      `${preview.metrics.reviewCells} cellules à vérifier`,
      `${preview.metrics.inferredBoards} bordées proposées`,
      `scripts préparés : ${applyPath} et ${rollbackPath}`,
      'Aucune écriture en production.',
    ].join(' · '),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
