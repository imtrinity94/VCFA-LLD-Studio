# Tagging your MBCOM / Broadcom Word template

The site fills a Word template using [docxtemplater](https://docxtemplater.com) tags. Your real templates **never go into this repo**. You load them in the site, and they're kept in that browser only.

## Steps

1. Make a copy of the MBCOM (or Broadcom) LLD template and delete all customer content.
2. Keep the cover page, styles, headers and footers, and the boilerplate chapters.
3. Where the design-decision chapters go, paste the tagged block from `generic-lld-template.docx`. Then restyle it with your template's own heading and table styles.
4. In the site, choose the Template type, then **Load Word template**.

Type each tag in one go, or paste it as plain text. If Word splits a tag into several formatting runs (because of autocorrect or spell check), docxtemplater reports an error. Retype that tag to fix it.

## Available tags

| Tag | Meaning |
|---|---|
| `{docTitle}` `{customer}` `{projectType}` `{vcfVersion}` `{docVersion}` `{date}` `{author}` `{catalogueVersion}` | Document properties |
| `{#hasPending}…{/hasPending}` | Block shown only when there are open or conflicting decisions |
| `{#pending}{id} {title} {reason}{/pending}` | List of open items |
| `{#summary}{ref} {id} {title} {decision}{/summary}` | Summary table. Put the loop in a table row. |
| `{#domains}{title}` … `{/domains}` | Platform sections (VCF, then VCFA) |
| `{#areas}{title}` … `{/areas}` | Areas inside a domain |
| `{#decisions}` … `{/decisions}` | Decisions inside an area |
| inside a decision: `{ref} {id} {title} {question} {decision} {summary} {justification} {context}` | Decision fields |
| `{#implications}{text}{/implications}` | Implication bullets |
| `{#alternatives}{label}{/alternatives}` | Options not chosen |
| `{#hasNote}{note}{/hasNote}` | Customer-specific note |
| `{#hasVersionNote}{versionNote}{/hasVersionNote}` | Version caveat |
| `{#links}{title} {url}{/links}` | References for that decision |
| `{#references}{title} {url} {source}{/references}` | All references used |
| `{#glossary}{term} {definition}{/glossary}` | Glossary table row |

A loop tag on a paragraph of its own repeats the paragraphs between its open and close tags. A loop in a table row repeats the row.

Diagrams are not embedded in the DOCX in v0.1. They're listed by title, so insert the images by hand. The Markdown export links them.
