import React, { useMemo } from 'react';
import { HorarioEntry, Turno, DIAS_NOMBRES, DIAS_CORTOS, fmtHora, minutos, colorMateria } from './types.js';
import { Clock, Coffee } from 'lucide-react';

interface ItemCelda {
  e: HorarioEntry;
  span: number;
  fin: string;
}

const ChipClase: React.FC<{
  item: ItemCelda;
  renderLinea2: (e: HorarioEntry) => string;
  compacto?: boolean;
}> = ({ item, renderLinea2, compacto }) => (
  <div
    className={`rounded-lg border px-2 py-1.5 flex flex-col justify-center ${colorMateria(item.e.materia_id)} ${
      compacto ? 'flex-1 min-h-0 overflow-hidden' : 'h-full'
    }`}
  >
    <div
      className={`${item.span > 1 ? 'text-[11px]' : 'text-[10px]'} font-bold leading-tight ${
        compacto ? 'line-clamp-1' : 'line-clamp-2'
      }`}
    >
      {item.e.materia_nombre}
    </div>
    <div className="text-[9px] opacity-75 leading-tight mt-0.5 line-clamp-1">
      {renderLinea2(item.e)}
      {item.span > 1 && ` · ${fmtHora(item.e.hora_inicio)}–${fmtHora(item.fin)}`}
    </div>
    {!compacto && (
      <div className="text-[8px] opacity-60 mt-0.5">
        {item.e.seccion_nombre} · {item.e.turno_nombre}
      </div>
    )}
  </div>
);

// Vista de solo lectura: grilla días × rangos horarios con las clases de un
// recurso (aula o profesor). Las filas son rangos hora_inicio–hora_fin únicos.
interface VistaRecursoProps {
  titulo: string;
  entries: HorarioEntry[]; // ya filtradas por recurso
  turnos: Turno[];
  renderLinea2: (e: HorarioEntry) => string;
}

export const VistaRecurso: React.FC<VistaRecursoProps> = ({ titulo, entries, turnos, renderLinea2 }) => {
  // Filas: rangos horarios únicos (de bloques de turnos y de las propias entries)
  const filas = useMemo(() => {
    const map = new Map<string, { inicio: string; fin: string; esReceso: boolean }>();
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
    for (const e of entries) {
      const k = `${e.hora_inicio}-${e.hora_fin}`;
      if (!map.has(k)) map.set(k, { inicio: e.hora_inicio, fin: e.hora_fin, esReceso: false });
    }
    return [...map.values()].sort((a, b) => minutos(a.inicio) - minutos(b.inicio));
  }, [turnos, entries]);

  // Columnas: unión de días habilitados por los turnos (mínimo Lun–Vie)
  const dias = useMemo(() => {
    const set = new Set<number>();
    for (const t of turnos) {
      String(t.dias_semana).split(',').map(Number).filter(Boolean).forEach((d) => set.add(d));
    }
    const arr = [...set].sort((a, b) => a - b);
    return arr.length > 0 ? arr : [1, 2, 3, 4, 5];
  }, [turnos]);

  const porCelda = useMemo(() => {
    const map = new Map<string, HorarioEntry[]>();
    for (const e of entries) {
      const k = `${e.hora_inicio}-${e.hora_fin}:${e.dia_semana}`;
      const arr = map.get(k) || [];
      arr.push(e);
      map.set(k, arr);
    }
    return map;
  }, [entries]);

  // Runs verticales por día: clases consecutivas (misma materia+sección+aula, en
  // rangos contiguos sin receso) se fusionan en una sola celda (rowSpan).
  // Solo se fusiona cuando cada celda del run contiene exactamente una clase.
  const itemsPorCelda = useMemo(() => {
    const items = new Map<string, ItemCelda[]>();
    const cubiertas = new Set<number>();
    for (const d of dias) {
      for (let i = 0; i < filas.length; i++) {
        const f = filas[i];
        if (f.esReceso) continue;
        const key = `${f.inicio}-${f.fin}:${d}`;
        const cell = porCelda.get(key) || [];
        const arr: ItemCelda[] = [];
        for (const e of cell) {
          if (cubiertas.has(e.id)) continue;
          let span = 1;
          let fin = f.fin;
          if (cell.length === 1) {
            let j = i + 1;
            while (j < filas.length && !filas[j].esReceso && filas[j].inicio === fin) {
              const nk = `${filas[j].inicio}-${filas[j].fin}:${d}`;
              const nc = porCelda.get(nk) || [];
              const nxt =
                nc.length === 1 &&
                nc[0].materia_id === e.materia_id &&
                nc[0].seccion_id === e.seccion_id &&
                nc[0].aula_id === e.aula_id
                  ? nc[0]
                  : null;
              if (!nxt) break;
              cubiertas.add(nxt.id);
              span++;
              fin = filas[j].fin;
              j++;
            }
          }
          arr.push({ e, span, fin });
        }
        items.set(key, arr);
      }
    }
    return items;
  }, [filas, dias, porCelda]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 overflow-x-auto">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold px-1 pb-2">{titulo}</div>
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
                  {DIAS_NOMBRES[d]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const key = `${f.inicio}-${f.fin}`;
            if (f.esReceso && ![...porCelda.keys()].some((k) => k.startsWith(key))) {
              return (
                <tr key={key} style={{ height: '1.5rem' }}>
                  <td className="text-[9px] text-slate-500 text-right pr-2 whitespace-nowrap">
                    {fmtHora(f.inicio)}–{fmtHora(f.fin)}
                  </td>
                  <td
                    colSpan={dias.length}
                    className="h-6 rounded-lg bg-slate-800/50 border border-dashed border-slate-700/60 text-center"
                  >
                    <span className="text-[9px] font-bold tracking-[0.3em] text-slate-600 uppercase inline-flex items-center gap-1">
                      <Coffee className="w-3 h-3" /> Receso
                    </span>
                  </td>
                </tr>
              );
            }
            return (
              <tr key={key} style={{ height: '3rem' }}>
                <td className="text-[9px] text-slate-400 text-right pr-2 whitespace-nowrap align-middle">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {fmtHora(f.inicio)}–{fmtHora(f.fin)}
                  </span>
                </td>
                {dias.map((d) => {
                  const items = itemsPorCelda.get(`${key}:${d}`) || [];
                  const cell = porCelda.get(`${key}:${d}`) || [];
                  if (cell.length > 0 && items.length === 0) return null; // cubierta por rowspan
                  const unico = items.length === 1 ? items[0] : null;
                  const fusion = unico !== null && unico.span > 1;
                  return (
                    <td
                      key={d}
                      rowSpan={fusion ? unico.span : undefined}
                      className="relative p-0 align-top"
                      style={{ height: '3rem' }}
                    >
                      <div className="absolute inset-0 p-0.5 flex flex-col gap-1">
                        {items.map((it) => (
                          <ChipClase
                            key={it.e.id}
                            item={it}
                            renderLinea2={renderLinea2}
                            compacto={items.length > 1}
                          />
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {entries.length === 0 && (
        <div className="text-center text-slate-500 text-xs italic py-6">
          Sin clases agendadas en este lapso.
        </div>
      )}
    </div>
  );
};
