/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Plus, 
  Trash2, 
  Briefcase, 
  DollarSign, 
  Clock, 
  Calendar,
  X,
  AlertCircle,
  TrendingUp,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Search,
  Filter,
  Download,
  Upload,
  BarChart3,
  Edit2,
  Check
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';

interface SalaryHistory {
  date: string;
  value: number;
}

interface SalaryPosition {
  id: string;
  area: string;
  sector: string;
  title: string;
  type: 'hourly' | 'monthly';
  baseValue: number;
  baseMonth: string;
  prevBaseValue: number;
  prevBaseMonth: string;
  notes?: string;
  history?: SalaryHistory[];
}

export default function SalaryManagementView({ branches = [] }: { branches?: Branch[] }) {
  // Cargar puestos desde Supabase
  const [positions, setPositions] = useState<SalaryPosition[]>(() => {
    // Fallback vacío, se carga async
    const saved = localStorage.getItem('craft_salary_positions');
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return [];
  });

  // Persist data whenever it changes
  useEffect(() => {
    localStorage.setItem('craft_salary_positions', JSON.stringify(positions));
    // También en Supabase (escala completa)
    if (positions.length === 0) return;
    const rows = positions.map((p: any) => ({
      id: p.id,
      name: p.title || '',           // 'name' legacy = título del puesto
      title: p.title || '',
      area: p.area || '',
      sector: p.sector || '',
      type: p.type || 'hourly',
      base_value: p.baseValue || 0,
      base_hourly_rate: p.baseValue || 0,  // legacy
      base_month: p.baseMonth || '',
      prev_base_value: p.prevBaseValue || 0,
      prev_base_month: p.prevBaseMonth || '',
      notes: p.notes || '',
      history: p.history || []
    }));
    supabase.from('salary_positions').upsert(rows).then(({ error }) => {
      if (error) console.error('Error guardando salary_positions:', error.message);
    });
  }, [positions]);

  const [filters, setFilters] = useState({
    area: '',
    sector: '',
    title: ''
  });

  const [showAreaSuggestions, setShowAreaSuggestions] = useState(false);
  const [showSectorSuggestions, setShowSectorSuggestions] = useState(false);
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);

  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);

  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);

  // States for Adding New Position
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddModalAreaSuggestions, setShowAddModalAreaSuggestions] = useState(false);
  const [showAddModalSectorSuggestions, setShowAddModalSectorSuggestions] = useState(false);
  const [showAddModalTitleSuggestions, setShowAddModalTitleSuggestions] = useState(false);
  const [newPos, setNewPos] = useState({
    area: '',
    sector: '',
    title: '',
    type: 'hourly' as 'hourly' | 'monthly',
    baseValue: 0,
    baseMonth: '2026-05',
    prevBaseValue: 0,
    prevBaseMonth: '',
    notes: ''
  });

  // Row Inline-Editing States
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editRowDraft, setEditRowDraft] = useState<SalaryPosition | null>(null);

  // Salary Increase Modal States ("Actualización de Sueldos")
  const [showBatchUpdateModal, setShowBatchUpdateModal] = useState(false);
  const [batchMonth, setBatchMonth] = useState('2026-08'); // Default to August as per user's prompt example
  const [batchMethod, setBatchMethod] = useState<'percent' | 'manual'>('percent');
  const [batchPercent, setBatchPercent] = useState<number>(10);
  const [batchScopeType, setBatchScopeType] = useState<'all' | 'hourly' | 'monthly'>('all');
  const [batchScopeArea, setBatchScopeArea] = useState<string>('all');
  const [batchManualValues, setBatchManualValues] = useState<Record<string, number>>({});

  // Sync batchManualValues when batch modal is configured to manual
  useEffect(() => {
    if (showBatchUpdateModal && batchMethod === 'manual') {
      const initial: Record<string, number> = {};
      positions.forEach(p => {
        initial[p.id] = p.baseValue;
      });
      setBatchManualValues(initial);
    }
  }, [showBatchUpdateModal, batchMethod, positions]);

  // --- MASTER DE EMPLEADOS (RRHH) ---
  const ROLES = [
    { id: 'encargado', label: 'Encargado' },
    { id: 'caja', label: 'Caja' },
    { id: 'runners', label: 'Runners' },
    { id: 'mozos', label: 'Mozos' },
    { id: 'barra', label: 'Barra' },
    { id: 'jefe_cocina', label: 'Jefe de Cocina' },
    { id: 'segundo_cocina', label: 'Segundo de Cocina' },
    { id: 'cocinero', label: 'Cocinero' },
    { id: 'bacha', label: 'Bacha' },
  ];

  interface MasterEmployee {
    id: string;
    name: string;
    position: string;
    branchId: string;
  }

  const [activeSubTab, setActiveSubTab] = useState<'positions' | 'employees'>('positions');
  const [employees, setEmployees] = useState<MasterEmployee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<MasterEmployee | null>(null);
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    position: 'mozos',
    branchId: '1'
  });
  const [empSearch, setEmpSearch] = useState('');
  const [empBranchFilter, setEmpBranchFilter] = useState('all');

  const syncBranchStaffPools = (allEmployees: MasterEmployee[]) => {
    const branchesList = Array.from(new Set(allEmployees.map(e => e.branchId)));
    // We synchronize each branch's state individually for compatibility with older parts of the system
    branchesList.forEach(bId => {
      const branchStaff = allEmployees.filter(e => e.branchId === bId).map(e => ({
        id: e.id,
        name: e.name,
        position: e.position,
        hourly_rate: 0
      }));
      localStorage.setItem(`staff_pool_${bId}`, JSON.stringify(branchStaff));
    });
  };

  const fetchEmployees = async () => {
    setEmployeesLoading(true);
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*');
      
      if (data && data.length > 0) {
        const mapped = data.map((e: any) => ({
          id: e.id,
          name: e.name,
          position: e.position,
          branchId: e.branch_id || '1'
        }));
        setEmployees(mapped);
        localStorage.setItem('craft_employees_master', JSON.stringify(mapped));
        syncBranchStaffPools(mapped);
      } else {
        const local = localStorage.getItem('craft_employees_master');
        if (local) {
          const parsed = JSON.parse(local);
          setEmployees(parsed);
          syncBranchStaffPools(parsed);
        }
      }
    } catch (e) {
      console.error('Error loading employees from Supabase, loading locally', e);
      const local = localStorage.getItem('craft_employees_master');
      if (local) {
        const parsed = JSON.parse(local);
        setEmployees(parsed);
        syncBranchStaffPools(parsed);
      }
    } finally {
      setEmployeesLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleSaveEmployee = async () => {
    if (!employeeForm.name.trim() || !employeeForm.branchId || !employeeForm.position) {
      alert('Por favor ingrese todos los datos obligatorios.');
      return;
    }

    const nameUpper = employeeForm.name.trim().toUpperCase();
    setEmployeesLoading(true);

    try {
      if (editingEmployee) {
        const { error } = await supabase
          .from('employees')
          .update({
            name: nameUpper,
            position: employeeForm.position,
            branch_id: employeeForm.branchId,
            is_active: true
          })
          .eq('id', editingEmployee.id);
        
        if (error) throw error;

        const updated = employees.map(emp => emp.id === editingEmployee.id 
          ? { ...emp, name: nameUpper, position: employeeForm.position, branchId: employeeForm.branchId }
          : emp
        );
        setEmployees(updated);
        syncBranchStaffPools(updated);
        alert('Empleado modificado correctamente.');
      } else {
        const newId = `emp-${Math.random().toString(36).substr(2, 9)}`;
        const { data, error } = await supabase
          .from('employees')
          .insert({
            id: newId,
            name: nameUpper,
            position: employeeForm.position,
            branch_id: employeeForm.branchId,
            is_active: true
          })
          .select()
          .single();

        const addedId = data?.id || newId;
        const newEmp = {
          id: addedId,
          name: nameUpper,
          position: employeeForm.position,
          branchId: employeeForm.branchId
        };
        const updated = [...employees, newEmp];
        setEmployees(updated);
        syncBranchStaffPools(updated);
        alert('Empleado creado correctamente.');
      }
      setShowEmployeeModal(false);
      setEditingEmployee(null);
      setEmployeeForm({ name: '', position: 'mozos', branchId: branches[0]?.id || '1' });
    } catch (err) {
      console.error('Error saving employee with API, fallback local', err);
      let updated: MasterEmployee[] = [];
      if (editingEmployee) {
        updated = employees.map(emp => emp.id === editingEmployee.id 
          ? { ...emp, name: nameUpper, position: employeeForm.position, branchId: employeeForm.branchId }
          : emp
        );
      } else {
        const tempId = `emp-${Math.random().toString(36).substr(2, 9)}`;
        updated = [...employees, {
          id: tempId,
          name: nameUpper,
          position: employeeForm.position,
          branchId: employeeForm.branchId
        }];
      }
      setEmployees(updated);
      syncBranchStaffPools(updated);
      setShowEmployeeModal(false);
      setEditingEmployee(null);
      setEmployeeForm({ name: '', position: 'mozos', branchId: branches[0]?.id || '1' });
      alert('Guardado en LocalStorage (Conexión offline temporal).');
    } finally {
      setEmployeesLoading(false);
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    const isConfirmed = window.confirm('¿Está seguro de que desea eliminar a este empleado del Maestro?');
    if (!isConfirmed) return;

    setEmployeesLoading(true);
    try {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id);

      const updated = employees.filter(emp => emp.id !== id);
      setEmployees(updated);
      syncBranchStaffPools(updated);
      alert('Empleado eliminado correctamente.');
    } catch (e) {
      console.error('Error deleted API, deleting locally', e);
      const updated = employees.filter(emp => emp.id !== id);
      setEmployees(updated);
      syncBranchStaffPools(updated);
      alert('Empleado eliminado localmente.');
    } finally {
      setEmployeesLoading(false);
    }
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = empSearch === '' || 
      emp.name.toUpperCase().includes(empSearch.toUpperCase());
    const matchesBranch = empBranchFilter === 'all' || emp.branchId === empBranchFilter;
    return matchesSearch && matchesBranch;
  });

  // Cargar puestos desde Supabase al inicio
  useEffect(() => {
    const loadPositions = async () => {
      const { data, error } = await supabase.from('salary_positions').select('*').order('title');
      if (!error && data && data.length > 0) {
        setPositions(data.map((p: any) => ({
          id: p.id,
          area: p.area || '',
          sector: p.sector || '',
          title: p.title || p.name || '',
          type: (p.type === 'monthly' ? 'monthly' : 'hourly'),
          baseValue: Number(p.base_value ?? p.base_hourly_rate ?? 0),
          baseMonth: p.base_month || '',
          prevBaseValue: Number(p.prev_base_value ?? 0),
          prevBaseMonth: p.prev_base_month || '',
          notes: p.notes || '',
          history: Array.isArray(p.history) ? p.history : []
        })));
      } else {
        // Usar localStorage como fallback
        const saved = localStorage.getItem('craft_salary_positions');
        if (saved) {
          try { setPositions(JSON.parse(saved)); } catch(e) {}
        }
      }
    };
    loadPositions();
  }, []);

  const handleAddPosition = () => {
    if (!newPos.title || newPos.baseValue <= 0) return;
    
    const pos: SalaryPosition = {
      id: Math.random().toString(36).substr(2, 9),
      area: newPos.area || 'GENERAL',
      sector: newPos.sector || 'GENERAL',
      title: newPos.title,
      type: newPos.type,
      baseValue: newPos.baseValue,
      baseMonth: newPos.baseMonth || '2026-05',
      prevBaseValue: newPos.prevBaseValue,
      prevBaseMonth: newPos.prevBaseMonth,
      notes: newPos.notes,
      history: [
        { date: newPos.prevBaseMonth || '2026-01', value: newPos.prevBaseValue },
        { date: newPos.baseMonth || '2026-05', value: newPos.baseValue }
      ].filter(h => h.date && h.value > 0)
    };

    // Ensure there is at least a current entry in history for charting
    if (pos.history && pos.history.length === 0) {
      pos.history.push({ date: pos.baseMonth, value: pos.baseValue });
    }

    setPositions([...positions, pos]);
    setShowAddModal(false);
    setNewPos({ area: '', sector: '', title: '', type: 'hourly', baseValue: 0, baseMonth: '2026-05', prevBaseValue: 0, prevBaseMonth: '', notes: '' });
  };

  const handleRemovePosition = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const confirmed = window.confirm('¿Está seguro de eliminar este puesto de trabajo?');
    if (!confirmed) return;

    setPositions(positions.filter(p => p.id !== id));
    if (selectedPositionId === id) setSelectedPositionId(null);
    setSelectedPostIds(prev => prev.filter(selectedId => selectedId !== id));
  };

  const handleDeleteSelectedPositions = () => {
    const confirmed = window.confirm(`¿Está seguro de eliminar los ${selectedPostIds.length} puestos seleccionados?`);
    if (!confirmed) return;

    setPositions(prev => prev.filter(p => !selectedPostIds.includes(p.id)));
    if (selectedPositionId && selectedPostIds.includes(selectedPositionId)) {
      setSelectedPositionId(null);
    }
    setSelectedPostIds([]);
  };

  // Row Editing handlers
  const handleStartEditRow = (pos: SalaryPosition, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRowId(pos.id);
    setEditRowDraft({ ...pos });
  };

  const handleCancelRowEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRowId(null);
    setEditRowDraft(null);
  };

  const handleSaveRowEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editRowDraft || !editRowDraft.title) return;

    setPositions(prev => prev.map(pos => {
      if (pos.id === editRowDraft.id) {
        // Core updates
        const updated = { ...editRowDraft };
        
        // Re-construct and filter out history entries
        let hist = [...(pos.history || [])];

        // Ensure current active rating exists in history array
        if (updated.baseMonth) {
          const idx = hist.findIndex(h => h.date === updated.baseMonth);
          if (idx >= 0) {
            hist[idx] = { date: updated.baseMonth, value: updated.baseValue };
          } else {
            hist.push({ date: updated.baseMonth, value: updated.baseValue });
          }
        }

        // Ensure previous rating exists in history array
        if (updated.prevBaseMonth && updated.prevBaseValue > 0) {
          const idx = hist.findIndex(h => h.date === updated.prevBaseMonth);
          if (idx >= 0) {
            hist[idx] = { date: updated.prevBaseMonth, value: updated.prevBaseValue };
          } else {
            hist.push({ date: updated.prevBaseMonth, value: updated.prevBaseValue });
          }
        }

        // Remove duplicates and empty dates
        const seenDates = new Set<string>();
        hist = hist.filter(h => {
          if (!h.date || seenDates.has(h.date)) return false;
          seenDates.add(h.date);
          return true;
        });

        // Sort history by year-month chronologically
        hist.sort((a,b) => a.date.localeCompare(b.date));
        updated.history = hist;

        return updated;
      }
      return pos;
    }));

    setEditingRowId(null);
    setEditRowDraft(null);
  };

  // Batch Update Apply Handler
  const handleApplyBatchUpdate = () => {
    if (!batchMonth) {
      alert('Por favor especifique el mes de vigencia.');
      return;
    }

    setPositions(prev => prev.map(pos => {
      // Check if item matches scope filters
      const matchesType = batchScopeType === 'all' || pos.type === batchScopeType;
      
      const uniqueAreas = Array.from(new Set(prev.map(p => p.area.toUpperCase())));
      const matchesArea = batchScopeArea === 'all' || pos.area.toUpperCase() === batchScopeArea.toUpperCase();
      
      if (!matchesType || !matchesArea) return pos;
      
      let newValue = pos.baseValue;
      if (batchMethod === 'percent') {
        newValue = Math.round(pos.baseValue * (1 + (batchPercent || 0) / 100));
      } else {
        newValue = Number(batchManualValues[pos.id] !== undefined ? batchManualValues[pos.id] : pos.baseValue);
      }
      
      // If the value hasn't changed, return as-is
      if (newValue === pos.baseValue && batchMonth === pos.baseMonth) return pos;
      
      // Save current as previous
      const prevVal = pos.baseValue;
      const prevMonthRef = pos.baseMonth;
      
      // Update history array
      let updatedHistory = [...(pos.history || [])];

      // Add actual new month
      const existingNewIdx = updatedHistory.findIndex(h => h.date === batchMonth);
      if (existingNewIdx >= 0) {
        updatedHistory[existingNewIdx] = { date: batchMonth, value: newValue };
      } else {
        updatedHistory.push({ date: batchMonth, value: newValue });
      }

      // Keep previous active value recorded
      if (prevMonthRef) {
        const existingPrevIdx = updatedHistory.findIndex(h => h.date === prevMonthRef);
        if (existingPrevIdx >= 0) {
          updatedHistory[existingPrevIdx] = { date: prevMonthRef, value: prevVal };
        } else {
          updatedHistory.push({ date: prevMonthRef, value: prevVal });
        }
      }

      // Deduplicate and sort
      const seen = new Set<string>();
      updatedHistory = updatedHistory.filter(h => {
        if (!h.date || seen.has(h.date)) return false;
        seen.add(h.date);
        return true;
      });
      updatedHistory.sort((a,b) => a.date.localeCompare(b.date));

      return {
        ...pos,
        prevBaseValue: prevVal,
        prevBaseMonth: prevMonthRef,
        baseValue: newValue,
        baseMonth: batchMonth,
        history: updatedHistory
      };
    }));
    
    setShowBatchUpdateModal(false);
    alert(`Actualización de sueldos aplicada exitosamente para el mes de ${batchMonth}.`);
  };

  const handleExportTemplate = () => {
    const template = [
      { AREA: 'OPERACIONES', SECTOR: 'COCINA', PUESTO: 'Cocinero', TIPO: 'hourly', VALOR_ACTUAL: 3500, MES_ACTUAL: '2026-05', VALOR_ANTERIOR: 3100, MES_REF_ANTERIOR: '2026-02', NOTAS: '' },
      { AREA: 'ADMINISTRACION', SECTOR: 'GERENCIA', PUESTO: 'Gerente', TIPO: 'monthly', VALOR_ACTUAL: 850000, MES_ACTUAL: '2026-05', VALOR_ANTERIOR: 780000, MES_REF_ANTERIOR: '2026-01', NOTAS: 'Bono variables' },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "Plantilla_Maestro_Personal.xlsx");
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);

      const importedPositions: SalaryPosition[] = data.map((item: any) => {
        const id = Math.random().toString(36).substr(2, 9);
        const baseValue = Number(item.VALOR_ACTUAL || 0);
        const baseMonth = String(item.MES_ACTUAL || '2026-05');
        const prevBaseValue = Number(item.VALOR_ANTERIOR || 0);
        const prevBaseMonth = String(item.MES_REF_ANTERIOR || '');
        
        // Interpretar la columna TIPO de forma flexible:
        // "mes", "mensual", "monthly", "por mes" -> monthly
        // "hora", "por hora", "hourly" -> hourly (por defecto)
        const tipoRaw = String(item.TIPO || '').toLowerCase().trim();
        const isMonthly = tipoRaw.includes('mes') || tipoRaw.includes('mensual') || tipoRaw.includes('month');
        const positionType: 'hourly' | 'monthly' = isMonthly ? 'monthly' : 'hourly';

        return {
          id,
          area: String(item.AREA || '').toUpperCase(),
          sector: String(item.SECTOR || '').toUpperCase(),
          title: String(item.PUESTO || '').toUpperCase(),
          type: positionType,
          baseValue,
          baseMonth,
          prevBaseValue,
          prevBaseMonth,
          notes: String(item.NOTAS || ''),
          history: [
            { date: prevBaseMonth || '2026-01', value: prevBaseValue },
            { date: baseMonth || '2026-05', value: baseValue }
          ].filter(h => h.date && h.value > 0)
        };
      });

      setPositions([...positions, ...importedPositions]);
      alert('Se importaron los puestos correctamente desde Excel.');
    };
    reader.readAsBinaryString(file);
  };

  // Import employees from Excel (columns: SUCURSAL, AREA, SECTOR, PUESTO, TIPO, NOMBRE Y APELLIDO)
  const handleImportEmployeesExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Map sucursal name from Excel -> branch_id in the system
    const branchMap: Record<string, string> = {
      'BARRIO NORTE': 'bn', 'BARRIO SUR': 'bs',
      'MERCATO': 'mt', 'CASCO VIEJO': 'mt',
      'PERON': 'pn', 'PERÓN': 'pn',
      'MATE DE LUNA': 'ml', 'MATE': 'ml',
      'ADMINISTRACION': 'admin', 'ADMINISTRACIÓN': 'admin',
      'LIDERES': 'admin', 'LÍDERES': 'admin',
    };

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        if (!data.length) { alert('El archivo está vacío.'); return; }

        const toInsert = data
          .filter((row: any) => row['NOMBRE Y APELLIDO'] && String(row['NOMBRE Y APELLIDO']).trim())
          .map((row: any) => {
            const sucursalRaw = String(row['SUCURSAL'] || '').toUpperCase().trim();
            const branchId = branchMap[sucursalRaw] || sucursalRaw.toLowerCase();
            const position = String(row['PUESTO'] || '').trim().toUpperCase();
            const name = String(row['NOMBRE Y APELLIDO']).trim().toUpperCase();
            return {
              id: `emp-${Math.random().toString(36).substr(2, 9)}`,
              name,
              position,
              branch_id: branchId,
              is_active: true
            };
          });

        if (!toInsert.length) { alert('No se encontraron filas válidas con nombre de empleado.'); return; }

        // Insert in batches of 50
        let inserted = 0;
        for (let i = 0; i < toInsert.length; i += 50) {
          const batch = toInsert.slice(i, i + 50);
          const { error } = await supabase.from('employees').insert(batch);
          if (error) { alert(`Error al importar: ${error.message}`); return; }
          inserted += batch.length;
        }

        alert(`✅ ${inserted} empleados importados correctamente.`);
        fetchEmployees();
      } catch (err: any) {
        alert(`Error procesando el archivo: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // Derived autocomplete suggestion values
  const uniqueAreas: string[] = Array.from(new Set<string>(positions.map(p => p.area.trim().toUpperCase()))).filter(Boolean);
  const uniqueSectors: string[] = Array.from(new Set<string>(positions.map(p => p.sector.trim().toUpperCase()))).filter(Boolean);
  const uniqueTitles: string[] = Array.from(new Set<string>(positions.map(p => p.title.trim().toUpperCase()))).filter(Boolean);

  const filteredPositions = positions.filter(p => {
    return (
      (filters.area === '' || p.area.toUpperCase().includes(filters.area.toUpperCase())) &&
      (filters.sector === '' || p.sector.toUpperCase().includes(filters.sector.toUpperCase())) &&
      (filters.title === '' || p.title.toUpperCase().includes(filters.title.toUpperCase()))
    );
  });

  const selectedPosition = positions.find(p => p.id === selectedPositionId);
  const chartDataSummary = selectedPosition?.history || [];

  // Areas available for filtering inside batch action
  const uniqueAreasList = Array.from(new Set(positions.map(p => p.area.toUpperCase())));

  // Math calculated metrics
  const hourlyWages = positions.filter(p => p.type === 'hourly');
  const avgHourlyWage = hourlyWages.length > 0 
    ? Math.round(hourlyWages.reduce((sum, p) => sum + p.baseValue, 0) / hourlyWages.length)
    : 0;

  const monthlySalaries = positions.filter(p => p.type === 'monthly');
  const totalMonthlySalaries = monthlySalaries.reduce((sum, p) => sum + p.baseValue, 0);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header Panel */}
      <div className="flex flex-wrap justify-between items-end gap-4 bg-bg-card border border-border-dim p-6 rounded-lg">
        <div>
          <h2 className="text-xl font-black uppercase text-text-main tracking-widest flex items-center gap-2">
            <Users className="text-brand-500" size={24} /> Maestro de Personal
          </h2>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 opacity-70">
            Remuneraciones, actualización de sueldos y listado de puestos
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => setShowBatchUpdateModal(true)}
            className="flex items-center gap-2 px-4 py-3 bg-brand-500/10 text-brand-500 border border-brand-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-500/20 transition-all shadow-lg"
          >
            <TrendingUp size={14} /> Actualización de Sueldos
          </button>
          
          <button 
            onClick={handleExportTemplate}
            className="flex items-center gap-2 px-4 py-3 bg-bg-accent text-text-dim border border-border-dim rounded text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent/50 transition-all font-mono"
          >
            <Download size={14} /> Plantilla
          </button>
          
          <label className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all cursor-pointer font-bold">
            <Upload size={14} /> Importar Excel
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
          </label>
          
          <button 
            className="flex items-center gap-2 px-4 py-3 bg-bg-accent border border-border-dim text-text-dim rounded text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent/50 transition-all"
            onClick={() => window.print()}
          >
            <FileText size={14} /> PDF
          </button>
          
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-brand-500 text-black px-6 py-3 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center gap-2 shadow-xl shadow-brand-500/10"
          >
            <Plus size={14} /> Nuevo Puesto / Valor
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex border-b border-border-dim gap-1">
        <button
          onClick={() => setActiveSubTab('positions')}
          className={cn(
            "px-6 py-3.5 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2",
            activeSubTab === 'positions'
              ? "border-brand-500 text-brand-500 bg-brand-500/[0.02]"
              : "border-transparent text-text-dim hover:text-text-main hover:bg-bg-accent/30"
          )}
        >
          <Briefcase size={14} /> Escala Salarial de Puestos
        </button>
        <button
          onClick={() => setActiveSubTab('employees')}
          className={cn(
            "px-6 py-3.5 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2",
            activeSubTab === 'employees'
              ? "border-brand-500 text-brand-500 bg-brand-500/[0.02]"
              : "border-transparent text-text-dim hover:text-text-main hover:bg-bg-accent/30"
          )}
        >
          <Users size={14} /> Maestro de Empleados
        </button>
      </div>

      {activeSubTab === 'positions' && (
        <>
          {/* Filter Options with Autocomplete */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-bg-sidebar border border-border-dim p-4 rounded-lg">
        {/* Area Filter */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
          <input 
            type="text"
            placeholder="FILTRAR POR ÁREA..."
            className="w-full bg-bg-accent border border-border-dim rounded pl-10 pr-4 py-2 text-[10px] font-bold uppercase outline-none focus:border-brand-500 text-text-main"
            value={filters.area}
            onChange={e => {
              setFilters({...filters, area: e.target.value});
              setShowAreaSuggestions(true);
            }}
            onFocus={() => setShowAreaSuggestions(true)}
            onBlur={() => setTimeout(() => setShowAreaSuggestions(false), 250)}
          />
          {showAreaSuggestions && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-bg-card border border-border-dim rounded shadow-2xl z-50 max-h-48 overflow-y-auto divide-y divide-border-dim/30">
              {uniqueAreas
                .filter(a => a.toLowerCase().includes(filters.area.toLowerCase()))
                .map(a => (
                  <button
                    key={a}
                    type="button"
                    onMouseDown={() => {
                      setFilters({...filters, area: a});
                      setShowAreaSuggestions(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase hover:bg-brand-500 hover:text-black transition-colors block cursor-pointer",
                      filters.area.toUpperCase() === a ? "bg-brand-500/10 text-brand-500" : "text-text-main"
                    )}
                  >
                    {a}
                  </button>
                ))}
              {uniqueAreas.filter(a => a.toLowerCase().includes(filters.area.toLowerCase())).length === 0 && (
                <div className="px-4 py-2 text-[9px] text-text-dim uppercase italic">Sin coincidencias</div>
              )}
            </div>
          )}
        </div>

        {/* Sector Filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
          <input 
            type="text"
            placeholder="FILTRAR POR SECTOR..."
            className="w-full bg-bg-accent border border-border-dim rounded pl-10 pr-4 py-2 text-[10px] font-bold uppercase outline-none focus:border-brand-500 text-text-main"
            value={filters.sector}
            onChange={e => {
              setFilters({...filters, sector: e.target.value});
              setShowSectorSuggestions(true);
            }}
            onFocus={() => setShowSectorSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSectorSuggestions(false), 250)}
          />
          {showSectorSuggestions && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-bg-card border border-border-dim rounded shadow-2xl z-50 max-h-48 overflow-y-auto divide-y divide-border-dim/30">
              {uniqueSectors
                .filter(s => s.toLowerCase().includes(filters.sector.toLowerCase()))
                .map(s => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={() => {
                      setFilters({...filters, sector: s});
                      setShowSectorSuggestions(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase hover:bg-brand-500 hover:text-black transition-colors block cursor-pointer",
                      filters.sector.toUpperCase() === s ? "bg-brand-500/10 text-brand-500" : "text-text-main"
                    )}
                  >
                    {s}
                  </button>
                ))}
              {uniqueSectors.filter(s => s.toLowerCase().includes(filters.sector.toLowerCase())).length === 0 && (
                <div className="px-4 py-2 text-[9px] text-text-dim uppercase italic">Sin coincidencias</div>
              )}
            </div>
          )}
        </div>

        {/* Puesto (Title) Filter */}
        <div className="relative">
          <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
          <input 
            type="text"
            placeholder="FILTRAR POR PUESTO..."
            className="w-full bg-bg-accent border border-border-dim rounded pl-10 pr-4 py-2 text-[10px] font-bold uppercase outline-none focus:border-brand-500 text-text-main"
            value={filters.title}
            onChange={e => {
              setFilters({...filters, title: e.target.value});
              setShowTitleSuggestions(true);
            }}
            onFocus={() => setShowTitleSuggestions(true)}
            onBlur={() => setTimeout(() => setShowTitleSuggestions(false), 250)}
          />
          {showTitleSuggestions && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-bg-card border border-border-dim rounded shadow-2xl z-50 max-h-48 overflow-y-auto divide-y divide-border-dim/30">
              {uniqueTitles
                .filter(t => t.toLowerCase().includes(filters.title.toLowerCase()))
                .map(t => (
                  <button
                    key={t}
                    type="button"
                    onMouseDown={() => {
                      setFilters({...filters, title: t});
                      setShowTitleSuggestions(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase hover:bg-brand-500 hover:text-black transition-colors block cursor-pointer",
                      filters.title.toUpperCase() === t ? "bg-brand-500/10 text-brand-500" : "text-text-main"
                    )}
                  >
                    {t}
                  </button>
                ))}
              {uniqueTitles.filter(t => t.toLowerCase().includes(filters.title.toLowerCase())).length === 0 && (
                <div className="px-4 py-2 text-[9px] text-text-dim uppercase italic">Sin coincidencias</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Positions Table */}
        <div className="lg:col-span-2 bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-2xl flex flex-col justify-between">
          <div>
            <div className="p-4 border-b border-border-dim bg-bg-accent/30 flex justify-between items-center flex-wrap gap-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-text-main">
                LISTADO DE PUESTOS Y REMUNERACIONES
              </h3>
              <div className="flex items-center gap-2">
                {selectedPostIds.length > 0 && (
                  <button
                    onClick={handleDeleteSelectedPositions}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-400/20 text-red-400 hover:bg-red-400/35 border border-red-500/30 rounded text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-md"
                  >
                    <Trash2 size={11} /> Eliminar Seleccionados ({selectedPostIds.length})
                  </button>
                )}
                <span className="text-[10px] font-mono text-brand-500 px-2 py-0.5 bg-brand-500/10 border border-brand-500/20 rounded font-bold">
                  {filteredPositions.length} puestos cargados
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg-accent border-b border-border-dim font-black text-[10px] uppercase text-text-dim tracking-widest">
                    <th className="px-4 py-4 w-12 text-center">
                      <input 
                        type="checkbox" 
                        checked={filteredPositions.length > 0 && filteredPositions.every(p => selectedPostIds.includes(p.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPostIds(prev => {
                              const nextSet = new Set([...prev, ...filteredPositions.map(p => p.id)]);
                              return Array.from(nextSet);
                            });
                          } else {
                            setSelectedPostIds(prev => prev.filter(id => !filteredPositions.some(p => p.id === id)));
                          }
                        }}
                        className="cursor-pointer accent-brand-500 w-4 h-4 rounded"
                      />
                    </th>
                    <th className="px-5 py-4">ÁREA</th>
                    <th className="px-5 py-4">SECTOR</th>
                    <th className="px-5 py-4">PUESTO</th>
                    <th className="px-5 py-4">Tipo</th>
                    <th className="px-5 py-4 text-right">Valor Ant.</th>
                    <th className="px-5 py-4 text-right">Valor Act.</th>
                    <th className="px-5 py-4 text-center">Aumento</th>
                    <th className="px-5 py-4">Notas</th>
                    <th className="px-5 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim/50">
                  {filteredPositions.map(pos => {
                    const isEditing = editingRowId === pos.id;
                    const increase = pos.prevBaseValue > 0 ? ((pos.baseValue - pos.prevBaseValue) / pos.prevBaseValue) * 100 : 0;
                    const isSelected = selectedPositionId === pos.id;
                    
                    if (isEditing && editRowDraft) {
                      const computedIncrease = editRowDraft.prevBaseValue > 0 
                        ? ((editRowDraft.baseValue - editRowDraft.prevBaseValue) / editRowDraft.prevBaseValue) * 100 
                        : 0;

                      return (
                        <tr key={pos.id} className="bg-brand-500/[0.04] border-l-2 border-brand-500 leading-normal text-[11px]" onClick={e => e.stopPropagation()}>
                          <td className="px-4 py-3 text-center w-12">
                            <input 
                              type="checkbox" 
                              disabled 
                              className="opacity-40"
                            />
                          </td>
                          <td className="px-2 py-3">
                            <input 
                              type="text"
                              value={editRowDraft.area}
                              onChange={e => setEditRowDraft({...editRowDraft, area: e.target.value.toUpperCase()})}
                              className="w-full bg-bg-card font-bold uppercase text-text-main border border-border-dim rounded px-2 py-1 outline-none focus:border-brand-500 text-[10px]"
                            />
                          </td>
                          <td className="px-2 py-3">
                            <input 
                              type="text"
                              value={editRowDraft.sector}
                              onChange={e => setEditRowDraft({...editRowDraft, sector: e.target.value.toUpperCase()})}
                              className="w-full bg-bg-card font-bold uppercase text-text-main border border-border-dim rounded px-2 py-1 outline-none focus:border-brand-500 text-[10px]"
                            />
                          </td>
                          <td className="px-2 py-3">
                            <input 
                              type="text"
                              value={editRowDraft.title}
                              onChange={e => setEditRowDraft({...editRowDraft, title: e.target.value})}
                              className="w-full bg-bg-card font-bold text-text-main border border-border-dim rounded px-2 py-1 outline-none focus:border-brand-500 text-[10px]"
                            />
                          </td>
                          <td className="px-2 py-3">
                            <select 
                              value={editRowDraft.type}
                              onChange={e => setEditRowDraft({...editRowDraft, type: e.target.value as any})}
                              className="w-full bg-bg-card text-text-main border border-border-dim rounded px-1 py-1 font-bold text-[10px] outline-none"
                            >
                              <option value="hourly">H</option>
                              <option value="monthly">M</option>
                            </select>
                          </td>
                          <td className="px-2 py-3 text-right">
                            <div className="flex flex-col gap-1 items-end">
                              <input 
                                type="number"
                                value={editRowDraft.prevBaseValue || ''}
                                onChange={e => setEditRowDraft({...editRowDraft, prevBaseValue: parseFloat(e.target.value) || 0})}
                                className="w-20 bg-bg-card font-mono text-right text-text-main border border-border-dim rounded px-2 py-1 outline-none focus:border-brand-500 text-[10px]"
                              />
                              <input 
                                type="month"
                                value={editRowDraft.prevBaseMonth}
                                onChange={e => setEditRowDraft({...editRowDraft, prevBaseMonth: e.target.value})}
                                className="w-24 bg-bg-card text-[9px] border border-border-dim rounded px-1 py-0.5 outline-none font-bold"
                              />
                            </div>
                          </td>
                          <td className="px-2 py-3 text-right">
                            <div className="flex flex-col gap-1 items-end">
                              <input 
                                type="number"
                                value={editRowDraft.baseValue || ''}
                                onChange={e => setEditRowDraft({...editRowDraft, baseValue: parseFloat(e.target.value) || 0})}
                                className="w-20 bg-bg-card font-mono font-bold text-right text-text-main border border-border-dim rounded px-2 py-1 outline-none focus:border-brand-500 text-[10px]"
                              />
                              <input 
                                type="month"
                                value={editRowDraft.baseMonth}
                                onChange={e => setEditRowDraft({...editRowDraft, baseMonth: e.target.value})}
                                className="w-24 bg-bg-card text-[9px] border border-border-dim rounded px-1 py-0.5 outline-none font-bold"
                              />
                            </div>
                          </td>
                          <td className="px-2 py-3 text-center">
                            <span className={cn(
                              "px-2 py-1 rounded-full text-[9px] font-black font-mono",
                              computedIncrease > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-text-dim/10 text-text-dim"
                            )}>
                              +{computedIncrease.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-2 py-3">
                            <input 
                              type="text"
                              value={editRowDraft.notes || ''}
                              onChange={e => setEditRowDraft({...editRowDraft, notes: e.target.value})}
                              placeholder="Notas..."
                              className="w-full bg-bg-card text-text-main border border-border-dim rounded px-2 py-1 outline-none focus:border-brand-500 text-[10px]"
                            />
                          </td>
                          <td className="px-2 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <button 
                                onClick={handleSaveRowEdit}
                                title="Guardar cambios"
                                className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 border border-emerald-500/20 rounded transition-colors"
                              >
                                <Check size={12} />
                              </button>
                              <button 
                                onClick={handleCancelRowEdit}
                                title="Cancelar"
                                className="p-1.5 text-red-500 hover:bg-red-500/10 border border-red-500/20 rounded transition-colors"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr 
                        key={pos.id} 
                        onClick={() => setSelectedPositionId(pos.id)}
                        className={cn(
                          "hover:bg-bg-accent/10 transition-colors group text-[11px] cursor-pointer",
                          isSelected && "bg-brand-500/5 border-l-2 border-brand-500"
                        )}
                      >
                        <td className="px-4 py-4 text-center w-12" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox"
                            checked={selectedPostIds.includes(pos.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedPostIds(prev => [...prev, pos.id]);
                              } else {
                                setSelectedPostIds(prev => prev.filter(id => id !== pos.id));
                              }
                            }}
                            className="cursor-pointer accent-brand-500 w-4 h-4 rounded"
                          />
                        </td>
                        <td className="px-5 py-4 font-bold text-text-dim uppercase">{pos.area}</td>
                        <td className="px-5 py-4 font-bold text-text-dim uppercase">{pos.sector}</td>
                        <td className="px-5 py-4 font-bold text-text-main uppercase">{pos.title}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-[8px] font-black uppercase px-2 py-0.5 rounded",
                              pos.type === 'hourly' ? "bg-blue-500/10 text-blue-500" : "bg-emerald-500/10 text-emerald-500 mr-1"
                            )}>
                              {pos.type === 'hourly' ? 'POR HORA' : 'MENSUAL'}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-mono text-text-dim opacity-70">${pos.prevBaseValue.toLocaleString('es-AR')}</span>
                            {pos.prevBaseMonth && (
                              <span className="text-[8px] font-black uppercase text-brand-500 opacity-60">REF: {pos.prevBaseMonth}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-mono font-bold text-text-main">${pos.baseValue.toLocaleString('es-AR')}</span>
                            {pos.baseMonth && (
                              <span className="text-[8px] font-black uppercase text-brand-500 opacity-60">REF: {pos.baseMonth}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-[9px] font-black font-mono",
                            increase > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-text-dim/10 text-text-dim"
                          )}>
                            +{increase.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-[10px] text-text-dim italic leading-tight block max-w-[150px] truncate group-hover:whitespace-normal group-hover:overflow-visible group-hover:max-w-none transition-all">
                            {pos.notes || '-'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <button 
                              onClick={(e) => handleStartEditRow(pos, e)}
                              title="Editar renglón"
                              className="p-1.5 text-text-dim hover:text-brand-500 hover:bg-brand-500/10 rounded border border-transparent hover:border-brand-500/20 transition-colors"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button 
                              onClick={(e) => handleRemovePosition(pos.id, e)}
                              title="Eliminar puesto"
                              className="p-1.5 text-text-dim hover:text-red-500 hover:bg-red-500/10 rounded border border-transparent hover:border-red-500/20 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredPositions.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-text-dim">
                        No se encontraron puestos que coincidan con los filtros de búsqueda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="p-4 bg-bg-accent/20 border-t border-border-dim text-[10px] font-medium text-text-dim leading-snug">
            💡 Haga clic en cualquier fila para cargar su historial salarial y gráfico analítico en el panel derecho.
          </div>
        </div>

        {/* Sidebar Analytics */}
        <div className="space-y-6">
          {/* Chart Section */}
          <div className="bg-bg-card border border-border-dim rounded-lg p-6">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-main mb-6 flex items-center gap-2">
              <BarChart3 size={14} className="text-brand-500" /> Evolución Salarial
            </h4>
            
            {selectedPosition ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-bg-accent p-3 rounded border border-border-dim">
                  <span className="text-[10px] font-bold uppercase text-text-dim">{selectedPosition.title}</span>
                  <span className="text-[10px] font-black uppercase text-brand-500">{selectedPosition.sector}</span>
                </div>
                
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartDataSummary}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        stroke="#666" 
                        fontSize={8} 
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        stroke="#666" 
                        fontSize={8} 
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val) => `$${val > 10000 ? (val/1000).toFixed(0) + 'k' : val}`}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#000', border: '1px solid #333', fontSize: '10px' }}
                        itemStyle={{ color: '#F0B90B' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#F0B90B" 
                        strokeWidth={2}
                        dot={{ fill: '#F0B90B' }}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex flex-col items-center justify-center border-2 border-dashed border-border-dim rounded bg-bg-accent/30 text-center p-4">
                <div className="p-3 bg-bg-accent rounded-full mb-3">
                   <Users size={20} className="text-text-dim/40" />
                </div>
                <p className="text-[9px] font-bold uppercase text-text-dim leading-relaxed">
                  Seleccione un puesto de la tabla<br/>para ver la evolución de valores
                </p>
              </div>
            )}
          </div>

          {/* Accumulative Increase Panel */}
          <div className="bg-bg-card border border-border-dim rounded-lg p-6">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-main mb-6 flex items-center gap-2">
              <TrendingUp size={14} className="text-brand-500" /> Aumento Acumulado 2026
            </h4>
            <div className="space-y-4">
              <div className="overflow-hidden rounded border border-border-dim max-h-[160px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-[9px]">
                  <thead>
                    <tr className="bg-bg-accent border-b border-border-dim font-black uppercase text-text-dim">
                      <th className="px-3 py-2">Puesto</th>
                      <th className="px-3 py-2 text-right">Acum. %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dim/50">
                    {filteredPositions.map(pos => {
                      const firstValue = pos.prevBaseValue > 0 ? pos.prevBaseValue : (pos.history && pos.history.length > 0 ? pos.history[0].value : pos.baseValue);
                      const currentValue = pos.baseValue;
                      const accumIncrease = firstValue > 0 ? ((currentValue - firstValue) / firstValue) * 100 : 0;
                      
                      return (
                        <tr key={pos.id} className="hover:bg-bg-accent/55 transition-colors">
                          <td className="px-3 py-2 font-bold text-text-dim truncate max-w-[120px]">{pos.title}</td>
                          <td className="px-3 py-2 text-right">
                             <span className={cn(
                               "px-2 py-0.5 rounded font-black font-mono",
                               accumIncrease > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-text-dim/10 text-text-dim"
                             )}>
                               +{accumIncrease.toFixed(1)}%
                             </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[8px] text-text-dim italic leading-tight">
                * Calculado desde el primer registro del año 2026 hasta el valor vigente actual.
              </p>
            </div>
          </div>

          {/* Cost Estimates */}
          <div className="bg-bg-card border border-border-dim rounded-lg p-6">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-main mb-6 flex items-center gap-2">
              <TrendingUp size={14} className="text-brand-500" /> Resumen de Costos Maestro
            </h4>
            <div className="space-y-4">
              <div className="p-4 bg-bg-accent rounded-lg border border-border-dim">
                <p className="text-[9px] text-text-dim uppercase font-bold">Promedio Valor de Hora</p>
                <div className="flex items-end justify-between mt-1">
                  <p className="text-xl font-black font-mono text-text-main">
                    ${avgHourlyWage.toLocaleString('es-AR')}
                  </p>
                  <span className="text-[10px] text-emerald-500 font-bold tracking-tighter">VIGENTE</span>
                </div>
              </div>
              <div className="p-4 bg-bg-accent rounded-lg border border-border-dim">
                <p className="text-[9px] text-text-dim uppercase font-bold">Masa Mensual Puestos Fijos</p>
                <div className="flex items-end justify-between mt-1">
                  <p className="text-xl font-black font-mono text-text-main">
                    ${totalMonthlySalaries.toLocaleString('es-AR')}
                  </p>
                  <span className="text-[10px] text-text-dim font-bold tracking-tighter">CONSOLIDADO</span>
                </div>
              </div>
            </div>
          </div>

          {/* Auditor Note */}
          <div className="bg-brand-500/5 border border-brand-500/20 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-brand-500/20 rounded">
                <AlertCircle size={18} className="text-brand-500" />
              </div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-500">Nota de Auditoría</h4>
            </div>
            <p className="text-[11px] text-text-main leading-relaxed">
              Cualquier modificación en los valores de remuneración impactará directamente en los cálculos de <span className="font-bold">Estado de Resultado</span> y <span className="font-bold">Presupuesto de Horas</span>. Asegúrese de realizar cambios sólo bajo supervisión general.
            </p>
            <div className="mt-4 flex items-center gap-2 text-[9px] font-black uppercase text-brand-500">
               <CheckCircle2 size={12} /> Valores de Puestos Validados
            </div>
          </div>
        </div>
      </div>
        </>
      )}

      {activeSubTab === 'employees' && (
        <div className="space-y-6">
          {/* Employee Master Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-bg-sidebar border border-border-dim p-4 rounded-lg">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
              <input 
                type="text"
                placeholder="BUSCAR EMPLEADO POR NOMBRE O APELLIDO..."
                className="w-full bg-bg-accent border border-border-dim rounded pl-10 pr-4 py-2 text-[10px] font-bold uppercase outline-none focus:border-brand-500"
                value={empSearch}
                onChange={e => setEmpSearch(e.target.value)}
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
              <select
                className="w-full bg-bg-accent border border-border-dim rounded pl-10 pr-4 py-3.5 text-[10px] font-bold uppercase outline-none focus:border-brand-500 appearance-none text-text-main"
                value={empBranchFilter}
                onChange={e => setEmpBranchFilter(e.target.value)}
              >
                <option value="all">TODAS LAS SUCURSALES</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end pr-1 gap-2">
              <label className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all cursor-pointer">
                <Upload size={14} /> Importar Excel
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportEmployeesExcel} />
              </label>
              <button
                onClick={() => {
                  setEditingEmployee(null);
                  setEmployeeForm({ name: '', position: 'mozos', branchId: branches[0]?.id || '1' });
                  setShowEmployeeModal(true);
                }}
                className="bg-brand-500 text-black px-6 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center gap-2 shadow-xl shadow-brand-500/10 h-full"
              >
                <Plus size={14} /> Cargar Nuevo Empleado
              </button>
            </div>
          </div>

          {/* Table list of employees */}
          <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-border-dim bg-bg-accent/30 flex justify-between items-center">
              <h3 className="text-xs font-black uppercase tracking-widest text-text-main">
                Nómina Oficial de Empleados (Maestro de Personal)
              </h3>
              <span className="text-[10px] font-mono text-brand-500 px-2 py-0.5 bg-brand-500/10 border border-brand-500/20 rounded font-bold font-sans">
                {filteredEmployees.length} empleados registrados
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg-accent border-b border-border-dim">
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">NOMBRE Y APELLIDO</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">PUESTO</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">SUCURSAL</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">ACCIONES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim/50">
                  {employeesLoading && (
                    <tr>
                      <td colSpan={4} className="text-center py-8">
                        <span className="text-xs font-bold text-text-dim uppercase tracking-widest animate-pulse">Cargando nómina...</span>
                      </td>
                    </tr>
                  )}
                  {!employeesLoading && filteredEmployees.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-12 text-text-dim">
                        <span className="text-xs font-bold uppercase tracking-widest opacity-40">No hay empleados registrados en esta selección</span>
                      </td>
                    </tr>
                  )}
                  {filteredEmployees.map(emp => {
                    const branchName = branches.find(b => b.id === emp.branchId)?.name || `SUCURSAL ${emp.branchId}`;
                    const pLabel = ROLES.find(r => r.id === emp.position)?.label || emp.position;
                    
                    return (
                      <tr key={emp.id} className="hover:bg-bg-accent/30 transition-colors">
                        <td className="px-6 py-4 text-[11px] font-bold text-text-main uppercase font-sans tracking-wide">
                          {emp.name}
                        </td>
                        <td className="px-6 py-4 text-[11.5px] font-bold text-text-dim uppercase">
                          <span className="px-2 py-1 bg-brand-500/5 text-brand-500 rounded border border-brand-500/10 text-[9px] font-black uppercase">
                            {pLabel}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[11px] font-bold text-text-dim uppercase">
                          {branchName}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingEmployee(emp);
                                setEmployeeForm({
                                  name: emp.name,
                                  position: emp.position,
                                  branchId: emp.branchId
                                });
                                setShowEmployeeModal(true);
                              }}
                              className="text-text-dim hover:text-brand-500 p-1.5 border border-border-dim hover:border-brand-500/30 rounded bg-bg-accent/30 hover:bg-brand-500/5 transition-all text-[10px] font-bold uppercase flex items-center gap-1"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleDeleteEmployee(emp.id)}
                              className="text-text-dim hover:text-red-500 p-1.5 border border-border-dim hover:border-red-500/30 rounded bg-bg-accent/30 hover:bg-red-500/5 transition-all text-[10px] font-bold uppercase flex items-center gap-1"
                            >
                              Eliminar
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
        </div>
      )}

      {/* Batch Salary Update Modal ("Actualización de Sueldos") */}
      <AnimatePresence>
        {showBatchUpdateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBatchUpdateModal(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl bg-bg-card border border-border-dim rounded-lg shadow-2xl p-6 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex justify-between items-start border-b border-border-dim pb-4 mb-6">
                <div>
                  <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest border-l-2 border-brand-500 pl-4">
                    Actualización General de Sueldos
                  </h3>
                  <p className="text-[10px] text-text-dim font-bold uppercase tracking-wider mt-1 pl-4">
                    Cargar y recalcular valores de remuneración por lote
                  </p>
                </div>
                <button 
                  onClick={() => setShowBatchUpdateModal(false)}
                  className="p-1 text-text-dim hover:text-text-main rounded hover:bg-bg-accent transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              
              <div className="space-y-5 overflow-y-auto flex-1 pr-1">
                {/* Reference Update Month */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-bg-accent/40 p-4 rounded border border-border-dim">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text-main uppercase tracking-wider block">Mes de Vigencia de los Nuevos Sueldos</label>
                    <input 
                      type="month"
                      value={batchMonth}
                      onChange={e => setBatchMonth(e.target.value)}
                      className="w-full bg-bg-card border border-border-dim rounded px-4 py-3 text-xs text-text-main font-bold outline-none focus:border-brand-500"
                    />
                    <p className="text-[8px] text-text-dim italic mt-1">Especifique el mes correspondiente al aumento, ej: Agosto (2026-08)</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text-main uppercase tracking-wider block">Método de Carga / Incremento</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <button 
                        type="button"
                        onClick={() => setBatchMethod('percent')}
                        className={cn(
                          "py-2.5 rounded text-[10px] font-black uppercase tracking-widest border transition-all",
                          batchMethod === 'percent' 
                            ? "bg-brand-500 text-black border-brand-500 font-black" 
                            : "bg-bg-accent text-text-dim border-border-dim hover:bg-bg-accent/50"
                        )}
                      >
                        Aumento % Masivo
                      </button>
                      <button 
                        type="button"
                        onClick={() => setBatchMethod('manual')}
                        className={cn(
                          "py-2.5 rounded text-[10px] font-black uppercase tracking-widest border transition-all",
                          batchMethod === 'manual' 
                            ? "bg-brand-500 text-black border-brand-500 font-black" 
                            : "bg-bg-accent text-text-dim border-border-dim hover:bg-bg-accent/50"
                        )}
                      >
                        Carga Manual
                      </button>
                    </div>
                  </div>
                </div>

                {/* Scope Filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-dim uppercase">Filtrar por Modalidad</label>
                    <select 
                      value={batchScopeType}
                      onChange={e => setBatchScopeType(e.target.value as any)}
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main font-bold outline-none"
                    >
                      <option value="all">TODOS LOS PUESTOS</option>
                      <option value="hourly">SÓLO VALORES POR HORA</option>
                      <option value="monthly">SÓLO SUELDOS MENSUALES</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-dim uppercase">Filtrar por Área</label>
                    <select 
                      value={batchScopeArea}
                      onChange={e => setBatchScopeArea(e.target.value)}
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main font-bold outline-none uppercase"
                    >
                      <option value="all">TODAS LAS ÁREAS</option>
                      {uniqueAreasList.map(area => (
                        <option key={area} value={area}>{area}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Percentage Increment Form */}
                {batchMethod === 'percent' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-brand-500/[0.02] border border-brand-500/20 rounded-lg space-y-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-1/3 space-y-1">
                        <label className="text-[10px] font-black text-brand-500 uppercase">Incremento (%)</label>
                        <div className="relative">
                          <input 
                            type="number"
                            value={batchPercent}
                            onChange={e => setBatchPercent(parseFloat(e.target.value) || 0)}
                            className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-sm font-mono font-black text-text-main outline-none focus:border-brand-500"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-text-dim">%</span>
                        </div>
                      </div>
                      <div className="w-2/3 text-[11px] text-text-dim leading-relaxed">
                        Se sumará un <span className="font-bold text-emerald-500">{batchPercent}%</span> a los valores vigentes de los puestos que coincidan con los filtros configurados arriba.<br />
                        Los valores actuales serán guardados en el historial como el <span className="font-bold">Valor anterior</span>.
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Manual Batch Entry Form */}
                {batchMethod === 'manual' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    <label className="text-[10px] font-black text-text-dim uppercase tracking-wider block">Inserte el nuevo sueldo/valor para cada renglón de puesto</label>
                    
                    <div className="border border-border-dim rounded-lg overflow-hidden max-h-[250px] overflow-y-auto">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-bg-accent text-text-dim border-b border-border-dim font-black uppercase text-[10px]">
                            <th className="px-4 py-3">Puesto</th>
                            <th className="px-4 py-3 text-right">Valor actual</th>
                            <th className="px-4 py-3 text-right w-44">Nuevo valor ($)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-dim/40 max-h-[150px]">
                          {positions
                            .filter(pos => {
                              const matchesType = batchScopeType === 'all' || pos.type === batchScopeType;
                              const matchesArea = batchScopeArea === 'all' || pos.area.toUpperCase() === batchScopeArea.toUpperCase();
                              return matchesType && matchesArea;
                            })
                            .map(pos => (
                              <tr key={pos.id} className="hover:bg-bg-accent/40 font-medium">
                                <td className="px-4 py-3 flex flex-col">
                                  <span className="font-bold text-text-main">{pos.title}</span>
                                  <span className="text-[9px] text-text-dim uppercase font-semibold">{pos.area} / {pos.sector}</span>
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-text-dim">
                                  ${pos.baseValue.toLocaleString()}{pos.type === 'hourly' ? '/h' : ''}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="relative flex justify-end">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={12} />
                                    <input 
                                      type="number"
                                      value={batchManualValues[pos.id] !== undefined ? batchManualValues[pos.id] : ''}
                                      onChange={e => setBatchManualValues({
                                        ...batchManualValues,
                                        [pos.id]: parseFloat(e.target.value) || 0
                                      })}
                                      placeholder={pos.baseValue.toString()}
                                      className="bg-bg-accent border border-border-dim rounded pl-8 pr-3 py-1.5 w-36 font-mono text-xs text-right text-text-main outline-none focus:border-brand-500 font-bold"
                                    />
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="mt-8 pt-4 border-t border-border-dim flex gap-3">
                <button 
                  onClick={handleApplyBatchUpdate}
                  className="flex-1 bg-brand-500 text-black py-4 rounded text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10 flex items-center justify-center gap-2"
                >
                  <Check size={14} /> Aplicar Actualizaciones
                </button>
                <button 
                  onClick={() => setShowBatchUpdateModal(false)}
                  className="px-8 py-4 rounded border border-border-dim text-text-dim text-[11px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Insert Modal (Single New Position Add) */}
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
              <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest mb-6 border-l-2 border-brand-500 pl-4">
                Configurar Nuevo Puesto / Sueldo
              </h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 relative">
                    <label className="text-[10px] font-bold text-text-dim uppercase">Área</label>
                    <input 
                      type="text" 
                      placeholder="Ej: OPERACIONES..."
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 uppercase font-bold"
                      value={newPos.area}
                      onChange={e => {
                        setNewPos({...newPos, area: e.target.value.toUpperCase()});
                        setShowAddModalAreaSuggestions(true);
                      }}
                      onFocus={() => setShowAddModalAreaSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowAddModalAreaSuggestions(false), 250)}
                    />
                    {showAddModalAreaSuggestions && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-bg-card border border-border-dim rounded shadow-2xl z-50 max-h-32 overflow-y-auto divide-y divide-border-dim/30">
                        {uniqueAreas
                          .filter(a => a.toLowerCase().includes(newPos.area.toLowerCase()))
                          .map(a => (
                            <button
                              key={a}
                              type="button"
                              onMouseDown={() => {
                                setNewPos({...newPos, area: a});
                                setShowAddModalAreaSuggestions(false);
                              }}
                              className="w-full text-left px-3 py-2 text-[10px] font-bold uppercase hover:bg-brand-500 hover:text-black transition-colors block cursor-pointer text-text-main"
                            >
                              {a}
                            </button>
                          ))}
                        {uniqueAreas.filter(a => a.toLowerCase().includes(newPos.area.toLowerCase())).length === 0 && (
                          <div className="px-3 py-2 text-[9px] text-text-dim uppercase italic">Sin coincidencias</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 relative">
                    <label className="text-[10px] font-bold text-text-dim uppercase">Sector</label>
                    <input 
                      type="text" 
                      placeholder="Ej: SALON, COCINA..."
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 uppercase font-bold"
                      value={newPos.sector}
                      onChange={e => {
                        setNewPos({...newPos, sector: e.target.value.toUpperCase()});
                        setShowAddModalSectorSuggestions(true);
                      }}
                      onFocus={() => setShowAddModalSectorSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowAddModalSectorSuggestions(false), 250)}
                    />
                    {showAddModalSectorSuggestions && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-bg-card border border-border-dim rounded shadow-2xl z-50 max-h-32 overflow-y-auto divide-y divide-border-dim/30">
                        {uniqueSectors
                          .filter(s => s.toLowerCase().includes(newPos.sector.toLowerCase()))
                          .map(s => (
                            <button
                              key={s}
                              type="button"
                              onMouseDown={() => {
                                setNewPos({...newPos, sector: s});
                                setShowAddModalSectorSuggestions(false);
                              }}
                              className="w-full text-left px-3 py-2 text-[10px] font-bold uppercase hover:bg-brand-500 hover:text-black transition-colors block cursor-pointer text-text-main"
                            >
                              {s}
                            </button>
                          ))}
                        {uniqueSectors.filter(s => s.toLowerCase().includes(newPos.sector.toLowerCase())).length === 0 && (
                          <div className="px-3 py-2 text-[9px] text-text-dim uppercase italic">Sin coincidencias</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2 relative">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Puesto de Trabajo</label>
                  <input 
                    type="text" 
                    placeholder="Ej: AYUDANTE, MOZO, ENCARGADO..."
                    className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 uppercase font-bold"
                    value={newPos.title}
                    onChange={e => {
                      setNewPos({...newPos, title: e.target.value.toUpperCase()});
                      setShowAddModalTitleSuggestions(true);
                    }}
                    onFocus={() => setShowAddModalTitleSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowAddModalTitleSuggestions(false), 250)}
                  />
                  {showAddModalTitleSuggestions && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-bg-card border border-border-dim rounded shadow-2xl z-50 max-h-32 overflow-y-auto divide-y divide-border-dim/30">
                      {uniqueTitles
                        .filter(t => t.toLowerCase().includes(newPos.title.toLowerCase()))
                        .map(t => (
                          <button
                            key={t}
                            type="button"
                            onMouseDown={() => {
                              setNewPos({...newPos, title: t});
                              setShowAddModalTitleSuggestions(false);
                            }}
                            className="w-full text-left px-3 py-2 text-[10px] font-bold uppercase hover:bg-brand-500 hover:text-black transition-colors block cursor-pointer text-text-main"
                          >
                            {t}
                          </button>
                        ))}
                      {uniqueTitles.filter(t => t.toLowerCase().includes(newPos.title.toLowerCase())).length === 0 && (
                        <div className="px-3 py-2 text-[9px] text-text-dim uppercase italic">Sin coincidencias</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-dim uppercase">Modalidad</label>
                    <select 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-bold uppercase transition-all"
                      value={newPos.type}
                      onChange={e => setNewPos({...newPos, type: e.target.value as any})}
                    >
                      <option value="hourly">Por Hora</option>
                      <option value="monthly">Mensual</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-dim uppercase">Valor Anterior ($)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
                      <input 
                        type="number" 
                        placeholder="0.00"
                        className="w-full bg-bg-accent border border-border-dim rounded pl-8 pr-4 py-3 text-xs text-text-main font-mono outline-none focus:border-brand-500"
                        value={newPos.prevBaseValue || ''}
                        onChange={e => setNewPos({...newPos, prevBaseValue: parseFloat(e.target.value)})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-dim uppercase">Mes Ref. Anterior</label>
                    <input 
                      type="month" 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-bold"
                      value={newPos.prevBaseMonth}
                      onChange={e => setNewPos({...newPos, prevBaseMonth: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-dim uppercase">Valor Vigente ($)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
                      <input 
                        type="number" 
                        placeholder="0.00"
                        className="w-full bg-bg-accent border border-border-dim rounded pl-8 pr-4 py-3 text-xs text-text-main font-mono outline-none focus:border-brand-500"
                        value={newPos.baseValue || ''}
                        onChange={e => setNewPos({...newPos, baseValue: parseFloat(e.target.value) || 0})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-dim uppercase">Mes Vigencia Actual</label>
                    <input 
                      type="month" 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-bold"
                      value={newPos.baseMonth}
                      onChange={e => setNewPos({...newPos, baseMonth: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Notas / Premios / Variables</label>
                  <textarea 
                    placeholder="Ej: Bono por puntualidad, premios por ventas..."
                    rows={2}
                    className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 resize-none"
                    value={newPos.notes}
                    onChange={e => setNewPos({...newPos, notes: e.target.value})}
                  />
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button 
                  onClick={handleAddPosition}
                  className="flex-1 bg-brand-500 text-black py-4 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10"
                >
                  Registrar Puesto
                </button>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="px-8 py-4 rounded border border-border-dim text-text-dim text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all animate-none"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Employee Management Form Modal */}
      <AnimatePresence>
        {showEmployeeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowEmployeeModal(false);
                setEditingEmployee(null);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-bg-card border border-border-dim rounded-lg shadow-2xl p-6"
            >
              <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest mb-6 border-l-2 border-brand-500 pl-4">
                {editingEmployee ? 'Editar Ficha de Empleado' : 'Cargar Nuevo Empleado en Maestro'}
              </h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Nombre y Apellido</label>
                  <input 
                    type="text" 
                    placeholder="Ej: JUAN PEREZ..."
                    className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 uppercase font-bold font-sans"
                    value={employeeForm.name}
                    onChange={e => setEmployeeForm({...employeeForm, name: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Puesto</label>
                  <select 
                    className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-bold uppercase transition-all"
                    value={employeeForm.position}
                    onChange={e => setEmployeeForm({...employeeForm, position: e.target.value})}
                  >
                    {ROLES.map(r => (
                      <option key={r.id} value={r.id}>{r.label.toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Sucursal Asignada</label>
                  <select 
                    className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-bold uppercase transition-all"
                    value={employeeForm.branchId}
                    onChange={e => setEmployeeForm({...employeeForm, branchId: e.target.value})}
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button 
                  onClick={handleSaveEmployee}
                  className="flex-1 bg-brand-500 text-black py-4 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10"
                >
                  {editingEmployee ? 'Guardar Cambios' : 'Registrar Empleado'}
                </button>
                <button 
                  onClick={() => {
                    setShowEmployeeModal(false);
                    setEditingEmployee(null);
                  }}
                  className="px-8 py-4 rounded border border-border-dim text-text-dim text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
