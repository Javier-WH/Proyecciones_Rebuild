import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  X,
  History,
  Loader2,
  AlertCircle,
  RefreshCw,
  Filter,
} from 'lucide-react';

interface RegistroAudit {
  id: number;
  user_id: number | null;
  username: string | null;
  role: string | null;
  accion: string;
  entidad: string | null;
  entidad_id: number | null;
  detalle: Record<string, unknown> | string | null;
  pnf_saga_id: number | null;
  created_at: string;
}

interface PnfOpcion {
  saga_id: number;
  nombre: string;
}

const ROL_LABEL: Record<string, string> = {
  SUPER_USUARIO: 'Master',
  ADMINISTRADOR: 'Coordinador',
  REGULAR: 'Usuario',
  PROFESOR: 'Docente',
};

// Verbos legibles para la columna Acción
const ACCION_LABEL: Record<string, string> = {
  'auth.login': 'Inicio de sesión',
  'auth.profesor_login': 'Acceso docente (cédula)',
  'auth.logout': 'Cierre de sesión',
  'auth.recuperar_password': 'Contraseña recuperada',
  'usuario.crear': 'Usuario creado',
  'usuario.editar': 'Usuario editado',
  'usuario.activar': 'Usuario activado',
  'usuario.desactivar': 'Usuario desactivado',
  'profesor.crear': 'Profesor registrado',
  'profesor.editar': 'Profesor editado',
  'profesor.activar': 'Profesor activado',
  'profesor.desactivar': 'Profesor desactivado',
  'profesor.sincronizar': 'Sincronización SAGA de profesores',
  'proyeccion.crear': 'Proyección creada',
  'proyeccion.editar': 'Proyección editada',
  'proyeccion.activar': 'Proyección activada',
  'proyeccion.desactivar': 'Proyección desactivada',
  'proyeccion.eliminar': 'Proyección eliminada',
  'asignacion.asignar': 'Materia asignada a profesor',
  'asignacion.quitar': 'Profesor quitado de materia',
  'horario.agendar': 'Clase agendada',
  'horario.mover': 'Clase movida',
  'horario.intercambiar': 'Clases intercambiadas',
  'horario.cambiar_aula': 'Aula de clase cambiada',
  'horario.mover_grupo': 'Bloque de clases movido',
  'horario.agendar_grupo': 'Bloque de clases agendado',
  'horario.desagendar': 'Clase(s) desagendada(s)',
  'horario.generar': 'Horario generado',
  'horario.resolver_aulas': 'Conflictos de aula resueltos',
  'horario.config': 'Config. de horarios editada',
  'aula.crear': 'Aula creada',
  'aula.editar': 'Aula editada',
  'aula.eliminar': 'Aula eliminada',
  'turno.crear': 'Turno creado',
  'turno.editar': 'Turno editado',
  'turno.eliminar': 'Turno eliminado',
  'turno.bloques': 'Bloques del turno redefinidos',
  'periodo.crear': 'Periodo creado',
  'periodo.editar': 'Periodo editado',
  'periodo.eliminar': 'Periodo eliminado',
  'reportes.logo': 'Logo de reportes modificado',
};

const accionBadge = (accion: string) => {
  const base = 'inline-block whitespace-nowrap text-[10px] px-2 py-0.5 rounded-full font-semibold border';
  if (accion.startsWith('auth.')) return `${base} bg-sky-500/10 border-sky-500/30 text-sky-300`;
  if (accion.startsWith('horario.')) return `${base} bg-orange-500/10 border-orange-500/30 text-orange-300`;
  if (accion.startsWith('usuario.')) return `${base} bg-purple-500/10 border-purple-500/30 text-purple-300`;
  if (accion.startsWith('profesor.')) return `${base} bg-indigo-500/10 border-indigo-500/30 text-indigo-300`;
  if (accion.startsWith('proyeccion.') || accion.startsWith('asignacion.'))
    return `${base} bg-blue-500/10 border-blue-500/30 text-blue-300`;
  if (accion.startsWith('aula.') || accion.startsWith('turno.'))
    return `${base} bg-emerald-500/10 border-emerald-500/30 text-emerald-300`;
  if (accion.startsWith('periodo.')) return `${base} bg-amber-500/10 border-amber-500/30 text-amber-300`;
  return `${base} bg-slate-700/40 border-slate-600 text-slate-300`;
};

// El detalle JSON se muestra como "campo: valor" compacto
const detalleTxt = (d: RegistroAudit['detalle']): string => {
  if (!d) return '';
  const obj = typeof d === 'string' ? d : d;
  if (typeof obj === 'string') return obj;
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join(' · ');
};

const fmtFecha = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const PAGINA = 50;

