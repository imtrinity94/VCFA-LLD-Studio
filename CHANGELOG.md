# Changelog

Newest first. The catalogue version is the `version` in `package.json` and is stamped into every exported LLD.

## 0.1.0 — 2026-11-13

- Initial scaffold: YAML content model with `when`, `requires` and `recommendedWhen` dependencies; the validator checks references and cycles and enforces VCF → VCFA ordering.
- Seed catalogue (draft): 7 VCF decisions and 6 VCFA decisions, 12 reference links, 1 original diagram and 13 glossary terms.
- Static site: decision picker with live dependency state, plus Library, Diagrams and Glossary views.
- Local-only customer profiles: autosaved in the browser, and can be saved to or opened from JSON.
- Markdown export, and DOCX export through docxtemplater using a built-in generic template or a user-loaded MBCOM or Broadcom template.
- GitHub Actions: validate, build, smoke-render a sample LLD and deploy to GitHub Pages.
