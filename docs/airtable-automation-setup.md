# Wiring Up the Automations (15 minutes)

The base and data are already live in your Airtable account. Airtable's API doesn't allow creating automations programmatically — they must be added once, by hand, in the base UI. Here's exactly how.

## 1. Lead scoring & routing

1. Open the base → **Automations** (top bar) → **Create automation**.
2. Name it `Lead scoring & routing`.
3. **Trigger:** "When record created" → Table: **Leads**.
4. **Action:** "Run a script".
5. In the script editor's left panel, add an **input variable**: name `recordId`, value = the trigger's *Airtable record ID*.
6. Paste in `scripts/lead-router.js`.
7. Test with the trigger's sample record, then turn the automation **On**.

## 2. Nightly health check

1. **Create automation** → name it `Nightly project health check`.
2. **Trigger:** "At a scheduled time" → daily, 6:00 AM.
3. **Action:** "Run a script" → paste `scripts/project-health-check.js` (no input variables needed).
4. Test, turn **On**.

## 3. Won-lead → project conversion (no-code version)

1. **Create automation** → name it `Convert won lead to project`.
2. **Trigger:** "When record matches conditions" → Table: **Leads**, condition: Stage is **Won**.
3. **Action:** "Create record" → Table: **Projects** → map Project Name from the lead's Company, link Client to the triggering record.
4. Optional: add a second script action to generate template tasks (happy to write that one next).

## 4. Auto-reply (needs Gmail/Outlook connection)

1. **Create automation** → trigger: "When record matches conditions" → Stage is **Qualified**.
2. **Action:** "Send email" (Airtable's built-in, or Gmail action after connecting your account).
3. Use the lead's Email field as recipient; template the body; then check **First Response Sent** with an "Update record" action.

## Verifying it works

Add a fake lead by hand with budget `$5k–$15k`, service `Workflow Automation`, source `Referral`. Within seconds it should score 85, jump to Qualified, and a new Activity Log row should explain why. That moment — watching it move on its own — is your first screen-recording for the portfolio.
