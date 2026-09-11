// Informe HTML autocontenido "estilo Power BI" del historial de Balance —
// mismo molde que src/export/htmlReportExport.js (Chart.js incrustado como
// texto, sin backend, personalización de tema), pero comparando Margen%/
// Utilidad/Ventas/Compras entre semanas y entre sedes en vez de diferencias
// de inventario.
//
// Recibe las filas CRUDAS de balance_weeks (una por semana guardada, de
// cualquier sede) y hace toda la agregación semanal/mensual/anual DENTRO del
// HTML exportado (ver AGG_JS) — así el mismo archivo, ya descargado y sin
// conexión, deja cambiar de granularidad sin tener que volver a generarlo.

import { CHART_DOWNLOAD_JS, CHART_GLOW_JS } from '../theme/chartDownloadPlugin.js';
import { SEDE_PALETTE_JS } from '../theme/sedePalette.js';

export function buildBalanceReportHtml(rawWeekRows, rawVentaRows, rawPresupuestoRows, chartJsSource, meta) {
  const rawWeeks = (rawWeekRows || []).map(w => ({
    sedeName: w.sede_name, weekStart: w.week_start, weekEnd: w.week_end, computed: w.computed || {}
  }));
  const rawVentas = (rawVentaRows || []).map(d => ({ sedeName: d.sede_name, fecha: d.fecha, valorVenta: Number(d.valor_venta) || 0 }));
  const rawPresupuestos = (rawPresupuestoRows || []).map(p => ({ sedeName: p.sede_name, anio: p.anio, mes: p.mes, monto: Number(p.monto) || 0 }));
  const dataJson = JSON.stringify(rawWeeks);
  const ventasJson = JSON.stringify(rawVentas);
  const presupuestosJson = JSON.stringify(rawPresupuestos);
  const generatedAt = new Date().toLocaleString('es-CO');
  const title = `Reportes Brangus${meta?.periodo ? ' — ' + meta.periodo : ''}`;
  const sedeCount = new Set(rawWeeks.map(w => w.sedeName)).size;

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
      <h1>Reportes — Margen y Utilidad por Sede</h1>
      <p class="sub">Generado el ${escapeHtml(generatedAt)} · ${sedeCount} sede(s) · ${rawWeeks.length} semana(s) guardada(s)</p>
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

  <div class="kpi-grid" id="kpiGrid"></div>

  <nav class="view-tabs" id="viewTabs">
    <button class="view-tab active" data-view="tiempo">📈 Serie de tiempo</button>
    <button class="view-tab" data-view="sedes">📊 Comparativa entre sedes</button>
    <button class="view-tab" data-view="presupuesto">🎯 Presupuesto</button>
  </nav>

  <div class="filters">
    <select id="filterGranularidad">
      <option value="week">Semanal</option>
      <option value="month" selected>Mensual</option>
      <option value="year">Anual</option>
    </select>
    <select id="filterMetrica">
      <option value="margenPct">Margen %</option>
      <option value="utilidadBruta">Utilidad Bruta</option>
      <option value="venta">Ventas</option>
    </select>
    <select id="filterSede"></select>
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

  <section class="view-panel" id="view-tiempo"><div class="chart-box"><canvas id="chartTiempo"></canvas></div></section>
  <section class="view-panel hidden-block" id="view-sedes"><div class="chart-box"><canvas id="chartSedes"></canvas></div></section>
  <section class="view-panel hidden-block" id="view-presupuesto">
    <div class="kpi-grid" id="presuKpiGrid" style="margin-bottom:16px"></div>
    <div class="chart-box" style="margin-bottom:16px"><canvas id="chartPresupuesto"></canvas></div>
    <table class="dtable" id="presuTable">
      <thead><tr><th class="left">Sede</th><th>Acumulado</th><th>Proyección de cierre</th><th>Presupuesto</th><th>% Proyectado</th></tr></thead>
      <tbody id="presuTableBody"></tbody>
    </table>
  </section>

  <p class="hint">Informe autocontenido — se puede abrir sin conexión a internet ni instalar nada. Los datos mostrados son un corte fijo del momento de la exportación.</p>
</div>

<script>
${chartJsSource}
</script>
<script>
${CHART_DOWNLOAD_JS}
${CHART_GLOW_JS}
${SEDE_PALETTE_JS}
const RAW_WEEKS = ${dataJson};
const RAW_VENTAS = ${ventasJson};
const RAW_PRESUPUESTOS = ${presupuestosJson};
${AGG_JS}
${VIEWER_JS}
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const VIEWER_CSS = `
:root{ --dash-bg:#0b0f1c; --panel-bg:#111527; --text:#eaf0ff; --muted:#8892b0; --border:rgba(255,255,255,.08); }
body.theme-light{ --dash-bg:#f3f5fa; --panel-bg:#ffffff; --text:#1b2033; --muted:#5b647d; --border:rgba(0,0,0,.08); }
*{box-sizing:border-box;}
body{margin:0;font-family:'Segoe UI',Arial,sans-serif;background:var(--dash-bg);color:var(--text);transition:background .2s,color .2s;}
.wrap{max-width:1300px;margin:0 auto;padding:26px 20px 60px;}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px;}
h1{font-size:20px;margin:0 0 4px;}
.sub{color:var(--muted);font-size:12.5px;margin:0;}
.theme-btn{background:var(--panel-bg);border:1px solid var(--border);color:var(--text);padding:9px 16px;border-radius:8px;font-size:13px;cursor:pointer;}
.theme-panel{background:var(--panel-bg);border:1px solid var(--border);border-radius:10px;padding:14px 18px;margin-bottom:18px;display:flex;flex-direction:column;gap:10px;}
.theme-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.theme-row label{font-size:12px;color:var(--muted);width:110px;}
.chip{background:transparent;border:1px solid var(--border);color:var(--text);padding:6px 14px;border-radius:20px;font-size:12.5px;cursor:pointer;}
.chip.active{border-color:var(--accent);color:var(--accent);}
.swatches{display:flex;gap:8px;}
.swatch{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent;}
.swatch.active{border-color:var(--text);}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:20px;}
.kpi-card{background:var(--panel-bg);border:1px solid var(--border);border-radius:12px;padding:16px 18px;}
.kpi-label{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;}
.kpi-value{font-size:24px;font-weight:800;font-variant-numeric:tabular-nums;}
.kpi-neg .kpi-value{color:#ff3b6e;}
.kpi-pos .kpi-value{color:#2be3a8;}
.view-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;border-bottom:2px solid var(--border);}
.view-tab{background:none;border:none;color:var(--muted);padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px;}
.view-tab.active{color:var(--accent);border-bottom-color:var(--accent);}
.filters{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;}
.filters select{background:var(--panel-bg);color:var(--text);border:1px solid var(--border);border-radius:7px;padding:8px 12px;font-size:13px;}
.view-panel{background:var(--panel-bg);border:1px solid var(--border);border-radius:12px;padding:16px;}
.chart-box{position:relative;height:400px;}
.chart-dl-btn{position:absolute;top:8px;right:10px;z-index:5;width:26px;height:26px;border-radius:50%;border:1px solid var(--border);background:var(--panel-bg);color:var(--muted);font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:.55;}
.chart-dl-btn:hover{opacity:1;color:var(--text);border-color:var(--accent);}
.hidden-block{display:none;}
table.dtable{width:100%;border-collapse:collapse;font-size:12.5px;}
table.dtable th{text-align:right;color:var(--muted);padding:8px;border-bottom:1px solid var(--border);cursor:pointer;user-select:none;}
table.dtable th.left{text-align:left;}
table.dtable td{padding:7px 8px;text-align:right;border-bottom:1px solid var(--border);}
table.dtable td.left{text-align:left;}
.diff-neg{color:#ff3b6e;font-weight:700;}
.diff-zero{color:#2be3a8;font-weight:700;}
.hint{font-size:11.5px;color:var(--muted);margin-top:18px;}

.periodo-picker{position:relative;display:inline-block;}
.periodo-popover{position:absolute;top:calc(100% + 6px);left:0;z-index:20;width:260px;max-width:80vw;background:var(--panel-bg);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.35);padding:10px;}
.periodo-popover-actions{display:flex;gap:8px;margin-bottom:8px;}
.periodo-popover-actions button{flex:1;background:var(--dash-bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-size:11.5px;cursor:pointer;font-family:inherit;}
.periodo-popover-list{max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;}
.periodo-popover-list label{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;font-size:12.5px;color:var(--text);cursor:pointer;}
.periodo-popover-list label:hover{background:var(--dash-bg);}
.periodo-popover-list input[type=checkbox]{accent-color:var(--accent);width:15px;height:15px;flex:0 0 auto;}

/* Brillo al pasar el mouse — mismo efecto que el dashboard en pantalla
   (rgba fijo en vez de color-mix() para que se vea igual en navegadores
   viejos, ya que este archivo se abre offline en el navegador que sea). */
.kpi-card{transition:box-shadow .15s,transform .15s;}
.kpi-card:hover{box-shadow:0 0 0 1px var(--accent),0 0 22px 4px rgba(62,168,255,.35);transform:translateY(-1px);}
.theme-btn:hover,.view-tab:hover,.chip:hover,.periodo-popover-actions button:hover,.filters select:hover,.chart-dl-btn:hover{
  box-shadow:0 0 0 2px var(--accent),0 0 14px 2px rgba(62,168,255,.45);
}
`;

// Agregación semanal/mensual/anual — puerto en JS plano (sin imports, corre
// dentro del HTML exportado) de src/balance/balanceDashboardData.js#aggregateByPeriod,
// para que el informe ya descargado pueda cambiar de granularidad sin conexión.
const AGG_JS = `
function dateOnly(weekStart){ return String(weekStart).slice(0, 10); }
function periodKeyFor(weekStart, granularity){
  const iso = dateOnly(weekStart);
  if (granularity === 'week') return iso;
  const d = new Date(iso + 'T00:00:00Z');
  const y = d.getUTCFullYear();
  if (granularity === 'year') return String(y);
  return y + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function periodLabel(periodKey, granularity){
  if (granularity !== 'month') return periodKey;
  const parts = periodKey.split('-');
  return MESES[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
}
function aggregateByPeriod(rawWeeks, granularity){
  const accBySede = new Map();
  rawWeeks.forEach(w => {
    const sedeName = w.sedeName, c = w.computed || {};
    const periodKey = periodKeyFor(w.weekStart, granularity);
    if (!accBySede.has(sedeName)) accBySede.set(sedeName, new Map());
    const periods = accBySede.get(sedeName);
    if (!periods.has(periodKey)) periods.set(periodKey, { periodKey, sedeName, totalVentas: 0, totalCompras: 0, utilidadBruta: 0, weeks: 0 });
    const acc = periods.get(periodKey);
    acc.totalVentas += c.totalVentas || 0;
    acc.totalCompras += c.totalCompras || 0;
    acc.utilidadBruta += c.utilidadBruta || 0;
    acc.weeks += 1;
  });
  const bySede = [], byPeriod = new Map();
  accBySede.forEach((periods, sedeName) => {
    const points = Array.from(periods.values()).map(acc => ({
      periodKey: acc.periodKey, periodLabel: periodLabel(acc.periodKey, granularity), sedeName,
      totalVentas: acc.totalVentas, totalCompras: acc.totalCompras, utilidadBruta: acc.utilidadBruta,
      margenPct: acc.totalVentas === 0 ? 0 : acc.utilidadBruta / acc.totalVentas, weeks: acc.weeks
    })).sort((a, b) => a.periodKey < b.periodKey ? -1 : 1);
    bySede.push({ sedeName, points });
    points.forEach(p => { if (!byPeriod.has(p.periodKey)) byPeriod.set(p.periodKey, []); byPeriod.get(p.periodKey).push(p); });
  });
  const periodKeysSorted = Array.from(byPeriod.keys()).sort();
  return { granularity, bySede, byPeriod: Array.from(byPeriod.entries()).map(([periodKey, points]) => ({ periodKey, points })), periodKeysSorted, sedeNames: bySede.map(s => s.sedeName).sort() };
}

// Ventas reales (ventas_dias) — mismo molde que aggregateByPeriod de arriba,
// pero agrupando por día (puerto de src/ventas/ventasDashboardData.js) para
// que "semana" agrupe lunes-domingo igual que en el dashboard en pantalla.
function isoWeekStart(fecha){
  const d = new Date(String(fecha).slice(0, 10) + 'T00:00:00Z');
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}
function ventaPeriodKeyFor(fecha, granularity){
  const iso = String(fecha).slice(0, 10);
  if (granularity === 'week') return isoWeekStart(fecha);
  const d = new Date(iso + 'T00:00:00Z');
  const y = d.getUTCFullYear();
  if (granularity === 'year') return String(y);
  return y + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
function aggregateVentasByPeriod(rawVentas, granularity){
  const accBySede = new Map();
  rawVentas.forEach(d => {
    const sedeName = d.sedeName;
    const periodKey = ventaPeriodKeyFor(d.fecha, granularity);
    if (!accBySede.has(sedeName)) accBySede.set(sedeName, new Map());
    const periods = accBySede.get(sedeName);
    if (!periods.has(periodKey)) periods.set(periodKey, { periodKey, sedeName, valorVenta: 0 });
    periods.get(periodKey).valorVenta += d.valorVenta || 0;
  });
  const bySede = [], byPeriod = new Map();
  accBySede.forEach((periods, sedeName) => {
    const points = Array.from(periods.values()).map(acc => ({ periodKey: acc.periodKey, periodLabel: periodLabel(acc.periodKey, granularity), sedeName, valorVenta: acc.valorVenta })).sort((a, b) => a.periodKey < b.periodKey ? -1 : 1);
    bySede.push({ sedeName, points });
    points.forEach(p => { if (!byPeriod.has(p.periodKey)) byPeriod.set(p.periodKey, []); byPeriod.get(p.periodKey).push(p); });
  });
  const periodKeysSorted = Array.from(byPeriod.keys()).sort();
  return { granularity, bySede, byPeriod: Array.from(byPeriod.entries()).map(([periodKey, points]) => ({ periodKey, points })), periodKeysSorted, sedeNames: bySede.map(s => s.sedeName).sort() };
}
`;

const VIEWER_JS = `
function fmtCOP(v){ if(v==null||isNaN(v)) return '$0'; return '$' + Math.round(v).toLocaleString('es-CO'); }
function fmtPct(v){ return (Math.round(v*1000)/10).toFixed(1)+'%'; }
function el(id){ return document.getElementById(id); }

const METRIC_LABELS = { margenPct: 'Margen %', utilidadBruta: 'Utilidad Bruta', venta: 'Ventas' };
const GRAN_LABELS = { week: 'semana', month: 'mes', year: 'año' };

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
  refreshActiveView();
}

let activeView = 'tiempo';
let charts = {};
let currentData = null;
let currentVentaData = null;
function destroyChart(id){ if (charts[id]) { charts[id].destroy(); delete charts[id]; } }
// "Ventas" tiene su PROPIO calendario (ventas_dias, día a día) — el resto de
// métricas viene de balance_weeks. Estas 2 funciones son el único lugar que
// necesita saber cuál de las dos fuentes usar.
function activeSource(){ return el('filterMetrica').value === 'venta' ? currentVentaData : currentData; }
function pointValue(metric, point){ return metric === 'venta' ? point.valorVenta : point[metric]; }

function initTabs(){
  document.querySelectorAll('.view-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const v = btn.dataset.view;
      document.querySelectorAll('.view-panel').forEach(p => p.classList.add('hidden-block'));
      el('view-' + v).classList.remove('hidden-block');
      activeView = v;
      refreshActiveView();
    });
  });
}

let selectedPeriods = null; // Set<periodKey> | null (null = todos)

function recomputeData(){
  const granularity = el('filterGranularidad').value;
  currentData = aggregateByPeriod(RAW_WEEKS, granularity);
  currentVentaData = aggregateVentasByPeriod(RAW_VENTAS, granularity);
  selectedPeriods = null;
  renderPeriodPopover();
}

// Botón "📅 Fechas" con panel: casillas + "seleccionar todos"/"deseleccionar
// todos" — mismo patrón que el dashboard en pantalla (Reportes > Balance).
function renderPeriodPopover(){
  const data = activeSource();
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
      else cb.checked = true; // siempre debe quedar al menos 1 periodo
      if (selectedPeriods.size === data.periodKeysSorted.length) selectedPeriods = null;
      const n2 = selectedPeriods ? selectedPeriods.size : data.periodKeysSorted.length;
      el('periodoBtn').textContent = selectedPeriods ? '📅 Fechas (' + n2 + ')' : '📅 Fechas (todas)';
      el('periodoHint').textContent = (data.granularity === 'week' && n2 === 1 && el('filterMetrica').value === 'venta')
        ? '📅 Semana específica — "Serie de tiempo" muestra el detalle día a día.' : '';
      renderKpis(); refreshActiveView();
    });
  });
  el('periodoBtn').textContent = selectedPeriods ? '📅 Fechas (' + selectedPeriods.size + ')' : '📅 Fechas (todas)';
  const n = selectedPeriods ? selectedPeriods.size : data.periodKeysSorted.length;
  el('periodoHint').textContent = (data.granularity === 'week' && n === 1 && el('filterMetrica').value === 'venta')
    ? '📅 Semana específica — "Serie de tiempo" muestra el detalle día a día.' : '';
}
function periodsInScope(){
  const data = activeSource();
  return selectedPeriods ? data.periodKeysSorted.filter(k => selectedPeriods.has(k)) : data.periodKeysSorted;
}

function initFilters(){
  const sedeSel = el('filterSede');
  el('filterMetrica').addEventListener('change', () => {
    recomputeData(); // el listado de periodos/sedes puede cambiar (Ventas usa su propio calendario)
    refreshSedeOptions();
    renderKpis();
    refreshActiveView();
  });
  sedeSel.addEventListener('change', () => { renderKpis(); refreshActiveView(); });
  el('filterGranularidad').addEventListener('change', () => {
    recomputeData();
    refreshSedeOptions();
    renderKpis();
    refreshActiveView();
  });
  const btn = el('periodoBtn'), popover = el('periodoPopover');
  btn.addEventListener('click', (e) => { e.stopPropagation(); popover.classList.toggle('hidden-block'); });
  document.addEventListener('click', (e) => { if (!popover.contains(e.target) && e.target !== btn) popover.classList.add('hidden-block'); });
  el('periodoAllBtn').addEventListener('click', () => {
    selectedPeriods = null;
    popover.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; });
    el('periodoBtn').textContent = '📅 Fechas (todas)';
    renderKpis(); refreshActiveView();
  });
  el('periodoNoneBtn').addEventListener('click', () => {
    const boxes = Array.from(popover.querySelectorAll('input[type=checkbox]'));
    if (!boxes.length) return;
    selectedPeriods = new Set([boxes[0].dataset.period]);
    renderPeriodPopover();
    renderKpis(); refreshActiveView();
  });
}
function refreshSedeOptions(){
  const sedeSel = el('filterSede');
  const prev = sedeSel.value;
  const data = activeSource();
  sedeSel.innerHTML = '<option value="">Todas las sedes</option>' + data.sedeNames.map(s => '<option value="' + s + '">' + s + '</option>').join('');
  if (data.sedeNames.includes(prev)) sedeSel.value = prev;
}

function currentAccent(){ return getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#3ea8ff'; }
function colorFor(v){ return v < 0 ? '#ff3b6e' : (Math.abs(v) < 0.0001 ? '#2be3a8' : currentAccent()); }

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
      const prefix = ctx.dataset.label && ctx.chart.data.datasets.length > 1 ? ctx.dataset.label + ': ' : '';
      return prefix + tooltipFormatter(v);
    } } };
  }
  return opts;
}
function metricFormatter(metric){ return metric === 'margenPct' ? fmtPct : fmtCOP; }

function renderKpis(){
  const metric = el('filterMetrica').value;
  const sedeFilter = el('filterSede').value;
  const data = activeSource();
  const series = sedeFilter ? data.bySede.filter(s => s.sedeName === sedeFilter) : data.bySede;
  const allPoints = series.flatMap(s => s.points);
  const scope = periodsInScope();
  const period = scope[scope.length - 1];
  const periodPoints = allPoints.filter(p => p.periodKey === period);
  const periodLabelTxt = (periodPoints[0] || {}).periodLabel || period;
  const sedeLabel = sedeFilter ? ' — ' + sedeFilter : '';
  const granLabel = data.granularity === 'week' ? 'Semanas' : data.granularity === 'month' ? 'Meses' : 'Años';

  if (metric === 'venta') {
    const ventaPeriodo = periodPoints.reduce((a, p) => a + p.valorVenta, 0);
    const idx = data.periodKeysSorted.indexOf(period);
    const prevKey = idx > 0 ? data.periodKeysSorted[idx - 1] : null;
    const prevPoints = prevKey ? allPoints.filter(p => p.periodKey === prevKey) : [];
    const ventaPrev = prevPoints.reduce((a, p) => a + p.valorVenta, 0);
    const crecimiento = ventaPrev > 0 ? (ventaPeriodo - ventaPrev) / ventaPrev : null;
    el('kpiGrid').innerHTML =
      '<div class="kpi-card"><div class="kpi-label">Sedes' + (sedeFilter ? ' filtradas' : ' con historial') + '</div><div class="kpi-value">' + series.length + '</div></div>' +
      '<div class="kpi-card"><div class="kpi-label">' + granLabel + ' con datos</div><div class="kpi-value">' + data.periodKeysSorted.length + '</div></div>' +
      '<div class="kpi-card kpi-pos"><div class="kpi-label">Ventas — ' + escapeHtmlJs(periodLabelTxt) + sedeLabel + '</div><div class="kpi-value">' + fmtCOP(ventaPeriodo) + '</div></div>' +
      '<div class="kpi-card ' + (crecimiento == null ? '' : (crecimiento < 0 ? 'kpi-neg' : 'kpi-pos')) + '"><div class="kpi-label">Crecimiento vs. periodo anterior</div><div class="kpi-value">' + (crecimiento == null ? 'n/d' : fmtPct(crecimiento)) + '</div></div>';
    return;
  }

  const margen = periodPoints.length ? periodPoints.reduce((a, p) => a + p.utilidadBruta, 0) / (periodPoints.reduce((a, p) => a + p.totalVentas, 0) || 1) : 0;
  const utilidadPeriodo = periodPoints.reduce((a, p) => a + p.utilidadBruta, 0);
  const acumUtilidad = allPoints.reduce((a, p) => a + p.utilidadBruta, 0);
  el('kpiGrid').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Sedes' + (sedeFilter ? ' filtradas' : ' con historial') + '</div><div class="kpi-value">' + series.length + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">' + granLabel + ' con datos</div><div class="kpi-value">' + data.periodKeysSorted.length + '</div></div>' +
    '<div class="kpi-card ' + (margen < 0 ? 'kpi-neg' : 'kpi-pos') + '"><div class="kpi-label">Margen — ' + escapeHtmlJs(periodLabelTxt) + sedeLabel + '</div><div class="kpi-value">' + fmtPct(margen) + '</div></div>' +
    '<div class="kpi-card ' + (utilidadPeriodo < 0 ? 'kpi-neg' : 'kpi-pos') + '"><div class="kpi-label">Utilidad — ' + escapeHtmlJs(periodLabelTxt) + sedeLabel + '</div><div class="kpi-value">' + fmtCOP(utilidadPeriodo) + '</div></div>' +
    '<div class="kpi-card ' + (acumUtilidad < 0 ? 'kpi-neg' : 'kpi-pos') + '"><div class="kpi-label">Utilidad acumulada' + sedeLabel + '</div><div class="kpi-value">' + fmtCOP(acumUtilidad) + '</div></div>';
}
function escapeHtmlJs(s){ return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

function viewTiempo(){
  destroyChart('tiempo');
  const metric = el('filterMetrica').value;
  const sedeFilter = el('filterSede').value;
  const data = activeSource();
  const scope = periodsInScope();
  const series = sedeFilter ? data.bySede.filter(s => s.sedeName === sedeFilter) : data.bySede;

  // Drill-down: UNA sola semana seleccionada + métrica Ventas -> detalle día
  // a día (ventas_dias es la única fuente con datos diarios reales).
  if (metric === 'venta' && data.granularity === 'week' && scope.length === 1) {
    const weekStart = scope[0];
    const dias = [];
    for (let i = 0; i < 7; i++) { const d = new Date(weekStart + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i); dias.push(d.toISOString().slice(0, 10)); }
    const sedeNames = sedeFilter ? [sedeFilter] : data.sedeNames;
    const rows = sedeFilter ? RAW_VENTAS.filter(r => r.sedeName === sedeFilter) : RAW_VENTAS;
    const datasets = sedeNames.map((sedeName, i) => {
      const byFecha = new Map(rows.filter(r => r.sedeName === sedeName).map(r => [String(r.fecha).slice(0, 10), r.valorVenta]));
      return { label: sedeName, data: dias.map(f => byFecha.has(f) ? byFecha.get(f) : null), borderColor: colorForSedeIndex(i), backgroundColor: colorForSedeIndex(i), spanGaps: true, tension: .25 };
    });
    const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const diaLabels = dias.map(f => { const d = new Date(f + 'T00:00:00Z'); return DIAS_SEMANA[d.getUTCDay()] + ' ' + String(d.getUTCDate()).padStart(2, '0'); });
    const opts = chartOptions('Ventas por día — semana del ' + weekStart, null, metricFormatter(metric));
    opts.plugins.legend.display = datasets.length > 1;
    charts.tiempo = new Chart(el('chartTiempo').getContext('2d'), { type: 'line', data: { labels: diaLabels, datasets }, options: opts });
    return;
  }

  const labels = scope.map(k => (data.byPeriod.find(p => p.periodKey === k) || {}).points[0]?.periodLabel || k);
  const datasets = series.map((s, i) => {
    const byPeriod = new Map(s.points.map(p => [p.periodKey, pointValue(metric, p)]));
    return { label: s.sedeName, data: scope.map(k => byPeriod.has(k) ? byPeriod.get(k) : null), borderColor: colorForSedeIndex(i), backgroundColor: colorForSedeIndex(i), spanGaps: true, tension: .25 };
  });
  const ctx = el('chartTiempo').getContext('2d');
  const opts = chartOptions(METRIC_LABELS[metric] + ' por ' + GRAN_LABELS[data.granularity], null, metricFormatter(metric));
  opts.plugins.legend.display = series.length > 1;
  charts.tiempo = new Chart(ctx, { type: 'line', data: { labels, datasets }, options: opts });
}

function viewSedes(){
  destroyChart('sedes');
  const metric = el('filterMetrica').value;
  const data = activeSource();
  const scope = periodsInScope();
  const sedeFilter = el('filterSede').value;
  const sedeNames = sedeFilter ? [sedeFilter] : data.sedeNames;
  // Suma de los periodos seleccionados por sede (con 1 solo periodo
  // seleccionado, equivale a "ese periodo"); para % se pondera (utilidad
  // total / venta total), promediar el % directamente sería incorrecto.
  let pairs;
  if (metric === 'margenPct') {
    const rawPts = data.bySede.filter(s => !sedeFilter || s.sedeName === sedeFilter).flatMap(s => s.points.filter(p => scope.includes(p.periodKey)));
    pairs = sedeNames.map(sedeName => {
      const pts = rawPts.filter(p => p.sedeName === sedeName);
      const tv = pts.reduce((a, p) => a + p.totalVentas, 0), tu = pts.reduce((a, p) => a + p.utilidadBruta, 0);
      return [sedeName, tv === 0 ? 0 : tu / tv];
    });
  } else {
    pairs = sedeNames.map(sedeName => {
      const s = data.bySede.find(s => s.sedeName === sedeName);
      const pts = (s ? s.points : []).filter(p => scope.includes(p.periodKey));
      return [sedeName, pts.reduce((a, p) => a + pointValue(metric, p), 0)];
    });
  }
  pairs.sort((a, b) => b[1] - a[1]); // descendente: el mejor resultado primero
  const labels = pairs.map(([s]) => s);
  const values = pairs.map(([, v]) => v);
  const scopeLabel = scope.length === 1 ? ((data.byPeriod.find(p => p.periodKey === scope[0]) || {}).points[0]?.periodLabel || scope[0]) : scope.length + ' periodo(s)';
  const ctx = el('chartSedes').getContext('2d');
  // Un color por sede (no rojo/verde por signo, mismo color que en el
  // gráfico de tiempo) — el objetivo de esta vista es distinguir sedes.
  const colorOf = (sedeName) => colorForSedeIndex(sedeNames.indexOf(sedeName));
  // Barras verticales (indexAxis 'x', el default): con 'y' (horizontal) el
  // callback de tooltip de chartOptions lee ctx.parsed.y, que en un bar
  // horizontal es el índice de categoría (no el valor) — mostraba el número
  // equivocado al pasar el mouse.
  charts.sedes = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ data: values, backgroundColor: labels.map(colorOf), borderRadius: 6 }] }, options: chartOptions(METRIC_LABELS[metric] + ' — ' + scopeLabel, null, metricFormatter(metric)) });
}

// "Presupuesto": a diferencia de la otra vista, ignora
// métrica/granularidad/fechas — siempre es venta real del MES EN CURSO (al
// momento de abrir este informe) contra la meta que dio la empresa, respeta
// solo el filtro de sede.
function currentAnioMes(){ const now = new Date(); return { anio: now.getFullYear(), mes: now.getMonth() + 1 }; }
function computeProjection(diaRows, anio, mes){
  if (!diaRows.length) return null;
  const acumulado = diaRows.reduce((a, r) => a + (r.valorVenta || 0), 0);
  const ultimaFecha = diaRows.reduce((max, r) => { const f = String(r.fecha).slice(0, 10); return !max || f > max ? f : max; }, null);
  const diasTranscurridos = new Date(ultimaFecha + 'T00:00:00Z').getUTCDate();
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const proyeccion = diasTranscurridos > 0 ? (acumulado / diasTranscurridos) * diasDelMes : 0;
  return { acumulado, diasTranscurridos, diasDelMes, ultimaFecha, proyeccion };
}
function viewPresupuesto(){
  destroyChart('presupuesto');
  const sedeFilter = el('filterSede').value;
  const { anio, mes } = currentAnioMes();
  const mesPrefix = anio + '-' + String(mes).padStart(2, '0');
  const diasDelMes = RAW_VENTAS.filter(d => String(d.fecha).slice(0, 7) === mesPrefix);
  const sedesDelMes = (sedeFilter ? [sedeFilter] : Array.from(new Set(diasDelMes.map(d => d.sedeName)))).sort();

  const porSede = sedesDelMes.map(sedeName => {
    const proj = computeProjection(diasDelMes.filter(d => d.sedeName === sedeName), anio, mes);
    const presupuesto = Number((RAW_PRESUPUESTOS.find(p => p.sedeName === sedeName && p.anio === anio && p.mes === mes) || {}).monto || 0);
    return { sedeName, proj, presupuesto };
  });

  const totalAcumulado = porSede.reduce((a, s) => a + (s.proj ? s.proj.acumulado : 0), 0);
  const totalProyeccion = porSede.reduce((a, s) => a + (s.proj ? s.proj.proyeccion : 0), 0);
  const totalPresupuesto = porSede.reduce((a, s) => a + s.presupuesto, 0);
  const pct = totalPresupuesto > 0 ? totalProyeccion / totalPresupuesto : null;
  const cumple = pct != null && pct >= 1;

  el('presuKpiGrid').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Presupuesto del mes' + (sedeFilter ? '' : ' (total)') + '</div><div class="kpi-value">' + fmtCOP(totalPresupuesto) + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Acumulado del mes</div><div class="kpi-value">' + fmtCOP(totalAcumulado) + '</div></div>' +
    '<div class="kpi-card ' + (pct == null ? '' : (cumple ? 'kpi-pos' : 'kpi-neg')) + '"><div class="kpi-label">Proyección de cierre</div><div class="kpi-value">' + fmtCOP(totalProyeccion) + '</div></div>' +
    '<div class="kpi-card ' + (pct == null ? '' : (cumple ? 'kpi-pos' : 'kpi-neg')) + '"><div class="kpi-label">' + (pct == null ? 'Sin meta cargada' : (cumple ? '✓ Proyecta a CUMPLIR la meta' : '⚠ Proyecta a NO cumplir')) + '</div><div class="kpi-value">' + (pct == null ? '—' : fmtPct(pct)) + '</div></div>';

  const acumPorSede = porSede.map(s => s.proj ? s.proj.acumulado : 0);
  const presPorSede = porSede.map(s => s.presupuesto);
  const opts = chartOptions('Acumulado vs. presupuesto — mes en curso', null, fmtCOP);
  opts.plugins.legend.display = true;
  charts.presupuesto = new Chart(el('chartPresupuesto').getContext('2d'), {
    type: 'bar',
    data: { labels: sedesDelMes, datasets: [
      { label: 'Acumulado del mes', data: acumPorSede, backgroundColor: '#2be3a8', borderRadius: 6 },
      { label: 'Presupuesto', data: presPorSede, backgroundColor: '#8892b0', borderRadius: 6 }
    ] },
    options: opts
  });

  el('presuTableBody').innerHTML = porSede.length ? porSede.map(s => {
    const p = s.presupuesto > 0 && s.proj ? s.proj.proyeccion / s.presupuesto : null;
    const cls = p == null ? '' : (p >= 1 ? 'diff-zero' : (p >= 0.9 ? '' : 'diff-neg'));
    return '<tr><td class="left">' + s.sedeName + '</td><td>' + (s.proj ? fmtCOP(s.proj.acumulado) : '—') + '</td><td>' + (s.proj ? fmtCOP(s.proj.proyeccion) : '—') + '</td><td>' + (s.presupuesto > 0 ? fmtCOP(s.presupuesto) : '—') + '</td><td class="' + cls + '">' + (p == null ? '—' : fmtPct(p)) + '</td></tr>';
  }).join('') : '<tr><td colspan="5" class="left">Sin ventas del mes en curso todavía.</td></tr>';
}

function refreshActiveView(){
  if (activeView === 'tiempo') viewTiempo();
  else if (activeView === 'sedes') viewSedes();
  else if (activeView === 'presupuesto') viewPresupuesto();
}

recomputeData();
refreshSedeOptions();
initTheme();
initTabs();
initFilters();
renderKpis();
refreshActiveView();
`;
