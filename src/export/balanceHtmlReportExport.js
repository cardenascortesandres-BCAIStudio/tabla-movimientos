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

export function buildBalanceReportHtml(rawWeekRows, rawVentaRows, rawPresupuestoRows, rawMovWeekRows, rawHorasRows, chartJsSource, meta) {
  const rawWeeks = (rawWeekRows || []).map(w => ({
    sedeName: w.sede_name, weekStart: w.week_start, weekEnd: w.week_end, computed: w.computed || {}
  }));
  const rawVentas = (rawVentaRows || []).map(d => ({ sedeName: d.sede_name, fecha: d.fecha, valorVenta: Number(d.valor_venta) || 0 }));
  const rawPresupuestos = (rawPresupuestoRows || []).map(p => ({ sedeName: p.sede_name, anio: p.anio, mes: p.mes, monto: Number(p.monto) || 0 }));
  const rawMovWeeks = (rawMovWeekRows || []).map(w => ({
    sedeName: w.sede_name, weekStart: w.week_start, weekEnd: w.week_end, computed: w.computed || {}
  }));
  const rawHoras = (rawHorasRows || []).map(r => ({
    sedeName: r.sede_name, empleadoId: r.empleado_id, empleadoNombre: r.empleado_nombre, cargo: r.cargo,
    fecha: r.fecha, total: Number(r.total) || 0, he: Number(r.he) || 0, hen: Number(r.hen) || 0,
    hefd: Number(r.hefd) || 0, hefn: Number(r.hefn) || 0, hdo: Number(r.hdo) || 0, rn: Number(r.rn) || 0,
    rndyf: Number(r.rndyf) || 0, dom: Number(r.dom) || 0, d: Number(r.d) || 0, f: Number(r.f) || 0,
    comida: Number(r.comida) || 0, estadoDia: r.estado_dia || ''
  }));
  const dataJson = JSON.stringify(rawWeeks);
  const ventasJson = JSON.stringify(rawVentas);
  const presupuestosJson = JSON.stringify(rawPresupuestos);
  const movJson = JSON.stringify(rawMovWeeks);
  const horasJson = JSON.stringify(rawHoras);
  const generatedAt = new Date().toLocaleString('es-CO');
  const title = `Reportes Brangus${meta?.periodo ? ' — ' + meta.periodo : ''}`;
  const sedeCount = new Set(rawWeeks.map(w => w.sedeName)).size;
  // "Corte a": el último día real con ventas cargadas (ventas_dias, ver
  // rawVentas) — no la fecha de generación del archivo, que solo dice CUÁNDO
  // se descargó, no HASTA QUÉ DÍA llegan los datos.
  const MESES_FULL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const ultimaFechaVenta = rawVentas.reduce((max, d) => {
    const f = String(d.fecha).slice(0, 10);
    return !max || f > max ? f : max;
  }, null);
  const corteLabel = ultimaFechaVenta ? (() => {
    const d = new Date(ultimaFechaVenta + 'T00:00:00Z');
    return `${d.getUTCDate()} de ${MESES_FULL[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  })() : null;

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
      <p class="sub">Generado el ${escapeHtml(generatedAt)}${meta?.appBuild ? ' · versión de la app ' + escapeHtml(meta.appBuild) : ''}${corteLabel ? ' · con corte a ' + escapeHtml(corteLabel) : ''} · ${sedeCount} sede(s) · ${rawWeeks.length} semana(s) guardada(s)</p>
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
    <button class="view-tab" data-view="mermas">📋 Mermas</button>
    <button class="view-tab" data-view="horas">⏱ Horas Extras</button>
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
    <select id="filterBloque"></select>
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
  <section class="view-panel hidden-block" id="view-mermas">
    <div class="kpi-grid" id="mermasKpiGrid" style="margin-bottom:16px"></div>

    <nav class="view-tabs" id="mermasSubTabs" style="margin-bottom:14px;">
      <button class="view-tab active mermas-sub-tab" data-mermas-view="tiempo">📈 Serie de tiempo</button>
      <button class="view-tab mermas-sub-tab" data-mermas-view="sedes">🏢 Comparativa entre sedes</button>
      <button class="view-tab mermas-sub-tab" data-mermas-view="bloques">📋 Diferencia por bloque</button>
    </nav>

    <div class="mermas-sub-panel" id="mermas-sub-tiempo">
      <div class="chart-box" style="margin-bottom:16px"><canvas id="chartMermasTiempo"></canvas></div>
    </div>
    <div class="mermas-sub-panel hidden-block" id="mermas-sub-sedes">
      <div class="chart-box" style="margin-bottom:16px"><canvas id="chartMermasSedes"></canvas></div>
    </div>
    <div class="mermas-sub-panel hidden-block" id="mermas-sub-bloques">
      <p class="hint" id="mermasDrillHint">Elige una sede específica arriba y haz clic en una barra para ver el detalle de productos de ese bloque.</p>
      <div class="chart-box" style="margin-bottom:16px"><canvas id="chartMermasBloques"></canvas></div>
      <table class="dtable hidden-block" id="mermasDrillTable">
        <caption id="mermasDrillTitle" style="text-align:left;font-weight:700;margin-bottom:8px;">Detalle de productos</caption>
        <thead><tr><th class="left">Código</th><th class="left">Producto</th><th>Disponible</th><th>Diferencia KL</th><th>% Diferencia</th></tr></thead>
        <tbody id="mermasDrillTableBody"></tbody>
      </table>
      <table class="dtable" id="mermasTable" style="margin-top:16px;">
        <thead><tr><th class="left">Sede</th><th class="left">Periodo</th><th>Disponible</th><th>Diferencia KL</th><th>% Diferencia</th></tr></thead>
        <tbody id="mermasTableBody"></tbody>
      </table>
    </div>
  </section>
  <section class="view-panel hidden-block" id="view-horas">
    <div class="kpi-grid" id="horasKpiGrid" style="margin-bottom:16px"></div>
    <div id="horasEmpleadoDetalle" class="hidden-block" style="margin-bottom:16px;"></div>
    <table class="dtable" id="horasAlertasTable" style="margin-bottom:16px;">
      <caption id="horasAlertasCaption" style="text-align:left;font-weight:700;margin-bottom:8px;">Alertas — última semana completa con datos</caption>
      <thead><tr><th class="left">Empleado</th><th class="left">Sede</th><th class="left">Cargo</th><th>Horas extra (semana)</th><th>Estado</th></tr></thead>
      <tbody id="horasAlertasTableBody"></tbody>
    </table>
    <div class="chart-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div class="chart-box"><canvas id="chartHorasTiempo"></canvas></div>
      <div class="chart-box"><canvas id="chartHorasRanking"></canvas></div>
    </div>
    <table class="dtable" id="horasTable">
      <thead><tr><th class="left">Empleado</th><th class="left">Sede</th><th class="left">Periodo</th><th>Extra diurna</th><th>Extra nocturna</th><th>Extra festiva diurna</th><th>Extra festiva nocturna</th><th>Total horas extra</th><th>Total trabajado</th></tr></thead>
      <tbody id="horasTableBody"></tbody>
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
const RAW_MOV_WEEKS = ${movJson};
const RAW_HORAS = ${horasJson};
const INITIAL_VIEW = ${JSON.stringify(meta?.initialView || 'tiempo')};
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
.row-click{cursor:pointer;}
.row-click:hover td{background:rgba(62,168,255,.12);}
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
function capMes(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
// "semana del 01 al 09 Sep" (o "semana del 30 Ago al 05 Sep" si cruza de mes) —
// para saber de un vistazo qué rango de días exactos cubre la semana elegida.
function weekRangeLabel(startVal, endVal){
  const s = new Date(String(startVal).slice(0, 10) + 'T00:00:00Z');
  const e = new Date(String(endVal).slice(0, 10) + 'T00:00:00Z');
  const sDay = String(s.getUTCDate()).padStart(2, '0'), eDay = String(e.getUTCDate()).padStart(2, '0');
  const sMon = capMes(MESES[s.getUTCMonth()]), eMon = capMes(MESES[e.getUTCMonth()]);
  return sMon === eMon ? ('semana del ' + sDay + ' al ' + eDay + ' ' + sMon) : ('semana del ' + sDay + ' ' + sMon + ' al ' + eDay + ' ' + eMon);
}
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
    if (!periods.has(periodKey)) periods.set(periodKey, { periodKey, sedeName, totalVentas: 0, totalCompras: 0, utilidadBruta: 0, weeks: 0, periodStart: w.weekStart, periodEnd: w.weekEnd });
    const acc = periods.get(periodKey);
    acc.totalVentas += c.totalVentas || 0;
    acc.totalCompras += c.totalCompras || 0;
    acc.utilidadBruta += c.utilidadBruta || 0;
    acc.weeks += 1;
    if (w.weekStart && (!acc.periodStart || w.weekStart < acc.periodStart)) acc.periodStart = w.weekStart;
    if (w.weekEnd && (!acc.periodEnd || w.weekEnd > acc.periodEnd)) acc.periodEnd = w.weekEnd;
  });
  const bySede = [], byPeriod = new Map();
  accBySede.forEach((periods, sedeName) => {
    const points = Array.from(periods.values()).map(acc => ({
      periodKey: acc.periodKey,
      periodLabel: (granularity === 'week' && acc.periodStart && acc.periodEnd) ? weekRangeLabel(acc.periodStart, acc.periodEnd) : periodLabel(acc.periodKey, granularity),
      sedeName,
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
function ventaPeriodLabel(periodKey, granularity){
  if (granularity === 'week') {
    const start = new Date(periodKey + 'T00:00:00Z');
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
    return weekRangeLabel(start.toISOString(), end.toISOString());
  }
  return periodLabel(periodKey, granularity);
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
    const points = Array.from(periods.values()).map(acc => ({ periodKey: acc.periodKey, periodLabel: ventaPeriodLabel(acc.periodKey, granularity), sedeName, valorVenta: acc.valorVenta })).sort((a, b) => a.periodKey < b.periodKey ? -1 : 1);
    bySede.push({ sedeName, points });
    points.forEach(p => { if (!byPeriod.has(p.periodKey)) byPeriod.set(p.periodKey, []); byPeriod.get(p.periodKey).push(p); });
  });
  const periodKeysSorted = Array.from(byPeriod.keys()).sort();
  return { granularity, bySede, byPeriod: Array.from(byPeriod.entries()).map(([periodKey, points]) => ({ periodKey, points })), periodKeysSorted, sedeNames: bySede.map(s => s.sedeName).sort() };
}

// Tabla de Movimientos (mermas) — mismo molde que aggregateByPeriod de
// arriba (weekStart/weekEnd reales, no lunes-domingo), pero además suma
// byCategory (guardado ya canónico: Finas/Pulpas/Segundas/...) como
// byBloque, para poder comparar UN bloque específico en el tiempo/entre
// sedes — puerto de src/movimientos/movimientosDashboardData.js.
const BLOQUES_CANONICOS = ['Finas', 'Pulpas', 'Segundas', 'Molida', 'Costilla de Res', 'Vísceras', 'Pulpa de Cerdo', 'Tocineta y Costilla', 'Otros Cortes', 'Pollo', 'Pescado', 'Salsamentaria'];
function aggregateMovByPeriod(rawMovWeeks, granularity){
  const accBySede = new Map();
  rawMovWeeks.forEach(w => {
    const sedeName = w.sedeName, c = w.computed || {};
    const periodKey = periodKeyFor(w.weekStart, granularity);
    if (!accBySede.has(sedeName)) accBySede.set(sedeName, new Map());
    const periods = accBySede.get(sedeName);
    if (!periods.has(periodKey)) periods.set(periodKey, { periodKey, sedeName, disponible: 0, diferenciaKL: 0, weeks: 0, periodStart: w.weekStart, periodEnd: w.weekEnd, byBloque: new Map() });
    const acc = periods.get(periodKey);
    acc.disponible += c.totalDisponible || 0;
    acc.diferenciaKL += c.totalDiferencia || 0;
    acc.weeks += 1;
    if (w.weekStart && (!acc.periodStart || w.weekStart < acc.periodStart)) acc.periodStart = w.weekStart;
    if (w.weekEnd && (!acc.periodEnd || w.weekEnd > acc.periodEnd)) acc.periodEnd = w.weekEnd;
    (c.byCategory || []).forEach(cat => {
      if (!acc.byBloque.has(cat.category)) acc.byBloque.set(cat.category, { disponible: 0, diferenciaKL: 0 });
      const b = acc.byBloque.get(cat.category);
      b.disponible += cat.disponible || 0;
      b.diferenciaKL += cat.diferenciaKL || 0;
    });
  });
  const bySede = [], byPeriod = new Map();
  accBySede.forEach((periods, sedeName) => {
    const points = Array.from(periods.values()).map(acc => ({
      periodKey: acc.periodKey,
      periodLabel: (granularity === 'week' && acc.periodStart && acc.periodEnd) ? weekRangeLabel(acc.periodStart, acc.periodEnd) : periodLabel(acc.periodKey, granularity),
      sedeName, disponible: acc.disponible, diferenciaKL: acc.diferenciaKL,
      pctDiferencia: acc.disponible === 0 ? 0 : acc.diferenciaKL / acc.disponible, weeks: acc.weeks,
      byBloque: Array.from(acc.byBloque.entries()).map(([bloque, v]) => ({ bloque, disponible: v.disponible, diferenciaKL: v.diferenciaKL, pctDiferencia: v.disponible === 0 ? 0 : v.diferenciaKL / v.disponible }))
    })).sort((a, b) => a.periodKey < b.periodKey ? -1 : 1);
    bySede.push({ sedeName, points });
    points.forEach(p => { if (!byPeriod.has(p.periodKey)) byPeriod.set(p.periodKey, []); byPeriod.get(p.periodKey).push(p); });
  });
  const periodKeysSorted = Array.from(byPeriod.keys()).sort();
  return { granularity, bySede, byPeriod: Array.from(byPeriod.entries()).map(([periodKey, points]) => ({ periodKey, points })), periodKeysSorted, sedeNames: bySede.map(s => s.sedeName).sort() };
}

// Horas Extras (horas_extra_dias) — fuente diaria por empleado, mismo
// calendario que Ventas (ventaPeriodKeyFor/ventaPeriodLabel) — puerto de
// src/horasExtras/horasExtrasDashboardData.js.
const LIMITE_SEMANAL_HORAS = 12;
const UMBRAL_ALERTA_HORAS = 10;
function horaExtraDelDia(row){ return (row.he || 0) + (row.hen || 0) + (row.hefd || 0) + (row.hefn || 0); }
function evaluarAlertaHoras(h){ if (h > LIMITE_SEMANAL_HORAS) return 'rojo'; if (h >= UMBRAL_ALERTA_HORAS) return 'amarillo'; return 'verde'; }
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
  const byEmpleado = [], byPeriod = new Map();
  accByEmpleado.forEach((entry, id) => {
    const points = Array.from(entry.periods.values()).map(acc => ({ ...acc, ...entry.info, periodLabel: ventaPeriodLabel(acc.periodKey, granularity) })).sort((a, b) => a.periodKey < b.periodKey ? -1 : 1);
    byEmpleado.push({ empleadoId: id, ...entry.info, points });
    points.forEach(p => { if (!byPeriod.has(p.periodKey)) byPeriod.set(p.periodKey, []); byPeriod.get(p.periodKey).push(p); });
  });
  return { granularity, byEmpleado, periodKeysSorted: Array.from(byPeriod.keys()).sort() };
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
  return { byPeriod, periodKeysSorted: Array.from(byPeriod.keys()).sort() };
}
// Última semana ISO ya COMPLETA dentro de los datos cargados — el periodo de
// un reporte de RH casi nunca cierra en domingo, así que la última semana
// calendario suele venir con solo 1-2 días y subestima la alerta.
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
const TIPOS_HORA_EXTRA = [['he', 'Extra diurna'], ['hen', 'Extra nocturna'], ['hefd', 'Extra festiva diurna'], ['hefn', 'Extra festiva nocturna']];
const TIPOS_HORA_OTROS = [['hdo', 'Ordinarias diurnas'], ['rn', 'Recargo nocturno'], ['rndyf', 'Recargo nocturno dominical/festivo'], ['dom', 'Dominical'], ['d', 'Descanso'], ['f', 'Festivo'], ['comida', 'Comida']];
function sumDesgloseHoras(rows){
  const out = { extra: 0, total: 0 };
  TIPOS_HORA_EXTRA.concat(TIPOS_HORA_OTROS).forEach(t => { out[t[0]] = 0; });
  rows.forEach(r => { TIPOS_HORA_EXTRA.concat(TIPOS_HORA_OTROS).forEach(t => { out[t[0]] += r[t[0]] || 0; }); out.total += r.total || 0; });
  out.extra = out.he + out.hen + out.hefd + out.hefn;
  return out;
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

const VIEWER_JS = `
function fmtCOP(v){ if(v==null||isNaN(v)) return '$0'; return '$' + Math.round(v).toLocaleString('es-CO'); }
function fmtPct(v){ return (Math.round(v*1000)/10).toFixed(1)+'%'; }
function fmtNum(v){ if(v==null||isNaN(v)) return '0'; const r = Math.round(v*100)/100; return Number.isInteger(r) ? String(r) : r.toFixed(2); }
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
let currentMovData = null;
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
      updateFilterVisibility();
      refreshActiveView();
    });
  });
}

