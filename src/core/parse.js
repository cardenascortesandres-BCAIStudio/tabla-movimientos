// Parseo de las filas de datos de un archivo ya con encabezado detectado.

import { normText, normalizeCode } from './normalize.js';
import { MOVIMIENTOS_EXCLUDED_CODES } from '../data/movimientosExclusionList.js';

// Productos que no son carne/pescado (insumos, empaques, aseo, domicilios) —
// se excluyen del conteo aunque tengan código y aparezcan en el archivo.
const EXCLUDED_NAME_KEYWORDS = ['ADOBO', 'CANASTILLA', 'BOLSA', 'HIPOCLORITO', 'DETERGENTE', 'DOMICILIO'];

// RAÍZ del problema de minimarket (2026-10-15): la lista de códigos de abajo
// SIEMPRE va un paso atrás, porque el SKU/código rota sin parar (cambia de
// marca, sabor o presentación cada semana) — cada vez que entra un producto
// nuevo toca agregarlo a mano. Pero el archivo crudo de movimientos (export
// de Crystal Reports del punto de venta) SÍ trae una señal estable: la
// columna justo a la izquierda del código trae el nombre de la SECCIÓN del
// propio sistema (en la ÚLTIMA fila de cada grupo, ej. "CERDO", "CAFÉ -
// CHOCOLATE - PANELA") — y esas ~50 secciones son el catálogo FIJO del
// propio negocio, casi nunca cambian (confirmado con archivos reales de
// Jamundí y Alameda, 09 y 15 oct 2026). Usar la sección en vez del código
// resuelve el problema de raíz: un producto nuevo en una sección de
// minimarket YA CONOCIDA se descarta solo, sin esperar a que alguien lo
// note y me pida agregarlo.
// Si la sección no calza con ninguna de las dos listas (archivo de una sede
// sin esta columna, o una sección nueva que todavía no se ha visto) no pasa
// nada: se sigue igual que antes, por código/palabra clave.
const CARNICO_SECTION_LABELS = new Set([
  '01-RES', '01-RES Y 03-CERDO', 'CARNE DE POLLO', 'CARNE PARA ALBONIGAS',
  'CARNES FINAS', 'CARNES FRIAS', 'CARNES PULPAS', 'CARNES SEGUNDAS', 'CERDO',
  'CHORIZOS', 'GRASA-SEBO Y GORDANA', 'HUESOS CARNUDOS', 'PESCADO',
  'PROCESADOS SALSAMENTARIA', 'VISCERAS DE RES'
]);
const MINIMARKET_SECTION_LABELS = new Set([
  'ALIMENTO PARA MASCOTAS', 'AREPAS', 'AZUCAR Y ENDULZANTES', 'BEDIDAS Y REFRESCOS',
  'BOLSA CANASTA', 'BOLSA PRECORTE', 'BOLSAS EMPAQUES Y ETIQUETAS', 'BOLSAS TERMOENCOGIBLES',
  'CAFE - CHOCOLATE - PANELA', 'CALDOS DE GALLINA Y COSTILLA', 'CANASTILLAS', 'CARBON',
  'COMIDA INSTANTANEA', 'CONCENTRADOS, JUGOS, AROMATICA', 'CONDIMENTOS, ESPECIAS Y SAL',
  'CONFITERIA', 'CONSERVAS, JALEAS Y ENLATADOS', 'DESECHABLES', 'GALLETERIA',
  'GRANOS Y ABARROTES', 'HARINAS', 'HUEVOS', 'INSUMOS SALSAMENTARIA', 'LICORES',
  'LICORES Y CERVEZAS', 'MARGARINAS Y ACEITES', 'MEDICAMENTOS CRIADERO (VM)',
  'OTROS PRODUCTOS', 'PRODUCTOS CONGELADOS', 'PRODUCTOS DE ASEO PERSONAL',
  'PRODUCTOS DE ASEO Y LIMPIEZA', 'PRODUCTOS DE PANADERIA', 'PRODUCTOS Y DERIVADOS LACTEOS',
  'SALSAS, MAYONESA Y ADOBOS', 'SERVICIOS - DOMICILIO', 'SERVICIOS - EMPAQUE AL VACIO',
  'SERVICIOS - OTROS SERVICIOS'
]);

