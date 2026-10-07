import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api/client.js';
import {
  CalendarDays,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Archive,
  Trash2,
  Edit2,
  X,
  Search,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal.js';

export interface PeriodoAcademico {
  id: number;
  codigo: string;
  nombre: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado: 'PLANIFICACION' | 'ACTIVO' | 'CERRADO';
  created_at: string;
}

export const PeriodosPage: React.FC = () => {
  const [periodos, setPeriodos] = useState<PeriodoAcademico[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [estado, setEstado] = useState<'PLANIFICACION' | 'ACTIVO' | 'CERRADO'>('ACTIVO');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Confirmación de borrado: modal con deslizador (slide-to-confirm)
  const [borrando, setBorrando] = useState<PeriodoAcademico | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchPeriodos = async () => {
    setLoading(true);
    setErrorMsg(null);
    const res = await apiFetch<PeriodoAcademico[]>('/periodos');
    if (res.success && res.data) {
      setPeriodos(res.data);
    } else {
      setErrorMsg(res.message || 'Error cargando periodos académicos.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPeriodos();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingId(null);
    setCodigo('');
    setNombre('');
    setFechaInicio('');
    setFechaFin('');
    setEstado('ACTIVO');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: PeriodoAcademico) => {
    setEditingId(p.id);
    setCodigo(p.codigo);
    setNombre(p.nombre);
    setFechaInicio(p.fecha_inicio || '');
    setFechaFin(p.fecha_fin || '');
    setEstado(p.estado);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!codigo.trim() || !nombre.trim()) {
      setFormError('Debe ingresar el código y el nombre del periodo.');
      return;
    }

    setSaving(true);
    const payload = {
      codigo: codigo.trim().toUpperCase(),
      nombre: nombre.trim(),
      fecha_inicio: fechaInicio || undefined,
      fecha_fin: fechaFin || undefined,
      estado,
    };

    const endpoint = editingId ? `/periodos/${editingId}` : '/periodos';
    const method = editingId ? 'PUT' : 'POST';

    const res = await apiFetch(endpoint, {
      method,
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (res.success) {
      setIsModalOpen(false);
      fetchPeriodos();
    } else {
      setFormError(res.message || 'Error guardando el periodo académico.');
    }
  };

  const abrirBorrado = (p: PeriodoAcademico) => {
    setBorrando(p);
    setDeleteError(null);
  };

  const confirmarBorrado = async () => {
    if (!borrando) return;
    setEliminando(true);
    const res = await apiFetch(`/periodos/${borrando.id}`, { method: 'DELETE' });
    setEliminando(false);
    if (res.success) {
      setBorrando(null);
      fetchPeriodos();
    } else {
      setDeleteError(res.message || 'No se puede eliminar el periodo.');
    }
  };

  const getEstadoBadge = (st: 'PLANIFICACION' | 'ACTIVO' | 'CERRADO') => {
    switch (st) {
      case 'ACTIVO':
        return (
          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-2.5 py-1 rounded-full font-semibold inline-flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Activo</span>
          </span>
        );
      case 'PLANIFICACION':
        return (
          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs px-2.5 py-1 rounded-full font-semibold inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>En Planificación</span>
          </span>
        );
      case 'CERRADO':
        return (
          <span className="bg-slate-800 text-slate-400 border border-slate-700 text-xs px-2.5 py-1 rounded-full font-semibold inline-flex items-center gap-1">
            <Archive className="w-3.5 h-3.5" />
            <span>Cerrado</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 backdrop-blur-md">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <CalendarDays className="w-7 h-7 text-blue-400" />
            <span>Periodos Académicos</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Registro y control de los ciclos lectivos universitarios para la asignación de proyecciones.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/25 flex items-center gap-2 transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Registrar Periodo</span>
        </button>
      </div>

      {/* Main Table / List */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-xs flex justify-center items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          <span>Cargando periodos académicos...</span>
        </div>
      ) : periodos.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center text-slate-400">
          <CalendarDays className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-300 mb-1">No hay periodos académicos registrados</h3>
          <p className="text-xs text-slate-500 mb-4">
            Registre un nuevo periodo (ejemplo: 2026-1) para comenzar a asignar proyecciones académicas.
          </p>
          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Periodo Académico</span>
          </button>
        </div>
      ) : (
        <div className="border border-slate-800 rounded-3xl overflow-hidden bg-slate-900/80 shadow-xl">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="py-4 px-6">Código</th>
                <th className="py-4 px-6">Nombre del Periodo</th>
                <th className="py-4 px-6 text-center">Estado</th>
                <th className="py-4 px-6 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {periodos.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-4 px-6 font-mono font-bold text-blue-400 text-sm">{p.codigo}</td>
                  <td className="py-4 px-6 font-semibold text-white text-sm">{p.nombre}</td>
                  <td className="py-4 px-6 text-center">{getEstadoBadge(p.estado)}</td>
                  <td className="py-4 px-6 text-right space-x-2">
                    <button
                      onClick={() => handleOpenEditModal(p)}
                      className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                      title="Editar periodo"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => abrirBorrado(p)}
                      className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                      title="Eliminar periodo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Registrar/Editar Periodo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-950">
              <h3 className="text-base font-bold text-white">
                {editingId ? 'Editar Periodo Académico' : 'Registrar Nuevo Periodo Académico'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Código del Periodo
                </label>
                <input
                  type="text"
                  required
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="Ej. 2026-1, 2026-2"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Nombre Descriptive
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Periodo Académico I - 2026"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Estado del Periodo
                </label>
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="ACTIVO">Activo (Para nuevas proyecciones)</option>
                  <option value="PLANIFICACION">En Planificación</option>
                  <option value="CERRADO">Cerrado / Concluido</option>
                </select>
                {estado === 'ACTIVO' && (
                  <p className="text-[10px] text-amber-400/90 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>Solo puede haber un periodo ACTIVO. Al guardar, el periodo activo actual pasará a Cerrado.</span>
                  </p>
                )}
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 border border-slate-700 text-slate-300 rounded-xl hover:bg-slate-800 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold shadow-lg shadow-blue-600/30 flex items-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>{editingId ? 'Actualizar Periodo' : 'Guardar Periodo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminación (slide-to-confirm) */}
      {borrando && (
        <ConfirmModal
          titulo="Eliminar Periodo Académico"
          icono={<Trash2 className="w-5 h-5 text-red-400" />}
          danger
          slideToConfirm
          busy={eliminando}
          error={deleteError}
          confirmLabel="Eliminar Periodo"
          mensaje={`Está a punto de eliminar el periodo ${borrando.codigo} (${borrando.nombre}).`}
          lineas={[
            'Todas las proyecciones, materias, secciones, asignaciones y horarios registrados en este periodo se eliminarán permanentemente.',
            'Esta acción no se puede deshacer.',
          ]}
          onConfirm={confirmarBorrado}
          onCancel={() => setBorrando(null)}
        />
      )}
    </div>
  );
};
