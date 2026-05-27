const PAGE_TITLES = [
  'Project Overview',
  'Runbooks',
  'Incident Management Guide',
  'SLA Documentation',
  'Sprint Retrospectives',
  'Team Processes',
  'Escalation Matrix',
  'Knowledge Base Articles',
];

function sanitizeSpaceKey(value) {
  return String(value || 'DEMO')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 10) || 'DEMO';
}

export function buildConfluenceSpaceDefinition(project, runLabel) {
  return {
    key: sanitizeSpaceKey(`${project.key}${String(runLabel || '').slice(-2)}`),
    name: `${project.name} Knowledge Hub`,
    description: `Enterprise documentation hub generated for Jira project ${project.key}.`,
  };
}

export function buildConfluencePages(project, reports = [], automationBlueprints = []) {
  return PAGE_TITLES.map(title => ({
    title,
    body: buildPageBody(title, project, reports, automationBlueprints),
  }));
}

function buildPageBody(title, project, reports, automationBlueprints) {
  const reportList = reports
    .map(report => `<li><strong>${report.name}</strong>: ${report.description}</li>`)
    .join('');
  const automationList = automationBlueprints
    .map(rule => `<li><strong>${rule.name}</strong>: ${rule.trigger} -> ${rule.action}</li>`)
    .join('');

  return [
    `<h1>${title}</h1>`,
    `<p>This page was generated for <strong>${project.key}</strong> as part of the enterprise Jira demo environment.</p>`,
    `<h2>Operating Context</h2>`,
    `<p>The project includes realistic work intake, escalation handling, sprint activity, and reporting signals for executive demonstrations.</p>`,
    `<h2>Connected Jira Project</h2>`,
    `<p>Project key: <ac:structured-macro ac:name="jira"><ac:parameter ac:name="key">${project.key}</ac:parameter></ac:structured-macro></p>`,
    `<h2>Reports</h2>`,
    `<ul>${reportList}</ul>`,
    `<h2>Automation Blueprints</h2>`,
    `<ul>${automationList}</ul>`,
  ].join('');
}
