import React, { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { Profesor } from './ProfesorModal.js';
import { imprimirHtml } from '../utils/print.js';
import { MateriaAsignableRow, labelLapso } from './AgregarMateriaModal.js';
import { X, FileSpreadsheet, Printer, Users, AlertTriangle } from 'lucide-react';

// Filas de carga necesarias para el reporte (subconjunto de CargaRow)
export type ReporteRow = MateriaAsignableRow & {
  pnf_saga_id?: number | null;
  prof_cedula?: string | null;
  prof_nacionalidad?: string | null;
  contrato_nombre?: string | null;
};

type TipoLapso = 'TRIMESTRAL' | 'SEMESTRAL';
type LapsoRef = { n: number; tipo: TipoLapso };

interface ProfReporte {
  nombre: string; // APELLIDOS NOMBRES en mayúsculas
  cedula: number; // para ordenar
  dedicacion: string; // tipo de contrato; vacío si no tiene
  items: ReporteRow[];
  total: number;
}

interface HojaReporte {
  nombreHoja: string;
  lapsoLabel: string; // 'TRIMESTRE I'
  pnfTexto: string; // texto que reemplaza a {PNF}
  profes: ProfReporte[];
}

const romano = (n: number): string => ['I', 'II', 'III', 'IV', 'V', 'VI'][n - 1] ?? String(n);

const lapsoTitulo = (l: LapsoRef): string =>
  `${l.tipo === 'SEMESTRAL' ? 'SEMESTRE' : 'TRIMESTRE'} ${romano(l.n)}`;

// Nombre corto de PNF para hoja/archivo: 'P.N.F EN MEDICINA VETERINARIA' -> 'MEDICINA VETERINARIA'
const pnfCorto = (pnf: string): string =>
  pnf.replace(/^\s*(P\.?\s*N\.?\s*F\.?|PNF)\s*/i, '').replace(/^(EN|DE)\s+/i, '').trim() || pnf.trim();

// Factoría: devuelve una función que genera nombres de hoja únicos y válidos
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

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Encabezado por defecto (editable en el modal). Placeholders: {PNF} {LAPSO} {PERIODO}
const HEADER_DEFAULT = [
  'PERSONAL DOCENTE',
  'P.N.F EN {PNF}',
  'U.P.T. DE LOS LLANOS "JUANA RAMÍREZ", EXTENSIÓN ALTAGRACIA DE ORITUCO',
  'CARGA ACADÉMICA {LAPSO}',
  '{PERIODO}',
];

interface ReporteCargaModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: ReporteRow[];
  profesores: Profesor[];
  periodo: string | null;
  periodoNombre?: string | null;
}

