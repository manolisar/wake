// Excel (.xlsx) import + faithful styled export, matching the fleet's official
// "Speed Templates" workbook 1:1 (layout, fonts, colours, formulas).
//
// Workbook = one sheet per voyage (sheet name = voyage id). Per sheet:
//   R1  ship name        (merged A1:P4, navy #002060 fill, white Arial 24)
//   R5  start port       (merged A5:P5, navy Arial 12 bold)
//   R6  date range       (merged A6:P6, navy Arial 12 bold)
//   R7  column headers    (navy Arial 12 bold; "Open Loop Time" red Arial 10)
//   R8+ leg rows          (Arial 12 bold; ETA + FAW red; port names Century
//                          Gothic; embark/disembark rows navy fill, white text)
//   last  Total: + SUM
// Speed column carries a conditional format: > 20 kn → light-red fill / dark-red
// text (Excel's classic style), matching the source file.
//
// Columns: A Date(weekday) · B Date · C Port · D Type(D/C/T) · E Distance ·
// F Time(formula) · G Speed(formula 0.0) · H ETA · I Arrival · J Departure ·
// K FAW · L Sunrise · M Sunset · N ZT("UTC -5") · O Remarks · P Open Loop Time
// (decimal hours). St/By distances + Sea Condition are app-only and intentionally
// NOT in this template (see CLAUDE.md §7).
// exceljs is large; load it lazily (dynamic import) so it stays out of the
// initial bundle and only downloads when the user actually imports/exports.
// `import type` is erased at build time — it bundles nothing, just gives types.
import type ExcelJS from 'exceljs';
import type { Leg, LegType, ShipCode, Voyage, VoyageMap } from '../types';
import { computeVoyage } from '../domain/calculations';
import { shipByCode, SHIPS } from '../domain/ships';
import { hhmmToMin, dayNum } from '../domain/time';

const NAVY = 'FF002060';
const RED = 'FFFF0000';
const WHITE = 'FFFFFFFF';
const CF_FILL = 'FFFFC7CE';
const CF_TEXT = 'FF9C0006';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export type XlsxScope = 'current' | 'all';

interface ExcelJSModule {
  Workbook: { new (): ExcelJS.Workbook };
}

/** Lazily load the exceljs runtime (code-split into its own chunk). exceljs is
 *  used only for the styled WRITE/export path — reads go through SheetJS, whose
 *  xlsx reader is reliable in-browser (exceljs's xlsx.load hangs under Vite). */
async function xlsxLib(): Promise<ExcelJSModule> {
  const mod = (await import('exceljs')) as unknown as { default?: ExcelJSModule } & ExcelJSModule;
  return mod.default ?? mod;
}

