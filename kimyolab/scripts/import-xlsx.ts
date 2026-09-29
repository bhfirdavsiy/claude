import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkbookSheets } from '../src/domain/content/xlsx-reader.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = path.resolve(process.argv[2] || path.join(root, 'source/KimyoLab_v20_nazariya_amaliyot_mapping.xlsx'));
const sheets = readWorkbookSheets(input);

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function splitSemicolon(value: unknown): string[] {
  const v = text(value);
  return v ? v.split(';').map((x) => x.trim()).filter(Boolean) : [];
}

function dataRows(name: string, idColumn: number): Array<Array<string|number|null>> {
  const rows = sheets[name];
  if (!rows) throw new Error(`XLSX_REQUIRED_SHEET_MISSING:${name}`);
  return rows.slice(4).filter((row) => text(row[idColumn]) !== '');
}

const theory = dataRows('Nazariya-Amaliyot', 2).map((r) => ({
  legacyId: text(r[2]),
  grade: text(r[1]),
  title: text(r[3]),
  source: text(r[4]),
  conceptsText: text(r[5]),
  visualFormat: text(r[6]),
  interaction: text(r[7]),
  primaryPracticeType: text(r[8]),
  secondaryPracticeTypes: splitSemicolon(r[9]),
  existingPracticeIds: splitSemicolon(r[10]),
  existingPracticeNames: splitSemicolon(r[11]),
  coverage: text(r[12]),
  proposedPractice: text(r[13]),
  mappingLogic: text(r[14]),
  baseFile: text(r[15]),
}));

const practices = dataRows('Amaliyot-Nazariya', 2).map((r) => ({
  legacyId: text(r[2]),
  grade: text(r[1]),
  title: text(r[3]),
  source: text(r[4]),
  catalogType: text(r[5]),
  mappingType: text(r[6]),
  linkedTheoryIds: splitSemicolon(r[7]),
  linkedTheoryTitles: splitSemicolon(r[8]),
  mappingStatus: text(r[9]),
  goal: text(r[10]),
  note: text(r[11]),
  baseFile: text(r[12]),
}));

const snapshot = {
  sourceFile: path.basename(input),
  importedAt: new Date().toISOString(),
  sheetNames: Object.keys(sheets),
  theory,
  practices,
};

fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports/xlsx-import-snapshot.json'), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ theory: theory.length, practices: practices.length, sheets: Object.keys(sheets) }));
