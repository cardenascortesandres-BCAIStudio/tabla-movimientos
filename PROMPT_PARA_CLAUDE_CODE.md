# PROMPT PARA CLAUDE CODE — Continuación del proyecto "Tabla de Movimientos por Producto"

> **Cómo usar este documento:** ábrelo en VS Code con este proyecto ya cargado, y
> pégale a Claude Code el bloque "PROMPT INICIAL" de más abajo. Ese bloque le dice
> que lea este archivo completo antes de tocar nada. Todo lo demás en este
> documento es contexto de referencia que Claude Code debe consultar según lo
> vaya necesitando.

---

## PROMPT INICIAL (pega esto tal cual en el chat de Claude Code)

```
Lee completo el archivo PROMPT_PARA_CLAUDE_CODE.md antes de escribir o modificar
cualquier código. Es el brief de continuación de este proyecto (un sistema de
cálculo de inventarios para una empresa de comercialización de carnes, ya
parcialmente construido y probado). Contiene: qué está hecho y validado, qué
falta, decisiones de diseño que no debes romper, bugs reales ya encontrados y
corregidos (no los reintroduzcas), y cómo probar rigurosamente cualquier cambio
antes de darlo por terminado (con fórmulas de Excel y con un navegador real, no
solo "compiló sin errores").

Después de leerlo, dame un resumen de tu plan antes de empezar a programar.

Las tareas pendientes están en la sección "QUÉ FALTA POR HACER" del documento,
en orden de prioridad. Empieza por la primera salvo que yo te diga lo contrario.
```

---

## 1. Qué es este proyecto

Sistema para una empresa de comercialización de carnes (res, cerdo, pollo,
pescado, salsamentaria) con varios puntos de venta. Cada semana, cada sede
descarga de su plataforma (Tecnocarnes) un Excel con sus movimientos de
inventario. El sistema:

1. Lee ese Excel (formato variable según la sede — columnas distintas, a veces
   sin encabezados de texto para código/detalle).
2. Clasifica automáticamente cada columna de movimiento (compra, entrada, venta,
   salida, devolución, transformación, inventario inicial/final).
3. Cruza los productos contra un **catálogo maestro oficial** (categorías y
   nombres fijos) preservando su orden.
4. Calcula: Total Compras, Total Entradas, Total Venta, Total Salida, Teórico,
   Disponible, Diferencia KL, % Diferencia — por producto, por categoría, y gran
   total.
5. Permite cargar **varias sedes a la vez** y compararlas en un panel tipo
   dashboard.
6. Exporta:
   - Excel por sede (fórmulas reales + colores).
   - Excel consolidado (todas las sedes + hoja Resumen).
   - Un informe HTML interactivo standalone (offline, personalizable, con 5
     modos de visualización) para compartir el análisis.

Todo corre en el navegador, sin backend. `npm run build` produce **un único
archivo `dist/index.html`** que se abre con doble clic.

---

## 2. REGLA DE ORO (no negociable, viene del cliente)

**Nunca inventar, asumir, ni rellenar información que no esté literalmente en el
archivo cargado.**

- Si un producto del catálogo maestro no aparece en el archivo, no aparece en el
  informe (ni en cero).
- Si el archivo trae un producto (código) que no está en el catálogo maestro, se
  incluye igual, con su nombre y código reales, en una categoría al final:
  "PRODUCTOS ADICIONALES (fuera del listado maestro)".
- Si una columna no se puede clasificar con certeza, se le pregunta al usuario
  (nunca se adivina en silencio).
- Ningún valor numérico se calcula "a ojo": todo sale de sumas/restas reales.

Esta regla ya está implementada en `src/core/*`. Si vas a tocar esa carpeta,
vuelve a leer esta sección antes.

---

## 3. Qué está implementado y VALIDADO (no es teoría — se probó con datos reales)

### 3.1 Núcleo (`src/core/*`, `src/sede/*`)

- Detección de la fila de encabezados por **dos métodos**:
  - **Método A** (`headerDetection.js`): busca literalmente "CODIGO"/"ITEM" +
    "DETALLE"/"DESCRIPCION". "CODIGO" explícito siempre gana sobre "ITEM" si
    ambos aparecen (bug real ya corregido).
  - **Método B** (respaldo, por inferencia): cuando el archivo NO trae esas
    palabras (caso real: exportaciones de Tecnocarnes, que traen las tres
    primeras columnas — categoría/código/detalle — sin encabezado de texto),
    se ubica la fila por la cantidad de columnas de movimiento reconocibles, y
    se infiere cuál columna es el código (valores numéricos) y cuál el detalle
    (texto).