// ── conversions ─────────────────────────────────────────────────────────
function typeToCode(t: LegType): string {
  return t === 'Sea' ? 'C' : t === 'Tender' ? 'T' : 'D';
}
function codeToType(code: string): LegType {
  const c = (code || '').trim().toUpperCase();
  return c === 'C' ? 'Sea' : c === 'T' ? 'Tender' : 'Port';
}
function utcToZT(utc: string): string {
  if (utc === '' || utc == null || isNaN(Number(utc))) return '';
  const n = Number(utc);
  return 'UTC ' + (n >= 0 ? '+' : '') + n;
}
function ztToUtc(zt: unknown): string {
  if (typeof zt !== 'string') return '';
  const m = zt.match(/-?\+?\d+/);
  if (!m) return '';
  return String(parseInt(m[0].replace('+', ''), 10));
}
/** decimal hours → 'HH:MM' (e.g. 6.5 → '06:30'). */
function hoursToHHMM(h: number): string {
  if (isNaN(h)) return '';
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
/** 'HH:MM' → decimal hours number, or null. */
function hhmmToHours(s: string): number | null {
  const m = hhmmToMin(s);
  return m == null ? null : m / 60;
}
/** minutes-of-day → Excel time fraction (0..1). */
function minToFraction(min: number | null): number | null {
  return min == null ? null : min / 1440;
}

// ── IMPORT ───────────────────────────────────────────────────────────────
export interface ImportResult {
  shipCode: ShipCode | null;
  shipName: string;
  voyages: VoyageMap;
  selectedId: string;
}

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function matchShipName(name: string): ShipCode | null {
  const n = name.trim().toLowerCase();
  for (const s of SHIPS) {
    if (n === s.name.toLowerCase() || n.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(n)) {
      return s.code;
    }
  }
  return null;
}

type CellVal = ExcelJS.CellValue;

function cellToISO(v: CellVal): string {
  if (v instanceof Date) {
    return v.getUTCFullYear() + '-' + String(v.getUTCMonth() + 1).padStart(2, '0') + '-' + String(v.getUTCDate()).padStart(2, '0');
  }
  if (typeof v === 'number') {
    // Excel serial (1900 system) → ms. 25569 = days between 1899-12-30 and epoch.
    const ms = (v - 25569) * 86400000;
    const d = new Date(ms);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  return '';
}

function cellToHHMM(v: CellVal): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    return String(v.getUTCHours()).padStart(2, '0') + ':' + String(v.getUTCMinutes()).padStart(2, '0');
  }
  if (typeof v === 'number') {
    const frac = v - Math.floor(v); // time-of-day fraction
    const total = Math.round(frac * 1440);
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }
  return '';
}

function cellStr(v: CellVal): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'text' in (v as object)) return String((v as { text: unknown }).text ?? '');
  if (typeof v === 'object' && 'result' in (v as object)) return String((v as { result: unknown }).result ?? '');
  return String(v).trim();
}

function cellNum(v: CellVal): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v && 'result' in v && typeof (v as { result: unknown }).result === 'number') {
    return (v as { result: number }).result;
  }
  const n = Number(cellStr(v));
  return isNaN(n) ? null : n;
}

// Library-agnostic sheet parser: `get(r, col)` returns the 1-based cell value
// (A1 = (1,1)). Reused for the SheetJS read path; kept pure so it can't hang.
function parseSheet(get: (r: number, col: number) => CellVal, lastRow: number): Leg[] {
  // Locate the header row (the one whose column C reads "Port").
  let headerRow = 7;
  for (let r = 1; r <= 15; r++) {
    if (cellStr(get(r, 3)).toLowerCase() === 'port') {
      headerRow = r;
      break;
    }
  }
  const legs: Leg[] = [];
  // Bound the scan and bail after a run of blank rows — defensive against odd
  // sheet dimensions so import can never spin.
  const end = Math.min(lastRow, headerRow + 1000);
  let blankRun = 0;
  for (let r = headerRow + 1; r <= end; r++) {
    const cPort = cellStr(get(r, 3));
    const dType = cellStr(get(r, 4));
    if (/^total/i.test(cPort)) break;
    if (!cPort && !dType && !get(r, 2)) {
      if (++blankRun > 50) break;
      continue; // blank row
    }
    blankRun = 0;
    const type = codeToType(dType);
    const isPort = type === 'Port' || type === 'Tender';
    const distNum = cellNum(get(r, 5));
    const olHours = cellNum(get(r, 16));
    legs.push({
      type,
      date: cellToISO(get(r, 2)) || cellToISO(get(r, 1)),
      port: cPort,
      dist: isPort && distNum != null ? String(distNum) : '',
      mode: 'speed',
      eta: cellToHHMM(get(r, 8)),
      arr: cellToHHMM(get(r, 9)),
      dep: cellToHHMM(get(r, 10)),
      faw: cellToHHMM(get(r, 11)),
      sunrise: cellToHHMM(get(r, 12)),
      sunset: cellToHHMM(get(r, 13)),
      utc: ztToUtc(get(r, 14)),
      openLoop: olHours != null ? hoursToHHMM(olHours) : '',
      seaCond: '',
      stbyArrDist: '',
      stbyDepDist: '',
      stbyArrPowerMW: '',
      stbyDepPowerMW: '',
      remarks: cellStr(get(r, 15)),
      speed: '',
    });
  }
  return legs;
}

