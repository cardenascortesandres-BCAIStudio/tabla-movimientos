// Paleta compartida para colorear POR SEDE en gráficos de líneas/barras
// (Reportes de Balance/Movimientos/Auditorías/Ventas). 12 colores elegidos
// para distinguirse entre sí a simple vista (nunca dos azules o dos verdes
// seguidos) — antes había solo 6 colores repetidos en varios sitios del
// código, y con 8 sedes reales el color se repetía por el `% length`
// (ej. la 7ª sede volvía a caer en el mismo color que la 1ª). Si en el
// futuro hay más de 12 sedes, se repite el ciclo — pasado ese punto ya no
// hay forma de garantizar que 2 colores no se parezcan.
// Reordenada 2026-09-11: con las 7 sedes reales (orden alfabético: Alameda,
// Casona, Chiminangos, Decepaz, Jamundí, Los Naranjos, Villa del Lago) los
// primeros 7 colores caían en pares casi idénticos — Casona (verde agua) vs
// Villa del Lago (verde) y Decepaz (ámbar) vs Los Naranjos (naranja) se
// confundían en los gráficos de líneas y barras. Los primeros 7 valores
// están elegidos a mano para que ninguno de los 7 se parezca a otro.
export const SEDE_PALETTE = [
  '#3ea8ff', // azul
  '#ff8a3d', // naranja
  '#ff3b6e', // rosa/rojo
  '#f5d327', // amarillo
  '#a86bff', // morado
  '#2be3a8', // verde agua
  '#4dd0e1', // cian
  '#e6673d', // ladrillo
  '#6b7cff', // índigo
  '#35d68a', // verde (distinto del #6)
  '#ff5fa2', // magenta
  '#c9cc3f', // oliva
];

export function colorForSedeIndex(i) {
  return SEDE_PALETTE[i % SEDE_PALETTE.length];
}

// Mismo array, como string plano (sin `export`) para incrustar en los
// informes HTML descargables — ver src/theme/chartDownloadPlugin.js para el
// mismo patrón de doble exportación.
export const SEDE_PALETTE_JS = `
const SEDE_PALETTE = ${JSON.stringify(SEDE_PALETTE)};
function colorForSedeIndex(i){ return SEDE_PALETTE[i % SEDE_PALETTE.length]; }
`;
