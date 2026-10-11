import React, { useEffect, useState } from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { suscribirRed, estadoRed, descartarAvisoRed } from '../api/client.js';

// Indicador global de red: se suscribe al estado que mantiene apiFetch y
// muestra tres capas de feedback, con umbrales para no parpadear en
// peticiones rápidas:
//   · ~350 ms: barra indeterminada en el borde superior (latencia
//     perceptible pero la app sigue usable).
//   · ~900 ms: velo bloqueante centrado — informa que se espera al
//     servidor y evita doble-envíos durante la espera.
//   · sin respuesta / sin conexión: banner grande que sustituye a las dos
//     capas anteriores. Por timeout (45 s en apiFetch), por fallo de red
//     o porque el navegador reporta 'offline'. Persiste hasta descartarlo
//     (o hasta que vuelva la conexión).
// z-[100]/z-[110]: por encima de todos los modales (z-50/z-60).
// Las llamadas con `silencioso:true` (prefetch, búsqueda por tecla) no
// disparan nada de esto.
const MS_BARRA = 350;
const MS_VELO = 900;

export const IndicadorRed: React.FC = () => {
  const [{ pendientes, etiqueta, sinRespuesta, enLinea }, setEstado] =
    useState(estadoRed);
  const [verBarra, setVerBarra] = useState(false);
  const [verVelo, setVerVelo] = useState(false);

  useEffect(() => suscribirRed(() => setEstado(estadoRed())), []);

  useEffect(() => {
    if (pendientes === 0) {
      setVerBarra(false);
      setVerVelo(false);
      return;
    }
    const tBarra = setTimeout(() => setVerBarra(true), MS_BARRA);
    const tVelo = setTimeout(() => setVerVelo(true), MS_VELO);
    return () => {
      clearTimeout(tBarra);
      clearTimeout(tVelo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendientes > 0]); // los umbrales dependen solo de "hay algo pendiente"

  const mostrarSinRespuesta = sinRespuesta || !enLinea;

  return (
    <>
      {verBarra && !mostrarSinRespuesta && (
        <div className="fixed top-0 left-0 right-0 h-0.5 z-[100] overflow-hidden pointer-events-none">
          <div className="h-full w-1/3 bg-sky-400 rounded-full animar-carga-indeterminada" />
        </div>
      )}
      {verVelo && !mostrarSinRespuesta && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 px-8 py-6 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl">
            <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
            <p className="text-sm font-semibold text-slate-200">
              {etiqueta ?? 'Esperando respuesta del servidor…'}
            </p>
            <p className="text-[11px] text-slate-500">
              La conexión está lenta, por favor espere.
            </p>
          </div>
        </div>
      )}
      {mostrarSinRespuesta && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
          <div className="flex flex-col items-center gap-4 w-full max-w-md text-center px-8 py-8 rounded-2xl bg-slate-900/95 border border-red-500/40 shadow-2xl">
            <WifiOff className="w-12 h-12 text-red-400" />
            <p className="text-lg font-bold text-slate-100">
              {enLinea ? 'El servidor no responde' : 'Sin conexión a la red'}
            </p>
            <p className="text-sm text-slate-400 leading-relaxed">
              {enLinea
                ? 'La última operación no obtuvo respuesta del servidor. La red puede estar congestionada o el servidor ocupado — inténtelo de nuevo en unos segundos.'
                : 'Este equipo perdió la conexión con la red. Revise el cable o el Wi-Fi; el aviso desaparecerá solo cuando vuelva la conexión.'}
            </p>
            {enLinea ? (
              <button
                onClick={descartarAvisoRed}
                className="mt-1 px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-semibold text-white transition-colors"
              >
                Entendido
              </button>
            ) : (
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                Esperando a que vuelva la conexión…
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
};
