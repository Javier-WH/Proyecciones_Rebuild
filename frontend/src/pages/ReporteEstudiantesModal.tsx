import React, { useEffect, useMemo, useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import { imprimirHtml } from '../utils/print.js';
import { logoDataUri, logoBase64 } from '../utils/logo.js';
import { getEncabezado, saveEncabezado } from '../utils/plantillas.js';
import { X, FileSpreadsheet, Printer, BarChart3, AlertTriangle } from 'lucide-react';

// Subconjunto de la fila de /student/enrolled que el reporte necesita
export interface EstudianteReporte {
  id: number;
  sexo?: string;
  pnf?: string;
  trayecto?: string;
  ucs_inscritas?: { lapso_id: number; lapso?: string; periodo?: string }[];
}

interface SeleccionReporte {
  pnf: string;
  maya: string;
  alcance: string;
  filtros: string[]; // descripciones de los filtros activos, ya formateadas
}

interface TablaConteo {
  titulo: string;
  columna: string;
  filas: [string, number][];
  // En el desglose por lapso un alumno puede contar en varios lapsos
  // (cursa UCs en más de uno), así que los porcentajes pueden pasar de 100.
  sinPorcentaje?: boolean;
  nota?: string;
}

const capitalizar = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Encabezado por defecto (editable en el modal). Placeholders: {SELECCION} {FECHA}
const HEADER_DEFAULT = [
  'U.P.T. DE LOS LLANOS "JUANA RAMÍREZ"',
  'EXTENSIÓN ALTAGRACIA DE ORITUCO',
  'REPORTE DE ESTUDIANTES INSCRITOS',
  '{SELECCION}',
];

interface ReporteEstudiantesModalProps {
  isOpen: boolean;
  onClose: () => void;
  // El conjunto YA filtrado en la página: el reporte respeta los filtros activos
  estudiantes: EstudianteReporte[];
  seleccion: SeleccionReporte;
  // lapso_ids activos en el filtro de la página ([] = sin restricción).
  // El filtro elige estudiantes que tengan alguna UC en esos lapsos, pero el
  // desglose por lapso solo debe contar los lapsos seleccionados — si no, los
  // demás lapsos de esos mismos alumnos también aparecerían.
  lapsosFiltro?: string[];
}

export const ReporteEstudiantesModal: React.FC<ReporteEstudiantesModalProps> = ({
  isOpen,
  onClose,
  estudiantes,
  seleccion,
  lapsosFiltro,
}) => {
  const [header, setHeader] = useState<string[]>(HEADER_DEFAULT);
  const [vista, setVista] = useState<'contenido' | 'encabezado'>('contenido');
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Evita guardar el default sobre la plantilla de BD antes de cargarla
  const headerListo = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      headerListo.current = false;
      return;
    }
    getEncabezado('estudiantes_inscritos')
      .then((guardado) => {
        if (guardado) setHeader(guardado);
      })
      .catch(() => {})
      .finally(() => {
        headerListo.current = true;
      });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !headerListo.current) return;
    const t = setTimeout(() => {
      saveEncabezado('estudiantes_inscritos', header).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [header, isOpen]);

  // ── Estadísticas sobre el conjunto filtrado ──────────────────────────────
  const stats = useMemo(() => {
    const total = estudiantes.length;
    const contar = (clave: (e: EstudianteReporte) => string | undefined, def: string) => {
      const m = new Map<string, number>();
      for (const e of estudiantes) {
        const k = capitalizar(clave(e) || def);
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]) as [string, number][];
    };

    // Por lapso: estudiantes distintos por lapso_id (un alumno puede repetir)
    const porLapsoMap = new Map<number, { label: string; ids: Set<number> }>();
    const lapsoRestriccion =
      lapsosFiltro && lapsosFiltro.length > 0 ? new Set(lapsosFiltro.map(Number)) : null;
    for (const e of estudiantes) {
      for (const u of e.ucs_inscritas ?? []) {
        if (u.lapso_id == null) continue;
        if (lapsoRestriccion != null && !lapsoRestriccion.has(u.lapso_id)) continue;
        const g = porLapsoMap.get(u.lapso_id) ?? {
          label: (u.periodo || u.lapso || `Lapso ${u.lapso_id}`).toUpperCase(),
          ids: new Set<number>(),
        };
        g.ids.add(e.id);
        porLapsoMap.set(u.lapso_id, g);
      }
    }
    const porLapso: [string, number][] = [...porLapsoMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, g]) => [g.label, g.ids.size]);

    return {
      total,
      tablas: [
        { titulo: 'POR SEXO', columna: 'Sexo', filas: contar((e) => e.sexo, 'Sin dato') },
        { titulo: 'POR TRAYECTO', columna: 'Trayecto', filas: contar((e) => e.trayecto, 'Sin trayecto') },
        { titulo: 'POR PNF', columna: 'PNF', filas: contar((e) => e.pnf, 'Sin PNF') },
        {
          titulo: 'POR LAPSO',
          columna: 'Lapso',
          filas: porLapso,
          sinPorcentaje: true,
          nota: 'Un estudiante con UCs en varios lapsos cuenta en cada uno.',
        },
      ] as TablaConteo[],
    };
  }, [estudiantes, lapsosFiltro]);

  const seleccionTexto = useMemo(() => {
    const partes = [seleccion.pnf];
    if (seleccion.maya && seleccion.maya !== '—') partes.push(seleccion.maya);
    partes.push(seleccion.alcance);
    if (seleccion.filtros.length > 0) partes.push(`Filtros: ${seleccion.filtros.join(' · ')}`);
    return partes.join(' — ').toUpperCase();
  }, [seleccion]);

  const fechaTexto = new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const linea = (tpl: string): string =>
    tpl.replace(/\{SELECCION\}/gi, seleccionTexto).replace(/\{FECHA\}/gi, fechaTexto);

  // ------------------------- EXCEL -------------------------
  const generarExcel = async () => {
    if (estudiantes.length === 0) {
      setAviso('No hay estudiantes en la selección actual para reportar.');
      return;
    }
    setGenerando(true);
    try {
      const wb = new ExcelJS.Workbook();
      const thin: Partial<ExcelJS.Border> = { style: 'thin' };
      const borde: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };
      const centrado: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };
      const ws = wb.addWorksheet('Estadísticas');
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

      ws.columns = [{ width: 46 }, { width: 15 }, { width: 12 }];

      let fila = 1;
      // Encabezado institucional (líneas combinadas A:C)
      header.forEach((tpl, i) => {
        ws.mergeCells(i + 1, 1, i + 1, 3);
        const cell = ws.getCell(i + 1, 1);
        cell.value = linea(tpl);
        cell.font = { bold: true, size: 11 };
        cell.alignment = centrado;
      });
      fila = header.length + 1;
      ws.mergeCells(fila, 1, fila, 3);
      const cFecha = ws.getCell(fila, 1);
      cFecha.value = `Generado el ${fechaTexto}`;
      cFecha.font = { size: 9, italic: true };
      cFecha.alignment = centrado;
      fila += 2;

      // Total general destacado
      ws.mergeCells(fila, 1, fila, 2);
      const cTot = ws.getCell(fila, 1);
      cTot.value = 'TOTAL DE ESTUDIANTES EN LA SELECCIÓN';
      cTot.font = { bold: true, size: 12 };
      cTot.alignment = { horizontal: 'right', vertical: 'middle' };
      cTot.border = borde;
      const cTotN = ws.getCell(fila, 3);
      cTotN.value = stats.total;
      cTotN.font = { bold: true, size: 12 };
      cTotN.alignment = centrado;
      cTotN.border = borde;
      ws.getRow(fila).height = 22;
      fila += 2;

      for (const tabla of stats.tablas) {
        // Título de la sección
        ws.mergeCells(fila, 1, fila, 3);
        const cTitulo = ws.getCell(fila, 1);
        cTitulo.value = `ESTUDIANTES ${tabla.titulo}`;
        cTitulo.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        cTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        cTitulo.alignment = centrado;
        fila++;

        // Encabezado de tabla
        const cab = ws.getRow(fila);
        cab.getCell(1).value = tabla.columna;
        cab.getCell(2).value = 'Estudiantes';
        cab.getCell(3).value = tabla.sinPorcentaje ? '' : '%';
        for (let c = 1; c <= 3; c++) {
          cab.getCell(c).font = { bold: true };
          cab.getCell(c).alignment = centrado;
          cab.getCell(c).border = borde;
        }
        fila++;

        for (const [etiqueta, n] of tabla.filas) {
          const r = ws.getRow(fila);
          r.getCell(1).value = etiqueta;
          r.getCell(2).value = n;
          r.getCell(2).alignment = centrado;
          if (!tabla.sinPorcentaje) {
            r.getCell(3).value = stats.total > 0 ? n / stats.total : 0;
            r.getCell(3).numFmt = '0.0%';
            r.getCell(3).alignment = centrado;
          }
          for (let c = 1; c <= 3; c++) r.getCell(c).border = borde;
          r.getCell(1).font = { size: 9 };
          r.getCell(2).font = { size: 9 };
          r.getCell(3).font = { size: 9 };
          fila++;
        }

        // Subtotal de la sección (en lapso puede exceder el total por doble conteo)
        const r = ws.getRow(fila);
        r.getCell(1).value = `TOTAL ${tabla.titulo}`;
        r.getCell(2).value = tabla.filas.reduce((acc, [, n]) => acc + n, 0);
        for (let c = 1; c <= 3; c++) {
          r.getCell(c).font = { bold: true, size: 9 };
          r.getCell(c).border = borde;
          r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        }
        r.getCell(2).alignment = centrado;
        fila++;

        if (tabla.nota) {
          ws.mergeCells(fila, 1, fila, 3);
          const cNota = ws.getCell(fila, 1);
          cNota.value = tabla.nota;
          cNota.font = { size: 8, italic: true, color: { argb: 'FF64748B' } };
          fila++;
        }
        fila++;
      }

      ws.pageSetup = {
        paperSize: 5, // Carta
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.7, right: 0.7, top: 0.8, bottom: 0.8, header: 0.3, footer: 0.3 },
        printArea: `A1:C${fila - 1}`,
      } as ExcelJS.PageSetup;
      ws.headerFooter = { oddHeader: '&R&P/&N' };

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Estudiantes_Inscritos_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerando(false);
    }
  };

  // ------------------------- IMPRESIÓN DIRECTA -------------------------
  const imprimir = async () => {
    if (estudiantes.length === 0) {
      setAviso('No hay estudiantes en la selección actual para reportar.');
      return;
    }
    const logo = await logoDataUri();
    const encabezado = header.map((tpl) => `<div class="hline">${escapeHtml(linea(tpl))}</div>`).join('');

    const tablaHtml = (t: TablaConteo) => {
      const cols = t.sinPorcentaje ? 2 : 3;
      const filas = t.filas
        .map(
          ([etiqueta, n]) =>
            `<tr><td>${escapeHtml(etiqueta)}</td><td class="num">${n}</td>${
              t.sinPorcentaje
                ? ''
                : `<td class="num">${stats.total > 0 ? ((n / stats.total) * 100).toFixed(1) : '0.0'}%</td>`
            }</tr>`
        )
        .join('');
      const subtotal = t.filas.reduce((acc, [, n]) => acc + n, 0);
      return `<table>
<thead><tr><th colspan="${cols}" class="sec">ESTUDIANTES ${escapeHtml(t.titulo)}</th></tr>
<tr><th>${escapeHtml(t.columna)}</th><th class="num">Estudiantes</th>${t.sinPorcentaje ? '' : '<th class="num">%</th>'}</tr></thead>
<tbody>${filas}<tr class="sub"><td>Total ${escapeHtml(t.titulo.toLowerCase())}</td><td class="num">${subtotal}</td>${t.sinPorcentaje ? '' : '<td></td>'}</tr></tbody>
</table>${t.nota ? `<p class="nota">${escapeHtml(t.nota)}</p>` : ''}`;
    };

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Estudiantes Inscritos</title>
<style>
@page { size: letter portrait; margin: 2cm 2cm 1.5cm;
  @top-right { content: counter(page) ' / ' counter(pages);
               font-family: Calibri, Arial, sans-serif; font-size: 8pt; font-weight: bold; }
}
body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000; }
.hoja { position: relative; }
img.logo { position: absolute; left: 0; top: 0; height: 1.3cm; }
.hline { text-align: center; font-weight: bold; line-height: 1.35; }
.fecha { text-align: center; font-size: 8pt; font-style: italic; color: #333; margin-top: 4px; }
.total { display: flex; justify-content: space-between; border: 1.5px solid #000; padding: 6px 10px;
         margin: 14px 0; font-weight: bold; font-size: 12pt; }
table { width: 100%; border-collapse: collapse; margin-top: 12px; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th, td { border: 1px solid #000; padding: 3px 6px; font-size: 9pt; }
th { text-align: center; vertical-align: middle; font-weight: bold; }
th.sec { background: #334155; color: #fff; font-size: 9.5pt; }
td.num, th.num { text-align: center; width: 70px; }
tr.sub td { background: #e2e8f0; font-weight: bold; }
p.nota { font-size: 7.5pt; font-style: italic; color: #444; margin: 2px 0 0; }
</style></head><body><section class="hoja"><img class="logo" src="${logo}" alt="">${encabezado}
<div class="fecha">Generado el ${escapeHtml(fechaTexto)}</div>
<div class="total"><span>TOTAL DE ESTUDIANTES EN LA SELECCIÓN</span><span>${stats.total}</span></div>
${stats.tablas.map(tablaHtml).join('\n')}
</section></body></html>`;

    imprimirHtml(html);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800 bg-slate-950 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-400" />
              Reporte de Estudiantes Inscritos
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Resumen estadístico de la selección actual: solo totales, sin lista de estudiantes.
          </p>
          <div className="flex gap-1.5 mt-4 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit">
            {(
              [
                ['contenido', 'Contenido'],
                ['encabezado', 'Encabezado'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  vista === v
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {vista === 'encabezado' ? (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Encabezado del reporte
              </label>
              <div className="space-y-1.5">
                {header.map((lineaTpl, i) => (
                  <input
                    key={i}
                    type="text"
                    value={lineaTpl}
                    onChange={(e) =>
                      setHeader((prev) => prev.map((l, j) => (j === i ? e.target.value : l)))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder={HEADER_DEFAULT[i]}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[10px] text-slate-500">
                  Placeholders: <code className="text-slate-400">{'{SELECCION}'}</code>{' '}
                  <code className="text-slate-400">{'{FECHA}'}</code>
                </p>
                <button
                  onClick={() => setHeader([...HEADER_DEFAULT])}
                  className="text-[10px] text-slate-400 hover:text-indigo-300 font-semibold cursor-pointer"
                >
                  Restaurar encabezado
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Selección que se reporta */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Selección del reporte
                </p>
                <div className="text-xs text-slate-300 space-y-1">
                  <p><span className="text-slate-500">PNF:</span> {seleccion.pnf}</p>
                  <p><span className="text-slate-500">Maya:</span> {seleccion.maya}</p>
                  <p><span className="text-slate-500">Alcance:</span> {seleccion.alcance}</p>
                  {seleccion.filtros.length > 0 && (
                    <p><span className="text-slate-500">Filtros activos:</span> {seleccion.filtros.join(' · ')}</p>
                  )}
                  <p>
                    <span className="text-slate-500">Estudiantes en la selección:</span>{' '}
                    <span className="font-bold text-white">{stats.total}</span>
                  </p>
                </div>
              </div>

              {/* Vista previa de los conteos que saldrán en el reporte */}
              <div className="space-y-3">
                {stats.tablas.map((t) => (
                  <div key={t.titulo}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Estudiantes {t.titulo.toLowerCase()}
                    </p>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl divide-y divide-slate-800/60 overflow-hidden">
                      {t.filas.length === 0 ? (
                        <p className="px-3 py-2 text-[11px] text-slate-600 italic">Sin datos.</p>
                      ) : (
                        t.filas.map(([etiqueta, n]) => (
                          <div key={etiqueta} className="flex items-center justify-between px-3 py-1.5">
                            <span className="text-[11px] text-slate-300 truncate">{etiqueta}</span>
                            <span className="text-[11px] font-semibold text-slate-200 shrink-0">
                              {n}
                              {!t.sinPorcentaje && stats.total > 0 && (
                                <span className="text-slate-500 font-normal ml-1.5">
                                  ({((n / stats.total) * 100).toFixed(1)}%)
                                </span>
                              )}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                    {t.nota && <p className="text-[10px] text-slate-600 mt-1">{t.nota}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 shrink-0 flex items-center justify-end gap-2">
          {aviso && (
            <span className="mr-auto text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {aviso}
              <button onClick={() => setAviso(null)} className="hover:text-white cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          <button
            onClick={imprimir}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>
          <button
            onClick={generarExcel}
            disabled={generando}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{generando ? 'Generando...' : 'Generar Excel'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
