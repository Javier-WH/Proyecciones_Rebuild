import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../api/client.js';
import {
  X,
  Loader2,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  Search,
  GraduationCap,
  CheckCircle2,
  BookOpen,
  Users,
  RefreshCw,
  Save,
  Undo2,
} from 'lucide-react';

export interface PerfilMateria {
  subject_saga_id: number;
  nombre: string;
}

export interface Perfil {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: number;
  profesores_count: number;
  materias: PerfilMateria[];
}

interface CatalogoMateria {
  subject_saga_id: number;
  nombre: string;
}

interface PerfilesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Editor embebido: crear/editar un perfil y seleccionar sus materias afines
export const PerfilesModal: React.FC<PerfilesModalProps> = ({ isOpen, onClose }) => {
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoMateria[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  // Estado del editor: null = lista, {perfil?} = creando o editando
  const [editando, setEditando] = useState<Perfil | 'nuevo' | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [seleccion, setSeleccion] = useState<Map<number, string>>(new Map());
  const [buscarMateria, setBuscarMateria] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg(null);
    const [resPerfiles, resCatalogo] = await Promise.all([
      apiFetch<Perfil[]>('/perfiles'),
      apiFetch<CatalogoMateria[]>('/perfiles/materias-catalogo'),
    ]);
    if (resPerfiles.success && resPerfiles.data) setPerfiles(resPerfiles.data);
    else setErrorMsg(resPerfiles.message || 'Error cargando perfiles.');
    if (resCatalogo.success && resCatalogo.data) setCatalogo(resCatalogo.data);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      setEditando(null);
      setNoticeMsg(null);
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const abrirEditor = (perfil: Perfil | 'nuevo') => {
    setEditando(perfil);
    setErrorMsg(null);
    setNoticeMsg(null);
    setBuscarMateria('');
    if (perfil === 'nuevo') {
      setNombre('');
      setDescripcion('');
      setSeleccion(new Map());
    } else {
      setNombre(perfil.nombre);
      setDescripcion(perfil.descripcion || '');
      setSeleccion(new Map(perfil.materias.map((m) => [m.subject_saga_id, m.nombre])));
    }
  };

  const toggleMateria = (m: CatalogoMateria) => {
    setSeleccion((prev) => {
      const next = new Map(prev);
      if (next.has(m.subject_saga_id)) next.delete(m.subject_saga_id);
      else next.set(m.subject_saga_id, m.nombre);
      return next;
    });
  };

  const catalogoFiltrado = useMemo(() => {
    const texto = buscarMateria.toLowerCase().trim();
    if (!texto) return catalogo;
    return catalogo.filter((m) => m.nombre.toLowerCase().includes(texto));
  }, [catalogo, buscarMateria]);

  const handleGuardar = async () => {
    if (!nombre.trim()) {
      setErrorMsg('El nombre del perfil es obligatorio.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    const payload = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || undefined,
      materias: [...seleccion.entries()].map(([subject_saga_id, nombreM]) => ({
        subject_saga_id,
        nombre: nombreM,
      })),
    };
    const res =
      editando && editando !== 'nuevo'
        ? await apiFetch(`/perfiles/${editando.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch('/perfiles', { method: 'POST', body: JSON.stringify(payload) });
    setSaving(false);
    if (res.success) {
      setNoticeMsg(res.message || 'Perfil guardado.');
      setEditando(null);
      fetchData();
    } else {
      setErrorMsg(res.message || 'Error guardando el perfil.');
    }
  };

  const handleEliminar = async (p: Perfil) => {
    if (!window.confirm(`¿Eliminar el perfil "${p.nombre}"? Se desvinculará de los profesores que lo tengan.`)) return;
    const res = await apiFetch(`/perfiles/${p.id}`, { method: 'DELETE' });
    if (res.success) {
      setNoticeMsg(res.message || 'Perfil eliminado.');
      fetchData();
    } else {
      setErrorMsg(res.message || 'Error eliminando el perfil.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-950 shrink-0">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-indigo-400" />
            <span>Perfiles Docentes</span>
          </h3>
          <div className="flex items-center gap-2">
            {editando === null && (
              <>
                <button
                  onClick={fetchData}
                  disabled={loading}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Recargar"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => abrirEditor('nuevo')}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nuevo Perfil</span>
                </button>
              </>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white ml-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 flex items-center gap-2 mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {noticeMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{noticeMsg}</span>
            </div>
          )}

          {loading && perfiles.length === 0 ? (
            <div className="py-10 flex justify-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : editando !== null ? (
            /* ------------------------------- EDITOR ------------------------------- */
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Nombre del Perfil *
                  </label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Profesor de Matemática"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Descripción
                  </label>
                  <input
                    type="text"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Opcional"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-slate-300 uppercase tracking-wider">
                    Materias del perfil
                  </label>
                  <span className="text-[10px] text-slate-500">
                    {seleccion.size} seleccionada{seleccion.size === 1 ? '' : 's'}
                  </span>
                </div>

                {seleccion.size > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {[...seleccion.entries()].map(([id, nombreM]) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 px-2 py-1 rounded-lg text-[10px] font-semibold"
                      >
                        {nombreM}
                        <button
                          type="button"
                          onClick={() => toggleMateria({ subject_saga_id: id, nombre: nombreM })}
                          className="text-indigo-300 hover:text-white cursor-pointer"
                          title="Quitar"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="relative mb-2">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
                  <input
                    type="text"
                    value={buscarMateria}
                    onChange={(e) => setBuscarMateria(e.target.value)}
                    placeholder="Buscar materia en el catálogo..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950/60 divide-y divide-slate-800/60">
                  {catalogoFiltrado.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 text-[11px]">
                      {catalogo.length === 0
                        ? 'Sin materias en el catálogo (crea una proyección primero).'
                        : 'Sin materias que coincidan con la búsqueda.'}
                    </div>
                  ) : (
                    catalogoFiltrado.map((m) => {
                      const sel = seleccion.has(m.subject_saga_id);
                      return (
                        <label
                          key={m.subject_saga_id}
                          className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                            sel ? 'bg-indigo-500/10' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={sel}
                            onChange={() => toggleMateria(m)}
                            className="w-3.5 h-3.5 accent-indigo-500 cursor-pointer"
                          />
                          <span className={`text-[11px] ${sel ? 'text-indigo-200 font-semibold' : 'text-slate-300'}`}>
                            {m.nombre}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setEditando(null)}
                  className="px-4 py-2.5 border border-slate-700 text-slate-300 rounded-xl hover:bg-slate-800 font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <Undo2 className="w-4 h-4" />
                  <span>Volver</span>
                </button>
                <button
                  onClick={handleGuardar}
                  disabled={saving}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>{editando === 'nuevo' ? 'Crear Perfil' : 'Guardar Cambios'}</span>
                </button>
              </div>
            </div>
          ) : (
            /* ------------------------------- LISTA ------------------------------- */
            <div className="space-y-2">
              {perfiles.length === 0 ? (
                <div className="py-10 text-center text-slate-500">
                  <GraduationCap className="w-10 h-10 mx-auto mb-3 text-slate-700" />
                  <p className="text-sm font-semibold text-slate-400">No hay perfiles creados</p>
                  <p className="text-[11px] mt-1">
                    Los perfiles agrupan materias afines y se asignan a los profesores para sugerir asignaciones.
                  </p>
                </div>
              ) : (
                perfiles.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:border-indigo-500/40 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                      <GraduationCap className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white text-sm truncate">{p.nombre}</div>
                      {p.descripcion && <div className="text-[10px] text-slate-500 truncate">{p.descripcion}</div>}
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3 h-3 text-blue-400" />
                          {p.materias.length} materia{p.materias.length === 1 ? '' : 's'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3 text-emerald-400" />
                          {p.profesores_count} profesor{p.profesores_count === 1 ? '' : 'es'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => abrirEditor(p)}
                      className="p-2 bg-slate-800 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-300 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                      title="Editar perfil"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleEliminar(p)}
                      className="p-2 bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                      title="Eliminar perfil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