// Modal "Historial de cambios": bitácora de quién hizo qué y cuándo.
// Master la ve completa con filtro por PNF; el Coordinador solo su PNF
// (el filtro lo impone el backend — aquí se oculta el selector).
export const HistorialModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth();
  const esMaster = user?.role === 'SUPER_USUARIO';

  const [rows, setRows] = useState<RegistroAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarTodo, setMostrarTodo] = useState(false);

  const [fAccion, setFAccion] = useState('');
  const [fPnf, setFPnf] = useState('');
  const [fUsuario, setFUsuario] = useState('');
  const [pnfs, setPnfs] = useState<PnfOpcion[]>([]);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (fAccion) params.set('accion', fAccion);
    if (esMaster && fPnf) params.set('pnf_saga_id', fPnf);
    if (fUsuario.trim()) params.set('username', fUsuario.trim());
    params.set('limite', '500');
    const res = await apiFetch<RegistroAudit[]>(`/auditoria?${params.toString()}`);
    setLoading(false);
    if (res.success && res.data) setRows(res.data);
    else setError(res.message || 'No se pudo cargar el historial.');
  };

  useEffect(() => {
    cargar();
    if (esMaster) {
      apiFetch<any[]>('/horarios/pnfs').then((res) => {
        if (res.success && res.data) {
          setPnfs(
            res.data
              .map((p) => ({ saga_id: Number(p.id), nombre: String(p.nombre ?? '') }))
              .filter((p) => p.saga_id && p.nombre)
          );
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibles = useMemo(
    () => (mostrarTodo ? rows : rows.slice(0, PAGINA)),
    [rows, mostrarTodo]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="modal-head flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Historial de Cambios</h3>
              <p className="text-xs text-slate-400">
                {esMaster
                  ? 'Bitácora de quién hizo qué y cuándo en todo el sistema.'
                  : 'Bitácora de cambios de su PNF.'}
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

        {/* Filtros */}
        <div className="px-6 pt-4 pb-2 flex flex-wrap items-end gap-3 border-b border-slate-800/60">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5" />
            Filtros
          </div>
          <div className="flex-1 min-w-[140px]">
            <select
              value={fAccion}
              onChange={(e) => setFAccion(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-white text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              <option value="">Todas las acciones</option>
              <optgroup label="Horarios">
                <option value="horario.agendar">Clase agendada</option>
                <option value="horario.mover">Clase movida</option>
                <option value="horario.desagendar">Desagendada</option>
                <option value="horario.generar">Horario generado</option>
                <option value="horario.intercambiar">Intercambio</option>
                <option value="horario.cambiar_aula">Cambio de aula</option>
                <option value="horario.mover_grupo">Bloque movido</option>
                <option value="horario.resolver_aulas">Resolver aulas</option>
              </optgroup>
              <optgroup label="Asignación docente">
                <option value="asignacion.asignar">Materia asignada</option>
                <option value="asignacion.quitar">Materia desasignada</option>
              </optgroup>
              <optgroup label="Catálogos">
                <option value="proyeccion.crear">Proyección creada</option>
                <option value="proyeccion.editar">Proyección editada</option>
                <option value="proyeccion.eliminar">Proyección eliminada</option>
                <option value="profesor.crear">Profesor creado</option>
                <option value="profesor.editar">Profesor editado</option>
                <option value="profesor.sincronizar">Sincronización SAGA</option>
                <option value="aula.crear">Aula creada</option>
                <option value="aula.editar">Aula editada</option>
                <option value="aula.eliminar">Aula eliminada</option>
                <option value="periodo.crear">Periodo creado</option>
                <option value="periodo.editar">Periodo editado</option>
              </optgroup>
              <optgroup label="Usuarios y acceso">
                <option value="usuario.crear">Usuario creado</option>
                <option value="usuario.editar">Usuario editado</option>
                <option value="auth.login">Inicio de sesión</option>
                <option value="auth.recuperar_password">Contraseña recuperada</option>
              </optgroup>
            </select>
          </div>
          {esMaster && (
            <div className="min-w-[160px]">
              <select
                value={fPnf}
                onChange={(e) => setFPnf(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-white text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
              >
                <option value="">Todos los PNF</option>
                {pnfs.map((p) => (
                  <option key={p.saga_id} value={p.saga_id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="min-w-[140px]">
            <input
              value={fUsuario}
              onChange={(e) => setFUsuario(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && cargar()}
              placeholder="Usuario…"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-white text-xs placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            />
          </div>
          <button
            onClick={cargar}
            className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Aplicar
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span className="text-sm">Cargando historial...</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 rounded-xl bg-slate-950 border border-slate-800 text-center text-slate-400 text-sm">
              No hay movimientos registrados con esos filtros.
            </div>
          ) : (
            <>
              <div className="border border-slate-800 rounded-2xl overflow-hidden overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 min-w-[720px]">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4 w-36">Fecha</th>
                      <th className="py-3 px-4 w-40">Usuario</th>
                      <th className="py-3 px-4 w-52">Acción</th>
                      <th className="py-3 px-4">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {visibles.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">
                          {fmtFecha(r.created_at)}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-mono font-semibold text-white">
                            {r.username ?? 'sistema'}
                          </div>
                          {r.role && (
                            <div className="text-[10px] text-slate-500">
                              {ROL_LABEL[r.role] ?? r.role}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={accionBadge(r.accion)}>
                            {ACCION_LABEL[r.accion] ?? r.accion}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-400 max-w-[380px]">
                          <span className="line-clamp-2" title={detalleTxt(r.detalle)}>
                            {detalleTxt(r.detalle) || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!mostrarTodo && rows.length > PAGINA && (
                <div className="mt-3 text-center">
                  <button
                    onClick={() => setMostrarTodo(true)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                  >
                    Mostrar todos ({rows.length} registros)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
