// Compiles content/*.yaml into site/data/content.json and validates the catalogue.
// Usage: node scripts/build-content.mjs [--check]   (--check = validate only, write nothing)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(root, 'content');
const outDir = path.join(root, 'site', 'data');
const checkOnly = process.argv.includes('--check');

const errors = [];
const warnings = [];
const load = (p) => yaml.load(fs.readFileSync(p, 'utf8'));

const { domains, areas } = load(path.join(contentDir, 'areas.yaml'));
const links = load(path.join(contentDir, 'links.yaml')) || [];
const diagrams = load(path.join(contentDir, 'diagrams.yaml')) || [];
const glossary = load(path.join(contentDir, 'glossary.yaml')) || [];
const reqDoc = load(path.join(contentDir, 'requirements.yaml')) || { groups: [], requirements: [] };
const reqGroups = reqDoc.groups || [];
const requirements = reqDoc.requirements || [];
const reqById = {};
for (const r of requirements) {
  if (reqById[r.id]) errors.push(`requirements: duplicate id ${r.id}`);
  reqById[r.id] = r;
  if (!reqGroups.some((g) => g.id === r.group)) errors.push(`requirements: ${r.id} has unknown group ${r.group}`);
  if (!Array.isArray(r.options) || r.options.length < 2) errors.push(`requirements: ${r.id} needs at least two options`);
}

const domainIds = domains.map((d) => d.id);
const areaById = Object.fromEntries(areas.map((a) => [a.id, a]));
const codes = new Set();
for (const a of areas) {
  if (!/^[A-Z][A-Z0-9]{1,5}$/.test(a.code || '')) errors.push(`areas: ${a.id} needs a code of 2-6 capitals/digits`);
  const k = `${a.domain}:${a.code}`;
  if (codes.has(k)) errors.push(`areas: duplicate code ${a.code} in domain ${a.domain}`);
  codes.add(k);
}
for (const d of domains) if (!d.reqPrefix) errors.push(`domains: ${d.id} needs reqPrefix`);
const linkIds = new Set();
for (const l of links) {
  if (linkIds.has(l.id)) errors.push(`links: duplicate id ${l.id}`);
  linkIds.add(l.id);
  if (!/^https?:\/\//.test(l.url || '')) errors.push(`links: ${l.id} has no valid url`);
}
const diagramIds = new Set(diagrams.map((d) => d.id));
for (const d of diagrams) {
  if (!fs.existsSync(path.join(contentDir, 'diagrams', d.file))) errors.push(`diagrams: file missing for ${d.id} (${d.file})`);
}

// ---- load decisions: content/decisions/<domain>/*.yaml ----
const decisions = [];
for (const dom of domainIds) {
  const dir = path.join(contentDir, 'decisions', dom);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x)).sort()) {
    const d = load(path.join(dir, f));
    d.domain = dom;
    d._file = `content/decisions/${dom}/${f}`;
    decisions.push(d);
  }
}
const byId = Object.fromEntries(decisions.map((d) => [d.id, d]));

// Flattens { all: [...] } groups into plain conditions.
const flat = (conds) => (conds || []).flatMap((c) => (c.all ? flat(c.all) : [c]));

const checkConds = (owner, label, conds) => {
  for (const c of flat(conds)) {
    if (c.requirement) {
      const r = reqById[c.requirement];
      if (!r) { errors.push(`${owner}: ${label} refers to unknown requirement ${c.requirement}`); continue; }
      for (const o of c.in || []) if (!r.options.some((x) => x.id === o)) errors.push(`${owner}: ${label} refers to unknown answer ${c.requirement}.${o}`);
      continue;
    }
    const target = byId[c.decision];
    if (!target) { errors.push(`${owner}: ${label} refers to unknown decision ${c.decision}`); continue; }
    for (const o of c.in || []) {
      if (!target.options.some((x) => x.id === o)) errors.push(`${owner}: ${label} refers to unknown option ${c.decision}.${o}`);
    }
    // VCF must not depend on VCFA: domains are ordered and later domains build on earlier ones.
    const ownerDom = byId[owner.split('.')[0]].domain;
    if (domainIds.indexOf(target.domain) > domainIds.indexOf(ownerDom)) {
      errors.push(`${owner}: ${label} points "forward" to ${target.domain} decision ${c.decision}; earlier domains must not depend on later ones`);
    }
  }
};

