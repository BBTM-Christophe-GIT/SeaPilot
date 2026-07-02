import {
  buildSharePointImportBatchesFromExport,
  buildSharePointImportReport,
  importSharePointExportBundle,
  resolveSharePointDocumentLinks,
  resolveSharePointDprLinks,
  resolveSharePointFleetCertificateLinks,
  resolveSharePointHrDocumentLinks,
  resolveSharePointOperationLinks,
  resolveSharePointPlanningLinks,
  resolveSharePointProjectDocumentLinks,
  resolveSharePointProjectLinks,
  resolveSharePointPublishedProcedureLinks,
  type SharePointExportBundle,
  type SharePointSupabaseClient,
} from './sharePointImport.ts';

type EnvSource = Record<string, string | undefined>;

interface SharePointImportCliDependencies {
  createClient(url: string, key: string): SharePointSupabaseClient;
  readTextFile(path: string): Promise<string>;
  writeLine?(line: string): void;
}

interface ParsedArgs {
  dryRun: boolean;
  filePath: string | null;
  resolveDocumentLinks: boolean;
  resolveDprLinks: boolean;
  resolveFleetCertificateLinks: boolean;
  resolveHrDocumentLinks: boolean;
  resolveOperationLinks: boolean;
  resolvePlanningLinks: boolean;
  resolveProjectDocumentLinks: boolean;
  resolveProjectLinks: boolean;
  resolvePublishedProcedureLinks: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    dryRun: false,
    filePath: null,
    resolveDocumentLinks: false,
    resolveDprLinks: false,
    resolveFleetCertificateLinks: false,
    resolveHrDocumentLinks: false,
    resolveOperationLinks: false,
    resolvePlanningLinks: false,
    resolveProjectDocumentLinks: false,
    resolveProjectLinks: false,
    resolvePublishedProcedureLinks: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--dry-run') {
      parsed.dryRun = true;
    }

    if (arg === '--resolve-planning-links') {
      parsed.resolvePlanningLinks = true;
    }

    if (arg === '--resolve-dpr-links') {
      parsed.resolveDprLinks = true;
    }

    if (arg === '--resolve-document-links') {
      parsed.resolveDocumentLinks = true;
    }

    if (arg === '--resolve-operation-links') {
      parsed.resolveOperationLinks = true;
    }

    if (arg === '--resolve-hr-document-links') {
      parsed.resolveHrDocumentLinks = true;
    }

    if (arg === '--resolve-fleet-certificate-links') {
      parsed.resolveFleetCertificateLinks = true;
    }

    if (arg === '--resolve-published-procedure-links') {
      parsed.resolvePublishedProcedureLinks = true;
    }

    if (arg === '--resolve-project-links') {
      parsed.resolveProjectLinks = true;
    }

    if (arg === '--resolve-project-document-links') {
      parsed.resolveProjectDocumentLinks = true;
    }

    if (arg === '--file') {
      parsed.filePath = args[index + 1] || null;
      index += 1;
    }
  }

  return parsed;
}

function write(dependencies: SharePointImportCliDependencies, line: string) {
  dependencies.writeLine?.(line);
}

