import React, { useState } from 'react';
import { apiFetch } from '../api/client.js';
import {
  X,
  KeyRound,
  User,
  ShieldQuestion,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';

interface Pregunta {
  idx: number;
  texto: string;
}

// Flujo "Olvidé mi contraseña" en 2 pasos:
//  1. ingresa su usuario → el servidor sortea 2 de sus preguntas configuradas
//  2. responde ambas + elige contraseña nueva → se restablece
export const RecuperarPasswordModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [username, setUsername] = useState('');
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [respuestas, setRespuestas] = useState<string[]>(['', '']);
  const [passNueva, setPassNueva] = useState('');
  const [passConfirma, setPassConfirma] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const inputCls =
    'w-full pl-11 pr-4 py-3 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm';
  const inputSimple =
    'w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm';
  const labelCls = 'block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2';

  const pedirPreguntas = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!username.trim()) {
      setMsg({ ok: false, texto: 'Ingrese su nombre de usuario.' });
      return;
    }
    setLoading(true);
    const res = await apiFetch<{ preguntas: Pregunta[] }>(
      `/auth/recovery-questions?username=${encodeURIComponent(username.trim())}`
    );
    setLoading(false);
    if (res.success && res.data) {
      setPreguntas(res.data.preguntas);
      setRespuestas(res.data.preguntas.map(() => ''));
      setPaso(2);
    } else {
      setMsg({ ok: false, texto: res.message || 'No se pudieron obtener las preguntas.' });
    }
  };

  const recuperar = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (respuestas.some((r) => !r.trim())) {
      setMsg({ ok: false, texto: 'Responda todas las preguntas.' });
      return;
    }
    if (passNueva.length < 6) {
      setMsg({ ok: false, texto: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }
    if (passNueva !== passConfirma) {
      setMsg({ ok: false, texto: 'La confirmación no coincide con la nueva contraseña.' });
      return;
    }
    setLoading(true);
    const res = await apiFetch('/auth/recover-password', {
      method: 'POST',
      body: JSON.stringify({
        username: username.trim(),
        respuestas: preguntas.map((p, i) => ({ idx: p.idx, respuesta: respuestas[i] })),
        password: passNueva,
      }),
    });
    setLoading(false);
    if (res.success) {
      setMsg({ ok: true, texto: res.message || 'Contraseña actualizada.' });
      window.setTimeout(onClose, 2200);
    } else {
      setMsg({ ok: false, texto: res.message || 'No se pudo restablecer la contraseña.' });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/60 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
              {paso === 1 ? <KeyRound className="w-5 h-5" /> : <ShieldQuestion className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Recuperar contraseña</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {paso === 1
                  ? 'Ingrese su usuario para obtener sus preguntas'
                  : 'Responda sus preguntas de seguridad'}
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

        {msg && (
          <div
            className={`mb-4 p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
              msg.ok
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            {msg.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{msg.texto}</span>
          </div>
        )}

        {paso === 1 ? (
          <form onSubmit={pedirPreguntas} className="space-y-4">
            <div>
              <label className={labelCls}>Usuario</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  autoFocus
                  required
                  autoComplete="off"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ingrese su usuario"
                  className={inputCls}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-all text-sm cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> <span>Buscando cuenta...</span>
                </>
              ) : (
                <span>Continuar</span>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={recuperar} className="space-y-4">
            <button
              type="button"
              onClick={() => {
                setPaso(1);
                setMsg(null);
              }}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Cambiar usuario ({username})
            </button>

            {preguntas.map((p, i) => (
              <div key={p.idx}>
                <label className="block text-xs font-semibold text-cyan-300 mb-1.5">
                  {i + 1}. {p.texto}
                </label>
                <input
                  type="text"
                  required
                  autoFocus={i === 0}
                  autoComplete="off"
                  value={respuestas[i]}
                  onChange={(e) =>
                    setRespuestas((r) => r.map((x, j) => (j === i ? e.target.value : x)))
                  }
                  placeholder="Su respuesta"
                  className={inputSimple}
                />
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className={labelCls}>Nueva contraseña</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={passNueva}
                  onChange={(e) => setPassNueva(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className={inputSimple}
                />
              </div>
              <div>
                <label className={labelCls}>Confirmar</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={passConfirma}
                  onChange={(e) => setPassConfirma(e.target.value)}
                  placeholder="Repita la contraseña"
                  className={inputSimple}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-all text-sm cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> <span>Verificando...</span>
                </>
              ) : (
                <span>Restablecer contraseña</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
