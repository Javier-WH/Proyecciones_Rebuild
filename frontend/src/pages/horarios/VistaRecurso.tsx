import React, { useMemo } from 'react';
import { HorarioEntry, Turno, ErrorClase, DIAS_NOMBRES, fmtHoraCfg, minutos, normMateria } from './types.js';
import { ClaseCard, ClaseDividida } from './ClaseCard.js';
import { Clock, Coffee } from 'lucide-react';

// Vista de solo lectura: grilla días × bloques con las clases de un recurso
// (aula o profesor). Como un recurso puede tener clases en varios turnos con
// horarios distintos, la grilla se divide en bandas por turno — cada banda usa
// los bloques de su propio turno, igual que la vista por sección, así los
// bloques contiguos de una misma clase se fusionan en una sola celda.
interface VistaRecursoProps {
  titulo: string;
  entries: HorarioEntry[]; // ya filtradas por recurso
  turnos: Turno[];
  formato12?: boolean; // vista 12h; la BD siempre guarda 24h
  enError?: Map<string, ErrorClase[]> | null; // 'bloque_id:dia' → violaciones (punto rojo + tooltip)
  advertencias?: Map<number, string[]>; // entry.id → avisos (triángulo amarillo)
  avisosParciales?: Map<number, string[]>; // entry.id → choques parciales T2 (icono verde)
  parejasParciales?: Map<number, number[]>; // entry.id → ids de las clases T2/semestre que le chocan
  seccionesSemestrales?: Set<number>; // secciones cuyas clases trimestrales son de semestre
}

interface Banda {
  turno: Turno | null;
  bloques: { id: number; orden: number; hora_inicio: string; hora_fin: string; es_receso: number | boolean }[];
}

