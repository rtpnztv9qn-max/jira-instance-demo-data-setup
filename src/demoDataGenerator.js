const STATUS_PATTERNS = [
  { status: 'Resolved', weight: 4 },
  { status: 'In Progress', weight: 3 },
  { status: 'Under Review', weight: 2 },
  { status: 'To Do', weight: 2 },
  { status: 'Rejected', weight: 1 },
];

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toIso(date) {
  return date.toISOString();
}

function chooseWeightedStatus(index) {
  const expanded = STATUS_PATTERNS.flatMap(item => Array.from({ length: item.weight }, () => item.status));
  return expanded[index % expanded.length];
}

function clampDate(value, maxDate) {
  return value > maxDate ? maxDate : value;
}

function isResolvedLifecycleStatus(value) {
  const normalised = String(value || '').toLowerCase().replace(/[^a-z]/g, '');
  return ['resolved', 'rejected', 'done', 'closed', 'complete', 'completed'].includes(normalised);
}

export function createLifecycleForIssue({ index, priority, issueType, now = new Date(), maxAgeDays = 180 }) {
  const isIncident = String(issueType || '').toLowerCase().includes('incident') || String(issueType || '').toLowerCase().includes('bug');
  const isHighPriority = ['Highest', 'High', 'P1 - Critical', 'P2 - High'].includes(priority);
  const targetStatus = isHighPriority && index % 3 === 0 ? 'In Progress' : chooseWeightedStatus(index);
  const safeMaxAgeDays = Math.max(14, Number.parseInt(maxAgeDays, 10) || 180);
  const createdDaysAgo = isIncident
    ? 2 + ((index * 7) % Math.max(3, safeMaxAgeDays - 2))
    : 5 + ((index * 11) % Math.max(6, safeMaxAgeDays - 5));
  const createdAt = addDays(now, -createdDaysAgo);
  let updatedAt = addDays(createdAt, 1 + ((index * 3) % Math.max(createdDaysAgo, 2)));
  let resolvedAt = null;

  if (isResolvedLifecycleStatus(targetStatus)) {
    resolvedAt = addDays(createdAt, Math.max(1, Math.round(createdDaysAgo * (0.35 + ((index % 4) * 0.12)))));
    resolvedAt = clampDate(resolvedAt, now);
    updatedAt = resolvedAt;
  } else if (targetStatus === 'In Progress' || targetStatus === 'Under Review') {
    updatedAt = addDays(now, -(index % 8));
  } else {
    updatedAt = addDays(createdAt, index % 2);
  }

  updatedAt = clampDate(updatedAt, now);

  return {
    targetStatus,
    createdAt: toIso(createdAt),
    updatedAt: toIso(updatedAt),
    resolutionDate: resolvedAt ? toIso(resolvedAt) : null,
    ageDays: Math.max(0, Math.round((now - createdAt) / (1000 * 60 * 60 * 24))),
    slaBreached: isHighPriority ? index % 4 === 0 : index % 7 === 0,
    escalationRequired: isHighPriority && targetStatus !== 'Resolved',
  };
}

export function createTicketProperty({ environmentName, retentionPeriodDays, archiveRetentionDays = 365, lifecycle, projectKind }) {
  const generatedAt = new Date().toISOString();
  const retainUntil = addDays(new Date(lifecycle.createdAt || generatedAt), retentionPeriodDays);
  const deleteAfter = addDays(retainUntil, archiveRetentionDays);

  return {
    environmentName,
    projectKind,
    lifecycle,
    retention: {
      appliesTo: 'issue',
      generatedAt,
      retentionPeriodDays,
      retainUntil: toIso(retainUntil),
      archiveRetentionDays,
      deleteAfter: toIso(deleteAfter),
      archivedAt: null,
      action: 'archive-then-delete-ticket-data',
    },
  };
}

export function buildRealisticAssigneeIndex(issueIndex, projectIndex, teamSize = 6) {
  return (issueIndex + (projectIndex * 2)) % teamSize;
}
