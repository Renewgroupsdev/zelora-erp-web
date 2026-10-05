/**
 * Dependency-free downloads for the ERP modules:
 *  - `downloadExcel` writes a real .xlsx (Office Open XML in an uncompressed zip), so Excel opens it
 *    without the "format doesn't match extension" warning that .xls/HTML exports trigger.
 *  - `printDocument` opens a bill / payslip / note in a clean window and prints it - pick
 *    "Save as PDF" in the print dialog to download it.
 */

export interface ExcelColumn {
  header: string;
  key: string;
  /** Column width in characters (defaults from the header / data length). */
  width?: number;
}

export interface ExcelSheet {
  name: string;
  columns: ExcelColumn[];
  rows: Record<string, unknown>[];
  /** Optional bold totals row appended after the data. */
  totals?: Record<string, unknown>;
}

export function downloadExcel(fileName: string, sheets: ExcelSheet[]): void {
  const files: { name: string; data: string }[] = [
    { name: '[Content_Types].xml', data: contentTypes(sheets.length) },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'xl/workbook.xml', data: workbook(sheets) },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels(sheets.length) },
    { name: 'xl/styles.xml', data: STYLES },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: worksheet(s) })),
  ];
  const blob = new Blob([zip(files) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveBlob(blob, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Prints the given document HTML (built with the `.doc-*` classes from erp-document.scss). */
export function printDocument(title: string, html: string): void {
  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>${escapeXml(title)}</title><style>${DOC_PRINT_CSS}</style></head><body>${html}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 250);
}

export function fileStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Print stylesheet matching shared/styles/erp-document.scss (dialog styles don't travel with innerHTML). */
const DOC_PRINT_CSS = `
  * { box-sizing: border-box; } body { margin: 0; padding: 24px; font-family: 'Rubik', Arial, sans-serif; color: #163b35; font-size: 12px; }
  .doc-head { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 12px; border-bottom: 3px solid #138a6b; }
  .doc-head h1 { margin: 0; font-size: 20px; color: #0f6e55; } .doc-head h2 { margin: 0 0 4px; font-size: 15px; letter-spacing: 1px; }
  .doc-head p { margin: 2px 0; color: #6a837d; } .doc-meta { text-align: right; }
  .doc-parties { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 14px 0; }
  .doc-parties small, .doc-label { display: block; color: #6a837d; text-transform: uppercase; font-size: 9px; letter-spacing: .6px; margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; } th { background: #eaf6f1; text-align: left; font-size: 10px; padding: 7px; }
  td { padding: 7px; border-bottom: 1px solid #dfe9e6; } .num { text-align: right; }
  .doc-split { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .doc-totals { width: 260px; margin: 12px 0 0 auto; } .doc-totals div { display: flex; justify-content: space-between; padding: 3px 0; }
  .doc-totals .grand { border-top: 2px solid #138a6b; margin-top: 4px; padding-top: 6px; font-weight: 700; font-size: 14px; }
  .doc-words { margin-top: 10px; color: #6a837d; } .doc-stamp { display: inline-block; padding: 3px 10px; border: 2px solid #138a6b; border-radius: 6px; color: #138a6b; font-weight: 700; letter-spacing: 1px; }
  .doc-sign { display: flex; justify-content: space-between; margin-top: 48px; } .doc-sign span { border-top: 1px solid #9fb3ad; padding-top: 4px; min-width: 160px; text-align: center; }
  .doc-footer { margin-top: 24px; text-align: center; color: #9fb3ad; font-size: 10px; }
`;

// ---------------------------------------------------------------------------
// XLSX parts
// ---------------------------------------------------------------------------

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

// Style 0 = default, 1 = bold header with fill + border, 2 = number #,##0.00, 3 = bold number (totals), 4 = bold text (totals)
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD7EFE6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border/><border><bottom style="thin"><color rgb="FF4AAB90"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
</styleSheet>`;

function contentTypes(sheetCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets}</Types>`;
}

function workbook(sheets: ExcelSheet[]): string {
  const used = new Set<string>();
  const entries = sheets.map((s, i) => {
    // Sheet names: max 31 chars, no []:*?/\ and unique.
    let name = (s.name || `Sheet${i + 1}`).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);
    while (used.has(name)) name = `${name.slice(0, 28)}_${i + 1}`;
    used.add(name);
    return `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${entries}</sheets></workbook>`;
}

function workbookRels(sheetCount: number): string {
  const rels = Array.from({ length: sheetCount }, (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function worksheet(sheet: ExcelSheet): string {
  const cols = sheet.columns.map((c, i) => {
    const longest = Math.max(c.header.length, ...sheet.rows.slice(0, 200).map(r => String(r[c.key] ?? '').length));
    const width = c.width ?? Math.min(60, Math.max(10, longest + 2));
    return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`;
  }).join('');

  const cell = (col: number, row: number, value: unknown, bold = false) => {
    const ref = `${columnName(col)}${row}`;
    if (typeof value === 'number' && isFinite(value)) return `<c r="${ref}" s="${bold ? 3 : 2}"><v>${value}</v></c>`;
    if (value === null || value === undefined || value === '') return bold ? `<c r="${ref}" s="4"/>` : '';
    return `<c r="${ref}" t="inlineStr"${bold ? ' s="4"' : ''}><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
  };

  const header = `<row r="1">${sheet.columns.map((c, i) => `<c r="${columnName(i)}1" t="inlineStr" s="1"><is><t>${escapeXml(c.header)}</t></is></c>`).join('')}</row>`;
  const body = sheet.rows.map((r, ri) => `<row r="${ri + 2}">${sheet.columns.map((c, ci) => cell(ci, ri + 2, r[c.key])).join('')}</row>`).join('');
  const totalsRow = sheet.totals
    ? `<row r="${sheet.rows.length + 2}">${sheet.columns.map((c, ci) => cell(ci, sheet.rows.length + 2, sheet.totals![c.key], true)).join('')}</row>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${header}${body}${totalsRow}</sheetData></worksheet>`;
}

function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Minimal ZIP writer (STORE method - no compression needed for a few KB of XML)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: { name: string; data: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.data);
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // STORE
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let pos = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

/** Escapes user text before it goes into a printDocument() HTML string. */
export function escapeHtml(value: unknown): string {
  return escapeXml(String(value ?? ''));
}
