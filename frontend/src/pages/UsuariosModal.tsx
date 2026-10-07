import React, { useState, useEffect, useMemo, useRef } from 'react';
import { apiFetch } from '../api/client.js';
import {
  X,
  Users,
  Loader2,
  AlertCircle,
  Plus,
  Pencil,
  ShieldCheck,
  UserCheck,
  Eye,
  RefreshCw,
  Search,
} from 'lucide-react';

type Rol = 'SUPER_USUARIO' | 'ADMINISTRADOR' | 'REGULAR' | 'PROFESOR';

interface Usuario {
  id: number;
  username: string;
  nombre: string;
  apellido: string;
  email: string | null;
  role: Rol;
  pnf_saga_id: number | null;
  pnf_nombre: string | null;
  profesor_cedula: string | null;
  activo: number;
  created_at: string;
}

interface PNF {
  id: number;
  programa: string;
}

interface ProfesorOpcion {
  id: number;
  cedula: string;
  nombres: string;
  apellidos: string;
}

const ROL_LABEL: Record<Rol, string> = {
  SUPER_USUARIO: 'Master',
  ADMINISTRADOR: 'Administrador',
  REGULAR: 'Coordinador',
  PROFESOR: 'Usuario',
};

const rolBadge = (role: Rol) => {
  switch (role) {
    case 'SUPER_USUARIO':
      return 'bg-purple-500/15 border-purple-500/40 text-purple-300';
    case 'ADMINISTRADOR':
      return 'bg-blue-500/15 border-blue-500/40 text-blue-300';
    case 'REGULAR':
      return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300';
    default:
      return 'bg-amber-500/15 border-amber-500/40 text-amber-300';
  }
};

interface FormState {
  username: string;
  password: string;
  nombre: string;
  apellido: string;
  email: string;
  role: Rol;
  pnf_saga_id: number | '';
  profesor_cedula: string;
}

const emptyForm: FormState = {
  username: '',
  password: '',
  nombre: '',
  apellido: '',
  email: '',
  role: 'REGULAR',
  pnf_saga_id: '',
  profesor_cedula: '',
};

interface UsuariosModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: number;
}

