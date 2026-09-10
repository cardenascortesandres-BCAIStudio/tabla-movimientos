const XLSX = require('xlsx');

// ---- Fixture 1: Villa del Lago ----
const villaHeaders = [
  ["EMPRESA CARNES XYZ S.A.S"],
  ["NIT 900.123.456-7"],
  ["INFORME SEMANAL DE MOVIMIENTOS"],
  ["SEDE: VILLA DEL LAGO"],
  ["FECHA: 20 - 26 JULIO 2026"],
  [],
  ["CATEGORIA","CODIGO","DETALLE","FACTURA POS ELECTRONICO DE VENTA","DEVOLUCION POS ELECTRONICO DE VENTA","COMPRAS PUNTO DE VENTA","ENTRADA DE P/PROCESO A CASA GRANDE V LAGO","ENTRADA DE PLANTA POLLO","ENTRADA MERCANCIA PLANTA ACOPIO","SALIDA M/CIA- ACOPIO","SALIDA M/CIA- CASONA","SALIDA M/CIA- JAMUNDI","SALIDA PARA PLANTA POLLO","ENTRADA M/CIA- CASONA","INVENTARIO SEMANAL FINAL","INVENTARIO SEMANAL INICIAL"],
  ["FINAS","1101","LOMO VICHE CORRIENTE", 50, 2, 10, 5, 0, 0, 3, 0, 0, 0, 0, 12, 8],
  ["FINAS","1,105","LOMO CARACHO", 30, 0, 5, 0, 0, 0, 0, 2, 0, 0, 0, 6, 5],
  ["POLLO","3000","POLLO ENTERO DE CAMPO", 100, 0, 20, 0, 15, 0, 0, 0, 5, 0, 0, 10, 5],
  ["OTROS","9999","PRODUCTO INVENTADO FUERA CATALOGO", 7, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1],
  ["","","MISTERIOSA COL", 1,1,1,1,1,1,1,1,1,1,1,1,1], // fila sin codigo -> debe ignorarse
  ["","","TOTAL", 187, 2, 36, 5, 15, 0, 3, 2, 5, 0, 0, 30, 19],
];
// add an unrecognized column header to test manual classification path
villaHeaders[6].push("AJUSTE POR CONTEO FISICO");
villaHeaders[7].push(1);
villaHeaders[8].push(0);
villaHeaders[9].push(0);
villaHeaders[10].push(0);
villaHeaders[11].push(0);
villaHeaders[12].push(0);

const wsVilla = XLSX.utils.aoa_to_sheet(villaHeaders);
const wbVilla = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbVilla, wsVilla, "Sheet1");
XLSX.writeFile(wbVilla, "fixture_villa_del_lago.xlsx");

// ---- Fixture 2: Chiminangos ----
const chimiHeaders = [
  ["EMPRESA CARNES XYZ S.A.S"],
  ["SEDE CHIMINANGOS"],
  ["CODIGO","DETALLE","VENTAS CONTADO CHIMINANGOS","DEVOLUCION FACTURA CONTADO CHIMINANGOS","COMPRAS PUNTO DE VENTA","ENTRADA DE PLANTA POLLO","ENTRADA M/CIA-ALAMEDA","ENTRADA M/CIA-DECEPAZ","ENTRADA M/CIA-JAMUNDI","ENTRADA M/CIA-PLANTA ACOPIO","COMPRAS SIN FACTURA ELECTRONICA","CONSUMO INTERNO","ENTRADA M/CIA-PLANTA PROCESADOS","INVENTARIO SEMANAL FINAL","INVENTARIO SEMANAL INICIAL"],
  ["1101","LOMO VICHE CORRIENTE", 40, 0, 8, 0, 4, 0, 0, 0, 0, 2, 0, 9, 7],
  ["1105","LOMO CARACHO", 15, 1, 0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 2],
  ["1705","LOMO REDONDO ALMENDRA (dup code test)", 5,0,0,0,0,0,0,0,0,0,0,1,1], // code 1705 se repite en el catálogo -> debe usar la 1a coincidencia
  ["2002","LOMO CAÑON", 60, 0, 12, 0, 0, 6, 0, 0, 0, 1, 0, 15, 10],
  ["1101","LOMO VICHE CORRIENTE (fila duplicada, misma sede)", 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // prueba de fusión de filas con mismo código
  ["","TOTAL", 123,1,20,0,4,6,0,0,0,6,0,28,20],
];
const wsChimi = XLSX.utils.aoa_to_sheet(chimiHeaders);
const wbChimi = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbChimi, wsChimi, "Sheet1");
XLSX.writeFile(wbChimi, "fixture_chiminangos.xlsx");

// ---- Fixture 3: sede genérica con ITEM (sin CODIGO), columna sin encabezado, y DEVOLUCION ambigua ----
const genHeaders = [
  ["SEDE ALAMEDA - INFORME"],
  ["ITEM","DESCRIPCION","COMPRAS","DEVOLUCION GENERAL","ENTRADA BODEGA","SALIDA BODEGA","INVENTARIO INICIAL","INVENTARIO FINAL", ""],
  ["1710","T-BONE STEACK", 10, 1, 2, 0, 4, 15, 99],
  ["1400","OSSOBUCO DE RES", 5, 0, 0, 1, 2, 6, 0],
];
const wsGen = XLSX.utils.aoa_to_sheet(genHeaders);
const wbGen = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbGen, wsGen, "Sheet1");
XLSX.writeFile(wbGen, "fixture_generica.xlsx");

console.log("Fixtures created.");
