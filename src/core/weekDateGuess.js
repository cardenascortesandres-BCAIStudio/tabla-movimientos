// Adivina el rango de una semana (lunes-domingo o el corte que use la sede)
// a partir de texto en español — nombre de hoja de Excel o nombre de
// archivo. Puerto del mismo algoritmo ya probado en
// scripts/import_movimientos_history.cjs contra ~50 nombres reales de
// carpeta/hoja con formatos muy distintos entre sedes ("10-16 AGOSTO",
// "14 20 septiembre", "03 AGOSTO AL 09 AGOSTO", "DEL 03 AL 09 DE AGOSTO"...).
// Solo un RESPALDO para prellenar el campo de fecha en la carga — el usuario
// siempre puede corregirlo a mano (a diferencia del nombre de sede, la fecha
// de la semana no siempre viene clara en el archivo).

import { normText } from './normalize.js';

const MONTHS = {
  ENE: 1, ENERO: 1, FEB: 2, FEBRERO: 2, MAR: 3, MARZO: 3, ABR: 4, ABRIL: 4, MAY: 5, MAYO: 5,
  JUN: 6, JUNIO: 6, JUL: 7, JULIO: 7, AGO: 8, AGOS: 8, AGOSTO: 8, AGOST: 8,
  SEP: 9, SEPT: 9, SEPTIEMBRE: 9, SEPTEIMBRE: 9, SEPTIEBRE: 9,
  OCT: 10, OCTUBRE: 10, NOV: 11, NOVIEMBRE: 11, DIC: 12, DICIEMBRE: 12
};
const MONTH_RE_SOURCE = '\\b(' + Object.keys(MONTHS).join('|') + ')\\b';

function toISO(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export function guessWeekFromText(rawText, defaultYear = new Date().getUTCFullYear()) {
  if (!rawText) return null;
  const text = normText(rawText).replace(/(\d)([A-Z])/g, '$1 $2').replace(/([A-Z])(\d)/g, '$1 $2')
    .replace(/\b(DEL|DE|AL|A)\b/g, ' ');
  const monthMatches = Array.from(text.matchAll(new RegExp(MONTH_RE_SOURCE, 'gi')));
  if (!monthMatches.length) return null;
  const month = MONTHS[monthMatches[monthMatches.length - 1][1].toUpperCase()];
  const m4 = text.match(/\b(20\d{2})\b/);
  const year = m4 ? parseInt(m4[1], 10) : defaultYear;

  const dayTokens = Array.from(text.matchAll(/\b(\d{1,2})\b/g)).map(m => parseInt(m[1], 10)).filter(d => d >= 1 && d <= 31);
  if (!dayTokens.length) return null;
  const endDay = dayTokens[dayTokens.length - 1];
  const endISO = toISO(year, month, endDay);
  if (!endISO) return null;
  const endDate = new Date(endISO + 'T00:00:00Z');
  const startDate = new Date(endDate);
  startDate.setUTCDate(endDate.getUTCDate() - 6);
  return { weekStart: startDate.toISOString().slice(0, 10), weekEnd: endISO };
}
