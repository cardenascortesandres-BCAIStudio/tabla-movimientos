import { chromium } from 'playwright';
import path from 'path';

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message));

const fileUrl = 'file://' + path.resolve('./dist/index.html');
await page.goto(fileUrl);
await page.waitForTimeout(300);

console.log('Título de la página:', await page.title());

// ---- Pantalla inicial: elegir Balance ----
const choiceVisible = await page.$eval('#modeChoiceCard', el => !el.classList.contains('hidden-block'));
console.log('Pantalla de elección visible al inicio:', choiceVisible);
await page.click('#modeBalanceBtn');
await page.waitForTimeout(200);
const balanceFlowVisible = await page.$eval('#balanceFlow', el => !el.classList.contains('hidden-block'));
console.log('balanceFlow visible tras elegir Balance:', balanceFlowVisible);

// ---- Cargar el único archivo ----
await page.fill('#balanceSedeInput', 'Decepaz');
await page.fill('#balanceWeekStartInput', '2026-07-20');
await page.fill('#balanceWeekEndInput', '2026-07-26');

const fileA = path.resolve('./tests/fixtures/fixture_balance_fileA_decepaz.xlsx');
await page.setInputFiles('#balanceFileAInput', fileA);
await page.waitForTimeout(500);

const fileAName = await page.$eval('#balanceFileAName', el => el.textContent);
console.log('Archivo cargado:', fileAName);

// Sin backend (double-click, file://), nunca hay historial previo -> debe
// pedir el Inventario Inicial a mano (sede "nueva" siempre en este escenario).
const invInicialVisible = await page.$eval('#balanceInvInicialCard', el => !el.classList.contains('hidden-block'));
console.log('Aviso de sede nueva / Inventario Inicial manual visible:', invInicialVisible);
if (invInicialVisible) await page.fill('#balanceInvInicialInput', '38254366.8');

const reviewVisible = await page.$eval('#balanceReviewCard', el => !el.classList.contains('hidden-block'));
console.log('Pantalla de revisión visible (etiquetas pendientes):', reviewVisible);
if (reviewVisible) {
  const reviewText = await page.$eval('#balanceReviewBody', el => el.textContent);
  console.log('Etiquetas pendientes de revisión:', reviewText.slice(0, 300));
}

const genEnabled = await page.$eval('#balanceGenBtn', el => !el.disabled);
console.log('balanceGenBtn habilitado (sin revisión pendiente):', genEnabled);

if (genEnabled) {
  await page.click('#balanceGenBtn');
  await page.waitForTimeout(500);
  const resultsVisible = await page.$eval('#balanceResultsCard', el => !el.classList.contains('hidden-block'));
  console.log('balanceResultsCard visible:', resultsVisible);
  const resultsText = await page.$eval('#balanceResultsView', el => el.textContent);
  console.log('Resultados (recorte):', resultsText.slice(0, 400));

  // Vista previa de "Datos usados para el balance" (pestaña 2 del Excel, solo lectura)
  const previewVisible = resultsText.includes('Datos usados para el balance');
  console.log('Vista previa de datos usados presente:', previewVisible);
  const usedCells = await page.$$eval('.balance-used-cell', els => els.length);
  console.log('Celdas resaltadas en amarillo (subtotales usados) en la vista previa:', usedCells);

  // Descarga del Excel del Balance (funciona 100% client-side, no depende del backend)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#balanceDownloadExcelBtn')
  ]);
  const downloadPath = './tests/manual/downloaded_balance.xlsx';
  await download.saveAs(downloadPath);
  console.log('Excel de Balance descargado a:', downloadPath);

  // ---- Guardar semana / informe comparativo sin backend: deben fallar
  // con un aviso visible, nunca con una excepción sin capturar ----
  await page.click('#balanceSaveWeekBtn');
  await page.waitForTimeout(300);
  console.log('Banner tras "Guardar esta semana" (sin backend):', await page.$eval('#balanceSaveBanner', el => el.textContent));

  await page.click('#balanceDownloadReportBtn');
  await page.waitForTimeout(300);
  console.log('Banner tras "Informe comparativo" (sin backend):', await page.$eval('#balanceSaveBanner', el => el.textContent));
}

const pageErrors = consoleErrors.filter(e => e.startsWith('PAGEERROR'));
console.log('\nErrores de página sin capturar (deben ser 0):', pageErrors.length ? pageErrors : '(ninguno)');
console.log('Avisos de consola (fetch fallido esperado sin backend):', consoleErrors.length - pageErrors.length);

await browser.close();
