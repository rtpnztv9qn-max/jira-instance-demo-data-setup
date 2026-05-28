import path from 'node:path';
import { chromium } from 'playwright';
import { mapCsvFields } from './fieldMapping.js';
import { config, requireConfigValue } from './config.js';
import { info } from '../utils/logger.js';

async function main() {
  requireConfigValue('JIRA_IMPORT_URL', config.jiraImportUrl);

  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext({
    storageState: config.authStatePath,
  });
  const page = await context.newPage();
  const csvPath = path.resolve(config.csvPath);

  await page.goto(config.jiraImportUrl);
  await page.setInputFiles('input[type="file"]', csvPath);
  await page.getByRole('button', { name: /next|continue/i }).click();
  await mapCsvFields(page);
  await page.getByRole('button', { name: /begin import|import|next|continue/i }).click();

  info('CSV import submitted', { csvPath });
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
