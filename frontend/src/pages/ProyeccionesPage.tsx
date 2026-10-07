import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { usePnfColors } from '../context/PnfColorContext.js';
import { CrearProyeccionModal } from './CrearProyeccionModal.js';
import { EditarProyeccionModal } from './EditarProyeccionModal.js';
import { ordenTrayecto } from './horarios/types.js';
import {
  Calendar,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Trash2,
  Eye,
  Pencil,
  Layers,
  BookOpen,
  Users,
  Search,
  RefreshCw,
  Sparkles
} from 'lucide-react';

interface ProyeccionItem {
  id: number;
  codigo: string;
  nombre: string;
  pnf_saga_id: number;
  pnf_nombre: string;
  trayecto_saga_id: number;
  trayecto_nombre: string;
  maya_id: number;
  maya_descripcion: string;
  periodo_academico: string;
  tipo_proyeccion: 'TRIMESTRAL' | 'SEMESTRAL';
  activa: number;
  creador_nombre?: string;
  creador_apellido?: string;
  created_at: string;
}

// Orden de trayectos: Inicial primero, luego I, II, III, IV, V.
// Fallback: trayecto_saga_id (los IDs de SAGA suelen seguir ese orden).
const ordenTrayectoProy = (p: ProyeccionItem): number =>
  ordenTrayecto(p.trayecto_nombre, p.trayecto_saga_id);

