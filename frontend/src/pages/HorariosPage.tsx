import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { MateriaAsignableRow, labelLapso } from './AgregarMateriaModal.js';
import { SeccionGrid } from './horarios/SeccionGrid.js';
import { AulasPanel } from './horarios/AulasPanel.js';
import { TurnosPanel } from './horarios/TurnosPanel.js';
import { VistaRecurso } from './horarios/VistaRecurso.js';
import { ReporteHorarioModal } from './ReporteHorarioModal.js';
import {
  Aula,
  HorarioEntry,
  SeccionRef,
  Turno,
  seccionesDe,
  fmtHora,
} from './horarios/types.js';
import {
  CalendarClock,
  Loader2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Eraser,
  Building2,
  Clock,
  Printer,
  Users,
} from 'lucide-react';

export type HorariosSubTab = 'horario' | 'aulas' | 'turnos';
type Vista = 'seccion' | 'aula' | 'profesor';

interface HorariosPageProps {
  subTab?: HorariosSubTab;
  onSubTabChange?: (t: HorariosSubTab) => void;
}

interface ProfesorLite {
  id: number;
  nombres: string;
  apellidos: string;
}

export const HorariosPage: React.FC<HorariosPageProps> = ({ subTab, onSubTabChange }) => {
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

  const mostrarAviso = (texto: string, error = false) => {
    setAviso({ error, texto });
    window.setTimeout(() => setAviso((a) => (a?.texto === texto ? null : a)), 8000);
  };

  const fetchBase = async () => {
    setLoading(true);
    setErrorMsg(null);
    const [rCarga, rTurnos, rAulas, rProf, rPnfs] = await Promise.all([
      apiFetch<{ periodo: string | null; rows: MateriaAsignableRow[] }>('/proyecciones/carga-docente'),
      apiFetch<Turno[]>('/horarios/turnos'),
      apiFetch<Aula[]>('/horarios/aulas'),
      apiFetch<ProfesorLite[]>('/profesores'),
      apiFetch<Array<{ id: number; nombre: string }>>('/horarios/pnfs'),
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
    setLoading(false);
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
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold border whitespace-pre-line ${
            aviso.error
              ? 'bg-red-500/10 border-red-500/40 text-red-300'
              : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
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
              <select
                value={profesorId ?? profesores[0]?.id ?? ''}
                onChange={(e) => setProfesorId(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white max-w-[280px]"
              >
                {profesores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.apellidos}, {p.nombres}
                  </option>
                ))}
              </select>
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
                trimestre={lapso.n}
                puedeEditar={puedeEditar}
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
              renderLinea2={(e) =>
                e.prof_apellidos ? `${e.prof_apellidos}, ${e.prof_nombres}` : 'Sin profesor'
              }
            />
          )}

          {vista === 'profesor' && (
            <VistaRecurso
              titulo="Agenda del profesor"
              entries={entries.filter((e) => e.profesor_id === (profesorId ?? profesores[0]?.id))}
              turnos={turnos}
              renderLinea2={(e) => `Aula ${e.aula_codigo} · ${e.seccion_nombre}`}
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
    </div>
  );
};
