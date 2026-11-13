// Pure logic: dependency evaluation and LLD model building. No DOM here.

export function createEvaluator(content, profile) {
  const byId = Object.fromEntries(content.decisions.map((d) => [d.id, d]));
  const answers = profile.answers || {};
  const memo = {};

  const condMet = (c) => {
    if (c.all) return c.all.every(condMet);
    if (c.requirement) return c.in.includes(answers[c.requirement]);
    const r = evaluate(c.decision);
    return !!r.effective && c.in.includes(r.effective);
  };

  function evaluate(id) {
    if (memo[id]) return memo[id];
    const d = byId[id];
    memo[id] = { pending: true }; // guards against cycles (validator already rejects them)
    const inVersion = !profile.meta.vcfVersion || !d.appliesTo || d.appliesTo.includes(profile.meta.vcfVersion);
    const unmetWhen = (d.when || []).filter((c) => !condMet(c));
    const applicable = inVersion && unmetWhen.length === 0 && !profile.excluded[id];
    const options = d.options.map((o) => {
      const unmet = (o.requires || []).filter((c) => !condMet(c));
      const reasons = (o.recommendedWhen || []).filter(condMet);
      return { id: o.id, enabled: unmet.length === 0, unmet, recommended: reasons.length > 0 && unmet.length === 0, reasons };
    });
    const recommendedIds = options.filter((o) => o.recommended).map((o) => o.id);
    const chosen = profile.choices[id] || null;
    const chosenOpt = options.find((o) => o.id === chosen);
    const conflict = !!(applicable && chosenOpt && !chosenOpt.enabled);
    const effective = applicable && chosenOpt && chosenOpt.enabled ? chosen : null;
    memo[id] = { applicable, inVersion, unmetWhen, options, recommendedIds, chosen, conflict, effective, excluded: !!profile.excluded[id] };
    return memo[id];
  }

  return { evaluate, byId, condMet };
}

export function describeCond(content, c) {
  if (c.all) return c.all.map((x) => describeCond(content, x)).join(' and ');
  if (c.requirement) {
    const r = content.requirements.find((x) => x.id === c.requirement);
    const labels = c.in.map((o) => (r.options.find((x) => x.id === o) || {}).label || o);
    return `${r.id} = ${labels.join(' or ')}`;
  }
  const t = content.decisions.find((x) => x.id === c.decision);
  const labels = c.in.map((o) => (t.options.find((x) => x.id === o) || {}).label || o);
  return `${c.decision} (${t.title}) = ${labels.join(' or ')}`;
}

// Why the current choice was made, in words, for the reference sheet.
export function basisOf(content, d, r) {
  const label = (id) => (d.options.find((o) => o.id === id) || {}).label || id;
  if (!r.effective) return { basis: r.conflict ? 'Conflict' : 'Open', reason: '' };
  const opt = r.options.find((o) => o.id === r.effective);
  const why = opt.reasons.map((c) => describeCond(content, c)).join('; ');
  if (opt.recommended) return { basis: r.recommendedIds.length > 1 ? 'Recommended (one of several)' : 'Recommended', reason: why };
  if (r.recommendedIds.length) return { basis: 'Override', reason: `Recommended was: ${r.recommendedIds.map(label).join(' / ')}` };
  return { basis: r.effective === d.default ? 'Catalogue default' : 'Architect choice', reason: '' };
}

export function stats(content, profile) {
  const ev = createEvaluator(content, profile);
  let applicable = 0, decided = 0, conflicts = 0;
  for (const d of content.decisions) {
    const r = ev.evaluate(d.id);
    if (!r.applicable) continue;
    applicable++;
    if (r.effective) decided++;
    if (r.conflict) conflicts++;
  }
  return { applicable, decided, conflicts };
}

// Short customer code used in requirement IDs (e.g. ABSA, CIB). Falls back to the customer name.
export function customerCode(meta) {
  const raw = (meta.customerCode || meta.customer || 'CUST').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.slice(0, 8) || 'CUST';
}