- Clasificación de columnas (`classify.js`) con 9 reglas de prioridad (ver el
  código, está comentado con la regla exacta). Incluye el caso "DEVOLUCION"
  ambigua (sin "VENTA"/"COMPRA"/"FACTURA"/"POS" en el nombre) → se asume
  Devolución de Venta por defecto, pero se marca `uncertain: true` para que la
  interfaz se lo muestre al usuario.
- Normalización de códigos (`normalize.js`): quita comas de miles (`171,201` →
  `171201`) y residuo decimal (`2700.0` → `2700`).
- Parseo de filas (`parse.js`): detecta la fila "TOTAL" del archivo (para
  autovalidación) sin importar en qué columna venga la palabra "Total" (puede
  venir en Detalle, o en la primera columna como en Tecnocarnes, o no venir
  como texto), e ignora silenciosamente filas de pie de página / paginación sin
  datos reales.
- Catálogo (`catalog.js`): usa la **primera coincidencia** cuando un código se
  repite en el catálogo maestro (ocurre con los códigos `1705`, `1404`, `1405`
  — es así en el archivo fuente de la empresa, no se corrige). Fusiona (suma)
  filas duplicadas del mismo código dentro de un archivo en vez de duplicarlas.
- Fórmulas (`aggregate.js`):
  - `Total Compras = Σcompra + Σdevolución_compra`
  - `Total Entradas = Σentrada`
  - `Total Venta = Σventa + Σdevolución_venta`
  - `Total Salida = Σsalida`
  - `Teórico = InvInicial + TotalCompras + TotalEntradas − TotalVenta − TotalSalida + Transformaciones`
  - `Disponible = InvInicial + TotalCompras + TotalEntradas`
  - `Diferencia KL = InvFinal − Teórico`
  - `% Diferencia (fila) = Diferencia KL de la fila ÷ Disponible de SU CATEGORÍA` (no
    el disponible propio de la fila — esto es fácil de romper por accidente, ver
    tests).

**Validado contra un archivo real de Tecnocarnes** (135 productos, 16 columnas
de movimiento): las 16 columnas se clasificaron sin ninguna ambigüedad, y la
fila "TOTAL" del propio archivo coincidió exactamente con las sumas calculadas
por el sistema en TODAS las columnas.

### 3.2 Exportación a Excel (`src/export/excelExport.js`)

Migrado de SheetJS a **ExcelJS** porque SheetJS (community) no soporta bien
colores de celda. Ahora el Excel exportado tiene:

- **Fórmulas reales** (`SUM(...)`, `IF(...)`) — no solo valores. Categoría →
  subtotal con `SUM` sobre el rango de filas de productos. Gran total → `SUM`
  sobre las filas de subtotal (no contiguas, se listan explícitamente).
- **Colores idénticos a la pantalla**: encabezado de categoría (fondo oscuro,
  texto blanco), subtotal (gris claro), gran total (casi negro), Diferencia KL
  negativa (fondo rojo claro, texto rojo), Diferencia KL en cero (fondo verde
  claro, texto verde). La paleta vive en la constante `PALETTE` al inicio del
  archivo, y **debe mantenerse sincronizada manualmente** con
  `src/styles/theme-vars.css` (Excel no puede leer CSS).
- Export consolidado con hoja "Resumen" (una fila por sede, con fórmulas) +
  una hoja por sede.

**Validado**: recalculado con LibreOffice (`soffice --headless`, ver sección 6)
— 0 errores en más de 2,800 fórmulas del archivo consolidado. Los colores
sobreviven el recálculo (se verificó abriendo el archivo con `openpyxl` después
de recalcular). Los valores del Gran Total coinciden exactamente con los
calculados en pantalla.

### 3.3 Informe HTML interactivo standalone (`src/export/htmlReportExport.js`)

Genera un `.html` autocontenido (Chart.js embebido como texto, sin dependencias
externas) con:

- **5 modos de visualización** (pestañas): 📊 Por sede, 📦 Por categoría, 🔥 Mapa
  de calor (categoría × sede), 🎯 Dispersión (Disponible vs Diferencia KL, un
  punto por producto), 🏆 Ranking de productos (tabla ordenable por columna,
  top 100, filtrable).
