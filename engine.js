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
// A row = one operator on one operation. row.pieces[i] = seconds PER PIECE of lap i, row.cnt[i] = pieces in lap i (default 1:
// a chain of 4 pieces cut after the 4th = one lap of 4 pieces). Excluded laps are listed in row.skip = [index, ...].
// A garment can need several different parts at the operation (row.parts, e.g. front, back, trimming the chain): every lap
// belongs to one part (row.prt[i], 0-based). Time per garment = sum over the parts of the average seconds per piece of that part.
const nParts = row => Math.max(1, Math.round(Number(row.parts)) || 1);
const usedCycles = row => (row.pieces || []).filter((p, i) => !(row.skip || []).includes(i) && Number(p) > 0);
const usedLaps = row => (row.pieces || []).map((p, i) => ({ p: Number(p), w: Math.max(1, Math.round(Number((row.cnt || [])[i])) || 1), i,
    k: Math.max(0, Math.round(Number((row.prt || [])[i])) || 0) }))
  .filter(x => !(row.skip || []).includes(x.i) && x.p > 0);
const partPieces = (row, k) => usedLaps(row).filter(x => x.k === k).reduce((s, x) => s + x.w, 0);
// garments covered: the part with the fewest pieces decides (one part = all pieces)
const piecesUsed = row => { const P = nParts(row); if (P === 1) return usedLaps(row).reduce((s, x) => s + x.w, 0);
  let m = Infinity; for (let k = 0; k < P; k++) m = Math.min(m, partPieces(row, k)); return m; };
const partsComplete = row => { const P = nParts(row); for (let k = 0; k < P; k++) if (!partPieces(row, k)) return false; return true; };
const wmeanOf = u => { const w = u.reduce((s, x) => s + x.w, 0); return w ? u.reduce((s, x) => s + x.p * x.w, 0) / w : 0; };
function wmean(row) {                        // average seconds per piece, weighted by the pieces of each lap (all parts together)
  return wmeanOf(usedLaps(row));
}
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
  const parts = nParts(row), u = usedLaps(row), used = usedCycles(row);
  let sec, cv, partSec = null, partsMissing = [];
  if (parts === 1) { sec = wmeanOf(u); cv = variation(used); }
  else {                                     // several parts: each part timed on its own, time per garment = sum of the parts
    partSec = []; cv = 0;
    for (let k = 0; k < parts; k++) { const uk = u.filter(x => x.k === k); partSec.push(wmeanOf(uk)); if (!uk.length) partsMissing.push(k); cv = Math.max(cv, variation(uk.map(x => x.p))); }
    sec = partsMissing.length ? 0 : partSec.reduce((a, b) => a + b, 0);    // a part not timed yet: not counted
  }
  const min = sec / 60 * (1 + allow);
  const machines = [...new Set(ops.map(o => opMap[o]?.machine).filter(Boolean))];
  return { ...row, ops, key: ops.join('+'), sam, allow, parts, partSec, partsMissing, sec, min, n: used.length, cv, machines,
           pcs: piecesUsed(row), capacity: min > 0 ? 60 / min : 0, eff: min > 0 ? sam / min : 0 };
}

// One person can be timed on several separate operations (e.g. back-neck topstitch AND care label on every garment).
// Her hour is shared: she finishes one set every (sum of her minutes) minutes, so she adds 60 / that to each of her operations.
const personKey = w => String(w.emp || w.name || '');
function personMinutes(workers) {             // person -> total minutes per garment over all her separate operations
  const m = {};
  workers.forEach(w => { if (w.min > 0) { const k = personKey(w); m[k] = (m[k] || 0) + w.min; } });
  return m;
}
// capacity of each operation = sum of what every worker covering it adds (shared hour for a person on several operations)
function lineCapacity(workers, requiredOps) {
  const opCap = {}, pm = personMinutes(workers);
  requiredOps.forEach(o => opCap[o] = 0);
  workers.forEach(w => { if (w.min > 0) w.ops.forEach(o => opCap[o] = (opCap[o] || 0) + 60 / pm[personKey(w)]); });
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
    // (1) move a whole operator to another operation (only if she already runs the machine(s) it needs)
    for (const w of cur) for (const [key, g] of Object.entries(groups)) {
      if (key === w.key) continue;
      if (g.machines.length && !g.machines.every(m => (w.machines || []).includes(m))) continue;
      const avgMin = g.list.reduce((s, x) => s + x.min, 0) / g.list.length;
      const trial = cur.map(x => x === w ? { ...x, key, ops: g.ops, min: avgMin } : x);
      const cap = lineCapacity(trial, requiredOps).capacity;
      if (cap > base + 1e-9 && (!best || cap > best.cap)) best = { kind: 'move', w, key, cap, trial };
    }
    // (2) give ONE operation of an operator who carries several to another operator on the same machine type
    //     (the receiver's hour is then shared between her own operation and the new one; time taken from the giver's measurement)
    const cnt = {}, people = {};
    cur.forEach(w => { const k = personKey(w); cnt[k] = (cnt[k] || 0) + 1; const q = people[k] ||= { emp: w.emp, name: w.name, machines: new Set() }; (w.machines || []).forEach(m => q.machines.add(m)); });
    for (const w of cur) {
      if (cnt[personKey(w)] < 2) continue;
      for (const [qk, q] of Object.entries(people)) {
        if (qk === personKey(w)) continue;
        if ((w.machines || []).length && !w.machines.every(m => q.machines.has(m))) continue;
        const trial = cur.map(x => x === w ? { ...x, emp: q.emp, name: q.name } : x);
        const cap = lineCapacity(trial, requiredOps).capacity;
        if (cap > base + 1e-9 && (!best || cap > best.cap)) best = { kind: 'give', w, to: q, cap, trial };
      }
    }
    if (!best) break;
    if (best.kind === 'give') moves.push({ kind: 'give', emp: best.w.emp, name: best.w.name, from: best.w.key, toEmp: best.to.emp, toName: best.to.name, newCapacity: best.cap, est: true });
    else moves.push({ emp: best.w.emp, name: best.w.name, from: best.w.key, to: best.key, newCapacity: best.cap });
    cur = best.kind === 'give' ? best.trial : best.trial.map(x => x.key === best.key && x.emp === best.w.emp ? { ...x, machines: groups[best.key].machines } : x);
    base = best.cap;
  }
  return { moves, finalCapacity: base };
}

