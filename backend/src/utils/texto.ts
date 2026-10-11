// Normalización de texto compartida para comparaciones: sin tildes (NFD +
// rango de marcas combinantes U+0300–U+036F), minúsculas, sin espacios
// extremos ni dobles. "José María " ≡ "jose maria".
export const normTxt = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