export const ProyeccionesPage: React.FC = () => {
  const { user } = useAuth();
  const { colorDePnf } = usePnfColors();
  const [proyecciones, setProyecciones] = useState<ProyeccionItem[]>([]);
  const [periodoActivo, setPeriodoActivo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [selectedProyeccionDetail, setSelectedProyeccionDetail] = useState<any | null>(null);
  const [editingProyeccion, setEditingProyeccion] = useState<any | null>(null);
  const [deletingProyeccion, setDeletingProyeccion] = useState<ProyeccionItem | null>(null);
  const [slideConfirm, setSlideConfirm] = useState(0);
  const [deletingLoading, setDeletingLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchProyecciones = async () => {
    setLoading(true);
    setErrorMsg(null);
    const res = await apiFetch<ProyeccionItem[]>('/proyecciones');
    if (res.success && res.data) {
      setProyecciones(res.data);
    } else {
      setErrorMsg(res.message || 'Error cargando las proyecciones.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProyecciones();
    // Obtener el periodo académico activo para mostrarlo en la cabecera
    apiFetch<Array<{ codigo: string; estado: string }>>('/periodos').then((res) => {
      if (res.success && res.data) {
        const activo = res.data.find((p) => p.estado === 'ACTIVO');
        if (activo) setPeriodoActivo(activo.codigo);
      }
    });
  }, []);

  const handleToggleActive = async (id: number) => {
    const res = await apiFetch(`/proyecciones/${id}/toggle-active`, { method: 'PUT' });
    if (res.success) {
      fetchProyecciones();
    }
  };

  const handleDelete = (proy: ProyeccionItem) => {
    setDeletingProyeccion(proy);
    setSlideConfirm(0);
  };

  const handleConfirmDelete = async () => {
    if (!deletingProyeccion || slideConfirm < 100) return;
    const id = deletingProyeccion.id;
    setDeletingLoading(true);
    const res = await apiFetch(`/proyecciones/${id}`, { method: 'DELETE' });
    setDeletingLoading(false);
    if (res.success) {
      fetchProyecciones();
      if (selectedProyeccionDetail?.id === id) {
        setSelectedProyeccionDetail(null);
      }
      setDeletingProyeccion(null);
    } else {
      setErrorMsg(res.message || 'Error eliminando la proyección.');
    }
  };

  const handleViewDetail = async (id: number) => {
    setLoadingDetail(true);
    const res = await apiFetch(`/proyecciones/${id}`);
    if (res.success && res.data) {
      setSelectedProyeccionDetail(res.data);
    }
    setLoadingDetail(false);
  };

  const handleEdit = async (id: number) => {
    const res = await apiFetch(`/proyecciones/${id}`);
    if (res.success && res.data) {
      setEditingProyeccion(res.data);
    } else {
      setErrorMsg(res.message || 'Error cargando la proyección para editar.');
    }
  };

  const filteredProyecciones = proyecciones.filter(
    (p) =>
      p.nombre.toLowerCase().includes(filterText.toLowerCase()) ||
      p.pnf_nombre.toLowerCase().includes(filterText.toLowerCase()) ||
      p.codigo.toLowerCase().includes(filterText.toLowerCase())
  );

  // Agrupar por PNF: primero el PNF del usuario (si tiene), luego alfabético.
  // Dentro de cada grupo: trayecto Inicial, I, II, III, IV, V.
  const gruposPorPnf = useMemo(() => {
    const mapa = new Map<number, ProyeccionItem[]>();
    for (const p of filteredProyecciones) {
      const arr = mapa.get(p.pnf_saga_id) || [];
      arr.push(p);
      mapa.set(p.pnf_saga_id, arr);
    }
    const grupos = [...mapa.entries()].map(([pnfSagaId, items]) => ({
      pnfSagaId,
      nombre: items[0].pnf_nombre,
      items: items.sort((a, b) => ordenTrayectoProy(a) - ordenTrayectoProy(b) || a.nombre.localeCompare(b.nombre)),
    }));
    return grupos.sort((a, b) => {
      if (user?.pnf_saga_id != null) {
        if (a.pnfSagaId === user.pnf_saga_id) return -1;
        if (b.pnfSagaId === user.pnf_saga_id) return 1;
      }
      return a.nombre.localeCompare(b.nombre);
    });
  }, [filteredProyecciones, user?.pnf_saga_id]);

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 backdrop-blur-md">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Calendar className="w-7 h-7 text-blue-400" />
            <span>Proyecciones Académicas</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Gestión de la oferta académica por PNF, trayecto y pensum sincronizado con SAGA.
          </p>
          {periodoActivo && (
            <p className="text-[11px] text-emerald-400 mt-1.5 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Mostrando proyecciones del periodo activo: {periodoActivo}</span>
            </p>
          )}
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/25 flex items-center gap-2 transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Proyección</span>
        </button>
      </div>

      {/* Filter and Refresh Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Buscar por PNF, código o nombre..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={fetchProyecciones}
          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Proyecciones Grid / List */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-xs flex justify-center items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          <span>Cargando proyecciones desde la base de datos...</span>
        </div>
      ) : filteredProyecciones.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center text-slate-400">
          <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-300 mb-1">No hay proyecciones registradas</h3>
          <p className="text-xs text-slate-500 mb-4">
            Comience creando una nueva proyección académica seleccionando el PNF y pensum de SAGA.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Crear mi primera proyección</span>
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {gruposPorPnf.map((grupo) => {
            const colorPnf = colorDePnf(grupo.pnfSagaId);
            const esMio = user?.pnf_saga_id === grupo.pnfSagaId;
            return (
              <section key={grupo.pnfSagaId}>
                {/* Encabezado del grupo PNF */}
                <div className="flex items-center gap-2.5 mb-4">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/10"
                    style={{ backgroundColor: colorPnf || '#475569' }}
                  />
                  <h3 className="text-sm font-bold text-white truncate">{grupo.nombre}</h3>
                  {esMio && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 px-1.5 py-0.5 rounded">
                      Tu PNF
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500">
                    {grupo.items.length} proyección{grupo.items.length !== 1 ? 'es' : ''}
                  </span>
                  <div
                    className="flex-1 h-px"
                    style={{
                      background: colorPnf
                        ? `linear-gradient(to right, ${colorPnf}55, transparent)`
                        : 'linear-gradient(to right, #1e293b, transparent)',
                    }}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {grupo.items.map((proy) => (
            <div
              key={proy.id}
              className={`bg-slate-900/90 border rounded-2xl p-5 flex flex-col justify-between transition-all hover:border-blue-500/40 shadow-lg ${
                proy.activa ? 'border-blue-500/30' : 'border-slate-800'
              }`}
              style={colorPnf ? { borderTop: `2px solid ${colorPnf}66` } : undefined}
            >
              <div>
                {/* Header Card */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-mono bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-md text-slate-400 font-semibold">
                    {proy.codigo}
                  </span>

                  <button
                    onClick={() => handleToggleActive(proy.id)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                      proy.activa
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {proy.activa ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3" />}
                    <span>{proy.activa ? 'Proyección Activa' : 'Inactiva'}</span>
                  </button>
                </div>

                <h3 className="text-base font-bold text-white mb-2 leading-snug">{proy.nombre}</h3>

                <div className="space-y-1.5 text-xs text-slate-300 mb-4">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Layers
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: colorPnf || '#60a5fa' }}
                    />
                    <span>{proy.pnf_nombre} — {proy.trayecto_nombre}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <BookOpen className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>Pensum: {proy.maya_descripcion}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="bg-slate-800 px-2 py-0.5 rounded text-[10px] text-slate-300 font-medium">
                      Régimen: {proy.tipo_proyeccion}
                    </span>
                    <span className="text-[10px] text-slate-500">Periodo: {proy.periodo_academico}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewDetail(proy.id)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Ver Detalle</span>
                  </button>

                  <button
                    onClick={() => handleEdit(proy.id)}
                    className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </button>
                </div>

                <button
                  onClick={() => handleDelete(proy)}
                  className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                  title="Eliminar proyección"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Modal Ver Detalle de Proyección */}
      {selectedProyeccionDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <h3 className="text-base font-bold text-white">{selectedProyeccionDetail.nombre}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingProyeccion(selectedProyeccionDetail);
                    setSelectedProyeccionDetail(null);
                  }}
                  className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Editar</span>
                </button>
                <button
                  onClick={() => setSelectedProyeccionDetail(null)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300">
              {/* Información Base */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 font-medium">PNF:</span>
                  <div className="text-white font-bold">{selectedProyeccionDetail.pnf_nombre}</div>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Trayecto:</span>
                  <div className="text-white font-bold">{selectedProyeccionDetail.trayecto_nombre}</div>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Periodo:</span>
                  <div className="text-white font-bold">{selectedProyeccionDetail.periodo_academico}</div>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Régimen:</span>
                  <div className="text-white font-bold">{selectedProyeccionDetail.tipo_proyeccion}</div>
                </div>
              </div>

              {/* Secciones */}
              <div>
                <h4 className="font-bold text-white mb-2 text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span>Secciones Creadas ({selectedProyeccionDetail.secciones?.length || 0})</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedProyeccionDetail.secciones?.map((s: any) => (
                    <div key={s.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">{s.nombre}</span>
                        <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400">
                          {s.estudiantes_estimados} est.
                        </span>
                      </div>
                      {s.maya_id && (
                        <div className="mt-1.5 text-[10px] text-purple-300 flex items-center gap-1">
                          <BookOpen className="w-3 h-3 shrink-0" />
                          <span>Pensum propio: {s.maya_descripcion || `#${s.maya_id}`}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Materias */}
              <div>
                <h4 className="font-bold text-white mb-2 text-sm flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-purple-400" />
                  <span>Materias del Pensum ({selectedProyeccionDetail.materias?.filter((m: any) => m.seccion_id == null && !m.eliminada).length || 0})</span>
                </h4>
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400">
                      <tr>
                        <th className="py-2 px-3">Materia</th>
                        <th className="py-2 px-3 text-center">Horas Semanales</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {selectedProyeccionDetail.materias
                        ?.filter((m: any) => m.seccion_id == null && !m.eliminada)
                        .map((m: any) => (
                          <tr key={m.id}>
                            <td className="py-2 px-3 text-white font-medium">{m.nombre}</td>
                            <td className="py-2 px-3 text-center text-blue-400 font-bold">{m.horas_semanales} hrs/sem</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* Materias propias por sección */}
                {selectedProyeccionDetail.secciones
                  ?.filter((s: any) => s.maya_id)
                  .map((s: any) => {
                    const matsSeccion = (selectedProyeccionDetail.materias || []).filter(
                      (m: any) => m.seccion_id === s.id && !m.eliminada
                    );
                    return (
                      <div key={s.id} className="mt-3 bg-purple-500/5 border border-purple-500/20 rounded-xl p-3">
                        <div className="text-[11px] font-semibold text-purple-300 mb-1.5">
                          Sección {s.nombre} — Pensum: {s.maya_descripcion || `#${s.maya_id}`}
                        </div>
                        {matsSeccion.length === 0 ? (
                          <div className="text-[10px] text-slate-500">Sin materias propias registradas.</div>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {matsSeccion.map((m: any) => (
                              <span
                                key={m.id}
                                className="bg-purple-500/10 border border-purple-500/30 text-purple-200 text-[10px] px-1.5 py-0.5 rounded-md"
                              >
                                {m.nombre}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Creación */}
      <CrearProyeccionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchProyecciones}
      />

      {/* Modal de Confirmación de Eliminación (deslizar para habilitar) */}
      {deletingProyeccion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-red-500/30 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-800 bg-slate-950 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Eliminar Proyección</h3>
                <p className="text-xs text-slate-400">Esta acción no se puede deshacer</p>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <p className="text-xs text-slate-300 leading-relaxed">
                Está a punto de eliminar{' '}
                <span className="font-bold text-white">{deletingProyeccion.nombre}</span>{' '}
                <span className="text-slate-400 font-mono">({deletingProyeccion.codigo})</span>.
                Se eliminarán también todas sus secciones y materias asociadas.
              </p>

              {/* Barra de deslizamiento de confirmación */}
              <div>
                <div className="relative h-12 rounded-xl bg-slate-950 border border-slate-700 overflow-hidden">
                  {/* Relleno de progreso */}
                  <div
                    className={`absolute inset-y-0 left-0 transition-all duration-150 ${
                      slideConfirm >= 100 ? 'bg-red-600/50' : 'bg-red-500/20'
                    }`}
                    style={{ width: `${slideConfirm}%` }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={slideConfirm}
                    onChange={(e) => setSlideConfirm(Number(e.target.value))}
                    className="slide-confirm absolute inset-0 w-full h-full cursor-pointer"
                    aria-label="Deslizar hasta el final para habilitar la eliminación"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider ${
                        slideConfirm >= 100 ? 'text-white' : 'text-slate-500'
                      }`}
                    >
                      {slideConfirm >= 100 ? '✓ Eliminación habilitada' : 'Desliza hasta el final →'}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between mt-1.5 text-[10px] text-slate-500">
                  <span>0%</span>
                  <span className={slideConfirm >= 100 ? 'text-red-400 font-bold' : ''}>{slideConfirm}%</span>
                  <span>100%</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeletingProyeccion(null)}
                  disabled={deletingLoading}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={slideConfirm < 100 || deletingLoading}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-semibold shadow-lg shadow-red-600/30 flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {deletingLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Eliminando...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Eliminar Definitivamente</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edición */}
      <EditarProyeccionModal
        proyeccion={editingProyeccion}
        onClose={() => setEditingProyeccion(null)}
        onSuccess={() => {
          fetchProyecciones();
          if (selectedProyeccionDetail && editingProyeccion && selectedProyeccionDetail.id === editingProyeccion.id) {
            setSelectedProyeccionDetail(null);
          }
        }}
      />
    </div>
  );
};
