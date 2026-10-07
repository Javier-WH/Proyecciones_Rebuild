import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Lock, User, Eye, EyeOff, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import logoProyecciones from '../images/Gemini_back_transparent.png';
import logoUptll from '../images/UPTLL_logo_transparent_outlined.png';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!username.trim() || !password.trim()) {
      setErrorMessage('Por favor ingrese su usuario y contraseña.');
      return;
    }

    setLoading(true);
    try {
      const res = await login(username.trim(), password);
      if (!res.success) {
        setErrorMessage(res.message || 'Credenciales inválidas. Verifique sus datos.');
      }
    } catch (err) {
      setErrorMessage('Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-slate-950 text-slate-100 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-[30rem] h-[30rem] bg-indigo-600/15 rounded-full blur-3xl pointer-events-none"></div>

      {/* Top University Branding Bar */}
      <header className="w-full border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={logoUptll}
              alt="Logo UPTLL"
              className="h-11 w-auto object-contain"
            />
            <div>
              <h1 className="font-bold text-base tracking-tight text-white">UPTLL "Juana Ramírez"</h1>
              <p className="text-xs text-blue-400 font-medium">Universidad Politécnica Territorial de los Llanos</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 bg-slate-800/60 border border-slate-700/50 px-3 py-1.5 rounded-full text-xs font-medium text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Sistema Seguro de Proyecciones Académicas</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8 z-10 my-6">
        <div className="w-full max-w-md">
          {/* Logo delineado que sobresale de la tarjeta */}
          <div className="relative z-10 flex justify-center -mb-16">
            <img
              src={logoProyecciones}
              alt="Logo Proyecciones UPTLL"
              className="h-[230px] w-auto object-contain"
            />
          </div>
          {/* Card Container */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-2xl px-6 sm:px-8 pb-6 sm:pb-8 pt-24 backdrop-blur-xl">
            {/* Login Card Header */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white tracking-tight">Iniciar Sesión</h2>
              <p className="text-sm text-slate-400 mt-1">
                Ingrese sus credenciales universitarias para acceder
              </p>
            </div>

            {/* Alert Message */}
            {errorMessage && (
              <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-300 text-sm">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Username Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Usuario o Cédula
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ej. admin o V-12345678"
                    className="w-full pl-11 pr-4 py-3 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-11 pr-11 py-3 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all duration-200 flex items-center justify-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Verificando credenciales...</span>
                  </>
                ) : (
                  <span>Acceder al Sistema</span>
                )}
              </button>
            </form>


          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-900 bg-slate-950/80 py-4 px-6 text-center text-xs text-slate-400 z-10">
        <p>
          © {new Date().getFullYear()} Universidad Politécnica Territorial de los Llanos "Juana Ramírez" — Todos los derechos reservados.
        </p>
      </footer>
    </div>
  );
};
