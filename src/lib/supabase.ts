/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isMissingCredentials = !supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder');

if (isMissingCredentials) {
  console.warn('Supabase credentials missing. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

export const realSupabaseClient = supabase;

export { isMissingCredentials };

// ---- Cliente Supabase de la app de MANTENIMIENTO (base separada) ----
// La anon key es pública (va en el frontend), no es un secreto crítico.
// Se lee de variables de entorno para poder apuntar a una base DEMO aislada;
// si no están definidas, cae en la base de Mantenimiento de producción (compat).
const mantUrl = import.meta.env.VITE_MANT_SUPABASE_URL || 'https://mvfhuhvpgqaxhbzzxzhe.supabase.co';
const mantAnonKey = import.meta.env.VITE_MANT_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12Zmh1aHZwZ3FheGhienp4emhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5Nzg3MTYsImV4cCI6MjA5MzU1NDcxNn0.n4LaRklBjj1Dhhrl-4WbVEGL4dG_spE8FrkihCPA2tg';

export const supabaseMant = createClient(mantUrl, mantAnonKey);
