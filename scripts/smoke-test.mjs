// Renders a sample LLD (MD + DOCX) from the built content with a fake profile.
// Run after `npm run build`: node scripts/smoke-test.mjs  -> writes to ./out/
import fs from 'node:fs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { buildModel, toMarkdown, stats } from '../site/src/model.js';

const content = JSON.parse(fs.readFileSync('site/data/content.json', 'utf8'));
const profile = {
  meta: { customer: 'Sample Co', projectType: 'mbcom', vcfVersion: '9.0', docVersion: '0.1', author: 'Architect' },
  choices: {
    'VCF-FLT-01': 'multiple', 'VCF-DEP-01': 'site-ha', 'VCF-INS-01': 'multiple', 'VCF-IAM-01': 'embedded', // embedded conflicts with multiple instances
    'VCF-WLD-01': 'dedicated', 'VCF-NET-01': 'nsx-vpc', 'VCF-SUP-01': 'enabled',
    'VCFA-DEP-01': 'ha', 'VCFA-TEN-01': 'both', 'VCFA-ORG-01': 'per-bu', 'VCFA-REG-01': 'region-per-site',
    'VCFA-CNT-01': 'templates',
  },
  notes: { 'VCFA-TEN-01': 'Legacy BU stays on VM Apps for phase 1.' },
  justifications: {}, excluded: {},
};

const s = stats(content, profile);
console.log('stats', s);
if (s.conflicts !== 1) throw new Error('expected exactly one conflict (VCF-IAM-01 embedded vs multiple instances)');

const m = buildModel(content, profile);
fs.mkdirSync('out', { recursive: true });
fs.writeFileSync('out/sample-lld.md', toMarkdown(m, 'diagrams/'));
const zip = new PizZip(fs.readFileSync('templates/generic-lld-template.docx'));
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
doc.render(m);
fs.writeFileSync('out/sample-lld.docx', doc.getZip().generate({ type: 'nodebuffer' }));
console.log('pending', m.pending.map((p) => `${p.id}:${p.reason}`).join(', '));
console.log('wrote out/sample-lld.md and out/sample-lld.docx');
