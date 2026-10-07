import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { HorarioEntry, HorarioConfig, Turno, Aula, pnfLabel } from './horarios/types.js';
import { HorarioReadonlyGrid } from './horarios/HorarioReadonlyGrid.js';
import { DisponibilidadGrid } from './DisponibilidadGrid.js';
import { ReporteHorarioModal } from './ReporteHorarioModal.js';
import { labelLapso, lapsoKey, MateriaAsignableRow } from './AgregarMateriaModal.js';
import {
  CalendarClock,
  CalendarCheck,
  ClipboardList,
  Loader2,
  AlertCircle,
  GraduationCap,
  Clock,
  BookOpen,
  Printer,
} from 'lucide-react';

const ordenTipo = (t: string) => (t === 'TRIMESTRAL' ? 0 : 1);

export const ProfesorPortalPage: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<MateriaAsignableRow[]>([]);
  const [periodoCodigo, setPeriodoCodigo] = useState<string | null>(null);
  const [periodoNombre, setPeriodoNombre] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [vista, setVista] = useState<'horario' | 'materias' | 'disponibilidad'>('horario');
  const profesorId = user?.profesor_id ?? (user?.invitado ? -user.id : null);
  const [lapsoSel, setLapsoSel] = useState<string | null>(null);
  const [entries, setEntries] = useState<HorarioEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [usa12, setUsa12] = useState(false);
  const [reporteOpen, setReporteOpen] = useState(false);

  // Lapsos en los que el docente tiene materias asignadas
  const lapsos = useMemo(() => {
    const map = new Map<string, { tipo: string; n: number }>();
    for (const r of rows) {
      map.set(lapsoKey(r.tipo_proyeccion, r.trimestre), { tipo: r.tipo_proyeccion, n: r.trimestre });
    }
    return [...map.entries()].sort(
      (a, b) => ordenTipo(a[1].tipo) - ordenTipo(b[1].tipo) || a[1].n - b[1].n
    );
  }, [rows]);

  useEffect(() => {
    const cargar = async () => {
      setLoading(true);
      const [res, rTurnos, rConfig, rAulas] = await Promise.all([
        apiFetch<{ periodo: string | null; periodo_nombre: string | null; rows: MateriaAsignableRow[] }>(
          '/proyecciones/carga-docente'
        ),
        apiFetch<Turno[]>('/horarios/turnos'),
        apiFetch<HorarioConfig>('/horarios/config'),
        apiFetch<Aula[]>('/horarios/aulas'),
      ]);
      if (res.success && res.data) {
        setRows(res.data.rows ?? []);
        setPeriodoCodigo(res.data.periodo ?? null);
        setPeriodoNombre(res.data.periodo_nombre ?? null);
      } else {
        setErrorMsg(res.message || 'No se pudo cargar tu carga académica.');
      }
      if (rTurnos.success && rTurnos.data) setTurnos(rTurnos.data);
      if (rConfig.success && rConfig.data) setUsa12(!!rConfig.data.formato_12h);
      if (rAulas.success && rAulas.data) setAulas(rAulas.data);
      setLoading(false);
    };
    cargar();
  }, []);

  // Seleccionar el primer lapso con materias una vez cargadas
  useEffect(() => {
    if (!lapsoSel && lapsos.length > 0) setLapsoSel(lapsos[0][0]);
  }, [lapsos, lapsoSel]);

  // Clases agendadas del lapso seleccionado (el backend las filtra a este docente)
  useEffect(() => {
    if (!lapsoSel) return;
    const [tipo, n] = lapsoSel.split(':');
    const cargar = async () => {
      setLoadingEntries(true);
      const res = await apiFetch<{ entries: HorarioEntry[] }>(
        `/horarios/entries?tipo=${tipo}&trimestre=${n}`
      );
      if (res.success && res.data) {
        setEntries(res.data.entries ?? []);
      } else {
        setEntries([]);
      }
      setLoadingEntries(false);
    };
    cargar();
  }, [lapsoSel]);

  // Una grilla por cada turno donde el docente tiene clases agendadas
  const grids = useMemo(() => {
    const porTurno = new Map<number, HorarioEntry[]>();
    for (const e of entries) {
      porTurno.set(e.turno_id, [...(porTurno.get(e.turno_id) ?? []), e]);
    }
    return turnos
      .filter((t) => porTurno.has(t.id))
      .map((t) => ({ turno: t, entries: porTurno.get(t.id)! }));
  }, [entries, turnos]);

  // Materias agrupadas por lapso
  const grupos = useMemo(() => {
    const map = new Map<string, { tipo: string; n: number; label: string; rows: MateriaAsignableRow[] }>();
    for (const r of rows) {
      const k = lapsoKey(r.tipo_proyeccion, r.trimestre);
      if (!map.has(k)) {
        map.set(k, {
          tipo: r.tipo_proyeccion,
          n: r.trimestre,
          label: labelLapso(r.trimestre, r.tipo_proyeccion),
          rows: [],
        });
      }
      map.get(k)!.rows.push(r);
    }
    return [...map.values()].sort((a, b) => ordenTipo(a.tipo) - ordenTipo(b.tipo) || a.n - b.n);
  }, [rows]);

  const totalHoras = rows.reduce((acc, r) => acc + (r.horas_semanales || 0), 0);

  return (
    <div className="max-w-7xl mx-auto w-full">
      {/* Encabezado del portal */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-900/60 via-indigo-900/40 to-slate-900 border border-blue-500/20 p-6 sm:p-8 shadow-2xl mb-6">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 text-blue-300 px-3 py-1 rounded-full text-xs font-semibold mb-3">
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Portal del Docente</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {user?.nombre} {user?.apellido}
          </h2>
          <p className="text-slate-300 text-sm mt-2">
            C.I. {user?.profesor_cedula ?? user?.username}
            {user?.pnf_nombre ? ` · ${pnfLabel(user.pnf_nombre)}` : ''}
            {periodoNombre ? ` · ${periodoNombre}` : ''}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Cargando tu información académica...</span>
        </div>
      ) : errorMsg ? (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-10 text-center">
          <BookOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-semibold">Sin carga académica</p>
          <p className="text-slate-500 text-xs mt-1">
            No tienes unidades curriculares asignadas en el periodo académico activo.
          </p>
        </div>
      ) : (
        <>
          {/* Barra de vista + selector de lapso */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setVista('horario')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  vista === 'horario' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <CalendarClock className="w-3.5 h-3.5" />
                <span>Mi Horario</span>
              </button>
              <button
                onClick={() => setVista('materias')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  vista === 'materias' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Mis Materias</span>
              </button>
              <button
                onClick={() => setVista('disponibilidad')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  vista === 'disponibilidad' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <CalendarCheck className="w-3.5 h-3.5" />
                <span>Mi Disponibilidad</span>
              </button>
            </div>
            {vista === 'horario' && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 font-semibold">Lapso:</label>
                <select
                  value={lapsoSel ?? ''}
                  onChange={(e) => setLapsoSel(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  {lapsos.map(([key, l]) => (
                    <option key={key} value={key}>
                      {labelLapso(l.n, l.tipo)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {vista === 'horario' && profesorId != null && (
              <button
                onClick={() => setReporteOpen(true)}
                className="ml-auto px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir / Excel</span>
              </button>
            )}
          </div>

          {vista === 'horario' ? (
            loadingEntries ? (
              <div className="flex items-center justify-center py-16 text-slate-400 gap-3 bg-slate-900/90 border border-slate-800 rounded-2xl">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Cargando horario...</span>
              </div>
            ) : entries.length === 0 ? (
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-10 text-center">
                <Clock className="w-9 h-9 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-300 font-semibold text-sm">Sin clases agendadas</p>
                <p className="text-slate-500 text-xs mt-1">
                  No tienes clases en el horario de este lapso todavía.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {grids.map((g) => (
                  <HorarioReadonlyGrid
                    key={g.turno.id}
                    turno={g.turno}
                    entries={g.entries}
                    usa12h={usa12}
                  />
                ))}
                {grids.length === 0 && (
                  <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-10 text-center">
                    <AlertCircle className="w-9 h-9 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-300 font-semibold text-sm">
                      No se pudo armar la grilla del turno
                    </p>
                    <p className="text-slate-500 text-xs mt-1">
                      Tus clases existen pero su turno no está configurado en el sistema.
                    </p>
                  </div>
                )}
              </div>
            )
          ) : vista === 'disponibilidad' ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
              <div className="mb-4 p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-start gap-3 text-blue-200/90 text-xs leading-relaxed">
                <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>
                  Tu disponibilidad será tenida en cuenta por el sistema de generación automática de
                  horarios al programar tus clases. Ten en cuenta que se considera una preferencia y
                  no una garantía absoluta: si por la carga académica no existe una forma viable de
                  respetarla, la coordinación podrá ajustar la asignación.
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mb-4">
                Click en una celda para alternar entre{' '}
                <span className="text-emerald-300 font-semibold">disponible</span> y{' '}
                <span className="text-red-300 font-semibold">no disponible</span>.
              </p>
              {profesorId != null ? (
                <DisponibilidadGrid profesorId={profesorId} />
              ) : (
                <div className="py-14 text-center text-slate-500 text-xs italic">
                  Tu cuenta no está vinculada a un registro de docente.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {grupos.map((g) => (
                <div key={`${g.tipo}:${g.n}`} className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-clip">
                  <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">{g.label}</h3>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      {g.rows.length} materia{g.rows.length === 1 ? '' : 's'} ·{' '}
                      {g.rows.reduce((a, r) => a + (r.horas_semanales || 0), 0)} hrs/sem
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800/70">
                          <th className="px-4 py-2 font-bold">Unidad Curricular</th>
                          <th className="px-4 py-2 font-bold">PNF</th>
                          <th className="px-4 py-2 font-bold">Trayecto</th>
                          <th className="px-4 py-2 font-bold">Sección</th>
                          <th className="px-4 py-2 font-bold">Turno</th>
                          <th className="px-4 py-2 font-bold text-center">Hrs/Sem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r, i) => (
                          <tr
                            key={`${r.materia_id}-${r.seccion_id}-${i}`}
                            className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors"
                          >
                            <td className="px-4 py-2.5 font-semibold text-slate-200">{r.materia_nombre}</td>
                            <td className="px-4 py-2.5 text-slate-400">{pnfLabel(r.pnf_nombre)}</td>
                            <td className="px-4 py-2.5 text-slate-400">{r.trayecto_nombre}</td>
                            <td className="px-4 py-2.5 text-slate-300">{r.seccion_nombre}</td>
                            <td className="px-4 py-2.5 text-slate-400">{r.turno_nombre}</td>
                            <td className="px-4 py-2.5 text-center text-slate-300 font-semibold">
                              {r.horas_semanales}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-500 text-right">
                Total semanal: <span className="font-semibold text-slate-300">{totalHoras} hrs</span>
              </p>
            </div>
          )}
        </>
      )}

      <ReporteHorarioModal
        isOpen={reporteOpen}
        onClose={() => setReporteOpen(false)}
        periodo={periodoCodigo}
        lapsoActual={lapsoSel ?? lapsos[0]?.[0] ?? 'TRIMESTRAL:1'}
        lapsos={lapsos.map(([k]) => k)}
        rows={rows}
        aulas={aulas}
        turnos={turnos}
        formato12={usa12}
        profesorPreseleccionado={profesorId ?? undefined}
        soloProfesores
      />
    </div>
  );
};