- **Filtros** por sede y por categoría (afectan categoría/dispersión/ranking).
- **Personalización visual**: modo claro/oscuro, y 6 colores de acento
  predefinidos + selector de color libre (`<input type="color">`). Los cambios
  se aplican en vivo vía la variable CSS `--accent`.
- Los datos van embebidos como JSON en el HTML (`const DASH_DATA = {...}`) — es
  un corte fijo del momento de la exportación, no se conecta a nada.

**Validado con Playwright + Chromium real**: las 5 vistas cambian correctamente,
el heatmap y el ranking generan filas reales, el ranking se reordena al hacer
clic en un encabezado, el tema (claro/oscuro + acento) se aplica, los filtros no
truenan. Cero errores de consola/página.

### 3.4 Build / distribución

`vite.config.js` usa `vite-plugin-singlefile` para que `npm run build` genere
un único `dist/index.html` (~1.75 MB, con xlsx.js + Chart.js + ExcelJS + todo el
código embebido) que funciona **sin servidor, incluso vía `file://`**
(doble clic).

**Bug real ya encontrado y corregido**: el código original esperaba a
`document.addEventListener('DOMContentLoaded', ...)` para inicializar la app.
Con `<script type="module">` (que es como Vite compila el bundle), el DOM ya
está listo cuando el script se ejecuta — esperar `DOMContentLoaded` es una
carrera que en algunos casos (se vio en pruebas) nunca se resuelve. La
inicialización ahora se llama directamente al final de `main.js`, sin esperar
ese evento. **No reintroduzcas el patrón `DOMContentLoaded` en el entry point.**

---

## 4. Decisiones de arquitectura (y por qué)

| Decisión | Por qué |
|---|---|
| Vite + `vite-plugin-singlefile` | Mantiene la distribución "un solo HTML, doble clic, sin servidor" que ya funcionaba, pero con código modular y mantenible en vez de un archivo de 1500 líneas. |
| `src/core/*` sin `document`/`window` | Se puede testear con vitest sin necesidad de DOM, y se reusa igual en Node (scripts de validación) que en el navegador. No metas DOM ahí. |
| ExcelJS en vez de SheetJS para exportar | SheetJS (community, sin paga) no soporta estilos de celda de forma confiable. ExcelJS sí, y también soporta fórmulas. Se usa SheetJS todavía para **leer** el archivo del usuario (`XLSX.read` en `main.js`) porque ahí no se necesitan estilos, solo lectura de valores — no hace falta migrar esa parte. |
| Chart.js vendorizado en `src/vendor/` en vez de importado directo del paquete npm | El `package.json` de `chart.js` restringe los subpaths que se pueden importar (`exports` field), lo que rompe el import `?raw` que necesitamos para incrustar el código como texto dentro del informe HTML exportado. Solución: se copió `node_modules/chart.js/dist/chart.umd.min.js` a `src/vendor/chart.umd.min.js` y se importa esa copia local. **Si actualizas la versión de chart.js, tienes que volver a copiar el archivo.** |
| Paleta de colores duplicada (CSS + constante JS) | Excel no puede leer variables CSS en tiempo de exportación. La única forma de garantizar "mismo color en pantalla y en Excel" es tener la paleta en dos lugares y mantenerlos sincronizados a mano: `src/styles/theme-vars.css` y `PALETTE` en `src/export/excelExport.js`. Si tocas una, toca la otra. |
| Testing con Playwright, no solo jsdom | jsdom **no ejecuta `<script type="module">` inline** (se comprobó experimentalmente). El build final usa exactamente ese patrón. jsdom sirve para testear módulos aislados (ej. el informe HTML exportado, que sí corre con jsdom salvo los gráficos Chart.js que necesitan un `<canvas>` real). Para probar `dist/index.html` completo, usa Playwright con un Chromium real. |

---

## 5. Historial de bugs reales ya encontrados y corregidos (no los reintroduzcas)

Estos se descubrieron con pruebas automatizadas contra datos reales, no
inspección de código. Cada uno tiene su caso de regresión en `tests/core.test.js`:

1. **Detección de encabezado con "ITEM" y "CODIGO" a la vez** → debe ganar
   "CODIGO" explícito. (Un archivo real podría traer ambas por accidente de
   formato).
