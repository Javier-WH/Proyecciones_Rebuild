import React, { useState, useMemo, useEffect } from 'react';
import ExcelJS from 'exceljs';
import {
  X,
  FileSpreadsheet,
  Printer,
  CalendarClock,
  Loader2,
  Building2,
  Users,
  Search,
  UserPlus,
} from 'lucide-react';
import { apiFetch } from '../api/client.js';
import { MateriaAsignableRow, labelLapso } from './AgregarMateriaModal.js';
import {
  HorarioEntry,
  SeccionRef,
  Turno,
  Aula,
  seccionesDe,
  DIAS_NOMBRES,
  fmtHoraCfg,
  minutos,
  traslapan,
} from './horarios/types.js';

interface ReporteHorarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  periodo: string | null;
  lapsoActual: string; // 'TRIMESTRAL:1' — sus secciones vienen pre-marcadas
  lapsos: string[]; // todos los lapsos con carga docente ('TRIMESTRAL:1' … 'SEMESTRAL:2')
  rows: MateriaAsignableRow[];
  aulas: Aula[];
  turnos: Turno[];
  formato12?: boolean;
  // Modo docente: pre-selecciona este profesor en cada lapso y muestra solo el
  // grupo "Profesores" (las secciones/aulas ocultas producirían hojas parciales
  // porque los entries del invitado ya vienen filtrados del servidor).
  profesorPreseleccionado?: number;
  soloProfesores?: boolean;
}

// Contenido de una celda del reporte: materia en negrita + líneas secundarias
interface CeldaRep {
  mat: string;
  subs: string[];
}

type FilaRep =
  | { kind: 'sep'; texto: string } // fila separadora de turno
  | { kind: 'rec'; texto: string } // receso (fila combinada)
  | { kind: 'bloque'; hora: string; celdas: (CeldaRep[] | null)[] }; // una por día

interface HojaRep {
  nombre: string; // base para nombrar la hoja de Excel
  lineas: string[]; // encabezado institucional
  dias: number[];
  filas: FilaRep[];
  spans: Map<string, number>; // 'filaIdx:diaIdx' → alto del bloque fusionado
  cubiertas: Set<string>; // celdas absorbidas por un span (no se dibujan)
}

// Firma de una celda para decidir si se fusiona con la de arriba: mismas
// clases (materia + datos secundarios) = misma clase continuando.
const sigCeldaRep = (c: CeldaRep[] | null): string | null =>
  c && c.length > 0 ? c.map((x) => `${x.mat}|${x.subs.join('|')}`).join(';;') : null;

// Fusiones verticales: celdas contiguas del mismo día con la misma firma
// forman una sola celda alta (como el rowspan de la vista). Una fila
// separadora/receso entre medias corta la fusión.
const fusionesDe = (filas: FilaRep[], nDias: number) => {
  const spans = new Map<string, number>();
  const cubiertas = new Set<string>();
  for (let d = 0; d < nDias; d++) {
    let i = 0;
    while (i < filas.length) {
      const f = filas[i];
      if (f.kind !== 'bloque' || !sigCeldaRep(f.celdas[d])) {
        i++;
        continue;
      }
      const sig = sigCeldaRep(f.celdas[d]);
      let j = i + 1;
      while (
        j < filas.length &&
        filas[j].kind === 'bloque' &&
        sigCeldaRep((filas[j] as { celdas: (CeldaRep[] | null)[] }).celdas[d]) === sig
      )
        j++;
      if (j - i > 1) {
        spans.set(`${i}:${d}`, j - i);
        for (let k = i + 1; k < j; k++) cubiertas.add(`${k}:${d}`);
      }
      i = j;
    }
  }
  return { spans, cubiertas };
};

