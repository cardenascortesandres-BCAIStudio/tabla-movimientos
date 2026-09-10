# tests/manual/

Estos NO son parte de la suite automática (`npm test`, que vive en `tests/core.test.js`
y sí corre con datos sintéticos). Son los scripts que se usaron para validar el
sistema contra datos reales durante el desarrollo, y quedan aquí como referencia /
plantilla para que Claude Code los reutilice cuando necesite volver a probar
end-to-end con un archivo real de una sede.

**No se incluye ningún archivo Excel real de la empresa** (son datos privados del
negocio) — para volver a correr estos scripts, coloca tu propio archivo de ejemplo
en esta carpeta (p. ej. `tests/manual/mi_archivo_real.xls`) y ajusta la ruta dentro
del script correspondiente.

## Scripts disponibles

- `test_excel_export.mjs` — genera un Excel de una sede y uno consolidado usando
  `src/export/excelExport.js` (ExcelJS), para inspeccionar manualmente fórmulas/colores.
- `test_html_report.mjs` — genera el informe HTML interactivo standalone
  (`src/export/htmlReportExport.js`) a partir de datos de una o más sedes.
- `smoke_test_report.mjs` — smoke test con jsdom del informe HTML generado arriba
  (KPIs, heatmap, ranking, tema — todo excepto los gráficos Chart.js, que jsdom no
  soporta con `<canvas>` real; para eso usa el test con Playwright).
- `real_browser_test.mjs` / `real_browser_test_report.mjs` — **los más importantes**:
  usan Playwright con un Chromium real (no jsdom) para probar la app completa
  (`dist/index.html`, ya compilada) y el informe descargado, exactamente como lo
  haría un usuario real haciendo doble clic. Requieren `npm run build` primero y un
  Chromium accesible (ver `PROMPT_PARA_CLAUDE_CODE.md` sección de testing).
- `smoke_test_build.mjs` — versión con jsdom del test de arriba (dejar solo como
  referencia histórica: **jsdom no ejecuta `<script type="module">` inline**, por
  lo que este test NO sirve para validar el build final; usa Playwright en su lugar).
- `real_browser_test_balance.mjs` — igual que `real_browser_test.mjs` pero para el
  módulo de Balance: elige el flujo desde la pantalla inicial, carga los dos
  fixtures de `tests/fixtures/fixture_balance_file{A,B}_decepaz.xlsx`, genera el
  balance, descarga el Excel, y confirma que "Guardar esta semana" / "Informe
  comparativo" fallan con un aviso visible (no con una excepción sin capturar)
  cuando no hay servidor/base de datos detrás — que es el caso siempre que se
  prueba contra `dist/index.html` (build de doble clic, sin backend).

## Por qué Playwright y no jsdom

`vite-plugin-singlefile` empaqueta la app como un único `<script type="module">`
inline. jsdom (usado en la suite automática por velocidad) no ejecuta scripts de
tipo módulo inline — es una limitación conocida de la herramienta, no del código.
Para probar el **build final** (`dist/index.html`) siempre usa un navegador real
(Playwright/Chromium), como hacen `real_browser_test*.mjs`.