2. **Archivos sin palabras "CODIGO"/"DETALLE" en el encabezado** (caso real:
   Tecnocarnes) → requiere el Método B de inferencia por forma.
3. **Fila "TOTAL" en columna distinta a Detalle** (caso real: Tecnocarnes trae
   "Total" en la columna de categoría, no en Detalle) → la detección no debe
   depender de en qué columna aparece la palabra.
4. **Filas de pie de página sin código ni datos** (ej. "1 de 1", nombre del
   sistema) → deben ignorarse silenciosamente, no confundirse con la fila TOTAL
   ni generar productos fantasma.
5. **`DOMContentLoaded` como carrera con `type="module"`** → ver sección 3.4.
6. **`chart.js` package exports restringidos** rompiendo el import `?raw` →
   solución del vendoring, ver sección 4.

---

## 6. Cómo probar tus cambios (metodología — no te saltes esto)

**"Compiló sin errores" NO es suficiente evidencia de que algo funciona.** Antes
de dar por terminada cualquier tarea:

### 6.1 Lógica de negocio (`src/core/*`, `src/sede/*`)

```bash
npm test
```

Si agregas un caso nuevo (una regla de clasificación nueva, un formato de
archivo nuevo, etc.), agrega también su test en `tests/core.test.js` con datos
sintéticos mínimos que reproduzcan el caso — no dependas de tener el archivo
real de un cliente a mano.

### 6.2 Fórmulas de Excel — recalcula con un motor de hojas de cálculo real

Un Excel con fórmulas puede "verse bien" en pantalla y aun así tener una
fórmula rota que Excel/LibreOffice marcarían como error (`#REF!`, `#DIV/0!`) o
que apunta al rango equivocado. **Nunca confíes en los valores que tú mismo
calculaste en JS como prueba de que la fórmula de Excel está bien** — hay que
dejar que un motor de hojas de cálculo de verdad la evalúe.

Si tienes LibreOffice instalado localmente:

```bash
# Recalcula abriendo, forzando cálculo, y regrabando (in-place)
soffice --headless --convert-to xlsx --outdir /tmp/recalculado archivo.xlsx
```

Después, abre `/tmp/recalculado/archivo.xlsx` con `openpyxl` (Python) con
`data_only=True` y revisa que no haya celdas con texto `#REF!`, `#DIV/0!`,
`#VALUE!`, etc., y que los valores coincidan con lo esperado.

Si no tienes LibreOffice disponible en el entorno, una alternativa sin
dependencias externas es usar una librería de evaluación de fórmulas en Node
(ej. `hyperformula`) para validar los `SUM`/`IF` generados de forma
automatizada dentro de un test — es más liviano para CI, aunque LibreOffice
sigue siendo la validación más "real" porque es el mismo motor que usará el
cliente.

### 6.3 El build final (`dist/index.html`) — usa un navegador real, no jsdom

```bash
npm run build
```

Luego, con Playwright (o Puppeteer) y un Chromium real instalado:

```js
const { chromium } = require('playwright');
const browser = await chromium.launch(); // si falla porque no encuentra el
// ejecutable, corre `npx playwright install chromium` primero
const page = await browser.newPage();
await page.goto('file://' + require('path').resolve('./dist/index.html'));
// ... interactuar con la página como lo haría un usuario real
```

Prueba como mínimo: cargar un archivo (`page.setInputFiles`), generar el
informe, que las tablas/KPIs aparezcan con los números esperados, que los dos
botones de descarga (`#downloadAllBtn`, `#downloadHtmlReportBtn`) disparen un
evento `download` real (`page.waitForEvent('download')`).

**Por qué no jsdom para esto**: se comprobó que jsdom no ejecuta
`<script type="module">` inline (el marcador de prueba `window.__x` nunca se
setea, sin ningún error reportado — falla en silencio). Como el build de Vite
usa exactamente ese patrón, cualquier prueba con jsdom del `dist/index.html`
dará un falso negativo total (parecerá que nada funciona, cuando en un
navegador real sí funciona). Este fue justamente el bug #5 de la sección
anterior — lo que parecía un bug de la app en realidad era una limitación de la
herramienta de prueba, y solo se pudo confirmar comparando contra un Chromium
real.

---

## 7. QUÉ FALTA POR HACER (en orden de prioridad sugerido)

