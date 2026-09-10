import { chromium } from 'playwright';
import path from 'path';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', err => errors.push(err.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

const fileUrl = 'file://' + path.resolve('./tests/manual/downloaded_informe.html');
await page.goto(fileUrl);
await page.waitForTimeout(400);

console.log('KPI grid texto:', (await page.$eval('#kpiGrid', el => el.textContent)).replace(/\s+/g, ' ').trim());

// Probar las 5 vistas
for (const view of ['sede', 'categoria', 'heatmap', 'scatter', 'ranking']) {
  await page.click(`[data-view="${view}"]`);
  await page.waitForTimeout(200);
  const visible = await page.$eval(`#view-${view}`, el => !el.classList.contains('hidden-block'));
  console.log(`Vista "${view}" visible tras click:`, visible);
}

// Probar heatmap tiene contenido real
const heatRows = await page.$$eval('.heat-row', els => els.length);
console.log('Filas del mapa de calor:', heatRows);

// Probar ranking tiene filas y se puede reordenar
let rankingRows = await page.$$eval('#rankingBody tr', els => els.length);
console.log('Filas de ranking:', rankingRows);
await page.click('[data-sort="disponible"]');
await page.waitForTimeout(150);
rankingRows = await page.$$eval('#rankingBody tr', els => els.length);
console.log('Filas de ranking tras reordenar:', rankingRows);

// Probar personalización de tema
await page.click('#themeToggleBtn');
const panelVisible = await page.$eval('#themePanel', el => !el.classList.contains('hidden-block'));
console.log('Panel de tema visible:', panelVisible);
await page.click('#modeLightBtn');
const isLight = await page.$eval('body', el => el.classList.contains('theme-light'));
console.log('Modo claro aplicado:', isLight);
await page.click('.swatch');
const accent = await page.$eval('body', el => el.style.getPropertyValue('--accent'));
console.log('Color de acento tras click en swatch:', accent);

// Probar filtro de sede
const sedeOptionValue = await page.$eval('#filterSede option:nth-child(2)', el => el.value);
console.log('Nombre de sede real detectado:', sedeOptionValue);
await page.selectOption('#filterSede', sedeOptionValue);
await page.waitForTimeout(200);
console.log('Filtro de sede aplicado sin error');

console.log('\nErrores capturados:', errors.length ? errors : '(ninguno)');
await browser.close();
