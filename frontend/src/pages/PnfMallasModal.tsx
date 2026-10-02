import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { usePnfColors } from '../context/PnfColorContext.js';
import {
  X,
  Loader2,
  AlertCircle,
  GraduationCap,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Layers,
} from 'lucide-react';

interface Maya {
  id: number;
  descripcion: string;
  tipopensum_id: number;
}

interface MateriaMalla {
  id: number;
  description: string;
  horasSemanales: number;
}

interface GrupoTrayecto {
  trayecto_saga_id: number;
  trayecto: string;
  materias: MateriaMalla[];
}

interface PnfItem {
  id: number;
  nombre: string;
  color: string | null;
}

const COLOR_DEFAULT = '#6366f1';

interface PnfMallasModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Panel de configuración de PNF: color identificativo (persistido localmente) y
// árbol navegable PNF -> mallas (SAGA) -> materias por trayecto.
export const PnfMallasModal: React.FC<PnfMallasModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  // Solo gestores pueden cambiar el color; el resto navega el árbol en lectura.
  const puedeEditar = user?.role !== 'PROFESOR';
  const { refresh: refreshColores } = usePnfColors();

  const [pnfs, setPnfs] = useState<PnfItem[]>([]);
  const [loadingPnfs, setLoadingPnfs] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [mayasPorPnf, setMayasPorPnf] = useState<Record<number, Maya[] | 'loading'>>({});

  const [mayasExpandidas, setMayasExpandidas] = useState<Set<string>>(new Set());
  const [materiasPorMaya, setMateriasPorMaya] = useState<Record<string, GrupoTrayecto[] | 'loading'>>({});

  const [guardandoColor, setGuardandoColor] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setExpandidos(new Set());
    setMayasExpandidas(new Set());
    setMayasPorPnf({});
    setMateriasPorMaya({});

    const cargar = async () => {
      setLoadingPnfs(true);
      const res = await apiFetch<PnfItem[]>('/horarios/pnfs');
      setLoadingPnfs(false);
      if (res.success && res.data) setPnfs(res.data);
      else setErrorMsg(res.message || 'Error cargando los PNF.');
    };
    cargar();
  }, [isOpen]);

  const togglePnf = async (pnfId: number) => {
    const next = new Set(expandidos);
    if (next.has(pnfId)) {
      next.delete(pnfId);
      setExpandidos(next);
      return;
    }
    next.add(pnfId);
    setExpandidos(next);

    if (!mayasPorPnf[pnfId]) {
      setMayasPorPnf((prev) => ({ ...prev, [pnfId]: 'loading' }));
      const res = await apiFetch<Maya[]>(`/saga/mayas/${pnfId}`);
      setMayasPorPnf((prev) => ({
        ...prev,
        [pnfId]: res.success && res.data ? res.data : [],
      }));
    }
  };

  const toggleMaya = async (pnfId: number, mayaId: number) => {
    const key = `${pnfId}:${mayaId}`;
    const next = new Set(mayasExpandidas);
    if (next.has(key)) {
      next.delete(key);
      setMayasExpandidas(next);
      return;
    }
    next.add(key);
    setMayasExpandidas(next);

    if (!materiasPorMaya[key]) {
      setMateriasPorMaya((prev) => ({ ...prev, [key]: 'loading' }));
      const res = await apiFetch<GrupoTrayecto[]>(`/saga/materias-maya/${pnfId}/${mayaId}`);
      setMateriasPorMaya((prev) => ({
        ...prev,
        [key]: res.success && res.data ? res.data : [],
      }));
    }
  };

  const guardarColor = async (pnf: PnfItem, color: string | null) => {
    setGuardandoColor(pnf.id);
    const res = await apiFetch(`/horarios/pnfs/${pnf.id}/color`, {
      method: 'PUT',
      body: JSON.stringify({ nombre: pnf.nombre, color }),
    });
    setGuardandoColor(null);
    if (res.success) {
      setPnfs((prev) => prev.map((p) => (p.id === pnf.id ? { ...p, color } : p)));
      refreshColores(); // propaga el cambio al contexto global
    } else {
      setErrorMsg(res.message || 'Error guardando el color.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-950 shrink-0">
          <h3 className="text-base font-bold text-white flex items-center gap-2.5">
            <GraduationCap className="w-5 h-5 text-indigo-400" />
            PNF y Mallas Curriculares
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
          {errorMsg && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <p className="text-[10px] text-slate-500 leading-relaxed">
            El color identifica al PNF en toda la aplicación. Las mallas y materias se consultan en SAGA al expandir cada nivel.
          </p>

          {loadingPnfs ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando PNF...
            </div>
          ) : pnfs.length === 0 ? (
            <p className="text-xs text-slate-600 italic text-center py-8">No hay PNF registrados.</p>
          ) : (
            pnfs.map((pnf) => {
              const abierto = expandidos.has(pnf.id);
              const mayas = mayasPorPnf[pnf.id];
              return (
                <div
                  key={pnf.id}
                  className="border border-slate-800 rounded-2xl overflow-hidden"
                  style={pnf.color ? { borderLeft: `4px solid ${pnf.color}` } : undefined}
                >
                  {/* Fila del PNF: color + nombre + expandir */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-slate-950/60">
                    <div className="relative shrink-0" title="Color identificativo del PNF">
                      <input
                        type="color"
                        value={pnf.color || COLOR_DEFAULT}
                        onChange={(e) => guardarColor(pnf, e.target.value)}
                        disabled={!puedeEditar}
                        className={`w-7 h-7 rounded-lg border border-slate-700 bg-slate-900 p-0.5 ${puedeEditar ? 'cursor-pointer' : 'cursor-default opacity-70'}`}
                      />
                      {guardandoColor === pnf.id && (
                        <Loader2 className="w-3 h-3 animate-spin text-white absolute inset-0 m-auto pointer-events-none" />
                      )}
                    </div>
                    {pnf.color && puedeEditar && (
                      <button
                        onClick={() => guardarColor(pnf, null)}
                        title="Quitar color"
                        className="text-slate-600 hover:text-red-400 -ml-1.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => togglePnf(pnf.id)}
                      className="flex-1 flex items-center gap-2 text-left min-w-0 cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-slate-200 truncate">{pnf.nombre}</span>
                      <span className="ml-auto shrink-0 text-slate-500">
                        {abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                    </button>
                  </div>

                  {/* Mallas del PNF */}
                  {abierto && (
                    <div className="border-t border-slate-800 divide-y divide-slate-800/60">
                      {mayas === 'loading' ? (
                        <div className="flex items-center gap-2 px-6 py-3 text-[11px] text-slate-500">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando mallas...
                        </div>
                      ) : !mayas || mayas.length === 0 ? (
                        <p className="px-6 py-3 text-[11px] text-slate-600 italic">
                          Sin mallas registradas en SAGA.
                        </p>
                      ) : (
                        mayas.map((maya) => {
                          const key = `${pnf.id}:${maya.id}`;
                          const mayaAbierta = mayasExpandidas.has(key);
                          const grupos = materiasPorMaya[key];
                          return (
                            <div key={maya.id}>
                              <button
                                onClick={() => toggleMaya(pnf.id, maya.id)}
                                className="w-full flex items-center gap-2 px-6 py-2.5 text-left hover:bg-slate-800/40 transition-colors cursor-pointer"
                              >
                                <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                <span className="text-[11px] text-slate-300 truncate">{maya.descripcion}</span>
                                <span className="ml-auto shrink-0 text-slate-600">
                                  {mayaAbierta ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </span>
                              </button>

                              {/* Materias agrupadas por trayecto */}
                              {mayaAbierta && (
                                <div className="bg-slate-950/50 border-t border-slate-800/60 px-8 py-3 space-y-3">
                                  {grupos === 'loading' ? (
                                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando materias desde SAGA...
                                    </div>
                                  ) : !grupos || grupos.length === 0 ? (
                                    <p className="text-[11px] text-slate-600 italic">Sin materias en esta malla.</p>
                                  ) : (
                                    grupos.map((g) => (
                                      <div key={g.trayecto_saga_id}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
                                          <BookOpen className="w-3 h-3" /> {g.trayecto}
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                          {g.materias.map((m) => (
                                            <div
                                              key={m.id}
                                              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800/80"
                                            >
                                              <span className="text-[11px] text-slate-300 truncate">{m.description}</span>
                                              <span className="text-[10px] text-slate-500 shrink-0">{m.horasSemanales}h/sem</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