Esto es lo que el cliente pidió y que **no llegué a pulir del todo** o que
quedó como primera versión funcional pero mejorable:

1. **Ampliar la personalización visual del informe HTML interactivo.**
   Actualmente solo hay claro/oscuro + color de acento. El cliente pidió
   "modificar el aspecto visual" en términos generales — vale la pena agregar:
   tamaño de fuente / densidad de tabla, tipo de gráfico alternable (barra ↔
   línea ↔ dona donde tenga sentido), posibilidad de subir un logo de la
   empresa al informe exportado, y quizás guardar la preferencia de tema en
   `localStorage` **del navegador donde se genera el reporte** (ojo: el HTML
   exportado es standalone y se abre potencialmente en OTRO computador, así
   que el tema elegido ahí no debería depender de `localStorage` del que lo
   generó — más bien cada persona que abre el informe ajusta su propio tema
   localmente, lo cual ya funciona así).

2. **Pulir el nombre de sede auto-sugerido.** `guessSedeName()`
   (`src/sede/sedeContext.js`) a veces no logra extraer un nombre limpio del
   archivo (ej. si el nombre del archivo es genérico) y cae de vuelta al
   nombre del archivo sin extensión. No es un bug, pero se puede mejorar la
   heurística o simplemente dejarlo así y confiar en que el usuario lo edita
   (el campo ya es editable en la interfaz).

3. **Decisión de negocio pendiente sobre el catálogo maestro.** Con el archivo
   real de Tecnocarnes se detectaron 36 productos reales que NO están en el
   `MASTER_CATALOG` (adobos "La Abuela", canastillas plásticas, cargo de
   domicilio, algunos cortes de pollo/cerdo adicionales — ver el código de
   `countAdditionalProducts` y correr el sistema con un archivo real para ver
   la lista completa). El sistema los maneja correctamente (categoría
   "PRODUCTOS ADICIONALES"), pero **hay que preguntarle al cliente** si quiere
   que se agreguen esos productos al catálogo maestro oficial (para que
   aparezcan en su categoría correcta en vez de en "adicionales" cada semana).
   Esto es una decisión del cliente sobre datos de su negocio, no algo que el
   código deba decidir solo.

4. **Historial / comparación entre periodos (semana a semana).** El cliente no
   lo pidió explícitamente todavía, pero es la extensión natural dado que ya
   pidió "escalable para futuras actualizaciones": el sistema hoy solo compara
   sedes entre sí para UN periodo. Guardar los resultados de cada semana
   (¿en `localStorage`? ¿en un archivo?, ¿backend simple más adelante?) y poder
   ver tendencias de Diferencia KL en el tiempo sería el siguiente paso lógico.
   **No lo construyas sin confirmarlo con el cliente primero** — podría no ser
   lo que quiere y es una cantidad de trabajo considerable (afecta persistencia
   de datos, algo que hoy el sistema deliberadamente no tiene por diseño
   "todo vive en la sesión del navegador, nada se guarda").

5. **Suite de pruebas end-to-end automatizada con Playwright**, integrada como
   script de `npm` (ej. `npm run test:e2e`), en vez de scripts sueltos en
   `tests/manual/`. Hoy esas pruebas existen y están validadas, pero se
   corrieron manualmente — vale la pena que corran automáticamente (aunque sea
   como paso manual de CI, ya que requieren un Chromium instalado).

6. **Revisar accesibilidad y responsividad móvil.** No se evaluó todavía si la
   interfaz (ni el informe HTML exportado) funciona razonablemente en pantallas
   pequeñas o con lectores de pantalla. Dado que el usuario mencionó querer
   algo "interactivo y futurista", probablemente se use principalmente en
   escritorio, pero vale la pena una pasada básica.

---

## 8. Catálogo maestro — recordatorio de su formato

`src/data/masterCatalog.js` exporta `MASTER_CATALOG`: un arreglo de categorías
(`{ category, items: [{ code, name }] }`), en el orden oficial exacto en que
deben aparecer en el informe. **Algunos códigos se repiten intencionalmente**
entre categorías (`1705`, `1404`, `1405`) — es así en el archivo fuente de la
empresa. `buildCatalogIndex()` usa siempre la primera coincidencia en el orden
del arreglo. No "corrijas" estos duplicados ni cambies el orden de las
categorías sin que te lo pida explícitamente el cliente — el orden es su
convención de negocio, no un detalle técnico arbitrario.
