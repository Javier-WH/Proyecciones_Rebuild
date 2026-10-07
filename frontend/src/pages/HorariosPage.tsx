import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { MateriaAsignableRow, labelLapso } from './AgregarMateriaModal.js';
import { SeccionGrid } from './horarios/SeccionGrid.js';
import { AulasPanel } from './horarios/AulasPanel.js';
import { TurnosPanel } from './horarios/TurnosPanel.js';
import { VistaRecurso } from './horarios/VistaRecurso.js';
import { ReporteHorarioModal } from './ReporteHorarioModal.js';
import { ProfesorModal, Profesor } from './ProfesorModal.js';
import {
  Aula,
  HorarioEntry,
  HorarioConfig,
  SeccionRef,
  Turno,
  seccionesDe,
  sortAulas,
  fmtHora,
  fmtHoraCfg,
  formatearHorasEnTexto,
  minutos,
  traslapan,
  relacionLapsos,
  DIAS_NOMBRES,
  ErrorClase,
  pnfLabel,
  normMateria,
} from './horarios/types.js';
import {
  CalendarClock,
  Loader2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Eraser,
  Building2,
  Clock,
  Printer,
  Users,
  Crosshair,
  CheckCircle2,
  Search,
  Pencil,
  Square,
  CheckSquare,
  ShieldAlert,
  Wand2,
} from 'lucide-react';

export type HorariosSubTab = 'horario' | 'aulas' | 'turnos';
type Vista = 'seccion' | 'aula' | 'profesor';

interface HorariosPageProps {
  subTab?: HorariosSubTab;
  onSubTabChange?: (t: HorariosSubTab) => void;
  configTick?: number; // se incrementa al guardar ConfigHorariosModal → recarga la config
}

interface ProfesorLite {
  id: number;
  nombres: string;
  apellidos: string;
}

interface Violacion {
  seccion_id: number;
  dia: number;
  bloques: number[]; // bloque_ids a resaltar en la grilla de la sección
  detalle: string;
  error: string;
  titulo?: string; // línea destacada en el panel/tooltip (choques)
  lineas?: string[]; // viñetas con la ficha de cada clase involucrada
}

// Slot en que un profesor NO está disponible (tabla profesor_disponibilidad = bloqueos)
interface DispSlot {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

export const HorariosPage: React.FC<HorariosPageProps> = ({ subTab, onSubTabChange, configTick }) => {
  const { user } = useAuth();
  const puedeEditar = user?.role === 'SUPER_USUARIO' || user?.role === 'ADMINISTRADOR' || user?.role === 'REGULAR';

  const [tab, setTab] = useState<HorariosSubTab>(subTab ?? 'horario');
  useEffect(() => {
    if (subTab) setTab(subTab);
  }, [subTab]);
  const cambiarTab = (t: HorariosSubTab) => {
    setTab(t);
    onSubTabChange?.(t);
  };

  const [rows, setRows] = useState<MateriaAsignableRow[]>([]);
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [entries, setEntries] = useState<HorarioEntry[]>([]);
  const [profesores, setProfesores] = useState<ProfesorLite[]>([]);
  const [pnfOptions, setPnfOptions] = useState<Array<[number, string]>>([]);
  const [config, setConfig] = useState<HorarioConfig>({ min_horas_bloque: 2, max_horas_dia: 3 });
  const usa12 = !!config.formato_12h; // vista 12h; la BD siempre guarda 24h
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ error: boolean; texto: string } | null>(null);

