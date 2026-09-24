// ============================================================
// main.js — punto de entrada. Orquesta módulos: carga de archivos,
// clasificación de columnas, generación del informe por sede, dashboard
// consolidado, y las tres exportaciones (Excel por sede, Excel consolidado,
// informe HTML interactivo).
// ============================================================

import './styles/theme-vars.css';
import './styles/main.css';

import * as XLSX from 'xlsx';
import Chart from 'chart.js/auto';
import { registerChartDownloadPlugin, registerChartGlowPlugin } from './theme/chartDownloadPlugin.js';
registerChartDownloadPlugin(Chart);
registerChartGlowPlugin(Chart);
import { SEDE_PALETTE, colorForSedeIndex } from './theme/sedePalette.js';
// Import "?raw" de Vite: incrusta el TEXTO del archivo como string en tiempo de
// build (no una URL). Es lo que necesitamos para pegarlo dentro de un <script>
// del informe HTML exportado, que debe quedar 100% autocontenido/offline.
import chartJsRawSource from './vendor/chart.umd.min.js?raw';

import { MASTER_CATALOG } from './data/masterCatalog.js';
import { buildCatalogIndex } from './core/catalog.js';
import { createSedeContext, guessSedeName, processRowsForSede, countAdditionalProducts, generateReportForSede, validateAgainstTotalRow } from './sede/sedeContext.js';
import { computeAggregate } from './core/aggregate.js';
import { computeDashboardData } from './dashboard/dashboardData.js';
import { exportSedeToExcel, exportConsolidatedToExcel } from './export/excelExport.js';
import { TEMPLATES, getTemplate, toExcelPalette, DEFAULT_TEMPLATE_ID } from './theme/templates.js';
import { applyTemplateToDOM } from './theme/applyTheme.js';
import { DASHBOARD_STYLES, DEFAULT_DASHBOARD_STYLE_ID } from './theme/dashboardStyles.js';

import {
  createBalanceContext, processFileA as processBalanceFileA,
  applyClassificationOverrides, setManualOverride, pendingLabelsForReview, collectLabelsToSave,
  needsManualInvInicial, generateBalance
} from './balance/balanceContext.js';
import { BALANCE_BUCKETS, BALANCE_BUCKET_LABELS } from './core/tipoDoctoClassify.js';
import { parseLocaleNumber } from './core/localeNumber.js';
import { groupBlocksIntoSections } from './core/balanceFormulas.js';
import * as balanceApi from './balance/balanceApi.js';
import { exportBalanceToExcel } from './export/balanceExcelExport.js';
import { LOGO_BRANGUS_BASE64 } from './assets/logoBrangusBase64.js';
import { aggregateByPeriod } from './balance/balanceDashboardData.js';
import { buildBalanceReportHtml } from './export/balanceHtmlReportExport.js';

import { parseFinalMovimientosFile } from './core/parseFinalMovimientos.js';
import { BLOQUES_CANONICOS } from './core/movimientosBloques.js';
import { guessWeekFromText } from './core/weekDateGuess.js';
import * as movimientosApi from './movimientos/movimientosApi.js';
import { aggregateByPeriod as aggregateMovByPeriod } from './movimientos/movimientosDashboardData.js';

import { AUDIT_BLOCKS, AUDIT_TOTAL_ITEMS } from './data/auditChecklist.js';
import * as auditoriasApi from './auditorias/auditoriasApi.js';
import { aggregateByPeriod as aggregateAudByPeriod, combineBlockPct } from './auditorias/auditoriasDashboardData.js';
import { buildAuditoriasReportHtml } from './export/auditoriasHtmlReportExport.js';

import { parseVentasDiariasFile, guessSedeFromVentasRows, matchKnownSede } from './core/ventasFileParse.js';
import { parsePresupuestoFile } from './core/presupuestoFileParse.js';
import * as ventasApi from './ventas/ventasApi.js';
import { aggregateByPeriod as aggregateVentByPeriod, computeProjection } from './ventas/ventasDashboardData.js';

const catalogInfo = buildCatalogIndex(MASTER_CATALOG);

const app = { sedes: [], activeTab: 'detalle', templateId: DEFAULT_TEMPLATE_ID, dashStyleId: DEFAULT_DASHBOARD_STYLE_ID, flow: 'choice' };
let balanceCtx = null;
const balancePendingOverrides = new Map(); // label -> override parcial mientras el usuario completa balde+lado
const el = (id) => document.getElementById(id);

function fmt(v) { if (v == null || isNaN(v)) return '0'; const r = Math.round(v * 100) / 100; return Number.isInteger(r) ? String(r) : r.toFixed(2); }
function fmtPct(v) { return (Math.round(v * 1000) / 10).toFixed(1) + '%'; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function downloadBlob(buffer, filename, mime) {
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------------- Carga de archivos ----------------
function initDropzone() {
  const dz = el('dropzone'); const input = el('fileInput');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
  input.addEventListener('change', (e) => { if (e.target.files.length) handleFiles(e.target.files); });
}

function handleFiles(fileList) {
  el('errorBanner').classList.add('hidden-block');
  Array.from(fileList).forEach(file => {
    if (!/\.(xlsx|xls)$/i.test(file.name)) { showError(`"${file.name}" no es .xlsx ni .xls.`); return; }
    const ctx = createSedeContext(file.name, guessSedeName(file.name));
    app.sedes.push(ctx);
    renderSedeList();
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
        processRowsForSede(ctx, rows);
      } catch (err) { ctx.status = 'error'; ctx.errorMsg = 'No se pudo leer el archivo: ' + err.message; }
      renderSedeList(); updateGenerateButtonState();
    };
    reader.onerror = () => { ctx.status = 'error'; ctx.errorMsg = 'Error al leer el archivo.'; renderSedeList(); };
    reader.readAsArrayBuffer(file);
  });
}

function showError(msg) { const b = el('errorBanner'); b.classList.remove('hidden-block'); b.innerHTML += '<div>⚠ ' + escapeHtml(msg) + '</div>'; }
window.removeSede = function (id) {
  app.sedes = app.sedes.filter(s => s.id !== id);
  renderSedeList(); updateGenerateButtonState();
  el('reportCard').classList.add('hidden-block');
};

// ---------------- Lista de sedes + revisión de columnas ----------------
const openColumnPreviews = new Set(); // claves "sedeId:colIndex" con la vista previa abierta

function buildColumnPreviewHtml(ctx, mc) {
  // Lee el contenido CRUDO directo del archivo (ctx.rows), no el valor ya
  // convertido a número (ctx.products[].values) — si la columna trae texto,
  // fechas u otra cosa que no sea numérica, el valor "parseado" siempre da 0
  // y no deja ver qué hay realmente ahí para poder decidir si ignorarla.
  const headerInfo = ctx.headerInfo;
  const entries = [];
  for (let r = headerInfo.headerRowIndex + 1; r < ctx.rows.length; r++) {
    const row = ctx.rows[r] || [];
    const raw = row[mc.colIndex];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    entries.push({ code: row[headerInfo.codeCol], name: row[headerInfo.detCol], raw });
  }
  const numericVals = entries.map(e => (typeof e.raw === 'number') ? e.raw : parseFloat(String(e.raw).replace(/,/g, '')));
  const allNumeric = entries.length > 0 && numericVals.every(v => !isNaN(v));
  const summaryTail = allNumeric ? ` · Suma total: ${fmt(numericVals.reduce((a, v) => a + v, 0))}` : ' · Contenido no numérico (texto)';
  const shown = entries.slice(0, 25);
  const body = shown.map(e =>
    `<tr><td class="code">${escapeHtml(e.code == null ? '' : String(e.code))}</td><td>${escapeHtml(e.name == null ? '' : String(e.name))}</td><td style="text-align:right">${escapeHtml(String(e.raw))}</td></tr>`
  ).join('') || '<tr><td colspan="3" class="hint">Esta columna está vacía en todas las filas.</td></tr>';
  const moreNote = entries.length > shown.length
    ? `<p class="hint">Mostrando ${shown.length} de ${entries.length} fila(s) con contenido.</p>` : '';
  return `<div class="col-preview">
    <p class="hint">${entries.length} fila(s) tienen contenido en esta columna${summaryTail}</p>
    <table class="unrec-table"><thead><tr><th>Código</th><th>Producto</th><th style="text-align:right">Contenido</th></tr></thead><tbody>${body}</tbody></table>
    ${moreNote}
  </div>`;
}

window.toggleColumnPreview = function (sedeId, colIndex) {
  const key = sedeId + ':' + colIndex;
  if (openColumnPreviews.has(key)) openColumnPreviews.delete(key); else openColumnPreviews.add(key);
  renderSedeList();
};

function renderSedeList() {
  const card = el('sedeListCard');
  if (!app.sedes.length) { card.classList.add('hidden-block'); return; }
  card.classList.remove('hidden-block');
  const options = [['', '-- Selecciona --'], ['compra', 'Compra'], ['entrada', 'Entrada'], ['venta', 'Venta'], ['salida', 'Salida'], ['dev_compra', 'Devolución de Compra'], ['dev_venta', 'Devolución de Venta'], ['transformacion', 'Transformación'], ['ignore', 'Ignorar esta columna']];

  el('sedeListBody').innerHTML = app.sedes.map(ctx => {
    if (ctx.status === 'loading') return `<div class="sede-card"><div class="sede-head"><b>${escapeHtml(ctx.fileName)}</b><span class="badge">Cargando…</span></div></div>`;
    if (ctx.status === 'error') return `<div class="sede-card sede-error"><div class="sede-head"><b>${escapeHtml(ctx.fileName)}</b><span class="badge badge-err">Error</span><button class="btn-tiny" onclick="removeSede(${ctx.id})">Quitar</button></div><div class="banner error" style="margin-top:8px">${escapeHtml(ctx.errorMsg || '')}</div></div>`;

    const additionalCount = countAdditionalProducts(ctx, catalogInfo);
    const need = ctx.movementCols.filter(m => m.type === 'unrecognized' || m.uncertain);
    const statusBadge = ctx.status === 'needs_review' ? '<span class="badge badge-warn">Requiere revisión</span>' : '<span class="badge badge-ok">Listo</span>';
    let reviewHtml = '';
    if (need.length) {
      reviewHtml = `<table class="unrec-table"><thead><tr><th>Columna</th><th>Clasificación</th><th></th></tr></thead><tbody>` + need.map(mc => {
        const label = mc.header || '(sin encabezado)';
        const tag = mc.uncertain ? '<span class="badge">DEVOLUCIÓN ambigua</span>' : '<span class="badge badge-warn">No reconocida</span>';
        const opts = options.map(([v, l]) => `<option value="${v}" ${v === (mc.manualOverride || '') ? 'selected' : ''}>${l}</option>`).join('');
        const previewKey = ctx.id + ':' + mc.colIndex;
        const isOpen = openColumnPreviews.has(previewKey);
        const previewBtn = `<button type="button" class="btn-tiny" onclick="toggleColumnPreview(${ctx.id}, ${mc.colIndex})">${isOpen ? 'Ocultar' : '👁 Vista previa'}</button>`;
        const previewRow = isOpen ? `<tr><td colspan="3">${buildColumnPreviewHtml(ctx, mc)}</td></tr>` : '';
        return `<tr><td>${escapeHtml(label)} ${tag}</td><td><select data-sedeid="${ctx.id}" data-colindex="${mc.colIndex}" onchange="onOverrideChange(this)">${opts}</select></td><td>${previewBtn}</td></tr>${previewRow}`;
      }).join('') + '</tbody></table>';
    }
    return `<div class="sede-card"><div class="sede-head">
      <div class="field" style="max-width:260px;flex:none"><input type="text" value="${escapeHtml(ctx.sedeName)}" onchange="onSedeNameChange(${ctx.id}, this.value)"></div>
      <span class="badge">${escapeHtml(ctx.fileName)}</span><span class="badge">${ctx.products.length} producto(s)</span>
      <span class="badge">${additionalCount} fuera de catálogo</span>${statusBadge}
      <button class="btn-tiny" onclick="removeSede(${ctx.id})">Quitar</button></div>${reviewHtml}</div>`;
  }).join('');
}

window.onSedeNameChange = function (id, value) { const ctx = app.sedes.find(s => s.id === id); if (ctx) ctx.sedeName = value.trim() || ctx.fileName; };
window.onOverrideChange = function (sel) {
  const id = parseInt(sel.dataset.sedeid, 10); const colIndex = parseInt(sel.dataset.colindex, 10);
  const ctx = app.sedes.find(s => s.id === id); if (!ctx) return;
  const mc = ctx.movementCols.find(m => m.colIndex === colIndex); mc.manualOverride = sel.value || null;
  ctx.status = ctx.movementCols.some(m => m.type === 'unrecognized' && !m.manualOverride) ? 'needs_review' : 'ready';
  updateGenerateButtonState(); renderSedeList();
};
function updateGenerateButtonState() { el('genBtn').disabled = !(app.sedes.length && app.sedes.every(s => s.status === 'ready')); }

// ---------------- Generar informe ----------------
function generateReport() {
  const periodo = el('periodoInput').value.trim();
  app.sedes.forEach(ctx => { ctx.periodo = periodo; generateReportForSede(ctx, catalogInfo, MASTER_CATALOG); });
  renderDetalleTab(); renderDashboardTab();
  el('reportCard').classList.remove('hidden-block');
  el('downloadAllBtn').disabled = false;
  switchTab('detalle');
  el('reportCard').scrollIntoView({ behavior: 'smooth' });
}

function switchTab(tab) {
  app.activeTab = tab;
  el('tabDetalleBtn').classList.toggle('tab-active', tab === 'detalle');
  el('tabDashboardBtn').classList.toggle('tab-active', tab === 'dashboard');
  el('detalleView').classList.toggle('hidden-block', tab !== 'detalle');
  el('dashboardView').classList.toggle('hidden-block', tab !== 'dashboard');
}

function cellValue(col, item, totals, raw) {
  switch (col.kind) {
    case 'code': return item.code || ''; case 'text': return item.name || '';
    case 'invInicial': return fmt(totals.invInicial); case 'raw': return fmt(raw[col.colIndex] || 0);
    case 'totalCompras': return fmt(totals.totalCompras); case 'totalEntradas': return fmt(totals.totalEntradas);
    case 'totalVenta': return fmt(totals.totalVenta); case 'totalSalida': return fmt(totals.totalSalida);
    case 'teorico': return fmt(totals.teorico); case 'disponible': return fmt(totals.disponible);
    case 'invFinal': return fmt(totals.invFinal); case 'diferenciaKL': return fmt(totals.diferenciaKL);
    default: return '';
  }
}