// Productos de minimarket ya vistos antes (ver src/data/movimientosExclusionList.js)
// — queda como respaldo para cuando la sección no está disponible o no se
// reconoce (sin esto, estos productos no entraban en ningún bloque del
// catálogo maestro y terminaban cayendo en "PRODUCTOS ADICIONALES (fuera
// del listado maestro)", ver src/core/catalog.js).
function isExcludedProduct(nameNorm, codeNorm, sectionNorm) {
  if (sectionNorm) {
    if (CARNICO_SECTION_LABELS.has(sectionNorm)) return false;
    if (MINIMARKET_SECTION_LABELS.has(sectionNorm)) return true;
  }
  return EXCLUDED_NAME_KEYWORDS.some(kw => nameNorm.includes(kw)) || MOVIMIENTOS_EXCLUDED_CODES.has(codeNorm);
}

export function parseDataRows(rows, headerInfo, movementCols) {
  const products = [];
  let totalRow = null;
  let skippedNoCode = 0;
  let skippedExcluded = 0;

  // Crystal Reports pone el nombre de la sección en la ÚLTIMA fila de cada
  // grupo, no al principio (ej. "CERDO" aparece en la fila de TOCINETA
  // BARRIGA que CIERRA ese grupo, no en la primera). Por eso se calcula de
  // atrás para adelante: cada fila hereda la sección de la fila que la
  // cierra más adelante, no de la que ya pasó.
  const sectionByRow = new Array(rows.length).fill('');
  if (headerInfo.codeCol > 0) {
    let current = '';
    for (let r = rows.length - 1; r >= headerInfo.headerRowIndex + 1; r--) {
      const sectionTxt = normText((rows[r] || [])[headerInfo.codeCol - 1]);
      if (sectionTxt) current = sectionTxt;
      sectionByRow[r] = current;
    }
  }

  for (let r = headerInfo.headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const codeRaw = row[headerInfo.codeCol];
    const nameRaw = row[headerInfo.detCol];
    const codeNorm = normalizeCode(codeRaw);
    const nameNorm = normText(nameRaw);
    const currentSection = sectionByRow[r];

    const isRowEmpty = row.every(cell => cell === undefined || cell === null || String(cell).trim() === '');
    if (isRowEmpty) continue;

    if (!codeNorm && (!nameNorm || nameNorm.startsWith('TOTAL'))) {
      // Fila de "Total" del archivo (la palabra puede venir en cualquier
      // columna, o no venir), o texto de pie de página sin datos reales.
      const hasMovementData = movementCols.some(mc => {
        const v = row[mc.colIndex];
        if (v === undefined || v === null || String(v).trim() === '') return false;
        const num = (typeof v === 'number') ? v : parseFloat(String(v).replace(/,/g, ''));
        return !isNaN(num) && num !== 0;
      });
      if (hasMovementData && !totalRow) {
        const vals = {};
        movementCols.forEach(mc => {
          const v = row[mc.colIndex];
          vals[mc.colIndex] = (typeof v === 'number') ? v : (parseFloat(String(v).replace(/,/g, '')) || 0);
        });
        totalRow = { rowIndex: r, values: vals };
      } else {
        skippedNoCode++;
      }
      continue;
    }

    if (!codeNorm) { skippedNoCode++; continue; }
    if (isExcludedProduct(nameNorm, codeNorm, currentSection)) { skippedExcluded++; continue; }

    const values = {};
    movementCols.forEach(mc => {
      const raw = row[mc.colIndex];
      let num = 0;
      if (typeof raw === 'number') num = raw;
      else if (raw != null && String(raw).trim() !== '') {
        const cleaned = String(raw).replace(/,/g, '').trim();
        const parsed = parseFloat(cleaned);
        num = isNaN(parsed) ? 0 : parsed;
      }
      values[mc.colIndex] = num;
    });

    products.push({
      rawCode: String(codeRaw),
      normCode: codeNorm,
      rawName: String(nameRaw == null ? '' : nameRaw).trim(),
      values
    });
  }

  return { products, totalRow, skippedNoCode, skippedExcluded };
}
