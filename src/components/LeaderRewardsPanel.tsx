import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Trophy,
  Plus,
  Trash2,
  Save,
  RefreshCcw,
  Calendar as CalendarIcon,
  Info,
  Percent,
  Building2,
  FileText,
  AlertCircle,
  Lock
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';
import { Branch, PerformanceLeaderConfig, LeaderSourceRole } from '../types';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

const MESES_PDF = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const mesLabelPDF = (ym: string) => { const [y, m] = ym.split('-'); return `${MESES_PDF[parseInt(m) - 1] || m} de ${y}`; };

const ROLE_OPTIONS: { value: LeaderSourceRole; label: string }[] = [
  { value: 'encargado', label: '👥 Encargados' },
  { value: 'jefe_cocina', label: '👨‍🍳 Jefes de Cocina' },
  { value: 'segundo_cocina', label: '🍳 Segundos de Cocina' },
  { value: 'all', label: '🏢 Todos los roles' }
];

const roleLabel = (r: LeaderSourceRole) => ROLE_OPTIONS.find(o => o.value === r)?.label.replace(/^[^ ]+ /, '') || r;

const rolesForSource = (source: LeaderSourceRole): string[] =>
  source === 'all' ? ['encargado', 'jefe_cocina', 'segundo_cocina'] : [source];

const fmt = (n: number) => Number(n || 0).toLocaleString('es-AR');

// Suma de los premios OBTENIDOS de un reporte congelado: la suma de lo alcanzado
// en cada variable, SIN los descuentos por banderas (las banderas las pone el líder).
const sumObtainedPrizes = (report: any): number => {
  const results = Array.isArray(report?.results) ? report.results : [];
  return results.reduce((s: number, r: any) => s + (Number(r?.achievedPrize) || 0), 0);
};