// Builds the data model handed to both the Markdown writer and the DOCX templates.
// Generic template uses `domains`; the Broadcom VCFA template uses `area_<CODE>` / `has_<CODE>`,
// `extraAreas` and `vcfDependencies`.
export function buildModel(content, profile) {
  const { evaluate, byId } = createEvaluator(content, profile);
  const linkById = Object.fromEntries(content.links.map((l) => [l.id, l]));
  const diaById = Object.fromEntries(content.diagrams.map((d) => [d.id, d]));
  const usedLinks = new Set();
  const usedDiagrams = new Set();
  const pending = [];
  const customer = profile.meta.customer || '<Customer>';
  const code = customerCode(profile.meta);
  let n = 0;

  const domains = content.domains.map((dom) => {
    const areas = content.areas
      .filter((a) => a.domain === dom.id)
      .map((area) => {
        let seq = 0;
        const decisions = content.decisions
          .filter((d) => d.area === area.id)
          .filter((d) => evaluate(d.id).applicable)
          .map((d) => {
            const r = evaluate(d.id);
            const opt = d.options.find((o) => o.id === r.effective);
            if (!opt) pending.push({ id: d.id, title: d.title, reason: r.conflict ? 'conflicting choice' : 'not decided' });
            (d.links || []).forEach((l) => usedLinks.add(l));
            (d.diagrams || []).forEach((g) => usedDiagrams.add(g));
            n++; seq++;
            const notes = d.versionNotes && d.versionNotes[profile.meta.vcfVersion];
            const implications = opt ? (opt.implications || []) : [];
            const requirement = opt
              ? `${customer} will ${opt.statement || `use ${opt.label}.`}`
              : `TBD: ${d.question}`;
            return {
              ref: `DD-${String(n).padStart(3, '0')}`,
              reqId: `${dom.reqPrefix}-${area.code}-${code}-${String(seq).padStart(3, '0')}`,
              id: d.id,
              title: d.title,
              question: d.question,
              context: (d.context || '').trim(),
              decided: !!opt,
              decision: opt ? opt.label : 'TBD',
              requirement,
              summary: opt ? opt.summary || '' : '',
              justification: opt ? (profile.justifications[d.id] || opt.justification || '') : '',
              implications: implications.map((text) => ({ text })),
              implicationText: implications.length ? implications.map((t) => `- ${t}`).join('\n') : 'None.',
              hasImplications: implications.length > 0,
              alternatives: d.options.filter((o) => o.id !== r.effective).map((o) => ({ label: o.label })),
              note: profile.notes[d.id] || '',
              hasNote: !!profile.notes[d.id],
              versionNote: notes ? notes.trim() : '',
              hasVersionNote: !!notes,
              dependsOn: (d.dependsOn || []).map((x) => ({ id: x, title: byId[x].title })),
              links: (d.links || []).map((l) => ({ title: linkById[l].title, url: linkById[l].url })),
              hasLinks: !!(d.links && d.links.length),
              diagrams: (d.diagrams || []).map((g) => diaById[g]),
            };
          });
        return { id: area.id, code: area.code, inline: !!area.inline, title: area.title, decisions, hasDecisions: decisions.length > 0 };
      })
      .filter((a) => a.hasDecisions);
    return { id: dom.id, title: dom.title, areas, hasAreas: areas.length > 0 };
  }).filter((d) => d.hasAreas);

  const all = domains.flatMap((d) => d.areas.flatMap((a) => a.decisions));
  const today = new Date().toISOString().slice(0, 10);
  const model = {
    customer,
    customerCode: code,
    projectType: profile.meta.projectType === 'broadcom' ? 'Broadcom' : 'MBCOM',
    docTitle: profile.meta.docTitle || 'VCF and VCF Automation Low Level Design',
    docVersion: profile.meta.docVersion || '0.1',
    author: profile.meta.author || '',
    vcfVersion: profile.meta.vcfVersion || '',
    date: today,
    catalogueVersion: content.version,
    versionHistory: [{ date: today, version: profile.meta.docVersion || '0.1', author: profile.meta.author || '', contributors: '', description: 'Draft generated from VCF LLD Studio', reviewers: '' }],
    domains,
    summary: all.map((d) => ({ ref: d.ref, reqId: d.reqId, id: d.id, title: d.title, decision: d.decision })),
    pending,
    hasPending: pending.length > 0,
    references: [...usedLinks].map((l) => linkById[l]).map((l) => ({ title: l.title, url: l.url, source: l.source })),
    diagrams: [...usedDiagrams].map((g) => diaById[g]),
    glossary: content.glossary,
  };

  // ---- Broadcom VCFA template slots ----
  const vcfa = domains.find((d) => d.id === 'vcfa');
  for (const a of content.areas.filter((x) => x.domain === 'vcfa')) {
    const hit = vcfa && vcfa.areas.find((x) => x.id === a.id);
    model[`area_${a.code}`] = hit ? hit.decisions : [];
    model[`has_${a.code}`] = !!hit;
  }
  model.extraAreas = vcfa ? vcfa.areas.filter((a) => !a.inline).map((a) => ({ title: a.title, code: a.code, decisions: a.decisions })) : [];
  model.hasExtra = model.extraAreas.length > 0;
  const vcf = domains.find((d) => d.id === 'vcf');
  model.vcfDependencies = vcf ? vcf.areas.flatMap((a) => a.decisions.map((d) => ({ id: d.id, area: a.title, title: d.title, decision: d.decision, justification: d.justification }))) : [];
  model.hasVcfDependencies = model.vcfDependencies.length > 0;
  return model;
}

