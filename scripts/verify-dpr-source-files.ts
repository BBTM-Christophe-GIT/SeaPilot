import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DprMigrationManifest } from '../src/features/dpr/dprMigration.ts';

const manifestPath = resolve(process.argv[2] || '.data/dpr-migration-manifest.json');
const sourceDirectory = resolve(process.argv[3] || '.data/dpr-source-files');
const reportPath = resolve(process.argv[4] || '.data/dpr-source-files-inventory.json');

async function walk(directory: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [name, nestedPath] of await walk(path)) {
        if (result.has(name)) throw new Error(`Duplicate local source filename: ${name}.`);
        result.set(name, nestedPath);
      }
    } else {
      if (result.has(entry.name.toLowerCase())) throw new Error(`Duplicate local source filename: ${entry.name}.`);
      result.set(entry.name.toLowerCase(), path);
    }
  }
  return result;
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as DprMigrationManifest;
const localFiles = await walk(sourceDirectory);
const inventory = [];
const errors: string[] = [];
for (const file of manifest.files.filter((entry) => entry.kind !== 'excluded')) {
  const localPath = localFiles.get(file.fileName.toLowerCase());
  if (!localPath) {
    errors.push(`Missing ${file.kind}: ${file.fileName}`);
    continue;
  }
  const bytes = await readFile(localPath);
  const fileStat = await stat(localPath);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  if (file.sizeBytes !== null && file.sizeBytes !== fileStat.size) errors.push(`Size mismatch: ${file.fileName}; expected=${file.sizeBytes}; actual=${fileStat.size}.`);
  if (file.kind === 'pdf' && bytes.subarray(0, 5).toString('ascii') !== '%PDF-') errors.push(`Invalid PDF signature: ${file.fileName}.`);
  inventory.push({ sourceItemId: file.sourceItemId, dprNumber: file.dprNumber, kind: file.kind, fileName: file.fileName, sizeBytes: fileStat.size, sha256: checksum });
}
const checksumGroups = new Map<string, typeof inventory>();
for (const entry of inventory) checksumGroups.set(entry.sha256, [...(checksumGroups.get(entry.sha256) || []), entry]);
const duplicateChecksums = [...checksumGroups.entries()]
  .filter(([, entries]) => entries.length > 1)
  .map(([checksum, entries]) => ({ checksum, files: entries.map((entry) => entry.fileName) }));
const report = {
  generatedAt: new Date().toISOString(),
  expectedEligibleFiles: manifest.files.filter((entry) => entry.kind !== 'excluded').length,
  verifiedFiles: inventory.length,
  verifiedPdfs: inventory.filter((entry) => entry.kind === 'pdf').length,
  verifiedPhotos: inventory.filter((entry) => entry.kind === 'photo').length,
  duplicateChecksums,
  errors,
  files: inventory,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Verified files=${report.verifiedFiles}, PDFs=${report.verifiedPdfs}, photos=${report.verifiedPhotos}, errors=${errors.length}.`);
console.log(`Inventory written to ${reportPath}.`);
if (errors.length) process.exitCode = 2;
