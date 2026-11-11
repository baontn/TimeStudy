// xlsx_export.js - builds the Capacity study Excel file (same layout as the company template)
// plus an "Analysis" sheet (line balancing, bottleneck, chart). No libraries needed.
// Public: studyXlsxFile(study, styleOps, logoBytes?) -> File
(function (root) {
  const enc = new TextEncoder();
  const esc = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colL = n => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  const num = v => (isFinite(v) ? v : 0);
  const rnd = (v, d) => Math.round(num(v) * Math.pow(10, d)) / Math.pow(10, d);

  // ---------------- ZIP (stored, no compression) ----------------
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
          date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parts = [], central = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data, c = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, c, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, c, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    }
    let csize = 0; central.forEach(p => csize += p.length);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, off, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(off + csize + 22); let p = 0;
    all.forEach(a => { out.set(a, p); p += a.length; });
    return out;
  }

  // ---------------- styles ----------------
  const XF = [], ST = {};
  const xf = (font, fill, border, nf, h, v, wrap) =>
    `<xf numFmtId="${nf}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment${h ? ` horizontal="${h}"` : ''}${v ? ` vertical="${v}"` : ''}${wrap ? ' wrapText="1"' : ''}/></xf>`;
  const def = (name, ...a) => { ST[name] = XF.length; XF.push(xf(...a)); };
  // fonts: 0 Calibri11, 1 TNR36B, 2 Arial36B, 3 Arial36, 4 TNR48B, 5 Calibri36B, 6 TNR36, 7 Calibri11B, 8 Calibri14B
  // fills: 0 none, 1 gray125, 2 yellow, 3 green, 4 light blue, 5 light red.  borders: 0 none, 1 thin
  // numFmts: 1 "0", 4 "#,##0.00", 9 "0%", 164 "0.0000", 165 "0.0%", 166 "0.0"
  def('base', 0, 0, 0, 0);
  def('title', 1, 0, 1, 0, 'left', 'center', 1);   def('hdr', 1, 0, 1, 0, 'center', 'center', 1);
  def('opno', 2, 0, 1, 0, 'center', 'center', 1);  def('textC', 3, 0, 1, 0, 'center', 'center', 0);
  def('sam', 3, 0, 1, 164, 'center', 'center', 0); def('sec', 3, 0, 1, 166, 'center', 'center', 0);
  def('min', 3, 0, 1, 164, 'center', 'center', 0); def('cap', 3, 0, 1, 1, 'center', 'center', 0);
  def('effp', 3, 0, 1, 165, 'center', 'center', 0); def('prev', 3, 0, 1, 4, 'center', 'center', 0);
  def('remark', 1, 0, 1, 0, 'center', 'center', 1); def('lookK', 3, 0, 1, 0, 'center', 'top', 1);
  def('lookL', 3, 0, 1, 0, null, 'top', 1);        def('totLabel', 1, 0, 1, 0, 'center', 'center', 1);
  def('totSam', 2, 0, 1, 164, 'center', 'center', 0); def('totMin', 2, 0, 1, 4, 'center', 'center', 0);
  def('totEff', 4, 2, 1, 165, 'center', 'center', 0); def('totTgt', 4, 3, 1, 9, 'center', 'center', 0);
  def('totBlank', 6, 0, 1, 0, null, 'center', 0);  def('box', 0, 0, 1, 0);
  def('jHdr', 5, 0, 1, 0, 'center', 'center', 0);  def('sBy', 1, 0, 1, 0, 'left', 'center', 1);
  def('sName', 1, 0, 1, 0, 'center', 'center', 0);
  def('aTitle', 8, 0, 0, 0);                       def('aBold', 7, 0, 0, 0);
  def('aHdr', 7, 4, 1, 0, 'center', 'center', 1);  def('aCell', 0, 0, 1, 0, 'left', 'center', 1);
  def('aNum', 0, 0, 1, 166, 'center', 'center', 0); def('aPct', 0, 0, 1, 165, 'center', 'center', 0);
  def('aRedNum', 7, 5, 1, 166, 'center', 'center', 0); def('aRedCell', 7, 5, 1, 0, 'left', 'center', 1);
  def('aVal', 7, 0, 0, 166, 'left', 'center', 0);  def('aValPct', 7, 0, 0, 165, 'left', 'center', 0);
  def('aValTxt', 7, 0, 0, 0, 'left', 'center', 0);
  def('aInt', 0, 0, 1, 1, 'center', 'center', 0);   def('aTxtC', 0, 0, 1, 0, 'center', 'center', 1);
  def('gRed', 7, 5, 1, 0, 'center', 'center', 1);   def('gAmber', 7, 6, 1, 0, 'center', 'center', 1);   def('gGreen', 7, 7, 1, 0, 'center', 'center', 1);
  const stylesXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="0.0000"/><numFmt numFmtId="165" formatCode="0.0%"/><numFmt numFmtId="166" formatCode="0.0"/></numFmts>