function renderDetalleTab() {
  el('detalleView').innerHTML = app.sedes.map((ctx, sedeIdx) => {
    const plan = ctx.reportPlan; const cols = plan.cols;
    const thead = '<tr>' + cols.map(c => `<th class="${c.kind === 'text' || c.kind === 'code' ? 'left' : ''}">${escapeHtml(c.label)}</th>`).join('') + '</tr>';
    let bodyHtml = '';
    plan.sections.forEach((sec, secIdx) => {
      const uid = sedeIdx + '_' + secIdx;
      bodyHtml += `<tr class="cat-row" onclick="toggleCategory('${uid}')"><td colspan="${cols.length}"><span class="chev">▾</span>${escapeHtml(sec.category)} <span class="badge">${sec.itemsAgg.length} producto(s)</span></td></tr>`;
      sec.itemsAgg.forEach(entry => {
        const catDisp = sec.catAgg.totals.disponible;
        const pct = catDisp === 0 ? 0 : entry.totals.diferenciaKL / catDisp;
        bodyHtml += `<tr class="cat-body-${uid}${entry.item.merged ? ' merged-flag' : ''}">` + cols.map(c => {
          if (c.kind === 'pctDiferencia') return `<td>${fmtPct(pct)}</td>`;
          if (c.kind === 'diferenciaKL') { const v = entry.totals.diferenciaKL; const cls = Math.abs(v) < 0.01 ? 'diff-zero' : (v < 0 ? 'diff-neg' : ''); return `<td class="${cls}">${fmt(v)}</td>`; }
          const cls = c.kind === 'text' ? 'left' : (c.kind === 'code' ? 'left code' : '');
          return `<td class="${cls}">${escapeHtml(cellValue(c, entry.item, entry.totals, entry.raw))}</td>`;
        }).join('') + '</tr>';
      });
      const catDisp = sec.catAgg.totals.disponible; const pctCat = catDisp === 0 ? 0 : sec.catAgg.totals.diferenciaKL / catDisp;
      bodyHtml += '<tr class="subtotal-row">' + cols.map(c => {
        if (c.kind === 'pctDiferencia') return `<td>${fmtPct(pctCat)}</td>`;
        if (c.kind === 'text') return `<td class="left">${escapeHtml(sec.category)}</td>`;
        if (c.kind === 'code') return '<td></td>';
        if (c.kind === 'diferenciaKL') { const v = sec.catAgg.totals.diferenciaKL; const cls = Math.abs(v) < 0.01 ? 'diff-zero' : (v < 0 ? 'diff-neg' : ''); return `<td class="${cls}">${fmt(v)}</td>`; }
        return `<td>${escapeHtml(cellValue(c, {}, sec.catAgg.totals, sec.catAgg.raw))}</td>`;
      }).join('') + '</tr>';
    });

    const mismatches = validateAgainstTotalRow(ctx);
    let validationHtml = '';
    if (mismatches) {
      validationHtml = mismatches.length
        ? `<div class="banner warn"><b>La fila "TOTAL" del archivo no coincide en algunas columnas</b><ul>${mismatches.map(m => `<li>"${escapeHtml(m.header)}": archivo=${fmt(m.fileVal)}, calculado=${fmt(m.calc)}</li>`).join('')}</ul></div>`
        : `<div class="banner info">✓ La fila "TOTAL" del archivo coincide con las sumas calculadas.</div>`;
    }
    return `<div class="card"><div class="report-controls"><div><div class="report-title">${escapeHtml(ctx.sedeName)}</div><div class="report-sub">${escapeHtml(ctx.fileName)} ${ctx.periodo ? '· ' + escapeHtml(ctx.periodo) : ''}</div></div>
      <button class="btn-secondary" onclick="exportSede(${ctx.id})">⬇ Descargar Excel (esta sede)</button></div>
      ${validationHtml}<div class="table-scroll"><table class="report"><thead>${thead}</thead><tbody>${bodyHtml}</tbody></table></div></div>`;
  }).join('');
}

window.toggleCategory = function (uid) {
  const rows = document.querySelectorAll('.cat-body-' + uid); if (!rows.length) return;
  const nowHidden = !rows[0].classList.contains('hidden');
  rows.forEach(r => r.classList.toggle('hidden', nowHidden));
};

// ---------------- Plantilla visual ----------------
function initTemplateSelector() {
  const select = el('templateSelect');
  select.innerHTML = TEMPLATES.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  select.value = app.templateId;
  applyTemplateToDOM(getTemplate(app.templateId));
  select.addEventListener('change', () => {
    app.templateId = select.value;
    applyTemplateToDOM(getTemplate(app.templateId));
  });
}

// ---------------- Estilo del panel comparativo ----------------
function initDashboardStyleSelector() {
  const select = el('dashStyleSelect');
  select.innerHTML = DASHBOARD_STYLES.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  select.value = app.dashStyleId;
  el('dashboardView').dataset.dashStyle = app.dashStyleId;
  select.addEventListener('change', () => {
    app.dashStyleId = select.value;
    el('dashboardView').dataset.dashStyle = app.dashStyleId;
    if (window.__dashData) {
      renderSedeChart(window.__dashData);
      renderCategoryChart(window.__dashData, el('filterSede').value);
    }
  });
}

