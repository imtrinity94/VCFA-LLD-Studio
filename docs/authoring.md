# Authoring decisions

Each decision is one YAML file: `content/decisions/<domain>/<ID>.yaml`. The file name must match the `id`.

## ID convention

`<DOMAIN>-<AREA>-<NN>`. For example, `VCF-IAM-01` or `VCFA-TEN-01`. Once an ID is published, never reuse or renumber it, because saved customer profiles refer to it.

## Full example

```yaml
id: VCFA-TEN-01
area: vcfa-tenancy          # must exist in content/areas.yaml
order: 1                    # optional; sort order inside the area
title: Organization type (consumption model)
appliesTo: ["9.0", "9.1"]   # VCF versions this decision is valid for
versionNotes:               # optional; shown when that version is selected
  "9.1": Something changed in 9.1...
status: draft               # draft | reviewed
verify: What to double-check before using it in an LLD   # optional banner
question: Which type of tenant organization will VCF Automation offer?
context: >
  Background that goes into the LLD body.
when:                       # optional: show the decision only if…
  - { decision: VCF-SUP-01, in: [enabled] }
options:
  - id: all-apps
    label: All Apps organizations
    summary: One line shown on the card.
    justification: Default justification text written into the LLD.
    implications:
      - Bullet written into the LLD.
    requires:               # optional: option disabled unless…
      - { decision: VCF-NET-01, in: [nsx-vpc] }
    recommendedWhen:        # optional: flag as recommended if…
      - { decision: VCF-DEP-01, in: [site-ha] }
default: vm-apps
links: [kb-426100]          # ids from content/links.yaml
diagrams: [vcf-hierarchy]   # ids from content/diagrams.yaml
```

### Rules the build enforces

- All referenced decisions, options, links and diagrams must exist.
- No dependency cycles.
- Domain order: a `vcf` decision cannot depend on a `vcfa` decision.
- Each decision needs a title, a question and at least two options.

## Links

Add each link to `content/links.yaml` with an `id`, `title`, `url`, `source` (techdocs, kb, blog, community or video), `product`, `versions` and `topics`. Give the exact version numbers the page states. The Library tab searches across title, topics and versions.

## Diagrams

Put the image in `content/diagrams/` and index it in `content/diagrams.yaml`. Only add original diagrams, or images you're allowed to reuse. Record the source of anything adapted.
