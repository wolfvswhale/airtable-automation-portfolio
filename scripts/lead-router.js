/**
 * Lead Scoring & Routing Automation
 * ---------------------------------
 * Trigger: When a record is created in [Leads]
 * Base: Client Intake & Project Delivery CRM
 *
 * What it does:
 *  1. Scores the new lead 0–100 from budget tier, service fit, and source.
 *  2. Routes it: score >= 70 -> Qualified, budget below floor -> Nurture.
 *  3. Writes an audit entry to [Activity Log] so every decision is traceable.
 *
 * Why a script instead of no-code conditions:
 *  - Weighted scoring with multiple factors outgrows Airtable's condition UI fast.
 *  - One script = one place to tune the rules; the log records which rule fired.
 */

// ---- Configuration (tune per client) ----------------------------------------
const SCORE_WEIGHTS = {
  budget: { '$15k+': 45, '$5k–$15k': 40, '$2k–$5k': 25, 'Under $2k': 5 },
  service: {
    'Workflow Automation': 30,
    'CRM Build': 30,
    'Data Migration': 25,
    'Reporting & Dashboards': 20,
    'Other': 5,
  },
  source: { 'Referral': 15, 'Website Form': 10, 'LinkedIn': 8, 'Cold Outreach': 3, 'Other': 3 },
};
const QUALIFY_THRESHOLD = 70;
const NURTURE_BUDGETS = ['Under $2k'];

// ---- Input from trigger -----------------------------------------------------
const inputConfig = input.config(); // expects: recordId
const leadsTable = base.getTable('Leads');
const logTable = base.getTable('Activity Log');

const lead = await leadsTable.selectRecordAsync(inputConfig.recordId, {
  fields: ['Lead Name', 'Budget Range', 'Service Needed', 'Source', 'Stage'],
});
if (!lead) throw new Error(`Lead ${inputConfig.recordId} not found`);

// ---- Score ------------------------------------------------------------------
const budget = lead.getCellValueAsString('Budget Range');
const service = lead.getCellValueAsString('Service Needed');
const source = lead.getCellValueAsString('Source');

const score =
  (SCORE_WEIGHTS.budget[budget] ?? 0) +
  (SCORE_WEIGHTS.service[service] ?? 0) +
  (SCORE_WEIGHTS.source[source] ?? 0);

// ---- Route ------------------------------------------------------------------
let stage;
let ruleFired;
if (NURTURE_BUDGETS.includes(budget)) {
  stage = 'Nurture';
  ruleFired = `budget '${budget}' below project floor`;
} else if (score >= QUALIFY_THRESHOLD) {
  stage = 'Qualified';
  ruleFired = `score ${score} >= ${QUALIFY_THRESHOLD}`;
} else {
  stage = 'New';
  ruleFired = `score ${score} below threshold — left for manual review`;
}

await leadsTable.updateRecordAsync(lead.id, {
  'Priority Score': score,
  'Stage': stage,
});

// ---- Audit trail ------------------------------------------------------------
await logTable.createRecordAsync({
  'Event': `Lead '${lead.getCellValueAsString('Lead Name')}' scored ${score}, routed to ${stage}`,
  'Event Type': { name: 'Lead Routed' },
  'Timestamp': new Date().toISOString(),
  'Details': `Rule fired: ${ruleFired}. Weights — budget: ${SCORE_WEIGHTS.budget[budget] ?? 0}, service: ${SCORE_WEIGHTS.service[service] ?? 0}, source: ${SCORE_WEIGHTS.source[source] ?? 0}.`,
});

console.log(`Routed '${lead.getCellValueAsString('Lead Name')}' -> ${stage} (score ${score})`);
