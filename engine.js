// ===== TIME STUDY ENGINE (works in browser and Node) =====
// Allowance by machine type (VieKind). Empty for now: everything uses the default.
const ALLOWANCE = {};
const DEFAULT_ALLOWANCE = 0.13;

function allowanceFor(machine, table = ALLOWANCE) {
  return (machine && table[machine] !== undefined) ? table[machine] : DEFAULT_ALLOWANCE;
}

function mean(arr) {
  const v = arr.map(Number).filter(x => x > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}
// cycles the IE kept (abnormal cycles can be excluded with row.skip = [index, ...])
const usedCycles = row => (row.pieces || []).filter((p, i) => !(row.skip || []).includes(i) && Number(p) > 0);
function variation(arr) {                    // coefficient of variation (sd / mean)
  const v = arr.map(Number), m = mean(v);
  if (v.length < 2 || !m) return 0;
  return Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / (v.length - 1)) / m;
}

// "39+40" -> [39,40]
const parseOps = t => String(t).split('+').map(s => Number(s.trim())).filter(Boolean);

// opMap: { 39:{sam:0.2412, machine:'SNLS'}, ... }
function calcOperator(row, opMap, table = ALLOWANCE) {
  const ops = parseOps(row.opText);
  const sam = ops.reduce((s, o) => s + (opMap[o]?.sam || 0), 0);          // combined = sum of SAM
  const allow = sam > 0                                                    // SAM-weighted allowance
    ? ops.reduce((s, o) => s + (opMap[o]?.sam || 0) * allowanceFor(opMap[o]?.machine, table), 0) / sam
    : DEFAULT_ALLOWANCE;
  const used = usedCycles(row), sec = mean(used);
  const min = sec / 60 * (1 + allow);
  const machines = [...new Set(ops.map(o => opMap[o]?.machine).filter(Boolean))];
  return { ...row, ops, key: ops.join('+'), sam, allow, sec, min, n: used.length, cv: variation(used), machines,
           capacity: min > 0 ? 60 / min : 0, eff: min > 0 ? sam / min : 0 };
}

// capacity of each operation = sum of 60/min of every worker covering it
function lineCapacity(workers, requiredOps) {
  const opCap = {};
  requiredOps.forEach(o => opCap[o] = 0);
  workers.forEach(w => { if (w.min > 0) w.ops.forEach(o => opCap[o] = (opCap[o] || 0) + 60 / w.min); });
  let capacity = Infinity;
  Object.values(opCap).forEach(c => { if (c < capacity) capacity = c; });
  return { opCap, capacity: capacity === Infinity ? 0 : capacity };
}

// greedy: repeatedly move the worker that raises line capacity the most
function suggestMoves(workers, requiredOps, maxMoves = 10) {
  let cur = workers.filter(w => w.min > 0).map(w => ({ ...w }));
  let base = lineCapacity(cur, requiredOps).capacity;
  const moves = [];
  for (let i = 0; i < maxMoves; i++) {
    const groups = {};
    cur.forEach(w => (groups[w.key] ||= { ops: w.ops, machines: w.machines || [], list: [] }).list.push(w));
    let best = null;
    for (const w of cur) for (const [key, g] of Object.entries(groups)) {
      if (key === w.key) continue;
      // only suggest a move if the operator already runs the machine(s) the target operation needs
      if (g.machines.length && !g.machines.every(m => (w.machines || []).includes(m))) continue;
      const avgMin = g.list.reduce((s, x) => s + x.min, 0) / g.list.length;
      const trial = cur.map(x => x === w ? { ...x, key, ops: g.ops, min: avgMin } : x);
      const cap = lineCapacity(trial, requiredOps).capacity;
      if (cap > base + 1e-9 && (!best || cap > best.cap)) best = { w, key, cap, trial };
    }
    if (!best) break;
    moves.push({ emp: best.w.emp, name: best.w.name, from: best.w.key, to: best.key, newCapacity: best.cap });
    cur = best.trial.map(x => x.key === best.key && x.emp === best.w.emp ? { ...x, machines: groups[best.key].machines } : x);
    base = best.cap;
  }
  return { moves, finalCapacity: base };
}

function analyze(rows, opMap, table = ALLOWANCE) {
  const workers = rows.map(r => calcOperator(r, opMap, table));
  const active = workers.filter(w => w.min > 0);
  const requiredOps = [...new Set(active.flatMap(w => w.ops))];
  const { opCap, capacity } = lineCapacity(active, requiredOps);
  const totalSam = active.reduce((s, w) => s + w.sam, 0);
  const totalMin = active.reduce((s, w) => s + w.min, 0);
  const caps = Object.values(opCap);
  const avgCap = caps.reduce((a, b) => a + b, 0) / caps.length;
  const bottleneckOps = requiredOps.filter(o => Math.abs(opCap[o] - capacity) < 1e-9);
  return {
    workers, opCap, lineCapacity: capacity, bottleneckOps,
    lineEfficiency: totalMin > 0 ? totalSam / totalMin : 0,   // total SAM / total actual time
    balanceRate: capacity > 0 ? capacity / avgCap : 0,        // bottleneck / average op capacity
    suggestion: suggestMoves(active, requiredOps)
  };
}

if (typeof module !== 'undefined') module.exports = { analyze, calcOperator, usedCycles, variation, ALLOWANCE };
