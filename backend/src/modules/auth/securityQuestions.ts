// Catálogo fijo de preguntas de seguridad para la recuperación de contraseña.
// El usuario elige PREGUNTAS_REQUERIDAS de esta lista y guarda sus respuestas;
// en la recuperación se le muestran RECUPERAR_CANTIDAD al azar y debe
// responderlas correctamente para restablecer su contraseña.
export const PREGUNTAS_SEGURIDAD: string[] = [
  '¿Cuál es el nombre de tu primera mascota?',
  '¿En qué ciudad naciste?',
  '¿Cuál es el segundo nombre de tu madre?',
  '¿Cuál es el segundo nombre de tu padre?',
  '¿Cuál fue el nombre de tu escuela primaria?',
  '¿Cuál es tu comida favorita?',
  '¿Cuál era el apodo que tenías de niño?',
  '¿Cuál es el nombre de tu mejor amigo de la infancia?',
  '¿En qué calle vivías cuando tenías 10 años?',
  '¿Cuál es tu película favorita?',
  '¿Cuál fue la marca de tu primer carro?',
  '¿Cuál es tu libro favorito?',
  '¿Cuál es el nombre de tu abuela materna?',
  '¿Cuál es tu equipo deportivo favorito?',
  '¿Cuál fue tu primer trabajo?',
  '¿Cuál es tu color favorito?',
  '¿Qué personaje histórico admiras más?',
  '¿Cuál es el nombre de tu padrino o madrina?',
  '¿Cuál es tu lugar favorito para vacacionar?',
  '¿Cuál era la profesión que soñabas tener de niño?',
];

export const PREGUNTAS_REQUERIDAS = 6; // cuántas configura el usuario
export const RECUPERAR_CANTIDAD = 2; // cuántas se le preguntan al recuperar

// Normaliza la respuesta antes de compararla: sin tildes, minúsculas, sin
// espacios duplicados ni extremos — "José María " ≡ "jose maria".
export const normalizarRespuesta = (s: string): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
