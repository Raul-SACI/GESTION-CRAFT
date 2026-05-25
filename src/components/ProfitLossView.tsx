/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  FileText,
  AlertCircle,
  FileUp,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/src/lib/utils';
import { Branch, PLRecord } from '../types';

export default function ProfitLossView({ 
  branches, 
  selectedBranchId, 
  onBranchChange 
}: { 
  branches: Branch[], 
  selectedBranchId: string, 
  onBranchChange?: (id: string) => void 
}) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState<PLRecord[]>([]);

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      const newRecords: PLRecord[] = data.map(row => ({
        category: row.Concepto || row.Category || '',
        group: row.Grupo || '',
        projectedPesos: Number(row['Proyectado $'] || 0),
        projectedUsd: Number(row['Proyectado USD'] || 0),
        projectedPercent: Number(row['% Proyectado'] || 0),
        realPesos: Number(row['Real $'] || 0),
        realUsd: Number(row['Real USD'] || 0),
        realPercent: Number(row['% Real'] || 0),
        isHeader: row.isHeader === true || row.isHeader === 'true',
        isTotal: row.isTotal === true || row.isTotal === 'true'
      }));

      setRecords(newRecords);
    };
    reader.readAsBinaryString(file);
  };

  const handleExportTemplate = () => {
    const templateData = [
      { Concepto: 'Ingresos Ordinarios', Grupo: 'INGRESOS', isHeader: true },
      { Concepto: 'Ventas 1', 'Proyectado $': 270264257, 'Proyectado USD': 190999, '% Proyectado': 60.15, 'Real $': 264171123, 'Real USD': 186693, '% Real': 61.47 },
      { Concepto: 'Ventas 2', 'Proyectado $': 179030169, 'Proyectado USD': 126523, '% Proyectado': 39.85, 'Real $': 165562304, 'Real USD': 117005, '% Real': 38.53 },
      { Concepto: 'Ventas Totales Netas', 'Proyectado $': 449294426, 'Proyectado USD': 317522, '% Proyectado': 100, 'Real $': 429733427, 'Real USD': 303698, '% Real': 100, isTotal: true },
      
      { Concepto: 'Costo de Mercadería Vendida', 'Proyectado $': -150284532, 'Proyectado USD': -106208, '% Proyectado': -33.45, 'Real $': -133415090, 'Real USD': -94286, '% Real': -31.05 },
      { Concepto: 'Ganancia/Pérdida Bruta', 'Proyectado $': 299009893, 'Proyectado USD': 211314, '% Proyectado': 66.55, 'Real $': 296318336, 'Real USD': 209412, '% Real': 68.95, isTotal: true },
      
      { Concepto: 'Sueldos y Relacionados', Grupo: 'GASTOS ESTRUCTURA', isHeader: true },
      { Concepto: 'Sueldos', 'Proyectado $': -98565369, 'Proyectado USD': -69657, '% Proyectado': -21.94, 'Real $': -103853888, 'Real USD': -73394, '% Real': -24.17 },
      { Concepto: 'Cargas Sociales', 'Proyectado $': -6509053, 'Proyectado USD': -4600, '% Proyectado': -1.45, 'Real $': -6756212, 'Real USD': -4774, '% Real': -1.57 },
      { Concepto: 'Liquidación Final', 'Proyectado $': 0, 'Proyectado USD': 0, '% Proyectado': 0, 'Real $': -331500, 'Real USD': -234, '% Real': -0.08 },
      { Concepto: 'SAC', 'Proyectado $': 0, 'Proyectado USD': 0, '% Proyectado': 0, 'Real $': 0, 'Real USD': 0, '% Real': 0 },
      { Concepto: 'Salud Pública', 'Proyectado $': -299030, 'Proyectado USD': -211, '% Proyectado': -0.07, 'Real $': -311924, 'Real USD': -220, '% Real': -0.07 },
      { Concepto: 'Sindicato', 'Proyectado $': 0, 'Proyectado USD': 0, '% Proyectado': 0, 'Real $': 0, 'Real USD': 0, '% Real': 0 },
      { Concepto: 'Variables/Premios', 'Proyectado $': -3939900, 'Proyectado USD': -2784, '% Proyectado': -0.88, 'Real $': -4399200, 'Real USD': -3108, '% Real': -1.02 },
      { Concepto: 'Vacaciones', 'Proyectado $': 0, 'Proyectado USD': 0, '% Proyectado': 0, 'Real $': -448000, 'Real USD': -316, '% Real': -0.10 },
      { Concepto: 'Servicios Eventuales (Pruebas)', 'Proyectado $': -2000000, 'Proyectado USD': -1413, '% Proyectado': -0.45, 'Real $': -2066250, 'Real USD': -1460, '% Real': -0.48 },
      
      { Concepto: 'Alquileres y Relacionados', Grupo: 'ALQUILERES', isHeader: true },
      { Concepto: 'Alquileres y Expensas', 'Proyectado $': -17796062, 'Proyectado USD': -12444, '% Proyectado': -4.36, 'Real $': -18727328, 'Real USD': -13096, '% Real': -4.58 },

      { Concepto: 'Servicios y Contrataciones', Grupo: 'SERVICIOS', isHeader: true },
      { Concepto: 'Software (Maxirest)', 'Proyectado $': -836921, 'Proyectado USD': -591, '% Proyectado': -0.19, 'Real $': -944355, 'Real USD': -667, '% Real': -0.22 },
      { Concepto: 'Consumo Energía', 'Proyectado $': -7070931, 'Proyectado USD': -4997, '% Proyectado': -1.57, 'Real $': -12190585, 'Real USD': -8615, '% Real': -2.84 },
      { Concepto: 'Consumo Gas', 'Proyectado $': -2248071, 'Real $': -2384383 },
      { Concepto: 'Honorarios', 'Proyectado $': -4644000, 'Real $': -4502700 },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo P&L");
    XLSX.writeFile(wb, "Modelo_P&L_Import.xlsx");
  };

  const activeBranch = branches.find(b => b.id === selectedBranchId);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-20"
    >
       <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h2 className="text-xl font-bold text-text-main uppercase tracking-tight italic flex items-center gap-2">
            <BarChart3 className="text-brand-500" size={24} />
            Estado de Resultado {activeBranch ? `• ${activeBranch.name}` : '(CONSOLIDADO)'}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <Calendar size={12} className="text-brand-500" />
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">{selectedMonth}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-bg-sidebar border border-border-dim rounded p-2 px-4 flex items-center gap-3 h-[42px]">
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none text-[11px] font-mono text-text-main outline-none uppercase"
            />
          </div>
          <button 
            onClick={handleExportTemplate}
            className="bg-bg-sidebar hover:bg-bg-card border border-border-dim text-text-dim px-6 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center h-[42px] gap-2"
          >
            <Download size={16} /> MODELO
          </button>
          <label className="bg-brand-500 hover:bg-brand-600 text-black px-6 py-2 rounded text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center h-[42px] gap-2 shadow-xl shadow-brand-500/10">
            <FileUp size={16} /> IMPORTAR EXCEL
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
          </label>
        </div>
      </div>

      {onBranchChange && (
        <div className="flex flex-wrap items-center gap-2 bg-bg-sidebar/50 p-4 rounded border border-border-dim/60">
          <span className="text-[9px] font-black uppercase text-text-dim tracking-widest mr-2">Filtrar Sucursal:</span>
          <button
            onClick={() => onBranchChange('all')}
            className={cn(
              "px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
              selectedBranchId === 'all'
                ? "bg-brand-500 text-black border-brand-500 font-extrabold shadow-md"
                : "bg-bg-accent text-text-dim border-border-dim hover:text-text-main hover:bg-bg-accent/80"
            )}
          >
            Consolidado (Todas)
          </button>
          {branches.map(b => (
            <button
              key={b.id}
              onClick={() => onBranchChange(b.id)}
              className={cn(
                "px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
                selectedBranchId === b.id
                  ? "bg-brand-500 text-black border-brand-500 font-extrabold shadow-md"
                  : "bg-bg-accent text-text-dim border-border-dim hover:text-text-main hover:bg-bg-accent/80"
              )}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-black/60 border-b border-border-dim">
                <th rowSpan={2} className="px-6 py-8 text-[11px] font-black uppercase text-text-main tracking-widest w-[350px]">Ingresos / Egresos Ordinarios</th>
                <th colSpan={3} className="px-4 py-3 text-center text-[10px] font-black uppercase text-brand-500 tracking-widest border-l border-border-dim/50 bg-brand-500/10">
                   PROYECTADO
                </th>
                <th colSpan={3} className="px-4 py-3 text-center text-[10px] font-black uppercase text-emerald-400 tracking-widest border-l border-border-dim/50 bg-emerald-500/10">
                   REAL
                </th>
              </tr>
              <tr className="bg-black/60 border-b-2 border-border-dim">
                <th className="px-4 py-2 text-center text-[9px] font-bold text-text-dim uppercase border-l border-border-dim/30">Importes $</th>
                <th className="px-4 py-2 text-center text-[9px] font-bold text-text-dim uppercase">Importes USD</th>
                <th className="px-4 py-2 text-center text-[9px] font-bold text-text-dim uppercase">%</th>
                <th className="px-4 py-2 text-center text-[9px] font-bold text-text-dim uppercase border-l border-border-dim/30">Importes $</th>
                <th className="px-4 py-2 text-center text-[9px] font-bold text-text-dim uppercase">Importes USD</th>
                <th className="px-4 py-2 text-center text-[9px] font-bold text-text-dim uppercase">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim/50 font-mono">
              {records.length > 0 ? (
                records.map((row, idx) => {
                  const isHeader = row.isHeader;
                  const isTotal = row.isTotal;
                  
                  return (
                    <tr key={idx} className={cn(
                      "hover:bg-bg-accent/30 transition-colors group",
                      isHeader && "bg-bg-accent font-black",
                      isTotal && "bg-brand-500/5 font-black"
                    )}>
                      <td className="px-6 py-3">
                         <div className="flex items-center gap-3">
                           {isHeader && <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />}
                           <span className={cn(
                             "text-[10px] uppercase tracking-tighter",
                             isHeader ? "text-text-main" : "text-text-dim pl-4",
                             isTotal && "text-brand-500"
                           )}>
                             {row.category}
                           </span>
                         </div>
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-center text-[10px] border-l border-border-dim/30",
                        row.projectedPesos < 0 ? "text-red-400" : "text-text-main",
                        isTotal && "font-black"
                      )}>
                        {row.projectedPesos !== 0 ? (row.projectedPesos < 0 ? `-$${Math.abs(row.projectedPesos).toLocaleString()}` : `$${row.projectedPesos.toLocaleString()}`) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-[10px] text-text-dim opacity-70">
                         {row.projectedUsd !== 0 ? (row.projectedUsd < 0 ? `-$${Math.abs(row.projectedUsd).toLocaleString()}` : `$${row.projectedUsd.toLocaleString()}`) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-[10px] text-text-dim font-bold">
                        {row.projectedPercent !== 0 ? `${row.projectedPercent.toFixed(2)}%` : '-'}
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-center text-[10px] border-l border-border-dim/30",
                        row.realPesos < 0 ? "text-red-400" : "text-text-main",
                        isTotal && "font-black"
                      )}>
                        {row.realPesos !== 0 ? (row.realPesos < 0 ? `-$${Math.abs(row.realPesos).toLocaleString()}` : `$${row.realPesos.toLocaleString()}`) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-[10px] text-text-dim opacity-70">
                        {row.realUsd !== 0 ? (row.realUsd < 0 ? `-$${Math.abs(row.realUsd).toLocaleString()}` : `$${row.realUsd.toLocaleString()}`) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-[10px] text-text-dim font-bold">
                        {row.realPercent !== 0 ? `${row.realPercent.toFixed(2)}%` : '-'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-32 text-center bg-bg-sidebar">
                    <div className="flex flex-col items-center gap-4">
                       <div className="p-6 bg-bg-accent rounded-full border border-border-dim animate-pulse">
                         <BarChart3 size={48} className="text-text-dim opacity-20" />
                       </div>
                       <div>
                         <p className="text-[12px] font-black uppercase tracking-widest text-text-main">Sin datos cargados</p>
                         <p className="text-[10px] mt-1 text-text-dim italic">Por favor, importe la planilla Excel correspondiente al mes de {selectedMonth}</p>
                       </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="p-6 bg-brand-500/5 border border-brand-500/20 rounded-lg flex items-start gap-4 lg:col-span-2">
          <div className="p-2 bg-brand-500/10 rounded-full text-brand-500 mt-1">
            <AlertCircle size={20} />
          </div>
          <div>
            <h4 className="text-[10px] font-black uppercase text-brand-500 tracking-widest mb-1">Análisis de Estructura de Costos</h4>
            <p className="text-[11px] text-text-dim leading-relaxed">
              Este informe presenta la rentabilidad operativa del negocio. El "Importe USD" es una referencia calculada para el análisis de los socios, 
              mientras que los "%" reflejan la incidencia de cada rubro sobre la venta neta (100%).
            </p>
          </div>
        </div>
        <div className="p-6 bg-bg-sidebar border border-border-dim rounded-lg flex flex-col justify-center text-center">
            <span className="text-[9px] font-black uppercase text-text-dim tracking-widest mb-2">Desvío de Ganancia Bruta</span>
            <div className="flex items-center justify-center gap-3">
              <TrendingUp className="text-emerald-500" size={24} />
              <span className="text-3xl font-mono font-black text-emerald-400 italic tracking-tighter">+2.4%</span>
            </div>
        </div>
      </div>
    </motion.div>
  );
}
