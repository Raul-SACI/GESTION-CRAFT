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
  BarChart3,
  Filter,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { SalesData, Branch, SaleType, Product, ProductRankingEntry } from '../types';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { AnimatePresence } from 'motion/react';

interface SalesViewProps {
  branches: Branch[];
  selectedBranchId: string;
  products: Product[];
}

const SALE_TYPES: SaleType[] = ['Turno Mañana', 'Turno Tarde', 'Pedidos Ya Restó', 'Pedidos Ya Café'];

export default function SalesView({ branches, selectedBranchId, products }: SalesViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'daily' | 'rankings'>('daily');
  const [salesRecords, setSalesRecords] = useState<SalesData[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Rankings State
  const [rankings, setRankings] = useState<any[]>([]);
  const [isImportingRanking, setIsImportingRanking] = useState(false);
  const [rankingToImport, setRankingToImport] = useState<{
    branchId: string;
    date: string;
    entries: any[];
  } | null>(null);
  
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

  // Fetch from Supabase
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Sales
      let salesQuery = supabase.from('sales').select('*').order('date', { ascending: false });
      if (selectedBranchId !== 'all') {
        salesQuery = salesQuery.eq('branch_id', selectedBranchId);
      }
      const { data: salesData } = await salesQuery;
      if (salesData) {
        setSalesRecords(salesData.map(s => ({
          id: s.id,
          branchId: s.branch_id,
          date: s.date,
          type: s.type as SaleType,
          pesos: s.pesos,
          netSales: s.net_sales,
          orders: s.orders,
          covers: s.covers,
          projection: s.projection,
          productRanking: s.product_ranking
        })));
      }

      // Fetch Rankings Table (independent table if it exists, or from sales)
      // For now we'll assume a dedicated table 'product_rankings' is better for large imports
      let rankingQuery = supabase.from('product_rankings').select('*').order('date', { ascending: false });
      if (selectedBranchId !== 'all') {
        rankingQuery = rankingQuery.eq('branch_id', selectedBranchId);
      }
      const { data: rankingData } = await rankingQuery;
      if (rankingData) {
        setRankings(rankingData);
      }
    } catch (err) {
      console.error('Error fetching sales data:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, [selectedBranchId]);
  
  const [values, setValues] = useState<Record<SaleType, { pesos: number, netSales: number, orders: number, covers: number }>>({
    'Turno Mañana': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
    'Turno Tarde': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
    'Pedidos Ya Restó': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
    'Pedidos Ya Café': { pesos: 0, netSales: 0, orders: 0, covers: 0 }
  });

  const handleSave = async () => {
    setLoading(true);
    try {
      const newRecords = SALE_TYPES.map(type => {
        const v = values[type];
        return {
          branch_id: branchId,
          date: entryDate,
          type,
          pesos: v.pesos,
          net_sales: v.netSales,
          orders: v.orders,
          covers: v.covers,
          projection: v.pesos * 30,
          product_ranking: type === 'Turno Mañana' ? productRanking : []
        };
      }).filter(r => r.pesos > 0 || r.orders > 0);

      const { error } = await supabase.from('sales').insert(newRecords);
      if (error) throw error;

      setIsAdding(false);
      setProductRanking([]);
      setValues({
        'Turno Mañana': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
        'Turno Tarde': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
        'Pedidos Ya Restó': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
        'Pedidos Ya Café': { pesos: 0, netSales: 0, orders: 0, covers: 0 }
      });
      fetchData();
    } catch (err) {
      console.error('Error saving sales:', err);
      alert('Error al guardar los datos.');
    } finally {
      setLoading(false);
    }
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

  const handleImportRankingExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      // Map columns: Código, Nombre, Cantidad, [Importe]
      const entries = data.map(row => ({
        product_code: row.Código || row.Code || row.id || '',
        product_name: row.Nombre || row.Name || row.Producto || '',
        quantity: Number(row.Cantidad || row.Quantity || row.Cant || 0),
        amount: Number(row.Importe || row.Amount || row.Precio || 0)
      })).filter(e => e.product_name && e.quantity > 0);

      setRankingToImport({
        branchId: selectedBranchId === 'all' ? (branches[0]?.id || '') : selectedBranchId,
        date: new Date().toISOString().split('T')[0],
        entries
      });
      setIsImportingRanking(true);
    };
    reader.readAsBinaryString(file);
  };

  const confirmRankingImport = async () => {
    if (!rankingToImport) return;
    setLoading(true);
    try {
      const rows = rankingToImport.entries.map(e => ({
        branch_id: rankingToImport.branchId,
        date: rankingToImport.date,
        product_code: e.product_code,
        product_name: e.product_name,
        quantity: e.quantity,
        amount: e.amount
      }));

      const { error } = await supabase.from('product_rankings').insert(rows);
      if (error) throw error;

      setIsImportingRanking(false);
      setRankingToImport(null);
      fetchData();
    } catch (err) {
      console.error('Error importing ranking:', err);
      alert('Error al importar el ranking.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportRankingTemplate = () => {
    const templateData = [
      {
        Código: 'P001',
        Nombre: 'CAFÉ LATTE',
        Cantidad: 150,
        Importe: 450000
      },
      {
        Código: 'P002',
        Nombre: 'AVOCADO TOAST',
        Cantidad: 85,
        Importe: 320000
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo Ranking");
    XLSX.writeFile(wb, "Modelo_Ranking_Articulos.xlsx");
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataBuffer = evt.target?.result;
      const wb = XLSX.read(dataBuffer, { type: 'array' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      const recordsToInsert: any[] = [];

      // Helper to find a value by key ignoring case and multiple spaces
      const getValue = (row: any, keyPattern: string) => {
        const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
        const target = normalize(keyPattern);
        const rowKey = Object.keys(row).find(k => normalize(k) === target);
        return rowKey ? row[rowKey] : undefined;
      };

      data.forEach(row => {
        // Find branch mapping - be more flexible with names (e.g. "Barrio Norte" -> "CRAFT BARRIO NORTE")
        const excelBranch = getValue(row, 'Sucursal');
        let targetBranchId = selectedBranchId;
        if (excelBranch) {
          const normalizedExcel = String(excelBranch).toLowerCase().trim();
          const foundBranch = branches.find(b => {
            const normalizedName = b.name.toLowerCase().trim();
            return normalizedName === normalizedExcel || 
                   normalizedName.includes(normalizedExcel) || 
                   normalizedExcel.includes(normalizedName);
          });
          if (foundBranch) targetBranchId = foundBranch.id;
        }

        if (targetBranchId === 'all') {
          console.warn('Skipping row: Branch not identified', excelBranch);
          return;
        }

        // Parse Date (formats standard DD-MM-YYYY or MM-DD-YYYY or ISO)
        let date = getValue(row, 'Fecha');
        if (typeof date === 'number') {
          // Excel date serial
          const dt = new Date((date - (25567 + 2)) * 86400 * 1000);
          date = dt.toISOString().split('T')[0];
        } else if (typeof date === 'string') {
          date = date.trim();
          if (date.includes('-')) {
            const parts = date.split('-');
            if (parts[0].length === 2 && parts[2].length === 4) {
               // DD-MM-YYYY -> YYYY-MM-DD
               date = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
          } else if (date.includes('/')) {
            const parts = date.split('/');
            if (parts[0].length === 2 && parts[2].length === 4) {
               // DD/MM/YYYY -> YYYY-MM-DD
               date = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
          }
        }

        // Clean currency values
        const parseCurrency = (val: any) => {
          if (typeof val === 'number') return val;
          if (typeof val !== 'string') return 0;
          // Handles cases like " $  1.513.209,04 "
          const cleaned = val.replace(/[$\s.]/g, '').replace(',', '.');
          return Number(cleaned) || 0;
        };

        const totalGross = parseCurrency(getValue(row, 'Ventas Brutas') || getValue(row, 'Bruto') || 0);
        const totalNet = parseCurrency(getValue(row, 'Ventas Netas') || getValue(row, 'Neto') || 0);
        
        const ordersMañana = Number(getValue(row, 'Ordenes Turno Mañana') || 0);
        const ordersTarde = Number(getValue(row, 'Ordenes Turno Tarde') || 0);
        const ordersPYResto = Number(getValue(row, 'Ordenes Pedidos Ya Resto') || 0);
        const ordersPYCafe = Number(getValue(row, 'Ordenes Pedidos Ya Café') || 0);
        const totalOrders = ordersMañana + ordersTarde + ordersPYResto + ordersPYCafe;

        const coversMañana = Number(getValue(row, 'Cubiertos Turno Mañana') || 0);
        const coversTarde = Number(getValue(row, 'Cubiertos Turno Tarde') || 0);

        const types: { type: SaleType, orders: number, covers: number }[] = [
          { type: 'Turno Mañana', orders: ordersMañana, covers: coversMañana },
          { type: 'Turno Tarde', orders: ordersTarde, covers: coversTarde },
          { type: 'Pedidos Ya Restó', orders: ordersPYResto, covers: 0 },
          { type: 'Pedidos Ya Café', orders: ordersPYCafe, covers: 0 }
        ];

        // If we have total money but it's not split per shift in Excel,
        // we split it proportionally based on orders to maintain consistency.
        const splitMoney = (total: number, shiftOrders: number) => {
          if (totalOrders === 0) return 0;
          return (total / totalOrders) * shiftOrders;
        };

        types.forEach(t => {
          if (t.orders > 0 || (t.type === 'Turno Mañana' && totalGross > 0 && totalOrders === 0)) {
            const shiftGross = totalOrders > 0 ? splitMoney(totalGross, t.orders) : totalGross;
            const shiftNet = totalOrders > 0 ? splitMoney(totalNet, t.orders) : totalNet;

            recordsToInsert.push({
              branch_id: targetBranchId,
              date: date,
              type: t.type,
              pesos: shiftGross,
              net_sales: shiftNet,
              orders: t.orders,
              covers: t.covers,
              projection: totalGross * 30,
              cash: t.type === 'Turno Mañana' ? parseCurrency(getValue(row, 'Efectivo')) : 0,
              card: t.type === 'Turno Mañana' ? parseCurrency(getValue(row, 'Tarjetas')) : 0,
              qr: t.type === 'Turno Mañana' ? parseCurrency(getValue(row, 'QR y Otros')) : 0,
              iva: t.type === 'Turno Mañana' ? parseCurrency(getValue(row, 'IVA')) : 0,
              product_ranking: []
            });
          }
        });
      });

      if (recordsToInsert.length > 0) {
        confirmManualImport(recordsToInsert);
      } else {
        alert("No se encontraron registros válidos en la planilla. Verifique los nombres de las sucursales y las columnas.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmManualImport = async (records: any[]) => {
    setLoading(true);
    console.log('Inserting records:', records);
    try {
      const { error } = await supabase.from('sales').insert(records);
      if (error) {
        console.error('Supabase Error details:', error);
        throw error;
      }
      alert(`Importación exitosa: ${records.length} registros cargados.`);
      fetchData();
    } catch (err: any) {
      console.error('Error in manual import:', err);
      alert(`Error al guardar los registros importados: ${err.message || 'Error desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExportTemplate = () => {
    const templateData = [
      {
        Sucursal: branches.find(b => b.id === selectedBranchId)?.name || 'Barrio Norte',
        Semana: 'Semana 1',
        Día: 'Mie',
        Fecha: '01-04-2026',
        Efectivo: 1513209.04,
        Tarjetas: 2744115.00,
        'QR y Otros': 1744190.00,
        'Ventas Brutas': 6001514.04,
        'Ventas Netas': 5218317.30,
        IVA: 783196.74,
        'Ordenes Turno Mañana': 10,
        'Ordenes Turno Tarde': 15,
        'Ordenes Pedidos Ya Resto': 2,
        'Ordenes Pedidos Ya Café': 1,
        'Cubiertos Turno Mañana': 100,
        'Cubiertos Turno Tarde': 150
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo Carga Mensual");
    XLSX.writeFile(wb, "Modelo_Carga_Ventas_Completo.xlsx");
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
            <h2 className="text-xl font-bold text-text-main tracking-tight uppercase">Administración de Ventas</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest text-brand-500/80">Control de Ingresos y Rankings</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-bg-accent p-1 rounded border border-border-dim mr-4">
             <button 
              onClick={() => setActiveSubTab('daily')}
              className={cn(
                "px-4 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                activeSubTab === 'daily' ? "bg-brand-500 text-black shadow-lg" : "text-text-dim hover:text-text-main"
              )}
             >
                Control Diario
             </button>
             <button 
              onClick={() => setActiveSubTab('rankings')}
              className={cn(
                "px-4 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                activeSubTab === 'rankings' ? "bg-brand-500 text-black shadow-lg" : "text-text-dim hover:text-text-main"
              )}
             >
                Ranking Artículos
             </button>
          </div>

          <button 
            onClick={activeSubTab === 'daily' ? handleExportTemplate : handleExportRankingTemplate}
            className="bg-bg-accent hover:bg-bg-card border border-border-dim text-text-dim px-6 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
          >
            <Download size={16} /> MODELO
          </button>
          
          {activeSubTab === 'daily' ? (
            <label className="bg-bg-accent hover:bg-bg-card border border-border-dim text-text-dim px-6 py-2 rounded text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center justify-center gap-2">
              <FileUp size={16} /> IMPORTAR VENTAS
              <input 
                type="file" 
                accept=".xlsx, .xls, .csv" 
                className="hidden" 
                onChange={handleImportExcel}
              />
            </label>
          ) : (
            <label className="bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 text-brand-500 px-6 py-2 rounded text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center justify-center gap-2">
              <FileUp size={16} /> IMPORTAR RANKING
              <input 
                type="file" 
                accept=".xlsx, .xls, .csv" 
                className="hidden" 
                onChange={handleImportRankingExcel}
              />
            </label>
          )}

          {!isAdding && activeSubTab === 'daily' && (
            <button 
              onClick={() => setIsAdding(true)}
              className="bg-brand-500 hover:bg-brand-600 text-black px-6 py-2 rounded text-[10px] font-black uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-2"
            >
              <Plus size={16} /> CARGAR DÍA
            </button>
          )}
        </div>
      </div>

      {activeSubTab === 'daily' ? (
        <>
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
            <div className="bg-bg-accent p-4 border-b border-border-dim flex justify-between items-center">
               <h3 className="text-[10px] font-black uppercase tracking-widest text-text-main">Historial de Ventas</h3>
               {loading && <Loader2 className="animate-spin text-brand-500" size={14} />}
            </div>
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
      </>
      ) : (
        <div className="space-y-6">
           <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="md:col-span-1 space-y-4">
                 <div className="bg-bg-sidebar border border-border-dim p-6 rounded space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-500 border-b border-border-dim pb-2">Resumen Ranking</h3>
                    <div className="space-y-4">
                       <div className="p-4 bg-bg-accent rounded border border-border-dim">
                          <p className="text-[8px] font-bold text-text-dim uppercase mb-1">Registros Cargados</p>
                          <p className="text-2xl font-mono font-black text-text-main">{rankings.length}</p>
                       </div>
                       <div className="p-4 bg-bg-accent rounded border border-border-dim">
                          <p className="text-[8px] font-bold text-text-dim uppercase mb-1">Sucursales con Datos</p>
                          <p className="text-2xl font-mono font-black text-text-main">
                             {new Set(rankings.map(r => r.branch_id)).size}
                          </p>
                       </div>
                    </div>
                 </div>

                 <div className="bg-brand-500/5 border border-brand-500/20 p-6 rounded">
                    <div className="flex items-center gap-2 text-brand-500 mb-2">
                       <Filter size={14} />
                       <span className="text-[10px] font-black uppercase">Filtro Rápido</span>
                    </div>
                    <p className="text-[9px] text-text-dim leading-relaxed uppercase font-bold">
                       Use el selector de sucursal arriba para ver el ranking específico de un punto de venta.
                    </p>
                 </div>
              </div>

              <div className="md:col-span-3">
                 <div className="bg-bg-sidebar border border-border-dim rounded overflow-hidden">
                    <div className="bg-bg-accent p-4 border-b border-border-dim flex justify-between items-center">
                       <h3 className="text-[10px] font-black uppercase tracking-widest text-text-main">Ranking de Artículos por Sucursal</h3>
                       <div className="flex items-center gap-4">
                          <span className="text-[9px] font-bold text-text-dim uppercase">Mostrando: {selectedBranchId === 'all' ? 'Todas las Sucursales' : branches.find(b => b.id === selectedBranchId)?.name}</span>
                          {loading && <Loader2 className="animate-spin text-brand-500" size={14} />}
                       </div>
                    </div>
                    <div className="overflow-x-auto">
                       <table className="w-full border-collapse text-[10px]">
                          <thead>
                             <tr className="bg-bg-card border-b border-border-dim text-left text-text-dim font-bold uppercase tracking-widest">
                                <th className="px-6 py-4">Producto</th>
                                <th className="px-4 py-4 text-center">Código</th>
                                <th className="px-4 py-4 text-center">Sucursal</th>
                                <th className="px-4 py-4 text-center">Fecha/Mes</th>
                                <th className="px-4 py-4 text-right">Cantidad</th>
                                <th className="px-4 py-4 text-right">Importe</th>
                                <th className="px-6 py-4"></th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-border-dim">
                             {rankings.length === 0 ? (
                               <tr>
                                  <td colSpan={7} className="px-6 py-20 text-center text-text-dim italic uppercase opacity-50">
                                     No hay rankings cargados. Use el botón "Importar Ranking" para cargar un Excel.
                                  </td>
                               </tr>
                             ) : (
                               rankings.map((r, idx) => (
                                 <tr key={r.id || idx} className="hover:bg-bg-accent/50 transition-colors group">
                                    <td className="px-6 py-4">
                                       <span className="font-black text-text-main uppercase">{r.product_name}</span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                       <span className="font-mono text-text-dim bg-bg-card px-2 py-0.5 rounded border border-border-dim text-[9px]">{r.product_code || '---'}</span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                       <span className="text-text-dim uppercase font-bold">{branches.find(b => b.id === r.branch_id)?.name || 'Desconocida'}</span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                       <span className="text-text-dim font-mono">{r.date}</span>
                                    </td>
                                    <td className="px-4 py-4 text-right font-black text-brand-500 text-sm">
                                       {r.quantity.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-4 text-right font-mono font-bold text-text-main">
                                       ${r.amount?.toLocaleString() || 0}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                       <button className="text-text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <Trash2 size={14} />
                                       </button>
                                    </td>
                                 </tr>
                               ))
                             )}
                          </tbody>
                       </table>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Ranking Import Modal */}
      <AnimatePresence>
         {isImportingRanking && rankingToImport && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-bg-sidebar border border-border-dim rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden"
              >
                 <div className="p-6 border-b border-border-dim bg-bg-accent flex justify-between items-center">
                    <div>
                       <h3 className="text-sm font-black text-brand-500 uppercase tracking-widest flex items-center gap-2">
                          <CheckCircle2 size={18} /> Previsualización de Importación
                       </h3>
                       <p className="text-[10px] text-text-dim font-bold uppercase mt-1">Verifique los datos antes de confirmar</p>
                    </div>
                    <button onClick={() => setIsImportingRanking(false)} className="text-text-dim hover:text-text-main">
                       <X size={20} />
                    </button>
                 </div>

                 <div className="p-6 bg-bg-main border-b border-border-dim grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[9px] font-black text-text-dim uppercase">Sucursal de Destino</label>
                       <select 
                        value={rankingToImport.branchId}
                        onChange={(e) => setRankingToImport({...rankingToImport, branchId: e.target.value})}
                        className="w-full bg-bg-sidebar border border-border-dim rounded px-3 py-2 text-xs font-black uppercase text-brand-500"
                       >
                          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[9px] font-black text-text-dim uppercase">Fecha del Ranking</label>
                       <input 
                        type="date"
                        value={rankingToImport.date}
                        onChange={(e) => setRankingToImport({...rankingToImport, date: e.target.value})}
                        className="w-full bg-bg-sidebar border border-border-dim rounded px-3 py-2 text-xs font-mono"
                       />
                    </div>
                 </div>

                 <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                    <table className="w-full border-collapse text-[10px]">
                       <thead className="sticky top-0 z-10 bg-bg-accent shadow-sm">
                          <tr className="text-left text-text-dim font-bold uppercase tracking-widest border-b border-border-dim">
                             <th className="px-6 py-3">Código</th>
                             <th className="px-6 py-3">Nombre del Producto</th>
                             <th className="px-6 py-3 text-right">Cantidad</th>
                             <th className="px-6 py-3 text-right">Importe</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-border-dim/30">
                          {rankingToImport.entries.map((e, idx) => (
                            <tr key={idx} className="hover:bg-bg-accent/30">
                               <td className="px-6 py-3 font-mono text-text-dim">{e.product_code}</td>
                               <td className="px-6 py-3 font-black text-text-main uppercase">{e.product_name}</td>
                               <td className="px-6 py-3 text-right font-black text-brand-500">{e.quantity}</td>
                               <td className="px-6 py-3 text-right font-mono text-text-dim">${e.amount?.toLocaleString()}</td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>

                 <div className="p-6 bg-bg-accent border-t border-border-dim flex gap-4">
                    <button 
                      onClick={confirmRankingImport}
                      disabled={loading}
                      className="flex-1 bg-brand-500 text-black py-3 rounded text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 shadow-xl transition-all flex items-center justify-center gap-2"
                    >
                       {loading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                       CONFIRMAR E IMPORTAR {rankingToImport.entries.length} ARTÍCULOS
                    </button>
                    <button 
                      onClick={() => setIsImportingRanking(false)}
                      className="px-8 py-3 rounded border border-border-dim text-text-dim text-[11px] font-black uppercase tracking-widest hover:bg-bg-sidebar transition-all"
                    >
                       CANCELAR
                    </button>
                 </div>
              </motion.div>
           </div>
         )}
      </AnimatePresence>
    </motion.div>
  );
}