export async function parseWorkbook(buf: ArrayBuffer, loggedBy: string): Promise<ImportResult> {
  // SheetJS reads xlsx reliably in-browser (exceljs's xlsx.load hangs in Vite).
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const voyages: VoyageMap = {};
  let shipName = '';
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const get = (r: number, col: number): CellVal => {
      const cell = ws[XLSX.utils.encode_cell({ r: r - 1, c: col - 1 })] as { v?: unknown } | undefined;
      return (cell?.v ?? null) as CellVal;
    };
    if (!shipName) {
      const a1 = cellStr(get(1, 1));
      if (a1) shipName = a1;
    }
    const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
    const lastRow = range ? range.e.r + 1 : 0;
    const id = name.trim();
    voyages[id] = {
      id,
      number: id, // sheet name is the voyage number
      title: `Voyage ${id}`,
      ended: false,
      locked: false,
      loggedBy,
      legs: parseSheet(get, lastRow),
      versions: [{ action: 'Imported', by: loggedBy, note: 'Imported from Excel', at: nowStamp() }],
    };
  }
  const ids = Object.keys(voyages).sort((a, b) => Number(a) - Number(b));
  return { shipCode: matchShipName(shipName), shipName, voyages, selectedId: ids[0] ?? '' };
}

export async function importExcel(loggedBy: string): Promise<ImportResult | null> {
  const buf = await pickXlsx();
  if (!buf) return null;
  return parseWorkbook(buf, loggedBy);
}

// ── EXPORT (faithful styled workbook) ─────────────────────────────────────
const HEADERS = ['Date', '', 'Port', 'Type', 'Distance', 'Time', 'Speed', 'ETA', 'Arrival', 'Departure', 'FAW', 'Sunrise', 'Sunset', 'ZT', 'Remarks', 'Open Loop Time'];
const COL_WIDTHS = [7.5, 13.3, 39.4, 10.5, 10.8, 13.7, 8.7, 9.3, 13.2, 13.2, 9.3, 10.5, 10.5, 10.3, 41.7, 16.3];

function dateRange(legs: Leg[]): string {
  const dated = legs.map((l) => l.date).filter(Boolean).sort();
  if (!dated.length) return '';
  const fmt = (iso: string) => {
    const d = new Date(iso + 'T00:00:00Z');
    return String(d.getUTCDate()).padStart(2, '0') + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  };
  return fmt(dated[0]) + ' - ' + fmt(dated[dated.length - 1]);
}

function isoToDate(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00Z'); // noon UTC avoids any tz day-rollover
  return isNaN(d.getTime()) ? null : d;
}

const thin = { style: 'thin' as const };
function allBorders(): ExcelJS.Borders {
  return { top: thin, left: thin, bottom: thin, right: thin } as ExcelJS.Borders;
}

