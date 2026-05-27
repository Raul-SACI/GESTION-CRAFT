/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  UserPlus, 
  Shield, 
  MapPin,
  Trash2,
  Edit2,
  Loader2,
  Lock,
  Unlock,
  Layers,
  CheckCircle,
  Plus,
  Compass,
  FileCheck,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { User, Branch, RoleConfig } from '../types';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

const SYSTEM_MODULES = [
  { id: 'socios_dashboard', label: 'Dashboard de Socios', category: 'Socios' },
  { id: 'dashboard', label: 'Dashboard General', category: 'Gestión Sucursal' },
  { id: 'stock', label: 'Control Stock', category: 'Gestión Sucursal' },
  { id: 'desempeño', label: 'Desempeño', category: 'Gestión Sucursal' },
  { id: 'vajilla', label: 'Vajilla', category: 'Gestión Sucursal' },
  { id: 'horas', label: 'Carga de Horas', category: 'Gestión Sucursal' },
  { id: 'novedades', label: 'Novedades / Bitácora', category: 'Gestión Sucursal' },
  { id: 'decomisos', label: 'Decomisos Diarios', category: 'Gestión Sucursal' },
  { id: 'papeles_sucursal', label: 'Papeles Importantes (Sucursal)', category: 'Gestión Sucursal' },
  { id: 'cuentas', label: 'Cuentas y Contraseñas', category: 'Gestión Sucursal' },
  { id: 'control_horas', label: 'Control de Horas', category: 'Recursos Humanos' },
  { id: 'gestion_sueldos', label: 'Maestro de Personal', category: 'Recursos Humanos' },
  { id: 'presupuesto_horas', label: 'Presupuestador de Horas', category: 'Gestión Líderes Operativos' },
  { id: 'agenda', label: 'Agenda Supervisores', category: 'Gestión Líderes Operativos' },
  { id: 'supervisiones_operativas', label: 'Supervisiones', category: 'Gestión Líderes Operativos' },
  { id: 'registro_supervision', label: 'Registro de Supervisión', category: 'Gestión Líderes Operativos' },
  { id: 'produccion_mes', label: 'Producción del Mes', category: 'Centro de Producción' },
  { id: 'produccion_stock_control', label: 'Control Stock Insumos', category: 'Centro de Producción' },
  { id: 'bank_liabilities', label: 'Pasivos Bancarios', category: 'Finanzas' },
  { id: 'tax_liabilities', label: 'Pasivos Fiscales', category: 'Finanzas' },
  { id: 'cronograma_pagos', label: 'Cronograma de Pagos', category: 'Finanzas' },
  { id: 'finanzas_mensual', label: 'Flujo de Caja Mensual', category: 'Finanzas' },
  { id: 'ventas', label: 'Ventas Diarias', category: 'Administración' },
  { id: 'consumo', label: 'CMV Mensual Sucursal', category: 'Administración' },
  { id: 'control_desvios', label: 'Control de Desvíos', category: 'Administración' },
  { id: 'supervision_banderas', label: 'Supervisiones y Banderas', category: 'Administración' },
  { id: 'pedidos_ya', label: 'Pedidos Ya', category: 'Administración' },
  { id: 'papeles_administracion', label: 'Papeles Importantes (Admin)', category: 'Administración' },
  { id: 'aprobacion_presupuestos', label: 'Aprobación de Presupuestos', category: 'Gerencia General' },
  { id: 'finanzas_estimado', label: 'Flujo de Caja Estimado', category: 'Gerencia General' },
  { id: 'precios', label: 'Lista de Precios', category: 'Gerencia General' },
  { id: 'p&l', label: 'Estado de Resultado (P&L)', category: 'Gerencia General' },
  { id: 'performance_admin', label: 'Configuración de Premios', category: 'Gerencia General' },
  { id: 'sucursales', label: 'Gestión Sucursales', category: 'Configuración' },
  { id: 'usuarios', label: 'Usuarios/Roles', category: 'Configuración' },
];

