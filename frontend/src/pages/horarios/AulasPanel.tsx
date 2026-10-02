import React, { useState } from 'react';
import { apiFetch } from '../../api/client.js';
import { Aula } from './types.js';
import { Building2, Plus, Edit2, Trash2, X, Loader2 } from 'lucide-react';

const TIPOS = [
  { v: 'AULA_REGULAR', l: 'Aula regular' },
  { v: 'LABORATORIO', l: 'Laboratorio' },
  { v: 'TALLER', l: 'Taller' },
  { v: 'AUDITORIO', l: 'Auditorio' },
  { v: 'INSTALACION_DEPORTIVA', l: 'Instalación deportiva' },
  { v: 'SALA_LECTURA', l: 'Sala de lectura' },
];

interface AulasPanelProps {
  aulas: Aula[];
  pnfOptions: Array<[number, string]>;
  puedeEditar: boolean;
  onChanged: () => void;
}

export const AulasPanel: React.FC<AulasPanelProps> = ({ aulas, pnfOptions, puedeEditar, onChanged }) => {
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Aula | null>(null);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [capacidad, setCapacidad] = useState<number>(30);
  const [ubicacion, setUbicacion] = useState('');
  const [tipo, setTipo] = useState<string>('AULA_REGULAR');
  const [pnfId, setPnfId] = useState<number | ''>('');
  const [activa, setActiva] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrirNueva = () => {
    setEditando(null);
    setCodigo('');
    setNombre('');
    setCapacidad(30);
    setUbicacion('');
    setTipo('AULA_REGULAR');
    setPnfId('');
    setActiva(true);
    setError(null);
    setModal(true);
  };

  const abrirEditar = (a: Aula) => {
    setEditando(a);
    setCodigo(a.codigo);
    setNombre(a.nombre);
    setCapacidad(a.capacidad);
    setUbicacion(a.ubicacion ?? '');
    setTipo(a.tipo);
    setPnfId(a.pnf_saga_id ?? '');
    setActiva(!!a.activa);
    setError(null);
    setModal(true);
  };

  const guardar = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      codigo,
      nombre,
      capacidad,
      ubicacion: ubicacion || null,
      tipo,
      pnf_saga_id: pnfId === '' ? null : pnfId,
      activa,
    };
    const res = editando
      ? await apiFetch(`/horarios/aulas/${editando.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await apiFetch('/horarios/aulas', { method: 'POST', body: JSON.stringify(payload) });
    setSaving(false);
    if (res.success) {
      setModal(false);
      onChanged();
    } else {
      setError(res.message || 'Error guardando el aula.');
    }
  };

  const eliminar = async (a: Aula) => {
    if (!confirm(`¿Eliminar el aula ${a.codigo}? Si tiene clases agendadas se desactivará.`)) return;
    const res = await apiFetch(`/horarios/aulas/${a.id}`, { method: 'DELETE' });
    if (!res.success) alert(res.message || 'Error eliminando el aula.');
    else if (res.message) alert(res.message);
    onChanged();
  };

  const tipoLabel = (t: string) => TIPOS.find((x) => x.v === t)?.l ?? t;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Building2 className="w-4 h-4 text-emerald-400" /> Aulas de clase
        </h3>
        {puedeEditar && (
          <button
            onClick={abrirNueva}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Nueva aula
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <th className="px-5 py-3">Código</th>
              <th className="px-5 py-3">Nombre</th>
              <th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3">Capacidad</th>
              <th className="px-5 py-3">PNF preferido</th>
              <th className="px-5 py-3">Ubicación</th>
              <th className="px-5 py-3">Estado</th>
              {puedeEditar && <th className="px-5 py-3 text-center w-24">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {aulas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-500 italic">
                  No hay aulas registradas.
                </td>
              </tr>
            )}
            {aulas.map((a) => (
              <tr key={a.id} className={a.activa ? '' : 'opacity-50'}>
                <td className="px-5 py-3 font-bold text-white">{a.codigo}</td>
                <td className="px-5 py-3 text-slate-300">{a.nombre}</td>
                <td className="px-5 py-3 text-slate-400">{tipoLabel(a.tipo)}</td>
                <td className="px-5 py-3 text-slate-400">{a.capacidad}</td>
                <td className="px-5 py-3">
                  {a.pnf_nombre ? (
                    <span className="text-purple-300 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded-md text-[10px] font-semibold">
                      {a.pnf_nombre}
                    </span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-slate-400">{a.ubicacion || '—'}</td>
                <td className="px-5 py-3">
                  {a.activa ? (
                    <span className="text-emerald-400 font-semibold">Activa</span>
                  ) : (
                    <span className="text-slate-500">Inactiva</span>
                  )}
                </td>
                {puedeEditar && (
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => abrirEditar(a)}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => eliminar(a)}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-300 cursor-pointer"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">{editando ? 'Editar aula' : 'Nueva aula'}</h4>
              <button onClick={() => setModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {error && (
                <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 text-xs">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Código</label>
                  <input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                    placeholder="A-101"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Capacidad</label>
                  <input
                    type="number"
                    min={0}
                    value={capacidad}
                    onChange={(e) => setCapacidad(Number(e.target.value))}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Nombre</label>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  placeholder="Aula 101 - Edificio A"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Tipo</label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    {TIPOS.map((t) => (
                      <option key={t.v} value={t.v}>
                        {t.l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Ubicación</label>
                  <input
                    value={ubicacion}
                    onChange={(e) => setUbicacion(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                    placeholder="Edificio A, piso 1"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  PNF preferido <span className="normal-case font-normal text-slate-600">(opcional)</span>
                </label>
                <select
                  value={pnfId}
                  onChange={(e) => setPnfId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="">Sin preferencia (cualquier PNF)</option>
                  {pnfOptions.map(([id, nombre]) => (
                    <option key={id} value={id}>
                      {nombre}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Al agendar, este aula se prefieren para clases de ese PNF, pero cualquier PNF puede usarla.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activa}
                  onChange={(e) => setActiva(e.target.checked)}
                  className="accent-emerald-500"
                />
                Aula activa (disponible para agendar)
              </label>
            </div>
            <div className="px-5 py-4 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setModal(false)}
                className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
