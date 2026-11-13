import ExcelJS from 'exceljs/dist/exceljs.min.js';
import { createEvaluator, describeCond, stats, buildSheetData, customerCode } from './model.js';
import { buildWorkbook } from './sheet.js';

const STORE_KEY = 'vcf-lld-studio.profile.v1';
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let content;
let profile;
let view = 'requirements';
let libFilter = { q: '', product: '', source: '' };

const blankProfile = () => ({
  meta: { customer: '', customerCode: '', projectType: 'broadcom', vcfVersion: '9.1', author: '' },
  answers: {}, answerNotes: {}, choices: {}, notes: {}, justifications: {}, excluded: {},
});
const normalise = (p) => {
  const b = blankProfile();
  return { ...b, ...p, meta: { ...b.meta, ...(p.meta || {}) }, answers: p.answers || {}, answerNotes: p.answerNotes || {} };
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};
const save = () => store.set(STORE_KEY, JSON.stringify(profile));

function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const slug = (s) => (s || 'customer').trim().replace(/[^\w.-]+/g, '_');
const toast = (msg, kind = '') => {
  const t = $('#toast'); t.textContent = msg; t.className = `toast show ${kind}`;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = 'toast'), 3200);
};
const keepScroll = (fn) => { const y = scrollY; fn(); scrollTo(0, y); };

// ---------------- rendering ----------------
function render() {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  renderMeta();
  const main = $('#main');
  const pages = { requirements: renderRequirements, design: renderDesign, library: renderLibrary, diagrams: renderDiagrams, glossary: renderGlossary, about: renderAbout };
  main.innerHTML = pages[view]();
}

function renderMeta() {
  const s = stats(content, profile);
  const answered = content.requirements.filter((q) => profile.answers[q.id]).length;
  $('#progress').innerHTML = `Requirements <b>${answered}</b>/${content.requirements.length} · Decisions <b>${s.decided}</b>/${s.applicable}`
    + (s.conflicts ? ` · <span class="bad">${s.conflicts} conflict${s.conflicts > 1 ? 's' : ''}</span>` : '');
  const m = profile.meta;
  for (const k of ['customer', 'customerCode', 'projectType', 'vcfVersion', 'author']) {
    const el = $(`#meta-${k}`); if (el && document.activeElement !== el) el.value = m[k] || '';
  }
  $('#meta-customerCode').placeholder = customerCode(m);
}

function renderRequirements() {
  const used = {};
  for (const d of content.decisions) for (const o of d.options) {
    const walk = (cs) => (cs || []).forEach((c) => (c.all ? walk(c.all) : c.requirement && (used[c.requirement] ||= new Set()).add(d.id)));
    walk(o.recommendedWhen); walk(o.requires);
  }
  const groups = content.reqGroups.map((g) => {
    const qs = content.requirements.filter((q) => q.group === g.id).map((q) => {
      const a = profile.answers[q.id];
      return `<article class="card req ${a ? '' : 'unanswered'}" id="rq-${q.id}">
        <header><div><code>${q.id}</code> ${a ? '<span class="pill ok">answered</span>' : '<span class="pill">open</span>'}
          <span class="drives">drives ${[...(used[q.id] || [])].map((x) => `<span class="chip soft">${x}</span>`).join('')}</span></div>
          <h4>${esc(q.question)}</h4>${q.help ? `<p class="q">${esc(q.help)}</p>` : ''}</header>
        <div class="seg">${q.options.map((o) => `<label class="segopt ${a === o.id ? 'sel' : ''}">
          <input type="radio" name="${q.id}" value="${o.id}" ${a === o.id ? 'checked' : ''} data-answer="${q.id}"><span>${esc(o.label)}</span></label>`).join('')}
          ${a ? `<button class="link" data-act="clear-answer" data-id="${q.id}">clear</button>` : ''}</div>
        <input class="rqnote" data-anote="${q.id}" placeholder="Notes from the workshop (local only)" value="${esc(profile.answerNotes[q.id] || '')}">
      </article>`;
    }).join('');
    return `<section class="area"><h3>${esc(g.title)}</h3>${qs}</section>`;
  }).join('');
  return `<div class="page narrow"><div class="pagehead"><div><h2>Customer requirements</h2>
    <p class="muted">Answer what you learned in the workshops. Each answer marks the recommended option on the decisions it drives. Unanswered questions show up as open items on the reference sheet.</p></div>
    <button class="primary" data-view="design">Continue to design →</button></div>${groups}</div>`;
}