// Sub-pestañas dentro de "Mermas" (mismo criterio que el dashboard en
// pantalla): tiempo / sedes / bloques (bloques incluye el drilldown de
// productos y "Detalle por periodo"). Los 3 gráficos se siguen creando en
// cada refreshActiveView — solo se oculta/muestra el panel.
function initMermasSubTabs(){
  document.querySelectorAll('.mermas-sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mermas-sub-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mermasSubView = btn.dataset.mermasView;
      document.querySelectorAll('.mermas-sub-panel').forEach(p => p.classList.add('hidden-block'));
      el('mermas-sub-' + mermasSubView).classList.remove('hidden-block');
      renderMermasActiveSubView();
    });
  });
}

let selectedPeriods = null; // Set<periodKey> | null (null = todos) — Balance/Ventas
// Mermas usa su PROPIO calendario de periodos (movimientos_weeks, distinto
// del de Balance/Ventas) — el botón "📅 Fechas" se reutiliza tal cual, pero
// necesita su propia selección para no mezclar periodos de una fuente con
// los de la otra.
let selectedPeriodsMermas = null;
// Horas Extras: calendario propio (horas_extra_dias, día a día) — con un solo mes/año cargado baja a semanas.
let selectedPeriodsHoras = null;
function horasPeriodData(){
  let g = el('filterGranularidad').value;
  let d = aggregateHorasBySede(RAW_HORAS, g);
  if (d.periodKeysSorted.length < 2 && g !== 'week') { g = 'week'; d = aggregateHorasBySede(RAW_HORAS, g); }
  return { granularity: g, periodKeysSorted: d.periodKeysSorted, byPeriod: Array.from(d.byPeriod.entries()).map(([periodKey, points]) => ({ periodKey, points })) };
}
function periodSourceData(){ return activeView === 'mermas' ? currentMovData : activeView === 'horas' ? horasPeriodData() : activeSource(); }
function activePeriodsGet(){ return activeView === 'mermas' ? selectedPeriodsMermas : activeView === 'horas' ? selectedPeriodsHoras : selectedPeriods; }
function activePeriodsSet(v){ if (activeView === 'mermas') selectedPeriodsMermas = v; else if (activeView === 'horas') selectedPeriodsHoras = v; else selectedPeriods = v; }
// Qué botones de filtro aplican en cada vista: la métrica (Margen/Utilidad/Ventas) solo en Serie de
// tiempo y Comparativa; el selector de empleado no aplica a Presupuesto ni a Mermas.
function updateFilterVisibility(){
  el('filterMetrica').classList.toggle('hidden-block', activeView === 'presupuesto' || activeView === 'mermas' || activeView === 'horas');
  el('filterEmpleadoHoras').classList.toggle('hidden-block', activeView === 'presupuesto' || activeView === 'mermas');
}

