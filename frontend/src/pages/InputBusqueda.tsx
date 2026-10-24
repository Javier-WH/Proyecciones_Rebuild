import React from 'react';
import { Search, X } from 'lucide-react';

// Input de búsqueda estándar: icono a la izquierda y una X para vaciar el
// campo sin tener que seleccionar y borrar el texto a mano.
// `onLimpiar` permite reaccionar al limpiar (p.ej. reabrir un dropdown).
interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'> {
  value: string;
  onChange: (valor: string) => void;
  onLimpiar?: () => void;
  className?: string;       // clases extra del contenedor (relative se agrega)
  inputClassName?: string;  // clases completas del input
  iconoClassName?: string;  // clases del icono Search
}

export const InputBusqueda = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, onLimpiar, className, inputClassName, iconoClassName, ...rest }, ref) => (
    <div className={`relative ${className ?? ''}`}>
      <Search
        className={
          iconoClassName ??
          'w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none'
        }
      />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClassName}
        {...rest}
      />
      {value !== '' && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            onLimpiar?.();
          }}
          title="Limpiar búsqueda"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-500 hover:text-white hover:bg-slate-700/60 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
);
InputBusqueda.displayName = 'InputBusqueda';
