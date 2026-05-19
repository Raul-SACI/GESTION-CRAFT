/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  UserPlus, 
  Mail, 
  Shield, 
  MapPin,
  MoreVertical,
  Trash2,
  Edit2,
  Loader2,
  Eye,
  EyeOff
} from 'lucide-react';
import { User, UserRole, Branch, RolePermission } from '../types';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

const ROLES: UserRole[] = ['encargado', 'supervisor', 'administrativo', 'dueño'];

const MODULES = [
  { id: 'ventas', name: 'Ventas' },
  { id: 'balance', name: 'Estado de Resultado' },
  { id: 'cmv', name: 'CMV Mensual Sucursal' },
  { id: 'desvios', name: 'Control de Desvíos' },
  { id: 'supervision', name: 'Supervisiones y Banderas' },
  { id: 'documentos', name: 'Papeles Importantes' },
  { id: 'precios', name: 'Lista de Precios' },
  { id: 'sucursales', name: 'Gestión Sucursales' },
  { id: 'usuarios', name: 'Usuarios y Roles' },
  { id: 'finanzas', name: 'Finanzas' },
  { id: 'sueldos', name: 'Sueldos y RRHH' },
  { id: 'produccion', name: 'Centro de Producción' },
  { id: 'vajilla', name: 'Vajilla' },
];

