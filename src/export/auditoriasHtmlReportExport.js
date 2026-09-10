// Informe HTML autocontenido "estilo Power BI" del historial de Auditorías
// PDV — mismo molde que src/export/balanceHtmlReportExport.js (Chart.js
// incrustado como texto, agregación semanal/mensual/anual calculada DENTRO
// del HTML exportado para poder cambiar de granularidad sin conexión), pero
// comparando % de cumplimiento del checklist en vez de margen/utilidad.

import { AUDIT_BLOCKS } from '../data/auditChecklist.js';
import { CHART_DOWNLOAD_JS } from '../theme/chartDownloadPlugin.js';

export function buildAuditoriasReportHtml(rawAuditRows, chartJsSource, meta) {
  const rawAudits = (rawAuditRows || []).map(a => ({
    sedeName: a.sede_name, auditDate: a.audit_date, items: a.items || {},
    totalItems: a.total_items, checkedItems: a.checked_items, resultado: a.resultado
  }));
  const dataJson = JSON.stringify(rawAudits);
  const blocksJson = JSON.stringify(AUDIT_BLOCKS.map(b => ({ id: b.id, title: b.title, size: b.items.length })));
  const generatedAt = new Date().toLocaleString('es-CO');
  const title = `Auditorías PDV${meta?.periodo ? ' — ' + meta.periodo : ''}`;
  const sedeCount = new Set(rawAudits.map(a => a.sedeName)).size;

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
      <h1>Auditorías PDV — Cumplimiento por Sede</h1>
      <p class="sub">Generado el ${escapeHtml(generatedAt)} · ${sedeCount} sede(s) · ${rawAudits.length} auditoría(s) guardada(s)</p>
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
    <button class="view-tab active" data-view="tiempo">📈 Cumplimiento en el tiempo</button>
    <button class="view-tab" data-view="bloques">📦 Cumplimiento por bloque</button>
    <button class="view-tab" data-view="ranking">🏆 Ranking de auditorías</button>
  </nav>

  <div class="filters">
    <select id="filterGranularidad">
      <option value="week">Semanal</option>
      <option value="month" selected>Mensual</option>
      <option value="year">Anual</option>
    </select>
    <select id="filterSede"></select>
    <select id="filterPeriodo"></select>
  </div>

  <section class="view-panel" id="view-tiempo"><div class="chart-box"><canvas id="chartTiempo"></canvas></div></section>
  <section class="view-panel hidden-block" id="view-bloques"><div class="chart-box"><canvas id="chartBloques"></canvas></div></section>
  <section class="view-panel hidden-block" id="view-ranking">
    <table class="dtable" id="rankingTable">
      <thead><tr>
        <th class="left" data-sort="sedeName">Sede</th><th class="left" data-sort="periodKey">Periodo</th>
        <th data-sort="audits">Auditorías</th><th data-sort="pctCumplimiento">% Cumplimiento</th>
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
const RAW_AUDITS = ${dataJson};
const AUDIT_BLOCKS = ${blocksJson};
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

// Puerto en JS plano (sin imports, corre dentro del HTML exportado) de
// src/auditorias/auditoriasDashboardData.js#aggregateByPeriod.
const AGG_JS = `
function periodKeyFor(auditDate, granularity){
  const iso = String(auditDate).slice(0, 10);
  if (granularity === 'week') return iso;
  const d = new Date(iso + 'T00:00:00Z');
  const y = d.getUTCFullYear();
  if (granularity === 'year') return String(y);
  return y + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function periodLabel(periodKey, granularity){
  if (granularity === 'year' || granularity === 'week') return periodKey;
  const parts = periodKey.split('-');
  return MESES[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
}
function aggregateByPeriod(audits, granularity){
  const accBySede = new Map();
  audits.forEach(a => {
    const sedeName = a.sedeName;
    const periodKey = periodKeyFor(a.auditDate, granularity);
    if (!accBySede.has(sedeName)) accBySede.set(sedeName, new Map());
    const periods = accBySede.get(sedeName);
    if (!periods.has(periodKey)) periods.set(periodKey, { periodKey, sedeName, totalItems: 0, checkedItems: 0, audits: 0, blockTotals: {}, blockChecked: {} });
    const acc = periods.get(periodKey);
    acc.totalItems += a.totalItems || 0;
    acc.checkedItems += a.checkedItems || 0;
    acc.audits += 1;
    Object.entries(a.items || {}).forEach(([blockId, block]) => {
      const checks = (block && block.checks) || [];
      acc.blockTotals[blockId] = (acc.blockTotals[blockId] || 0) + checks.length;
      acc.blockChecked[blockId] = (acc.blockChecked[blockId] || 0) + checks.filter(Boolean).length;
    });
  });
  const bySede = [], byPeriod = new Map();
  accBySede.forEach((periods, sedeName) => {
    const points = Array.from(periods.values()).map(acc => ({
      periodKey: acc.periodKey, periodLabel: periodLabel(acc.periodKey, granularity), sedeName,
      totalItems: acc.totalItems, checkedItems: acc.checkedItems,
      pctCumplimiento: acc.totalItems === 0 ? 0 : acc.checkedItems / acc.totalItems,
      audits: acc.audits,
      blockPct: Object.fromEntries(Object.keys(acc.blockTotals).map(bid => [bid, acc.blockTotals[bid] === 0 ? 0 : acc.blockChecked[bid] / acc.blockTotals[bid]]))
    })).sort((a, b) => a.periodKey < b.periodKey ? -1 : 1);
    bySede.push({ sedeName, points });
    points.forEach(p => { if (!byPeriod.has(p.periodKey)) byPeriod.set(p.periodKey, []); byPeriod.get(p.periodKey).push(p); });
  });
  return { granularity, bySede, byPeriod: Array.from(byPeriod.entries()).map(([periodKey, points]) => ({ periodKey, points })), periodKeysSorted: Array.from(byPeriod.keys()).sort(), sedeNames: bySede.map(s => s.sedeName).sort() };
}
function combineBlockPct(points){
  const totals = {}, checked = {};
  points.forEach(p => {
    AUDIT_BLOCKS.forEach(b => {
      const bid = String(b.id);
      const pct = p.blockPct[bid];
      if (pct == null) return;
      totals[bid] = (totals[bid] || 0) + b.size * p.audits;
      checked[bid] = (checked[bid] || 0) + pct * b.size * p.audits;
    });
  });
  return Object.fromEntries(AUDIT_BLOCKS.map(b => { const bid = String(b.id); const t = totals[bid] || 0; return [bid, t === 0 ? null : checked[bid] / t]; }));
}
`;

const VIEWER_JS = `
function fmtPct(v){ return (Math.round(v*1000)/10).toFixed(1)+'%'; }
function el(id){ return document.getElementById(id); }

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
function destroyChart(id){ if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

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
  currentData = aggregateByPeriod(RAW_AUDITS, el('filterGranularidad').value);
  const periodoSel = el('filterPeriodo');
  periodoSel.innerHTML = currentData.periodKeysSorted.slice().reverse().map(k => {
    const label = (currentData.byPeriod.find(p => p.periodKey === k) || {}).points[0]?.periodLabel || k;
    return '<option value="' + k + '">' + label + '</option>';
  }).join('');
}
function initFilters(){
  el('filterSede').addEventListener('change', () => { renderKpis(); refreshActiveView(); });
  el('filterPeriodo').addEventListener('change', () => { renderKpis(); refreshActiveView(); });
  el('filterGranularidad').addEventListener('change', () => { recomputeData(); refreshSedeOptions(); renderKpis(); refreshActiveView(); });
}
function refreshSedeOptions(){
  const sedeSel = el('filterSede');
  const prev = sedeSel.value;
  sedeSel.innerHTML = '<option value="">Todas las sedes</option>' + currentData.sedeNames.map(s => '<option value="' + s + '">' + s + '</option>').join('');
  if (currentData.sedeNames.includes(prev)) sedeSel.value = prev;
}

function currentAccent(){ return getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#3ea8ff'; }
function colorFor(v){ return v < 0.7 ? '#ff3b6e' : (v < 0.9 ? '#f0b429' : '#2be3a8'); }

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
  const sedeFilter = el('filterSede').value;
  const series = sedeFilter ? currentData.bySede.filter(s => s.sedeName === sedeFilter) : currentData.bySede;
  const allPoints = series.flatMap(s => s.points);
  const period = el('filterPeriodo').value || currentData.periodKeysSorted[currentData.periodKeysSorted.length - 1];
  const periodPoints = allPoints.filter(p => p.periodKey === period);
  const periodLabelTxt = (periodPoints[0] || {}).periodLabel || period;
  const totalItems = periodPoints.reduce((a, p) => a + p.totalItems, 0);
  const checkedItems = periodPoints.reduce((a, p) => a + p.checkedItems, 0);
  const pct = totalItems === 0 ? 0 : checkedItems / totalItems;
  const totalAudits = allPoints.reduce((a, p) => a + p.audits, 0);
  const blockPct = combineBlockPct(periodPoints);
  let worstBlock = null, worstVal = 2;
  AUDIT_BLOCKS.forEach(b => { const v = blockPct[String(b.id)]; if (v != null && v < worstVal) { worstVal = v; worstBlock = b.title; } });
  el('kpiGrid').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Sedes' + (sedeFilter ? ' filtradas' : ' con historial') + '</div><div class="kpi-value">' + series.length + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Auditorías guardadas</div><div class="kpi-value">' + totalAudits + '</div></div>' +
    '<div class="kpi-card ' + (pct < 0.9 ? 'kpi-neg' : 'kpi-pos') + '"><div class="kpi-label">Cumplimiento — ' + periodLabelTxt + '</div><div class="kpi-value">' + fmtPct(pct) + '</div></div>' +
    '<div class="kpi-card kpi-neg"><div class="kpi-label">Bloque más débil</div><div class="kpi-value" style="font-size:15px">' + (worstBlock || '—') + '</div></div>';
}

function viewTiempo(){
  destroyChart('tiempo');
  const sedeFilter = el('filterSede').value;
  const series = sedeFilter ? currentData.bySede.filter(s => s.sedeName === sedeFilter) : currentData.bySede;
  const labels = currentData.periodKeysSorted.map(k => (currentData.byPeriod.find(p => p.periodKey === k) || {}).points[0]?.periodLabel || k);
  const palette = ['#3ea8ff','#2be3a8','#ff3b6e','#f0b429','#a86bff','#ff8a3d'];
  const datasets = series.map((s, i) => {
    const byPeriod = new Map(s.points.map(p => [p.periodKey, p.pctCumplimiento]));
    return { label: s.sedeName, data: currentData.periodKeysSorted.map(k => byPeriod.has(k) ? byPeriod.get(k) : null), borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length], spanGaps: true, tension: .25 };
  });
  const opts = chartOptions('% Cumplimiento por ' + GRAN_LABELS[currentData.granularity]);
  opts.plugins.legend.display = series.length > 1;
  opts.scales.y.min = 0; opts.scales.y.max = 1;
  opts.scales.y.ticks.callback = (v) => fmtPct(v);
  charts.tiempo = new Chart(el('chartTiempo').getContext('2d'), { type: 'line', data: { labels, datasets }, options: opts });
}

function viewBloques(){
  destroyChart('bloques');
  const sedeFilter = el('filterSede').value;
  const series = sedeFilter ? currentData.bySede.filter(s => s.sedeName === sedeFilter) : currentData.bySede;
  const period = el('filterPeriodo').value || currentData.periodKeysSorted[currentData.periodKeysSorted.length - 1];
  const points = series.flatMap(s => s.points).filter(p => p.periodKey === period);
  const blockPct = combineBlockPct(points);
  const labels = AUDIT_BLOCKS.map(b => b.title);
  const values = AUDIT_BLOCKS.map(b => blockPct[String(b.id)] ?? 0);
  const opts = chartOptions('Cumplimiento por bloque', 'y');
  opts.scales.x.min = 0; opts.scales.x.max = 1;
  opts.scales.x.ticks.callback = (v) => fmtPct(v);
  charts.bloques = new Chart(el('chartBloques').getContext('2d'), { type: 'bar', data: { labels, datasets: [{ data: values, backgroundColor: values.map(colorFor), borderRadius: 6 }] }, options: opts });
}

let sortState = { key: 'periodKey', dir: -1 };
function viewRanking(){
  let rows = currentData.bySede.flatMap(s => s.points);
  const sede = el('filterSede').value;
  if (sede) rows = rows.filter(r => r.sedeName === sede);
  rows = rows.slice().sort((a, b) => {
    const av = a[sortState.key], bv = b[sortState.key];
    if (typeof av === 'string') return av.localeCompare(bv) * sortState.dir;
    return (av - bv) * sortState.dir;
  });
  el('rankingBody').innerHTML = rows.map(r => {
    const cls = r.pctCumplimiento < 0.7 ? 'diff-neg' : (r.pctCumplimiento >= 0.9 ? 'diff-zero' : '');
    return '<tr><td class="left">' + r.sedeName + '</td><td class="left">' + r.periodLabel + '</td><td>' + r.audits + '</td><td class="' + cls + '">' + fmtPct(r.pctCumplimiento) + '</td></tr>';
  }).join('') || '<tr><td colspan="4" class="left">Sin auditorías guardadas todavía.</td></tr>';
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
  else if (activeView === 'bloques') viewBloques();
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