function analyze(rows, opMap, table = ALLOWANCE) {
  const workers = rows.map(r => calcOperator(r, opMap, table));
  const active = workers.filter(w => w.min > 0), pm = personMinutes(active);
  workers.forEach(w => { if (w.min > 0) { const tot = pm[personKey(w)]; w.share = w.min / tot; w.lineRate = 60 / tot; } });   // share of her time, pcs/hr she really gives
  const requiredOps = [...new Set(active.flatMap(w => w.ops))];
  const { opCap, capacity } = lineCapacity(active, requiredOps);
  const totalSam = active.reduce((s, w) => s + w.sam, 0);
  const totalMin = active.reduce((s, w) => s + w.min, 0);
  const caps = Object.values(opCap);
  const avgCap = caps.reduce((a, b) => a + b, 0) / caps.length;
  const bottleneckOps = requiredOps.filter(o => Math.abs(opCap[o] - capacity) < 1e-9);
  return {
    workers, opCap, lineCapacity: capacity, bottleneckOps, people: Object.keys(pm).length, calc: 2,
    opMachine: Object.fromEntries(requiredOps.map(o => [o, (opMap[o] && opMap[o].machine) || ''])),
    lineEfficiency: totalMin > 0 ? totalSam / totalMin : 0,
    balanceRate: capacity > 0 ? capacity / avgCap : 0,   // bottleneck / average op capacity
    suggestion: suggestMoves(active, requiredOps)
  };
}

// Operators needed per operation to reach the target (shared by the result screen and the Excel report), worst first.
// acts: { k:'split', ops, g, name } one person sews several short operations | { k:'move', o, g, x, from, m } take time from a
// spare operation on the same machine | { k:'hire', o, g, m } no spare time on that machine.
function staffingPlan(r, tgt, snap) {
  const mach = o => (r.opMachine || {})[o] || ((snap || []).find(x => x.no === o) || {}).machine || '';
  const rows = Object.keys(r.opCap || {}).map(Number).map(o => {
    const have = (r.workers || []).filter(w => w.min > 0 && (w.ops || []).includes(o)).reduce((a, w) => a + (w.share == null ? 1 : w.share), 0);
    const cap = r.opCap[o], need = cap > 0 ? tgt * have / cap : 0;
    return { o, m: mach(o), cap, have, need, gap: have - need };
  }).sort((a, b) => a.gap - b.gap);
  const spare = rows.filter(x => x.gap > 0).map(x => ({ ...x, left: x.gap })), acts = [], done = new Set();
  rows.filter(x => x.gap < -0.05).forEach(x => {           // one person sews several short operations: split them first
    const p = (r.workers || []).find(w => w.min > 0 && w.share < 0.995 && (w.ops || []).includes(x.o));
    if (!p || done.has('p:' + personKey(p))) return;
    const mine = r.workers.filter(w => w.min > 0 && personKey(w) === personKey(p));
    const short = rows.filter(y => y.gap < -0.05 && mine.some(w => (w.ops || []).includes(y.o)));
    short.forEach(y => done.add(y.o)); done.add('p:' + personKey(p));
    acts.push({ k: 'split', ops: mine.map(w => w.opText).join(' + '), g: -Math.min(...short.map(y => y.gap)), name: p.name || p.emp });
  });
  rows.filter(x => x.gap < -0.05 && !done.has(x.o)).forEach(x => {   // a short operation takes time from a spare operation on the same machine
    let need = -x.gap;
    spare.filter(y => y.left >= 0.1 && (!x.m || y.m === x.m)).sort((a, b) => b.left - a.left).forEach(y => {
      if (need < 0.05) return; const g = Math.min(need, y.left); y.left -= g; need -= g;
      acts.push({ k: 'move', o: x.o, g: -x.gap, x: g, from: y.o, m: y.m });
    });
    if (need >= 0.05) acts.push({ k: 'hire', o: x.o, g: need, m: x.m });
  });
  return { rows, acts, need: rows.reduce((a, x) => a + x.need, 0), have: rows.reduce((a, x) => a + x.have, 0) };
}

if (typeof module !== 'undefined') module.exports = { analyze, staffingPlan, partPieces, partsComplete, nParts, calcOperator, lineCapacity, personKey, usedCycles, usedLaps, piecesUsed, wmean, variation, ALLOWANCE };