export default function LeaderRewardsPanel({
  branches,
  month,
  onChangeMonth,
  onBack
}: {
  branches: Branch[];
  month: string;
  onChangeMonth: (m: string) => void;
  onBack: () => void;
}) {
  const [rules, setRules] = useState<PerformanceLeaderConfig[]>([]);
  const [monthReports, setMonthReports] = useState<any[]>([]);
  const [leaderSuggestions, setLeaderSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const activeBranches = useMemo(
    () => branches.filter(b => b.id !== 'all' && b.id !== 'virtual'),
    [branches]
  );
  const branchName = (id: string) => branches.find(b => b.id === id)?.name || id;

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Reglas de premios de líderes del mes
      const { data: ruleData } = await supabase
        .from('performance_leader_configs')
        .select('*')
        .eq('month', month);

      setRules(
        (ruleData || []).map((r: any) => ({
          id: r.id,
          month: r.month,
          leaderName: r.leader_name || '',
          sourceRole: (r.source_role || 'encargado') as LeaderSourceRole,
          percentage: Number(r.percentage) || 0,
          branchIds: Array.isArray(r.branch_ids) ? r.branch_ids : [],
          branchRoles: (r.branch_roles && typeof r.branch_roles === 'object') ? r.branch_roles : {}
        }))
      );

      // Reportes congelados del mes (para calcular los premios obtenidos)
      const { data: reportData } = await supabase
        .from('performance_reports')
        .select('*')
        .eq('month', month);
      setMonthReports(reportData || []);

      // Sugerencias de nombres de líderes (usuarios con rol de líder), best-effort
      try {
        const [{ data: rolesData }, { data: profileData }] = await Promise.all([
          supabase.from('roles_config').select('id,name'),
          supabase.from('profiles').select('name,role')
        ]);
        const isLeaderText = (s: string) => {
          const t = (s || '').toLowerCase();
          return t.includes('lider') || t.includes('líder');
        };
        const leaderRoleIds = new Set(
          (rolesData || []).filter((r: any) => isLeaderText(r.name) || isLeaderText(r.id)).map((r: any) => r.id)
        );
        const names = (profileData || [])
          .filter((p: any) => leaderRoleIds.has(p.role) || isLeaderText(p.role))
          .map((p: any) => p.name)
          .filter(Boolean);
        setLeaderSuggestions(Array.from(new Set(names)));
      } catch {
        setLeaderSuggestions([]);
      }
    } catch (err) {
      console.error('Error cargando premios de líderes:', err);
    } finally {
      setLoading(false);
    }
  };

  const addRule = () => {
    setRules(prev => [
      ...prev,
      { id: uuidv4(), month, leaderName: '', sourceRole: 'encargado', percentage: 50, branchIds: [] }
    ]);
  };

  const updateRule = (id: string, patch: Partial<PerformanceLeaderConfig>) => {
    setRules(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const toggleBranch = (id: string, branchId: string) => {
    setRules(prev =>
      prev.map(r => {
        if (r.id !== id) return r;
        const has = r.branchIds.includes(branchId);
        return { ...r, branchIds: has ? r.branchIds.filter(b => b !== branchId) : [...r.branchIds, branchId] };
      })
    );
  };

  const setBranchRole = (id: string, branchId: string, role: LeaderSourceRole) => {
    setRules(prev => prev.map(r => (r.id === id ? { ...r, branchRoles: { ...(r.branchRoles || {}), [branchId]: role } } : r)));
  };

  const setAllBranches = (id: string, select: boolean) => {
    updateRule(id, { branchIds: select ? activeBranches.map(b => b.id) : [] });
  };

  // Premio obtenido (sin banderas) de una sucursal para los roles de la regla.
  // pending = todavía no se cerró el mes para el/los rol(es) elegidos.
  const branchBreakdown = (rule: PerformanceLeaderConfig, branchId: string) => {
    const roleForBranch = (rule.branchRoles && rule.branchRoles[branchId]) || rule.sourceRole;
    const relevant = rolesForSource(roleForBranch);
    const rows = monthReports.filter(r => r.branch_id === branchId && relevant.includes(r.role));
    const closedRows = rows.filter(r => r.closed_at);
    const obtained = closedRows.reduce((s, r) => s + sumObtainedPrizes(r), 0);
    // Para un rol específico: pendiente si esa fila no está cerrada.
    // Para "todos": pendiente si ninguna fila del branch está cerrada.
    const pending =
      roleForBranch === 'all'
        ? closedRows.length === 0
        : !rows.find(r => r.role === roleForBranch)?.closed_at;
    return { obtained, pending };
  };

  const ruleTotals = (rule: PerformanceLeaderConfig) => {
    let base = 0;
    let pendingBranches: string[] = [];
    rule.branchIds.forEach(branchId => {
      const { obtained, pending } = branchBreakdown(rule, branchId);
      base += obtained;
      if (pending) pendingBranches.push(branchId);
    });
    const prize = Math.round(base * (Number(rule.percentage) || 0) / 100);
    return { base, prize, pendingBranches };
  };

  const handleSave = async () => {
    // Validaciones mínimas
    const invalid = rules.find(r => !r.leaderName.trim());
    if (invalid) {
      alert('Cada premio de líder necesita un nombre. Completá el nombre del líder antes de guardar.');
      return;
    }

    setSaving(true);
    try {
      // Sincronizamos la tabla del mes: borramos las reglas del mes y reinsertamos
      // las actuales. Así una regla eliminada en pantalla también se borra en la base.
      const { error: delErr } = await supabase
        .from('performance_leader_configs')
        .delete()
        .eq('month', month);
      if (delErr) throw delErr;

      if (rules.length > 0) {
        const payloads = rules.map(r => ({
          id: r.id,
          month,
          leader_name: r.leaderName.trim(),
          source_role: r.sourceRole,
          percentage: Number(r.percentage) || 0,
          branch_ids: r.branchIds,
          // Solo guardamos overrides de las sucursales incluidas
          branch_roles: Object.fromEntries(Object.entries(r.branchRoles || {}).filter(([bid]) => r.branchIds.includes(bid)))
        }));
        let { error: insErr } = await supabase.from('performance_leader_configs').insert(payloads);
        // Si la columna branch_roles todavía no existe, reintentar sin ella (no perder datos).
        if (insErr && /branch_roles/i.test(insErr.message || '')) {
          const legacy = payloads.map(({ branch_roles, ...rest }) => rest);
          const retry = await supabase.from('performance_leader_configs').insert(legacy);
          insErr = retry.error;
          if (!insErr) alert('Guardado, pero el "rol por sucursal" no se persistió: falta crear la columna branch_roles (ver performance_leader_branch_roles.sql).');
        }
        if (insErr) throw insErr;
      }

      alert('Premios de líderes guardados.');
      fetchData();
    } catch (err: any) {
      console.error('Error guardando premios de líderes:', err);
      alert('ATENCIÓN: No se pudieron guardar los premios de líderes.\n\nDetalle: ' + (err?.message || 'error desconocido') + '\n\nReintentá guardar.');
    } finally {
      setSaving(false);
    }
  };

  const exportPDF = () => {
    const M = 14, PW = 210, PH = 297, CW = PW - 2 * M;
    const BRAND: [number, number, number] = [193, 18, 31];
    const DARK: [number, number, number] = [33, 37, 41];
    const GRAY: [number, number, number] = [110, 116, 122];
    const F = 'helvetica';

    const doc = new jsPDF();
    doc.setFillColor(...BRAND); doc.rect(0, 0, PW, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(F, 'bold'); doc.setFontSize(9); doc.text('GESTIÓN CRAFT', M, 12);
    doc.setFontSize(15); doc.text('PREMIOS DE LÍDERES', M, 21);
    doc.setFont(F, 'normal'); doc.setFontSize(8); doc.text('Programa de incentivos', M, 26.5);
    doc.setFont(F, 'bold'); doc.setFontSize(11); doc.text(mesLabelPDF(month), PW - M, 18, { align: 'right' });

    let y = 40;
    doc.setFont(F, 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
    const intro = doc.splitTextToSize('El premio de cada líder es un porcentaje sobre la suma de los premios obtenidos (variables alcanzadas, sin descuentos por banderas) de las sucursales asignadas.', CW);
    doc.text(intro, M, y); y += intro.length * 4.6 + 4;

    if (rules.length === 0) {
      doc.setTextColor(...GRAY); doc.setFontSize(10);
      doc.text('No hay premios de líderes configurados para este mes.', M, y);
    }

    rules.forEach((rule, i) => {
      const { base, prize, pendingBranches } = ruleTotals(rule);
      if (y > 235) { doc.addPage(); y = 20; }

      doc.setFont(F, 'bold'); doc.setFontSize(12); doc.setTextColor(...DARK);
      doc.text(`${i + 1}. ${rule.leaderName || 'Líder'}`, M, y);
      doc.setFont(F, 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BRAND);
      doc.text(`${roleLabel(rule.sourceRole).toUpperCase()} · ${rule.percentage}%`, PW - M, y, { align: 'right' });
      y += 2;

      const rows = rule.branchIds.map(branchId => {
        const { obtained, pending } = branchBreakdown(rule, branchId);
        return [branchName(branchId), pending ? 'Pendiente de cierre' : `$${fmt(obtained)}`];
      });

      autoTable(doc, {
        head: [['Sucursal', 'Premio obtenido']],
        body: rows.length ? rows : [['Sin sucursales asignadas', '-']],
        startY: y + 2, margin: { left: M, right: M },
        styles: { fontSize: 9, cellPadding: 2.5, textColor: DARK as any, lineColor: [235, 236, 238] as any, lineWidth: 0.2 },
        headStyles: { fillColor: BRAND as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 8.5 },
        alternateRowStyles: { fillColor: [249, 250, 251] as any },
        columnStyles: { 0: { cellWidth: CW - 50 }, 1: { cellWidth: 50, halign: 'right', fontStyle: 'bold' } },
        foot: [[
          `Base $${fmt(base)}  ×  ${rule.percentage}%`,
          `$${fmt(prize)}`
        ]],
        footStyles: { fillColor: [33, 37, 41] as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', halign: 'right', fontSize: 9 }
      });
      y = (doc as any).lastAutoTable.finalY + 4;

      if (pendingBranches.length > 0) {
        doc.setFont(F, 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
        const note = doc.splitTextToSize(`Nota: ${pendingBranches.map(branchName).join(', ')} aún no cerró el mes; su premio no está incluido en la base todavía.`, CW);
        doc.text(note, M, y); y += note.length * 3.6 + 4;
      } else {
        y += 3;
      }
    });

    const pc = doc.getNumberOfPages();
    for (let p = 1; p <= pc; p++) {
      doc.setPage(p);
      doc.setDrawColor(230, 231, 233); doc.setLineWidth(0.3); doc.line(M, PH - 12, PW - M, PH - 12);
      doc.setFont(F, 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
      doc.text(`Premios de Líderes · ${mesLabelPDF(month)}`, M, PH - 8);
      doc.text(`Página ${p} de ${pc}`, PW - M, PH - 8, { align: 'right' });
    }
    doc.save(`premios_lideres_${month}.pdf`);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-sidebar p-5 rounded-lg border border-border-dim shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-amber-500 rounded-lg text-white shadow-lg shadow-amber-500/20">
            <Award size={24} />
          </div>
          <div>
            <h2 className="text-lg font-black text-text-main uppercase tracking-tight">Premios de Líderes</h2>
            <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest leading-none mt-1">
              Un % sobre los premios obtenidos de las sucursales elegidas
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onBack}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-blue-600/15 cursor-pointer"
          >
            ← Volver a Configuración
          </button>

          <div className="flex items-center bg-bg-accent px-3 py-1.5 rounded border border-border-dim">
            <CalendarIcon size={16} className="text-text-dim mr-2" />
            <input
              type="month"
              value={month}
              onChange={(e) => onChangeMonth(e.target.value)}
              className="bg-transparent border-none text-[12px] font-black uppercase text-blue-500 focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={exportPDF}
            disabled={loading}
            className="px-3.5 py-1.5 bg-brand-500/10 hover:bg-brand-500 border border-brand-500/20 text-brand-500 hover:text-white rounded text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-40 cursor-pointer"
            title="Exportar los premios de líderes del mes en PDF"
          >
            <FileText size={14} className="stroke-[2.5]" />
            <span>Exportar PDF</span>
          </button>

          <button onClick={fetchData} className="p-2 text-text-dim hover:text-blue-500 transition-colors" title="Actualizar datos">
            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2.5 bg-bg-accent/30 border border-border-dim rounded-lg p-3.5">
        <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
        <p className="text-[9.5px] text-text-dim font-bold uppercase tracking-wider leading-relaxed">
          El premio del líder es <span className="text-text-main">porcentaje × la suma de premios obtenidos</span> de las sucursales elegidas.
          Se toma la suma de las <span className="text-text-main">variables alcanzadas</span> de cada sucursal (lo congelado al cerrar el mes),
          <span className="text-text-main"> sin</span> los descuentos por banderas rojas/negras. Una sucursal que todavía no cerró el mes aparece como
          <span className="text-amber-500"> pendiente</span> y no suma hasta cerrarse.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCcw size={24} className="animate-spin text-amber-500" />
          <span className="text-[10px] text-text-dim font-black uppercase tracking-widest animate-pulse">Cargando premios de líderes...</span>
        </div>
      ) : (
        <div className="space-y-4">
          <datalist id="leader-name-suggestions">
            {leaderSuggestions.map(n => (
              <option key={n} value={n} />
            ))}
          </datalist>

          {rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 bg-bg-sidebar/60 border border-dashed border-border-dim rounded-xl">
              <Award size={26} className="text-text-dim opacity-40" />
              <p className="text-[11px] font-black uppercase text-text-main tracking-widest">Todavía no hay premios de líderes para {month}</p>
              <p className="text-[9px] text-text-dim font-bold uppercase tracking-wider text-center max-w-md leading-relaxed">
                Agregá un líder, elegí el rol del que se suman los premios, el porcentaje y las sucursales.
              </p>
              <button
                onClick={addRule}
                className="mt-1 flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 px-4 py-2 rounded text-[10px] font-black uppercase tracking-wider transition-all"
              >
                <Plus size={14} /> Agregar Líder
              </button>
            </div>
          ) : (
            <>
              {rules.map((rule) => {
                const { base, prize, pendingBranches } = ruleTotals(rule);
                return (
                  <div key={rule.id} className="glass-card overflow-hidden">
                    {/* Encabezado de la regla */}
                    <div className="bg-bg-accent/40 p-4 border-b border-border-dim flex flex-col lg:flex-row lg:items-center gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Trophy size={16} className="text-amber-500 shrink-0" />
                        <input
                          type="text"
                          list="leader-name-suggestions"
                          placeholder="Nombre del líder (ej: Líder de Encargados)"
                          value={rule.leaderName}
                          onChange={(e) => updateRule(rule.id, { leaderName: e.target.value })}
                          className="bg-transparent border-b border-border-dim/50 focus:border-amber-500 outline-none text-[12px] font-black uppercase text-text-main py-1 px-0 flex-1 min-w-0"
                        />
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex flex-col">
                          <span className="text-[8px] font-black text-text-dim uppercase tracking-widest mb-0.5" title="Rol por defecto; podés cambiarlo por sucursal más abajo">Premios de (por defecto)</span>
                          <select
                            value={rule.sourceRole}
                            onChange={(e) => updateRule(rule.id, { sourceRole: e.target.value as LeaderSourceRole })}
                            className="bg-bg-accent border border-border-dim rounded px-2 py-1 text-[10px] font-black uppercase text-text-main outline-none focus:border-amber-500 cursor-pointer"
                          >
                            {ROLE_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col">
                          <span className="text-[8px] font-black text-text-dim uppercase tracking-widest mb-0.5">Porcentaje</span>
                          <div className="relative">
                            <input
                              type="number"
                              step="1"
                              min="0"
                              value={rule.percentage}
                              onChange={(e) => updateRule(rule.id, { percentage: parseFloat(e.target.value) || 0 })}
                              className="w-24 bg-bg-accent border border-border-dim rounded pl-3 pr-7 py-1 text-[12px] font-black text-amber-500 outline-none focus:border-amber-500"
                            />
                            <Percent size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim" />
                          </div>
                        </div>

                        <button
                          onClick={() => removeRule(rule.id)}
                          className="p-2 mt-3 text-text-dim hover:text-red-500 transition-colors"
                          title="Eliminar este premio de líder"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Selección de sucursales */}
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[10px] font-black text-text-dim uppercase tracking-widest flex items-center gap-1.5">
                          <Building2 size={13} className="text-blue-500" />
                          Sucursales incluidas
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setAllBranches(rule.id, true)}
                            className="text-[9px] font-black uppercase tracking-wider text-blue-500 hover:text-blue-600 transition-colors"
                          >
                            Todas
                          </button>
                          <span className="text-text-dim/40">·</span>
                          <button
                            onClick={() => setAllBranches(rule.id, false)}
                            className="text-[9px] font-black uppercase tracking-wider text-text-dim hover:text-text-main transition-colors"
                          >
                            Ninguna
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {activeBranches.map(branch => {
                          const selected = rule.branchIds.includes(branch.id);
                          const { obtained, pending } = selected
                            ? branchBreakdown(rule, branch.id)
                            : { obtained: 0, pending: false };
                          const branchRole = (rule.branchRoles && rule.branchRoles[branch.id]) || rule.sourceRole;
                          return (
                            <div
                              key={branch.id}
                              className={cn(
                                'px-3 py-2 rounded-lg border transition-all',
                                selected
                                  ? 'bg-blue-500/10 border-blue-500/40'
                                  : 'bg-bg-accent/20 border-border-dim hover:border-border-dim/80'
                              )}
                            >
                              <button onClick={() => toggleBranch(rule.id, branch.id)} className="w-full flex items-center justify-between gap-2 text-left">
                                <div className="min-w-0">
                                  <span className={cn('block text-[10px] font-black uppercase tracking-tight truncate', selected ? 'text-text-main' : 'text-text-dim')}>
                                    {branch.name}
                                  </span>
                                  {selected && (
                                    pending ? (
                                      <span className="text-[8px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-1">
                                        <Lock size={9} /> Pendiente de cierre
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-mono font-black text-emerald-500">${fmt(obtained)}</span>
                                    )
                                  )}
                                </div>
                                <span className={cn(
                                  'w-4 h-4 rounded flex items-center justify-center text-[10px] shrink-0 border',
                                  selected ? 'bg-blue-500 border-blue-500 text-white' : 'border-border-dim text-transparent'
                                )}>
                                  ✓
                                </span>
                              </button>
                              {selected && (
                                <div className="mt-1.5 flex items-center gap-1.5">
                                  <span className="text-[7px] font-black uppercase tracking-widest text-text-dim shrink-0">Premio de:</span>
                                  <select
                                    value={branchRole}
                                    onChange={(e) => setBranchRole(rule.id, branch.id, e.target.value as LeaderSourceRole)}
                                    className="flex-1 min-w-0 bg-bg-card border border-border-dim rounded px-1.5 py-1 text-[9px] font-black uppercase text-text-main outline-none focus:border-blue-500 cursor-pointer"
                                  >
                                    {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Resumen del cálculo */}
                      <div className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/5 overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-amber-500/15">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black text-text-dim uppercase tracking-widest">Suma de premios obtenidos</span>
                            <span className="text-[8px] font-bold text-text-dim uppercase tracking-wider">
                              {rule.branchIds.length} sucursal{rule.branchIds.length === 1 ? '' : 'es'} · {(() => {
                                const roles = new Set(rule.branchIds.map(bid => (rule.branchRoles && rule.branchRoles[bid]) || rule.sourceRole));
                                return roles.size <= 1 ? roleLabel([...roles][0] || rule.sourceRole) : 'roles por sucursal';
                              })()}
                            </span>
                          </div>
                          <span className="text-[15px] font-mono font-black text-text-main">${fmt(base)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-brand-500/5">
                          <span className="text-[10px] font-black text-text-dim uppercase tracking-widest">
                            Premio del líder ({rule.percentage || 0}%)
                          </span>
                          <span className="text-xl font-mono font-black text-brand-500">${fmt(prize)}</span>
                        </div>
                      </div>

                      {pendingBranches.length > 0 && (
                        <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                          <AlertCircle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-[9px] text-amber-500 font-black uppercase tracking-wider leading-relaxed">
                            {pendingBranches.map(branchName).join(', ')} todavía no cerró el mes.
                            Su premio no está incluido en la base hasta que se cierre desde el Dashboard.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              <button
                onClick={addRule}
                className="w-full flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-dashed border-amber-500/30 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
              >
                <Plus size={14} /> Agregar otro Líder
              </button>
            </>
          )}

          {/* Guardar */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-8 py-3 rounded-lg font-black uppercase text-[12px] shadow-lg shadow-green-500/20"
            >
              {saving ? <RefreshCcw size={18} className="animate-spin" /> : <Save size={18} />}
              Guardar Premios de Líderes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