  const [lapsoSel, setLapsoSel] = useState<string>(''); // 'TRIMESTRAL:1'
  const [vista, setVista] = useState<Vista>('seccion');
  const [seccionId, setSeccionId] = useState<number | null>(null);
  const [pnfSel, setPnfSel] = useState('');
  const [trayectoSel, setTrayectoSel] = useState('');
  const [turnoSel, setTurnoSel] = useState('');
  const [aulaId, setAulaId] = useState<number | null>(null);
  const [profesorId, setProfesorId] = useState<number | null>(null);
  const [generando, setGenerando] = useState(false);
  const [resolviendo, setResolviendo] = useState(false);
  const [reporteOpen, setReporteOpen] = useState(false);
  const [erroresOpen, setErroresOpen] = useState(false);
  const [forzar, setForzar] = useState(false); // mover clases ignorando solapes de aula/profesor/sección
  const [dispProfs, setDispProfs] = useState<Map<number, DispSlot[]>>(new Map()); // bloqueos por profesor
  const [resaltar, setResaltar] = useState<Set<string> | null>(null);
  const [profEdit, setProfEdit] = useState<Profesor | null>(null);
  // Trimestres ocultos en las vistas por aula/profesor de un lapso semestral
  // (ambos activos por defecto). Las clases de secciones semestrales — que se
  // registran como T1/T3 — no se ocultan: SON la clase del semestre.
  const [trisOcultos, setTrisOcultos] = useState<Set<number>>(new Set());
  const toggleTriOculto = (t: number) =>
    setTrisOcultos((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  // Semestres ocultos viendo el trimestre 2 por aula/profesor: S1 y S2 son
  // rivales parciales de T2 (aviso verde, no conflicto duro).
  const [semsOcultos, setSemsOcultos] = useState<Set<number>>(new Set());
  const toggleSemOculto = (t: number) =>
    setSemsOcultos((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  const lapsos = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(`${r.tipo_proyeccion}:${r.trimestre}`);
    return [...set].sort();
  }, [rows]);

  const lapso = useMemo(() => {
    const [tipo, n] = (lapsoSel || lapsos[0] || 'TRIMESTRAL:1').split(':');
    return { tipo, n: Number(n) };
  }, [lapsoSel, lapsos]);

  const rowsLapso = useMemo(
    () => rows.filter((r) => r.tipo_proyeccion === lapso.tipo && r.trimestre === lapso.n),
    [rows, lapso]
  );

  const secciones = useMemo(() => seccionesDe(rowsLapso), [rowsLapso]);

  // Selectores en cascada: PNF → Trayecto → Turno → Sección. Si el valor
  // elegido deja de existir en las opciones, se usa la primera disponible.
  const pnfOpts = useMemo(
    () => [...new Set(secciones.map((s) => s.pnf_nombre))].sort(),
    [secciones]
  );
  const pnfEff = pnfOpts.includes(pnfSel) ? pnfSel : pnfOpts[0];
  const trayectoOpts = useMemo(
    () =>
      [...new Set(secciones.filter((s) => s.pnf_nombre === pnfEff).map((s) => s.trayecto_nombre))].sort(),
    [secciones, pnfEff]
  );
  const trayectoEff = trayectoOpts.includes(trayectoSel) ? trayectoSel : trayectoOpts[0];
  const turnoOpts = useMemo(
    () =>
      [
        ...new Set(
          secciones
            .filter((s) => s.pnf_nombre === pnfEff && s.trayecto_nombre === trayectoEff)
            .map((s) => s.turno_nombre)
        ),
      ].sort(),
    [secciones, pnfEff, trayectoEff]
  );
  const turnoEff = turnoOpts.includes(turnoSel) ? turnoSel : turnoOpts[0];
  const seccionesFiltradas = useMemo(
    () =>
      secciones.filter(
        (s) =>
          s.pnf_nombre === pnfEff && s.trayecto_nombre === trayectoEff && s.turno_nombre === turnoEff
      ),
    [secciones, pnfEff, trayectoEff, turnoEff]
  );
  const seccion =
    seccionesFiltradas.find((s) => s.seccion_id === seccionId) ??
    seccionesFiltradas[0] ??
    secciones[0] ??
    null;
  const turnoSeccion = seccion ? turnos.find((t) => t.saga_id === seccion.turno_saga_id) : undefined;

  const materiasSeccion = useMemo(
    () => (seccion ? rowsLapso.filter((r) => r.seccion_id === seccion.seccion_id) : []),
    [rowsLapso, seccion]
  );

  // Opciones del selector de lapso: en la vista por sección se destacan los
  // lapsos donde ESA sección tiene materias (una sección semestral muestra
  // "Semestre 1/2"); el resto de lapsos de otras proyecciones queda debajo de
  // un separador para poder navegar a ellas. En aula/profesor: todos.
  const lapsosOpciones = useMemo(() => {
    if (vista !== 'seccion' || !seccion) return { propios: lapsos, otros: [] as string[] };
    const set = new Set<string>();
    for (const r of rows) {
      if (r.seccion_id === seccion.seccion_id) set.add(`${r.tipo_proyeccion}:${r.trimestre}`);
    }
    const propios = [...set].sort();
    const otros = lapsos.filter((l) => !set.has(l));
    return { propios: propios.length > 0 ? propios : lapsos, otros: propios.length > 0 ? otros : [] };
  }, [rows, seccion, lapsos, vista]);

  // Auditoría del lapso: choques de sección/profesor/aula, clases en receso o
  // fuera de los días del turno, y violaciones de las reglas de generación
  // (mínimo de horas seguidas por sesión / máximo de horas por día).
  const violaciones = useMemo<Violacion[]>(() => {
    const out: Violacion[] = [];
    const secById = new Map(secciones.map((s) => [s.seccion_id, s]));
    const turnoBySaga = new Map<number, Turno>(
      turnos.filter((t) => t.saga_id != null).map((t) => [t.saga_id as number, t])
    );
    const profDe = (e: HorarioEntry) =>
      e.profesor_id
        ? `${e.prof_apellidos ?? ''}, ${e.prof_nombres ?? ''}`.replace(/^,\s*/, '')
        : 'sin profesor asignado';
    const cuando = (e: HorarioEntry) =>
      `el ${DIAS_NOMBRES[e.dia_semana]} ${fmtHoraCfg(e.hora_inicio, usa12)}–${fmtHoraCfg(e.hora_fin, usa12)}`;

    // `entries` incluye los lapsos rivales (totales y parciales). Las
    // auditorías por clase (receso, día del turno, disponibilidad) aplican
    // solo a las del lapso actual.
    const esLocal = (e: HorarioEntry) =>
      e.tipo_proyeccion === lapso.tipo && e.trimestre === lapso.n;

    const pnfDe = (e: HorarioEntry) => secById.get(e.seccion_id)?.pnf_nombre ?? '—';
    const lapsoTag = (e: HorarioEntry) =>
      e.tipo_proyeccion === 'SEMESTRAL' ? `semestre ${e.trimestre}` : `trimestre ${e.trimestre}`;
    // Ficha de una línea que identifica la clase en las viñetas del panel.
    const ficha = (e: HorarioEntry) =>
      `'${e.materia_nombre}' — ${pnfLabel(pnfDe(e))} · Sección ${e.seccion_nombre} · ` +
      `Turno ${e.turno_nombre}` +
      (e.profesor_id ? ` · ${profDe(e)}` : '') +
      (esLocal(e) ? '' : ` · ${lapsoTag(e)}`);

    // Clase en bloque de receso o en día no habilitado para el turno.
    // Los recesos de 10 min o menos se ignoran (son pausas entre horas).
    for (const e of entries) {
      if (!esLocal(e)) continue;
      if (e.es_receso) {
        if (minutos(e.hora_fin) - minutos(e.hora_inicio) <= 10) continue;
        out.push({
          seccion_id: e.seccion_id,
          dia: e.dia_semana,
          bloques: [e.bloque_id],
          detalle: '',
          titulo: 'Clase en receso',
          error: 'La clase quedó en un bloque de receso de más de 10 minutos:',
          lineas: [ficha(e), cuando(e)],
        });
        continue;
      }
      const t = turnoBySaga.get(e.turno_saga_id);
      if (t && !String(t.dias_semana).split(',').map(Number).includes(e.dia_semana)) {
        out.push({
          seccion_id: e.seccion_id,
          dia: e.dia_semana,
          bloques: [e.bloque_id],
          detalle: '',
          titulo: 'Día no habilitado',
          error: `El turno '${t.nombre}' no tiene habilitado ese día:`,
          lineas: [ficha(e), cuando(e)],
        });
      }
      // Profesor en un slot que marcó como no disponible (traslapa por hora real)
      if (!e.es_receso && e.profesor_id) {
        const bloq = dispProfs.get(e.profesor_id);
        const hit = bloq?.find(
          (d) =>
            d.dia_semana === e.dia_semana &&
            minutos(d.hora_inicio) < minutos(e.hora_fin) &&
            minutos(d.hora_fin) > minutos(e.hora_inicio)
        );
        if (hit) {
          out.push({
            seccion_id: e.seccion_id,
            dia: e.dia_semana,
            bloques: [e.bloque_id],
            detalle: '',
            titulo: 'Profesor no disponible',
            error:
              `El profesor ${profDe(e)} no está disponible el ${DIAS_NOMBRES[e.dia_semana]} ` +
              `de ${fmtHoraCfg(hit.hora_inicio, usa12)} a ${fmtHoraCfg(hit.hora_fin, usa12)}:`,
            lineas: [ficha(e), cuando(e)],
          });
        }
      }
    }

    // Choques: dos clases traslapadas compartiendo sección, profesor o aula.
    // Formato: título + frase corta con el recurso compartido + viñetas con la
    // ficha de cada clase y la ventana de solape.
    const solape = (a: HorarioEntry, b: HorarioEntry) => {
      const ini = Math.max(minutos(a.hora_inicio), minutos(b.hora_inicio));
      const fin = Math.min(minutos(a.hora_fin), minutos(b.hora_fin));
      const h = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      return `${DIAS_NOMBRES[a.dia_semana]} ${fmtHoraCfg(h(ini), usa12)}–${fmtHoraCfg(h(fin), usa12)}`;
    };
    const choques: [
      string,
      (b: HorarioEntry, a: HorarioEntry) => string,
      (e: HorarioEntry) => string | null,
    ][] = [
      [
        'Conflicto de Sección',
        (b) => `La sección ${b.seccion_nombre} tiene dos clases solapadas:`,
        (e) => `s:${e.seccion_id}:${e.dia_semana}`,
      ],
      [
        'Conflicto de Profesor',
        (b) => `El profesor ${profDe(b)} tiene dos clases solapadas:`,
        (e) => (e.profesor_id ? `p:${e.profesor_id}:${e.dia_semana}` : null),
      ],
      [
        'Conflicto de Aula',
        (b) =>
          `El aula ${b.aula_codigo || b.aula_nombre} está ocupada por dos clases ` +
          `a la misma hora:`,
        (e) => `a:${e.aula_id}:${e.dia_semana}`,
      ],
    ];
    for (const [titulo, descFn, keyFn] of choques) {
      const grupos = new Map<string, HorarioEntry[]>();
      for (const e of entries) {
        const k = keyFn(e);
        if (!k) continue;
        const g = grupos.get(k);
        if (g) g.push(e);
        else grupos.set(k, [e]);
      }
      for (const g of grupos.values()) {
        for (let i = 0; i < g.length; i++) {
          for (let j = i + 1; j < g.length; j++) {
            const [a, b] = [g[i], g[j]];
            if (!traslapan(a.hora_inicio, a.hora_fin, b.hora_inicio, b.hora_fin)) continue;
            // Solo chocan lapsos que coexisten por completo: mismo lapso,
            // T1↔S1 o T3↔S2. Los parciales (T2↔semestre) solo se avisan con
            // el icono verde; los sin relación (T1↔T2, S1↔S2…) no pueden chocar.
            if (relacionLapsos(a, b) !== 'total') continue;
            // Se marcan las celdas de AMBAS clases (los bloque_id son únicos
            // por turno, así no hay colisiones entre lapsos).
            const local = esLocal(b) ? b : esLocal(a) ? a : b;
            const otro = local === b ? a : b;
            out.push({
              seccion_id: local.seccion_id,
              dia: a.dia_semana,
              bloques: [...new Set([a.bloque_id, b.bloque_id])],
              detalle: '',
              titulo,
              error: descFn(local, otro),
              lineas: [ficha(local), ficha(otro), solape(a, b)],
            });
          }
        }
      }
    }

    // Reglas de generación por materia+sección+día
    const porDia = new Map<string, HorarioEntry[]>();
    for (const e of entries) {
      if (e.es_receso || !esLocal(e)) continue;
      const k = `${e.seccion_id}:${e.materia_id}:${e.dia_semana}`;
      const g = porDia.get(k);
      if (g) g.push(e);
      else porDia.set(k, [e]);
    }
    for (const g of porDia.values()) {
      const ord = [...g].sort((a, b) => a.bloque_orden - b.bloque_orden);
      const dia = ord[0].dia_semana;
      if (ord.length > config.max_horas_dia) {
        out.push({
          seccion_id: ord[0].seccion_id,
          dia,
          bloques: ord.map((e) => e.bloque_id),
          detalle: '',
          titulo: 'Regla de generación',
          error:
            `La materia tiene ${ord.length}h el ${DIAS_NOMBRES[dia]} ` +
            `(máximo ${config.max_horas_dia}h por día):`,
          lineas: [ficha(ord[0])],
        });
      }
      // Sesiones = runs de bloques consecutivos por orden (un receso corta el run)
      let run: HorarioEntry[] = [ord[0]];
      const cerrarRun = () => {
        if (run.length < config.min_horas_bloque) {
          out.push({
            seccion_id: run[0].seccion_id,
            dia,
            bloques: run.map((e) => e.bloque_id),
            detalle: '',
            titulo: 'Regla de generación',
            error:
              `Sesión suelta de ${run.length}h el ${DIAS_NOMBRES[dia]} ` +
              `${fmtHoraCfg(run[0].hora_inicio, usa12)}–${fmtHoraCfg(run[run.length - 1].hora_fin, usa12)} ` +
              `(mínimo ${config.min_horas_bloque}h seguidas):`,
            lineas: [ficha(run[0])],
          });
        }
      };
      for (let i = 1; i < ord.length; i++) {
        if (ord[i].bloque_orden === ord[i - 1].bloque_orden + 1) run.push(ord[i]);
        else {
          cerrarRun();
          run = [ord[i]];
        }
      }
      cerrarRun();
    }
    return out;
  }, [entries, secciones, turnos, config, dispProfs, lapso]);

  // Celdas (bloque:día) involucradas en alguna violación, con sus mensajes:
  // las tarjetas las marcan con un punto rojo cuyo tooltip lista los errores.
  const celdasEnError = useMemo(() => {
    const m = new Map<string, ErrorClase[]>();
    for (const v of violaciones) {
      for (const b of v.bloques) {
        const k = `${b}:${v.dia}`;
        const arr = m.get(k) ?? [];
        arr.push({
          titulo: v.titulo,
          texto: v.lineas?.length ? `${v.error} ${v.lineas.join(' · ')}` : v.error,
        });
        m.set(k, arr);
      }
    }
    return m;
  }, [violaciones]);

  // Advertencias (triángulo amarillo) por entry: no son errores, son avisos.
  //  - La materia tiene aulas preferidas y quedó en otra distinta.
  //  - Clase en instalación deportiva que no es la última del día de la
  //    sección (los estudiantes llegarían sudados a la siguiente clase).
  const advertenciasPorEntry = useMemo(() => {
    const m = new Map<number, string[]>();
    const add = (id: number, txt: string) => {
      const arr = m.get(id) ?? [];
      arr.push(txt);
      m.set(id, arr);
    };
    const prefPorMateria = new Map<string, Set<number>>();
    for (const a of aulas) {
      for (const nm of a.materias ?? []) {
        const k = normMateria(nm);
        const s = prefPorMateria.get(k) ?? new Set<number>();
        s.add(a.id);
        prefPorMateria.set(k, s);
      }
    }
    const deportivas = new Set(
      aulas.filter((a) => a.tipo === 'INSTALACION_DEPORTIVA').map((a) => a.id)
    );
    for (const e of entries) {
      const pref = prefPorMateria.get(normMateria(e.materia_nombre));
      if (pref?.size && !pref.has(e.aula_id)) {
        add(e.id, `'${e.materia_nombre}' no está en su aula preferida.`);
      }
      if (deportivas.has(e.aula_id) && !e.es_receso) {
        // El "grupo" deportivo de esta clase: misma sección/día/materia/aula —
        // las horas siguientes del propio bloque NO cuentan como clase posterior.
        const esDeMiGrupo = (o: HorarioEntry) =>
          o.seccion_id === e.seccion_id &&
          o.dia_semana === e.dia_semana &&
          o.materia_id === e.materia_id &&
          o.aula_id === e.aula_id;
        const finGrupo = Math.max(
          ...entries.filter(esDeMiGrupo).map((o) => minutos(o.hora_fin))
        );
        const despues = entries
          .filter(
            (o) =>
              !esDeMiGrupo(o) &&
              o.seccion_id === e.seccion_id &&
              o.dia_semana === e.dia_semana &&
              minutos(o.hora_inicio) >= finGrupo
          )
          .sort((a, b) => minutos(a.hora_inicio) - minutos(b.hora_inicio));
        if (despues.length > 0) {
          const nxt = despues[0];
          add(
            e.id,
            `'${e.materia_nombre}' es en una instalación deportiva pero no es la última ` +
              `clase del día: después tiene '${nxt.materia_nombre}' a las ` +
              `${fmtHoraCfg(nxt.hora_inicio, usa12)}.`
          );
        }
      }
    }

    return m;
  }, [entries, aulas, usa12]);

  // Choques PARCIALES con el trimestre 2 (solo vistas semestrales): T2 solapa
  // la primera mitad con S1 y la segunda con S2. Se permiten — se muestran con
  // el icono verde de la tarjeta, nunca como error ni impedimento.
  // El "lado semestre" no son solo las entries SEMESTRAL: las secciones
  // semestrales (ej. D-01 de veterinaria) cursan todo el semestre, así que sus
  // clases registradas en T1 siguen vigentes en la primera mitad de T2 y las
  // de T3 en la segunda — también se les advierte el choque parcial.
  const seccionesSemestrales = useMemo(
    () =>
      new Set(
        rows.filter((r) => r.tipo_proyeccion === 'SEMESTRAL').map((r) => r.seccion_id)
      ),
    [rows]
  );
  const parciales = useMemo(() => {
    const avisos = new Map<number, string[]>();
    const parejas = new Map<number, number[]>();
    if (lapso.tipo !== 'SEMESTRAL') return { avisos, parejas };
    const t2 = entries.filter(
      (e) => e.tipo_proyeccion === 'TRIMESTRAL' && e.trimestre === 2
    );
    if (t2.length === 0) return { avisos, parejas };
    const esLadoSemestre = (e: HorarioEntry) =>
      e.tipo_proyeccion === 'SEMESTRAL'
        ? e.trimestre === lapso.n
        : e.trimestre !== 2 && seccionesSemestrales.has(e.seccion_id);
    const add = (id: number, txt: string) => {
      const arr = avisos.get(id) ?? [];
      if (!arr.includes(txt)) arr.push(txt);
      avisos.set(id, arr);
    };
    const addPar = (a: number, b: number) => {
      const arr = parejas.get(a) ?? [];
      if (!arr.includes(b)) arr.push(b);
      parejas.set(a, arr);
    };
    const pnfDe = (e: HorarioEntry) =>
      pnfLabel(pnfOptions.find(([id]) => id === e.pnf_saga_id)?.[1]);
    const mitad =
      lapso.n === 1 ? 'primera mitad del trimestre 2' : 'segunda mitad del trimestre 2';
    for (const e of entries) {
      if (!esLadoSemestre(e)) continue;
      for (const o of t2) {
        if (o.dia_semana !== e.dia_semana) continue;
        if (!traslapan(e.hora_inicio, e.hora_fin, o.hora_inicio, o.hora_fin)) continue;
        // La misma materia de la misma sección en T2 ES la misma clase
        // (registrada en ambos lapsos), no un conflicto.
        if (
          normMateria(o.materia_nombre) === normMateria(e.materia_nombre) &&
          o.seccion_nombre === e.seccion_nombre
        ) {
          continue;
        }
        const donde = `${DIAS_NOMBRES[o.dia_semana]} ${fmtHoraCfg(o.hora_inicio, usa12)}–${fmtHoraCfg(o.hora_fin, usa12)}`;
        const quien =
          `'${o.materia_nombre}' de la sección ${o.seccion_nombre} (${pnfDe(o)}), ` +
          `trimestre 2 — solapa solo la ${mitad}`;
        let choca = false;
        if (o.aula_id === e.aula_id) {
          choca = true;
          const txt =
            `Posible conflicto de aula: comparte el aula ` +
            `${e.aula_nombre || e.aula_codigo} con ${quien}, el ${donde}.`;
          add(e.id, txt);
          add(o.id, `Posible conflicto de aula: comparte el aula ${e.aula_nombre || e.aula_codigo} ` +
            `con '${e.materia_nombre}' de la sección ${e.seccion_nombre}, semestre ${lapso.n}, el ${donde}.`);
        }
        if (o.profesor_id && o.profesor_id === e.profesor_id) {
          choca = true;
          const prof = `${o.prof_apellidos ?? ''}, ${o.prof_nombres ?? ''}`.replace(/^,\s*/, '');
          add(e.id, `Posible conflicto de profesor: ${prof} también da ${quien}, el ${donde}.`);
          add(o.id, `Posible conflicto de profesor: ${prof} también da '${e.materia_nombre}' ` +
            `de la sección ${e.seccion_nombre}, semestre ${lapso.n}, el ${donde}.`);
        }
        if (o.seccion_id === e.seccion_id) {
          choca = true;
          add(e.id, `Posible conflicto de sección: ${quien} es de esta misma sección, el ${donde}.`);
          add(o.id, `Posible conflicto de sección: '${e.materia_nombre}' del semestre ${lapso.n} ` +
            `es de esta misma sección, el ${donde}.`);
        }
        if (choca) {
          addPar(e.id, o.id);
          addPar(o.id, e.id);
        }
      }
    }
    return { avisos, parejas };
  }, [entries, lapso, usa12, pnfOptions, seccionesSemestrales]);
  const avisosParciales = parciales.avisos;
  const parejasParciales = parciales.parejas;

  // Parejas de CUALQUIER solape visible entre clases distintas — solo en
  // vistas semestrales, donde conviven clases de varios lapsos (T1, T2 y el
  // semestre mismo). La partición por franjas las muestra todas a tiempo
  // real; si la relación es 'total' además llevan el punto rojo de error, y
  // si es T2↔semestre el icono verde. Solo se ignora la misma entrada
  // (misma clase lógica en el mismo lapso).
  const parejasTotales = useMemo(() => {
    const parejas = new Map<number, number[]>();
    if (lapso.tipo !== 'SEMESTRAL') return parejas;
    const clave = (e: HorarioEntry) =>
      `${e.seccion_id}|${normMateria(e.materia_nombre)}|${e.profesor_id ?? 0}|` +
      `${e.tipo_proyeccion}:${e.trimestre}`;
    const addPar = (a: number, b: number) => {
      const arr = parejas.get(a) ?? [];
      if (!arr.includes(b)) arr.push(b);
      parejas.set(a, arr);
    };
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        if (a.dia_semana !== b.dia_semana) continue;
        if (!traslapan(a.hora_inicio, a.hora_fin, b.hora_inicio, b.hora_fin)) continue;
        if (clave(a) === clave(b)) continue;
        addPar(a.id, b.id);
        addPar(b.id, a.id);
      }
    }
    return parejas;
  }, [entries, lapso]);

