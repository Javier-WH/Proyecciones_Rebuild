import React, { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { X, FileSpreadsheet, Printer, CalendarClock } from 'lucide-react';
import {
  HorarioEntry,
  SeccionRef,
  Turno,
  DIAS_NOMBRES,
  DIAS_CORTOS,
  fmtHora,
} from './horarios/types.js';

interface ReporteHorarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  lapsoLabel: string;
  periodo: string | null;
  secciones: SeccionRef[];
  turnos: Turno[];
  entries: HorarioEntry[];
}

interface HojaHorario {
  seccion: SeccionRef;
  turno: Turno | null;
  dias: number[];
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const crearNombradorHojas = () => {
  const usados = new Set<string>();
  return (base: string): string => {
    let nombre = base.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Hoja';
    if (usados.has(nombre)) {
      let i = 2;
      while (usados.has(`${nombre.slice(0, 28)} ${i}`)) i++;
      nombre = `${nombre.slice(0, 28)} ${i}`;
    }
    usados.add(nombre);
    return nombre;
  };
};

const nomProf = (e: HorarioEntry): string =>
  e.prof_apellidos ? `${e.prof_apellidos} ${e.prof_nombres ?? ''}`.trim() : 'Sin profesor';

export const ReporteHorarioModal: React.FC<ReporteHorarioModalProps> = ({
  isOpen,
  onClose,
  lapsoLabel,
  periodo,
  secciones,
  turnos,
  entries,
}) => {
  const [sel, setSel] = useState<number[]>([]); // vacío = todas
  const [generando, setGenerando] = useState(false);

  const hojas = useMemo<HojaHorario[]>(() => {
    const lista = sel.length === 0 ? secciones : secciones.filter((s) => sel.includes(s.seccion_id));
    return lista.map((s) => {
      const turno = turnos.find((t) => t.saga_id === s.turno_saga_id) ?? null;
      const dias = turno
        ? String(turno.dias_semana).split(',').map(Number).filter(Boolean).sort()
        : [1, 2, 3, 4, 5];
      return { seccion: s, turno, dias };
    });
  }, [secciones, turnos, sel]);

  const entriesDe = (seccionId: number, bloqueId: number, dia: number) =>
    entries.find(
      (e) => e.seccion_id === seccionId && e.bloque_id === bloqueId && e.dia_semana === dia
    );

  const toggle = (id: number) =>
    setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const encabezadoDe = (h: HojaHorario): string[] => [
    'HORARIO DE CLASE',
    'U.P.T. DE LOS LLANOS "JUANA RAMÍREZ", EXTENSIÓN ALTAGRACIA DE ORITUCO',
    `${h.seccion.proyeccion_nombre} — ${h.seccion.seccion_nombre} — TURNO ${h.seccion.turno_nombre.toUpperCase()}`,
    `${lapsoLabel.toUpperCase()} — PERIODO ${periodo ?? ''}`,
  ];

  // ------------------------- EXCEL -------------------------
  const generarExcel = async () => {
    setGenerando(true);
    try {
      const wb = new ExcelJS.Workbook();
      const thin: Partial<ExcelJS.Border> = { style: 'thin' };
      const borde: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };
      const nombrar = crearNombradorHojas();

      for (const h of hojas) {
        const ws = wb.addWorksheet(nombrar(`${h.seccion.seccion_nombre}`.slice(0, 28)));
        const cols = 1 + h.dias.length;
        ws.columns = [{ width: 14 }, ...h.dias.map(() => ({ width: 26 }))];

        encabezadoDe(h).forEach((linea, i) => {
          const r = ws.getRow(i + 1);
          ws.mergeCells(i + 1, 1, i + 1, cols);
          const c = r.getCell(1);
          c.value = linea;
          c.font = { bold: true, size: 11 };
          c.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        const fHeader = 6;
        const rH = ws.getRow(fHeader);
        rH.getCell(1).value = 'Hora';
        h.dias.forEach((d, i) => {
          rH.getCell(2 + i).value = DIAS_NOMBRES[d];
        });
        for (let c = 1; c <= cols; c++) {
          const cell = rH.getCell(c);
          cell.font = { bold: true };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = borde;
        }

        let fila = fHeader + 1;
        for (const b of h.turno?.bloques ?? []) {
          const r = ws.getRow(fila);
          r.getCell(1).value = `${fmtHora(b.hora_inicio)}-${fmtHora(b.hora_fin)}`;
          r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
          r.getCell(1).border = borde;
          if (b.es_receso) {
            ws.mergeCells(fila, 2, fila, cols);
            const c = r.getCell(2);
            c.value = 'RECESO';
            c.font = { bold: true, color: { argb: 'FF888888' } };
            c.alignment = { horizontal: 'center', vertical: 'middle' };
          } else {
            h.dias.forEach((d, i) => {
              const e = entriesDe(h.seccion.seccion_id, b.id, d);
              const c = r.getCell(2 + i);
              if (e) {
                c.value = `${e.materia_nombre}\n${nomProf(e)}\nAula: ${e.aula_codigo}`;
                c.alignment = { wrapText: true, vertical: 'middle' };
              } else {
                c.alignment = { vertical: 'middle' };
              }
            });
            r.height = 42;
          }
          for (let c = 2; c <= cols; c++) r.getCell(c).border = borde;
          fila++;
        }

        ws.pageSetup = {
          paperSize: 5,
          orientation: 'landscape',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
        } as ExcelJS.PageSetup;
      }

      if (hojas.length === 0) {
        alert('No hay secciones seleccionadas.');
        return;
      }
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Horario_${lapsoLabel.replace(/\s+/g, '_')}_${periodo ?? ''}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerando(false);
    }
  };

  // ------------------------- IMPRESIÓN -------------------------
  const imprimir = () => {
    if (hojas.length === 0) {
      alert('No hay secciones seleccionadas.');
      return;
    }
    const seccionesHtml = hojas
      .map((h) => {
        const encabezado = encabezadoDe(h)
          .map((l) => `<div class="hline">${escapeHtml(l)}</div>`)
          .join('');
        const filas = (h.turno?.bloques ?? [])
          .map((b) => {
            const hora = `${fmtHora(b.hora_inicio)}-${fmtHora(b.hora_fin)}`;
            if (b.es_receso) {
              return `<tr><td class="hora">${hora}</td><td colspan="${h.dias.length}" class="receso">RECESO</td></tr>`;
            }
            const tds = h.dias
              .map((d) => {
                const e = entriesDe(h.seccion.seccion_id, b.id, d);
                return e
                  ? `<td><div class="mat">${escapeHtml(e.materia_nombre)}</div><div class="sub">${escapeHtml(nomProf(e))}</div><div class="sub">Aula ${escapeHtml(e.aula_codigo)}</div></td>`
                  : '<td></td>';
              })
              .join('');
            return `<tr><td class="hora">${hora}</td>${tds}</tr>`;
          })
          .join('');
        const thDias = h.dias.map((d) => `<th>${escapeHtml(DIAS_NOMBRES[d])}</th>`).join('');
        return `<section class="hoja">${encabezado}
<table><thead><tr><th>Hora</th>${thDias}</tr></thead><tbody>${filas}</tbody></table></section>`;
      })
      .join('\n');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Horario</title>
<style>
@page { size: letter landscape; margin: 1.2cm 1.4cm; }
body { font-family: Calibri, Arial, sans-serif; font-size: 9pt; color: #000; }
.hoja { page-break-after: always; }
.hoja:last-child { page-break-after: auto; }
.hline { text-align: center; font-weight: bold; line-height: 1.35; }
table { width: 100%; border-collapse: collapse; margin-top: 10px; }
th, td { border: 1px solid #000; padding: 3px 4px; font-size: 8pt; vertical-align: top; }
th { text-align: center; vertical-align: middle; font-weight: bold; }
td.hora { text-align: center; vertical-align: middle; font-size: 7.5pt; white-space: nowrap; }
td.receso { text-align: center; font-weight: bold; letter-spacing: 0.3em; color: #666; font-size: 7.5pt; }
.mat { font-weight: bold; }
.sub { font-size: 7.5pt; color: #333; }
</style></head><body>${seccionesHtml}</body></html>`;

    const win = window.open('', '_blank');
    if (!win) {
      alert('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes.');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.onload = () => {
      win.focus();
      win.print();
    };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800 bg-slate-950 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-blue-400" /> Imprimir / exportar horario
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {lapsoLabel} · Periodo {periodo ?? '—'} · Sin selección = todas las secciones del lapso.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Secciones a incluir
            </label>
            {sel.length > 0 && (
              <button
                onClick={() => setSel([])}
                className="text-[10px] text-slate-400 hover:text-blue-300 font-semibold cursor-pointer"
              >
                Limpiar (todas)
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-1.5 max-h-64 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-2">
            {hojas.length === 0 ||
              secciones.map((s) => (
                <label
                  key={s.seccion_id}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                    sel.includes(s.seccion_id)
                      ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                      : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={sel.includes(s.seccion_id)}
                    onChange={() => toggle(s.seccion_id)}
                    className="accent-blue-500"
                  />
                  <span className="truncate">
                    {s.seccion_nombre} · {s.proyeccion_nombre} ({s.turno_nombre})
                  </span>
                </label>
              ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-2 shrink-0">
          <button
            onClick={imprimir}
            disabled={generando}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Imprimir
          </button>
          <button
            onClick={generarExcel}
            disabled={generando}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" /> {generando ? 'Generando…' : 'Excel'}
          </button>
        </div>
      </div>
    </div>
  );
};
