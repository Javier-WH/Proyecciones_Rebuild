import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { logoDataUri, hayLogoPersonalizado, invalidarLogoCache } from '../utils/logo.js';
import { X, Image as ImageIcon, Loader2, AlertCircle, Info, Upload, RotateCcw } from 'lucide-react';

interface LogoReportesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Lado máximo del PNG normalizado — el logo se imprime a ~1.3 cm de alto,
// con 800px sobra resolución y el archivo queda liviano.
const LADO_MAX = 800;
const MAX_BYTES = 2 * 1024 * 1024;

// Cualquier imagen (JPG/WEBP/BMP/PNG) se redibuja en un canvas y se exporta
// como PNG: el backend y exceljs siempre reciben el mismo formato, y la
// transparencia se preserva.
const archivoAPng = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * escala));
      canvas.height = Math.max(1, Math.round(img.height * escala));
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('formato'));
    };
    img.src = url;
  });

export const LogoReportesModal: React.FC<LogoReportesModalProps> = ({ isOpen, onClose }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [personalizado, setPersonalizado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [msg, setMsg] = useState<{ error: boolean; texto: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const recargar = async () => {
    const [uri, esCustom] = await Promise.all([logoDataUri(), hayLogoPersonalizado()]);
    setPreview(uri);
    setPersonalizado(esCustom);
  };

  useEffect(() => {
    if (!isOpen) return;
    setMsg(null);
    setConfirmando(false);
    setCargando(true);
    recargar().finally(() => setCargando(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const subir = async (file: File) => {
    setMsg(null);
    setTrabajando(true);
    try {
      const dataUri = await archivoAPng(file);
      // base64 infla ~33%: el tamaño real del PNG ≈ 3/4 del payload
      if (dataUri.length * 0.75 > MAX_BYTES) {
        setMsg({ error: true, texto: 'La imagen supera el máximo de 2 MB. Pruebe con un logo más liviano.' });
        return;
      }
      const r = await apiFetch('/reportes/logo', {
        method: 'PUT',
        body: JSON.stringify({ logo: dataUri }),
      });
      if (r.success) {
        invalidarLogoCache();
        await recargar();
        setMsg({ error: false, texto: 'Logo actualizado. Los próximos reportes lo usarán.' });
      } else {
        setMsg({ error: true, texto: r.message || 'No se pudo guardar el logo.' });
      }
    } catch {
      setMsg({ error: true, texto: 'No se pudo leer la imagen. Use un archivo JPG, PNG o WEBP.' });
    } finally {
      setTrabajando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const restaurar = async () => {
    setMsg(null);
    setTrabajando(true);
    const r = await apiFetch('/reportes/logo', { method: 'DELETE' });
    setTrabajando(false);
    setConfirmando(false);
    if (r.success) {
      invalidarLogoCache();
      await recargar();
      setMsg({ error: false, texto: 'Logo restaurado al predeterminado.' });
    } else {
      setMsg({ error: true, texto: r.message || 'No se pudo restaurar el logo.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="modal-head flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Logo de Reportes</h3>
              <p className="text-xs text-slate-400">Imagen institucional de impresiones y Excel.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {msg && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2 text-xs ${
                msg.error
                  ? 'bg-red-500/10 border-red-500/30 text-red-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{msg.texto}</span>
            </div>
          )}

          {cargando ? (
            <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="h-24 flex items-center justify-center">
                  {preview && (
                    <img src={preview} alt="Logo actual" className="max-h-24 max-w-full object-contain" />
                  )}
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                    personalizado
                      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {personalizado ? 'Logo personalizado' : 'Logo predeterminado'}
                </span>
              </div>

              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) subir(f);
                }}
              />
              <button
                onClick={() => inputRef.current?.click()}
                disabled={trabajando}
                className="w-full px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {trabajando ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {personalizado ? 'Cambiar logo' : 'Subir logo'}
              </button>

              {personalizado &&
                (confirmando ? (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                    <span className="text-[11px] text-amber-300 font-semibold">
                      ¿Volver al logo original de la app?
                    </span>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={restaurar}
                        disabled={trabajando}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                      >
                        Sí, restaurar
                      </button>
                      <button
                        onClick={() => setConfirmando(false)}
                        className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-[11px] font-semibold hover:bg-slate-800 cursor-pointer"
                      >
                        No
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmando(true)}
                    disabled={trabajando}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm font-semibold hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Restaurar logo predeterminado
                  </button>
                ))}

              <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[11px]">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Aplica a <strong>todos</strong> los reportes impresos y Excel (horarios y carga
                  docente). La imagen se convierte a PNG automáticamente; se recomienda fondo
                  transparente.
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-slate-800">
          <button
            onClick={onClose}
            disabled={trabajando}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm font-semibold hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