function recomputeData(){
  const granularity = el('filterGranularidad').value;
  currentData = aggregateByPeriod(RAW_WEEKS, granularity);
  currentVentaData = aggregateVentasByPeriod(RAW_VENTAS, granularity);
  currentMovData = aggregateMovByPeriod(RAW_MOV_WEEKS, granularity);
  selectedPeriods = null;
  selectedPeriodsMermas = null;
  selectedPeriodsHoras = null;
  renderPeriodPopover();
}

// Botón "📅 Fechas" con panel: casillas + "seleccionar todos"/"deseleccionar
// todos" — mismo patrón que el dashboard en pantalla (Reportes > Balance).
function renderPeriodPopover(){
  const data = periodSourceData();
  const list = el('periodoList');
  list.innerHTML = data.periodKeysSorted.slice().reverse().map(k => {
    const label = (data.byPeriod.find(p => p.periodKey === k) || {}).points[0]?.periodLabel || k;
    const sel = activePeriodsGet();
    const checked = !sel || sel.has(k);
    return '<label><input type="checkbox" data-period="' + k + '" ' + (checked ? 'checked' : '') + '> ' + escapeHtmlJs(label) + '</label>';
  }).join('');
  list.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      let sel = activePeriodsGet();
      if (!sel) { sel = new Set(data.periodKeysSorted); activePeriodsSet(sel); }
      const k = cb.dataset.period;
      if (cb.checked) sel.add(k);
      else if (sel.size > 1) sel.delete(k);
      else cb.checked = true; // siempre debe quedar al menos 1 periodo
      if (sel.size === data.periodKeysSorted.length) activePeriodsSet(null);
      const sel2 = activePeriodsGet();
      const n2 = sel2 ? sel2.size : data.periodKeysSorted.length;
      el('periodoBtn').textContent = sel2 ? '📅 Fechas (' + n2 + ')' : '📅 Fechas (todas)';
      el('periodoHint').textContent = (data.granularity === 'week' && n2 === 1 && el('filterMetrica').value === 'venta')
        ? '📅 Semana específica — "Serie de tiempo" muestra el detalle día a día.' : '';
      renderKpis(); refreshActiveView();
    });
  });
  const sel = activePeriodsGet();
  el('periodoBtn').textContent = sel ? '📅 Fechas (' + sel.size + ')' : '📅 Fechas (todas)';
  const n = sel ? sel.size : data.periodKeysSorted.length;
  el('periodoHint').textContent = (data.granularity === 'week' && n === 1 && el('filterMetrica').value === 'venta')
    ? '📅 Semana específica — "Serie de tiempo" muestra el detalle día a día.' : '';
}
function periodsInScope(){
  const data = periodSourceData();
  const sel = activePeriodsGet();
  return sel ? data.periodKeysSorted.filter(k => sel.has(k)) : data.periodKeysSorted;
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
  el('filterBloque').addEventListener('change', refreshActiveView);
  el('filterEmpleadoHoras').addEventListener('change', refreshActiveView);
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
    activePeriodsSet(null);
    popover.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; });
    el('periodoBtn').textContent = '📅 Fechas (todas)';
    renderKpis(); refreshActiveView();
  });
  el('periodoNoneBtn').addEventListener('click', () => {
    const boxes = Array.from(popover.querySelectorAll('input[type=checkbox]'));
    if (!boxes.length) return;
    activePeriodsSet(new Set([boxes[0].dataset.period]));
    renderPeriodPopover();
    renderKpis(); refreshActiveView();
  });
}
function refreshSedeOptions(){
  const sedeSel = el('filterSede');
  const prev = sedeSel.value;
  const data = activeSource();
  const allSedes = Array.from(new Set([...data.sedeNames, ...currentMovData.sedeNames])).sort();
  sedeSel.innerHTML = '<option value="">Todas las sedes</option>' + allSedes.map(s => '<option value="' + s + '">' + s + '</option>').join('');
  if (allSedes.includes(prev)) sedeSel.value = prev;
  const bloqueSel = el('filterBloque');
  if (bloqueSel.options.length <= 1) {
    bloqueSel.innerHTML = '<option value="">Todos los bloques</option>' + BLOQUES_CANONICOS.map(b => '<option>' + b + '</option>').join('');
  }
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
    // "Anterior" es el periodo previo DENTRO de lo seleccionado (filtro de
    // Fechas), no el periodo calendario inmediatamente anterior — mismo
    // criterio que el dashboard en pantalla.
    const prevKey = scope.length > 1 ? scope[scope.length - 2] : null;
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

// "Mermas": a diferencia de las otras 3 vistas, ignora
// métrica/granularidad-de-Balance/fechas — usa su PROPIO histórico
// (RAW_MOV_WEEKS) con la granularidad ya elegida en "filterGranularidad" y
// solo respeta el filtro de sede, más su propio selector de Bloque.
function movMetricFor(bloqueFilter, point){
  if (!bloqueFilter) return { disponible: point.disponible, diferenciaKL: point.diferenciaKL, pctDiferencia: point.pctDiferencia };
  const b = (point.byBloque || []).find(x => x.bloque === bloqueFilter);
  return b ? { disponible: b.disponible, diferenciaKL: b.diferenciaKL, pctDiferencia: b.pctDiferencia } : { disponible: 0, diferenciaKL: 0, pctDiferencia: 0 };
}
// Estado de la última llamada a viewMermas, para poder re-renderizar SOLO
// el gráfico de la sub-pestaña activa (ver renderMermasActiveSubView) sin
// recalcular todo de nuevo.
let mermasSubView = 'tiempo';
let mermasCtx = null; // { data, sedeFilter, bloqueFilter, bloqueLabel, allPoints, lastPeriod }

function viewMermas(){
  destroyChart('mermasTiempo'); destroyChart('mermasSedes'); destroyChart('mermasBloques');
  if (!currentMovData.sedeNames.length) return;
  const sedeFilter = el('filterSede').value;
  const bloqueFilter = el('filterBloque').value;
  const bloqueLabel = bloqueFilter ? ' — ' + bloqueFilter : '';
  const data = currentMovData;

  // El botón "📅 Fechas" usa el calendario propio de Mermas (ver
  // periodSourceData/activePeriodsGet) — hay que repoblarlo acá porque
  // recomputeData() solo lo hace al cambiar de granularidad, no al cambiar
  // de pestaña top-level.
  renderPeriodPopover();
  const periodKeysInScope = periodsInScope();

  const allPoints = Array.from(data.bySede.flatMap(s => s.points)).filter(p => !sedeFilter || p.sedeName === sedeFilter);
  // "Último periodo" es el último DENTRO de lo seleccionado en Fechas, no el
  // último de todo el historial — mismo criterio que el dashboard en pantalla.
  const lastPeriod = periodKeysInScope[periodKeysInScope.length - 1];
  const lastMetrics = allPoints.filter(p => p.periodKey === lastPeriod).map(p => movMetricFor(bloqueFilter, p));
  const lastDisp = lastMetrics.reduce((a, m) => a + m.disponible, 0);
  const lastDif = lastMetrics.reduce((a, m) => a + m.diferenciaKL, 0);
  const lastPct = lastDisp === 0 ? 0 : lastDif / lastDisp;
  el('mermasKpiGrid').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Sedes con historial</div><div class="kpi-value">' + data.sedeNames.length + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Semanas guardadas</div><div class="kpi-value">' + RAW_MOV_WEEKS.length + '</div></div>' +
    '<div class="kpi-card ' + (lastDif < 0 ? 'kpi-neg' : 'kpi-pos') + '"><div class="kpi-label">Diferencia KL — último ' + GRAN_LABELS[data.granularity] + bloqueLabel + '</div><div class="kpi-value">' + fmtNum(lastDif) + '</div></div>' +
    '<div class="kpi-card ' + (lastDif < 0 ? 'kpi-neg' : 'kpi-pos') + '"><div class="kpi-label">% Diferencia — último ' + GRAN_LABELS[data.granularity] + bloqueLabel + '</div><div class="kpi-value">' + fmtPct(lastPct) + '</div></div>';

  mermasCtx = { data, sedeFilter, bloqueFilter, bloqueLabel, allPoints, lastPeriod, periodKeysInScope };
  renderMermasActiveSubView();

  // Detalle por periodo
  const scopeSet = new Set(periodKeysInScope);
  let rows = Array.from(data.bySede.flatMap(s => s.points)).filter(r => scopeSet.has(r.periodKey));
  if (sedeFilter) rows = rows.filter(r => r.sedeName === sedeFilter);
  rows = rows.slice().sort((a, b) => a.periodKey < b.periodKey ? 1 : -1);
  el('mermasTableBody').innerHTML = rows.map(r => {
    const m = movMetricFor(bloqueFilter, r);
    const cls = m.diferenciaKL < -0.01 ? 'diff-neg' : (Math.abs(m.diferenciaKL) < 0.01 ? 'diff-zero' : '');
    return '<tr><td class="left">' + r.sedeName + '</td><td class="left">' + r.periodLabel + '</td><td>' + fmtNum(m.disponible) + '</td><td class="' + cls + '">' + fmtNum(m.diferenciaKL) + '</td><td>' + fmtPct(m.pctDiferencia) + '</td></tr>';
  }).join('') || '<tr><td colspan="5" class="left">Sin datos para este filtro.</td></tr>';
}

// Renderiza SOLO el gráfico de la sub-pestaña actualmente visible
// (mermasSubView) — nunca los 3 a la vez. Un gráfico de Chart.js creado con
// su canvas en display:none queda con tamaño 0 para siempre (no se corrige
// solo, ni con resize(), al mostrarse después); la única forma robusta de
// evitarlo es no crearlo mientras está oculto. Se llama tanto al recalcular
// todo (viewMermas) como al cambiar de sub-pestaña (initMermasSubTabs), en
// ambos casos con el panel destino ya visible en el DOM.
function renderMermasActiveSubView(){
  if (!mermasCtx) return;
  if (mermasSubView === 'sedes') renderMermasSedesChart();
  else if (mermasSubView === 'bloques') renderMermasBloquesChart();
  else renderMermasTiempoChart();
}

function renderMermasTiempoChart(){
  const { data, sedeFilter, bloqueFilter, bloqueLabel, periodKeysInScope } = mermasCtx;
  const palette = SEDE_PALETTE;
  destroyChart('mermasTiempo');
  const series = sedeFilter ? data.bySede.filter(s => s.sedeName === sedeFilter) : data.bySede;
  const labels = periodKeysInScope.map(k => (data.byPeriod.find(p => p.periodKey === k) || {}).points[0]?.periodLabel || k);
  const tiempoDatasets = series.map((s, i) => {
    const byPeriod = new Map(s.points.map(p => [p.periodKey, movMetricFor(bloqueFilter, p).diferenciaKL]));
    return { label: s.sedeName, data: periodKeysInScope.map(k => byPeriod.has(k) ? byPeriod.get(k) : null), borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length], spanGaps: true, tension: .25 };
  });
  const tiempoOpts = chartOptions('Diferencia KL' + bloqueLabel + ' en el tiempo', null, fmtNum);
  tiempoOpts.plugins.legend.display = series.length > 1;
  charts.mermasTiempo = new Chart(el('chartMermasTiempo').getContext('2d'), { type: 'line', data: { labels, datasets: tiempoDatasets }, options: tiempoOpts });
}

