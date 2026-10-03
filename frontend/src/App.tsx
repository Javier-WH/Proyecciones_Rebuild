import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { PnfColorProvider } from './context/PnfColorContext.js';
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { precargarCatalogoMaterias } from './pages/horarios/catalogoMaterias.js';
import { Loader2 } from 'lucide-react';

const AppRoutes: React.FC = () => {
  const { user, loading } = useAuth();

  // Precarga en segundo plano el catálogo global de materias (lo usa el picker
  // de materias preferidas del aula); el caché es en memoria y se pierde al
  // recargar la página.
  useEffect(() => {
    if (user) precargarCatalogoMaterias();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-100">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-sm font-medium text-slate-400">Cargando sistema de proyecciones...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <DashboardPage />;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <PnfColorProvider>
        <AppRoutes />
      </PnfColorProvider>
    </AuthProvider>
  );
};

export default App;
