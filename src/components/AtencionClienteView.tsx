/**
 * SPDX-License-Identifier: Apache-2.0
 * Atención al Cliente (standalone, para Gestión Líderes Operativos).
 * Reutiliza la pestaña de Marketing · Informes (MktAtencionTab), con su propio
 * selector de mes, para que los líderes operativos también puedan verlo/cargarlo.
 */
import { useState } from 'react';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { Branch } from '../types';
import MktAtencionTab from './MktAtencionTab';

export default function AtencionClienteView({ branches = [], isReadOnly = false }: { branches?: Branch[]; isReadOnly?: boolean }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const shift = (delta: number) => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  return (
    <div className="space-y-5">
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Star size={18} className="text-brand-500" />
          <h2 className="text-lg font-black uppercase text-text-main tracking-tight">Atención al Cliente</h2>
        </div>
        <p className="text-[11px] text-text-dim font-bold uppercase tracking-widest mb-4">Reseñas y comentarios por sucursal · Google, Pedidos Ya e Instagram</p>
        <div className="flex items-center gap-1 bg-bg-accent/40 p-1 rounded-lg border border-border-dim/80 w-fit">
          <button onClick={() => shift(-1)} className="p-1.5 hover:bg-bg-sidebar rounded text-text-dim"><ChevronLeft size={15} /></button>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-transparent text-text-main text-[11px] font-black uppercase outline-none w-[120px] text-center cursor-pointer" />
          <button onClick={() => shift(1)} className="p-1.5 hover:bg-bg-sidebar rounded text-text-dim"><ChevronRight size={15} /></button>
        </div>
      </div>
      <MktAtencionTab branches={branches} month={month} isReadOnly={isReadOnly} />
    </div>
  );
}
