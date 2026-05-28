export const csvToJiraFieldMap = {
  'Issue key': 'Issue key',
  'Issue id': 'Issue id',
  'Project key': 'Project key',
  Summary: 'Summary',
  'Issue Type': 'Issue Type',
  Priority: 'Priority',
  Status: 'Status',
  Created: 'Created',
  Resolved: 'Resolved',
  'Fix Version/s': 'Fix Version/s',
  'Affects Version/s': 'Affects Version/s',
  'Component/s': 'Component/s',
  Team: 'Team',
  Causes: 'Causes',
  Relates: 'Relates',
  Blocks: 'Blocks',
  Description: 'Description',
  Labels: 'Labels',
};

export async function mapCsvFields(page) {
  for (const [csvColumn, jiraField] of Object.entries(csvToJiraFieldMap)) {
    const row = page.locator('tr', { hasText: csvColumn }).first();
    const select = row.locator('select').first();

    if (await select.count()) {
      await select.selectOption({ label: jiraField });
    }
  }
}
