// Pure logic: dependency evaluation and LLD model building. No DOM here.

export function createEvaluator(content, profile) {
  const byId = Object.fromEntries(content.decisions.map((d) => [d.id, d]));
  const memo = {};

  const condMet = (c) => {
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
      const recommended = (o.recommendedWhen || []).some(condMet);
      return { id: o.id, enabled: unmet.length === 0, unmet, recommended };
    });
    const chosen = profile.choices[id] || null;
    const chosenOpt = options.find((o) => o.id === chosen);
    const conflict = !!(applicable && chosenOpt && !chosenOpt.enabled);
    const effective = applicable && chosenOpt && chosenOpt.enabled ? chosen : null;
    memo[id] = { applicable, inVersion, unmetWhen, options, chosen, conflict, effective, excluded: !!profile.excluded[id] };
    return memo[id];
  }

  return { evaluate, byId };
}

export function describeCond(byId, c) {
  const t = byId[c.decision];
  const labels = c.in.map((o) => (t.options.find((x) => x.id === o) || {}).label || o);
  return `${c.decision} (${t.title}) = ${labels.join(' or ')}`;
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

// Builds the data model handed to both the Markdown writer and the DOCX template.
export function buildModel(content, profile) {
  const { evaluate, byId } = createEvaluator(content, profile);
  const linkById = Object.fromEntries(content.links.map((l) => [l.id, l]));
  const diaById = Object.fromEntries(content.diagrams.map((d) => [d.id, d]));
  const usedLinks = new Set();
  const usedDiagrams = new Set();
  const pending = [];
  let n = 0;

  const domains = content.domains.map((dom) => {
    const areas = content.areas
      .filter((a) => a.domain === dom.id)
      .map((area) => {
        const decisions = content.decisions
          .filter((d) => d.area === area.id)
          .filter((d) => evaluate(d.id).applicable)
          .map((d) => {
            const r = evaluate(d.id);
            const opt = d.options.find((o) => o.id === r.effective);
            if (!opt) pending.push({ id: d.id, title: d.title, reason: r.conflict ? 'conflicting choice' : 'not decided' });
            (d.links || []).forEach((l) => usedLinks.add(l));
            (d.diagrams || []).forEach((g) => usedDiagrams.add(g));
            n++;
            const notes = d.versionNotes && d.versionNotes[profile.meta.vcfVersion];
            return {
              ref: `DD-${String(n).padStart(3, '0')}`,
              id: d.id,
              title: d.title,
              question: d.question,
              context: (d.context || '').trim(),
              decided: !!opt,
              decision: opt ? opt.label : 'TBD',
              summary: opt ? opt.summary || '' : '',
              justification: opt ? (profile.justifications[d.id] || opt.justification || '') : '',
              implications: opt ? (opt.implications || []).map((text) => ({ text })) : [],
              hasImplications: !!(opt && opt.implications && opt.implications.length),
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
        return { id: area.id, title: area.title, decisions, hasDecisions: decisions.length > 0 };
      })
      .filter((a) => a.hasDecisions);
    return { id: dom.id, title: dom.title, areas, hasAreas: areas.length > 0 };
  }).filter((d) => d.hasAreas);

  const all = domains.flatMap((d) => d.areas.flatMap((a) => a.decisions));
  const today = new Date().toISOString().slice(0, 10);
  return {
    customer: profile.meta.customer || '<Customer>',
    projectType: profile.meta.projectType === 'broadcom' ? 'Broadcom' : 'MBCOM',
    docTitle: profile.meta.docTitle || 'VCF and VCF Automation Low Level Design',
    docVersion: profile.meta.docVersion || '0.1',
    author: profile.meta.author || '',
    vcfVersion: profile.meta.vcfVersion || '',
    date: today,
    catalogueVersion: content.version,
    domains,
    summary: all.map((d) => ({ ref: d.ref, id: d.id, title: d.title, decision: d.decision })),
    pending,
    hasPending: pending.length > 0,
    references: [...usedLinks].map((l) => linkById[l]).map((l) => ({ title: l.title, url: l.url, source: l.source })),
    diagrams: [...usedDiagrams].map((g) => diaById[g]),
    glossary: content.glossary,
  };
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
  L.push('## Design decision summary', '', '| Ref | ID | Decision area | Decision |', '|---|---|---|---|');
  m.summary.forEach((s) => L.push(`| ${s.ref} | ${s.id} | ${cell(s.title)} | ${cell(s.decision)} |`));
  L.push('');
  m.domains.forEach((dom, i) => {
    L.push(`## ${i + 1}. ${dom.title}`, '');
    dom.areas.forEach((area, j) => {
      L.push(`### ${i + 1}.${j + 1} ${area.title}`, '');
      area.decisions.forEach((d) => {
        L.push(`#### ${d.ref} — ${d.title} \`${d.id}\``, '');
        L.push(`| | |`, `|---|---|`);
        L.push(`| Design question | ${cell(d.question)} |`);
        L.push(`| Decision | **${cell(d.decision)}** |`);
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