export default function UsersView({ selectedBranchId, branches }: { selectedBranchId: string, branches: Branch[] }) {
  const activeBranch = branches.find(b => b.id === selectedBranchId);
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'roles'>('users');
  
  // States
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states for creating/editing Users
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [userForm, setUserForm] = useState({
    id: '',
    name: '',
    role: '',
    branch: 'Todas las Sucursales',
  });

  // Form states for creating/editing Roles
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [roleForm, setRoleForm] = useState<Omit<RoleConfig, 'id'>>({
    name: '',
    description: '',
    is_read_only: false,
    access_scope: 'all_branches',
    allowed_modules: []
  });

  // Password setting states
  const [showPassModal, setShowPassModal] = useState(false);
  const [selectedUserForPass, setSelectedUserForPass] = useState<User | null>(null);
  const [tempPassVal, setTempPassVal] = useState('');
  const [showPassValue, setShowPassValue] = useState(false);
  const [isSavingPass, setIsSavingPass] = useState(false);

  const handleSavePassword = async () => {
    if (!selectedUserForPass) return;
    setIsSavingPass(true);
    try {
      const { error } = await supabase.from('profiles').update({
        password: tempPassVal.trim()
      }).eq('id', selectedUserForPass.id);
      
      if (error) throw error;
      
      setShowPassModal(false);
      setSelectedUserForPass(null);
      await fetchData();
    } catch (e: any) {
      alert(`Error al guardar contraseña: ${e.message || e}`);
    } finally {
      setIsSavingPass(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch configured roles
      const { data: rolesData, error: rolesError } = await supabase.from('roles_config').select('*');
      let loadedRoles: RoleConfig[] = [];
      if (!rolesError && rolesData) {
        loadedRoles = rolesData.map(r => ({
          id: r.id,
          name: r.name,
          description: r.description || '',
          allowed_modules: r.allowed_modules || [],
          is_read_only: Boolean(r.is_read_only),
          access_scope: r.access_scope || 'all_branches'
        }));
        setRoles(loadedRoles);
      }

      // 2. Fetch profiles
      const { data: profilesData } = await supabase.from('profiles').select('*').order('name');
      if (profilesData) {
        setUsers(profilesData.map(u => ({
          id: u.id,
          name: u.name,
          role: u.role,
          branch: u.branch_name,
          permissions: u.permissions || [],
          password: u.password || ''
        })));
      }

      // Set default role in form if available
      if (loadedRoles.length > 0 && !userForm.role) {
        setUserForm(prev => ({ ...prev, role: loadedRoles[0].id }));
      }
    } catch (e) {
      console.error('Error loading config data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Compute selected role details
  const selectedRoleConfig = useMemo(() => {
    return roles.find(r => r.id === userForm.role);
  }, [roles, userForm.role]);

  // Handle Save User
  const handleSaveUser = async () => {
    if (!userForm.name) {
      alert('Por favor, ingresa el nombre.');
      return;
    }
    if (!userForm.role) {
      alert('Por favor, selecciona un rol.');
      return;
    }

    setLoading(true);
    try {
      let finalBranch = userForm.branch;
      // If role enforces all branches, overwrite to 'Todas las Sucursales'
      if (selectedRoleConfig && selectedRoleConfig.access_scope === 'all_branches') {
        finalBranch = 'Todas las Sucursales';
      }

      const payload = {
        name: userForm.name.toUpperCase(),
        role: userForm.role,
        branch_name: finalBranch,
      };

      if (userForm.id) {
        // Edit Mode
        const { error } = await supabase.from('profiles').update(payload).eq('id', userForm.id);
        if (error) throw error;
      } else {
        // Add Mode
        const { error } = await supabase.from('profiles').insert([payload]);
        if (error) throw error;
      }
      
      setIsAddingUser(false);
      setUserForm({ id: '', name: '', role: roles[0]?.id || '', branch: 'Todas las Sucursales' });
      await fetchData();
    } catch (e: any) {
      alert(`Error al guardar el usuario: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle Edit Click
  const startEditUser = (user: User) => {
    setUserForm({
      id: user.id,
      name: user.name,
      role: user.role,
      branch: user.branch || 'Todas las Sucursales'
    });
    setIsAddingUser(true);
  };

  // Handle Delete User
  const handleDeleteUser = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este usuario del sistema?')) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw error;
      await fetchData();
    } catch (e: any) {
      alert(`Error al eliminar usuario: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle Save Custom Role
  const handleSaveRole = async () => {
    if (!roleForm.name) {
      alert('Por favor, ingresa el nombre de la función / rol.');
      return;
    }

    setLoading(true);
    try {
      const roleId = roleForm.name.toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .trim();

      const payload = {
        id: roleId,
        name: roleForm.name,
        description: roleForm.description,
        is_read_only: roleForm.is_read_only,
        access_scope: roleForm.access_scope,
        allowed_modules: roleForm.allowed_modules
      };

      const { error } = await supabase.from('roles_config').upsert([payload]);
      if (error) throw error;

      setIsAddingRole(false);
      setRoleForm({
        name: '',
        description: '',
        is_read_only: false,
        access_scope: 'all_branches',
        allowed_modules: []
      });
      await fetchData();
    } catch (e: any) {
      alert(`Error al guardar el rol: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle Delete Custom Role
  const handleDeleteRole = async (roleId: string) => {
    if (['administrador', 'socio', 'encargado'].includes(roleId)) {
      alert('No se pueden eliminar los roles base del sistema por razones de seguridad.');
      return;
    }

    if (!confirm('¿Estás seguro de eliminar este rol? Los usuarios asociados perderán sus accesos predeterminados.')) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('roles_config').delete().eq('id', roleId);
      if (error) throw error;
      await fetchData();
    } catch (e: any) {
      alert(`Error al eliminar el rol: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleModuleInRole = (moduleId: string) => {
    setRoleForm(prev => {
      const active = prev.allowed_modules.includes(moduleId);
      return {
        ...prev,
        allowed_modules: active 
          ? prev.allowed_modules.filter(id => id !== moduleId)
          : [...prev.allowed_modules, moduleId]
      };
    });
  };

  const filteredUsers = useMemo(() => {
    if (selectedBranchId === 'all') return users;
    const activeBranchName = activeBranch?.name.toUpperCase();
    return users.filter(u => u.branch?.toUpperCase() === activeBranchName || u.branch?.toUpperCase() === 'TODAS LAS SUCURSALES');
  }, [users, selectedBranchId, activeBranch]);

  // Modules categorized for structured display
  const categorizedModules = useMemo(() => {
    const map: Record<string, typeof SYSTEM_MODULES> = {};
    SYSTEM_MODULES.forEach(m => {
      if (!map[m.category]) map[m.category] = [];
      map[m.category].push(m);
    });
    return map;
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Tab Switcher Headers */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-bg-sidebar p-6 border border-border-dim rounded">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/10 p-2.5 text-brand-500 border border-brand-500/20 rounded">
            <Users size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main uppercase tracking-tight">
              Control de Accesos y Seguridad
            </h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">
              Configura usuarios, roles autorizados y restricciones de sucursal
            </p>
          </div>
        </div>

        {/* Dynamic sub tab selectors */}
        <div className="flex bg-bg-accent p-1 rounded border border-border-dim">
          <button
            onClick={() => setActiveSubTab('users')}
            className={cn(
              "px-4 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-colors",
              activeSubTab === 'users' ? "bg-brand-500 text-black shadow" : "text-text-dim hover:text-text-main"
            )}
          >
            Usuarios
          </button>
          <button
            onClick={() => setActiveSubTab('roles')}
            className={cn(
              "px-4 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-colors",
              activeSubTab === 'roles' ? "bg-brand-500 text-black shadow" : "text-text-dim hover:text-text-main"
            )}
          >
            Configurar Roles y Permisos
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === 'users' ? (
          /* =======================================
             TAB: USERS MANAGEMENT
             ======================================= */
          <motion.div 
            key="users-tab"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Left/Middle: Table of Users */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-bg-sidebar border border-border-dim rounded overflow-hidden">
                <div className="p-4 bg-bg-accent border-b border-border-dim flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">
                    Personal de la organización ({filteredUsers.length})
                  </span>
                  <button
                    onClick={() => {
                      setUserForm({ id: '', name: '', role: roles[0]?.id || '', branch: 'Todas las Sucursales' });
                      setIsAddingUser(true);
                    }}
                    className="bg-brand-500 hover:bg-brand-600 text-black px-4 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2"
                  >
                    <UserPlus size={14} /> Registrar Usuario
                  </button>
                </div>
                
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-bg-accent/40 border-b border-border-dim text-text-dim uppercase font-bold text-left">
                      <th className="px-6 py-3 tracking-widest">Colaborador / Usuario</th>
                      <th className="px-6 py-3 tracking-widest text-center">Rol Asignado</th>
                      <th className="px-6 py-3 tracking-widest">Área / Sucursal</th>
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
                        <td colSpan={4} className="px-6 py-12 text-center text-text-dim/50 uppercase italic">
                          No hay usuarios registrados correspondientes
                        </td>
                      </tr>
                    ) : filteredUsers.map((user) => {
                      const userRoleCfg = roles.find(r => r.id === user.role);
                      return (
                        <tr key={user.id} className="hover:bg-bg-accent/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-bg-card border border-border-dim flex items-center justify-center text-brand-500 font-black uppercase text-[10px]">
                                {user.name.substring(0, 2)}
                              </div>
                              <div>
                                <div className="font-bold text-text-main uppercase tracking-tight">{user.name}</div>
                                <div className="text-[9px] text-text-dim opacity-70">SISTEMA INTERNO</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border font-mono",
                              user.role === 'administrador' ? "bg-brand-500/10 text-brand-500 border-brand-500/20" :
                              user.role === 'socio' ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                              "bg-bg-accent text-text-dim border-border-dim"
                            )}>
                              {userRoleCfg?.name || user.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-text-dim uppercase font-bold text-[10px]">
                            <div className="flex items-center gap-1.5">
                              <MapPin size={12} className="text-text-dim/50" />
                              {user.branch || 'TODAS LAS SUCURSALES'}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2.5 text-text-dim">
                              <button 
                                onClick={() => {
                                  setSelectedUserForPass(user);
                                  setTempPassVal(user.password || '');
                                  setShowPassValue(false);
                                  setShowPassModal(true);
                                }}
                                className={cn(
                                  "p-1 transition-colors rounded",
                                  user.password 
                                    ? "text-brand-500 hover:text-brand-400" 
                                    : "text-text-dim hover:text-brand-500 opacity-40 hover:opacity-100"
                                )}
                                title={user.password ? `Contraseña: ${user.password}` : "Establecer Contraseña Temporal"}
                              >
                                {user.password ? <Lock size={14} className="fill-brand-500/10" /> : <Unlock size={14} />}
                              </button>
                              <button 
                                onClick={() => startEditUser(user)}
                                className="hover:text-brand-500 transition-colors p-1"
                                title="Editar Usuario"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteUser(user.id)}
                                className="hover:text-red-400 transition-colors p-1"
                                title="Eliminar de la Base"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Side: Form / Helper */}
            <div>
              {isAddingUser ? (
                <div className="bg-bg-sidebar border border-brand-500/30 p-6 rounded space-y-4 shadow-xl">
                  <h3 className="text-xs font-black uppercase text-brand-500 mb-4 flex items-center gap-2">
                    <UserPlus size={16} /> {userForm.id ? 'Modificar Usuario' : 'Registrar Nuevo Usuario'}
                  </h3>
                  
                  {/* Name Input */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Nombre Completo</label>
                    <input 
                      type="text"
                      value={userForm.name}
                      onChange={(e) => setUserForm({...userForm, name: e.target.value})}
                      className="w-full px-4 py-2.5 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 uppercase font-bold"
                      placeholder="Ejem: PEDRO CASTRO"
                    />
                  </div>

                  {/* Role Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider block">Rol Asignado</label>
                    <select
                      value={userForm.role}
                      onChange={(e) => {
                        const nextRole = e.target.value;
                        const cfg = roles.find(r => r.id === nextRole);
                        setUserForm(prev => ({
                          ...prev,
                          role: nextRole,
                          // If switching to all branches, reset to label
                          branch: cfg?.access_scope === 'single_branch' ? branches[0]?.name : 'Todas las Sucursales'
                        }));
                      }}
                      className="w-full px-4 py-2.5 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-bold uppercase"
                    >
                      {roles.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Branch Selector (Enforced or configurable based on selected role) */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider block">Área u Operación</label>
                    {selectedRoleConfig?.access_scope === 'all_branches' ? (
                      <div className="bg-bg-accent/50 border border-border-dim p-3 rounded flex items-center gap-2 text-text-dim">
                        <Compass size={14} className="text-brand-500" />
                        <span className="text-[10px] font-black uppercase tracking-wider">Múltiples Sucursales (Consolidado)</span>
                      </div>
                    ) : (
                      <select
                        value={userForm.branch}
                        onChange={(e) => setUserForm({...userForm, branch: e.target.value})}
                        className="w-full px-4 py-2.5 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-bold uppercase"
                      >
                        {branches.map(b => (
                          <option key={b.id} value={b.name}>{b.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Information block based on active role */}
                  {selectedRoleConfig && (
                    <div className="bg-bg-accent border border-border-dim p-4 rounded-lg space-y-2 mt-4 text-[10px]">
                      <div className="flex items-center gap-1.5 text-text-main font-bold uppercase">
                        <FileCheck size={14} className="text-brand-500" />
                        <span>Restricciones y Accesos:</span>
                      </div>
                      <p className="text-text-dim uppercase leading-relaxed font-semibold">
                        • {selectedRoleConfig.is_read_only ? 'MODO SOLO LECTURA ACTIVADO.' : 'CON PERMISO DE EDICIÓN Y CREACIÓN.'}
                      </p>
                      <p className="text-text-dim uppercase leading-relaxed font-semibold">
                        • ACCESO LIMITADO A: {selectedRoleConfig.allowed_modules.length} MÓDULOS DEL SISTEMA.
                      </p>
                    </div>
                  )}

                  {/* Submit Actions */}
                  <div className="pt-4 flex gap-2">
                    <button 
                      onClick={handleSaveUser}
                      className="flex-1 bg-brand-500 text-black py-2.5 rounded text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all font-mono shadow-lg shadow-brand-500/10"
                    >
                      {userForm.id ? 'GUARDAR CAMBIOS' : 'REGISTRAR'}
                    </button>
                    <button 
                      onClick={() => {
                        setIsAddingUser(false);
                        setUserForm({ id: '', name: '', role: roles[0]?.id || '', branch: 'Todas las Sucursales' });
                      }}
                      className="px-4 py-2.5 rounded border border-border-dim text-text-dim text-[11px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
                    >
                      CANCELAR
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-bg-accent border border-border-dim p-6 rounded space-y-4">
                  <h4 className="text-[11px] font-bold uppercase text-text-dim mb-4 tracking-widest">Información de Seguridad</h4>
                  <div className="space-y-4 text-xs font-medium">
                    <div className="flex gap-3">
                      <div className="p-1.5 bg-brand-500/10 rounded h-fit text-brand-500"><Shield size={14} /></div>
                      <div>
                        <p className="text-[10px] font-black text-text-main uppercase">Seguridad a nivel Sucursal</p>
                        <p className="text-[9.5px] text-text-dim opacity-70 leading-relaxed uppercase mt-0.5">El sistema enmascara la información de otras sucursales para impedir fugas de datos comerciales.</p>
                      </div>
                    </div>
                    <div className="flex gap-3 border-t border-border-dim pt-4">
                      <div className="p-1.5 bg-purple-500/10 rounded h-fit text-purple-400"><Lock size={14} /></div>
                      <div>
                        <p className="text-[10px] font-black text-text-main uppercase">Modo Solo Lectura</p>
                        <p className="text-[9.5px] text-text-dim opacity-70 leading-relaxed uppercase mt-0.5">Perfecto para socios financistas, auditores o consultores quienes no deben modificar stock ni flujo de caja.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          /* =======================================
             TAB: ROLES & PERMISSIONS SYSTEM
             ======================================= */
          <motion.div 
            key="roles-tab"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Left: List and details of Roles */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-bg-sidebar border border-border-dim rounded overflow-hidden">
                <div className="p-4 bg-bg-accent border-b border-border-dim flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">
                    Matriz de Funciones / Roles ({roles.length})
                  </span>
                  <button
                    onClick={() => {
                      setRoleForm({
                        name: '',
                        description: '',
                        is_read_only: false,
                        access_scope: 'all_branches',
                        allowed_modules: []
                      });
                      setIsAddingRole(true);
                    }}
                    className="bg-brand-500 hover:bg-brand-600 text-black px-4 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2"
                  >
                    <Plus size={14} /> Crear Nuevo Rol
                  </button>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {roles.map(r => (
                    <div 
                      key={r.id} 
                      className="bg-bg-accent/40 border border-border-dim hover:border-brand-500/30 p-5 rounded-lg flex flex-col justify-between transition-all"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase text-text-main font-mono tracking-tight">{r.name}</span>
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                            r.is_read_only ? "bg-purple-500/10 text-purple-400 border-purple-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          )}>
                            {r.is_read_only ? 'Solo Lectura' : 'Solo Edición'}
                          </span>
                        </div>
                        <p className="text-[10px] text-text-dim leading-relaxed uppercase">{r.description || 'Sin descripción adicional.'}</p>
                        
                        <div className="flex gap-2 pt-1.5">
                          <span className="text-[9px] font-bold bg-bg-card border border-border-dim px-2 py-0.5 rounded text-text-dim uppercase">
                            Alcance: {r.access_scope === 'all_branches' ? 'Consolidado Global' : 'Local Sucursal'}
                          </span>
                          <span className="text-[9px] font-bold bg-bg-card border border-border-dim px-2 py-0.5 rounded text-text-dim uppercase">
                            {r.allowed_modules.length} Módulos
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-3 mt-4 pt-3 border-t border-border-dim/50">
                        {['administrador', 'socio', 'encargado'].includes(r.id) ? (
                          <span className="text-[8.5px] font-mono text-text-dim/40 uppercase font-black italic">Rol de Fábrica</span>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setRoleForm({
                                  name: r.name,
                                  description: r.description,
                                  is_read_only: r.is_read_only,
                                  access_scope: r.access_scope,
                                  allowed_modules: r.allowed_modules
                                });
                                setIsAddingRole(true);
                              }}
                              className="text-[10px] text-brand-500 hover:underline font-bold uppercase"
                            >
                              Modificar
                            </button>
                            <button
                              onClick={() => handleDeleteRole(r.id)}
                              className="text-[10px] text-red-400 hover:underline font-bold uppercase transition-colors"
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Creating / Editing dynamic role form */}
            <div>
              {isAddingRole ? (
                <div className="bg-bg-sidebar border border-brand-500/30 p-6 rounded space-y-4 shadow-xl">
                  <h3 className="text-xs font-black uppercase text-brand-500 mb-4 flex items-center gap-2">
                    <Layers size={16} /> Crear / Editar Rol
                  </h3>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider block">Denominación del Rol</label>
                    <input 
                      type="text"
                      className="w-full px-4 py-2.5 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 uppercase font-bold"
                      placeholder="Ej: LÍDER DE CAPACITACIÓN"
                      value={roleForm.name}
                      onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider block">Descripción Operativa</label>
                    <textarea 
                      rows={2}
                      className="w-full px-4 py-2 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-medium uppercase"
                      placeholder="Detalles sobre las responsabilidades de este rol..."
                      value={roleForm.description}
                      onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                    />
                  </div>

                  {/* Access Scope Toggle Group */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider block">Visibilidad de Sucursales</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRoleForm({ ...roleForm, access_scope: 'all_branches' })}
                        className={cn(
                          "py-2 rounded border text-[10px] font-black uppercase transition-all",
                          roleForm.access_scope === 'all_branches'
                            ? "bg-brand-500 border-brand-500 text-black"
                            : "bg-bg-accent border-border-dim text-text-dim hover:border-brand-500"
                        )}
                      >
                        Global (Todas)
                      </button>
                      <button
                        type="button"
                        onClick={() => setRoleForm({ ...roleForm, access_scope: 'single_branch' })}
                        className={cn(
                          "py-2 rounded border text-[10px] font-black uppercase transition-all",
                          roleForm.access_scope === 'single_branch'
                            ? "bg-brand-500 border-brand-500 text-black"
                            : "bg-bg-accent border-border-dim text-text-dim hover:border-brand-500"
                        )}
                      >
                        Local (Solo su Sucursal)
                      </button>
                    </div>
                  </div>

                  {/* Is Read Only Toggle Group */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider block">Modo Permisos de Edición</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRoleForm({ ...roleForm, is_read_only: false })}
                        className={cn(
                          "py-2 rounded border text-[10px] font-black uppercase transition-all",
                          !roleForm.is_read_only
                            ? "bg-brand-500 border-brand-500 text-black"
                            : "bg-bg-accent border-border-dim text-text-dim hover:border-brand-500"
                        )}
                      >
                        Lectura y Edición
                      </button>
                      <button
                        type="button"
                        onClick={() => setRoleForm({ ...roleForm, is_read_only: true })}
                        className={cn(
                          "py-2 rounded border text-[10px] font-black uppercase transition-all",
                          roleForm.is_read_only
                            ? "bg-brand-500 border-brand-500 text-black"
                            : "bg-bg-accent border-border-dim text-text-dim hover:border-brand-500"
                        )}
                      >
                        Solo Lectura
                      </button>
                    </div>
                  </div>

                  {/* Modules grid scroll section */}
                  <div className="space-y-3 pt-2">
                    <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider block border-b border-border-dim pb-1">Módulos que Puede Abrir</label>
                    <div className="max-h-[220px] overflow-y-auto pr-2 custom-scrollbar bg-bg-accent/30 rounded border border-border-dim/40 p-2 space-y-4">
                      {(Object.entries(categorizedModules) as [string, any[]][]).map(([category, items]) => (
                        <div key={category} className="space-y-1.5">
                          <span className="text-[9px] font-black uppercase tracking-wider text-brand-500/80 underline block mb-1">{category}</span>
                          <div className="space-y-1">
                            {items.map(m => {
                              const active = roleForm.allowed_modules.includes(m.id);
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => toggleModuleInRole(m.id)}
                                  className={cn(
                                    "w-full flex items-center justify-between px-3 py-1.5 rounded border text-[9px] font-bold uppercase transition-all",
                                    active
                                      ? "bg-brand-500/10 border-brand-500/40 text-brand-500"
                                      : "bg-bg-accent/40 border-border-dim/60 text-text-dim hover:border-brand-500/30"
                                  )}
                                >
                                  {m.label}
                                  <div className={cn(
                                    "w-3 h-3 rounded-full border flex items-center justify-center",
                                    active ? "bg-brand-500 border-brand-500" : "border-border-dim"
                                  )}>
                                    {active && <div className="w-1.5 h-1.5 bg-black rounded-full" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions submit */}
                  <div className="pt-4 flex gap-2">
                    <button 
                      onClick={handleSaveRole}
                      className="flex-1 bg-brand-500 text-black py-2.5 rounded text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all font-mono shadow"
                    >
                      GUARDAR ROL
                    </button>
                    <button 
                      onClick={() => setIsAddingRole(false)}
                      className="px-4 py-2.5 rounded border border-border-dim text-text-dim text-[11px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
                    >
                      CANCELAR
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-bg-accent border border-border-dim p-6 rounded space-y-4">
                  <h4 className="text-[11px] font-bold uppercase text-text-dim tracking-widest">Creación de Roles Dinámicos</h4>
                  <div className="space-y-3 text-[10px] text-text-dim leading-relaxed uppercase">
                    <div className="flex gap-2">
                      <CheckCircle size={14} className="text-brand-500 flex-shrink-0" />
                      <span>Agrega roles personalizados como "Gerente de Cocina", "Auditor Externo" o "Líder de Salón".</span>
                    </div>
                    <div className="flex gap-2 border-t border-border-dim/50 pt-3">
                      <CheckCircle size={14} className="text-brand-500 flex-shrink-0" />
                      <span>Marca módulos específicos para modelar flujos de trabajo eficientes alineados con las jerarquías de tu personal.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Password Management Modal */}
      <AnimatePresence>
        {showPassModal && selectedUserForPass && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowPassModal(false);
                setSelectedUserForPass(null);
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              id="password-modal-overlay"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-bg-card border border-border-dim rounded shadow-2xl p-6 overflow-hidden z-10"
              id="password-modal-content"
            >
              <div className="flex items-center gap-3 border-b border-border-dim pb-4 mb-4">
                <div className="bg-brand-500/10 p-2.5 text-brand-500 border border-brand-500/20 rounded">
                  <Lock size={18} />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase text-text-main tracking-widest">
                    Contraseña Temporal
                  </h3>
                  <p className="text-[10px] text-brand-500 uppercase font-bold tracking-wider leading-none mt-1">
                    {selectedUserForPass.name}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-[10px] text-text-dim uppercase leading-relaxed font-semibold">
                  Establece una contraseña o clave temporal para que el usuario pueda validarse al cambiar de perfil. Déjala en blanco si deseas que no requiera contraseña.
                </p>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-text-dim uppercase tracking-wider block">Establecer Clave</label>
                  <div className="relative">
                    <input 
                      type={showPassValue ? "text" : "password"}
                      value={tempPassVal}
                      onChange={(e) => setTempPassVal(e.target.value)}
                      className="w-full px-4 py-2.5 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-mono"
                      placeholder="Ej: craft123, 1234, etc."
                      maxLength={32}
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassValue(!showPassValue)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main p-1 rounded"
                    >
                      {showPassValue ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="bg-bg-accent/50 border border-border-dim p-3 rounded text-[9.5px] uppercase font-bold text-text-dim flex gap-2">
                  <Shield size={14} className="text-brand-500 shrink-0" />
                  <span>Como Administrador del sistema, puedes ver y modificar las claves para soporte de personal.</span>
                </div>
              </div>

              <div className="mt-6 flex gap-2">
                <button 
                  onClick={handleSavePassword}
                  disabled={isSavingPass}
                  className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-black py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all font-mono shadow-lg shadow-brand-500/10 flex items-center justify-center gap-2"
                >
                  {isSavingPass ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      Guardando...
                    </>
                  ) : 'Guardar Clave'}
                </button>
                <button 
                  onClick={() => {
                    setShowPassModal(false);
                    setSelectedUserForPass(null);
                  }}
                  className="px-4 py-2.5 rounded border border-border-dim text-text-dim text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
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
