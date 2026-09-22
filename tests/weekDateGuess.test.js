import { describe, it, expect } from 'vitest';
import { guessWeekFromText } from '../src/core/weekDateGuess.js';

describe('guessWeekFromText — respaldo para prellenar la fecha de carga de Tabla de Movimientos', () => {
  it('reconoce un rango simple con guion', () => {
    expect(guessWeekFromText('10-16 AGOSTO', 2026)).toEqual({ weekStart: '2026-08-10', weekEnd: '2026-08-16' });
  });

  it('reconoce un rango separado por espacio (el guion se pierde en nombres de hoja de Excel)', () => {
    expect(guessWeekFromText('14 20 septiembre alameda', 2026)).toEqual({ weekStart: '2026-09-14', weekEnd: '2026-09-20' });
  });

  it('reconoce "DD MES AL DD MES" y "DEL DD AL DD DE MES"', () => {
    expect(guessWeekFromText('03 AGOSTO AL 09 AGOSTO', 2026)).toEqual({ weekStart: '2026-08-03', weekEnd: '2026-08-09' });
    expect(guessWeekFromText('DEL 03 AL 09 DE AGOSTO', 2026)).toEqual({ weekStart: '2026-08-03', weekEnd: '2026-08-09' });
  });

  it('cruza de mes correctamente ("31-06 SEPTIEMBRE" = 31 de agosto al 6 de septiembre)', () => {
    expect(guessWeekFromText('31-06 SEPTIEMBRE', 2026)).toEqual({ weekStart: '2026-08-31', weekEnd: '2026-09-06' });
  });

  it('usa el año explícito si aparece, si no cae al año por defecto', () => {
    expect(guessWeekFromText('17-23 AGOSTO 2027', 2026)).toEqual({ weekStart: '2027-08-17', weekEnd: '2027-08-23' });
  });

  it('devuelve null si no hay mes reconocible', () => {
    expect(guessWeekFromText('24-30 ALAMEDA', 2026)).toBeNull();
    expect(guessWeekFromText('', 2026)).toBeNull();
  });
});