  // Parejas que disparan la partición visual en vistas de recurso:
  // choques parciales (T2↔semestre) + choques reales entre clases distintas.
  const parejasConflicto = useMemo(() => {
    const m = new Map<number, number[]>();
    const merge = (src: Map<number, number[]>) => {
      for (const [k, ids] of src) {
        const arr = m.get(k) ?? [];
        for (const id of ids) if (!arr.includes(id)) arr.push(id);
        m.set(k, arr);
      }
    };
    merge(parejasParciales);
    merge(parejasTotales);
    return m;
  }, [parejasParciales, parejasTotales]);

  // Trimestres que conviven con el semestre visto: S1 ↔ T1,T2 · S2 ↔ T2,T3
  const trisDelSemestre = lapso.n === 1 ? [1, 2] : [2, 3];

  // Entries de la vista por aula, aplicando el filtro de trimestres cuando
  // el lapso es semestral. Como las parejas parciales se resuelven contra
  // las entries mostradas, ocultar un trimestre también desarma su cascada.
  const entriesAula = useMemo(() => {
    const aid = aulaId ?? aulas[0]?.id;
    return entries.filter(
      (e) =>
        e.aula_id === aid &&
        !(
          lapso.tipo === 'SEMESTRAL' &&
          e.tipo_proyeccion === 'TRIMESTRAL' &&
          !seccionesSemestrales.has(e.seccion_id) &&
          trisOcultos.has(e.trimestre)
        ) &&
        !(
          lapso.tipo === 'TRIMESTRAL' &&
          lapso.n === 2 &&
          e.tipo_proyeccion === 'SEMESTRAL' &&
          semsOcultos.has(e.trimestre)
        )
    );
  }, [entries, aulaId, aulas, lapso.tipo, lapso.n, trisOcultos, semsOcultos, seccionesSemestrales]);

