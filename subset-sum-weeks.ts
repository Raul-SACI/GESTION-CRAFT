import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data, error } = await supabase
    .from('sales')
    .select('date, pesos, net_sales')
    .order('date', { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  // Aggregate by exact day
  const daily: Record<number, { gross: number, net: number }> = {};
  for (let i = 1; i <= 30; i++) daily[i] = { gross: 0, net: 0 };
  for (const r of data) {
    const parts = r.date.split('-');
    if (parts[1] === '04') {
      const day = parseInt(parts[2], 10);
      daily[day].gross += Number(r.pesos || 0);
      daily[day].net += Number(r.net_sales || 0);
    }
  }

  console.log("Daily arrays populated. Searching subset space...");

  const tgt3G = 34474548.45;
  const tgt3N = 30468605.63;
  const tgt4G = 37143223.43;
  const tgt4N = 32715883.33;

  // Since we have 30 days, we can find combinations of days that sum to tgt3G / tgt3N and tgt4G / tgt4N.
  // We can search for any combination of days that sums close to tgt3G.
  // To keep search fast, let's look for combinations of size 5 to 12 days.
  const daysList = Array.from({ length: 30 }, (_, i) => i + 1);

  function findCombinations(targetGross: number, targetNet: number, label: string) {
    console.log(`\nSearching combinations for ${label}...`);
    let bestDiff = Infinity;
    let bestCombo: number[] = [];

    // Simple randomized search to find closest combinations quickly
    for (let i = 0; i < 5000000; i++) {
      const comboLen = Math.floor(Math.random() * 8) + 5; // size 5 to 12
      const shuffled = [...daysList].sort(() => 0.5 - Math.random());
      const combo = shuffled.slice(0, comboLen).sort((a,b)=>a-b);
      
      let sumG = 0;
      let sumN = 0;
      for (const d of combo) {
        sumG += daily[d].gross;
        sumN += daily[d].net;
      }

      const diff = Math.abs(sumG - targetGross) + Math.abs(sumN - targetNet);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestCombo = combo;
        if (diff < 5000) {
          console.log(`[GOOD COMBO] Diff: ${diff.toFixed(2)} | Days: ${combo.join(', ')}`);
          console.log(`   Gross: ${sumG.toFixed(2)}, Net: ${sumN.toFixed(2)}`);
        }
      }
    }
    console.log(`Best combo for ${label} had diff ${bestDiff.toFixed(2)}: Days: ${bestCombo.join(', ')}`);
  }

  findCombinations(tgt3G, tgt3N, "Semana 3");
  findCombinations(tgt4G, tgt4N, "Semana 4");
}

run();
