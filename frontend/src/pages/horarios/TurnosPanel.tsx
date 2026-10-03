import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client.js';
import { Turno, DIAS_CORTOS, DIAS_NOMBRES, fmtHoraCfg, hora12De, a24 } from './types.js';
import { Clock, Plus, Trash2, X, Loader2, Coffee, ArrowUp, ArrowDown, AlertTriangle, Merge } from 'lucide-react';

interface TurnosPanelProps {
  turnos: Turno[];
  puedeEditar: boolean;
  formato12?: boolean; // muestra horas en 12h con selector AM/PM (BD siempre 24h)
  onChanged: () => void;
}

interface BloqueEdit {
  hora_inicio: string; // siempre 24h 'HH:MM'
  hora_fin: string;
  es_receso: boolean;
  meridiem: 'AM' | 'PM'; // solo se usa cuando formato12 está activo
}

interface ClaseConflicto {
  id: number;
  materia_nombre: string;
  seccion_nombre: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  aula_codigo: string;
}

const HORA_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

// Campo de hora con dos inputs separados (horas y minutos), independiente del
// formato regional del navegador (input[type=time] exige AM/PM en locales 12h).
// `usa12h` muestra la hora en 1-12 y la combina con el meridiem del bloque;
// el `value` y el onChange siempre trabajan en 24h.
const CampoHora: React.FC<{
  value: string; // 'HH:MM' 24h
  disabled?: boolean;
  usa12h?: boolean;
  pm?: boolean;
  onChange: (v: string) => void;
}> = ({ value, disabled, usa12h, pm, onChange }) => {
  const mm = value.split(':')[1] ?? '';
  const hh = usa12h ? hora12De(value).hh : (value.split(':')[0] ?? '');
  const minRef = React.useRef<HTMLInputElement>(null);
  const horaRef = React.useRef<HTMLInputElement>(null);

  const emitir = (hhLocal: string, mmLocal: string) =>
    onChange(usa12h ? a24(hhLocal, mmLocal, !!pm) : `${hhLocal}:${mmLocal}`);

  const cambiarHora = (v: string) => {
    const d = v.replace(/[^\d]/g, '').slice(0, 2);
    const limite = usa12h ? 12 : 23;
    const hhClamped = d !== '' && Number(d) > limite ? String(limite) : d;
    emitir(hhClamped, mm);
    if (hhClamped.length === 2) minRef.current?.select();
  };
  const cambiarMin = (v: string) => {
    const d = v.replace(/[^\d]/g, '').slice(0, 2);
    const mmClamped = d !== '' && Number(d) > 59 ? '59' : d;
    emitir(hh, mmClamped);
  };

  const cls =
    'w-9 bg-slate-900 border border-slate-700 rounded-lg px-1 py-1 text-xs text-white text-center';
  return (
    <span className="inline-flex items-center gap-0.5">
      <input
        ref={horaRef}
        type="text"
        inputMode="numeric"
        placeholder="HH"
        value={hh}
        disabled={disabled}
        onFocus={(e) => e.target.select()}
        onMouseUp={(e) => e.preventDefault()}
        onChange={(e) => cambiarHora(e.target.value)}
        onBlur={(e) => {
          // Leer del DOM: tras el auto-foco a minutos el closure `hh` puede estar desactualizado
          const h = e.target.value.replace(/\D/g, '').slice(0, 2);
          const m = (minRef.current?.value ?? mm).replace(/\D/g, '').slice(0, 2);
          if (h !== '') emitir(h.padStart(2, '0'), m || '00');
        }}
        className={cls}
      />
      <span className="text-slate-500 text-xs">:</span>
      <input
        ref={minRef}
        type="text"
        inputMode="numeric"
        placeholder="MM"
        value={mm}
        disabled={disabled}
        onFocus={(e) => e.target.select()}
        onMouseUp={(e) => e.preventDefault()}
        onChange={(e) => cambiarMin(e.target.value)}
        onBlur={(e) => {
          const m = e.target.value.replace(/\D/g, '').slice(0, 2);
          const h = (horaRef.current?.value ?? hh).replace(/\D/g, '').slice(0, 2);
          if (h !== '') emitir(h.padStart(2, '0'), (m || '00').padStart(2, '0'));
        }}
        className={cls}
      />
    </span>
  );
};