export const VistaRecurso: React.FC<VistaRecursoProps> = ({ titulo, entries, turnos, formato12, enError, advertencias, avisosParciales, parejasParciales, seccionesSemestrales }) => {
  // Orden fijo de bandas: Mañana → Tarde → Noche. Turnos con otros nombres
  // van al final, ordenados por su hora de inicio.
  const ordenTurno = (nombre: string): number => {
    const n = nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase();
    if (n.includes('MANANA') || n.includes('MATUT')) return 0;
    if (n.includes('TARDE') || n.includes('VESPERT')) return 1;
    if (n.includes('NOCHE') || n.includes('NOCTURN')) return 2;
    return 3;
  };

  // Bandas por turno: solo los turnos realmente usados por las clases
  // mostradas (si no hay clases, todos), en el orden fijo de turnos.
  const bandas = useMemo<Banda[]>(() => {
    const ids = new Set(entries.map((e) => e.turno_id));
    const usados = turnos.filter((t) => ids.has(t.id));
    const lista = (usados.length > 0 ? usados : turnos)
      .map((t) => ({
        turno: t,
        bloques: [...t.bloques].sort((a, b) => a.orden - b.orden),
      }))
      .filter((b) => b.bloques.length > 0);
    lista.sort(
      (a, b) =>
        ordenTurno(a.turno!.nombre) - ordenTurno(b.turno!.nombre) ||
        minutos(a.bloques[0].hora_inicio) - minutos(b.bloques[0].hora_inicio)
    );
    return lista;
  }, [entries, turnos]);

  // Entries cuyo bloque no existe en las bandas (dato inconsistente):
  // se muestran en una banda extra agrupadas por rango horario.
  const huerfanas = useMemo(() => {
    const bloqueIds = new Set(bandas.flatMap((b) => b.bloques.map((x) => x.id)));
    const resto = entries.filter((e) => !bloqueIds.has(e.bloque_id));
    if (resto.length === 0) return [];
    const rangos = new Map<string, { inicio: string; fin: string }>();
    for (const e of resto) rangos.set(`${e.hora_inicio}-${e.hora_fin}`, { inicio: e.hora_inicio, fin: e.hora_fin });
    const bloques = [...rangos.values()]
      .sort((a, b) => minutos(a.inicio) - minutos(b.inicio))
      .map((r, i) => ({ id: -(i + 1), orden: i, hora_inicio: r.inicio, hora_fin: r.fin, es_receso: false }));
    return [{ turno: null, bloques }] as Banda[];
  }, [bandas, entries]);

  const todasBandas = useMemo(() => [...bandas, ...huerfanas], [bandas, huerfanas]);

  // Columnas: unión de días habilitados por los turnos usados y de días
  // donde efectivamente hay clases (mínimo Lun–Vie)
  const dias = useMemo(() => {
    const set = new Set<number>();
    for (const b of bandas) {
      if (!b.turno) continue;
      String(b.turno.dias_semana).split(',').map(Number).filter(Boolean).forEach((d) => set.add(d));
    }
    for (const e of entries) set.add(e.dia_semana);
    const arr = [...set].sort((a, b) => a - b);
    return arr.length > 0 ? arr : [1, 2, 3, 4, 5];
  }, [bandas, entries]);

  const porCelda = useMemo(() => {
    const map = new Map<string, HorarioEntry[]>();
    for (const e of entries) {
      const k = `${e.bloque_id}:${e.dia_semana}`;
      const arr = map.get(k) || [];
      arr.push(e);
      map.set(k, arr);
    }
    return map;
  }, [entries]);

  const huerfanasPorCelda = useMemo(() => {
    const map = new Map<string, HorarioEntry[]>();
    for (const e of entries) {
      const k = `${e.hora_inicio}-${e.hora_fin}:${e.dia_semana}`;
      const arr = map.get(k) || [];
      arr.push(e);
      map.set(k, arr);
    }
    return map;
  }, [entries]);

  // Runs verticales por día dentro de cada banda: bloques consecutivos (sin
  // receso de por medio) con la misma materia+sección+aula se fusionan en una
  // sola celda (rowSpan). Solo se fusiona si cada celda tiene una sola clase.
  const { spans, cubiertas } = useMemo(() => {
    const spans = new Map<string, { n: number; fin: string }>();
    const cubiertas = new Set<string>();
    for (const { bloques } of bandas) {
      for (const d of dias) {
        let i = 0;
        while (i < bloques.length) {
          const b = bloques[i];
          if (b.es_receso) {
            i++;
            continue;
          }
          const cell = porCelda.get(`${b.id}:${d}`) || [];
          if (cell.length !== 1) {
            i++;
            continue;
          }
          const e = cell[0];
          let n = 1;
          let fin = b.hora_fin;
          let j = i + 1;
          while (j < bloques.length && !bloques[j].es_receso) {
            const nc = porCelda.get(`${bloques[j].id}:${d}`) || [];
            const nxt =
              nc.length === 1 &&
              nc[0].materia_id === e.materia_id &&
              nc[0].seccion_id === e.seccion_id &&
              nc[0].aula_id === e.aula_id
                ? nc[0]
                : null;
            if (!nxt) break;
            cubiertas.add(`${bloques[j].id}:${d}`);
            n++;
            fin = bloques[j].hora_fin;
            j++;
          }
          if (n > 1) spans.set(`${b.id}:${d}`, { n, fin });
          i = j;
        }
      }
    }
    return { spans, cubiertas };
  }, [bandas, dias, porCelda]);

  // Parejas del choque parcial T2↔semestre que están en ESTA vista del
  // recurso (un choque de aula puede ser con otra sección/profesor que no
  // aparece aquí → se ignora). Son exactamente los pares del icono verde.
  const porId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const parejasDe = (e: HorarioEntry): HorarioEntry[] =>
    (parejasParciales?.get(e.id) ?? [])
      .map((id) => porId.get(id))
      .filter((x): x is HorarioEntry => !!x);

  // Identidad de materia dentro de la división: las parejas suelen ser
  // varias entries de la MISMA clase (una por hora); deben formar un solo
  // bloque, no una región por hora intercalada.
  const claveMateria = (e: HorarioEntry) =>
    `${e.seccion_id}|${normMateria(e.materia_nombre)}|${e.profesor_id ?? 0}`;

  // Tarjetas a renderizar en una celda, agrupadas por materia: las propias
  // de la celda más las parejas de choque parcial de todas ellas (pueden
  // estar en otra banda/turno). Solo se divide cuando hay pareja real del
  // icono verde.
  const grupoDe = (items: HorarioEntry[]): HorarioEntry[][] => {
    const map = new Map<string, HorarioEntry[]>();
    for (const e of items) {
      for (const x of [e, ...parejasDe(e)]) {
        const k = claveMateria(x);
        const g = map.get(k);
        if (g) g.push(x);
        else map.set(k, [x]);
      }
    }
    return [...map.values()];
  };

  // Lapso a mostrar: las clases de secciones SEMESTRALES se registran como
  // T1/T3 (cursan todo el semestre) → se etiquetan como el semestre real,
  // no como el trimestre donde están archivadas.
  const lapsoTexto = (e: HorarioEntry) =>
    e.tipo_proyeccion === 'SEMESTRAL'
      ? `Semestre ${e.trimestre}`
      : seccionesSemestrales?.has(e.seccion_id)
      ? `Semestre ${e.trimestre === 1 ? '1' : e.trimestre === 3 ? '2' : '1/2'}`
      : `Trimestre ${e.trimestre}`;

  // Indicadores de un grupo (unión de los de todas sus entries/horas) y su
  // rango horario completo (primera hora de inicio → última hora de fin)
  const itemDividido = (g: HorarioEntry[]) => ({
    entry: g[0],
    lapsoTexto: lapsoTexto(g[0]),
    horas: (() => {
      const ini = g.map((x) => x.hora_inicio).sort()[0];
      const fin = g.map((x) => x.hora_fin).sort().slice(-1)[0];
      return `${fmtHoraCfg(ini, formato12)}–${fmtHoraCfg(fin, formato12)}`;
    })(),
    errores: [
      ...new Map(
        g
          .flatMap((x) => enError?.get(`${x.bloque_id}:${x.dia_semana}`) ?? [])
          .map((t) => [`${t.titulo}|${t.texto}`, t])
      ).values(),
    ],
    advertencias: [...new Set(g.flatMap((x) => advertencias?.get(x.id) ?? []))],
    avisosParciales: [...new Set(g.flatMap((x) => avisosParciales?.get(x.id) ?? []))],
  });

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
          {todasBandas.map(({ turno, bloques }) => (
            <React.Fragment key={turno ? turno.id : 'otras'}>
              {todasBandas.length > 1 && (
                <tr style={{ height: '1.5rem' }}>
                  <td colSpan={dias.length + 1} className="align-middle">
                    <span className="text-[9px] font-bold tracking-[0.3em] text-slate-500 uppercase">
                      {turno ? turno.nombre : 'Otras horas'}
                    </span>
                  </td>
                </tr>
              )}
              {bloques.map((b, bIdx) => {
                const esReceso = !!b.es_receso;
                const celdaKey = (d: number) => (b.id > 0 ? `${b.id}:${d}` : `${b.hora_inicio}-${b.hora_fin}:${d}`);
                const ocupacion = (d: number) =>
                  (b.id > 0 ? porCelda : huerfanasPorCelda).get(celdaKey(d)) || [];
                if (esReceso) {
                  const ocupada = dias.some((d) => ocupacion(d).length > 0);
                  return (
                    <tr key={b.id} style={{ height: '1.75rem' }}>
                      <td className="text-[9px] text-slate-500 text-right pr-2 whitespace-nowrap">
                        {fmtHoraCfg(b.hora_inicio, formato12)}–{fmtHoraCfg(b.hora_fin, formato12)}
                      </td>
                      {ocupada ? (
                        dias.map((d) => {
                          const items = ocupacion(d);
                          const dividir = items.some((e) => parejasDe(e).length > 0);
                          return (
                            <td key={d} className="relative p-0 align-top" style={{ height: '1.75rem' }}>
                              <div className="absolute inset-0 p-0.5">
                                {!dividir ? (
                                  <div className="h-full flex flex-col gap-1">
                                    {items.map((e) => (
                                      <ClaseCard
                                        key={e.id}
                                        entry={e}
                                        compacto={items.length > 1}
                                        usa12h={formato12}
                                        errores={enError?.get(`${e.bloque_id}:${e.dia_semana}`) ?? []}
                                        advertencias={advertencias?.get(e.id)}
                                        avisosParciales={avisosParciales?.get(e.id)}
                                      />
                                    ))}
                                  </div>
                                ) : (
                                  <ClaseDividida items={grupoDe(items).map(itemDividido)} />
                                )}
                              </div>
                            </td>
                          );
                        })
                      ) : (
                        <td
                          colSpan={dias.length}
                          className="rounded-lg bg-slate-800/50 border border-dashed border-slate-700/60 text-center"
                        >
                          <span className="text-[9px] font-bold tracking-[0.3em] text-slate-600 uppercase inline-flex items-center gap-1">
                            <Coffee className="w-3 h-3" /> Receso
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                }
                return (
                  <tr key={b.id} style={{ height: '3.5rem' }}>
                    <td className="text-[9px] text-slate-400 text-right pr-2 whitespace-nowrap align-middle">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {fmtHoraCfg(b.hora_inicio, formato12)}–{fmtHoraCfg(b.hora_fin, formato12)}
                      </span>
                    </td>
                    {dias.map((d) => {
                      const key = celdaKey(d);
                      if (b.id > 0 && cubiertas.has(key)) return null;
                      const items = ocupacion(d);
                      const sp = b.id > 0 ? spans.get(key) : undefined;
                      const fusion = items.length === 1 && sp && sp.n > 1;
                      // Errores de la tarjeta o de alguna celda que absorbe por rowspan
                      const errsDe = (e?: HorarioEntry): ErrorClase[] => {
                        if (!enError) return [];
                        if (e) return enError.get(`${e.bloque_id}:${e.dia_semana}`) ?? [];
                        const acc: ErrorClase[] = [];
                        const push = (k: string) => {
                          for (const t of enError.get(k) ?? []) {
                            if (!acc.some((m) => m.titulo === t.titulo && m.texto === t.texto))
                              acc.push(t);
                          }
                        };
                        for (const x of items) push(`${x.bloque_id}:${x.dia_semana}`);
                        for (let k = 0; k < (sp?.n ?? 1); k++) {
                          const bl = bloques[bIdx + k];
                          if (bl) push(`${bl.id}:${d}`);
                        }
                        return acc;
                      };
                      // Choques parciales T2 de la tarjeta, incluidos los de las
                      // celdas que absorbe el rowspan (cada bloque es un entry).
                      const parDe = (e?: HorarioEntry): string[] => {
                        if (!avisosParciales) return [];
                        const acc: string[] = [];
                        const pushE = (x: HorarioEntry) => {
                          for (const t of avisosParciales.get(x.id) ?? []) {
                            if (!acc.includes(t)) acc.push(t);
                          }
                        };
                        if (e) {
                          pushE(e);
                        } else {
                          for (const x of items) pushE(x);
                          for (let k = 0; k < (sp?.n ?? 1); k++) {
                            const bl = bloques[bIdx + k];
                            if (bl) for (const x of porCelda.get(`${bl.id}:${d}`) ?? []) pushE(x);
                          }
                        }
                        return acc;
                      };
                      return (
                        <td
                          key={d}
                          rowSpan={fusion ? sp.n : undefined}
                          className="relative p-0 align-top"
                          style={{ height: '3.5rem' }}
                        >
                          <div className="absolute inset-0 p-0.5">
                            {(() => {
                              // Parejas del choque parcial de TODAS las celdas
                              // que absorbe el rowspan: si alguna choca con el
                              // trimestre 2, el bloque se divide.
                              const itemsRun: HorarioEntry[] = [];
                              for (let k = 0; k < (fusion ? sp!.n : 1); k++) {
                                const bl = bloques[bIdx + k];
                                if (!bl) break;
                                const kk =
                                  bl.id > 0 ? `${bl.id}:${d}` : `${bl.hora_inicio}-${bl.hora_fin}:${d}`;
                                itemsRun.push(
                                  ...((bl.id > 0 ? porCelda : huerfanasPorCelda).get(kk) ?? [])
                                );
                              }
                              if (itemsRun.some((e) => parejasDe(e).length > 0)) {
                                return (
                                  <ClaseDividida
                                    items={grupoDe(itemsRun.length > 0 ? itemsRun : items).map(itemDividido)}
                                  />
                                );
                              }
                              return (
                                <div className="h-full flex flex-col gap-1">
                                  {items.map((e) => (
                                    <ClaseCard
                                      key={e.id}
                                      entry={e}
                                      fin={fusion ? sp.fin : undefined}
                                      compacto={items.length > 1}
                                      usa12h={formato12}
                                      errores={items.length > 1 ? errsDe(e) : errsDe()}
                                      advertencias={advertencias?.get(e.id)}
                                      avisosParciales={parDe(items.length > 1 ? e : undefined)}
                                    />
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
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
