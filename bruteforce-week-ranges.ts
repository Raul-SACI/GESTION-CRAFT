import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data: allSales, error } = await supabase
    .from('sales')
    .select('date, pesos, net_sales, branch_id');
    
  if (error) {
    console.error(error);
    return;
  }

  // Filter only for BARRIO NORTE ('bn')
  const bnSales = allSales.filter(s => s.branch_id === 'bn');
  console.log(`Analyzing ${bnSales.length} records for Barrio Norte...`);

  const daily: Record<number, { gross: number, net: number }> = {};
  for (let i = 1; i <= 31; i++) daily[i] = { gross: 0, net: 0 };

  for (const r of bnSales) {
    const parts = r.date.split('-');
    if (parts[1] === '04') {
      const day = parseInt(parts[2], 10);
      daily[day].gross += Number(r.pesos || 0);
      daily[day].net += Number(r.net_sales || 0);
    }
  }

  const tgt3G = 34474548.45;
  const tgt3N = 30468605.63;
  const tgt4G = 37143223.43;
  const tgt4N = 32715883.33;

  // Let's print out daily figures for BN to manually inspect
  console.log("\nDaily sums for Barrio Norte ('bn'):");
  for (let i = 1; i <= 30; i++) {
    console.log(`Day ${i}: Gross $${daily[i].gross.toLocaleString('es-ES')}, Net $${daily[i].net.toLocaleString('es-ES')}`);
  }

  console.log("\nSearching for exact day ranges for Semana 3 and Semana 4 (Tolerance $5.000):");

  for (let s = 1; s <= 30; s++) {
    for (let e = s; e <= 30; e++) {
      let g = 0, n = 0;
      for (let d = s; d <= e; d++) {
        g += daily[d].gross;
        n += daily[d].net;
      }
      
      const diffG3 = Math.abs(g - tgt3G);
      const diffN3 = Math.abs(n - tgt3N);
      if (diffG3 < 5000 && diffN3 < 5000) {
        console.log(`-> Semana 3 Match: Days ${s} to ${e}:`);
        console.log(`   Gross: $${g.toLocaleString('es-ES')}, Net: $${n.toLocaleString('es-ES')}`);
        console.log(`   Diff Gross: $${diffG3.toFixed(2)}, Diff Net: $${diffN3.toFixed(2)}`);
      }

      const diffG4 = Math.abs(g - tgt4G);
      const diffN4 = Math.abs(n - tgt4N);
      if (diffG4 < 5000 && diffN4 < 5000) {
        console.log(`-> Semana 4 Match: Days ${s} to ${e}:`);
        console.log(`   Gross: $${g.toLocaleString('es-ES')}, Net: $${n.toLocaleString('es-ES')}`);
        console.log(`   Diff Gross: $${diffG4.toFixed(2)}, Diff Net: $${diffN4.toFixed(2)}`);
      }
    }
  }
}

run();