function buildSheet(wb: ExcelJS.Workbook, shipName: string, vo: Voyage): void {
  const ws = wb.addWorksheet(vo.id, { views: [{ showGridLines: true }] });
  COL_WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  // Title band (R1:P4)
  ws.mergeCells('A1:P4');
  const title = ws.getCell('A1');
  title.value = shipName;
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  title.font = { name: 'Arial', size: 24, bold: true, color: { argb: WHITE } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };

  const ports = vo.legs.filter((l) => l.type === 'Port' || l.type === 'Tender');
  const startPort = (ports[0]?.port || vo.legs[0]?.port || '').split(',')[0];
  ws.mergeCells('A5:P5');
  const sub5 = ws.getCell('A5');
  sub5.value = startPort;
  sub5.font = { name: 'Arial', size: 12, bold: true, color: { argb: NAVY } };
  sub5.alignment = { horizontal: 'center' };
  ws.mergeCells('A6:P6');
  const sub6 = ws.getCell('A6');
  sub6.value = dateRange(vo.legs);
  sub6.font = { name: 'Arial', size: 12, bold: true, color: { argb: NAVY } };
  sub6.alignment = { horizontal: 'center' };

  // Header row 7
  ws.mergeCells('A7:B7');
  HEADERS.forEach((label, i) => {
    if (i === 1) return; // merged into A7
    const cell = ws.getCell(7, i + 1);
    cell.value = label;
    const red = label === 'Open Loop Time';
    cell.font = { name: 'Arial', size: red ? 10 : 12, bold: true, color: { argb: red ? RED : NAVY } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = allBorders();
  });

  // Data rows from R8
  const cv = computeVoyage(vo);
  const START = 8;
  let prevPort: { row: number; dateNum: number | null; utc: string } | null = null;
  vo.legs.forEach((leg, idx) => {
    const r = START + idx;
    const isPort = leg.type === 'Port' || leg.type === 'Tender';
    const isEdge = idx === 0 || idx === vo.legs.length - 1;
    const d = isoToDate(leg.date);

    // A weekday + B date (same value, different formats)
    const aCell = ws.getCell(r, 1);
    const bCell = ws.getCell(r, 2);
    if (d) {
      aCell.value = d;
      aCell.numFmt = 'ddd';
      bCell.value = d;
      bCell.numFmt = 'dd/mmm/yy';
    }
    ws.getCell(r, 3).value = leg.port;
    ws.getCell(r, 4).value = typeToCode(leg.type);
    if (isPort && leg.dist !== '' && !isNaN(Number(leg.dist))) ws.getCell(r, 5).value = Number(leg.dist);

    // Time + Speed formulas (port legs with a previous port)
    if (isPort && prevPort) {
      const n = ((dayNum(leg.date) ?? 0) - (prevPort.dateNum ?? 0)) - 1;
      const mt = Number(leg.utc) - Number(prevPort.utc); // utc_cur − utc_prev
      const mTerm = mt >= 0 ? `-${mt}` : `+${-mt}`;
      ws.getCell(r, 6).value = { formula: `(24/24+H${r}-K${prevPort.row})+${n}${mTerm}/24` } as ExcelJS.CellFormulaValue;
      ws.getCell(r, 6).numFmt = '[hh]:mm';
      ws.getCell(r, 7).value = { formula: `E${r}/F${r}/24` } as ExcelJS.CellFormulaValue;
      ws.getCell(r, 7).numFmt = '0.0';
    }

    // ETA (concrete time): SPD uses leg.eta; TIME uses the computed ETA
    const etaStr = leg.mode === 'time' ? (cv.legViews[idx]?.etaComputed ? cv.legViews[idx].etaDisplay : '') : leg.eta;
    const setTime = (col: number, hhmm: string) => {
      const f = minToFraction(hhmmToMin(hhmm));
      if (f != null) {
        ws.getCell(r, col).value = f;
        ws.getCell(r, col).numFmt = 'h:mm';
      }
    };
    setTime(8, etaStr && etaStr !== '—' ? etaStr : '');
    setTime(9, leg.arr);
    setTime(10, leg.dep);
    setTime(11, leg.faw);
    setTime(12, leg.sunrise);
    setTime(13, leg.sunset);
    ws.getCell(r, 14).value = utcToZT(leg.utc);
    ws.getCell(r, 15).value = leg.remarks;
    const olh = hhmmToHours(leg.openLoop);
    if (olh != null) ws.getCell(r, 16).value = olh;

    // Styling: bold Arial 12, borders, centered, red ETA/FAW, navy edge rows.
    for (let c = 1; c <= 16; c++) {
      const cell = ws.getCell(r, c);
      cell.border = allBorders();
      cell.alignment = { horizontal: c === 3 || c === 15 ? 'left' : 'center', vertical: 'middle' };
      let color: string | undefined;
      if (c === 8 || c === 11) color = RED; // ETA, FAW
      let name = 'Arial';
      if (c === 3 && isPort && !isEdge) name = 'Century Gothic'; // port-call names
      cell.font = { name, size: 12, bold: true, color: color ? { argb: color } : undefined };
      if (isEdge && c <= 3) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        cell.font = { name, size: 12, bold: true, color: { argb: WHITE } };
      }
    }
    ws.getRow(r).height = 25;

    if (isPort) prevPort = { row: r, dateNum: dayNum(leg.date), utc: leg.utc };
  });

  // Total row
  const totalRow = START + vo.legs.length;
  ws.getCell(totalRow, 3).value = 'Total:';
  ws.getCell(totalRow, 3).font = { name: 'Arial', size: 12, bold: true };
  ws.getCell(totalRow, 3).alignment = { horizontal: 'left', vertical: 'middle' };
  if (vo.legs.length > 0) {
    ws.getCell(totalRow, 5).value = { formula: `SUM(E${START}:E${totalRow - 1})` } as ExcelJS.CellFormulaValue;
    ws.getCell(totalRow, 5).font = { name: 'Arial', size: 12, bold: true };
    ws.getCell(totalRow, 5).alignment = { horizontal: 'center', vertical: 'middle' };
  }
  ws.getRow(totalRow).height = 25;

  // Conditional format: Speed > 20 kn → light-red fill / dark-red text.
  if (vo.legs.length > 0) {
    ws.addConditionalFormatting({
      ref: `G${START}:G${totalRow - 1}`,
      rules: [
        {
          type: 'cellIs',
          operator: 'greaterThan',
          formulae: ['20'],
          priority: 1,
          style: {
            fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: CF_FILL } },
            font: { color: { argb: CF_TEXT } },
          },
        },
      ],
    });
  }

  // Row heights for the title/subtitle band.
  [1, 2, 3].forEach((r) => (ws.getRow(r).height = 13));
  [4, 5, 6, 7].forEach((r) => (ws.getRow(r).height = r === 4 ? 16 : r < 7 ? 16 : 25));
}