const seen = new Set();
for (const d of decisions) {
  const where = `${d.id} (${d._file})`;
  if (seen.has(d.id)) errors.push(`duplicate decision id ${d.id}`);
  seen.add(d.id);
  if (path.basename(d._file).replace(/\.ya?ml$/, '') !== d.id) warnings.push(`${where}: file name should match id`);
  if (!areaById[d.area]) errors.push(`${where}: unknown area ${d.area}`);
  else if (areaById[d.area].domain !== d.domain) errors.push(`${where}: area ${d.area} belongs to domain ${areaById[d.area].domain}`);
  if (!d.title || !d.question) errors.push(`${where}: title and question are required`);
  if (!Array.isArray(d.options) || d.options.length < 2) errors.push(`${where}: needs at least two options`);
  const optIds = new Set();
  for (const o of d.options || []) {
    if (optIds.has(o.id)) errors.push(`${where}: duplicate option ${o.id}`);
    optIds.add(o.id);
    if (!o.justification) warnings.push(`${where}: option ${o.id} has no justification text`);
  }
  if (d.default && !optIds.has(d.default)) errors.push(`${where}: default ${d.default} is not an option`);
  for (const l of d.links || []) if (!linkIds.has(l)) errors.push(`${where}: unknown link ${l}`);
  for (const g of d.diagrams || []) if (!diagramIds.has(g)) errors.push(`${where}: unknown diagram ${g}`);
}
// conditions are checked after all ids are known
for (const d of decisions) {
  checkConds(d.id, 'when', d.when);
  for (const o of d.options || []) {
    checkConds(`${d.id}.${o.id}`, 'requires', o.requires);
    checkConds(`${d.id}.${o.id}`, 'recommendedWhen', o.recommendedWhen);
  }
}

// ---- dependency graph + cycle check ----
const deps = {};
for (const d of decisions) {
  const s = new Set();
  for (const c of flat(d.when)) if (c.decision) s.add(c.decision);
  for (const o of d.options || []) for (const c of flat([...(o.requires || []), ...(o.recommendedWhen || [])])) if (c.decision) s.add(c.decision);
  s.delete(d.id);
  deps[d.id] = [...s];
}
const state = {};
const visit = (id, trail) => {
  if (state[id] === 'done') return;
  if (state[id] === 'active') { errors.push(`dependency cycle: ${[...trail, id].join(' -> ')}`); return; }
  state[id] = 'active';
  for (const n of deps[id] || []) if (byId[n]) visit(n, [...trail, id]);
  state[id] = 'done';
};
decisions.forEach((d) => visit(d.id, []));
const dependents = {};
for (const [id, list] of Object.entries(deps)) for (const n of list) (dependents[n] ||= []).push(id);

const usedReq = new Set();
for (const d of decisions) for (const o of d.options || []) for (const c of flat([...(o.requires || []), ...(o.recommendedWhen || [])])) if (c.requirement) usedReq.add(c.requirement);
for (const r of requirements) if (!usedReq.has(r.id)) warnings.push(`requirements: ${r.id} is not used by any decision`);

// ---- report ----
warnings.forEach((w) => console.warn('warn ', w));
if (errors.length) {
  errors.forEach((e) => console.error('error', e));
  console.error(`\n${errors.length} error(s). Content not built.`);
  process.exit(1);
}
console.log(`ok   ${requirements.length} requirements, ${decisions.length} decisions, ${links.length} links, ${diagrams.length} diagrams, ${glossary.length} glossary terms`);
if (checkOnly) process.exit(0);

// ---- write ----
const areaOrder = Object.fromEntries(areas.map((a, i) => [a.id, i]));
decisions.sort((a, b) => areaOrder[a.area] - areaOrder[b.area] || (a.order ?? 99) - (b.order ?? 99) || a.id.localeCompare(b.id));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const out = {
  version: pkg.version,
  builtAt: new Date().toISOString(),
  domains, areas, links, diagrams, glossary, reqGroups, requirements,
  decisions: decisions.map(({ _file, ...d }) => ({ ...d, file: _file, dependsOn: deps[d.id], dependents: dependents[d.id] || [] })),
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'content.json'), JSON.stringify(out, null, 1));
const diaOut = path.join(root, 'site', 'diagrams');
fs.mkdirSync(diaOut, { recursive: true });
for (const d of diagrams) fs.copyFileSync(path.join(contentDir, 'diagrams', d.file), path.join(diaOut, d.file));
const tplOut = path.join(root, 'site', 'templates');
fs.mkdirSync(tplOut, { recursive: true });
fs.copyFileSync(path.join(root, 'templates', 'generic-lld-template.docx'), path.join(tplOut, 'generic-lld-template.docx'));
console.log('wrote site/data/content.json, site/diagrams/, site/templates/');