function renderDesign() {
  const ev = createEvaluator(content, profile);
  const nav = content.domains.map((dom) => {
    const items = content.areas.filter((a) => a.domain === dom.id).map((a) => {
      const ds = content.decisions.filter((d) => d.area === a.id);
      const app = ds.filter((d) => ev.evaluate(d.id).applicable);
      const done = app.filter((d) => ev.evaluate(d.id).effective).length;
      const bad = app.some((d) => ev.evaluate(d.id).conflict);
      return `<li><a href="#${a.id}"><span>${esc(a.title)}</span><span class="count ${bad ? 'bad' : done === app.length && app.length ? 'ok' : ''}">${done}/${app.length}</span></a></li>`;
    }).join('');
    return `<div class="navgroup"><h4>${esc(dom.title)}</h4><ul>${items}</ul></div>`;
  }).join('');

  const body = content.domains.map((dom) => {
    const areas = content.areas.filter((a) => a.domain === dom.id).map((a) => {
      const cards = content.decisions.filter((d) => d.area === a.id).map((d) => renderDecision(d, ev)).join('');
      return cards ? `<section class="area" id="${a.id}"><h3>${esc(a.title)} <small>${a.code}</small></h3>${cards}</section>` : '';
    }).join('');
    return `<h2 class="domain">${esc(dom.title)}</h2>${areas}`;
  }).join('');

  return `<div class="design"><nav class="sidenav">${nav}
      <div class="navactions">
        <button data-act="apply-recs" class="ghost">Apply recommendations to open decisions</button>
        <button data-act="defaults" class="ghost">Fill remaining with defaults</button>
        <button data-act="reset" class="ghost danger">Clear all choices</button>
      </div></nav>
    <div class="decisions">${body}</div></div>`;
}

