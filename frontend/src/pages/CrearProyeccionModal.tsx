import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api/client.js';
import {
  X,
  BookOpen,
  Calendar,
  Layers,
  Clock,
  Users,
  Check,
  Loader2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles
} from 'lucide-react';

interface PNF {
  id: number;
  programa: string;
}

interface Trayecto {
  id: number;
  trayecto: string;
}

interface Maya {
  id: number;
  descripcion: string;
  tipopensum_id: number;
}

interface SubjectUC {
  id: number;
  description: string;
  hours: { total: number; times: number };
  quarters: { q1: number; q2: number; q3: number };
  horasSemanales: number;
  trimestresActivos: number[];
  semestre1Activo: boolean;
  semestre2Activo: boolean;
  eliminada?: boolean;
}

interface TurnoEstimacion {
  turnoId: number;
  turnoNombre: string;
  estudiantesContados: number;
  seccionesEstimadas: number;
}

export interface MateriaPayload {
  subject_saga_id: number;
  nombre: string;
  horas_totales: number;
  horas_semanales: number;
  q1: boolean;
  q2: boolean;
  q3: boolean;
  semestre1: boolean;
  semestre2: boolean;
  eliminada?: boolean;
}

export interface SeccionForm {
  nombre: string;
  turno_saga_id: number;
  turno_nombre: string;
  estudiantes_estimados: number;
  maya_id?: number | null;
  maya_descripcion?: string;
  materias?: MateriaPayload[];
  loadingMaterias?: boolean;
}

export function mapSubjectToMateriaPayload(m: SubjectUC): MateriaPayload {
  return {
    subject_saga_id: m.id,
    nombre: m.description,
    horas_totales: m.hours.total,
    horas_semanales: m.horasSemanales,
    q1: m.quarters.q1 === 1,
    q2: m.quarters.q2 === 1,
    q3: m.quarters.q3 === 1,
    semestre1: m.semestre1Activo,
    semestre2: m.semestre2Activo,
    eliminada: !!m.eliminada,
  };
}

