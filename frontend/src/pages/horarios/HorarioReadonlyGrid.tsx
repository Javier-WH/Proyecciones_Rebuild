import React, { useMemo } from 'react';
import { Turno, HorarioEntry, DIAS_NOMBRES, fmtHoraCfg } from './types.js';
import { ClaseCard } from './ClaseCard.js';
import { Clock, Coffee } from 'lucide-react';

// Versión de solo lectura de la grilla días × bloques de SeccionGrid:
// misma estética (chips de día, filas de receso, tarjetas con rowspan por
// horas consecutivas) pero sin drag & drop ni menús de edición.
export const HorarioReadonlyGrid: React.FC<{
  turno: Turno;
  entries: HorarioEntry[]; // clases de este turno (ya filtradas al docente)
  usa12h?: boolean;
}> = ({ turno, entries, usa12h }) => {
  const bloques = useMemo(
    () => [...(turno?.bloques ?? [])].sort((a, b) => a.orden - b.orden),
    [turno]
  );
  const dias = useMemo(
    () =>
      (turno?.dias_semana ?? '')
        .split(',')
        .map(Number)
        .filter(Boolean)
        .sort(),
    [turno]
  );

  // Entries del turno indexados por celda (bloque:día)
  const porCelda = useMemo(() => {
    const map = new Map<string, HorarioEntry>();
    for (const e of entries) map.set(`${e.bloque_id}:${e.dia_semana}`, e);
    return map;
  }, [entries]);

  // Runs verticales por día: bloques consecutivos (sin receso) de la misma
  // materia+aula se fusionan en una sola celda (rowSpan), igual que SeccionGrid.
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

  if (bloques.length === 0 || dias.length === 0) return null;

  return (
    <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-2xl p-3">
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
          {bloques.map((b) =>
            b.es_receso ? (
              <tr key={b.id} style={{ height: '1.75rem' }}>
                <td className="text-[9px] text-slate-500 text-right pr-2 whitespace-nowrap">
                  {fmtHoraCfg(b.hora_inicio, usa12h)}–{fmtHoraCfg(b.hora_fin, usa12h)}
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
                    {fmtHoraCfg(b.hora_inicio, usa12h)}–{fmtHoraCfg(b.hora_fin, usa12h)}
                  </span>
                </td>
                {dias.map((d) => {
                  const key = `${b.id}:${d}`;
                  if (cubiertas.has(key)) return null; // cubierta por rowspan
                  const entry = porCelda.get(key);
                  const sp = spans.get(key);
                  const cls = entry
                    ? 'relative rounded-lg border align-top p-0 border-transparent bg-transparent overflow-hidden'
                    : 'relative rounded-lg border align-top p-1 border-slate-800 bg-slate-950/40 overflow-hidden';
                  return (
                    <td key={d} rowSpan={sp?.n ?? 1} className={cls} style={{ height: '3.5rem' }}>
                      {entry && (
                        <div className="absolute inset-0 p-0.5">
                          <ClaseCard
                            entry={entry}
                            fin={sp && sp.n > 1 ? sp.fin : undefined}
                            usa12h={usa12h}
                          />
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
};