// ---------------- Exportaciones ----------------
window.exportSede = async function (id) {
  const ctx = app.sedes.find(s => s.id === id); if (!ctx?.reportPlan) return;
  const palette = toExcelPalette(getTemplate(app.templateId));
  const buf = await exportSedeToExcel(ctx, palette);
  downloadBlob(buf, `tabla_movimientos_${safeName(ctx.sedeName)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
};
async function exportAllExcel() {
  const palette = toExcelPalette(getTemplate(app.templateId));
  const buf = await exportConsolidatedToExcel(app.sedes, palette);
  downloadBlob(buf, 'tabla_movimientos_consolidado.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function safeName(name) { return (name || 'sede').replace(/[^a-z0-9áéíóúñ_\- ]/gi, '').trim().replace(/\s+/g, '_').slice(0, 25) || 'sede'; }

// ---------------- Dashboard ----------------
let chartSede, chartCat;
function renderDashboardTab() {
  const data = computeDashboardData(app.sedes);
  window.__dashData = data;
  el('kpiGrid').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Sedes analizadas</div><div class="kpi-value">${app.sedes.length}</div></div>
    <div class="kpi-card"><div class="kpi-label">Disponible total</div><div class="kpi-value">${fmt(data.totalDisponible)}</div></div>
    <div class="kpi-card ${data.totalDiferencia < 0 ? 'kpi-neg' : 'kpi-pos'}"><div class="kpi-label">Diferencia KL total</div><div class="kpi-value">${fmt(data.totalDiferencia)}</div></div>
    <div class="kpi-card ${data.totalDiferencia < 0 ? 'kpi-neg' : 'kpi-pos'}"><div class="kpi-label">% Diferencia global</div><div class="kpi-value">${data.totalDisponible === 0 ? '0.0%' : fmtPct(data.totalDiferencia / data.totalDisponible)}</div></div>
    <div class="kpi-card kpi-neg"><div class="kpi-label">Productos con faltante</div><div class="kpi-value">${data.totalProductosNeg}</div></div>`;
  el('filterSede').innerHTML = '<option value="">Todas las sedes</option>' + app.sedes.map(s => `<option>${escapeHtml(s.sedeName)}</option>`).join('');
  el('filterCategoria').innerHTML = '<option value="">Todas las categorías</option>' + Array.from(data.byCategory.keys()).map(c => `<option>${escapeHtml(c)}</option>`).join('');
  renderBlockGrid(data);
  renderSedeChart(data); renderCategoryChart(data); renderTopProductsTable(data, '', '');
}

// ---------------- Vista por bloque de categoría (con drill-down a producto) ----------------
let openBlock = null;
let blockGridClickBound = false;
function renderBlockGrid(data) {
  window.__dashData = data;
  const grid = el('blockGrid');
  const cards = Array.from(data.byCategory.entries()).map(([category, agg]) => {
    const pct = agg.disponible === 0 ? 0 : agg.diferenciaKL / agg.disponible;
    const cls = agg.diferenciaKL < -0.01 ? 'block-neg' : (Math.abs(agg.diferenciaKL) < 0.01 ? '' : 'block-pos');
    return `<div class="block-card ${cls}${openBlock === category ? ' block-open' : ''}" data-category="${escapeHtml(category)}">
      <div class="block-card-name">${escapeHtml(category)} <span class="chev">▾</span></div>
      <div class="block-card-row"><span>Disponible</span><b>${fmt(agg.disponible)}</b></div>
      <div class="block-card-row"><span>Diferencia KL</span><b class="diff">${fmt(agg.diferenciaKL)}</b></div>
      <div class="block-card-row"><span>% Diferencia</span><b class="diff">${fmtPct(pct)}</b></div>
    </div>${openBlock === category ? blockDetailHtml(data, category) : ''}`;
  });
  grid.innerHTML = cards.join('');
  if (!blockGridClickBound) {
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.block-card'); if (!card) return;
      const category = card.dataset.category;
      openBlock = openBlock === category ? null : category;
      renderBlockGrid(window.__dashData);
    });
    blockGridClickBound = true;
  }
}
function blockDetailHtml(data, category) {
  const rows = data.allProductRows.filter(r => r.category === category).slice().sort((a, b) => a.diferenciaKL - b.diferenciaKL);
  const body = rows.map(r => {
    const cls = r.diferenciaKL < -0.01 ? 'diff-neg' : (Math.abs(r.diferenciaKL) < 0.01 ? 'diff-zero' : '');
    return `<tr><td class="left">${escapeHtml(r.sede)}</td><td class="left code">${escapeHtml(r.code)}</td><td class="left">${escapeHtml(r.name)}</td><td>${fmt(r.disponible)}</td><td class="${cls}">${fmt(r.diferenciaKL)}</td><td>${fmtPct(r.pct)}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="left hint">Sin productos en este bloque.</td></tr>';
  return `<div class="block-detail"><table><thead><tr><th class="left">Sede</th><th class="left">Código</th><th class="left">Producto</th><th>Disponible</th><th>Diferencia KL</th><th>% Diferencia</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
window.onDashboardFilterChange = function () {
  const sede = el('filterSede').value, cat = el('filterCategoria').value;
  renderCategoryChart(window.__dashData, sede); renderTopProductsTable(window.__dashData, sede, cat);
};
function dashVar(name, scopeId) { return getComputedStyle(el(scopeId || 'dashboardView')).getPropertyValue(name).trim(); }
function chartColors(values, scopeId) {
  const neg = dashVar('--dv-neg', scopeId), pos = dashVar('--dv-pos', scopeId), chartPos = dashVar('--dv-chart-pos', scopeId);
  return values.map(v => v < -0.01 ? neg : (Math.abs(v) < 0.01 ? pos : chartPos));
}
// `tooltipFormatter(rawValue)` es opcional — sin ella, Chart.js muestra el
// número crudo al pasar el mouse (ej. "0.183" en vez de "18,3%"), que fue
// justo el reclamo del usuario en los gráficos de Margen %.
function dashboardChartOptions(title, scopeId, tooltipFormatter) {
  const text = dashVar('--dv-text', scopeId), textMuted = dashVar('--dv-text-muted', scopeId), grid = dashVar('--dv-divider-soft', scopeId);
  const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: title, color: text } },
    scales: { x: { ticks: { color: textMuted }, grid: { color: grid } }, y: { ticks: { color: textMuted }, grid: { color: grid } } } };
  if (tooltipFormatter) {
    opts.plugins.tooltip = { callbacks: { label: (ctx) => {
      const v = ctx.parsed.y != null ? ctx.parsed.y : ctx.parsed.x;
      const prefix = ctx.dataset.label && ctx.chart.data.datasets.length > 1 ? ctx.dataset.label + ': ' : '';
      return prefix + tooltipFormatter(v);
    } } };
  }
  return opts;
}
function renderSedeChart(data) {
  if (chartSede) chartSede.destroy();
  const labels = data.bySede.map(s => s.sedeName), values = data.bySede.map(s => s.totals.diferenciaKL);
  chartSede = new Chart(el('chartSede').getContext('2d'), { type: 'bar', data: { labels, datasets: [{ data: values, backgroundColor: chartColors(values), borderRadius: 6 }] }, options: dashboardChartOptions('Diferencia KL por sede') });
}
function renderCategoryChart(data, sedeFilter) {
  if (chartCat) chartCat.destroy();
  let byCat;
  if (sedeFilter) {
    byCat = new Map();
    app.sedes.filter(s => s.sedeName === sedeFilter && s.reportPlan).forEach(ctx => ctx.reportPlan.sections.forEach(sec => {
      if (!byCat.has(sec.category)) byCat.set(sec.category, { diferenciaKL: 0 });
      byCat.get(sec.category).diferenciaKL += sec.catAgg.totals.diferenciaKL;
    }));
  } else byCat = data.byCategory;
  const labels = Array.from(byCat.keys()), values = labels.map(l => byCat.get(l).diferenciaKL);
  chartCat = new Chart(el('chartCategoria').getContext('2d'), { type: 'bar', data: { labels, datasets: [{ data: values, backgroundColor: chartColors(values), borderRadius: 6 }] }, options: Object.assign(dashboardChartOptions('Diferencia KL por categoría' + (sedeFilter ? ' — ' + sedeFilter : '')), { indexAxis: 'y' }) });
}
function renderTopProductsTable(data, sedeFilter, catFilter) {
  let rows = data.allProductRows;
  if (sedeFilter) rows = rows.filter(r => r.sede === sedeFilter);
  if (catFilter) rows = rows.filter(r => r.category === catFilter);
  rows = rows.slice().sort((a, b) => a.diferenciaKL - b.diferenciaKL).slice(0, 15);
  el('topProductsBody').innerHTML = rows.map(r => {
    const cls = r.diferenciaKL < -0.01 ? 'diff-neg' : (Math.abs(r.diferenciaKL) < 0.01 ? 'diff-zero' : '');
    return `<tr><td class="left">${escapeHtml(r.sede)}</td><td class="left">${escapeHtml(r.category)}</td><td class="left code">${escapeHtml(r.code)}</td><td class="left">${escapeHtml(r.name)}</td><td>${fmt(r.disponible)}</td><td class="${cls}">${fmt(r.diferenciaKL)}</td><td>${fmtPct(r.pct)}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="left hint">Sin datos.</td></tr>';
}

// ---------------- Elección inicial: Balance vs Tabla de Movimientos ----------------
// A dónde volver al salir del flujo de carga de Balance: 'choice' (menú
// principal, entrada normal) o 'reportes' (se abrió desde el botón "⬆ Cargar
// Balance" dentro de Reportes, así que el back debe regresar ahí en vez del
// menú principal).
let balanceReturnTo = 'choice';
function switchFlow(flow) {
  app.flow = flow;
  el('modeChoiceCard').classList.toggle('hidden-block', flow !== 'choice');
  el('movimientosFlow').classList.toggle('hidden-block', flow !== 'movimientos');
  el('balanceFlow').classList.toggle('hidden-block', flow !== 'balance');
  el('reportesFlow').classList.toggle('hidden-block', flow !== 'reportes');
  el('auditoriasFlow').classList.toggle('hidden-block', flow !== 'auditorias');
  el('ventasFlow').classList.toggle('hidden-block', flow !== 'ventas');
  if (flow === 'reportes' && !reportesWeeks) loadReportesData();
  if (flow === 'auditorias' && !auditBlocksRendered) { renderAuditBlocks(); auditBlocksRendered = true; }
}

// ---------------- Balance semanal ----------------
function sheetsFromWorkbook(wb) {
  return wb.SheetNames.map((sheetName, sheetIndex) => ({
    sheetIndex, sheetName,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: true })
  }));
}

function ensureBalanceCtx() {
  if (!balanceCtx) balanceCtx = createBalanceContext(el('balanceSedeInput').value.trim() || 'Sede');
  return balanceCtx;
}

function showBalanceError(msg) {
  const b = el('balanceErrorBanner');
  b.classList.remove('hidden-block');
  b.innerHTML = '⚠ ' + escapeHtml(msg);
}

async function applySavedClassification(ctx) {
  try {
    const data = await balanceApi.getClassification(ctx.sedeName);
    applyClassificationOverrides(ctx, data.labels || {});
  } catch (err) {
    // Sin conexión a la API: se sigue solo con la heurística automática de clasificación.
  }
}

function initBalanceDropzones() {
  wireBalanceDropzone('balanceDropzoneA', 'balanceFileAInput', handleBalanceFileA);
}

function wireBalanceDropzone(dzId, inputId, onFile) {
  const dz = el(dzId); const input = el(inputId);
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files.length) onFile(e.dataTransfer.files[0]); });
  input.addEventListener('change', (e) => { if (e.target.files.length) onFile(e.target.files[0]); });
}

// Igual que wireBalanceDropzone, pero pasa TODOS los archivos soltados/elegidos
// a la vez (uno por sede) — usado por las zonas de carga de Ventas Diarias.
function wireMultiFileDropzone(dzId, inputId, onFiles) {
  const dz = el(dzId); const input = el(inputId);
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files)); });
  input.addEventListener('change', (e) => { if (e.target.files.length) onFiles(Array.from(e.target.files)); });
}

function handleBalanceFileA(file) {
  if (!/\.(xlsx|xls)$/i.test(file.name)) { showBalanceError(`"${file.name}" no es .xlsx ni .xls.`); return; }
  const ctx = ensureBalanceCtx();
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      processBalanceFileA(ctx, sheetsFromWorkbook(wb), file.name);
      if (ctx.status !== 'error') await applySavedClassification(ctx);
    } catch (err) { ctx.status = 'error'; ctx.errorMsg = 'No se pudo leer el archivo: ' + err.message; }
    await refreshInvInicialState();
    renderBalanceFlow();
  };
  reader.readAsArrayBuffer(file);
}

// Determina si esta sede ya tiene una semana guardada anterior a `weekStart`
// (para encadenar el Inventario Inicial) o si es la primera vez que se
// registra (y por lo tanto necesita que el usuario lo escriba a mano).
async function resolvePrevWeekInvFinal(sedeName, weekStart) {
  try {
    const { weeks } = await balanceApi.getWeeks(sedeName);
    const prior = (weeks || [])
      .filter(w => !weekStart || w.week_key < weekStart)
      .sort((a, b) => (a.week_key < b.week_key ? 1 : -1))[0];
    return prior ? prior.computed.invFinal : undefined;
  } catch (err) {
    return undefined;
  }
}

async function refreshInvInicialState() {
  const card = el('balanceInvInicialCard');
  if (!balanceCtx) { card.classList.add('hidden-block'); return; }
  const sedeName = el('balanceSedeInput').value.trim();
  if (!sedeName) { card.classList.add('hidden-block'); updateBalanceGenerateButtonState(); return; }
  balanceCtx.prevWeekInvFinal = await resolvePrevWeekInvFinal(sedeName, el('balanceWeekStartInput').value);
  card.classList.toggle('hidden-block', !needsManualInvInicial(balanceCtx));
  updateBalanceGenerateButtonState();
}

function renderBalanceFlow() {
  if (!balanceCtx) return;
  el('balanceFileAName').textContent = balanceCtx.fileAName ? '✓ ' + balanceCtx.fileAName : '';
  if (balanceCtx.status === 'error') showBalanceError(balanceCtx.errorMsg);
  renderBalanceReview();
  updateBalanceGenerateButtonState();
}

function renderBalanceReview() {
  const card = el('balanceReviewCard');
  if (!balanceCtx || !balanceCtx.classifiedBlocks.length) { card.classList.add('hidden-block'); return; }
  const pending = pendingLabelsForReview(balanceCtx);
  if (!pending.length) { card.classList.add('hidden-block'); return; }
  card.classList.remove('hidden-block');
  el('balanceReviewBody').innerHTML = pending.map(b => {
    const partial = balancePendingOverrides.get(b.label) || {};
    const bucketOpts = BALANCE_BUCKETS.map(k => `<option value="${k}" ${partial.bucket === k ? 'selected' : ''}>${escapeHtml(BALANCE_BUCKET_LABELS[k])}</option>`).join('');
    return `<div class="balance-review-row">
      <span class="balance-review-label">${escapeHtml(b.label)}</span>
      <select data-label="${escapeHtml(b.label)}" data-field="bucket" onchange="onBalanceOverrideChange(this)">
        <option value="">-- Balde --</option>${bucketOpts}
      </select>
      <select data-label="${escapeHtml(b.label)}" data-field="side" onchange="onBalanceOverrideChange(this)">
        <option value="">-- Lado --</option>
        <option value="compra" ${partial.side === 'compra' ? 'selected' : ''}>Compra / Entrada</option>
        <option value="venta" ${partial.side === 'venta' ? 'selected' : ''}>Venta / Salida</option>
      </select>
      <label style="font-size:12px;color:#666"><input type="checkbox" data-label="${escapeHtml(b.label)}" data-field="isDevolucion" ${partial.isDevolucion ? 'checked' : ''} onchange="onBalanceOverrideChange(this)"> Es devolución</label>
    </div>`;
  }).join('');
}

window.onBalanceOverrideChange = function (elm) {
  const label = elm.dataset.label;
  const partial = balancePendingOverrides.get(label) || {};
  if (elm.dataset.field === 'isDevolucion') partial.isDevolucion = elm.checked;
  else partial[elm.dataset.field] = elm.value;
  balancePendingOverrides.set(label, partial);
  if (partial.bucket && partial.side) {
    setManualOverride(balanceCtx, label, partial);
    balancePendingOverrides.delete(label);
  }
  renderBalanceReview();
  updateBalanceGenerateButtonState();
};

function updateBalanceGenerateButtonState() {
  const sedeOk = el('balanceSedeInput').value.trim().length > 0;
  const weekOk = !!(el('balanceWeekStartInput').value && el('balanceWeekEndInput').value);
  const invNeeded = !!(balanceCtx && needsManualInvInicial(balanceCtx));
  const invOk = !invNeeded || el('balanceInvInicialInput').value.trim() !== '';
  const fileOk = !!(balanceCtx && balanceCtx.status === 'ready');

  const missing = [];
  if (!balanceCtx || !fileOk) missing.push('cargar el archivo (y resolver la revisión de clasificación, si aplica)');
  if (!sedeOk) missing.push('el nombre de la sede');
  if (!weekOk) missing.push('las fechas de la semana');
  if (invNeeded && !invOk) missing.push('el Inventario Inicial (sede nueva)');
  el('balanceGenHint').textContent = missing.length ? 'Falta: ' + missing.join(', ') + '.' : 'Todo listo — puedes calcular el balance.';

  el('balanceGenBtn').disabled = !(fileOk && sedeOk && weekOk && invOk);
}

async function generateBalanceReport() {
  if (!balanceCtx) return;
  balanceCtx.sedeName = el('balanceSedeInput').value.trim() || balanceCtx.sedeName;
  balanceCtx.weekStart = el('balanceWeekStartInput').value;
  balanceCtx.weekEnd = el('balanceWeekEndInput').value;

  try { await balanceApi.saveClassification(balanceCtx.sedeName, collectLabelsToSave(balanceCtx)); }
  catch (err) { /* no bloquea el cálculo si la API todavía no responde */ }

  balanceCtx.prevWeekInvFinal = await resolvePrevWeekInvFinal(balanceCtx.sedeName, balanceCtx.weekStart);
  if (needsManualInvInicial(balanceCtx)) {
    balanceCtx.manualInvInicial = parseLocaleNumber(el('balanceInvInicialInput').value);
  }

  generateBalance(balanceCtx);
  renderBalanceResults();
  el('balanceResultsCard').classList.remove('hidden-block');
  el('balanceSaveBanner').classList.add('hidden-block');
  el('balanceResultsCard').scrollIntoView({ behavior: 'smooth' });
}

function fmtCOP(v) {
  if (v == null || isNaN(v)) return '$0';
  return '$' + Math.round(v).toLocaleString('es-CO');
}

function renderBalanceResults() {
  const b = balanceCtx.balance;
  const heroCls = b.utilidadBruta < 0 ? 'balance-neg' : (b.utilidadBruta > 0 ? 'balance-pos' : '');
  const warnings = balanceCtx.fileAWarnings;
  const invNote = b.invInicialFromChain
    ? 'Inventario Inicial tomado del historial de la semana anterior (encadenado automático).'
    : 'Inventario Inicial: valor escrito a mano (primera semana registrada para esta sede).';

  el('balanceResultsView').innerHTML = `
    <div class="balance-hero ${heroCls}">
      <div class="balance-hero-main">
        <div class="balance-hero-label">Margen</div>
        <div class="balance-hero-value">${fmtPct(b.margenPct)}</div>
      </div>
      <div class="balance-hero-sep"></div>
      <div class="balance-hero-secondary">
        <div class="balance-hero-label">Utilidad Bruta</div>
        <div class="balance-hero-value">${fmtCOP(b.utilidadBruta)}</div>
      </div>
    </div>
    <div class="balance-kpi-grid">
      <div class="balance-kpi"><div class="kpi-label">Total Ventas</div><div class="kpi-value">${fmtCOP(b.totalVentas)}</div></div>
      <div class="balance-kpi"><div class="kpi-label">Total Compras</div><div class="kpi-value">${fmtCOP(b.totalCompras)}</div></div>
      <div class="balance-kpi"><div class="kpi-label">Inventario Inicial</div><div class="kpi-value">${fmtCOP(b.invInicial)}</div></div>
      <div class="balance-kpi"><div class="kpi-label">Inventario Final</div><div class="kpi-value">${fmtCOP(b.invFinal)}</div></div>
      <div class="balance-kpi"><div class="kpi-label">CMV</div><div class="kpi-value">${fmtCOP(b.cmv)}</div></div>
    </div>
    <p class="hint">${escapeHtml(invNote)}</p>
    ${warnings.length ? `<div class="banner warn"><b>Avisos</b><ul>${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>` : ''}
    ${renderBalanceSourcePreview(balanceCtx)}
  `;
}

// Vista previa (solo lectura) de la pestaña "Datos" del Excel exportado — para
// que el usuario revise, antes de descargar, de dónde sale cada valor del
// balance. Misma organización que la hoja exportada (ver groupBlocksIntoSections):
// cada balde junta primero su(s) base(s) y luego sus devoluciones, y muestra
// un solo "NETO" resaltado en amarillo (base menos devolución) — el ajuste
// real (si hace falta) se hace después, en Excel.
function renderBalanceBlockRows(block, uid, highlightSubtotal) {
  const itemRows = block.items.length
    ? block.items.map(it => `<tr class="cat-body-${uid}">
        <td class="left">${escapeHtml(it.producto)}</td>
        <td>${fmt(it.cantidad || 0)}</td>
        <td>${fmtCOP(it.valor || 0)}</td>
        <td>${fmtCOP(it.impuesto || 0)}</td>
        <td>${fmtCOP(it.neto || 0)}</td>
      </tr>`).join('')
    : '';
  const subtotalLabel = block.isDevolucion ? 'Subtotal (devolución)' : 'Subtotal';
  const subtotalCls = highlightSubtotal ? 'balance-used-cell' : '';
  return `<tr class="cat-row" onclick="toggleBalanceGroup('${uid}')"><td colspan="5"><span class="chev">▾</span>${escapeHtml(block.label)} <span class="badge">${block.items.length} producto(s)</span></td></tr>
    ${itemRows}
    <tr class="subtotal-row cat-body-${uid}">
      <td class="left">${subtotalLabel}</td><td></td>
      <td class="${subtotalCls}">${fmtCOP(block.valor)}</td>
      <td colspan="2"></td>
    </tr>`;
}

function renderBalanceSourcePreview(ctx) {
  const { sections, otros } = groupBlocksIntoSections(ctx.classifiedBlocks);

  const sectionsHtml = sections.map((section, si) => {
    const blocksHtml = section.members.map((block, bi) =>
      renderBalanceBlockRows(block, `bal${ctx.id}_${si}_${bi}`, !section.isNetted)).join('');
    const netoRow = section.isNetted ? `<tr class="subtotal-row">
      <td class="left">NETO</td><td></td>
      <td class="balance-used-cell">${fmtCOP(section.net)}</td>
      <td colspan="2"></td>
    </tr>` : '';
    return `<tr class="cat-row"><td colspan="5"><b>${escapeHtml(section.title)}</b></td></tr>${blocksHtml}${netoRow}`;
  }).join('');

  const otrosHtml = otros.length
    ? `<tr class="cat-row"><td colspan="5"><b>OTROS (inventario, transformaciones, no clasificados)</b></td></tr>` +
      otros.map((block, i) => renderBalanceBlockRows(block, `balOtros${ctx.id}_${i}`, block.type === 'inv_final' || block.type === 'inv_inicial')).join('')
    : '';

  return `
    <div class="balance-block-title">Datos usados para el balance</div>
    <p class="hint">Así queda la segunda pestaña del Excel descargado: cada balde junta su compra/venta con su devolución y resalta en amarillo el NETO que alimenta el balance. Si necesitas corregir algo, ábrelo en Excel y edítalo ahí: la primera pestaña se recalcula sola.</p>
    <div class="table-scroll" style="max-height:50vh">
      <table class="report">
        <thead><tr><th class="left">Producto</th><th>Cantidad</th><th>Valor</th><th>Impuesto</th><th>Neto</th></tr></thead>
        <tbody>${sectionsHtml}${otrosHtml}</tbody>
      </table>
    </div>`;
}

window.toggleBalanceGroup = function (uid) {
  const rows = document.querySelectorAll('.cat-body-' + uid); if (!rows.length) return;
  const nowHidden = !rows[0].classList.contains('hidden');
  rows.forEach(r => r.classList.toggle('hidden', nowHidden));
};

async function saveBalanceWeek() {
  if (!balanceCtx || !balanceCtx.balance) return;
  const banner = el('balanceSaveBanner');
  try {
    await balanceApi.saveWeek({
      sedeName: balanceCtx.sedeName,
      weekKey: balanceCtx.weekStart,
      weekStart: balanceCtx.weekStart,
      weekEnd: balanceCtx.weekEnd,
      inputs: { blocks: balanceCtx.classifiedBlocks.map(b => ({ label: b.label, valor: b.valor, bucket: b.bucket, side: b.side, isDevolucion: !!b.isDevolucion })) },
      computed: balanceCtx.balance
    });
    banner.className = 'banner info';
    banner.textContent = '✓ Semana guardada en el historial.';
    reportesWeeks = null; // fuerza recarga la próxima vez que se entre a Reportes
  } catch (err) {
    banner.className = 'banner error';
    banner.textContent = '⚠ No se pudo guardar: ' + err.message;
  }
  banner.classList.remove('hidden-block');
}

async function exportBalanceExcel() {
  if (!balanceCtx || !balanceCtx.balance) return;
  const buf = await exportBalanceToExcel(balanceCtx);
  downloadBlob(buf, `balance_${safeName(balanceCtx.sedeName)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

async function downloadBalanceReport() {
  const banner = el('balanceSaveBanner');
  try {
    const [{ weeks }, diasResult, presResult, movResult] = await Promise.all([
      balanceApi.getAllWeeks(),
      ventasApi.getAllDias().catch(() => ({ dias: [] })),
      ventasApi.getPresupuestos().catch(() => ({ presupuestos: [] })),
      movimientosApi.getAllWeeks().catch(() => ({ weeks: [] }))
    ]);
    const html = buildBalanceReportHtml(weeks, diasResult.dias || [], presResult.presupuestos || [], movResult.weeks || [], chartJsRawSource, {});
    downloadBlob(html, 'balance_comparativo.html', 'text/html');
  } catch (err) {
    banner.className = 'banner error';
    banner.textContent = '⚠ No se pudo generar el informe comparativo: ' + err.message + ' (necesita conexión con el historial guardado).';
    banner.classList.remove('hidden-block');
  }
}

// ---------------- Reportes ----------------
let reportesWeeks = null; // filas crudas de balance_weeks (todas las sedes), cargadas una vez por visita
let chartReportesMargen, chartReportesUtilidad, chartReportesPresupuesto;
let reportesSelectedPeriods = null; // Set<periodKey> | null (null = todos los periodos disponibles)
// Sub-vista activa del dashboard unificado: 'tiempo' | 'sedes' | 'ranking' | 'presupuesto'.
// "presupuesto" ignora el selector de métrica/granularidad (siempre es venta
// real del mes en curso contra la meta) — las otras 3 sí dependen de ellos.
let reportesSubView = 'tiempo';

async function loadReportesData() {
  el('reportesView').classList.add('hidden-block');
  el('reportesErrorBanner').classList.add('hidden-block');
  el('reportesLoadingHint').classList.remove('hidden-block');
  el('reportesLoadingHint').textContent = 'Cargando historial…';
  try {
    const { weeks, fromCache } = await balanceApi.getAllWeeks();
    reportesWeeks = weeks || [];
    if (!reportesWeeks.length) {
      el('reportesLoadingHint').textContent = 'Todavía no hay semanas guardadas en el historial.';
      return;
    }
    el('reportesLoadingHint').classList.toggle('hidden-block', !fromCache);
    if (fromCache) el('reportesLoadingHint').textContent = 'Mostrando el último historial disponible en este equipo (sin conexión con el servidor ahora mismo).';
    el('reportesView').classList.remove('hidden-block');
    el('reportesDownloadBtn').disabled = false;
    renderReportes();
  } catch (err) {
    el('reportesLoadingHint').classList.add('hidden-block');
    const b = el('reportesErrorBanner');
    b.classList.remove('hidden-block');
    b.innerHTML = '⚠ No se pudo cargar el historial: ' + escapeHtml(err.message);
    return;
  }

  // Ventas (ventas_dias) para el selector de métrica unificado — no bloquea
  // el render de Balance de arriba (es complementaria acá), pero se vuelve a
  // renderizar cuando llega para que la métrica "Ventas" quede disponible.
  if (!ventasAllDias) {
    try {
      const [diasResult, presResult] = await Promise.all([ventasApi.getAllDias(), ventasApi.getPresupuestos()]);
      ventasAllDias = diasResult.dias || [];
      ventasPresupuestos = presResult.presupuestos || [];
      renderReportes();
    } catch { /* silencioso: sin datos de ventas disponibles, el dashboard de Balance sigue funcionando igual */ }
  }

  // Tabla de Movimientos (mermas) para la sub-vista "📋 Mermas" — mismo
  // patrón silencioso que Ventas arriba: no bloquea el resto del dashboard.
  if (!movHistWeeks) {
    try {
      const { weeks } = await movimientosApi.getAllWeeks();
      movHistWeeks = weeks || [];
      renderReportes();
    } catch { /* silencioso: sin datos de mermas disponibles, el dashboard sigue funcionando igual */ }
  }
}

// Métricas disponibles en el dashboard unificado de Reportes > Balance: las
// dos que ya calculaba Balance (margen/utilidad, desde balance_weeks) más
// "venta" — a pedido explícito del usuario, esta NO sale del totalVentas de
// Balance (derivado del archivo de Movimiento), sino de la venta real
// guardada en ventas_dias (módulo Ventas) — mismo histórico que alimenta la
// pestaña Reportes > Presupuesto.
const REPORTES_METRIC_LABELS = { margenPct: 'Margen %', utilidadBruta: 'Utilidad Bruta', venta: 'Ventas' };

function renderReportes() {
  if (!reportesWeeks) return;
  const granularity = el('reportesGranularity').value;
  const metric = el('reportesMetrica').value;
  const data = aggregateByPeriod(reportesWeeks, granularity);
  window.__reportesData = data;

  const sedeSel = el('reportesSedeFilter');
  const prevSede = sedeSel.value;
  const allSedeNames = Array.from(new Set([...data.sedeNames, ...((ventasAllDias || []).map(d => d.sede_name)), ...((movHistWeeks || []).map(w => w.sede_name))])).sort();
  sedeSel.innerHTML = '<option value="">Todas las sedes</option>' + allSedeNames.map(s => `<option>${escapeHtml(s)}</option>`).join('');
  if (allSedeNames.includes(prevSede)) sedeSel.value = prevSede;
  const sedeFilter = sedeSel.value;

  // Venta real (ventas_dias), mismo alcance de sede/granularidad. "Ventas"
  // usa su PROPIO calendario (llega al día, a diferencia de Balance que solo
  // tiene semanas ya cerradas) — por eso el listado de periodos a comparar
  // sale de ventaData cuando metric==='venta', y de data en cualquier otro caso.
  const ventaRows = sedeFilter ? (ventasAllDias || []).filter(d => d.sede_name === sedeFilter) : (ventasAllDias || []);
  const ventaData = aggregateVentByPeriod(ventaRows, granularity);

  const allPeriodKeys = metric === 'venta' ? ventaData.periodKeysSorted : data.periodKeysSorted;
  const periodLabelOf = (k) => metric === 'venta'
    ? ((ventaData.byPeriod.get(k) || [])[0]?.periodLabel || k)
    : ((data.byPeriod.get(k) || [])[0]?.periodLabel || k);
  renderReportesPeriodChips(allPeriodKeys, periodLabelOf, granularity);
  const selectedSet = reportesSelectedPeriods || new Set(allPeriodKeys);
  const periodKeysInScope = allPeriodKeys.filter(k => selectedSet.has(k));

  const GRAN_LABEL = { week: 'semana', month: 'mes', year: 'año' };
  const lastPeriod = periodKeysInScope[periodKeysInScope.length - 1];
  const lastIdxFull = allPeriodKeys.indexOf(lastPeriod);
  const prevPeriod = lastIdxFull > 0 ? allPeriodKeys[lastIdxFull - 1] : null;

  const allPoints = Array.from(data.bySede.values()).flat().filter(p => !sedeFilter || p.sedeName === sedeFilter);
  const lastPoints = allPoints.filter(p => p.periodKey === lastPeriod);
  const lastVentasBalance = lastPoints.reduce((a, p) => a + p.totalVentas, 0);
  const lastUtilidad = lastPoints.reduce((a, p) => a + p.utilidadBruta, 0);
  const lastMargen = lastVentasBalance === 0 ? 0 : lastUtilidad / lastVentasBalance;
  const scopeUtilidad = allPoints.filter(p => periodKeysInScope.includes(p.periodKey)).reduce((a, p) => a + p.utilidadBruta, 0);

  const ventaLastPoints = Array.from(ventaData.bySede.values()).flat().filter(p => p.periodKey === lastPeriod);
  const ventaPrevPoints = prevPeriod ? Array.from(ventaData.bySede.values()).flat().filter(p => p.periodKey === prevPeriod) : [];
  const ventaLastValue = ventaLastPoints.reduce((a, p) => a + p.valorVenta, 0);
  const ventaPrevValue = ventaPrevPoints.reduce((a, p) => a + p.valorVenta, 0);
  const ventaCrecimiento = ventaPrevValue > 0 ? (ventaLastValue - ventaPrevValue) / ventaPrevValue : null;

  if (metric === 'venta') {
    el('reportesKpiGrid').innerHTML = `
      <div class="kpi-card"><div class="kpi-label">Sedes con historial</div><div class="kpi-value">${allSedeNames.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Días de venta guardados</div><div class="kpi-value">${(ventasAllDias || []).length}</div></div>
      <div class="kpi-card kpi-pos"><div class="kpi-label">Ventas — último ${GRAN_LABEL[granularity]}</div><div class="kpi-value">${fmtCOP(ventaLastValue)}</div></div>
      <div class="kpi-card ${ventaCrecimiento == null ? '' : (ventaCrecimiento < 0 ? 'kpi-neg' : 'kpi-pos')}"><div class="kpi-label">Crecimiento vs. anterior</div><div class="kpi-value">${ventaCrecimiento == null ? 'n/d' : fmtPct(ventaCrecimiento)}</div></div>
      <div class="kpi-card ${lastMargen < 0 ? 'kpi-neg' : 'kpi-pos'}"><div class="kpi-label">Margen (Balance) — mismo periodo</div><div class="kpi-value">${fmtPct(lastMargen)}</div></div>`;
  } else {
    el('reportesKpiGrid').innerHTML = `
      <div class="kpi-card"><div class="kpi-label">Sedes con historial</div><div class="kpi-value">${allSedeNames.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Semanas guardadas</div><div class="kpi-value">${reportesWeeks.length}</div></div>
      <div class="kpi-card ${lastMargen < 0 ? 'kpi-neg' : 'kpi-pos'}"><div class="kpi-label">Margen — último ${GRAN_LABEL[granularity]}</div><div class="kpi-value">${fmtPct(lastMargen)}</div></div>
      <div class="kpi-card ${lastUtilidad < 0 ? 'kpi-neg' : 'kpi-pos'}"><div class="kpi-label">Utilidad — último ${GRAN_LABEL[granularity]}</div><div class="kpi-value">${fmtCOP(lastUtilidad)}</div></div>
      <div class="kpi-card ${scopeUtilidad < 0 ? 'kpi-neg' : 'kpi-pos'}"><div class="kpi-label">Utilidad acumulada (periodos seleccionados)</div><div class="kpi-value">${fmtCOP(scopeUtilidad)}</div></div>`;
  }

  el('reportesDetalleWrap').classList.toggle('hidden-block', reportesSubView === 'presupuesto' || reportesSubView === 'mermas');
  if (reportesSubView === 'presupuesto') {
    renderReportesPresupuestoView(sedeFilter);
  } else if (reportesSubView === 'mermas') {
    renderReportesMermasView(sedeFilter, granularity);
  } else if (reportesSubView === 'sedes') {
    renderReportesSedesChart(metric, data, ventaData, sedeFilter, periodKeysInScope, periodLabelOf);
  } else {
    renderReportesTiempoChart(metric, data, ventaData, sedeFilter, periodKeysInScope, granularity, periodLabelOf);
  }
  if (reportesSubView !== 'presupuesto' && reportesSubView !== 'mermas') renderReportesTable(metric, data, ventaData, sedeFilter, periodKeysInScope);
}

// Sub-pestañas DENTRO de "📋 Mermas" (a pedido del usuario, para no mostrar
// los 3 gráficos + tabla apilados a la vez): tiempo / sedes / bloques
// (bloques incluye también el drilldown de productos y "Detalle por
// periodo"). Los 3 gráficos se siguen creando siempre en cada render — solo
// se oculta/muestra el contenedor — igual que ya hace switchReportesSubView
// con las sub-vistas de arriba.
let mermasSubView = 'tiempo';
function switchMermasSubView(view) {
  mermasSubView = view;
  document.querySelectorAll('#reportesMermasSubTabs .tab-btn').forEach(btn => btn.classList.toggle('tab-active', btn.dataset.mermasSubview === view));
  el('reportesMermasTiempoView').classList.toggle('hidden-block', view !== 'tiempo');
  el('reportesMermasSedesView').classList.toggle('hidden-block', view !== 'sedes');
  el('reportesMermasBloquesView').classList.toggle('hidden-block', view !== 'bloques');
  // Los 3 gráficos se crean siempre, aunque su panel esté oculto — un
  // gráfico creado con el canvas en display:none queda con tamaño 0 y no se
  // corrige solo al mostrarse después (Chart.js no vuelve a medir el
  // contenedor por su cuenta en ese caso). Se fuerza resize() del que
  // corresponde al panel recién visible para que aparezca bien.
  if (view === 'tiempo' && chartMovDiferencia) chartMovDiferencia.resize();
  if (view === 'sedes' && chartMovSedes) chartMovSedes.resize();
  if (view === 'bloques' && chartMovBloques) chartMovBloques.resize();
}

function switchReportesSubView(view) {
  reportesSubView = view;
  document.querySelectorAll('#reportesSubViewTabs .tab-btn').forEach(btn => btn.classList.toggle('tab-active', btn.dataset.subview === view));
  el('reportesTiempoView').classList.toggle('hidden-block', view !== 'tiempo');
  el('reportesSedesView').classList.toggle('hidden-block', view !== 'sedes');
  el('reportesPresupuestoView').classList.toggle('hidden-block', view !== 'presupuesto');
  el('reportesMermasView').classList.toggle('hidden-block', view !== 'mermas');
  if (reportesWeeks) renderReportes();
}

// Chips para elegir QUÉ periodos entran en la comparación (por defecto,
// todos). A pedido explícito del usuario: en "Mensual" debe poder elegir
// solo algunos meses; al dejar una sola semana seleccionada, el gráfico de
// tiempo hace drill-down a los días de esa semana (ver renderReportesCharts).
// Botón "📅 Fechas" con panel desplegable: casillas + "seleccionar todos" /
// "deseleccionar todos" — reemplaza la fila de chips (con muchas semanas se
// volvía una tira horizontal incómoda de recorrer).
function renderReportesPeriodChips(periodKeys, periodLabelOf, granularity) {
  const list = el('reportesPeriodList');
  list.innerHTML = periodKeys.slice().reverse().map(k => {
    const checked = !reportesSelectedPeriods || reportesSelectedPeriods.has(k);
    return `<label><input type="checkbox" data-period="${escapeHtml(k)}" ${checked ? 'checked' : ''}> ${escapeHtml(periodLabelOf(k))}</label>`;
  }).join('');
  list.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (!reportesSelectedPeriods) reportesSelectedPeriods = new Set(periodKeys);
      const k = cb.dataset.period;
      if (cb.checked) reportesSelectedPeriods.add(k);
      else if (reportesSelectedPeriods.size > 1) reportesSelectedPeriods.delete(k); // no permitir dejar 0
      else cb.checked = true; // revertir: siempre debe quedar al menos 1 periodo
      if (reportesSelectedPeriods.size === periodKeys.length) reportesSelectedPeriods = null; // "todos" implícito
      renderReportes();
    });
  });

  const n = reportesSelectedPeriods ? reportesSelectedPeriods.size : periodKeys.length;
  el('reportesPeriodBtn').textContent = n === periodKeys.length ? '📅 Fechas (todas)' : `📅 Fechas (${n})`;
  el('reportesPeriodHint').textContent = (granularity === 'week' && n === 1)
    ? '📅 Semana específica — "en el tiempo" muestra el detalle día a día (solo con la métrica Ventas).'
    : '';
}

