# Case Study: Client Intake & Project Delivery CRM

**Stack:** Airtable (relational schema, formulas, rollups, automations) · JavaScript (Airtable scripting) · Make/Zapier integration points
**Type:** End-to-end workflow automation system
**Live demo:** Airtable base — *Client Intake & Project Delivery CRM*

---

## The problem this solves

Service businesses lose leads in the gap between "someone filled out our form" and "someone on our team did something about it." Inquiries sit unanswered, high-value prospects get the same treatment as tire-kickers, and when a deal closes, project setup is a manual scramble of copied checklists and forgotten steps.

This system closes that gap: every inquiry is scored, routed, and answered within minutes of arriving, and a won deal becomes a fully scaffolded project without anyone touching a keyboard.

## Architecture

Four tables, three automations, one audit trail:

**Leads → Projects → Tasks**, with an append-only **Activity Log** recording every automated decision.

1. **Intake.** A public form (Airtable form or Cognito Forms) writes directly to the Leads table. No manual data entry anywhere in the pipeline.

2. **Scoring & routing** (`lead-router.js`, fires on record creation). Each lead is scored 0–100 on weighted factors — budget tier, service fit, lead source. Score ≥ 70 routes to *Qualified*; budgets below the project floor route to *Nurture* and join a newsletter sequence; everything else waits in *New* for human review. The rule that fired is written to the Activity Log with the full weight breakdown, so the owner can always answer "why is this lead here?"

3. **Auto-acknowledgment.** High-priority leads get an immediate templated reply with a booking link — the two-minute response that wins deals against competitors answering the next morning.

4. **Won-deal conversion.** When a lead's stage hits *Won*, an automation creates the Project record, links the client, and generates the full task list from a phase template (Kickoff → Build → Review → Handoff). Contract value, dates, and deliverables carry over.

5. **Nightly health check** (`project-health-check.js`, scheduled). Compares each active project's task completion % (rollup across linked tasks) against timeline elapsed % (date math). Projects lagging more than 15 points go *At Risk*; more than 35, *Off Track*. Downgrades — and only downgrades — fire an alert to the Activity Log and a Slack webhook.

6. **Stale-lead sweep.** A daily check flags Qualified leads with no proposal after 72 hours and DMs the owner. Leads can be slow; forgetting them is optional.

## Schema decisions worth noting

- **Computed fields do the bookkeeping:** `Lead Age (days)` (formula), `Task Count` (count), `Tasks Done` (rollup over a helper formula), `% Complete` (formula over the rollup). Humans never maintain a number a formula can maintain.
- **The Activity Log is append-only** and written by every automation. It doubles as the debugging tool and the client-facing proof that the system did what it promised.
- **Configuration lives at the top of each script** — scoring weights, thresholds, routing rules — so tuning for a new client is a five-minute edit, not a rewrite.

## Two implementations: script vs. formula + no-code

The scoring engine exists in two forms, and knowing when each is right is the consulting skill this project demonstrates.

**Script version** (`lead-router.js`): full weighted scoring, routing, and audit-log writes in one automation. Requires Airtable Team plan for the "Run a script" action. Best when logic must write across tables or call external services.

**Free-tier version** (live in this base): the same weights expressed as a `SWITCH()` formula field (`Auto Score`), with routing handled by two condition-triggered no-code automations — score ≥ 70 → Qualified; budget below floor → Nurture. Formulas recalculate instantly and cost nothing, but can't write to other tables or send messages; the audit-log and auto-reply features need the script tier.

Both routing automations are deployed and verified live: a low-budget test lead auto-routed to Nurture, and a $15k+ referral lead auto-routed to Qualified, seconds after entry.

**A production gotcha worth knowing:** Airtable's "when record matches conditions" trigger fires only when a record *starts* matching — records that already matched when the automation was enabled never fire. Diagnosis: check the automation's run History; if empty, force a fresh match by toggling the watched field away and back. This exact issue was hit and resolved during deployment.

## Results (demo scenario)

Six leads across every pipeline stage; one converted project running eight templated tasks at 38% completion, tracking *On Track* against a 39-day timeline; five logged automation events demonstrating each rule firing. Response time from form submission to acknowledgment: under two minutes, versus a manual baseline measured in hours.

## What I'd extend for production

Slack webhooks on all alerts (stubbed in the health-check script), a QuickBooks integration to generate the invoice on deal close, and an owner dashboard interface with pipeline value by stage.
