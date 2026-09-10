import { JSDOM } from 'jsdom';
import fs from 'fs';

const html = fs.readFileSync('./tests/manual/informe_interactivo.html', 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true
});

// Chart.js necesita un canvas 2D context real; jsdom no lo implementa por defecto.
// Verificamos que el resto de la lógica (KPIs, filtros, heatmap, ranking, tema) corre sin errores,
// y that Chart.js al menos se cargó como variable global.
const { window } = dom;

await new Promise(resolve => setTimeout(resolve, 300));

const errors = [];
window.addEventListener('error', (e) => errors.push(e.error?.message || e.message));

console.log('Chart definido:', typeof window.Chart === 'function');

// KPIs
const kpiGrid = window.document.getElementById('kpiGrid');
console.log('KPI grid tiene contenido:', kpiGrid.innerHTML.length > 0);
console.log('KPI grid muestra 2 sedes:', kpiGrid.textContent.includes('2'));

// Cambiar de pestaña a heatmap (no depende de Chart.js/canvas)
window.document.querySelector('[data-view="heatmap"]').click();
const heatBox = window.document.getElementById('heatmapBox');
console.log('Heatmap generado, filas:', heatBox.querySelectorAll('.heat-row').length);

// Cambiar de pestaña a ranking
window.document.querySelector('[data-view="ranking"]').click();
const rankingBody = window.document.getElementById('rankingBody');
console.log('Ranking filas generadas:', rankingBody.querySelectorAll('tr').length);

// Probar ordenar por click en encabezado
const th = window.document.querySelector('#rankingTable th[data-sort="diferenciaKL"]');
th.click();
console.log('Ranking tras reordenar, filas:', rankingBody.querySelectorAll('tr').length);

// Probar tema
window.document.getElementById('themeToggleBtn').click();
const panelHidden = window.document.getElementById('themePanel').classList.contains('hidden-block');
console.log('Panel de tema se abre al hacer click:', !panelHidden);
window.document.getElementById('modeLightBtn').click();
console.log('Modo claro aplicado:', window.document.body.classList.contains('theme-light'));
const swatch = window.document.querySelector('.swatch');
swatch.click();
console.log('Acento cambiado a:', window.document.body.style.getPropertyValue('--accent'));

// Filtros
window.document.getElementById('filterSede').value = 'Naranjos';
window.document.getElementById('filterSede').dispatchEvent(new window.Event('change'));
console.log('Filtro de sede aplicado sin error');

console.log('\\nErrores capturados durante la ejecución:', errors.length ? errors : '(ninguno)');