export const TurnosPanel: React.FC<TurnosPanelProps> = ({ turnos, puedeEditar, formato12, onChanged }) => {
  const [sel, setSel] = useState<number | null>(turnos[0]?.id ?? null);
  const [dias, setDias] = useState<number[]>([]);
  const [bloques, setBloques] = useState<BloqueEdit[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ error: boolean; texto: string } | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [creando, setCreando] = useState(false);
  const [conflicto, setConflicto] = useState<{ total: number; clases: ClaseConflicto[] } | null>(null);
  const [desagendando, setDesagendando] = useState(false);
  const esAdmin = puedeEditar; // creación de turnos locales solo SUPER/ADMIN se valida server-side

  const turno = turnos.find((t) => t.id === sel) ?? turnos[0];
  const dirtyRef = React.useRef(false);

  // Horas semanales que ofrece el turno: bloques de clase × días habilitados.
  // Se compara contra la jornada configurada (horas_jornada, default 30).
  const horasSemana = bloques.filter((b) => !b.es_receso).length * dias.length;
  const jornada = turno?.horas_jornada ?? 30;

  useEffect(() => {
    if (!turno) return;
    // No pisar la edición en curso si solo fue una recarga de datos del mismo turno
    if (dirtyRef.current && turno.id === sel) return;
    setSel(turno.id);
    dirtyRef.current = false;
    setDias(
      String(turno.dias_semana)
        .split(',')
        .map(Number)
        .filter(Boolean)
        .sort()
    );
    setBloques(
      turno.bloques.map((b) => ({
        hora_inicio: b.hora_inicio.slice(0, 5),
        hora_fin: b.hora_fin.slice(0, 5),
        es_receso: !!b.es_receso,
        meridiem: Number(b.hora_inicio.slice(0, 2)) >= 12 ? 'PM' : 'AM',
      }))
    );
    setMsg(null);
  }, [turno?.id, turnos]);

  // Marca la edición como "sucia" para que una recarga de datos no la pise
  const editDias: typeof setDias = (v) => {
    dirtyRef.current = true;
    setDias(v);
  };
  const editBloques: typeof setBloques = (v) => {
    dirtyRef.current = true;
    setBloques(v);
  };

  const toggleDia = (d: number) =>
    editDias((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  // AM/PM del bloque: reinterpreta ambas horas con el nuevo meridiem
  const cambiarMeridiem = (i: number, m: 'AM' | 'PM') => {
    editBloques((p) =>
      p.map((x, j) => {
        if (j !== i) return x;
        const conv = (h24: string) => {
          const p12 = hora12De(h24);
          return h24 ? a24(p12.hh, p12.mm, m === 'PM') : h24;
        };
        return { ...x, meridiem: m, hora_inicio: conv(x.hora_inicio), hora_fin: conv(x.hora_fin) };
      })
    );
  };

  const moverBloque = (i: number, dir: -1 | 1) => {
    editBloques((prev) => {
      const copia = [...prev];
      const j = i + dir;
      if (j < 0 || j >= copia.length) return prev;
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  };

  // El turno diurno mezcla mañana + tarde: este botón copia los bloques de
  // ambos turnos y agrega entre ellos un receso del tamaño de la diferencia
  // horaria (fin de la mañana → inicio de la tarde).
  const normNombre = (s: string) =>
    s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const esDiurno = !!turno && /DIURN/.test(normNombre(turno.nombre));

  const combinarMananaTarde = () => {
    const manana = turnos.find((t) => /MANANA/.test(normNombre(t.nombre)));
    const tarde = turnos.find((t) => /TARDE/.test(normNombre(t.nombre)));
    if (!manana || !tarde) {
      setMsg({ error: true, texto: 'No se encontraron los turnos Mañana y Tarde para combinar.' });
      return;
    }
    if (manana.bloques.length === 0 || tarde.bloques.length === 0) {
      setMsg({ error: true, texto: 'Mañana y Tarde deben tener bloques configurados.' });
      return;
    }
    const mk = (hi: string, hf: string, es_receso: boolean): BloqueEdit => ({
      hora_inicio: hi.slice(0, 5),
      hora_fin: hf.slice(0, 5),
      es_receso,
      meridiem: Number(hi.slice(0, 2)) >= 12 ? 'PM' : 'AM',
    });
    const bloquesM = manana.bloques.map((b) => mk(b.hora_inicio, b.hora_fin, !!b.es_receso));
    const bloquesT = tarde.bloques.map((b) => mk(b.hora_inicio, b.hora_fin, !!b.es_receso));
    const finM = bloquesM[bloquesM.length - 1].hora_fin;
    const iniT = bloquesT[0].hora_inicio;
    if (finM > iniT) {
      setMsg({
        error: true,
        texto: `Mañana termina a las ${finM} pero Tarde empieza a las ${iniT}: los horarios se solapan.`,
      });
      return;
    }
    const nuevos = [...bloquesM];
    if (finM < iniT) nuevos.push(mk(finM, iniT, true)); // receso entre turnos
    nuevos.push(...bloquesT);
    editBloques(nuevos);
    // Días del diurno: unión de los días habilitados de ambos turnos
    const u = new Set<number>();
    for (const t of [manana, tarde]) {
      for (const d of String(t.dias_semana).split(',').map(Number).filter(Boolean)) u.add(d);
    }
    editDias([...u].sort());
    setMsg({
      error: false,
      texto:
        `Bloques combinados de Mañana y Tarde` +
        (finM < iniT ? `, con receso ${finM}–${iniT}` : '') +
        '. Revisa y pulsa Guardar.',
    });
  };

  const guardar = async () => {
    if (!turno) return;
    // Auto-ordenar por hora efectiva (24h): el turno Diurno mezcla bloques de
    // mañana y tarde, y el orden de la lista define el orden de los bloques.
    const ordenados = [...bloques].sort((a, b) =>
      a.hora_inicio === '' ? 1 : b.hora_inicio === '' ? -1 : a.hora_inicio.localeCompare(b.hora_inicio)
    );
    for (const [i, b] of ordenados.entries()) {
      if (!HORA_RE.test(b.hora_inicio) || !HORA_RE.test(b.hora_fin)) {
        setMsg({ error: true, texto: `Bloque ${i + 1}: completa las horas en formato HH:MM.` });
        return;
      }
      if (b.hora_inicio >= b.hora_fin) {
        setMsg({ error: true, texto: `Bloque ${i + 1}: la hora de inicio debe ser menor que la de fin.` });
        return;
      }
    }
    if (dias.length === 0) {
      setMsg({ error: true, texto: 'Selecciona al menos un día de clase para el turno.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    const r1 = await apiFetch(`/horarios/turnos/${turno.id}`, {
      method: 'PUT',
      body: JSON.stringify({ dias_semana: dias.join(',') }),
    });
    if (!r1.success) {
      setSaving(false);
      setMsg({ error: true, texto: r1.message || 'Error guardando días.' });
      return;
    }
    const r2 = await apiFetch(`/horarios/turnos/${turno.id}/bloques`, {
      method: 'PUT',
      body: JSON.stringify({
        bloques: ordenados.map((b) => ({
          hora_inicio: b.hora_inicio,
          hora_fin: b.hora_fin,
          es_receso: b.es_receso,
        })),
      }),
    });
    setSaving(false);
    if (r2.success) {
      setMsg({ error: false, texto: 'Turno actualizado.' });
      dirtyRef.current = false;
      onChanged();
    } else if (r2.data?.clases && r2.data?.total > 0) {
      // Conflicto: hay clases agendadas en los bloques — ofrecer desagendarlas
      setConflicto({ total: r2.data.total, clases: r2.data.clases });
    } else {
      setMsg({ error: true, texto: r2.message || 'Error guardando bloques.' });
    }
  };

  // Desagenda las clases del turno y reintenta guardar los bloques
  const desagendarYGuardar = async () => {
    if (!turno || !conflicto) return;
    setDesagendando(true);
    const del = await apiFetch(`/horarios/turnos/${turno.id}/entries`, { method: 'DELETE' });
    if (!del.success) {
      setDesagendando(false);
      setConflicto(null);
      setMsg({ error: true, texto: del.message || 'No se pudieron desagendar las clases.' });
      return;
    }
    const r2 = await apiFetch(`/horarios/turnos/${turno.id}/bloques`, {
      method: 'PUT',
      body: JSON.stringify({
        bloques: [...bloques]
          .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
          .map((b) => ({ hora_inicio: b.hora_inicio, hora_fin: b.hora_fin, es_receso: b.es_receso })),
      }),
    });
    setDesagendando(false);
    setConflicto(null);
    if (r2.success) {
      const n = del.data?.eliminadas ?? conflicto.total;
      setMsg({
        error: false,
        texto: `Turno actualizado. ${n} clase${n === 1 ? '' : 's'} desagendada${n === 1 ? '' : 's'}.`,
      });
      dirtyRef.current = false;
      onChanged();
    } else {
      setMsg({ error: true, texto: r2.message || 'Error guardando bloques.' });
    }
  };

  const crearTurno = async () => {
    if (!nuevoNombre.trim()) return;
    const res = await apiFetch('/horarios/turnos', {
      method: 'POST',
      body: JSON.stringify({ nombre: nuevoNombre.trim() }),
    });
    if (res.success) {
      setNuevoNombre('');
      setCreando(false);
      onChanged();
    } else {
      setMsg({ error: true, texto: res.message || 'Error creando el turno.' });
    }
  };

  const eliminarTurno = async () => {
    if (!turno) return;
    if (turno.saga_id !== null) {
      alert('Los turnos de SAGA no se pueden eliminar.');
      return;
    }
    if (!confirm(`¿Eliminar el turno local '${turno.nombre}'?`)) return;
    const res = await apiFetch(`/horarios/turnos/${turno.id}`, { method: 'DELETE' });
    if (!res.success) alert(res.message || 'Error eliminando.');
    onChanged();
  };

  if (turnos.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-sm">
        No hay turnos disponibles (SAGA no responde y no hay turnos locales).
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* Lista de turnos */}
      <div className="w-full lg:w-56 shrink-0 bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-1.5">
        <div
          className={`mb-1 px-2 py-1.5 rounded-lg border text-[10px] font-semibold flex items-center gap-1.5 ${
            formato12
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
              : 'border-slate-700 bg-slate-800/60 text-slate-400'
          }`}
        >
          <Clock className="w-3 h-3 shrink-0" />
          Formato de {formato12 ? '12 horas (AM/PM)' : '24 horas'}
        </div>
        {turnos.map((t) => (
          <button
            key={t.id}
            onClick={() => setSel(t.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              turno?.id === t.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="truncate">{t.nombre}</span>
              {t.saga_id === null && (
                <span className="text-[8px] px-1 py-0.5 rounded bg-slate-700/80 text-slate-300">LOCAL</span>
              )}
            </div>
            <div className={`text-[9px] mt-0.5 ${turno?.id === t.id ? 'text-blue-200' : 'text-slate-500'}`}>
              {t.bloques.length} bloques · {t.bloques.filter((b) => b.es_receso).length} recesos
            </div>
          </button>
        ))}
        {esAdmin &&
          (creando ? (
            <div className="flex gap-1 pt-1">
              <input
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                placeholder="Nombre turno"
                className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
              />
              <button
                onClick={crearTurno}
                className="px-2 py-1.5 rounded-lg bg-emerald-600 text-white text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setCreando(false)}
                className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreando(true)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-xs font-semibold cursor-pointer"
            >
              + Turno local
            </button>
          ))}
      </div>

      {/* Editor del turno seleccionado */}
      {turno && (
        <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" /> {turno.nombre}
              {turno.saga_id === null && puedeEditar && (
                <button
                  onClick={eliminarTurno}
                  title="Eliminar turno local"
                  className="text-slate-500 hover:text-red-300 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </h3>
            {puedeEditar && (
              <button
                onClick={guardar}
                disabled={saving}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar
              </button>
            )}
          </div>

          {msg && (
            <div
              className={`mb-3 px-3 py-2 rounded-lg text-xs font-semibold border ${
                msg.error
                  ? 'bg-red-500/10 border-red-500/40 text-red-300'
                  : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
              }`}
            >
              {msg.texto}
            </div>
          )}

          {/* Días de la semana del turno */}
          <div className="mb-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
              Días de clase del turno
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <button
                  key={d}
                  onClick={() => puedeEditar && toggleDia(d)}
                  disabled={!puedeEditar}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    dias.includes(d)
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-950 border-slate-700 text-slate-500'
                  } ${puedeEditar ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  {DIAS_CORTOS[d]}
                </button>
              ))}
            </div>
          </div>

          {/* Bloques horarios */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-2">
                Horas de clase y recesos
                <span
                  className={`normal-case tracking-normal px-2 py-0.5 rounded-md border text-[10px] font-semibold ${
                    horasSemana > jornada
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                      : horasSemana < jornada
                        ? 'bg-slate-800/60 border-slate-700 text-slate-400'
                        : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                  }`}
                  title={`Jornada configurada: ${jornada}h semanales`}
                >
                  {horasSemana}h/sem · jornada {jornada}h
                </span>
              </div>
              {puedeEditar && (
                <div className="flex gap-1.5">
                  {esDiurno && (
                    <button
                      onClick={combinarMananaTarde}
                      title="Copia los bloques de Mañana y Tarde, con un receso entre ambos"
                      className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1"
                    >
                      <Merge className="w-3 h-3" /> Mañana+Tarde
                    </button>
                  )}
                  <button
                    onClick={() =>
                      editBloques((p) => [
                        ...p,
                        { hora_inicio: '', hora_fin: '', es_receso: false, meridiem: p.length > 0 ? p[p.length - 1].meridiem : 'AM' },
                      ])
                    }
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold cursor-pointer"
                  >
                    + Bloque
                  </button>
                  <button
                    onClick={() =>
                      editBloques((p) => [
                        ...p,
                        { hora_inicio: '', hora_fin: '', es_receso: true, meridiem: p.length > 0 ? p[p.length - 1].meridiem : 'AM' },
                      ])
                    }
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1"
                  >
                    <Coffee className="w-3 h-3" /> Receso
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              {bloques.length === 0 && (
                <div className="text-[11px] text-slate-500 italic py-3 text-center">
                  Sin bloques. Agrega las horas de clase del turno.
                </div>
              )}
              {bloques.map((b, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                    b.es_receso ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-800 bg-slate-950/60'
                  }`}
                >
                  <span className="text-[10px] font-bold text-slate-500 w-5">{i + 1}</span>
                  {b.es_receso && <Coffee className="w-3.5 h-3.5 text-amber-400" />}
                  <CampoHora
                    value={b.hora_inicio}
                    disabled={!puedeEditar}
                    usa12h={formato12}
                    pm={b.meridiem === 'PM'}
                    onChange={(v) =>
                      editBloques((p) => p.map((x, j) => (j === i ? { ...x, hora_inicio: v } : x)))
                    }
                  />
                  <span className="text-slate-500 text-xs">a</span>
                  <CampoHora
                    value={b.hora_fin}
                    disabled={!puedeEditar}
                    usa12h={formato12}
                    pm={b.meridiem === 'PM'}
                    onChange={(v) =>
                      editBloques((p) => p.map((x, j) => (j === i ? { ...x, hora_fin: v } : x)))
                    }
                  />
                  {formato12 && (
                    <select
                      value={b.meridiem}
                      disabled={!puedeEditar}
                      onChange={(e) => cambiarMeridiem(i, e.target.value as 'AM' | 'PM')}
                      title="AM o PM"
                      className="bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1 text-[11px] font-semibold text-white cursor-pointer disabled:cursor-default"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  )}
                  <div className="flex-1" />
                  {puedeEditar && (
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => moverBloque(i, -1)} className="p-1 rounded hover:bg-slate-800 text-slate-400 cursor-pointer" title="Subir">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => moverBloque(i, 1)} className="p-1 rounded hover:bg-slate-800 text-slate-400 cursor-pointer" title="Bajar">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => editBloques((p) => p.filter((_, j) => j !== i))}
                        className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-300 cursor-pointer"
                        title="Quitar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {horasSemana !== jornada && (
              <div
                className={`mt-3 flex items-start gap-2 p-2.5 rounded-lg border text-[11px] leading-snug ${
                  horasSemana > jornada
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  {horasSemana > jornada
                    ? `El turno ofrece ${horasSemana}h semanales, ${horasSemana - jornada}h por encima de su jornada configurada (${jornada}h). Quita bloques/días o ajusta la jornada en Configuración de Horarios.`
                    : `El turno ofrece ${horasSemana}h semanales, ${jornada - horasSemana}h por debajo de su jornada configurada (${jornada}h). Faltan bloques o días por habilitar.`}
                </span>
              </div>
            )}
            <p className="text-[10px] text-slate-500 mt-3">
              Nota: si el turno tiene clases agendadas, se te ofrecerá desagendarlas antes de guardar.
            </p>
          </div>
        </div>
      )}

      {/* Modal: clases que impiden modificar los bloques */}
      {conflicto && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !desagendando && setConflicto(null)}
        >
          <div
            className="w-full max-w-lg bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Hay clases agendadas en este turno</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {conflicto.total} clase{conflicto.total === 1 ? '' : 's'} ocupa
                  {conflicto.total === 1 ? '' : 'n'} los bloques de <strong>{turno?.nombre}</strong>.
                  Para modificar los bloques hay que desagendarlas (las materias vuelven al panel de
                  pendientes y puedes reagendarlas después).
                </p>
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800 mb-4">
              {conflicto.clases.map((c) => (
                <div key={c.id} className="px-3 py-2 flex items-center gap-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-200 font-semibold truncate">{c.materia_nombre}</div>
                    <div className="text-slate-500 text-[10px]">Sección {c.seccion_nombre}</div>
                  </div>
                  <div className="text-slate-400 whitespace-nowrap">
                    {DIAS_NOMBRES[c.dia_semana]} {fmtHoraCfg(c.hora_inicio, formato12)}
                  </div>
                  <div className="text-slate-500">{c.aula_codigo}</div>
                </div>
              ))}
              {conflicto.total > conflicto.clases.length && (
                <div className="px-3 py-2 text-[10px] text-slate-500 text-center">
                  y {conflicto.total - conflicto.clases.length} más…
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setConflicto(null)}
                disabled={desagendando}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm font-semibold hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={desagendarYGuardar}
                disabled={desagendando}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {desagendando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Desagendando…
                  </>
                ) : (
                  `Desagendar ${conflicto.total} clase${conflicto.total === 1 ? '' : 's'} y guardar`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
