export const RETENTION_OPTIONS = [180];
export const TICKET_RETENTION_PROPERTY = 'cprimeDemoTicketLifecycle';
export const ARCHIVE_RETENTION_DAYS = 365;

export function normalizeRetentionPeriod(value, fallback = 90) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return RETENTION_OPTIONS.reduce((closest, option) => (
    Math.abs(option - parsed) < Math.abs(closest - parsed) ? option : closest
  ), RETENTION_OPTIONS[0]);
}

export function createRetentionSummary(retentionPeriodDays) {
  const labels = {
    180: '6 months',
  };

  return {
    periodDays: retentionPeriodDays,
    label: labels[retentionPeriodDays] || `${retentionPeriodDays} days`,
    appliesTo: 'tickets',
    archiveRetentionDays: ARCHIVE_RETENTION_DAYS,
    archiveLabel: '1 year archived',
    dashboardPolicy: 'refresh-from-active-filter-without-dashboard-retention',
  };
}

export function buildRetentionJql(projectKeys, retentionPeriodDays) {
  const projectClause = projectKeys.map(key => `"${String(key).replace(/"/g, '\\"')}"`).join(', ');

  if (!projectClause) {
    return null;
  }

  return `project in (${projectClause}) AND created <= -${retentionPeriodDays}d`;
}
