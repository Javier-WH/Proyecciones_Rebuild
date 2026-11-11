import React from 'react';
import { UserRound } from 'lucide-react';
import logoSistema from '../images/Gemini_back_transparent.png';

interface ProfesorAvatarProps {
  fotoUrl?: string | null;
  sexo?: string | null;
  nombres?: string;
  apellidos?: string;
  size?: 'sm' | 'md' | 'lg';
  esPlaceholder?: boolean;
}

// Placeholder según sexo: Femenino -> rosa, Masculino -> índigo, otro -> slate
export const ProfesorAvatar: React.FC<ProfesorAvatarProps> = ({ fotoUrl, sexo, nombres, apellidos, size = 'md', esPlaceholder }) => {
  const sizeClass = size === 'lg' ? 'w-16 h-16 text-lg' : size === 'sm' ? 'w-8 h-8 text-[10px]' : 'w-11 h-11 text-sm';
  const iconSize = size === 'lg' ? 'w-8 h-8' : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

  // Profesor sustituto (placeholder): siempre el logo del sistema, aunque
  // el registro tenga foto cargada.
  if (esPlaceholder) {
    return (
      <div
        className={`${sizeClass} bg-amber-500/15 border-amber-500/30 rounded-full border flex items-center justify-center shrink-0 select-none overflow-hidden`}
        title="Profesor sustituto (placeholder)"
      >
        <img
          src={logoSistema}
          alt="Logo del sistema — profesor sustituto"
          className="w-full h-full object-contain p-1"
        />
      </div>
    );
  }

  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt="Foto del profesor"
        className={`${sizeClass} rounded-full object-cover border border-slate-700 shrink-0`}
      />
    );
  }

  const inicialN = (nombres || '').trim().charAt(0).toUpperCase();
  const inicialA = (apellidos || '').trim().charAt(0).toUpperCase();
  const esFemenino = (sexo || '').toUpperCase().startsWith('F');
  const esMasculino = (sexo || '').toUpperCase().startsWith('M');

  const colorClass = esFemenino
    ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
    : esMasculino
      ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
      : 'bg-slate-700/40 border-slate-600/40 text-slate-400';

  return (
    <div
      className={`${sizeClass} ${colorClass} rounded-full border flex items-center justify-center font-bold shrink-0 select-none`}
      title={esFemenino ? 'Femenino' : esMasculino ? 'Masculino' : 'Sexo no especificado'}
    >
      {inicialN || inicialA ? (
        <span>
          {inicialN}
          {inicialA}
        </span>
      ) : (
        <UserRound className={iconSize} />
      )}
    </div>
  );
};
