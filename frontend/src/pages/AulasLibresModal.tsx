import React, { useMemo, useState } from 'react';
import { X, DoorOpen, Check, Ban } from 'lucide-react';
import {
  Aula, HorarioEntry, Turno, DIAS_NOMBRES, DIAS_CORTOS,
  fmtHora, fmtHoraCfg, minutos, traslapan, sortAulas,
} from './horarios/types.js';

interface Props {
  onClose: () => void;
  entries: HorarioEntry[]; // entries del lapso + rivales (ya en memoria)
  aulas: Aula[];
  turnos: Turno[];
  usa12?: boolean;
}

interface Franja {
  inicio: string; // 'HH:MM:SS'
  fin: string;
  esReceso: boolean;
}

const celdaKey = (dia: number, f: Franja) => `${dia}|${f.inicio}|${f.fin}`;

// Modal "Aulas libres / ocupación": dos vistas sobre los mismos datos.
//   · "Libres por slot": matriz día × franja — cuántas aulas están libres;
//     clic en una celda lista cuáles.
//   · "Ocupación por aula": mapa de calor aula × franja para un día — 0
//     libre (verde), 1 clase (ámbar), >1 choque (rojo), con % de uso.
// Usa los entries ya cargados en HorariosPage (lapso + lapsos rivales): un
// aula se considera ocupada si cualquier clase traslapa el rango ese día.
export const AulasLibresModal: React.FC<Props> = ({ onClose, entries, aulas, turnos, usa12 }) => {
  const [celdaSel, setCeldaSel] = useState<string | null>(null);
  const [modo, setModo] = useState<'libres' | 'ocupacion'>('libres');
  const [diaOcup, setDiaOcup] = useState(1);

  const aulasActivas = useMemo(() => sortAulas(aulas.filter((a) => a.activa)), [aulas]);

  // Filas: rangos únicos de hora de todos los turnos (como DisponibilidadGrid)
  const franjas = useMemo<Franja[]>(() => {
    const map = new Map<string, Franja>();
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

  const dias = useMemo(() => {
    const set = new Set<number>();
    for (const t of turnos) {
      String(t.dias_semana).split(',').map(Number).filter(Boolean).forEach((d) => set.add(d));
    }
    const arr = [...set].sort((a, b) => a - b);
    return arr.length > 0 ? arr : [1, 2, 3, 4, 5];
  }, [turnos]);

  // aula_id ocupadas por celda (día × franja), contando todo entry que
  // traslapa sin importar su lapso — el aula física no puede tener dos clases.
  const ocupadasPorCelda = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const e of entries) {
      for (const f of franjas) {
        if (!traslapan(f.inicio, f.fin, e.hora_inicio, e.hora_fin)) continue;
        const k = celdaKey(e.dia_semana, f);
        let s = map.get(k);
        if (!s) map.set(k, (s = new Set()));
        s.add(e.aula_id);
      }
    }
    return map;
  }, [entries, franjas]);

  // Conteo de clases por (aula, franja) en el día elegido — para el heatmap.
  // >1 en una celda = choque real de aula (visible en el panel de errores).
  const usoPorAula = useMemo(() => {
    const map = new Map<string, number>(); // `${aulaId}|${ini}|${fin}` → n
    for (const e of entries) {
      if (e.dia_semana !== diaOcup) continue;
      for (const f of franjas) {
        if (!traslapan(f.inicio, f.fin, e.hora_inicio, e.hora_fin)) continue;
        const k = `${e.aula_id}|${f.inicio}|${f.fin}`;
        map.set(k, (map.get(k) ?? 0) + 1);
      }
    }
    return map;
  }, [entries, franjas, diaOcup]);

  const ocupPct = useMemo(() => {
    const map = new Map<number, number>();
    if (franjas.length === 0) return map;
    for (const a of aulasActivas) {
      let n = 0;
      for (const f of franjas) {
        if ((usoPorAula.get(`${a.id}|${f.inicio}|${f.fin}`) ?? 0) > 0) n++;
      }
      map.set(a.id, Math.round((n / franjas.length) * 100));
    }
    return map;
  }, [aulasActivas, franjas, usoPorAula]);

  const sel = useMemo(() => {
    if (!celdaSel) return null;
    const [dia, ini, fin] = celdaSel.split('|');
    const ocupadas = ocupadasPorCelda.get(celdaSel) ?? new Set<number>();
    return {
      dia: Number(dia),
      franja: `${ini}–${fin}`,
      libres: aulasActivas.filter((a) => !ocupadas.has(a.id)),
      ocupadas: aulasActivas.filter((a) => ocupadas.has(a.id)),
    };
  }, [celdaSel, ocupadasPorCelda, aulasActivas]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <DoorOpen className="w-4 h-4 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Aulas libres / ocupación</h3>
              <p className="text-[10px] text-slate-500">
                {modo === 'libres'
                  ? 'Disponibilidad por día y franja — clic en una celda para ver cuáles'
                  : 'Mapa de calor por aula — verde libre, ámbar ocupada, rojo choque'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
              <button
                onClick={() => setModo('libres')}
                className={`px-2.5 py-1.5 text-[10px] font-bold cursor-pointer transition-colors ${
                  modo === 'libres' ? 'bg-emerald-600/30 text-emerald-200' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Libres
              </button>
              <button
                onClick={() => setModo('ocupacion')}
                className={`px-2.5 py-1.5 text-[10px] font-bold cursor-pointer transition-colors ${
                  modo === 'ocupacion' ? 'bg-amber-600/30 text-amber-200' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Ocupación
              </button>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {franjas.length === 0 ? (
            <p className="py-10 text-center text-slate-500 text-xs italic">
              No hay bloques horarios configurados.
            </p>
          ) : modo === 'ocupacion' ? (
            /* ═══ Vista heatmap: aula × franja para el día elegido ═══ */
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {dias.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDiaOcup(d)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border transition-colors ${
                      diaOcup === d
                        ? 'bg-amber-600/30 border-amber-500/50 text-amber-200'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {DIAS_NOMBRES[d]}
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="border-separate border-spacing-1 min-w-[640px]">
                  <thead>
                    <tr>
                      <th className="w-44 pb-1 text-left">
                        <span className="inline-block px-2 py-1 rounded-lg bg-slate-800/80 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                          Aula
                        </span>
                      </th>
                      {franjas.map((f) => (
                        <th key={`${f.inicio}-${f.fin}`} className="pb-1 min-w-12">
                          <span className="inline-block px-1 py-1 rounded-lg bg-slate-800/80 text-[8px] text-slate-400 font-bold text-center whitespace-nowrap">
                            {fmtHoraCfg(f.inicio, usa12)}
                          </span>
                        </th>
                      ))}
                      <th className="w-16 pb-1">
                        <span className="inline-block px-2 py-1 rounded-lg bg-slate-800/80 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                          Uso
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {aulasActivas.map((a) => (
                      <tr key={a.id} style={{ height: '1.75rem' }}>
                        <td className="text-[10px] text-slate-300 font-semibold pr-2 whitespace-nowrap align-middle">
                          {a.nombre}
                          <span className="block text-[8px] text-slate-600 font-normal">
                            {a.tipo.replace(/_/g, ' ')}{a.capacidad ? ` · ${a.capacidad}` : ''}
                          </span>
                        </td>
                        {franjas.map((f) => {
                          const n = usoPorAula.get(`${a.id}|${f.inicio}|${f.fin}`) ?? 0;
                          return (
                            <td key={`${f.inicio}-${f.fin}`} className="p-0">
                              <div
                                title={
                                  n === 0
                                    ? `${a.nombre}: libre ${fmtHora(f.inicio)}–${fmtHora(f.fin)}`
                                    : n === 1
                                      ? `${a.nombre}: 1 clase ${fmtHora(f.inicio)}–${fmtHora(f.fin)}`
                                      : `${a.nombre}: ¡${n} clases chochan! ${fmtHora(f.inicio)}–${fmtHora(f.fin)}`
                                }
                                className={`w-full h-6 rounded-md border ${
                                  n === 0
                                    ? 'bg-emerald-500/15 border-emerald-500/30'
                                    : n === 1
                                      ? 'bg-amber-500/30 border-amber-500/50'
                                      : 'bg-red-500/40 border-red-500/60'
                                } ${f.esReceso && n === 0 ? 'opacity-50' : ''}`}
                              />
                            </td>
                          );
                        })}
                        <td className="text-[10px] text-slate-400 text-center font-bold align-middle">
                          {ocupPct.get(a.id) ?? 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
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
                        <span className="inline-block w-full px-2 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-[11px] uppercase tracking-wider text-slate-200 font-bold text-center">
                          {DIAS_CORTOS[d]}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {franjas.map((f) => (
                    <tr key={`${f.inicio}-${f.fin}`} style={{ height: '2rem' }}>
                      <td className="text-[9px] text-slate-400 text-right pr-2 whitespace-nowrap align-middle">
                        {fmtHoraCfg(f.inicio, usa12)}–{fmtHoraCfg(f.fin, usa12)}
                        {f.esReceso && (
                          <span className="block text-[8px] text-slate-600 uppercase tracking-wider">receso</span>
                        )}
                      </td>
                      {dias.map((d) => {
                        const k = celdaKey(d, f);
                        const ocupadas = ocupadasPorCelda.get(k)?.size ?? 0;
                        const libres = aulasActivas.length - ocupadas;
                        const activa = celdaSel === k;
                        const pct = aulasActivas.length === 0 ? 1 : libres / aulasActivas.length;
                        return (
                          <td key={d} className="p-0">
                            <button
                              onClick={() => setCeldaSel(activa ? null : k)}
                              title={`${libres} de ${aulasActivas.length} aulas libres — ${DIAS_NOMBRES[d]} ${fmtHora(f.inicio)}`}
                              className={`w-full h-full min-h-7 rounded-lg border text-[10px] font-bold transition-colors cursor-pointer ${
                                activa
                                  ? 'ring-2 ring-emerald-400 border-emerald-400'
                                  : ''
                              } ${
                                pct === 1
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                                  : pct >= 0.5
                                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                                    : 'bg-red-500/15 border-red-500/40 text-red-300 hover:bg-red-500/25'
                              }`}
                            >
                              {libres}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {modo === 'libres' && sel && (
            <div className="rounded-xl border border-slate-700/70 bg-slate-800/40 p-3.5">
              <p className="text-[11px] font-bold text-slate-300 mb-2.5">
                {DIAS_NOMBRES[sel.dia]} {sel.franja} — {sel.libres.length} libre{sel.libres.length === 1 ? '' : 's'} de {aulasActivas.length}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sel.libres.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-[10px] font-semibold"
                    title={`${a.codigo}${a.capacidad ? ` · cap. ${a.capacidad}` : ''} · ${a.tipo.replace(/_/g, ' ')}`}
                  >
                    <Check className="w-3 h-3" /> {a.nombre}
                  </span>
                ))}
                {sel.libres.length === 0 && (
                  <span className="text-[10px] text-slate-500 italic">Todas las aulas están ocupadas en este slot.</span>
                )}
              </div>
              {sel.ocupadas.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {sel.ocupadas.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-700/40 border border-slate-600/50 text-slate-500 text-[10px]"
                      title={a.codigo}
                    >
                      <Ban className="w-3 h-3" /> {a.nombre}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
