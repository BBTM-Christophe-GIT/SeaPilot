import { XMLParser } from 'fast-xml-parser';
import type { SharePointExportBundle, SharePointListItem } from './sharePointImport.ts';

type XmlRecord = Record<string, unknown>;

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function convertValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as XmlRecord;
  if (String(record['@_null']).toLowerCase() === 'true') return null;
  if ('element' in record) return asArray(record.element).map(convertValue);
  if ('#text' in record) return record['#text'];
  const businessKeys = Object.keys(record).filter((key) => !key.startsWith('@_'));
  if (!businessKeys.length) return '';
  if (businessKeys.length === 1) return convertValue(record[businessKeys[0]]);
  return Object.fromEntries(businessKeys.map((key) => [key, convertValue(record[key])]));
}

export function parseSharePointAtomItems(xml: string): SharePointListItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: true,
    trimValues: false,
    isArray: (_name, path) => {
      const pathText = String(path);
      return pathText.endsWith('.feed.entry') || pathText.endsWith('.entry.link') || pathText.endsWith('.element');
    },
  });
  const document = parser.parse(xml) as XmlRecord;
  const feed = document.feed as XmlRecord | undefined;
  return asArray(feed?.entry as XmlRecord | XmlRecord[] | undefined).map((entry) => {
    const content = entry.content as XmlRecord | undefined;
    const properties = (content?.properties || {}) as XmlRecord;
    const fields = Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, convertValue(value)]));
    const fileLink = asArray(entry.link as XmlRecord | XmlRecord[] | undefined)
      .find((link) => link['@_title'] === 'File');
    const inline = fileLink?.inline as XmlRecord | undefined;
    const linkedEntry = inline?.entry as XmlRecord | undefined;
    const linkedContent = linkedEntry?.content as XmlRecord | undefined;
    const fileProperties = (linkedContent?.properties || {}) as XmlRecord;
    if (Object.keys(fileProperties).length) {
      const convertedFile = Object.fromEntries(Object.entries(fileProperties).map(([key, value]) => [key, convertValue(value)]));
      fields.FileLeafRef ||= convertedFile.Name;
      fields.FileRef ||= convertedFile.ServerRelativeUrl;
      fields.File_x0020_Size ||= convertedFile.Length;
      fields.MimeType ||= convertedFile.MimeType;
      fields.UniqueId ||= convertedFile.UniqueId;
    }
    const id = fields.ID ?? fields.Id;
    return {
      id: typeof id === 'string' || typeof id === 'number' ? id : undefined,
      fields: fields as SharePointListItem['fields'],
    };
  });
}

export function buildSharePointBundleFromAtom({
  attachments = [],
  exportedAt,
  libraryXml,
  reportXml,
}: {
  attachments?: SharePointListItem[];
  exportedAt: string;
  libraryXml: string;
  reportXml: string;
}): SharePointExportBundle {
  return {
    exportedAt,
    sources: [
      { sourceKey: 'list-indicateurs-projet-p144emdt', items: parseSharePointAtomItems(reportXml) },
      { sourceKey: 'library-dpr', items: [...parseSharePointAtomItems(libraryXml), ...attachments] },
    ],
  };
}
