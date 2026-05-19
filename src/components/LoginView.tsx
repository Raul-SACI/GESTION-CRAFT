import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, Lock, Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { User, UserRole } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
}

export default function LoginView({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

      if (fetchError || !data) {
        setError('Usuario no encontrado');
        setLoading(false);
        return;
      }

      // Simple password check (In a real app, use Supabase Auth or proper hashing)
      if (data.password === password) {
        onLogin({
          id: data.id,
          firstName: data.first_name,
          lastName: data.last_name,
          email: data.email,
          role: data.role as UserRole,
          branchId: data.branch_id
        });
      } else {
        setError('Contraseña incorrecta');
      }
    } catch (err) {
      setError('Error al conectar con el servidor');
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
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-bg-accent border border-border-dim rounded-xl px-12 py-3.5 text-text-main text-sm outline-none focus:border-brand-500 transition-all font-mono"
                    placeholder="••••••••"
                  />
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
