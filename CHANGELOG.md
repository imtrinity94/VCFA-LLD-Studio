# Changelog

Newest first. The catalogue version is the `version` in `package.json` and is stamped into every export.

## 0.2.1 — 2026-11-13

- Renamed the app to VCFA LLD Studio to match the repo, added the live GitHub Pages link to the README, and refreshed the social preview image.
- Saved browser profiles carry over (the storage key is unchanged).

## 0.2.0 — 2026-11-13

- Changed focus from generating the LLD to selecting the design: the main output is now the Design Reference Sheet (.xlsx), with Overview, Requirements, Design Decisions, Open Items, References, Diagrams and Glossary sheets.
- New Requirements step: 16 customer-context questions in `content/requirements.yaml`. Decision options are recommended from the answers through `recommendedWhen` (requirement conditions and `all:` groups).
- The Design view shows why each option is recommended and flags overrides. *Apply recommendations* resolves dependency chains over several passes.
- Every decision has a "basis": Recommended, Override, Catalogue default or Architect choice. Overrides are listed as open items to justify.
- Per-customer requirement IDs `<prefix>-<area code>-<customer code>-<NNN>`, numbered per area. There is a new customer code field.
- VCFA areas follow the VCF Automation design chapter order. Added 9 generic, paraphrased VCFA decisions: deployment path, platform perspective, size, network model, provider/tenant IdP, load balancing, Orchestrator deployment, integration mode and backup (22 decisions in total, all draft).
- Options have a `statement` that completes "<Customer> will …" for the LLD requirement sentence.
- `VCFA-DEP-01` (single node vs HA) was renamed to `VCFA-HA-01`. `VCFA-DEP-01` now means deployment path.
- Removed DOCX and Markdown export from the UI; Word template work is parked. Dropped docxtemplater and pizzip, and added exceljs.

## 0.1.0 — 2026-11-13

- Initial scaffold: YAML content model with `when`, `requires` and `recommendedWhen` dependencies; the validator checks references and cycles and enforces VCF → VCFA ordering.
- Seed catalogue (draft): 7 VCF decisions and 6 VCFA decisions, 12 reference links, 1 original diagram and 13 glossary terms.
- Static site: decision picker with live dependency state, plus Library, Diagrams and Glossary views.
- Local-only customer profiles: autosaved in the browser, and can be saved to or opened from JSON.
- Markdown export, and DOCX export through docxtemplater using a built-in generic template or a user-loaded MBCOM or Broadcom template.
- GitHub Actions: validate, build, smoke-render a sample LLD and deploy to GitHub Pages.