function renderMermasSedesChart(){
  const { data, sedeFilter, bloqueFilter, bloqueLabel, periodKeysInScope } = mermasCtx;
  destroyChart('mermasSedes');
  const scopeSet = new Set(periodKeysInScope);
  const series = sedeFilter ? data.bySede.filter(s => s.sedeName === sedeFilter) : data.bySede;
  const diffBySede = series.map(s => [s.sedeName, s.points.filter(p => scopeSet.has(p.periodKey)).reduce((a, p) => a + movMetricFor(bloqueFilter, p).diferenciaKL, 0)]);
  const sedeLabels = diffBySede.map(p => p[0]), sedeValues = diffBySede.map(p => p[1]);
  // Todas las barras crecen hacia arriba (magnitud); el signo se distingue
  // por color (colorFor: rojo = faltante) en vez de la dirección de la
  // barra, y el tooltip muestra el valor real con signo — mismo criterio
  // que el dashboard en pantalla.
  const sedesOpts = chartOptions('Diferencia KL' + bloqueLabel + ' acumulada por sede');
  sedesOpts.plugins.tooltip = { callbacks: { label: (ctx) => fmtNum(sedeValues[ctx.dataIndex]) } };
  charts.mermasSedes = new Chart(el('chartMermasSedes').getContext('2d'), {
    type: 'bar', data: { labels: sedeLabels, datasets: [{ data: sedeValues.map(v => Math.abs(v)), backgroundColor: sedeValues.map(v => colorFor(v)), borderRadius: 6 }] },
    options: sedesOpts
  });
}

