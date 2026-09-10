// Recorrido de todas las hojas de un libro para encontrar la que trae el
// encabezado buscado. Necesario porque el archivo de Tecnocarnes a veces trae
// el reporte en la hoja 0 y a veces en la hoja 1 (según si el usuario ya lo
// "editó" en otra pestaña) — a diferencia del flujo de movimientos, que
// siempre asume `wb.SheetNames[0]`.
//
// `sheets` ya viene extraído por el llamador (main.js/balanceContext.js, que
// sí dependen de la librería xlsx) como [{ sheetIndex, sheetName, rows }],
// para que este módulo se mantenga puro (sin I/O), igual que el resto de
// src/core/*.

export function findHeaderAcrossSheets(sheets, detectorFn, maxScan = 30) {
  for (const sheet of sheets) {
    const headerInfo = detectorFn(sheet.rows, maxScan);
    if (headerInfo) return { ...sheet, headerInfo };
  }
  return null;
}
