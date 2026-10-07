import React, { useMemo, useState } from 'react';
import { apiFetch } from '../../api/client.js';
import { Aula, normMateria, sortAulas } from './types.js';
import {
  MateriaOpcion,
  precargarCatalogoMaterias,
  invalidarCatalogoMaterias,
  catalogoMateriasListo,
} from './catalogoMaterias.js';
import { Building2, Plus, Edit2, Trash2, X, Loader2, FlaskConical, Search, RefreshCw } from 'lucide-react';
import { ConfirmModal } from '../ConfirmModal.js';

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
  const [materiasSel, setMateriasSel] = useState<Set<string>>(new Set());
  // Picker de materias: catálogo global, se carga solo al abrirlo
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState('');
  const [materiasOpts, setMateriasOpts] = useState<MateriaOpcion[] | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  // Borrado con confirmación + aviso de resultado (banner inline)
  const [borrando, setBorrando] = useState<Aula | null>(null);
  const [borrandoBusy, setBorrandoBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Orden natural por nombre: Aula 9 antes que Aula 10
  const aulasOrdenadas = useMemo(() => sortAulas(aulas), [aulas]);

  // La misma materia puede venir en varias mallas/PNFs del catálogo: se agrupa
  // por nombre para que el picker la liste una sola vez, mostrando todas sus
  // procedencias. La preferencia se guarda por nombre de todas formas.
  const gruposMaterias = useMemo(() => {
    const m = new Map<string, MateriaOpcion[]>();
    for (const o of materiasOpts ?? []) {
      const k = normMateria(o.nombre);
      const g = m.get(k) ?? [];
      g.push(o);
      m.set(k, g);
    }
    return [...m.values()].map((opts) => ({ nombre: opts[0].nombre, origenes: opts }));
  }, [materiasOpts]);

  const abrirPicker = async () => {
    setPickerOpen(true);
    setPickerQ('');
    if (materiasOpts === null) {
      const listo = catalogoMateriasListo();
      if (listo) {
        setMateriasOpts(listo);
        return;
      }
      setPickerLoading(true);
      setMateriasOpts(await precargarCatalogoMaterias());
      setPickerLoading(false);
    }
  };

  // Invalida el caché en memoria y vuelve a pedir el catálogo a SAGA
  const recargarCatalogo = async () => {
    invalidarCatalogoMaterias();
    setPickerLoading(true);
    const lista = await precargarCatalogoMaterias();
    setMateriasOpts(lista);
    setPickerLoading(false);
  };

  const abrirNueva = () => {
    setEditando(null);
    setCodigo('');
    setNombre('');
    setCapacidad(30);
    setUbicacion('');
    setTipo('AULA_REGULAR');
    setPnfId('');
    setActiva(true);
    setMateriasSel(new Set());
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
    setMateriasSel(new Set(a.materias ?? []));
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
      materias: [...materiasSel],
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

  const eliminar = async () => {
    if (!borrando) return;
    setBorrandoBusy(true);
    const res = await apiFetch(`/horarios/aulas/${borrando.id}`, { method: 'DELETE' });
    setBorrandoBusy(false);
    if (!res.success) {
      setDeleteError(res.message || 'Error eliminando el aula.');
      return;
    }
    setBorrando(null);
    setDeleteError(null);
    if (res.message) setAviso(res.message);
    onChanged();
  };

  const tipoLabel = (t: string) => TIPOS.find((x) => x.v === t)?.l ?? t;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Building2 className="w-4 h-4 text-emerald-400" /> Aulas de clase
          {aviso && (
            <span className="ml-2 text-[10px] font-normal text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-0.5 inline-flex items-center gap-1.5">
              {aviso}
              <button onClick={() => setAviso(null)} className="hover:text-white cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
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
            {aulasOrdenadas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-500 italic">
                  No hay aulas registradas.
                </td>
              </tr>
            )}
            {aulasOrdenadas.map((a) => (
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
                        onClick={() => { setBorrando(a); setDeleteError(null); }}
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
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5">
                  <FlaskConical className="w-3 h-3 text-amber-400" />
                  Materias preferidas <span className="normal-case font-normal text-slate-600">(opcional)</span>
                </label>
                {materiasSel.size > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[...materiasSel].map((m) => (
                      <span
                        key={m}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[10px] font-semibold"
                        title={m}
                      >
                        <span className="max-w-56 truncate">{m}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const s = new Set(materiasSel);
                            s.delete(m);
                            setMateriasSel(s);
                          }}
                          className="text-amber-400/70 hover:text-white cursor-pointer"
                          title="Quitar"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={abrirPicker}
                  className="mt-2 w-full py-2 rounded-lg border border-dashed border-slate-600 hover:border-amber-400/60 hover:bg-amber-500/5 text-slate-300 hover:text-amber-200 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Search className="w-3.5 h-3.5" />
                  Buscar y agregar materias…
                </button>
                <p className="text-[10px] text-slate-500 mt-1">
                  Al generar el horario se priorizan estas aulas para las materias marcadas; si la clase
                  queda en otra aula se muestra una advertencia amarilla.
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

      {/* Picker de materias preferidas: catálogo global con buscador */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh]">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-amber-400" /> Materias de todos los PNFs
              </h4>
              <div className="flex items-center gap-1">
                <button
                  onClick={recargarCatalogo}
                  disabled={pickerLoading}
                  title="Recargar el catálogo desde SAGA"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${pickerLoading ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => setPickerOpen(false)} className="p-1.5 text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="px-5 pt-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  autoFocus
                  value={pickerQ}
                  onChange={(e) => setPickerQ(e.target.value)}
                  placeholder="Buscar por materia, PNF o malla…"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
              {pickerLoading && (
                <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando catálogo de materias…
                </div>
              )}
              {!pickerLoading && materiasOpts !== null && materiasOpts.length === 0 && (
                <div className="py-10 text-center text-slate-500 text-xs italic">
                  No se pudo cargar el catálogo de materias.
                </div>
              )}
              {!pickerLoading &&
                gruposMaterias
                  .filter(
                    (g) =>
                      !pickerQ.trim() ||
                      `${g.nombre} ${g.origenes.map((o) => `${o.pnf} ${o.maya} ${o.trayecto}`).join(' ')}`
                        .toLowerCase()
                        .includes(pickerQ.trim().toLowerCase())
                  )
                  .slice(0, 300)
                  .map((g) => {
                    const sel = materiasSel.has(g.nombre);
                    const origenTxt = g.origenes
                      .map((o) => `${o.pnf}${o.trayecto ? ` (${o.trayecto})` : ''} — ${o.maya}`)
                      .join('  ·  ');
                    return (
                      <button
                        key={g.nombre}
                        type="button"
                        onClick={() => {
                          const s = new Set(materiasSel);
                          if (sel) s.delete(g.nombre);
                          else s.add(g.nombre);
                          setMateriasSel(s);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg border cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                          sel
                            ? 'bg-emerald-500/10 border-emerald-500/40'
                            : 'bg-slate-950/50 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs text-slate-200 font-semibold truncate">{g.nombre}</div>
                          <div className="text-[10px] text-slate-500 truncate" title={origenTxt}>
                            {origenTxt}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {g.origenes.length > 1 && (
                            <span className="px-1.5 py-0.5 rounded border border-slate-600 text-slate-400 text-[9px] font-semibold">
                              {g.origenes.length} mallas
                            </span>
                          )}
                          {sel && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-[9px] font-bold uppercase">
                              Preferida
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
            </div>
            <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                {materiasSel.size} materia{materiasSel.size === 1 ? '' : 's'} preferida
                {materiasSel.size === 1 ? '' : 's'}
              </span>
              <button
                onClick={() => setPickerOpen(false)}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {borrando && (
        <ConfirmModal
          titulo={`Eliminar aula ${borrando.codigo}`}
          icono={<Trash2 className="w-5 h-5 text-red-400" />}
          danger
          busy={borrandoBusy}
          error={deleteError}
          confirmLabel="Eliminar Aula"
          mensaje={`Se eliminará el aula ${borrando.codigo} (${borrando.nombre}).`}
          lineas={['Si tiene clases agendadas, el aula se desactivará en su lugar.']}
          onConfirm={eliminar}
          onCancel={() => setBorrando(null)}
        />
      )}
    </div>
  );
};
