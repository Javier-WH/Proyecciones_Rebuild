import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../api/client.js';

export interface User {
  id: number;
  username: string;
  nombre: string;
  apellido: string;
  email: string | null;
  role: 'SUPER_USUARIO' | 'ADMINISTRADOR' | 'REGULAR' | 'PROFESOR';
  pnf_saga_id?: number | null;
  profesor_cedula?: string | null;
  pnf_nombre?: string | null;
  profesor_nombre?: string | null;
  invitado?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  loginProfesor: (cedula: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState<boolean>(true);

  const checkAuth = async () => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      setUser(null);
      setToken(null);
      setLoading(false);
      return;
    }

    const res = await apiFetch<{ user: User }>('/auth/me');
    if (res.success && res.data?.user) {
      setUser(res.data.user);
      setToken(storedToken);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
      setToken(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (username: string, password: string) => {
    const res = await apiFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    if (res.success && res.data) {
      const { token: newToken, user: newUser } = res.data;
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
      return { success: true, message: res.message };
    }

    return { success: false, message: res.message || 'Error al iniciar sesión' };
  };

  // Acceso de solo lectura para docentes con su cédula (sin cuenta de usuario)
  const loginProfesor = async (cedula: string) => {
    const res = await apiFetch<{ token: string; user: User }>('/auth/profesor-login', {
      method: 'POST',
      body: JSON.stringify({ cedula }),
    });

    if (res.success && res.data) {
      const { token: newToken, user: newUser } = res.data;
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
      return { success: true, message: res.message };
    }

    return { success: false, message: res.message || 'No se encontró el docente.' };
  };

  const logout = async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, loginProfesor, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};