export async function buildWorkbook(ship: ShipCode, voyages: VoyageMap, ids: string[]): Promise<ExcelJS.Workbook> {
  const XLSX = await xlsxLib();
  const wb = new XLSX.Workbook();
  const shipName = shipByCode(ship).name;
  for (const id of ids) if (voyages[id]) buildSheet(wb, shipName, voyages[id]);
  return wb;
}

export async function exportExcel(ship: ShipCode, voyages: VoyageMap, scope: XlsxScope, currentId: string): Promise<string> {
  const ids =
    scope === 'all' ? Object.keys(voyages).sort((a, b) => Number(a) - Number(b)) : currentId ? [currentId] : [];
  const wb = await buildWorkbook(ship, voyages, ids);
  const buf = await wb.xlsx.writeBuffer();
  const filename = scope === 'all' ? `${ship}_Speed-Templates.xlsx` : `${ship}_${currentId}_speed-template.xlsx`;
  download(buf as ArrayBuffer, filename);
  return filename;
}

// ── file helpers (FS Access API with input/anchor fallback) ───────────────
interface FSWindow {
  showOpenFilePicker?: (opts?: unknown) => Promise<{ getFile: () => Promise<File> }[]>;
}

async function pickXlsx(): Promise<ArrayBuffer | null> {
  const w = window as unknown as FSWindow;
  if (typeof w.showOpenFilePicker === 'function') {
    try {
      const [handle] = await w.showOpenFilePicker({
        types: [{ description: 'Excel workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
        multiple: false,
      });
      const file = await handle.getFile();
      return await file.arrayBuffer();
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return null;
      // fall through to input
    }
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(await file.arrayBuffer());
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}

function download(buf: ArrayBuffer, filename: string): void {
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 900);
}