interface CrearProyeccionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const MateriasReadonlyTable: React.FC<{
  rows: MateriaPayload[];
  tipo: 'TRIMESTRAL' | 'SEMESTRAL';
  onRemove?: (m: MateriaPayload) => void;
  onUpdate?: (m: MateriaPayload, patch: Partial<MateriaPayload>) => void;
}> = ({ rows, tipo, onRemove, onUpdate }) => (
  <div className="border border-slate-800 rounded-2xl overflow-hidden">
    <table className="w-full text-left text-xs text-slate-300">
      <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
        <tr>
          <th className="py-3 px-4">Materia / Unidad Curricular</th>
          <th className="py-3 px-4 text-center">Horas Semanales</th>
          <th className="py-3 px-4 text-center">
            {tipo === 'TRIMESTRAL' ? 'Trimestres Activos' : 'Semestres Activos'}
          </th>
          {onRemove && <th className="py-3 px-4 text-center w-12"></th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
        {rows.map((m) => (
          <tr
            key={m.subject_saga_id}
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
            <td className="py-3 px-4 text-center font-semibold text-blue-400">
              {onUpdate ? (
                <input
                  type="number"
                  min="0"
                  value={m.horas_semanales}
                  onChange={(e) => onUpdate(m, { horas_semanales: Number(e.target.value) })}
                  className="w-16 bg-slate-900 border border-slate-700/60 rounded-lg px-2 py-1 text-white text-xs text-center focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              ) : (
                `${m.horas_semanales} hrs/sem`
              )}
            </td>
            <td className="py-3 px-4 text-center">
              {tipo === 'TRIMESTRAL' ? (
                <div className="flex items-center justify-center gap-1">
                  {(['q1', 'q2', 'q3'] as const).map((q, i) =>
                    onUpdate ? (
                      <button
                        key={q}
                        type="button"
                        onClick={() => onUpdate(m, { [q]: !m[q] })}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                          m[q]
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                            : 'bg-slate-800 text-slate-600 hover:text-slate-400'
                        }`}
                      >
                        T{i + 1}
                      </button>
                    ) : (
                      <span
                        key={q}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          m[q]
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                            : 'bg-slate-800 text-slate-600'
                        }`}
                      >
                        T{i + 1}
                      </span>
                    )
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1">
                  {(['semestre1', 'semestre2'] as const).map((s, i) =>
                    onUpdate ? (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onUpdate(m, { [s]: !m[s] })}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                          m[s]
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                            : 'bg-slate-800 text-slate-600 hover:text-slate-400'
                        }`}
                      >
                        Semestre {i === 0 ? 'I' : 'II'}
                      </button>
                    ) : (
                      <span
                        key={s}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          m[s]
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                            : 'bg-slate-800 text-slate-600'
                        }`}
                      >
                        Semestre {i === 0 ? 'I' : 'II'}
                      </span>
                    )
                  )}
                </div>
              )}
            </td>
            {onRemove && (
              <td className="py-3 px-4 text-center">
                <button
                  type="button"
                  onClick={() => onRemove(m)}
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
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export function applySectionNamingConvention(seccionesList: SeccionForm[]): SeccionForm[] {
  let mananaCount = 0;
  let tardeCount = 0;
  let nocheCount = 0;
  let diurnoCount = 0;
  const otherCounts: Record<string, number> = {};

  // Contar cuantas secciones son de la Mañana
  const totalManana = seccionesList.filter((s) => {
    const t = (s.turno_nombre || '').toLowerCase();
    return t.includes('mañana') || t.includes('manana');
  }).length;

  return seccionesList.map((sec) => {
    const t = (sec.turno_nombre || 'Mañana').toLowerCase();
    let prefix = 'M-';
    let num = 1;

    if (t.includes('mañana') || t.includes('manana')) {
      mananaCount++;
      prefix = 'M-';
      num = mananaCount;
    } else if (t.includes('tarde')) {
      if (tardeCount === 0) {
        tardeCount = totalManana;
      }
      tardeCount++;
      prefix = 'T-';
      num = tardeCount;
    } else if (t.includes('noche')) {
      nocheCount++;
      prefix = 'N-';
      num = nocheCount;
    } else if (t.includes('diurno')) {
      diurnoCount++;
      prefix = 'D-';
      num = diurnoCount;
    } else {
      const initial = (sec.turno_nombre || 'X').charAt(0).toUpperCase();
      otherCounts[initial] = (otherCounts[initial] || 0) + 1;
      prefix = `${initial}-`;
      num = otherCounts[initial];
    }

    const numPadded = String(num).padStart(2, '0');
    return {
      ...sec,
      nombre: `${prefix}${numPadded}`,
    };
  });
}

export const CrearProyeccionModal: React.FC<CrearProyeccionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  // Catalog States
  const [pnfList, setPnfList] = useState<PNF[]>([]);
  const [trayectosList, setTrayectosList] = useState<Trayecto[]>([]);
  const [mayasList, setMayasList] = useState<Maya[]>([]);
  const [periodoActivo, setPeriodoActivo] = useState<{ id: number; codigo: string; nombre: string } | null>(null);
  const [turnosList, setTurnosList] = useState<Array<{ id: number; turno: string }>>([]);

  // Selected Form States
  const [selectedPnf, setSelectedPnf] = useState<number | ''>('');
  const [selectedTrayecto, setSelectedTrayecto] = useState<number | ''>('');
  const [selectedMaya, setSelectedMaya] = useState<number | ''>('');
  const [periodoAcademico, setPeriodoAcademico] = useState<string>('2026-1');
  const [tipoProyeccion, setTipoProyeccion] = useState<'TRIMESTRAL' | 'SEMESTRAL'>('TRIMESTRAL');
  const [nombreProyeccion, setNombreProyeccion] = useState<string>('');

  // SAGA Data Loaded States
  const [materias, setMaterias] = useState<SubjectUC[]>([]);
  const [secciones, setSecciones] = useState<SeccionForm[]>([]);
  const [estimacionesSaga, setEstimacionesSaga] = useState<TurnoEstimacion[]>([]);
  const [materiasTab, setMateriasTab] = useState<string>('general');

  // Loading & Feedback
  const [loadingCatalogos, setLoadingCatalogos] = useState(false);
  const [loadingMayas, setLoadingMayas] = useState(false);
  const [loadingMaterias, setLoadingMaterias] = useState(false);
  const [loadingInscripciones, setLoadingInscripciones] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. Cargar catálogos base (PNF, Trayectos, Turnos y Periodos Académicos) al abrir el modal
  useEffect(() => {
    if (!isOpen) return;

    const fetchBaseCatalogs = async () => {
      setLoadingCatalogos(true);
      setErrorMsg(null);

      const [resPnf, resTrayectos, resPeriodos, resTurnos] = await Promise.all([
        apiFetch<PNF[]>('/saga/programas'),
        apiFetch<Trayecto[]>('/saga/trayectos'),
        apiFetch<Array<{ id: number; codigo: string; nombre: string; estado: string }>>('/periodos'),
        apiFetch<Array<{ id: number; turno: string }>>('/saga/turnos'),
      ]);

      if (resPnf.success && resPnf.data) setPnfList(resPnf.data);
      if (resTrayectos.success && resTrayectos.data) setTrayectosList(resTrayectos.data);
      if (resTurnos.success && resTurnos.data) setTurnosList(resTurnos.data);

      // El periodo de la proyección siempre es el periodo ACTIVO (no editable)
      if (resPeriodos.success && resPeriodos.data) {
        const activo = resPeriodos.data.find((p) => p.estado === 'ACTIVO');
        if (activo) {
          setPeriodoActivo(activo);
          setPeriodoAcademico(activo.codigo);
        } else {
          setPeriodoActivo(null);
          setPeriodoAcademico('');
        }
      }

      setLoadingCatalogos(false);
    };

    fetchBaseCatalogs();
  }, [isOpen]);

  // 2. Al seleccionar PNF, cargar sus Mallas de SAGA
  useEffect(() => {
    if (!selectedPnf) {
      setMayasList([]);
      setSelectedMaya('');
      return;
    }

    const fetchMayas = async () => {
      setLoadingMayas(true);
      setSelectedMaya('');
      setMaterias([]);

      const res = await apiFetch<Maya[]>(`/saga/mayas/${selectedPnf}`);
      if (res.success && res.data) {
        setMayasList(res.data);
        if (res.data.length > 0) {
          setSelectedMaya(res.data[0].id); // Seleccionar la más reciente por defecto
        }
      }
      setLoadingMayas(false);
    };

    fetchMayas();
  }, [selectedPnf]);

  // 3. Al tener PNF + Trayecto + Maya, cargar materias e inscripciones de SAGA
  useEffect(() => {
    if (selectedPnf === '' || selectedTrayecto === '' || selectedMaya === '') {
      setMaterias([]);
      setEstimacionesSaga([]);
      setSecciones([]);
      return;
    }

    const fetchMateriasEInscripciones = async () => {
      setLoadingMaterias(true);
      setLoadingInscripciones(true);
      setErrorMsg(null);

      // Cargar Materias (ucslist)
      const resMaterias = await apiFetch<SubjectUC[]>(
        `/saga/ucslist/${selectedPnf}/${selectedTrayecto}/${selectedMaya}`
      );
      if (resMaterias.success && resMaterias.data) {
        setMaterias(resMaterias.data);
      } else {
        setMaterias([]);
      }
      setLoadingMaterias(false);

      // Cargar Inscripciones para estimar Secciones por turno
      const resInscripciones = await apiFetch<TurnoEstimacion[]>(
        `/saga/inscriptions-summary/${selectedPnf}/${selectedTrayecto}`
      );
      if (resInscripciones.success && resInscripciones.data) {
        setEstimacionesSaga(resInscripciones.data);

        // Generar secciones preliminares basadas en estimaciones de SAGA
        const autoSecciones: SeccionForm[] = [];
        resInscripciones.data.forEach((est) => {
          for (let i = 1; i <= est.seccionesEstimadas; i++) {
            autoSecciones.push({
              nombre: '',
              turno_saga_id: est.turnoId,
              turno_nombre: est.turnoNombre,
              estudiantes_estimados: Math.min(30, Math.ceil(est.estudiantesContados / est.seccionesEstimadas) || 30),
            });
          }
        });

        // Si no hay inscripciones, crear una sección básica por defecto
        if (autoSecciones.length === 0) {
          autoSecciones.push({
            nombre: '',
            turno_saga_id: 1,
            turno_nombre: 'Mañana',
            estudiantes_estimados: 30,
          });
        }
        setSecciones(applySectionNamingConvention(autoSecciones));
      } else {
        setSecciones(
          applySectionNamingConvention([
            { nombre: '', turno_saga_id: 1, turno_nombre: 'Mañana', estudiantes_estimados: 30 },
          ])
        );
      }
      setLoadingInscripciones(false);
    };

    fetchMateriasEInscripciones();
  }, [selectedPnf, selectedTrayecto, selectedMaya]);

  // Autogenerar nombre de la proyección
  useEffect(() => {
    if (selectedPnf !== '' && selectedTrayecto !== '') {
      const pnfObj = pnfList.find((p) => Number(p.id) === Number(selectedPnf));
      const trayObj = trayectosList.find((t) => Number(t.id) === Number(selectedTrayecto));
      if (pnfObj && trayObj) {
        setNombreProyeccion(`Proyección ${pnfObj.programa} - ${trayObj.trayecto} (${periodoAcademico})`);
      }
    }
  }, [selectedPnf, selectedTrayecto, periodoAcademico, pnfList, trayectosList]);

  // Manejar adición de sección manual
  const handleAddSeccion = () => {
    const updated = [
      ...secciones,
      {
        nombre: '',
        turno_saga_id: 1,
        turno_nombre: 'Mañana',
        estudiantes_estimados: 30,
      },
    ];
    setSecciones(applySectionNamingConvention(updated));
  };

  // Manejar eliminación de sección
  const handleRemoveSeccion = (index: number) => {
    const filtered = secciones.filter((_, i) => i !== index);
    setSecciones(applySectionNamingConvention(filtered));
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

    const res = await apiFetch<SubjectUC[]>(
      `/saga/ucslist/${selectedPnf}/${selectedTrayecto}/${mayaId}`
    );

    setSecciones((prev) => {
      const arr = [...prev];
      if (!arr[idx] || arr[idx].maya_id !== Number(mayaId)) return prev;
      arr[idx] = {
        ...arr[idx],
        loadingMaterias: false,
        materias: res.success && res.data ? res.data.map(mapSubjectToMateriaPayload) : [],
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

  // Soft-delete en el pensum general (estado SubjectUC)
  const handleToggleMateriaGeneral = (subjectId: number) => {
    setMaterias((prev) =>
      prev.map((m) => (m.id === subjectId ? { ...m, eliminada: !m.eliminada } : m))
    );
  };

  // Editar una materia del pensum general (estado SubjectUC)
  const handleUpdateMateriaGeneral = (subjectId: number, patch: Partial<MateriaPayload>) => {
    setMaterias((prev) =>
      prev.map((m) => {
        if (m.id !== subjectId) return m;
        return {
          ...m,
          horasSemanales: patch.horas_semanales ?? m.horasSemanales,
          quarters: {
            q1: patch.q1 !== undefined ? (patch.q1 ? 1 : 0) : m.quarters.q1,
            q2: patch.q2 !== undefined ? (patch.q2 ? 1 : 0) : m.quarters.q2,
            q3: patch.q3 !== undefined ? (patch.q3 ? 1 : 0) : m.quarters.q3,
          },
          semestre1Activo: patch.semestre1 ?? m.semestre1Activo,
          semestre2Activo: patch.semestre2 ?? m.semestre2Activo,
        };
      })
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

  // Manejar guardado de la proyección
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const idsValidos = [selectedPnf, selectedTrayecto, selectedMaya].every(
      (v) => v !== '' && Number.isFinite(Number(v))
    );
    if (!idsValidos || !periodoAcademico) {
      setErrorMsg('Debe seleccionar PNF, Trayecto, Pensum y Periodo Académico.');
      return;
    }

    if (secciones.length === 0) {
      setErrorMsg('Debe definir al menos una sección para la proyección.');
      return;
    }

    const pnfObj = pnfList.find((p) => Number(p.id) === Number(selectedPnf));
    const trayObj = trayectosList.find((t) => Number(t.id) === Number(selectedTrayecto));
    const mayaObj = mayasList.find((m) => Number(m.id) === Number(selectedMaya));

    setSaving(true);

    const payload = {
      nombre:
        nombreProyeccion ||
        `Proyección ${pnfObj?.programa ?? 'PNF'} - ${trayObj?.trayecto ?? 'Trayecto'} (${periodoAcademico})`,
      pnf_saga_id: Number(selectedPnf),
      pnf_nombre: pnfObj?.programa || '',
      trayecto_saga_id: Number(selectedTrayecto),
      trayecto_nombre: trayObj?.trayecto || '',
      maya_id: Number(selectedMaya),
      maya_descripcion: mayaObj?.descripcion || '',
      periodo_academico: periodoAcademico,
      tipo_proyeccion: tipoProyeccion,
      secciones: secciones,
      materias: materias.map(mapSubjectToMateriaPayload),
    };

    const res = await apiFetch('/proyecciones', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setErrorMsg(res.message || 'Error guardando la proyección.');
    }
  };

  // Pensums distintos seleccionados en las secciones (para los tabs de materias)
  const mayasEnSecciones: Array<{ id: number; descripcion: string }> = [];
  for (const s of secciones) {
    if (s.maya_id && !mayasEnSecciones.some((m) => m.id === s.maya_id)) {
      mayasEnSecciones.push({ id: s.maya_id, descripcion: s.maya_descripcion || `Pensum #${s.maya_id}` });
    }
  }

  // Si el tab activo ya no corresponde a una maya en uso, volver a "general"
  const activeMateriasTab =
    materiasTab !== 'general' && !mayasEnSecciones.some((m) => String(m.id) === materiasTab)
      ? 'general'
      : materiasTab;

  // Unión de materias de todas las secciones que usan una maya dada
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
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2.5">
                <span>Nueva Proyección Académica</span>
                {periodoActivo && (
                  <span className="text-[10px] font-semibold font-mono bg-slate-800/80 border border-slate-700 text-slate-400 px-2 py-0.5 rounded-md">
                    Periodo {periodoActivo.codigo}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">Consulta en tiempo real con API SAGA</p>
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

          {/* 1. Selección de Parámetros Base */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span>1. Configuración de PNF y Pensum</span>
            </h4>

            {loadingCatalogos ? (
              <div className="py-6 flex justify-center text-slate-400 text-sm gap-2 items-center">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                <span>Cargando carreras y trayectos de SAGA...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* PNF */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Programa Nacional de Formación (PNF)
                  </label>
                  <select
                    required
                    value={selectedPnf}
                    onChange={(e) => setSelectedPnf(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">-- Seleccione PNF --</option>
                    {pnfList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.programa}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Trayecto */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Trayecto Académico
                  </label>
                  <select
                    required
                    value={selectedTrayecto}
                    onChange={(e) => setSelectedTrayecto(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">-- Seleccione Trayecto --</option>
                    {trayectosList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.trayecto}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Pensum / Malla */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
                    <span>Malla Curricular / Pensum</span>
                    {loadingMayas && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />}
                  </label>
                  <select
                    required
                    disabled={!selectedPnf || loadingMayas}
                    value={selectedMaya}
                    onChange={(e) => setSelectedMaya(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
                  >
                    <option value="">-- Seleccione Pensum --</option>
                    {mayasList.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.descripcion} {m.tipopensum_id === 2 ? '(Prosecución)' : '(Regular)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {!periodoActivo && (
              <div className="w-full bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5 text-xs text-red-300 flex items-center gap-2 mt-4">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>No hay periodo académico ACTIVO. Active uno en la vista de Periodos.</span>
              </div>
            )}

            {/* 2. Switch Modalidad */}
            <div className="grid grid-cols-1 gap-4 pt-2">
              <div className="flex flex-col justify-end">
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
          </div>

          {/* 3. Estimación de Secciones SAGA */}
          {selectedPnf !== '' && selectedTrayecto !== '' && selectedMaya !== '' && (
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>2. Secciones Estimadas por Inscripciones SAGA</span>
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

              {loadingInscripciones ? (
                <div className="py-4 flex justify-center text-slate-400 text-xs gap-2 items-center">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Consultando inscritos en SAGA...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Cards de resumen SAGA */}
                  {estimacionesSaga.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                      {estimacionesSaga.map((est) => (
                        <div
                          key={est.turnoNombre}
                          className="bg-slate-950/60 border border-emerald-500/20 p-3 rounded-xl flex items-center justify-between"
                        >
                          <div>
                            <span className="text-xs text-slate-400 font-medium">Turno {est.turnoNombre}</span>
                            <div className="text-sm font-bold text-white">{est.estudiantesContados} Estudiantes</div>
                          </div>
                          <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-2.5 py-1 rounded-lg font-semibold">
                            {est.seccionesEstimadas} Sec. sugeridas
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Lista editable de Secciones */}
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
                                  const selectedNombre = e.target.value;
                                  const foundTurno = turnosList.find(
                                    (t) => t.turno.toLowerCase() === selectedNombre.toLowerCase()
                                  );
                                  const newArr = [...secciones];
                                  newArr[idx].turno_nombre = selectedNombre;
                                  newArr[idx].turno_saga_id = foundTurno ? foundTurno.id : 1;
                                  setSecciones(applySectionNamingConvention(newArr));
                                }}
                                className="w-full bg-slate-900 border border-slate-700/60 rounded-lg px-2 py-1.5 text-white text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              >
                                <option value="Mañana">Mañana</option>
                                <option value="Tarde">Tarde</option>
                                <option value="Noche">Noche</option>
                                <option value="Diurno">Diurno</option>
                                {turnosList.map((t) => (
                                  !['Mañana', 'Tarde', 'Noche', 'Diurno'].includes(t.turno) && (
                                    <option key={t.id} value={t.turno}>
                                      {t.turno}
                                    </option>
                                  )
                                ))}
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
                </div>
              )}
            </div>
          )}

          {/* 4. Lista de Materias Curriculares desde SAGA */}
          {selectedPnf !== '' && selectedTrayecto !== '' && selectedMaya !== '' && (
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <h4 className="text-sm font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                <span>3. Materias del Pensum (SAGA UCs)</span>
              </h4>

              {loadingMaterias ? (
                <div className="py-8 flex justify-center text-slate-400 text-sm gap-2 items-center">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                  <span>Obteniendo Unidades Curriculares del Pensum SAGA...</span>
                </div>
              ) : materias.length === 0 && mayasEnSecciones.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-slate-400 text-xs">
                  No se encontraron materias registradas para la combinación seleccionada.
                </div>
              ) : (
                <div className="space-y-3">
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

                  {activeMateriasTab === 'general' ? (
                    materias.length === 0 ? (
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-slate-400 text-xs">
                        No se encontraron materias en el pensum general.
                      </div>
                    ) : (
                      <MateriasReadonlyTable
                        rows={materias.map(mapSubjectToMateriaPayload)}
                        tipo={tipoProyeccion}
                        onRemove={(m) => handleToggleMateriaGeneral(m.subject_saga_id)}
                        onUpdate={(m, patch) => handleUpdateMateriaGeneral(m.subject_saga_id, patch)}
                      />
                    )
                  ) : (
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
                  )}
                </div>
              )}
            </div>
          )}

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
              disabled={saving || selectedPnf === '' || selectedTrayecto === '' || selectedMaya === ''}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando Proyección...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Crear Proyección Académica</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