export const UsuariosModal: React.FC<UsuariosModalProps> = ({ isOpen, onClose, currentUserId }) => {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [pnfs, setPnfs] = useState<PNF[]>([]);
  const [profesores, setProfesores] = useState<ProfesorOpcion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const fetchUsuarios = async () => {
    setLoading(true);
    const res = await apiFetch<Usuario[]>('/usuarios');
    setLoading(false);
    if (res.success && res.data) setUsuarios(res.data);
    else setErrorMsg(res.message || 'Error cargando usuarios.');
  };

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setFormOpen(false);
    setEditing(null);
    fetchUsuarios();
    (async () => {
      const [resPnf, resProf] = await Promise.all([
        apiFetch<PNF[]>('/saga/programas'),
        apiFetch<ProfesorOpcion[]>('/profesores?para_asignacion=1'),
      ]);
      if (resPnf.success && resPnf.data) setPnfs(resPnf.data);
      if (resProf.success && resProf.data) setProfesores(resProf.data);
    })();
  }, [isOpen]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrorMsg(null);
    setFormOpen(true);
  };

  const openEdit = (u: Usuario) => {
    setEditing(u);
    setForm({
      username: u.username,
      password: '',
      nombre: u.nombre,
      apellido: u.apellido,
      email: u.email || '',
      role: u.role,
      pnf_saga_id: u.pnf_saga_id ?? '',
      profesor_cedula: u.profesor_cedula || '',
    });
    setErrorMsg(null);
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!form.pnf_saga_id) {
      setErrorMsg('Debe asociar el usuario a un PNF.');
      return;
    }
    setSaving(true);
    const payload: any = {
      username: form.username.trim(),
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      email: form.email.trim() || null,
      role: form.role,
      pnf_saga_id: Number(form.pnf_saga_id),
      profesor_cedula: form.profesor_cedula || null,
    };
    if (!editing || form.password) payload.password = form.password;

    const res = editing
      ? await apiFetch(`/usuarios/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await apiFetch('/usuarios', { method: 'POST', body: JSON.stringify(payload) });
    setSaving(false);

    if (res.success) {
      setFormOpen(false);
      setEditing(null);
      fetchUsuarios();
    } else {
      setErrorMsg(res.message || 'Error guardando el usuario.');
    }
  };

  const handleToggle = async (u: Usuario) => {
    const res = await apiFetch(`/usuarios/${u.id}/toggle-activo`, { method: 'PUT' });
    if (res.success) fetchUsuarios();
    else setErrorMsg(res.message || 'Error cambiando el estado.');
  };

  if (!isOpen) return null;

  const inputCls =
    'w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Usuarios del Sistema</h3>
              <p className="text-xs text-slate-400">Gestión de cuentas y niveles de permisos.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {formOpen ? (
            /* ============ FORMULARIO ============ */
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Nombre de usuario *</label>
                  <input
                    required
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className={inputCls}
                    placeholder="Ej. jlopez"
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    Contraseña {editing ? '(vacía = no cambiar)' : '*'}
                  </label>
                  <input
                    type="password"
                    required={!editing}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className={inputCls}
                    placeholder={editing ? 'Dejar vacío para conservar' : 'Mínimo 6 caracteres'}
                  />
                </div>
                <div>
                  <label className={labelCls}>Nombres *</label>
                  <input
                    required
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Apellidos *</label>
                  <input
                    required
                    value={form.apellido}
                    onChange={(e) => setForm({ ...form, apellido: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Correo electrónico</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={inputCls}
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <label className={labelCls}>Nivel de permisos *</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as Rol })}
                    className={inputCls}
                  >
                    <option value="SUPER_USUARIO">Master — acceso total</option>
                    <option value="REGULAR">Coordinador — solo su PNF</option>
                    <option value="PROFESOR">Usuario — solo lectura</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>PNF asociado *</label>
                  <select
                    required
                    value={form.pnf_saga_id}
                    onChange={(e) =>
                      setForm({ ...form, pnf_saga_id: e.target.value === '' ? '' : Number(e.target.value) })
                    }
                    className={inputCls}
                  >
                    <option value="">Seleccione un PNF...</option>
                    {pnfs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.programa}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Profesor vinculado (opcional)</label>
                  <ProfesorVinculoSelect
                    profesores={profesores}
                    value={form.profesor_cedula}
                    onChange={(cedula) => setForm({ ...form, profesor_cedula: cedula })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 transition-colors"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editing ? 'Guardar cambios' : 'Crear usuario'}</span>
                </button>
              </div>
            </form>
          ) : (
            /* ============ LISTA ============ */
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} registrado
                  {usuarios.length !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchUsuarios}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                    title="Recargar"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={openCreate}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Nuevo usuario</span>
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  <span className="text-sm">Cargando usuarios...</span>
                </div>
              ) : usuarios.length === 0 ? (
                <div className="p-8 rounded-xl bg-slate-950 border border-slate-800 text-center text-slate-400 text-sm">
                  No hay usuarios registrados.
                </div>
              ) : (
                <div className="border border-slate-800 rounded-2xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300 min-w-[640px]">
                    <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Usuario</th>
                        <th className="py-3 px-4">Nombre</th>
                        <th className="py-3 px-4">Nivel</th>
                        <th className="py-3 px-4">PNF</th>
                        <th className="py-3 px-4 text-center">Estado</th>
                        <th className="py-3 px-4 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {usuarios.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-mono font-semibold text-white">{u.username}</div>
                            {u.email && <div className="text-[10px] text-slate-500">{u.email}</div>}
                          </td>
                          <td className="py-3 px-4 font-medium text-white">
                            {u.apellido}, {u.nombre}
                            {u.profesor_cedula && (
                              <div className="text-[10px] text-slate-500 font-mono">
                                Docente: {u.profesor_cedula}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 whitespace-nowrap border text-[10px] px-2.5 py-1 rounded-full font-semibold ${rolBadge(u.role)}`}
                            >
                              {u.role === 'SUPER_USUARIO' ? (
                                <ShieldCheck className="w-3 h-3" />
                              ) : u.role === 'PROFESOR' ? (
                                <Eye className="w-3 h-3" />
                              ) : (
                                <UserCheck className="w-3 h-3" />
                              )}
                              {ROL_LABEL[u.role]}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-400">
                            {u.pnf_nombre || (u.pnf_saga_id ? `PNF #${u.pnf_saga_id}` : '—')}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-block whitespace-nowrap text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                                u.activo
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                  : 'bg-red-500/10 border-red-500/30 text-red-300'
                              }`}
                            >
                              {u.activo ? 'ACTIVO' : 'INACTIVO'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => openEdit(u)}
                                className="p-1.5 text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors"
                                title="Editar usuario"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              {u.id !== currentUserId && (
                                <button
                                  onClick={() => handleToggle(u)}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                                    u.activo
                                      ? 'text-red-400 hover:bg-red-500/10'
                                      : 'text-emerald-400 hover:bg-emerald-500/10'
                                  }`}
                                  title={u.activo ? 'Desactivar' : 'Activar'}
                                >
                                  {u.activo ? 'Desactivar' : 'Activar'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

    </div>
  );
};

