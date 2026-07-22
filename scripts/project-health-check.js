/**
 * Nightly Project Health Check
 * ----------------------------
 * Trigger: Scheduled (daily, e.g. 6:00 AM)
 * Base: Client Intake & Project Delivery CRM
 *
 * What it does:
 *  For every active project, compares task completion % against timeline
 *  elapsed % and sets the Health field:
 *    On Track  — completion keeping pace with the calendar (within 15 pts)
 *    At Risk   — completion lagging the calendar by 15–35 pts
 *    Off Track — lagging by more than 35 pts, or past due and unfinished
 *  Any status downgrade writes an Alert to [Activity Log] (in production,
 *  also a Slack webhook — stub included below).
 *
 * Why a script:
 *  "% done vs % of schedule elapsed" needs date math across linked records —
 *  beyond formula fields' reach once you want alerts only on *changes*.
 */

const ACTIVE_STATUSES = ['Kickoff', 'In Progress', 'Client Review'];
const AT_RISK_GAP = 15;   // percentage points behind schedule
const OFF_TRACK_GAP = 35;

const projectsTable = base.getTable('Projects');
const logTable = base.getTable('Activity Log');

const projects = await projectsTable.selectRecordsAsync({
  fields: ['Project Name', 'Status', 'Start Date', 'Target Delivery', '% Complete', 'Health'],
});

const today = new Date();
let changed = 0;

for (const project of projects.records) {
  const status = project.getCellValueAsString('Status');
  if (!ACTIVE_STATUSES.includes(status)) continue;

  const start = new Date(project.getCellValue('Start Date'));
  const end = new Date(project.getCellValue('Target Delivery'));
  if (isNaN(start) || isNaN(end) || end <= start) continue;

  const pctComplete = project.getCellValue('% Complete') ?? 0;
  const totalDays = (end - start) / 86400000;
  const elapsedDays = Math.max(0, (today - start) / 86400000);
  const pctElapsed = Math.min(100, (elapsedDays / totalDays) * 100);

  const gap = pctElapsed - pctComplete;
  let health;
  if (today > end && pctComplete < 100) health = 'Off Track';
  else if (gap > OFF_TRACK_GAP) health = 'Off Track';
  else if (gap > AT_RISK_GAP) health = 'At Risk';
  else health = 'On Track';

  const previous = project.getCellValueAsString('Health');
  if (health === previous) continue;

  await projectsTable.updateRecordAsync(project.id, { 'Health': { name: health } });
  changed++;

  // Alert only on downgrades — nobody needs a ping for good news at 6 AM.
  const rank = { 'On Track': 0, 'At Risk': 1, 'Off Track': 2 };
  if (rank[health] > (rank[previous] ?? 0)) {
    await logTable.createRecordAsync({
      'Event': `Health downgrade: '${project.getCellValueAsString('Project Name')}' ${previous || 'unset'} -> ${health}`,
      'Event Type': { name: 'Alert Fired' },
      'Timestamp': new Date().toISOString(),
      'Details': `Timeline ${pctElapsed.toFixed(0)}% elapsed vs ${pctComplete}% of tasks complete (gap ${gap.toFixed(0)} pts).`,
    });

    // Production Slack hook (enable in client deployments):
    // await fetch(SLACK_WEBHOOK_URL, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ text: `⚠️ ${project.getCellValueAsString('Project Name')} is ${health}` }),
    // });
  }
}

console.log(`Health check complete: ${changed} project(s) updated.`);
