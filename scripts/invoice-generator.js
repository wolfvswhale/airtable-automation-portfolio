/**
 * Milestone Invoice Generator
 * ---------------------------
 * Trigger: When a record is updated in [Projects] (watch the Status field)
 * Base: Client Intake & Project Delivery CRM
 *
 * What it does:
 *  Status -> Kickoff:    creates a 50% deposit invoice (Draft).
 *  Status -> Delivered:  creates the final balance invoice for whatever
 *                        remains unbilled (handles change orders correctly).
 *  Every invoice gets a sequential number (INV-YYYY-NNN), Net-14 terms,
 *  and an Activity Log entry.
 *
 * QuickBooks sync:
 *  This script owns the Airtable side. The QBO mirror travels over a
 *  webhook to Make/Zapier (payload below) which calls the QuickBooks
 *  "Create Invoice" module and writes the returned QBO Invoice ID back.
 *  Keeping the accounting write in middleware means OAuth tokens never
 *  live in the base — a security boundary clients should insist on.
 */

const DEPOSIT_PCT = 0.5;
const NET_DAYS = 14;
const WEBHOOK_URL = ''; // Make/Zapier webhook for the QBO mirror; empty = Airtable-only mode

const inputConfig = input.config(); // expects: recordId
const projectsTable = base.getTable('Projects');
const invoicesTable = base.getTable('Invoices');
const logTable = base.getTable('Activity Log');

const project = await projectsTable.selectRecordAsync(inputConfig.recordId, {
  fields: ['Project Name', 'Status', 'Contract Value', 'Invoiced Total'],
});
if (!project) throw new Error(`Project ${inputConfig.recordId} not found`);

const status = project.getCellValueAsString('Status');
const contractValue = project.getCellValue('Contract Value') ?? 0;
const invoicedTotal = project.getCellValue('Invoiced Total') ?? 0;

// ---- Decide what to bill ----------------------------------------------------
let milestone, amount;
if (status === 'Kickoff' && invoicedTotal === 0) {
  milestone = 'Deposit (50%)';
  amount = Math.round(contractValue * DEPOSIT_PCT * 100) / 100;
} else if (status === 'Delivered' && invoicedTotal < contractValue) {
  milestone = 'Final Balance';
  amount = Math.round((contractValue - invoicedTotal) * 100) / 100;
} else {
  console.log(`No billing rule for status '${status}' (invoiced ${invoicedTotal}/${contractValue}) — exiting.`);
  return;
}

// ---- Sequential invoice number ---------------------------------------------
const year = new Date().getFullYear();
const existing = await invoicesTable.selectRecordsAsync({ fields: ['Invoice #'] });
const seq = existing.records
  .map(r => r.getCellValueAsString('Invoice #'))
  .filter(n => n.startsWith(`INV-${year}-`))
  .map(n => parseInt(n.split('-')[2], 10) || 0)
  .reduce((max, n) => Math.max(max, n), 0) + 1;
const invoiceNumber = `INV-${year}-${String(seq).padStart(3, '0')}`;

// ---- Create the invoice record ----------------------------------------------
const issueDate = new Date();
const dueDate = new Date(issueDate.getTime() + NET_DAYS * 86400000);

const invoiceId = await invoicesTable.createRecordAsync({
  'Invoice #': invoiceNumber,
  'Milestone': { name: milestone },
  'Amount': amount,
  'Status': { name: 'Draft' },
  'Issue Date': issueDate.toISOString().slice(0, 10),
  'Due Date': dueDate.toISOString().slice(0, 10),
  'Project': [{ id: project.id }],
  'Notes': `Auto-generated on status '${status}'.`,
});

// ---- Mirror to QuickBooks via middleware webhook ----------------------------
if (WEBHOOK_URL) {
  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      airtableInvoiceId: invoiceId,
      invoiceNumber,
      amount,
      dueDate: dueDate.toISOString().slice(0, 10),
      projectName: project.getCellValueAsString('Project Name'),
      memo: `${milestone} — ${project.getCellValueAsString('Project Name')}`,
    }),
  });
  // The Make/Zapier scenario calls QBO Create Invoice, then PATCHes the
  // Airtable record's 'QBO Invoice ID' field with the returned Id.
}

// ---- Audit trail ------------------------------------------------------------
await logTable.createRecordAsync({
  'Event': `${invoiceNumber} (${milestone}, $${amount}) generated for '${project.getCellValueAsString('Project Name')}'`,
  'Event Type': { name: 'Project Created' },
  'Timestamp': new Date().toISOString(),
  'Details': `Billing rule: status '${status}'. Invoiced ${invoicedTotal + amount} of ${contractValue} contract value.${WEBHOOK_URL ? ' Mirrored to QuickBooks.' : ' Airtable-only mode (no webhook configured).'}`,
});

console.log(`Created ${invoiceNumber}: ${milestone} for $${amount}`);