export const ReporteCargaModal: React.FC<ReporteCargaModalProps> = ({
  isOpen,
  onClose,
  rows,
  profesores,
  periodo,
  periodoNombre,
}) => {
  const [pnfSel, setPnfSel] = useState<number[]>([]); // vacío = reporte general
  const [lapsoSel, setLapsoSel] = useState<string[]>([]); // vacío = todos los lapsos
  const [incluirOtrosPnf, setIncluirOtrosPnf] = useState(false); // incluir docentes de otros PNF con materias del PNF seleccionado
  const [header, setHeader] = useState<string[]>(HEADER_DEFAULT);
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const profMap = useMemo(() => new Map(profesores.map((p) => [p.id, p])), [profesores]);

  // Opciones de PNF según el PNF asociado del docente
  const pnfOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of profesores) {
      if (p.pnf_saga_id != null && !map.has(p.pnf_saga_id)) {
        map.set(p.pnf_saga_id, p.pnf_nombre || `PNF #${p.pnf_saga_id}`);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [profesores]);

  // Lapsos presentes en los datos: TRIMESTRAL 1..n, luego SEMESTRAL 1..n
  const lapsos = useMemo<LapsoRef[]>(
    () =>
      (['TRIMESTRAL', 'SEMESTRAL'] as const).flatMap((tipo) =>
        [...new Set(rows.filter((r) => r.tipo_proyeccion === tipo).map((r) => r.trimestre))]
          .sort((a, b) => a - b)
          .map((n) => ({ n, tipo }))
      ),
    [rows]
  );

  // Agrupa filas por docente dentro de un lapso; filtra por PNF asociado (null = todos)
  const profesDe = (lapso: LapsoRef, pnfId: number | null): ProfReporte[] => {
    const grupos = new Map<number, ReporteRow[]>();
    for (const r of rows) {
      if (r.profesor_id == null) continue;
      if (r.tipo_proyeccion !== lapso.tipo || r.trimestre !== lapso.n) continue;
      const prof = profMap.get(r.profesor_id);
      if (pnfId !== null) {
        if (incluirOtrosPnf) {
          // Docentes del propio PNF: todas sus materias. Docentes de otros PNF:
          // solo entran si tienen materias del PNF seleccionado y solo se listan esas
          const esPropio = prof?.pnf_saga_id === pnfId;
          if (!esPropio && r.pnf_saga_id !== pnfId) continue;
        } else if (prof?.pnf_saga_id !== pnfId) {
          continue;
        }
      }
      let g = grupos.get(r.profesor_id);
      if (!g) {
        g = [];
        grupos.set(r.profesor_id, g);
      }
      g.push(r);
    }
    return [...grupos.entries()]
      .map(([id, items]) => {
        const prof = profMap.get(id);
        const nombre = (
          (prof ? `${prof.apellidos} ${prof.nombres}` : `${items[0].prof_apellidos ?? ''} ${items[0].prof_nombres ?? ''}`)
            .trim() || `Docente #${id}`
        ).toUpperCase();
        const cedula = parseInt(prof?.cedula ?? items[0].prof_cedula ?? '', 10) || Number.MAX_SAFE_INTEGER;
        const dedicacion = prof?.tipo_contrato_nombre ?? items[0].contrato_nombre ?? '';
        items.sort((a, b) => a.materia_nombre.localeCompare(b.materia_nombre));
        return { nombre, cedula, dedicacion, items, total: items.reduce((acc, r) => acc + (r.horas_semanales || 0), 0) };
      })
      .sort((a, b) => a.cedula - b.cedula);
  };

  // Una hoja por (PNF seleccionado × lapso) — o por lapso cuando es reporte general
  const hojas = useMemo<HojaReporte[]>(() => {
    const nombrarHoja = crearNombradorHojas();
    const lista: HojaReporte[] = [];
    // Sin selección se incluyen todos; con selección solo los marcados.
    // Cada hoja se crea solo si hay datos (docentes con carga) en ese lapso.
    const lapsosUso = lapsoSel.length > 0 ? lapsos.filter((l) => lapsoSel.includes(`${l.tipo}:${l.n}`)) : lapsos;
    if (pnfSel.length === 0) {
      for (const lapso of lapsosUso) {
        const profes = profesDe(lapso, null);
        if (profes.length === 0) continue;
        lista.push({
          nombreHoja: nombrarHoja(`General ${lapso.tipo === 'SEMESTRAL' ? 'S' : 'T'}-${lapso.n}`),
          lapsoLabel: lapsoTitulo(lapso),
          pnfTexto: 'TODOS LOS PROGRAMAS',
          profes,
        });
      }
    } else {
      for (const pnfId of pnfSel) {
        const pnfNombre = pnfOptions.find(([id]) => id === pnfId)?.[1] ?? `PNF ${pnfId}`;
        for (const lapso of lapsosUso) {
          const profes = profesDe(lapso, pnfId);
          if (profes.length === 0) continue;
          lista.push({
            nombreHoja: nombrarHoja(`${pnfCorto(pnfNombre)} ${lapso.tipo === 'SEMESTRAL' ? 'S' : 'T'}-${lapso.n}`),
            lapsoLabel: lapsoTitulo(lapso),
            pnfTexto: pnfCorto(pnfNombre).toUpperCase(),
            profes,
          });
        }
      }
    }
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pnfSel, lapsoSel, incluirOtrosPnf, lapsos, rows, profMap, pnfOptions]);

  const linea = (tpl: string, hoja: HojaReporte): string =>
    tpl
      .replace(/\{PNF\}/gi, hoja.pnfTexto)
      .replace(/\{LAPSO\}/gi, hoja.lapsoLabel)
      .replace(/\{PERIODO\}/gi, periodoNombre || periodo || '');

  // ------------------------- EXCEL -------------------------
  const generarExcel = async () => {
    setGenerando(true);
    try {
      const wb = new ExcelJS.Workbook();
      const thin: Partial<ExcelJS.Border> = { style: 'thin' };
      const borde: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };
      const centrado: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };
      const centradoWrap: Partial<ExcelJS.Alignment> = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      const fuenteDatos: Partial<ExcelJS.Font> = { size: 9 };

      for (const hoja of hojas) {
        const ws = wb.addWorksheet(hoja.nombreHoja);
        ws.columns = [
          { width: 34 }, // A Profesor
          { width: 46 }, // B Unidad Curricular
          { width: 26 }, // C PNF
          { width: 13 }, // D Trayecto
          { width: 10 }, // E Sección
          { width: 10 }, // F Turno
          { width: 8 },  // G Horas por U/C
          { width: 8 },  // H Total de Horas
          { width: 16 }, // I Dedicación
        ];

        // Encabezado institucional (5 líneas, cada una combinada A:I)
        header.forEach((tpl, i) => {
          const r = ws.getRow(i + 1);
          ws.mergeCells(i + 1, 1, i + 1, 9);
          const cell = r.getCell(1);
          cell.value = linea(tpl, hoja);
          cell.font = { bold: true, size: 11 };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        // Encabezados de tabla (filas 7-8)
        const fijos: Array<[string, string]> = [
          ['A7:A8', 'Profesor'],
          ['B7:B8', 'Unidad Curricular'],
          ['C7:C8', 'PNF'],
          ['D7:D8', 'Trayecto'],
          ['E7:E8', 'Sección'],
          ['F7:F8', 'Turno'],
          ['I7:I8', 'Dedicación'],
        ];
        for (const [rango, texto] of fijos) {
          ws.mergeCells(rango);
          const cell = ws.getCell(rango.split(':')[0]);
          cell.value = texto;
          cell.font = { bold: true };
          cell.alignment = centrado;
        }
        ws.mergeCells('G7:H7');
        const cTitulo = ws.getCell('G7');
        cTitulo.value = hoja.lapsoLabel;
        cTitulo.font = { bold: true };
        cTitulo.alignment = centrado;
        const cHrs = ws.getCell('G8');
        cHrs.value = 'Horas por U/C';
        const cTot = ws.getCell('H8');
        cTot.value = 'Total de Horas';
        for (const c of [cHrs, cTot]) {
          c.font = { bold: true };
          c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        }
        ws.getRow(7).height = 18;
        ws.getRow(8).height = 30;

        // Datos. Para que un docente no quede partido entre páginas impresas
        // se estima la altura de su bloque (filas con texto envuelto) y se
        // inserta un salto de página manual antes del bloque que no quepa.
        const anchoCol = { A: 34, B: 46, C: 26, I: 16 };
        const lineasWrap = (texto: string | null | undefined, ancho: number) =>
          Math.max(1, Math.ceil((texto || '').length / (ancho * 1.15)));
        const altoItem = (item: ReporteRow) =>
          Math.max(
            15,
            Math.max(
              lineasWrap(item.materia_nombre, anchoCol.B),
              lineasWrap(item.pnf_nombre, anchoCol.C)
            ) * 12.5 + 4
          );
        // Carta apaisada: ~500pt útiles menos el encabezado repetido (filas 1-8 ≈ 140pt)
        const CAP_DATOS = 355;
        let resto = CAP_DATOS;

        let fila = 9;
        for (const prof of hoja.profes) {
          const inicio = fila;
          let altoBloque = 0;
          for (const item of prof.items) {
            const r = ws.getRow(fila);
            r.getCell(2).value = item.materia_nombre;
            r.getCell(3).value = item.pnf_nombre;
            r.getCell(4).value = item.trayecto_nombre;
            r.getCell(5).value = item.seccion_nombre;
            r.getCell(6).value = item.turno_nombre;
            r.getCell(7).value = item.horas_semanales;
            r.getCell(2).alignment = { vertical: 'middle', wrapText: true };
            for (const col of [3, 4, 5, 6, 7]) {
              r.getCell(col).alignment = col === 3 ? centradoWrap : centrado;
            }
            for (const col of [2, 3, 4, 5, 6, 7]) r.getCell(col).font = fuenteDatos;
            altoBloque += altoItem(item);
            fila++;
          }
          // El bloque también debe alojar el nombre y la dedicación combinados
          altoBloque = Math.max(
            altoBloque,
            lineasWrap(prof.nombre, anchoCol.A) * 12.5 + 4,
            lineasWrap(prof.dedicacion, anchoCol.I) * 12.5 + 4
          );
          if (altoBloque > resto && inicio > 9) {
            ws.getRow(inicio - 1).addPageBreak();
            resto = CAP_DATOS;
          }
          resto -= altoBloque;
          const fin = fila - 1;
          if (fin > inicio) {
            ws.mergeCells(inicio, 1, fin, 1);
            ws.mergeCells(inicio, 8, fin, 8);
            ws.mergeCells(inicio, 9, fin, 9);
          }
          const cNom = ws.getCell(inicio, 1);
          cNom.value = prof.nombre;
          cNom.font = { size: 9, bold: true };
          cNom.alignment = { vertical: 'middle', wrapText: true };
          const cTotal = ws.getCell(inicio, 8);
          cTotal.value = prof.total;
          cTotal.font = { bold: true, size: 10 };
          cTotal.alignment = centrado;
          const cDed = ws.getCell(inicio, 9);
          cDed.value = prof.dedicacion || null;
          cDed.font = fuenteDatos;
          cDed.alignment = centradoWrap;
        }
        const ultima = fila - 1;

        // Bordes en toda la tabla (encabezados + datos)
        for (let f = 7; f <= ultima; f++) {
          for (let c = 1; c <= 9; c++) {
            ws.getCell(f, c).border = borde;
          }
        }

        // Área de impresión + página configurada (carta, ajusta al ancho)
        ws.pageSetup = {
          paperSize: 5, // Carta
          orientation: 'landscape',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
          printArea: `A1:I${ultima}`,
          printTitlesRow: '1:8',
        } as ExcelJS.PageSetup;
      }

      if (hojas.length === 0) {
        setAviso('No hay docentes con carga para la selección realizada.');
        return;
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const tagPnf = pnfSel.length === 0 ? 'General' : pnfSel.length === 1 ? pnfCorto(pnfOptions.find(([id]) => id === pnfSel[0])?.[1] ?? 'PNF') : 'Varios-PNF';
      a.href = url;
      a.download = `Carga_Docente_${tagPnf}_${periodo || ''}.xlsx`.replace(/\s+/g, '_');
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerando(false);
    }
  };

  // ------------------------- IMPRESIÓN DIRECTA -------------------------
  const imprimir = () => {
    if (hojas.length === 0) {
      setAviso('No hay docentes con carga para la selección realizada.');
      return;
    }
    const secciones = hojas
      .map((hoja) => {
        const encabezado = header
          .map((tpl) => `<div class="hline">${escapeHtml(linea(tpl, hoja))}</div>`)
          .join('');
        // Cada docente va en su propio <tbody> para que el salto de página
        // no lo divida: el navegador mueve el grupo completo a la hoja siguiente
        const filas = hoja.profes
          .map((prof) =>
            `<tbody class="grp">${prof.items
              .map((item, i) => {
                const tdProf =
                  i === 0 ? `<td rowspan="${prof.items.length}" class="prof">${escapeHtml(prof.nombre)}</td>` : '';
                const tdTot =
                  i === 0 ? `<td rowspan="${prof.items.length}" class="num tot">${prof.total}</td>` : '';
                const tdDed =
                  i === 0 ? `<td rowspan="${prof.items.length}" class="ded">${escapeHtml(prof.dedicacion)}</td>` : '';
                return `<tr>${tdProf}<td>${escapeHtml(item.materia_nombre)}</td><td>${escapeHtml(item.pnf_nombre)}</td><td>${escapeHtml(item.trayecto_nombre)}</td><td>${escapeHtml(item.seccion_nombre)}</td><td>${escapeHtml(item.turno_nombre)}</td><td class="num">${item.horas_semanales}</td>${tdTot}${tdDed}</tr>`;
              })
              .join('')}</tbody>`
          )
          .join('');
        return `<section class="hoja">${encabezado}
<table>
<thead>
<tr><th rowspan="2">Profesor</th><th rowspan="2">Unidad Curricular</th><th rowspan="2">PNF</th><th rowspan="2">Trayecto</th><th rowspan="2">Sección</th><th rowspan="2">Turno</th><th colspan="2">${escapeHtml(hoja.lapsoLabel)}</th><th rowspan="2">Dedicación</th></tr>
<tr><th class="v">Horas por U/C</th><th class="v">Total de Horas</th></tr>
</thead>
${filas}
</table></section>`;
      })
      .join('\n');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Carga Docente</title>
<style>
@page { size: letter landscape; margin: 1.2cm 1.5cm; }
body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000; }
.hoja { page-break-after: always; }
.hoja:last-child { page-break-after: auto; }
.hline { text-align: center; font-weight: bold; line-height: 1.35; }
table { width: 100%; border-collapse: collapse; margin-top: 10px; }
thead { display: table-header-group; }
tbody.grp { break-inside: avoid; page-break-inside: avoid; }
tr { break-inside: avoid; page-break-inside: avoid; }
th, td { border: 1px solid #000; padding: 3px 4px; font-size: 9pt; }
th { text-align: center; vertical-align: middle; font-weight: bold; }
th.v { font-size: 7.5pt; }
td.num { text-align: center; }
td.prof { vertical-align: middle; font-weight: bold; }
td.tot { font-weight: bold; font-size: 11pt; vertical-align: middle; }
td.ded { text-align: center; vertical-align: middle; }
</style></head><body>${secciones}</body></html>`;

    imprimirHtml(html);
  };

  if (!isOpen) return null;

  const togglePnf = (id: number) =>
    setPnfSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleLapso = (key: string) =>
    setLapsoSel((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800 bg-slate-950 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              Reporte de Carga Docente
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Genera el Excel con la carga académica por PNF del docente. Sin selección = reporte general.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Selector de PNF del docente */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> PNF del docente
              </label>
              {pnfSel.length > 0 && (
                <button
                  onClick={() => setPnfSel([])}
                  className="text-[10px] text-slate-400 hover:text-emerald-300 font-semibold cursor-pointer"
                >
                  Limpiar (reporte general)
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-2">
              {pnfOptions.length === 0 && (
                <span className="text-xs text-slate-500 italic px-2 py-1">Sin PNF asociados a docentes</span>
              )}
              {pnfOptions.map(([id, nombre]) => (
                <label
                  key={id}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                    pnfSel.includes(id)
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={pnfSel.includes(id)}
                    onChange={() => togglePnf(id)}
                    className="accent-emerald-500"
                  />
                  <span className="truncate">{nombre}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5">
              Se genera una hoja por PNF × lapso. Sin selección, una hoja por lapso con todos los docentes.
            </p>
            {pnfSel.length > 0 && (
              <label
                className="mt-2 flex items-start gap-2 text-[11px] text-slate-400 cursor-pointer select-none"
                title="Incluye docentes cuyo PNF asociado es distinto, solo si tienen materias del PNF seleccionado; en el reporte solo aparecen esas materias"
              >
                <input
                  type="checkbox"
                  checked={incluirOtrosPnf}
                  onChange={(e) => setIncluirOtrosPnf(e.target.checked)}
                  className="w-3.5 h-3.5 mt-0.5 accent-emerald-500 cursor-pointer"
                />
                <span>
                  <span className="font-semibold text-slate-300">Incluir docentes de otros PNF</span>: si
                  tienen materias de los PNF seleccionados, se agregan al reporte mostrando solo esas
                  materias
                </span>
              </label>
            )}
          </div>

          {/* Selector de lapsos a incluir */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Lapsos a incluir
              </label>
              {lapsoSel.length > 0 && (
                <button
                  onClick={() => setLapsoSel([])}
                  className="text-[10px] text-slate-400 hover:text-emerald-300 font-semibold cursor-pointer"
                >
                  Limpiar (todos los lapsos)
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {lapsos.map((l) => {
                const key = `${l.tipo}:${l.n}`;
                const activo = lapsoSel.includes(key);
                return (
                  <label
                    key={key}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-xs font-semibold transition-colors border ${
                      activo
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={activo}
                      onChange={() => toggleLapso(key)}
                      className="accent-emerald-500"
                    />
                    <span>{labelLapso(l.n, l.tipo)}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5">
              Sin selección se incluyen todos. Cada lapso genera su propia hoja solo si existen datos en él.
            </p>
          </div>

          {/* Encabezado editable */}
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder={HEADER_DEFAULT[i]}
                />
              ))}
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[10px] text-slate-500">
                Placeholders: <code className="text-slate-400">{'{PNF}'}</code>{' '}
                <code className="text-slate-400">{'{LAPSO}'}</code>{' '}
                <code className="text-slate-400">{'{PERIODO}'}</code>
              </p>
              <button
                onClick={() => setHeader([...HEADER_DEFAULT])}
                className="text-[10px] text-slate-400 hover:text-emerald-300 font-semibold cursor-pointer"
              >
                Restaurar encabezado
              </button>
            </div>
          </div>
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
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{generando ? 'Generando...' : 'Generar Excel'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
