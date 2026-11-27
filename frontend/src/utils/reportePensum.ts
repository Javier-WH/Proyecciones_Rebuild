import ExcelJS from 'exceljs';
import { imprimirHtml } from './print.js';
import { logoDataUri, logoBase64 } from './logo.js';

export interface MateriaPensumReporte {
  description: string;
  horasSemanales: number;
}

export interface GrupoPensumReporte {
  trayecto: string;
  materias: MateriaPensumReporte[];
}

export interface DatosReportePensum {
  pnfNombre: string;
  mayaDescripcion: string;
  grupos: GrupoPensumReporte[];
}

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const cohorteDeMalla = (descripcion: string): string => {
  const match = descripcion.match(/\bcohorte\s+([ivxlcdm]+|\d+)\b/i);
  if (match) return `COHORTE ${match[1].toUpperCase()}`;
  return descripcion.trim().toUpperCase() || '—';
};

const fechaImpresion = () =>
  new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

const gruposPreparados = (data: DatosReportePensum): GrupoPensumReporte[] =>
  data.grupos.map((g) => ({
    ...g,
    materias: [...g.materias].sort((a, b) => collator.compare(a.description, b.description)),
  }));

const validarDatos = (grupos: GrupoPensumReporte[]) => {
  const total = grupos.reduce((acc, g) => acc + g.materias.length, 0);
  if (total === 0) throw new Error('Esta malla no tiene materias para reportar.');
};

const lineasEncabezado = (data: DatosReportePensum): string[] => [
  'U.P.T. DE LOS LLANOS "JUANA RAMÍREZ"',
  'EXTENSIÓN ALTAGRACIA DE ORITUCO',
  `PENSUM DE LA MALLA: ${data.mayaDescripcion}`,
  `P.N.F.: ${data.pnfNombre}`,
];

const nombreArchivo = (data: DatosReportePensum): string => {
  const base = data.mayaDescripcion
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'Malla';
  const now = new Date();
  const fecha = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `Pensum_${base}_${fecha}.xlsx`;
};

export const generarExcelPensum = async (data: DatosReportePensum): Promise<void> => {
  const grupos = gruposPreparados(data);
  validarDatos(grupos);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Pensum');
  const thin: Partial<ExcelJS.Border> = { style: 'thin' };
  const borde: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };
  const centrado: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };
  const logoImg = wb.addImage({ base64: await logoBase64(), extension: 'png' });

  ws.addImage(logoImg, {
    tl: {
      nativeCol: 0,
      nativeColOff: 200025,
      nativeRow: 0,
      nativeRowOff: 47625,
    } as unknown as { col: number; row: number },
    ext: { width: 110, height: 52 },
  });

  ws.columns = [{ width: 58 }, { width: 12 }, { width: 24 }];

  lineasEncabezado(data).forEach((texto, i) => {
    ws.mergeCells(i + 1, 1, i + 1, 3);
    const cell = ws.getCell(i + 1, 1);
    cell.value = texto;
    cell.font = { bold: true, size: i === 2 ? 12 : 11 };
    cell.alignment = centrado;
    ws.getRow(i + 1).height = 18;
  });

  ws.mergeCells(5, 1, 5, 3);
  const cFecha = ws.getCell(5, 1);
  cFecha.value = `Fecha de impresión: ${fechaImpresion()}`;
  cFecha.font = { size: 9, italic: true };
  cFecha.alignment = centrado;
  ws.getRow(5).height = 16;

  const filaEncabezado = 7;
  const cab = ws.getRow(filaEncabezado);
  cab.getCell(1).value = 'Unidad Curricular';
  cab.getCell(2).value = 'Horas';
  cab.getCell(3).value = 'Observación';
  for (let c = 1; c <= 3; c++) {
    const cell = cab.getCell(c);
    cell.font = { bold: true, size: 10 };
    cell.alignment = centrado;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  }
  cab.height = 20;

  const observacion = cohorteDeMalla(data.mayaDescripcion);
  let fila = filaEncabezado + 1;
  for (const grupo of grupos) {
    if (grupo.materias.length === 0) continue;
    ws.mergeCells(fila, 1, fila, 3);
    const cTrayecto = ws.getCell(fila, 1);
    cTrayecto.value = grupo.trayecto.toUpperCase();
    cTrayecto.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cTrayecto.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    cTrayecto.alignment = centrado;
    ws.getRow(fila).height = 18;
    fila++;

    for (const materia of grupo.materias) {
      const r = ws.getRow(fila);
      r.getCell(1).value = materia.description;
      r.getCell(2).value = materia.horasSemanales;
      r.getCell(3).value = observacion;
      r.getCell(1).alignment = { vertical: 'middle', wrapText: true };
      r.getCell(2).alignment = centrado;
      r.getCell(3).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      for (let c = 1; c <= 3; c++) r.getCell(c).font = { size: 9 };
      r.height = Math.max(15, Math.ceil(materia.description.length / 66) * 12.5 + 4);
      fila++;
    }
  }

  const ultima = fila - 1;
  for (let f = filaEncabezado; f <= ultima; f++) {
    for (let c = 1; c <= 3; c++) {
      ws.getCell(f, c).border = borde;
    }
  }

  ws.pageSetup = {
    paperSize: 5,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.65, right: 0.65, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    printArea: `A1:C${ultima}`,
    printTitlesRow: `${filaEncabezado}:${filaEncabezado}`,
  } as ExcelJS.PageSetup;
  ws.headerFooter = { oddHeader: '&R&P/&N' };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo(data);
  a.click();
  URL.revokeObjectURL(url);
};

