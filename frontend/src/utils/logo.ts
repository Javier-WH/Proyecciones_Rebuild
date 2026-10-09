import logoUrl from '../images/UPTLL_logo_transparent.png';

let cache: Promise<string> | null = null;

// Logo institucional como data URI. Lo usan los reportes Excel (exceljs
// addImage) y el HTML de impresión — el iframe de impresión podría no
// cargar una URL a tiempo antes de abrir el diálogo, así que la imagen
// viaja embebida en el documento.
export const logoDataUri = (): Promise<string> => {
  if (!cache) {
    cache = fetch(logoUrl)
      .then((r) => r.blob())
      .then(
        (b) =>
          new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result));
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(b);
          })
      );
  }
  return cache;
};

// exceljs pide el base64 "crudo", sin el prefijo data:image/png;base64,
export const logoBase64 = async (): Promise<string> => (await logoDataUri()).split(',')[1];
