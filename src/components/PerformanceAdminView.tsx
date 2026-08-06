import React, { useState, useEffect } from 'react';
import { 
  Trophy, 
  Target, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Star, 
  DollarSign, 
  Calculator,
  Save,
  RefreshCcw,
  Flag,
  Calendar as CalendarIcon,
  Info,
  Plus,
  Trash2,
  Users,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Building2,
  CalendarDays,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';
import { Branch, PerformanceRoleConfig, PerformanceVariable, PerformanceTier, PerformanceReport, PerformanceVariableResult } from '../types';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

const MESES_PDF = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const mesLabelPDF = (ym: string) => { const [y, m] = ym.split('-'); return `${MESES_PDF[parseInt(m) - 1] || m} de ${y}`; };

export default function PerformanceAdminView({ 
  branches, 
  selectedBranchId 
}: { 
  branches: Branch[], 
  selectedBranchId: string 
}) {
  const [localBranchId, setLocalBranchId] = useState<string>(selectedBranchId);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [activeRole, setActiveRole] = useState<'encargado' | 'jefe_cocina' | 'segundo_cocina'>('encargado');
  const [activeTab, setActiveTab] = useState<'config' | 'results'>('config');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // States for copying branch configuration
  const [showCopyBranchModal, setShowCopyBranchModal] = useState(false);
  const [targetBranches, setTargetBranches] = useState<string[]>([]);
  const [copySalesGoal, setCopySalesGoal] = useState(false);
  const [copyRedFlagPenalty, setCopyRedFlagPenalty] = useState(true);

  // Sync state when global selected branch props change
  useEffect(() => {
    setLocalBranchId(selectedBranchId);
  }, [selectedBranchId]);

  const [configs, setConfigs] = useState<Record<'encargado' | 'jefe_cocina' | 'segundo_cocina', PerformanceRoleConfig>>({
    encargado: {
      id: '',
      branchId: localBranchId,
      month: selectedMonth,
      role: 'encargado',
      variables: [],
      salesGoal: 0,
      redFlagPenalty: 15000
    },
    jefe_cocina: {
      id: '',
      branchId: localBranchId,
      month: selectedMonth,
      role: 'jefe_cocina',
      variables: [],
      salesGoal: 0,
      redFlagPenalty: 15000
    },
    segundo_cocina: {
      id: '',
      branchId: localBranchId,
      month: selectedMonth,
      role: 'segundo_cocina',
      variables: [],
      salesGoal: 0,
      redFlagPenalty: 15000
    }
  });

  const [reports, setReports] = useState<Record<'encargado' | 'jefe_cocina' | 'segundo_cocina', PerformanceReport>>({
    encargado: { id: '', branchId: localBranchId, month: selectedMonth, role: 'encargado', results: [], actualSales: 0, redFlagsCount: 0, totalCalculatedPrize: 0 },
    jefe_cocina: { id: '', branchId: localBranchId, month: selectedMonth, role: 'jefe_cocina', results: [], actualSales: 0, redFlagsCount: 0, totalCalculatedPrize: 0 },
    segundo_cocina: { id: '', branchId: localBranchId, month: selectedMonth, role: 'segundo_cocina', results: [], actualSales: 0, redFlagsCount: 0, totalCalculatedPrize: 0 }
  });

  const [allConfigs, setAllConfigs] = useState<any[]>([]);

  useEffect(() => {
    if (localBranchId) {
      fetchData();
    }
  }, [localBranchId, selectedMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (localBranchId === 'all') {
        try {
          const { data: configData } = await supabase
            .from('performance_role_configs')
            .select('*')
            .eq('month', selectedMonth);
          
          if (configData) {
            setAllConfigs(configData);
          } else {
            setAllConfigs([]);
          }
        } catch (dbErr) {
          console.error('Error fetching all configurations:', dbErr);
          setAllConfigs([]);
        } finally {
          setLoading(false);
        }
        return;
      }

      // Load fallbacks first as immediate values
      const storageKeyConfig = `craft_performance_config_${localBranchId}_${selectedMonth}`;
      const storageKeyReport = `craft_performance_report_${localBranchId}_${selectedMonth}`;
      
      let fallbackConfigs = null;
      let fallbackReports = null;
      
      try {
        const storedC = localStorage.getItem(storageKeyConfig);
        if (storedC) fallbackConfigs = JSON.parse(storedC);
        
        const storedR = localStorage.getItem(storageKeyReport);
        if (storedR) fallbackReports = JSON.parse(storedR);
      } catch (e) {
        console.error('Error parsing performance configurations local fallback:', e);
      }

      const initializedConfigs = fallbackConfigs || {
        encargado: {
          id: '',
          branchId: localBranchId,
          month: selectedMonth,
          role: 'encargado',
          variables: [],
          salesGoal: 0,
          redFlagPenalty: 15000
        },
        jefe_cocina: {
          id: '',
          branchId: localBranchId,
          month: selectedMonth,
          role: 'jefe_cocina',
          variables: [],
          salesGoal: 0,
          redFlagPenalty: 15000
        },
        segundo_cocina: {
          id: '',
          branchId: localBranchId,
          month: selectedMonth,
          role: 'segundo_cocina',
          variables: [],
          salesGoal: 0,
          redFlagPenalty: 15000
        }
      };

      const initializedReports = fallbackReports || {
        encargado: { id: '', branchId: localBranchId, month: selectedMonth, role: 'encargado', results: [], actualSales: 0, redFlagsCount: 0, totalCalculatedPrize: 0 },
        jefe_cocina: { id: '', branchId: localBranchId, month: selectedMonth, role: 'jefe_cocina', results: [], actualSales: 0, redFlagsCount: 0, totalCalculatedPrize: 0 },
        segundo_cocina: { id: '', branchId: localBranchId, month: selectedMonth, role: 'segundo_cocina', results: [], actualSales: 0, redFlagsCount: 0, totalCalculatedPrize: 0 }
      };

      // Force proper branchId and month keys on restore
      initializedConfigs.encargado.branchId = localBranchId;
      initializedConfigs.encargado.month = selectedMonth;
      initializedConfigs.jefe_cocina.branchId = localBranchId;
      initializedConfigs.jefe_cocina.month = selectedMonth;
      if (initializedConfigs.segundo_cocina) {
        initializedConfigs.segundo_cocina.branchId = localBranchId;
        initializedConfigs.segundo_cocina.month = selectedMonth;
      }

      initializedReports.encargado.branchId = localBranchId;
      initializedReports.encargado.month = selectedMonth;
      initializedReports.jefe_cocina.branchId = localBranchId;
      initializedReports.jefe_cocina.month = selectedMonth;
      if (initializedReports.segundo_cocina) {
        initializedReports.segundo_cocina.branchId = localBranchId;
        initializedReports.segundo_cocina.month = selectedMonth;
      }

      // 1. Fetch Configs from Supabase
      const newConfigs = { ...initializedConfigs };
      try {
        const { data: configData } = await supabase
          .from('performance_role_configs')
          .select('*')
          .match({ branch_id: localBranchId, month: selectedMonth });

        if (configData && configData.length > 0) {
          configData.forEach(item => {
            newConfigs[item.role as 'encargado' | 'jefe_cocina' | 'segundo_cocina'] = {
              id: item.id,
              branchId: item.branch_id,
              month: item.month,
              role: item.role,
              variables: item.variables || [],
              salesGoal: item.sales_goal || 0,
              redFlagPenalty: item.red_flag_penalty || 15000
            };
          });
        }
      } catch (dbErr) {
        console.error('Database configs fetch error, using local fallback:', dbErr);
      }
      setConfigs(newConfigs);

      // 2. Fetch Reports from Supabase
      const newReports = { ...initializedReports };
      try {
        const { data: reportData } = await supabase
          .from('performance_reports')
          .select('*')
          .match({ branch_id: localBranchId, month: selectedMonth });

        if (reportData && reportData.length > 0) {
          reportData.forEach(item => {
            newReports[item.role as 'encargado' | 'jefe_cocina' | 'segundo_cocina'] = {
              id: item.id,
              branchId: item.branch_id,
              month: item.month,
              role: item.role,
              results: item.results || [],
              actualSales: item.actual_sales || 0,
              redFlagsCount: item.red_flags_count || 0,
              totalCalculatedPrize: item.total_calculated_prize || 0
            };
          });
        }
      } catch (dbErr) {
        console.error('Database reports fetch error, using local fallback:', dbErr);
      }
      setReports(newReports);
    } catch (err) {
      console.error('Error fetching performance data from DB, using local fallback:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateVariablePrize = (variable: PerformanceVariable, actualValue: number) => {
    const sortedTiers = [...variable.tiers].sort((a, b) => 
      variable.isLowerBetter ? b.threshold - a.threshold : a.threshold - b.threshold
    );
    let bestTier: PerformanceTier | null = null;
    for (const tier of sortedTiers) {
      const isAchieved = variable.isLowerBetter ? actualValue <= tier.threshold : actualValue >= tier.threshold;
      if (isAchieved && (!bestTier || tier.prize > bestTier.prize)) bestTier = tier;
    }
    return bestTier ? bestTier.prize : 0;
  };

  const handleSaveResults = async () => {
    setSaving(true);
    try {
      const reportsArray = Object.values(reports) as PerformanceReport[];
      const payloads = reportsArray.map(rep => {
        const config = configs[rep.role as 'encargado' | 'jefe_cocina' | 'segundo_cocina'];
        const resultsWithPrizes = rep.results.map(r => {
          const variable = config.variables.find(v => v.id === r.variableId);
          return {
            ...r,
            achievedPrize: variable ? calculateVariablePrize(variable, r.actualValue) : 0
          } as PerformanceVariableResult;
        });
        
        const totalPrizes = resultsWithPrizes.reduce((sum, r) => sum + r.achievedPrize, 0);
        const penalty = (rep.redFlagsCount || 0) * (config.redFlagPenalty || 0);
        const isSalesMet = (rep.actualSales || 0) >= (config.salesGoal || 1);
        const finalPrize = isSalesMet ? Math.max(0, totalPrizes - penalty) : 0;

        return {
          branch_id: localBranchId,
          month: selectedMonth,
          role: rep.role,
          results: resultsWithPrizes,
          actual_sales: rep.actualSales,
          red_flags_count: rep.redFlagsCount,
          total_calculated_prize: finalPrize
        };
      });

      // Local fallback copy
      try {
        const storageKeyReport = `craft_performance_report_${localBranchId}_${selectedMonth}`;
        localStorage.setItem(storageKeyReport, JSON.stringify(reports));
      } catch (localErr) {
        console.error('Error saving local report fallback:', localErr);
      }

      const { error } = await supabase
        .from('performance_reports')
        .upsert(payloads, { onConflict: 'branch_id,month,role' });

      if (error) {
        console.error('Error al guardar resultados en Supabase:', error);
        alert('ATENCIÓN: No se pudieron guardar los resultados en la base de datos.\n\nDetalle: ' + (error.message || 'error desconocido') + '\n\nReintentá guardar.');
        return;
      }
      alert('Resultados reales guardados exitosamente.');
      fetchData();
    } catch (err: any) {
      console.error('Save results error:', err);
      alert('ATENCIÓN: Ocurrió un error al guardar los resultados. ' + (err?.message || '') + '\n\nReintentá guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddVariable = () => {
    const newVar: PerformanceVariable = {
      id: uuidv4(),
      name: '',
      unit: '%',
      isLowerBetter: true,
      tiers: [{ id: uuidv4(), threshold: 0, prize: 0 }]
    };
    
    setConfigs({
      ...configs,
      [activeRole]: {
        ...configs[activeRole],
        variables: [...configs[activeRole].variables, newVar]
      }
    });
  };

  const handleRemoveVariable = (varId: string) => {
    setConfigs({
      ...configs,
      [activeRole]: {
        ...configs[activeRole],
        variables: configs[activeRole].variables.filter(v => v.id !== varId)
      }
    });
  };

  const handleCopyFromEncargado = () => {
    const encargadoConfig = configs.encargado;
    if (!encargadoConfig || encargadoConfig.variables.length === 0) {
      alert('La configuración del Encargado no contiene variables para copiar.');
      return;
    }

    if (!window.confirm('¿Seguro que deseas copiar e importar las variables del Encargado para el Jefe de Cocina? Se reemplazarán las variables de Jefe de Cocina actuales y los premios se reducirán al 50% de forma automática.')) {
      return;
    }

    // Clone variable objects and recalculate prizes to 50%
    const clonedVariables = encargadoConfig.variables.map(variable => {
      return {
        ...variable,
        id: uuidv4(), // generate a brand new variable id
        tiers: variable.tiers.map(tier => ({
          ...tier,
          id: uuidv4(), // generate a brand new tier id
          prize: Math.round(tier.prize * 0.5) // Halve the prize
        }))
      };
    });

    setConfigs({
      ...configs,
      jefe_cocina: {
        ...configs.jefe_cocina,
        variables: clonedVariables,
        salesGoal: encargadoConfig.salesGoal
      }
    });
  };

  const handleUpdateVariable = (varId: string, updates: Partial<PerformanceVariable>) => {
    setConfigs({
      ...configs,
      [activeRole]: {
        ...configs[activeRole],
        variables: configs[activeRole].variables.map(v => v.id === varId ? { ...v, ...updates } : v)
      }
    });
  };

  const handleAddTier = (varId: string) => {
    setConfigs({
      ...configs,
      [activeRole]: {
        ...configs[activeRole],
        variables: configs[activeRole].variables.map(v => {
          if (v.id === varId) {
            return {
              ...v,
              tiers: [...v.tiers, { id: uuidv4(), threshold: 0, prize: 0 }]
            };
          }
          return v;
        })
      }
    });
  };

  const handleRemoveTier = (varId: string, tierId: string) => {
    setConfigs({
      ...configs,
      [activeRole]: {
        ...configs[activeRole],
        variables: configs[activeRole].variables.map(v => {
          if (v.id === varId) {
            return {
              ...v,
              tiers: v.tiers.filter(t => t.id !== tierId)
            };
          }
          return v;
        })
      }
    });
  };

  const handleUpdateTier = (varId: string, tierId: string, updates: Partial<PerformanceTier>) => {
    setConfigs({
      ...configs,
      [activeRole]: {
        ...configs[activeRole],
        variables: configs[activeRole].variables.map(v => {
          if (v.id === varId) {
            return {
              ...v,
              tiers: v.tiers.map(t => t.id === tierId ? { ...t, ...updates } : t)
            };
          }
          return v;
        })
      }
    });
  };

  // Genera las configuraciones de Jefe de Cocina (50%) y Segundo de Cocina (40%)
  // a partir de las variables y premios cargados en Encargado.
  const handleGenerateKitchenRoles = async () => {
    const base = configs.encargado;
    if (!base || !base.variables || base.variables.length === 0) {
      alert('Primero cargá las variables y premios del Encargado. Después generá los roles de cocina.');
      return;
    }
    if (!window.confirm('Se generarán las configuraciones de JEFE DE COCINA (50% de los premios del Encargado) y SEGUNDO DE COCINA (80% del Jefe = 40% del Encargado), usando las mismas variables.\n\nLas configuraciones existentes de esos roles para este mes y sucursal serán reemplazadas. ¿Continuar?')) {
      return;
    }

    setSaving(true);
    try {
      // Clona variables aplicando un factor a los premios de cada escala
      const scaleVariables = (factor: number) => base.variables.map(v => ({
        ...v,
        id: uuidv4(),
        tiers: v.tiers.map(t => ({ ...t, id: uuidv4(), prize: Math.round((Number(t.prize) || 0) * factor) }))
      }));

      const jefeVars = scaleVariables(0.5);     // 50% del encargado
      const segundoVars = scaleVariables(0.4);  // 40% del encargado (= 80% del jefe)

      const jefeConfig = { ...configs.jefe_cocina, branchId: localBranchId, month: selectedMonth, role: 'jefe_cocina' as const, variables: jefeVars, redFlagPenalty: base.redFlagPenalty, salesGoal: base.salesGoal };
      const segundoConfig = { ...configs.segundo_cocina, branchId: localBranchId, month: selectedMonth, role: 'segundo_cocina' as const, variables: segundoVars, redFlagPenalty: base.redFlagPenalty, salesGoal: base.salesGoal };

      const payloads = [
        { branch_id: localBranchId, month: selectedMonth, role: 'jefe_cocina', variables: jefeVars, sales_goal: base.salesGoal, red_flag_penalty: base.redFlagPenalty },
        { branch_id: localBranchId, month: selectedMonth, role: 'segundo_cocina', variables: segundoVars, sales_goal: base.salesGoal, red_flag_penalty: base.redFlagPenalty }
      ];

      const { error } = await supabase
        .from('performance_role_configs')
        .upsert(payloads, { onConflict: 'branch_id,month,role' });

      if (error) {
        console.error('Error al generar roles de cocina en Supabase:', error);
        alert('ATENCIÓN: No se pudieron guardar los roles de cocina en la base de datos.\n\nDetalle: ' + (error.message || 'error') + '\n\nReintentá.');
        return;
      }

      // Actualizar estado local
      setConfigs(prev => ({ ...prev, jefe_cocina: jefeConfig, segundo_cocina: segundoConfig }));
      try {
        const storageKeyConfig = `craft_performance_config_${localBranchId}_${selectedMonth}`;
        const merged = { ...configs, jefe_cocina: jefeConfig, segundo_cocina: segundoConfig };
        localStorage.setItem(storageKeyConfig, JSON.stringify(merged));
      } catch (e) { console.error(e); }

      alert('¡Listo! Se generaron Jefe de Cocina (50%) y Segundo de Cocina (40%) desde el Encargado.');
      fetchData();
    } catch (err: any) {
      console.error('Error generando roles de cocina:', err);
      alert('ATENCIÓN: Ocurrió un error. ' + (err?.message || '') + '\n\nReintentá.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const configsArray = Object.values(configs) as PerformanceRoleConfig[];
      const payloads = configsArray.map(cfg => ({
        branch_id: localBranchId,
        month: selectedMonth,
        role: cfg.role,
        variables: cfg.variables,
        sales_goal: cfg.salesGoal,
        red_flag_penalty: cfg.redFlagPenalty
      }));

      // Cache locally
      try {
        const storageKeyConfig = `craft_performance_config_${localBranchId}_${selectedMonth}`;
        localStorage.setItem(storageKeyConfig, JSON.stringify(configs));
      } catch (localErr) {
        console.error('Error saving local config fallback:', localErr);
      }

      const { error } = await supabase
        .from('performance_role_configs')
        .upsert(payloads, { onConflict: 'branch_id,month,role' });

      if (error) {
        console.error('Error al guardar configuración en Supabase:', error);
        alert('ATENCIÓN: No se pudo guardar en la base de datos.\n\nDetalle: ' + (error.message || 'error desconocido') + '\n\nLos datos quedaron solo en este dispositivo. Reintentá guardar.');
        return;
      }
      alert('Configuración guardada exitosamente.');
      fetchData();
    } catch (err: any) {
      console.error('Save error:', err);
      alert('ATENCIÓN: Ocurrió un error al guardar. ' + (err?.message || '') + '\n\nReintentá guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyToNextMonth = async () => {
    if (localBranchId === 'all') return;

    // Parse selectedMonth (YYYY-MM)
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10);
    if (isNaN(year) || isNaN(month)) {
      alert('El mes seleccionado contiene un formato inválido.');
      return;
    }

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }

    const nextMonthString = `${year}-${String(month).padStart(2, '0')}`;

    const confirmMessage = `¿Seguro que deseas copiar la configuración de variables y premios de este mes (${selectedMonth}) al mes siguiente (${nextMonthString}) para esta sucursal?\n\nLa configuración existente del mes siguiente será reemplazada.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setSaving(true);
    try {
      // Prepare payload for next month for both roles
      const configsArray = Object.values(configs) as PerformanceRoleConfig[];
      const payloads = configsArray.map(cfg => ({
        branch_id: localBranchId,
        month: nextMonthString,
        role: cfg.role,
        variables: cfg.variables.map(v => ({
          ...v,
          // Generate new IDs to prevent overlap issues, but keep structure and tiers
          id: uuidv4(),
          tiers: v.tiers.map(t => ({
            ...t,
            id: uuidv4()
          }))
        })),
        sales_goal: cfg.salesGoal,
        red_flag_penalty: cfg.redFlagPenalty
      }));

      // Cache locally
      try {
        const storageKeyConfig = `craft_performance_config_${localBranchId}_${nextMonthString}`;
        const nextMonthLocalConfigs = {
          encargado: {
            ...configs.encargado,
            month: nextMonthString,
            variables: configs.encargado.variables.map(v => ({
              ...v,
              id: uuidv4(),
              tiers: v.tiers.map(t => ({ ...t, id: uuidv4() }))
            })),
            id: ''
          },
          jefe_cocina: {
            ...configs.jefe_cocina,
            month: nextMonthString,
            variables: configs.jefe_cocina.variables.map(v => ({
              ...v,
              id: uuidv4(),
              tiers: v.tiers.map(t => ({ ...t, id: uuidv4() }))
            })),
            id: ''
          }
        };
        localStorage.setItem(storageKeyConfig, JSON.stringify(nextMonthLocalConfigs));
      } catch (localErr) {
        console.error('Error saving next month local config fallback:', localErr);
      }

      const { error } = await supabase
        .from('performance_role_configs')
        .upsert(payloads, { onConflict: 'branch_id,month,role' });

      if (error) {
        console.error('Error al copiar al mes siguiente en Supabase:', error);
        alert('ATENCIÓN: No se pudo copiar al mes siguiente en la base de datos.\n\nDetalle: ' + (error.message || 'error desconocido') + '\n\nReintentá.');
        setSaving(false);
        return;
      }

      alert(`¡Éxito! Las variables y escalas de premios se copiaron exitosamente a ${nextMonthString}. Cambiaremos de mes automáticamente para revisar/guardar.`);
      setSelectedMonth(nextMonthString);
    } catch (err: any) {
      console.error('Error copying config to next month:', err);
      alert('ATENCIÓN: Error al copiar la configuración al mes siguiente. ' + (err?.message || '') + '\n\nReintentá.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyToBranches = async () => {
    if (targetBranches.length === 0) {
      alert('Por favor, selecciona al menos una sucursal destino.');
      return;
    }

    const targetBranchNames = targetBranches
      .map(id => branches.find(b => b.id === id)?.name)
      .filter(Boolean)
      .join(', ');

    if (!window.confirm(`¿Seguro que deseas copiar la configuración de "${activeRole.replace('_', ' ').toUpperCase()}" de esta sucursal a las siguientes sucursales:\n\n${targetBranchNames}?\n\nLas variables y escalas existentes de esas sucursales serán reemplazadas.`)) {
      return;
    }

    setSaving(true);
    try {
      // Step 1: Fetch any existing configurations for these other branches to see if we should retain their custom values (like sales goal or penalties)
      const { data: existingConfigs, error: fetchErr } = await supabase
        .from('performance_role_configs')
        .select('*')
        .eq('month', selectedMonth)
        .eq('role', activeRole);

      if (fetchErr) {
        console.warn('Could not fetch existing configurations to copy/merge:', fetchErr);
      }

      const currentConfig = configs[activeRole];

      const payloads = targetBranches.map(targetBranchId => {
        // Find existing configuration for target branch (if any)
        const existing = existingConfigs?.find(cfg => cfg.branch_id === targetBranchId);
        
        // Load target branch existing values from localStorage as fallback
        let localFallbackGoal = 0;
        let localFallbackPenalty = 15000;
        try {
          const storageKey = `craft_performance_config_${targetBranchId}_${selectedMonth}`;
          const localString = localStorage.getItem(storageKey);
          if (localString) {
            const parsed = JSON.parse(localString);
            if (parsed[activeRole]) {
              localFallbackGoal = parsed[activeRole].salesGoal || 0;
              localFallbackPenalty = parsed[activeRole].redFlagPenalty || 15000;
            }
          }
        } catch (e) {
          console.error('Local storage merge error during copy:', e);
        }

        const finalGoal = copySalesGoal 
          ? currentConfig.salesGoal 
          : (existing?.sales_goal !== undefined ? Number(existing.sales_goal) : localFallbackGoal);

        const finalPenalty = copyRedFlagPenalty 
          ? currentConfig.redFlagPenalty 
          : (existing?.red_flag_penalty !== undefined ? Number(existing.red_flag_penalty) : localFallbackPenalty);

        return {
          branch_id: targetBranchId,
          month: selectedMonth,
          role: activeRole,
          variables: currentConfig.variables,
          sales_goal: finalGoal,
          red_flag_penalty: finalPenalty
        };
      });

      // Step 2: Save to Supabase
      const { error: upsertErr } = await supabase
        .from('performance_role_configs')
        .upsert(payloads, { onConflict: 'branch_id,month,role' });

      if (upsertErr) {
        console.error('Error al copiar configuración a sucursales en Supabase:', upsertErr);
        alert('ATENCIÓN: No se pudo copiar a las sucursales en la base de datos.\n\nDetalle: ' + (upsertErr.message || 'error desconocido') + '\n\nReintentá la copia.');
        setSaving(false);
        return;
      }

      // Step 3: Write to LocalStorage for each target branch to prevent disappearing on refresh
      targetBranches.forEach(targetBranchId => {
        const storageKey = `craft_performance_config_${targetBranchId}_${selectedMonth}`;
        
        // Initialize or load target's full configuration object
        let targetFullConfig = {
          encargado: { id: '', branchId: targetBranchId, month: selectedMonth, role: 'encargado', variables: [], salesGoal: 0, redFlagPenalty: 15000 },
          jefe_cocina: { id: '', branchId: targetBranchId, month: selectedMonth, role: 'jefe_cocina', variables: [], salesGoal: 0, redFlagPenalty: 15000 }
        };

        try {
          const localString = localStorage.getItem(storageKey);
          if (localString) {
            targetFullConfig = JSON.parse(localString);
          }
        } catch (e) {
          console.error('Error reading localStorage for target during sync', targetBranchId, e);
        }

        // Apply updated values
        const payloadForThisBranch = payloads.find(p => p.branch_id === targetBranchId);
        if (payloadForThisBranch) {
          targetFullConfig[activeRole] = {
            id: targetFullConfig[activeRole]?.id || '',
            branchId: targetBranchId,
            month: selectedMonth,
            role: activeRole,
            variables: payloadForThisBranch.variables,
            salesGoal: payloadForThisBranch.sales_goal,
            redFlagPenalty: payloadForThisBranch.red_flag_penalty
          };
        }

        try {
          localStorage.setItem(storageKey, JSON.stringify(targetFullConfig));
        } catch (localErr) {
          console.error('Error caching target branch config', targetBranchId, localErr);
        }
      });

      alert('Configuración copiada exitosamente a las sucursales seleccionadas.');
      setShowCopyBranchModal(false);
      setTargetBranches([]);
    } catch (err: any) {
      console.error('Error during branch copy process:', err);
      alert('ATENCIÓN: Ocurrió un error al copiar las configuraciones. ' + (err?.message || '') + '\n\nReintentá la copia.');
    } finally {
      setSaving(false);
    }
  };

  // Exportar PDF de la vista consolidada: compara objetivos y premios de todas las
  // sucursales, con una seccion por rol (Encargados y Jefes de Cocina).
  // Se declara antes del return de la vista consolidada para quedar en su scope.
  const exportConsolidatedPDF = () => {
    const PW = 297, PH = 210, M = 14, CW = PW - 2 * M; // A4 horizontal
    const BRAND: [number, number, number] = [193, 18, 31];
    const DARK: [number, number, number] = [33, 37, 41];
    const GRAY: [number, number, number] = [110, 116, 122];
    const F = 'helvetica';
    const fmt = (n: number) => Number(n || 0).toLocaleString('es-AR');
    // La fuente base del PDF (Helvetica/WinAnsi) no soporta símbolos como ★ ni las
    // flechas, los pasamos a texto y limpiamos cualquier otro caracter no soportado.
    const unitPdf = (u: string) => (u || '').replace(/★/g, 'estrellas').replace(/[^\x00-\xFF]/g, '').trim();

    const pdfBranches = branches.filter(b => b.id !== 'all' && b.id !== 'virtual');
    const ROLES = [
      { key: 'encargado', label: 'Encargados' },
      { key: 'jefe_cocina', label: 'Jefes de Cocina' },
    ] as const;

    // Premio maximo alcanzable: la escala mas alta de cada variable, acumulable entre variables
    const maxPrizeOf = (vars: any[]) =>
      vars.reduce((acc, v) => acc + Math.max(0, ...(v.tiers || []).map((t: any) => Number(t.prize) || 0)), 0);

    // Escalas de una variable en una sola celda: ">=85 % = $10.000 | >=90 % = $15.000"
    const escalasOf = (v: any) => {
      const tiers: any[] = v.tiers || [];
      if (!tiers.length) return 'Sin escalas cargadas';
      const op = v.isLowerBetter ? '<=' : '>=';
      const isMoney = /\$|peso/i.test(v.unit || '');
      return tiers.map(t => {
        const u = unitPdf(v.unit);
        const th = isMoney ? `$${fmt(t.threshold)}` : `${fmt(t.threshold)}${u ? ' ' + u : ''}`;
        return `${op}${th} = $${fmt(t.prize)}`;
      }).join('  |  ');
    };

    const doc = new jsPDF('l');

    // Cabecera de marca
    doc.setFillColor(...BRAND); doc.rect(0, 0, PW, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(F, 'bold'); doc.setFontSize(9); doc.text('GESTIÓN CRAFT', M, 12);
    doc.setFontSize(15); doc.text('VISTA CONSOLIDADA DE PREMIOS', M, 21);
    doc.setFont(F, 'normal'); doc.setFontSize(8);
    doc.text('Comparativa de objetivos y variables de todas las sucursales', M, 26.5);
    doc.setFont(F, 'bold'); doc.setFontSize(9);
    doc.text('ENCARGADOS Y JEFES DE COCINA', PW - M, 12, { align: 'right' });
    doc.setFontSize(11); doc.text(mesLabelPDF(selectedMonth), PW - M, 18, { align: 'right' });
    doc.setFont(F, 'normal'); doc.setFontSize(9);
    doc.text(`${pdfBranches.length} sucursales`, PW - M, 24, { align: 'right' });

    let y = 40;

    ROLES.forEach((role, rIdx) => {
      if (rIdx > 0) { doc.addPage(); y = 20; }

      // Banda de seccion del rol
      doc.setFillColor(...DARK); doc.rect(M, y - 5.5, CW, 9, 'F');
      doc.setFont(F, 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
      doc.text(role.label.toUpperCase(), M + 3, y + 0.8);
      y += 10;

      const cfgOf = (branchId: string) => allConfigs.find(c => c.branch_id === branchId && c.role === role.key);

      // Tabla resumen: una fila por sucursal, incluyendo las no configuradas
      autoTable(doc, {
        head: [['Sucursal', 'Ubicación', 'Estado', 'Variables', 'Premio máx.', 'Bandera roja']],
        body: pdfBranches.map(b => {
          const c = cfgOf(b.id);
          const vars: any[] = c?.variables || [];
          const estado = !c ? 'No configurado' : vars.length === 0 ? 'Sin variables' : 'Configurado';
          const penalty = c?.red_flag_penalty !== undefined ? c.red_flag_penalty : 15000;
          return [
            b.name,
            b.location || 'Tucumán',
            estado,
            c ? String(vars.length) : '-',
            c && vars.length ? `$${fmt(maxPrizeOf(vars))}` : '-',
            c ? `-$${fmt(penalty)}` : '-',
          ];
        }),
        startY: y, margin: { left: M, right: M },
        styles: { fontSize: 8.5, cellPadding: 2.2, textColor: DARK as any, lineColor: [235, 236, 238] as any, lineWidth: 0.2 },
        headStyles: { fillColor: BRAND as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [249, 250, 251] as any },
        columnStyles: {
          2: { fontStyle: 'bold' },
          3: { halign: 'center' },
          4: { halign: 'right', fontStyle: 'bold', textColor: [16, 120, 80] as any },
          5: { halign: 'right', textColor: [190, 60, 60] as any },
        },
      });
      y = (doc as any).lastAutoTable.finalY + 9;

      // Detalle por sucursal: variables y escalas
      pdfBranches.forEach(b => {
        const c = cfgOf(b.id);
        const vars: any[] = c?.variables || [];

        if (y > PH - 42) { doc.addPage(); y = 20; }

        doc.setFont(F, 'bold'); doc.setFontSize(10); doc.setTextColor(...DARK);
        doc.text(b.name.toUpperCase(), M, y);
        doc.setFont(F, 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
        doc.text(role.label, PW - M, y, { align: 'right' });

        if (!c) {
          y += 5;
          doc.setFont(F, 'italic'); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
          doc.text(`Sin configuración cargada para ${mesLabelPDF(selectedMonth)}.`, M, y);
          y += 9;
          return;
        }

        autoTable(doc, {
          head: [['Variable', 'Sentido', 'Escalas y premios']],
          body: vars.length
            ? vars.map(v => [
                `${v.name}${unitPdf(v.unit) ? ` (${unitPdf(v.unit)})` : ''}`,
                v.isLowerBetter ? 'MENOS ES MEJOR' : 'MÁS ES MEJOR',
                escalasOf(v),
              ])
            : [['Configuración sin variables', '-', '-']],
          startY: y + 2, margin: { left: M, right: M },
          styles: { fontSize: 8.5, cellPadding: 2.2, textColor: DARK as any, lineColor: [235, 236, 238] as any, lineWidth: 0.2 },
          headStyles: { fillColor: [70, 76, 84] as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 8 },
          alternateRowStyles: { fillColor: [249, 250, 251] as any },
          columnStyles: {
            0: { cellWidth: 62, fontStyle: 'bold' },
            1: { cellWidth: 34, fontSize: 7.5, textColor: BRAND as any, fontStyle: 'bold' },
            2: { cellWidth: CW - 96 },
          },
        });
        y = (doc as any).lastAutoTable.finalY + 4;

        doc.setFont(F, 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
        doc.text(
          `Penalidad por bandera roja: -$${fmt(c.red_flag_penalty !== undefined ? c.red_flag_penalty : 15000)} por cada una registrada en el mes.`,
          M, y
        );
        y += 9;
      });
    });

    // Footer con paginado
    const pc = doc.getNumberOfPages();
    for (let p = 1; p <= pc; p++) {
      doc.setPage(p);
      doc.setDrawColor(230, 231, 233); doc.setLineWidth(0.3); doc.line(M, PH - 12, PW - M, PH - 12);
      doc.setFont(F, 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
      doc.text(`Vista Consolidada de Premios · ${mesLabelPDF(selectedMonth)} · Encargados y Jefes de Cocina`, M, PH - 8);
      doc.text(`Página ${p} de ${pc}`, PW - M, PH - 8, { align: 'right' });
    }
    doc.save(`premios_consolidado_${selectedMonth}.pdf`);
  };

  if (localBranchId === 'all') {
    const activeBranches = branches.filter(b => b.id !== 'all' && b.id !== 'virtual');
    
    return (
      <div className="space-y-6 pb-20">
        {/* Header Panel */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-sidebar p-5 rounded-lg border border-border-dim shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500 rounded-lg text-white shadow-lg shadow-blue-500/20">
              <Trophy size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black text-text-main uppercase tracking-tight">Vista Consolidada de Premios</h2>
              <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest leading-none mt-1">Comparativa de Objetivos y Variables de todas las Sucursales</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Month Picker */}
            <div className="flex items-center bg-bg-accent px-3 py-1.5 rounded border border-border-dim">
              <CalendarIcon size={16} className="text-text-dim mr-2 border-none outline-none" />
              <input 
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent border-none text-[12px] font-black uppercase text-blue-500 focus:outline-none cursor-pointer"
              />
            </div>
            <button
              onClick={exportConsolidatedPDF}
              disabled={loading}
              className="px-3.5 py-1.5 bg-brand-500/10 hover:bg-brand-500 border border-brand-500/20 text-brand-500 hover:text-white rounded text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              title="Exportar la comparativa de todas las sucursales (Encargados y Jefes de Cocina) en PDF"
            >
              <FileText size={14} className="stroke-[2.5]" />
              <span>Exportar PDF</span>
            </button>
            <button onClick={fetchData} className="p-2 text-text-dim hover:text-blue-500 transition-colors">
              <RefreshCcw size={18} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Role Toggle Selector */}
        <div className="flex p-1 bg-bg-sidebar rounded-lg border border-border-dim w-fit shadow-sm">
          {(['encargado', 'jefe_cocina'] as const).map((role) => (
            <button
              key={role}
              onClick={() => setActiveRole(role)}
              className={cn(
                "px-6 py-2 rounded-md font-black uppercase text-[11px] tracking-widest transition-all min-w-[120px]",
                activeRole === role 
                  ? "bg-blue-600 text-white shadow-md" 
                  : "text-text-dim hover:text-text-main"
              )}
            >
              {role === 'encargado' ? '👥 Encargado' : role === 'jefe_cocina' ? '👨‍🍳 Jefe de Cocina' : '🍳 Segundo de Cocina'}
            </button>
          ))}
        </div>

        {/* Consolidated Table Container */}
        <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-xl overflow-hidden">
          <div className="p-5 border-b border-border-dim/60 bg-bg-accent/10 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-black text-text-main uppercase tracking-wider">
                Resumen de Configuraciones · {activeRole === 'encargado' ? 'Encargados' : activeRole === 'jefe_cocina' ? 'Jefes de Cocina' : 'Segundos de Cocina'}
              </h3>
              <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest mt-0.5">Mes: {selectedMonth} • Compara objetivos y métricas vigentes</p>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCcw size={24} className="animate-spin text-blue-500" />
              <span className="text-[10px] text-text-dim font-black uppercase tracking-widest animate-pulse">Cargando Tablero Consolidado...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-5">
              {activeBranches.map(branch => {
                const config = allConfigs.find(c => c.branch_id === branch.id && c.role === activeRole);
                const redFlagPenalty = config?.red_flag_penalty !== undefined ? config.red_flag_penalty : 15000;
                const variablesList: any[] = config?.variables || [];

                return (
                  <div key={branch.id} className="bg-bg-accent/20 border border-border-dim rounded-xl overflow-hidden flex flex-col">
                    {/* Encabezado de la tarjeta: sucursal */}
                    <div className="flex items-center justify-between gap-3 p-4 border-b border-border-dim/50 bg-bg-sidebar">
                      <div className="min-w-0">
                        <span className="text-[12px] font-black text-text-main uppercase tracking-tight block truncate">{branch.name}</span>
                        <span className="text-[8px] text-text-dim font-bold uppercase tracking-widest">{branch.location || 'Tucumán'}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {config && (
                          <div className="text-right">
                            <span className="block text-[7px] text-text-dim font-black uppercase tracking-widest">Bandera Roja</span>
                            <span className="text-[11px] font-mono font-black text-red-400">-${redFlagPenalty.toLocaleString('es-AR')}</span>
                          </div>
                        )}
                        <button
                          onClick={() => setLocalBranchId(branch.id)}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-black text-[9px] uppercase tracking-wider px-3 py-2 rounded transition-colors"
                        >
                          Configurar
                        </button>
                      </div>
                    </div>

                    {/* Cuerpo: chips de variables */}
                    <div className="p-4 flex-1">
                      {config && variablesList.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {variablesList.map((v, idx) => (
                            <div key={v.id || idx} className="bg-bg-sidebar border border-border-dim/40 rounded-lg p-2.5">
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className="text-[9px] font-black uppercase text-blue-400 truncate">{v.name}</span>
                                <span className="text-[7px] text-text-dim font-bold shrink-0">({v.unit})</span>
                                <span className={cn("ml-auto text-[7px] font-black uppercase px-1 py-0.5 rounded shrink-0",
                                  v.isLowerBetter ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500")}>
                                  {v.isLowerBetter ? '↓ menos' : '↑ más'}
                                </span>
                              </div>
                              {v.tiers && v.tiers.length > 0 ? (
                                <div className="space-y-1">
                                  {v.tiers.map((t: any, tIdx: number) => (
                                    <div key={t.id || tIdx} className="flex justify-between items-center font-mono text-[9px] bg-bg-accent/30 px-2 py-1 rounded">
                                      <span className="text-text-dim font-bold">{v.isLowerBetter ? '≤' : '≥'}{t.threshold}{v.unit === '%' ? '%' : v.unit === '★' ? '★' : ''}</span>
                                      <span className="text-emerald-400 font-extrabold">${t.prize?.toLocaleString('es-AR') || '0'}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[8px] text-amber-500/70 italic font-bold">Sin escalas</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : config ? (
                        <div className="flex items-center justify-center py-6">
                          <span className="text-[9px] text-amber-400 font-black uppercase tracking-wider bg-amber-400/10 px-3 py-1.5 rounded border border-amber-400/20">⚠️ Configuración sin variables</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center py-6">
                          <span className="text-[9px] text-text-dim font-black uppercase tracking-wider bg-bg-accent/40 px-3 py-1.5 rounded border border-border-dim/40">❌ No configurado para {selectedMonth}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const currentConfig = configs[activeRole];
  const currentReport = reports[activeRole];

  // Exportar PDF con los objetivos y premios del mes (rol + sucursal en pantalla)
  const exportConfigPDF = () => {
    const M = 14, PW = 210, PH = 297, CW = PW - 2 * M;
    const BRAND: [number, number, number] = [193, 18, 31];
    const DARK: [number, number, number] = [33, 37, 41];
    const GRAY: [number, number, number] = [110, 116, 122];
    const F = 'helvetica';
    const branch = branches.find(b => b.id === localBranchId)?.name || 'Sucursal';
    const roleLabel = activeRole === 'encargado' ? 'Encargado' : activeRole === 'jefe_cocina' ? 'Jefe de Cocina' : 'Segundo de Cocina';
    const cfg = currentConfig;
    const fmt = (n: number) => Number(n || 0).toLocaleString('es-AR');
    // La fuente base del PDF (Helvetica/WinAnsi) no soporta símbolos como ★, los
    // pasamos a texto y limpiamos cualquier otro caracter no soportado.
    const unitPdf = (u: string) => (u || '').replace(/★/g, 'estrellas').replace(/[^\x00-\xFF]/g, '').trim();

    const doc = new jsPDF();
    // Cabecera de marca
    doc.setFillColor(...BRAND); doc.rect(0, 0, PW, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(F, 'bold'); doc.setFontSize(9); doc.text('GESTIÓN CRAFT', M, 12);
    doc.setFontSize(15); doc.text('OBJETIVOS Y PREMIOS DEL MES', M, 21);
    doc.setFont(F, 'normal'); doc.setFontSize(8); doc.text('Programa de incentivos', M, 26.5);
    doc.setFont(F, 'bold'); doc.setFontSize(9); doc.text(roleLabel.toUpperCase(), PW - M, 12, { align: 'right' });
    doc.setFontSize(11); doc.text(branch.toUpperCase(), PW - M, 18, { align: 'right' });
    doc.setFont(F, 'normal'); doc.setFontSize(9); doc.text(mesLabelPDF(selectedMonth), PW - M, 24, { align: 'right' });

    let y = 40;
    doc.setFont(F, 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
    const intro = doc.splitTextToSize('Estos son los objetivos del mes y el premio que se obtiene al alcanzar cada escala. El premio de cada variable es acumulable con el de las demás.', CW);
    doc.text(intro, M, y); y += intro.length * 4.6 + 4;

    cfg.variables.forEach((v, i) => {
      const isMoney = /\$|peso/i.test(v.unit);
      const rows = [...v.tiers].map(t => [
        isMoney ? `$${fmt(t.threshold)}` : `${fmt(t.threshold)} ${unitPdf(v.unit)}`.trim(),
        `$${fmt(t.prize)}`,
      ]);
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont(F, 'bold'); doc.setFontSize(11); doc.setTextColor(...DARK);
      doc.text(`${i + 1}. ${v.name}`, M, y);
      doc.setFont(F, 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BRAND);
      doc.text(v.isLowerBetter ? 'MENOS ES MEJOR' : 'MÁS ES MEJOR', PW - M, y, { align: 'right' });
      y += 2;
      autoTable(doc, {
        head: [['Objetivo a alcanzar', 'Premio']],
        body: rows.length ? rows : [['Sin escalas cargadas', '-']],
        startY: y + 2, margin: { left: M, right: M },
        styles: { fontSize: 9, cellPadding: 2.5, textColor: DARK as any, lineColor: [235, 236, 238] as any, lineWidth: 0.2 },
        headStyles: { fillColor: BRAND as any, textColor: [255, 255, 255] as any, fontStyle: 'bold', fontSize: 8.5 },
        alternateRowStyles: { fillColor: [249, 250, 251] as any },
        columnStyles: { 0: { cellWidth: CW - 45 }, 1: { cellWidth: 45, halign: 'right', fontStyle: 'bold', textColor: [16, 120, 80] as any } },
      });
      y = (doc as any).lastAutoTable.finalY + 7;
    });

    if (cfg.variables.length === 0) {
      doc.setTextColor(...GRAY); doc.setFontSize(10);
      doc.text('No hay variables configuradas para este rol y mes.', M, y); y += 8;
    }

    // Penalidad por bandera roja
    if (y > 262) { doc.addPage(); y = 20; }
    const noteH = 15;
    doc.setFillColor(247, 248, 249); doc.roundedRect(M, y - 2, CW, noteH, 1.6, 1.6, 'F');
    doc.setFillColor(...BRAND); doc.rect(M, y - 2, 1.4, noteH, 'F');
    doc.setFont(F, 'bold'); doc.setFontSize(8); doc.setTextColor(...BRAND);
    doc.text('PENALIDAD POR BANDERA ROJA', M + 5, y + 3.5);
    doc.setFont(F, 'normal'); doc.setFontSize(9.5); doc.setTextColor(...DARK);
    doc.text(`Se descuenta $${fmt(cfg.redFlagPenalty || 0)} por cada bandera roja registrada en el mes.`, M + 5, y + 9);

    // Footer con paginado
    const pc = doc.getNumberOfPages();
    for (let p = 1; p <= pc; p++) {
      doc.setPage(p);
      doc.setDrawColor(230, 231, 233); doc.setLineWidth(0.3); doc.line(M, PH - 12, PW - M, PH - 12);
      doc.setFont(F, 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
      doc.text(`Objetivos y Premios · ${branch} · ${mesLabelPDF(selectedMonth)} · ${roleLabel}`, M, PH - 8);
      doc.text(`Página ${p} de ${pc}`, PW - M, PH - 8, { align: 'right' });
    }
    doc.save(`premios_${roleLabel.replace(/ /g, '_')}_${branch.replace(/ /g, '_')}_${selectedMonth}.pdf`);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-sidebar p-5 rounded-lg border border-border-dim shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-500 rounded-lg text-white shadow-lg shadow-blue-500/20">
            <Trophy size={24} />
          </div>
          <div>
            <h2 className="text-lg font-black text-text-main uppercase tracking-tight">Administración de Premios</h2>
            <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest leading-none mt-1">Configuración y Carga de Resultados</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Volver a Vista General button */}
          <button
            onClick={() => setLocalBranchId('all')}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-blue-600/15 cursor-pointer"
          >
            ← Volver a Vista General
          </button>

          {/* Sucursal filter dropdown */}
          <div className="flex items-center bg-bg-accent px-3 py-1.5 rounded border border-border-dim">
            <Building2 size={16} className="text-text-dim mr-2" />
            <select
              value={localBranchId}
              onChange={(e) => setLocalBranchId(e.target.value)}
              className="bg-transparent border-none text-[12px] font-black uppercase text-blue-500 focus:outline-none cursor-pointer pr-4"
            >
              <option value="all" className="bg-bg-sidebar text-text-main">← IR A VISTA GENERAL</option>
              {branches.map(b => (
                <option key={b.id} value={b.id} className="bg-bg-sidebar text-text-main">
                  {b.name.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center bg-bg-accent px-3 py-1.5 rounded border border-border-dim">
            <CalendarIcon size={16} className="text-text-dim mr-2" />
            <input 
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none text-[12px] font-black uppercase text-blue-500 focus:outline-none"
            />
          </div>
          <button onClick={fetchData} className="p-2 text-text-dim hover:text-blue-500 transition-colors" title="Actualizar datos">
            <RefreshCcw size={18} className={loading ? "animate-spin" : ""} />
          </button>

          {localBranchId !== 'all' && activeTab === 'config' && (
            <button
              onClick={handleCopyToNextMonth}
              disabled={saving}
              className="px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-600 border border-emerald-500/20 text-emerald-400 hover:text-white rounded text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              title="Copiar las variables y escalas de premios de este mes al mes siguiente si lo deseas"
            >
              <CalendarDays size={14} className="stroke-[2.5]" />
              <span>Copiar al Mes Siguiente</span>
            </button>
          )}

          {localBranchId !== 'all' && activeTab === 'config' && (
            <button
              onClick={exportConfigPDF}
              className="px-3.5 py-1.5 bg-brand-500/10 hover:bg-brand-500 border border-brand-500/20 text-brand-500 hover:text-white rounded text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Exportar los objetivos y premios de este rol/mes en PDF para enviar a los usuarios"
            >
              <FileText size={14} className="stroke-[2.5]" />
              <span>Exportar PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Mode & Role Selectors */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex p-1 bg-bg-sidebar rounded-lg border border-border-dim w-fit shadow-sm">
          {(['config', 'results'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-6 py-2 rounded-md font-black uppercase text-[11px] tracking-widest transition-all min-w-[120px]",
                activeTab === tab 
                  ? "bg-blue-600 text-white shadow-md" 
                  : "text-text-dim hover:text-text-main"
              )}
            >
              {tab === 'config' ? '⚙️ Configuración' : '📝 Cargar Resultados'}
            </button>
          ))}
        </div>

        <div className="flex p-1 bg-bg-sidebar rounded-lg border border-border-dim w-fit shadow-sm">
          {(['encargado', 'jefe_cocina'] as const).map((role) => (
            <button
              key={role}
              onClick={() => setActiveRole(role)}
              className={cn(
                "px-6 py-2 rounded-md font-black uppercase text-[11px] tracking-widest transition-all",
                activeRole === role 
                  ? "bg-blue-500 text-white shadow-md" 
                  : "text-text-dim hover:text-text-main"
              )}
            >
              {role.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {activeTab === 'config' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-dim/40 pb-2">
                <h3 className="text-[11px] font-black text-text-dim uppercase tracking-widest flex items-center gap-2">
                  <Target size={16} className="text-blue-500" />
                  Variables de Desempeño: {activeRole.replace('_', ' ')}
                </h3>
                <div className="flex items-center gap-2">
                  {activeRole === 'encargado' && (
                    <button 
                      onClick={handleGenerateKitchenRoles}
                      className="flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-all"
                      title="Genera Jefe de Cocina (50%) y Segundo de Cocina (40%) usando las variables y premios del Encargado"
                    >
                      <span>⚡ Generar Jefe y Segundo (desde Encargado)</span>
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      setTargetBranches([]);
                      setCopySalesGoal(false);
                      setCopyRedFlagPenalty(true);
                      setShowCopyBranchModal(true);
                    }}
                    className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-all"
                    title="Copiar estas variables y escalas de premios a otras sucursales"
                  >
                    <span>📤 Copiar a Sucursales</span>
                  </button>
                  <button 
                    onClick={handleAddVariable}
                    className="flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-colors"
                  >
                    <Plus size={14} /> Nueva Variable
                  </button>
                </div>
              </div>

              <AnimatePresence mode="popLayout">
                {currentConfig.variables.map((v) => (
                  <motion.div 
                    key={v.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="glass-card overflow-hidden"
                  >
                    <div className="bg-bg-accent/40 p-4 border-b border-border-dim flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="p-2 cursor-grab text-text-dim/30">
                          <GripVertical size={16} />
                        </div>
                        <input 
                          type="text"
                          placeholder="Nombre de la Variable (ej: CMV)"
                          value={v.name}
                          onChange={(e) => handleUpdateVariable(v.id, { name: e.target.value })}
                          className="bg-transparent border-b border-border-dim/50 focus:border-blue-500 outline-none text-[12px] font-black uppercase text-text-main py-1 px-0 flex-1"
                        />
                        <select 
                          value={v.unit}
                          onChange={(e) => handleUpdateVariable(v.id, { unit: e.target.value })}
                          className="bg-bg-accent border border-border-dim rounded px-2 py-1 text-[10px] font-black uppercase"
                        >
                          <option value="%">% Porcentaje</option>
                          <option value="★">★ Calificación</option>
                          <option value="HS">HS Horas</option>
                          <option value="$">$ Pesos</option>
                          <option value="CANT">CANT Cantidad</option>
                        </select>
                        <button 
                          onClick={() => handleUpdateVariable(v.id, { isLowerBetter: !v.isLowerBetter })}
                          className={cn(
                            "px-2 py-1 rounded text-[9px] font-black uppercase border transition-colors",
                            v.isLowerBetter 
                              ? "border-amber-500/30 text-amber-500 bg-amber-500/5" 
                              : "border-blue-500/30 text-blue-500 bg-blue-500/5"
                          )}
                        >
                          {v.isLowerBetter ? "Menos es mejor" : "Más es mejor"}
                        </button>
                      </div>
                      <button 
                        onClick={() => handleRemoveVariable(v.id)}
                        className="p-2 text-text-dim hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="p-4 bg-black/10">
                      <div className="grid grid-cols-12 gap-4 mb-2 px-2">
                        <div className="col-span-5 text-[9px] font-black text-text-dim uppercase">Objetivo (Umbral)</div>
                        <div className="col-span-5 text-[9px] font-black text-text-dim uppercase">Premio ($)</div>
                        <div className="col-span-2"></div>
                      </div>
                      <div className="space-y-2">
                        {v.tiers.map((t) => (
                          <div key={t.id} className="grid grid-cols-12 gap-4 items-center">
                            <div className="col-span-5 relative">
                              <input 
                                type="number"
                                step="0.1"
                                value={t.threshold}
                                onChange={(e) => handleUpdateTier(v.id, t.id, { threshold: parseFloat(e.target.value) })}
                                className="w-full bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-[11px] font-black text-text-main focus:border-blue-500 outline-none"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-text-dim">{v.unit}</span>
                            </div>
                            <div className="col-span-5 relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-text-dim">$</span>
                              <input 
                                type="number"
                                value={t.prize}
                                onChange={(e) => handleUpdateTier(v.id, t.id, { prize: parseFloat(e.target.value) })}
                                className="w-full bg-bg-accent border border-border-dim rounded pl-6 pr-3 py-1.5 text-[11px] font-black text-blue-500 focus:border-blue-500 outline-none"
                              />
                            </div>
                            <div className="col-span-2 flex justify-center">
                              <button 
                                onClick={() => handleRemoveTier(v.id, t.id)}
                                className="p-1.5 text-text-dim opacity-40 hover:opacity-100 hover:text-red-500 transition-all"
                              >
                                <XCircle size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button 
                        onClick={() => handleAddTier(v.id)}
                        className="mt-4 flex items-center gap-2 text-[9px] font-black uppercase text-blue-500 hover:text-blue-600 transition-colors"
                      >
                        <Plus size={12} /> Agregar Escala de Premio
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="glass-card overflow-hidden">
              <div className="bg-bg-accent/40 px-6 py-4 border-b border-border-dim flex items-center justify-between">
                <h3 className="text-xs font-black uppercase text-text-main tracking-widest flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-500" />
                  Carga de Resultados Reales: {activeRole.replace('_', ' ')}
                </h3>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {currentConfig.variables.map(v => {
                    const result = currentReport.results.find(r => r.variableId === v.id);
                    return (
                      <div key={v.id} className="space-y-2 p-4 bg-bg-accent/20 rounded-lg border border-border-dim">
                        <label className="text-[10px] font-black text-text-dim uppercase tracking-wider block">{v.name}</label>
                        <div className="relative">
                          <input 
                            type="number"
                            step="0.1"
                            value={result?.actualValue || 0}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              const newResults = [...currentReport.results];
                              const idx = newResults.findIndex(r => r.variableId === v.id);
                              if (idx >= 0) newResults[idx].actualValue = val;
                              else newResults.push({ variableId: v.id, variableName: v.name, actualValue: val, achievedPrize: 0 });
                              setReports({ ...reports, [activeRole]: { ...currentReport, results: newResults } });
                            }}
                            className="w-full bg-bg-sidebar border border-border-dim rounded px-4 py-2 text-lg font-black text-text-main outline-none focus:border-blue-500"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-dim font-black">{v.unit}</span>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                           <span className="text-[9px] font-black text-text-dim uppercase">Premio según escala:</span>
                           <span className="text-[11px] font-black text-blue-500">${calculateVariablePrize(v, result?.actualValue || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-border-dim">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text-dim uppercase block">Venta Real ($)</label>
                    <input 
                      type="number"
                      value={currentReport.actualSales}
                      onChange={(e) => setReports({ ...reports, [activeRole]: { ...currentReport, actualSales: parseFloat(e.target.value) } })}
                      className="w-full bg-bg-sidebar border border-border-dim rounded px-4 py-2 text-lg font-black text-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text-dim uppercase block">Cantidad Banderas Rojas</label>
                    <input 
                      type="number"
                      value={currentReport.redFlagsCount}
                      onChange={(e) => setReports({ ...reports, [activeRole]: { ...currentReport, redFlagsCount: parseInt(e.target.value) || 0 } })}
                      className="w-full bg-bg-sidebar border border-border-dim rounded px-4 py-2 text-lg font-black text-red-500 outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="p-6 bg-bg-accent/40 border-t border-border-dim flex justify-end">
                  <button 
                    onClick={handleSaveResults}
                    disabled={saving}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-black uppercase text-[12px] shadow-lg shadow-green-500/20"
                  >
                    {saving ? <RefreshCcw size={18} className="animate-spin" /> : <Save size={18} />}
                    Publicar Resultados {activeRole.replace('_', ' ')}
                  </button>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="glass-card p-6 border-l-4 border-blue-500">
            <h3 className="text-sm font-black uppercase text-blue-500 tracking-widest mb-6 flex items-center gap-2">
              <TrendingUp size={18} />
              Metas de Estructura
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-text-dim uppercase ml-1">Penalidad Banderas Rojas ($)</label>
                <div className="relative">
                   <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim font-black">$</span>
                   <input 
                    type="number"
                    value={currentConfig.redFlagPenalty}
                    onChange={(e) => setConfigs({
                      ...configs,
                      [activeRole]: { ...currentConfig, redFlagPenalty: parseFloat(e.target.value) }
                    })}
                    className="w-full bg-bg-sidebar border border-border-dim rounded pl-8 pr-4 py-3 text-lg font-black text-red-500 focus:border-red-500 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="sticky top-6 space-y-4">
            {activeTab === 'config' && (
              <button 
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white p-4 rounded-xl font-black uppercase text-[12px] tracking-widest transition-all shadow-xl shadow-blue-500/20 group"
              >
                {saving ? <RefreshCcw size={18} className="animate-spin" /> : <Save size={18} className="group-hover:scale-110 transition-transform" />}
                Guardar Configuración {activeRole.replace('_', ' ')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal para copiar configuración a sucursales */}
      {showCopyBranchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-bg-sidebar border border-border-dim rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-border-dim/60 bg-bg-accent/25 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                  <Trophy size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-text-main uppercase tracking-tight">Copiar Configuración</h3>
                  <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest mt-0.5">Rol: {activeRole.replace('_', ' ')}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowCopyBranchModal(false)}
                className="text-text-dim hover:text-text-main transition-colors text-xs font-black uppercase"
              >
                ✕ Cerrar
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase text-text-dim block tracking-wider">
                  Selecciona las Sucursales Destino <span className="text-red-500 font-black">*</span>
                </span>
                <p className="text-[9px] text-text-dim/80 font-bold uppercase block leading-tight mb-2">
                  La configuración actual de {activeRole.replace('_', ' ')} se copiará a las sucursales que marques:
                </p>

                <div className="bg-bg-accent/40 rounded-lg border border-border-dim/80 p-3 max-h-48 overflow-y-auto space-y-2">
                  {branches
                    .filter(b => b.id !== localBranchId && b.id !== 'all')
                    .map(b => {
                      const isChecked = targetBranches.includes(b.id);
                      return (
                        <label 
                          key={b.id} 
                          className="flex items-center gap-2.5 p-2 rounded hover:bg-bg-sidebar cursor-pointer transition-colors text-[11px] font-bold text-text-main uppercase"
                        >
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setTargetBranches(targetBranches.filter(id => id !== b.id));
                              } else {
                                setTargetBranches([...targetBranches, b.id]);
                              }
                            }}
                            className="rounded border border-border-dim/80 text-blue-500 focus:ring-0 cursor-pointer w-4 h-4 bg-bg-accent"
                          />
                          <span>{b.name}</span>
                        </label>
                      );
                    })}
                  
                  {branches.filter(b => b.id !== localBranchId && b.id !== 'all').length === 0 && (
                    <p className="text-[10px] text-text-dim text-center py-4 uppercase font-bold">No hay otras sucursales registradas</p>
                  )}
                </div>

                {branches.filter(b => b.id !== localBranchId && b.id !== 'all').length > 0 && (
                  <div className="flex gap-2 justify-end pt-1">
                    <button 
                      type="button"
                      onClick={() => setTargetBranches(branches.filter(b => b.id !== localBranchId && b.id !== 'all').map(b => b.id))}
                      className="text-[9px] font-black uppercase text-blue-500 hover:underline"
                    >
                      ✓ Marcar Todas
                    </button>
                    <span className="text-text-dim/40 text-[9px]">•</span>
                    <button 
                      type="button"
                      onClick={() => setTargetBranches([])}
                      className="text-[9px] font-black uppercase text-text-dim hover:underline"
                    >
                      ✕ Desmarcar Todas
                    </button>
                  </div>
                )}
              </div>

              {/* Advanced Copy Options */}
              <div className="p-4 bg-bg-accent/40 rounded-lg border border-border-dim/60 space-y-3">
                <span className="text-[9.5px] font-black uppercase text-text-dim block tracking-wider">Opciones de Copiado</span>
                
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox"
                    checked={copySalesGoal}
                    onChange={(e) => setCopySalesGoal(e.target.checked)}
                    className="mt-0.5 rounded border border-border-dim/80 text-blue-500 focus:ring-0 cursor-pointer w-4 h-4 bg-bg-accent"
                  />
                  <div>
                    <span className="text-[11px] font-bold text-text-main uppercase block leading-tight mt-0.5">Copiar también Metas de Ventas</span>
                    <span className="text-[9px] text-amber-500 font-bold uppercase block leading-relaxed mt-1">
                      ⚠️ ¡Recomendado desactivar! Las sucursales suelen tener objetivos de venta diferentes.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer select-none pt-2 border-t border-border-dim/30">
                  <input 
                    type="checkbox"
                    checked={copyRedFlagPenalty}
                    onChange={(e) => setCopyRedFlagPenalty(e.target.checked)}
                    className="mt-0.5 rounded border border-border-dim/80 text-blue-500 focus:ring-0 cursor-pointer w-4 h-4 bg-bg-accent"
                  />
                  <div>
                    <span className="text-[11px] font-bold text-text-main uppercase block leading-tight mt-0.5">Copiar Penalidad de Banderas Rojas</span>
                    <span className="text-[9px] text-text-dim font-bold uppercase block leading-relaxed mt-1">
                      Copia el costo por bandera roja para este rol.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-bg-accent/25 border-t border-border-dim/60 flex items-center justify-between">
              <span className="text-[10px] font-black text-text-dim uppercase">
                {targetBranches.length} {targetBranches.length === 1 ? 'sucursal' : 'sucursales'} seleccionadas
              </span>
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={() => setShowCopyBranchModal(false)}
                  className="px-4 py-2 bg-transparent text-text-dim hover:text-text-main text-[10px] font-black uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={handleCopyToBranches}
                  disabled={saving || targetBranches.length === 0}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/10"
                >
                  {saving ? <RefreshCcw size={14} className="animate-spin" /> : <Save size={14} />}
                  <span>Guardar y Copiar</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
