import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildSharePointBundleFromAtom, parseSharePointAtomItems } from '../src/features/sharepoint/sharePointAtomExport.ts';
import type { SharePointListItem } from '../src/features/sharepoint/sharePointImport.ts';

const reportXmlPath = resolve(process.argv[2] || '.data/sharepoint-dpr-items.xml');
const libraryXmlPath = resolve(process.argv[3] || '.data/sharepoint-dpr-library.xml');
const outputPath = resolve(process.argv[4] || '.data/sharepoint-dpr-full.json');
const attachmentsPath = resolve(process.argv[5] || '.data/sharepoint-dpr-attachment-items.json');
const peopleXmlPath = resolve(process.argv[6] || '.data/sharepoint-dpr-people.xml');
let attachments: SharePointListItem[] = [];
try {
  attachments = JSON.parse(await readFile(attachmentsPath, 'utf8'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  const dataDirectory = resolve('.data');
  const attachmentFiles = (await readdir(dataDirectory)).filter((name) => /^sharepoint-dpr-attachments-\d+\.xml$/.test(name)).sort();
  for (const attachmentFile of attachmentFiles) {
    const dprItemId = attachmentFile.match(/-(\d+)\.xml$/)?.[1];
    if (!dprItemId) continue;
    const parsedItems = parseSharePointAtomItems(await readFile(resolve(dataDirectory, attachmentFile), 'utf8'));
    parsedItems.forEach((item, index) => {
      const sourceFields = item.fields || {};
      const fileName = String(sourceFields.FileName || `attachment-${index + 1}`);
      const serverRelativeUrl = String(sourceFields.ServerRelativeUrl || '');
      attachments.push({
        id: `attachment-${dprItemId}-${index + 1}`,
        webUrl: serverRelativeUrl ? new URL(serverRelativeUrl, 'https://bbtm668.sharepoint.com').toString() : undefined,
        fields: {
          ...sourceFields,
          ID: `attachment-${dprItemId}-${index + 1}`,
          FileLeafRef: fileName,
          FileRef: serverRelativeUrl,
          EncodedAbsUrl: serverRelativeUrl ? new URL(serverRelativeUrl, 'https://bbtm668.sharepoint.com').toString() : null,
          DPRId: dprItemId,
          FileSystemObjectType: 0,
        },
      });
    });
  }
}
const bundle = buildSharePointBundleFromAtom({
  exportedAt: new Date().toISOString(),
  reportXml: await readFile(reportXmlPath, 'utf8'),
  libraryXml: await readFile(libraryXmlPath, 'utf8'),
  attachments,
});
try {
  const people = parseSharePointAtomItems(await readFile(peopleXmlPath, 'utf8'));
  const peopleById = new Map(people.map((person) => [String(person.id), {
    name: String(person.fields?.Pr_x00e9_nom_x0020__x0026__x0020 || '').trim(),
    functionLabel: String(person.fields?.Fonction || '').trim(),
  }]));
  bundle.sources[0].items.forEach((item) => {
    const sourceFields = item.fields || {};
    const issuer = peopleById.get(String(sourceFields.EmetteurId || ''));
    if (issuer?.name) sourceFields.Emetteur = issuer.name;
    const crewIds = Array.isArray(sourceFields.Bord_x00e9_eId) ? sourceFields.Bord_x00e9_eId : [];
    sourceFields.BordeeResolvedNames = crewIds.map((id) => peopleById.get(String(id))?.name).filter(Boolean);
    sourceFields.BordeeResolvedFunctions = crewIds.map((id) => peopleById.get(String(id))?.functionLabel || '');
  });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
console.log(`SharePoint DPR bundle written to ${outputPath}.`);
console.log(`Reports=${bundle.sources[0].items.length}, library/attachments=${bundle.sources[1].items.length}.`);
