/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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
  BarChart3
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import * as XLSX from 'xlsx';
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

export default function SalaryManagementView() {
  const [positions, setPositions] = useState<SalaryPosition[]>([
    { 
      id: '1', 
      area: 'OPERACIONES', 
      sector: 'COCINA', 
      title: 'Cocinero A', 
      type: 'hourly', 
      baseValue: 3500, 
      baseMonth: '2026-05',
      prevBaseValue: 3100, 
      prevBaseMonth: '2026-02', 
      notes: 'Incluye premio puntualidad ($500)',
      history: [
        { date: '2026-01', value: 2900 },
        { date: '2026-02', value: 3100 },
        { date: '2026-03', value: 3100 },
        { date: '2026-04', value: 3300 },
        { date: '2026-05', value: 3500 },
      ]
    },
    { 
      id: '2', 
      area: 'OPERACIONES', 
      sector: 'SALON', 
      title: 'Mozo Salon', 
      type: 'hourly', 
      baseValue: 2800, 
      baseMonth: '2026-05',
      prevBaseValue: 2500, 
      prevBaseMonth: '2026-02', 
      notes: '+ Propinas variables',
      history: [
        { date: '2026-01', value: 2300 },
        { date: '2026-02', value: 2500 },
        { date: '2026-03', value: 2500 },
        { date: '2026-04', value: 2700 },
        { date: '2026-05', value: 2800 },
      ]
    },
    { 
      id: '3', 
      area: 'ADMINISTRACION', 
      sector: 'GERENCIA', 
      title: 'Gerente Operativo', 
      type: 'monthly', 
      baseValue: 850000, 
      baseMonth: '2026-05',
      prevBaseValue: 780000, 
      prevBaseMonth: '2026-01', 
      notes: 'Bono por objetivos trimestral',
      history: [
        { date: '2026-01', value: 780000 },
        { date: '2026-02', value: 780000 },
        { date: '2026-03', value: 800000 },
        { date: '2026-04', value: 820000 },
        { date: '2026-05', value: 850000 },
      ]
    },
    { 
      id: '4', 
      area: 'ADMINISTRACION', 
      sector: 'GESTION', 
      title: 'Sub-Encargado', 
      type: 'monthly', 
      baseValue: 620000, 
      baseMonth: '2026-05',
      prevBaseValue: 580000, 
      prevBaseMonth: '2026-01',
      history: [
        { date: '2026-01', value: 580000 },
        { date: '2026-02', value: 580000 },
        { date: '2026-03', value: 595000 },
        { date: '2026-04', value: 610000 },
        { date: '2026-05', value: 620000 },
      ]
    },
  ]);

  const [filters, setFilters] = useState({
    area: '',
    sector: '',
    title: ''
  });

  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
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
      ]
    };

    setPositions([...positions, pos]);
    setShowAddModal(false);
    setNewPos({ area: '', sector: '', title: '', type: 'hourly', baseValue: 0, baseMonth: '2026-05', prevBaseValue: 0, prevBaseMonth: '', notes: '' });
  };

  const handleRemovePosition = (id: string) => {
    setPositions(positions.filter(p => p.id !== id));
    if (selectedPositionId === id) setSelectedPositionId(null);
  };

  const handleExportTemplate = () => {
    const template = [
      { AREA: 'OPERACIONES', SECTOR: 'COCINA', PUESTO: 'Cocinero', TIPO: 'hourly', VALOR_ACTUAL: 3500, MES_ACTUAL: '2026-05', VALOR_ANTERIOR: 3100, MES_REF_ANTERIOR: '2026-02', NOTAS: '' },
      { AREA: 'ADMINISTRACION', SECTOR: 'GERENCIA', PUESTO: 'Gerente', TIPO: 'monthly', VALOR_ACTUAL: 850000, MES_ACTUAL: '2026-05', VALOR_ANTERIOR: 780000, MES_REF_ANTERIOR: '2026-01', NOTAS: 'Bono variables' },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "Plantilla_Sueldos.xlsx");
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

      const importedPositions: SalaryPosition[] = data.map((item: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        area: String(item.AREA || '').toUpperCase(),
        sector: String(item.SECTOR || '').toUpperCase(),
        title: String(item.PUESTO || '').toUpperCase(),
        type: (item.TIPO === 'monthly' ? 'monthly' : 'hourly') as 'hourly' | 'monthly',
        baseValue: Number(item.VALOR_ACTUAL || 0),
        baseMonth: String(item.MES_ACTUAL || '2026-05'),
        prevBaseValue: Number(item.VALOR_ANTERIOR || 0),
        prevBaseMonth: String(item.MES_REF_ANTERIOR || ''),
        notes: String(item.NOTAS || ''),
        history: [
          { date: String(item.MES_REF_ANTERIOR || '2026-01'), value: Number(item.VALOR_ANTERIOR || 0) },
          { date: String(item.MES_ACTUAL || '2026-05'), value: Number(item.VALOR_ACTUAL || 0) }
        ]
      }));

      setPositions([...positions, ...importedPositions]);
    };
    reader.readAsBinaryString(file);
  };

  const filteredPositions = positions.filter(p => {
    return (
      (filters.area === '' || p.area.includes(filters.area.toUpperCase())) &&
      (filters.sector === '' || p.sector.includes(filters.sector.toUpperCase())) &&
      (filters.title === '' || p.title.includes(filters.title.toUpperCase()))
    );
  });

  const selectedPosition = positions.find(p => p.id === selectedPositionId);

  const chartDataSummary = selectedPosition?.history || [];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h2 className="text-xl font-black uppercase text-text-main tracking-widest flex items-center gap-2">
            <Users className="text-brand-500" size={24} /> Sueldos y Escalas
          </h2>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 opacity-70">
            Definición de puestos de trabajo y valores de remuneración
          </p>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={handleExportTemplate}
            className="flex items-center gap-2 px-4 py-3 bg-bg-accent text-text-dim border border-border-dim rounded text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent/50 transition-all"
          >
            <Download size={14} /> Plantilla
          </button>
          <label className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all cursor-pointer">
            <Upload size={14} /> Importar Excel
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
          </label>
          <button 
            className="flex items-center gap-2 px-4 py-3 bg-brand-500/10 text-brand-500 border border-brand-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-500/20 transition-all"
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

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-bg-sidebar border border-border-dim p-4 rounded-lg">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
          <input 
            type="text"
            placeholder="FILTRAR POR ÁREA..."
            className="w-full bg-bg-accent border border-border-dim rounded pl-10 pr-4 py-2 text-[10px] font-bold uppercase outline-none focus:border-brand-500"
            value={filters.area}
            onChange={e => setFilters({...filters, area: e.target.value})}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
          <input 
            type="text"
            placeholder="FILTRAR POR SECTOR..."
            className="w-full bg-bg-accent border border-border-dim rounded pl-10 pr-4 py-2 text-[10px] font-bold uppercase outline-none focus:border-brand-500"
            value={filters.sector}
            onChange={e => setFilters({...filters, sector: e.target.value})}
          />
        </div>
        <div className="relative">
          <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
          <input 
            type="text"
            placeholder="FILTRAR POR PUESTO..."
            className="w-full bg-bg-accent border border-border-dim rounded pl-10 pr-4 py-2 text-[10px] font-bold uppercase outline-none focus:border-brand-500"
            value={filters.title}
            onChange={e => setFilters({...filters, title: e.target.value})}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-border-dim bg-bg-accent/30">
            <h3 className="text-xs font-black uppercase tracking-widest text-text-main">
              VALORES ACTUALES - {new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date()).toUpperCase()}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-bg-accent border-b border-border-dim">
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">ÁREA</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">SECTOR</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">PUESTO</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Tipo</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Valor Ant.</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Valor Act.</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Aumento</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Notas</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim/50">
                {filteredPositions.map(pos => {
                  const increase = pos.prevBaseValue > 0 ? ((pos.baseValue - pos.prevBaseValue) / pos.prevBaseValue) * 100 : 0;
                  const isSelected = selectedPositionId === pos.id;
                  
                  return (
                    <tr 
                      key={pos.id} 
                      onClick={() => setSelectedPositionId(pos.id)}
                      className={cn(
                        "hover:bg-bg-accent/10 transition-colors group text-[11px] cursor-pointer",
                        isSelected && "bg-brand-500/5 border-l-2 border-brand-500"
                      )}
                    >
                      <td className="px-6 py-4 font-bold text-text-dim uppercase">{pos.area}</td>
                      <td className="px-6 py-4 font-bold text-text-dim uppercase">{pos.sector}</td>
                      <td className="px-6 py-4 font-bold text-text-main uppercase">{pos.title}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[8px] font-black uppercase px-2 py-0.5 rounded",
                            pos.type === 'hourly' ? "bg-blue-500/10 text-blue-500" : "bg-emerald-500/10 text-emerald-500"
                          )}>
                            {pos.type === 'hourly' ? 'H' : 'M'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-text-dim opacity-60">${pos.prevBaseValue.toLocaleString('es-AR')}</span>
                          {pos.prevBaseMonth && (
                            <span className="text-[8px] font-black uppercase text-brand-500 opacity-60">REF: {pos.prevBaseMonth}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-mono font-bold text-text-main">${pos.baseValue.toLocaleString('es-AR')}</span>
                          {pos.baseMonth && (
                            <span className="text-[8px] font-black uppercase text-brand-500 opacity-60">REF: {pos.baseMonth}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          "px-2 py-1 rounded-full text-[9px] font-black font-mono",
                          increase > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-text-dim/10 text-text-dim"
                        )}>
                          +{increase.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[10px] text-text-dim italic leading-tight block max-w-[150px] truncate group-hover:whitespace-normal group-hover:overflow-visible group-hover:max-w-none transition-all">
                          {pos.notes || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleRemovePosition(pos.id)}
                          className="p-2 text-text-dim hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
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
                  Seleccione un puesto de la tabla<br/>para ver la evolución anual
                </p>
              </div>
            )}
          </div>

          <div className="bg-bg-card border border-border-dim rounded-lg p-6">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-main mb-6 flex items-center gap-2">
              <TrendingUp size={14} className="text-brand-500" /> Aumento Acumulado 2026
            </h4>
            <div className="space-y-4">
              <div className="overflow-hidden rounded border border-border-dim">
                <table className="w-full text-left border-collapse text-[9px]">
                  <thead>
                    <tr className="bg-bg-accent border-b border-border-dim font-black uppercase text-text-dim">
                      <th className="px-3 py-2">Puesto</th>
                      <th className="px-3 py-2 text-right">Acum. %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dim/50">
                    {filteredPositions.map(pos => {
                      const firstValue = pos.history?.find(h => h.date.startsWith('2026'))?.value || pos.prevBaseValue || pos.baseValue;
                      const currentValue = pos.baseValue;
                      const accumIncrease = firstValue > 0 ? ((currentValue - firstValue) / firstValue) * 100 : 0;
                      
                      return (
                        <tr key={pos.id} className="hover:bg-bg-accent/50 transition-colors">
                          <td className="px-3 py-2 font-bold text-text-dim truncate max-w-[100px]">{pos.title}</td>
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

          <div className="bg-bg-card border border-border-dim rounded-lg p-6">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-main mb-6 flex items-center gap-2">
              <TrendingUp size={14} className="text-brand-500" /> Resumen de Costos
            </h4>
            <div className="space-y-4">
              <div className="p-4 bg-bg-accent rounded-lg border border-border-dim">
                <p className="text-[9px] text-text-dim uppercase font-bold">Promedio Hora Operativa</p>
                <div className="flex items-end justify-between mt-1">
                  <p className="text-xl font-black font-mono text-text-main">$3.150</p>
                  <span className="text-[10px] text-emerald-500 font-bold tracking-tighter">+4.2%</span>
                </div>
              </div>
              <div className="p-4 bg-bg-accent rounded-lg border border-border-dim">
                <p className="text-[9px] text-text-dim uppercase font-bold">Masa Salarial Mensual Est.</p>
                <div className="flex items-end justify-between mt-1">
                  <p className="text-xl font-black font-mono text-text-main">$8.4M</p>
                  <span className="text-[10px] text-text-dim font-bold tracking-tighter">CONSOLIDADO</span>
                </div>
              </div>
            </div>
          </div>

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
               <CheckCircle2 size={12} /> Valores Revisados
            </div>
          </div>
        </div>
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
              <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest mb-6 border-l-2 border-brand-500 pl-4">
                Configurar Nuevo Puesto / Sueldo
              </h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-dim uppercase">Área</label>
                    <input 
                      type="text" 
                      placeholder="Ej: OPERACIONES..."
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 uppercase font-bold"
                      value={newPos.area}
                      onChange={e => setNewPos({...newPos, area: e.target.value.toUpperCase()})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-dim uppercase">Sector</label>
                    <input 
                      type="text" 
                      placeholder="Ej: SALON, COCINA..."
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 uppercase font-bold"
                      value={newPos.sector}
                      onChange={e => setNewPos({...newPos, sector: e.target.value.toUpperCase()})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Puesto de Trabajo</label>
                  <input 
                    type="text" 
                    placeholder="Ej: AYUDANTE, MOZO, ENCARGADO..."
                    className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 uppercase font-bold"
                    value={newPos.title}
                    onChange={e => setNewPos({...newPos, title: e.target.value.toUpperCase()})}
                  />
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
