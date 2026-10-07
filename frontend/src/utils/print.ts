// Imprime un documento HTML completo desde un iframe oculto, sin abrir una
// pestaña nueva del navegador (window.open deja la pestaña abierta tras la
// impresión). El iframe se elimina al terminar — o al minuto como respaldo
// si el navegador no dispara afterprint.
export function imprimirHtml(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  if (!win) {
    document.body.removeChild(iframe);
    return;
  }

  const doc = win.document;
  doc.open();
  doc.write(html);
  doc.close();

  const limpiar = () => {
    if (iframe.parentNode) document.body.removeChild(iframe);
  };
  win.onafterprint = limpiar;

  // Pequeña espera para que el documento termine de renderizarse antes de
  // mostrar el diálogo de impresión.
  setTimeout(() => {
    win.focus();
    win.print();
    // Respaldo: algunos navegadores no disparan onafterprint en iframes.
    setTimeout(limpiar, 60_000);
  }, 250);
}
