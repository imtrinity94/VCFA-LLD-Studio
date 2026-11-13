// Writes the design reference sheet as an Excel workbook.
// ExcelJS is passed in so the same code runs in the browser bundle and in Node (smoke test).

const NAVY = 'FF1F3A5F';
const SOFT = 'FFEEF2F6';
const STATUS_FILL = {
  Decided: 'FFE7F3EC', Open: 'FFFDF4E3', Conflict: 'FFFBECEB',
  'Not applicable': 'FFF1F3F5', Excluded: 'FFF1F3F5', 'Not in version': 'FFF1F3F5',
};
const BASIS_FILL = { Override: 'FFFDF4E3', Conflict: 'FFFBECEB' };

function table(ws, columns, rows, opts = {}) {
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 20 }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 22;
  rows.forEach((r) => ws.addRow(r));
  ws.eachRow((row, i) => {
    if (i === 1) return;
    row.alignment = { vertical: 'top', wrapText: true };
    if (opts.rowStyle) opts.rowStyle(row, rows[i - 2]);
  });
  ws.views = [{ state: 'frozen', xSplit: opts.freezeCols || 0, ySplit: 1 }];
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

export async function buildWorkbook(ExcelJS, data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = data.meta.author || 'VCFA LLD Studio';
  wb.created = new Date();
  const m = data.meta;
  const s = data.stats;

  // ---- Overview ----
  const ov = wb.addWorksheet('Overview', { properties: { tabColor: { argb: NAVY } } });
  ov.columns = [{ width: 30 }, { width: 70 }];
  ov.addRow(['Design Reference Sheet']).font = { bold: true, size: 16, color: { argb: NAVY } };
  ov.addRow(['VCF and VCF Automation design selection, input for the LLD']).font = { italic: true, color: { argb: 'FF7A8794' } };
  ov.addRow([]);
  const kv = [
    ['Customer', m.customer], ['Customer code (requirement IDs)', m.code], ['LLD template', m.projectType],
    ['VCF version', m.vcfVersion], ['Prepared by', m.author], ['Generated', m.generated], ['Catalogue version', m.catalogueVersion],
    [], ['Requirements answered', `${s.answered} of ${s.requirements}`],
    ['Decisions in scope', s.applicable], ['Decided', s.decided], ['Open', s.open], ['Conflicts', s.conflicts], ['Overrides of recommendation', s.overrides],
    ['Open items (see sheet)', data.openItems.length],
  ];
  kv.forEach((r) => {
    const row = ov.addRow(r);
    if (r.length) { row.getCell(1).font = { bold: true }; row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } }; }
    row.getCell(2).alignment = { horizontal: 'left' };
  });
  ov.addRow([]);
  ov.addRow(['How to read this workbook']).font = { bold: true, color: { argb: NAVY } };
  [
    ['Requirements', 'Customer context captured in workshops. Answers drive the recommended option for each decision.'],
    ['Design Decisions', 'One row per decision, VCF first, then VCF Automation. "Basis" shows whether the choice follows the recommendation, overrides it, or has no recommendation.'],
    ['Open Items', 'Unanswered requirements, open or conflicting decisions, overrides to justify, and items to verify against TechDocs.'],
    ['References', 'TechDocs, KB and blog links cited by the selected design, with the requirement IDs that use them.'],
    ['Diagrams', 'Reference diagrams to reuse in the LLD.'],
    ['Status: draft', 'Catalogue content marked draft has not been peer-reviewed; check it before it goes into a customer LLD.'],
  ].forEach((r) => { const row = ov.addRow(r); row.alignment = { wrapText: true, vertical: 'top' }; row.getCell(1).font = { bold: true }; });

  // ---- Requirements ----
  table(wb.addWorksheet('Requirements'), [
    { header: 'ID', key: 'id', width: 18 }, { header: 'Group', key: 'group', width: 24 },
    { header: 'Question', key: 'question', width: 70 }, { header: 'Answer', key: 'answer', width: 40 }, { header: 'Notes', key: 'note', width: 40 },
  ], data.requirements, {
    rowStyle: (row, r) => { if (!r.answer) row.getCell('answer').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF4E3' } }; },
  });

  // ---- Design Decisions ----
  table(wb.addWorksheet('Design Decisions'), [
    { header: 'Requirement ID', key: 'reqId', width: 24 },
    { header: 'Catalogue ID', key: 'id', width: 14 },
    { header: 'Domain', key: 'domain', width: 18 },
    { header: 'LLD area', key: 'area', width: 22 },
    { header: 'Decision', key: 'title', width: 30 },
    { header: 'Design question', key: 'question', width: 40 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Selected option', key: 'selected', width: 30 },
    { header: 'Recommended', key: 'recommended', width: 28 },
    { header: 'Basis', key: 'basis', width: 16 },
    { header: 'Basis detail', key: 'basisDetail', width: 40 },
    { header: 'Design requirement (LLD text)', key: 'requirement', width: 50 },
    { header: 'Justification', key: 'justification', width: 45 },
    { header: 'Implications', key: 'implications', width: 45 },
    { header: 'Alternatives considered', key: 'alternatives', width: 30 },
    { header: 'Depends on', key: 'dependsOn', width: 22 },
    { header: 'Background / context', key: 'context', width: 50 },
    { header: 'Customer note', key: 'note', width: 35 },
    { header: 'Version note', key: 'versionNote', width: 35 },
    { header: 'Verify', key: 'verify', width: 35 },
    { header: 'References', key: 'refText', width: 50 },
    { header: 'Diagrams', key: 'diagrams', width: 25 },
    { header: 'Content status', key: 'contentStatus', width: 14 },
  ], data.decisions.map((d) => ({ ...d, refText: d.references.map((r) => `${r.title}\n${r.url}`).join('\n\n') })), {
    freezeCols: 2,
    rowStyle: (row, d) => {
      const f = STATUS_FILL[d.status];
      if (f) row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: f } };
      if (BASIS_FILL[d.basis]) row.getCell('basis').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BASIS_FILL[d.basis] } };
      if (!d.reqId) row.font = { color: { argb: 'FF7A8794' } };
    },
  });

  // ---- Open Items ----
  table(wb.addWorksheet('Open Items'), [
    { header: 'Type', key: 'type', width: 24 }, { header: 'ID', key: 'id', width: 24 },
    { header: 'Item', key: 'item', width: 60 }, { header: 'Detail', key: 'detail', width: 60 },
    { header: 'Owner', key: 'owner', width: 18 }, { header: 'Resolution', key: 'resolution', width: 40 },
  ], data.openItems);

  // ---- References ----
  const refWs = wb.addWorksheet('References');
  table(refWs, [
    { header: 'Title', key: 'title', width: 60 }, { header: 'URL', key: 'url', width: 60 },
    { header: 'Source', key: 'source', width: 12 }, { header: 'Product', key: 'product', width: 10 },
    { header: 'Versions', key: 'versions', width: 12 }, { header: 'Used by', key: 'usedBy', width: 40 },
  ], data.references);
  refWs.eachRow((row, i) => {
    if (i === 1) return;
    const c = row.getCell('url');
    c.value = { text: data.references[i - 2].url, hyperlink: data.references[i - 2].url };
    c.font = { color: { argb: 'FF2F5B8A' }, underline: true };
  });

  // ---- Diagrams ----
  table(wb.addWorksheet('Diagrams'), [
    { header: 'ID', key: 'id', width: 18 }, { header: 'Title', key: 'title', width: 45 }, { header: 'File (repo content/diagrams)', key: 'file', width: 28 },
    { header: 'Caption', key: 'caption', width: 50 }, { header: 'Source', key: 'source', width: 30 }, { header: 'Used by', key: 'usedBy', width: 40 },
  ], data.diagrams);

  // ---- Glossary ----
  table(wb.addWorksheet('Glossary'), [{ header: 'Term', key: 'term', width: 28 }, { header: 'Definition', key: 'definition', width: 90 }], data.glossary);

  return wb;
}
