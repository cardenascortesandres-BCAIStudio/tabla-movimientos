// Contexto de Balance para una sede/semana: procesa el único archivo de
// Tecnocarnes ("Movimiento de Productos Por Grupo por Tipo de Documento"),
// clasifica los Tipo Docto, y arma el balance final — mismo rol que
// sede/sedeContext.js pero para este flujo.
//
// Inventario Final sale directo del bloque "INVENTARIO SEMANAL FINAL" del
// mismo archivo (ya no de un segundo archivo de toma física — el usuario
// confirmó que un solo archivo trae todo lo necesario). Inventario Inicial
// se encadena automáticamente con el Inventario Final de la semana anterior
// guardada en el historial; solo la primera vez que se registra una sede
// (sin historial previo) se necesita que el usuario lo escriba a mano.

import { findHeaderAcrossSheets } from '../core/workbookUtils.js';
import { detectTipoDoctoHeader, parseFileAGroups } from '../core/balanceFileA.js';
import { classifyTipoDocto } from '../core/tipoDoctoClassify.js';
import { computeBalance, computeInventarioInicial } from '../core/balanceFormulas.js';
import { normText } from '../core/normalize.js';

let _nextId = 1;

export function createBalanceContext(sedeName) {
  return {
    id: _nextId++,
    sedeName,
    weekStart: '',
    weekEnd: '',
    fileAName: null,
    fileAHeaderInfo: null,
    fileAWarnings: [],
    classifiedBlocks: [], // [{label, valor, bucket, side, isDevolucion, type, manualOverride}]
    prevWeekInvFinal: undefined, // resuelto por main.js consultando el historial guardado
    manualInvInicial: null, // solo se usa si no hay semana previa guardada
    balance: null,
    status: 'empty', // empty | loading | needs_review | ready | error
    errorMsg: null
  };
}

export function processFileA(ctx, sheets, fileName) {
  ctx.fileAName = fileName;
  const found = findHeaderAcrossSheets(sheets, detectTipoDoctoHeader, 40);
  if (!found) {
    ctx.status = 'error';
    ctx.errorMsg = 'No se encontró la fila de encabezado "TipoDoctos" en ninguna hoja del archivo.';
    return;
  }
  ctx.fileAHeaderInfo = found.headerInfo;
  const { blocks, warnings } = parseFileAGroups(found.rows, found.headerInfo);
  ctx.fileAWarnings = warnings;
  ctx.classifiedBlocks = blocks.map(b => ({ ...b, ...classifyTipoDocto(b.label), manualOverride: null }));

  if (!ctx.classifiedBlocks.some(b => b.type === 'inv_final')) {
    ctx.status = 'error';
    ctx.errorMsg = 'El archivo no trae un bloque "INVENTARIO SEMANAL FINAL" — no se puede calcular el balance sin él.';
    return;
  }
  updateStatus(ctx);
}

// Aplica la clasificación ya guardada para esta sede (GET /api/balance/classification/:sede)
// a las etiquetas que coincidan; las que no tengan coincidencia quedan pendientes de revisión.
export function applyClassificationOverrides(ctx, savedLabels) {
  ctx.classifiedBlocks.forEach(b => {
    if (b.manualOverride) return;
    const saved = savedLabels[normText(b.label)];
    if (saved) {
      b.bucket = saved.bucket; b.side = saved.side; b.isDevolucion = !!saved.isDevolucion;
      b.type = 'classified';
    }
  });
  updateStatus(ctx);
}

export function setManualOverride(ctx, label, override) {
  const b = ctx.classifiedBlocks.find(x => x.label === label);
  if (!b) return;
  b.manualOverride = override;
  b.bucket = override.bucket; b.side = override.side; b.isDevolucion = !!override.isDevolucion;
  b.type = 'classified';
  updateStatus(ctx);
}

function updateStatus(ctx) {
  if (ctx.status === 'error') return;
  if (!ctx.fileAHeaderInfo) { ctx.status = 'loading'; return; }
  const needsReview = ctx.classifiedBlocks.some(b => b.type === 'unrecognized' && !b.manualOverride);
  ctx.status = needsReview ? 'needs_review' : 'ready';
}

export function pendingLabelsForReview(ctx) {
  return ctx.classifiedBlocks.filter(b => b.type === 'unrecognized' && !b.manualOverride);
}

// Solo se persisten los bloques que sí participan del balance (bucket asignado) —
// TRANSFORMACIONES e INVENTARIO INICIAL/FINAL nunca se guardan aquí.
export function collectLabelsToSave(ctx) {
  const labels = {};
  ctx.classifiedBlocks.forEach(b => {
    if (b.bucket) labels[normText(b.label)] = { bucket: b.bucket, side: b.side, isDevolucion: !!b.isDevolucion };
  });
  return labels;
}

// true si esta sede necesita que el usuario escriba el Inventario Inicial a
// mano (no hay semana anterior guardada en el historial todavía).
export function needsManualInvInicial(ctx) {
  return typeof ctx.prevWeekInvFinal !== 'number';
}

export function generateBalance(ctx) {
  const invFinalBlock = ctx.classifiedBlocks.find(b => b.type === 'inv_final');
  const invFinal = invFinalBlock.valor;
  const invInicial = computeInventarioInicial(ctx.prevWeekInvFinal, ctx.manualInvInicial);
  const classified = ctx.classifiedBlocks.filter(b => b.bucket);
  ctx.balance = computeBalance({ blocks: classified, invInicial, invFinal });
  ctx.balance.invInicialFromChain = typeof ctx.prevWeekInvFinal === 'number';
  return ctx.balance;
}

export function weekKeyFromDates(weekStart) {
  return weekStart || '';
}
