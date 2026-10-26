import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragStartEvent,
  DragMoveEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { apiFetch, esVistaObsoleta } from '../../api/client.js';
import { usePnfColors } from '../../context/PnfColorContext.js';
import { MateriaAsignableRow } from '../AgregarMateriaModal.js';
import { ClaseCard } from './ClaseCard.js';
import {
  Aula,
  Bloque,
  HorarioEntry,
  HorarioConfig,
  SeccionRef,
  Turno,
  DIAS_NOMBRES,
  DIAS_CORTOS,
  fmtHora,
  fmtHoraCfg,
  formatearHorasEnTexto,
  traslapan,
  esRivalParcial,
  relacionLapsos,
  sortAulas,
  colorMateria,
  normMateria,
  ErrorClase,
} from './types.js';
import { Archive, Clock, Coffee, GripVertical, Layers, UserX, X } from 'lucide-react';
import { ConfirmModal } from '../ConfirmModal.js';

interface DragData {
  tipo: 'pendiente' | 'entry' | 'grupo' | 'grupo-pendiente';
  materia_id: number;
  seccion_id: number;
  profesor_id: number | null;
  titulo: string;
  subtitulo: string;
  entry_id?: number;
  entry_ids?: number[]; // 'grupo': run completo de horas seguidas, en orden
  horas?: number; // 'grupo-pendiente': horas restantes de la materia
}

// Tarjeta fantasma del ⇧+peek: una clase del profesor que pertenece a otra
// sección/lapso. Se dibuja UNA sola vez anclada en la celda de su primer
// bloque y se estira sobre las filas que cubre (como el rowspan de las
// tarjetas propias). `top`/`height` en rem (filas de alto fijo); `left`/
// `width` en % del ancho de la celda cuando varias se solapan (carriles).
interface FantasmaItem {
  entry: HorarioEntry; // primera entry del run (lleva los datos a mostrar)
  fin: string; // hora de fin efectiva del run fusionado
  top: number;
  height: number;
  left: number;
  width: number;
}

// Geometría fija de las filas de la grilla (ver <tr style height> abajo):
// 3.5rem por bloque de clase, 1.75rem por receso, 0.25rem de separación.
const FILA_H = 3.5;
const RECESO_H = 1.75;
const FILA_GAP = 0.25;



interface SeccionGridProps {
  seccion: SeccionRef;
  turno: Turno | null | undefined;
  materias: MateriaAsignableRow[];
  entries: HorarioEntry[];
  aulas: Aula[];
  config: HorarioConfig;
  trimestre: number;
  tipoProyeccion: string; // 'TRIMESTRAL' | 'SEMESTRAL'
  puedeEditar: boolean;
  forzar?: boolean; // permite guardar movimientos con conflictos por solape
  resaltar?: Set<string> | null; // claves 'bloque_id:dia' a resaltar (viene del panel de errores)
  enError?: Map<number, ErrorClase[]> | null; // entry_id → violaciones (punto rojo + tooltip)
  advertencias?: Map<number, string[]>; // entry.id → avisos (triángulo amarillo)
  avisosParciales?: Map<number, string[]>; // entry.id → choques parciales T2 (icono verde)
  onBeforeMutate?: () => void; // snapshot para deshacer (Ctrl+Z) antes de cada mutación
  onChanged: () => void;
  // Reporta cuándo el usuario está interactuando (arrastrando, con el menú
  // contextual abierto o con una mutación en vuelo): la página pausa el
  // poll de sincronización para que un refetch no rompa la interacción.
  onInteraccion?: (activa: boolean) => void;
}