function renderDecision(d, ev) {
  const r = ev.evaluate(d.id);
  const deps = (d.dependsOn || []).map((x) => `<a href="#dd-${x}" class="chip">${x}</a>`).join('');
  const affects = (d.dependents || []).map((x) => `<a href="#dd-${x}" class="chip soft">${x}</a>`).join('');
  const chosenOpt = r.options.find((o) => o.id === r.effective);
  const override = chosenOpt && !chosenOpt.recommended && r.recommendedIds.length;
  const status = !r.inVersion ? `<span class="pill muted">not in ${esc(profile.meta.vcfVersion)}</span>`
    : r.excluded ? '<span class="pill muted">excluded</span>'
    : !r.applicable ? '<span class="pill muted">not applicable</span>'
    : r.conflict ? '<span class="pill bad">conflict</span>'
    : override ? '<span class="pill warn">override</span>'
    : r.effective ? '<span class="pill ok">decided</span>' : '<span class="pill">open</span>';
  const draft = d.status === 'draft' ? '<span class="pill draft" title="Seed content — verify before customer use">draft</span>' : '';

  let inner = '';
  if (!r.inVersion) {
    inner = `<p class="muted">Applies to VCF ${esc((d.appliesTo || []).join(', '))}.</p>`;
  } else if (!r.applicable && !r.excluded) {
    inner = `<p class="muted">Shown only when: ${r.unmetWhen.map((c) => esc(describeCond(content, c))).join('; ')}</p>`;
  } else if (r.excluded) {
    inner = `<p class="muted">Excluded from this design. <button class="link" data-act="include" data-id="${d.id}">Include again</button></p>`;
  } else {
    const opts = d.options.map((o) => {
      const s = r.options.find((x) => x.id === o.id);
      const checked = r.chosen === o.id;
      const why = s.enabled ? '' : `<div class="why">Needs ${s.unmet.map((c) => esc(describeCond(content, c))).join('; ')}</div>`;
      const rec = s.recommended ? `<div class="recwhy">Recommended because ${s.reasons.map((c) => esc(describeCond(content, c))).join('; ')}</div>` : '';
      return `<label class="opt ${checked ? 'sel' : ''} ${s.enabled ? '' : 'off'}">
        <input type="radio" name="${d.id}" value="${o.id}" ${checked ? 'checked' : ''} ${s.enabled ? '' : 'disabled'} data-choose="${d.id}">
        <div><div class="optlabel">${esc(o.label)}${s.recommended ? ' <span class="pill rec">recommended</span>' : ''}${d.default === o.id ? ' <span class="pill muted">default</span>' : ''}</div>
        <div class="optsum">${esc(o.summary || '')}</div>${rec}${why}</div></label>`;
    }).join('');
    const chosen = d.options.find((o) => o.id === r.effective);
    const just = chosen ? `<details class="more" ${override ? 'open' : ''}><summary>Justification &amp; implications</summary>
        ${override ? '<div class="warnbox">This overrides the recommendation. Record why in the justification.</div>' : ''}
        <label class="fld">Justification <small>(edit to tailor; saved locally only)</small>
        <textarea data-just="${d.id}" rows="2">${esc(profile.justifications[d.id] ?? chosen.justification ?? '')}</textarea></label>
        ${chosen.implications && chosen.implications.length ? `<ul>${chosen.implications.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</details>` : '';
    const conflict = r.conflict ? `<div class="warnbox">The chosen option no longer meets its prerequisites. Pick another option or change the upstream decision.</div>` : '';
    const vnote = d.versionNotes && d.versionNotes[profile.meta.vcfVersion] ? `<div class="infobox">${esc(d.versionNotes[profile.meta.vcfVersion])}</div>` : '';
    inner = `${d.context ? `<p class="ctx">${esc(d.context)}</p>` : ''}${vnote}${d.verify ? `<div class="infobox">Verify: ${esc(d.verify)}</div>` : ''}
      ${conflict}<div class="opts">${opts}</div>${just}
      <label class="fld">Customer-specific note <small>(local only)</small><textarea data-note="${d.id}" rows="1" placeholder="Optional">${esc(profile.notes[d.id] || '')}</textarea></label>
      <div class="cardfoot">
        ${(d.links || []).length ? `<span>${d.links.length} reference${d.links.length > 1 ? 's' : ''}</span>` : '<span></span>'}
        <button class="link" data-act="exclude" data-id="${d.id}">Exclude from this design</button>
      </div>`;
  }
  return `<article class="card ${r.applicable ? '' : 'na'}" id="dd-${d.id}">
    <header><div><code>${d.id}</code> ${status} ${draft}</div><h4>${esc(d.title)}</h4><p class="q">${esc(d.question)}</p>
    ${deps || affects ? `<div class="deps">${deps ? `<span>Depends on</span>${deps}` : ''}${affects ? `<span>Affects</span>${affects}` : ''}</div>` : ''}</header>
    ${inner}</article>`;
}

function renderLibrary() {
  const q = libFilter.q.toLowerCase();
  const usedBy = {};
  content.decisions.forEach((d) => (d.links || []).forEach((l) => (usedBy[l] ||= []).push(d.id)));
  const rows = content.links.filter((l) =>
    (!libFilter.product || l.product === libFilter.product) &&
    (!libFilter.source || l.source === libFilter.source) &&
    (!q || [l.title, l.url, ...(l.topics || []), ...(l.versions || [])].join(' ').toLowerCase().includes(q)));
  const opt = (vals, cur) => ['', ...new Set(vals)].map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${v || 'all'}</option>`).join('');
  return `<div class="page"><h2>Reference library</h2>
    <div class="filters">
      <input id="lib-q" type="search" placeholder="Search title, topic, version…" value="${esc(libFilter.q)}">
      <label>Product <select id="lib-product">${opt(content.links.map((l) => l.product), libFilter.product)}</select></label>
      <label>Source <select id="lib-source">${opt(content.links.map((l) => l.source), libFilter.source)}</select></label>
      <span class="muted">${rows.length} of ${content.links.length}</span>
    </div>
    <table class="tbl"><thead><tr><th>Title</th><th>Source</th><th>Product</th><th>Versions</th><th>Topics</th><th>Used by</th></tr></thead><tbody>
    ${rows.map((l) => `<tr><td><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a></td><td>${esc(l.source)}</td><td>${esc(l.product)}</td>
      <td>${esc((l.versions || []).join(', '))}</td><td>${(l.topics || []).map((t) => `<span class="chip soft">${esc(t)}</span>`).join('')}</td>
      <td>${(usedBy[l.id] || []).map((x) => `<span class="chip">${x}</span>`).join('')}</td></tr>`).join('')}
    </tbody></table>
    <p class="muted">Add links in <code>content/links.yaml</code>. Copy a link's id into a decision's <code>links:</code> list to cite it.</p></div>`;
}

function renderDiagrams() {
  return `<div class="page"><h2>Diagrams &amp; reference images</h2><div class="grid">
    ${content.diagrams.map((g) => `<figure class="dia"><img src="diagrams/${esc(g.file)}" alt="${esc(g.title)}"><figcaption><b>${esc(g.title)}</b><br>${esc(g.caption || '')}
      ${g.source ? `<br><a href="${esc(g.source)}" target="_blank" rel="noopener">source</a>` : ''}<br><code>${esc(g.id)}</code></figcaption></figure>`).join('')}
    </div><p class="muted">Add files to <code>content/diagrams/</code> and index them in <code>content/diagrams.yaml</code>.</p></div>`;
}

function renderGlossary() {
  return `<div class="page"><h2>Glossary</h2><table class="tbl"><tbody>
    ${content.glossary.map((g) => `<tr><th>${esc(g.term)}</th><td>${esc(g.definition)}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderAbout() {
  return `<div class="page prose"><h2>How this works</h2>
  <ol><li><b>Requirements</b>: capture the customer context from the workshops.</li>
  <li><b>Design</b>: each decision shows the option your answers recommend, and why. Accept it or override it, and record the justification.</li>
  <li><b>Export reference sheet</b>: an Excel workbook with requirements, every decision and its basis, open items, references and diagrams. That is the input for writing the LLD.</li></ol>
  <p>Dependencies between decisions are enforced. VCF decisions come first, and VCFA options are disabled or hidden until the VCF choices allow them.</p>
  <p><b>No customer data is stored in the repo.</b> Customer name, answers, choices and notes stay in this browser and in the profile JSON you save. Keep that file in the customer's project folder.</p>
  <p class="muted">Catalogue v${esc(content.version)} · built ${esc(content.builtAt.slice(0, 16).replace('T', ' '))} UTC</p></div>`;
}

// ---------------- actions ----------------
async function exportSheet() {
  try {
    const data = buildSheetData(content, profile);
    const wb = await buildWorkbook(ExcelJS, data);
    const buf = await wb.xlsx.writeBuffer();
    download(`${slug(data.meta.customer)}_Design-Reference-Sheet_${data.meta.generated.slice(0, 10)}.xlsx`,
      new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    toast(data.openItems.length ? `Exported, with ${data.openItems.length} open item(s)` : 'Reference sheet exported', data.openItems.length ? 'warn' : '');
  } catch (e) {
    console.error(e);
    toast(`Export failed: ${e.message}`, 'bad');
  }
}

// Repeats until stable so upstream choices unlock downstream recommendations.
function fillChoices(pick) {
  let changed = 0;
  for (let pass = 0; pass < 6; pass++) {
    let n = 0;
    const ev = createEvaluator(content, profile);
    for (const d of content.decisions) {
      const r = ev.evaluate(d.id);
      if (!r.applicable || r.chosen) continue;
      const id = pick(d, r);
      if (id) { profile.choices[d.id] = id; n++; }
    }
    changed += n;
    if (!n) break;
  }
  return changed;
}

function bind() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act],[data-view]');
    if (!t) return;
    if (t.dataset.view) { view = t.dataset.view; render(); scrollTo(0, 0); return; }
    const id = t.dataset.id;
    switch (t.dataset.act) {
      case 'apply-recs': {
        const n = fillChoices((d, r) => (r.recommendedIds.length === 1 ? r.recommendedIds[0] : null));
        save(); keepScroll(render);
        toast(n ? `${n} decision(s) set from recommendations` : 'No single recommendation for the open decisions');
        break;
      }
      case 'defaults': {
        const n = fillChoices((d, r) => (d.default && r.options.find((o) => o.id === d.default).enabled ? d.default : null));
        save(); keepScroll(render); toast(`${n} decision(s) set to catalogue defaults`);
        break;
      }
      case 'reset':
        if (confirmInline(t)) { profile.choices = {}; profile.excluded = {}; save(); render(); }
        break;
      case 'clear-answer': delete profile.answers[id]; save(); keepScroll(render); break;
      case 'exclude': profile.excluded[id] = true; save(); keepScroll(render); break;
      case 'include': delete profile.excluded[id]; save(); keepScroll(render); break;
      case 'xlsx': exportSheet(); break;
      case 'save-profile':
        download(`${slug(profile.meta.customer)}_design-profile.json`, JSON.stringify(profile, null, 2), 'application/json'); break;
      case 'open-profile': $('#file-profile').click(); break;
      case 'new':
        if (confirmInline(t)) { profile = blankProfile(); save(); view = 'requirements'; render(); }
        break;
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.choose) { profile.choices[t.dataset.choose] = t.value; save(); keepScroll(render); return; }
    if (t.dataset.answer) { profile.answers[t.dataset.answer] = t.value; save(); keepScroll(render); return; }
    if (t.id && t.id.startsWith('meta-')) { profile.meta[t.id.slice(5)] = t.value; save(); keepScroll(render); return; }
    if (t.id === 'lib-product') { libFilter.product = t.value; render(); }
    if (t.id === 'lib-source') { libFilter.source = t.value; render(); }
    if (t.id === 'file-profile' && t.files[0]) {
      t.files[0].text().then((txt) => {
        try { profile = normalise(JSON.parse(txt)); save(); render(); toast('Profile loaded'); }
        catch { toast('Not a valid profile file', 'bad'); }
        t.value = '';
      });
    }
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.note !== undefined) { profile.notes[t.dataset.note] = t.value; save(); }
    if (t.dataset.just !== undefined) { profile.justifications[t.dataset.just] = t.value; save(); }
    if (t.dataset.anote !== undefined) { profile.answerNotes[t.dataset.anote] = t.value; save(); }
    if (t.id === 'lib-q') { libFilter.q = t.value; const pos = t.selectionStart; render(); const n = $('#lib-q'); n.focus(); n.setSelectionRange(pos, pos); }
    if (['meta-customer', 'meta-customerCode', 'meta-author'].includes(t.id)) { profile.meta[t.id.slice(5)] = t.value; save(); renderMeta(); }
  });
}

// two-click confirm without browser dialogs
function confirmInline(btn) {
  if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; return true; }
  btn.dataset.label = btn.textContent; btn.dataset.armed = '1'; btn.textContent = 'Click again to confirm';
  setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 3000);
  return false;
}

async function init() {
  content = await (await fetch('data/content.json')).json();
  const raw = store.get(STORE_KEY);
  try { profile = raw ? normalise(JSON.parse(raw)) : blankProfile(); } catch { profile = blankProfile(); }
  if (Object.keys(profile.answers).length) view = 'design';
  $('#cat-version').textContent = `catalogue v${content.version}`;
  bind();
  render();
}
init().catch((e) => { document.body.innerHTML = `<p style="padding:2rem">Failed to load content: ${esc(e.message)}</p>`; });
