const DOMAIN_NAME_PATTERNS = {
  SaaS: {
    business: ['Customer Support', 'Service Desk', 'IT Support', 'Trust Operations', 'Success Desk'],
    software: ['Core Platform', 'API Gateway', 'Billing Platform', 'Analytics Portal', 'Reliability Platform'],
  },
  Healthcare: {
    business: ['Patient Support', 'Service Desk', 'Clinical IT Support', 'Compliance Desk', 'Care Operations'],
    software: ['EHR Platform', 'FHIR Gateway', 'Telehealth App', 'Clinical Portal', 'Patient Mobile App'],
  },
  Banking: {
    business: ['IT Support', 'Service Desk', 'Payments Support', 'Fraud Operations', 'Card Services'],
    software: ['Core Platform', 'Mobile App', 'API Gateway', 'KYC Platform', 'Reporting Portal'],
  },
  Retail: {
    business: ['Customer Support', 'Service Desk', 'Store IT Support', 'Fulfillment Desk', 'Loyalty Support'],
    software: ['Web Platform', 'Mobile App', 'Inventory Platform', 'Warehouse Platform', 'Pricing Engine'],
  },
  Manufacturing: {
    business: ['IT Support', 'Service Desk', 'Plant Operations', 'Quality Support', 'Maintenance Desk'],
    software: ['MES Platform', 'IoT Gateway', 'Planning Platform', 'ERP Platform', 'Telemetry Portal'],
  },
};

function normalizeDomain(industry) {
  if (DOMAIN_NAME_PATTERNS[industry]) {
    return industry;
  }

  if (String(industry || '').toLowerCase().includes('commerce')) {
    return 'Retail';
  }

  return 'Banking';
}

export function createProjectKeySeed(text) {
  const seed = String(text || 'DEMO')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .join('')
    .replace(/[^A-Z]/g, '')
    .substring(0, 3);

  return seed || 'DEMO';
}

export function createDomainProjectIdentity({ industry, projectIndex, projectKind, environmentName, runLabel }) {
  const domain = normalizeDomain(industry);
  const pattern = DOMAIN_NAME_PATTERNS[domain];
  const laneNames = projectKind === 'software' ? pattern.software : pattern.business;
  const lane = laneNames[projectIndex % laneNames.length];
  const sequence = projectIndex + 1;
  const suffix = sequence > laneNames.length ? ` ${sequence}` : '';
  const environmentPrefix = String(environmentName || '').trim();
  const displayName = `${domain} ${lane}${suffix}`;
  const keyPrefix = createProjectKeySeed(lane);

  return {
    name: environmentPrefix ? `${environmentPrefix} - ${displayName}` : displayName,
    keyPrefix,
    shortName: displayName,
  };
}
