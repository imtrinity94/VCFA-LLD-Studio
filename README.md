# VCF LLD Studio

A design-decision catalogue and Low Level Design (LLD) generator for **VMware Cloud Foundation 9.x** and **VCF Automation**.

Pick the design decisions for an engagement in the browser. The site shows which choices are valid given earlier choices, then exports:

- **Markdown**, a clean LLD draft.
- **Word (.docx)**, rendered into *your* Word template (MBCOM or Broadcom), or into the built-in generic one.

> **No customer data lives in this repo.** The customer name, choices, notes and your company templates stay in your browser and in a profile JSON file you keep in the customer's project folder.

## Why

The design decisions are spread across TechDocs, KBs, blogs and old LLDs. Many VCF Automation decisions only make sense once the VCF platform decisions are made. For example, *All Apps* organizations need Supervisor and NSX VPC networking. This repo keeps that knowledge in one versioned place, with the dependencies written down explicitly.

## How it is organised

```
content/
  areas.yaml              LLD section order (VCF first, then VCFA)
  decisions/vcf/*.yaml    one file per VCF decision
  decisions/vcfa/*.yaml   one file per VCFA decision (may depend on VCF)
  links.yaml              reference library (TechDocs, KB, blogs) with tags
  diagrams.yaml           index of diagrams / reference images
  diagrams/               the image files
  glossary.yaml
templates/
  generic-lld-template.docx   tagged sample Word template
  TEMPLATE-TAGS.md            how to tag the MBCOM / Broadcom templates
scripts/
  build-content.mjs       validates content and compiles it to site/data/content.json
  smoke-test.mjs          renders a sample LLD (MD + DOCX) in CI
  make-generic-template.py
site/                     static web app (GitHub Pages)
```

### Dependency model

Each decision can declare:

| Field | Level | Effect |
|---|---|---|
| `when` | decision | The decision only appears when the upstream choices match. |
| `requires` | option | The option is disabled until the upstream choices allow it. |
| `recommendedWhen` | option | The option is flagged as recommended for those upstream choices. |

The build fails on unknown ids, dependency cycles, or a VCF decision that depends on a VCFA one, because earlier domains must not depend on later ones.

See [docs/authoring.md](docs/authoring.md) for the decision file format.

## Use it

Once it's deployed, open the GitHub Pages URL, then:

1. Set the **Customer**, the **Template** (MBCOM or Broadcom) and the **VCF version**.
2. Work through the decisions. Use **Fill empty with defaults** to get a quick baseline.
3. Click **Save profile** and keep the JSON in the customer's folder. Use **Open profile** to resume later on any machine.
4. Use **Load Word template** once per template type. It's kept in this browser only.
5. Click **Export .docx** or **Export .md**.

## Develop locally

```bash
npm install
npm run dev        # validate + build, then serve site/ on http://localhost:8080
npm run validate   # content checks only
node scripts/smoke-test.mjs
```

On Windows, `npm run dev` needs Python on your PATH for the local server. Any static server pointed at `site/` works too.

## Deploy

Push to `main`. The GitHub Actions workflow validates the content, builds it, renders a sample LLD and deploys `site/` to GitHub Pages. To turn it on, go to Settings → Pages → Source: **GitHub Actions**.

## Status

Seed content is marked **draft**. Verify each decision against the current TechDocs before using it in a customer LLD.
