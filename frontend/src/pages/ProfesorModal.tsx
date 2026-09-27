import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../api/client.js';
import { ProfesorAvatar } from './ProfesorAvatar.js';
import {
  X,
  Loader2,
  AlertCircle,
  Sparkles,
  Camera,
  Trash2,
  GraduationCap,
  Lock
} from 'lucide-react';

export interface Profesor {
  id: number;
  saga_id: number | null;
  cedula: string;
  nombres: string;
  apellidos: string;
  nacionalidad: string;
  sexo: string | null;
  email: string | null;
  telefono: string | null;
  pnf_saga_id: number | null;
  pnf_nombre: string;
  tipo_contrato_id: number | null;
  tipo_contrato_nombre?: string | null;
  tipo_contrato_horas?: number | null;
  foto_url: string | null;
  origen: 'SAGA' | 'LOCAL';
  activo: number;
}

export interface TipoContrato {
  id: number;
  saga_id: number | null;
  nombre: string;
  descripcion: string | null;
  horas_semanales: number;
  activo: number;
}

interface PNF {
  id: number;
  programa: string;
}

interface ProfesorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  profesor: Profesor | null;
}

export const ProfesorModal: React.FC<ProfesorModalProps> = ({ isOpen, onClose, onSuccess, profesor }) => {
  const editingId = profesor?.id ?? null;

  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [nacionalidad, setNacionalidad] = useState('V');
  const [cedula, setCedula] = useState('');
  const [sexo, setSexo] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [pnfSagaId, setPnfSagaId] = useState<number | ''>('');
  const [tipoContratoId, setTipoContratoId] = useState<number | ''>('');

  const [pnfList, setPnfList] = useState<PNF[]>([]);
  const [tiposContrato, setTiposContrato] = useState<TipoContrato[]>([]);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoDataUrl, setFotoDataUrl] = useState<string | null>(null);
  const [eliminarFoto, setEliminarFoto] = useState(false);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Cargar datos del profesor en edición, o limpiar para registro nuevo
    setNombres(profesor?.nombres || '');
    setApellidos(profesor?.apellidos || '');
    setNacionalidad(profesor?.nacionalidad || 'V');
    setCedula(profesor?.cedula || '');
    setSexo(profesor?.sexo || '');
    setEmail(profesor?.email || '');
    setTelefono(profesor?.telefono || '');
    setPnfSagaId(profesor?.pnf_saga_id || '');
    setTipoContratoId(profesor?.tipo_contrato_id || '');
    setFotoPreview(profesor?.foto_url || null);
    setFotoDataUrl(null);
    setEliminarFoto(false);
    setFormError(null);

    const fetchCatalogs = async () => {
      const [resPnf, resTipos] = await Promise.all([
        apiFetch<PNF[]>('/saga/programas'),
        apiFetch<TipoContrato[]>('/profesores/tipos-contrato'),
      ]);
      if (resPnf.success && resPnf.data) setPnfList(resPnf.data);
      if (resTipos.success && resTipos.data) setTiposContrato(resTipos.data);
    };
    fetchCatalogs();
  }, [isOpen, profesor]);

  if (!isOpen) return null;

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setFormError('La imagen excede 2 MB. Elija una foto más liviana.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setFotoDataUrl(result);
      setFotoPreview(result);
      setEliminarFoto(false);
      setFormError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!cedula.trim() || !nombres.trim() || !apellidos.trim()) {
      setFormError('Cédula, nombres y apellidos son obligatorios.');
      return;
    }

    setSaving(true);

    const pnfObj = pnfList.find((p) => p.id === Number(pnfSagaId));
    const payload = {
      cedula: cedula.trim(),
      nombres: nombres.trim(),
      apellidos: apellidos.trim(),
      nacionalidad,
      sexo: sexo || undefined,
      email: email.trim() || undefined,
      telefono: telefono.trim() || undefined,
      pnf_saga_id: pnfSagaId === '' ? null : Number(pnfSagaId),
      pnf_nombre: pnfObj?.programa || profesor?.pnf_nombre || '',
      tipo_contrato_id: tipoContratoId === '' ? null : Number(tipoContratoId),
    };

    const res = await apiFetch<{ id: number }>(
      editingId ? `/profesores/${editingId}` : '/profesores',
      { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) }
    );

    if (!res.success) {
      setSaving(false);
      setFormError(res.message || 'Error guardando el profesor.');
      return;
    }

    const profesorId = editingId || res.data?.id;

    // Subir/eliminar foto si aplica (requiere el id ya persistido)
    if (profesorId && fotoDataUrl) {
      await apiFetch(`/profesores/${profesorId}/foto`, {
        method: 'PUT',
        body: JSON.stringify({ foto: fotoDataUrl }),
      });
    } else if (profesorId && eliminarFoto) {
      await apiFetch(`/profesores/${profesorId}/foto`, { method: 'DELETE' });
    }

    setSaving(false);
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-950 shrink-0">
          <h3 className="text-base font-bold text-white">
            {editingId ? 'Editar Profesor' : 'Registrar Profesor en la App'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs overflow-y-auto">
          {formError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Foto + identidad */}
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center gap-2 shrink-0">
              <ProfesorAvatar fotoUrl={fotoPreview} sexo={sexo} nombres={nombres} apellidos={apellidos} size="lg" />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFotoChange}
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer"
                  title="Subir foto (máx 2 MB)"
                >
                  <Camera className="w-4 h-4" />
                </button>
                {fotoPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setFotoPreview(null);
                      setFotoDataUrl(null);
                      setEliminarFoto(true);
                    }}
                    className="p-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-300 rounded-lg transition-colors cursor-pointer"
                    title="Quitar foto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 flex-1">
              <div>
                <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">Nombres *</label>
                <input
                  type="text"
                  required
                  value={nombres}
                  onChange={(e) => setNombres(e.target.value)}
                  placeholder="Ej. Juan Carlos"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">Apellidos *</label>
                <input
                  type="text"
                  required
                  value={apellidos}
                  onChange={(e) => setApellidos(e.target.value)}
                  placeholder="Ej. Pérez Gómez"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div className="col-span-2 grid grid-cols-[80px_1fr] gap-2">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">Nac.</label>
                  <select
                    value={nacionalidad}
                    onChange={(e) => setNacionalidad(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2 py-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="V">V</option>
                    <option value="E">E</option>
                    <option value="P">P</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">Cédula *</label>
                  <input
                    type="text"
                    required
                    value={cedula}
                    onChange={(e) => setCedula(e.target.value)}
                    placeholder="Ej. 12345678"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">Sexo</label>
              <select
                value={sexo}
                onChange={(e) => setSexo(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">Sin especificar</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">PNF Asociado</label>
              <select
                value={pnfSagaId}
                onChange={(e) => setPnfSagaId(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">Sin PNF asignado</option>
                {/* Si el PNF actual no está en SAGA (o SAGA caído), se muestra igual */}
                {profesor?.pnf_saga_id &&
                  !pnfList.some((p) => p.id === profesor.pnf_saga_id) && (
                    <option value={profesor.pnf_saga_id}>{profesor.pnf_nombre || `PNF #${profesor.pnf_saga_id}`}</option>
                  )}
                {pnfList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.programa}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Tipo de Contrato
              </label>
              <select
                value={tipoContratoId}
                onChange={(e) => setTipoContratoId(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">Sin contrato asignado</option>
                {tiposContrato.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} — {t.horas_semanales} hrs/sem
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">Teléfono</label>
              <input
                type="text"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Ej. 0412-0000000"
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@uptll.edu.ve"
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Perfil docente — se trabajará en una fase posterior */}
          <div className="border border-dashed border-slate-700 rounded-2xl p-4 bg-slate-950/50">
            <div className="flex items-center gap-2 text-slate-400">
              <GraduationCap className="w-4 h-4 text-indigo-400" />
              <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">Perfil Docente</span>
              <span className="ml-auto flex items-center gap-1 text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md">
                <Lock className="w-3 h-3" /> Próximamente
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
              Aquí se gestionarán las áreas de formación, títulos y materias afines al perfil del profesor.
              Esta funcionalidad estará disponible en una próxima fase del sistema.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-slate-700 text-slate-300 rounded-xl hover:bg-slate-800 font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold shadow-lg shadow-indigo-600/30 flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{editingId ? 'Actualizar Profesor' : 'Registrar Profesor'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