  // Lo mismo para la vista por profesor.
  const entriesProfesor = useMemo(() => {
    const pid = profesorId ?? profesores[0]?.id;
    return entries.filter(
      (e) =>
        e.profesor_id === pid &&
        !(
          lapso.tipo === 'SEMESTRAL' &&
          e.tipo_proyeccion === 'TRIMESTRAL' &&
          !seccionesSemestrales.has(e.seccion_id) &&
          trisOcultos.has(e.trimestre)
        ) &&
        !(
          lapso.tipo === 'TRIMESTRAL' &&
          lapso.n === 2 &&
          e.tipo_proyeccion === 'SEMESTRAL' &&
          semsOcultos.has(e.trimestre)
        )
    );
  }, [
    entries,
    profesorId,
    profesores,
    lapso.tipo,
    lapso.n,
    trisOcultos,
    semsOcultos,
    seccionesSemestrales,
  ]);

  const irAViolacion = (v: Violacion) => {
    const s = secciones.find((x) => x.seccion_id === v.seccion_id);
    setVista('seccion');
    if (s) {
      setPnfSel(s.pnf_nombre);
      setTrayectoSel(s.trayecto_nombre);
      setTurnoSel(s.turno_nombre);
    }
    setSeccionId(v.seccion_id);
    setErroresOpen(false);
    setResaltar(new Set(v.bloques.map((b) => `${b}:${v.dia}`)));
    window.setTimeout(() => setResaltar(null), 8000);
  };

