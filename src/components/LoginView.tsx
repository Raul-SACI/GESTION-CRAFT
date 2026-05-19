import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, Lock, Loader2, ShieldCheck, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { User, UserRole } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
}

export default function LoginView({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupabaseConfigured = !supabase.storage.from('test').getPublicUrl('test').data.publicUrl.includes('placeholder');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setError('Configuración de Supabase faltante. Configure VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedPassword = password.trim();

      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', trimmedEmail)
        .maybeSingle(); // Better for checking existance without throwing error

      if (fetchError) {
        console.error('Supabase fetch error:', fetchError);
        setError(`Error de Base de Datos: ${fetchError.message} (${fetchError.code})`);
        setLoading(false);
        return;
      }

      if (!data) {
        console.warn('User not found in profiles table for email:', trimmedEmail);
        // Fallback for first-time setup if email matches admin default and no data found
        if (trimmedEmail === 'admin@craft.com' && trimmedPassword === 'admin123') {
          console.info('Using local admin fallback');
          onLogin({
            id: 'admin-fallback',
            firstName: 'ADMIN',
            lastName: 'INICIAL',
            email: 'admin@craft.com',
            role: 'dueño'
          });
          return;
        }
        setError(`Usuario "${trimmedEmail}" no encontrado. Verifique que la tabla "profiles" tenga registros.`);
        setLoading(false);
        return;
      }

      // Simple password check (In a real app, use Supabase Auth or proper hashing)
      if (data.password === trimmedPassword) {
        onLogin({
          id: data.id,
          firstName: data.first_name,
          lastName: data.last_name,
          email: data.email,
          role: data.role as UserRole,
          branchId: data.branch_id
        });
      } else {
        // Log to console for debugging if helpful
        console.warn('Password mismatch or login error');
        setError('Acceso denegado. Verifique email y contraseña.');
      }
    } catch (err: any) {
      setError('Error al conectar con el servidor: ' + (err.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-main flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <div className="bg-bg-sidebar border border-border-dim rounded-2xl shadow-2xl p-8 space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-black text-brand-500 tracking-tighter italic">CRAFT<span className="text-text-main">.</span></h1>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-text-dim">Panel de Gestión Integral</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-dim uppercase tracking-widest pl-1">Email / Usuario</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim" size={18} />
                  <input 
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-bg-accent border border-border-dim rounded-xl px-12 py-3.5 text-text-main text-sm outline-none focus:border-brand-500 transition-all font-bold"
                    placeholder="ejemplo@craft.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-dim uppercase tracking-widest pl-1">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim" size={18} />
                  <input 
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-bg-accent border border-border-dim rounded-xl px-12 py-3.5 text-text-main text-sm outline-none focus:border-brand-500 transition-all font-mono"
                    placeholder="••••••••"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-3 text-red-500 text-xs font-bold uppercase tracking-tight"
              >
                <AlertCircle size={14} />
                {error}
              </motion.div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-black py-4 rounded-xl text-xs font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-brand-500/20 mt-4 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : (
                <>
                  <ShieldCheck size={18} /> INGRESAR AL SISTEMA
                </>
              )}
            </button>
          </form>

          <div className="pt-6 border-t border-border-dim flex justify-between items-center text-[9px] text-text-dim font-bold uppercase tracking-wider opacity-50">
             <span>v2.4.0 • Enterprise Edition</span>
             <span>CRAFT SOLUTIONS © 2024</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