export default function UsersView({ selectedBranchId, branches }: { selectedBranchId: string, branches: Branch[] }) {
  const [activeTab, setActiveTab] = useState<'usuarios' | 'permisos'>('usuarios');
  const activeBranch = branches.find(b => b.id === selectedBranchId);
  const [users, setUsers] = useState<User[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState<Partial<User>>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'encargado',
    branchId: ''
  });

  const fetchData = async () => {
    setLoading(true);
    const [profilesRes, permissionsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('first_name'),
      supabase.from('role_permissions').select('*')
    ]);

    if (profilesRes.data) {
      setUsers(profilesRes.data.map(u => ({
        id: u.id,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        password: u.password,
        role: u.role as UserRole,
        branchId: u.branch_id
      })));
    }

    if (permissionsRes.data) {
      setRolePermissions(permissionsRes.data.map(p => ({
        id: p.id,
        role: p.role as UserRole,
        modules: p.modules || []
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddUser = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email) {
      alert('Por favor complete nombre, apellido y email.');
      return;
    }
    
    const { data, error } = await supabase.from('profiles').insert([{
      first_name: formData.firstName.toUpperCase(),
      last_name: formData.lastName.toUpperCase(),
      email: formData.email.toLowerCase(),
      password: formData.password,
      role: formData.role,
      branch_id: formData.branchId || null
    }]).select().single();

    if (error) {
      console.error('Error adding user:', error);
      alert('Error al guardar el usuario: ' + error.message);
      return;
    }

    if (data) {
      setUsers([...users, {
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        password: data.password,
        role: data.role as UserRole,
        branchId: data.branch_id
      }]);
      setIsAdding(false);
      setFormData({ firstName: '', lastName: '', email: '', password: '', role: 'encargado', branchId: '' });
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm('¿Eliminar usuario?')) return;
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (!error) {
      setUsers(users.filter(u => u.id !== id));
    }
  };

  const togglePermission = async (role: UserRole, moduleId: string) => {
    const perm = rolePermissions.find(p => p.role === role);
    let newModules = [];
    
    if (perm) {
      if (perm.modules.includes(moduleId)) {
        newModules = perm.modules.filter(m => m !== moduleId);
      } else {
        newModules = [...perm.modules, moduleId];
      }
    } else {
      newModules = [moduleId];
    }

    const { data, error } = await supabase
      .from('role_permissions')
      .upsert({ role, modules: newModules }, { onConflict: 'role' })
      .select()
      .single();

    if (data) {
      setRolePermissions(prev => {
        const others = prev.filter(p => p.role !== role);
        return [...others, { id: data.id, role: data.role as UserRole, modules: data.modules }];
      });
    }
  };

  const filteredUsers = useMemo(() => {
    if (selectedBranchId === 'all') return users;
    return users.filter(u => u.branchId === selectedBranchId || u.role === 'dueño');
  }, [users, selectedBranchId]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-bg-sidebar p-6 rounded border border-border-dim shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/10 p-2 text-brand-500 border border-brand-500/20 rounded">
            <Users size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main uppercase tracking-tight">
              Control de Accesos {activeBranch ? `• ${activeBranch.name}` : '(CONSOLIDADO)'}
            </h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">Configuración de Usuarios y Permisos por Rol</p>
          </div>
        </div>
        <div className="flex bg-bg-accent p-1 rounded border border-border-dim">
           <button 
             onClick={() => setActiveTab('usuarios')}
             className={cn(
               "px-4 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all",
               activeTab === 'usuarios' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main"
             )}
           >
             Usuarios
           </button>
           <button 
             onClick={() => setActiveTab('permisos')}
             className={cn(
               "px-4 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all",
               activeTab === 'permisos' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main"
             )}
           >
             Permisos por Rol
           </button>
        </div>
      </div>

      {activeTab === 'usuarios' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-bg-sidebar border border-border-dim rounded overflow-hidden shadow-xl">
              <div className="p-4 bg-bg-accent/50 border-b border-border-dim flex justify-between items-center">
                 <h3 className="text-[10px] font-black uppercase text-text-dim tracking-widest">Listado de Personal</h3>
                 <button 
                  onClick={() => setIsAdding(true)}
                  className="bg-brand-500 hover:bg-brand-600 text-black px-4 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                >
                  <UserPlus size={14} /> NUEVO USUARIO
                </button>
              </div>
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
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center">
                        <Loader2 className="animate-spin text-brand-500 mx-auto" size={24} />
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-text-dim/50 uppercase italic">
                        No hay usuarios registrados
                      </td>
                    </tr>
                  ) : filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-bg-accent/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-bg-accent border border-border-dim flex items-center justify-center text-brand-500 font-black uppercase text-[10px]">
                            {user.firstName[0]}{user.lastName[0]}
                          </div>
                          <div>
                            <div className="font-bold text-text-main uppercase tracking-tight">{user.firstName} {user.lastName}</div>
                            <div className="text-[9px] text-text-dim font-mono">{user.email}</div>
                          </div>
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
                        {branches.find(b => b.id === user.branchId)?.name || 'GLOBAL / DUEÑO'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 text-text-dim">
                          <button 
                            onClick={() => deleteUser(user.id)}
                            className="hover:text-red-400 transition-colors p-1"
                          >
                            <Trash2 size={14} />
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
              <div className="bg-bg-sidebar border border-brand-500/30 p-6 rounded space-y-4 shadow-2xl">
                <h3 className="text-xs font-black uppercase text-brand-500 mb-4 flex items-center gap-2">
                  <UserPlus size={16} /> Alta de Usuario
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Nombre</label>
                    <input 
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                      className="w-full px-4 py-2.5 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 uppercase font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Apellido</label>
                    <input 
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                      className="w-full px-4 py-2.5 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 uppercase font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Email (Usuario)</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
                    <input 
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full pl-10 pr-4 py-2.5 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-bold"
                      placeholder="usuario@sistema.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Contraseña</label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
                    <input 
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      className="w-full pl-10 pr-10 py-2.5 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-bold font-mono"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main transition-colors"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Rol de Sistema</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map(role => (
                      <button
                        key={role}
                        onClick={() => setFormData({...formData, role})}
                        className={cn(
                          "py-2 rounded border text-[9px] font-black uppercase transition-all",
                          formData.role === role 
                            ? "bg-brand-500 border-brand-500 text-black shadow-lg shadow-brand-500/20" 
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
                  <select 
                    value={formData.branchId}
                    onChange={(e) => setFormData({...formData, branchId: e.target.value})}
                    className="w-full px-4 py-2.5 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-bold uppercase"
                  >
                    <option value="">(SIN SUCURSAL - TODO)</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div className="pt-4 flex gap-2">
                  <button 
                    onClick={handleAddUser}
                    className="flex-1 bg-brand-500 text-black py-2.5 rounded text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-lg shadow-brand-500/10"
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
                <h4 className="text-[11px] font-black uppercase text-text-main mb-4 tracking-tighter">Guía de Seguridad</h4>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="p-1.5 bg-brand-500/10 rounded h-fit text-brand-500 border border-brand-500/20"><Shield size={14} /></div>
                    <div>
                      <p className="text-[10px] font-black text-text-main uppercase">Control Estricto</p>
                      <p className="text-[9px] text-text-dim opacity-70 leading-snug">Cada usuario tiene sus propios permisos. No comparta contraseñas.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="p-1.5 bg-text-dim/10 rounded h-fit text-text-dim border border-border-dim"><MapPin size={14} /></div>
                    <div>
                      <p className="text-[10px] font-black text-text-main uppercase">Sucursal Asignada</p>
                      <p className="text-[9px] text-text-dim opacity-70 leading-snug">Los encargados solo ven los datos de su sucursal base.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-2xl">
           <div className="p-6 bg-bg-accent/30 border-b border-border-dim">
              <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest italic">Matriz de Permisos por Rol</h3>
              <p className="text-[9px] text-text-dim font-bold uppercase mt-1">Defina qué módulos puede ver cada rol del sistema</p>
           </div>
           
           <div className="overflow-x-auto">
             <table className="w-full border-collapse">
               <thead>
                 <tr className="bg-bg-sidebar border-b border-border-dim text-[10px] font-black uppercase text-text-dim">
                   <th className="px-6 py-4 text-left border-r border-border-dim bg-bg-accent/10">Módulo / Sección</th>
                   {ROLES.map(role => (
                     <th key={role} className="px-6 py-4 text-center border-r border-border-dim">
                       {role}
                     </th>
                   ))}
                 </tr>
               </thead>
               <tbody className="divide-y divide-border-dim">
                 {MODULES.map(mod => (
                   <tr key={mod.id} className="hover:bg-bg-accent/20 transition-colors">
                     <td className="px-6 py-4 border-r border-border-dim bg-bg-accent/5">
                        <div className="text-[11px] font-black text-text-main uppercase tracking-tight">{mod.name}</div>
                        <div className="text-[9px] text-text-dim uppercase font-mono opacity-50">{mod.id}</div>
                     </td>
                     {ROLES.map(role => {
                       const hasPermission = rolePermissions.find(p => p.role === role)?.modules.includes(mod.id);
                       return (
                         <td key={role} className="px-6 py-4 text-center border-r border-border-dim">
                            <button 
                              onClick={() => togglePermission(role, mod.id)}
                              className={cn(
                                "w-10 h-6 rounded-full transition-all relative inline-block align-middle shadow-inner",
                                hasPermission ? "bg-brand-500" : "bg-bg-accent border border-border-dim"
                              )}
                            >
                               <motion.div 
                                 animate={{ x: hasPermission ? 16 : 4 }}
                                 className={cn(
                                   "w-4 h-4 rounded-full absolute top-1 shadow-md",
                                   hasPermission ? "bg-black" : "bg-text-dim"
                                 )}
                               />
                            </button>
                         </td>
                       );
                     })}
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>
      )}
    </motion.div>
  );
}