export const imprimirPensum = async (data: DatosReportePensum): Promise<void> => {
  const grupos = gruposPreparados(data);
  validarDatos(grupos);

  const logo = await logoDataUri();
  const observacion = cohorteDeMalla(data.mayaDescripcion);
  const encabezado = lineasEncabezado(data)
    .map((linea) => `<div class="hline">${escapeHtml(linea)}</div>`)
    .join('');
  const filas = grupos
    .filter((grupo) => grupo.materias.length > 0)
    .map((grupo) => {
      const materias = grupo.materias.map(
        (materia) =>
          `<tr><td>${escapeHtml(materia.description)}</td><td class="num">${materia.horasSemanales}</td><td class="obs">${escapeHtml(observacion)}</td></tr>`
      );
      const inicio = materias.slice(0, 3).join('');
      const resto = materias.slice(3).join('');
      const encabezadoTrayecto = `<tr class="trayecto-row"><td colspan="3" class="trayecto">${escapeHtml(grupo.trayecto.toUpperCase())}</td></tr>`;
      return `<tbody class="inicio-grupo">${encabezadoTrayecto}${inicio}</tbody>${resto ? `<tbody>${resto}</tbody>` : ''}`;
    })
    .join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pensum ${escapeHtml(data.mayaDescripcion)}</title>
<style>
@page { size: letter portrait; margin: 1.8cm 1.8cm 1.5cm; }
body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000; }
.report-head { position: relative; min-height: 1.8cm; padding: 0 2.8cm; box-sizing: border-box; }
img.logo { position: absolute; left: 0; top: 0; height: 1.45cm; }
.hline { text-align: center; font-weight: bold; line-height: 1.35; }
.fecha { text-align: center; font-size: 8.5pt; font-style: italic; color: #333; margin-top: 5px; }
table { width: 100%; border-collapse: collapse; margin-top: 14px; table-layout: fixed; }
thead { display: table-header-group; }
tbody.inicio-grupo { break-inside: avoid; page-break-inside: avoid; }
tr { break-inside: avoid; page-break-inside: avoid; }
tr.trayecto-row { break-after: avoid; page-break-after: avoid; }
th, td { border: 1px solid #000; padding: 4px 6px; font-size: 9.5pt; overflow-wrap: anywhere; }
th { text-align: center; vertical-align: middle; font-weight: bold; background: #e2e8f0; }
col.uc { width: 60%; }
col.horas { width: 12%; }
col.obs { width: 28%; }
td.num { text-align: center; vertical-align: middle; }
td.obs { text-align: center; vertical-align: middle; }
td.trayecto { background: #334155; color: #fff; text-align: center; font-weight: bold; font-size: 9pt; letter-spacing: 0.03em; }
</style></head><body>
<section class="report-head"><img class="logo" src="${logo}" alt="">${encabezado}</section>
<div class="fecha">Fecha de impresión: ${escapeHtml(fechaImpresion())}</div>
<table>
<colgroup><col class="uc"><col class="horas"><col class="obs"></colgroup>
<thead><tr><th>Unidad Curricular</th><th>Horas</th><th>Observación</th></tr></thead>
${filas}
</table>
</body></html>`;

  imprimirHtml(html);
};
