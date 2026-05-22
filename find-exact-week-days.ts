import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log("Fetching ALL sales from database using pagination...");
  let allSales: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('sales')
      .select('date, pesos, net_sales, branch_id')
      .order('date', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error("Error:", error);
      break;
    }

    if (data && data.length > 0) {
      allSales = [...allSales, ...data];
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  const targets = [
    { name: "Semana 3", gross: 34474548.45, net: 30468605.63 },
    { name: "Semana 4", gross: 37143223.43, net: 32715883.33 }
  ];

  for (const branch of ['all', 'bn']) {
    const subset = (branch === 'all') ? allSales : allSales.filter(s => s.branch_id === branch);
    console.log(`\n======================================\nAnalyzing Branch: ${branch} (${subset.length} records)`);
    
    const daily: Record<number, { gross: number, net: number }> = {};
    for (let i = 1; i <= 31; i++) daily[i] = { gross: 0, net: 0 };

    for (const r of subset) {
      const parts = r.date.split('-');
      if (parts[1] === '04') {
        const day = parseInt(parts[2], 10);
        if (!isNaN(day)) {
          daily[day].gross += Number(r.pesos || 0);
          daily[day].net += Number(r.net_sales || 0);
        }
      }
    }

    // Try contiguous day ranges (start to end)
    console.log("Checking contiguous day ranges (start to end):");
    for (let s = 1; s <= 30; s++) {
      for (let e = s; e <= 30; e++) {
        let g = 0, n = 0;
        for (let d = s; d <= e; d++) {
          g += daily[d].gross;
          n += daily[d].net;
        }

        for (const t of targets) {
          const diffG = Math.abs(g - t.gross);
          const diffN = Math.abs(n - t.net);
          // If difference is small (less than 1 ARS, indicating exact match with decimal rounding)
          if (diffG < 1.0 && diffN < 1.0) {
            console.log(`[EXACT CONTIGUOUS MATCH] ${t.name}: Days ${s} to ${e}`);
          } else if (diffG < 10.0 && diffN < 10.0) {
            console.log(`[VERY CLOSE MATCH] ${t.name}: Days ${s} to ${e} (Diff: G=${diffG.toFixed(2)}, N=${diffN.toFixed(2)})`);
          } else if (diffG < 1000.0 && diffN < 1000.0) {
            console.log(`[CLOSE MATCH] ${t.name}: Days ${s} to ${e} (Diff: G=${diffG.toFixed(2)}, N=${diffN.toFixed(2)})`);
          }
        }
      }
    }
  }
}

run();
