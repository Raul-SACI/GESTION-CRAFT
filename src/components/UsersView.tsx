/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  UserPlus, 
  Mail, 
  Shield, 
  MapPin,
  MoreVertical,
  Trash2,
  Edit2
} from 'lucide-react';
import { User, UserRole, Branch } from '../types';
import { cn } from '../lib/utils';

const ROLES: UserRole[] = ['encargado', 'supervisor', 'administrativo', 'dueño'];

export default function UsersView({ selectedBranchId, branches }: { selectedBranchId: string, branches: Branch[] }) {
  const activeBranch = branches.find(b => b.id === selectedBranchId);
  const [users, setUsers] = useState<User[]>([
    { id: '1', name: 'Admin Principal', role: 'dueño', branch: 'Todas' },
    { id: '2', name: 'Carlos Herrera', role: 'encargado', branch: 'Barrio Norte' },
    { id: '3', name: 'Lucia Gimenez', role: 'administrativo', branch: 'Sede Central' }
  ]);

  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    role: 'encargado',
    branch: ''
  });

  const handleAddUser = () => {
    if (!formData.name) return;
    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: formData.name,
      role: formData.role as UserRole,
      branch: formData.branch
    };
    setUsers([...users, newUser]);
    setIsAdding(false);
    setFormData({ name: '', role: 'encargado', branch: '' });
  };

  const deleteUser = (id: string) => {
    setUsers(users.filter(u => u.id !== id));
  };

  const filteredUsers = useMemo(() => {
    if (selectedBranchId === 'all') return users;
    return users.filter(u => u.branch === activeBranch?.name || u.role === 'dueño');
  }, [users, selectedBranchId, activeBranch]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-bg-sidebar p-6 rounded border border-border-dim">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/10 p-2 text-brand-500 border border-brand-500/20 rounded">
            <Users size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main uppercase tracking-tight">
              Usuarios {activeBranch ? `• ${activeBranch.name}` : '(TODOS)'}
            </h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">Administración de accesos y roles</p>
          </div>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-brand-500 hover:bg-brand-600 text-black px-6 py-2 rounded text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-brand-500/10 flex items-center gap-2"
        >
          <UserPlus size={16} /> NUEVO USUARIO
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-bg-sidebar border border-border-dim rounded overflow-hidden">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-bg-accent border-b border-border-dim text-text-dim uppercase font-bold text-left">
                  <th className="px-6 py-3 tracking-widest">Usuario</th>
                  <th className="px-6 py-3 tracking-widest text-center">Rol</th>
                  <th className="px-6 py-3 tracking-widest">Sucursal</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-bg-accent/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-bg-card border border-border-dim flex items-center justify-center text-brand-500 font-bold uppercase text-[10px]">
                          {user.name.substring(0, 2)}
                        </div>
                        <div className="font-bold text-text-main uppercase tracking-tight">{user.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border",
                        user.role === 'dueño' ? "bg-brand-500/10 text-brand-500 border-brand-500/20" : "bg-bg-accent text-text-dim border-border-dim"
                      )}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-text-dim uppercase font-bold text-[10px]">
                      {user.branch || '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 text-text-dim">
                        <button className="hover:text-text-main transition-colors p-1">
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => deleteUser(user.id)}
                          className="hover:text-red-400 transition-colors p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                        <button className="hover:text-text-main transition-colors p-1">
                          <MoreVertical size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          {isAdding ? (
            <div className="bg-bg-sidebar border border-brand-500/30 p-6 rounded space-y-4 shadow-xl">
              <h3 className="text-xs font-black uppercase text-brand-500 mb-4 flex items-center gap-2">
                <UserPlus size={16} /> Alta de Usuario
              </h3>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Nombre Completo</label>
                <input 
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2.5 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 uppercase font-bold"
                  placeholder="Ejem: Juan Perez"
                />
              </div>

              {/* Roles Selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Rol de Sistema</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map(role => (
                    <button
                      key={role}
                      onClick={() => setFormData({...formData, role})}
                      className={cn(
                        "py-2 rounded border text-[10px] font-black uppercase transition-all",
                        formData.role === role 
                          ? "bg-brand-500 border-brand-500 text-black" 
                          : "bg-bg-accent border-border-dim text-text-dim hover:border-brand-500"
                      )}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Sucursal Asignada</label>
                <input 
                  type="text"
                  value={formData.branch}
                  onChange={(e) => setFormData({...formData, branch: e.target.value})}
                  className="w-full px-4 py-2.5 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 uppercase font-bold"
                  placeholder="Ejem: Barrio Norte"
                />
              </div>

              <div className="pt-4 flex gap-2">
                <button 
                  onClick={handleAddUser}
                  className="flex-1 bg-brand-500 text-black py-2.5 rounded text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all font-mono"
                >
                  GUARDAR
                </button>
                <button 
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2.5 rounded border border-border-dim text-text-dim text-[11px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
                >
                  CANCELAR
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-bg-accent border border-border-dim p-6 rounded space-y-4">
              <h4 className="text-[11px] font-bold uppercase text-text-dim mb-4">Información de Roles</h4>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="p-1.5 bg-brand-500/10 rounded h-fit text-brand-500"><Shield size={14} /></div>
                  <div>
                    <p className="text-[10px] font-black text-text-main uppercase">Dueño / Superadmin</p>
                    <p className="text-[9px] text-text-dim opacity-70 leading-snug">Acceso total a métricas, sueldos y configuración de sucursales.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="p-1.5 bg-text-dim/10 rounded h-fit text-text-dim"><MapPin size={14} /></div>
                  <div>
                    <p className="text-[10px] font-black text-text-main uppercase">Encargado de Sucursal</p>
                    <p className="text-[9px] text-text-dim opacity-70 leading-snug">Solo puede cargar ventas y stock de su sucursal asignada.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