function initPeriodPopover(btnId, popoverId, allBtnId, noneBtnId) {
  const btn = el(btnId), popover = el(popoverId);
  btn.addEventListener('click', (e) => { e.stopPropagation(); popover.classList.toggle('hidden-block'); });
  document.addEventListener('click', (e) => { if (!popover.contains(e.target) && e.target !== btn) popover.classList.add('hidden-block'); });
  el(allBtnId).addEventListener('click', () => {
    reportesSelectedPeriods = null;
    popover.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; });
    renderReportes();
  });
  el(noneBtnId).addEventListener('click', () => {
    const boxes = Array.from(popover.querySelectorAll('input[type=checkbox]'));
    if (!boxes.length) return;
    reportesSelectedPeriods = new Set([boxes[0].dataset.period]); // siempre queda al menos 1
    renderReportes();
  });
}

// Normaliza la métrica elegida a {seriesBySede} (Map sedeName -> Map
// periodKey -> valor) para que el resto del render sea el mismo sin importar
// si la fuente es balance_weeks o ventas_dias.
function reportesMetricSeries(metric, data, ventaData) {
  const seriesBySede = new Map();
  if (metric === 'venta') {
    ventaData.bySede.forEach((points, sedeName) => seriesBySede.set(sedeName, new Map(points.map(p => [p.periodKey, p.valorVenta]))));
  } else {
    data.bySede.forEach((points, sedeName) => seriesBySede.set(sedeName, new Map(points.map(p => [p.periodKey, p[metric]]))));
  }
  return { seriesBySede };
}

