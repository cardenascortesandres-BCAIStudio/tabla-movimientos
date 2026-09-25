// Adaptador delgado sobre pdfjs-dist (build de navegador) — extrae los
// `textItems` de cada página de un PDF y se los pasa a la función pura
// parseLiquidacionPage (src/core/horasExtrasPdfParse.js), que no sabe ni le
// importa de dónde salieron. El equivalente para Node (backfill histórico)
// es scripts/import_horas_extras_history.cjs, con pdfjs-dist/legacy/build.

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseLiquidacionPage } from '../core/horasExtrasPdfParse.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// `file` es un File/Blob del input o dropzone. Devuelve un arreglo de
// resultados de parseLiquidacionPage (uno por página que sí calzó con el
// formato esperado — las que no, se omiten, ver `omitidas` en el resultado).
export async function parsePdfEmpleados(file) {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const empleados = [];
  let omitidas = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));
    const result = parseLiquidacionPage(items);
    if (result) empleados.push(result); else omitidas++;
  }
  return { empleados, omitidas, totalPaginas: doc.numPages };
}
