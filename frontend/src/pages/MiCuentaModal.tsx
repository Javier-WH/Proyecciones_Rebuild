import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { apiFetch } from '../api/client.js';
import {
  X,
  UserRound,
  Lock,
  ShieldQuestion,
  Loader2,
  Save,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';

const PREGUNTAS_REQUERIDAS = 6;

interface SlotPregunta {
  idx: number | '';
  respuesta: string;
}

// Modal "Mi cuenta": cada usuario edita sus propios datos (usuario, nombre,
// email, contraseña) y configura sus 6 preguntas de seguridad para la
// recuperación de contraseña. No permite tocar rol, PNF ni cédula asociada.
export const MiCuentaModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user, checkAuth } = useAuth();

  // ── Datos personales ──────────────────────────────────────────────────────
  const [username, setUsername] = useState(user?.username ?? '');
  const [nombre, setNombre] = useState(user?.nombre ?? '');
  const [apellido, setApellido] = useState(user?.apellido ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [passActual, setPassActual] = useState('');
  const [passNueva, setPassNueva] = useState('');
  const [passConfirma, setPassConfirma] = useState('');
  const [verPass, setVerPass] = useState(false);
  const [savingDatos, setSavingDatos] = useState(false);
  const [msgDatos, setMsgDatos] = useState<{ ok: boolean; texto: string } | null>(null);

  // ── Preguntas de seguridad ────────────────────────────────────────────────
  const [catalogo, setCatalogo] = useState<string[]>([]);
  const [slots, setSlots] = useState<SlotPregunta[]>(
    Array.from({ length: PREGUNTAS_REQUERIDAS }, () => ({ idx: '', respuesta: '' }))
  );
  const [yaConfiguradas, setYaConfiguradas] = useState(false);
  const [loadingPreguntas, setLoadingPreguntas] = useState(true);
  const [savingPreguntas, setSavingPreguntas] = useState(false);
  const [msgPreguntas, setMsgPreguntas] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    (async () => {
      const [rCat, rCfg] = await Promise.all([
        apiFetch<{ preguntas: string[] }>('/auth/security-questions'),
        apiFetch<{ preguntas: number[] }>('/usuarios/me/security-questions'),
      ]);
      if (rCat.success && rCat.data) setCatalogo(rCat.data.preguntas);
      if (rCfg.success && rCfg.data && rCfg.data.preguntas.length > 0) {
        setYaConfiguradas(true);
        setSlots(
          Array.from({ length: PREGUNTAS_REQUERIDAS }, (_, i) => ({
            idx: rCfg.data!.preguntas[i] ?? '',
            respuesta: '',
          }))
        );
      }
      setLoadingPreguntas(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardarDatos = async () => {
    setMsgDatos(null);
    if (!username.trim() || !nombre.trim() || !apellido.trim()) {
      setMsgDatos({ ok: false, texto: 'Usuario, nombre y apellido son obligatorios.' });
      return;
    }
    if (passNueva || passConfirma || passActual) {
      if (passNueva.length < 6) {
        setMsgDatos({ ok: false, texto: 'La nueva contraseña debe tener al menos 6 caracteres.' });
        return;
      }
      if (passNueva !== passConfirma) {
        setMsgDatos({ ok: false, texto: 'La confirmación no coincide con la nueva contraseña.' });
        return;
      }
      if (!passActual) {
        setMsgDatos({ ok: false, texto: 'Ingrese su contraseña actual para cambiarla.' });
        return;
      }
    }
    setSavingDatos(true);
    const body: Record<string, unknown> = {
      username: username.trim(),
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      email: email.trim() || null,
    };
    if (passNueva) {
      body.password_actual = passActual;
      body.password_nueva = passNueva;
    }
    const res = await apiFetch('/usuarios/me', { method: 'PUT', body: JSON.stringify(body) });
    setSavingDatos(false);
    if (res.success) {
      setPassActual('');
      setPassNueva('');
      setPassConfirma('');
      await checkAuth(); // refresca nombre/username en el contexto y el header
      setMsgDatos({ ok: true, texto: res.message || 'Datos actualizados.' });
    } else {
      setMsgDatos({ ok: false, texto: res.message || 'No se pudieron guardar los datos.' });
    }
  };

  const guardarPreguntas = async () => {
    setMsgPreguntas(null);
    // Nada configurado en absoluto: sin preguntas no hay forma de recuperar
    const todoVacio = slots.every((s) => s.idx === '' && !s.respuesta.trim());
    if (todoVacio) {
      setMsgPreguntas({
        ok: false,
        texto:
          'No tienes manera de recuperar tu contraseña. Debes elegir ' +
          `${PREGUNTAS_REQUERIDAS} preguntas y escribir sus respuestas.`,
      });
      return;
    }
    const elegidas = slots.map((s) => s.idx).filter((i): i is number => i !== '');
    const duplicadas = new Set(elegidas).size !== elegidas.length;
    if (elegidas.length !== PREGUNTAS_REQUERIDAS || duplicadas) {
      setMsgPreguntas({
        ok: false,
        texto: `Debe elegir ${PREGUNTAS_REQUERIDAS} preguntas diferentes.`,
      });
      return;
    }
    if (slots.some((s) => !s.respuesta.trim())) {
      setMsgPreguntas({ ok: false, texto: 'Debe responder las 6 preguntas elegidas.' });
      return;
    }
    setSavingPreguntas(true);
    const res = await apiFetch('/usuarios/me/security-questions', {
      method: 'PUT',
      body: JSON.stringify({
        respuestas: slots.map((s) => ({ idx: s.idx, respuesta: s.respuesta })),
      }),
    });
    setSavingPreguntas(false);
    if (res.success) {
      setYaConfiguradas(true);
      setSlots((s) => s.map((x) => ({ ...x, respuesta: '' })));
      setMsgPreguntas({ ok: true, texto: res.message || 'Preguntas guardadas.' });
    } else {
      setMsgPreguntas({ ok: false, texto: res.message || 'No se pudieron guardar.' });
    }
  };

  const inputCls =
    'w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none';
  const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5';

  const Msg = ({ m }: { m: { ok: boolean; texto: string } | null }) =>
    m ? (
      <div
        className={`p-3 rounded-xl border flex items-start gap-2 text-xs ${
          m.ok
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}
      >
        {m.ok ? (
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
        ) : (
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        )}
        <span>{m.texto}</span>
      </div>
    ) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/60 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <UserRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Mi Cuenta</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Edita tus datos, contraseña y preguntas de seguridad
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido con scroll */}
        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          {/* ── Datos personales + contraseña ── */}
          <section className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>Usuario</label>
                <input
                  className={inputCls}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>Correo electrónico</label>
                <input
                  className={inputCls}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className={labelCls}>Nombre</label>
                <input
                  className={inputCls}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Apellido</label>
                <input
                  className={inputCls}
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
              <div className="flex items-center gap-2 text-slate-300">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Cambiar contraseña <span className="text-slate-500 normal-case">(opcional)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setVerPass((v) => !v)}
                  className="ml-auto text-slate-500 hover:text-white transition-colors cursor-pointer"
                  title={verPass ? 'Ocultar' : 'Mostrar'}
                >
                  {verPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <input
                className={inputCls}
                type={verPass ? 'text' : 'password'}
                placeholder="Contraseña actual"
                value={passActual}
                onChange={(e) => setPassActual(e.target.value)}
                autoComplete="off"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  className={inputCls}
                  type={verPass ? 'text' : 'password'}
                  placeholder="Nueva contraseña"
                  value={passNueva}
                  onChange={(e) => setPassNueva(e.target.value)}
                  autoComplete="new-password"
                />
                <input
                  className={inputCls}
                  type={verPass ? 'text' : 'password'}
                  placeholder="Confirmar nueva"
                  value={passConfirma}
                  onChange={(e) => setPassConfirma(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <Msg m={msgDatos} />
            <button
              onClick={guardarDatos}
              disabled={savingDatos}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              {savingDatos ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Guardar datos
            </button>
          </section>

          {/* ── Preguntas de seguridad ── */}
          <section className="space-y-4 pt-4 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldQuestion className="w-4 h-4 text-cyan-400" />
              <div>
                <h4 className="text-sm font-bold text-white">Preguntas de seguridad</h4>
                <p className="text-[10px] text-slate-500">
                  Elige {PREGUNTAS_REQUERIDAS} preguntas y escribe sus respuestas — servirán para
                  recuperar tu contraseña si la olvidas.
                  {yaConfiguradas && (
                    <span className="text-emerald-400"> Ya tienes preguntas configuradas.</span>
                  )}
                </p>
              </div>
            </div>

            {loadingPreguntas ? (
              <div className="flex items-center justify-center py-6 text-slate-500 gap-2 text-xs">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando preguntas...
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {slots.map((slot, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_150px] gap-2">
                      <select
                        className={inputCls}
                        value={slot.idx}
                        onChange={(e) =>
                          setSlots((s) =>
                            s.map((x, j) =>
                              j === i
                                ? { ...x, idx: e.target.value === '' ? '' : Number(e.target.value) }
                                : x
                            )
                          )
                        }
                      >
                        <option value="">— Elegir pregunta {i + 1} —</option>
                        {catalogo.map((p, idx) => (
                          <option
                            key={idx}
                            value={idx}
                            disabled={slots.some((x, j) => j !== i && x.idx === idx)}
                          >
                            {p}
                          </option>
                        ))}
                      </select>
                      <input
                        className={inputCls}
                        placeholder="Respuesta"
                        value={slot.respuesta}
                        onChange={(e) =>
                          setSlots((s) =>
                            s.map((x, j) => (j === i ? { ...x, respuesta: e.target.value } : x))
                          )
                        }
                        autoComplete="off"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-600">
                  Las respuestas se guardan cifradas; al volver a abrir este panel verás las
                  preguntas elegidas pero deberás reescribir las respuestas para guardar cambios.
                </p>
                <Msg m={msgPreguntas} />
                <button
                  onClick={guardarPreguntas}
                  disabled={savingPreguntas}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-cyan-500/40 disabled:opacity-50 text-cyan-200 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  {savingPreguntas ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldQuestion className="w-4 h-4" />
                  )}
                  Guardar preguntas de seguridad
                </button>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