function renderReportesTiempoChart(metric, data, ventaData, sedeFilter, periodKeysInScope, granularity, periodLabelOf) {
  const palette = SEDE_PALETTE;
  const { seriesBySede } = reportesMetricSeries(metric, data, ventaData);
  const sedeNames = sedeFilter ? [sedeFilter] : Array.from(seriesBySede.keys());
  const metricLabel = REPORTES_METRIC_LABELS[metric];
  const isPercentMetric = metric === 'margenPct';
  const valueFmt = isPercentMetric ? fmtPct : fmtCOP;
  const singlePeriod = periodKeysInScope.length === 1 ? periodKeysInScope[0] : null;

  // ---- "... en el tiempo": drill-down a días cuando hay UNA sola semana
  // seleccionada y la métrica es Ventas (es la única con datos diarios reales) ----
  if (chartReportesMargen) chartReportesMargen.destroy();
  if (metric === 'venta' && granularity === 'week' && singlePeriod) {
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(singlePeriod + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
      dias.push(d.toISOString().slice(0, 10));
    }
    const rows = sedeFilter ? (ventasAllDias || []).filter(r => r.sede_name === sedeFilter) : (ventasAllDias || []);
    const datasets = sedeNames.map((sedeName, i) => {
      const byFecha = new Map(rows.filter(r => r.sede_name === sedeName).map(r => [String(r.fecha).slice(0, 10), Number(r.valor_venta)]));
      return { label: sedeName, data: dias.map(f => byFecha.has(f) ? byFecha.get(f) : null), borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length], spanGaps: true, tension: .25 };
    });
    const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const diaLabels = dias.map(f => { const d = new Date(f + 'T00:00:00Z'); return DIAS_SEMANA[d.getUTCDay()] + ' ' + String(d.getUTCDate()).padStart(2, '0'); });
    const opts = dashboardChartOptions('Ventas por día — semana del ' + (periodLabelOf(singlePeriod) || singlePeriod), 'reportesView', valueFmt);
    opts.plugins.legend.display = datasets.length > 1;
    chartReportesMargen = new Chart(el('chartReportesMargen').getContext('2d'), { type: 'line', data: { labels: diaLabels, datasets }, options: opts });
  } else {
    const labels = periodKeysInScope.map(periodLabelOf);
    const tiempoDatasets = sedeNames.map((sedeName, i) => {
      const byPeriod = seriesBySede.get(sedeName) || new Map();
      return { label: sedeName, data: periodKeysInScope.map(k => byPeriod.has(k) ? byPeriod.get(k) : null), borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length], spanGaps: true, tension: .25 };
    });
    const tiempoOpts = dashboardChartOptions(metricLabel + ' en el tiempo', 'reportesView', valueFmt);
    tiempoOpts.plugins.legend.display = tiempoDatasets.length > 1;
    chartReportesMargen = new Chart(el('chartReportesMargen').getContext('2d'), { type: 'line', data: { labels, datasets: tiempoDatasets }, options: tiempoOpts });
  }
}

// "Comparativa entre sedes": suma (o margen ponderado) de los periodos
// seleccionados, ordenado de mayor a menor.
function renderReportesSedesChart(metric, data, ventaData, sedeFilter, periodKeysInScope, periodLabelOf) {
  const palette = SEDE_PALETTE;
  const { seriesBySede } = reportesMetricSeries(metric, data, ventaData);
  const sedeNames = sedeFilter ? [sedeFilter] : Array.from(seriesBySede.keys());
  const metricLabel = REPORTES_METRIC_LABELS[metric];
  const isPercentMetric = metric === 'margenPct';
  const valueFmt = isPercentMetric ? fmtPct : fmtCOP;
  const singlePeriod = periodKeysInScope.length === 1 ? periodKeysInScope[0] : null;

  if (chartReportesUtilidad) chartReportesUtilidad.destroy();
  let barPairs;
  if (isPercentMetric) {
    // Margen ponderado (utilidad total / venta total) — promediar el % de
    // cada periodo directamente sería matemáticamente incorrecto (mismo
    // criterio que aggregateByPeriod en balanceDashboardData.js).
    const rawPoints = Array.from(data.bySede.entries()).flatMap(([sedeName, points]) => points.filter(p => periodKeysInScope.includes(p.periodKey)).map(p => ({ ...p, sedeName })));
    barPairs = sedeNames.map(sedeName => {
      const pts = rawPoints.filter(p => p.sedeName === sedeName);
      const totalVentas = pts.reduce((a, p) => a + p.totalVentas, 0);
      const totalUtilidad = pts.reduce((a, p) => a + p.utilidadBruta, 0);
      return [sedeName, totalVentas === 0 ? 0 : totalUtilidad / totalVentas];
    });
  } else {
    barPairs = sedeNames.map(sedeName => {
      const byPeriod = seriesBySede.get(sedeName) || new Map();
      return [sedeName, periodKeysInScope.reduce((a, k) => a + (byPeriod.get(k) || 0), 0)];
    });
  }
  barPairs.sort((a, b) => b[1] - a[1]); // descendente: el mejor resultado primero (izquierda)
  const barLabels = barPairs.map(([s]) => s);
  const barValues = barPairs.map(([, v]) => v);
  // Un color por sede (no rojo/verde por signo, y el mismo color que en el
  // gráfico de tiempo) — el objetivo de este gráfico es distinguir SEDES
  // entre sí, no si el valor es positivo/negativo.
  const barColors = barLabels.map(sedeName => palette[sedeNames.indexOf(sedeName) % palette.length]);
  const scopeLabel = singlePeriod ? (periodLabelOf(singlePeriod) || singlePeriod) : periodKeysInScope.length + ' periodo(s) seleccionado(s)';
  // Barras verticales (indexAxis 'x', el default de dashboardChartOptions):
  // con 'y' (horizontal) el callback de tooltip de dashboardChartOptions lee
  // ctx.parsed.y, que en un bar horizontal es el índice de categoría (no el
  // valor) — mostraba el número equivocado al pasar el mouse.
  chartReportesUtilidad = new Chart(el('chartReportesUtilidad').getContext('2d'), {
    type: 'bar', data: { labels: barLabels, datasets: [{ data: barValues, backgroundColor: barColors, borderRadius: 6 }] },
    options: dashboardChartOptions(metricLabel + ' — ' + scopeLabel, 'reportesView', valueFmt)
  });
}

