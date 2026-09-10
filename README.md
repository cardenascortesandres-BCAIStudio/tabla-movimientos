# Tabla de Movimientos por Producto

Sistema de cálculo automático de la "Tabla de Movimientos por Producto" para una
empresa de comercialización de carnes con varios puntos de venta. Carga uno o
varios Excel semanales (uno por sede), calcula el informe completo (Teórico,
Disponible, Diferencia KL, % Diferencia), y genera:

1. Un Excel por sede con **fórmulas reales y colores** idénticos a la pantalla.
2. Un Excel consolidado (todas las sedes + hoja Resumen).
3. Un **informe HTML interactivo standalone** con 5 modos de visualización y
   personalización de aspecto — para compartir el análisis sin necesidad de la
   plataforma completa.

Todo corre 100% en el navegador. Sin backend, sin instalación para el usuario
final: el resultado de `npm run build` es un único archivo `.html` que se abre
con doble clic (incluso sin conexión a internet).

Además, incluye un módulo de **Balance Semanal** (Ventas, Compras, Inventario
Inicial/Final, CMV, Utilidad Bruta, Margen %) por sede, que se elige desde la
pantalla inicial. A diferencia de la Tabla de Movimientos, este módulo SÍ
necesita la versión desplegada en Railway (`npm run build:web` +
`server/index.js` + Postgres) para guardar el historial semana a semana y
generar el informe comparativo — ver "Módulo de Balance" más abajo.

## Requisitos

- Node.js 20.9+ y npm.
- Solo para el módulo de Balance en producción: una base de datos Postgres
  (en Railway, se agrega como plugin del proyecto — inyecta `DATABASE_URL`
  automáticamente).

## Empezar

```bash
npm install
npm run dev       # servidor de desarrollo con recarga en caliente (http://localhost:5173)
npm run build     # genera dist/index.html — el archivo final para distribuir (doble clic, sin backend)
npm run preview   # sirve dist/ localmente para probar el build de producción
npm test          # corre la suite de regresión (vitest) sobre src/core, src/sede y el Balance
```

### Módulo de Balance (versión web con Postgres)

```bash
cp .env.example .env        # y completa DATABASE_URL con tu Postgres local
npm run build:web           # genera dist-web/
npm run dev:server          # levanta server/index.js (API /api/balance/* + estático de dist-web/)
npm run dev:web             # servidor de Vite en modo desarrollo, con proxy /api -> dev:server
```

En Railway, `npm run start:web` ahora corre `server/index.js` (antes era solo
`serve -s dist-web`) — sirve el sitio y expone la API. Si `DATABASE_URL` no
está configurada, las rutas `/api/balance/*` responden `503` en vez de tumbar
el servidor completo (el resto del sitio sigue funcionando).

**Importante:** después de `npm run build`, prueba `dist/index.html` **en un
navegador real** (ábrelo con doble clic, o `npx serve dist`), nunca solo con
herramientas tipo jsdom — ver `tests/manual/README.md` para por qué.

## Estructura del proyecto

```
src/
  data/masterCatalog.js       Catálogo maestro oficial (categorías/productos fijos)
  core/                       Lógica pura, sin DOM — el corazón del sistema
    normalize.js                Normalización de texto y de códigos de producto
    classify.js                 Clasificación de columnas de movimiento (9 reglas)
    headerDetection.js          Detección de la fila de encabezados (2 métodos)
    parse.js                    Parseo de filas de datos, fila TOTAL, pies de página
    catalog.js                  Indexación del catálogo + agrupación del informe
    aggregate.js                Fórmulas: Teórico, Disponible, Diferencia KL, etc.
    workbookUtils.js             Búsqueda de un encabezado a través de todas las hojas
    balanceFileA.js              Parseo del reporte "Movimiento por Grupo" (Tecnocarnes) — único archivo del Balance
    tipoDoctoClassify.js         Clasificación de Tipo Docto en los 6 baldes del Balance
    balanceFormulas.js           Fórmulas del Balance: CMV, Utilidad Bruta, Margen %
    localeNumber.js              Parseo tolerante de números en texto (US/CO)
  sede/                       Estado y orquestación por sede (Tabla de Movimientos)
    sedeContext.js
    columnLayout.js
  balance/                    Estado, API y agregación del módulo de Balance
    balanceContext.js
    balanceApi.js
    balanceDashboardData.js
  export/
    excelExport.js              Export a Excel con ExcelJS (fórmulas + colores)
    htmlReportExport.js          Informe HTML interactivo standalone (Tabla de Movimientos)
    balanceExcelExport.js        Export a Excel del Balance (formato único, todas las sedes)
    balanceHtmlReportExport.js   Informe comparativo HTML del historial de Balance
  dashboard/
    dashboardData.js             Agregación consolidada multi-sede
  vendor/
    chart.umd.min.js             Copia local de Chart.js (ver comentario en el archivo)
  styles/
    theme-vars.css                Paleta oficial (via src/theme/templates.js)
    main.css
  main.js                      Punto de entrada: DOM, wiring, event listeners de ambos flujos
index.html                    Entrada de Vite (dev + build) — pantalla inicial + los 2 flujos
server/                       Backend de la versión web (Railway) — solo para Balance
  index.js                      Express: sirve dist-web/ + monta /api/balance/*
  db.js                         Pool de Postgres (DATABASE_URL)
  migrate.js + migrations/      Esquema de balance_classification / balance_weeks
  routes/balance.js             Endpoints REST del historial de Balance
tests/
  core.test.js                 Suite de regresión (vitest) — Tabla de Movimientos
  balance.test.js               Suite de regresión (vitest) — Balance, contra números reales confirmados
  fixtures/                    Generadores de archivos de prueba sintéticos
  manual/                      Scripts de validación manual/end-to-end (ver su README)
```

## Filosofía de diseño (no romper esto)

1. **Nunca inventar datos.** Si un producto del catálogo no aparece en el archivo
   cargado, no aparece en el informe (ni en cero). Si el archivo trae un producto
   fuera del catálogo, se muestra igual, agrupado al final.
2. **Todo se puede auditar.** Los Excel exportados llevan fórmulas reales, no solo
   valores — y se validan recalculando con LibreOffice (`recalc.py`, ver más abajo).
3. **`src/core/*` es puro** (sin `document`, sin `window`) — así se puede testear
   con vitest sin DOM y reusar igual en Node como en el navegador.
4. **Los colores en pantalla, en el Excel exportado, y en el informe HTML
   interactivo deben coincidir.** La paleta vive en `src/styles/theme-vars.css` y
   se replica manualmente en `PALETTE` dentro de `src/export/excelExport.js` —
   si cambias una, cambia la otra.

## Cómo validar cambios (antes de dar algo por terminado)

Ver `PROMPT_PARA_CLAUDE_CODE.md` sección "Cómo probar tus cambios" para la
metodología completa (recalcular fórmulas con LibreOffice, probar con Playwright
contra un navegador real, etc.) — no te fíes de "compiló sin errores" como única
señal de que algo funciona.
