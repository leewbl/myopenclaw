---
title: "Legacy metadata.clawdbot warning"
sidebarTitle: "Legacy skill metadata"
summary: "openclaw skills check flags skills whose SKILL.md still uses the retired metadata.clawdbot block, and explains the rename fix."
---

# Legacy `metadata.clawdbot` warning

Since 2026.10.1, OpenClaw only reads the `metadata.openclaw` block in a
skill's `SKILL.md` frontmatter. A skill that still declares only the older
`metadata.clawdbot` block loads, but its declared requirements (`requires.bins`,
`requires.env`, `os`) and installer hints are ignored, so the skill can be
offered to the agent even when its prerequisites are missing and fail at use
time.

`openclaw skills check` now lists any installed skill whose parsed metadata
block contains a `clawdbot` mapping with no `openclaw` key:

```text
⚠ Legacy metadata.clawdbot is ignored:
  my-old-skill
  Fix: rename the metadata.clawdbot block to metadata.openclaw in each SKILL.md.
  OpenClaw does not rewrite the file; see docs/tools/skills.md.
```

With `--json`, the affected skill names are reported in a dedicated
`legacyMetadata` field; all other fields and summary counts are unchanged.

## Fix

Edit the affected `SKILL.md` and rename the `clawdbot` key to `openclaw`
inside the `metadata` block:

```yaml
metadata:
  openclaw:
    requires:
      bins: [my-tool]
```

OpenClaw never rewrites `SKILL.md` files; the rename is a manual, one-line
edit per skill. See [docs/tools/skills.md](../tools/skills.md) for the
metadata format.

This check is read-only: legacy `clawdbot` data is never used for
eligibility, requirements, or install options.
