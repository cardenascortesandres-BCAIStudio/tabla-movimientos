// Informe HTML autocontenido de "Informe H.E Planta" — mismo molde "estilo
// Power BI" que balanceHtmlReportExport.js (reusa su VIEWER_CSS/CHART_*/
// SEDE_PALETTE_JS), pero standalone: una sola vista (no hay Informes/
// Mermas/Presupuesto acá), porque el usuario "planta" solo tiene acceso a
// este informe — no tiene sentido traer el resto del tablero vacío.
// La lógica de agregación/alertas/detalle por empleado es la misma que la
// de Horas Extras PDV dentro de balanceHtmlReportExport.js, adaptada a un
// único bloque AGG_JS/VIEWER_JS sin el resto de vistas.

import { CHART_DOWNLOAD_JS, CHART_GLOW_JS } from '../theme/chartDownloadPlugin.js';
import { SEDE_PALETTE_JS } from '../theme/sedePalette.js';
import { VIEWER_CSS } from './balanceHtmlReportExport.js';

export function buildHorasExtrasPlantaReportHtml(rawHorasRows, chartJsSource, meta) {
  const rawHoras = (rawHorasRows || []).map(r => ({
    sedeName: r.sede_name, empleadoId: r.empleado_id, empleadoNombre: r.empleado_nombre, cargo: r.cargo,
    fecha: r.fecha, total: Number(r.total) || 0, he: Number(r.he) || 0, hen: Number(r.hen) || 0,
    hefd: Number(r.hefd) || 0, hefn: Number(r.hefn) || 0, hdo: Number(r.hdo) || 0, rn: Number(r.rn) || 0,
    rndyf: Number(r.rndyf) || 0, dom: Number(r.dom) || 0, d: Number(r.d) || 0, f: Number(r.f) || 0,
    comida: Number(r.comida) || 0, estadoDia: r.estado_dia || ''
  }));
  const horasJson = JSON.stringify(rawHoras);
  const generatedAt = new Date().toLocaleString('es-CO');
  const title = 'Informe H.E Planta — Carnes Brangus';
  const sedeCount = new Set(rawHoras.map(r => r.sedeName)).size;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
${VIEWER_CSS}
</style>
</head>
<body class="theme-dark" style="--accent:#3ea8ff">
<div class="wrap">
  <header class="top">
    <div>
      <h1>Informe H.E Planta</h1>
      <p class="sub">Generado el ${escapeHtml(generatedAt)}${meta?.appBuild ? ' · versión de la app ' + escapeHtml(meta.appBuild) : ''} · ${sedeCount} sede(s) · ${rawHoras.length} registro(s)</p>
    </div>
    <button class="theme-btn" id="themeToggleBtn" title="Personalizar aspecto">🎨 Personalizar</button>
  </header>

  <div class="theme-panel hidden-block" id="themePanel">
    <div class="theme-row">
      <label>Modo</label>
      <button class="chip" data-mode="dark" id="modeDarkBtn">Oscuro</button>
      <button class="chip" data-mode="light" id="modeLightBtn">Claro</button>
    </div>
    <div class="theme-row">
      <label>Color de acento</label>
      <div class="swatches" id="swatches"></div>
      <input type="color" id="customColor" value="#3ea8ff">
    </div>
  </div>

  <div class="filters">
    <select id="filterGranularidad">
      <option value="week" selected>Semanal</option>
      <option value="month">Mensual</option>
      <option value="year">Anual</option>
    </select>
    <select id="filterSede"></select>
    <select id="filterEmpleadoHoras"></select>
    <div class="periodo-picker">
      <button type="button" class="theme-btn" id="periodoBtn">📅 Fechas</button>
      <div class="periodo-popover hidden-block" id="periodoPopover">
        <div class="periodo-popover-actions">
          <button type="button" id="periodoAllBtn">Seleccionar todos</button>
          <button type="button" id="periodoNoneBtn">Deseleccionar todos</button>
        </div>
        <div class="periodo-popover-list" id="periodoList"></div>
      </div>
    </div>
  </div>
  <p class="hint" id="periodoHint"></p>

  <div class="kpi-grid" id="horasKpiGrid" style="margin-bottom:16px"></div>
  <table class="dtable" id="horasAlertasTable" style="margin-bottom:16px;">
    <caption id="horasAlertasCaption" style="text-align:left;font-weight:700;margin-bottom:8px;">Alertas — última semana completa con datos</caption>
    <thead><tr><th class="left">Empleado</th><th class="left">Sede</th><th class="left">Cargo</th><th>Horas extra (semana)</th><th>Estado</th></tr></thead>
    <tbody id="horasAlertasTableBody"></tbody>
  </table>
  <div class="chart-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
    <div class="chart-box"><canvas id="chartHorasTiempo"></canvas></div>
    <div class="chart-box"><canvas id="chartHorasRanking"></canvas></div>
  </div>
  <div id="horasEmpleadoDetalle" class="hidden-block" style="margin-bottom:16px;"></div>
  <table class="dtable" id="horasTable">
    <thead><tr><th class="left">Empleado</th><th class="left">Sede</th><th class="left">Periodo</th><th>Extra diurna</th><th>Extra nocturna</th><th>Extra festiva diurna</th><th>Extra festiva nocturna</th><th>Total horas extra</th><th>Total trabajado</th></tr></thead>
    <tbody id="horasTableBody"></tbody>
  </table>

  <p class="hint">Informe autocontenido — se puede abrir sin conexión a internet ni instalar nada. Los datos mostrados son un corte fijo del momento de la exportación.</p>
</div>

<script>
${chartJsSource}
</script>
<script>
${CHART_DOWNLOAD_JS}
${CHART_GLOW_JS}
${SEDE_PALETTE_JS}
const RAW_HORAS = ${horasJson};
${AGG_JS}
${VIEWER_JS}
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Misma agregación que la de Horas Extras dentro de
// src/export/balanceHtmlReportExport.js — ver ese archivo para el porqué de
// cada función. Se duplica aquí (en vez de importarla) porque este archivo
// debe quedar 100% autocontenido como texto-plantilla de un <script> inline.
const AGG_JS = `
function dateOnly(fecha){ return String(fecha).slice(0, 10); }
function isoWeekStart(fecha){
  const d = new Date(dateOnly(fecha) + 'T00:00:00Z');
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function capMes(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
function weekRangeLabel(startVal, endVal){
  const s = new Date(String(startVal).slice(0, 10) + 'T00:00:00Z');
  const e = new Date(String(endVal).slice(0, 10) + 'T00:00:00Z');
  const sDay = String(s.getUTCDate()).padStart(2, '0'), eDay = String(e.getUTCDate()).padStart(2, '0');
  const sMon = capMes(MESES[s.getUTCMonth()]), eMon = capMes(MESES[e.getUTCMonth()]);
  return sMon === eMon ? ('semana del ' + sDay + ' al ' + eDay + ' ' + sMon) : ('semana del ' + sDay + ' ' + sMon + ' al ' + eDay + ' ' + eMon);
}
function ventaPeriodKeyFor(fecha, granularity){
  if (granularity === 'week') return isoWeekStart(fecha);
  const d = new Date(dateOnly(fecha) + 'T00:00:00Z');
  const y = d.getUTCFullYear();
  if (granularity === 'year') return String(y);
  return y + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
function periodLabel(periodKey, granularity){
  if (granularity === 'year') return periodKey;
  const [y, m] = periodKey.split('-');
  return capMes(MESES[parseInt(m, 10) - 1]) + ' ' + y;
}
function ventaPeriodLabel(periodKey, granularity){
  if (granularity === 'week') {
    const start = new Date(periodKey + 'T00:00:00Z');
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
    return weekRangeLabel(start.toISOString(), end.toISOString());
  }
  return periodLabel(periodKey, granularity);
}

const LIMITE_SEMANAL_HORAS = 12;
const UMBRAL_ALERTA_HORAS = 10;
const TIPOS_HORA_EXTRA = [['he', 'Extra diurna'], ['hen', 'Extra nocturna'], ['hefd', 'Extra festiva diurna'], ['hefn', 'Extra festiva nocturna']];
const TIPOS_HORA_OTROS = [['hdo', 'Ordinarias diurnas'], ['rn', 'Recargo nocturno'], ['rndyf', 'Recargo nocturno dominical/festivo'], ['dom', 'Dominical'], ['d', 'Descanso'], ['f', 'Festivo'], ['comida', 'Comida']];
function horaExtraDelDia(row){ return (row.he || 0) + (row.hen || 0) + (row.hefd || 0) + (row.hefn || 0); }
function evaluarAlertaHoras(h){ if (h > LIMITE_SEMANAL_HORAS) return 'rojo'; if (h >= UMBRAL_ALERTA_HORAS) return 'amarillo'; return 'verde'; }
function sumDesgloseHoras(rows){
  const out = { extra: 0, total: 0 };
  TIPOS_HORA_EXTRA.concat(TIPOS_HORA_OTROS).forEach(t => { out[t[0]] = 0; });
  rows.forEach(r => { TIPOS_HORA_EXTRA.concat(TIPOS_HORA_OTROS).forEach(t => { out[t[0]] += r[t[0]] || 0; }); out.total += r.total || 0; });
  out.extra = out.he + out.hen + out.hefd + out.hefn;
  return out;
}
function aggregateHorasByEmpleado(rawHoras, granularity){
  const accByEmpleado = new Map();
  rawHoras.forEach(row => {
    const id = row.empleadoId;
    if (!accByEmpleado.has(id)) accByEmpleado.set(id, { info: { empleadoId: id, nombre: row.empleadoNombre, sedeName: row.sedeName, cargo: row.cargo }, lastFecha: null, periods: new Map() });
    const entry = accByEmpleado.get(id);
    if (!entry.lastFecha || row.fecha > entry.lastFecha) { entry.lastFecha = row.fecha; entry.info = { empleadoId: id, nombre: row.empleadoNombre, sedeName: row.sedeName, cargo: row.cargo }; }
    const periodKey = ventaPeriodKeyFor(row.fecha, granularity);
    if (!entry.periods.has(periodKey)) entry.periods.set(periodKey, { periodKey, horaExtra: 0, he: 0, hen: 0, hefd: 0, hefn: 0, total: 0 });
    const acc = entry.periods.get(periodKey);
    acc.he += row.he || 0; acc.hen += row.hen || 0; acc.hefd += row.hefd || 0; acc.hefn += row.hefn || 0;
    acc.horaExtra += horaExtraDelDia(row);
    acc.total += row.total || 0;
  });
  const byEmpleado = [], byPeriodAll = new Map();
  accByEmpleado.forEach((entry, id) => {
    const points = Array.from(entry.periods.values()).map(acc => ({ ...acc, ...entry.info, empleadoId: id, periodLabel: ventaPeriodLabel(acc.periodKey, granularity) })).sort((a, b) => a.periodKey < b.periodKey ? -1 : 1);
    byEmpleado.push({ empleadoId: id, ...entry.info, points });
    points.forEach(p => { if (!byPeriodAll.has(p.periodKey)) byPeriodAll.set(p.periodKey, []); byPeriodAll.get(p.periodKey).push(p); });
  });
  return { granularity, byEmpleado, byPeriod: byPeriodAll, periodKeysSorted: Array.from(byPeriodAll.keys()).sort() };
}
function aggregateHorasBySede(rawHoras, granularity){
  const accBySede = new Map();
  rawHoras.forEach(row => {
    const sedeName = row.sedeName;
    const periodKey = ventaPeriodKeyFor(row.fecha, granularity);
    if (!accBySede.has(sedeName)) accBySede.set(sedeName, new Map());
    const periods = accBySede.get(sedeName);
    if (!periods.has(periodKey)) periods.set(periodKey, { periodKey, sedeName, horaExtra: 0 });
    periods.get(periodKey).horaExtra += horaExtraDelDia(row);
  });
  const byPeriod = new Map();
  accBySede.forEach(periods => {
    Array.from(periods.values()).forEach(acc => {
      const p = { ...acc, periodLabel: ventaPeriodLabel(acc.periodKey, granularity) };
      if (!byPeriod.has(p.periodKey)) byPeriod.set(p.periodKey, []);
      byPeriod.get(p.periodKey).push(p);
    });
  });
  const sedeNames = Array.from(accBySede.keys());
  return { byPeriod, periodKeysSorted: Array.from(byPeriod.keys()).sort(), sedeNames };
}
function lastCompleteWeekHoras(periodKeysSorted, maxFecha){
  if (!maxFecha) return periodKeysSorted[periodKeysSorted.length - 1] || null;
  for (let i = periodKeysSorted.length - 1; i >= 0; i--) {
    const start = new Date(periodKeysSorted[i] + 'T00:00:00Z');
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
    if (end.toISOString().slice(0, 10) <= maxFecha) return periodKeysSorted[i];
  }
  return periodKeysSorted[periodKeysSorted.length - 1] || null;
}
function computeAlertasHoras(rawHoras, sedeFilter){
  const rows = sedeFilter ? rawHoras.filter(r => r.sedeName === sedeFilter) : rawHoras;
  const data = aggregateHorasByEmpleado(rows, 'week');
  const maxFecha = rows.reduce((max, r) => (!max || r.fecha > max ? r.fecha : max), null);
  const lastWeek = lastCompleteWeekHoras(data.periodKeysSorted, maxFecha);
  const alertas = data.byEmpleado.map(entry => {
    const point = entry.points.find(p => p.periodKey === lastWeek);
    const horaExtra = point ? point.horaExtra : 0;
    return { ...entry, horaExtraSemana: horaExtra, nivel: evaluarAlertaHoras(horaExtra) };
  }).sort((a, b) => b.horaExtraSemana - a.horaExtraSemana);
  return { lastWeek, alertas };
}
function findTopEmpleadosHoras(rawHoras, n){
  const acc = new Map();
  rawHoras.forEach(row => {
    if (!acc.has(row.empleadoId)) acc.set(row.empleadoId, { empleadoId: row.empleadoId, nombre: row.empleadoNombre, sedeName: row.sedeName, horaExtra: 0 });
    acc.get(row.empleadoId).horaExtra += horaExtraDelDia(row);
  });
  return Array.from(acc.values()).sort((a, b) => b.horaExtra - a.horaExtra).slice(0, n);
}
`;

// Mismo molde visual/comportamiento que balanceHtmlReportExport.js (tema
// oscuro/claro, acento, popover de fechas), recortado a UNA sola vista fija
// ("horas") — no hay view-tabs porque este informe es standalone.
const VIEWER_JS = `
function fmtNum(v){ if(v==null||isNaN(v)) return '0'; const r = Math.round(v*100)/100; return Number.isInteger(r) ? String(r) : r.toFixed(2); }
function el(id){ return document.getElementById(id); }
function escapeHtmlJs(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

const ACCENTS = ['#3ea8ff','#2be3a8','#ff3b6e','#f0b429','#a86bff','#ff8a3d'];

function initTheme(){
  const panel = el('themePanel');
  el('themeToggleBtn').addEventListener('click', () => panel.classList.toggle('hidden-block'));
  el('modeDarkBtn').addEventListener('click', () => setMode('dark'));
  el('modeLightBtn').addEventListener('click', () => setMode('light'));
  const sw = el('swatches');
  ACCENTS.forEach(c => {
    const b = document.createElement('div');
    b.className = 'swatch'; b.style.background = c; b.dataset.color = c;
    b.addEventListener('click', () => setAccent(c));
    sw.appendChild(b);
  });
  el('customColor').addEventListener('input', (e) => setAccent(e.target.value));
  setMode('dark'); setAccent('#3ea8ff');
}
function setMode(mode){
  document.body.classList.toggle('theme-light', mode === 'light');
  document.body.classList.toggle('theme-dark', mode === 'dark');
  el('modeDarkBtn').classList.toggle('active', mode === 'dark');
  el('modeLightBtn').classList.toggle('active', mode === 'light');
}
function setAccent(color){
  document.body.style.setProperty('--accent', color);
  document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.color === color));
  viewHoras();
}
function currentAccent(){ return getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#3ea8ff'; }

function chartOptions(title, indexAxis, tooltipFormatter){
  const textColor = document.body.classList.contains('theme-light') ? '#1b2033' : '#eaf0ff';
  const gridColor = document.body.classList.contains('theme-light') ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.06)';
  const opts = {
    responsive: true, maintainAspectRatio: false, indexAxis: indexAxis || 'x',
    plugins: { legend: { display: false }, title: { display: true, text: title, color: textColor } },
    scales: { x: { ticks: { color: textColor }, grid: { color: gridColor } }, y: { ticks: { color: textColor }, grid: { color: gridColor } } }
  };
  if (tooltipFormatter) {
    opts.plugins.tooltip = { callbacks: { label: (ctx) => {
      const v = ctx.parsed.y != null ? ctx.parsed.y : ctx.parsed.x;
      return tooltipFormatter(v);
    } } };
  }
  return opts;
}

let charts = {};
function destroyChart(id){ if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

let selectedPeriods = null; // Set<periodKey> | null (null = todas)
function horasPeriodData(){
  let g = el('filterGranularidad').value;
  let d = aggregateHorasBySede(RAW_HORAS, g);
  if (d.periodKeysSorted.length < 2 && g !== 'week') { g = 'week'; d = aggregateHorasBySede(RAW_HORAS, g); }
  return { granularity: g, periodKeysSorted: d.periodKeysSorted, byPeriod: Array.from(d.byPeriod.entries()).map(([periodKey, points]) => ({ periodKey, points })) };
}
function renderPeriodPopover(){
  const data = horasPeriodData();
  const list = el('periodoList');
  list.innerHTML = data.periodKeysSorted.slice().reverse().map(k => {
    const label = (data.byPeriod.find(p => p.periodKey === k) || {}).points[0]?.periodLabel || k;
    const checked = !selectedPeriods || selectedPeriods.has(k);
    return '<label><input type="checkbox" data-period="' + k + '" ' + (checked ? 'checked' : '') + '> ' + escapeHtmlJs(label) + '</label>';
  }).join('');
  list.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (!selectedPeriods) selectedPeriods = new Set(data.periodKeysSorted);
      const k = cb.dataset.period;
      if (cb.checked) selectedPeriods.add(k);
      else if (selectedPeriods.size > 1) selectedPeriods.delete(k);
      else cb.checked = true;
      if (selectedPeriods.size === data.periodKeysSorted.length) selectedPeriods = null;
      const n = selectedPeriods ? selectedPeriods.size : data.periodKeysSorted.length;
      el('periodoBtn').textContent = selectedPeriods ? '📅 Fechas (' + n + ')' : '📅 Fechas (todas)';
      viewHoras();
    });
  });
  const n = selectedPeriods ? selectedPeriods.size : data.periodKeysSorted.length;
  el('periodoBtn').textContent = selectedPeriods ? '📅 Fechas (' + n + ')' : '📅 Fechas (todas)';
}
function periodsInScope(){
  const data = horasPeriodData();
  return selectedPeriods ? data.periodKeysSorted.filter(k => selectedPeriods.has(k)) : data.periodKeysSorted;
}

function initFilters(){
  el('filterSede').addEventListener('change', viewHoras);
  el('filterEmpleadoHoras').addEventListener('change', viewHoras);
  el('filterGranularidad').addEventListener('change', () => { selectedPeriods = null; viewHoras(); });
  const btn = el('periodoBtn'), popover = el('periodoPopover');
  btn.addEventListener('click', (e) => { e.stopPropagation(); popover.classList.toggle('hidden-block'); });
  document.addEventListener('click', (e) => { if (!popover.contains(e.target) && e.target !== btn) popover.classList.add('hidden-block'); });
  el('periodoAllBtn').addEventListener('click', () => {
    selectedPeriods = null;
    popover.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; });
    el('periodoBtn').textContent = '📅 Fechas (todas)';
    viewHoras();
  });
  el('periodoNoneBtn').addEventListener('click', () => {
    const boxes = Array.from(popover.querySelectorAll('input[type=checkbox]'));
    if (!boxes.length) return;
    selectedPeriods = new Set([boxes[0].dataset.period]);
    renderPeriodPopover();
    viewHoras();
  });
}
function refreshSedeOptions(){
  const sedeSel = el('filterSede');
  const prev = sedeSel.value;
  const allSedes = Array.from(new Set(RAW_HORAS.map(r => r.sedeName))).sort();
  sedeSel.innerHTML = '<option value="">Todas las sedes</option>' + allSedes.map(s => '<option value="' + s + '">' + s + '</option>').join('');
  if (allSedes.includes(prev)) sedeSel.value = prev;
}

function viewHoras(){
  destroyChart('horasTiempo'); destroyChart('horasRanking');
  if (!RAW_HORAS.length) return;
  renderPeriodPopover();
  const sedeFilter = el('filterSede').value;
  const calH = horasPeriodData();
  const gran = calH.granularity;
  const scopeSet = new Set(periodsInScope());
  const scopedAll = RAW_HORAS.filter(r => scopeSet.has(ventaPeriodKeyFor(r.fecha, gran)));
  const rowsInSede = sedeFilter ? scopedAll.filter(r => r.sedeName === sedeFilter) : scopedAll;
  const empSel = el('filterEmpleadoHoras');
  const prevEmp = empSel.value;
  const empleados = Array.from(new Map(rowsInSede.map(r => [r.empleadoId, r.empleadoNombre])).entries());
  empSel.innerHTML = '<option value="">Todos los empleados</option>' + empleados.map(([id, nombre]) => '<option value="' + id + '">' + escapeHtmlJs(nombre) + '</option>').join('');
  if (empleados.some(([id]) => id === prevEmp)) empSel.value = prevEmp;
  const empleadoFilter = empSel.value;
  const rows = empleadoFilter ? rowsInSede.filter(r => r.empleadoId === empleadoFilter) : rowsInSede;

  const { lastWeek, alertas } = computeAlertasHoras(scopedAll, sedeFilter);
  const maxF = RAW_HORAS.reduce((m, r) => (!m || r.fecha > m ? r.fecha : m), null);
  const MES_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const dC = maxF ? new Date(String(maxF).slice(0, 10) + 'T00:00:00Z') : null;
  const corte = dC ? dC.getUTCDate() + ' de ' + MES_L[dC.getUTCMonth()] + ' de ' + dC.getUTCFullYear() : '—';
  const rojos = alertas.filter(a => a.nivel === 'rojo');
  const amarillos = alertas.filter(a => a.nivel === 'amarillo');
  const topEmpleado = alertas[0];

  el('horasKpiGrid').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Empleados con historial</div><div class="kpi-value">' + new Set(rowsInSede.map(r => r.empleadoId)).size + '</div></div>' +
    '<div class="kpi-card ' + (rojos.length ? 'kpi-neg' : 'kpi-pos') + '"><div class="kpi-label">🔴 Pasados del límite (' + LIMITE_SEMANAL_HORAS + 'h/semana)</div><div class="kpi-value">' + rojos.length + '</div></div>' +
    '<div class="kpi-card ' + (amarillos.length ? 'kpi-neg' : 'kpi-pos') + '"><div class="kpi-label">🟡 Por pasarse (≥ ' + UMBRAL_ALERTA_HORAS + 'h/semana)</div><div class="kpi-value">' + amarillos.length + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Más horas extra — ' + (lastWeek ? 'semana del ' + lastWeek : 'última semana') + '</div><div class="kpi-value" style="font-size:15px">' + (topEmpleado ? escapeHtmlJs(topEmpleado.nombre) + ' — ' + fmtNum(topEmpleado.horaExtraSemana) + 'h' : '—') + '</div></div>';

  el('horasAlertasCaption').textContent = 'Alertas — ' + (lastWeek ? 'semana del ' + lastWeek : 'última semana completa con datos');
  el('horasAlertasTableBody').innerHTML = alertas.filter(a => a.nivel !== 'verde').map(a => {
    const icon = a.nivel === 'rojo' ? '🔴 Pasado' : '🟡 Por pasarse';
    const cls = a.nivel === 'rojo' ? 'diff-neg' : '';
    return '<tr class="row-click" data-emp="' + a.empleadoId + '" title="Ver el detalle de esta persona"><td class="left">' + escapeHtmlJs(a.nombre) + '</td><td class="left">' + escapeHtmlJs(a.sedeName) + '</td><td class="left">' + escapeHtmlJs(a.cargo || '—') + '</td><td class="' + cls + '">' + fmtNum(a.horaExtraSemana) + '</td><td>' + icon + '</td></tr>';
  }).join('') || '<tr><td colspan="5" class="left">Nadie en alerta en ' + (lastWeek ? 'la semana del ' + lastWeek : 'la última semana con datos') + '.</td></tr>';

  const granularity = gran;
  const sedeData = aggregateHorasBySede(rows, granularity);
  const tiempoLabels = sedeData.periodKeysSorted.map(k => (sedeData.byPeriod.get(k) || [])[0]?.periodLabel || k);
  const tiempoValues = sedeData.periodKeysSorted.map(k => (sedeData.byPeriod.get(k) || []).reduce((a, p) => a + p.horaExtra, 0));
  charts.horasTiempo = new Chart(el('chartHorasTiempo').getContext('2d'), {
    type: 'line', data: { labels: tiempoLabels, datasets: [{ label: 'Horas extra', data: tiempoValues, borderColor: currentAccent(), backgroundColor: currentAccent(), tension: .25 }] },
    options: chartOptions(['Horas extra en el tiempo' + (sedeFilter ? ' — ' + sedeFilter : ''), 'Informe con corte a ' + corte], null, fmtNum)
  });

  const top = findTopEmpleadosHoras(rows, 12);
  const rankLabels = top.map(e => e.nombre), rankValues = top.map(e => e.horaExtra);
  charts.horasRanking = new Chart(el('chartHorasRanking').getContext('2d'), {
    type: 'bar', data: { labels: rankLabels, datasets: [{ data: rankValues, backgroundColor: rankValues.map(() => currentAccent()), borderRadius: 6 }] },
    options: Object.assign(chartOptions(['Ranking de horas extra por empleado' + (sedeFilter ? ' — ' + sedeFilter : ''), 'Informe con corte a ' + corte], 'y'), { onClick: (evt, els) => { if (els.length) { horasEmpleadoSel = top[els[0].index].empleadoId; renderHorasEmpleadoDetalle(); } } })
  });

  const empData = aggregateHorasByEmpleado(rows, granularity);
  const detalleRows = [];
  empData.byEmpleado.forEach(entry => entry.points.forEach(p => detalleRows.push(p)));
  detalleRows.sort((a, b) => a.periodKey < b.periodKey ? 1 : -1);
  el('horasTableBody').innerHTML = detalleRows.map(r => {
    const cls = r.horaExtra > LIMITE_SEMANAL_HORAS && granularity === 'week' ? 'diff-neg' : '';
    return '<tr class="row-click" data-emp="' + r.empleadoId + '" title="Ver el detalle de esta persona"><td class="left">' + escapeHtmlJs(r.nombre) + '</td><td class="left">' + escapeHtmlJs(r.sedeName) + '</td><td class="left">' + escapeHtmlJs(r.periodLabel) + '</td><td>' + fmtNum(r.he) + '</td><td>' + fmtNum(r.hen) + '</td><td>' + fmtNum(r.hefd) + '</td><td>' + fmtNum(r.hefn) + '</td><td class="' + cls + '"><b>' + fmtNum(r.horaExtra) + '</b></td><td>' + fmtNum(r.total) + '</td></tr>';
  }).join('') || '<tr><td colspan="9" class="left">Sin datos para este filtro.</td></tr>';
  horasCtxRows = scopedAll;
  document.querySelectorAll('#horasAlertasTableBody tr[data-emp], #horasTableBody tr[data-emp]').forEach(tr => {
    tr.addEventListener('click', () => { horasEmpleadoSel = tr.dataset.emp; renderHorasEmpleadoDetalle(); });
  });
  renderHorasEmpleadoDetalle();
}

// Clic en una persona: a qué corresponde cada hora (diurna, nocturna,
// festiva...) dentro de las fechas elegidas.
let horasEmpleadoSel = null, horasCtxRows = [];
function renderHorasEmpleadoDetalle(){
  const box = el('horasEmpleadoDetalle');
  const rows = horasEmpleadoSel ? horasCtxRows.filter(r => r.empleadoId === horasEmpleadoSel) : [];
  if (!rows.length) { box.classList.add('hidden-block'); return; }
  const last = rows.reduce((m, r) => (r.fecha > m.fecha ? r : m), rows[0]);
  const t = sumDesgloseHoras(rows);
  const fila = (x) => '<tr><td class="left">' + x[1] + '</td><td>' + fmtNum(t[x[0]]) + '</td></tr>';
  const nomDia = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const dias = rows.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).map(r => {
    const d = new Date(String(r.fecha).slice(0, 10) + 'T00:00:00Z');
    const estado = r.estadoDia === 'inasistencia' ? 'Inasistencia' : r.estadoDia === 'descanso' ? 'Descanso' : '';
    return '<tr><td class="left">' + nomDia[d.getUTCDay()] + ' ' + String(r.fecha).slice(0, 10) + '</td><td>' + fmtNum(r.total) + '</td><td>' + fmtNum(r.he) + '</td><td>' + fmtNum(r.hen) + '</td><td>' + fmtNum(r.hefd) + '</td><td>' + fmtNum(r.hefn) + '</td><td><b>' + fmtNum(horaExtraDelDia(r)) + '</b></td><td class="left">' + estado + '</td></tr>';
  }).join('');
  box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><b>Detalle de ' + escapeHtmlJs(last.empleadoNombre) + ' — ' + escapeHtmlJs(last.sedeName) + (last.cargo ? ' · ' + escapeHtmlJs(last.cargo) : '') + '</b><button type="button" class="theme-btn" id="horasEmpleadoCerrar">✕ Cerrar</button></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;">' +
    '<table class="dtable"><thead><tr><th class="left">Hora extra</th><th>Total</th></tr></thead><tbody>' + TIPOS_HORA_EXTRA.map(fila).join('') + '<tr><td class="left"><b>Total general horas extra</b></td><td><b>' + fmtNum(t.extra) + '</b></td></tr></tbody></table>' +
    '<table class="dtable"><thead><tr><th class="left">Otras horas del documento</th><th>Total</th></tr></thead><tbody>' + TIPOS_HORA_OTROS.map(fila).join('') + '<tr><td class="left"><b>Total trabajado</b></td><td><b>' + fmtNum(t.total) + '</b></td></tr></tbody></table></div>' +
    '<table class="dtable"><thead><tr><th class="left">Día</th><th>Total trabajado</th><th>Extra diurna</th><th>Extra nocturna</th><th>Extra festiva diurna</th><th>Extra festiva nocturna</th><th>Total extra del día</th><th class="left">Estado</th></tr></thead><tbody>' + dias + '</tbody></table>';
  box.classList.remove('hidden-block');
  el('horasEmpleadoCerrar').addEventListener('click', () => { horasEmpleadoSel = null; renderHorasEmpleadoDetalle(); });
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

refreshSedeOptions();
initTheme();
initFilters();
viewHoras();
`;
