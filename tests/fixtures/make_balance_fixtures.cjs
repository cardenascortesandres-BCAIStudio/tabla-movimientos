const XLSX = require('xlsx');

// ---- Fixture 1: Archivo A ("Movimiento de Productos Por Grupo por Tipo de
// Documento"), con el encabezado a propósito en la hoja 1 (no la 0), y los
// valores reales confirmados de Decepaz (semana 20-26 jul 2026) — incluye el
// caso "SALIDA DECEPAZ A PLANTA" que se clasifica como Puntos de Venta pese a
// contener la palabra PLANTA.

const decoySheet = [
  ['Reporte generado el 28-Jul-2026'],
  ['(esta hoja no trae el encabezado TipoDoctos, se debe saltar)']
];

const fileARows = [
  ['', '', '', '', 'AGROPECUARIA CRIADERO VILLAMARIA S.A.S.', '', '', '', 'Fecha', '28-Jul-2026', ''],
  ['', '', '', '', '', '', '', '', '', '', ''],
  ['TipoDoctos', '', 'Producto', '', '', '', 'Cantidad', '', 'Valor', 'Impuesto', 'Neto'],
  ['COMPRAS PUNTO DE VENTA', '', '', '', '', '', '', '', '', '', ''],
  ['', '', 'OTROS PRODUCTOS', '', '', '', 25, '', 27500, 0, 27500],
  ['', '', 'PESCADO', '', '', '', 218, '', 2322625, 0, 2322625],
  ['', '', '', '', '', '', '', '', 2350125, 0, 2350125],
  ['DEVOLUCION COMPRAS PUNTO DE VTA', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 120000, 0, 120000],
  ['CONSUMO INTERNO', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 3290, 0, 3290],
  ['ENTRADA DE PLANTA POLLO', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 13942577.03, 0, 13942577.03],
  ['ENTRADA M/CIA-NARANJOS', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 107035.109, 0, 107035.109],
  ['ENTRADA MERCANCIA ALAMEDA', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 1717580, 0, 1717580],
  ['ENTRADA MERCANCIA CASONA', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 356239.2, 0, 356239.2],
  ['ENTRADA MERCANCIA JAMUNDI', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 330600, 0, 330600],
  ['ENTRADA MERCANCIA DE PLANTA', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 35786500.55, 0, 35786500.55],
  ['ENTRADA MERCANCIA PLANTA PROCESADOS', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 1953710.527, 0, 1953710.527],
  ['INVENTARIO SEMANAL FINAL', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 43602470, 0, 43602470],
  ['INVENTARIO SEMANAL INICIAL', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 38254366.8, 0, 38254366.8],
  ['SALIDA A PLANTA PROCESADOS', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 13562.8, 0, 13562.8],
  ['SALIDA DECEPAZ A PLANTA', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 7299.8, 0, 7299.8],
  ['SALIDA M/CIA-CHIMINANGOS', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 267423.95, 0, 267423.95],
  ['SALIDA PARA PLANTA POLLO', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 0, 0, 0],
  ['TRANSFORMACIONES', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 0, 0, 0],
  ['FACTURA ELECTRONICA POS DECEPAZ', '', '', '', '', '', '', '', '', '', ''],
  ['', '', 'CARNE DE POLLO', '', '', '', 1734, '', 60000000, 0, 60000000],
  ['', '', 'OTROS PRODUCTOS', '', '', '', 307, '', 5731929.28066, 0, 5731929.28066],
  ['', '', '', '', '', '', '', '', 65731929.28066, 0, 65731929.28066],
  ['DEVOLUCION RESC POS ELECTRONICO', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', 143850, 0, 143850],
  ['TecnoCarnes', '', '', '', '', '', '', '', '', '', '']
];

const wbA = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbA, XLSX.utils.aoa_to_sheet(decoySheet), 'Hoja1');
XLSX.utils.book_append_sheet(wbA, XLSX.utils.aoa_to_sheet(fileARows), 'Movimiento de Productos Por Gru');
XLSX.writeFile(wbA, 'fixture_balance_fileA_decepaz.xlsx');

console.log('Balance fixtures created.');