<fonts count="9">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="36"/><name val="Times New Roman"/><family val="1"/></font>
<font><b/><sz val="36"/><name val="Arial"/><family val="2"/></font>
<font><sz val="36"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="48"/><name val="Times New Roman"/><family val="1"/></font>
<font><b/><sz val="36"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="36"/><name val="Times New Roman"/><family val="1"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF92D050"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFEB9C"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFC6EFCE"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${XF.length}">${XF.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="1"><dxf><font><color rgb="FF9C0006"/></font><fill><patternFill><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf></dxfs>
</styleSheet>`;

  // ---------------- sheet model ----------------
  function Sheet() { this.cells = {}; this.heights = {}; this.merges = []; this.maxRow = 1; }
  Sheet.prototype.put = function (c, r, o) { (this.cells[r] = this.cells[r] || {})[c] = o; if (r > this.maxRow) this.maxRow = r; };
  Sheet.prototype.row = function (r) { const x = this.cells[r] || {}; return Object.keys(x).map(Number).sort((a, b) => a - b); };
  Sheet.prototype.xml = function (o) {
    let rows = '';
    Object.keys(this.cells).map(Number).sort((a, b) => a - b).forEach(r => {
      const h = this.heights[r], cs = this.row(r).map(c => {
        const x = this.cells[r][c], ref = colL(c) + r, s = x.s != null ? ` s="${x.s}"` : '';
        if (x.f !== undefined) {
          const isStr = typeof x.v === 'string';
          return `<c r="${ref}"${s}${isStr ? ' t="str"' : ''}><f>${esc(x.f)}</f><v>${isStr ? esc(x.v) : num(x.v)}</v></c>`;
        }
        if (typeof x.v === 'number') return `<c r="${ref}"${s}><v>${num(x.v)}</v></c>`;
        if (typeof x.v === 'string' && x.v !== '') return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(x.v)}</t></is></c>`;
        return `<c r="${ref}"${s}/>`;
      }).join('');
      rows += `<row r="${r}"${h ? ` ht="${h}" customHeight="1"` : ''}>${cs}</row>`;
    });
    const cols = o.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr>${o.tab ? `<tabColor rgb="${o.tab}"/>` : ''}<pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${colL(o.cols.length - 1)}${this.maxRow}"/>
