import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api/client.js';
import { applySectionNamingConvention, SeccionForm, MateriaPayload, MateriasReadonlyTable, TurnoJornada, jornadaDeSeccion, excesosDeSeccion, JornadaSeccionWarning, resolverTurnoSeccion } from './CrearProyeccionModal.js';
import {
  X,
  BookOpen,
  Calendar,
  Users,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  RotateCcw,
  Save,
  Pencil,
} from 'lucide-react';

interface EditarProyeccionModalProps {
  proyeccion: any | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditarProyeccionModal: React.FC<EditarProyeccionModalProps> = ({
  proyeccion,
  onClose,
  onSuccess,
}) => {
  const [nombre, setNombre] = useState('');
  const [periodoAcademico, setPeriodoAcademico] = useState('');
  const [tipoProyeccion, setTipoProyeccion] = useState<'TRIMESTRAL' | 'SEMESTRAL'>('TRIMESTRAL');
  const [secciones, setSecciones] = useState<SeccionForm[]>([]);
  const [materias, setMaterias] = useState<MateriaPayload[]>([]);

  const [turnosList, setTurnosList] = useState<Array<{ id: number; turno: string }>>([]);
  const [turnosLocales, setTurnosLocales] = useState<TurnoJornada[]>([]);
  const [mayasList, setMayasList] = useState<Array<{ id: number; descripcion: string; tipopensum_id: number }>>([]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [materiasTab, setMateriasTab] = useState<string>('general');

  const isOpen = !!proyeccion;

  useEffect(() => {
    if (!proyeccion) return;

    setNombre(proyeccion.nombre || '');
    setPeriodoAcademico(proyeccion.periodo_academico || '');
    setTipoProyeccion(proyeccion.tipo_proyeccion === 'SEMESTRAL' ? 'SEMESTRAL' : 'TRIMESTRAL');
    setErrorMsg(null);

    const mapMateria = (m: any): MateriaPayload => ({
      subject_saga_id: m.subject_saga_id,
      nombre: m.nombre,
      horas_totales: m.horas_totales ?? 0,
      horas_semanales: m.horas_semanales ?? 0,
      q1: !!m.q1,
      q2: !!m.q2,
      q3: !!m.q3,
      semestre1: !!m.semestre1,
      semestre2: !!m.semestre2,
      eliminada: !!m.eliminada,
    });

    setSecciones(
      (proyeccion.secciones || []).map((s: any) => ({
        nombre: s.nombre,
        turno_saga_id: s.turno_saga_id,
        turno_nombre: s.turno_nombre,
        estudiantes_estimados: s.estudiantes_estimados ?? 30,
        maya_id: s.maya_id ?? null,
        maya_descripcion: s.maya_descripcion,
        materias: s.maya_id
          ? (proyeccion.materias || []).filter((m: any) => m.seccion_id === s.id).map(mapMateria)
          : undefined,
      }))
    );

    // Materias generales: las que no pertenecen a una sección específica
    setMaterias(
      (proyeccion.materias || []).filter((m: any) => m.seccion_id == null).map(mapMateria)
    );

    const fetchCatalogos = async () => {
      const [resTurnos, resMayas, resTurnosLocales] = await Promise.all([
        apiFetch<Array<{ id: number; turno: string }>>('/saga/turnos'),
        apiFetch<Array<{ id: number; descripcion: string; tipopensum_id: number }>>(`/saga/mayas/${proyeccion.pnf_saga_id}`),
        apiFetch<TurnoJornada[]>('/horarios/turnos'),
      ]);
      if (resTurnos.success && resTurnos.data) setTurnosList(resTurnos.data);
      if (resTurnosLocales.success && resTurnosLocales.data) setTurnosLocales(resTurnosLocales.data);
      if (resMayas.success && resMayas.data) setMayasList(resMayas.data);
    };
    fetchCatalogos();
  }, [proyeccion]);

  const handleAddSeccion = () => {
    const updated = [
      ...secciones,
      { nombre: '', turno_saga_id: 1, turno_nombre: 'Mañana', estudiantes_estimados: 30 },
    ];
    setSecciones(applySectionNamingConvention(updated));
  };

  const handleRemoveSeccion = (index: number) => {
    setSecciones(applySectionNamingConvention(secciones.filter((_, i) => i !== index)));
  };

  // Cambiar el pensum de una sección específica (usa materias de otra malla)
  const handleSeccionMayaChange = async (idx: number, mayaId: number | '') => {
    if (mayaId === '') {
      setSecciones((prev) => {
        const arr = [...prev];
        arr[idx] = { ...arr[idx], maya_id: null, maya_descripcion: undefined, materias: undefined, loadingMaterias: false };
        return arr;
      });
      return;
    }

    const mayaObj = mayasList.find((m) => m.id === Number(mayaId));
    setSecciones((prev) => {
      const arr = [...prev];
      arr[idx] = {
        ...arr[idx],
        maya_id: Number(mayaId),
        maya_descripcion: mayaObj?.descripcion || '',
        materias: [],
        loadingMaterias: true,
      };
      return arr;
    });

    const res = await apiFetch<any[]>(
      `/saga/ucslist/${proyeccion.pnf_saga_id}/${proyeccion.trayecto_saga_id}/${mayaId}`
    );

    setSecciones((prev) => {
      const arr = [...prev];
      if (!arr[idx] || arr[idx].maya_id !== Number(mayaId)) return prev;
      arr[idx] = {
        ...arr[idx],
        loadingMaterias: false,
        materias:
          res.success && res.data
            ? res.data.map((m: any): MateriaPayload => ({
                subject_saga_id: m.id,
                nombre: m.description,
                horas_totales: m.hours?.total ?? 0,
                horas_semanales: m.horasSemanales ?? 0,
                q1: m.quarters?.q1 === 1,
                q2: m.quarters?.q2 === 1,
                q3: m.quarters?.q3 === 1,
                semestre1: !!m.semestre1Activo,
                semestre2: !!m.semestre2Activo,
              }))
            : [],
      };
      return arr;
    });
  };

  // Soft-delete: alternar 'eliminada' en todas las secciones que usan una maya dada
  const handleToggleMateriaMaya = (mayaId: number, subjectSagaId: number) => {
    setSecciones((prev) =>
      prev.map((s) =>
        s.maya_id === mayaId
          ? {
              ...s,
              materias: (s.materias || []).map((m) =>
                m.subject_saga_id === subjectSagaId ? { ...m, eliminada: !m.eliminada } : m
              ),
            }
          : s
      )
    );
  };

  // Soft-delete en el pensum general
  const handleToggleMateriaGeneral = (subjectSagaId: number) => {
    setMaterias((prev) =>
      prev.map((m) =>
        m.subject_saga_id === subjectSagaId ? { ...m, eliminada: !m.eliminada } : m
      )
    );
  };

  // Editar una materia en todas las secciones que usan una maya dada
  const handleUpdateMateriaMaya = (mayaId: number, subjectSagaId: number, patch: Partial<MateriaPayload>) => {
    setSecciones((prev) =>
      prev.map((s) =>
        s.maya_id === mayaId
          ? {
              ...s,
              materias: (s.materias || []).map((m) =>
                m.subject_saga_id === subjectSagaId ? { ...m, ...patch } : m
              ),
            }
          : s
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!nombre.trim() || !periodoAcademico) {
      setErrorMsg('El nombre y el periodo académico son obligatorios.');
      return;
    }
    if (secciones.length === 0) {
      setErrorMsg('Debe definir al menos una sección para la proyección.');
      return;
    }

    setSaving(true);
    const res = await apiFetch(`/proyecciones/${proyeccion.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: nombre.trim(),
        periodo_academico: periodoAcademico,
        tipo_proyeccion: tipoProyeccion,
        secciones,
        materias,
      }),
    });
    setSaving(false);

    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setErrorMsg(res.message || 'Error actualizando la proyección.');
    }
  };

  // Pensums distintos seleccionados en las secciones (para los tabs de materias)
  const mayasEnSecciones: Array<{ id: number; descripcion: string }> = [];
  for (const s of secciones) {
    if (s.maya_id && !mayasEnSecciones.some((m) => m.id === s.maya_id)) {
      mayasEnSecciones.push({ id: s.maya_id, descripcion: s.maya_descripcion || `Pensum #${s.maya_id}` });
    }
  }

  const activeMateriasTab =
    materiasTab !== 'general' && !mayasEnSecciones.some((m) => String(m.id) === materiasTab)
      ? 'general'
      : materiasTab;

  const materiasDeMayaTab = (mayaId: number): MateriaPayload[] => {
    const seen = new Set<number>();
    const out: MateriaPayload[] = [];
    for (const s of secciones) {
      if (s.maya_id !== mayaId) continue;
      for (const m of s.materias || []) {
        if (!seen.has(m.subject_saga_id)) {
          seen.add(m.subject_saga_id);
          out.push(m);
        }
      }
    }
    return out;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2.5">
                <span>Editar Proyección</span>
                <span className="text-[10px] font-semibold font-mono bg-slate-800/80 border border-slate-700 text-slate-400 px-2 py-0.5 rounded-md">
                  Periodo {periodoAcademico}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {proyeccion.codigo} — {proyeccion.pnf_nombre} / {proyeccion.trayecto_nombre}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8">
          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Datos generales */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>1. Datos Generales</span>
            </h4>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Nombre de la Proyección
              </label>
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Modalidad de Régimen Académico
              </label>
              <div className="flex items-center gap-3 bg-slate-950 border border-slate-800 rounded-xl p-2">
                <button
                  type="button"
                  onClick={() => setTipoProyeccion('TRIMESTRAL')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                    tipoProyeccion === 'TRIMESTRAL'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Trimestral (T1, T2, T3)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTipoProyeccion('SEMESTRAL')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                    tipoProyeccion === 'SEMESTRAL'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Semestral (Semestre I y II)</span>
                </button>
              </div>
            </div>
          </div>

          {/* 2. Secciones */}
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>2. Secciones ({secciones.length})</span>
              </h4>
              <button
                type="button"
                onClick={handleAddSeccion}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Sección</span>
              </button>
            </div>

            {secciones.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-slate-400 text-xs">
                No hay secciones. Agregue al menos una para guardar la proyección.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {secciones.map((sec, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-start gap-3"
                  >
                    <div className="flex-1 space-y-2.5">
                      <div>
                        <label className="block text-[10px] text-slate-400 font-semibold mb-1">Nombre de la Sección</label>
                        <input
                          type="text"
                          value={sec.nombre}
                          onChange={(e) => {
                            const newArr = [...secciones];
                            newArr[idx].nombre = e.target.value;
                            setSecciones(newArr);
                          }}
                          className="w-full bg-slate-900 border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-white text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          placeholder="Ej. Sección 1 - Mañana"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                        <div>
                          <label className="block text-[10px] text-slate-400 font-semibold mb-1">Turno</label>
                          <select
                            value={sec.turno_nombre}
                            onChange={(e) => {
                              const resuelto = resolverTurnoSeccion(e.target.value, turnosList, turnosLocales);
                              const newArr = [...secciones];
                              newArr[idx].turno_nombre = resuelto.turno_nombre;
                              newArr[idx].turno_saga_id = resuelto.turno_saga_id;
                              setSecciones(applySectionNamingConvention(newArr));
                            }}
                            className="w-full bg-slate-900 border border-slate-700/60 rounded-lg px-2 py-1.5 text-white text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          >
                            {['Mañana', 'Tarde', 'Noche', 'Diurno'].includes(sec.turno_nombre) ||
                            turnosList.some((t) => t.turno === sec.turno_nombre) ? null : (
                              <option value={sec.turno_nombre}>{sec.turno_nombre}</option>
                            )}
                            <option value="Mañana">Mañana</option>
                            <option value="Tarde">Tarde</option>
                            <option value="Noche">Noche</option>
                            <option value="Diurno">Diurno</option>
                            {turnosList.map(
                              (t) =>
                                !['Mañana', 'Tarde', 'Noche', 'Diurno'].includes(t.turno) && (
                                  <option key={t.id} value={t.turno}>
                                    {t.turno}
                                  </option>
                                )
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-400 font-semibold mb-1">Estudiantes</label>
                          <input
                            type="number"
                            min="1"
                            value={sec.estudiantes_estimados}
                            onChange={(e) => {
                              const newArr = [...secciones];
                              newArr[idx].estudiantes_estimados = Number(e.target.value);
                              setSecciones(newArr);
                            }}
                            className="w-full bg-slate-900 border border-slate-700/60 rounded-lg px-2 py-1.5 text-white text-xs text-center focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Pensum propio de la sección (opcional) */}
                      <div>
                        <label className="block text-[10px] text-slate-400 font-semibold mb-1 flex items-center justify-between">
                          <span>Pensum de esta sección</span>
                          {sec.loadingMaterias && <Loader2 className="w-3 h-3 animate-spin text-purple-400" />}
                        </label>
                        <select
                          value={sec.maya_id ?? ''}
                          onChange={(e) => handleSeccionMayaChange(idx, e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700/60 rounded-lg px-2 py-1.5 text-white text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none"
                        >
                          <option value="">Pensum general de la proyección</option>
                          {mayasList.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.descripcion} {m.tipopensum_id === 2 ? '(Prosecución)' : '(Regular)'}
                            </option>
                          ))}
                          {sec.maya_id && !mayasList.some((m) => m.id === sec.maya_id) && (
                            <option value={sec.maya_id}>{sec.maya_descripcion || `Pensum #${sec.maya_id}`}</option>
                          )}
                        </select>
                      </div>

                      {/* Materias propias de la sección: se gestionan en los tabs de la sección 3 */}
                      {sec.maya_id && (
                        <div className="text-[10px] text-purple-300/80 flex items-center gap-1">
                          {sec.loadingMaterias ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Cargando materias del pensum...</span>
                            </>
                          ) : (
                            <span>{sec.materias?.length || 0} materias — gestionar en la pestaña del pensum (sección 3)</span>
                          )}
                        </div>
                      )}

                      <JornadaSeccionWarning
                        excesos={excesosDeSeccion(
                          sec,
                          materias,
                          tipoProyeccion,
                          jornadaDeSeccion(turnosLocales, sec.turno_saga_id, sec.turno_nombre)
                        )}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveSeccion(idx)}
                      className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors mt-6"
                      title="Eliminar sección"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Materias */}
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <h4 className="text-sm font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              <span>3. Materias de la Proyección ({materias.length})</span>
            </h4>

            {/* Tabs: Pensum general + un tab por cada maya usada en secciones */}
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 overflow-x-auto">
              <button
                type="button"
                onClick={() => setMateriasTab('general')}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${
                  activeMateriasTab === 'general'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Pensum General ({materias.length})
              </button>
              {mayasEnSecciones.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMateriasTab(String(m.id))}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${
                    activeMateriasTab === String(m.id)
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {m.descripcion}
                </button>
              ))}
            </div>

            {activeMateriasTab !== 'general' ? (
              (() => {
                const mayaId = Number(activeMateriasTab);
                const rows = materiasDeMayaTab(mayaId);
                return rows.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-slate-400 text-xs">
                    No hay materias cargadas para este pensum.
                  </div>
                ) : (
                  <MateriasReadonlyTable
                    rows={rows}
                    tipo={tipoProyeccion}
                    onRemove={(m) => handleToggleMateriaMaya(mayaId, m.subject_saga_id)}
                    onUpdate={(m, patch) => handleUpdateMateriaMaya(mayaId, m.subject_saga_id, patch)}
                  />
                );
              })()
            ) : materias.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-slate-400 text-xs">
                Esta proyección no tiene materias asociadas.
              </div>
            ) : (
              <div className="border border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Materia / Unidad Curricular</th>
                      <th className="py-3 px-4 text-center">Horas Semanales</th>
                      <th className="py-3 px-4 text-center">
                        {tipoProyeccion === 'TRIMESTRAL' ? 'Trimestres Activos' : 'Semestres Activos'}
                      </th>
                      <th className="py-3 px-4 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                    {materias.map((m, idx) => (
                      <tr
                        key={idx}
                        className={`transition-colors ${m.eliminada ? 'opacity-40 bg-slate-950/40' : 'hover:bg-slate-800/40'}`}
                      >
                        <td className="py-3 px-4 font-semibold text-white">
                          <span className={m.eliminada ? 'line-through text-slate-500' : ''}>{m.nombre}</span>
                          {m.eliminada && (
                            <span className="ml-2 text-[9px] uppercase font-bold bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">
                              Ignorada
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="number"
                            min="0"
                            value={m.horas_semanales}
                            onChange={(e) => {
                              const newArr = [...materias];
                              newArr[idx].horas_semanales = Number(e.target.value);
                              setMaterias(newArr);
                            }}
                            className="w-16 bg-slate-900 border border-slate-700/60 rounded-lg px-2 py-1 text-white text-xs text-center focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1">
                            {tipoProyeccion === 'TRIMESTRAL' ? (
                              (['q1', 'q2', 'q3'] as const).map((key, qi) => (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => {
                                    const newArr = [...materias];
                                    newArr[idx][key] = !newArr[idx][key];
                                    setMaterias(newArr);
                                  }}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                    m[key]
                                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                      : 'bg-slate-800 text-slate-600 hover:text-slate-400'
                                  }`}
                                >
                                  T{qi + 1}
                                </button>
                              ))
                            ) : (
                              (['semestre1', 'semestre2'] as const).map((key, si) => (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => {
                                    const newArr = [...materias];
                                    newArr[idx][key] = !newArr[idx][key];
                                    setMaterias(newArr);
                                  }}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                    m[key]
                                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                                      : 'bg-slate-800 text-slate-600 hover:text-slate-400'
                                  }`}
                                >
                                  Semestre {si === 0 ? 'I' : 'II'}
                                </button>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleMateriaGeneral(m.subject_saga_id)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              m.eliminada
                                ? 'text-emerald-500/70 hover:text-emerald-300 hover:bg-emerald-500/10'
                                : 'text-slate-500 hover:text-red-400 hover:bg-red-500/10'
                            }`}
                            title={m.eliminada ? 'Restaurar materia' : 'Ignorar materia'}
                          >
                            {m.eliminada ? <RotateCcw className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer Submit Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-semibold shadow-lg shadow-amber-600/30 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando cambios...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Guardar Cambios</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