function renderMermasBloquesChart(){
  const { data, sedeFilter, allPoints, lastPeriod } = mermasCtx;
  destroyChart('mermasBloques');
  // Ranking de los 12 bloques del ÚLTIMO periodo (antes sumaba todo el
  // historial cargado, lo que hacía que el tooltip de una barra no
  // coincidiera con la fila de esa semana en "Detalle por periodo" — mismo
  // alcance "último periodo" que ya usan los KPI de arriba).
  const bloqueAcc = new Map();
  allPoints.filter(p => p.periodKey === lastPeriod).forEach(p => (p.byBloque || []).forEach(b => {
    if (!bloqueAcc.has(b.bloque)) bloqueAcc.set(b.bloque, 0);
    bloqueAcc.set(b.bloque, bloqueAcc.get(b.bloque) + b.diferenciaKL);
  }));
  const pairs = BLOQUES_CANONICOS.map(b => [b, bloqueAcc.get(b) || 0]).sort((a, b) => a[1] - b[1]);
  const bloqueLabels = pairs.map(p => p[0]), bloqueValues = pairs.map(p => p[1]);
  const bloquesOpts = Object.assign(chartOptions('Diferencia KL por bloque — último ' + GRAN_LABELS[data.granularity] + (sedeFilter ? ' — ' + sedeFilter : ' — todas las sedes')), {
    indexAxis: 'y',
    onClick: (evt, elements) => { if (elements.length) renderMermasDrilldown(bloqueLabels[elements[0].index], sedeFilter); }
  });
  charts.mermasBloques = new Chart(el('chartMermasBloques').getContext('2d'), {
    type: 'bar', data: { labels: bloqueLabels, datasets: [{ data: bloqueValues, backgroundColor: bloqueValues.map(v => colorFor(v)), borderRadius: 6 }] }, options: bloquesOpts
  });
  el('mermasDrillHint').classList.toggle('hidden-block', !!sedeFilter);
}

