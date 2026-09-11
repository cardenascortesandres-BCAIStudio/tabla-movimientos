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
import { computeDashboardData, serializeDashboardData } from './dashboard/dashboardData.js';
import { exportSedeToExcel, exportConsolidatedToExcel } from './export/excelExport.js';
import { buildInteractiveReportHtml } from './export/htmlReportExport.js';
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
import * as movimientosApi from './movimientos/movimientosApi.js';
import { aggregateByPeriod as aggregateMovByPeriod } from './movimientos/movimientosDashboardData.js';

import { AUDIT_BLOCKS, AUDIT_TOTAL_ITEMS } from './data/auditChecklist.js';
import * as auditoriasApi from './auditorias/auditoriasApi.js';
import { aggregateByPeriod as aggregateAudByPeriod, combineBlockPct } from './auditorias/auditoriasDashboardData.js';
import { buildAuditoriasReportHtml } from './export/auditoriasHtmlReportExport.js';

import { parseVentasDiariasFile, guessSedeFromVentasRows } from './core/ventasFileParse.js';
import * as ventasApi from './ventas/ventasApi.js';
import { aggregateByPeriod as aggregateVentByPeriod } from './ventas/ventasDashboardData.js';

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
    const { weeks } = await balanceApi.getAllWeeks();
    const html = buildBalanceReportHtml(weeks, chartJsRawSource, {});
    downloadBlob(html, 'balance_comparativo.html', 'text/html');
  } catch (err) {
    banner.className = 'banner error';
    banner.textContent = '⚠ No se pudo generar el informe comparativo: ' + err.message + ' (necesita conexión con el historial guardado).';
    banner.classList.remove('hidden-block');
  }
}

// ---------------- Reportes ----------------
let reportesWeeks = null; // filas crudas de balance_weeks (todas las sedes), cargadas una vez por visita
let chartReportesMargen, chartReportesUtilidad;
let reportesSelectedPeriods = null; // Set<periodKey> | null (null = todos los periodos disponibles)

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
  const allSedeNames = Array.from(new Set([...data.sedeNames, ...((ventasAllDias || []).map(d => d.sede_name))])).sort();
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

  renderReportesCharts(metric, data, ventaData, sedeFilter, periodKeysInScope, granularity, periodLabelOf);
  renderReportesTable(metric, data, ventaData, sedeFilter, periodKeysInScope);
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

function renderReportesCharts(metric, data, ventaData, sedeFilter, periodKeysInScope, granularity, periodLabelOf) {
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

  // ---- "Comparativa entre sedes": suma (o margen ponderado) de los periodos
  // seleccionados, ordenado de mayor a menor ----
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
  chartReportesUtilidad = new Chart(el('chartReportesUtilidad').getContext('2d'), {
    type: 'bar', data: { labels: barLabels, datasets: [{ data: barValues, backgroundColor: barColors, borderRadius: 6 }] },
    options: Object.assign(dashboardChartOptions(metricLabel + ' — ' + scopeLabel, 'reportesView', valueFmt), { indexAxis: 'y' })
  });
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
  const html = buildBalanceReportHtml(reportesWeeks, ventasAllDias || [], chartJsRawSource, {});
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
  if (type === 'movimientos' && !movHistWeeks) loadMovHistData();
  if (type === 'auditorias' && !audHistAudits) loadAudReportesData();
  if (type === 'ventas' && !ventasAllDias) loadVentReportesData();
}

// ---------------- Reportes de Tabla de Movimientos ----------------
let movRawRows = null;      // filas crudas (header:1) del archivo YA editado que se acaba de cargar
let movParsedData = null;   // forma computeDashboardData() para la semana cargada
let movHistWeeks = null;    // filas crudas de movimientos_weeks (todas las sedes)
let chartMovDiferencia, chartMovSedes;