export function toMarkdown(m, diagramBase) {
  const L = [];
  const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  L.push(`# ${m.docTitle}`, '');
  L.push(`| | |`, `|---|---|`);
  L.push(`| Customer | ${cell(m.customer)} |`, `| Template | ${m.projectType} |`, `| VCF version | ${m.vcfVersion} |`);
  L.push(`| Document version | ${m.docVersion} |`, `| Date | ${m.date} |`);
  if (m.author) L.push(`| Author | ${cell(m.author)} |`);
  L.push(`| Catalogue version | ${m.catalogueVersion} |`, '');
  if (m.hasPending) {
    L.push('> **Open items:** ' + m.pending.map((p) => `${p.id} (${p.reason})`).join(', '), '');
  }
  L.push('## Design decision summary', '', '| Requirement ID | Catalogue ID | Decision area | Decision |', '|---|---|---|---|');
  m.summary.forEach((s) => L.push(`| ${s.reqId} | ${s.id} | ${cell(s.title)} | ${cell(s.decision)} |`));
  L.push('');
  m.domains.forEach((dom, i) => {
    L.push(`## ${i + 1}. ${dom.title}`, '');
    dom.areas.forEach((area, j) => {
      L.push(`### ${i + 1}.${j + 1} ${area.title}`, '');
      area.decisions.forEach((d) => {
        L.push(`#### ${d.reqId} — ${d.title} \`${d.id}\``, '');
        L.push(`| | |`, `|---|---|`);
        L.push(`| Design question | ${cell(d.question)} |`);
        L.push(`| Decision | **${cell(d.decision)}** |`);
        L.push(`| Design requirement | ${cell(d.requirement)} |`);
        if (d.justification) L.push(`| Justification | ${cell(d.justification)} |`);
        if (d.hasImplications) L.push(`| Implications | ${d.implications.map((x) => cell(x.text)).join('<br>')} |`);
        if (d.alternatives.length) L.push(`| Alternatives considered | ${d.alternatives.map((a) => cell(a.label)).join('; ')} |`);
        if (d.dependsOn.length) L.push(`| Depends on | ${d.dependsOn.map((x) => x.id).join(', ')} |`);
        L.push('');
        if (d.context) L.push(d.context, '');
        if (d.hasVersionNote) L.push(`> **Version note (${m.vcfVersion}):** ${d.versionNote}`, '');
        if (d.hasNote) L.push(`**Customer-specific note:** ${d.note}`, '');
        d.diagrams.forEach((g) => L.push(`![${g.title}](${diagramBase}${g.file})`, `*${g.caption || g.title}*`, ''));
        if (d.hasLinks) { L.push('References:'); d.links.forEach((l) => L.push(`- [${l.title}](${l.url})`)); L.push(''); }
      });
    });
  });
  if (m.references.length) {
    L.push('## References', '');
    m.references.forEach((r) => L.push(`- [${r.title}](${r.url}) — ${r.source}`));
    L.push('');
  }
  L.push('## Glossary', '', '| Term | Definition |', '|---|---|');
  m.glossary.forEach((g) => L.push(`| ${cell(g.term)} | ${cell(g.definition)} |`));
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Design reference sheet: everything needed to write the LLD later.
// ---------------------------------------------------------------------------
export function buildSheetData(content, profile) {
  const { evaluate } = createEvaluator(content, profile);
  const linkById = Object.fromEntries(content.links.map((l) => [l.id, l]));
  const diaById = Object.fromEntries(content.diagrams.map((d) => [d.id, d]));
  const areaById = Object.fromEntries(content.areas.map((a) => [a.id, a]));
  const domById = Object.fromEntries(content.domains.map((d) => [d.id, d]));
  const answers = profile.answers || {};
  const customer = profile.meta.customer || '<Customer>';
  const code = customerCode(profile.meta);
  const seqByArea = {};
  const linkUse = {};
  const diaUse = {};

  const decisions = content.decisions.map((d) => {
    const r = evaluate(d.id);
    const area = areaById[d.area];
    const dom = domById[d.domain];
    const opt = d.options.find((o) => o.id === r.effective);
    let status = 'Decided';
    if (!r.inVersion) status = 'Not in version';
    else if (r.excluded) status = 'Excluded';
    else if (!r.applicable) status = 'Not applicable';
    else if (r.conflict) status = 'Conflict';
    else if (!opt) status = 'Open';
    let reqId = '';
    if (r.applicable) {
      seqByArea[d.area] = (seqByArea[d.area] || 0) + 1;
      reqId = `${dom.reqPrefix}-${area.code}-${code}-${String(seqByArea[d.area]).padStart(3, '0')}`;
      (d.links || []).forEach((l) => (linkUse[l] ||= []).push(reqId));
      (d.diagrams || []).forEach((g) => (diaUse[g] ||= []).push(reqId));
    }
    const { basis, reason } = r.applicable ? basisOf(content, d, r) : { basis: '', reason: '' };
    const naReason = !r.inVersion ? `Applies to VCF ${(d.appliesTo || []).join(', ')}`
      : r.excluded ? 'Excluded by architect'
      : !r.applicable ? `Only when ${r.unmetWhen.map((c) => describeCond(content, c)).join('; ')}` : '';
    const recommended = r.recommendedIds.map((id) => d.options.find((o) => o.id === id).label);
    return {
      reqId,
      id: d.id,
      domain: dom.title,
      area: area.title,
      title: d.title,
      question: d.question,
      status,
      selected: opt ? opt.label : (r.conflict ? `${d.options.find((o) => o.id === r.chosen).label} (prerequisites not met)` : ''),
      recommended: recommended.join(' / '),
      basis,
      basisDetail: reason || naReason,
      requirement: opt ? `${customer} will ${opt.statement || `use ${opt.label}.`}` : '',
      justification: opt ? (profile.justifications[d.id] || opt.justification || '') : '',
      implications: opt ? (opt.implications || []).map((t) => `• ${t}`).join('\n') : '',
      alternatives: d.options.filter((o) => o.id !== r.effective).map((o) => o.label).join('\n'),
      dependsOn: (d.dependsOn || []).join(', '),
      context: (d.context || '').trim(),
      note: profile.notes[d.id] || '',
      versionNote: (d.versionNotes && d.versionNotes[profile.meta.vcfVersion] || '').trim(),
      verify: d.verify || '',
      contentStatus: d.status || '',
      references: (d.links || []).map((l) => linkById[l]).map((l) => ({ title: l.title, url: l.url })),
      diagrams: (d.diagrams || []).map((g) => diaById[g].title).join('\n'),
    };
  });

  const reqRows = content.requirements.map((q) => {
    const g = content.reqGroups.find((x) => x.id === q.group);
    const a = q.options.find((o) => o.id === answers[q.id]);
    return { id: q.id, group: g ? g.title : q.group, question: q.question, answer: a ? a.label : '', note: (profile.answerNotes || {})[q.id] || '' };
  });

  const active = decisions.filter((d) => d.reqId);
  const openItems = [
    ...reqRows.filter((q) => !q.answer).map((q) => ({ type: 'Requirement unanswered', id: q.id, item: q.question, detail: '' })),
    ...active.filter((d) => d.status === 'Open').map((d) => ({ type: 'Decision open', id: d.reqId, item: d.title, detail: d.recommended ? `Recommended: ${d.recommended}` : '' })),
    ...active.filter((d) => d.status === 'Conflict').map((d) => ({ type: 'Decision conflict', id: d.reqId, item: d.title, detail: d.selected })),
    ...active.filter((d) => d.basis === 'Override').map((d) => ({ type: 'Override to justify', id: d.reqId, item: d.title, detail: d.basisDetail })),
    ...active.filter((d) => d.verify).map((d) => ({ type: 'Verify against TechDocs', id: d.reqId, item: d.title, detail: d.verify })),
  ];

  const references = content.links.filter((l) => linkUse[l.id]).map((l) => ({
    id: l.id, title: l.title, url: l.url, source: l.source, product: l.product, versions: (l.versions || []).join(', '), usedBy: linkUse[l.id].join(', '),
  }));
  const diagrams = content.diagrams.filter((g) => diaUse[g.id]).map((g) => ({ id: g.id, title: g.title, file: g.file, caption: g.caption || '', source: g.source || '', usedBy: diaUse[g.id].join(', ') }));

  const count = (st) => active.filter((d) => d.status === st).length;
  return {
    meta: {
      customer, code, projectType: profile.meta.projectType === 'broadcom' ? 'Broadcom' : 'MBCOM',
      vcfVersion: profile.meta.vcfVersion || '', author: profile.meta.author || '',
      generated: new Date().toISOString().slice(0, 16).replace('T', ' '), catalogueVersion: content.version,
    },
    stats: {
      requirements: reqRows.length, answered: reqRows.filter((q) => q.answer).length,
      applicable: active.length, decided: count('Decided'), open: count('Open'), conflicts: count('Conflict'),
      overrides: active.filter((d) => d.basis === 'Override').length,
    },
    requirements: reqRows, decisions, openItems, references, diagrams, glossary: content.glossary,
  };
}
