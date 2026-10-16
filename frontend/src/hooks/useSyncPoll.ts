import { useEffect, useRef } from 'react';
import { apiFetch } from '../api/client.js';

interface SyncPollOpciones {
  // Congela el chequeo (drag & drop, menú abierto, mutación en curso):
  // un refetch llegando a mitad de una interacción rompería la UI.
  // Al despausar se verifica de inmediato, así nada se pierde.
  pausado?: boolean;
  intervaloMs?: number;
}

// Poll de sincronización por "ventana activa":
//
//   - Al montar y al enfocar la ventana consulta el token de cambio del
//     servidor (GET /api/sync — una query de ~1KB).
//   - Luego repite el chequeo cada `intervaloMs`, pero SOLO mientras la
//     pestaña esté visible: una tab abandonada no genera tráfico.
//   - El refetch pesado (`onCambio`) ocurre únicamente cuando el token
//     subió — en un minuto típico sin cambios, el costo total es la
//     query del token y nada más.
//
// Todas las peticiones son `silencioso` para no disparar el indicador
// global de red con tráfico de fondo.
export function useSyncPoll(
  onCambio: () => void | Promise<void>,
  { pausado = false, intervaloMs = 60_000 }: SyncPollOpciones = {}
) {
  const ultimo = useRef<number | null>(null); // último token visto (null = sin baseline)
  const enVuelo = useRef(false);
  const onCambioRef = useRef(onCambio);
  const pausadoRef = useRef(pausado);
  onCambioRef.current = onCambio;
  pausadoRef.current = pausado;

  // Consulta el token y dispara onCambio solo si subió. Single-flight:
  // nunca hay dos verificaciones solapadas.
  const verificar = async () => {
    if (enVuelo.current || pausadoRef.current) return;
    if (document.visibilityState !== 'visible') return;
    enVuelo.current = true;
    try {
      const res = await apiFetch<{ v: number }>('/sync', { silencioso: true });
      const v = res.success ? res.data?.v : null;
      if (v == null) return;
      if (ultimo.current === null) {
        // Baseline: la página ya cargó sus datos al montar — el primer
        // token solo se guarda, no dispara refetch.
        ultimo.current = v;
      } else if (v > ultimo.current) {
        ultimo.current = v;
        await onCambioRef.current();
      }
    } finally {
      enVuelo.current = false;
    }
  };
  const verificarRef = useRef(verificar);
  verificarRef.current = verificar;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let desmontado = false;

    // setTimeout encadenado (no setInterval): si una verificación tarda
    // más que el intervalo, el siguiente tick espera a que termine —
    // nunca se solapan peticiones.
    const programar = () => {
      if (desmontado) return;
      timer = setTimeout(async () => {
        await verificarRef.current();
        programar();
      }, intervaloMs);
    };

    const alEnfocar = () => {
      verificarRef.current();
    };

    verificarRef.current(); // baseline al montar
    programar();
    window.addEventListener('focus', alEnfocar);
    document.addEventListener('visibilitychange', alEnfocar);
    return () => {
      desmontado = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', alEnfocar);
      document.removeEventListener('visibilitychange', alEnfocar);
    };
  }, [intervaloMs]);

  // Al terminar una interacción (soltar el drag, cerrar el menú) se
  // verifica de inmediato: los cambios ajenos ocurridos durante la pausa
  // aparecen sin esperar al próximo tick.
  const pausadoAntes = useRef(pausado);
  useEffect(() => {
    const estaba = pausadoAntes.current;
    pausadoAntes.current = pausado;
    if (estaba && !pausado) verificarRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pausado]);
}
