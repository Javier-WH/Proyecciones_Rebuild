import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { apiFetch } from '../../api/client.js';
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
  traslapan,
  colorMateria,
} from './types.js';
import { Clock, Coffee, GripVertical, Layers, UserX, X } from 'lucide-react';

interface DragData {
  tipo: 'pendiente' | 'entry';
  materia_id: number;
  seccion_id: number;
  profesor_id: number | null;
  titulo: string;
  subtitulo: string;
  entry_id?: number;
}



interface SeccionGridProps {
  seccion: SeccionRef;
  turno: Turno | null | undefined;
  materias: MateriaAsignableRow[];
  entries: HorarioEntry[];
  aulas: Aula[];
  config: HorarioConfig;
  trimestre: number;
  puedeEditar: boolean;
  resaltar?: Set<string> | null; // claves 'bloque_id:dia' a resaltar (viene del panel de errores)
  enError?: Set<string> | null; // claves 'bloque_id:dia' con alguna violación (punto rojo)
  onChanged: () => void;
}

export const SeccionGrid: React.FC<SeccionGridProps> = ({
  seccion,
  turno,
  materias,
  entries,
  aulas,
  config,
  trimestre,
  puedeEditar,
  resaltar,
  enError,
  onChanged,
}) => {
  const [activo, setActivo] = useState<DragData | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error' | 'warn'; msg: string } | null>(null);
  const [menuEntry, setMenuEntry] = useState<HorarioEntry | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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

  // Aulas ocupadas en un slot (día + rango horario) por clases de cualquier sección/lapso rival
  const aulasOcupadasEn = (dia: number, inicio: string, fin: string, excluir?: number): Set<number> => {
    const ocup = new Set<number>();
    for (const e of entries) {
      if (excluir && e.id === excluir) continue;
      if (e.dia_semana !== dia) continue;
      if (traslapan(inicio, fin, e.hora_inicio, e.hora_fin)) ocup.add(e.aula_id);
    }
    return ocup;
  };

  // ¿Esta tarjeta (o alguna celda que absorbe por rowspan) marcada en error?
  const celdaEnError = (bloqueIdx: number, dia: number, n: number): boolean => {
    if (!enError) return false;
    let restantes = n;
    for (let i = bloqueIdx; i < bloques.length && restantes > 0; i++) {
      if (bloques[i].es_receso) break;
      if (enError.has(`${bloques[i].id}:${dia}`)) return true;
      restantes--;
    }
    return false;
  };

  // ¿Es válido soltar el drag en esta celda?
  const celdaValida = (bloque: Bloque, dia: number, drag: DragData): boolean => {
    if (bloque.es_receso) return false;
    const ocupada = porCelda.get(`${bloque.id}:${dia}`);
    // Celda ocupada por otra clase: solo es destino válido para intercambio
    // (arrastrar una clase agendada sobre otra las intercambia de lugar)
    if (ocupada && ocupada.id !== drag.entry_id) return drag.tipo === 'entry';
    const excl = drag.entry_id;
    for (const e of entries) {
      if (excl && e.id === excl) continue;
      if (e.dia_semana !== dia) continue;
      if (!traslapan(bloque.hora_inicio, bloque.hora_fin, e.hora_inicio, e.hora_fin)) continue;
      if (drag.profesor_id && e.profesor_id === drag.profesor_id) return false;
      if (e.seccion_id === drag.seccion_id) return false;
    }
    return aulasOcupadasEn(dia, bloque.hora_inicio, bloque.hora_fin, excl).size < aulasActivas.length;
  };

  const handleDropEnCelda = async (bloque: Bloque, dia: number, drag: DragData) => {
    // Soltar una clase sobre otra ocupada = intercambio de día/bloque/aula
    // (cada una conserva su profesor y demás datos)
    const destino = porCelda.get(`${bloque.id}:${dia}`);
    if (destino && destino.id !== drag.entry_id) {
      if (drag.tipo !== 'entry' || !drag.entry_id) return;
      const res = await apiFetch('/horarios/entries/swap', {
        method: 'POST',
        body: JSON.stringify({ entry_id_a: drag.entry_id, entry_id_b: destino.id }),
      });
      if (res.success) {
        mostrarAviso(`Intercambio: '${drag.titulo}' ↔ '${destino.materia_nombre}'.`, 'ok');
        onChanged();
      } else {
        mostrarAviso(res.message || 'No se pudo intercambiar las clases.', 'error');
      }
      return;
    }
    const res = await apiFetch('/horarios/entries', {
      method: 'PUT',
      body: JSON.stringify({
        entry_id: drag.entry_id,
        materia_id: drag.materia_id,
        seccion_id: drag.seccion_id,
        trimestre,
        dia_semana: dia,
        bloque_id: bloque.id,
      }),
    });
    if (res.success) {
      const regla = evaluarReglas(bloque, dia, drag);
      mostrarAviso(regla ?? 'Clase agendada.', regla ? 'warn' : 'ok');
      onChanged();
    } else {
      mostrarAviso(res.message || 'No se pudo agendar.', 'error');
    }
  };

  const handleDesagendar = async (entryId: number) => {
    const res = await apiFetch(`/horarios/entries/${entryId}`, { method: 'DELETE' });
    if (res.success) {
      mostrarAviso('Clase desagendada.');
      setMenuEntry(null);
      onChanged();
    } else {
      mostrarAviso(res.message || 'No se pudo quitar.', 'error');
    }
  };

  const handleCambiarAula = async (entry: HorarioEntry, aulaId: number) => {
    const res = await apiFetch('/horarios/entries', {
      method: 'PUT',
      body: JSON.stringify({
        entry_id: entry.id,
        materia_id: entry.materia_id,
        seccion_id: entry.seccion_id,
        trimestre: entry.trimestre,
        dia_semana: entry.dia_semana,
        bloque_id: entry.bloque_id,
        aula_id: aulaId,
      }),
    });
    if (res.success) {
      mostrarAviso('Aula actualizada.');
      setMenuEntry(null);
      onChanged();
    } else {
      mostrarAviso(res.message || 'No se pudo cambiar el aula.', 'error');
    }
  };

  const onDragStart = (ev: DragStartEvent) => setActivo(ev.active.data.current as DragData);

  const onDragEnd = async (ev: DragEndEvent) => {
    const drag = ev.active.data.current as DragData;
    setActivo(null);
    const over = ev.over?.id as string | undefined;
    if (!over || !drag) return;
    if (over === 'pendientes') {
      if (drag.entry_id) await handleDesagendar(drag.entry_id);
      return;
    }
    if (over.startsWith('cell:')) {
      const [, bloqueId, dia] = over.split(':');
      const bloque = bloques.find((b) => b.id === Number(bloqueId));
      if (!bloque) return;
      if (!celdaValida(bloque, Number(dia), drag)) {
        mostrarAviso('Esa celda no es válida para la clase (ocupada, receso o sin aula libre).', 'error');
        return;
      }
      await handleDropEnCelda(bloque, Number(dia), drag);
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
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {aviso && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-md px-4 py-2.5 rounded-xl text-xs font-semibold border shadow-2xl shadow-black/50 backdrop-blur-sm transition-all ${
            aviso.tipo === 'error'
              ? 'bg-red-950/90 border-red-500/40 text-red-300'
              : aviso.tipo === 'warn'
                ? 'bg-amber-950/90 border-amber-500/40 text-amber-300'
                : 'bg-emerald-950/90 border-emerald-500/40 text-emerald-300'
          }`}
        >
          {aviso.msg}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Panel de materias pendientes (droppable para desagendar) */}
        <PendientesPanel pendientes={pendientes} puedeEditar={puedeEditar} />

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
                      {fmtHora(b.hora_inicio)}–{fmtHora(b.hora_fin)}
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
                        {fmtHora(b.hora_inicio)}–{fmtHora(b.hora_fin)}
                      </span>
                    </td>
                    {dias.map((d) => {
                      const key = `${b.id}:${d}`;
                      if (cubiertas.has(key)) return null; // cubierta por rowspan
                      const entry = porCelda.get(key);
                      const valida = activo ? celdaValida(b, d, activo) : null;
                      const sp = spans.get(key);
                      return (
                        <Celda
                          key={d}
                          id={`cell:${b.id}:${d}`}
                          entry={entry}
                          span={sp?.n ?? 1}
                          finHasta={sp?.fin}
                          valida={valida}
                          esSwap={
                            !!activo &&
                            activo.tipo === 'entry' &&
                            !!entry &&
                            entry.id !== activo.entry_id
                          }
                          activo={!!activo}
                          puedeEditar={puedeEditar}
                          resaltada={resaltar?.has(key) ?? false}
                          enError={celdaEnError(bIdx, d, sp?.n ?? 1)}
                          onAbrirMenu={setMenuEntry}
                        />
                      );
                    })}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Menú de una clase agendada: cambiar aula / quitar */}
      {menuEntry && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuEntry(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-sm font-bold text-white">{menuEntry.materia_nombre}</div>
                <div className="text-[11px] text-slate-400">
                  {menuEntry.prof_apellidos
                    ? `${menuEntry.prof_apellidos}, ${menuEntry.prof_nombres}`
                    : 'Sin profesor asignado'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {DIAS_NOMBRES[menuEntry.dia_semana]} · {fmtHora(menuEntry.hora_inicio)}–
                  {fmtHora(menuEntry.hora_fin)} · Aula {menuEntry.aula_codigo}
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
                <select
                  className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-200"
                  value={menuEntry.aula_id}
                  onChange={(e) => handleCambiarAula(menuEntry, Number(e.target.value))}
                >
                  <option value={menuEntry.aula_id}>
                    {menuEntry.aula_codigo} — {menuEntry.aula_nombre}
                  </option>
                  {aulasActivas
                    .filter(
                      (a) =>
                        a.id !== menuEntry.aula_id &&
                        !aulasOcupadasEn(
                          menuEntry.dia_semana,
                          menuEntry.hora_inicio,
                          menuEntry.hora_fin,
                          menuEntry.id
                        ).has(a.id)
                    )
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.codigo} — {a.nombre}
                      </option>
                    ))}
                </select>
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
}> = ({ pendientes, puedeEditar }) => {
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
      </div>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-0.5">
        {pendientes.length === 0 && (
          <div className="text-[11px] text-slate-500 italic px-1 py-2">
            Todas las materias tienen sus horas completas. Arrastra una clase aquí para desagendarla.
          </div>
        )}
        {pendientes.map((p) => (
          <PendienteChip key={p.row.materia_id} p={p} puedeEditar={puedeEditar} />
        ))}
      </div>
    </div>
  );
};

const PendienteChip: React.FC<{
  p: { total: number; puestas: number; row: MateriaAsignableRow };
  puedeEditar: boolean;
}> = ({ p, puedeEditar }) => {
  const restantes = p.total - p.puestas;
  const sinProfesor = !p.row.profesor_id;
  const data: DragData = {
    tipo: 'pendiente',
    materia_id: p.row.materia_id,
    seccion_id: p.row.seccion_id,
    profesor_id: p.row.profesor_id,
    titulo: p.row.materia_nombre,
    subtitulo: p.row.prof_apellidos
      ? `${p.row.prof_apellidos} ${p.row.prof_nombres ?? ''}`.trim()
      : 'Sin profesor',
  };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pend:${p.row.materia_id}`,
    data,
    disabled: !puedeEditar || restantes <= 0,
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
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`rounded-lg border px-2 py-1.5 ${color} ${
        isDragging ? 'opacity-30' : ''
      } ${puedeEditar && restantes > 0 ? 'cursor-grab active:cursor-grabbing' : ''} transition-all`}
    >
      <div className="flex items-center gap-1.5">
        {puedeEditar && restantes > 0 && <GripVertical className="w-3 h-3 text-slate-500 shrink-0" />}
        <div className="min-w-0">
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
  span: number;
  finHasta?: string;
  valida: boolean | null;
  esSwap: boolean;
  activo: boolean;
  puedeEditar: boolean;
  resaltada: boolean;
  enError: boolean;
  onAbrirMenu: (e: HorarioEntry) => void;
}> = ({ id, entry, span, finHasta, valida, esSwap, activo, puedeEditar, resaltada, enError, onAbrirMenu }) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  let cls =
    'relative rounded-lg border align-top p-1 transition-all duration-150 overflow-hidden ';
  if (resaltada) cls += 'ring-2 ring-red-400 animate-pulse ';
  if (activo) {
    cls += valida
      ? esSwap
        ? 'border-indigo-400/70 bg-indigo-500/15 '
        : 'border-emerald-400/60 bg-emerald-500/10 '
      : 'border-slate-800/60 bg-slate-900/40 opacity-40 ';
  } else {
    cls += entry ? 'border-transparent bg-transparent p-0 ' : 'border-slate-800 bg-slate-950/40 ';
  }
  if (isOver && valida) {
    cls += esSwap ? 'ring-2 ring-indigo-400 scale-[1.03] ' : 'ring-2 ring-emerald-400 scale-[1.03] ';
  }

  return (
    <td ref={setNodeRef} rowSpan={span} className={cls} style={{ height: '3.5rem' }}>
      {entry && (
        <div className="absolute inset-0 p-0.5">
          <EntryChip entry={entry} span={span} finHasta={finHasta} puedeEditar={puedeEditar} enError={enError} onAbrirMenu={onAbrirMenu} />
        </div>
      )}
    </td>
  );
};

const EntryChip: React.FC<{
  entry: HorarioEntry;
  span: number;
  finHasta?: string;
  puedeEditar: boolean;
  enError: boolean;
  onAbrirMenu: (e: HorarioEntry) => void;
}> = ({ entry, span, finHasta, puedeEditar, enError, onAbrirMenu }) => {
  const data: DragData = {
    tipo: 'entry',
    entry_id: entry.id,
    materia_id: entry.materia_id,
    seccion_id: entry.seccion_id,
    profesor_id: entry.profesor_id,
    titulo: entry.materia_nombre,
    subtitulo: `${DIAS_CORTOS[entry.dia_semana]} ${fmtHora(entry.hora_inicio)} · ${entry.aula_codigo}`,
  };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `entry:${entry.id}`,
    data,
    disabled: !puedeEditar,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onAbrirMenu(entry)}
      className={`h-full w-full ${puedeEditar ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} ${
        isDragging ? 'opacity-30' : ''
      }`}
    >
      <ClaseCard
        entry={entry}
        fin={span > 1 ? finHasta : undefined}
        error={enError}
        className="hover:brightness-125 transition-colors"
      />
    </div>
  );
};
