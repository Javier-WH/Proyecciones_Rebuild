import React, { useState } from 'react';
import { X, AlertTriangle, Loader2, ChevronsRight } from 'lucide-react';

// Diálogo de confirmación reutilizable. `slideToConfirm` exige arrastrar un
// deslizador completamente a la derecha antes de habilitar el botón de acción
// (para operaciones destructivas irreversibles).
export const ConfirmModal: React.FC<{
  titulo: string;
  mensaje?: string;
  lineas?: string[]; // viñetas opcionales bajo el mensaje
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // tono rojo para acciones destructivas
  slideToConfirm?: boolean;
  busy?: boolean;
  icono?: React.ReactNode;
  error?: string | null; // error del intento anterior (se muestra en el modal)
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  titulo,
  mensaje,
  lineas,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger,
  slideToConfirm,
  busy,
  icono,
  error,
  onConfirm,
  onCancel,
}) => {
  const [slide, setSlide] = useState(0);
  const listo = !slideToConfirm || slide >= 100;

  const soltarSlide = () => {
    if (slide < 100) setSlide(0);
  };

  const tono = danger
    ? 'bg-red-600 hover:bg-red-500 shadow-red-600/30'
    : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div
        className={`bg-slate-900 border rounded-3xl w-full max-w-md shadow-2xl overflow-hidden ${
          danger ? 'border-red-500/30' : 'border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-950">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            {icono}
            {titulo}
          </h3>
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          {mensaje && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2 leading-snug ${
                danger
                  ? 'bg-red-500/10 border-red-500/30 text-red-300'
                  : 'bg-slate-800/60 border-slate-700 text-slate-300'
              }`}
            >
              <AlertTriangle
                className={`w-4 h-4 shrink-0 mt-0.5 ${danger ? 'text-red-400' : 'text-slate-400'}`}
              />
              <span>{mensaje}</span>
            </div>
          )}

          {lineas && lineas.length > 0 && (
            <ul className="space-y-1.5 text-slate-300 pl-1">
              {lineas.map((l, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[5px] ${
                      danger ? 'bg-red-400' : 'bg-slate-500'
                    }`}
                  />
                  <span className="min-w-0 leading-snug">{l}</span>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {slideToConfirm && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-slate-300 uppercase tracking-wider">
                  Desliza para confirmar
                </span>
                <ChevronsRight
                  className={`w-4 h-4 transition-colors ${
                    slide >= 100 ? 'text-red-400' : 'text-slate-600'
                  }`}
                />
              </div>
              <div className="relative">
                <div className="absolute inset-0 rounded-xl bg-slate-950 border border-slate-700/80 overflow-hidden">
                  <div
                    className="h-full bg-red-500/25 transition-[width] duration-75"
                    style={{ width: `${slide}%` }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={slide}
                  disabled={busy}
                  onChange={(e) => setSlide(Number(e.target.value))}
                  onMouseUp={soltarSlide}
                  onTouchEnd={soltarSlide}
                  onPointerUp={soltarSlide}
                  className="relative w-full h-10 appearance-none bg-transparent cursor-pointer accent-red-500"
                  aria-label="Desliza completamente a la derecha para habilitar la acción"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">
                {slide >= 100
                  ? 'Confirmado — ya puedes continuar.'
                  : 'Arrastra el control completamente hacia la derecha.'}
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="px-4 py-2.5 border border-slate-700 text-slate-300 rounded-xl hover:bg-slate-800 font-semibold cursor-pointer"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!listo || busy}
              className={`px-5 py-2.5 ${tono} disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl font-semibold shadow-lg flex items-center gap-2 disabled:shadow-none cursor-pointer`}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{confirmLabel}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
