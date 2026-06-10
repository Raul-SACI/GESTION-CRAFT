/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Trash2,
  Loader2,
  Upload,
  Download,
  Search,
  CheckCircle,
  MapPin,
  IdCard,
  Power
} from 'lucide-react';
import { Branch } from '../types';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

interface Employee {
  id: string;
  legajo: string;
  name: string;
  branch_id: string;
  position: string;
  username: string;
  password: string;
  active: boolean;
}

export default function EmployeesView({ branches, isReadOnly = false }: { branches: Branch[], isReadOnly?: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  const operativeBranches = useMemo(() => branches.filter(b => b.isActive !== false), [branches]);

  const [form, setForm] = useState({
    legajo: '',
    name: '',
    branch_id: operativeBranches[0]?.id || '',
    position: '',
    username: ''
  });

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('employees').select('*').order('name');
      setEmployees((data || []) as Employee[]);
    } catch (e) {
      console.error('Error cargando empleados:', e);
    }
    setLoading(false);
  };

  useEffect(() => { loadEmployees(); }, []);

  const branchName = (id: string) => branches.find(b => b.id === id)?.name || '—';

  // Sugerir username a partir del nombre
  const suggestUsername = (name: string, legajo: string) => {
    const base = name.trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');
    return legajo ? `${base}` : base;
  };

  const handleSave = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!form.name.trim()) { alert('Ingresá el nombre del empleado.'); return; }
    const username = (form.username.trim() || suggestUsername(form.name, form.legajo)).toLowerCase();
    if (!username) { alert('No se pudo generar un usuario. Ingresá uno manualmente.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('employees').insert({
        legajo: form.legajo.trim(),
        name: form.name.trim().toUpperCase(),
        branch_id: form.branch_id,
        position: form.position.trim(),
        username,
        password: '', // la define el empleado en el primer ingreso
        active: true
      });
      if (error) {
        if (error.code === '23505') alert('Ese nombre de usuario ya existe. Elegí otro.');
        else alert('Error al guardar: ' + error.message);
      } else {
        setForm({ legajo: '', name: '', branch_id: operativeBranches[0]?.id || '', position: '', username: '' });
        setIsAdding(false);
        await loadEmployees();
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!confirm(`¿Eliminar a ${name}? Esta acción no se puede deshacer.`)) return;
    await supabase.from('employees').delete().eq('id', id);
    await loadEmployees();
  };

  const toggleActive = async (emp: Employee) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    await supabase.from('employees').update({ active: !emp.active }).eq('id', emp.id);
    await loadEmployees();
  };

  // Descargar modelo Excel
  const handleDownloadModel = () => {
    const data = [
      { 'LEGAJO': '001', 'NOMBRE': 'Juan Pérez', 'SUCURSAL': 'CRAFT Barrio Norte', 'PUESTO': 'Cocina', 'USUARIO': 'juan.perez' },
      { 'LEGAJO': '002', 'NOMBRE': 'María Gómez', 'SUCURSAL': 'CRAFT PERON', 'PUESTO': 'Salón', 'USUARIO': 'maria.gomez' }
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Empleados');
    XLSX.writeFile(wb, 'Modelo_Empleados.xlsx');
  };

  // Importar desde Excel
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg('Procesando archivo...');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);
      if (rows.length === 0) { setImportMsg('El archivo está vacío.'); return; }

      const findVal = (row: any, keys: string[]) => {
        const rowKeys = Object.keys(row);
        for (const k of keys) {
          const match = rowKeys.find(rk => rk.trim().toLowerCase() === k.toLowerCase());
          if (match) return String(row[match] ?? '').trim();
        }
        // includes
        for (const k of keys) {
          const match = rowKeys.find(rk => rk.trim().toLowerCase().includes(k.toLowerCase()));
          if (match) return String(row[match] ?? '').trim();
        }
        return '';
      };

      const branchByName = (name: string): string => {
        if (!name) return operativeBranches[0]?.id || '';
        const n = name.trim().toLowerCase();
        const found = branches.find(b => b.name.trim().toLowerCase() === n || b.name.trim().toLowerCase().includes(n) || n.includes(b.name.trim().toLowerCase()));
        return found?.id || operativeBranches[0]?.id || '';
      };

      const toInsert = rows.map(r => {
        const name = findVal(r, ['nombre', 'name', 'apellido y nombre', 'empleado']);
        const legajo = findVal(r, ['legajo', 'nro', 'numero', 'id']);
        const branchTxt = findVal(r, ['sucursal', 'branch', 'local']);
        const position = findVal(r, ['puesto', 'cargo', 'position', 'rol']);
        let username = findVal(r, ['usuario', 'username', 'user']).toLowerCase();
        if (!username && name) username = suggestUsername(name, legajo);
        return {
          legajo,
          name: name.toUpperCase(),
          branch_id: branchByName(branchTxt),
          position,
          username,
          password: '',
          active: true
        };
      }).filter(e => e.name && e.username);

      if (toInsert.length === 0) { setImportMsg('No se encontraron filas válidas (revisá columnas NOMBRE y USUARIO).'); return; }

      // Insertar (ignorar duplicados de username uno por uno)
      let ok = 0, dup = 0, err = 0;
      for (const emp of toInsert) {
        const { error } = await supabase.from('employees').insert(emp);
        if (error) { if (error.code === '23505') dup++; else err++; }
        else ok++;
      }
      setImportMsg(`Importación finalizada: ${ok} cargados, ${dup} ya existían, ${err} con error.`);
      await loadEmployees();
    } catch (err: any) {
      setImportMsg('Error al procesar: ' + err.message);
    }
    e.target.value = '';
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter(emp => {
      if (filterBranch !== 'all' && emp.branch_id !== filterBranch) return false;
      if (!q) return true;
      return emp.name.toLowerCase().includes(q) || (emp.username || '').toLowerCase().includes(q) || (emp.legajo || '').toLowerCase().includes(q) || (emp.position || '').toLowerCase().includes(q);
    });
  }, [employees, search, filterBranch]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand-500/10 rounded-lg"><Users size={20} className="text-brand-500" /></div>
          <div>
            <h1 className="text-lg font-black uppercase text-text-main tracking-tight">Empleados</h1>
            <p className="text-[10px] text-text-dim font-bold uppercase">Base de personal para fichaje y comunicación interna</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleDownloadModel} className="bg-bg-accent border border-border-dim hover:border-brand-500/50 text-text-main px-3 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2">
            <Download size={14} /> Modelo
          </button>
          <label className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 px-3 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer">
            <Upload size={14} /> Importar Excel
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
          </label>
          <button onClick={() => setIsAdding(!isAdding)} className="bg-brand-500 hover:bg-brand-600 text-black px-3 py-2 rounded text-[10px] font-black uppercase tracking-widest shadow-xl transition-all flex items-center gap-2">
            <UserPlus size={14} /> Nuevo Empleado
          </button>
        </div>
      </div>

      {importMsg && (
        <div className="bg-bg-accent border border-border-dim rounded-lg px-4 py-2 text-[10px] font-bold text-text-main uppercase">{importMsg}</div>
      )}

      {/* Form alta */}
      {isAdding && (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Legajo</label>
            <input value={form.legajo} onChange={e => setForm({ ...form, legajo: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none" />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Nombre *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none" />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Sucursal</label>
            <select value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none">
              {operativeBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Puesto</label>
            <input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none" />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Usuario</label>
            <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder={form.name ? suggestUsername(form.name, form.legajo) : 'auto'} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none placeholder:text-text-dim/40" />
          </div>
          <div className="sm:col-span-2 lg:col-span-5 flex gap-2">
            <button onClick={handleSave} disabled={saving} className="bg-brand-500 hover:bg-brand-600 text-black px-5 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Guardar
            </button>
            <button onClick={() => setIsAdding(false)} className="px-5 py-2 rounded border border-border-dim text-text-dim text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all">Cancelar</button>
          </div>
          <p className="sm:col-span-2 lg:col-span-5 text-[9px] text-text-dim font-bold uppercase opacity-70">La contraseña la define el empleado la primera vez que inicia sesión.</p>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="BUSCAR POR NOMBRE, USUARIO, LEGAJO O PUESTO..." className="w-full bg-bg-card border border-border-dim rounded-lg pl-9 pr-3 py-2 text-[10px] font-bold uppercase text-text-main outline-none" />
        </div>
        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="bg-bg-card border border-border-dim rounded-lg px-3 py-2 text-[10px] font-bold uppercase text-text-main outline-none">
          <option value="all">Todas las sucursales</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <span className="text-[10px] font-black uppercase text-text-dim">{filtered.length} de {employees.length}</span>
      </div>

      {/* Tabla */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 size={24} className="animate-spin text-brand-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-[11px] text-text-dim uppercase font-bold italic">No hay empleados cargados. Usá "Importar Excel" o "Nuevo Empleado".</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-bg-accent/40 border-b border-border-dim">
                <tr className="text-[8px] font-black uppercase text-text-dim tracking-widest">
                  <th className="px-4 py-3">Legajo</th>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Sucursal</th>
                  <th className="px-4 py-3">Puesto</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3 text-center">Contraseña</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim/30">
                {filtered.map(emp => (
                  <tr key={emp.id} className="hover:bg-bg-accent/15 text-[10px]">
                    <td className="px-4 py-3 font-mono text-text-dim">{emp.legajo || '—'}</td>
                    <td className="px-4 py-3 font-black uppercase text-text-main">{emp.name}</td>
                    <td className="px-4 py-3 text-text-dim uppercase"><span className="flex items-center gap-1"><MapPin size={10} /> {branchName(emp.branch_id)}</span></td>
                    <td className="px-4 py-3 text-text-dim uppercase">{emp.position || '—'}</td>
                    <td className="px-4 py-3 font-mono text-brand-500">{emp.username}</td>
                    <td className="px-4 py-3 text-center">
                      {emp.password ? (
                        <span className="text-[8px] font-black uppercase text-emerald-400">Definida</span>
                      ) : (
                        <span className="text-[8px] font-black uppercase text-amber-500">Pendiente</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActive(emp)} className={cn("text-[8px] font-black uppercase px-2 py-1 rounded border transition-all flex items-center gap-1 mx-auto", emp.active ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-bg-accent border-border-dim text-text-dim")}>
                        <Power size={9} /> {emp.active ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleDelete(emp.id, emp.name)} className="text-red-400 hover:text-red-500 p-1"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