export const SeccionGrid: React.FC<SeccionGridProps> = ({
  seccion,
  turno,
  materias,
  entries,
  aulas,
  config,
  trimestre,
  tipoProyeccion,
  puedeEditar,
  forzar,
  resaltar,
  enError,
  advertencias,
  avisosParciales,
  onBeforeMutate,
  onChanged,
  onInteraccion,
}) => {
  const [activo, setActivo] = useState<DragData | null>(null);
  const [dropPrev, setDropPrev] = useState<{ celdas: Set<string>; valida: boolean } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error' | 'warn'; msg: string } | null>(null);
  const [menuEntry, setMenuEntry] = useState<HorarioEntry | null>(null);
  // Mutaciones en vuelo dentro del grid (drop, desagendar, swap…): el
  // poll de sincronización se pausa mientras haya alguna para que su
  // refetch no pise la escritura que está volando.
  const [mutando, setMutando] = useState(0);
  const mutar = async <T,>(p: Promise<T>): Promise<T> => {
    setMutando((c) => c + 1);
    try {
      return await p;
    } finally {
      setMutando((c) => c - 1);
    }
  };
  const [confirmarTodoOpen, setConfirmarTodoOpen] = useState(false);
  useEffect(() => {
    onInteraccion?.(activo !== null || menuEntry !== null || confirmarTodoOpen || mutando > 0);
  }, [activo, menuEntry, confirmarTodoOpen, mutando, onInteraccion]);
  // ⇧+hover sobre una materia: filtra el horario de ese profesor — atenúa
  // las demás materias y dibuja tarjetas fantasma con las clases que ya
  // tiene (en cualquier sección de la proyección), para ubicarlas sin
  // cambiar de vista. También funciona mientras se arrastra.
  const [shiftOn, setShiftOn] = useState(false);
  const [profeHover, setProfeHover] = useState<number | null>(null);
  // Ctrl+hover sobre una celda vacía: tooltip con las aulas libres de ese
  // bloque (las del PNF de la sección primero).
  const [ctrlOn, setCtrlOn] = useState(false);
  const [celdaHover, setCeldaHover] = useState<{
    dia: number;
    tramos: Bloque[]; // bloques que cubre la celda (1 o las de un span)
    aulaActual?: string; // aula de la clase que tapa la celda, si hay una
    x: number;
    y: number;
  } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const usa12 = !!config.formato_12h; // vista 12h; la BD siempre guarda 24h

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftOn(true);
      if (e.key === 'Control') setCtrlOn(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftOn(false);
      if (e.key === 'Control') setCtrlOn(false);
    };
    const off = () => {
      setShiftOn(false);
      setCtrlOn(false);
      setProfeHover(null);
      setCeldaHover(null);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', off);
    };
  }, []);

  const profePeek = shiftOn ? (activo?.profesor_id ?? profeHover) : null;

  const bloques = useMemo(() => turno?.bloques ?? [], [turno]);
  const dias = useMemo(
    () => (turno?.dias_semana ?? '').split(',').map(Number).filter(Boolean).sort(),
    [turno]
  );
  const aulasActivas = useMemo(() => aulas.filter((a) => a.activa), [aulas]);

  // Entries de la sección actual indexados por celda
  const porCelda = useMemo(() => {
    const map = new Map<string, HorarioEntry>();
    for (const e of entries) {
      if (e.seccion_id === seccion.seccion_id) map.set(`${e.bloque_id}:${e.dia_semana}`, e);
    }
    return map;
  }, [entries, seccion.seccion_id]);

  // Clases agendadas del horario visible (entries ya viene acotada al lapso:
  // tipo + trimestre + período; la sección determina su PNF y turno).
  const entriesSeccion = useMemo(
    () => entries.filter((e) => e.seccion_id === seccion.seccion_id),
    [entries, seccion.seccion_id]
  );

  // Runs verticales por día: bloques consecutivos (sin receso de por medio) de la
  // misma materia+aula se fusionan en una sola celda (rowSpan).
  const { spans, cubiertas } = useMemo(() => {
    const spans = new Map<string, { n: number; fin: string }>();
    const cubiertas = new Set<string>();
    for (const d of dias) {
      let i = 0;
      while (i < bloques.length) {
        const b = bloques[i];
        if (b.es_receso) {
          i++;
          continue;
        }
        const e = porCelda.get(`${b.id}:${d}`);
        if (!e) {
          i++;
          continue;
        }
        let n = 1;
        let fin = b.hora_fin;
        let j = i + 1;
        while (j < bloques.length && !bloques[j].es_receso) {
          const nxt = porCelda.get(`${bloques[j].id}:${d}`);
          if (nxt && nxt.materia_id === e.materia_id && nxt.aula_id === e.aula_id) {
            n++;
            fin = bloques[j].hora_fin;
            cubiertas.add(`${bloques[j].id}:${d}`);
            j++;
          } else break;
        }
        spans.set(`${b.id}:${d}`, { n, fin });
        i = j;
      }
    }
    return { spans, cubiertas };
  }, [bloques, dias, porCelda]);

  // Run contiguo (sin receso) de la clase del menú: los mismos bloques que
  // cambia de aula el endpoint aula-grupo (misma materia, sección y
  // profesor, ese día).
  const runMenu = useMemo(() => {
    if (!menuEntry) return [] as HorarioEntry[];
    const ordenados = bloques.filter((b) => !b.es_receso);
    const idx = ordenados.findIndex((b) => b.id === menuEntry.bloque_id);
    if (idx < 0) return [menuEntry];
    const same = (x: HorarioEntry | undefined): x is HorarioEntry =>
      !!x &&
      x.materia_id === menuEntry.materia_id &&
      x.seccion_id === menuEntry.seccion_id &&
      (x.profesor_id ?? null) === (menuEntry.profesor_id ?? null);
    const run: HorarioEntry[] = [menuEntry];
    for (let i = idx - 1; i >= 0; i--) {
      const x = porCelda.get(`${ordenados[i].id}:${menuEntry.dia_semana}`);
      if (!same(x)) break;
      run.unshift(x);
    }
    for (let i = idx + 1; i < ordenados.length; i++) {
      const x = porCelda.get(`${ordenados[i].id}:${menuEntry.dia_semana}`);
      if (!same(x)) break;
      run.push(x);
    }
    return run;
  }, [menuEntry, bloques, porCelda]);

  // ¿El aula está ocupada (por algo fuera del run) en algún bloque del run?
  // Los rivales parciales (T2↔semestre) no ocupan: se permiten y solo se avisan.
  const aulaOcupadaEnRun = (aulaIdCk: number) => {
    const runIds = new Set(runMenu.map((r) => r.id));
    return entries.some(
      (o) =>
        o.aula_id === aulaIdCk &&
        !esRivalParcial(tipoProyeccion, trimestre, o) &&
        !runIds.has(o.id) &&
        runMenu.some(
          (r) =>
            o.dia_semana === r.dia_semana &&
            traslapan(r.hora_inicio, r.hora_fin, o.hora_inicio, o.hora_fin)
        )
    );
  };

  // Progreso por materia: horas agendadas vs horas semanales
  const progreso = useMemo(() => {
    const map = new Map<number, { total: number; puestas: number; row: MateriaAsignableRow }>();
    for (const m of materias) {
      map.set(m.materia_id, { total: m.horas_semanales, puestas: 0, row: m });
    }
    for (const e of entries) {
      if (e.seccion_id !== seccion.seccion_id) continue;
      const p = map.get(e.materia_id);
      if (p) p.puestas++;
    }
    return map;
  }, [materias, entries, seccion.seccion_id]);

  const pendientes = useMemo(
    () => [...progreso.values()].filter((p) => p.total - p.puestas !== 0),
    [progreso]
  );

  // Bloques ocupados por el profesor en "peek" (⇧+hover): celda
  // `bloque_id:dia` → clases suyas que traslapan en hora. Se compara por
  // rango horario (no por bloque_id) porque el docente puede tener clases
  // en turnos con bloques distintos. Los lapsos sin relación temporal
  // (p. ej. T1 vs T3) no cuentan: el profesor no coincide con ellos.
  const ocupadoProfe = useMemo(() => {
    if (!profePeek) return null;
    const map = new Map<string, HorarioEntry[]>();
    const lapsoVisto = { tipo_proyeccion: tipoProyeccion, trimestre };
    for (const e of entries) {
      if (e.profesor_id !== profePeek) continue;
      if (!dias.includes(e.dia_semana)) continue;
      if (relacionLapsos(lapsoVisto, e) === 'ninguna') continue;
      for (const b of bloques) {
        if (b.es_receso) continue;
        if (!traslapan(b.hora_inicio, b.hora_fin, e.hora_inicio, e.hora_fin)) continue;
        const k = `${b.id}:${e.dia_semana}`;
        const arr = map.get(k);
        if (arr) arr.push(e);
        else map.set(k, [e]);
      }
    }
    return map;
  }, [profePeek, entries, bloques, dias, tipoProyeccion, trimestre]);

  // ⇧+peek: geometría de las tarjetas fantasma, indexada por la celda donde
  // se ancla cada una (`bloque_id:dia` de la celda renderizada que contiene
  // su primer bloque). Las clases de la propia sección no generan fantasma:
  // ya se ven con su ClaseCard normal. Si varias fantasmas se solapan en el
  // mismo día reparten el ancho en carriles (el más bajo libre a su inicio).
  const fantasmasPorCelda = useMemo(() => {
    if (!ocupadoProfe) return null;
    const altoFila = (i: number) => (bloques[i].es_receso ? RECESO_H : FILA_H);
    const rowTop: number[] = [];
    let acc = 0;
    for (let i = 0; i < bloques.length; i++) {
      rowTop[i] = acc;
      acc += altoFila(i) + FILA_GAP;
    }
    const porDia = new Map<
      number,
      { e: HorarioEntry; gf: number; gl: number; fin: string }[]
    >();
    const vistos = new Set<number>();
    for (const arr of ocupadoProfe.values()) {
      for (const e of arr) {
        if (vistos.has(e.id)) continue;
        vistos.add(e.id);
        if (e.seccion_id === seccion.seccion_id) continue;
        let gf = -1;
        let gl = -1;
        bloques.forEach((b, i) => {
          if (b.es_receso) return;
          if (traslapan(b.hora_inicio, b.hora_fin, e.hora_inicio, e.hora_fin)) {
            if (gf < 0) gf = i;
            gl = i;
          }
        });
        if (gf < 0) continue;
        const lst = porDia.get(e.dia_semana) ?? [];
        lst.push({ e, gf, gl, fin: e.hora_fin });
        porDia.set(e.dia_semana, lst);
      }
    }
    const out = new Map<string, FantasmaItem[]>();
    for (const [dia, crudo] of porDia) {
      // Runs consecutivos (sin receso de por medio) de la misma
      // materia+aula+sección se fusionan en una sola tarjeta, igual que el
      // rowSpan de las tarjetas reales (cada hora es una entry aparte).
      const grupos = new Map<string, typeof crudo>();
      for (const it of crudo) {
        const k = `${it.e.seccion_id}:${it.e.materia_id}:${it.e.aula_id}`;
        const l = grupos.get(k) ?? [];
        l.push(it);
        grupos.set(k, l);
      }
      const items: typeof crudo = [];
      for (const l of grupos.values()) {
        l.sort((a, b) => a.gf - b.gf);
        let prev: (typeof crudo)[number] | null = null;
        for (const it of l) {
          if (prev && it.gf === prev.gl + 1) {
            prev.gl = it.gl;
            prev.fin = it.fin;
          } else {
            prev = { ...it };
            items.push(prev);
          }
        }
      }
      items.sort((a, b) => a.gf - b.gf || b.gl - a.gl);
      const finCarril: number[] = [];
      const carril = items.map((it) => {
        let c = finCarril.findIndex((f) => f < it.gf);
        if (c < 0) {
          c = finCarril.length;
          finCarril.push(0);
        }
        finCarril[c] = it.gl;
        return c;
      });
      // Clusters de solape vertical: el ancho se reparte entre los carriles
      // que llegan a tocarse dentro del cluster.
      let i = 0;
      while (i < items.length) {
        let j = i;
        let fin = items[i].gl;
        while (j + 1 < items.length && items[j + 1].gf <= fin) {
          j++;
          fin = Math.max(fin, items[j].gl);
        }
        const carriles = Math.max(...carril.slice(i, j + 1)) + 1;
        for (let k = i; k <= j; k++) {
          const it = items[k];
          let c = it.gf;
          while (cubiertas.has(`${bloques[c].id}:${dia}`)) c--;
          const item: FantasmaItem = {
            entry: it.e,
            fin: it.fin,
            top: rowTop[it.gf] - rowTop[c],
            height: rowTop[it.gl] + altoFila(it.gl) - rowTop[it.gf],
            left: (carril[k] * 100) / carriles,
            width: 100 / carriles,
          };
          const akey = `${bloques[c].id}:${dia}`;
          const l = out.get(akey) ?? [];
          l.push(item);
          out.set(akey, l);
        }
        i = j + 1;
      }
    }
    return out;
  }, [ocupadoProfe, bloques, cubiertas, seccion.seccion_id]);

  const profePeekNombre = useMemo(() => {
    if (!profePeek) return '';
    const src =
      materias.find((x) => x.profesor_id === profePeek) ??
      entries.find((x) => x.profesor_id === profePeek);
    return src ? `${src.prof_apellidos ?? ''} ${src.prof_nombres ?? ''}`.trim() : '';
  }, [profePeek, materias, entries]);

  // Ctrl+hover sobre celda vacía: aulas libres en TODOS los tramos que
  // cubre la celda (en un span fusionado el aula debe estar libre en cada
  // sub-bloque). Las aulas del PNF de la sección van primero.
  const aulasLibresHover = useMemo(() => {
    if (!ctrlOn || !celdaHover || activo) return null;
    const ocup = new Set<number>();
    for (const e of entries) {
      if (esRivalParcial(tipoProyeccion, trimestre, e)) continue;
      if (e.dia_semana !== celdaHover.dia) continue;
      if (
        celdaHover.tramos.some((b) =>
          traslapan(b.hora_inicio, b.hora_fin, e.hora_inicio, e.hora_fin)
        )
      ) {
        ocup.add(e.aula_id);
      }
    }
    const pnf = seccion.pnf_saga_id ?? null;
    const libres = sortAulas(aulasActivas.filter((a) => !ocup.has(a.id))).sort(
      (a, b) =>
        Number(pnf != null && b.pnf_saga_id === pnf) -
        Number(pnf != null && a.pnf_saga_id === pnf)
    );
    return { libres, ocupadas: ocup.size };
  }, [ctrlOn, celdaHover, activo, entries, aulasActivas, tipoProyeccion, trimestre, seccion.pnf_saga_id]);

  // Advertencias (triángulo amarillo) de una celda: union de las de todo el run
  const advertenciasDe = (run: HorarioEntry[], entry?: HorarioEntry) => {
    const lista = run.length > 0 ? run : entry ? [entry] : [];
    return [...new Set(lista.flatMap((r) => advertencias?.get(r.id) ?? []))];
  };

  // Choques parciales T2 (icono verde) de una celda: unión de los del run
  const avisosParcialesDe = (run: HorarioEntry[], entry?: HorarioEntry) => {
    const lista = run.length > 0 ? run : entry ? [entry] : [];
    return [...new Set(lista.flatMap((r) => avisosParciales?.get(r.id) ?? []))];
  };

  const mostrarAviso = (msg: string, tipo: 'ok' | 'error' | 'warn' = 'ok') => {
    setAviso({ tipo, msg });
    window.setTimeout(() => setAviso((a) => (a?.msg === msg ? null : a)), 6000);
  };

  // Reglas de generación (min/max) evaluadas como advertencia tras un drop manual:
  // devuelve el mensaje de advertencia o null si no se viola ninguna regla.
  const evaluarReglas = (bloque: Bloque, dia: number, drag: DragData): string | null => {
    const min = config.min_horas_bloque;
    const max = config.max_horas_dia;
    // Órdenes de bloques no-receso ocupados por esa materia ese día
    // (excluyendo la entry que se está moviendo), + la celda destino.
    const ocup = new Set<number>();
    for (const b of bloques) {
      if (b.es_receso) continue;
      const e = porCelda.get(`${b.id}:${dia}`);
      if (e && e.materia_id === drag.materia_id && e.id !== drag.entry_id) ocup.add(b.orden);
    }
    ocup.add(bloque.orden);
    // Run consecutivo (por orden, sin receso intermedio) que contiene el nuevo bloque
    let a = bloque.orden;
    while (ocup.has(a - 1)) a--;
    let z = bloque.orden;
    while (ocup.has(z + 1)) z++;
    const runLen = z - a + 1;
    const totalDia = ocup.size;
    const diaNombre = DIAS_NOMBRES[dia];
    if (totalDia > max) {
      return `⚠ Regla de horarios: '${drag.titulo}' queda con ${totalDia}h el ${diaNombre} (máximo ${max}h por día).`;
    }
    if (runLen < min) {
      return `⚠ Regla de horarios: quedó una sesión suelta de ${runLen}h de '${drag.titulo}' el ${diaNombre} (mínimo ${min}h seguidas).`;
    }
    return null;
  };

  // Aulas ocupadas en un slot (día + rango horario) por clases de cualquier
  // sección/lapso rival de traslape total. Las clases de lapsos parciales
  // (T2↔semestre) NO bloquean el aula: se permiten y se marcan con el icono verde.
  const aulasOcupadasEn = (dia: number, inicio: string, fin: string, excluir?: number): Set<number> => {
    const ocup = new Set<number>();
    for (const e of entries) {
      if (excluir && e.id === excluir) continue;
      if (esRivalParcial(tipoProyeccion, trimestre, e)) continue;
      if (e.dia_semana !== dia) continue;
      if (traslapan(inicio, fin, e.hora_inicio, e.hora_fin)) ocup.add(e.aula_id);
    }
    return ocup;
  };

  // Mensajes de error de esta tarjeta (incluye las celdas que absorbe por
  // rowspan): se buscan por entry_id, no por celda — los bloque_id se repiten
  // entre secciones del mismo turno.
  const celdaEnError = (bloqueIdx: number, dia: number, n: number): ErrorClase[] => {
    if (!enError) return [];
    const msgs: ErrorClase[] = [];
    for (const e of runEntriesDe(bloqueIdx, dia, n)) {
      for (const t of enError.get(e.id) ?? []) {
        if (!msgs.some((m) => m.titulo === t.titulo && m.texto === t.texto)) msgs.push(t);
      }
    }
    return msgs;
  };

  // Entries del run que empieza en (bloqueIdx, dia): las n clases seguidas de
  // la misma materia que la tarjeta fusionada representa.
  const runEntriesDe = (bloqueIdx: number, dia: number, n: number): HorarioEntry[] => {
    const out: HorarioEntry[] = [];
    for (let i = bloqueIdx; i < bloques.length && out.length < n; i++) {
      if (bloques[i].es_receso) break;
      const e = porCelda.get(`${bloques[i].id}:${dia}`);
      if (e) out.push(e);
    }
    return out;
  };

  // ¿Es válido soltar el drag en esta celda?
  const celdaValida = (bloque: Bloque, dia: number, drag: DragData): boolean => {
    if (bloque.es_receso) return false;
    // Un grupo (bloque de varias horas) cabe si hay n bloques seguidos sin
    // receso desde aquí; las celdas ocupadas las reubica el backend.
    if (drag.tipo === 'grupo') {
      const n = drag.entry_ids?.length ?? 0;
      if (n === 0) return false;
      const bIdx = bloques.findIndex((x) => x.id === bloque.id);
      const tramos = bIdx < 0 ? [] : bloques.slice(bIdx, bIdx + n);
      return tramos.length === n && tramos.every((x) => !x.es_receso);
    }
    // Grupo pendiente: cabe si hay n bloques seguidos sin receso y libres
    if (drag.tipo === 'grupo-pendiente') {
      const n = drag.horas ?? 0;
      if (n === 0) return false;
      const bIdx = bloques.findIndex((x) => x.id === bloque.id);
      const tramos = bIdx < 0 ? [] : bloques.slice(bIdx, bIdx + n);
      return (
        tramos.length === n &&
        tramos.every((x) => !x.es_receso && !porCelda.has(`${x.id}:${dia}`))
      );
    }
    const ocupada = porCelda.get(`${bloque.id}:${dia}`);
    // Celda ocupada por otra clase: solo es destino válido para intercambio
    // (arrastrar una clase agendada sobre otra las intercambia de lugar)
    if (ocupada && ocupada.id !== drag.entry_id) return drag.tipo === 'entry';
    // Modo forzado: se permiten solapes de profesor/sección/aula; el
    // conflicto queda guardado y la auditoría lo marca con el punto rojo.
    if (forzar) return true;
    const excl = drag.entry_id;
    for (const e of entries) {
      if (excl && e.id === excl) continue;
      if (esRivalParcial(tipoProyeccion, trimestre, e)) continue;
      if (e.dia_semana !== dia) continue;
      if (!traslapan(bloque.hora_inicio, bloque.hora_fin, e.hora_inicio, e.hora_fin)) continue;
      if (drag.profesor_id && e.profesor_id === drag.profesor_id) return false;
      if (e.seccion_id === drag.seccion_id) return false;
    }
    return aulasOcupadasEn(dia, bloque.hora_inicio, bloque.hora_fin, excl).size < aulasActivas.length;
  };

  const handleDropEnCelda = async (bloque: Bloque, dia: number, drag: DragData) => {
    // Grupo pendiente: agendar todas las horas restantes de la materia en bloque
    if (drag.tipo === 'grupo-pendiente') {
      onBeforeMutate?.();
      const res = await mutar(apiFetch('/horarios/entries/schedule-group', {
        method: 'POST',
        etiqueta: 'Agendando el bloque…',
        body: JSON.stringify({
          materia_id: drag.materia_id,
          seccion_id: drag.seccion_id,
          trimestre,
          dia_semana: dia,
          bloque_id: bloque.id,
        }),
      }));
      if (res.success) {
        mostrarAviso(res.message || 'Bloque agendado.', 'ok');
        onChanged();
      } else {
        mostrarAviso(res.message || 'No se pudo agendar el bloque.', 'error');
        if (esVistaObsoleta(res)) onChanged();
      }
      return;
    }
    // Grupo: mover el run completo a partir de esta celda
    if (drag.tipo === 'grupo' && drag.entry_ids?.length) {
      onBeforeMutate?.();
      const res = await mutar(apiFetch('/horarios/entries/move-group', {
        method: 'POST',
        etiqueta: 'Moviendo el bloque…',
        body: JSON.stringify({
          entry_ids: drag.entry_ids,
          dia_semana: dia,
          bloque_id: bloque.id,
          forzar: !!forzar,
        }),
      }));
      if (res.success) {
        mostrarAviso(res.message || 'Bloque movido.', 'ok');
        onChanged();
      } else {
        mostrarAviso(res.message || 'No se pudo mover el bloque.', 'error');
        if (esVistaObsoleta(res)) onChanged();
      }
      return;
    }
    // Soltar una clase sobre otra ocupada = intercambio de día/bloque/aula
    // (cada una conserva su profesor y demás datos)
    const destino = porCelda.get(`${bloque.id}:${dia}`);
    if (destino && destino.id !== drag.entry_id) {
      if (drag.tipo !== 'entry' || !drag.entry_id) return;
      onBeforeMutate?.();
      const res = await mutar(apiFetch('/horarios/entries/swap', {
        method: 'POST',
        etiqueta: 'Intercambiando clases…',
        body: JSON.stringify({
          entry_id_a: drag.entry_id,
          entry_id_b: destino.id,
          forzar: !!forzar,
        }),
      }));
      if (res.success) {
        mostrarAviso(`Intercambio: '${drag.titulo}' ↔ '${destino.materia_nombre}'.`, 'ok');
        onChanged();
      } else {
        mostrarAviso(res.message || 'No se pudo intercambiar las clases.', 'error');
        if (esVistaObsoleta(res)) onChanged();
      }
      return;
    }
    onBeforeMutate?.();
    const res = await mutar(apiFetch('/horarios/entries', {
      method: 'PUT',
      etiqueta: 'Agendando la clase…',
      body: JSON.stringify({
        entry_id: drag.entry_id,
        materia_id: drag.materia_id,
        seccion_id: drag.seccion_id,
        trimestre,
        dia_semana: dia,
        bloque_id: bloque.id,
        forzar: !!forzar,
      }),
    }));
    if (res.success) {
      const regla = evaluarReglas(bloque, dia, drag);
      mostrarAviso(regla ?? 'Clase agendada.', regla ? 'warn' : 'ok');
      onChanged();
    } else {
      mostrarAviso(res.message || 'No se pudo agendar.', 'error');
      if (esVistaObsoleta(res)) onChanged();
    }
  };

  const handleDesagendar = async (entryId: number) => {
    onBeforeMutate?.();
    const res = await mutar(apiFetch(`/horarios/entries/${entryId}`, { method: 'DELETE', etiqueta: 'Quitando la clase…' }));
    if (res.success) {
      mostrarAviso('Clase desagendada.');
      setMenuEntry(null);
      onChanged();
    } else {
      mostrarAviso(res.message || 'No se pudo quitar.', 'error');
      if (esVistaObsoleta(res)) onChanged();
    }
  };

  // Desagendar un bloque completo (varias horas) arrastrado a pendientes
  const handleDesagendarGrupo = async (ids: number[]) => {
    onBeforeMutate?.();
    const res = await mutar(apiFetch('/horarios/entries/unschedule', {
      method: 'POST',
      etiqueta: 'Desagendando el bloque…',
      body: JSON.stringify({ entry_ids: ids }),
    }));
    if (res.success) {
      mostrarAviso(res.message || 'Clases desagendadas.');
      onChanged();
    } else {
      mostrarAviso(res.message || 'No se pudieron desagendar las clases.', 'error');
      if (esVistaObsoleta(res)) onChanged();
    }
  };

  // Guardar TODO el horario visible en el depósito: desagenda todas las
  // clases de la sección; quedan como horas pendientes de cada materia.
  const handleDesagendarTodo = async () => {
    const ids = entriesSeccion.map((e) => e.id);
    if (ids.length === 0) {
      setConfirmarTodoOpen(false);
      return;
    }
    onBeforeMutate?.();
    const res = await mutar(apiFetch('/horarios/entries/unschedule', {
      method: 'POST',
      etiqueta: 'Guardando el horario en pendientes…',
      body: JSON.stringify({ entry_ids: ids }),
    }));
    if (res.success) {
      mostrarAviso(res.message || 'Horario guardado en materias pendientes.');
      setConfirmarTodoOpen(false);
      onChanged();
    } else {
      mostrarAviso(res.message || 'No se pudo guardar el horario.', 'error');
      setConfirmarTodoOpen(false);
      if (esVistaObsoleta(res)) onChanged();
    }
  };

  // Cambia el aula de todo el bloque fusionado (run contiguo de la misma
  // materia+sección+profesor ese día); con `forzar` admite aulas ocupadas.
  const handleCambiarAula = async (entry: HorarioEntry, aulaId: number) => {
    onBeforeMutate?.();
    const res = await mutar(apiFetch('/horarios/entries/aula-grupo', {
      method: 'POST',
      etiqueta: 'Cambiando el aula…',
      body: JSON.stringify({
        entry_id: entry.id,
        aula_id: aulaId,
        forzar,
      }),
    }));
    if (res.success) {
      mostrarAviso(res.message || 'Aula actualizada.');
      setMenuEntry(null);
      onChanged();
    } else {
      mostrarAviso(res.message || 'No se pudo cambiar el aula.', 'error');
      if (esVistaObsoleta(res)) onChanged();
    }
  };

  // En una celda fusionada (rowSpan) las filas cubiertas no tienen celda
  // propia: el droppable siempre reporta el primer bloque. Con la posición
  // vertical del puntero (o el centro del overlay si no hay puntero) se
  // calcula en qué sub-fila cayó el drop.
  const subFilaEnCelda = (ev: DragMoveEvent | DragEndEvent, span: number): number => {
    if (span <= 1 || !ev.over) return 0;
    const rect = ev.over.rect;
    const act = ev.activatorEvent as Partial<PointerEvent>;
    const translated = ev.active.rect.current.translated;
    const py =
      typeof act.clientY === 'number'
        ? act.clientY + ev.delta.y
        : translated
          ? translated.top + translated.height / 2
          : null;
    if (py === null || rect.height <= 0) return 0;
    return Math.min(span - 1, Math.max(0, Math.floor(((py - rect.top) / rect.height) * span)));
  };

  // Para drags de grupo, si el bloque no cabe empezando en la fila soltada
  // se intenta que el grupo termine cubriéndola.
  const bloqueParaDrop = (bloqueIds: number[], sub: number, drag: DragData): Bloque | null => {
    const bIdx = bloques.findIndex((x) => x.id === bloqueIds[sub]);
    if (bIdx < 0) return null;
    if (drag.tipo !== 'grupo') return bloques[bIdx];
    const n = drag.entry_ids?.length ?? 0;
    for (let s = bIdx; s >= 0 && s > bIdx - n; s--) {
      const tramos = bloques.slice(s, s + n);
      if (tramos.length === n && tramos.every((x) => !x.es_receso)) return bloques[s];
    }
    return bloques[bIdx]; // sin cabida: que responda la validación normal
  };

  // Bloque destino real del drag sobre una celda (posiblemente fusionada)
  const destinoDeDrop = (
    ev: DragMoveEvent | DragEndEvent,
    drag: DragData
  ): { bloque: Bloque; dia: number } | null => {
    const over = ev.over;
    if (!over || !String(over.id).startsWith('cell:')) return null;
    const [, bloqueId, diaStr] = String(over.id).split(':');
    const bloqueIds =
      (over.data.current as { bloqueIds?: number[] } | undefined)?.bloqueIds ?? [Number(bloqueId)];
    const bloque = bloqueParaDrop(bloqueIds, subFilaEnCelda(ev, bloqueIds.length), drag);
    return bloque ? { bloque, dia: Number(diaStr) } : null;
  };

  const onDragStart = (ev: DragStartEvent) => setActivo(ev.active.data.current as DragData);

  // Preview del destino: resalta las filas que ocuparía la clase al soltar
  const onDragMove = (ev: DragMoveEvent) => {
    const drag = ev.active.data.current as DragData | undefined;
    const dest = drag ? destinoDeDrop(ev, drag) : null;
    if (!drag || !dest) {
      setDropPrev(null);
      return;
    }
    const n =
      drag.tipo === 'grupo'
        ? (drag.entry_ids?.length ?? 1)
        : drag.tipo === 'grupo-pendiente'
          ? (drag.horas ?? 1)
          : 1;
    const bIdx = bloques.findIndex((b) => b.id === dest.bloque.id);
    const celdas = new Set<string>();
    for (let i = bIdx; i >= 0 && i < bIdx + n && i < bloques.length; i++) {
      if (bloques[i].es_receso) break;
      celdas.add(`${bloques[i].id}:${dest.dia}`);
    }
    setDropPrev({ celdas, valida: celdaValida(dest.bloque, dest.dia, drag) });
  };

  const onDragEnd = async (ev: DragEndEvent) => {
    const drag = ev.active.data.current as DragData;
    setActivo(null);
    setDropPrev(null);
    const over = ev.over?.id as string | undefined;
    if (!over || !drag) return;
    if (over === 'pendientes') {
      if (drag.tipo === 'grupo' && drag.entry_ids?.length) {
        await handleDesagendarGrupo(drag.entry_ids);
      } else if (drag.entry_id) {
        await handleDesagendar(drag.entry_id);
      }
      return;
    }
    if (over.startsWith('cell:')) {
      const dest = destinoDeDrop(ev, drag);
      if (!dest) return;
      if (!celdaValida(dest.bloque, dest.dia, drag)) {
        mostrarAviso('Esa celda no es válida para la clase (ocupada, receso o sin aula libre).', 'error');
        return;
      }
      await handleDropEnCelda(dest.bloque, dest.dia, drag);
    }
  };

  if (!turno) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-sm">
        El turno <span className="text-amber-400 font-semibold">'{seccion.turno_nombre}'</span> de esta
        sección no está configurado. Ve a <span className="text-white font-semibold">Turnos y Bloques</span>{' '}
        para definir sus días y horas de clase.
      </div>
    );
  }
  if (bloques.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-sm">
        El turno <span className="text-amber-400 font-semibold">'{turno.nombre}'</span> no tiene bloques
        horarios. Configúralos en <span className="text-white font-semibold">Turnos y Bloques</span>.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActivo(null);
        setDropPrev(null);
      }}
    >
      {aviso && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-md px-4 py-2.5 rounded-xl text-xs font-semibold border shadow-2xl shadow-black/50 backdrop-blur-sm whitespace-pre-line transition-all ${
            aviso.tipo === 'error'
              ? 'bg-red-950/90 border-red-500/40 text-red-300'
              : aviso.tipo === 'warn'
                ? 'bg-amber-950/90 border-amber-500/40 text-amber-300'
                : 'bg-emerald-950/90 border-emerald-500/40 text-emerald-300'
          }`}
        >
          {(() => {
            const msg = formatearHorasEnTexto(aviso.msg, usa12);
            return msg.includes('\n') ? (
              <>
                <div className="text-[13px] font-bold mb-0.5">{msg.split('\n')[0]}</div>
                <div className="font-medium">{msg.split('\n').slice(1).join('\n')}</div>
              </>
            ) : (
              msg
            );
          })()}
        </div>
      )}

      {profePeek && (
        <div className="fixed bottom-6 left-6 z-50 max-w-xs px-4 py-2.5 rounded-xl bg-amber-950/90 border border-amber-500/40 text-amber-300 text-xs font-semibold shadow-2xl shadow-black/50 backdrop-blur-sm">
          ⇧{' '}
          {profePeekNombre
            ? `Clases de ${profePeekNombre}`
            : 'Clases de este profesor'}
        </div>
      )}

      {/* Ctrl+hover sobre celda vacía: aulas libres de ese bloque */}
      {celdaHover && aulasLibresHover && (
        <div
          className="fixed z-[60] w-64 max-w-[80vw] rounded-xl bg-slate-900/95 border border-slate-700 shadow-2xl shadow-black/50 p-3 pointer-events-none"
          style={{
            left: Math.min(celdaHover.x + 14, window.innerWidth - 270),
            top: Math.min(celdaHover.y + 14, window.innerHeight - 200),
          }}
        >
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">
            Aulas libres · {DIAS_CORTOS[celdaHover.dia]}{' '}
            {fmtHoraCfg(celdaHover.tramos[0].hora_inicio, usa12)}
            {celdaHover.aulaActual && (
              <span className="normal-case font-medium text-slate-400">
                {' '}· actual: {celdaHover.aulaActual}
              </span>
            )}
          </p>
          {aulasLibresHover.libres.length === 0 ? (
            <p className="text-xs text-red-300">
              Sin aulas libres en este bloque
              {aulasLibresHover.ocupadas > 0 ? ` (${aulasLibresHover.ocupadas} ocupadas)` : ''}.
            </p>
          ) : (
            <>
              <ul className="space-y-1">
                {aulasLibresHover.libres.slice(0, 5).map((a) => {
                  const esPnf =
                    seccion.pnf_saga_id != null && a.pnf_saga_id === seccion.pnf_saga_id;
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className={`truncate ${esPnf ? 'text-purple-200 font-semibold' : 'text-slate-200'}`}>
                        {a.nombre}
                      </span>
                      {esPnf && (
                        <span className="px-1.5 py-0.5 rounded border text-[9px] font-semibold text-purple-300 bg-purple-500/10 border-purple-500/30 shrink-0">
                          PNF
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {aulasLibresHover.libres.length > 5 && (
                <p className="text-[10px] text-slate-500 mt-1.5">
                  +{aulasLibresHover.libres.length - 5} más…
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Panel de materias pendientes (droppable para desagendar) */}
        <PendientesPanel
          pendientes={pendientes}
          puedeEditar={puedeEditar}
          clasesAgendadas={entriesSeccion.length}
          onGuardarTodo={() => setConfirmarTodoOpen(true)}
          onHoverProfe={setProfeHover}
          profePeekId={profePeek}
        />

        {/* Grilla días × bloques */}
        <div className="flex-1 min-w-0 overflow-x-auto bg-slate-900 border border-slate-800 rounded-2xl p-3">
          <table className="w-full table-fixed border-separate border-spacing-1 min-w-[640px]">
            <thead>
              <tr>
                <th className="w-24 pb-1">
                  <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-800/80 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                    {turno.nombre}
                  </span>
                </th>
                {dias.map((d) => (
                  <th key={d} className="pb-1">
                    <span className="inline-block w-full px-2 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-[11px] uppercase tracking-wider text-slate-200 font-bold text-center">
                      {DIAS_NOMBRES[d]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bloques.map((b, bIdx) =>
                b.es_receso ? (
                  <tr key={b.id} style={{ height: '1.75rem' }}>
                    <td className="text-[9px] text-slate-500 text-right pr-2 whitespace-nowrap">
                      {fmtHoraCfg(b.hora_inicio, usa12)}–{fmtHoraCfg(b.hora_fin, usa12)}
                    </td>
                    <td
                      colSpan={dias.length}
                      className="h-7 rounded-lg bg-slate-800/50 border border-dashed border-slate-700/60 text-center"
                    >
                      <span className="text-[9px] font-bold tracking-[0.3em] text-slate-500 uppercase inline-flex items-center gap-1">
                        <Coffee className="w-3 h-3" /> Receso
                      </span>
                    </td>
                  </tr>
                ) : (
                  <tr key={b.id} style={{ height: '3.5rem' }}>
                    <td className="text-[9px] text-slate-400 text-right pr-2 whitespace-nowrap align-middle">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {fmtHoraCfg(b.hora_inicio, usa12)}–{fmtHoraCfg(b.hora_fin, usa12)}
                      </span>
                    </td>
                    {dias.map((d) => {
                      const key = `${b.id}:${d}`;
                      if (cubiertas.has(key)) return null; // cubierta por rowspan
                      const entry = porCelda.get(key);
                      const valida = activo ? celdaValida(b, d, activo) : null;
                      const sp = spans.get(key);
                      const celdaBloqueIds = bloques
                        .slice(bIdx, bIdx + (sp?.n ?? 1))
                        .map((x) => x.id);
                      let dropRango: { desde: number; hasta: number; valida: boolean } | null = null;
                      if (dropPrev) {
                        const marcados = celdaBloqueIds
                          .map((bid, i) => (dropPrev.celdas.has(`${bid}:${d}`) ? i : -1))
                          .filter((i) => i >= 0);
                        if (marcados.length > 0) {
                          dropRango = {
                            desde: Math.min(...marcados),
                            hasta: Math.max(...marcados),
                            valida: dropPrev.valida,
                          };
                        }
                      }
                      return (
                        <Celda
                          key={d}
                          id={`cell:${b.id}:${d}`}
                          entry={entry}
                          run={entry ? runEntriesDe(bIdx, d, sp?.n ?? 1) : []}
                          span={sp?.n ?? 1}
                          bloqueIds={celdaBloqueIds}
                          dropRango={dropRango}
                          finHasta={sp?.fin}
                          valida={valida}
                          ocupadaProfe={
                            ocupadoProfe
                              ? celdaBloqueIds.flatMap(
                                  (bid) => ocupadoProfe.get(`${bid}:${d}`) ?? []
                                )
                              : []
                          }
                          profePeekId={profePeek}
                          fantasmas={fantasmasPorCelda?.get(key)}
                          onHoverProfe={setProfeHover}
                          onHoverCelda={
                            !activo
                              ? (x, y) =>
                                  setCeldaHover({
                                    dia: d,
                                    tramos: bloques.slice(bIdx, bIdx + (sp?.n ?? 1)),
                                    aulaActual: entry?.aula_nombre,
                                    x,
                                    y,
                                  })
                              : undefined
                          }
                          onLeaveCelda={() => setCeldaHover(null)}
                          esSwap={
                            !!activo &&
                            !!entry &&
                            ((activo.tipo === 'entry' && entry.id !== activo.entry_id) ||
                              (activo.tipo === 'grupo' &&
                                !(activo.entry_ids ?? []).includes(entry.id)))
                          }
                          activo={!!activo}
                          puedeEditar={puedeEditar}
                          resaltada={resaltar?.has(key) ?? false}
                          usa12h={usa12}
                          errores={celdaEnError(bIdx, d, sp?.n ?? 1)}
                          advertencias={advertenciasDe(runEntriesDe(bIdx, d, sp?.n ?? 1), entry)}
                          avisosParciales={avisosParcialesDe(runEntriesDe(bIdx, d, sp?.n ?? 1), entry)}
                          onAbrirMenu={setMenuEntry}
                        />
                      );
                    })}
                  </tr>
                )
              )}
            </tbody>
          </table>
          <p className="mt-1.5 text-[10px] text-slate-500">
            Mantén <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-sans">Shift</kbd> presionado
            y pasa el mouse sobre una materia para ver las clases de su profesor (incluidas las de otras secciones); el resto se atenúa.
            Con <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-sans">Ctrl</kbd> sobre
            cualquier bloque ves qué aulas están libres ahí (incluso sobre una clase).
          </p>
        </div>
      </div>

      {confirmarTodoOpen && (
        <ConfirmModal
          titulo="Guardar horario en pendientes"
          icono={<Archive className="w-5 h-5 text-amber-400" />}
          mensaje="¿Guardar todas las materias del horario en el depósito de materias pendientes?"
          lineas={[
            `Se desagendarán ${entriesSeccion.length} clase${entriesSeccion.length === 1 ? '' : 's'} de la sección ${seccion.seccion_nombre}.`,
            'La grilla quedará vacía; puedes volver a arrastrar las materias desde el depósito (o deshacer con Ctrl+Z).',
          ]}
          confirmLabel="Sí, guardar todo"
          busy={mutando > 0}
          onConfirm={handleDesagendarTodo}
          onCancel={() => setConfirmarTodoOpen(false)}
        />
      )}

      {/* Menú de una clase agendada: cambiar aula / quitar */}
      {menuEntry && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuEntry(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[30rem] max-w-[94vw] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-sm font-bold text-white">{menuEntry.materia_nombre}</div>
                <div className="text-[11px] text-slate-400">
                  {menuEntry.prof_apellidos
                    ? `${menuEntry.prof_apellidos}, ${menuEntry.prof_nombres}`
                    : 'Sin profesor asignado'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {DIAS_NOMBRES[menuEntry.dia_semana]} · {fmtHoraCfg(menuEntry.hora_inicio, usa12)}–
                  {fmtHoraCfg(menuEntry.hora_fin, usa12)} · {menuEntry.aula_nombre}
                </div>
              </div>
              <button onClick={() => setMenuEntry(null)} className="text-slate-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            {puedeEditar && (
              <>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  Cambiar aula
                </label>
                <div className="mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 divide-y divide-slate-800/60">
                  {aulasActivas
                    .filter(
                      (a) =>
                        a.id === menuEntry.aula_id || forzar || !aulaOcupadaEnRun(a.id)
                    )
                    .map((a) => {
                      const ocupada =
                        a.id !== menuEntry.aula_id && aulaOcupadaEnRun(a.id);
                      const actual = a.id === menuEntry.aula_id;
                      // El aula declara esta materia como preferida
                      const esPref = !!a.materias?.some(
                        (m) => normMateria(m) === normMateria(menuEntry.materia_nombre)
                      );
                      return (
                        <button
                          key={a.id}
                          onClick={() => handleCambiarAula(menuEntry, a.id)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left cursor-pointer transition-colors hover:bg-slate-800/70 ${
                            actual ? 'bg-emerald-500/10' : ''
                          }`}
                        >
                          <span
                            className={`min-w-0 truncate ${
                              actual ? 'text-emerald-200 font-semibold' : 'text-slate-200'
                            }`}
                          >
                            {a.nombre}
                            {actual && (
                              <span className="text-slate-500 font-normal"> · actual</span>
                            )}
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            {esPref && (
                              <span
                                title="Aula preferida para esta materia"
                                className="px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wide text-amber-300 bg-amber-500/10 border-amber-500/40"
                              >
                                Preferida
                              </span>
                            )}
                            {a.pnf_nombre && (
                              <span
                                title="PNF preferido del aula"
                                className="px-1.5 py-0.5 rounded border text-[9px] font-semibold text-purple-300 bg-purple-500/10 border-purple-500/30 max-w-28 truncate"
                              >
                                {a.pnf_nombre}
                              </span>
                            )}
                            {forzar && (
                              <span
                                className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wide ${
                                  ocupada
                                    ? 'text-red-300 bg-red-500/10 border-red-500/40'
                                    : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/40'
                                }`}
                              >
                                {ocupada ? 'Ocupada' : 'Disponible'}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                </div>
                <button
                  onClick={() => handleDesagendar(menuEntry.id)}
                  className="mt-3 w-full py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-semibold cursor-pointer"
                >
                  Quitar del horario
                </button>
              </>
            )}
          </div>
        </>
      )}

      <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={{ duration: 180, easing: 'ease' }}>
        {activo ? (
          <Chip titulo={activo.titulo} subtitulo={activo.subtitulo} overlay colorCls={colorMateria(activo.materia_id)} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

const Chip: React.FC<{
  titulo: string;
  subtitulo?: string;
  overlay?: boolean;
  colorCls?: string;
  grande?: boolean;
  colorDot?: string | null;
  dotTitle?: string;
}> = ({ titulo, subtitulo, overlay, colorCls, grande, colorDot, dotTitle }) => (
  <div
    className={`rounded-lg border px-2 py-1.5 text-left select-none transition-colors ${
      overlay
        ? `${colorCls ?? 'bg-blue-600/95 border-blue-400 text-blue-50'} shadow-2xl shadow-black/50 scale-105 rotate-1`
        : `${colorCls ?? 'bg-blue-500/10 border-blue-500/40 text-blue-200'} hover:brightness-125`
    } h-full flex flex-col justify-center`}
  >
    <div
      className={`${grande ? 'text-[11px]' : 'text-[10px]'} font-bold leading-tight flex items-start gap-1`}
    >
      {colorDot && (
        <span
          title={dotTitle}
          className="w-2 h-2 rounded-full shrink-0 mt-0.5 ring-1 ring-white/20"
          style={{ backgroundColor: colorDot }}
        />
      )}
      <span className="line-clamp-2 min-w-0">{titulo}</span>
    </div>
    {subtitulo && (
      <div className={`${grande ? 'text-[9px]' : 'text-[9px]'} opacity-75 leading-tight mt-0.5`}>
        {subtitulo}
      </div>
    )}
  </div>
);

const PendientesPanel: React.FC<{
  pendientes: { total: number; puestas: number; row: MateriaAsignableRow }[];
  puedeEditar: boolean;
  clasesAgendadas?: number;
  onGuardarTodo?: () => void;
  onHoverProfe?: (id: number | null) => void;
  profePeekId?: number | null;
}> = ({ pendientes, puedeEditar, clasesAgendadas = 0, onGuardarTodo, onHoverProfe, profePeekId }) => {
  const { setNodeRef, isOver } = useDroppable({ id: 'pendientes' });
  return (
    <div
      ref={setNodeRef}
      className={`w-full lg:w-56 shrink-0 bg-slate-900 border rounded-2xl p-3 transition-colors ${
        isOver ? 'border-amber-400/70 bg-amber-500/5' : 'border-slate-800'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2 flex items-center gap-1.5">
        <Layers className="w-3.5 h-3.5" /> Materias pendientes
        {puedeEditar && clasesAgendadas > 0 && onGuardarTodo && (
          <button
            type="button"
            onClick={onGuardarTodo}
            title="Guardar todas las clases del horario en el depósito"
            className="ml-auto p-1 rounded-md text-slate-500 hover:text-amber-300 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-0.5">
        {pendientes.length === 0 && (
          <div className="text-[11px] text-slate-500 italic px-1 py-2">
            Todas las materias tienen sus horas completas. Arrastra una clase aquí para desagendarla.
          </div>
        )}
        {pendientes.map((p) => (
          <PendienteChip key={p.row.materia_id} p={p} puedeEditar={puedeEditar} onHoverProfe={onHoverProfe} profePeekId={profePeekId} />
        ))}
      </div>
    </div>
  );
};

const PendienteChip: React.FC<{
  p: { total: number; puestas: number; row: MateriaAsignableRow };
  puedeEditar: boolean;
  onHoverProfe?: (id: number | null) => void;
  profePeekId?: number | null;
}> = ({ p, puedeEditar, onHoverProfe, profePeekId }) => {
  const restantes = p.total - p.puestas;
  const sinProfesor = !p.row.profesor_id;
  const usable = puedeEditar && restantes > 0;
  const subtitulo = p.row.prof_apellidos
    ? `${p.row.prof_apellidos} ${p.row.prof_nombres ?? ''}`.trim()
    : 'Sin profesor';
  const dataSingle: DragData = {
    tipo: 'pendiente',
    materia_id: p.row.materia_id,
    seccion_id: p.row.seccion_id,
    profesor_id: p.row.profesor_id,
    titulo: p.row.materia_nombre,
    subtitulo,
  };
  const dataGrupo: DragData = {
    ...dataSingle,
    tipo: 'grupo-pendiente',
    subtitulo: `${restantes}h seguidas`,
    horas: restantes,
  };
  // El texto del chip arrastra una sola hora; el grip arrastra todo el bloque
  // (si queda 1h el grip también arrastra una sola).
  const single = useDraggable({
    id: `pend:${p.row.materia_id}`,
    data: dataSingle,
    disabled: !usable,
  });
  const grupo = useDraggable({
    id: `pendgrp:${p.row.materia_id}`,
    data: restantes > 1 ? dataGrupo : dataSingle,
    disabled: !usable,
  });
  const { colorDePnf, catalogo } = usePnfColors();
  const pnfColor = colorDePnf(p.row.pnf_saga_id ?? null);
  const pnfNombre = catalogo.find((c) => c.id === p.row.pnf_saga_id)?.nombre;

  const color =
    restantes > 0
      ? 'bg-amber-500/10 border-amber-500/40 hover:border-amber-400/70'
      : 'bg-red-500/10 border-red-500/40';
  return (
    <div
      className={`rounded-lg border px-2 py-1.5 ${color} transition-all ${
        profePeekId != null && p.row.profesor_id !== profePeekId ? 'opacity-40' : ''
      }`}
      onMouseEnter={() => onHoverProfe?.(p.row.profesor_id ?? null)}
      onMouseLeave={() => onHoverProfe?.(null)}
    >
      <div className="flex items-center gap-1.5">
        {puedeEditar && restantes > 0 && (
          <div
            ref={grupo.setNodeRef}
            {...grupo.listeners}
            {...grupo.attributes}
            title={
              restantes > 1
                ? `Arrastrar las ${restantes}h juntas`
                : 'Arrastrar la hora restante'
            }
            className={`shrink-0 -ml-1 px-0.5 py-0.5 text-slate-500 hover:text-white cursor-pointer active:cursor-grabbing ${
              grupo.isDragging ? 'opacity-30' : ''
            }`}
          >
            <GripVertical className="w-3 h-3" />
          </div>
        )}
        <div
          ref={single.setNodeRef}
          {...single.listeners}
          {...single.attributes}
          title="Arrastrar una hora"
          className={`min-w-0 flex-1 ${usable ? 'cursor-grab active:cursor-grabbing' : ''} ${
            single.isDragging ? 'opacity-30' : ''
          }`}
        >
          <div className="text-[10px] font-bold text-slate-100 leading-tight flex items-start gap-1">
            {pnfColor && (
              <span
                title={pnfNombre ?? 'PNF'}
                className="w-2 h-2 rounded-full shrink-0 mt-0.5 ring-1 ring-white/20"
                style={{ backgroundColor: pnfColor }}
              />
            )}
            <span className="line-clamp-2">{p.row.materia_nombre}</span>
          </div>
          <div className="text-[9px] text-slate-400 leading-tight mt-0.5 flex items-center gap-1 flex-wrap">
            {sinProfesor ? (
              <span className="inline-flex items-center gap-0.5 text-slate-500">
                <UserX className="w-2.5 h-2.5" /> Sin profesor
              </span>
            ) : (
              <span className="truncate">
                {p.row.prof_apellidos} {p.row.prof_nombres}
              </span>
            )}
            <span
              className={`font-bold ${restantes > 0 ? 'text-amber-300' : 'text-red-300'}`}
            >
              {p.puestas}/{p.total} hrs
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const Celda: React.FC<{
  id: string;
  entry?: HorarioEntry;
  run: HorarioEntry[];
  span: number;
  bloqueIds: number[]; // bloques que cubre la celda (span filas), en orden
  dropRango?: { desde: number; hasta: number; valida: boolean } | null; // sub-filas que ocuparía el drop
  finHasta?: string;
  valida: boolean | null;
  esSwap: boolean;
  activo: boolean;
  puedeEditar: boolean;
  resaltada: boolean;
  usa12h: boolean;
  errores: ErrorClase[];
  advertencias?: string[];
  avisosParciales?: string[];
  ocupadaProfe?: HorarioEntry[]; // ⇧+peek: clases del profesor que caen aquí (tooltip)
  profePeekId?: number | null; // ⇧+peek activo: profesor cuyo horario se filtra
  fantasmas?: FantasmaItem[]; // ⇧+peek: fantasmas anclados en esta celda
  onHoverProfe?: (id: number | null) => void;
  onHoverCelda?: (x: number, y: number) => void; // Ctrl+peek: entra a celda vacía
  onLeaveCelda?: () => void;
  onAbrirMenu: (e: HorarioEntry) => void;
}> = ({ id, entry, run, span, bloqueIds, dropRango, finHasta, valida, esSwap, activo, puedeEditar, resaltada, usa12h, errores, advertencias, avisosParciales, ocupadaProfe, profePeekId, fantasmas, onHoverProfe, onHoverCelda, onLeaveCelda, onAbrirMenu }) => {
  const { setNodeRef, isOver } = useDroppable({ id, data: { bloqueIds } });

  const ocupada = !!ocupadaProfe?.length;
  const ocupadaTxt = ocupada
    ? `Profesor ocupado aquí: ${[
        ...new Set(ocupadaProfe.map((e) => `${e.materia_nombre} · ${e.seccion_nombre}`)),
      ]
        .slice(0, 3)
        .join(' | ')}`
    : undefined;

  const atenuar = profePeekId != null && !!entry && entry.profesor_id !== profePeekId;

  let cls =
    'relative rounded-lg border align-top p-1 transition-all duration-150 ';
  // El fantasma se estira sobre las filas de abajo: su celda ancla no puede
  // recortarlo con overflow-hidden.
  cls += fantasmas?.length ? 'overflow-visible ' : 'overflow-hidden ';
  if (resaltada) cls += 'ring-2 ring-red-400 animate-pulse ';
  if (activo) {
    cls += valida
      ? esSwap
        ? 'border-indigo-400/70 bg-indigo-500/15 '
        : 'border-emerald-400/60 bg-emerald-500/10 '
      : 'border-slate-800/60 bg-slate-900/40 opacity-40 ';
  } else {
    cls += entry
      ? 'border-transparent bg-transparent p-0 '
      : 'border-slate-800 bg-slate-950/40 ';
  }
  if (isOver && valida) {
    cls += esSwap ? 'ring-2 ring-indigo-400 scale-[1.03] ' : 'ring-2 ring-emerald-400 scale-[1.03] ';
  }

  return (
    <td
      ref={setNodeRef}
      rowSpan={span}
      className={cls}
      style={{ height: '3.5rem' }}
      title={ocupadaTxt}
      onMouseEnter={onHoverCelda ? (e) => onHoverCelda(e.clientX, e.clientY) : undefined}
      onMouseLeave={onLeaveCelda}
    >
      {entry && (
        <div className={`absolute inset-0 p-0.5 ${atenuar ? 'opacity-15 saturate-50' : ''}`}>
          <EntryChip entry={entry} run={run} span={span} finHasta={finHasta} puedeEditar={puedeEditar} usa12h={usa12h} errores={errores} advertencias={advertencias} avisosParciales={avisosParciales} onAbrirMenu={onAbrirMenu} onHoverProfe={onHoverProfe} />
        </div>
      )}
      {fantasmas?.map((f) => (
        <div
          key={f.entry.id}
          className="absolute z-20 px-0.5 pointer-events-none"
          style={{
            top: `${f.top}rem`,
            height: `${f.height}rem`,
            left: `${f.left}%`,
            width: `${f.width}%`,
          }}
        >
          <ClaseFantasma entry={f.entry} fin={f.fin} usa12h={usa12h} />
        </div>
      ))}
      {dropRango && (
        <div
          className={`absolute left-0.5 right-0.5 z-30 rounded-md border-2 border-dashed pointer-events-none ${
            dropRango.valida
              ? 'border-emerald-300 bg-emerald-400/25 shadow-[0_0_14px_rgba(52,211,153,0.4)]'
              : 'border-red-400 bg-red-500/20'
          }`}
          style={{
            top: `${(dropRango.desde / span) * 100}%`,
            height: `${((dropRango.hasta - dropRango.desde + 1) / span) * 100}%`,
          }}
        />
      )}
    </td>
  );
};

// Tarjeta fantasma del ⇧+peek: clase del profesor que cae en esta celda pero
// pertenece a otra sección/lapso (la propia de la celda ya se ve con su
// ClaseCard normal). Borde punteado y fondo oscuro para distinguirla; es
// pointer-events-none (lo pone el contenedor) para no estorbar drag&drop.
// Se estira sobre todas las filas que ocupa la clase, como una tarjeta real.
const ClaseFantasma: React.FC<{ entry: HorarioEntry; fin?: string; usa12h?: boolean }> = ({ entry, fin, usa12h }) => (
  <div
    className={`h-full w-full rounded-md border border-dashed px-1.5 py-1 flex flex-col justify-center overflow-hidden ${colorMateria(
      entry.materia_id
    )}`}
    style={{ backgroundColor: 'var(--color-fantasma-bg)' }}
    title={`${entry.materia_nombre} · ${entry.seccion_nombre} · ${entry.aula_codigo} · ${fmtHoraCfg(entry.hora_inicio, usa12h)}–${fmtHoraCfg(fin ?? entry.hora_fin, usa12h)}`}
  >
    <div className="text-[10px] font-bold leading-tight line-clamp-2">
      {entry.materia_nombre}
    </div>
    <div className="text-[9px] opacity-80 leading-tight truncate mt-0.5">
      {entry.seccion_nombre} · {entry.aula_codigo}
    </div>
    <div className="text-[9px] opacity-80 leading-tight truncate">
      {fmtHoraCfg(entry.hora_inicio, usa12h)}–{fmtHoraCfg(fin ?? entry.hora_fin, usa12h)}
    </div>
  </div>
);

const EntryChip: React.FC<{
  entry: HorarioEntry;
  run: HorarioEntry[]; // entries del run fusionado (1 si la tarjeta es de una hora)
  span: number;
  finHasta?: string;
  puedeEditar: boolean;
  usa12h: boolean;
  errores: ErrorClase[];
  advertencias?: string[];
  avisosParciales?: string[];
  onAbrirMenu: (e: HorarioEntry) => void;
  onHoverProfe?: (id: number | null) => void;
}> = ({ entry, run, span, finHasta, puedeEditar, usa12h, errores, advertencias, avisosParciales, onAbrirMenu, onHoverProfe }) => {
  const esGrupo = run.length > 1;
  const singleData: DragData = {
    tipo: 'entry',
    entry_id: entry.id,
    materia_id: entry.materia_id,
    seccion_id: entry.seccion_id,
    profesor_id: entry.profesor_id,
    titulo: entry.materia_nombre,
    subtitulo: `${DIAS_CORTOS[entry.dia_semana]} ${fmtHoraCfg(entry.hora_inicio, usa12h)} · ${entry.aula_codigo}`,
  };
  const groupData: DragData = {
    tipo: 'grupo',
    entry_ids: run.map((e) => e.id),
    materia_id: entry.materia_id,
    seccion_id: entry.seccion_id,
    profesor_id: entry.profesor_id,
    titulo: entry.materia_nombre,
    subtitulo: `${run.length}h seguidas · ${entry.aula_codigo}`,
  };
  const single = useDraggable({
    id: `entry:${entry.id}`,
    data: singleData,
    disabled: !puedeEditar || esGrupo,
  });
  const group = useDraggable({
    id: `group:${entry.id}`,
    data: groupData,
    disabled: !puedeEditar || !esGrupo,
  });

  if (!esGrupo) {
    return (
      <div
        ref={single.setNodeRef}
        {...single.listeners}
        {...single.attributes}
        onClick={() => onAbrirMenu(entry)}
        onMouseEnter={() => onHoverProfe?.(entry.profesor_id)}
        onMouseLeave={() => onHoverProfe?.(null)}
        className={`h-full w-full ${puedeEditar ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} ${
          single.isDragging ? 'opacity-30' : ''
        }`}
      >
        <ClaseCard
          entry={entry}
          fin={span > 1 ? finHasta : undefined}
          usa12h={usa12h}
          errores={errores}
          advertencias={advertencias}
          avisosParciales={avisosParciales}
          className="hover:brightness-125 transition-colors"
        />
      </div>
    );
  }

  // Tarjeta fusionada (varias horas): cualquier parte de la tarjeta arrastra el
  // bloque completo; al pasar el mouse aparece un handler por hora a la
  // izquierda para arrastrar cada hora por separado.
  return (
    <div
      className="relative h-full w-full group/card"
      onMouseEnter={() => onHoverProfe?.(entry.profesor_id)}
      onMouseLeave={() => onHoverProfe?.(null)}
    >
      <div
        ref={group.setNodeRef}
        {...group.listeners}
        {...group.attributes}
        onClick={() => onAbrirMenu(entry)}
        className={`absolute inset-0 ${puedeEditar ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} ${
          group.isDragging ? 'opacity-30' : ''
        }`}
      >
        <ClaseCard
          entry={entry}
          fin={finHasta}
          usa12h={usa12h}
          errores={errores}
          advertencias={advertencias}
          avisosParciales={avisosParciales}
          className="hover:brightness-125 transition-colors"
        />
      </div>
      {puedeEditar && (
        <div className="absolute left-0 top-0 bottom-0 w-5 flex flex-col gap-px z-10 pr-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity">
          {run.map((e) => (
            <HourHandle key={e.id} entry={e} usa12h={usa12h} />
          ))}
        </div>
      )}
    </div>
  );
};

// Handler para arrastrar una sola hora de un bloque fusionado: visible solo al
// pasar el mouse sobre la tarjeta, uno por cada hora del run.
const HourHandle: React.FC<{ entry: HorarioEntry; usa12h: boolean }> = ({ entry, usa12h }) => {
  const data: DragData = {
    tipo: 'entry',
    entry_id: entry.id,
    materia_id: entry.materia_id,
    seccion_id: entry.seccion_id,
    profesor_id: entry.profesor_id,
    titulo: entry.materia_nombre,
    subtitulo: `${DIAS_CORTOS[entry.dia_semana]} ${fmtHoraCfg(entry.hora_inicio, usa12h)}–${fmtHoraCfg(entry.hora_fin, usa12h)} · ${entry.aula_codigo}`,
  };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `hour:${entry.id}`,
    data,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title={`Mover solo esta hora (${fmtHoraCfg(entry.hora_inicio, usa12h)}–${fmtHoraCfg(entry.hora_fin, usa12h)})`}
      className={`flex-1 min-h-0 flex items-center justify-center rounded-md bg-transparent border border-slate-500/40 text-slate-300 hover:bg-indigo-600/80 hover:border-indigo-400 hover:text-white cursor-pointer active:cursor-grabbing transition-colors ${
        isDragging ? 'opacity-30' : ''
      }`}
    >
      <GripVertical className="w-3 h-3" />
    </div>
  );
};
