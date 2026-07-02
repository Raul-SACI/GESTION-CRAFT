import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { MapPin, Plus, Trash2, Loader2, Save, Check } from 'lucide-react';

interface Branch { id: string; name: string; }
interface Zone {
  id: string;
  name: string;
  x: number; y: number;
  width: number; height: number;
  color: string;
}
interface Props {
  branches: Branch[];
  selectedBranchId: string;
  isReadOnly?: boolean;
}

const CANVAS_W = 1000;
const CANVAS_H = 600;
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function SalonConfigView({ branches, selectedBranchId, isReadOnly = false }: Props) {
  const realBranches = branches.filter(b => b.id && b.id !== 'all');
  const [branchId, setBranchId] = useState(selectedBranchId && selectedBranchId !== 'all' ? selectedBranchId : (realBranches[0]?.id || ''));
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragState = useRef<{ id: string; mode: 'move' | 'resize'; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number } | null>(null);

  // Cargar zonas de la sucursal
  useEffect(() => {
    if (!branchId) return;
    setLoading(true);
    setSelectedZone(null);
    (async () => {
      const { data } = await supabase.from('salon_zones').select('*').eq('branch_id', branchId).order('created_at');
      setZones((data || []).map((z: any) => ({
        id: z.id, name: z.name, x: Number(z.x), y: Number(z.y),
        width: Number(z.width), height: Number(z.height), color: z.color || '#3b82f6',
      })));
      setLoading(false);
    })();
  }, [branchId]);

  // Convierte coordenadas de pantalla a coordenadas del SVG (viewBox)
  const toSvgCoords = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * CANVAS_W;
    const y = ((clientY - rect.top) / rect.height) * CANVAS_H;
    return { x, y };
  }, []);

  const addZone = () => {
    if (isReadOnly) return;
    const nz: Zone = {
      id: `tmp_${Date.now()}`,
      name: `Zona ${zones.length + 1}`,
      x: 60, y: 60, width: 240, height: 160,
      color: COLORS[zones.length % COLORS.length],
    };
    setZones(prev => [...prev, nz]);
    setSelectedZone(nz.id);
  };

  const updateZone = (id: string, patch: Partial<Zone>) => {
    setZones(prev => prev.map(z => z.id === id ? { ...z, ...patch } : z));
  };
  const removeZone = (id: string) => {
    setZones(prev => prev.filter(z => z.id !== id));
    if (selectedZone === id) setSelectedZone(null);
  };

  // Drag & resize handlers
  const onPointerDown = (e: React.PointerEvent, id: string, mode: 'move' | 'resize') => {
    if (isReadOnly) return;
    e.stopPropagation();
    setSelectedZone(id);
    const z = zones.find(zz => zz.id === id);
    if (!z) return;
    const p = toSvgCoords(e.clientX, e.clientY);
    dragState.current = { id, mode, startX: p.x, startY: p.y, origX: z.x, origY: z.y, origW: z.width, origH: z.height };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds) return;
    const p = toSvgCoords(e.clientX, e.clientY);
    const dx = p.x - ds.startX;
    const dy = p.y - ds.startY;
    if (ds.mode === 'move') {
      const nx = Math.max(0, Math.min(CANVAS_W - ds.origW, ds.origX + dx));
      const ny = Math.max(0, Math.min(CANVAS_H - ds.origH, ds.origY + dy));
      updateZone(ds.id, { x: nx, y: ny });
    } else {
      const nw = Math.max(80, Math.min(CANVAS_W - ds.origX, ds.origW + dx));
      const nh = Math.max(60, Math.min(CANVAS_H - ds.origY, ds.origH + dy));
      updateZone(ds.id, { width: nw, height: nh });
    }
  };
  const onPointerUp = () => { dragState.current = null; };

  const saveAll = async () => {
    if (isReadOnly) return;
    setSaving(true);
    try {
      // Estrategia simple: borrar las de la sucursal e insertar las actuales
      const del = await supabase.from('salon_zones').delete().eq('branch_id', branchId);
      if (del.error) throw del.error;
      if (zones.length > 0) {
        const ins = await supabase.from('salon_zones').insert(
          zones.map(z => ({ branch_id: branchId, name: z.name, x: z.x, y: z.y, width: z.width, height: z.height, color: z.color }))
        );
        if (ins.error) throw ins.error;
      }
      setSaving(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (err: any) {
      setSaving(false);
      alert('No se pudo guardar el salón.\n\nDetalle: ' + (err?.message || JSON.stringify(err)));
    }
  };

  const branchName = branches.find(b => b.id === branchId)?.name || branchId;
  const sel = zones.find(z => z.id === selectedZone) || null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-brand-500/10 p-2.5 rounded-lg"><MapPin size={20} className="text-brand-500" /></div>
          <div>
            <h2 className="text-lg font-black uppercase text-text-main tracking-tight">Configuración de Salones</h2>
            <p className="text-[10px] font-bold uppercase text-text-dim tracking-widest">Dibujá las zonas del salón · {branchName}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={branchId} onChange={e => setBranchId(e.target.value)}
            className="bg-bg-sidebar border border-border-dim rounded-lg px-3 py-2 text-[10px] font-extrabold uppercase text-text-main outline-none cursor-pointer">
            {realBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {!isReadOnly && (
            <>
              <button onClick={addZone}
                className="flex items-center gap-2 bg-bg-accent border border-border-dim text-text-main px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:border-brand-500/50 transition-all">
                <Plus size={14} /> Agregar zona
              </button>
              <button onClick={saveAll} disabled={saving}
                className="flex items-center gap-2 bg-brand-500 text-black px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-lg disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : savedFlash ? <Check size={14} className="text-emerald-600" /> : <Save size={14} />}
                {savedFlash ? 'Guardado' : 'Guardar'}
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-text-dim"><Loader2 size={22} className="animate-spin mx-auto" /></div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-4">
          {/* Lienzo */}
          <div className="bg-[#0f0f0f] border border-border-dim rounded-xl p-3 overflow-auto">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              className="w-full rounded-lg"
              style={{ background: '#141414', touchAction: 'none' }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              onClick={() => setSelectedZone(null)}
            >
              {/* Grid de fondo */}
              {Array.from({ length: Math.floor(CANVAS_W / 50) }).map((_, i) => (
                <line key={`v${i}`} x1={i * 50} y1={0} x2={i * 50} y2={CANVAS_H} stroke="#ffffff08" strokeWidth={1} />
              ))}
              {Array.from({ length: Math.floor(CANVAS_H / 50) }).map((_, i) => (
                <line key={`h${i}`} x1={0} y1={i * 50} x2={CANVAS_W} y2={i * 50} stroke="#ffffff08" strokeWidth={1} />
              ))}

              {zones.map(z => {
                const isSel = z.id === selectedZone;
                return (
                  <g key={z.id}>
                    <rect
                      x={z.x} y={z.y} width={z.width} height={z.height} rx={10}
                      fill={`${z.color}22`} stroke={z.color} strokeWidth={isSel ? 3 : 2}
                      style={{ cursor: isReadOnly ? 'default' : 'move' }}
                      onPointerDown={e => onPointerDown(e, z.id, 'move')}
                      onClick={e => { e.stopPropagation(); setSelectedZone(z.id); }}
                    />
                    <text x={z.x + 12} y={z.y + 24} fill={z.color} fontSize={16} fontWeight="900"
                      style={{ pointerEvents: 'none', textTransform: 'uppercase' }}>{z.name}</text>
                    {isSel && !isReadOnly && (
                      <rect
                        x={z.x + z.width - 16} y={z.y + z.height - 16} width={16} height={16}
                        fill={z.color} style={{ cursor: 'nwse-resize' }}
                        onPointerDown={e => onPointerDown(e, z.id, 'resize')}
                      />
                    )}
                  </g>
                );
              })}

              {zones.length === 0 && (
                <text x={CANVAS_W / 2} y={CANVAS_H / 2} fill="#ffffff40" fontSize={16} fontWeight="700"
                  textAnchor="middle" style={{ textTransform: 'uppercase' }}>
                  Agregá una zona para empezar a dibujar el salón
                </text>
              )}
            </svg>
          </div>

          {/* Panel lateral: propiedades de la zona seleccionada + lista */}
          <div className="space-y-3">
            {sel ? (
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-black uppercase text-text-main tracking-widest">Zona seleccionada</p>
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim">Nombre</label>
                  <input value={sel.name} disabled={isReadOnly}
                    onChange={e => updateZone(sel.id, { name: e.target.value })}
                    className="w-full mt-1 bg-bg-accent/40 border border-border-dim rounded px-2 py-1.5 text-[12px] font-bold text-text-main outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim">Color</label>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {COLORS.map(c => (
                      <button key={c} onClick={() => updateZone(sel.id, { color: c })}
                        className="w-6 h-6 rounded-full border-2 transition-all"
                        style={{ background: c, borderColor: sel.color === c ? '#fff' : 'transparent' }} />
                    ))}
                  </div>
                </div>
                {!isReadOnly && (
                  <button onClick={() => removeZone(sel.id)}
                    className="w-full flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/30 text-red-500 px-3 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20">
                    <Trash2 size={13} /> Eliminar zona
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 text-[10px] font-bold uppercase text-text-dim tracking-widest text-center">
                Tocá una zona para editar su nombre y color
              </div>
            )}

            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4">
              <p className="text-[10px] font-black uppercase text-text-main tracking-widest mb-2">Zonas ({zones.length})</p>
              {zones.length === 0 ? (
                <p className="text-[9px] font-bold uppercase text-text-dim">Ninguna</p>
              ) : (
                <div className="space-y-1">
                  {zones.map(z => (
                    <button key={z.id} onClick={() => setSelectedZone(z.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-all ${selectedZone === z.id ? 'bg-bg-accent' : 'hover:bg-bg-accent/40'}`}>
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: z.color }} />
                      <span className="text-[11px] font-bold text-text-main truncate">{z.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-brand-500/5 border border-brand-500/20 rounded-lg p-3 text-[9px] text-text-dim leading-relaxed">
        <p className="font-black text-text-main uppercase mb-1">Cómo usar</p>
        Agregá zonas (Planta Alta, Terraza, Deck, etc.), arrastralas para ubicarlas y usá el cuadradito de la esquina para cambiar su tamaño. Ponele nombre y color a cada una. Acordate de <span className="text-brand-500 font-bold">Guardar</span>. Próximamente vas a poder colocar mesas y sillas dentro de cada zona.
      </div>
    </div>
  );
}
