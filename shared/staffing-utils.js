// ── Háptica Staffing · utilidades compartidas ───────────────────────────────
// Consolidado desde index.html / consultor.html / presupuesto.html (V1).

const SHEET_DATA   = 'Dashboard_Data';
const SHEET_CONFIG = 'Config_Cargabilidad';
const SHEET_ROLES  = 'Roles_Usuarios';
const SHEET_ROLE_CONFIG = 'Roles_Config';
const SHEET_VENTA  = 'Dimensionamiento_Venta';
const SHEET_PROYECTOS = 'Proyectos';
const SHEET_SOLICITUDES = 'Solicitudes_Tiempo';

const NOMBRE_MAP = {
  'A. Roa':            'Ana Roa',
  'C. Niño':           'Camilo Niño',
  'J. Rodríguez':      'Jhojann Rodríguez',
  'Jhojann Rodriguez': 'Jhojann Rodríguez',
  'Natalia Rodriguez': 'Natalia Rodríguez',
};

const PROJECT_FIXED_ORDER = ['ADM-01', 'ADM-02', 'COM', 'OPS'];

// Roles de proyecto (columnas "Rol Háptica N" en Roles_Usuarios y "Horas Vendidas X" en Dimensionamiento_Venta)
const STAFFING_ROLES = ['Host', 'Owner', 'Doer Estrategia', 'Doer Legal', 'Doer Visual'];
// Opciones vistas hoy en Roles_Usuarios (Enfoque N / Industria N) — usadas como catálogo del formulario de proyecto
const METODOLOGIAS = ['Service Design', 'IA', 'Legal Design'];
const INDUSTRIAS = ['Banca', 'Seguros', 'Pensiones', 'Farmacéutica', 'Minería', 'Retail', 'Energía', 'Público', 'Logística', 'Telecomunicaciones'];

const PROJECT_COLORS = [
  '#003237', '#FA4616', '#00A172', '#0072C1', '#6F2595',
  '#CA7B4B', '#00AB9C', '#E70059', '#007E69', '#FF8C00',
  '#2F2E97', '#AC005F', '#926030', '#00ACE7', '#34d399',
];

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Regla temporal para inferir el año cuando la fila todavía no tiene columna
// "Año" (mientras se agrega al Sheet). Coincide exactamente con la fórmula de
// respaldo que se usa para poblarla, así el comportamiento no cambia al agregarla.
function inferAnioLegacy(semana) { return semana >= 36 ? 2025 : 2026; }

function normalizaColaborador(nombre) {
  return (nombre && NOMBRE_MAP[nombre]) ? NOMBRE_MAP[nombre] : nombre;
}

// ── CSV ──────────────────────────────────────────────────────────────────
function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    if (vals.every(v => v === '')) return null;
    const obj = {};
    headers.forEach((h, i) => {
      const v = vals[i] !== undefined ? vals[i] : '';
      if (v.startsWith('#')) { obj[h] = null; return; }
      const n = parseFloat(v);
      obj[h] = v === '' ? null : (isNaN(n) ? v : n);
    });
    if (obj.colaborador) obj.colaborador = normalizaColaborador(obj.colaborador);
    return obj;
  }).filter(Boolean);
}

// ── Formato ──────────────────────────────────────────────────────────────
function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(n);
}