  // Abre el modal de edición del profesor actualmente seleccionado en la vista
  const editarProfesorSel = async () => {
    const id = profesorId ?? profesores[0]?.id;
    if (!id) return;
    const res = await apiFetch<Profesor>(`/profesores/${id}`);
    if (res.success && res.data) setProfEdit(res.data);
    else mostrarAviso(res.message || 'No se pudo cargar el profesor.', true);
  };

  const mostrarAviso = (texto: string, error = false) => {
    setAviso({ error, texto });
    window.setTimeout(() => setAviso((a) => (a?.texto === texto ? null : a)), 8000);
  };

  const fetchBase = async () => {
    setLoading(true);
    setErrorMsg(null);
    const [rCarga, rTurnos, rAulas, rProf, rPnfs, rConfig] = await Promise.all([
      apiFetch<{ periodo: string | null; rows: MateriaAsignableRow[] }>('/proyecciones/carga-docente'),
      apiFetch<Turno[]>('/horarios/turnos'),
      apiFetch<Aula[]>('/horarios/aulas'),
      apiFetch<ProfesorLite[]>('/profesores'),
      apiFetch<Array<{ id: number; nombre: string }>>('/horarios/pnfs'),
      apiFetch<HorarioConfig>('/horarios/config'),
    ]);
    if (rCarga.success && rCarga.data) {
      setRows(rCarga.data.rows || []);
      setPeriodo(rCarga.data.periodo);
    } else {
      setErrorMsg(rCarga.message || 'Error cargando la carga docente.');
    }
    if (rTurnos.success && rTurnos.data) setTurnos(rTurnos.data);
    // Orden natural por nombre: Aula 2 antes que Aula 10
    if (rAulas.success && rAulas.data) setAulas(sortAulas(rAulas.data));
    if (rProf.success && rProf.data) setProfesores(rProf.data);
    if (rPnfs.success && rPnfs.data) setPnfOptions(rPnfs.data.map((p) => [p.id, p.nombre]));
    if (rConfig.success && rConfig.data) setConfig(rConfig.data);
    setLoading(false);
  };

