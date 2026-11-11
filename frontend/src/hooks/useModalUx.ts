import { useEffect, useRef } from 'react';

// Pila de modales abiertos a nivel módulo: solo el tope responde a
// Escape/Enter, así los modales anidados (p.ej. ConfirmModal dentro de otro
// modal) no cierran el de abajo. `bodyLocks` mantiene el scroll del body
// bloqueado mientras haya al menos un modal abierto.
const modalStack: symbol[] = [];
let bodyLocks = 0;

/**
 * UX estándar de modal: bloquea el scroll del body mientras el modal esté
 * montado y despacha Escape/Enter solo al modal que está en el tope de la
 * pila.
 *
 * - `onEscape` / `onEnter`: omitir (o pasar `undefined` mientras `busy`) para
 *   ignorar la tecla; el modal sigue ocupando el tope, así que el de abajo
 *   tampoco la recibe.
 * - `enabled` (default true): para diálogos renderizados dentro de
 *   componentes siempre montados — `enabled={!!abierto}` los saca de la pila
 *   cuando no están visibles.
 */
export function useModalUx(opts: {
  onEscape?: () => void;
  onEnter?: () => void;
  enabled?: boolean;
}) {
  const ref = useRef(opts);
  ref.current = opts;
  const enabled = opts.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    const id = Symbol('modal');
    modalStack.push(id);
    bodyLocks++;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== id) return;
      if (e.key === 'Escape') ref.current.onEscape?.();
      else if (e.key === 'Enter') ref.current.onEnter?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = modalStack.indexOf(id);
      if (i >= 0) modalStack.splice(i, 1);
      if (--bodyLocks <= 0) {
        bodyLocks = 0;
        document.body.style.overflow = '';
      }
    };
  }, [enabled]);
}
