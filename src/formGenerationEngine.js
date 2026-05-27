const FORM_FIELD_IDS = {
  issueType: 'issue_type',
  priority: 'priority',
  affectedService: 'affected_service',
  impactScope: 'impact_scope',
  urgencyReason: 'urgency_reason',
  escalationOwner: 'escalation_owner',
  escalationWindow: 'escalation_window',
  incidentImpact: 'incident_impact',
  patientSafety: 'patient_safety',
  complianceImpact: 'compliance_impact',
};

export function buildDynamicJsmFormDesign({ projectName, industry }) {
  const isHealthcare = industry === 'Healthcare';
  const isBanking = industry === 'Banking';

  return {
    name: `${projectName} Smart Intake`,
    description: 'Dynamic intake form generated for enterprise demo workflows.',
    questions: [
      {
        id: FORM_FIELD_IDS.issueType,
        type: 'choice',
        label: 'Issue Type',
        required: true,
        options: ['Incident', 'Service Request', 'Change', 'Problem'],
      },
      {
        id: FORM_FIELD_IDS.priority,
        type: 'choice',
        label: 'Priority',
        required: true,
        options: ['Low', 'Medium', 'High', 'Critical'],
      },
      {
        id: FORM_FIELD_IDS.affectedService,
        type: 'choice',
        label: 'Affected Service',
        required: true,
        options: isBanking
          ? ['Payments', 'Cards', 'Mobile Banking', 'Risk Platform', 'Compliance Reporting']
          : isHealthcare
            ? ['Patient Portal', 'EHR', 'Claims', 'Telehealth', 'Lab Integration']
            : ['Customer Portal', 'API', 'Billing', 'Operations Console', 'Data Pipeline'],
      },
      {
        id: FORM_FIELD_IDS.impactScope,
        type: 'choice',
        label: 'Impact Scope',
        requiredWhen: { field: FORM_FIELD_IDS.issueType, equals: 'Incident' },
        visibleWhen: { field: FORM_FIELD_IDS.issueType, equals: 'Incident' },
        options: ['Single user', 'Team', 'Department', 'Enterprise customer base'],
      },
      {
        id: FORM_FIELD_IDS.urgencyReason,
        type: 'paragraph',
        label: 'Urgency Reason',
        requiredWhen: { field: FORM_FIELD_IDS.priority, oneOf: ['High', 'Critical'] },
        visibleWhen: { field: FORM_FIELD_IDS.priority, oneOf: ['High', 'Critical'] },
      },
      {
        id: FORM_FIELD_IDS.escalationOwner,
        type: 'shortText',
        label: 'Escalation Owner',
        requiredWhen: { field: FORM_FIELD_IDS.priority, equals: 'Critical' },
        visibleWhen: { field: FORM_FIELD_IDS.priority, oneOf: ['High', 'Critical'] },
      },
      {
        id: FORM_FIELD_IDS.escalationWindow,
        type: 'choice',
        label: 'Escalation Window',
        requiredWhen: { field: FORM_FIELD_IDS.priority, equals: 'Critical' },
        visibleWhen: { field: FORM_FIELD_IDS.priority, oneOf: ['High', 'Critical'] },
        options: ['15 minutes', '30 minutes', '1 hour', 'Same business day'],
      },
      {
        id: FORM_FIELD_IDS.incidentImpact,
        type: 'paragraph',
        label: 'Incident Impact',
        requiredWhen: { field: FORM_FIELD_IDS.issueType, equals: 'Incident' },
        visibleWhen: { field: FORM_FIELD_IDS.issueType, equals: 'Incident' },
      },
      {
        id: isHealthcare ? FORM_FIELD_IDS.patientSafety : FORM_FIELD_IDS.complianceImpact,
        type: 'choice',
        label: isHealthcare ? 'Patient Safety Impact' : 'Compliance Impact',
        requiredWhen: { field: FORM_FIELD_IDS.priority, oneOf: ['High', 'Critical'] },
        visibleWhen: { field: FORM_FIELD_IDS.priority, oneOf: ['High', 'Critical'] },
        options: isHealthcare ? ['None', 'Potential', 'Confirmed'] : ['None', 'Internal review', 'Regulatory deadline', 'Audit finding'],
      },
    ],
    logic: [
      {
        name: 'High priority escalation',
        when: { field: FORM_FIELD_IDS.priority, oneOf: ['High', 'Critical'] },
        then: {
          show: [FORM_FIELD_IDS.urgencyReason, FORM_FIELD_IDS.escalationOwner, FORM_FIELD_IDS.escalationWindow],
          require: [FORM_FIELD_IDS.urgencyReason],
        },
      },
      {
        name: 'Incident impact questions',
        when: { field: FORM_FIELD_IDS.issueType, equals: 'Incident' },
        then: {
          show: [FORM_FIELD_IDS.impactScope, FORM_FIELD_IDS.incidentImpact],
          require: [FORM_FIELD_IDS.impactScope, FORM_FIELD_IDS.incidentImpact],
        },
      },
      {
        name: 'Service dependent dropdowns',
        when: { field: FORM_FIELD_IDS.affectedService, exists: true },
        then: {
          optionsDependOn: FORM_FIELD_IDS.affectedService,
        },
      },
    ],
    workflowRules: [
      {
        when: { priority: 'Critical' },
        transitionHint: 'Escalate',
        reason: 'Critical requests need explicit escalation data before triage.',
      },
      {
        when: { issueType: 'Incident' },
        transitionHint: 'Major incident review',
        reason: 'Incident forms collect impact details required by the operational workflow.',
      },
    ],
  };
}

export function buildFormsApiPayload(formDesign, requestType) {
  const requestTypeId = typeof requestType === 'object' ? requestType?.id : requestType;
  const issueTypeId = typeof requestType === 'object' ? requestType?.issueTypeId : null;
  const guidanceText = [
    formDesign.description,
    'Use this request form to capture the operational details needed for triage.',
    `Suggested intake fields: ${formDesign.questions.map(question => question.label).join(', ')}.`,
    'High priority or incident work should include impact scope, urgency reason, and escalation owner before triage.',
  ].join(' ');

  return {
    design: {
      conditions: {},
      // Atlassian's Forms REST API accepts this documented project-form shape
      // consistently across tenants. The API currently rejects hand-authored
      // question type strings such as "choice", "shortText", and "paragraph" on
      // some sites, so we keep the generated form valid and attach a rich intake
      // guide instead of failing into the fallback path.
      layout: [
        {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: guidanceText,
                },
              ],
            },
          ],
        },
      ],
      questions: {},
      sections: {},
      settings: {
        language: 'en',
        name: formDesign.name,
        primaryLocale: 'en-US',
        submit: {
          lock: true,
          pdf: true,
        },
        translatedLocale: 'en-US',
        description: formDesign.description,
      },
    },
    publish: {
      jira: {
        issueCreateIssueTypeIds: issueTypeId ? [Number(issueTypeId)] : [],
        issueCreateRequestTypeIds: requestTypeId ? [Number(requestTypeId)] : [],
        recommendedIssueRequestTypeIds: requestTypeId ? [Number(requestTypeId)] : [],
        submitOnCreate: true,
        validateOnCreate: true,
      },
      portal: {
        portalRequestTypeIds: requestTypeId ? [Number(requestTypeId)] : [],
        submitOnCreate: true,
        validateOnCreate: true,
      },
    },
  };
}
