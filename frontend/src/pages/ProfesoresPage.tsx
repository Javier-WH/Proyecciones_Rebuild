import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { ProfesorModal, Profesor } from './ProfesorModal.js';
import { TiposContratoModal } from './TiposContratoModal.js';
import { PerfilesModal } from './PerfilesModal.js';
import { ProfesorAvatar } from './ProfesorAvatar.js';
import { DisponibilidadProfesorModal } from './DisponibilidadProfesorModal.js';
import { ConfirmModal } from './ConfirmModal.js';
import {
  Users,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Pencil,
  Search,
  RefreshCw,
  CloudDownload,
  Briefcase,
  Power,
  PowerOff,
  Mail,
  GraduationCap,
  CalendarCheck
} from 'lucide-react';

export const ProfesoresPage: React.FC = () => {
  const { user } = useAuth();
  const esCoordinador = user?.role === 'ADMINISTRADOR';
  const puedeGestionar = user?.role === 'SUPER_USUARIO' || esCoordinador;
  // El coordinador edita profesores de su PNF o sin PNF (los "sin PNF" están
  // disponibles para cualquier coordinador, que puede reclamarlos)
  const puedeEditarProf = (p: { pnf_saga_id: number | null }) =>
    puedeGestionar &&
    (!esCoordinador ||
      (user?.pnf_saga_id != null &&
        (p.pnf_saga_id == null || Number(p.pnf_saga_id) === Number(user.pnf_saga_id))));

  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  const [filterText, setFilterText] = useState('');
  const [filterEstado, setFilterEstado] = useState<'activos' | 'inactivos' | 'todos'>('activos');

  const [modalProfesor, setModalProfesor] = useState<{ open: boolean; profesor: Profesor | null }>({
    open: false,
    profesor: null,
  });
  const [modalTipos, setModalTipos] = useState(false);
  const [modalPerfiles, setModalPerfiles] = useState(false);
  const [modalDisp, setModalDisp] = useState<{ open: boolean; profesor: Profesor | null }>({
    open: false,
    profesor: null,
  });
  // Confirmación de desactivar/reactivar profesor
  const [toggleProfesor, setToggleProfesor] = useState<Profesor | null>(null);

  const fetchProfesores = async () => {
    setLoading(true);
    setErrorMsg(null);
    const res = await apiFetch<Profesor[]>('/profesores?incluir_inactivos=1');
    if (res.success && res.data) {
      setProfesores(res.data);
    } else {
      setErrorMsg(res.message || 'Error cargando profesores.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProfesores();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setErrorMsg(null);
    setNoticeMsg(null);
    const res = await apiFetch<{ total_saga: number; nuevos: number; actualizados: number; omitidos: number }>(
      '/profesores/sync',
      { method: 'POST' }
    );
    setSyncing(false);
    if (res.success) {
      setNoticeMsg(res.message || 'Sincronización completada.');
      fetchProfesores();
    } else {
      setErrorMsg(res.message || 'Error sincronizando profesores con SAGA.');
    }
  };

  const handleToggleActivo = async (p: Profesor) => {
    const res = await apiFetch(`/profesores/${p.id}/toggle-activo`, { method: 'PUT' });
    if (res.success) {
      fetchProfesores();
    } else {
      setErrorMsg(res.message || 'Error cambiando el estado del profesor.');
    }
  };

  const filtered = profesores.filter((p) => {
    const texto = filterText.toLowerCase();
    const matchTexto =
      !texto ||
      p.nombres.toLowerCase().includes(texto) ||
      p.apellidos.toLowerCase().includes(texto) ||
      p.cedula.includes(texto) ||
      (p.pnf_nombre || '').toLowerCase().includes(texto);
    const matchEstado =
      filterEstado === 'todos' || (filterEstado === 'activos' ? !!p.activo : !p.activo);
    return matchTexto && matchEstado;
  });

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 backdrop-blur-md">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-7 h-7 text-indigo-400" />
            <span>Gestión de Profesores</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Docentes sincronizados con SAGA y registrados localmente. {profesores.filter((p) => p.activo).length} activos
            de {profesores.length} totales.
          </p>
        </div>

        {puedeGestionar && (
          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <button
              onClick={() => setModalTipos(true)}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Briefcase className="w-4 h-4 text-amber-400" />
              <span>Tipos de Contrato</span>
            </button>
            <button
              onClick={() => setModalPerfiles(true)}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <GraduationCap className="w-4 h-4 text-indigo-400" />
              <span>Perfiles</span>
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <CloudDownload className={`w-4 h-4 text-blue-400 ${syncing ? 'animate-pulse' : ''}`} />
              <span>{syncing ? 'Sincronizando...' : 'Sincronizar SAGA'}</span>
            </button>
            <button
              onClick={() => setModalProfesor({ open: true, profesor: null })}
              className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/25 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Profesor</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Buscar por nombre, apellido, cédula o PNF..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <select
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value as any)}
          className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="activos">Solo activos</option>
          <option value="inactivos">Solo desactivados</option>
          <option value="todos">Todos</option>
        </select>

        <button
          onClick={fetchProfesores}
          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer sm:ml-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Banners */}
      {noticeMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3 text-emerald-300 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <span>{noticeMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Listado */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-xs flex justify-center items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          <span>Cargando profesores...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center text-slate-400">
          <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-300 mb-1">
            {profesores.length === 0 ? 'No hay profesores registrados' : 'Sin resultados para el filtro actual'}
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            {profesores.length === 0
              ? 'Sincronice con SAGA para importar el personal docente, o registre profesores manualmente.'
              : 'Pruebe con otros términos de búsqueda o cambie el filtro de estado.'}
          </p>
          {profesores.length === 0 && puedeGestionar && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={handleSync}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <CloudDownload className="w-4 h-4 text-blue-400" />
                <span>Sincronizar desde SAGA</span>
              </button>
              <button
                onClick={() => setModalProfesor({ open: true, profesor: null })}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar Profesor</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="border border-slate-800 rounded-3xl overflow-hidden bg-slate-900/80 shadow-xl overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300 min-w-[760px]">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="py-4 px-5">Profesor</th>
                <th className="py-4 px-5">PNF</th>
                <th className="py-4 px-5">Contrato</th>
                <th className="py-4 px-5 text-center">Origen</th>
                <th className="py-4 px-5 text-center">Estado</th>
                {puedeGestionar && <th className="py-4 px-5 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className={`hover:bg-slate-800/40 transition-colors ${!p.activo ? 'opacity-55' : ''}`}
                >
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-3">
                      <ProfesorAvatar fotoUrl={p.foto_url} sexo={p.sexo} nombres={p.nombres} apellidos={p.apellidos} />
                      <div className="min-w-0">
                        <div className="font-semibold text-white text-sm truncate">
                          {p.apellidos}, {p.nombres}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {p.nacionalidad}-{p.cedula}
                        </div>
                        {p.email && (
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3 shrink-0" />
                            <span className="truncate">{p.email}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-5">
                    {p.pnf_nombre ? (
                      <span className="text-slate-200 font-medium">{p.pnf_nombre}</span>
                    ) : (
                      <span className="text-slate-600 italic">Sin PNF</span>
                    )}
                  </td>
                  <td className="py-3.5 px-5">
                    {p.tipo_contrato_nombre ? (
                      <div>
                        <span className="text-slate-200 font-medium">{p.tipo_contrato_nombre}</span>
                        <div className="text-[10px] text-indigo-300 font-semibold">
                          {p.tipo_contrato_horas} hrs/sem
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-600 italic">Sin contrato</span>
                    )}
                  </td>
                  <td className="py-3.5 px-5 text-center">
                    {p.origen === 'SAGA' ? (
                      <span className="bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[10px] px-2 py-1 rounded-full font-bold">
                        SAGA
                      </span>
                    ) : (
                      <span className="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] px-2 py-1 rounded-full font-bold">
                        Local
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-5 text-center">
                    {p.activo ? (
                      <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] px-2 py-1 rounded-full font-bold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Activo
                      </span>
                    ) : (
                      <span className="bg-slate-800 text-slate-400 border border-slate-700 text-[10px] px-2 py-1 rounded-full font-bold inline-flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Inactivo
                      </span>
                    )}
                  </td>
                  {puedeGestionar && (
                    <td className="py-3.5 px-5 text-right">
                      {puedeEditarProf(p) && (
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setModalProfesor({ open: true, profesor: p })}
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Editar profesor"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setModalDisp({ open: true, profesor: p })}
                          className="p-2 text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Disponibilidad horaria"
                        >
                          <CalendarCheck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setToggleProfesor(p)}
                          className={`p-2 rounded-lg transition-colors cursor-pointer ${
                            p.activo
                              ? 'text-slate-500 hover:text-red-400 hover:bg-red-500/10'
                              : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10'
                          }`}
                          title={p.activo ? 'Desactivar profesor' : 'Reactivar profesor'}
                        >
                          {p.activo ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                        </button>
                      </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProfesorModal
        isOpen={modalProfesor.open}
        profesor={modalProfesor.profesor}
        onClose={() => setModalProfesor({ open: false, profesor: null })}
        onSuccess={fetchProfesores}
      />

      <TiposContratoModal isOpen={modalTipos} onClose={() => setModalTipos(false)} />

      <PerfilesModal isOpen={modalPerfiles} onClose={() => setModalPerfiles(false)} />

      <DisponibilidadProfesorModal
        isOpen={modalDisp.open}
        profesor={modalDisp.profesor}
        onClose={() => setModalDisp({ open: false, profesor: null })}
      />

      {toggleProfesor && (
        <ConfirmModal
          titulo={toggleProfesor.activo ? 'Desactivar profesor' : 'Reactivar profesor'}
          icono={
            toggleProfesor.activo ? (
              <PowerOff className="w-5 h-5 text-red-400" />
            ) : (
              <Power className="w-5 h-5 text-emerald-400" />
            )
          }
          danger={!!toggleProfesor.activo}
          confirmLabel={toggleProfesor.activo ? 'Desactivar' : 'Reactivar'}
          mensaje={`¿Está seguro de ${toggleProfesor.activo ? 'desactivar' : 'reactivar'} a ${toggleProfesor.nombres} ${toggleProfesor.apellidos}?`}
          lineas={
            toggleProfesor.activo
              ? ['No podrá ser asignado a nuevas materias hasta reactivarlo.']
              : undefined
          }
          onConfirm={() => {
            handleToggleActivo(toggleProfesor);
            setToggleProfesor(null);
          }}
          onCancel={() => setToggleProfesor(null)}
        />
      )}
    </div>
  );
};