// Normaliza texto para búsqueda: sin acentos y en minúsculas
const normTxt = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Selector de profesor con búsqueda: filtra por nombre, apellido o cédula
// (ignora acentos; la cédula se compara solo por dígitos).
const ProfesorVinculoSelect: React.FC<{
  profesores: ProfesorOpcion[];
  value: string; // cédula ('' = ninguno)
  onChange: (cedula: string) => void;
}> = ({ profesores, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  // Posición fija del desplegable (medida del input) para que sobresalga del
  // modal: el área del formulario tiene overflow y recortaría un absolute.
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const sel = profesores.find((p) => p.cedula === value);

  const abrir = () => {
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setQ('');
    setOpen(true);
  };

  const filtrados = useMemo(() => {
    const t = normTxt(q.trim());
    const digitos = q.replace(/\D/g, '');
    if (!t) return profesores;
    return profesores.filter(
      (p) =>
        normTxt(`${p.apellidos} ${p.nombres}`).includes(t) ||
        (digitos.length > 0 && p.cedula.replace(/\D/g, '').includes(digitos))
    );
  }, [profesores, q]);

  return (
    <div className="relative" ref={wrapRef}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
      <input
        type="text"
        value={open ? q : sel ? `${sel.apellidos}, ${sel.nombres} (${sel.cedula})` : ''}
        onFocus={abrir}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        placeholder="— Ninguno —"
        className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-9 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none placeholder:text-slate-600"
      />
      {value && !open && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange('')}
            title="Quitar vinculación"
            className="p-1 text-slate-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setQ('');
            }}
          />
          <div
            className="fixed max-h-56 overflow-y-auto bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl shadow-black/60 z-50"
            style={
              pos
                ? { top: pos.top, left: pos.left, width: pos.width }
                : { top: 0, left: 0, width: 240 }
            }
          >
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
                setQ('');
              }}
              className="w-full text-left px-3 py-2 text-xs text-slate-400 italic hover:bg-slate-800 transition-colors cursor-pointer"
            >
              — Ninguno —
            </button>
            {filtrados.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-slate-500 italic">
                Sin profesores que coincidan con '{q}'.
              </div>
            ) : (
              filtrados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.cedula);
                    setOpen(false);
                    setQ('');
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    p.cedula === value
                      ? 'bg-purple-600/20 text-purple-200'
                      : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">
                    {p.apellidos}, {p.nombres}
                  </span>
                  <span className="text-[10px] text-slate-500 shrink-0">C.I. {p.cedula}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
