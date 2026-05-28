import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { buildReleaseCatalogRecords } from './dataset/releaseVersions.js';
import { generateTickets } from './dataset/generateTickets.js';
import { writeRecordsCsv, writeTicketsCsv } from './utils/csvWriter.js';
import { info } from './utils/logger.js';

dotenv.config();

const app = express();
const port = Number.parseInt(process.env.PORT || '4000', 10);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function createReleaseHeaders() {
  return [
    { id: 'Version name', title: 'Version name' },
    { id: 'Released', title: 'Released' },
    { id: 'Release date', title: 'Release date' },
    { id: 'Description', title: 'Description' },
    { id: 'Issue count', title: 'Issue count' },
    { id: 'Linked issue keys', title: 'Linked issue keys' },
  ];
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'jira-demo-data-automation-worker',
  });
});

app.post('/generate-demo', async (req, res) => {
  try {
    const payload = req.body || {};
    const outputPath = payload.output || process.env.CSV_OUTPUT || 'exports/tickets.csv';
    const releaseOutputPath = payload.releaseOutput || process.env.RELEASE_CSV_OUTPUT || 'exports/release-versions.csv';
    const { tickets, releaseVersions } = generateTickets(payload);
    const ticketCsvPath = await writeTicketsCsv(tickets, outputPath);
    const releaseCsvPath = await writeRecordsCsv(
      buildReleaseCatalogRecords(releaseVersions),
      releaseOutputPath,
      createReleaseHeaders()
    );

    info('Generated demo dataset from API request', {
      ticketCount: tickets.length,
      project: payload.project,
      industry: payload.industry,
      dateRange: payload.dateRange,
    });

    res.json({
      success: true,
      ticketCount: tickets.length,
      ticketCsvPath,
      releaseCsvPath,
      releaseVersions: releaseVersions.map(version => ({
        name: version.name,
        released: version.released,
        releaseDate: version.releaseDate,
        issueCount: version.issueKeys.length,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

app.listen(port, () => {
  info(`Automation worker API listening on http://localhost:${port}`);
});