// Detalle de productos de un bloque, de la semana más reciente guardada de
// esa sede — mismo criterio que el dashboard en pantalla.
function renderMermasDrilldown(bloque, sedeFilter){
  const wrap = el('mermasDrillTable');
  wrap.classList.remove('hidden-block');
  if (!sedeFilter) {
    el('mermasDrillTitle').textContent = 'Elige una sede específica (no "todas las sedes") para ver el detalle de productos de este bloque.';
    el('mermasDrillTableBody').innerHTML = '';
    return;
  }
  const weeksSede = RAW_MOV_WEEKS.filter(w => w.sedeName === sedeFilter).slice().sort((a, b) => String(a.weekStart) < String(b.weekStart) ? 1 : -1);
  const latest = weeksSede[0];
  const rows = latest && latest.computed && latest.computed.allProductRows;
  if (!latest || !rows) {
    el('mermasDrillTitle').textContent = 'Sin detalle de productos guardado para ' + sedeFilter + ' todavía.';
    el('mermasDrillTableBody').innerHTML = '';
    return;
  }
  const productos = rows.filter(p => p.category === bloque).sort((a, b) => a.diferenciaKL - b.diferenciaKL);
  const weekLabel = String(latest.weekStart).slice(0, 10) + (latest.weekEnd ? ' → ' + String(latest.weekEnd).slice(0, 10) : '');
  el('mermasDrillTitle').textContent = 'Detalle de productos — ' + bloque + ' en ' + sedeFilter + ', semana ' + weekLabel;
  el('mermasDrillTableBody').innerHTML = productos.map(p => {
    const cls = p.diferenciaKL < -0.01 ? 'diff-neg' : (Math.abs(p.diferenciaKL) < 0.01 ? 'diff-zero' : '');
    const pct = p.disponible === 0 ? 0 : p.diferenciaKL / p.disponible;
    return '<tr><td class="left code">' + p.code + '</td><td class="left">' + p.name + '</td><td>' + fmtNum(p.disponible) + '</td><td class="' + cls + '">' + fmtNum(p.diferenciaKL) + '</td><td>' + fmtPct(pct) + '</td></tr>';
  }).join('') || '<tr><td colspan="5" class="left">Sin productos con diferencia en este bloque esa semana.</td></tr>';
}

