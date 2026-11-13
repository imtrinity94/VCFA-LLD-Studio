# VCFA LLD Studio

**Live:** https://imtrinity94.github.io/VCFA-LLD-Studio/

Requirements-driven design selection for **VMware Cloud Foundation 9.x** and **VCF Automation**.

You capture the customer's context and pick the right design decisions. The tool then exports a **Design Reference Sheet** (Excel), which is the single input you write the LLD from: in the Broadcom or the MBCOM template.

> **No customer data lives in this repo.** The customer name, answers, choices and notes stay in your browser and in a profile JSON you keep in the customer's project folder.

## Flow

1. **Requirements**: answer customer-context questions from the workshops: sites, isolation, availability, tenancy, Aria 8 migration, Kubernetes, network segregation, IdP, and so on.
2. **Design**: every decision shows the option your answers recommend and *why*. Accept it or override it, and record the justification. Dependencies are enforced: VCF decisions come first, and VCFA options are disabled or hidden until the VCF choices allow them.
3. **Export reference sheet (.xlsx)**, with these sheets:

| Sheet | What's in it |
|---|---|
| Overview | Customer, customer code, VCF version, progress counts |
| Requirements | Every question, the answer, and workshop notes |
| Design Decisions | One row per decision: per-area requirement ID (e.g. `VCF-AUTO-NET-ABC-001`), selected option, recommended option, **basis** (Recommended / Override / Default / Architect choice), the LLD requirement sentence, justification, implications, alternatives, dependencies, context, notes, references, diagrams |
| Open Items | Unanswered requirements, open or conflicting decisions, overrides to justify, and items to verify against TechDocs |
| References | TechDocs, KB and blog links cited by the selected design, with the requirement IDs that use them |
| Diagrams | Reference diagrams to reuse in the LLD |
| Glossary | Terms |

## Repo layout

```
content/
  requirements.yaml       customer-context questions (grouped)
  areas.yaml              domains (with requirement-ID prefix) and areas (with area code), in LLD order
  decisions/vcf/*.yaml    one file per VCF decision
  decisions/vcfa/*.yaml   one file per VCFA decision (may depend on VCF)
  links.yaml              reference library
  diagrams.yaml + diagrams/
  glossary.yaml
scripts/
  build-content.mjs       validates content and compiles it to site/data/content.json
  smoke-test.mjs          renders a sample reference sheet in CI
site/                     static web app (GitHub Pages)
templates/                parked: Word template tagging for later LLD generation
docs/authoring.md         how to write requirements and decisions
```

## Develop locally

```bash
npm install
npm run dev        # validate + build, serve site/ on http://localhost:8080 (needs Python on PATH)
npm run validate   # content checks only
node scripts/smoke-test.mjs   # writes out/sample-reference-sheet.xlsx
```

If Python isn't installed on Windows, run `npm run build` and then `npx serve site`.

## Deploy

Push to `main`. GitHub Actions validates, builds, renders a sample sheet and deploys `site/` to GitHub Pages. To turn it on, go to Settings → Pages → Source: **GitHub Actions**.

## Status

All catalogue content is **draft** and paraphrased. Verify each decision against the current TechDocs before using it with a customer. LLD (Word) generation is parked; the reference sheet is the deliverable for now.