function requiredEnv(env: EnvSource, keys: string[]): string | null {
  for (const key of keys) {
    const value = env[key];

    if (value && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function parseBundle(rawContent: string): SharePointExportBundle {
  const bundle = JSON.parse(rawContent) as SharePointExportBundle;

  if (!Array.isArray(bundle.sources)) {
    throw new Error('Invalid SharePoint export bundle: sources must be an array.');
  }

  return bundle;
}

export async function runSharePointImportCli(
  args: string[],
  env: EnvSource,
  dependencies: SharePointImportCliDependencies,
): Promise<number> {
  const parsed = parseArgs(args);

  if (!parsed.filePath) {
    write(dependencies, 'Missing required argument: --file <path>');
    return 1;
  }

  try {
    const bundle = parseBundle(await dependencies.readTextFile(parsed.filePath));

    if (parsed.dryRun) {
      const report = buildSharePointImportReport(
        buildSharePointImportBatchesFromExport(bundle).map((batch) => ({
          sourceKey: batch.sourceKey,
          targetTable: batch.targetTable,
          rowCount: batch.rows.length,
        })),
      );
      write(dependencies, `Dry run: ${report.totalSources} source(s), ${report.totalRows} row(s) ready to import.`);
      return 0;
    }

    const supabaseUrl = requiredEnv(env, ['SUPABASE_URL', 'VITE_SUPABASE_URL']);
    const supabaseKey = requiredEnv(env, ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY']);

    if (!supabaseUrl) {
      write(dependencies, 'Missing required environment variable: SUPABASE_URL');
      return 1;
    }

    if (!supabaseKey) {
      write(dependencies, 'Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY');
      return 1;
    }

    const client = dependencies.createClient(supabaseUrl, supabaseKey);
    const report = await importSharePointExportBundle(client, bundle);
    write(dependencies, `Imported ${report.totalRows} row(s) from ${report.totalSources} source(s).`);

    if (parsed.resolvePlanningLinks) {
      const resolution = await resolveSharePointPlanningLinks(client);
      const resolvedPeople = resolution.reduce((total, result) => total + result.resolvedPeople, 0);
      const resolvedVessels = resolution.reduce((total, result) => total + result.resolvedVessels, 0);
      write(dependencies, `Resolved planning links: ${resolvedPeople} people link(s), ${resolvedVessels} vessel link(s).`);
    }

    if (parsed.resolveHrDocumentLinks) {
      const resolution = await resolveSharePointHrDocumentLinks(client);
      const resolvedDocuments = resolution.reduce((total, result) => total + result.resolvedDocuments, 0);
      write(dependencies, `Resolved HR document links: ${resolvedDocuments} document link(s).`);
    }

    if (parsed.resolveFleetCertificateLinks) {
      const resolution = await resolveSharePointFleetCertificateLinks(client);
      const resolvedCertificates = resolution.reduce((total, result) => total + result.resolvedCertificates, 0);
      write(dependencies, `Resolved fleet certificate links: ${resolvedCertificates} certificate link(s).`);
    }

    if (parsed.resolvePublishedProcedureLinks) {
      const resolution = await resolveSharePointPublishedProcedureLinks(client);
      const resolvedPublications = resolution.reduce((total, result) => total + result.resolvedPublications, 0);
      write(dependencies, `Resolved published procedure links: ${resolvedPublications} publication link(s).`);
    }

    if (parsed.resolveProjectLinks) {
      const resolution = await resolveSharePointProjectLinks(client);
      const resolvedClients = resolution.reduce((total, result) => total + result.resolvedClients, 0);
      const resolvedVessels = resolution.reduce((total, result) => total + result.resolvedVessels, 0);
      write(dependencies, `Resolved project links: ${resolvedClients} client link(s), ${resolvedVessels} vessel link(s).`);
    }

    if (parsed.resolveProjectDocumentLinks) {
      const resolution = await resolveSharePointProjectDocumentLinks(client);
      const resolvedDocuments = resolution.reduce((total, result) => total + result.resolvedDocuments, 0);
      write(dependencies, `Resolved project document links: ${resolvedDocuments} document link(s).`);
    }

    if (parsed.resolveDprLinks) {
      const resolution = await resolveSharePointDprLinks(client);
      const resolvedProjects = resolution.reduce((total, result) => total + result.resolvedProjects, 0);
      const resolvedVessels = resolution.reduce((total, result) => total + result.resolvedVessels, 0);
      const resolvedDprItems = resolution.reduce((total, result) => total + result.resolvedDprItems, 0);
      write(
        dependencies,
        `Resolved DPR links: ${resolvedProjects} project link(s), ${resolvedVessels} vessel link(s), ${resolvedDprItems} DPR archive link(s).`,
      );
    }

    if (parsed.resolveOperationLinks) {
      const resolution = await resolveSharePointOperationLinks(client);
      const resolvedProjects = resolution.reduce((total, result) => total + result.resolvedProjects, 0);
      const resolvedVessels = resolution.reduce((total, result) => total + result.resolvedVessels, 0);
      const resolvedActions = resolution.reduce((total, result) => total + result.resolvedActions, 0);
      write(
        dependencies,
        `Resolved operation links: ${resolvedProjects} project link(s), ${resolvedVessels} vessel link(s), ${resolvedActions} action document link(s).`,
      );
    }

    if (parsed.resolveDocumentLinks) {
      const resolution = await resolveSharePointDocumentLinks(client);
      const resolvedPeople = resolution.reduce((total, result) => total + result.resolvedPeople, 0);
      const resolvedVessels = resolution.reduce((total, result) => total + result.resolvedVessels, 0);
      write(dependencies, `Resolved document links: ${resolvedPeople} people link(s), ${resolvedVessels} vessel link(s).`);
    }

    return 0;
  } catch (error) {
    write(dependencies, error instanceof Error ? error.message : 'SharePoint import failed.');
    return 1;
  }
}
