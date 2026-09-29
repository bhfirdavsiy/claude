import { execFileSync } from 'node:child_process';
import path from 'node:path';

function unzipText(file: string, entry: string): string {
  try {
    return execFileSync('unzip', ['-p', file, entry], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error: any) {
    throw new Error(`XLSX_ENTRY_READ_FAILED:${entry}:${error?.message ?? error}`);
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : undefined;
}

function columnIndex(cellRef: string): number {
  const letters = cellRef.match(/^[A-Z]+/)?.[0];
  if (!letters) throw new Error(`INVALID_CELL_REF:${cellRef}`);
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<(?:x:)?si\b[^>]*>([\s\S]*?)<\/(?:x:)?si>/g;
  for (const match of xml.matchAll(re)) {
    const textParts = [...match[1].matchAll(/<(?:x:)?t\b[^>]*>([\s\S]*?)<\/(?:x:)?t>/g)]
      .map((m) => decodeXml(m[1]));
    out.push(textParts.join(''));
  }
  return out;
}

function parseWorksheet(xml: string, sharedStrings: string[]): Array<Array<string|number|null>> {
  const rows: Array<Array<string|number|null>> = [];
  let maxRow = 0;
  const rowRe = /<(?:x:)?row\b([^>]*)>([\s\S]*?)<\/(?:x:)?row>/g;
  for (const rowMatch of xml.matchAll(rowRe)) {
    const rowNumber = Number(attr(rowMatch[1], 'r') ?? '0');
    if (!Number.isInteger(rowNumber) || rowNumber < 1) continue;
    maxRow = Math.max(maxRow, rowNumber);
    const cells: Array<string|number|null> = [];
    const cellRe = /<(?:x:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:x:)?c>)/g;
    for (const cellMatch of rowMatch[2].matchAll(cellRe)) {
      const ref = attr(cellMatch[1], 'r');
      if (!ref) continue;
      const idx = columnIndex(ref);
      const type = attr(cellMatch[1], 't');
      const body = cellMatch[2] ?? '';
      const raw = body.match(/<(?:x:)?v\b[^>]*>([\s\S]*?)<\/(?:x:)?v>/)?.[1]
        ?? body.match(/<(?:x:)?t\b[^>]*>([\s\S]*?)<\/(?:x:)?t>/)?.[1]
        ?? '';
      const decoded = decodeXml(raw);
      let value: string|number|null = decoded;
      if (type === 's') {
        const sharedIndex = Number(decoded);
        value = Number.isInteger(sharedIndex) ? (sharedStrings[sharedIndex] ?? '') : '';
      } else if (type === 'n') {
        value = decoded === '' ? null : Number(decoded);
      } else if (type === 'b') {
        value = decoded === '1' ? 'TRUE' : 'FALSE';
      }
      cells[idx] = value;
    }
    rows[rowNumber - 1] = cells;
  }
  for (let i = 0; i < maxRow; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

function normalizeTarget(target: string): string {
  const clean = target.replace(/^\//, '');
  return clean.startsWith('xl/') ? clean : path.posix.join('xl', clean);
}

export function readWorkbookSheets(file: string): Record<string, Array<Array<string|number|null>>> {
  const workbookXml = unzipText(file, 'xl/workbook.xml');
  const relsXml = unzipText(file, 'xl/_rels/workbook.xml.rels');
  const sharedXml = unzipText(file, 'xl/sharedStrings.xml');
  const sharedStrings = parseSharedStrings(sharedXml);

  const relById = new Map<string,string>();
  const relRe = /<(?:\w+:)?Relationship\b([^>]*?)\/>/g;
  for (const m of relsXml.matchAll(relRe)) {
    const id = attr(m[1], 'Id');
    const target = attr(m[1], 'Target');
    if (id && target) relById.set(id, normalizeTarget(target));
  }

  const sheets: Record<string, Array<Array<string|number|null>>> = {};
  const sheetRe = /<(?:x:)?sheet\b([^>]*?)\/>/g;
  for (const m of workbookXml.matchAll(sheetRe)) {
    const name = attr(m[1], 'name');
    const relId = attr(m[1], 'r:id');
    if (!name || !relId) continue;
    const target = relById.get(relId);
    if (!target) throw new Error(`XLSX_SHEET_RELATION_MISSING:${name}:${relId}`);
    sheets[name] = parseWorksheet(unzipText(file, target), sharedStrings);
  }
  return sheets;
}
