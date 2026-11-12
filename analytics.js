// analytics.js - supervisor analytics on saved studies (pure functions, no screen code)
// A study is the object saved by the app / the study_*.json file: {id, date, updated, line, style, target, ie, type, note,
// manpower, raw[], opsSnap[], result{...}}. Efficiency and balance are fractions (0.55 = 55%).
(function (root) {
  const num = v => (isFinite(v) ? Number(v) : 0);
  const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const usedOf = w => (w.pieces || []).filter((p, i) => !(w.skip || []).includes(i) && Number(p) > 0).map(Number);
  const pcsOf = w => (w.pieces || []).reduce((s, p, i) => (!(w.skip || []).includes(i) && Number(p) > 0) ? s + Math.max(1, Math.round(Number((w.cnt || [])[i])) || 1) : s, 0);
  const cvOf = a => { if (a.length < 2) return 0; const m = mean(a); return m ? Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)) / m : 0; };
  const when = s => new Date(s.updated || s.date).getTime();         // newest version of a study
  const at = s => new Date(s.date).getTime();                        // the day the study was done

  // ---- how trustworthy is a study? (officer checks it before saving, supervisor sees it in the list)
  function quality(s, o) {
    o = o || {}; const minCycles = o.minCycles || 3, cvMax = o.cvMax || 0.15;
    const raw = s.raw || [], R = s.result || {};
    let few = 0, high = 0, excl = 0, cyc = 0, cvs = [];
    raw.forEach(w => { const u = usedOf(w), pc = pcsOf(w); cyc += pc; excl += (w.skip || []).length;
      if (pc < minCycles) few++; else { const c = cvOf(u); cvs.push(c); if (u.length >= 3 && c > cvMax) high++; } });
    const missing = (R.missingOps || []).length, studied = Object.keys(R.opCap || {}).length;
    const coverage = studied + missing ? studied / (studied + missing) : 1;
    const issues = [];
    if (few) issues.push({ k: 'few', n: few });
    if (coverage < 0.8) issues.push({ k: 'cover', n: missing, v: coverage });
    else if (missing) issues.push({ k: 'missing', n: missing });
    if (high) issues.push({ k: 'var', n: high });
    const status = (few || coverage < 0.8) ? 'review' : (high || missing) ? 'check' : 'ok';
    return { status, issues, coverage, operators: raw.length, avgCycles: raw.length ? cyc / raw.length : 0, excluded: excl, avgCv: mean(cvs) };
  }

  // ---- red / amber / green for a study against the supervisor's standards
  function rag(s, set) {
    const R = s.result || {}, eff = num(R.lineEfficiency), cap = num(R.lineCapacity), tgt = Number(s.target) || 0, bal = num(R.balanceRate);
    let lvl = eff >= set.eff ? 0 : eff >= set.eff - 0.10 ? 1 : 2; const reasons = [];
    if (eff < set.eff) reasons.push({ k: 'eff', v: eff });
    if (tgt) { const g = cap / tgt, l = g >= 1 ? 0 : g >= 0.9 ? 1 : 2; if (l) reasons.push({ k: 'cap', v: g }); lvl = Math.max(lvl, l); }
    if (bal < set.bal) { reasons.push({ k: 'bal', v: bal }); lvl = Math.max(lvl, 1); }
    return { level: lvl, name: ['green', 'amber', 'red'][lvl], reasons };
  }

  // capacity that balancing could add (suggested worker moves) as a fraction of today's capacity
  const potential = s => { const R = s.result || {}, f = R.suggestion && R.suggestion.finalCapacity, c = num(R.lineCapacity); return c && f ? Math.max(0, f / c - 1) : 0; };

  // bottleneck operations with machine, operators and their remarks
  function bottleneck(s) {
    const R = s.result || {}, snap = s.opsSnap || [], bn = R.bottleneckOps || [], raw = s.raw || [];
    const machines = [...new Set(bn.map(o => (snap.find(x => x.no === o) || {}).machine || '').filter(Boolean))];
    const who = (R.workers || []).map((w, i) => ({ w, i })).filter(({ w }) => (w.ops || []).some(o => bn.includes(o)))
      .map(({ w, i }) => ({ name: w.name || w.emp, sec: num(w.sec), remark: (raw[i] && raw[i].remark) || w.remark || '' }));
    return { ops: bn, machines, who };
  }

  // ---- filtering and grouping
  function filterStudies(list, f) {
    f = f || {};
    const puOf = f.puOf || (() => '');
    return list.filter(s => (!f.from || at(s) >= f.from || (f.touched && when(s) >= f.from)) && (!f.pu || (s.pu || puOf(s.line)) === f.pu) && (!f.line || s.line === f.line) && (!f.ie || s.ie === f.ie) && (!f.type || (s.type || 'new') === f.type)
      && (!f.style || String(s.style || '').toLowerCase().includes(String(f.style).trim().toLowerCase())));
  }
  function latestPerLine(list) {
    const m = new Map(); list.forEach(s => { const c = m.get(s.line); if (!c || at(s) > at(c) || (at(s) === at(c) && when(s) > when(c))) m.set(s.line, s); });
    return [...m.values()];
  }
  function trend(list, line) {
    return list.filter(s => s.line === line).sort((a, b) => at(a) - at(b))
      .map(s => ({ id: s.id, date: s.date, eff: num(s.result.lineEfficiency), cap: num(s.result.lineCapacity), style: s.style }));
  }
  function weekly(list) {                                              // average efficiency per week (all lines)
    const m = new Map();
    list.forEach(s => { const d = new Date(at(s)); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const k = d.getTime(); (m.get(k) || m.set(k, []).get(k)).push(num(s.result.lineEfficiency)); });
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ date: new Date(k).toISOString(), eff: mean(v), n: v.length }));
  }
  function improvements(list, all) {                                   // re-study vs the study it started from (baseId)
    const byId = new Map((all || list).map(s => [s.id, s])), out = [];
    list.forEach(s => { if (s.type !== 'restudy' || !s.baseId) return; const b = byId.get(s.baseId); if (!b) return;
      const e0 = num(b.result.lineEfficiency), e1 = num(s.result.lineEfficiency), c0 = num(b.result.lineCapacity), c1 = num(s.result.lineCapacity);
      out.push({ line: s.line, style: s.style, before: b, after: s, dEff: e1 - e0, dCap: c0 ? c1 / c0 - 1 : 0 }); });
    return out.sort((x, y) => y.dEff - x.dEff);
  }
  function machineStats(list) {                                        // which machine types hold the bottleneck most often
    const m = new Map(); list.forEach(s => { const ms = bottleneck(s).machines; (ms.length ? ms : ['(manual)']).forEach(x => m.set(x, (m.get(x) || 0) + 1)); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([machine, n]) => ({ machine, n }));
  }
  function remarkStats(list, top) {                                    // most frequent operator remarks
    const m = new Map(); list.forEach(s => (s.raw || []).forEach(w => String(w.remark || '').split(';').map(x => x.trim()).filter(Boolean)
      .forEach(x => { const k = x.toLowerCase(); const c = m.get(k) || { text: x, n: 0 }; c.n++; m.set(k, c); })));
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, top || 8);
  }
  function officerStats(list, set) {
    const m = new Map();
    list.forEach(s => { const k = s.ie || '(unknown)', q = quality(s); const o = m.get(k) || { ie: k, studies: 0, ok: 0, review: 0, cyc: 0, ops: 0, cv: [], last: 0 };
      o.studies++; if (q.status === 'ok') o.ok++; if (q.status === 'review') o.review++; o.cyc += q.avgCycles * q.operators; o.ops += q.operators; if (q.avgCv) o.cv.push(q.avgCv);
      o.last = Math.max(o.last, at(s)); m.set(k, o); });
    return [...m.values()].map(o => ({ ie: o.ie, studies: o.studies, okPct: o.studies ? o.ok / o.studies : 0, review: o.review,
      avgCycles: o.ops ? o.cyc / o.ops : 0, avgCv: mean(o.cv), last: o.last })).sort((a, b) => b.studies - a.studies);
  }
  function kpis(list, set) {                                           // based on the latest study of every line
    const last = latestPerLine(list), r = last.map(s => rag(s, set));
    const gaps = last.filter(s => Number(s.target)).map(s => num(s.result.lineCapacity) / Number(s.target) - 1);
    return { studies: list.length, lines: last.length, avgEff: mean(last.map(s => num(s.result.lineEfficiency))), avgBal: mean(last.map(s => num(s.result.balanceRate))),
      green: r.filter(x => x.level === 0).length, amber: r.filter(x => x.level === 1).length, red: r.filter(x => x.level === 2).length,
      avgGap: gaps.length ? mean(gaps) : null, review: list.filter(s => quality(s).status === 'review').length,
      potential: mean(last.map(potential)) };
  }
  function periodFrom(code, now) {
    const d = new Date(now || Date.now()); d.setHours(0, 0, 0, 0);
    if (code === 'all') return null;
    if (code === 'today') return d.getTime();
    if (code === 'month') { d.setDate(1); return d.getTime(); }
    d.setDate(d.getDate() - (Number(code) || 30)); return d.getTime();
  }
  const pct = (v, d) => (num(v) * 100).toFixed(d == null ? 1 : d) + '%';
  function summaryText(list, set, label, lang) {                       // short text to paste into Zalo / email
    const k = kpis(list, set), last = latestPerLine(list).map(s => ({ s, r: rag(s, set) })).filter(x => x.r.level > 0)
      .sort((a, b) => b.r.level - a.r.level || num(a.s.result.lineEfficiency) - num(b.s.result.lineEfficiency));
    const vi = lang === 'vi';
    let t = vi ? `BÁO CÁO NĂNG LỰC CHUYỀN (${label})\n` : `LINE CAPACITY SUMMARY (${label})\n`;
    t += vi ? `- ${k.studies} nghiên cứu, ${k.lines} chuyền. Hiệu suất TB ${pct(k.avgEff)} (chuẩn ${pct(set.eff, 0)}).\n` : `- ${k.studies} studies, ${k.lines} lines. Avg efficiency ${pct(k.avgEff)} (standard ${pct(set.eff, 0)}).\n`;
    t += vi ? `- Đạt: ${k.green}, Cần theo dõi: ${k.amber}, Chưa đạt: ${k.red}.\n` : `- On standard: ${k.green}, Watch: ${k.amber}, Below: ${k.red}.\n`;
    if (last.length) t += (vi ? '- Chuyền cần xử lý:\n' : '- Lines needing action:\n') + last.slice(0, 8).map(({ s }) => {
      const b = bottleneck(s); return `  • ${s.line} (${s.style}): ${pct(s.result.lineEfficiency)}, ${num(s.result.lineCapacity).toFixed(0)} pcs/h` + (b.ops.length ? (vi ? `, nút cổ chai CĐ ${b.ops.join(',')}` : `, bottleneck op ${b.ops.join(',')}`) : '') + (potential(s) > 0.03 ? (vi ? `, có thể +${pct(potential(s), 0)} nếu cân bằng` : `, +${pct(potential(s), 0)} possible by balancing`) : ''); }).join('\n');
    return t;
  }

  const API = { quality, rag, potential, bottleneck, filterStudies, latestPerLine, trend, weekly, improvements, machineStats, remarkStats, officerStats, kpis, periodFrom, summaryText, when, at, mean };
  root.AN = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
