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

export function buildBalanceReportHtml(rawWeekRows, rawVentaRows, chartJsSource, meta) {
  const rawWeeks = (rawWeekRows || []).map(w => ({
    sedeName: w.sede_name, weekStart: w.week_start, weekEnd: w.week_end, computed: w.computed || {}
  }));
  const rawVentas = (rawVentaRows || []).map(d => ({ sedeName: d.sede_name, fecha: d.fecha, valorVenta: Number(d.valor_venta) || 0 }));
  const dataJson = JSON.stringify(rawWeeks);
  const ventasJson = JSON.stringify(rawVentas);
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
    <button class="view-tab" data-view="ranking">🏆 Ranking</button>
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
    <select id="filterPeriodo"></select>
  </div>

  <section class="view-panel" id="view-tiempo"><div class="chart-box"><canvas id="chartTiempo"></canvas></div></section>
  <section class="view-panel hidden-block" id="view-sedes"><div class="chart-box"><canvas id="chartSedes"></canvas></div></section>
  <section class="view-panel hidden-block" id="view-ranking">
    <table class="dtable" id="rankingTable">
      <thead><tr>
        <th class="left" data-sort="sedeName">Sede</th><th class="left" data-sort="periodKey">Periodo</th>
        <th data-sort="totalVentas">Ventas</th>
        <th data-sort="utilidadBruta">Utilidad Bruta</th><th data-sort="margenPct">Margen %</th>
      </tr></thead>
      <tbody id="rankingBody"></tbody>
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

function recomputeData(){
  const granularity = el('filterGranularidad').value;
  currentData = aggregateByPeriod(RAW_WEEKS, granularity);
  currentVentaData = aggregateVentasByPeriod(RAW_VENTAS, granularity);
  const data = activeSource();
  const periodoSel = el('filterPeriodo');
  periodoSel.innerHTML = data.periodKeysSorted.slice().reverse().map(k => {
    const label = (data.byPeriod.find(p => p.periodKey === k) || {}).points[0]?.periodLabel || k;
    return '<option value="' + k + '">' + label + '</option>';
  }).join('');
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
  el('filterPeriodo').addEventListener('change', () => { renderKpis(); refreshActiveView(); });
  el('filterGranularidad').addEventListener('change', () => {
    recomputeData();
    refreshSedeOptions();
    renderKpis();
    refreshActiveView();
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
  const period = el('filterPeriodo').value || data.periodKeysSorted[data.periodKeysSorted.length - 1];
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
  const series = sedeFilter ? data.bySede.filter(s => s.sedeName === sedeFilter) : data.bySede;
  const labels = data.periodKeysSorted.map(k => (data.byPeriod.find(p => p.periodKey === k) || {}).points[0]?.periodLabel || k);
  const datasets = series.map((s, i) => {
    const byPeriod = new Map(s.points.map(p => [p.periodKey, pointValue(metric, p)]));
    return { label: s.sedeName, data: data.periodKeysSorted.map(k => byPeriod.has(k) ? byPeriod.get(k) : null), borderColor: colorForSedeIndex(i), backgroundColor: colorForSedeIndex(i), spanGaps: true, tension: .25 };
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
  const period = el('filterPeriodo').value || data.periodKeysSorted[data.periodKeysSorted.length - 1];
  const rows = (data.byPeriod.find(w => w.periodKey === period) || { points: [] }).points;
  const label = (rows[0] || {}).periodLabel || period;
  // Ordenado de mayor a menor (el mejor resultado primero, a la izquierda).
  const sorted = rows.slice().sort((a, b) => pointValue(metric, b) - pointValue(metric, a));
  const labels = sorted.map(r => r.sedeName);
  const values = sorted.map(r => pointValue(metric, r));
  const ctx = el('chartSedes').getContext('2d');
  // Un color por sede (no rojo/verde por signo) — el objetivo de esta vista
  // es distinguir sedes entre sí, no si el valor es positivo/negativo.
  charts.sedes = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_, i) => colorForSedeIndex(i)), borderRadius: 6 }] }, options: chartOptions(METRIC_LABELS[metric] + ' — ' + label, null, metricFormatter(metric)) });
}

let sortState = { key: 'periodKey', dir: -1 };
function viewRanking(){
  const metric = el('filterMetrica').value;
  if (metric === 'venta') {
    let rows = currentVentaData.bySede.flatMap(s => s.points);
    const sede = el('filterSede').value;
    if (sede) rows = rows.filter(r => r.sedeName === sede);
    rows = rows.slice().sort((a, b) => {
      const key = sortState.key === 'totalVentas' ? 'valorVenta' : sortState.key;
      const av = a[key], bv = b[key];
      if (typeof av === 'string') return av.localeCompare(bv) * sortState.dir;
      return ((av || 0) - (bv || 0)) * sortState.dir;
    });
    el('rankingBody').innerHTML = rows.map(r =>
      '<tr><td class="left">' + r.sedeName + '</td><td class="left">' + r.periodLabel + '</td><td>' + fmtCOP(r.valorVenta) + '</td><td>—</td><td>—</td></tr>'
    ).join('') || '<tr><td colspan="5" class="left">Sin ventas guardadas todavía.</td></tr>';
    return;
  }
  let rows = currentData.bySede.flatMap(s => s.points);
  const sede = el('filterSede').value;
  if (sede) rows = rows.filter(r => r.sedeName === sede);
  rows = rows.slice().sort((a, b) => {
    const av = a[sortState.key], bv = b[sortState.key];
    if (typeof av === 'string') return av.localeCompare(bv) * sortState.dir;
    return (av - bv) * sortState.dir;
  });
  el('rankingBody').innerHTML = rows.map(r => {
    const cls = r.utilidadBruta < 0 ? 'diff-neg' : (Math.abs(r.utilidadBruta) < 0.01 ? 'diff-zero' : '');
    return '<tr><td class="left">' + r.sedeName + '</td><td class="left">' + r.periodLabel + '</td><td>' + fmtCOP(r.totalVentas) + '</td><td class="' + cls + '">' + fmtCOP(r.utilidadBruta) + '</td><td>' + fmtPct(r.margenPct) + '</td></tr>';
  }).join('') || '<tr><td colspan="5" class="left">Sin semanas guardadas todavía.</td></tr>';
}

function initSort(){
  document.querySelectorAll('#rankingTable th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      sortState.dir = (sortState.key === key) ? -sortState.dir : 1;
      sortState.key = key;
      viewRanking();
    });
  });
}

function refreshActiveView(){
  if (activeView === 'tiempo') viewTiempo();
  else if (activeView === 'sedes') viewSedes();
  else if (activeView === 'ranking') viewRanking();
}

recomputeData();
refreshSedeOptions();
initTheme();
initTabs();
initFilters();
initSort();
renderKpis();
refreshActiveView();
`;
