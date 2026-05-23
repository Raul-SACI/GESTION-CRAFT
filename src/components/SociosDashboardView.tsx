/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Building2, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Star, 
  DollarSign, 
  Users, 
  Utensils, 
  MessageSquare, 
  Clock, 
  AlertTriangle, 
  Percent, 
  PieChart, 
  Award, 
  Sparkles,
  ShoppingBag,
  ExternalLink
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart,
  Area,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';

interface SociosDashboardViewProps {
  branches: Branch[];
}

export default function SociosDashboardView({ branches }: SociosDashboardViewProps) {
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-05');

  // Multi-unit or single-unit data representation for Socios
  const reputationData: Record<string, { googleRating: number; googleVotes: number; pyRating: number; pyCafeRating: number; pyDelay: number; complaintsCount: number }> = {
    all: { googleRating: 4.6, googleVotes: 780, pyRating: 4.5, pyCafeRating: 4.3, pyDelay: 19, complaintsCount: 5 },
    bn: { googleRating: 4.7, googleVotes: 320, pyRating: 4.6, pyCafeRating: 4.4, pyDelay: 17, complaintsCount: 1 },
    palermo: { googleRating: 4.4, googleVotes: 260, pyRating: 4.3, pyCafeRating: 4.1, pyDelay: 23, complaintsCount: 3 },
    recoleta: { googleRating: 4.8, googleVotes: 200, pyRating: 4.7, pyCafeRating: 4.5, pyDelay: 16, complaintsCount: 1 },
  };

  const plMockData: Record<string, { sales: number; cmv: number; salaries: number; rent: number; marketing: number; other: number }> = {
    all: { sales: 429733427, cmv: 133415090, salaries: 103853888, rent: 18727328, marketing: 12500000, other: 15400000 },
    bn: { sales: 158200000, cmv: 49042000, salaries: 38200000, rent: 6800000, marketing: 4200000, other: 5100000 },
    palermo: { sales: 139533427, cmv: 43257000, salaries: 33653888, rent: 6127328, marketing: 4100000, other: 5300000 },
    recoleta: { sales: 132000000, cmv: 41116090, salaries: 32000000, rent: 5800000, marketing: 4200000, other: 5000000 },
  };

  const monthlySalesTrend = [
    { name: 'Ene', Ventas: 340000000, EBITDA: 110000000 },
    { name: 'Feb', Ventas: 365000000, EBITDA: 122000000 },
    { name: 'Mar', Ventas: 390000000, EBITDA: 134000000 },
    { name: 'Abr', Ventas: 410000000, EBITDA: 141000000 },
    { name: 'May', Ventas: 429733427, EBITDA: 146137121 },
  ];

  const currentRep = useMemo(() => {
    return reputationData[selectedBranch] || reputationData.all;
  }, [selectedBranch]);

  const currentPL = useMemo(() => {
    return plMockData[selectedBranch] || plMockData.all;
  }, [selectedBranch]);

  const computedEBITDA = currentPL.sales - (currentPL.cmv + currentPL.salaries + currentPL.rent + currentPL.marketing + currentPL.other);
  const ebitdaMarginVal = (computedEBITDA / currentPL.sales) * 100;
  const cmvPercentVal = (currentPL.cmv / currentPL.sales) * 100;
  const staffPercentVal = (currentPL.salaries / currentPL.sales) * 100;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-20 font-sans"
    >
      {/* Executive Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/15 p-3 text-brand-500 border border-brand-500/25 rounded-xl shadow-lg shadow-brand-500/5">
            <Award size={26} className="stroke-[2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-brand-500/10 text-brand-600 dark:text-brand-500 text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border border-brand-500/20">Panel Socios</span>
              <span className="text-text-dim text-[10px] font-bold uppercase tracking-wider">• Acceso Reservado</span>
            </div>
            <h2 className="text-2xl font-black text-text-main uppercase tracking-tight mt-1">
              Dashboard de Socios {selectedBranch !== 'all' ? `• ${(branches.find(b => b.id === selectedBranch))?.name}` : '(Vista Consolidada)'}
            </h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest mt-0.5">Indicadores Financieros Clave, Reputación Online & Estado de Resultados</p>
          </div>
        </div>

        {/* Global Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Branch filter selection */}
          <div className="bg-bg-sidebar border border-border-dim rounded-lg px-3 py-1.5 flex items-center gap-2">
            <Building2 size={14} className="text-brand-500" />
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-transparent border-none text-[10.5px] font-extrabold text-text-main outline-none uppercase font-sans cursor-pointer focus:ring-0"
            >
              <option value="all" className="bg-bg-sidebar text-text-main">Todas las Sucursales</option>
              {branches.map(b => (
                <option key={b.id} value={b.id} className="bg-bg-sidebar text-text-main">{b.name}</option>
              ))}
            </select>
          </div>

          <div className="bg-bg-sidebar border border-border-dim rounded-lg px-3 py-1.5 flex items-center gap-2 font-mono">
            <Calendar size={14} className="text-brand-500" />
            <span className="text-[10px] font-extrabold uppercase text-text-main">{selectedMonth}</span>
          </div>
        </div>
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Metric 1: Consolidated Sales */}
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <DollarSign size={50} className="text-brand-600 dark:text-brand-500" />
          </div>
          <p className="text-[9px] text-[#8B949E] uppercase font-black tracking-widest">Ventas Facturadas</p>
          <p className="text-2xl font-mono font-black text-text-main tracking-tight mt-1.5">
            ${currentPL.sales.toLocaleString('es-AR')}
          </p>
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-emerald-500 font-bold">
            <TrendingUp size={12} />
            <span>+12.4% vs Mes Anterior</span>
          </div>
        </div>

        {/* Metric 2: EBITDA summary */}
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <PieChart size={50} className="text-brand-600 dark:text-brand-500" />
          </div>
          <p className="text-[9px] text-[#8B949E] uppercase font-black tracking-widest">Resultado EBITDA</p>
          <p className="text-2xl font-mono font-black text-brand-600 dark:text-brand-500 tracking-tight mt-1.5">
            ${computedEBITDA.toLocaleString('es-AR')}
          </p>
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-brand-600 dark:text-brand-500 font-extrabold">
            <Percent size={12} />
            <span>Margen Operativo: {ebitdaMarginVal.toFixed(1)}%</span>
          </div>
        </div>

        {/* Metric 3: Google Maps Reputation */}
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Star size={50} className="text-yellow-500" />
          </div>
          <p className="text-[9px] text-[#8B949E] uppercase font-black tracking-widest">Calificación Google Maps</p>
          <div className="flex items-baseline gap-2 mt-1.5">
            <p className="text-2xl font-mono font-black text-text-main tracking-tight">
              {currentRep.googleRating}
            </p>
            <div className="flex text-yellow-500">
              {[...Array(5)].map((_, i) => (
                <Star 
                  key={i} 
                  size={12} 
                  fill={i < Math.floor(currentRep.googleRating) ? 'currentColor' : 'none'} 
                  className={cn(i < Math.floor(currentRep.googleRating) ? "text-yellow-500" : "text-text-dim/40")}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-[#8B949E] font-bold">
            <MessageSquare size={12} className="text-blue-400" />
            <span>Basado en {currentRep.googleVotes} reseñas verificadas</span>
          </div>
        </div>

        {/* Metric 4: Delivery Reputation */}
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <ShoppingBag size={50} className="text-[#ED1C24]" />
          </div>
          <p className="text-[9px] text-[#8B949E] uppercase font-black tracking-widest">Calificación Pedidos Ya</p>
          <div className="flex items-baseline gap-3 mt-1.5">
            <p className="text-2xl font-mono font-black text-pink-600 dark:text-pink-500 tracking-tight">
              {currentRep.pyRating} ⭐
            </p>
            <span className="text-[9.5px] font-black text-text-dim uppercase tracking-tighter">Cafetería: {currentRep.pyCafeRating} ⭐</span>
          </div>
          <div className="flex items-center gap-2 mt-2 text-[10px] font-bold">
            <div className="flex items-center gap-1 text-emerald-500">
              <Clock size={11} />
              <span>{currentRep.pyDelay} min demora</span>
            </div>
            {currentRep.complaintsCount > 2 ? (
              <div className="flex items-center gap-1 text-red-500 bg-red-500/10 px-1.5 py-0.25 rounded border border-red-500/20">
                <AlertTriangle size={10} />
                <span>{currentRep.complaintsCount} reclamos</span>
              </div>
            ) : (
              <span className="text-text-dim">Demora óptima</span>
            )}
          </div>
        </div>
      </div>

      {/* Grid: Trends Chart & Online Reputation deep dive */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Trend area chart */}
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 lg:col-span-2 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-black uppercase text-brand-500 tracking-wider">Evolución Histórica de Ventas & EBITDA</h3>
              <p className="text-[9px] text-text-dim font-bold uppercase mt-0.5">Historial acumulado de los últimos 5 meses</p>
            </div>
            <div className="flex items-center gap-4 text-[9.5px] font-mono font-black">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-brand-500/80 rounded-sm"></span>
                <span className="text-text-main">Ventas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-emerald-500/80 rounded-sm"></span>
                <span className="text-text-main">EBITDA</span>
              </div>
            </div>
          </div>

          <div className="h-[260px] w-full pt-1.5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlySalesTrend} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ED1C24" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#ED1C24" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorEbitda" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" opacity={0.15} />
                <XAxis 
                  dataKey="name" 
                  stroke="#888888" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  tickMargin={8}
                />
                <YAxis 
                  stroke="#888888" 
                  fontSize={8} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(val) => `$${(val / 1000000).toFixed(0)}M`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1E293B', 
                    borderRadius: '8px', 
                    color: '#fff', 
                    border: '1px solid #475569',
                    fontFamily: 'monospace',
                    fontSize: '11px'
                  }} 
                  formatter={(value: any) => [`$${value.toLocaleString('es-AR')}`]}
                />
                <Area type="monotone" dataKey="Ventas" stroke="#ED1C24" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSales)" />
                <Area type="monotone" dataKey="EBITDA" stroke="#10B981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorEbitda)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Reputational Module Side widget */}
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 space-y-4 shadow-sm">
          <div>
            <h3 className="text-xs font-black uppercase text-brand-500 tracking-wider">Análisis de Reputación Online</h3>
            <p className="text-[9px] text-text-dim font-bold uppercase mt-0.5">Google vs Pedidos Ya - Rating Detallado</p>
          </div>

          <div className="space-y-4 pt-2">
            
            {/* Google card */}
            <div className="bg-bg-main/30 border border-border-dim/60 rounded-lg p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                  <span className="text-[10px] font-black uppercase text-text-main">Google Maps Business</span>
                </div>
                <a href="https://maps.google.com" target="_blank" referrerPolicy="no-referrer" className="text-[9px] text-[#8B949E] hover:text-brand-500 flex items-center gap-1 font-bold uppercase">
                  Ver Enlace <ExternalLink size={10} />
                </a>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-mono font-black text-text-main tracking-tight">{currentRep.googleRating} ⭐</p>
                  <p className="text-[8.5px] font-bold text-text-dim uppercase mt-1">Calificación de la Sucursal</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-mono font-bold text-[#E2E8F0]">{currentRep.googleVotes}</p>
                  <p className="text-[8.5px] font-bold text-text-dim uppercase mt-1">Reseñas Registradas</p>
                </div>
              </div>
              {/* Quality indicator */}
              <div className="w-full bg-border-dim/40 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-brand-500 h-full rounded-full" 
                  style={{ width: `${(currentRep.googleRating / 5) * 100}%` }}
                ></div>
              </div>
            </div>

            {/* Pedidos Ya card */}
            <div className="bg-bg-main/30 border border-border-dim/60 rounded-lg p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></div>
                  <span className="text-[10px] font-black uppercase text-text-main">Pedidos Ya Integración</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[8px] font-bold text-text-dim uppercase">Restaurante</span>
                  <p className="text-lg font-mono font-black text-text-main mt-0.5">{currentRep.pyRating} ⭐</p>
                </div>
                <div>
                  <span className="text-[8px] font-bold text-text-dim uppercase">Cafetería</span>
                  <p className="text-lg font-mono font-black text-text-main mt-0.5">{currentRep.pyCafeRating} ⭐</p>
                </div>
              </div>
              <div className="border-t border-border-dim/30 pt-2 flex items-center justify-between text-[9px] font-bold uppercase text-text-dim">
                <span>Promedio Demora</span>
                <span className="font-mono text-emerald-500 font-extrabold">{currentRep.pyDelay} minutos</span>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Estado de Resultado (P&L Summary) segment */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 space-y-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-black uppercase text-brand-500 tracking-wider">Estado de Resultado Ejecutivo (P&L Relativo)</h3>
            <p className="text-[9px] text-text-dim font-bold uppercase mt-0.5">Vista ágil del margen operativo, costo de materia prima & salarios del personal</p>
          </div>
          <div className="text-[10px] font-black text-brand-500 bg-brand-500/10 border border-brand-500/25 px-3 py-1 rounded-md uppercase">
            Egresos Totales: ${((currentPL.cmv + currentPL.salaries + currentPL.rent + currentPL.marketing + currentPL.other) / 1000000).toFixed(1)}M
          </div>
        </div>

        {/* Interactive P&L bar breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center border-b border-border-dim/30 pb-6">
          
          <div className="lg:col-span-4 space-y-4">
            <h4 className="text-[10.5px] font-black text-text-main uppercase tracking-wider">Distribución Porcentual del Margen</h4>
            <div className="space-y-3">
              {/* Costo Mercaderia (CMV) */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[9.5px] font-bold">
                  <span className="text-text-dim uppercase">CMV (Insumos/Comida)</span>
                  <span className="font-mono text-text-main">{cmvPercentVal.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-border-dim/40 h-2 rounded-md overflow-hidden">
                  <div className="bg-[#FFA500] h-full" style={{ width: `${cmvPercentVal}%` }}></div>
                </div>
              </div>
              
              {/* Personal (Sueldos) */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[9.5px] font-bold">
                  <span className="text-text-dim uppercase">Costo Laboral (Sueldos)</span>
                  <span className="font-mono text-text-main">{staffPercentVal.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-border-dim/40 h-2 rounded-md overflow-hidden">
                  <div className="bg-[#4169E1] h-full" style={{ width: `${staffPercentVal}%` }}></div>
                </div>
              </div>

              {/* EBITDA */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[9.5px] font-black">
                  <span className="text-emerald-500 uppercase">Margen Neto EBITDA</span>
                  <span className="font-mono text-emerald-500">{ebitdaMarginVal.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-border-dim/40 h-2 rounded-md overflow-hidden">
                  <div className="bg-[#10B981] h-full" style={{ width: `${ebitdaMarginVal}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="border-b border-border-dim/60 text-[9px] font-black text-text-dim uppercase tracking-wider">
                  <th className="pb-2.5">Rubro / Concepto de Negocio</th>
                  <th className="pb-2.5 text-right">Monto Estimado ({selectedMonth})</th>
                  <th className="pb-2.5 text-right">% Participación</th>
                  <th className="pb-2.5 text-right">Rendimiento Operativo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim/40 text-[10px]">
                <tr>
                  <td className="py-2 text-[#E2E8F0] font-black">Ingresos por Ventas de la Unidad</td>
                  <td className="py-2 text-right font-mono text-text-main font-bold">${currentPL.sales.toLocaleString('es-AR')}</td>
                  <td className="py-2 text-right font-mono text-text-main">100.0%</td>
                  <td className="py-2 text-right"><span className="text-emerald-500 font-extrabold uppercase text-[8px] bg-emerald-500/10 px-1.5 py-0.5 rounded">Saludable</span></td>
                </tr>
                <tr>
                  <td className="py-2 text-text-dim">Costo de Materia Prima Comercializada (CMV)</td>
                  <td className="py-2 text-right font-mono text-amber-500/90 font-bold">-${currentPL.cmv.toLocaleString('es-AR')}</td>
                  <td className="py-2 text-right font-mono text-text-dim">-{cmvPercentVal.toFixed(1)}%</td>
                  <td className="py-2 text-right text-text-dim uppercase text-[8.5px]">Objetivo &lt; 35.0%</td>
                </tr>
                <tr>
                  <td className="py-2 text-text-dim">Sueldos de Estructura de Personal (RRHH)</td>
                  <td className="py-2 text-right font-mono text-[#4169E1] font-bold">-${currentPL.salaries.toLocaleString('es-AR')}</td>
                  <td className="py-2 text-right font-mono text-text-dim">-{staffPercentVal.toFixed(1)}%</td>
                  <td className="py-2 text-right text-text-dim uppercase text-[8.5px]">Objetivo &lt; 25.0%</td>
                </tr>
                <tr>
                  <td className="py-2 text-text-dim">Alquileres Comunes de Locales & Expensas</td>
                  <td className="py-2 text-right font-mono text-text-main">-${currentPL.rent.toLocaleString('es-AR')}</td>
                  <td className="py-2 text-right font-mono text-text-dim">-{((currentPL.rent / currentPL.sales) * 100).toFixed(1)}%</td>
                  <td className="py-2 text-right text-text-dim uppercase text-[8.5px]">Fijo de Estructura</td>
                </tr>
                <tr>
                  <td className="py-2 text-text-dim">Inversión en Marketing & Posicionamiento</td>
                  <td className="py-2 text-right font-mono text-text-main">-${currentPL.marketing.toLocaleString('es-AR')}</td>
                  <td className="py-2 text-right font-mono text-text-dim">-{((currentPL.marketing / currentPL.sales) * 100).toFixed(1)}%</td>
                  <td className="py-2 text-right text-text-dim">Banners & Ads</td>
                </tr>
                <tr className="bg-bg-main/30 font-black border-t-2 border-border-dim/60">
                  <td className="py-3 text-brand-600 dark:text-brand-500 font-black">Ganancia Estimada de Socios(EBITDA)</td>
                  <td className="py-3 text-right font-mono text-brand-600 dark:text-brand-500 font-black">${computedEBITDA.toLocaleString('es-AR')}</td>
                  <td className="py-3 text-right font-mono text-brand-600 dark:text-brand-500">{ebitdaMarginVal.toFixed(1)}%</td>
                  <td className="py-3 text-right"><span className="text-emerald-500 font-extrabold uppercase text-[8.5px] bg-emerald-500/10 px-2 py-0.5 rounded">Excelente</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Socio Advice Warning Banner */}
        <div className="bg-brand-500/[0.03] border border-brand-500/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-brand-500 animate-pulse flex-shrink-0" />
            <p className="text-[10px] text-text-dim leading-relaxed">
              <strong className="text-text-main">Nota del Sistema Inteligente:</strong> El margen neto consolidado actual de la empresa es del <strong className="text-emerald-500">{ebitdaMarginVal.toFixed(1)}%</strong>. Esto representa un desempeño superior respecto al promedio gastronómico regional (18%). Se recomienda mantener control de desvíos diario.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