  const fetchConfig = async () => {
    const rConfig = await apiFetch<HorarioConfig>('/horarios/config');
    if (rConfig.success && rConfig.data) setConfig(rConfig.data);
  };

  const fetchEntries = async () => {
    const res = await apiFetch<{ entries: HorarioEntry[] }>(
      `/horarios/entries?tipo=${lapso.tipo}&trimestre=${lapso.n}`
    );
    const list = res.success && res.data ? res.data.entries || [] : [];
    if (res.success && res.data) setEntries(list);
    // Disponibilidad (bloqueos) de cada profesor presente en el lapso — alimenta la auditoría
    const ids = [...new Set(list.map((e) => e.profesor_id).filter((id): id is number => !!id))];
    const respuestas = await Promise.all(
      ids.map((id) => apiFetch<DispSlot[]>(`/profesores/${id}/disponibilidad`))
    );
    const mapa = new Map<number, DispSlot[]>();
    respuestas.forEach((r, i) => {
      if (r.success && r.data) mapa.set(ids[i], r.data);
    });
    setDispProfs(mapa);
  };

  useEffect(() => {
    fetchBase();
  }, []);

  useEffect(() => {
    if (configTick) fetchConfig();
  }, [configTick]);

  useEffect(() => {
    if (rows.length > 0) fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lapso.tipo, lapso.n, rows]);

  // Reubica los bloques de materia que chocan por aula en aulas libres
  // (preferidas de la materia → del PNF → libres), respetando el run contiguo.
  const resolverAulas = async () => {
    setResolviendo(true);
    const res = await apiFetch<{ runs: number; movidas: number; sin_solucion: number }>(
      '/horarios/entries/resolver-aulas',
      { method: 'POST' }
    );
    setResolviendo(false);
    if (res.success) {
      mostrarAviso(res.message || 'Conflictos de aula resueltos.');
      fetchEntries();
    } else {
      mostrarAviso(res.message || 'No se pudieron resolver los conflictos.', true);
    }
  };

