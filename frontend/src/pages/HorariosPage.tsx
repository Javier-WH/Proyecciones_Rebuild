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
  fmtHora,
  traslapan,
  DIAS_NOMBRES,
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
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ error: boolean; texto: string } | null>(null);

  const [lapsoSel, setLapsoSel] = useState<string>(''); // 'TRIMESTRAL:1'
  const [vista, setVista] = useState<Vista>('seccion');
  const [seccionId, setSeccionId] = useState<number | null>(null);
  const [aulaId, setAulaId] = useState<number | null>(null);
  const [profesorId, setProfesorId] = useState<number | null>(null);
  const [generando, setGenerando] = useState(false);
  const [reporteOpen, setReporteOpen] = useState(false);
  const [erroresOpen, setErroresOpen] = useState(false);
  const [resaltar, setResaltar] = useState<Set<string> | null>(null);
  const [profEdit, setProfEdit] = useState<Profesor | null>(null);

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
  const seccion = secciones.find((s) => s.seccion_id === seccionId) ?? secciones[0] ?? null;
  const turnoSeccion = seccion ? turnos.find((t) => t.saga_id === seccion.turno_saga_id) : undefined;

  const materiasSeccion = useMemo(
    () => (seccion ? rowsLapso.filter((r) => r.seccion_id === seccion.seccion_id) : []),
    [rowsLapso, seccion]
  );

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
    const detalle = (e: HorarioEntry) => {
      const s = secById.get(e.seccion_id);
      return `La materia '${e.materia_nombre}' del PNF ${s?.pnf_nombre ?? '—'}, ` +
        `sección ${e.seccion_nombre} (${s?.proyeccion_nombre ?? '—'}), ` +
        `turno ${e.turno_nombre}, ${profDe(e)},`;
    };
    const cuando = (e: HorarioEntry) =>
      `el ${DIAS_NOMBRES[e.dia_semana]} ${fmtHora(e.hora_inicio)}–${fmtHora(e.hora_fin)}`;

    // Clase en bloque de receso o en día no habilitado para el turno
    for (const e of entries) {
      if (e.es_receso) {
        out.push({
          seccion_id: e.seccion_id,
          dia: e.dia_semana,
          bloques: [e.bloque_id],
          detalle: detalle(e),
          error: `está agendada ${cuando(e)}, un bloque de receso.`,
        });
        continue;
      }
      const t = turnoBySaga.get(e.turno_saga_id);
      if (t && !String(t.dias_semana).split(',').map(Number).includes(e.dia_semana)) {
        out.push({
          seccion_id: e.seccion_id,
          dia: e.dia_semana,
          bloques: [e.bloque_id],
          detalle: detalle(e),
          error: `el ${DIAS_NOMBRES[e.dia_semana]} no es un día habilitado del turno '${t.nombre}'.`,
        });
      }
    }

    // Choques: dos clases traslapadas compartiendo sección, profesor o aula
    const choques: [string, (e: HorarioEntry) => string | null][] = [
      ['la misma sección', (e) => `s:${e.seccion_id}:${e.dia_semana}`],
      ['el mismo profesor', (e) => (e.profesor_id ? `p:${e.profesor_id}:${e.dia_semana}` : null)],
      ['el mismo aula', (e) => `a:${e.aula_id}:${e.dia_semana}`],
    ];
    for (const [recurso, keyFn] of choques) {
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
            out.push({
              seccion_id: b.seccion_id,
              dia: b.dia_semana,
              bloques: [b.bloque_id],
              detalle: detalle(b),
              error: `choca ${cuando(b)} con '${a.materia_nombre}' (sección ${a.seccion_nombre}, aula ${a.aula_codigo}) por ${recurso}.`,
            });
          }
        }
      }
    }

    // Reglas de generación por materia+sección+día
    const porDia = new Map<string, HorarioEntry[]>();
    for (const e of entries) {
      if (e.es_receso) continue;
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
          detalle: detalle(ord[0]),
          error: `tiene ${ord.length}h el ${DIAS_NOMBRES[dia]} (máximo ${config.max_horas_dia}h por día).`,
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
            detalle: detalle(run[0]),
            error: `tiene una sesión suelta de ${run.length}h el ${DIAS_NOMBRES[dia]} ` +
              `${fmtHora(run[0].hora_inicio)}–${fmtHora(run[run.length - 1].hora_fin)} ` +
              `(mínimo ${config.min_horas_bloque}h seguidas).`,
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
  }, [entries, secciones, turnos, config]);

  const irAViolacion = (v: Violacion) => {
    setVista('seccion');
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
    if (rAulas.success && rAulas.data) setAulas(rAulas.data);
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
    if (res.success && res.data) setEntries(res.data.entries || []);
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
                    <div className="px-4 py-2.5 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                      <span>Violaciones del lapso</span>
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
                            <div className="text-[11px] text-slate-300 leading-snug">
                              {v.detalle}{' '}
                              <span className="text-red-300 font-semibold">{v.error}</span>
                            </div>
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
          {aviso.texto}
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
      {tab === 'turnos' && <TurnosPanel turnos={turnos} puedeEditar={puedeEditar} onChanged={fetchBase} />}

      {tab === 'horario' && (
        <>
          {/* Selectores: lapso, vista y recurso */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3">
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
                {lapsos.map((l) => {
                  const [t, n] = l.split(':');
                  return (
                    <option key={l} value={l}>
                      {labelLapso(Number(n), t)}
                    </option>
                  );
                })}
              </select>
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
              <select
                value={seccion?.seccion_id ?? ''}
                onChange={(e) => setSeccionId(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white max-w-[320px]"
              >
                {secciones.map((s) => (
                  <option key={s.seccion_id} value={s.seccion_id}>
                    {s.seccion_nombre} · {s.proyeccion_nombre} ({s.turno_nombre})
                  </option>
                ))}
              </select>
            )}
            {vista === 'aula' && (
              <select
                value={aulaId ?? aulas[0]?.id ?? ''}
                onChange={(e) => setAulaId(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                {aulas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} — {a.nombre}
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
                puedeEditar={puedeEditar}
                resaltar={resaltar}
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
              entries={entries.filter((e) => e.aula_id === (aulaId ?? aulas[0]?.id))}
              turnos={turnos}
            />
          )}

          {vista === 'profesor' && (
            <VistaRecurso
              titulo="Agenda del profesor"
              entries={entries.filter((e) => e.profesor_id === (profesorId ?? profesores[0]?.id))}
              turnos={turnos}
            />
          )}
        </>
      )}

      <ReporteHorarioModal
        isOpen={reporteOpen}
        onClose={() => setReporteOpen(false)}
        lapsoLabel={labelLapso(lapso.n, lapso.tipo)}
        periodo={periodo}
        secciones={secciones}
        turnos={turnos}
        entries={entries}
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
        value={open ? q : sel ? `${sel.apellidos}, ${sel.nombres}` : ''}
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
                {p.apellidos}, {p.nombres}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