interface GrupoLapso {
  tipo: string;
  n: number;
  label: string;
  secciones: SeccionRef[];
  profesores: { id: number; nombre: string; cedula: string | null }[];
  aulas: { id: number; codigo: string }[];
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

const normNombre = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

// Orden fijo de bandas: Mañana → Tarde → Noche (mismo criterio que VistaRecurso)
const ordenTurno = (nombre: string): number => {
  const n = normNombre(nombre);
  if (n.includes('MANANA') || n.includes('MATUT')) return 0;
  if (n.includes('TARDE') || n.includes('VESPERT')) return 1;
  if (n.includes('NOCHE') || n.includes('NOCTURN')) return 2;
  return 3;
};

const esDiurno = (nombre: string): boolean => normNombre(nombre).includes('DIURN');

export const ReporteHorarioModal: React.FC<ReporteHorarioModalProps> = ({
  isOpen,
  onClose,
  periodo,
  lapsoActual,
  lapsos,
  rows,
  aulas,
  turnos,
  formato12,
  profesorPreseleccionado,
  soloProfesores,
}) => {
  const [lapsoTab, setLapsoTab] = useState<string>('');
  const [selSec, setSelSec] = useState<Set<string>>(new Set());
  const [selAula, setSelAula] = useState<Set<string>>(new Set());
  const [selProf, setSelProf] = useState<Set<string>>(new Set());
  const [profQuery, setProfQuery] = useState('');
  const [ocupReal, setOcupReal] = useState(false);
  const [entradas, setEntradas] = useState<Map<string, HorarioEntry[]>>(new Map());
  const [cargando, setCargando] = useState(false);
  const [generando, setGenerando] = useState(false);

  // Al abrir: secciones del lapso activo pre-marcadas + entries de todos los
  // lapsos (el endpoint devuelve también los lapsos rivales).
  useEffect(() => {
    if (!isOpen) return;
    setLapsoTab(lapsos.includes(lapsoActual) ? lapsoActual : lapsos[0] ?? '');
    setProfQuery('');
    if (profesorPreseleccionado != null) {
      setSelSec(new Set());
      setSelProf(new Set(lapsos.map((lk) => `${lk}:${profesorPreseleccionado}`)));
    } else {
      const [tipo, n] = lapsoActual.split(':');
      const secActual = seccionesDe(
        rows.filter((r) => r.tipo_proyeccion === tipo && r.trimestre === Number(n))
      );
      setSelSec(new Set(secActual.map((s) => `${lapsoActual}:${s.seccion_id}`)));
      setSelProf(new Set());
    }
    setSelAula(new Set());
    setOcupReal(false);

    setCargando(true);
    Promise.all(
      lapsos.map(async (lk) => {
        const [t, nn] = lk.split(':');
        const res = await apiFetch<{ entries: HorarioEntry[] }>(
          `/horarios/entries?tipo=${t}&trimestre=${nn}`
        );
        return [lk, res.success && res.data ? res.data.entries || [] : []] as const;
      })
    ).then((pares) => {
      setEntradas(new Map(pares));
      setCargando(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Listas por lapso: secciones y profesores (materia asignada) vienen de la
  // carga docente; aulas, de las clases agendadas de cada lapso.
  const grupos = useMemo<Map<string, GrupoLapso>>(() => {
    const m = new Map<string, GrupoLapso>();
    for (const lk of lapsos) {
      const [tipo, nStr] = lk.split(':');
      const n = Number(nStr);
      const rowsL = rows.filter((r) => r.tipo_proyeccion === tipo && r.trimestre === n);
      const profMap = new Map<number, { nombre: string; cedula: string | null }>();
      for (const r of rowsL) {
        if (r.profesor_id != null && !profMap.has(r.profesor_id)) {
          profMap.set(r.profesor_id, {
            nombre: `${r.prof_apellidos ?? ''} ${r.prof_nombres ?? ''}`.trim() || 'Sin nombre',
            cedula: r.prof_cedula ?? null,
          });
        }
      }
      const propias = (entradas.get(lk) ?? []).filter(
        (e) => e.tipo_proyeccion === tipo && e.trimestre === n
      );
      const aulaIds = new Set(propias.map((e) => e.aula_id));
      m.set(lk, {
        tipo,
        n,
        label: labelLapso(n, tipo),
        secciones: seccionesDe(rowsL),
        profesores: [...profMap.entries()]
          .map(([id, v]) => ({ id, nombre: v.nombre, cedula: v.cedula }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre)),
        aulas: aulas
          .filter((a) => aulaIds.has(a.id))
          .map((a) => ({ id: a.id, codigo: a.nombre || a.codigo }))
          .sort((a, b) => a.codigo.localeCompare(b.codigo)),
      });
    }
    return m;
  }, [lapsos, rows, entradas, aulas]);

  const propiasDe = (lk: string): HorarioEntry[] => {
    const g = grupos.get(lk);
    if (!g) return [];
    return (entradas.get(lk) ?? []).filter(
      (e) => e.tipo_proyeccion === g.tipo && e.trimestre === g.n
    );
  };

  // Bandas de una agenda con mezcla de turno Diurno: una clase diurna se
  // coloca en la banda (Mañana/Tarde/Noche) cuyos bloques coincidan con sus
  // horas. La banda 'Diurno' solo aparece si no existe turno equivalente
  // para esas horas. Las filas de cada banda son sus propios bloques.
  interface BandaRep {
    nombre: string;
    bloques: { id: number; hora_inicio: string; hora_fin: string; es_receso: number }[];
    items: HorarioEntry[];
  }
  const bandasDe = (lista: HorarioEntry[]): BandaRep[] => {
    // Turnos configurados, orden Mañana → Tarde → Noche → otros (Diurno cae
    // al final por ordenTurno, solo se muestra como fallback).
    const cfg = turnos
      .map((t) => ({ turno: t, bloques: [...t.bloques].sort((a, b) => a.orden - b.orden) }))
      .filter((b) => b.bloques.length > 0)
      .sort(
        (a, b) =>
          ordenTurno(a.turno.nombre) - ordenTurno(b.turno.nombre) ||
          minutos(a.bloques[0].hora_inicio) - minutos(b.bloques[0].hora_inicio)
      );
    const porTurno = new Map(turnos.map((t) => [t.id, t]));
    const asignadas = new Map<number, HorarioEntry[]>();
    const otras: HorarioEntry[] = [];
    for (const e of lista) {
      const propio = porTurno.get(e.turno_id);
      let destino: Turno | undefined = propio;
      if (propio && esDiurno(propio.nombre)) {
        const eq = cfg.find(
          (c) =>
            !esDiurno(c.turno.nombre) &&
            c.bloques.some((b) =>
              traslapan(e.hora_inicio, e.hora_fin, b.hora_inicio, b.hora_fin)
            )
        );
        if (eq) destino = eq.turno;
      }
      if (destino && cfg.some((c) => c.turno.id === destino!.id)) {
        const arr = asignadas.get(destino.id) || [];
        arr.push(e);
        asignadas.set(destino.id, arr);
      } else {
        otras.push(e);
      }
    }
    const bandas: BandaRep[] = cfg
      .filter((c) => (asignadas.get(c.turno.id) ?? []).length > 0)
      .map((c) => ({ nombre: c.turno.nombre, bloques: c.bloques, items: asignadas.get(c.turno.id)! }));
    if (otras.length > 0) {
      const rangos = new Map<string, { inicio: string; fin: string }>();
      for (const e of otras)
        rangos.set(`${e.hora_inicio}-${e.hora_fin}`, { inicio: e.hora_inicio, fin: e.hora_fin });
      bandas.push({
        nombre: 'Otras horas',
        bloques: [...rangos.values()]
          .sort((a, b) => minutos(a.inicio) - minutos(b.inicio))
          .map((r, i) => ({
            id: -(i + 1),
            hora_inicio: r.inicio,
            hora_fin: r.fin,
            es_receso: 0,
          })),
        items: otras,
      });
    }
    return bandas;
  };

  const diasAgenda = (bandas: BandaRep[], lista: HorarioEntry[]): number[] => {
    const set = new Set<number>();
    for (const e of lista) set.add(e.dia_semana);
    for (const t of turnos) {
      if (bandas.some((b) => b.nombre === t.nombre)) {
        String(t.dias_semana)
          .split(',')
          .map(Number)
          .filter(Boolean)
          .forEach((d) => set.add(d));
      }
    }
    const arr = [...set].sort((a, b) => a - b);
    return arr.length > 0 ? arr : [1, 2, 3, 4, 5];
  };

  const ENCABEZADO = [
    'HORARIO DE CLASE',
    'U.P.T. DE LOS LLANOS "JUANA RAMÍREZ", EXTENSIÓN ALTAGRACIA DE ORITUCO',
  ];

  // Hoja de una sección: su turno fijo define la grilla (igual que antes)
  const hojaSeccion = (lk: string, s: SeccionRef): HojaRep => {
    const g = grupos.get(lk)!;
    const turno = turnos.find((t) => t.saga_id === s.turno_saga_id) ?? null;
    const dias = turno
      ? String(turno.dias_semana).split(',').map(Number).filter(Boolean).sort()
      : [1, 2, 3, 4, 5];
    const porCelda = new Map<string, HorarioEntry>();
    for (const e of propiasDe(lk)) {
      if (e.seccion_id === s.seccion_id) porCelda.set(`${e.bloque_id}:${e.dia_semana}`, e);
    }
    const filas: FilaRep[] = (turno?.bloques ?? []).map((b) => {
      const hora = `${fmtHoraCfg(b.hora_inicio, formato12)}-${fmtHoraCfg(b.hora_fin, formato12)}`;
      if (b.es_receso) return { kind: 'rec', texto: `${hora}  ·  RECESO` };
      return {
        kind: 'bloque',
        hora,
        celdas: dias.map((d) => {
          const e = porCelda.get(`${b.id}:${d}`);
          return e ? [{ mat: e.materia_nombre, subs: [nomProf(e), e.aula_nombre] }] : null;
        }),
      };
    });
    return {
      nombre: `${s.seccion_nombre} ${g.label}`,
      lineas: [
        ...ENCABEZADO,
        `SECCIÓN ${s.seccion_nombre} — ${s.proyeccion_nombre} — TURNO ${s.turno_nombre.toUpperCase()}`,
        `${g.label.toUpperCase()} — PERIODO ${periodo ?? ''}`,
      ],
      dias,
      filas,
      ...fusionesDe(filas, dias.length),
    };
  };

  // Hoja agenda de aula o profesor: una sola tabla, bandas por turno con
  // fila separadora que lleva el nombre del turno.
  const hojaAgenda = (
    lk: string,
    recurso: 'aula' | 'profesor',
    id: number,
    titulo: string,
    nombreHoja: string
  ): HojaRep => {
    const g = grupos.get(lk)!;
    const base = entradas.get(lk) ?? [];
    const propias = ocupReal ? base : propiasDe(lk);
    const lista = propias.filter((e) =>
      recurso === 'aula' ? e.aula_id === id : e.profesor_id === id
    );
    const bandas = bandasDe(lista);
    const dias = diasAgenda(bandas, lista);
    const filas: FilaRep[] = [];
    for (const banda of bandas) {
      filas.push({ kind: 'sep', texto: banda.nombre.toUpperCase() });
      for (const b of banda.bloques) {
        const hora = `${fmtHoraCfg(b.hora_inicio, formato12)}-${fmtHoraCfg(b.hora_fin, formato12)}`;
        if (b.es_receso) {
          filas.push({ kind: 'rec', texto: `${hora}  ·  RECESO` });
          continue;
        }
        filas.push({
          kind: 'bloque',
          hora,
          celdas: dias.map((d) => {
            const items = banda.items.filter(
              (e) =>
                e.dia_semana === d &&
                traslapan(e.hora_inicio, e.hora_fin, b.hora_inicio, b.hora_fin)
            );
            if (items.length === 0) return null;
            return items.map((e) =>
              recurso === 'aula'
                ? {
                    mat: e.materia_nombre,
                    subs: [
                      `Sección ${e.seccion_nombre} (${labelLapso(e.trimestre, e.tipo_proyeccion)})`,
                      nomProf(e),
                    ],
                  }
                : {
                    mat: e.materia_nombre,
                    subs: [`Sección ${e.seccion_nombre}`, e.aula_nombre],
                  }
            );
          }),
        });
      }
    }
    return {
      nombre: nombreHoja,
      lineas: [...ENCABEZADO, `${titulo} — ${g.label.toUpperCase()}`, `PERIODO ${periodo ?? ''}`],
      dias,
      filas,
      ...fusionesDe(filas, dias.length),
    };
  };

  // Todas las hojas seleccionadas: secciones → aulas → profesores, por lapso
  const hojas = useMemo<HojaRep[]>(() => {
    const out: HojaRep[] = [];
    for (const lk of lapsos) {
      const g = grupos.get(lk);
      if (!g) continue;
      for (const s of g.secciones) {
        if (selSec.has(`${lk}:${s.seccion_id}`)) out.push(hojaSeccion(lk, s));
      }
      for (const a of g.aulas) {
        if (selAula.has(`${lk}:${a.id}`))
          out.push(hojaAgenda(lk, 'aula', a.id, a.codigo.toUpperCase(), `${a.codigo} ${g.label}`));
      }
      for (const p of g.profesores) {
        if (selProf.has(`${lk}:${p.id}`))
          out.push(hojaAgenda(lk, 'profesor', p.id, `PROF. ${p.nombre.toUpperCase()}`, `${p.nombre} ${g.label}`));
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lapsos, grupos, selSec, selAula, selProf, ocupReal, turnos, periodo, formato12]);

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, clave: string) => {
    const n = new Set(set);
    if (n.has(clave)) n.delete(clave);
    else n.add(clave);
    setSet(n);
  };

  const toggleGrupo = (
    set: Set<string>,
    setSet: (s: Set<string>) => void,
    lk: string,
    ids: (string | number)[]
  ) => {
    const n = new Set(set);
    const claves = ids.map((id) => `${lk}:${id}`);
    const todoMarcado = claves.every((c) => n.has(c));
    for (const c of claves) {
      if (todoMarcado) n.delete(c);
      else n.add(c);
    }
    setSet(n);
  };

  // ------------------------- EXCEL -------------------------
  const generarExcel = async () => {
    if (hojas.length === 0) {
      alert('No hay nada seleccionado.');
      return;
    }
    setGenerando(true);
    try {
      const wb = new ExcelJS.Workbook();
      const thin: Partial<ExcelJS.Border> = { style: 'thin' };
      const borde: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };
      const nombrar = crearNombradorHojas();

      for (const h of hojas) {
        const ws = wb.addWorksheet(nombrar(h.nombre));
        const cols = 1 + h.dias.length;
        ws.columns = [{ width: 14 }, ...h.dias.map(() => ({ width: 26 }))];

        h.lineas.forEach((linea, i) => {
          const r = ws.getRow(i + 1);
          ws.mergeCells(i + 1, 1, i + 1, cols);
          const c = r.getCell(1);
          c.value = linea;
          c.font = { bold: true, size: 11 };
          c.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        let fila = h.lineas.length + 2;
        const rH = ws.getRow(fila);
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
        fila++;

        h.filas.forEach((f, fi) => {
          const r = ws.getRow(fila);
          if (f.kind === 'sep' || f.kind === 'rec') {
            ws.mergeCells(fila, 1, fila, cols);
            const c = r.getCell(1);
            c.value = f.texto;
            c.font = { bold: true, size: 9, color: { argb: 'FF666666' } };
            c.alignment = { horizontal: 'center', vertical: 'middle' };
            if (f.kind === 'sep') c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
          } else {
            r.getCell(1).value = f.hora;
            r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            f.celdas.forEach((celda, i) => {
              const c = r.getCell(2 + i);
              if (h.cubiertas.has(`${fi}:${i}`)) return; // absorbida por el merge de arriba
              if (celda && celda.length > 0) {
                c.value = celda.map((x) => `${x.mat}\n${x.subs.join('\n')}`).join('\n— — —\n');
                c.alignment = { wrapText: true, vertical: 'middle' };
                const sp = h.spans.get(`${fi}:${i}`);
                if (sp && sp > 1) ws.mergeCells(fila, 2 + i, fila + sp - 1, 2 + i);
              } else {
                c.alignment = { vertical: 'middle' };
              }
            });
            r.height = 42;
          }
          for (let c = 1; c <= cols; c++) r.getCell(c).border = borde;
          fila++;
        });

        ws.pageSetup = {
          paperSize: 5,
          orientation: 'landscape',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
        } as ExcelJS.PageSetup;
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Horarios_${periodo ?? ''}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerando(false);
    }
  };

  // ------------------------- IMPRESIÓN -------------------------
  const imprimir = () => {
    if (hojas.length === 0) {
      alert('No hay nada seleccionado.');
      return;
    }
    const seccionesHtml = hojas
      .map((h) => {
        const encabezado = h.lineas.map((l) => `<div class="hline">${escapeHtml(l)}</div>`).join('');
        const filas = h.filas
          .map((f, fi) => {
            if (f.kind === 'sep')
              return `<tr><td colspan="${h.dias.length + 1}" class="sep">${escapeHtml(f.texto)}</td></tr>`;
            if (f.kind === 'rec')
              return `<tr><td colspan="${h.dias.length + 1}" class="receso">${escapeHtml(f.texto)}</td></tr>`;
            const tds = f.celdas
              .map((celda, di) => {
                if (h.cubiertas.has(`${fi}:${di}`)) return ''; // absorbida por rowspan
                const sp = h.spans.get(`${fi}:${di}`);
                const rs = sp && sp > 1 ? ` rowspan="${sp}"` : '';
                return celda && celda.length > 0
                  ? `<td${rs} class="clase">${celda
                      .map(
                        (x) =>
                          `<div class="mat">${escapeHtml(x.mat)}</div>` +
                          x.subs.map((s) => `<div class="sub">${escapeHtml(s)}</div>`).join('')
                      )
                      .join('<div class="cardsep"></div>')}</td>`
                  : `<td${rs}></td>`;
              })
              .join('');
            return `<tr><td class="hora">${escapeHtml(f.hora)}</td>${tds}</tr>`;
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
table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
th, td { border: 1px solid #000; padding: 3px 4px; font-size: 8pt; vertical-align: top; overflow-wrap: break-word; }
th:first-child { width: 64px; }
th { text-align: center; vertical-align: middle; font-weight: bold; }
td.hora { text-align: center; vertical-align: middle; font-size: 7.5pt; white-space: nowrap; }
td.receso { text-align: center; font-weight: bold; letter-spacing: 0.3em; color: #666; font-size: 7.5pt; }
td.sep { text-align: center; font-weight: bold; letter-spacing: 0.3em; background: #eee; font-size: 7.5pt; }
td.clase { vertical-align: middle; }
.mat { font-weight: bold; }
.sub { font-size: 7.5pt; color: #333; }
.cardsep { border-top: 1px dashed #999; margin: 3px 0; }
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

  // ---------- UI de selección ----------
  const grupoTitulo = (titulo: string, icono: React.ReactNode) => (
    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
      {icono} {titulo}
    </label>
  );

  const subGrupo = (
    lk: string,
    label: string,
    ids: (string | number)[],
    set: Set<string>,
    setSet: (s: Set<string>) => void,
    children: React.ReactNode
  ) => {
    if (ids.length === 0) {
      return (
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</div>
          <div className="text-[10px] text-slate-600 italic px-1 py-0.5">— sin opciones —</div>
        </div>
      );
    }
    const claves = ids.map((id) => `${lk}:${id}`);
    const marcadas = claves.filter((c) => set.has(c)).length;
    return (
      <div>
        <label className="flex items-center gap-2 px-1 py-0.5 cursor-pointer">
          <input
            type="checkbox"
            checked={marcadas === ids.length}
            ref={(el) => {
              if (el) el.indeterminate = marcadas > 0 && marcadas < ids.length;
            }}
            onChange={() => toggleGrupo(set, setSet, lk, ids)}
            className="accent-blue-500"
          />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {label} <span className="text-slate-600 normal-case">({marcadas}/{ids.length})</span>
          </span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 ml-5 mt-0.5">{children}</div>
      </div>
    );
  };

  const itemCheck = (
    clave: string,
    texto: string,
    set: Set<string>,
    setSet: (s: Set<string>) => void
  ) => (
    <label
      key={clave}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
        set.has(clave)
          ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
          : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
      }`}
    >
      <input
        type="checkbox"
        checked={set.has(clave)}
        onChange={() => toggle(set, setSet, clave)}
        className="accent-blue-500 shrink-0"
      />
      <span className="truncate" title={texto}>
        {texto}
      </span>
    </label>
  );

  // Grupo "Profesores": check de todos + buscador (nombre/apellido/cédula) con
  // botón Agregar. La lista de agregados son los profesores a imprimir; con
  // "todos" activo el buscador queda inactivo y la lista se oculta (redundante).
  const profGrupo = (lk: string, g: GrupoLapso) => {
    const ids = g.profesores.map((p) => p.id);
    const claves = ids.map((id) => `${lk}:${id}`);
    const marcadas = claves.filter((c) => selProf.has(c)).length;
    const todosMarcados = ids.length > 0 && marcadas === ids.length;
    const agregados = g.profesores.filter((p) => selProf.has(`${lk}:${p.id}`));
    const q = normNombre(profQuery.trim());
    const qNum = profQuery.trim().replace(/[^0-9]/g, '');
    const sugerencias = profQuery.trim()
      ? g.profesores
          .filter((p) => !selProf.has(`${lk}:${p.id}`))
          .filter(
            (p) =>
              normNombre(p.nombre).includes(q) ||
              (qNum.length > 0 && (p.cedula ?? '').replace(/\D/g, '').includes(qNum))
          )
          .slice(0, 8)
      : [];

    const agregar = (id: number) => {
      const n = new Set(selProf);
      n.add(`${lk}:${id}`);
      setSelProf(n);
      setProfQuery('');
    };
    const quitar = (id: number) => {
      const n = new Set(selProf);
      n.delete(`${lk}:${id}`);
      setSelProf(n);
    };

    if (ids.length === 0) {
      return <div className="text-[10px] text-slate-600 italic px-1 py-0.5">— sin profesores con materias asignadas —</div>;
    }

    return (
      <div>
        <label className="flex items-center gap-2 px-1 py-0.5 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={todosMarcados}
            ref={(el) => {
              if (el) el.indeterminate = marcadas > 0 && marcadas < ids.length;
            }}
            onChange={() => toggleGrupo(selProf, setSelProf, lk, ids)}
            className="accent-blue-500"
          />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Todos los profesores <span className="text-slate-600 normal-case">({marcadas}/{ids.length})</span>
          </span>
        </label>

        {todosMarcados ? (
          <p className="text-[10px] text-slate-600 italic px-1 pt-1.5">
            Se imprimirá la agenda de todos los profesores de este lapso.
          </p>
        ) : (
          <div className="mt-2">
            <div className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={profQuery}
                    onChange={(e) => setProfQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && sugerencias.length > 0) {
                        e.preventDefault();
                        agregar(sugerencias[0].id);
                      }
                    }}
                    placeholder="Buscar por nombre, apellido o cédula…"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={() => sugerencias.length > 0 && agregar(sugerencias[0].id)}
                  disabled={sugerencias.length === 0}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Agregar
                </button>
              </div>
              {sugerencias.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
                  {sugerencias.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => agregar(p.id)}
                      className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                    >
                      <span className="truncate">{p.nombre}</span>
                      {p.cedula && <span className="text-[10px] text-slate-500 shrink-0">C.I. {p.cedula}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {agregados.length > 0 ? (
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1 pr-1">
                {agregados.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/25 text-xs text-blue-200"
                  >
                    <span className="truncate">
                      {p.nombre}
                      {p.cedula && <span className="text-blue-300/60"> · C.I. {p.cedula}</span>}
                    </span>
                    <button
                      onClick={() => quitar(p.id)}
                      className="text-blue-300/70 hover:text-white shrink-0 cursor-pointer"
                      title="Quitar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-slate-600 italic px-1 pt-2">
                — sin profesores agregados —
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800 bg-slate-950 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-blue-400" /> Imprimir / exportar horarios
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Periodo {periodo ?? '—'} · Una hoja por cada elemento seleccionado.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {cargando && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando clases de todos los lapsos…
            </div>
          )}

          {/* Tabs por lapso — el badge indica cuántas hojas hay marcadas en cada uno */}
          {lapsos.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-5 p-1 bg-slate-950 border border-slate-800 rounded-xl w-fit">
              {lapsos.map((lk) => {
                const g = grupos.get(lk);
                if (!g) return null;
                const nSel =
                  g.secciones.filter((s) => selSec.has(`${lk}:${s.seccion_id}`)).length +
                  g.aulas.filter((a) => selAula.has(`${lk}:${a.id}`)).length +
                  g.profesores.filter((p) => selProf.has(`${lk}:${p.id}`)).length;
                const activo = lk === (lapsoTab || lapsos[0]);
                return (
                  <button
                    key={lk}
                    onClick={() => {
                      setLapsoTab(lk);
                      setProfQuery('');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      activo
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    {g.label}
                    {nSel > 0 && (
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          activo ? 'bg-white/20 text-white' : 'bg-blue-500/15 text-blue-300'
                        }`}
                      >
                        {nSel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {(() => {
            const lkActivo = lapsoTab || lapsos[0] || '';
            const g = grupos.get(lkActivo);
            if (!g) return null;
            return (
              <>
                {!soloProfesores && (
                  <div className="mb-4">
                    {grupoTitulo('Secciones', <CalendarClock className="w-3.5 h-3.5" />)}
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-56 overflow-y-auto">
                      {subGrupo(lkActivo, 'Todas las secciones', g.secciones.map((s) => s.seccion_id), selSec, setSelSec,
                        g.secciones.map((s) =>
                          itemCheck(`${lkActivo}:${s.seccion_id}`, `${s.seccion_nombre} · ${s.proyeccion_nombre} (${s.turno_nombre})`, selSec, setSelSec)
                        )
                      )}
                    </div>
                  </div>
                )}

                {!soloProfesores && (
                  <div className="mb-4">
                    {grupoTitulo('Aulas', <Building2 className="w-3.5 h-3.5" />)}
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-56 overflow-y-auto">
                      {subGrupo(lkActivo, 'Todas las aulas', g.aulas.map((a) => a.id), selAula, setSelAula,
                        g.aulas.map((a) => itemCheck(`${lkActivo}:${a.id}`, a.codigo, selAula, setSelAula))
                      )}
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  {grupoTitulo('Profesores', <Users className="w-3.5 h-3.5" />)}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                    {profGrupo(lkActivo, g)}
                  </div>
                </div>
              </>
            );
          })()}

          <label className="flex items-center gap-2 px-1 py-1 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={ocupReal}
              onChange={() => setOcupReal((v) => !v)}
              className="accent-emerald-500"
            />
            <span className="text-xs text-slate-300">
              Ocupación real: las agendas incluyen también las clases de lapsos superpuestos
              (p. ej. Semestre 1 incluye T1 y T2)
            </span>
          </label>
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-slate-500">
            {hojas.length} hoja{hojas.length === 1 ? '' : 's'} seleccionada{hojas.length === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={imprimir}
              disabled={generando || cargando}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <button
              onClick={generarExcel}
              disabled={generando || cargando}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" /> {generando ? 'Generando…' : 'Excel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
