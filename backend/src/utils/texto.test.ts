import { describe, it, expect } from 'vitest';
import { normTxt } from './texto.js';
import { normalizarRespuesta, PREGUNTAS_SEGURIDAD, PREGUNTAS_REQUERIDAS, RECUPERAR_CANTIDAD } from '../modules/auth/securityQuestions.js';

describe('normTxt', () => {
  it('quita tildes y diacríticos', () => {
    expect(normTxt('José María')).toBe('jose maria');
    expect(normTxt('ÚÑíò')).toBe('unio');
  });
  it('minúsculas, sin extremos ni espacios dobles', () => {
    expect(normTxt('  Hola   MUNDO  ')).toBe('hola mundo');
  });
  it('tolera null/undefined/números', () => {
    expect(normTxt(null)).toBe('');
    expect(normTxt(undefined)).toBe('');
    expect(normTxt(42)).toBe('42');
  });
});

describe('normalizarRespuesta', () => {
  it('respuestas equivalentes coinciden', () => {
    expect(normalizarRespuesta('José María ')).toBe(normalizarRespuesta('jose maria'));
    expect(normalizarRespuesta('  Caracas')).toBe(normalizarRespuesta('CARACAS'));
  });
  it('respuestas distintas no coinciden', () => {
    expect(normalizarRespuesta('perro')).not.toBe(normalizarRespuesta('perros'));
  });
});

describe('PREGUNTAS_SEGURIDAD', () => {
  it('hay suficientes preguntas para configurar y recuperar', () => {
    expect(PREGUNTAS_SEGURIDAD.length).toBeGreaterThanOrEqual(PREGUNTAS_REQUERIDAS);
    expect(RECUPERAR_CANTIDAD).toBeLessThanOrEqual(PREGUNTAS_REQUERIDAS);
  });
  it('no hay preguntas duplicadas', () => {
    expect(new Set(PREGUNTAS_SEGURIDAD).size).toBe(PREGUNTAS_SEGURIDAD.length);
  });
});