  const generar = async (modo: 'completar' | 'regenerar') => {
    if (modo === 'regenerar' && !confirm('Esto borrará todas las clases agendadas del lapso y las recalculará. ¿Continuar?')) {
      return;
    }
    setGenerando(true);
    const res = await apiFetch<{ agendadas: number; pendientes: any[] }>('/horarios/generar', {
      method: 'POST',
      body: JSON.stringify({ tipo: lapso.tipo, trimestre: lapso.n, modo }),
    });
    setGenerando(false);
    if (res.success) {
      const pend = res.data?.pendientes ?? [];
      mostrarAviso(
        `${res.message}${pend.length > 0 ? `\nPendientes: ${pend.map((p) => p.materia_nombre).join(', ')}` : ''}`
      );
      fetchEntries();
    } else {
      mostrarAviso(res.message || 'Error generando el horario.', true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Cargando horarios...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header del módulo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-blue-400" /> Horarios de clase
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Periodo {periodo ?? '—'} · Aulas, bloques por turno y asignación de clases
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchBase}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            title="Recargar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {puedeEditar && tab === 'horario' && (
            <>
              <button
                onClick={() => generar('completar')}
                disabled={generando}
                className="px-3 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-blue-500/20 transition-all"
              >
                {generando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Generar horario
              </button>
              <button
                onClick={() => generar('regenerar')}
                disabled={generando}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer border border-slate-700"
                title="Borra las clases agendadas del lapso y las recalcula"
              >
                <Eraser className="w-3.5 h-3.5" /> Regenerar
              </button>
              <button
                onClick={() => setForzar((v) => !v)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer border transition-colors ${
                  forzar
                    ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-500/50'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
                title={
                  forzar
                    ? 'Movimiento forzado ACTIVO: los arrastres se guardan aunque generen conflictos (se marcan con el punto rojo)'
                    : 'Permite mover clases aunque el aula, el profesor o la sección queden solapados; el conflicto se marca con el punto rojo'
                }
              >
                {forzar ? (
                  <CheckSquare className="w-3.5 h-3.5" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
                Ignorar conflictos
                {forzar && <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />}
              </button>
            </>
          )}
          {tab === 'horario' && (
            <div className="relative">
              <button
                onClick={() => setErroresOpen((v) => !v)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer border transition-colors ${
                  violaciones.length > 0
                    ? 'bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/40'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
                title="Errores y violaciones del horario"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Errores
                {violaciones.length > 0 && (
                  <span className="min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {violaciones.length}
                  </span>
                )}
              </button>
              {erroresOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setErroresOpen(false)} />
                  <div className="absolute right-0 mt-2 w-[30rem] max-w-[90vw] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/50 z-50 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between gap-2">
                      <span>Violaciones del lapso</span>
                      <div className="flex items-center gap-2">
                        {puedeEditar && violaciones.length > 0 && (
                          <button
                            onClick={resolverAulas}
                            disabled={resolviendo}
                            title="Reubica en aulas libres los bloques de materia que chocan por aula: primero aulas preferidas de la materia, luego las del PNF, luego cualquier aula libre"
                            className="px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold normal-case tracking-normal flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                          >
                            {resolviendo ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Wand2 className="w-3 h-3" />
                            )}
                            Autosolucionar aulas
                          </button>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                            violaciones.length > 0
                              ? 'bg-red-500/20 text-red-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {violaciones.length}
                        </span>
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-2 space-y-2">
                      {violaciones.length === 0 && (
                        <div className="flex items-center gap-2 px-3 py-4 text-[11px] text-emerald-300">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          Sin errores: no hay choques ni violaciones de las reglas en este lapso.
                        </div>
                      )}
                      {violaciones.map((v, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2.5 flex items-start gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            {v.titulo && (
                              <div className="text-xs font-bold text-red-300 mb-0.5">
                                {v.titulo}
                              </div>
                            )}
                            <div className="text-[11px] text-slate-300 leading-snug">
                              {v.detalle && <>{v.detalle} </>}
                              <span className="text-red-300 font-semibold">{v.error}</span>
                            </div>
                            {v.lineas && v.lineas.length > 0 && (
                              <ul className="mt-1 space-y-0.5">
                                {v.lineas.map((l, i) => (
                                  <li
                                    key={i}
                                    className="flex items-start gap-1.5 text-[11px] text-slate-300 leading-snug"
                                  >
                                    <span className="text-red-400 shrink-0">•</span>
                                    <span className="min-w-0">{l}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <button
                            onClick={() => irAViolacion(v)}
                            title="Ver en el horario de la sección"
                            className="shrink-0 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 hover:text-red-200 border border-slate-700 text-slate-300 text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Crosshair className="w-3 h-3" /> Ir
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {tab === 'horario' && (
            <button
              onClick={() => setReporteOpen(true)}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer border border-slate-700"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir / Excel
            </button>
          )}
        </div>
      </div>

      {/* Sub-pestañas */}
      <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl w-fit">
        {(
          [
            ['horario', 'Horario', CalendarClock],
            ['aulas', 'Aulas', Building2],
            ['turnos', 'Turnos y Bloques', Clock],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => cambiarTab(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              tab === k ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {aviso && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-md max-h-64 overflow-y-auto px-4 py-2.5 rounded-xl text-xs font-semibold border shadow-2xl shadow-black/50 backdrop-blur-sm whitespace-pre-line ${
            aviso.error
              ? 'bg-red-950/90 border-red-500/40 text-red-300'
              : 'bg-emerald-950/90 border-emerald-500/40 text-emerald-300'
          }`}
        >
          {(() => {
            const texto = formatearHorasEnTexto(aviso.texto, usa12);
            return texto.includes('\n') ? (
              <>
                <div className="text-[13px] font-bold mb-0.5">{texto.split('\n')[0]}</div>
                <div className="font-medium">{texto.split('\n').slice(1).join('\n')}</div>
              </>
            ) : (
              texto
            );
          })()}
        </div>
      )}
      {errorMsg && (
        <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/40 text-red-300 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {errorMsg}
        </div>
      )}

      {tab === 'aulas' && (
        <AulasPanel aulas={aulas} pnfOptions={pnfOptions} puedeEditar={puedeEditar} onChanged={fetchBase} />
      )}
      {tab === 'turnos' && <TurnosPanel turnos={turnos} puedeEditar={puedeEditar} formato12={usa12} onChanged={fetchBase} />}

      {tab === 'horario' && (
        <>
          {/* Selectores: lapso, vista y recurso */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Lapso</label>
                <select
                value={lapsoSel || `${lapso.tipo}:${lapso.n}`}
                onChange={(e) => {
                  setLapsoSel(e.target.value);
                  setSeccionId(null);
                }}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                {lapsosOpciones.propios.map((l) => {
                  const [t, n] = l.split(':');
                  return (
                    <option key={l} value={l}>
                      {labelLapso(Number(n), t)}
                    </option>
                  );
                })}
                {lapsosOpciones.otros.length > 0 && (
                  <optgroup label="Otras proyecciones">
                    {lapsosOpciones.otros.map((l) => {
                      const [t, n] = l.split(':');
                      return (
                        <option key={l} value={l}>
                          {labelLapso(Number(n), t)}
                        </option>
                      );
                    })}
                  </optgroup>
                )}
                </select>
              </div>
              {(vista === 'aula' || vista === 'profesor') && lapso.tipo === 'SEMESTRAL' && (
                <div className="flex items-center gap-1">
                  {trisDelSemestre.map((t) => {
                    const on = !trisOcultos.has(t);
                    return (
                      <button
                        key={t}
                        onClick={() => toggleTriOculto(t)}
                        title={
                          on
                            ? `Ocultar las clases del trimestre ${t}`
                            : `Mostrar las clases del trimestre ${t}`
                        }
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
                          on
                            ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-200'
                            : 'bg-slate-950 border-slate-700 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {on ? (
                          <CheckSquare className="w-3.5 h-3.5" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                        Trimestre {t}
                      </button>
                    );
                  })}
                </div>
              )}
              {(vista === 'aula' || vista === 'profesor') &&
                lapso.tipo === 'TRIMESTRAL' &&
                lapso.n === 2 && (
                  <div className="flex items-center gap-1">
                    {[1, 2].map((t) => {
                      const on = !semsOcultos.has(t);
                      return (
                        <button
                          key={t}
                          onClick={() => toggleSemOculto(t)}
                          title={
                            on
                              ? `Ocultar las clases del semestre ${t}`
                              : `Mostrar las clases del semestre ${t}`
                          }
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
                            on
                              ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-200'
                              : 'bg-slate-950 border-slate-700 text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {on ? (
                            <CheckSquare className="w-3.5 h-3.5" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                          Semestre {t}
                        </button>
                      );
                    })}
                  </div>
                )}
            </div>
            <div className="h-5 w-px bg-slate-700" />
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-lg">
              {(
                [
                  ['seccion', 'Por sección'],
                  ['aula', 'Por aula'],
                  ['profesor', 'Por profesor'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setVista(k)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    vista === k ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {vista === 'seccion' && (
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={pnfEff ?? ''}
                  onChange={(e) => setPnfSel(e.target.value)}
                  title="PNF"
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white max-w-[180px]"
                >
                  {pnfOpts.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <select
                  value={trayectoEff ?? ''}
                  onChange={(e) => setTrayectoSel(e.target.value)}
                  title="Trayecto"
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white max-w-[140px]"
                >
                  {trayectoOpts.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select
                  value={turnoEff ?? ''}
                  onChange={(e) => setTurnoSel(e.target.value)}
                  title="Turno"
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white max-w-[120px]"
                >
                  {turnoOpts.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select
                  value={seccion?.seccion_id ?? ''}
                  onChange={(e) => setSeccionId(Number(e.target.value))}
                  title="Sección"
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white max-w-[160px]"
                >
                  {seccionesFiltradas.map((s) => (
                    <option key={s.seccion_id} value={s.seccion_id}>
                      {s.seccion_nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {vista === 'aula' && (
              <select
                value={aulaId ?? aulas[0]?.id ?? ''}
                onChange={(e) => setAulaId(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                {aulas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            )}
            {vista === 'profesor' && (
              <>
                <ProfesorSearchSelect
                  profesores={profesores}
                  value={profesorId ?? profesores[0]?.id ?? null}
                  onChange={setProfesorId}
                />
                {puedeEditar && (
                  <button
                    onClick={editarProfesorSel}
                    title="Editar profesor"
                    className="p-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>

          {vista === 'seccion' &&
            (seccion ? (
              <SeccionGrid
                key={`${seccion.seccion_id}:${lapso.tipo}:${lapso.n}`}
                seccion={seccion}
                turno={turnoSeccion}
                materias={materiasSeccion}
                entries={entries}
                aulas={aulas}
                config={config}
                trimestre={lapso.n}
                tipoProyeccion={lapso.tipo}
                puedeEditar={puedeEditar}
                forzar={forzar}
                resaltar={resaltar}
                enError={celdasEnError}
                advertencias={advertenciasPorEntry}
                avisosParciales={avisosParciales}
                onChanged={fetchEntries}
              />
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-sm">
                No hay secciones con materias en este lapso.
              </div>
            ))}

          {vista === 'aula' && (
            <VistaRecurso
              titulo={`Ocupación del aula ${aulas.find((a) => a.id === (aulaId ?? aulas[0]?.id))?.codigo ?? ''}`}
              ocultarAula
              entries={entriesAula}
              turnos={turnos}
              formato12={usa12}
              enError={celdasEnError}
              advertencias={advertenciasPorEntry}
              avisosParciales={avisosParciales}
              parejasParciales={parejasConflicto}
              seccionesSemestrales={seccionesSemestrales}
            />
          )}

          {vista === 'profesor' && (
            <VistaRecurso
              titulo="Agenda del profesor"
              ocultarProfesor
              entries={entriesProfesor}
              turnos={turnos}
              formato12={usa12}
              enError={celdasEnError}
              advertencias={advertenciasPorEntry}
              avisosParciales={avisosParciales}
              parejasParciales={parejasConflicto}
              seccionesSemestrales={seccionesSemestrales}
            />
          )}
        </>
      )}

      <ReporteHorarioModal
        isOpen={reporteOpen}
        onClose={() => setReporteOpen(false)}
        periodo={periodo}
        lapsoActual={`${lapso.tipo}:${lapso.n}`}
        lapsos={lapsos}
        rows={rows}
        aulas={aulas}
        turnos={turnos}
        formato12={usa12}
      />

      <ProfesorModal
        isOpen={profEdit !== null}
        profesor={profEdit}
        onClose={() => setProfEdit(null)}
        onSuccess={fetchBase}
      />
    </div>
  );
};

// Selector de profesor con búsqueda (la lista puede ser muy larga)
const ProfesorSearchSelect: React.FC<{
  profesores: ProfesorLite[];
  value: number | null;
  onChange: (id: number) => void;
}> = ({ profesores, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const sel = profesores.find((p) => p.id === value);
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return profesores;
    return profesores.filter((p) =>
      `${p.apellidos} ${p.nombres}`.toLowerCase().includes(t)
    );
  }, [profesores, q]);

  return (
    <div className="relative w-[280px]">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
      <input
        value={open ? q : sel ? `${sel.apellidos}, ${sel.nombres}`.toUpperCase() : ''}
        onFocus={() => {
          setOpen(true);
          setQ('');
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        placeholder="Buscar profesor..."
        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
      />
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setQ('');
            }}
          />
          <div className="absolute left-0 mt-1 w-full max-h-56 overflow-y-auto bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl shadow-black/50 z-50">
            {filtrados.length === 0 && (
              <div className="px-3 py-3 text-[11px] text-slate-500 italic">
                Sin profesores que coincidan con '{q}'.
              </div>
            )}
            {filtrados.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                  setQ('');
                }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer ${
                  p.id === value
                    ? 'bg-indigo-600/20 text-indigo-200'
                    : 'text-slate-200 hover:bg-slate-800'
                }`}
              >
                {`${p.apellidos}, ${p.nombres}`.toUpperCase()}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