// "Presupuesto": a diferencia de las otras 2 sub-vistas, ignora el selector
// de métrica/granularidad/fechas — siempre es venta real del MES EN CURSO
// contra la meta que dio la empresa (ver computeProjection en
// src/ventas/ventasDashboardData.js), respetando solo el filtro de sede.
function renderReportesPresupuestoView(sedeFilter) {
  const { anio, mes } = currentAnioMes();
  const mesPrefix = `${anio}-${String(mes).padStart(2, '0')}`;
  const diasDelMes = (ventasAllDias || []).filter(d => String(d.fecha).slice(0, 7) === mesPrefix);
  const sedesDelMes = (sedeFilter ? [sedeFilter] : Array.from(new Set(diasDelMes.map(d => d.sede_name)))).sort();

  const porSede = sedesDelMes.map(sedeName => {
    const proj = computeProjection(diasDelMes.filter(d => d.sede_name === sedeName), anio, mes);
    const presupuesto = Number((ventasPresupuestos || []).find(p => p.sede_name === sedeName && p.anio === anio && p.mes === mes)?.monto || 0);
    return { sedeName, proj, presupuesto };
  });

  const totalAcumulado = porSede.reduce((a, s) => a + (s.proj ? s.proj.acumulado : 0), 0);
  const totalProyeccion = porSede.reduce((a, s) => a + (s.proj ? s.proj.proyeccion : 0), 0);
  const totalPresupuesto = porSede.reduce((a, s) => a + s.presupuesto, 0);
  const pctProyectado = totalPresupuesto > 0 ? totalProyeccion / totalPresupuesto : null;
  const cumple = pctProyectado != null && pctProyectado >= 1;

  el('reportesPresupuestoKpiGrid').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Presupuesto del mes${sedeFilter ? '' : ' (total)'}</div><div class="kpi-value">${fmtCOP(totalPresupuesto)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Acumulado del mes</div><div class="kpi-value">${fmtCOP(totalAcumulado)}</div></div>
    <div class="kpi-card ${pctProyectado == null ? '' : (cumple ? 'kpi-pos' : 'kpi-neg')}"><div class="kpi-label">Proyección de cierre</div><div class="kpi-value">${fmtCOP(totalProyeccion)}</div></div>
    <div class="kpi-card ${pctProyectado == null ? '' : (cumple ? 'kpi-pos' : 'kpi-neg')}"><div class="kpi-label">${pctProyectado == null ? 'Sin meta cargada' : (cumple ? '✓ Proyecta a CUMPLIR la meta' : '⚠ Proyecta a NO cumplir')}</div><div class="kpi-value">${pctProyectado == null ? '—' : fmtPct(pctProyectado)}</div></div>`;

  if (chartReportesPresupuesto) chartReportesPresupuesto.destroy();
  const acumPorSede = porSede.map(s => s.proj ? s.proj.acumulado : 0);
  const presPorSede = porSede.map(s => s.presupuesto);
  const opts = dashboardChartOptions('Acumulado vs. presupuesto — mes en curso', 'reportesView');
  opts.plugins.legend.display = true;
  chartReportesPresupuesto = new Chart(el('chartReportesPresupuesto').getContext('2d'), {
    type: 'bar',
    data: { labels: sedesDelMes, datasets: [
      { label: 'Acumulado del mes', data: acumPorSede, backgroundColor: dashVar('--dv-chart-pos', 'reportesView'), borderRadius: 6 },
      { label: 'Presupuesto', data: presPorSede, backgroundColor: dashVar('--dv-text-muted', 'reportesView'), borderRadius: 6 }
    ] },
    options: opts
  });

  el('reportesProyeccionTableBody').innerHTML = porSede.length ? porSede.map(s => {
    const pct = s.presupuesto > 0 && s.proj ? s.proj.proyeccion / s.presupuesto : null;
    const cls = pct == null ? '' : (pct >= 1 ? 'diff-zero' : (pct >= 0.9 ? '' : 'diff-neg'));
    return `<tr>
      <td class="left">${escapeHtml(s.sedeName)}</td>
      <td>${s.proj ? fmtCOP(s.proj.acumulado) : '—'}</td>
      <td>${s.proj ? fmtCOP(s.proj.proyeccion) : '—'}</td>
      <td>${s.presupuesto > 0 ? fmtCOP(s.presupuesto) : '—'}</td>
      <td class="${cls}">${pct == null ? '—' : fmtPct(pct)}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="left hint">Sin ventas del mes en curso todavía.</td></tr>';
}

function renderReportesTable(metric, data, ventaData, sedeFilter, periodKeysInScope) {
  let rows;
  if (metric === 'venta') {
    // Ventas reales no traen Utilidad/Margen propios (esos son de Balance) —
    // se muestran en blanco en vez de inventar un cruce que no corresponde.
    rows = Array.from(ventaData.bySede.entries()).flatMap(([sedeName, points]) =>
      points.map(p => ({ sedeName, periodKey: p.periodKey, periodLabel: p.periodLabel, totalVentas: p.valorVenta, utilidadBruta: null, margenPct: null })));
  } else {
    rows = Array.from(data.bySede.values()).flat();
  }
  if (sedeFilter) rows = rows.filter(r => r.sedeName === sedeFilter);
  rows = rows.filter(r => periodKeysInScope.includes(r.periodKey));
  rows = rows.slice().sort((a, b) => (a.periodKey < b.periodKey ? 1 : -1));
  el('reportesTableBody').innerHTML = rows.map(r => {
    const cls = r.utilidadBruta == null ? '' : (r.utilidadBruta < 0 ? 'diff-neg' : (Math.abs(r.utilidadBruta) < 0.01 ? 'diff-zero' : ''));
    return `<tr><td class="left">${escapeHtml(r.sedeName)}</td><td class="left">${escapeHtml(r.periodLabel)}</td><td>${fmtCOP(r.totalVentas)}</td><td class="${cls}">${r.utilidadBruta == null ? '—' : fmtCOP(r.utilidadBruta)}</td><td>${r.margenPct == null ? '—' : fmtPct(r.margenPct)}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="left hint">Sin datos para este filtro.</td></tr>';
}

async function downloadReportesReport() {
  if (!reportesWeeks) return;
  const html = buildBalanceReportHtml(reportesWeeks, ventasAllDias || [], ventasPresupuestos || [], movHistWeeks || [], chartJsRawSource, {});
  downloadBlob(html, 'reportes_brangus.html', 'text/html');
}

// ---------------- Reportes: tipo Balance vs Tabla de Movimientos ----------------
let reportesType = 'balance';
function switchReportesType(type) {
  reportesType = type;
  el('reportesTypeBalanceBtn').classList.toggle('tab-active', type === 'balance');
  el('reportesTypeMovimientosBtn').classList.toggle('tab-active', type === 'movimientos');
  el('reportesTypeAuditoriasBtn').classList.toggle('tab-active', type === 'auditorias');
  el('reportesTypeVentasBtn').classList.toggle('tab-active', type === 'ventas');
  el('reportesCard').classList.toggle('hidden-block', type !== 'balance');
  el('reportesMovCard').classList.toggle('hidden-block', type !== 'movimientos');
  el('reportesAudCard').classList.toggle('hidden-block', type !== 'auditorias');
  el('reportesVentCard').classList.toggle('hidden-block', type !== 'ventas');
  if (type === 'auditorias' && !audHistAudits) loadAudReportesData();
  if (type === 'ventas' && !ventasAllDias) loadVentReportesData();
}

// ---------------- Reportes de Tabla de Movimientos ----------------
let movHistWeeks = null;    // filas crudas de movimientos_weeks (todas las sedes)
let chartMovDiferencia, chartMovSedes, chartMovBloques;
let movBloqueFilter = ''; // '' = todos los bloques sumados (comportamiento de siempre)

// Carga de Tabla de Movimientos (una o varias sedes a la vez, igual que
// Ventas Diarias) — a diferencia de Ventas, la fecha de la semana no viene
// clara en el archivo (ver scripts/import_movimientos_history.cjs), así que
// se adivina con guessWeekFromText pero SIEMPRE queda editable antes de guardar.
function createMovUploader(ids, onSaved) {
  let entries = []; // { fileName, sedeName, weekStart, weekEnd, parsed, error }
  let cachedSedeNames = null;

  async function knownSedeNames() {
    if (movHistWeeks && movHistWeeks.length) return Array.from(new Set(movHistWeeks.map(w => w.sede_name)));
    if (!cachedSedeNames) {
      try {
        const { sedes } = await movimientosApi.getSedesConHistorial();
        cachedSedeNames = (sedes || []).map(s => s.sede_name);
      } catch { cachedSedeNames = []; }
    }
    return cachedSedeNames;
  }

  function render() {
    el(ids.filesList).innerHTML = entries.map((e, i) => {
      if (e.error) {
        return `<div class="vent-file-row vent-file-error">
          <div class="vent-file-name">${escapeHtml(e.fileName)}</div>
          <div class="vent-file-summary">⚠ ${escapeHtml(e.error)}</div>
          <button type="button" class="btn-tiny" data-remove="${i}">Quitar</button>
        </div>`;
      }
      const pctGlobal = e.parsed.totalDisponible === 0 ? 0 : e.parsed.totalDiferencia / e.parsed.totalDisponible;
      return `<div class="vent-file-row">
        <div class="vent-file-name">${escapeHtml(e.fileName)}</div>
        <input type="text" data-sede-idx="${i}" value="${escapeHtml(e.sedeName)}" placeholder="Sede">
        <input type="date" data-start-idx="${i}" value="${e.weekStart || ''}" title="Semana — inicio">
        <input type="date" data-end-idx="${i}" value="${e.weekEnd || ''}" title="Semana — fin">
        <div class="vent-file-summary">${e.parsed.byCategory.size} bloques · Disponible ${fmt(e.parsed.totalDisponible)} · Diferencia ${fmt(e.parsed.totalDiferencia)} KL (${fmtPct(pctGlobal)})</div>
        <button type="button" class="btn-tiny" data-remove="${i}">Quitar</button>
      </div>`;
    }).join('') || '<p class="hint">No hay archivos cargados.</p>';
    el(ids.filesList).querySelectorAll('input[data-sede-idx]').forEach(inp => {
      inp.addEventListener('input', () => { entries[+inp.dataset.sedeIdx].sedeName = inp.value.trim(); });
    });
    el(ids.filesList).querySelectorAll('input[data-start-idx]').forEach(inp => {
      inp.addEventListener('input', () => { entries[+inp.dataset.startIdx].weekStart = inp.value; });
    });
    el(ids.filesList).querySelectorAll('input[data-end-idx]').forEach(inp => {
      inp.addEventListener('input', () => { entries[+inp.dataset.endIdx].weekEnd = inp.value; });
    });
    el(ids.filesList).querySelectorAll('button[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => { entries.splice(+btn.dataset.remove, 1); render(); });
    });
    el(ids.previewCard).classList.toggle('hidden-block', entries.length === 0);
  }

  function handleFiles(files) {
    el(ids.errorBanner).classList.add('hidden-block');
    let pending = files.length;
    files.forEach(file => {
      if (!/\.(xlsx|xls)$/i.test(file.name)) {
        entries.push({ fileName: file.name, error: `"${file.name}" no es .xlsx ni .xls.` });
        if (--pending === 0) render();
        return;
      }
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
          const sheetName = wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
          const rawGuess = guessSedeName(file.name.replace(/\b(tabla|movimientos?|por|producto)\b/gi, '').trim() || file.name);
          const names = await knownSedeNames();
          const contentGuess = guessSedeFromVentasRows(rows, names); // mismo cruce contra sedes conocidas, ver ventasFileParse.js
          const sedeName = contentGuess || matchKnownSede(rawGuess, names) || rawGuess;
          const parsed = parseFinalMovimientosFile(rows, sedeName);
          if (!parsed) {
            entries.push({ fileName: file.name, error: 'No se encontraron las columnas "Disponible"/"Diferencia KL" en este archivo — debe ser el Excel ya generado por la herramienta (ya editado/corregido).' });
          } else {
            const week = guessWeekFromText(sheetName) || guessWeekFromText(file.name);
            entries.push({ fileName: file.name, sedeName, weekStart: week ? week.weekStart : '', weekEnd: week ? week.weekEnd : '', parsed });
          }
        } catch (err) {
          entries.push({ fileName: file.name, error: 'No se pudo leer el archivo: ' + err.message });
        }
        if (--pending === 0) render();
      };
      reader.readAsArrayBuffer(file);
    });
  }

  async function saveAll() {
    const valid = entries.filter(e => !e.error && e.sedeName && e.weekStart);
    const banner = el(ids.saveBanner);
    if (!valid.length) {
      banner.className = 'banner error'; banner.classList.remove('hidden-block');
      banner.textContent = '⚠ No hay archivos listos para guardar (revisa que cada fila tenga sede y fecha de inicio de semana).';
      return;
    }
    const btn = el(ids.saveBtn);
    const originalText = btn.textContent;
    btn.disabled = true;
    for (let i = 0; i < valid.length; i++) {
      const e = valid[i];
      btn.textContent = `Guardando ${i + 1}/${valid.length}…`;
      banner.className = 'banner info'; banner.classList.remove('hidden-block');
      banner.textContent = `Guardando ${i + 1} de ${valid.length}: ${e.sedeName} (semana del ${e.weekStart})…`;
      try {
        const computed = {
          totalDisponible: e.parsed.totalDisponible,
          totalDiferencia: e.parsed.totalDiferencia,
          totalProductosNeg: e.parsed.totalProductosNeg,
          byCategory: Array.from(e.parsed.byCategory.entries()).map(([category, v]) => ({ category, ...v })),
          allProductRows: e.parsed.allProductRows // para el detalle de productos por bloque en el histórico
        };
        await movimientosApi.saveWeek({ sedeName: e.sedeName, weekKey: e.weekStart, weekStart: e.weekStart, weekEnd: e.weekEnd || null, computed });
      } catch (err) {
        btn.disabled = false; btn.textContent = originalText;
        banner.className = 'banner error';
        banner.textContent = `⚠ Error guardando ${e.sedeName}: ${err.message}`;
        return;
      }
    }
    btn.disabled = false; btn.textContent = originalText;
    banner.className = 'banner info';
    banner.textContent = `✓ ${valid.length} semana(s) guardada(s) en el historial.`;
    entries = [];
    render();
    movHistWeeks = null; // fuerza recarga
    if (onSaved) await onSaved();
  }

  return { handleFiles, saveAll };
}

const movUploader = createMovUploader({
  errorBanner: 'movErrorBanner', previewCard: 'movPreviewCard', filesList: 'movFilesList',
  saveBtn: 'movSaveWeekBtn', saveBanner: 'movSaveBanner'
}, async () => {
  try {
    const { weeks } = await movimientosApi.getAllWeeks();
    movHistWeeks = weeks || [];
  } catch { /* silencioso: el histórico se refresca solo la próxima vez que cargue */ }
  if (reportesWeeks) renderReportes(); // refresca la sub-vista "📋 Mermas" si está unificada y visible
});

// Valor a graficar/tabular para un punto ya agregado: el total (todos los
// bloques sumados) o un bloque específico — ver selector "Bloque" agregado
// a pedido explícito del usuario para comparar Finas/Pulpas/Segundas/...
// entre sedes y en el tiempo, no solo el total de mermas.
function movMetricFor(point) {
  if (!movBloqueFilter) return { disponible: point.disponible, diferenciaKL: point.diferenciaKL, pctDiferencia: point.pctDiferencia };
  const b = (point.byBloque || []).find(x => x.bloque === movBloqueFilter);
  return b ? { disponible: b.disponible, diferenciaKL: b.diferenciaKL, pctDiferencia: b.pctDiferencia } : { disponible: 0, diferenciaKL: 0, pctDiferencia: 0 };
}

// Sub-vista "📋 Mermas" del dashboard unificado de Reportes > Balance —
// unificada junto a Margen/Utilidad/Ventas/Presupuesto a pedido explícito
// del usuario (antes vivía en su propia pestaña "Tabla de Movimientos",
// que ahora solo sirve para cargar archivos). Respeta el filtro de sede y
// la granularidad compartidos (semana/mes/año); ignora el selector de
// "Métrica" y el popover de "Fechas" (no aplican a mermas) y tiene su
// propio selector de "Bloque".
function renderReportesMermasView(sedeFilter, granularity) {
  if (!movHistWeeks || !movHistWeeks.length) return;
  const data = aggregateMovByPeriod(movHistWeeks, granularity);

  const bloqueSel = el('reportesMermasBloque');
  if (bloqueSel.options.length <= 1) {
    bloqueSel.innerHTML = '<option value="">Todos los bloques</option>' + BLOQUES_CANONICOS.map(b => `<option>${escapeHtml(b)}</option>`).join('');
  }
  bloqueSel.value = movBloqueFilter;

  const allPoints = Array.from(data.bySede.values()).flat().filter(p => !sedeFilter || p.sedeName === sedeFilter);
  const lastPeriod = data.periodKeysSorted[data.periodKeysSorted.length - 1];
  const lastPoints = allPoints.filter(p => p.periodKey === lastPeriod);
  const lastMetrics = lastPoints.map(movMetricFor);
  const lastDisponible = lastMetrics.reduce((a, m) => a + m.disponible, 0);
  const lastDiferencia = lastMetrics.reduce((a, m) => a + m.diferenciaKL, 0);
  const lastPct = lastDisponible === 0 ? 0 : lastDiferencia / lastDisponible;
  const GRAN_LABEL = { week: 'semana', month: 'mes', year: 'año' };
  const bloqueLabel = movBloqueFilter ? ' — ' + movBloqueFilter : '';
  el('reportesMermasKpiGrid').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Sedes con historial</div><div class="kpi-value">${data.sedeNames.length}</div></div>
    <div class="kpi-card"><div class="kpi-label">Semanas guardadas</div><div class="kpi-value">${movHistWeeks.length}</div></div>
    <div class="kpi-card ${lastDiferencia < 0 ? 'kpi-neg' : 'kpi-pos'}"><div class="kpi-label">Diferencia KL — último ${GRAN_LABEL[granularity]}${bloqueLabel}</div><div class="kpi-value">${fmt(lastDiferencia)}</div></div>
    <div class="kpi-card ${lastDiferencia < 0 ? 'kpi-neg' : 'kpi-pos'}"><div class="kpi-label">% Diferencia — último ${GRAN_LABEL[granularity]}${bloqueLabel}</div><div class="kpi-value">${fmtPct(lastPct)}</div></div>`;

  renderMermasCharts(data, sedeFilter);
  renderMermasBloquesChart(data, sedeFilter, lastPeriod, GRAN_LABEL[granularity]);
  renderMermasTable(data, sedeFilter);
}

function renderMermasCharts(data, sedeFilter) {
  const series = sedeFilter ? [[sedeFilter, data.bySede.get(sedeFilter) || []]] : Array.from(data.bySede.entries());
  const labels = data.periodKeysSorted.map(k => (data.byPeriod.get(k) || [])[0]?.periodLabel || k);
  const palette = SEDE_PALETTE;
  const metricLabel = movBloqueFilter ? 'Diferencia KL' + ' — ' + movBloqueFilter : 'Diferencia KL';

  if (chartMovDiferencia) chartMovDiferencia.destroy();
  const diffDatasets = series.map(([sedeName, points], i) => {
    const byPeriod = new Map(points.map(p => [p.periodKey, movMetricFor(p).diferenciaKL]));
    return { label: sedeName, data: data.periodKeysSorted.map(k => byPeriod.has(k) ? byPeriod.get(k) : null), borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length], spanGaps: true, tension: .25 };
  });
  const diffOpts = dashboardChartOptions(metricLabel + ' en el tiempo', 'reportesView');
  diffOpts.plugins.legend.display = series.length > 1;
  chartMovDiferencia = new Chart(el('chartReportesMermasTiempo').getContext('2d'), { type: 'line', data: { labels, datasets: diffDatasets }, options: diffOpts });

  if (chartMovSedes) chartMovSedes.destroy();
  const diffBySede = series.map(([sedeName, points]) => [sedeName, points.reduce((a, p) => a + movMetricFor(p).diferenciaKL, 0)]);
  const sedeLabels = diffBySede.map(([s]) => s), sedeValues = diffBySede.map(([, v]) => v);
  // Todas las barras crecen hacia arriba desde cero (magnitud del faltante/
  // sobrante) en vez de que las negativas cuelguen hacia abajo del eje — el
  // usuario lo veía como "barras al revés". El signo se sigue distinguiendo
  // por color (rojo = faltante) y el tooltip muestra el valor real con signo.
  const sedesOpts = dashboardChartOptions(metricLabel + ' acumulada por sede', 'reportesView');
  sedesOpts.plugins.tooltip = { callbacks: { label: (ctx) => fmt(sedeValues[ctx.dataIndex]) } };
  chartMovSedes = new Chart(el('chartReportesMermasSedes').getContext('2d'), {
    type: 'bar', data: { labels: sedeLabels, datasets: [{ data: sedeValues.map(v => Math.abs(v)), backgroundColor: chartColors(sedeValues, 'reportesView'), borderRadius: 6 }] },
    options: sedesOpts
  });
}

// "Diferencia KL por bloque": ranking de los 12 bloques (Finas/Pulpas/
// Segundas/...) del ÚLTIMO periodo (semana/mes/año, según la granularidad
// elegida) — antes sumaba TODO el historial cargado, lo que hacía que el
// tooltip de una barra no coincidiera con la fila de esa misma semana en
// "Detalle por periodo" (confundía al usuario: parecían datos distintos).
// Ahora usa el mismo alcance "último periodo" que ya muestran los KPI de
// arriba, así el número siempre es el mismo en ambos lados.
// Clic en una barra abre el detalle de productos de ese bloque (semana más
// reciente con datos guardados, ver renderMermasProductDrilldown).
function renderMermasBloquesChart(data, sedeFilter, lastPeriod, granLabel) {
  if (chartMovBloques) chartMovBloques.destroy();
  const points = Array.from(data.bySede.entries())
    .filter(([sedeName]) => !sedeFilter || sedeName === sedeFilter)
    .flatMap(([, pts]) => pts)
    .filter(p => p.periodKey === lastPeriod);
  const acc = new Map();
  points.forEach(p => (p.byBloque || []).forEach(b => {
    if (!acc.has(b.bloque)) acc.set(b.bloque, { disponible: 0, diferenciaKL: 0 });
    const a = acc.get(b.bloque);
    a.disponible += b.disponible;
    a.diferenciaKL += b.diferenciaKL;
  }));
  const pairs = BLOQUES_CANONICOS
    .map(bloque => [bloque, (acc.get(bloque) || { diferenciaKL: 0 }).diferenciaKL])
    .sort((a, b) => a[1] - b[1]); // ascendente: el bloque con mayor faltante primero
  const labels = pairs.map(p => p[0]);
  const values = pairs.map(p => p[1]);
  const title = 'Diferencia KL por bloque — último ' + granLabel + (sedeFilter ? ' — ' + sedeFilter : ' — todas las sedes');
  const opts = Object.assign(dashboardChartOptions(title, 'reportesView'), {
    indexAxis: 'y',
    onClick: (evt, elements) => {
      if (!elements.length) return;
      renderMermasProductDrilldown(labels[elements[0].index], sedeFilter);
    }
  });
  chartMovBloques = new Chart(el('chartReportesMermasBloques').getContext('2d'), {
    type: 'bar', data: { labels, datasets: [{ data: values, backgroundColor: chartColors(values, 'reportesView'), borderRadius: 6 }] }, options: opts
  });
  el('reportesMermasDrillHint').classList.toggle('hidden-block', !!sedeFilter);
}

// Detalle de productos de un bloque, de la semana más reciente guardada
// para esa sede — "ver las diferencias internas de cada bloque" que pidió
// el usuario, sin tener que descargar de nuevo el Excel de esa semana.
function renderMermasProductDrilldown(bloque, sedeFilter) {
  const wrap = el('reportesMermasDrillWrap');
  wrap.classList.remove('hidden-block');
  if (!sedeFilter) {
    el('reportesMermasDrillTitle').textContent = 'Elige una sede específica (no "todas las sedes") para ver el detalle de productos de este bloque.';
    el('reportesMermasDrillTableBody').innerHTML = '';
    return;
  }
  const weeksSede = (movHistWeeks || []).filter(w => w.sede_name === sedeFilter).slice().sort((a, b) => (String(a.week_start) < String(b.week_start) ? 1 : -1));
  const latest = weeksSede[0];
  const rows = latest?.computed?.allProductRows;
  if (!latest || !rows) {
    el('reportesMermasDrillTitle').textContent = `Sin detalle de productos guardado para ${sedeFilter} todavía.`;
    el('reportesMermasDrillTableBody').innerHTML = '';
    return;
  }
  const productos = rows.filter(p => p.category === bloque).sort((a, b) => a.diferenciaKL - b.diferenciaKL);
  const weekLabel = String(latest.week_start).slice(0, 10) + (latest.week_end ? ' → ' + String(latest.week_end).slice(0, 10) : '');
  el('reportesMermasDrillTitle').textContent = `Detalle de productos — ${bloque} en ${sedeFilter}, semana ${weekLabel}`;
  el('reportesMermasDrillTableBody').innerHTML = productos.map(p => {
    const cls = p.diferenciaKL < -0.01 ? 'diff-neg' : (Math.abs(p.diferenciaKL) < 0.01 ? 'diff-zero' : '');
    const pct = p.disponible === 0 ? 0 : p.diferenciaKL / p.disponible;
    return `<tr><td class="left code">${escapeHtml(p.code)}</td><td class="left">${escapeHtml(p.name)}</td><td>${fmt(p.disponible)}</td><td class="${cls}">${fmt(p.diferenciaKL)}</td><td>${fmtPct(pct)}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="left hint">Sin productos con diferencia en este bloque esa semana.</td></tr>';
}

function renderMermasTable(data, sedeFilter) {
  let rows = Array.from(data.bySede.values()).flat();
  if (sedeFilter) rows = rows.filter(r => r.sedeName === sedeFilter);
  rows = rows.slice().sort((a, b) => (a.periodKey < b.periodKey ? 1 : -1));
  el('reportesMermasTableBody').innerHTML = rows.map(r => {
    const m = movMetricFor(r);
    const cls = m.diferenciaKL < -0.01 ? 'diff-neg' : (Math.abs(m.diferenciaKL) < 0.01 ? 'diff-zero' : '');
    return `<tr><td class="left">${escapeHtml(r.sedeName)}</td><td class="left">${escapeHtml(r.periodLabel)}</td><td>${fmt(m.disponible)}</td><td class="${cls}">${fmt(m.diferenciaKL)}</td><td>${fmtPct(m.pctDiferencia)}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="left hint">Sin datos para este filtro.</td></tr>';
}

// ---------------- Auditorías PDV ----------------
let auditBlocksRendered = false;
let auditState = {}; // { [blockId]: { checks: [bool,...], obs: '' } }
let audHistAudits = null; // filas crudas de pdv_audits (todas las sedes)
let chartAudCumplimiento, chartAudBloques;

function renderAuditBlocks() {
  AUDIT_BLOCKS.forEach(b => { auditState[b.id] = { checks: b.items.map(() => false), obs: '' }; });
  el('auditBlocksContainer').innerHTML = AUDIT_BLOCKS.map(b => `
    <div class="card audit-block-card">
      <div class="audit-block-head"><span class="audit-block-num">${b.id}</span>${escapeHtml(b.title)}</div>
      <div class="audit-check-grid">
        ${b.items.map((item, i) => `
          <label class="audit-check-item">
            <input type="checkbox" data-block="${b.id}" data-item="${i}">
            <span>${escapeHtml(item)}</span>
          </label>`).join('')}
      </div>
      <div class="field audit-obs-field">
        <label>Observaciones</label>
        <input type="text" data-block-obs="${b.id}" placeholder="Opcional">
      </div>
    </div>
  `).join('');
  el('auditBlocksContainer').addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('input[type=checkbox]')) {
      auditState[t.dataset.block].checks[Number(t.dataset.item)] = t.checked;
      updateAuditProgress();
    } else if (t.matches('input[data-block-obs]')) {
      auditState[t.dataset.blockObs].obs = t.value;
    }
  });
  updateAuditProgress();
}

function updateAuditProgress() {
  const checked = Object.values(auditState).reduce((a, b) => a + b.checks.filter(Boolean).length, 0);
  el('audProgressHint').textContent = `${checked} de ${AUDIT_TOTAL_ITEMS} ítems marcados`;
  updateAuditSaveState();
}

function updateAuditSaveState() {
  const ready = !!el('audSedeInput').value.trim() && !!el('audDateInput').value;
  el('audSaveBtn').disabled = !ready;
}

async function saveAudit() {
  const sedeName = el('audSedeInput').value.trim();
  const auditDate = el('audDateInput').value;
  const banner = el('audSaveBanner');
  if (!sedeName || !auditDate) {
    banner.className = 'banner error'; banner.classList.remove('hidden-block');
    banner.textContent = '⚠ Escribe la sede y la fecha antes de guardar.';
    return;
  }
  const items = {};
  let checkedItems = 0;
  AUDIT_BLOCKS.forEach(b => {
    const st = auditState[b.id];
    items[b.id] = { title: b.title, checks: st.checks, observaciones: st.obs };
    checkedItems += st.checks.filter(Boolean).length;
  });
  const pctCumplimiento = AUDIT_TOTAL_ITEMS === 0 ? 0 : checkedItems / AUDIT_TOTAL_ITEMS;
  try {
    await auditoriasApi.saveAudit({
      sedeName, auditDate, auditTime: el('audTimeInput').value || null, auditorName: el('audAuditorInput').value.trim() || null,
      items, totalItems: AUDIT_TOTAL_ITEMS, checkedItems, pctCumplimiento,
      resultado: el('audResultadoInput').value, hallazgos: el('audHallazgosInput').value.trim() || null,
      planAccion: el('audPlanInput').value.trim() || null, fechaSeguimiento: el('audSeguimientoInput').value || null
    });
    banner.className = 'banner info'; banner.classList.remove('hidden-block');
    banner.textContent = '✓ Auditoría guardada en el historial.';
    audHistAudits = null; // fuerza recarga la próxima vez que se muestre Reportes > Auditorías
  } catch (err) {
    banner.className = 'banner error'; banner.classList.remove('hidden-block');
    banner.textContent = '⚠ No se pudo guardar: ' + err.message;
  }
}

async function loadAudReportesData() {
  el('reportesAudView').classList.add('hidden-block');
  el('audReportesLoadingHint').classList.remove('hidden-block');
  el('audReportesLoadingHint').textContent = 'Cargando historial…';
  try {
    const { audits, fromCache } = await auditoriasApi.getAllAudits();
    audHistAudits = audits || [];
    if (!audHistAudits.length) {
      el('audReportesLoadingHint').textContent = 'Todavía no hay auditorías guardadas en el historial.';
      return;
    }
    el('audReportesLoadingHint').classList.toggle('hidden-block', !fromCache);
    if (fromCache) el('audReportesLoadingHint').textContent = 'Mostrando el último historial disponible en este equipo (sin conexión con el servidor ahora mismo).';
    el('reportesAudView').classList.remove('hidden-block');
    el('audReportesDownloadBtn').disabled = false;
    renderAudReportes();
  } catch (err) {
    el('audReportesLoadingHint').textContent = '⚠ No se pudo cargar el historial: ' + err.message;
  }
}

function renderAudReportes() {
  if (!audHistAudits) return;
  const granularity = el('audReportesGranularity').value;
  const data = aggregateAudByPeriod(audHistAudits, granularity);

  const sedeSel = el('audReportesSedeFilter');
  const prevSede = sedeSel.value;
  sedeSel.innerHTML = '<option value="">Todas las sedes</option>' + data.sedeNames.map(s => `<option>${escapeHtml(s)}</option>`).join('');
  if (data.sedeNames.includes(prevSede)) sedeSel.value = prevSede;
  const sedeFilter = sedeSel.value;

  const series = sedeFilter ? [[sedeFilter, data.bySede.get(sedeFilter) || []]] : Array.from(data.bySede.entries());
  const allPoints = series.flatMap(([, points]) => points);
  const lastPeriod = data.periodKeysSorted[data.periodKeysSorted.length - 1];
  const lastPoints = allPoints.filter(p => p.periodKey === lastPeriod);
  const totalItems = lastPoints.reduce((a, p) => a + p.totalItems, 0);
  const checkedItems = lastPoints.reduce((a, p) => a + p.checkedItems, 0);
  const pct = totalItems === 0 ? 0 : checkedItems / totalItems;
  const totalAudits = allPoints.reduce((a, p) => a + p.audits, 0);
  const blockPct = combineBlockPct(lastPoints);
  let worstBlock = null, worstVal = 2;
  AUDIT_BLOCKS.forEach(b => { const v = blockPct[String(b.id)]; if (v != null && v < worstVal) { worstVal = v; worstBlock = b.title; } });
  const GRAN_LABEL = { week: 'semana', month: 'mes', year: 'año' };
  el('audReportesKpiGrid').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Sedes con historial</div><div class="kpi-value">${data.sedeNames.length}</div></div>
    <div class="kpi-card"><div class="kpi-label">Auditorías guardadas</div><div class="kpi-value">${audHistAudits.length}</div></div>
    <div class="kpi-card ${pct < 0.9 ? 'kpi-neg' : 'kpi-pos'}"><div class="kpi-label">Cumplimiento — último ${GRAN_LABEL[granularity]}</div><div class="kpi-value">${fmtPct(pct)}</div></div>
    <div class="kpi-card kpi-neg"><div class="kpi-label">Bloque más débil</div><div class="kpi-value" style="font-size:16px">${escapeHtml(worstBlock || '—')}</div></div>
    <div class="kpi-card"><div class="kpi-label">Auditorías — último ${GRAN_LABEL[granularity]}</div><div class="kpi-value">${totalAudits}</div></div>`;

  renderAudReportesCharts(data, sedeFilter);
  renderAudReportesTable(data, sedeFilter);
}

function renderAudReportesCharts(data, sedeFilter) {
  const series = sedeFilter ? [[sedeFilter, data.bySede.get(sedeFilter) || []]] : Array.from(data.bySede.entries());
  const labels = data.periodKeysSorted.map(k => (data.byPeriod.get(k) || [])[0]?.periodLabel || k);
  const palette = SEDE_PALETTE;

  if (chartAudCumplimiento) chartAudCumplimiento.destroy();
  const datasets = series.map(([sedeName, points], i) => {
    const byPeriod = new Map(points.map(p => [p.periodKey, p.pctCumplimiento]));
    return { label: sedeName, data: data.periodKeysSorted.map(k => byPeriod.has(k) ? byPeriod.get(k) : null), borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length], spanGaps: true, tension: .25 };
  });
  const opts = dashboardChartOptions('% Cumplimiento en el tiempo', 'reportesAudView');
  opts.plugins.legend.display = series.length > 1;
  opts.scales.y.min = 0; opts.scales.y.max = 1;
  chartAudCumplimiento = new Chart(el('chartAudCumplimiento').getContext('2d'), { type: 'line', data: { labels, datasets }, options: opts });

  if (chartAudBloques) chartAudBloques.destroy();
  const lastPeriod = data.periodKeysSorted[data.periodKeysSorted.length - 1];
  const lastPoints = series.flatMap(([, points]) => points).filter(p => p.periodKey === lastPeriod);
  const blockPct = combineBlockPct(lastPoints);
  const blockLabels = AUDIT_BLOCKS.map(b => b.title);
  const blockValues = AUDIT_BLOCKS.map(b => blockPct[String(b.id)] ?? 0);
  const blockColors = blockValues.map(v => v < 0.7 ? dashVar('--dv-neg', 'reportesAudView') : (v < 0.9 ? '#f0b429' : dashVar('--dv-pos', 'reportesAudView')));
  chartAudBloques = new Chart(el('chartAudBloques').getContext('2d'), {
    type: 'bar', data: { labels: blockLabels, datasets: [{ data: blockValues, backgroundColor: blockColors, borderRadius: 6 }] },
    options: Object.assign(dashboardChartOptions('Cumplimiento por bloque — último periodo', 'reportesAudView'), { indexAxis: 'y', scales: { x: { min: 0, max: 1 }, y: {} } })
  });
}

function renderAudReportesTable(data, sedeFilter) {
  let rows = Array.from(data.bySede.values()).flat();
  if (sedeFilter) rows = rows.filter(r => r.sedeName === sedeFilter);
  rows = rows.slice().sort((a, b) => (a.periodKey < b.periodKey ? 1 : -1));
  el('audReportesTableBody').innerHTML = rows.map(r => {
    const cls = r.pctCumplimiento < 0.7 ? 'diff-neg' : (r.pctCumplimiento >= 0.9 ? 'diff-zero' : '');
    return `<tr><td class="left">${escapeHtml(r.sedeName)}</td><td class="left">${escapeHtml(r.periodLabel)}</td><td>${r.audits}</td><td class="${cls}">${fmtPct(r.pctCumplimiento)}</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="left hint">Sin datos para este filtro.</td></tr>';
}

async function downloadAudReportesReport() {
  if (!audHistAudits) return;
  const html = buildAuditoriasReportHtml(audHistAudits, chartJsRawSource, {});
  downloadBlob(html, 'auditorias_brangus.html', 'text/html');
}

// ---------------- Ventas Diarias (carga desde la pantalla inicial y desde Presupuesto) ----------------
// La comparativa de venta/margen/utilidad vive unificada en Reportes >
// Balance (ver renderReportes/renderReportesCharts arriba, que ya leen
// ventasAllDias) — esta pestaña/sección solo carga los archivos diarios y
// gestiona el presupuesto mensual por sede.
let ventasAllDias = null;       // filas crudas de ventas_dias (todas las sedes) — compartido con Reportes > Balance
let ventasPresupuestos = null;  // filas crudas de presupuestos_mensuales

// Fábrica reusada por las 2 zonas de carga de ventas (pantalla inicial y
// pestaña Presupuesto): acepta VARIOS archivos a la vez (uno por sede),
// detecta la sede de cada uno, y guarda todo en lote con progreso visible —
// antes solo aceptaba un archivo, y con historiales largos (1000+ días) el
// guardado tardaba minutos SIN ninguna señal, así que parecía que "no hacía
// nada" (ver server/routes/ventas.js, ahora hace upsert por lotes en vez de
// una consulta por día).
function createVentUploader(ids, onSaved) {
  let entries = []; // { fileName, sedeName, parsed, error }
  let cachedSedeNames = null; // respaldo cuando ventasAllDias todavía no se cargó (ver knownSedeNames)

  // Nombres de sede ya conocidos, para que guessSedeFromVentasRows/matchKnownSede
  // puedan reconocer un nombre "sucio" (con dirección o rango de fechas pegado,
  // ej. "DECEPAZ CALLE 123 # 25B -08" o "DECEPAZ 14-20 SEPTIEMBRE.xls") y
  // reusar la sede real en vez de crear una nueva. Antes esto dependía
  // solo de ventasAllDias, que normalmente está vacío en la pantalla de
  // carga inicial "Ventas Diarias" (no se ha visitado Reportes todavía) —
  // eso fue justo lo que causó sedes duplicadas como "DECEPAZ 14 20
  // septiembre" (ver server/slug.js#resolveCanonicalSedeName, que solo
  // ayuda si el slug ya coincide, no si el nombre detectado es otro texto).
  async function knownSedeNames() {
    if (ventasAllDias && ventasAllDias.length) return Array.from(new Set(ventasAllDias.map(d => d.sede_name)));
    if (!cachedSedeNames) {
      try {
        const { sedes } = await ventasApi.getSedesConHistorial();
        cachedSedeNames = (sedes || []).map(s => s.sede_name);
      } catch { cachedSedeNames = []; }
    }
    return cachedSedeNames;
  }

  function render() {
    el(ids.filesList).innerHTML = entries.map((e, i) => {
      if (e.error) {
        return `<div class="vent-file-row vent-file-error">
          <div class="vent-file-name">${escapeHtml(e.fileName)}</div>
          <div class="vent-file-summary">⚠ ${escapeHtml(e.error)}</div>
          <button type="button" class="btn-tiny" data-remove="${i}">Quitar</button>
        </div>`;
      }
      const total = e.parsed.dias.reduce((a, d) => a + d.valorVenta, 0);
      return `<div class="vent-file-row">
        <div class="vent-file-name">${escapeHtml(e.fileName)}</div>
        <input type="text" data-sede-idx="${i}" value="${escapeHtml(e.sedeName)}" placeholder="Sede">
        <div class="vent-file-summary">${e.parsed.dias.length} días · ${e.parsed.dias[0].fecha} → ${e.parsed.dias[e.parsed.dias.length - 1].fecha} · ${fmtCOP(total)}</div>
        <button type="button" class="btn-tiny" data-remove="${i}">Quitar</button>
      </div>`;
    }).join('') || '<p class="hint">No hay archivos cargados.</p>';
    el(ids.filesList).querySelectorAll('input[data-sede-idx]').forEach(inp => {
      inp.addEventListener('input', () => { entries[+inp.dataset.sedeIdx].sedeName = inp.value.trim(); });
    });
    el(ids.filesList).querySelectorAll('button[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => { entries.splice(+btn.dataset.remove, 1); render(); });
    });
    el(ids.previewCard).classList.toggle('hidden-block', entries.length === 0);
  }

  function handleFiles(files) {
    el(ids.errorBanner).classList.add('hidden-block');
    let pending = files.length;
    files.forEach(file => {
      if (!/\.(xlsx|xls)$/i.test(file.name)) {
        entries.push({ fileName: file.name, error: `"${file.name}" no es .xlsx ni .xls.` });
        if (--pending === 0) render();
        return;
      }
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
          const parsed = parseVentasDiariasFile(rows);
          if (!parsed) {
            entries.push({ fileName: file.name, error: 'No se encontró la fila de encabezado ("Fecha"/"Valor Venta") — debe ser el reporte "Ventas Netas Por Dia" de Tecnocarnes.' });
          } else {
            const names = await knownSedeNames();
            const guessedFromContent = guessSedeFromVentasRows(rows, names);
            const rawGuessFromName = guessSedeName(file.name.replace(/\b(ventas?|netas?|dia|por)\b/gi, '').trim() || file.name);
            // El nombre de archivo también puede traer texto extra pegado
            // (ej. "DECEPAZ 14-20 SEPTIEMBRE.xls") — si coincide con una sede
            // ya conocida se usa esa, en vez de guardar el nombre sucio tal cual.
            const guessedFromName = matchKnownSede(rawGuessFromName, names) || rawGuessFromName;
            entries.push({ fileName: file.name, sedeName: guessedFromContent || guessedFromName || '', parsed });
          }
        } catch (err) {
          entries.push({ fileName: file.name, error: 'No se pudo leer el archivo: ' + err.message });
        }
        if (--pending === 0) render();
      };
      reader.readAsArrayBuffer(file);
    });
  }

  async function saveAll() {
    const valid = entries.filter(e => !e.error && e.sedeName);
    const banner = el(ids.saveBanner);
    if (!valid.length) {
      banner.className = 'banner error'; banner.classList.remove('hidden-block');
      banner.textContent = '⚠ No hay archivos con sede válida para guardar (revisa el campo "Sede" de cada fila).';
      return;
    }
    const btn = el(ids.saveBtn);
    const originalText = btn.textContent;
    btn.disabled = true;
    let totalUpserted = 0;
    for (let i = 0; i < valid.length; i++) {
      const e = valid[i];
      btn.textContent = `Guardando ${i + 1}/${valid.length}…`;
      banner.className = 'banner info'; banner.classList.remove('hidden-block');
      banner.textContent = `Guardando ${i + 1} de ${valid.length}: ${e.sedeName} (${e.parsed.dias.length} días)…`;
      try {
        const result = await ventasApi.saveDias(e.sedeName, e.parsed.dias);
        totalUpserted += result.upserted;
      } catch (err) {
        btn.disabled = false; btn.textContent = originalText;
        banner.className = 'banner error';
        banner.textContent = `⚠ Error guardando ${e.sedeName}: ${err.message}`;
        return;
      }
    }
    btn.disabled = false; btn.textContent = originalText;
    banner.className = 'banner info';
    banner.textContent = `✓ ${valid.length} sede(s) guardada(s) — ${totalUpserted} día(s) en total.`;
    entries = [];
    render();
    ventasAllDias = null; // fuerza recarga
    if (onSaved) await onSaved();
  }

  return { handleFiles, saveAll };
}

