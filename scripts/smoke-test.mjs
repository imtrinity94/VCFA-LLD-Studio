// Renders a sample design reference sheet (.xlsx) from the built content with a fake profile.
// Run after `npm run build`: node scripts/smoke-test.mjs  -> writes out/sample-reference-sheet.xlsx
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { stats, buildSheetData } from '../site/src/model.js';
import { buildWorkbook } from '../site/src/sheet.js';

const content = JSON.parse(fs.readFileSync('site/data/content.json', 'utf8'));
const profile = {
  meta: { customer: 'Sample Co', customerCode: 'SMPL', projectType: 'broadcom', vcfVersion: '9.1', docVersion: '0.1', author: 'Architect' },
  answers: {
    'RQ-SITES': 'one', 'RQ-ISOLATION': 'no', 'RQ-AVAIL': 'high', 'RQ-TENANTS': 'single', 'RQ-MIGRATION': 'yes',
    'RQ-K8S': 'no', 'RQ-SELFNET': 'no', 'RQ-PATH': 'greenfield', 'RQ-SCALE': 'medium', 'RQ-VCFA-COUNT': 'one',
    'RQ-VRO': 'yes', 'RQ-ORG-WORKFLOWS': 'no', 'RQ-NETSEG': 'no', 'RQ-EXTLB': 'no', 'RQ-IDP': 'same',
    // RQ-XAAS intentionally unanswered
  },
  choices: {}, notes: { 'VCFA-TEN-01': 'Phase 1 focuses on migrating existing 8.x content.' }, justifications: {}, excluded: {},
};

// pretend the architect clicked "Apply recommendations", then overrode one decision
const { createEvaluator } = await import('../site/src/model.js');
for (let pass = 0; pass < 5; pass++) {
  const ev = createEvaluator(content, profile);
  for (const d of content.decisions) {
    const r = ev.evaluate(d.id);
    if (r.applicable && !profile.choices[d.id] && r.recommendedIds.length) profile.choices[d.id] = r.recommendedIds[0];
  }
}
profile.choices['VCFA-LB-01'] = 'external'; // override (recommended: native)

const s = stats(content, profile);
console.log('stats', s);
const data = buildSheetData(content, profile);
console.log('sheet stats', data.stats, 'open items', data.openItems.length);
if (data.stats.overrides !== 1) throw new Error('expected one override');
if (!data.requirements.some((q) => q.id === 'RQ-XAAS' && !q.answer)) throw new Error('RQ-XAAS should be unanswered');
const wb = await buildWorkbook(ExcelJS, data);
fs.mkdirSync('out', { recursive: true });
await wb.xlsx.writeFile('out/sample-reference-sheet.xlsx');
for (const d of data.decisions) console.log(`${(d.reqId || '-').padEnd(24)} ${d.status.padEnd(15)} ${(d.basis || '').padEnd(28)} ${d.selected}`);
console.log('wrote out/sample-reference-sheet.xlsx');
