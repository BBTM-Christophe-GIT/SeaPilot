import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const apply = process.argv.slice(2).includes('--apply');
const unexpectedArgs = process.argv.slice(2).filter((argument) => argument !== '--apply');

if (unexpectedArgs.length > 0) {
  throw new Error(`Unknown argument(s): ${unexpectedArgs.join(', ')}. Use --apply to write after the default dry run.`);
}

const outputDirectory = resolve('.data');
const exportPath = resolve(outputDirectory, 'sharepoint-project-documents.json');

await mkdir(outputDirectory, { recursive: true });

function runScript(scriptPath: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', resolve(scriptPath), ...args], {
      stdio: 'inherit',
      windowsHide: true,
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${scriptPath} exited with code ${code ?? 'unknown'}.`));
      }
    });
  });
}

await runScript('scripts/export-sharepoint-list.ts', [
  '--source-key',
  'library-documents-projets',
  '--source-key',
  'library-documents-contractuels',
  '--output',
  exportPath,
]);

const importArgs = ['--file', exportPath];
if (apply) {
  importArgs.push('--resolve-project-document-links');
} else {
  importArgs.push('--dry-run');
}

await runScript('scripts/import-sharepoint-export.ts', importArgs);

console.log(
  apply
    ? 'Project document metadata refreshed in Supabase. No SharePoint file content was downloaded.'
    : 'Dry run complete. Re-run with --apply after reviewing the export and row counts.',
);
