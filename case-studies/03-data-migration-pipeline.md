# Case Study: Legacy Data Migration Pipeline

**Stack:** Node.js (zero dependencies) · Airtable REST API (batched writes)
**Type:** Data migration with cleaning, deduplication, and quality reporting
**Live demo:** *Migrated Case Records* table in the CRM base · `migration/` in the repo

---

## The problem this solves

The scenario mirrors a real inquiry in this CRM's pipeline: a law firm with 8 years of case records trapped in a legacy system, exported to a CSV that no one dares import — inconsistent name formats ("Garcia, Maria" next to "MARIA GARCIA"), five different phone formats, four date formats, duplicate clients with conflicting details, and junk test rows salted through the file. Importing it raw would poison the new system on day one. Cleaning it by hand would take a week and still miss things.

## What the pipeline does

`migrate.js` — a single-file, zero-dependency Node script — takes the raw export and produces three artifacts:

**clean.json** — import-ready records. Names re-ordered and title-cased, emails lowercased and validated, phones reduced to digits and re-formatted (or dropped if not 10 digits), four date formats parsed to ISO, status values mapped to a controlled vocabulary.

**rejects.json** — every row that failed validation, *with the reason*. Nothing silently disappears; the client can review exactly what was excluded and why.

**report.json** — the data-quality audit, every fix counted.

## The run (verifiable in the live base)

| Metric | Count |
|---|---|
| Source rows | 113 |
| Clean records imported | 89 |
| Duplicates merged | 21 |
| Junk rows rejected (with reasons) | 3 |
| Phone numbers re-formatted | 74 |
| Dates normalized to ISO | 84 |
| Emails normalized | 63 |
| "Last, First" names flipped | 24 |
| Status values standardized | 74 |

All 89 records were imported to Airtable via the REST API in batches of 50 (the API's per-request ceiling) with typed fields — real dates, validated emails, single-select statuses — not text columns pretending.

## Design decisions worth defending

**Merge, don't drop, duplicates.** Legacy exports often split one client's information across duplicate rows — one has the phone, another has the matter reference. On a dedupe collision (normalized email as key), the pipeline merges field-by-field, keeping the most complete value. First-wins dedupe throws away data; merge recovers it. 21 records here kept information that naive dedupe would have lost.

**Count everything.** Every normalizer increments a counter, and the totals become the client-facing report. "We cleaned your data" is a shrug; "74 phone numbers re-formatted, 21 duplicates merged, 3 junk rows quarantined with reasons" is a deliverable.

**Zero dependencies.** The CSV parser (quoted fields included) is 20 lines. For a migration tool a client will run once and audit forever, no `node_modules` beats a dependency tree.

**Rejects are a report, not a black hole.** Migration trust dies the first time a client asks "where did row 47 go?" and no one knows. Here the answer is always in rejects.json.
