import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { Search, User, DoorOpen, Users, BookOpen, CornerDownLeft, Loader2 } from 'lucide-react';
import { irAHorarios } from './navBus.js';

interface Resultados {
  profesores: { id: number; cedula: string; nombre: string; pnf_nombre: string | null }[];
  aulas: { id: number; codigo: string; nombre: string; tipo: string; capacidad: number | null }[];
  secciones: {
    id: number;
    nombre: string;
    turno_nombre: string;
    pnf_nombre: string;
    trayecto_nombre: string;
    lapso: string;
  }[];
  materias: { id: number; nombre: string; pnf_nombre: string; trayecto_nombre: string }[];
}

interface Item {
  grupo: string;
  icono: React.ReactNode;
  titulo: string;
  detalle?: string;
  accion: () => void;
}

// Paleta de búsqueda global (Ctrl+K): salta a profesores, aulas y secciones
// dentro del módulo de Horarios, y materias dentro de Carga Docente.
export const BusquedaGlobal: React.FC<{
  open: boolean;
  onClose: () => void;
  irATab: (tab: 'horarios' | 'carga') => void;
}> = ({ open, onClose, irATab }) => {
  const [q, setQ] = useState('');
  const [data, setData] = useState<Resultados>({ profesores: [], aulas: [], secciones: [], materias: [] });
  const [cargando, setCargando] = useState(false);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setData({ profesores: [], aulas: [], secciones: [], materias: [] });
      setSel(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Búsqueda con debounce
  useEffect(() => {
    if (!open) return;
    const t = q.trim();
    if (t.length < 2) {
      setData({ profesores: [], aulas: [], secciones: [], materias: [] });
      return;
    }
    setCargando(true);
    const timer = window.setTimeout(async () => {
      const res = await apiFetch<Resultados>(`/buscar?q=${encodeURIComponent(t)}`);
      setCargando(false);
      if (res.success && res.data) setData(res.data);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q, open]);

  const ir = (vista: 'seccion' | 'aula' | 'profesor', id: number, lapso?: string) => {
    onClose();
    irAHorarios({ vista, id, lapso });
    irATab('horarios');
  };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const s of data.secciones) {
      out.push({
        grupo: 'Secciones',
        icono: <Users className="w-4 h-4 text-sky-300" />,
        titulo: `Sección ${s.nombre}`,
        detalle: `${s.pnf_nombre} · ${s.trayecto_nombre} · ${s.turno_nombre}`,
        accion: () => ir('seccion', s.id, s.lapso),
      });
    }
    for (const p of data.profesores) {
      out.push({
        grupo: 'Docentes',
        icono: <User className="w-4 h-4 text-indigo-300" />,
        titulo: p.nombre,
        detalle: `${p.cedula}${p.pnf_nombre ? ` · ${p.pnf_nombre}` : ''}`,
        accion: () => ir('profesor', p.id),
      });
    }
    for (const a of data.aulas) {
      out.push({
        grupo: 'Aulas',
        icono: <DoorOpen className="w-4 h-4 text-emerald-300" />,
        titulo: `${a.codigo}${a.nombre && a.nombre !== a.codigo ? ` — ${a.nombre}` : ''}`,
        detalle: `${a.tipo.replace(/_/g, ' ')}${a.capacidad ? ` · cap. ${a.capacidad}` : ''}`,
        accion: () => ir('aula', a.id),
      });
    }
    for (const m of data.materias) {
      out.push({
        grupo: 'Materias',
        icono: <BookOpen className="w-4 h-4 text-amber-300" />,
        titulo: m.nombre,
        detalle: `${m.pnf_nombre} · ${m.trayecto_nombre}`,
        accion: () => {
          onClose();
          irATab('carga');
        },
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => setSel(0), [items.length]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[sel]?.accion();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  let idx = -1;
  let grupoPrev = '';

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4 bg-slate-950/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Buscar sección, docente, aula o materia…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
          />
          {cargando && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] text-slate-500 font-mono">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-1.5">
          {q.trim().length < 2 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-600">
              Escribe al menos 2 caracteres — sección, docente, aula o materia.
            </p>
          ) : items.length === 0 && !cargando ? (
            <p className="px-4 py-6 text-center text-xs text-slate-600">Sin resultados para “{q.trim()}”.</p>
          ) : (
            items.map((it) => {
              idx++;
              const i = idx;
              const encabezado = it.grupo !== grupoPrev ? it.grupo : null;
              grupoPrev = it.grupo;
              return (
                <React.Fragment key={`${it.grupo}-${i}`}>
                  {encabezado && (
                    <p className="px-4 pt-2.5 pb-1 text-[9px] uppercase tracking-wider font-bold text-slate-600">
                      {encabezado}
                    </p>
                  )}
                  <button
                    onClick={it.accion}
                    onMouseEnter={() => setSel(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors cursor-pointer ${
                      sel === i ? 'bg-blue-600/20' : 'hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center shrink-0">
                      {it.icono}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-white truncate">{it.titulo}</span>
                      {it.detalle && <span className="block text-[10px] text-slate-500 truncate">{it.detalle}</span>}
                    </span>
                    {sel === i && <CornerDownLeft className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