// "Horas Extras": junto a Mermas dentro del mismo dashboard unificado —
// respeta el filtro de sede compartido (la granularidad NO, las alertas
// siempre son semanales por ley) y tiene su propio selector de "Empleado".
function viewHoras(){
  destroyChart('horasTiempo'); destroyChart('horasRanking');
  if (!RAW_HORAS.length) return;
  const sedeFilter = el('filterSede').value;

  renderPeriodPopover();
  const calH = horasPeriodData();
  const gran = calH.granularity;
  const scopeSet = new Set(periodsInScope());
  const scopedAll = RAW_HORAS.filter(r => scopeSet.has(ventaPeriodKeyFor(r.fecha, gran)));
  const rowsInSede = sedeFilter ? scopedAll.filter(r => r.sedeName === sedeFilter) : scopedAll;
  const empSel = el('filterEmpleadoHoras');
  const prevEmp = empSel.value;
  const empleados = Array.from(new Map(rowsInSede.map(r => [r.empleadoId, r.empleadoNombre])).entries());
  empSel.innerHTML = '<option value="">Todos los empleados</option>' + empleados.map(([id, nombre]) => '<option value="' + id + '">' + nombre + '</option>').join('');
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
    '<div class="kpi-card"><div class="kpi-label">Más horas extra — ' + (lastWeek ? 'semana del ' + lastWeek : 'última semana') + '</div><div class="kpi-value" style="font-size:15px">' + (topEmpleado ? topEmpleado.nombre + ' — ' + fmtNum(topEmpleado.horaExtraSemana) + 'h' : '—') + '</div></div>';

  el('horasAlertasCaption').textContent = 'Alertas — ' + (lastWeek ? 'semana del ' + lastWeek : 'última semana completa con datos');
  el('horasAlertasTableBody').innerHTML = alertas.filter(a => a.nivel !== 'verde').map(a => {
    const icon = a.nivel === 'rojo' ? '🔴 Pasado' : '🟡 Por pasarse';
    const cls = a.nivel === 'rojo' ? 'diff-neg' : '';
    return '<tr class="row-click" data-emp="' + a.empleadoId + '" title="Ver el detalle de esta persona"><td class="left">' + a.nombre + '</td><td class="left">' + a.sedeName + '</td><td class="left">' + (a.cargo || '—') + '</td><td class="' + cls + '">' + fmtNum(a.horaExtraSemana) + '</td><td>' + icon + '</td></tr>';
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
    return '<tr class="row-click" data-emp="' + r.empleadoId + '" title="Ver el detalle de esta persona"><td class="left">' + r.nombre + '</td><td class="left">' + r.sedeName + '</td><td class="left">' + r.periodLabel + '</td><td>' + fmtNum(r.he) + '</td><td>' + fmtNum(r.hen) + '</td><td>' + fmtNum(r.hefd) + '</td><td>' + fmtNum(r.hefn) + '</td><td class="' + cls + '"><b>' + fmtNum(r.horaExtra) + '</b></td><td>' + fmtNum(r.total) + '</td></tr>';
  }).join('') || '<tr><td colspan="9" class="left">Sin datos para este filtro.</td></tr>';
  horasCtxRows = scopedAll;
  document.querySelectorAll('#horasAlertasTableBody tr[data-emp], #horasTableBody tr[data-emp]').forEach(tr => {
    tr.addEventListener('click', () => { horasEmpleadoSel = tr.dataset.emp; renderHorasEmpleadoDetalle(); });
  });
  renderHorasEmpleadoDetalle();
}

