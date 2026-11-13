import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { createEvaluator, describeCond, stats, buildModel, toMarkdown } from './model.js';

const STORE_KEY = 'vcf-lld-studio.profile.v1';
const TPL_KEY = (type) => `vcf-lld-studio.template.${type}`;
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let content;
let profile;
let view = 'design';
let activeArea = null;
let libFilter = { q: '', product: '', source: '' };

const blankProfile = () => ({
  meta: { customer: '', projectType: 'mbcom', vcfVersion: '9.0', docVersion: '0.1', author: '', docTitle: '' },
  choices: {}, notes: {}, justifications: {}, excluded: {},
});

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
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

// ---------------- rendering ----------------
function render() {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  renderMeta();
  const main = $('#main');
  if (view === 'design') main.innerHTML = renderDesign();
  if (view === 'library') main.innerHTML = renderLibrary();
  if (view === 'diagrams') main.innerHTML = renderDiagrams();
  if (view === 'glossary') main.innerHTML = renderGlossary();
  if (view === 'about') main.innerHTML = renderAbout();
}

function renderMeta() {
  const s = stats(content, profile);
  $('#progress').innerHTML = `<b>${s.decided}</b>/${s.applicable} decided` + (s.conflicts ? ` · <span class="bad">${s.conflicts} conflict${s.conflicts > 1 ? 's' : ''}</span>` : '');
  const m = profile.meta;
  for (const k of ['customer', 'projectType', 'vcfVersion', 'docVersion', 'author']) {
    const el = $(`#meta-${k}`); if (el && document.activeElement !== el) el.value = m[k] || '';
  }
  const tplName = store.get(TPL_KEY(m.projectType) + '.name');
  $('#tpl-status').textContent = tplName ? `${m.projectType.toUpperCase()} template: ${tplName}` : `${m.projectType.toUpperCase()} template: built-in generic`;
}

function renderDesign() {
  const ev = createEvaluator(content, profile);
  const nav = content.domains.map((dom) => {
    const items = content.areas.filter((a) => a.domain === dom.id).map((a) => {
      const ds = content.decisions.filter((d) => d.area === a.id);
      const app = ds.filter((d) => ev.evaluate(d.id).applicable);
      const done = app.filter((d) => ev.evaluate(d.id).effective).length;
      const bad = app.some((d) => ev.evaluate(d.id).conflict);
      return `<li><a href="#${a.id}" data-area="${a.id}" class="${activeArea === a.id ? 'on' : ''}">
        <span>${esc(a.title)}</span><span class="count ${bad ? 'bad' : done === app.length && app.length ? 'ok' : ''}">${done}/${app.length}</span></a></li>`;
    }).join('');
    return `<div class="navgroup"><h4>${esc(dom.title)}</h4><ul>${items}</ul></div>`;
  }).join('');

  const body = content.domains.map((dom) => {
    const areas = content.areas.filter((a) => a.domain === dom.id).map((a) => {
      const cards = content.decisions.filter((d) => d.area === a.id).map((d) => renderDecision(d, ev)).join('');
      return `<section class="area" id="${a.id}"><h3>${esc(a.title)}</h3>${cards || '<p class="muted">No decisions yet.</p>'}</section>`;
    }).join('');
    return `<h2 class="domain">${esc(dom.title)}</h2>${areas}`;
  }).join('');

  return `<div class="design"><nav class="sidenav">${nav}
      <div class="navactions">
        <button data-act="defaults" class="ghost">Fill empty with defaults</button>
        <button data-act="reset" class="ghost danger">Clear all choices</button>
      </div></nav>
    <div class="decisions">${body}</div></div>`;
}