function fillSelect(id, options, allLabel, labelFn) {
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="">— ${allLabel} —</option>`;
  options.forEach(v => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = labelFn ? labelFn(v) : v;
    sel.appendChild(o);
  });
}

// ── Semana actual (misma fórmula usada en V1, no-ISO; se mantiene solo por
//    compatibilidad donde no se necesite el año) ───────────────────────────
function getCurrentWeekNumber() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
}

// ── Semana → lunes/viernes (ISO, pivotado en 4 de enero) ──────────────────
function getWeekMonday(week, year) {
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7; // Mon=1..Sun=7
  const week1Mon = new Date(jan4);
  week1Mon.setDate(jan4.getDate() - jan4Day + 1);
  const mon = new Date(week1Mon);
  mon.setDate(week1Mon.getDate() + (week - 1) * 7);
  return mon;
}

// Requieren año explícito (ya no se adivina en base a "hoy") — necesario desde
// que el mismo número de semana puede repetirse en años distintos.
function weekMonthYear(week, year) {
  const mon = getWeekMonday(week, year);
  return { month: mon.getMonth(), year: mon.getFullYear() };
}

function weekDateLabel(week, year) {
  const mon = getWeekMonday(week, year);
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
  const d = x => x.getDate();
  return `${d(mon)}-${d(fri)}`;
}

// ── Semana/año ISO actual (algoritmo estándar) ─────────────────────────────
function getCurrentIsoYearWeek() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayNum = d.getDay() || 7; // Mon=1..Sun=7
  d.setDate(d.getDate() + 4 - dayNum); // mover al jueves de esa semana
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const semana = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { semana, año: d.getFullYear() };
}

function semanaAnioKey(semana, año) { return `${año}-${semana}`; }

function semanaAnioLabel(semana, año) { return `Sem ${semana} - ${año}`; }

// ── Rango fijo de semanas a mostrar en toda la app: Ene 2026 a Jul 2027 ────
const WEEK_RANGE_START = new Date(2026, 0, 1);
const WEEK_RANGE_END   = new Date(2027, 6, 31);

function getFullWeekRange() {
  // Ojo: la semana 1 de un año arranca (por definición ISO) en el lunes que
  // contiene el 4 de enero, que puede caer en diciembre del año anterior.
  // Por eso no filtramos por fecha de inicio — la semana 1-2026 debe incluirse
  // aunque su lunes sea 29-dic-2025, que es justo como ya lo trataba el negocio.
  const endMs = WEEK_RANGE_END.getTime();
  const seen = new Set();
  const weeks = [];
  for (let año = WEEK_RANGE_START.getFullYear(); año <= WEEK_RANGE_END.getFullYear(); año++) {
    for (let semana = 1; semana <= 53; semana++) {
      const mon = getWeekMonday(semana, año);
      const t = mon.getTime();
      if (t > endMs || seen.has(t)) continue;
      seen.add(t);
      weeks.push({ semana, año, key: semanaAnioKey(semana, año), monday: t });
    }
  }
  weeks.sort((a, b) => a.monday - b.monday);
  return weeks;
}

// ── Capacidad semanal (festivos / tardes libres) ───────────────────────────
// `key` debe ser semanaAnioKey(semana, año) — configMap ahora se indexa por
// semana+año, no solo por semana, para no mezclar años distintos.
function capPct(key, configMap) {
  const cfg = (configMap && configMap[key]) || {};
  const cap = 40 - (cfg.festivos || 0) * 8 - (cfg.tardes_libres || 0) * 4;
  return Math.min(cap, 40) / 40;
}

function pctClass(pct) {
  if (pct === null || pct === undefined) return '';
  if (pct > 1.05) return 'pct-over';
  if (pct > 0.9)  return 'pct-warn';
  if (pct > 0)    return 'pct-ok';
  return 'pct-low';
}

function fmtPct(p) { return p !== null && p !== undefined ? Math.round(p * 100) + '%' : ''; }

function sortProjects(proyNames) {
  const fixed = PROJECT_FIXED_ORDER.map(p => proyNames.find(n => n === p)).filter(Boolean);
  const rest  = proyNames.filter(n => !PROJECT_FIXED_ORDER.includes(n)).sort();
  return [...fixed, ...rest];
}

function sortProjectRows(rows) {
  const fixed = [];
  const rest  = [];
  rows.forEach(r => {
    const idx = PROJECT_FIXED_ORDER.indexOf(r.proyecto);
    if (idx !== -1) fixed[idx] = r;
    else rest.push(r);
  });
  rest.sort((a, b) => b.horas - a.horas);
  return [...fixed.filter(Boolean), ...rest];
}

// ── Sheets helpers ───────────────────────────────────────────────────────
function colToLetter(idx) {
  let l = '', n = idx;
  do { l = String.fromCharCode(65 + (n % 26)) + l; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return l;
}

function escAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Todas las personas registradas en Roles_Usuarios (no solo quienes ya
// tienen filas en Dashboard_Data) — para que alguien sin horas todavía
// igual aparezca en las matrices y se le puedan asignar.
async function fetchAllPersonas() {
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: HapticaAuth.SPREADSHEET_ID, range: SHEET_ROLES,
    });
    const rows = res.result.values || [];
    if (rows.length < 2) return [];
    const h = rows[0].map(x => x.trim().toLowerCase());
    const iPersona = h.indexOf('persona');
    if (iPersona === -1) return [];
    return rows.slice(1).map(r => normalizaColaborador((r[iPersona] || '').trim())).filter(Boolean);
  } catch (e) { return []; }
}