// Clic en una persona: a qué corresponde cada hora (diurna, nocturna, festiva...)
// dentro de las fechas elegidas — mismo desglose que el dashboard en pantalla.
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
  box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><b>Detalle de ' + last.empleadoNombre + ' — ' + last.sedeName + (last.cargo ? ' · ' + last.cargo : '') + '</b><button type="button" class="theme-btn" id="horasEmpleadoCerrar">✕ Cerrar</button></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;">' +
    '<table class="dtable"><thead><tr><th class="left">Hora extra</th><th>Total</th></tr></thead><tbody>' + TIPOS_HORA_EXTRA.map(fila).join('') + '<tr><td class="left"><b>Total general horas extra</b></td><td><b>' + fmtNum(t.extra) + '</b></td></tr></tbody></table>' +
    '<table class="dtable"><thead><tr><th class="left">Otras horas del documento</th><th>Total</th></tr></thead><tbody>' + TIPOS_HORA_OTROS.map(fila).join('') + '<tr><td class="left"><b>Total trabajado</b></td><td><b>' + fmtNum(t.total) + '</b></td></tr></tbody></table></div>' +
    '<table class="dtable"><thead><tr><th class="left">Día</th><th>Total trabajado</th><th>Extra diurna</th><th>Extra nocturna</th><th>Extra festiva diurna</th><th>Extra festiva nocturna</th><th>Total extra del día</th><th class="left">Estado</th></tr></thead><tbody>' + dias + '</tbody></table>';
  box.classList.remove('hidden-block');
  el('horasEmpleadoCerrar').addEventListener('click', () => { horasEmpleadoSel = null; renderHorasEmpleadoDetalle(); });
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


function refreshActiveView(){
  if (activeView === 'tiempo') viewTiempo();
  else if (activeView === 'sedes') viewSedes();
  else if (activeView === 'presupuesto') viewPresupuesto();
  else if (activeView === 'mermas') viewMermas();
  else if (activeView === 'horas') viewHoras();
}

recomputeData();
refreshSedeOptions();
initTheme();
initTabs();
initMermasSubTabs();
initFilters();
renderKpis();
refreshActiveView();
updateFilterVisibility();
if (INITIAL_VIEW !== 'tiempo') { const b = document.querySelector('.view-tab[data-view="' + INITIAL_VIEW + '"]'); if (b) b.click(); }
`;