// Carga del archivo "PRESUPUESTO.xlsx" (una fila por sede con la meta
// mensual que da la empresa) — llena presupuestos_mensuales de TODAS las
// sedes del mes en curso de una sola vez, en vez de digitarlas una por una
// en la tabla manual de abajo (que sigue disponible para ajustes puntuales).
function createPresupuestoUploader(ids, onSaved) {
  let parsed = null; // { sedes: [{ sedeName, monto }] } | null
  let fileName = '';
  let error = '';

  function render() {
    if (error) {
      el(ids.filesList).innerHTML = `<div class="vent-file-row vent-file-error">
        <div class="vent-file-name">${escapeHtml(fileName)}</div>
        <div class="vent-file-summary">⚠ ${escapeHtml(error)}</div>
      </div>`;
    } else if (parsed) {
      el(ids.filesList).innerHTML = `<div class="vent-file-row">
        <div class="vent-file-name">${escapeHtml(fileName)}</div>
        <div class="vent-file-summary">${parsed.sedes.length} sede(s): ${parsed.sedes.map(s => `${escapeHtml(s.sedeName)} ${fmtCOP(s.monto)}`).join(' · ')}</div>
      </div>`;
    } else {
      el(ids.filesList).innerHTML = '';
    }
    el(ids.previewCard).classList.toggle('hidden-block', !parsed && !error);
  }

  function handleFiles(files) {
    const file = files[0];
    if (!file) return;
    fileName = file.name; error = ''; parsed = null;
    if (!/\.(xlsx|xls)$/i.test(file.name)) { error = `"${file.name}" no es .xlsx ni .xls.`; render(); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
        const result = parsePresupuestoFile(rows);
        if (!result) error = 'No se encontró la columna "PRESUPUESTO" — debe ser el archivo con la meta mensual por sede.';
        else parsed = result;
      } catch (err) {
        error = 'No se pudo leer el archivo: ' + err.message;
      }
      render();
    };
    reader.readAsArrayBuffer(file);
  }

  async function saveAll() {
    if (!parsed) return;
    const { anio, mes } = currentAnioMes();
    const btn = el(ids.saveBtn);
    const originalText = btn.textContent;
    const banner = el(ids.saveBanner);
    btn.disabled = true;
    for (let i = 0; i < parsed.sedes.length; i++) {
      const s = parsed.sedes[i];
      btn.textContent = `Guardando ${i + 1}/${parsed.sedes.length}…`;
      banner.className = 'banner info'; banner.classList.remove('hidden-block');
      banner.textContent = `Guardando ${i + 1} de ${parsed.sedes.length}: ${s.sedeName}…`;
      try {
        await ventasApi.savePresupuesto(s.sedeName, anio, mes, s.monto);
      } catch (err) {
        btn.disabled = false; btn.textContent = originalText;
        banner.className = 'banner error';
        banner.textContent = `⚠ Error guardando ${s.sedeName}: ${err.message}`;
        return;
      }
    }
    btn.disabled = false; btn.textContent = originalText;
    banner.className = 'banner info';
    banner.textContent = `✓ Presupuesto de ${parsed.sedes.length} sede(s) actualizado para ${anio}-${String(mes).padStart(2, '0')}.`;
    parsed = null; fileName = ''; render();
    if (onSaved) await onSaved();
  }

  return { handleFiles, saveAll };
}

