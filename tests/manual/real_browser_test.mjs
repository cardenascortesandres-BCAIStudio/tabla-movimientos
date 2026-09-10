import { chromium } from 'playwright';
import path from 'path';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();

const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message));

const fileUrl = 'file://' + path.resolve('./dist/index.html');
await page.goto(fileUrl);
await page.waitForTimeout(300);

console.log('Título de la página:', await page.title());
console.log('genBtn deshabilitado al inicio:', await page.$eval('#genBtn', el => el.disabled));

// Cargar el archivo real vía el input
const filePath = path.resolve('./tests/manual/MOVIMIENTOS_EJEMPLO.xls');
await page.setInputFiles('#fileInput', filePath);
await page.waitForTimeout(800);

const sedeListVisible = await page.$eval('#sedeListCard', el => !el.classList.contains('hidden-block'));
console.log('sedeListCard visible tras cargar archivo:', sedeListVisible);
const sedeListText = await page.$eval('#sedeListBody', el => el.textContent);
console.log('Contenido de sedeListBody:', sedeListText.slice(0, 300));

const genBtnEnabled = await page.$eval('#genBtn', el => !el.disabled);
console.log('genBtn habilitado:', genBtnEnabled);

await page.fill('#periodoInput', '20 - 26 Julio 2026');
await page.click('#genBtn');
await page.waitForTimeout(500);

const reportVisible = await page.$eval('#reportCard', el => !el.classList.contains('hidden-block'));
console.log('reportCard visible:', reportVisible);
const numTables = await page.$$eval('#detalleView table.report', els => els.length);
console.log('Tablas de detalle generadas:', numTables);
const kpiText = await page.$eval('#kpiGrid', el => el.textContent);
console.log('KPI grid (recorte):', kpiText.slice(0, 200));

// Probar exportación a Excel (descarga real)
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.click('#downloadAllBtn')
]);
const downloadPath = './tests/manual/downloaded_consolidado.xlsx';
await download.saveAs(downloadPath);
console.log('Excel consolidado descargado a:', downloadPath);

// Probar exportación del informe HTML interactivo
const [download2] = await Promise.all([
  page.waitForEvent('download'),
  page.click('#downloadHtmlReportBtn')
]);
const downloadPath2 = './tests/manual/downloaded_informe.html';
await download2.saveAs(downloadPath2);
console.log('Informe HTML descargado a:', downloadPath2);

console.log('\nErrores de consola/página capturados:', consoleErrors.length ? consoleErrors : '(ninguno)');

await browser.close();