function handleMovFile(file) {
  if (!/\.(xlsx|xls)$/i.test(file.name)) { showMovError(`"${file.name}" no es .xlsx ni .xls.`); return; }
  el('movErrorBanner').classList.add('hidden-block');
  el('movFileName').textContent = file.name;
  if (!el('movSedeInput').value.trim()) el('movSedeInput').value = guessSedeName(file.name);
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      movRawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
      reparseMovFile();
    } catch (err) {
      movRawRows = null;
      showMovError('No se pudo leer el archivo: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function showMovError(msg) {
  const b = el('movErrorBanner');
  b.classList.remove('hidden-block');
  b.innerHTML = '⚠ ' + escapeHtml(msg);
  el('movPreviewCard').classList.add('hidden-block');
}

function reparseMovFile() {
  if (!movRawRows) return;
  const sedeName = el('movSedeInput').value.trim() || 'Sede';
  const data = parseFinalMovimientosFile(movRawRows, sedeName);
  if (!data) {
    showMovError('No se encontraron las columnas "Disponible"/"Diferencia KL" (o los bloques de categoría) en este archivo — debe ser el Excel ya generado por la herramienta.');
    movParsedData = null;
    return;
  }
  movParsedData = data;
  el('movErrorBanner').classList.add('hidden-block');
  renderMovPreview();
}

function renderMovPreview() {
  if (!movParsedData) return;
  const d = movParsedData;
  el('movPreviewCard').classList.remove('hidden-block');
  const pctGlobal = d.totalDisponible === 0 ? 0 : d.totalDiferencia / d.totalDisponible;
  el('movKpiGrid').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Categorías</div><div class="kpi-value">${d.byCategory.size}</div></div>
    <div class="kpi-card"><div class="kpi-label">Productos</div><div class="kpi-value">${d.allProductRows.length}</div></div>
    <div class="kpi-card"><div class="kpi-label">Disponible total</div><div class="kpi-value">${fmt(d.totalDisponible)}</div></div>
    <div class="kpi-card ${d.totalDiferencia < 0 ? 'kpi-neg' : 'kpi-pos'}"><div class="kpi-label">Diferencia KL total</div><div class="kpi-value">${fmt(d.totalDiferencia)}</div></div>
    <div class="kpi-card ${d.totalDiferencia < 0 ? 'kpi-neg' : 'kpi-pos'}"><div class="kpi-label">% Diferencia global</div><div class="kpi-value">${fmtPct(pctGlobal)}</div></div>
    <div class="kpi-card kpi-neg"><div class="kpi-label">Productos con faltante</div><div class="kpi-value">${d.totalProductosNeg}</div></div>`;

  el('movCategoriaBody').innerHTML = Array.from(d.byCategory.entries()).map(([category, agg]) => {
    const pct = agg.disponible === 0 ? 0 : agg.diferenciaKL / agg.disponible;
    const cls = agg.diferenciaKL < -0.01 ? 'diff-neg' : (Math.abs(agg.diferenciaKL) < 0.01 ? 'diff-zero' : '');
    return `<tr><td class="left">${escapeHtml(category)}</td><td>${fmt(agg.disponible)}</td><td class="${cls}">${fmt(agg.diferenciaKL)}</td><td>${fmtPct(pct)}</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="left hint">Sin categorías.</td></tr>';
}

async function saveMovWeek() {
  if (!movParsedData) return;
  const sedeName = el('movSedeInput').value.trim();
  const weekStart = el('movWeekStartInput').value;
  const weekEnd = el('movWeekEndInput').value;
  const banner = el('movSaveBanner');
  if (!sedeName || !weekStart) {
    banner.className = 'banner error'; banner.classList.remove('hidden-block');
    banner.textContent = '⚠ Escribe la sede y la fecha de inicio de semana antes de guardar.';
    return;
  }
  try {
    const computed = {
      totalDisponible: movParsedData.totalDisponible,
      totalDiferencia: movParsedData.totalDiferencia,
      totalProductosNeg: movParsedData.totalProductosNeg,
      byCategory: Array.from(movParsedData.byCategory.entries()).map(([category, v]) => ({ category, ...v }))
    };
    await movimientosApi.saveWeek({ sedeName, weekKey: weekStart, weekStart, weekEnd: weekEnd || null, computed });
    banner.className = 'banner info'; banner.classList.remove('hidden-block');
    banner.textContent = '✓ Semana guardada en el historial.';
    movHistWeeks = null; // fuerza recarga del histórico
    loadMovHistData(); // refresca de inmediato la sección de abajo, sin esperar a que se vuelva a abrir la pestaña
  } catch (err) {
    banner.className = 'banner error'; banner.classList.remove('hidden-block');
    banner.textContent = '⚠ No se pudo guardar: ' + err.message;
  }
}

function downloadMovReport() {
  if (!movParsedData) return;
  const html = buildInteractiveReportHtml(serializeDashboardData(movParsedData), chartJsRawSource, {});
  downloadBlob(html, 'movimientos_' + safeName(el('movSedeInput').value) + '.html', 'text/html');
}

async function loadMovHistData() {
  el('movHistView').classList.add('hidden-block');
  el('movHistLoadingHint').classList.remove('hidden-block');
  el('movHistLoadingHint').textContent = 'Cargando historial…';
  try {
    const { weeks, fromCache } = await movimientosApi.getAllWeeks();
    movHistWeeks = weeks || [];
    if (!movHistWeeks.length) {
      el('movHistLoadingHint').textContent = 'Todavía no hay semanas guardadas en el historial.';
      return;
    }
    el('movHistLoadingHint').classList.toggle('hidden-block', !fromCache);
    if (fromCache) el('movHistLoadingHint').textContent = 'Mostrando el último historial disponible en este equipo (sin conexión con el servidor ahora mismo).';
    el('movHistView').classList.remove('hidden-block');
    renderMovHist();
  } catch (err) {
    el('movHistLoadingHint').textContent = '⚠ No se pudo cargar el historial: ' + err.message;
  }
}

function renderMovHist() {
  if (!movHistWeeks) return;
  const granularity = el('movGranularity').value;
  const data = aggregateMovByPeriod(movHistWeeks, granularity);

  const sedeSel = el('movSedeFilter');
  const prevSede = sedeSel.value;
  sedeSel.innerHTML = '<option value="">Todas las sedes</option>' + data.sedeNames.map(s => `<option>${escapeHtml(s)}</option>`).join('');
  if (data.sedeNames.includes(prevSede)) sedeSel.value = prevSede;
  const sedeFilter = sedeSel.value;

  const allPoints = Array.from(data.bySede.values()).flat().filter(p => !sedeFilter || p.sedeName === sedeFilter);
  const lastPeriod = data.periodKeysSorted[data.periodKeysSorted.length - 1];
  const lastPoints = allPoints.filter(p => p.periodKey === lastPeriod);
  const lastDisponible = lastPoints.reduce((a, p) => a + p.disponible, 0);
  const lastDiferencia = lastPoints.reduce((a, p) => a + p.diferenciaKL, 0);
  const lastPct = lastDisponible === 0 ? 0 : lastDiferencia / lastDisponible;
  const GRAN_LABEL = { week: 'semana', month: 'mes', year: 'año' };
  el('movHistKpiGrid').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Sedes con historial</div><div class="kpi-value">${data.sedeNames.length}</div></div>
    <div class="kpi-card"><div class="kpi-label">Semanas guardadas</div><div class="kpi-value">${movHistWeeks.length}</div></div>
    <div class="kpi-card ${lastDiferencia < 0 ? 'kpi-neg' : 'kpi-pos'}"><div class="kpi-label">Diferencia KL — último ${GRAN_LABEL[granularity]}</div><div class="kpi-value">${fmt(lastDiferencia)}</div></div>
    <div class="kpi-card ${lastDiferencia < 0 ? 'kpi-neg' : 'kpi-pos'}"><div class="kpi-label">% Diferencia — último ${GRAN_LABEL[granularity]}</div><div class="kpi-value">${fmtPct(lastPct)}</div></div>`;

  renderMovHistCharts(data, sedeFilter);
  renderMovHistTable(data, sedeFilter);
}

function renderMovHistCharts(data, sedeFilter) {
  const series = sedeFilter ? [[sedeFilter, data.bySede.get(sedeFilter) || []]] : Array.from(data.bySede.entries());
  const labels = data.periodKeysSorted.map(k => (data.byPeriod.get(k) || [])[0]?.periodLabel || k);
  const palette = SEDE_PALETTE;

  if (chartMovDiferencia) chartMovDiferencia.destroy();
  const diffDatasets = series.map(([sedeName, points], i) => {
    const byPeriod = new Map(points.map(p => [p.periodKey, p.diferenciaKL]));
    return { label: sedeName, data: data.periodKeysSorted.map(k => byPeriod.has(k) ? byPeriod.get(k) : null), borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length], spanGaps: true, tension: .25 };
  });
  const diffOpts = dashboardChartOptions('Diferencia KL en el tiempo', 'reportesMovView');
  diffOpts.plugins.legend.display = series.length > 1;
  chartMovDiferencia = new Chart(el('chartMovDiferencia').getContext('2d'), { type: 'line', data: { labels, datasets: diffDatasets }, options: diffOpts });

  if (chartMovSedes) chartMovSedes.destroy();
  const diffBySede = series.map(([sedeName, points]) => [sedeName, points.reduce((a, p) => a + p.diferenciaKL, 0)]);
  const sedeLabels = diffBySede.map(([s]) => s), sedeValues = diffBySede.map(([, v]) => v);
  chartMovSedes = new Chart(el('chartMovSedes').getContext('2d'), {
    type: 'bar', data: { labels: sedeLabels, datasets: [{ data: sedeValues, backgroundColor: chartColors(sedeValues, 'reportesMovView'), borderRadius: 6 }] },
    options: Object.assign(dashboardChartOptions('Diferencia KL acumulada por sede', 'reportesMovView'), { indexAxis: 'y' })
  });
}

function renderMovHistTable(data, sedeFilter) {
  let rows = Array.from(data.bySede.values()).flat();
  if (sedeFilter) rows = rows.filter(r => r.sedeName === sedeFilter);
  rows = rows.slice().sort((a, b) => (a.periodKey < b.periodKey ? 1 : -1));
  el('movHistTableBody').innerHTML = rows.map(r => {
    const cls = r.diferenciaKL < -0.01 ? 'diff-neg' : (Math.abs(r.diferenciaKL) < 0.01 ? 'diff-zero' : '');
    return `<tr><td class="left">${escapeHtml(r.sedeName)}</td><td class="left">${escapeHtml(r.periodLabel)}</td><td>${fmt(r.disponible)}</td><td class="${cls}">${fmt(r.diferenciaKL)}</td><td>${fmtPct(r.pctDiferencia)}</td></tr>`;
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

// ---------------- Ventas Diarias (carga desde la pantalla inicial) ----------------
let ventFileRows = null, ventParsedDias = null;

function readVentasFile(file, onParsed, onError) {
  if (!/\.(xlsx|xls)$/i.test(file.name)) { onError(`"${file.name}" no es .xlsx ni .xls.`); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
      const parsed = parseVentasDiariasFile(rows);
      if (!parsed) { onError('No se encontró la fila de encabezado ("Fecha"/"Kilos"/"Valor Venta") en este archivo — debe ser el reporte "Ventas Netas Por Dia" de Tecnocarnes.'); return; }
      onParsed(rows, parsed);
    } catch (err) {
      onError('No se pudo leer el archivo: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function ventasPreviewHtml(parsed) {
  const total = parsed.dias.reduce((a, d) => a + d.valorVenta, 0);
  const kilos = parsed.dias.reduce((a, d) => a + (d.kilos || 0), 0);
  return `
    <div class="kpi-card"><div class="kpi-label">Días en el archivo</div><div class="kpi-value">${parsed.dias.length}</div></div>
    <div class="kpi-card"><div class="kpi-label">Rango de fechas</div><div class="kpi-value" style="font-size:16px">${parsed.dias[0].fecha} → ${parsed.dias[parsed.dias.length - 1].fecha}</div></div>
    <div class="kpi-card kpi-pos"><div class="kpi-label">Venta total</div><div class="kpi-value">${fmtCOP(total)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Kilos totales</div><div class="kpi-value">${fmt(kilos)}</div></div>`;
}

function handleVentFile(file) {
  el('ventErrorBanner').classList.add('hidden-block');
  el('ventFileName').textContent = file.name;
  if (!el('ventSedeInput').value.trim()) el('ventSedeInput').value = guessSedeName(file.name.replace(/\b(ventas?|netas?|dia|por)\b/gi, '').trim() || file.name);
  readVentasFile(file, (rows, parsed) => {
    if (!el('ventSedeInput').value.trim()) {
      const guessed = guessSedeFromVentasRows(rows, ventasAllDias ? Array.from(new Set(ventasAllDias.map(d => d.sede_name))) : []);
      if (guessed) el('ventSedeInput').value = guessed;
    }
    ventFileRows = rows; ventParsedDias = parsed;
    el('ventPreviewCard').classList.remove('hidden-block');
    el('ventKpiGrid').innerHTML = ventasPreviewHtml(parsed);
  }, showVentError);
}

function showVentError(msg) {
  const b = el('ventErrorBanner');
  b.classList.remove('hidden-block');
  b.innerHTML = '⚠ ' + escapeHtml(msg);
  el('ventPreviewCard').classList.add('hidden-block');
}

async function saveVentDias() {
  if (!ventParsedDias) return;
  const sedeName = el('ventSedeInput').value.trim();
  const banner = el('ventSaveBanner');
  if (!sedeName) {
    banner.className = 'banner error'; banner.classList.remove('hidden-block');
    banner.textContent = '⚠ Escribe la sede antes de guardar.';
    return;
  }
  try {
    const result = await ventasApi.saveDias(sedeName, ventParsedDias.dias);
    banner.className = 'banner info'; banner.classList.remove('hidden-block');
    banner.textContent = `✓ ${result.upserted} día(s) guardado(s)/actualizado(s) en el historial.`;
    ventasAllDias = null; // fuerza recarga la próxima vez que se abra Reportes > Ventas
  } catch (err) {
    banner.className = 'banner error'; banner.classList.remove('hidden-block');
    banner.textContent = '⚠ No se pudo guardar: ' + err.message;
  }
}

// ---------------- Presupuesto y carga de Ventas ----------------
// La comparativa de venta/margen/utilidad vive unificada en Reportes >
// Balance (ver renderReportes/renderReportesCharts arriba, que ya leen
// ventasAllDias) — esta pestaña solo carga el archivo diario y gestiona el
// presupuesto mensual por sede, con un único gráfico operativo (acumulado
// del mes vs. presupuesto).
let ventasAllDias = null;       // filas crudas de ventas_dias (todas las sedes) — compartido con Reportes > Balance
let ventasPresupuestos = null;  // filas crudas de presupuestos_mensuales
let ventRepFileRows = null, ventRepParsedDias = null;
let chartVentPresupuesto;

function handleVentRepFile(file) {
  el('ventRepErrorBanner').classList.add('hidden-block');
  el('ventRepFileName').textContent = file.name;
  if (!el('ventRepSedeInput').value.trim()) el('ventRepSedeInput').value = guessSedeName(file.name.replace(/\b(ventas?|netas?|dia|por)\b/gi, '').trim() || file.name);
  readVentasFile(file, (rows, parsed) => {
    if (!el('ventRepSedeInput').value.trim()) {
      const guessed = guessSedeFromVentasRows(rows, ventasAllDias ? Array.from(new Set(ventasAllDias.map(d => d.sede_name))) : []);
      if (guessed) el('ventRepSedeInput').value = guessed;
    }
    ventRepFileRows = rows; ventRepParsedDias = parsed;
    el('ventRepPreviewCard').classList.remove('hidden-block');
    el('ventRepKpiGrid').innerHTML = ventasPreviewHtml(parsed);
  }, (msg) => {
    const b = el('ventRepErrorBanner');
    b.classList.remove('hidden-block'); b.innerHTML = '⚠ ' + escapeHtml(msg);
    el('ventRepPreviewCard').classList.add('hidden-block');
  });
}

async function saveVentRepDias() {
  if (!ventRepParsedDias) return;
  const sedeName = el('ventRepSedeInput').value.trim();
  const banner = el('ventRepSaveBanner');
  if (!sedeName) {
    banner.className = 'banner error'; banner.classList.remove('hidden-block');
    banner.textContent = '⚠ Escribe la sede antes de guardar.';
    return;
  }
  try {
    const result = await ventasApi.saveDias(sedeName, ventRepParsedDias.dias);
    banner.className = 'banner info'; banner.classList.remove('hidden-block');
    banner.textContent = `✓ ${result.upserted} día(s) guardado(s)/actualizado(s).`;
    ventasAllDias = null;
    await loadVentReportesData();
  } catch (err) {
    banner.className = 'banner error'; banner.classList.remove('hidden-block');
    banner.textContent = '⚠ No se pudo guardar: ' + err.message;
  }
}

async function loadVentReportesData() {
  el('reportesVentView').classList.add('hidden-block');
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
    el('reportesVentView').classList.remove('hidden-block');
    renderPresupuestoTable();
    renderVentPresupuestoChart();
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
      renderVentPresupuestoChart();
      if (reportesWeeks) renderReportes(); // el presupuesto también alimenta el KPI de cumplimiento en Balance
    });
  });
}

// Único gráfico operativo de esta pestaña: acumulado del mes en curso vs.
// presupuesto, por sede — la comparativa de venta en el tiempo / entre sedes
// ya vive unificada en Reportes > Balance (selector de métrica "Venta real").
function renderVentPresupuestoChart() {
  if (!ventasAllDias) return;
  const { anio, mes } = currentAnioMes();
  const mesPrefix = `${anio}-${String(mes).padStart(2, '0')}`;
  const diasDelMes = ventasAllDias.filter(d => String(d.fecha).slice(0, 7) === mesPrefix);
  const sedesDelMes = Array.from(new Set(diasDelMes.map(d => d.sede_name))).sort();

  if (chartVentPresupuesto) chartVentPresupuesto.destroy();
  const acumPorSede = sedesDelMes.map(s => diasDelMes.filter(d => d.sede_name === s).reduce((a, d) => a + Number(d.valor_venta), 0));
  const presPorSede = sedesDelMes.map(s => Number((ventasPresupuestos || []).find(p => p.sede_name === s && p.anio === anio && p.mes === mes)?.monto || 0));
  const opts = dashboardChartOptions('Acumulado vs. presupuesto — mes en curso', 'reportesVentView');
  opts.plugins.legend.display = true;
  chartVentPresupuesto = new Chart(el('chartVentPresupuesto').getContext('2d'), {
    type: 'bar',
    data: { labels: sedesDelMes, datasets: [
      { label: 'Acumulado del mes', data: acumPorSede, backgroundColor: dashVar('--dv-chart-pos', 'reportesVentView'), borderRadius: 6 },
      { label: 'Presupuesto', data: presPorSede, backgroundColor: dashVar('--dv-text-muted', 'reportesVentView'), borderRadius: 6 }
    ] },
    options: opts
  });
}

// ---------------- Modo claro/oscuro (paneles tipo dashboard) ----------------
// Los 6 paneles con fondo oscuro ("estilo Power BI") son los únicos oscuros
// de la app — el resto ya usa el tema claro "Sello de Calidad". Reusa las
// variables --dv-* ya definidas para el estilo "minimalista" (blanco) en vez
// de inventar un tema nuevo — ver el bloque de comentario en main.css sobre
// los 5 estilos seleccionables del Panel comparativo.
const DASH_STYLE_CONTAINER_IDS = ['dashboardView', 'balanceResultsView', 'reportesView', 'reportesMovView', 'reportesAudView', 'reportesVentView'];
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
  if (ventasAllDias) renderVentPresupuestoChart();
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
el('modeBalanceBtn').addEventListener('click', () => switchFlow('balance'));
el('backFromMovimientosBtn').addEventListener('click', () => switchFlow('choice'));
el('backFromBalanceBtn').addEventListener('click', () => switchFlow('choice'));
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

el('reportesTypeBalanceBtn').addEventListener('click', () => switchReportesType('balance'));
el('reportesTypeMovimientosBtn').addEventListener('click', () => switchReportesType('movimientos'));
el('reportesTypeAuditoriasBtn').addEventListener('click', () => switchReportesType('auditorias'));
wireBalanceDropzone('movDropzone', 'movFileInput', handleMovFile);
el('movSedeInput').addEventListener('input', reparseMovFile);
el('movSaveWeekBtn').addEventListener('click', saveMovWeek);
el('movDownloadReportBtn').addEventListener('click', downloadMovReport);
el('movGranularity').addEventListener('change', renderMovHist);
el('movSedeFilter').addEventListener('change', renderMovHist);
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
wireBalanceDropzone('ventDropzone', 'ventFileInput', handleVentFile);
el('ventSaveBtn').addEventListener('click', saveVentDias);

el('reportesTypeVentasBtn').addEventListener('click', () => switchReportesType('ventas'));
el('themeModeToggleBtn').addEventListener('click', toggleThemeMode);
initPeriodPopover('reportesPeriodBtn', 'reportesPeriodPopover', 'reportesPeriodAllBtn', 'reportesPeriodNoneBtn');
applyThemeMode();
wireBalanceDropzone('ventRepDropzone', 'ventRepFileInput', handleVentRepFile);
el('ventRepSaveBtn').addEventListener('click', saveVentRepDias);

switchFlow('choice');