const ventUploader = createVentUploader({
  errorBanner: 'ventErrorBanner', previewCard: 'ventPreviewCard', filesList: 'ventFilesList',
  saveBtn: 'ventSaveBtn', saveBanner: 'ventSaveBanner'
});
const presuUploader = createPresupuestoUploader({
  previewCard: 'presuPreviewCard', filesList: 'presuFilesList',
  saveBtn: 'presuSaveBtn', saveBanner: 'presuSaveBanner'
}, async () => {
  const presResult = await ventasApi.getPresupuestos();
  ventasPresupuestos = presResult.presupuestos || [];
  renderPresupuestoTable();
  if (reportesWeeks) renderReportes(); // refresca la sub-vista "🎯 Presupuesto" si está unificada y visible
});

async function loadVentReportesData() {
  el('ventReportesErrorBanner').classList.add('hidden-block');
  el('ventReportesLoadingHint').classList.remove('hidden-block');
  el('ventReportesLoadingHint').textContent = 'Cargando historial…';
  try {
    const [diasResult, presResult] = await Promise.all([ventasApi.getAllDias(), ventasApi.getPresupuestos()]);
    ventasAllDias = diasResult.dias || [];
    ventasPresupuestos = presResult.presupuestos || [];
    if (!ventasAllDias.length) {
      el('ventReportesLoadingHint').textContent = 'Todavía no hay ventas guardadas en el historial.';
      renderPresupuestoTable();
      return;
    }
    el('ventReportesLoadingHint').classList.toggle('hidden-block', !diasResult.fromCache);
    if (diasResult.fromCache) el('ventReportesLoadingHint').textContent = 'Mostrando el último historial disponible en este equipo (sin conexión con el servidor ahora mismo).';
    renderPresupuestoTable();
    if (reportesWeeks) renderReportes(); // refresca la sub-vista "🎯 Presupuesto" si está unificada y visible
  } catch (err) {
    el('ventReportesLoadingHint').classList.add('hidden-block');
    const b = el('ventReportesErrorBanner');
    b.classList.remove('hidden-block');
    b.innerHTML = '⚠ No se pudo cargar el historial: ' + escapeHtml(err.message);
  }
}

function currentAnioMes() {
  const now = new Date();
  return { anio: now.getFullYear(), mes: now.getMonth() + 1 };
}

function renderPresupuestoTable() {
  const { anio, mes } = currentAnioMes();
  const sedeNames = Array.from(new Set([
    ...(ventasAllDias || []).map(d => d.sede_name),
    ...(ventasPresupuestos || []).map(p => p.sede_name)
  ])).sort();
  const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  el('presupuestoTableBody').innerHTML = sedeNames.length ? sedeNames.map(sedeName => {
    const existing = (ventasPresupuestos || []).find(p => p.sede_name === sedeName && p.anio === anio && p.mes === mes);
    const uid = 'pres_' + sedeName.replace(/[^a-z0-9]/gi, '_');
    return `<tr>
      <td class="left">${escapeHtml(sedeName)}</td>
      <td><input type="text" inputmode="decimal" id="${uid}" value="${existing ? existing.monto : ''}" placeholder="0" style="width:140px;text-align:right"></td>
      <td><button class="btn-tiny" data-sede="${escapeHtml(sedeName)}" data-uid="${uid}">Guardar</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="3" class="left hint">Sin sedes todavía — carga ventas primero.</td></tr>`;
  el('presupuestoTableBody').querySelectorAll('button[data-sede]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const monto = parseLocaleNumber(el(btn.dataset.uid).value);
      if (monto == null) return;
      await ventasApi.savePresupuesto(btn.dataset.sede, anio, mes, monto);
      const presResult = await ventasApi.getPresupuestos();
      ventasPresupuestos = presResult.presupuestos || [];
      if (reportesWeeks) renderReportes(); // el presupuesto también alimenta la sub-vista "🎯 Presupuesto" unificada
    });
  });
}

// ---------------- Modo claro/oscuro (paneles tipo dashboard) ----------------
// Los 6 paneles con fondo oscuro ("estilo Power BI") son los únicos oscuros
// de la app — el resto ya usa el tema claro "Sello de Calidad". Reusa las
// variables --dv-* ya definidas para el estilo "minimalista" (blanco) en vez
// de inventar un tema nuevo — ver el bloque de comentario en main.css sobre
// los 5 estilos seleccionables del Panel comparativo.
const DASH_STYLE_CONTAINER_IDS = ['dashboardView', 'balanceResultsView', 'reportesView', 'reportesMovView', 'reportesAudView'];
let themeMode = localStorage.getItem('themeMode') || 'dark';

function applyThemeMode() {
  const styleId = themeMode === 'light' ? 'minimalista' : app.dashStyleId;
  DASH_STYLE_CONTAINER_IDS.forEach(id => { const node = el(id); if (node) node.dataset.dashStyle = styleId; });
  const btn = el('themeModeToggleBtn');
  if (btn) btn.textContent = themeMode === 'light' ? '☀️ Modo claro' : '🌙 Modo oscuro';
  if (window.__dashData) { renderSedeChart(window.__dashData); renderCategoryChart(window.__dashData, el('filterSede').value); }
  if (reportesWeeks) renderReportes();
  if (movHistWeeks) renderMovHist();
  if (audHistAudits) renderAudReportes();
}

function toggleThemeMode() {
  themeMode = themeMode === 'light' ? 'dark' : 'light';
  try { localStorage.setItem('themeMode', themeMode); } catch { /* almacenamiento no disponible: se ignora */ }
  applyThemeMode();
}

// ---------------- Init ----------------
// NOTA: los scripts type="module" siempre se ejecutan después de que el HTML
// terminó de parsearse (misma garantía que un script "defer"), así que aquí
// NO hace falta esperar 'DOMContentLoaded' — de hecho, esperar ese evento es
// una carrera: en algunos entornos ya se disparó antes de que este módulo
// termine de registrarse, y el listener nunca se ejecuta.
el('brandStampLogo').src = 'data:image/jpeg;base64,' + LOGO_BRANGUS_BASE64;
initDropzone();
initTemplateSelector();
initDashboardStyleSelector();
el('genBtn').addEventListener('click', generateReport);
el('downloadAllBtn').addEventListener('click', exportAllExcel);
el('tabDetalleBtn').addEventListener('click', () => switchTab('detalle'));
el('tabDashboardBtn').addEventListener('click', () => switchTab('dashboard'));
el('filterSede').addEventListener('change', onDashboardFilterChange);
el('filterCategoria').addEventListener('change', onDashboardFilterChange);

el('modeMovimientosBtn').addEventListener('click', () => switchFlow('movimientos'));
el('modeBalanceBtn').addEventListener('click', () => { balanceReturnTo = 'choice'; switchFlow('balance'); });
el('backFromMovimientosBtn').addEventListener('click', () => switchFlow('choice'));
el('backFromBalanceBtn').addEventListener('click', () => {
  const to = balanceReturnTo;
  balanceReturnTo = 'choice';
  switchFlow(to);
});
el('reportesUploadBalanceBtn').addEventListener('click', () => { balanceReturnTo = 'reportes'; switchFlow('balance'); });
initBalanceDropzones();
el('balanceSedeInput').addEventListener('change', refreshInvInicialState);
el('balanceSedeInput').addEventListener('input', updateBalanceGenerateButtonState);
el('balanceWeekStartInput').addEventListener('change', refreshInvInicialState);
el('balanceWeekEndInput').addEventListener('change', updateBalanceGenerateButtonState);
el('balanceInvInicialInput').addEventListener('input', updateBalanceGenerateButtonState);
el('balanceGenBtn').addEventListener('click', generateBalanceReport);
el('balanceSaveWeekBtn').addEventListener('click', saveBalanceWeek);
el('balanceDownloadExcelBtn').addEventListener('click', exportBalanceExcel);
el('balanceDownloadReportBtn').addEventListener('click', downloadBalanceReport);

el('modeReportesBtn').addEventListener('click', () => switchFlow('reportes'));
el('backFromReportesBtn').addEventListener('click', () => switchFlow('choice'));
el('reportesMetrica').addEventListener('change', () => { reportesSelectedPeriods = null; renderReportes(); });
el('reportesGranularity').addEventListener('change', () => { reportesSelectedPeriods = null; renderReportes(); });
el('reportesSedeFilter').addEventListener('change', renderReportes);
el('reportesDownloadBtn').addEventListener('click', downloadReportesReport);
document.querySelectorAll('#reportesSubViewTabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchReportesSubView(btn.dataset.subview));
});
document.querySelectorAll('#reportesMermasSubTabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchMermasSubView(btn.dataset.mermasSubview));
});

el('reportesTypeBalanceBtn').addEventListener('click', () => switchReportesType('balance'));
el('reportesTypeMovimientosBtn').addEventListener('click', () => switchReportesType('movimientos'));
el('reportesTypeAuditoriasBtn').addEventListener('click', () => switchReportesType('auditorias'));
wireMultiFileDropzone('movDropzone', 'movFileInput', movUploader.handleFiles);
el('movSaveWeekBtn').addEventListener('click', movUploader.saveAll);
el('reportesMermasBloque').addEventListener('change', () => { movBloqueFilter = el('reportesMermasBloque').value; renderReportes(); });
el('audReportesGranularity').addEventListener('change', renderAudReportes);
el('audReportesSedeFilter').addEventListener('change', renderAudReportes);
el('audReportesDownloadBtn').addEventListener('click', downloadAudReportesReport);

el('modeAuditoriasBtn').addEventListener('click', () => switchFlow('auditorias'));
el('backFromAuditoriasBtn').addEventListener('click', () => switchFlow('choice'));
el('audSedeInput').addEventListener('input', updateAuditSaveState);
el('audDateInput').addEventListener('change', updateAuditSaveState);
el('audSaveBtn').addEventListener('click', saveAudit);

el('modeVentasBtn').addEventListener('click', () => switchFlow('ventas'));
el('backFromVentasBtn').addEventListener('click', () => switchFlow('choice'));
wireMultiFileDropzone('ventDropzone', 'ventFileInput', ventUploader.handleFiles);
el('ventSaveBtn').addEventListener('click', ventUploader.saveAll);

el('reportesTypeVentasBtn').addEventListener('click', () => switchReportesType('ventas'));
el('themeModeToggleBtn').addEventListener('click', toggleThemeMode);
initPeriodPopover('reportesPeriodBtn', 'reportesPeriodPopover', 'reportesPeriodAllBtn', 'reportesPeriodNoneBtn');
applyThemeMode();
wireMultiFileDropzone('presuDropzone', 'presuFileInput', presuUploader.handleFiles);
el('presuSaveBtn').addEventListener('click', presuUploader.saveAll);

switchFlow('choice');
