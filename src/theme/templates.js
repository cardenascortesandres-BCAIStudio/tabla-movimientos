// Catálogo de plantillas visuales — única fuente de verdad de color para la
// plataforma. Antes había dos paletas fijas y separadas (PALETTE en
// excelExport.js, y las variables de src/styles/theme-vars.css) que había que
// sincronizar a mano; ahora ambas se derivan de la plantilla activa aquí, así
// que pantalla y Excel exportado usan siempre exactamente los mismos colores.
// No tocan document/window — son datos puros, testeables sin DOM.

// Cada plantilla define 2 colores que el usuario elige a propósito —
// "títulos" (encabezado de columnas) y "totales" (fila de subtotal de cada
// bloque/categoría, incluida la celda de % Diferencia del subtotal, que
// siempre usa el mismo color que el resto de esa fila) — más un par
// rojo/verde FIJO para Diferencia KL negativa/cero, igual en las 5, porque
// es una señal de estado (faltante/OK), no una decisión decorativa.
const DIFF_NEG = { diffNegBg: '#fdf1f1', diffNegFg: '#b32424' };
const DIFF_ZERO = { diffZeroBg: '#f0f9f2', diffZeroFg: '#1f7a3f' };
const BORDER = '#d8d8d8';

export const TEMPLATES = [
  {
    // Colores exactos tomados del archivo real de referencia (Alameda,
    // "tabla alameda 02 de agosto de 2026"): encabezado verde CCFFCC,
    // subtotales naranja FF6600.
    id: 'alameda-verde',
    name: 'Verde y Naranja (Alameda)',
    colors: {
      headerBg: '#CCFFCC', headerFg: '#1a1a1a',
      catRowBg: '#CCFFCC', catRowFg: '#1a1a1a',
      subtotalBg: '#FF6600', subtotalFg: '#1a1a1a',
      ...DIFF_NEG, ...DIFF_ZERO,
      borderColor: BORDER,
      accent: '#FF6600', accent2: '#e65c00'
    }
  },
  {
    id: 'azul-corporativo',
    name: 'Azul Corporativo',
    colors: {
      headerBg: '#1d4ed8', headerFg: '#ffffff',
      catRowBg: '#1d4ed8', catRowFg: '#ffffff',
      subtotalBg: '#dbeafe', subtotalFg: '#1d4ed8',
      ...DIFF_NEG, ...DIFF_ZERO,
      borderColor: BORDER,
      accent: '#1d4ed8', accent2: '#2563eb'
    }
  },
  {
    id: 'carbon-ambar',
    name: 'Carbón y Ámbar',
    colors: {
      headerBg: '#1c1c1c', headerFg: '#f5c542',
      catRowBg: '#1c1c1c', catRowFg: '#f5c542',
      subtotalBg: '#f5c542', subtotalFg: '#1c1c1c',
      ...DIFF_NEG, ...DIFF_ZERO,
      borderColor: BORDER,
      accent: '#1c1c1c', accent2: '#3a3a3a'
    }
  },
  {
    id: 'vino-brangus',
    name: 'Vino Brangus',
    colors: {
      headerBg: '#7a1c1c', headerFg: '#ffffff',
      catRowBg: '#7a1c1c', catRowFg: '#ffffff',
      subtotalBg: '#f4e9d3', subtotalFg: '#7a1c1c',
      ...DIFF_NEG, ...DIFF_ZERO,
      borderColor: BORDER,
      accent: '#7a1c1c', accent2: '#8f2323'
    }
  },
  {
    id: 'gris-pizarra',
    name: 'Gris Pizarra',
    colors: {
      headerBg: '#37474f', headerFg: '#ffffff',
      catRowBg: '#37474f', catRowFg: '#ffffff',
      subtotalBg: '#eceff1', subtotalFg: '#37474f',
      ...DIFF_NEG, ...DIFF_ZERO,
      borderColor: BORDER,
      accent: '#37474f', accent2: '#455a64'
    }
  }
];

export const DEFAULT_TEMPLATE_ID = 'alameda-verde';

export function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id) || TEMPLATES.find(t => t.id === DEFAULT_TEMPLATE_ID);
}

function toArgb(hex) {
  return 'FF' + hex.replace('#', '').toUpperCase();
}

/** Deriva la paleta ARGB que necesita ExcelJS a partir de una plantilla. */
export function toExcelPalette(template) {
  const c = template.colors;
  return {
    headerBg: toArgb(c.headerBg), headerFg: toArgb(c.headerFg),
    subtotalBg: toArgb(c.subtotalBg), subtotalFg: toArgb(c.subtotalFg),
    diffNegBg: toArgb(c.diffNegBg), diffNegFg: toArgb(c.diffNegFg),
    diffZeroBg: toArgb(c.diffZeroBg), diffZeroFg: toArgb(c.diffZeroFg),
    borderColor: toArgb(c.borderColor),
    // El Resumen consolidado usa los mismos tonos del encabezado para su fila "TOTAL GENERAL".
    grandBg: toArgb(c.headerBg), grandFg: toArgb(c.headerFg)
  };
}
