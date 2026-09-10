// Genera un informe HTML autocontenido (offline, sin backend) con los datos
// YA CALCULADOS embebidos como JSON, y un visor interactivo con 5 modos de
// visualización + un panel para personalizar el aspecto visual (color de
// acento y modo claro/oscuro). Se descarga como archivo aparte del sistema
// principal — pensado para compartir el análisis con alguien que no tiene
// (ni necesita) la plataforma completa.
//
// Este módulo NO importa Chart.js vía <script> externo: recibe el código
// fuente del bundle ya leído (ver buildViewerHtml) para quedar 100% offline,
// igual que hace el sistema principal.

import { CHART_DOWNLOAD_JS, CHART_GLOW_JS } from '../theme/chartDownloadPlugin.js';

export function buildInteractiveReportHtml(dashboardDataSerialized, chartJsSource, meta) {
  const dataJson = JSON.stringify(dashboardDataSerialized);
  const title = `Análisis Comparativo — ${meta?.periodo || ''}`.trim();
  const generatedAt = new Date().toLocaleString('es-CO');

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
      <h1>Análisis Comparativo de Puntos de Venta</h1>
      <p class="sub">Generado el ${escapeHtml(generatedAt)}${meta?.periodo ? ' · Periodo: ' + escapeHtml(meta.periodo) : ''} · ${dashboardDataSerialized.bySede.length} sede(s)</p>
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
    <button class="view-tab active" data-view="sede">📊 Por sede</button>
    <button class="view-tab" data-view="categoria">📦 Por categoría</button>
    <button class="view-tab" data-view="barras">📶 Comparativo por categoría</button>
    <button class="view-tab" data-view="scatter">🎯 Dispersión</button>
    <button class="view-tab" data-view="ranking">🏆 Ranking de productos</button>
  </nav>

  <div class="filters">
    <select id="filterSede"></select>
    <select id="filterCategoria"></select>
  </div>

  <section class="view-panel" id="view-sede"><div class="chart-box"><canvas id="chartSede"></canvas></div></section>
  <section class="view-panel hidden-block" id="view-categoria"><div class="chart-box"><canvas id="chartCategoria"></canvas></div></section>
  <section class="view-panel hidden-block" id="view-barras"><div class="chart-box"><canvas id="chartBarras"></canvas></div></section>
  <section class="view-panel hidden-block" id="view-scatter"><div class="chart-box"><canvas id="chartScatter"></canvas></div></section>
  <section class="view-panel hidden-block" id="view-ranking">
    <table class="dtable" id="rankingTable">
      <thead><tr>
        <th class="left" data-sort="sede">Sede</th><th class="left" data-sort="category">Categoría</th>
        <th class="left" data-sort="code">Código</th><th class="left" data-sort="name">Producto</th>
        <th data-sort="disponible">Disponible</th><th data-sort="diferenciaKL">Diferencia KL</th><th data-sort="pct">% Diferencia</th>
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
const DASH_DATA = ${dataJson};
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
.kpi-value{font-size:24px;font-weight:800;}
.kpi-neg .kpi-value{color:#ff3b6e;}
.kpi-pos .kpi-value{color:#2be3a8;}
.view-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;border-bottom:2px solid var(--border);}
.view-tab{background:none;border:none;color:var(--muted);padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px;}
.view-tab.active{color:var(--accent);border-bottom-color:var(--accent);}
.filters{display:flex;gap:10px;margin-bottom:16px;}
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

const VIEWER_JS = `
function fmt(v){ if(v==null||isNaN(v)) return '0'; const r=Math.round(v*100)/100; return Number.isInteger(r)?String(r):r.toFixed(2); }
function fmtPct(v){ return (Math.round(v*1000)/10).toFixed(1)+'%'; }
function el(id){ return document.getElementById(id); }

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

let activeView = 'sede';
let charts = {};

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

function initFilters(){
  const sedeSel = el('filterSede');
  sedeSel.innerHTML = '<option value="">Todas las sedes</option>' + DASH_DATA.bySede.map(s => '<option value="' + s.sedeName + '">' + s.sedeName + '</option>').join('');
  const catSel = el('filterCategoria');
  catSel.innerHTML = '<option value="">Todas las categorías</option>' + DASH_DATA.byCategory.map(c => '<option value="' + c.category + '">' + c.category + '</option>').join('');
  sedeSel.addEventListener('change', refreshActiveView);
  catSel.addEventListener('change', refreshActiveView);
}

function currentAccent(){ return getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#3ea8ff'; }
function colorFor(v){ return v < -0.01 ? '#ff3b6e' : (Math.abs(v) < 0.01 ? '#2be3a8' : currentAccent()); }

function chartOptions(title, indexAxis){
  const textColor = document.body.classList.contains('theme-light') ? '#1b2033' : '#eaf0ff';
  const gridColor = document.body.classList.contains('theme-light') ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.06)';
  return {
    responsive: true, maintainAspectRatio: false, indexAxis: indexAxis || 'x',
    plugins: { legend: { display: false }, title: { display: true, text: title, color: textColor } },
    scales: { x: { ticks: { color: textColor }, grid: { color: gridColor } }, y: { ticks: { color: textColor }, grid: { color: gridColor } } }
  };
}

function renderKpis(){
  const d = DASH_DATA;
  el('kpiGrid').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Sedes</div><div class="kpi-value">' + d.bySede.length + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Disponible total</div><div class="kpi-value">' + fmt(d.totalDisponible) + '</div></div>' +
    '<div class="kpi-card ' + (d.totalDiferencia < 0 ? 'kpi-neg' : 'kpi-pos') + '"><div class="kpi-label">Diferencia KL total</div><div class="kpi-value">' + fmt(d.totalDiferencia) + '</div></div>' +
    '<div class="kpi-card ' + (d.totalDiferencia < 0 ? 'kpi-neg' : 'kpi-pos') + '"><div class="kpi-label">% Diferencia global</div><div class="kpi-value">' + (d.totalDisponible === 0 ? '0.0%' : fmtPct(d.totalDiferencia / d.totalDisponible)) + '</div></div>' +
    '<div class="kpi-card kpi-neg"><div class="kpi-label">Productos con faltante</div><div class="kpi-value">' + d.totalProductosNeg + '</div></div>';
}

function filteredRows(){
  const sede = el('filterSede').value, cat = el('filterCategoria').value;
  let rows = DASH_DATA.allProductRows;
  if (sede) rows = rows.filter(r => r.sede === sede);
  if (cat) rows = rows.filter(r => r.category === cat);
  return rows;
}

function destroyChart(id){ if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

function viewSede(){
  destroyChart('sede');
  const ctx = el('chartSede').getContext('2d');
  const labels = DASH_DATA.bySede.map(s => s.sedeName);
  const values = DASH_DATA.bySede.map(s => s.totals.diferenciaKL);
  charts.sede = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ data: values, backgroundColor: values.map(colorFor), borderRadius: 6 }] }, options: chartOptions('Diferencia KL por sede') });
}

function viewCategoria(){
  destroyChart('categoria');
  const sede = el('filterSede').value;
  const map = new Map();
  DASH_DATA.byCategory.forEach(c => map.set(c.category, { disponible: 0, diferenciaKL: 0 }));
  const rows = sede ? DASH_DATA.allProductRows.filter(r => r.sede === sede) : DASH_DATA.allProductRows;
  rows.forEach(r => { if (!map.has(r.category)) map.set(r.category, { disponible: 0, diferenciaKL: 0 }); const m = map.get(r.category); m.diferenciaKL += r.diferenciaKL; });
  const labels = Array.from(map.keys());
  const values = labels.map(l => map.get(l).diferenciaKL);
  const ctx = el('chartCategoria').getContext('2d');
  charts.categoria = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ data: values, backgroundColor: values.map(colorFor), borderRadius: 6 }] }, options: chartOptions('Diferencia KL por categoría' + (sede ? ' — ' + sede : ''), 'y') });
}

function viewBarras(){
  destroyChart('barras');
  const sedes = DASH_DATA.bySede.map(s => s.sedeName);
  const cats = DASH_DATA.byCategory.map(c => c.category);
  const matrix = {};
  cats.forEach(cat => { matrix[cat] = {}; sedes.forEach(sede => { matrix[cat][sede] = 0; }); });
  DASH_DATA.allProductRows.forEach(r => { if (matrix[r.category] && matrix[r.category][r.sede] != null) matrix[r.category][r.sede] += r.diferenciaKL; });

  const palette = ['#3ea8ff','#2be3a8','#ff3b6e','#f0b429','#a86bff','#ff8a3d'];
  const datasets = sedes.map((sede, i) => ({
    label: sede,
    data: cats.map(cat => matrix[cat][sede]),
    backgroundColor: palette[i % palette.length],
    borderRadius: 4
  }));
  const ctx = el('chartBarras').getContext('2d');
  const opts = chartOptions('Diferencia KL por categoría y sede');
  opts.plugins.legend.display = sedes.length > 1;
  charts.barras = new Chart(ctx, { type: 'bar', data: { labels: cats, datasets }, options: opts });
}

function viewScatter(){
  destroyChart('scatter');
  const rows = filteredRows();
  const points = rows.map(r => ({ x: r.disponible, y: r.diferenciaKL, label: r.name, sede: r.sede }));
  const ctx = el('chartScatter').getContext('2d');
  const opts = chartOptions('Disponible vs Diferencia KL (cada punto es un producto)');
  opts.plugins.tooltip = { callbacks: { label: (c) => c.raw.label + ' (' + c.raw.sede + '): Disp=' + fmt(c.raw.x) + ', Dif=' + fmt(c.raw.y) } };
  charts.scatter = new Chart(ctx, {
    type: 'scatter',
    data: { datasets: [{ data: points, backgroundColor: points.map(p => colorFor(p.y)), pointRadius: 5 }] },
    options: opts
  });
}

let sortState = { key: 'diferenciaKL', dir: 1 };
function viewRanking(){
  let rows = filteredRows().slice();
  rows.sort((a, b) => {
    const av = a[sortState.key], bv = b[sortState.key];
    if (typeof av === 'string') return av.localeCompare(bv) * sortState.dir;
    return (av - bv) * sortState.dir;
  });
  rows = rows.slice(0, 100);
  el('rankingBody').innerHTML = rows.map(r => {
    const cls = r.diferenciaKL < -0.01 ? 'diff-neg' : (Math.abs(r.diferenciaKL) < 0.01 ? 'diff-zero' : '');
    return '<tr><td class="left">' + r.sede + '</td><td class="left">' + r.category + '</td><td class="left">' + r.code + '</td><td class="left">' + r.name + '</td><td>' + fmt(r.disponible) + '</td><td class="' + cls + '">' + fmt(r.diferenciaKL) + '</td><td>' + fmtPct(r.pct) + '</td></tr>';
  }).join('') || '<tr><td colspan="7" class="left">Sin datos para este filtro.</td></tr>';
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
  if (activeView === 'sede') viewSede();
  else if (activeView === 'categoria') viewCategoria();
  else if (activeView === 'barras') viewBarras();
  else if (activeView === 'scatter') viewScatter();
  else if (activeView === 'ranking') viewRanking();
}

initTheme();
initTabs();
initFilters();
renderKpis();
refreshActiveView();
`;
