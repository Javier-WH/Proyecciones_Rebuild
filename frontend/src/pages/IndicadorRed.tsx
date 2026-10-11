import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { suscribirRed, estadoRed } from '../api/client.js';

// Indicador global de red: se suscribe al contador de peticiones en curso
// que mantiene apiFetch y muestra dos capas de feedback, con umbrales para
// no parpadear en peticiones rápidas:
//   · ~350 ms: barra indeterminada en el borde superior (latencia
//     perceptible pero la app sigue usable).
//   · ~900 ms: velo bloqueante centrado — informa que se espera al
//     servidor y evita doble-envíos durante la espera. z-[100]: por
//     encima de todos los modales (z-50/z-60).
// Las llamadas con `silencioso:true` (prefetch, búsqueda por tecla) no
// disparan nada de esto.
const MS_BARRA = 350;
const MS_VELO = 900;

export const IndicadorRed: React.FC = () => {
  const [{ pendientes, etiqueta }, setEstado] = useState(estadoRed);
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
  }, [pendientes > 0]); // los umbrales dependen solo de "hay algo pendiente"

  return (
    <>
      {verBarra && (
        <div className="fixed top-0 left-0 right-0 h-0.5 z-[100] overflow-hidden pointer-events-none">
          <div className="h-full w-1/3 bg-sky-400 rounded-full animar-carga-indeterminada" />
        </div>
      )}
      {verVelo && (
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
    </>
  );
};
