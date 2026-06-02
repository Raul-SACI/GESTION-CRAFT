/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Key, 
  Plus, 
  Search, 
  Copy, 
  Eye, 
  EyeOff, 
  Trash2, 
  ExternalLink,
  ShieldCheck,
  Globe,
  Music,
  Mail,
  Wifi,
  ShoppingBag,
  Loader2
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';

interface Account {
  id: string;
  service: string;
  type: string;
  username: string;
  password: string;
  notes?: string;
}

const TYPE_ICONS: Record<string, any> = {
  gmail: Mail,
  spotify: Music,
  pedidosya: ShoppingBag,
  wifi: Wifi,
  other: Globe
};

export default function PasswordManagementView({ isReadOnly }: { isReadOnly?: boolean } = {}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [newAcc, setNewAcc] = useState({
    service: '',
    type: 'other',
    username: '',
    password: '',
    notes: ''
  });

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('passwords').select('*');
    if (data) {
      setAccounts(data.map(p => ({
        id: p.id,
        service: p.service,
        type: p.category,
        username: p.username,
        password: p.password,
        notes: '' // notes column wasn't in schema, but we can add it if needed or just ignore for now
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const togglePassword = (id: string) => {
    setShowPassword(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddAccount = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!newAcc.service || !newAcc.username) return;
    const { data, error } = await supabase.from('passwords').insert([{
      service: newAcc.service.toUpperCase(),
      category: newAcc.type,
      username: newAcc.username,
      password: newAcc.password
    }]).select().single();

    if (data) {
      setAccounts([...accounts, {
        id: data.id,
        service: data.service,
        type: data.category,
        username: data.username,
        password: data.password
      }]);
      setShowAddModal(false);
      setNewAcc({ service: '', type: 'other', username: '', password: '', notes: '' });
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!confirm('¿Eliminar esta cuenta?')) return;
    const { error } = await supabase.from('passwords').delete().eq('id', id);
    if (!error) {
      setAccounts(accounts.filter(a => a.id !== id));
    }
  };

  const filteredAccounts = accounts.filter(acc => 
    acc.service.toLowerCase().includes(search.toLowerCase()) ||
    acc.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h2 className="text-xl font-black uppercase text-text-main tracking-widest flex items-center gap-2">
            <Key className="text-brand-500" size={24} /> Cuentas y Contraseñas
          </h2>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 opacity-70">
            Repositorio central de accesos y credenciales operativas
          </p>
        </div>

        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-brand-500 text-black px-6 py-3 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center gap-2 shadow-xl shadow-brand-500/10"
        >
          <Plus size={14} /> Nueva Cuenta
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim" size={18} />
        <input 
          type="text"
          placeholder="BUSCAR CUENTA O SERVICIO..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-bg-sidebar border border-border-dim rounded-full pl-12 pr-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 uppercase font-bold"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {loading ? (
            <div className="col-span-full py-20 flex justify-center">
              <Loader2 className="animate-spin text-brand-500" size={32} />
            </div>
          ) : filteredAccounts.map(acc => {
            const Icon = TYPE_ICONS[acc.type] || TYPE_ICONS.other;
            return (
              <motion.div 
                key={acc.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-bg-sidebar border border-border-dim rounded-lg p-6 hover:border-brand-500/50 transition-all group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button 
                    onClick={() => handleDeleteAccount(acc.id)}
                    className="text-text-dim hover:text-red-500"
                   >
                     <Trash2 size={14} />
                   </button>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-3 bg-bg-accent rounded-lg text-brand-500">
                    <Icon size={20} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xs font-black uppercase text-text-main tracking-tight">{acc.service}</h3>
                    <p className="text-[10px] text-text-dim uppercase font-bold mt-1 opacity-60">{acc.type}</p>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-text-dim uppercase tracking-tighter">Usuario / Email</label>
                    <div className="flex items-center justify-between bg-bg-accent rounded px-3 py-2 border border-border-dim/50">
                      <span className="text-[11px] font-bold text-text-main truncate text-lowercase pr-2">{acc.username}</span>
                      <button 
                        onClick={() => copyToClipboard(acc.username, `${acc.id}-u`)}
                        className="text-text-dim hover:text-brand-500"
                      >
                        {copiedId === `${acc.id}-u` ? <ShieldCheck size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-text-dim uppercase tracking-tighter">Contraseña</label>
                    <div className="flex items-center justify-between bg-bg-accent rounded px-3 py-2 border border-border-dim/50">
                      <span className="text-[11px] font-mono font-bold text-brand-500">
                        {showPassword[acc.id] ? acc.password : '••••••••••••'}
                      </span>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => togglePassword(acc.id)}
                          className="text-text-dim hover:text-text-main"
                        >
                          {showPassword[acc.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button 
                          onClick={() => copyToClipboard(acc.password, `${acc.id}-p`)}
                          className="text-text-dim hover:text-brand-500"
                        >
                          {copiedId === `${acc.id}-p` ? <ShieldCheck size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {acc.notes && (
                  <div className="mt-4 pt-4 border-t border-border-dim/30">
                    <p className="text-[10px] text-text-dim italic leading-relaxed">
                      "{acc.notes}"
                    </p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-bg-card border border-border-dim rounded-lg shadow-2xl p-6"
            >
              <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest mb-6 border-l-2 border-brand-500 pl-4">Registrar Nueva Cuenta</h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-dim uppercase">Servicio</label>
                    <input 
                      type="text" 
                      placeholder="EJ: GMAIL, SPOTIFY..."
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 uppercase"
                      value={newAcc.service}
                      onChange={e => setNewAcc({...newAcc, service: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-dim uppercase">Categoría</label>
                    <select 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 uppercase font-black"
                      value={newAcc.type}
                      onChange={e => setNewAcc({...newAcc, type: e.target.value as any})}
                    >
                      <option value="gmail">Gmail / Email</option>
                      <option value="spotify">Spotify / Música</option>
                      <option value="pedidosya">Pedidos Ya</option>
                      <option value="wifi">Red Wi-Fi</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Nombre de Usuario / Email</label>
                  <input 
                    type="text" 
                    placeholder="USERNAME O EMAIL"
                    className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500"
                    value={newAcc.username}
                    onChange={e => setNewAcc({...newAcc, username: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Contraseña</label>
                  <input 
                    type="text" 
                    placeholder="ACCESO"
                    className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500"
                    value={newAcc.password}
                    onChange={e => setNewAcc({...newAcc, password: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Notas Adicionales</label>
                  <textarea 
                    placeholder="INFORMACIÓN EXTRA..."
                    rows={2}
                    className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500"
                    value={newAcc.notes}
                    onChange={e => setNewAcc({...newAcc, notes: e.target.value})}
                  />
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button 
                  onClick={handleAddAccount}
                  className="flex-1 bg-brand-500 text-black py-4 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10"
                >
                  Confirmar Registro
                </button>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="px-8 py-4 rounded border border-border-dim text-text-dim text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