<sheetViews><sheetView${o.selected ? ' tabSelected="1"' : ''} zoomScale="${o.zoom}" zoomScaleNormal="${o.zoom}" workbookViewId="0"${o.freeze ? `><pane ySplit="${o.freeze}" topLeftCell="A${o.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView>` : '/>'}</sheetViews>
<sheetFormatPr defaultColWidth="11.85546875" defaultRowHeight="${o.defH}"/>
<cols>${cols}</cols><sheetData>${rows}</sheetData>
${o.autoFilter ? `<autoFilter ref="${o.autoFilter}"/>` : ''}
${this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}
${o.cf || ''}${o.zeroMargins ? '<printOptions horizontalCentered="1"/><pageMargins left="0" right="0" top="0" bottom="0" header="0" footer="0"/>' : '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'}
<pageSetup paperSize="9" orientation="${o.orient}" fitToWidth="1" fitToHeight="${o.fitH}"/>
${o.footer ? `<headerFooter><oddFooter>${o.footer}</oddFooter></headerFooter>` : ''}
${o.noDrawing ? '' : '<drawing r:id="rId1"/>'}
</worksheet>`;
  };

  // ---------------- chart ----------------
  function chartXml(n, firstRow, caps, bnIdx, hasTgt, sheet) {
    const rng = (col) => `'${sheet}'!$${col}$${firstRow}:$${col}$${firstRow + n - 1}`;
    const cache = vals => `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${num(v)}</c:v></c:pt>`).join('')}</c:numCache>`;
    const cat = `<c:cat><c:numRef><c:f>${rng('A')}</c:f>${cache(caps.ops)}</c:numRef></c:cat>`;
    const tx = (cell, name) => `<c:tx><c:strRef><c:f>'${sheet}'!$${cell}$${firstRow - 1}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`;
    const dpts = bnIdx.map(i => `<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="DC2626"/></a:solidFill></c:spPr></c:dPt>`).join('');
    const lbl = `<c:dLbls><c:numFmt formatCode="0" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`;
    const line = (idx, col, name, vals, color, w) => `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>${tx(col, name)}<c:spPr><a:ln w="${w}" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:prstDash val="dash"/><a:round/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>${cat}<c:val><c:numRef><c:f>${rng(col)}</c:f>${cache(vals)}</c:numRef></c:val><c:smooth val="0"/></c:ser>`;
    const title = t => `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1000" b="0"/></a:pPr><a:r><a:rPr lang="en-US" sz="1000" b="0"/><a:t>${esc(t)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:roundedCorners val="0"/>
<c:chart>
<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1400" b="1"/><a:t>Line balance: capacity per operation (pcs/hr)</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
<c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>
<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>
<c:ser><c:idx val="0"/><c:order val="0"/>${tx('B', 'Capacity (pcs/hr)')}<c:spPr><a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>${dpts}${lbl}${cat}<c:val><c:numRef><c:f>${rng('B')}</c:f>${cache(caps.cap)}</c:numRef></c:val></c:ser>
<c:gapWidth val="60"/><c:axId val="50010"/><c:axId val="50020"/></c:barChart>
<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>
${line(1, 'D', 'Line capacity', caps.line, 'DC2626', 22225)}${hasTgt ? line(2, 'E', 'Target', caps.tgt, '16A34A', 28575) : ''}
<c:marker val="1"/><c:axId val="50010"/><c:axId val="50020"/></c:lineChart>
<c:catAx><c:axId val="50010"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>${title('Operation')}<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="50020"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>
<c:valAx><c:axId val="50020"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/>${title('pcs/hr')}<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="50010"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>
</c:plotArea>
<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
</c:chart></c:chartSpace>`;
  }

  // ---------------- the workbook ----------------
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const TYPES = { new: 'New study', qco: 'QCO', restudy: 'Re-study', routine: 'Routine check (old)', before: 'Before improvement (old)', after: 'After improvement (old)' };
  const dmy = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

  function build(h, styleOps, logo) {
    const R = h.result, W0 = R.workers || [], raw0 = h.raw || [];
    // rows in operation sequence; a combined operation (e.g. 33+34) comes right after the single rows of all its operations
    const seqKey = w => { const o = (w.ops || []).map(Number).filter(isFinite); return o.length ? [Math.max(...o), o.length, Math.min(...o)] : [Infinity, 0, 0]; };
    const order = W0.map((w, i) => i).sort((a, b) => { const x = seqKey(W0[a]), y = seqKey(W0[b]); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a - b; });
    const W = order.map(i => W0[i]), raw = order.map(i => raw0[i] || {});
    const used = [...new Set(W.flatMap(w => w.ops))].sort((a, b) => a - b);
    let ops = (h.opsSnap && h.opsSnap.length ? h.opsSnap : (styleOps || []).filter(o => used.includes(o.no)))
      .map(o => ({ no: o.no, sam: o.sam })).sort((a, b) => a.no - b.no);
    const nOps = ops.length, opRow = {}; ops.forEach((o, i) => opRow[o.no] = 8 + i);
    const date = new Date(h.date), tgt = Number(h.target) || 0;
    const sheetName = String(h.line || 'Line').replace(/[\\\/\?\*\[\]:']/g, '-').slice(0, 31) || 'Line';

    // ===== Sheet 1: template layout =====
    const s1 = new Sheet(), lastCol = 9;
    for (let r = 1; r <= 5; r++) for (let c = 0; c <= lastCol; c++) s1.put(c, r, { s: ST.box });
    s1.put(0, 1, { s: ST.title, v: `LINE CAPACITY STUDY\nBảng nghiên cứu năng lực chuyền\nMã hàng/ Style: ${h.style}` });
    s1.merges.push('A1:J5');
    const effTxt = (num(R.lineEfficiency) * 100).toFixed(1), capTxt = Math.round(num(R.lineCapacity));
    s1.put(0, 6, { s: ST.title, v: `Line: ${h.line}${h.pu ? ' (' + h.pu + ')' : ''}\nNgày: ${dmy(date)}\nHiệu suất (%): ${effTxt}%\nSL/giờ/chuyền (chiếc): ${capTxt} pcs /h` });
    s1.put(1, 6, { s: ST.box }); s1.merges.push('A6:B6');
    s1.put(2, 6, { s: ST.hdr }); s1.put(3, 6, { s: ST.box }); s1.put(4, 6, { s: ST.box }); s1.merges.push('C6:E6');
    s1.put(5, 6, { s: ST.sBy, v: 'Studied by:\nNgười làm: ' });
    s1.put(6, 6, { s: ST.sName, v: h.ie || '' }); s1.put(7, 6, { s: ST.box }); s1.merges.push('G6:H6');
    s1.put(8, 6, { s: ST.box }); s1.put(9, 6, { s: ST.jHdr, v: 'Remark' });
    const heads = ['Operation No.\nSố công đoạn', 'SAM\nThời gian chuẩn', 'Emp. No\nMSCN', 'Name\nTên',
      'Time/pcs (second)\nThời gian/cái\n(giây)', 'Time/pcs\n(minute)\nThời gian/cái (phút)',
      'Output capacity /hour (piece)\nSản lượng năng lực/giờ (cái)', ' Efficiency Capacity\nHiệu suất năng lực', 'Previous\nHiệu suất trước'];
    heads.forEach((t, c) => s1.put(c, 7, { s: ST.hdr, v: t }));
    s1.put(9, 7, { s: ST.jHdr, v: 'Thực tế' });
    s1.put(10, 7, { s: ST.hdr, v: 'Op' }); s1.put(11, 7, { s: ST.hdr, v: 'SAM' });
    const nRows = Math.max(W.length, 24), first = 8, last = first + nRows - 1, tot = last + 1;
    let sumB = 0, sumF = 0;
    for (let i = 0; i < nRows; i++) {
      const r = first + i, w = W[i], rw = raw[i] || {};
      if (!w) { for (let c = 0; c <= 9; c++) s1.put(c, r, { s: ST.box }); continue; }
      const single = /^\d+$/.test(String(w.opText).trim());
      s1.put(0, r, { s: ST.opno, v: single ? Number(w.opText) : String(w.opText) });
      const known = w.ops.every(o => opRow[o]);
      const fB = !known ? undefined : single ? `VLOOKUP(A${r},$K$8:$L$${7 + nOps},2,0)` : w.ops.map(o => 'L' + opRow[o]).join('+');
      s1.put(1, r, fB === undefined ? { s: ST.sam, v: num(w.sam) } : { s: ST.sam, f: fB, v: num(w.sam) });
      s1.put(2, r, { s: ST.textC, v: String(w.emp || '') }); s1.put(3, r, { s: ST.textC, v: String(w.name || '') });
      const sec = rnd(w.sec, 2), fac = rnd(1 + num(w.allow), 4), mins = sec / 60 * fac;
      s1.put(4, r, { s: ST.sec, v: sec });
      s1.put(5, r, { s: ST.min, f: `+E${r}/60*${fac}`, v: mins });
      s1.put(6, r, { s: ST.cap, f: `60/F${r}`, v: mins ? 60 / mins : 0 });
      s1.put(7, r, { s: ST.effp, f: `B${r}/F${r}`, v: mins ? num(w.sam) / mins : 0 });
      s1.put(8, r, { s: ST.prev });
      s1.put(9, r, { s: ST.remark, v: String(rw.remark || w.remark || '') });
      sumB += num(w.sam); sumF += mins;
    }
    for (let i = 0; i < nOps; i++) { s1.put(10, 8 + i, { s: ST.lookK, v: ops[i].no }); s1.put(11, 8 + i, { s: ST.lookL, v: ops[i].sam }); }
    s1.put(0, tot, { s: ST.totLabel, v: 'Total' });
    s1.put(1, tot, { s: ST.totSam, f: `SUM(B${first}:B${last})`, v: sumB });
    [2, 3, 4, 6, 9].forEach(c => s1.put(c, tot, { s: ST.totBlank }));
    s1.put(5, tot, { s: ST.totMin, f: `SUM(F${first}:F${last})`, v: sumF });
    s1.put(7, tot, { s: ST.totEff, f: `B${tot}/F${tot}`, v: sumF ? sumB / sumF : 0 });
    s1.put(8, tot, { s: ST.totTgt, v: 0.55 });
    for (let r = 1; r <= 4; r++) s1.heights[r] = 26.25; s1.heights[5] = 63.75; s1.heights[6] = 262; s1.heights[7] = 260.25;
    for (let r = first; r <= last; r++) s1.heights[r] = r === first ? 90 : 72.75;
    s1.heights[tot] = 177.75;
    const cf1 = `<conditionalFormatting sqref="H${first}:H${first + Math.max(W.length, 1) - 1}"><cfRule type="cellIs" dxfId="0" priority="1" operator="lessThan"><formula>0.5</formula></cfRule></conditionalFormatting>`;
    const sheet1 = s1.xml({ cols: [46.140625, 41.28515625, 38, 81.140625, 32.28515625, 33.140625, 53, 35.5703125, 38, 119.85546875, 27.3, 35.3],
      tab: 'FFFFFF00', zoom: 30, defH: 46.5, orient: 'portrait', fitH: 1, selected: true, zeroMargins: true, cf: cf1,
      footer: '&amp;R&amp;"Arial,Bold"&amp;10P-IED-001-F008' });

    // ===== Sheet 2: analysis =====
    const s2 = new Sheet(), AN = 'Analysis';
    const opList = Object.keys(R.opCap).map(Number).sort((a, b) => a - b);
    const lineCap = num(R.lineCapacity), n = opList.length;
    s2.put(0, 1, { s: ST.aTitle, v: 'Line balancing analysis / Phân tích cân bằng chuyền' });
    s2.put(0, 2, { s: ST.aBold, v: 'Line' }); s2.put(1, 2, { s: ST.aValTxt, v: String(h.line) });
    s2.put(2, 2, { s: ST.aBold, v: 'Style' }); s2.put(3, 2, { s: ST.aValTxt, v: String(h.style) });
    s2.put(0, 4, { s: ST.aBold, v: 'PU' }); s2.put(1, 4, { s: ST.aValTxt, v: h.pu || '' });
    s2.put(0, 3, { s: ST.aBold, v: 'Date' }); s2.put(1, 3, { s: ST.aValTxt, v: dmy(date) });
    s2.put(2, 3, { s: ST.aBold, v: 'Studied by' }); s2.put(3, 3, { s: ST.aValTxt, v: h.ie || '' });
    const kp = [['Line capacity (pcs/hr)', lineCap, ST.aVal], ['Line efficiency', num(R.lineEfficiency), ST.aValPct],
      ['Balance rate (bottleneck / average)', num(R.balanceRate), ST.aValPct],
      ['Bottleneck operation(s)', R.bottleneckOps.join(', '), ST.aValTxt], ['Target (pcs/hr)', tgt || '', tgt ? ST.aVal : ST.aValTxt],
      ['Gap to target (pcs/hr)', tgt ? lineCap - tgt : '', tgt ? ST.aVal : ST.aValTxt],
      ['Operations not studied', (R.missingOps || []).join(', '), ST.aValTxt],
      ['Study type', TYPES[h.type || 'new'] || '', ST.aValTxt], ['Line manpower', Number(h.manpower) || '', Number(h.manpower) ? ST.aVal : ST.aValTxt],
      ['Note / change made', h.note || '', ST.aValTxt]];
    kp.forEach((k, i) => { s2.put(0, 5 + i, { s: ST.aBold, v: k[0] }); s2.put(1, 5 + i, { s: k[2], v: k[1] }); });
    const th = 16;                               // table header row
    ['Operation', 'Capacity (pcs/hr)', '% of line capacity', 'Line capacity', 'Target', 'Operators', 'Status']
      .forEach((t, c) => s2.put(c, th, { s: ST.aHdr, v: t }));
    s2.heights[th] = 32;
    const capsArr = { ops: opList, cap: [], line: [], tgt: [] }, bnIdx = [];
    opList.forEach((o, i) => {
      const r = th + 1 + i, cap = num(R.opCap[o]), bn = R.bottleneckOps.includes(o);
      const who = W.filter(w => w.ops.includes(o)).map(w => w.name || w.emp).join(', ');
      const status = bn ? 'Bottleneck' : (tgt && cap < tgt ? 'Below target' : 'OK');
      if (bn) bnIdx.push(i);
      capsArr.cap.push(cap); capsArr.line.push(lineCap); capsArr.tgt.push(tgt);
      s2.put(0, r, { s: bn ? ST.aRedCell : ST.aCell, v: o });
      s2.put(1, r, { s: bn ? ST.aRedNum : ST.aNum, v: cap });
      s2.put(2, r, { s: ST.aPct, f: `B${r}/$B$5`, v: lineCap ? cap / lineCap : 0 });
      s2.put(3, r, { s: ST.aNum, f: '$B$5', v: lineCap });
      s2.put(4, r, tgt ? { s: ST.aNum, f: '$B$9', v: tgt } : { s: ST.aNum });
      s2.put(5, r, { s: ST.aCell, v: who }); s2.put(6, r, { s: bn ? ST.aRedCell : ST.aCell, v: status });
    });
    let mr = th + n + 3;
    s2.put(0, mr, { s: ST.aBold, v: 'Suggested moves / Đề xuất điều chuyển' });
    const moves = (R.suggestion && R.suggestion.moves) || [];
    if (!moves.length) s2.put(0, mr + 1, { s: ST.aValTxt, v: 'No improving move found' });
    moves.forEach((m, i) => s2.put(0, mr + 1 + i, { s: ST.aValTxt,
      v: `Move ${m.name || m.emp} from ${m.from} to ${m.to}  ->  line capacity ${m.newCapacity.toFixed(1)} pcs/hr` }));
    // operators needed for the target (Vietnamese)
    mr = mr + 2 + Math.max(moves.length, 1);
    s2.put(0, mr, { s: ST.aTitle, v: 'Số lao động cần cho mục tiêu' });
    const plan = typeof root.staffingPlan === 'function' ? root.staffingPlan(R, tgt, h.opsSnap) : null;
    if (!tgt || !plan) s2.put(0, mr + 1, { s: ST.aValTxt, v: 'Nhập mục tiêu (cái/giờ) để xem mỗi công đoạn cần bao nhiêu lao động.' });
    else {
      const F = v => num(v).toFixed(1);
      s2.put(0, mr + 1, { s: ST.aValTxt, v: `Để đạt ${tgt} cái/giờ chuyền cần ${F(plan.need)} lao động; hiện có ${F(plan.have)}.` });
      const acts = plan.acts.length ? plan.acts.map(x => x.k === 'split' ? `→ Các CĐ ${x.ops} thiếu (${F(x.g)} lao động) vì ${x.name} làm tất cả: giao một trong các CĐ này cho người khác.`
        : x.k === 'move' ? `→ Công đoạn ${x.o} thiếu ${F(x.g)} lao động: chuyển ${F(x.x)} thời gian từ công đoạn ${x.from} (cùng máy ${x.m || '-'}).`
        : `→ Công đoạn ${x.o} thiếu ${F(x.g)} lao động và không có công đoạn máy ${x.m || '-'} nào dư: thêm / đào tạo người hoặc cải tiến thao tác.`)
        : ['✓ Tất cả công đoạn đủ lao động cho mục tiêu.'];
      acts.forEach((v, i) => s2.put(0, mr + 2 + i, { s: ST.aValTxt, v }));
      const sh = mr + 3 + acts.length;              // header row of the staffing table
      ['Công đoạn', 'Máy', 'Có (lao động)', 'Cần (lao động)', 'Chênh lệch', 'Tình trạng'].forEach((v, c) => s2.put(c, sh, { s: ST.aHdr, v }));
      s2.heights[sh] = 32;
      plan.rows.slice().sort((a, b) => a.o - b.o).forEach((x, i) => {     // in operation sequence
        const r = sh + 1 + i, capRow = th + 1 + opList.indexOf(x.o), short = x.gap < -0.05;
        s2.put(0, r, { s: short ? ST.aRedCell : ST.aCell, v: x.o });
        s2.put(1, r, { s: ST.aTxtC, v: x.m || '' });
        s2.put(2, r, { s: ST.aNum, v: rnd(x.have, 3) });
        s2.put(3, r, { s: ST.aNum, f: `$B$9*C${r}/B${capRow}`, v: x.need });           // need = target × operators ÷ capacity of the operation
        s2.put(4, r, { s: short ? ST.aRedNum : ST.aNum, f: `C${r}-D${r}`, v: x.gap });
        s2.put(5, r, { s: short ? ST.aRedCell : ST.aCell, v: short ? 'Thiếu' : x.gap > 0.05 ? 'Dư' : 'Đủ' });
      });
      s2.put(0, sh + plan.rows.length + 1, { s: ST.aValTxt, v: 'Cần = mục tiêu × số lao động ÷ năng lực của công đoạn. Chênh lệch dưới 0 = công đoạn không đạt mục tiêu.' });
    }
    const sheet2 = s2.xml({ cols: [36, 18, 18, 14, 10, 44, 16], zoom: 100, defH: 15, orient: 'landscape', fitH: 0, zeroMargins: false });

    // ===== package parts =====
    const logoPart = logo && logo.length > 24;
    let lw = 1454, lh = 184;
    if (logoPart) { const dv = new DataView(logo.buffer, logo.byteOffset, logo.byteLength); lw = dv.getUint32(16); lh = dv.getUint32(20); }
    const maxCx = 6970770, maxCy = Math.round(maxCx * 184 / 1454);   // fit any logo inside the original banner box
    const sc = Math.min(maxCx / lw, maxCy / lh), cx = Math.round(lw * sc), cy = Math.round(lh * sc);
    const drawing1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>3</xdr:col><xdr:colOff>1126398</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>46089</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="${REL}" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;
    const emptyDrawing = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>`;
    const drawing2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>8</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>20</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>26</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Line balance chart"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${REL}" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
    const rels = list => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('')}</Relationships>`;
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
<Override PartName="/xl/drawings/drawing2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`;
    const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook ${NS} xmlns:r="${REL}"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="15360" windowHeight="7020"/></bookViews>
<sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/><sheet name="${AN}" sheetId="2" r:id="rId2"/></sheets>
<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'${esc(sheetName)}'!$A$1:$J$${tot}</definedName></definedNames>
<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
    const files = [
      ['[Content_Types].xml', ct], ['_rels/.rels', rels([['rId1', 'officeDocument', 'xl/workbook.xml']])],
      ['xl/workbook.xml', wb],
      ['xl/_rels/workbook.xml.rels', rels([['rId1', 'worksheet', 'worksheets/sheet1.xml'], ['rId2', 'worksheet', 'worksheets/sheet2.xml'], ['rId3', 'styles', 'styles.xml']])],
      ['xl/styles.xml', stylesXml()], ['xl/worksheets/sheet1.xml', sheet1], ['xl/worksheets/sheet2.xml', sheet2],
      ['xl/worksheets/_rels/sheet1.xml.rels', rels([['rId1', 'drawing', '../drawings/drawing1.xml']])],
      ['xl/worksheets/_rels/sheet2.xml.rels', rels([['rId1', 'drawing', '../drawings/drawing2.xml']])],
      ['xl/drawings/drawing1.xml', logoPart ? drawing1 : emptyDrawing],
      ['xl/drawings/drawing2.xml', drawing2],
      ['xl/drawings/_rels/drawing2.xml.rels', rels([['rId1', 'chart', '../charts/chart1.xml']])],
      ['xl/charts/chart1.xml', chartXml(n, th + 1, capsArr, bnIdx, !!tgt, AN)]
    ].map(([name, text]) => ({ name, data: enc.encode(text) }));
    if (logoPart) {
      files.push({ name: 'xl/drawings/_rels/drawing1.xml.rels', data: enc.encode(rels([['rId1', 'image', '../media/image1.png']])) });
      files.push({ name: 'xl/media/image1.png', data: logo });
    }
    return zip(files);
  }

  // ---------------- supervisor summary workbook: tables with header filter and colour status ----------------
  function tableSheet(spec) {
    const s = new Sheet(); let r = 1;
    if (spec.title) s.put(0, r++, { s: ST.aTitle, v: spec.title });
    (spec.lines || []).forEach(l => s.put(0, r++, { s: ST.aValTxt, v: l }));
    if (spec.title || (spec.lines || []).length) r++;
    const hr = r; spec.cols.forEach((c, i) => s.put(i, hr, { s: ST.aHdr, v: c.h })); s.heights[hr] = 34; r++;
    const first = r;
    spec.rows.forEach(row => { row.forEach((cell, i) => {
      const c = spec.cols[i] || {}, o = (cell !== null && typeof cell === 'object') ? cell : { v: cell };
      const st = o.st ? ST['g' + o.st[0].toUpperCase() + o.st.slice(1)] : ({ t: ST.aCell, n: ST.aNum, p: ST.aPct, i: ST.aInt, c: ST.aTxtC }[c.t || 't']);
      let v = (o.v === undefined || o.v === null) ? '' : o.v; if (typeof v === 'number' && !isFinite(v)) v = '';
      s.put(i, r, { s: st, v });
    }); r++; });
    return { s, hr, last: Math.max(first, r - 1), ncols: spec.cols.length };
  }
  function buildSummary(specs) {
    const names = [], safe = n => { let b = String(n || 'Sheet').replace(/[\\\/\?\*\[\]:']/g, '-').slice(0, 28) || 'Sheet', k = b, i = 2; while (names.includes(k)) k = b + i++; names.push(k); return k; };
    const parts = specs.map((sp, i) => { const t = tableSheet(sp), nm = safe(sp.name);
      const xml = t.s.xml({ cols: sp.cols.map(c => c.w || 14), zoom: 100, defH: 15, orient: 'landscape', fitH: 0, noDrawing: true, selected: i === 0,
        freeze: t.hr, autoFilter: sp.filter === false ? '' : `A${t.hr}:${colL(t.ncols - 1)}${t.last}` });
      return { nm, xml }; });
    const rel = list => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('')}</Relationships>`;
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${parts.map((p, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
    const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook ${NS} xmlns:r="${REL}"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="15360" windowHeight="7020"/></bookViews>
<sheets>${parts.map((p, i) => `<sheet name="${esc(p.nm)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029"/></workbook>`;
    const files = [['[Content_Types].xml', ct], ['_rels/.rels', rel([['rId1', 'officeDocument', 'xl/workbook.xml']])], ['xl/workbook.xml', wb],
      ['xl/_rels/workbook.xml.rels', rel([...parts.map((p, i) => ['rId' + (i + 1), 'worksheet', `worksheets/sheet${i + 1}.xml`]), ['rId' + (parts.length + 1), 'styles', 'styles.xml']])],
      ['xl/styles.xml', stylesXml()], ...parts.map((p, i) => [`xl/worksheets/sheet${i + 1}.xml`, p.xml])]
      .map(([name, text]) => ({ name, data: enc.encode(text) }));
    return zip(files);
  }
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  root.summaryXlsxBytes = buildSummary;
  root.summaryXlsxFile = (specs, name) => new File([buildSummary(specs)], name, { type: XLSX_MIME });

  function studyXlsxName(h) {
    const d = new Date(h.date), p = x => String(x).padStart(2, '0'), clean = x => String(x).replace(/[^A-Za-z0-9._-]/g, '_');
    return `Capacity_${clean(h.line)}_${clean(h.style)}_${p(d.getDate())}_${p(d.getMonth() + 1)}.xlsx`;
  }
  function studyXlsxFile(h, styleOps, logo) {
    return new File([build(h, styleOps, logo)], studyXlsxName(h), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  root.studyXlsxName = studyXlsxName;
  root.studyXlsxBytes = build;
  root.studyXlsxFile = studyXlsxFile;
  if (typeof module !== 'undefined') module.exports = { build, studyXlsxFile };
})(typeof window !== 'undefined' ? window : globalThis);
