export function buildAutomationBlueprints(projectKeys) {
  const scope = projectKeys.join(', ');

  return [
    {
      name: 'Email assignee when priority is high',
      trigger: 'Priority changed or issue created',
      condition: 'Priority is Highest, High, or Critical and assignee is not empty',
      action: 'Send email to Assignee with the issue key, summary, priority, and due date',
      emailSubject: 'High priority issue assigned: {{issue.key}}',
      emailBody: [
        'Hi {{issue.assignee.displayName}},',
        '',
        '{{issue.key}} is {{issue.priority.name}} priority and is assigned to you.',
        '',
        'Summary: {{issue.summary}}',
        'Status: {{issue.status.name}}',
        'Due date: {{issue.duedate}}',
        'Link: {{issue.url}}',
      ].join('\n'),
      scope,
    },
    {
      name: 'Transition request when deployment status changes',
      trigger: 'Deployment status changed',
      condition: 'Deployment status is Completed, Failed, or Cancelled',
      action: 'Transition the related request according to the deployment result',
      scope,
    },
  ];
}
