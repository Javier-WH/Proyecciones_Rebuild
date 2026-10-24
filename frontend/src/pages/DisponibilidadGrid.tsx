import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { Turno, DIAS_NOMBRES, fmtHora, minutos } from './horarios/types.js';
import { Loader2, AlertCircle, Check, Ban } from 'lucide-react';

interface SlotBloqueado {
  dia_semana: number;
  hora_inicio: string; // 'HH:MM'
  hora_fin: string;
}

interface Fila {
  inicio: string; // 'HH:MM:SS'
  fin: string;
  esReceso: boolean;
}

const slotKey = (dia: number, inicio: string, fin: string) =>
  `${dia}|${inicio.slice(0, 5)}|${fin.slice(0, 5)}`;

// Grilla día × rango horario para editar la disponibilidad de un profesor
// (unión de bloques de todos los turnos). Click en una celda = toggle
// disponible/no disponible. Se usa dentro del modal del admin y también
// embebida en el portal del docente.
//
// `endpoint` elige qué disponibilidad edita:
//   'disponibilidad'           — la REAL (coordinador; la usa el horario)
//   'disponibilidad-sugerida'  — la SUGERENCIA del docente (solo consulta)
// `marcarSugeridas` = además carga la sugerencia y marca con un punto ámbar
// las celdas que el docente pidió bloquear (vista del coordinador).
// `recargaKey` fuerza una recarga al cambiar (tras sincronizar sugerencia).
export const DisponibilidadGrid: React.FC<{
  profesorId: number;
  endpoint?: 'disponibilidad' | 'disponibilidad-sugerida';
  marcarSugeridas?: boolean;
  recargaKey?: number;
}> = ({ profesorId, endpoint = 'disponibilidad', marcarSugeridas, recargaKey }) => {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [bloqueados, setBloqueados] = useState<Set<string>>(new Set());
  const [sugeridas, setSugeridas] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [guardandoBulk, setGuardandoBulk] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setErrorMsg(null);
    setBloqueados(new Set());
    setSugeridas(new Set());
    const cargar = async () => {
      setLoading(true);
      const [rTurnos, rDisp, rSug] = await Promise.all([
        apiFetch<Turno[]>('/horarios/turnos'),
        apiFetch<SlotBloqueado[]>(`/profesores/${profesorId}/${endpoint}`),
        marcarSugeridas
          ? apiFetch<SlotBloqueado[]>(`/profesores/${profesorId}/disponibilidad-sugerida`)
          : Promise.resolve(null),
      ]);
      if (rTurnos.success && rTurnos.data) setTurnos(rTurnos.data);
      if (rDisp.success && rDisp.data) {
        setBloqueados(
          new Set(rDisp.data.map((s) => slotKey(s.dia_semana, s.hora_inicio, s.hora_fin)))
        );
      } else {
        setErrorMsg(rDisp.message || 'Error cargando la disponibilidad.');
      }
      if (rSug?.success && rSug.data) {
        setSugeridas(
          new Set(rSug.data.map((s) => slotKey(s.dia_semana, s.hora_inicio, s.hora_fin)))
        );
      }
      setLoading(false);
    };
    cargar();
  }, [profesorId, endpoint, marcarSugeridas, recargaKey]);

  // Filas: rangos hora_inicio–hora_fin únicos de todos los turnos
  const filas = useMemo<Fila[]>(() => {
    const map = new Map<string, Fila>();
    for (const t of turnos) {
      for (const b of t.bloques) {
        const k = `${b.hora_inicio}-${b.hora_fin}`;
        const prev = map.get(k);
        map.set(k, {
          inicio: b.hora_inicio,
          fin: b.hora_fin,
          esReceso: (prev?.esReceso ?? false) || !!b.es_receso,
        });
      }
    }
    return [...map.values()].sort((a, b) => minutos(a.inicio) - minutos(b.inicio));
  }, [turnos]);

  // Columnas: unión de los días habilitados por los turnos (mínimo Lun–Vie)
  const dias = useMemo(() => {
    const set = new Set<number>();
    for (const t of turnos) {
      String(t.dias_semana).split(',').map(Number).filter(Boolean).forEach((d) => set.add(d));
    }
    const arr = [...set].sort((a, b) => a - b);
    return arr.length > 0 ? arr : [1, 2, 3, 4, 5];
  }, [turnos]);

  // Marca o libera un conjunto de slots de una vez (día u hora completa).
  // Si todos están bloqueados → los libera; si falta alguno → bloquea todos.
  const toggleBulk = async (slots: { dia: number; f: Fila }[]) => {
    if (guardando || guardandoBulk) return;
    const keys = slots.map((s) => slotKey(s.dia, s.f.inicio, s.f.fin));
    const todosBloqueados = keys.every((k) => bloqueados.has(k));
    // Optimista: todos bloqueados -> liberar; si no -> bloquear
    setBloqueados((prev) => {
      const n = new Set(prev);
      for (const k of keys) {
        if (todosBloqueados) n.delete(k);
        else n.add(k);
      }
      return n;
    });
    setGuardandoBulk(true);
    const res = await apiFetch(`/profesores/${profesorId}/${endpoint}-bulk`, {
      method: 'PUT',
      body: JSON.stringify({
        slots: slots.map((s) => ({
          dia_semana: s.dia,
          hora_inicio: s.f.inicio.slice(0, 5),
          hora_fin: s.f.fin.slice(0, 5),
        })),
        disponible: todosBloqueados,
      }),
    });
    setGuardandoBulk(false);
    if (!res.success) {
      setBloqueados((prev) => {
        const n = new Set(prev);
        for (const k of keys) {
          if (todosBloqueados) n.add(k);
          else n.delete(k);
        }
        return n;
      });
      setErrorMsg(res.message || 'No se pudo actualizar la disponibilidad.');
    }
  };

  const toggleSlot = async (f: Fila, dia: number) => {
    if (guardando || guardandoBulk) return; // una escritura a la vez
    const key = slotKey(dia, f.inicio, f.fin);
    const estabaBloqueado = bloqueados.has(key);
    // Toggle optimista; se revierte si el PUT falla
    setBloqueados((prev) => {
      const n = new Set(prev);
      if (estabaBloqueado) n.delete(key);
      else n.add(key);
      return n;
    });
    setGuardando(key);
    const res = await apiFetch(`/profesores/${profesorId}/${endpoint}`, {
      method: 'PUT',
      body: JSON.stringify({
        dia_semana: dia,
        hora_inicio: f.inicio.slice(0, 5),
        hora_fin: f.fin.slice(0, 5),
        disponible: estabaBloqueado, // estaba bloqueado -> ahora disponible
      }),
    });
    setGuardando(null);
    if (!res.success) {
      setBloqueados((prev) => {
        const n = new Set(prev);
        if (estabaBloqueado) n.add(key);
        else n.delete(key);
        return n;
      });
      setErrorMsg(res.message || 'No se pudo actualizar la disponibilidad.');
    }
  };

  return (
    <div>
      {errorMsg && (
        <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="py-14 text-center text-slate-400 text-xs flex justify-center items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          <span>Cargando disponibilidad...</span>
        </div>
      ) : filas.length === 0 ? (
        <div className="py-14 text-center text-slate-500 text-xs italic">
          No hay bloques horarios configurados. Define los turnos en el módulo de Horarios.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-separate border-spacing-1 min-w-[640px]">
              <thead>
                <tr>
                  <th className="w-24 pb-1">
                    <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-800/80 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                      Hora
                    </span>
                  </th>
                  {dias.map((d) => (
                    <th key={d} className="pb-1">
                      <button
                        onClick={() => toggleBulk(filas.map((f) => ({ dia: d, f })))}
                        disabled={guardandoBulk}
                        title="Clic: marcar/liberar todo el día"
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 hover:border-emerald-500/50 text-[11px] uppercase tracking-wider text-slate-200 font-bold text-center transition-colors cursor-pointer disabled:cursor-wait"
                      >
                        {guardandoBulk ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : DIAS_NOMBRES[d]}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={`${f.inicio}-${f.fin}`} style={{ height: '2.25rem' }}>
                    <td className="align-middle pr-1">
                      <button
                        onClick={() => toggleBulk(dias.map((d) => ({ dia: d, f })))}
                        disabled={guardandoBulk}
                        title="Clic: marcar/liberar toda la fila"
                        className="w-full text-[9px] text-slate-400 hover:text-emerald-300 text-right pr-1 whitespace-nowrap transition-colors cursor-pointer disabled:cursor-wait"
                      >
                        {fmtHora(f.inicio)}–{fmtHora(f.fin)}
                        {f.esReceso && (
                          <span className="block text-[8px] text-slate-600 uppercase tracking-wider">
                            receso
                          </span>
                        )}
                      </button>
                    </td>
                    {dias.map((d) => {
                      const key = slotKey(d, f.inicio, f.fin);
                      const bloqueado = bloqueados.has(key);
                      const sugerida = sugeridas.has(key);
                      const ocupado = guardando === key;
                      return (
                        <td key={d} className="p-0">
                          <button
                            onClick={() => toggleSlot(f, d)}
                            disabled={ocupado}
                            title={
                              (bloqueado ? 'No disponible — click para liberar' : 'Disponible — click para bloquear') +
                              (sugerida ? '\nEl docente sugirió bloquear este horario' : '')
                            }
                            className={`relative w-full h-full min-h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer disabled:cursor-wait ${
                              bloqueado
                                ? 'bg-red-500/20 border-red-500/50 text-red-300 hover:bg-red-500/30'
                                : sugerida
                                  ? 'bg-amber-500/10 border-amber-500/50 text-amber-300/80 hover:bg-amber-500/20'
                                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300/70 hover:bg-emerald-500/20'
                            } ${f.esReceso && !bloqueado ? 'opacity-50' : ''}`}
                          >
                            {ocupado ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : bloqueado ? (
                              <Ban className="w-3 h-3" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            {sugerida && (
                              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center gap-4 text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/40" />
              Disponible
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-red-500/25 border border-red-500/50" />
              No disponible
            </span>
            {marcarSugeridas && (
              <span className="inline-flex items-center gap-1.5">
                <span className="relative w-3 h-3 rounded bg-emerald-500/10 border border-amber-500/60">
                  <span className="absolute top-0 right-0 w-1 h-1 rounded-full bg-amber-400" />
                </span>
                Sugerido por el docente
              </span>
            )}
            <span className="ml-auto text-slate-600">Clic en día u hora: alternar toda la columna/fila · {bloqueados.size} slot{bloqueados.size === 1 ? '' : 's'} bloqueado{bloqueados.size === 1 ? '' : 's'}</span>
          </div>
        </>
      )}
    </div>
  );
};
