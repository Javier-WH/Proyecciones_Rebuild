import React, { createContext, useContext, useEffect, useState } from 'react';

// Tema de la interfaz: 'dark' (por defecto) o 'light' (pastel azul/beige).
// Se aplica como atributo data-theme en <html>: la paleta completa se
// redefine en index.css con variables --color-* de Tailwind v4.
type Tema = 'dark' | 'light';

const CLAVE = 'tema-ui';

const ThemeContext = createContext<{ tema: Tema; toggleTema: () => void }>({
  tema: 'dark',
  toggleTema: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tema, setTema] = useState<Tema>(() => {
    const guardado = localStorage.getItem(CLAVE);
    return guardado === 'light' || guardado === 'dark' ? guardado : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = tema;
    localStorage.setItem(CLAVE, tema);
  }, [tema]);

  return (
    <ThemeContext.Provider
      value={{ tema, toggleTema: () => setTema((t) => (t === 'dark' ? 'light' : 'dark')) }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTema = () => useContext(ThemeContext);
