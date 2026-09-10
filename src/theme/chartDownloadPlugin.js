// Botón "⬇" para descargar cualquier gráfico Chart.js como imagen PNG. Se
// registra UNA vez como plugin global de Chart.js (Chart.register), así que
// aplica automáticamente a todos los gráficos de la app — actuales y
// futuros — sin tener que tocar cada sitio donde se hace `new Chart(...)`.
//
// CHART_DOWNLOAD_JS de abajo es el mismo código, como texto plano (sin
// `export`), para incrustar dentro de los informes HTML descargables
// (scripts planos, no módulos) — mismo patrón que AGG_JS/VIEWER_JS en
// src/export/*.js (la fuente de verdad es esta función; si cambia el
// comportamiento, actualiza también el string de abajo).

export function registerChartDownloadPlugin(Chart) {
  Chart.register({
    id: 'chartDownloadButton',
    afterInit(chart) {
      const box = chart.canvas && chart.canvas.parentElement;
      if (!box) return;
      if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
      let btn = box.querySelector(':scope > .chart-dl-btn');
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chart-dl-btn';
        btn.title = 'Descargar gráfico como imagen (PNG)';
        btn.textContent = '⬇';
        box.appendChild(btn);
      }
      // onclick (no addEventListener) a propósito: el gráfico se destruye y
      // recrea en cada re-render sobre el mismo canvas/botón, así que hay que
      // REEMPLAZAR el handler cada vez (si no, apuntaría a una instancia ya
      // destruida y toBase64Image() fallaría o daría una imagen en blanco).
      btn.onclick = (e) => {
        e.stopPropagation();
        const a = document.createElement('a');
        a.href = chart.toBase64Image('image/png', 1);
        const titleText = (chart.options.plugins && chart.options.plugins.title && chart.options.plugins.title.text) || 'grafico';
        a.download = String(titleText).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase() + '.png';
        a.click();
      };
    }
  });
}

export const CHART_DOWNLOAD_JS = `
Chart.register({
  id: 'chartDownloadButton',
  afterInit(chart) {
    const box = chart.canvas && chart.canvas.parentElement;
    if (!box) return;
    if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
    let btn = box.querySelector(':scope > .chart-dl-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chart-dl-btn';
      btn.title = 'Descargar gráfico como imagen (PNG)';
      btn.textContent = '⬇';
      box.appendChild(btn);
    }
    btn.onclick = (e) => {
      e.stopPropagation();
      const a = document.createElement('a');
      a.href = chart.toBase64Image('image/png', 1);
      const titleText = (chart.options.plugins && chart.options.plugins.title && chart.options.plugins.title.text) || 'grafico';
      a.download = String(titleText).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase() + '.png';
      a.click();
    };
  }
});
`;
