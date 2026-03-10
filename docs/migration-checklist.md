# Rule Engine Migration Checklist

Date: 2026-02-16
Project: eBay Title Generator

## Step 1 Baseline Safety

Note: This workspace is currently not a Git repository (`.git` missing), so branch/commit baseline could not be created here.

## Regression Checklist (Manual)

- [ ] Import from Excel works
- [ ] Generate titles works
- [ ] Review/edit title works
- [ ] Export CSV works
- [ ] Export Excel works
- [ ] Send CSV via HTTP works

## Baseline Build

- [ ] `npm run build` passes

## Baseline Samples (Before Rule Engine Port)

Record at least 3 known examples to compare after migration:

1. Old title:
   SKU:
   New title:

2. Old title:
   SKU:
   New title:

3. Old title:
   SKU:
   New title:

## Notes

- Keep this file updated after each migration step.
- Run `npm run build` after each step to catch regressions early.

## Migration Progress

- [x] Step 2: Rule engine module ported from workflow logic (`RuleEngine`)
- [x] Step 3: Generation flow switched to rule engine
- [x] AI paths removed (logic-only algorithm mode)
- [x] Step 4: Source abstraction added (`ExcelSource`, `DatabaseSource`)
- [x] Step 5: Pipeline orchestration extracted (`PipelineRunner`)
- [x] Step 6: Export/delivery orchestration extracted (`ExportRunner`, `HttpDelivery`)
- [x] Step 7: HTTP delivery settings hardened (method/header/prefix/content-type + URL validation)
- [x] Step 8: Export history metadata enriched (format/count/status/method/header/content-type)
- [x] Step 9: Rule engine tests added and passing