function renderDecision(d, ev) {
  const r = ev.evaluate(d.id);
  const by = ev.byId;
  const deps = (d.dependsOn || []).map((x) => `<a href="#dd-${x}" class="chip">${x}</a>`).join('');
  const affects = (d.dependents || []).map((x) => `<a href="#dd-${x}" class="chip soft">${x}</a>`).join('');
  const status = !r.inVersion ? `<span class="pill muted">not in ${esc(profile.meta.vcfVersion)}</span>`
    : r.excluded ? '<span class="pill muted">excluded</span>'
    : !r.applicable ? '<span class="pill muted">not applicable</span>'
    : r.conflict ? '<span class="pill bad">conflict</span>'
    : r.effective ? '<span class="pill ok">decided</span>' : '<span class="pill">open</span>';
  const draft = d.status === 'draft' ? '<span class="pill draft" title="Seed content — verify before customer use">draft</span>' : '';

  let inner = '';
  if (!r.inVersion) {
    inner = `<p class="muted">Applies to VCF ${esc((d.appliesTo || []).join(', '))}.</p>`;
  } else if (!r.applicable && !r.excluded) {
    inner = `<p class="muted">Shown only when: ${r.unmetWhen.map((c) => esc(describeCond(by, c))).join('; ')}</p>`;
  } else if (r.excluded) {
    inner = `<p class="muted">Excluded from this design. <button class="link" data-act="include" data-id="${d.id}">Include again</button></p>`;
  } else {
    const opts = d.options.map((o) => {
      const s = r.options.find((x) => x.id === o.id);
      const checked = r.chosen === o.id;
      const why = s.enabled ? '' : `<div class="why">Needs ${s.unmet.map((c) => esc(describeCond(by, c))).join('; ')}</div>`;
      return `<label class="opt ${checked ? 'sel' : ''} ${s.enabled ? '' : 'off'}">
        <input type="radio" name="${d.id}" value="${o.id}" ${checked ? 'checked' : ''} ${s.enabled ? '' : 'disabled'} data-choose="${d.id}">
        <div><div class="optlabel">${esc(o.label)}${s.recommended ? ' <span class="pill rec">recommended</span>' : ''}${d.default === o.id ? ' <span class="pill muted">default</span>' : ''}</div>
        <div class="optsum">${esc(o.summary || '')}</div>${why}</div></label>`;
    }).join('');
    const chosen = d.options.find((o) => o.id === r.effective);
    const just = chosen ? `<details class="more"><summary>Justification &amp; implications</summary>
        <label class="fld">Justification <small>(edit to tailor; saved locally only)</small>
        <textarea data-just="${d.id}" rows="2">${esc(profile.justifications[d.id] ?? chosen.justification ?? '')}</textarea></label>
        ${chosen.implications ? `<ul>${chosen.implications.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</details>` : '';
    const conflict = r.conflict ? `<div class="warnbox">The chosen option no longer meets its prerequisites. Pick another option or change the upstream decision.</div>` : '';
    const vnote = d.versionNotes && d.versionNotes[profile.meta.vcfVersion] ? `<div class="infobox">${esc(d.versionNotes[profile.meta.vcfVersion])}</div>` : '';
    inner = `${d.context ? `<p class="ctx">${esc(d.context)}</p>` : ''}${vnote}${d.verify ? `<div class="infobox">Verify: ${esc(d.verify)}</div>` : ''}
      ${conflict}<div class="opts">${opts}</div>${just}
      <label class="fld">Customer-specific note <small>(local only)</small><textarea data-note="${d.id}" rows="1" placeholder="Optional">${esc(profile.notes[d.id] || '')}</textarea></label>
      <div class="cardfoot">
        ${(d.links || []).length ? `<span>${d.links.length} reference${d.links.length > 1 ? 's' : ''}</span>` : ''}
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
    <p class="muted">Add links in <code>content/links.yaml</code>. Copy a link's id into a decision's <code>links:</code> list to cite it in the LLD.</p></div>`;
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
  <p>Design decisions live as YAML in the repo (<code>content/decisions/vcf</code> and <code>content/decisions/vcfa</code>). VCF decisions come first, and VCFA decisions can depend on them:</p>
  <ul><li><b>when</b>: the decision only appears if an upstream choice matches.</li>
  <li><b>requires</b>: an option is disabled until upstream choices allow it.</li>
  <li><b>recommendedWhen</b>: an option is flagged as recommended for certain upstream choices.</li></ul>
  <p><b>No customer data is stored in the repo.</b> Customer name, choices and notes stay in this browser and in the profile JSON you save. Keep that file in the customer's project folder.</p>
  <p><b>Templates.</b> Your MBCOM and Broadcom Word templates are loaded from your machine and kept only in this browser. Tag them as described in <code>templates/TEMPLATE-TAGS.md</code>.</p>
  <p class="muted">Catalogue v${esc(content.version)} · built ${esc(content.builtAt.slice(0, 16).replace('T', ' '))} UTC</p></div>`;
}

// ---------------- exports ----------------
function exportMarkdown() {
  const m = buildModel(content, profile);
  const base = new URL('diagrams/', location.href).href;
  download(`${slug(m.customer)}_LLD_v${m.docVersion}.md`, toMarkdown(m, base), 'text/markdown');
  if (m.hasPending) toast(`Exported with ${m.pending.length} open item(s) marked TBD`, 'warn');
}

async function getTemplate() {
  const saved = store.get(TPL_KEY(profile.meta.projectType));
  if (saved) return Uint8Array.from(atob(saved), (c) => c.charCodeAt(0));
  const res = await fetch('templates/generic-lld-template.docx');
  if (!res.ok) throw new Error('Built-in template missing');
  return new Uint8Array(await res.arrayBuffer());
}

async function exportDocx() {
  try {
    const m = buildModel(content, profile);
    const zip = new PizZip(await getTemplate());
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
    doc.render(m);
    const out = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    download(`${slug(m.customer)}_${m.projectType}_LLD_v${m.docVersion}.docx`, out);
    toast(m.hasPending ? `DOCX exported with ${m.pending.length} open item(s)` : 'DOCX exported', m.hasPending ? 'warn' : '');
  } catch (e) {
    const detail = e.properties && e.properties.errors ? e.properties.errors.map((x) => x.properties.explanation).join('; ') : e.message;
    toast(`Template error: ${detail}`, 'bad');
    console.error(e);
  }
}

function loadTemplateFile(file) {
  const r = new FileReader();
  r.onload = () => {
    const bytes = new Uint8Array(r.result);
    let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const type = profile.meta.projectType;
    if (store.set(TPL_KEY(type), btoa(bin)) && store.set(TPL_KEY(type) + '.name', file.name)) toast(`${type.toUpperCase()} template saved in this browser`);
    else toast('Template too large to keep in browser storage', 'bad');
    renderMeta();
  };
  r.readAsArrayBuffer(file);
}

// ---------------- events ----------------
function bind() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act],[data-view],[data-area]');
    if (!t) return;
    if (t.dataset.view) { view = t.dataset.view; render(); return; }
    if (t.dataset.area) { activeArea = t.dataset.area; return; }
    const id = t.dataset.id;
    switch (t.dataset.act) {
      case 'defaults': {
        // iterate in catalogue order so upstream defaults land first
        for (const d of content.decisions) {
          const evNow = createEvaluator(content, profile);
          const r = evNow.evaluate(d.id);
          if (r.applicable && !r.chosen && d.default && r.options.find((o) => o.id === d.default).enabled) profile.choices[d.id] = d.default;
        }
        save(); render(); toast('Empty decisions filled with defaults'); break;
      }
      case 'reset':
        if (confirmInline(t)) { profile.choices = {}; profile.excluded = {}; save(); render(); }
        break;
      case 'exclude': profile.excluded[id] = true; save(); render(); break;
      case 'include': delete profile.excluded[id]; save(); render(); break;
      case 'md': exportMarkdown(); break;
      case 'docx': exportDocx(); break;
      case 'save-profile':
        download(`${slug(profile.meta.customer)}_lld-profile.json`, JSON.stringify(profile, null, 2), 'application/json'); break;
      case 'open-profile': $('#file-profile').click(); break;
      case 'load-tpl': $('#file-tpl').click(); break;
      case 'clear-tpl': store.del(TPL_KEY(profile.meta.projectType)); store.del(TPL_KEY(profile.meta.projectType) + '.name'); renderMeta(); toast('Using built-in generic template'); break;
      case 'new':
        if (confirmInline(t)) { profile = blankProfile(); save(); render(); }
        break;
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.choose) { profile.choices[t.dataset.choose] = t.value; save(); const y = scrollY; render(); scrollTo(0, y); return; }
    if (t.id && t.id.startsWith('meta-')) { profile.meta[t.id.slice(5)] = t.value; save(); const y = scrollY; render(); scrollTo(0, y); return; }
    if (t.id === 'lib-product') { libFilter.product = t.value; render(); }
    if (t.id === 'lib-source') { libFilter.source = t.value; render(); }
    if (t.id === 'file-profile' && t.files[0]) {
      t.files[0].text().then((txt) => {
        try { profile = { ...blankProfile(), ...JSON.parse(txt) }; save(); render(); toast('Profile loaded'); }
        catch { toast('Not a valid profile file', 'bad'); }
        t.value = '';
      });
    }
    if (t.id === 'file-tpl' && t.files[0]) { loadTemplateFile(t.files[0]); t.value = ''; }
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.note !== undefined) { profile.notes[t.dataset.note] = t.value; save(); }
    if (t.dataset.just !== undefined) { profile.justifications[t.dataset.just] = t.value; save(); }
    if (t.id === 'lib-q') { libFilter.q = t.value; const pos = t.selectionStart; render(); const n = $('#lib-q'); n.focus(); n.setSelectionRange(pos, pos); }
    if (t.id === 'meta-customer' || t.id === 'meta-author' || t.id === 'meta-docVersion') { profile.meta[t.id.slice(5)] = t.value; save(); }
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
  profile = raw ? { ...blankProfile(), ...JSON.parse(raw) } : blankProfile();
  $('#cat-version').textContent = `catalogue v${content.version}`;
  bind();
  render();
}
init().catch((e) => { document.body.innerHTML = `<p style="padding:2rem">Failed to load content: ${esc(e.message)}</p>`; });
