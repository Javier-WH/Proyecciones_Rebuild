import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api/client.js';
import { TipoContrato } from './ProfesorModal.js';
import { X, Loader2, AlertCircle, Plus, RefreshCw, Save, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal.js';

interface TiposContratoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EditableTipo extends TipoContrato {
  dirty?: boolean;
}

export const TiposContratoModal: React.FC<TiposContratoModalProps> = ({ isOpen, onClose }) => {
  const [tipos, setTipos] = useState<EditableTipo[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoHoras, setNuevoHoras] = useState('');
  const [borrandoTipo, setBorrandoTipo] = useState<EditableTipo | null>(null);

  const fetchTipos = async () => {
    setLoading(true);
    const res = await apiFetch<TipoContrato[]>('/profesores/tipos-contrato?incluir_inactivos=1');
    if (res.success && res.data) setTipos(res.data);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      setFeedback(null);
      fetchTipos();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const updateLocal = (id: number, patch: Partial<EditableTipo>) => {
    setTipos((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch, dirty: true } : t)));
  };

  const handleSave = async (t: EditableTipo) => {
    setSavingId(t.id);
    setFeedback(null);
    const res = await apiFetch(`/profesores/tipos-contrato/${t.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: t.nombre,
        descripcion: t.descripcion,
        horas_semanales: Number(t.horas_semanales),
        activo: !!t.activo,
      }),
    });
    setSavingId(null);
    if (res.success) {
      setTipos((prev) => prev.map((x) => (x.id === t.id ? { ...x, dirty: false } : x)));
      setFeedback({ type: 'ok', text: res.message || 'Guardado.' });
    } else {
      setFeedback({ type: 'err', text: res.message || 'Error guardando tipo de contrato.' });
    }
  };

  const handleCreate = async () => {
    if (!nuevoNombre.trim() || !nuevoHoras) {
      setFeedback({ type: 'err', text: 'Indique nombre y horas semanales para el nuevo tipo.' });
      return;
    }
    setFeedback(null);
    const res = await apiFetch('/profesores/tipos-contrato', {
      method: 'POST',
      body: JSON.stringify({ nombre: nuevoNombre.trim(), horas_semanales: Number(nuevoHoras) }),
    });
    if (res.success) {
      setNuevoNombre('');
      setNuevoHoras('');
      fetchTipos();
    } else {
      setFeedback({ type: 'err', text: res.message || 'Error creando tipo de contrato.' });
    }
  };

  const handleDelete = async (t: EditableTipo) => {
    setBorrandoTipo(null);
    setDeletingId(t.id);
    setFeedback(null);
    const res = await apiFetch(`/profesores/tipos-contrato/${t.id}`, { method: 'DELETE' });
    setDeletingId(null);
    if (res.success) {
      setTipos((prev) => prev.filter((x) => x.id !== t.id));
      setFeedback({ type: 'ok', text: res.message || 'Tipo de contrato eliminado.' });
    } else {
      setFeedback({ type: 'err', text: res.message || 'Error eliminando tipo de contrato.' });
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setFeedback(null);
    const res = await apiFetch('/profesores/tipos-contrato/sync', { method: 'POST' });
    setSyncing(false);
    setFeedback({
      type: res.success ? 'ok' : 'err',
      text: res.message || (res.success ? 'Sincronizado.' : 'Error sincronizando.'),
    });
    if (res.success) fetchTipos();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-950 shrink-0">
          <h3 className="text-base font-bold text-white">Tipos de Contrato Docente</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {feedback && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2 ${
                feedback.type === 'ok'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{feedback.text}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500 leading-relaxed max-w-[65%]">
              Las horas semanales definen la carga horaria disponible del profesor. Los tipos con ID de SAGA se
              importan al sincronizar profesores.
            </p>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>Sincronizar SAGA</span>
            </button>
          </div>

          {loading ? (
            <div className="py-8 text-center text-slate-400 flex justify-center items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>Cargando tipos de contrato...</span>
            </div>
          ) : (
            <div className="space-y-2">
              {tipos.map((t) => (
                <div
                  key={t.id}
                  className={`bg-slate-950 border rounded-2xl p-3 flex items-center gap-2 ${
                    t.activo ? 'border-slate-800' : 'border-slate-800/50 opacity-60'
                  }`}
                >
                  <button
                    onClick={() => updateLocal(t.id, { activo: t.activo ? 0 : 1 })}
                    title={t.activo ? 'Desactivar' : 'Activar'}
                    className={`shrink-0 cursor-pointer ${t.activo ? 'text-emerald-400' : 'text-slate-600'}`}
                  >
                    {t.activo ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  </button>

                  <input
                    type="text"
                    value={t.nombre}
                    onChange={(e) => updateLocal(t.id, { nombre: e.target.value })}
                    className="flex-1 min-w-0 bg-transparent border border-transparent hover:border-slate-700 focus:border-indigo-500 rounded-lg px-2 py-1.5 text-white font-semibold focus:outline-none"
                  />

                  {t.saga_id != null && (
                    <span className="text-[9px] bg-blue-500/10 border border-blue-500/30 text-blue-300 px-1.5 py-0.5 rounded shrink-0 font-semibold">
                      SAGA #{t.saga_id}
                    </span>
                  )}

                  <input
                    type="number"
                    min={1}
                    max={80}
                    value={t.horas_semanales}
                    onChange={(e) => updateLocal(t.id, { horas_semanales: Number(e.target.value) })}
                    className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-center font-bold focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 shrink-0">hrs/sem</span>

                  <button
                    onClick={() => handleSave(t)}
                    disabled={!t.dirty || savingId === t.id}
                    className="p-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default shrink-0"
                    title="Guardar cambios"
                  >
                    {savingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => setBorrandoTipo(t)}
                    disabled={deletingId === t.id}
                    className="p-1.5 bg-red-600/15 hover:bg-red-600/35 border border-red-500/30 text-red-400 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default shrink-0"
                    title="Eliminar tipo de contrato"
                  >
                    {deletingId === t.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
              {tipos.length === 0 && (
                <div className="py-6 text-center text-slate-500 text-xs">No hay tipos de contrato registrados.</div>
              )}
            </div>
          )}

          {/* Crear nuevo tipo */}
          <div className="border-t border-slate-800 pt-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                placeholder="Nuevo tipo de contrato (ej. Asistente)"
                className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <input
                type="number"
                min={1}
                max={80}
                value={nuevoHoras}
                onChange={(e) => setNuevoHoras(e.target.value)}
                placeholder="hrs"
                className="w-20 bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-white text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <button
                onClick={handleCreate}
                className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {borrandoTipo && (
        <ConfirmModal
          titulo={`Eliminar tipo de contrato "${borrandoTipo.nombre}"`}
          icono={<Trash2 className="w-5 h-5 text-red-400" />}
          danger
          confirmLabel="Eliminar"
          mensaje={`Se eliminará el tipo de contrato "${borrandoTipo.nombre}".`}
          onConfirm={() => handleDelete(borrandoTipo)}
          onCancel={() => setBorrandoTipo(null)}
        />
      )}
    </div>
  );
};
