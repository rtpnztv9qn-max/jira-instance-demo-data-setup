export function buildEnterpriseReports({ config, projectKeys, dashboardId }) {
  const projectClause = projectKeys.map(key => `"${String(key).replace(/"/g, '\\"')}"`).join(', ');
  const baseJql = projectClause ? `project in (${projectClause})` : 'project is not EMPTY';
  const reports = [
    ['Sprint report', `${baseJql} AND sprint is not EMPTY`, 'Sprint scope, completion, spillover, and active delivery health.'],
    ['Velocity report', `${baseJql} AND issuetype in (Story, Task, Bug)`, 'Completed delivery volume and sprint-to-sprint trend proxy.'],
    ['SLA report', `${baseJql} AND priority in (Highest, High)`, 'High-severity service work and likely SLA exposure.'],
    ['Resolution time report', `${baseJql} AND statusCategory = Done`, 'Resolved work with realistic lifecycle timestamps.'],
    ['Workload report', `${baseJql} AND assignee is not EMPTY`, 'Cross-project workload by assignee and priority.'],
    ['Ticket aging report', `${baseJql} AND statusCategory != Done ORDER BY created ASC`, 'Open ticket age bands and stale work detection.'],
    ['Escalation report', `${baseJql} AND priority in (Highest, High) AND statusCategory != Done`, 'Escalation candidates across generated projects.'],
    ['Incident trend report', `${baseJql} AND issuetype = Bug ORDER BY created DESC`, 'Incident intake and resolution trend analysis based on generated support bugs.'],
  ];

  return reports.map(([name, jql, description]) => ({
    name,
    description,
    jql,
    issueSearchUrl: `/issues/?jql=${encodeURIComponent(jql)}`,
    dashboardId: dashboardId || null,
    persona: config.dashboardIntent?.profile || 'operational',
  }));
}
