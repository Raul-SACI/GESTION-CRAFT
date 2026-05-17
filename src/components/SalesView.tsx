/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  Plus, 
  Search, 
  MoreVertical, 
  Calendar,
  Save,
  Calculator,
  Building2,
  Users,
  FileUp,
  Download,
  Trash2,
  BarChart3
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { SalesData, Branch, SaleType, Product, ProductRankingEntry } from '../types';
import { cn } from '../lib/utils';

interface SalesViewProps {
  branches: Branch[];
  selectedBranchId: string;
  products: Product[];
}

const SALE_TYPES: SaleType[] = ['Turno Mañana', 'Turno Tarde', 'Pedidos Ya Restó', 'Pedidos Ya Café'];

export default function SalesView({ branches, selectedBranchId, products }: SalesViewProps) {
  const [salesRecords, setSalesRecords] = useState<SalesData[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  
  // New combined form state for all 4 slots
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [branchId, setBranchId] = useState(selectedBranchId === 'all' ? (branches[0]?.id || '') : selectedBranchId);

  // Product ranking state for the current entry
  const [productRanking, setProductRanking] = useState<ProductRankingEntry[]>([]);
  const [rankingSearch, setRankingSearch] = useState('');

  // Sync branchId with global selection when opening the form
  React.useEffect(() => {
    if (selectedBranchId !== 'all') {
      setBranchId(selectedBranchId);
    }
  }, [selectedBranchId, isAdding]);
  
  const [values, setValues] = useState<Record<SaleType, { pesos: number, netSales: number, orders: number, covers: number }>>({
    'Turno Mañana': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
    'Turno Tarde': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
    'Pedidos Ya Restó': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
    'Pedidos Ya Café': { pesos: 0, netSales: 0, orders: 0, covers: 0 }
  });

  const handleSave = () => {
    const newRecords: SalesData[] = SALE_TYPES.map(type => {
      const v = values[type];
      return {
        id: Math.random().toString(36).substr(2, 9),
        branchId,
        date: entryDate,
        type,
        pesos: v.pesos,
        netSales: v.netSales,
        orders: v.orders,
        covers: v.covers,
        projection: v.pesos * 30,
        productRanking: type === 'Turno Mañana' ? productRanking : [] // Attach ranking to one of the records for the day/branch
      };
    }).filter(r => r.pesos > 0 || r.orders > 0);

    setSalesRecords([...newRecords, ...salesRecords]);
    setIsAdding(false);
    setProductRanking([]);
    // Reset values but keep date/branch for convenience
    setValues({
      'Turno Mañana': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
      'Turno Tarde': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
      'Pedidos Ya Restó': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
      'Pedidos Ya Café': { pesos: 0, netSales: 0, orders: 0, covers: 0 }
    });
  };

  const addRankingItem = (productId: string) => {
    if (productRanking.find(r => r.productId === productId)) return;
    setProductRanking([...productRanking, { productId, quantity: 0, amount: 0 }]);
    setRankingSearch('');
  };

  const updateRankingItem = (productId: string, field: 'quantity' | 'amount', val: number) => {
    setProductRanking(prev => prev.map(r => r.productId === productId ? { ...r, [field]: val } : r));
  };

  const updateVal = (type: SaleType, field: 'pesos' | 'netSales' | 'orders' | 'covers', val: number) => {
    if (type.includes('Pedidos Ya') && field === 'covers') return;
    setValues(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: val
      }
    }));
  };

  // Calculate totals
  const filteredSales = useMemo(() => {
    if (selectedBranchId === 'all') return salesRecords;
    return salesRecords.filter(r => r.branchId === selectedBranchId);
  }, [salesRecords, selectedBranchId]);

  const totals = useMemo(() => {
    const init = {
      'Turno Mañana': 0,
      'Turno Tarde': 0,
      'Pedidos Ya Restó': 0,
      'Pedidos Ya Café': 0,
      totalGross: 0,
      totalNet: 0,
      orders: 0,
      covers: 0
    };
    
    return filteredSales.reduce((acc, curr) => {
      acc[curr.type] += curr.pesos;
      if (curr.type === 'Turno Mañana' || curr.type === 'Turno Tarde') {
        acc.totalGross += curr.pesos;
        acc.totalNet += curr.netSales || 0;
      }
      acc.orders += curr.orders;
      acc.covers += curr.covers;
      return acc;
    }, init);
  }, [filteredSales]);

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

      const newRecordsFromExcel: SalesData[] = data.map(row => {
        const type = row.Canal || row.Type || 'Turno Mañana';
        // Try to find branch by name if provided in Excel
        let targetBranchId = selectedBranchId;
        if (row.Sucursal) {
          const foundBranch = branches.find(b => b.name.toLowerCase() === String(row.Sucursal).toLowerCase());
          if (foundBranch) targetBranchId = foundBranch.id;
        }

        return {
          id: Math.random().toString(36).substr(2, 9),
          branchId: targetBranchId,
          date: row.Fecha || row.Date || entryDate,
          type: type as SaleType,
          pesos: Number(row.Bruto || row.Pesos || row.Amount || 0),
          netSales: Number(row.Neto || row.NetSales || 0),
          orders: Number(row.Tickets || row.Orders || 0),
          covers: type.includes('Pedidos Ya') ? 0 : Number(row.Cubiertos || row.Covers || 0),
          projection: Number(row.Bruto || row.Pesos || row.Amount || 0) * 30
        };
      });

      setSalesRecords(prev => [...newRecordsFromExcel, ...prev]);
    };
    reader.readAsBinaryString(file);
  };

  const handleExportTemplate = () => {
    const templateData = [
      {
        Fecha: new Date().toISOString().split('T')[0],
        Sucursal: branches.find(b => b.id === selectedBranchId)?.name || 'NOMBRE SUCURSAL',
        Canal: 'Turno Mañana',
        Bruto: 150000,
        Neto: 135000,
        Tickets: 45,
        Cubiertos: 80
      },
      {
        Fecha: new Date().toISOString().split('T')[0],
        Sucursal: branches.find(b => b.id === selectedBranchId)?.name || 'NOMBRE SUCURSAL',
        Canal: 'Pedidos Ya Restó',
        Bruto: 45000,
        Neto: 38000,
        Tickets: 12,
        Cubiertos: 0
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo Ventas");
    XLSX.writeFile(wb, "Modelo_Carga_Ventas.xlsx");
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-bg-sidebar p-6 rounded border border-border-dim shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500 p-3 rounded text-black shadow-lg shadow-brand-500/20">
            <TrendingUp size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main tracking-tight uppercase">Control de Ventas Diarias</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest text-brand-500/80">Input separado por turnos y canales</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={handleExportTemplate}
            className="bg-bg-accent hover:bg-bg-card border border-border-dim text-text-dim px-6 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
          >
            <Download size={16} /> EXPORTAR MODELO
          </button>
          <label className="bg-bg-accent hover:bg-bg-card border border-border-dim text-text-dim px-6 py-2 rounded text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center justify-center gap-2">
            <FileUp size={16} /> IMPORTAR EXCEL
            <input 
              type="file" 
              accept=".xlsx, .xls, .csv" 
              className="hidden" 
              onChange={handleImportExcel}
            />
          </label>
          {!isAdding && (
            <button 
              onClick={() => setIsAdding(true)}
              className="bg-brand-500 hover:bg-brand-600 text-black px-6 py-2 rounded text-[10px] font-black uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-2"
            >
              <Plus size={16} /> CARGAR DÍA
            </button>
          )}
        </div>
      </div>

      {isAdding && (
        <div className="bg-bg-sidebar border border-brand-500/30 p-8 rounded shadow-2xl space-y-8">
          <div className="flex flex-col md:flex-row gap-6 pb-6 border-b border-border-dim">
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Sucursal</label>
              <select 
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full px-4 py-3 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 uppercase font-bold"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Fecha de Venta</label>
              <input 
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full px-4 py-3 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {SALE_TYPES.map(type => (
              <div key={type} className="space-y-4 bg-bg-accent p-6 rounded border border-border-dim/50">
                <div className="flex items-center justify-between border-b border-border-dim/30 pb-2">
                   <h4 className={cn(
                     "text-[10px] font-black uppercase tracking-widest",
                     type.includes('Pedidos Ya') ? "text-red-400" : "text-brand-500"
                   )}>{type}</h4>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-text-dim uppercase opacity-50">Venta Bruta</label>
                    <input 
                      type="number"
                      value={values[type].pesos || ''}
                      onChange={(e) => updateVal(type, 'pesos', Number(e.target.value))}
                      placeholder="$ 0.00"
                      className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[11px] text-text-main font-mono outline-none focus:border-brand-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-text-dim uppercase opacity-50">Venta Neta</label>
                    <input 
                      type="number"
                      value={values[type].netSales || ''}
                      onChange={(e) => updateVal(type, 'netSales', Number(e.target.value))}
                      placeholder="$ 0.00"
                      className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[11px] text-text-main font-mono outline-none focus:border-brand-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-text-dim uppercase opacity-50">Tickets</label>
                    <input 
                      type="number"
                      value={values[type].orders || ''}
                      onChange={(e) => updateVal(type, 'orders', Number(e.target.value))}
                      placeholder="0"
                      className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[11px] text-text-main font-mono outline-none focus:border-brand-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-text-dim uppercase opacity-50">Cubiertos</label>
                    <input 
                      type="number"
                      disabled={type.includes('Pedidos Ya')}
                      value={type.includes('Pedidos Ya') ? '' : (values[type].covers || '')}
                      onChange={(e) => updateVal(type, 'covers', Number(e.target.value))}
                      placeholder={type.includes('Pedidos Ya') ? "N/A" : "0"}
                      className={cn(
                        "w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[11px] text-text-main font-mono outline-none focus:border-brand-500",
                        type.includes('Pedidos Ya') && "opacity-30 cursor-not-allowed bg-bg-sidebar"
                      )}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4 bg-bg-accent p-6 rounded border border-border-dim/50">
             <div className="flex items-center justify-between border-b border-border-dim/30 pb-2">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-500">Ranking de Productos Vendidos</h4>
             </div>
             
             <div className="flex gap-4">
                <div className="flex-1 relative">
                   <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                   <input 
                    type="text"
                    placeholder="BUSCAR PRODUCTO PARA RANKING..."
                    value={rankingSearch}
                    onChange={e => setRankingSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-bg-main border border-border-dim rounded text-[11px] text-text-main outline-none focus:border-brand-500 uppercase font-black"
                   />
                   {rankingSearch && (
                     <div className="absolute top-full left-0 w-full mt-1 bg-bg-sidebar border border-border-dim rounded shadow-2xl z-20 max-h-48 overflow-y-auto">
                        {products.filter(p => p.name.toLowerCase().includes(rankingSearch.toLowerCase())).map(p => (
                          <button 
                            key={p.id}
                            onClick={() => addRankingItem(p.id)}
                            className="w-full text-left px-4 py-2 text-[10px] font-black uppercase text-text-main hover:bg-bg-accent"
                          >
                            {p.name}
                          </button>
                        ))}
                     </div>
                   )}
                </div>
             </div>

             <div className="space-y-2">
                {productRanking.map(entry => {
                  const p = products.find(prod => prod.id === entry.productId);
                  return (
                    <div key={entry.productId} className="flex items-center gap-4 bg-bg-main p-3 rounded border border-border-dim group">
                       <span className="flex-1 text-[10px] font-black uppercase text-text-main">{p?.name}</span>
                       <div className="w-32 space-y-1">
                          <label className="text-[7px] font-bold text-text-dim uppercase opacity-50">Cantidad</label>
                          <input 
                            type="number"
                            value={entry.quantity || ''}
                            onChange={(e) => updateRankingItem(entry.productId, 'quantity', Number(e.target.value))}
                            placeholder="Cant."
                            className="w-full bg-bg-card border border-border-dim rounded px-3 py-1.5 text-[10px] text-text-main font-mono outline-none focus:border-brand-500"
                          />
                       </div>
                       <div className="w-32 space-y-1">
                          <label className="text-[7px] font-bold text-text-dim uppercase opacity-50">Importe ($)</label>
                          <input 
                            type="number"
                            value={entry.amount || ''}
                            onChange={(e) => updateRankingItem(entry.productId, 'amount', Number(e.target.value))}
                            placeholder="Importe"
                            className="w-full bg-bg-card border border-border-dim rounded px-3 py-1.5 text-[10px] text-text-main font-mono outline-none focus:border-brand-500"
                          />
                       </div>
                       <button 
                        onClick={() => setProductRanking(prev => prev.filter(r => r.productId !== entry.productId))}
                        className="p-1.5 text-text-dim hover:text-red-500 group-hover:opacity-100 transition-all"
                       >
                          <Trash2 size={14} />
                       </button>
                    </div>
                  );
                })}
             </div>
          </div>

          <div className="pt-6 border-t border-border-dim flex gap-4">
            <button 
              onClick={handleSave}
              className="flex-1 bg-brand-500 text-black py-4 rounded text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center justify-center gap-2"
            >
              <Save size={16} /> CONFIRMAR CARGA DEL DÍA
            </button>
            <button 
              onClick={() => setIsAdding(false)}
              className="px-10 py-4 rounded border border-border-dim text-text-dim text-[11px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
            >
              CANCELAR
            </button>
          </div>
        </div>
      )}

      {/* Stats Summary - Totales por Canal */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {SALE_TYPES.map(type => (
          <div key={type} className="bg-bg-sidebar border border-border-dim p-5 rounded group hover:border-brand-500/50 transition-all">
            <p className={cn(
              "text-[9px] font-black uppercase tracking-[0.2em] mb-2",
              type.includes('Pedidos Ya') ? "text-red-400" : "text-brand-500"
            )}>
              {type}
            </p>
            <p className="text-xl font-mono font-black text-text-main italic">
              ${totals[type].toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-bg-sidebar border border-brand-500/20 p-5 rounded relative overflow-hidden group">
          <div className="absolute -right-2 -bottom-2 opacity-10 group-hover:scale-110 transition-transform">
            <TrendingUp size={80} className="text-brand-500" />
          </div>
          <p className="text-[9px] font-black text-text-dim uppercase tracking-[0.2em] mb-2">Ventas Brutas Totales</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-mono font-black text-brand-500">${totals.totalGross.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-bg-sidebar border border-teal-500/20 p-5 rounded relative overflow-hidden group">
          <div className="absolute -right-2 -bottom-2 opacity-10 group-hover:scale-110 transition-transform">
            <Calculator size={80} className="text-teal-500" />
          </div>
          <p className="text-[9px] font-black text-text-dim uppercase tracking-[0.2em] mb-2">Ventas Netas Totales</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-mono font-black text-teal-500">${totals.totalNet.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-bg-sidebar border border-border-dim p-5 rounded">
          <p className="text-[9px] font-black text-text-dim uppercase tracking-[0.2em] mb-2">Tickets Globales</p>
          <p className="text-3xl font-mono font-black text-text-main">{totals.orders.toLocaleString()}</p>
        </div>
        <div className="bg-bg-sidebar border border-border-dim p-5 rounded">
          <p className="text-[9px] font-black text-text-dim uppercase tracking-[0.2em] mb-2">Cubiertos Totales</p>
          <p className="text-3xl font-mono font-black text-text-main">{totals.covers.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="bg-bg-sidebar border border-border-dim rounded overflow-hidden">
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-bg-accent border-b border-border-dim text-left text-text-dim font-bold uppercase tracking-widest">
                  <th className="px-6 py-3">Fecha / Sucursal</th>
                  <th className="px-4 py-3">Canal</th>
                  <th className="px-4 py-3 text-right">Bruto</th>
                  <th className="px-4 py-3 text-right">Neto</th>
                  <th className="px-4 py-3 text-center">Tickets</th>
                  <th className="px-4 py-3 text-center">Cubiertos</th>
                  <th className="px-4 py-3 text-right text-brand-500">Proyección</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim">
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center text-text-dim italic uppercase opacity-50">
                      No hay registros cargados para este periodo
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((item) => (
                    <tr key={item.id} className="hover:bg-bg-accent/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-text-main uppercase">{item.date}</span>
                          <span className="text-[9px] text-text-dim font-black uppercase tracking-tighter">
                            {branches.find(b => b.id === item.branchId)?.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded-[2px] font-bold text-[9px] uppercase tracking-tighter border",
                          item.type.includes('Pedidos Ya') 
                            ? "bg-red-500/10 text-red-400 border-red-500/20" 
                            : "bg-brand-500/10 text-brand-500 border-brand-500/20"
                        )}>
                          {item.type}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right font-mono font-bold text-text-main">
                        ${item.pesos.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-right font-mono font-bold text-teal-400">
                        ${item.netSales?.toLocaleString() || 0}
                      </td>
                      <td className="px-4 py-4 text-center font-mono text-text-dim">
                        {item.orders}
                      </td>
                      <td className="px-4 py-4 text-center font-mono text-text-dim">
                        {item.type.includes('Pedidos Ya') ? (
                          <span className="opacity-20">-</span>
                        ) : (
                          item.covers
                        )}
                      </td>
                      <td className="px-4 py-4 text-right font-mono font-bold text-brand-500">
                        ${item.projection?.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 text-text-dim/40">
                          {item.productRanking && item.productRanking.length > 0 && (
                             <button 
                               title="Ver Ranking de Productos"
                               className="hover:text-brand-500 transition-colors"
                               onClick={() => alert(`Ranking para ${item.date}:\n${item.productRanking?.map(r => {
                                 const p = products.find(prod => prod.id === r.productId);
                                 return `${p?.name}: ${r.quantity}u - $${r.amount}`;
                               }).join('\n')}`)}
                             >
                                <BarChart3 size={14} />
                             </button>
                          )}
                          <button className="hover:text-text-main transition-colors">
                            <MoreVertical size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-bg-accent border border-border-dim p-6 rounded relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-5">
                <Calculator size={60} />
             </div>
             <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-4">Información de Proyección</h4>
             <p className="text-[10px] text-text-dim leading-relaxed italic opacity-70">
                La proyección mensual se estima multiplicando la venta diaria por la cantidad de días del mes. Este dato ayuda a prever el cumplimiento de objetivos de facturación.
             </p>
             <div className="mt-6 pt-6 border-t border-border-dim">
                <div className="flex items-center gap-2 text-brand-500 mb-2 font-black text-[9px] uppercase">
                   <Building2 size={14} /> Distribución de Carga
                </div>
                <div className="space-y-3">
                   {branches.map(b => (
                      <div key={b.id} className="flex items-center justify-between">
                         <span className="text-[9px] text-text-dim font-bold uppercase">{b.name}</span>
                         <div className="w-24 h-1 bg-bg-card rounded-full overflow-hidden">
                            <div className="h-full bg-border-dim" style={{ width: '30%' }}></div>
                         </div>
                      </div>
                   ))}
                </div>
             </div>
          </div>

          <div className="bg-brand-500/5 border border-brand-500/20 p-6 rounded text-center">
             <Users size={24} className="text-brand-500 mx-auto mb-3" />
             <p className="text-[10px] font-bold text-text-main uppercase tracking-widest mb-1">Ratio de Tickets</p>
             <p className="text-2xl font-mono font-bold text-brand-500">
                {totals.orders > 0 ? (totals.pesos / totals.orders).toLocaleString(undefined, { maximumFractionDigits: 0 }) : 0}
             </p>
             <p className="text-[9px] text-text-dim uppercase mt-1">Gasto promedio por ticket</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
