// Paleta compartida para colorear POR SEDE en gráficos de líneas/barras
// (Reportes de Balance/Movimientos/Auditorías/Ventas). 12 colores elegidos
// para distinguirse entre sí a simple vista (nunca dos azules o dos verdes
// seguidos) — antes había solo 6 colores repetidos en varios sitios del
// código, y con 8 sedes reales el color se repetía por el `% length`
// (ej. la 7ª sede volvía a caer en el mismo color que la 1ª). Si en el
// futuro hay más de 12 sedes, se repite el ciclo — pasado ese punto ya no
// hay forma de garantizar que 2 colores no se parezcan.
export const SEDE_PALETTE = [
  '#3ea8ff', // azul
  '#2be3a8', // verde agua
  '#ff3b6e', // rosa/rojo
  '#f0b429', // ámbar
  '#a86bff', // morado
  '#ff8a3d', // naranja
  '#35d68a', // verde (distinto del #2)
  '#ff5fa2', // magenta (distinto del #3)
  '#4dd0e1', // cian (distinto del #1)
  '#c9cc3f', // oliva (distinto del #4)
  '#6b7cff', // índigo (distinto del #1/#5)
  '#e6673d', // ladrillo (distinto del #3/#6)
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
