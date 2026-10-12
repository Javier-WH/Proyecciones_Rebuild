import fs from 'fs';
import path from 'path';
import { Writable } from 'stream';

// Logger de errores persistente: además del stdout de pino (que PM2 captura
// en ~/.pm2/logs), los logs de nivel error+ se agregan a un archivo de texto
// por día en backend/logs/YYYY-MM-DD.log — orden alfabético = cronológico.
// El cwd del proceso es backend/ tanto en dev (npm --prefix) como en PM2
// (cwd: './backend' del ecosystem.config.js).
const DIR_LOGS = path.resolve(process.cwd(), 'logs');
const DIAS_RETENCION = 30;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function fmtFecha(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function archivoDelDia(): string {
  return path.join(DIR_LOGS, `${fmtFecha(new Date()).slice(0, 10)}.log`);
}

// Convierte una línea JSON de pino en un bloque legible para el archivo.
function formatear(obj: {
  level?: number;
  time?: number;
  msg?: string;
  reqId?: string;
  req?: { method?: string; url?: string };
  err?: { type?: string; message?: string; stack?: string };
}): string {
  const fecha = fmtFecha(new Date(obj.time ?? Date.now()));
  const nivel = (obj.level ?? 50) >= 60 ? 'FATAL' : 'ERROR';
  const encabezado =
    `═══ [${fecha}] ${nivel}` +
    (obj.req ? ` ${obj.req.method ?? ''} ${obj.req.url ?? ''}` : '') +
    (obj.reqId ? ` (reqId: ${obj.reqId})` : '') +
    ' ═══';
  const cuerpo: string[] = [];
  if (obj.msg) cuerpo.push(String(obj.msg));
  if (obj.err) {
    cuerpo.push(`${obj.err.type ?? 'Error'}: ${obj.err.message ?? ''}`);
    if (obj.err.stack) cuerpo.push(String(obj.err.stack));
  }
  return `${encabezado}\n${cuerpo.join('\n')}\n\n`;
}

// Append seguro: un fallo de disco nunca debe tumbar la app (stdout/PM2
// sigue teniendo el log).
export function escribirErrorEnArchivo(bloque: string): void {
  try {
    fs.mkdirSync(DIR_LOGS, { recursive: true });
    fs.appendFileSync(archivoDelDia(), bloque);
  } catch {
    /* best-effort */
  }
}

// Borra los .log con más de DIAS_RETENCION días. Se llama una vez al arrancar.
export function limpiarLogsViejos(): void {
  try {
    if (!fs.existsSync(DIR_LOGS)) return;
    const limite = Date.now() - DIAS_RETENCION * 24 * 3600 * 1000;
    for (const f of fs.readdirSync(DIR_LOGS)) {
      if (!f.endsWith('.log')) continue;
      const ruta = path.join(DIR_LOGS, f);
      if (fs.statSync(ruta).mtimeMs < limite) fs.unlinkSync(ruta);
    }
  } catch {
    /* best-effort */
  }
}

// Excepciones fuera del ciclo request/response (crash, rejection de promesa).
export function registrarExcepcion(tipo: string, error: unknown): void {
  const e = error instanceof Error ? error : new Error(String(error));
  escribirErrorEnArchivo(
    `═══ [${fmtFecha(new Date())}] ${tipo} ═══\n${e.message}\n${e.stack ?? ''}\n\n`
  );
}

// Stream para el logger de Fastify: duplica cada línea a stdout (PM2 sigue
// igual) y, si el nivel pino es error/fatal (>=50), la persiste formateada
// en el archivo del día. Captura todos los request.log.error ya existentes
// sin tocar los controllers.
export function streamLogErrores(): Writable {
  return new Writable({
    write(chunk, _enc, cb) {
      process.stdout.write(chunk);
      try {
        const obj = JSON.parse(chunk.toString());
        if (obj.level >= 50) escribirErrorEnArchivo(formatear(obj));
      } catch {
        // Línea no-JSON: va solo a stdout.
      }
      cb();
    },
  });
}
