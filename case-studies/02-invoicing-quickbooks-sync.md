# Case Study: Milestone Invoicing with QuickBooks Sync

**Stack:** Airtable (linked billing schema, rollups) · JavaScript (Airtable scripting) · QuickBooks Online via Make/Zapier middleware
**Type:** Revenue operations automation
**Live demo:** Invoices table in the *Client Intake & Project Delivery CRM* base

---

## The problem this solves

Small service businesses leak revenue in two specific places: deposits that never get invoiced because the project already started, and final balances that go out weeks late because "send the invoice" lived in someone's head. Both are timing failures, and timing failures are what automation is for.

This system bills on project milestones automatically: a 50% deposit invoice the moment a project kicks off, and the remaining balance the moment it's delivered — with QuickBooks Online as the accounting system of record.

## Architecture

An **Invoices** table joins the existing CRM's Projects table. Three design choices carry the weight:

1. **Milestone billing as code** (`invoice-generator.js`). Fires on project status changes. Kickoff with nothing yet billed → deposit invoice at 50% of contract value. Delivered with an unbilled balance → final invoice for *whatever remains* — computed against the invoiced-to-date rollup, so change orders and adjusted deposits bill correctly instead of assuming a clean 50/50 split.

2. **Sequential numbering that survives concurrency.** Invoice numbers (INV-2026-001…) are derived by scanning existing numbers for the current year and incrementing — not by counting records, which breaks the first time someone deletes a draft.

3. **The QuickBooks write lives in middleware, not the base.** The script posts a webhook payload to Make/Zapier, which calls QBO's Create Invoice and writes the returned QuickBooks ID back into Airtable's `QBO Invoice ID` field. Two systems, one reconciliation key. Keeping OAuth tokens out of Airtable scripts is a security boundary worth defending to clients — anyone with base access can read a script.

## The numbers the owner actually watches

On Projects: **Invoiced Total** (rollup over linked invoices) and **Unbilled Balance** (contract value minus invoiced). Unbilled Balance is the revenue-leakage detector — a Delivered project with a nonzero Unbilled Balance is money sitting on the table, and a one-condition automation can flag exactly that.

## Demo state

The Brightline Dental project ($9,500 contract) carries both invoice types: INV-2026-001, the $4,750 deposit, generated at kickoff and paid; INV-2026-002, the $4,750 balance, pre-staged as a draft that sends on delivery. Project rollups show $9,500 invoiced, $0 unbilled.

## Free-tier vs. script tier

As with the intake CRM, the script requires Airtable's Team plan. The free-tier fallback: "when record matches conditions" automations (status = Kickoff → create Invoices record with fixed fields) cover the deposit case, though computed amounts and sequential numbering genuinely need the script — this project is where the paid tier earns its fee.
