import logoUrl from '../images/UPTLL_logo_transparent.png';

// Logo institucional como data URI. Lo usan los reportes Excel (exceljs
// addImage) y el HTML de impresión — el iframe de impresión podría no
// cargar una URL a tiempo antes de abrir el diálogo, así que la imagen
// viaja embebida en el documento.
//
// Si un gestor subió un logo personalizado (PUT /api/reportes/logo →
// backend/public/logo-reportes.png, servido en /public/...) se usa ese;
// si el archivo no existe (404) cae al logo empaquetado en el bundle.
const LOGO_CUSTOM_URL = '/public/logo-reportes.png';

let cacheDefault: Promise<string> | null = null;
let cacheCustom: Promise<string | null> | null = null;

const blobADataUri = (b: Blob): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(b);
  });

export const logoDataUri = (): Promise<string> => {
  if (!cacheCustom) {
    cacheCustom = fetch(LOGO_CUSTOM_URL)
      .then((r) => (r.ok ? r.blob().then(blobADataUri) : null))
      .catch(() => null);
  }
  return cacheCustom.then((custom) => {
    if (custom) return custom;
    if (!cacheDefault) {
      cacheDefault = fetch(logoUrl)
        .then((r) => r.blob())
        .then(blobADataUri);
    }
    return cacheDefault;
  });
};

// Tras subir o restaurar el logo, descarta la copia en memoria para que el
// próximo reporte tome la imagen nueva.
export const invalidarLogoCache = (): void => {
  cacheCustom = null;
};

// ¿Hay un logo personalizado en el servidor? (existe el archivo public)
export const hayLogoPersonalizado = async (): Promise<boolean> => {
  try {
    const r = await fetch(LOGO_CUSTOM_URL, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
};

// exceljs pide el base64 "crudo", sin el prefijo data:image/png;base64,
export const logoBase64 = async (): Promise<string> => (await logoDataUri()).split(',')[1];
