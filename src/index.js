import Resolver from '@forge/resolver';
import api, { assumeTrustedRoute, route } from '@forge/api';

const resolver = new Resolver();

// ── HELPERS ──────────────────────────────────────────────────────────────────

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getDateString(daysFromNow) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
}

function getStatusFromDueDate(dueDateStr) {
  const today = new Date();
  const dueDate = new Date(dueDateStr);
  const diffDays = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));
  if (diffDays < -30) return 'Done';
  if (diffDays < 0) return 'In Progress';
  if (diffDays < 30) return 'In Progress';
  return 'To Do';
}

function getPriorityName(p) {
  return { 'P1 - Critical': 'Highest', 'P2 - High': 'High', 'P3 - Medium': 'Medium', 'P4 - Low': 'Lowest' }[p] || 'Medium';
}

function buildADF(paragraphs) {
  return {
    version: 1, type: 'doc',
    content: paragraphs.map(text => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  };
}

function generateKey(prefix, index) {
  // Jira keys: uppercase letters only, 2-10 chars
  const base = prefix.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 5);
  const suffix = String(index) + String(Math.floor(Date.now() / 1000) % 99 + 1);
  return (base + suffix).substring(0, 10);
}

function pad(num) {
  return num > 9 ? String(num) : '0' + num;
}

function formatDateForJira(dateStr) {
  return dateStr + 'T00:00:00.000Z';
}

// ── INDUSTRY CONTENT ──────────────────────────────────────────────────────────

function getContent(industry) {
  const all = {
    Banking: {
      incidents: [
        { title: 'Core banking system outage affecting all transactions', priority: 'P1 - Critical' },
        { title: 'Payment gateway failure - customers unable to transfer funds', priority: 'P1 - Critical' },
        { title: 'Mobile banking app login failures for 40% of users', priority: 'P2 - High' },
        { title: 'ATM network degradation in northern region', priority: 'P2 - High' },
        { title: 'Slow response time on internet banking portal', priority: 'P3 - Medium' },
        { title: 'SMS OTP delivery delays affecting authentication', priority: 'P3 - Medium' },
        { title: 'Credit card transaction processing delays', priority: 'P2 - High' },
        { title: 'Online account opening form submission errors', priority: 'P3 - Medium' },
        { title: 'SWIFT payment processing failures for international transfers', priority: 'P1 - Critical' },
        { title: 'Customer data sync issues between mobile and web', priority: 'P3 - Medium' },
        { title: 'Loan management system performance degradation', priority: 'P2 - High' },
        { title: 'Minor UI issues on account statement page', priority: 'P4 - Low' },
        { title: 'FX rate feed not updating in trading platform', priority: 'P2 - High' },
        { title: 'Regulatory reporting system timeout errors', priority: 'P2 - High' },
        { title: 'Two-factor authentication service intermittent failures', priority: 'P2 - High' },
        { title: 'Account balance discrepancy reported by premium customers', priority: 'P1 - Critical' },
        { title: 'Card management portal inaccessible for branch staff', priority: 'P3 - Medium' },
        { title: 'Cheque processing system delayed by 24 hours', priority: 'P3 - Medium' },
        { title: 'Risk scoring engine returning incorrect results', priority: 'P1 - Critical' },
        { title: 'Customer notification emails not being delivered', priority: 'P3 - Medium' },
      ],
      epics: ['Core Banking API Modernization', 'Customer Digital Onboarding', 'Payment Processing Engine', 'Regulatory Compliance Framework'],
      issues: [
        { title: 'Implement real-time payment notification system', type: 'Story' },
        { title: 'Migrate legacy COBOL modules to Java microservices', type: 'Task' },
        { title: 'Build customer KYC verification workflow', type: 'Story' },
        { title: 'Fix transaction rollback bug in payment gateway', type: 'Bug' },
        { title: 'Implement AML screening integration', type: 'Story' },
        { title: 'Design open banking API endpoints', type: 'Story' },
        { title: 'Build credit scoring algorithm integration', type: 'Task' },
        { title: 'Implement SWIFT message processing module', type: 'Story' },
        { title: 'Fix race condition in concurrent transaction processing', type: 'Bug' },
        { title: 'Build regulatory reporting dashboard', type: 'Story' },
        { title: 'Implement multi-currency account support', type: 'Story' },
        { title: 'Design fraud detection rule engine', type: 'Task' },
        { title: 'Build mobile banking biometric authentication', type: 'Story' },
        { title: 'Implement GDPR data export functionality', type: 'Task' },
        { title: 'Fix interest calculation rounding error', type: 'Bug' },
        { title: 'Build loan origination workflow', type: 'Story' },
        { title: 'Implement card tokenization service', type: 'Story' },
        { title: 'Design customer 360 view dashboard', type: 'Task' },
        { title: 'Build automated reconciliation system', type: 'Story' },
        { title: 'Implement digital signature for loan documents', type: 'Story' },
        { title: 'Fix session timeout issue on mobile app', type: 'Bug' },
        { title: 'Build branch locator API integration', type: 'Task' },
        { title: 'Implement standing order management module', type: 'Story' },
        { title: 'Design API gateway rate limiting policy', type: 'Task' },
        { title: 'Build customer feedback collection system', type: 'Story' },
        { title: 'Implement transaction dispute workflow', type: 'Story' },
        { title: 'Fix PDF statement generation memory leak', type: 'Bug' },
        { title: 'Build relationship manager portal', type: 'Story' },
        { title: 'Implement beneficiary management system', type: 'Story' },
        { title: 'Design data archival strategy for transactions', type: 'Task' },
      ],
    },
    Healthcare: {
      incidents: [
        { title: 'Electronic Health Record system unresponsive', priority: 'P1 - Critical' },
        { title: 'Patient portal login failures affecting appointments', priority: 'P2 - High' },
        { title: 'Medical imaging system PACS server down', priority: 'P1 - Critical' },
        { title: 'Pharmacy dispensing system errors', priority: 'P1 - Critical' },
        { title: 'HL7 message integration failures with lab system', priority: 'P2 - High' },
        { title: 'Appointment scheduling system performance issues', priority: 'P3 - Medium' },
        { title: 'Clinical decision support alerts not triggering', priority: 'P2 - High' },
        { title: 'Patient wristband barcode scanner connectivity loss', priority: 'P2 - High' },
        { title: 'Insurance eligibility verification system timeout', priority: 'P3 - Medium' },
        { title: 'Telemedicine platform video call quality degradation', priority: 'P3 - Medium' },
        { title: 'Lab results not syncing to patient records', priority: 'P2 - High' },
        { title: 'Nurse call system integration failure', priority: 'P2 - High' },
        { title: 'Patient discharge process system errors', priority: 'P3 - Medium' },
        { title: 'Radiology report delivery delays', priority: 'P3 - Medium' },
        { title: 'ICU monitoring system data feed interruption', priority: 'P1 - Critical' },
      ],
      epics: ['Patient Data Management', 'Clinical Workflow Automation', 'Telehealth Platform', 'Compliance and Security'],
      issues: [
        { title: 'Build patient intake digital form workflow', type: 'Story' },
        { title: 'Implement HL7 FHIR API for lab results', type: 'Story' },
        { title: 'Fix appointment reminder notification bug', type: 'Bug' },
        { title: 'Design clinical decision support rule engine', type: 'Task' },
        { title: 'Build medication reconciliation module', type: 'Story' },
        { title: 'Implement HIPAA audit trail system', type: 'Story' },
        { title: 'Build telehealth video consultation module', type: 'Story' },
        { title: 'Fix patient record merge duplicate issue', type: 'Bug' },
        { title: 'Implement insurance pre-authorization workflow', type: 'Story' },
        { title: 'Design patient risk stratification algorithm', type: 'Task' },
        { title: 'Build clinical trial enrollment module', type: 'Story' },
        { title: 'Implement drug interaction alert system', type: 'Story' },
        { title: 'Fix radiology image viewer loading bug', type: 'Bug' },
        { title: 'Build patient discharge planning workflow', type: 'Story' },
        { title: 'Design population health analytics dashboard', type: 'Task' },
      ],
    },
    Retail: {
      incidents: [
        { title: 'E-commerce platform checkout failure during peak sale', priority: 'P1 - Critical' },
        { title: 'Inventory management system sync failure', priority: 'P2 - High' },
        { title: 'Payment processor timeout causing failed transactions', priority: 'P1 - Critical' },
        { title: 'Product search returning incorrect results', priority: 'P2 - High' },
        { title: 'Order management system processing delays', priority: 'P2 - High' },
        { title: 'Customer loyalty points not updating correctly', priority: 'P3 - Medium' },
        { title: 'Mobile app crashes on product detail page', priority: 'P3 - Medium' },
        { title: 'Warehouse management system barcode scan failures', priority: 'P2 - High' },
        { title: 'Email marketing platform delivery failures', priority: 'P3 - Medium' },
        { title: 'Returns processing system errors', priority: 'P3 - Medium' },
        { title: 'Flash sale pricing engine not applying discounts', priority: 'P1 - Critical' },
        { title: 'Click and collect system not confirming orders', priority: 'P2 - High' },
        { title: 'Gift card redemption system failures', priority: 'P3 - Medium' },
        { title: 'Product review system not saving submissions', priority: 'P4 - Low' },
        { title: 'Supplier portal login issues for vendors', priority: 'P3 - Medium' },
      ],
      epics: ['E-commerce Platform', 'Inventory Management', 'Customer Experience', 'Supply Chain Integration'],
      issues: [
        { title: 'Build product recommendation engine', type: 'Story' },
        { title: 'Implement real-time inventory tracking', type: 'Story' },
        { title: 'Fix cart abandonment email trigger bug', type: 'Bug' },
        { title: 'Design supplier portal integration', type: 'Task' },
        { title: 'Build customer loyalty programme module', type: 'Story' },
        { title: 'Implement AI-powered search functionality', type: 'Story' },
        { title: 'Build returns and refunds workflow', type: 'Story' },
        { title: 'Fix product image loading performance issue', type: 'Bug' },
        { title: 'Implement omnichannel order management', type: 'Story' },
        { title: 'Design demand forecasting algorithm', type: 'Task' },
        { title: 'Build flash sale campaign management tool', type: 'Story' },
        { title: 'Implement dynamic pricing engine', type: 'Story' },
        { title: 'Fix checkout session expiry bug', type: 'Bug' },
        { title: 'Build warehouse pick and pack optimisation', type: 'Story' },
        { title: 'Design customer segmentation model', type: 'Task' },
      ],
    },
    SaaS: {
      incidents: [
        { title: 'API gateway returning 503 errors for enterprise customers', priority: 'P1 - Critical' },
        { title: 'Authentication service OAuth token validation failures', priority: 'P1 - Critical' },
        { title: 'Data pipeline processing delays exceeding SLA', priority: 'P2 - High' },
        { title: 'Webhook delivery failures for critical integrations', priority: 'P2 - High' },
        { title: 'Dashboard loading times exceeding 10 seconds', priority: 'P2 - High' },
        { title: 'Tenant data isolation breach detected', priority: 'P1 - Critical' },
        { title: 'Billing system failing to process subscription renewals', priority: 'P2 - High' },
        { title: 'Email notification service queue backlog', priority: 'P3 - Medium' },
        { title: 'Search functionality returning stale results', priority: 'P3 - Medium' },
        { title: 'Mobile SDK crash on iOS 17.4 update', priority: 'P3 - Medium' },
        { title: 'SSO integration failures for enterprise customers', priority: 'P2 - High' },
        { title: 'Report generation timing out for large datasets', priority: 'P2 - High' },
        { title: 'File upload service rejecting valid file types', priority: 'P3 - Medium' },
        { title: 'Audit log entries missing for compliance review', priority: 'P2 - High' },
        { title: 'Workspace invitation emails not being delivered', priority: 'P3 - Medium' },
      ],
      epics: ['Platform Scalability', 'Developer Experience', 'Enterprise Features', 'Security and Compliance'],
      issues: [
        { title: 'Implement horizontal pod autoscaling', type: 'Story' },
        { title: 'Build self-serve onboarding workflow', type: 'Story' },
        { title: 'Fix memory leak in data processing worker', type: 'Bug' },
        { title: 'Design multi-region failover architecture', type: 'Task' },
        { title: 'Build advanced analytics dashboard', type: 'Story' },
        { title: 'Implement SOC2 audit logging', type: 'Story' },
        { title: 'Build webhook management interface', type: 'Story' },
        { title: 'Fix OAuth token refresh race condition', type: 'Bug' },
        { title: 'Implement custom role-based access control', type: 'Story' },
        { title: 'Design API versioning strategy', type: 'Task' },
        { title: 'Build usage analytics and billing dashboard', type: 'Story' },
        { title: 'Implement data export and portability feature', type: 'Story' },
        { title: 'Fix pagination bug in list endpoints', type: 'Bug' },
        { title: 'Build SSO SAML integration module', type: 'Story' },
        { title: 'Design disaster recovery runbook', type: 'Task' },
      ],
    },
    Manufacturing: {
      incidents: [
        { title: 'MES production line monitoring system offline', priority: 'P1 - Critical' },
        { title: 'ERP system integration failures with shop floor', priority: 'P1 - Critical' },
        { title: 'Quality control sensor data feed interruption', priority: 'P2 - High' },
        { title: 'Supply chain visibility platform data sync failure', priority: 'P2 - High' },
        { title: 'Predictive maintenance alerts not triggering', priority: 'P2 - High' },
        { title: 'Barcode scanning system failures on assembly line', priority: 'P2 - High' },
        { title: 'SCADA system communication timeout with PLCs', priority: 'P1 - Critical' },
        { title: 'Inventory reorder system not generating purchase orders', priority: 'P3 - Medium' },
        { title: 'Worker safety monitoring system alert failures', priority: 'P2 - High' },
        { title: 'Production scheduling system performance degradation', priority: 'P3 - Medium' },
        { title: 'Digital work instruction system unavailable on shop floor', priority: 'P2 - High' },
        { title: 'OEE reporting system showing incorrect data', priority: 'P2 - High' },
        { title: 'Supplier delivery notification system failures', priority: 'P3 - Medium' },
        { title: 'Energy monitoring dashboard not updating', priority: 'P3 - Medium' },
        { title: 'Finished goods labelling system printer errors', priority: 'P3 - Medium' },
      ],
      epics: ['Smart Manufacturing Platform', 'Supply Chain Optimization', 'Quality Management System', 'Predictive Maintenance'],
      issues: [
        { title: 'Build real-time production line monitoring dashboard', type: 'Story' },
        { title: 'Implement IoT sensor data ingestion pipeline', type: 'Story' },
        { title: 'Fix OEE calculation rounding error', type: 'Bug' },
        { title: 'Design digital twin integration architecture', type: 'Task' },
        { title: 'Build supplier quality scorecard module', type: 'Story' },
        { title: 'Implement predictive maintenance ML model', type: 'Story' },
        { title: 'Build production scheduling optimisation engine', type: 'Story' },
        { title: 'Fix barcode scanner timeout issue', type: 'Bug' },
        { title: 'Implement automated quality inspection workflow', type: 'Story' },
        { title: 'Design energy consumption monitoring system', type: 'Task' },
        { title: 'Build supplier onboarding portal', type: 'Story' },
        { title: 'Implement digital work instruction system', type: 'Story' },
        { title: 'Fix shift handover report generation bug', type: 'Bug' },
        { title: 'Build finished goods traceability module', type: 'Story' },
        { title: 'Design carbon footprint tracking dashboard', type: 'Task' },
      ],
    },
  };
  return all[industry] || all['Banking'];
}

// ── JIRA API ──────────────────────────────────────────────────────────────────

async function jiraGet(path) {
  const res = await api.asUser().requestJira(buildTrustedJiraRoute(path));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function jiraPost(path, body) {
  const res = await api.asUser().requestJira(buildTrustedJiraRoute(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} failed: ${res.status} ${text}`);
  }
  const text = await res.text();
  if (!text || text.trim() === '') return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function jiraPut(path, body) {
  const res = await api.asUser().requestJira(buildTrustedJiraRoute(path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PUT ${path} failed: ${res.status} ${text}`);
  }
  const text = await res.text();
  if (!text || text.trim() === '') return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function buildTrustedJiraRoute(path) {
  // These endpoints are assembled centrally so we validate the shape once here,
  // then tell Forge the route is intentional. This avoids false positives from
  // passing a complete string through `route`${...}` while still rejecting
  // traversal attempts or absolute URLs.
  if (typeof path !== 'string' || !path.startsWith('/rest/')) {
    throw new Error(`Invalid Jira REST path: ${path}`);
  }

  if (path.includes('..') || path.includes('://') || path.startsWith('//')) {
    throw new Error(`Unsafe Jira REST path rejected: ${path}`);
  }

  return assumeTrustedRoute(path);
}

async function getCurrentUser() {
  const data = await jiraGet('/rest/api/3/myself');
  return data.accountId;
}

async function getMyGlobalPermissions() {
  const data = await jiraGet('/rest/api/3/mypermissions?permissions=ADMINISTER');
  return data.permissions || {};
}

async function createJSMProject(name, key, leadAccountId) {
  // Use 'business' project type - works on all Jira instances without JSM
  return await jiraPost('/rest/api/3/project', {
    name, key,
    projectTypeKey: 'business',
    projectTemplateKey: 'com.atlassian.jira.jira-project-type:com.atlassian.jira.project-type-bus-default',
    leadAccountId,
    assigneeType: 'UNASSIGNED',
  });
}

async function getServiceDeskId(projectKey) {
  const data = await jiraGet('/rest/servicedeskapi/servicedesk');
  const sd = (data.values || []).find(s => s.projectKey === projectKey);
  return sd ? sd.id : null;
}

async function getRequestTypeId(serviceDeskId) {
  const data = await jiraGet(`/rest/servicedeskapi/servicedesk/${serviceDeskId}/requesttype`);
  const incident = (data.values || []).find(rt =>
    rt.name.toLowerCase().includes('incident') ||
    rt.name.toLowerCase().includes('report a problem')
  );
  return incident ? incident.id : data.values?.[0]?.id;
}

async function createIncident(serviceDeskId, requestTypeId, title, priority, dueDate) {
  return await jiraPost('/rest/servicedeskapi/request', {
    serviceDeskId: String(serviceDeskId),
    requestTypeId: String(requestTypeId),
    requestFieldValues: {
      summary: title,
      description: {
        version: 1, type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: `Incident raised by operations team. Priority: ${priority}. Immediate attention required.` }],
        }],
      },
    },
  });
}

async function createSoftwareProject(name, key, leadAccountId) {
  return await jiraPost('/rest/api/3/project', {
    name, key,
    projectTypeKey: 'software',
    projectTemplateKey: 'com.pyxis.greenhopper.jira:gh-scrum-template',
    leadAccountId,
    assigneeType: 'UNASSIGNED',
  });
}

async function createVersion(projectId, name, releaseDate, released) {
  return await jiraPost('/rest/api/3/version', {
    projectId, name, releaseDate, released, archived: false,
  });
}

async function createEpic(projectKey, epicName) {
  return await jiraPost('/rest/api/3/issue', {
    fields: {
      project: { key: projectKey },
      issuetype: { name: 'Epic' },
      summary: epicName,
    },
  });
}

async function createIssue(projectKey, title, type, epicKey, priority, dueDate, versionId) {
  const fields = {
    project: { key: projectKey },
    issuetype: { name: type },
    summary: title,
    description: buildADF([
      `This ${type.toLowerCase()} is part of the ${projectKey} project.`,
      `${title}. This work item represents realistic work the engineering team would undertake.`,
      `Acceptance criteria to be defined during sprint planning.`,
    ]),
    priority: { name: priority },
    duedate: dueDate,
  };

  // Only set epic link — do NOT set sprint field (customfield_10031) — causes screen errors
  if (epicKey) fields.customfield_10014 = epicKey;
  if (versionId) fields.fixVersions = [{ id: String(versionId) }];

  try {
    return await jiraPost('/rest/api/3/issue', { fields });
  } catch (err) {
    // FIX #3: If any custom field causes a screen error, retry with only safe fields
    if (err.message.includes('customfield') || err.message.includes('not on the appropriate screen')) {
      console.warn(`Retrying issue creation without custom fields for: ${title}`);
      const safeFields = {
        project: { key: projectKey },
        issuetype: { name: type },
        summary: title,
        priority: { name: priority },
      };
      return await jiraPost('/rest/api/3/issue', { fields: safeFields });
    }
    throw err;
  }
}

async function transitionIssue(issueKey, targetStatus) {
  try {
    const data = await jiraGet(`/rest/api/3/issue/${issueKey}/transitions`);
    const t = (data.transitions || []).find(x =>
      x.to.name.toLowerCase().includes(targetStatus.toLowerCase())
    );
    if (t) {
      await api.asUser().requestJira(
        route`/rest/api/3/issue/${issueKey}/transitions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transition: { id: String(t.id) } }),
        }
      );
    }
  } catch (err) {
    console.error(`Transition ${issueKey} -> ${targetStatus}: ${err.message}`);
  }
}

async function getBoardId(projectKey) {
  const data = await jiraGet(`/rest/agile/1.0/board?projectKeyOrId=${projectKey}`);
  return data.values?.[0]?.id;
}

async function createSprint(boardId, name, startDate, endDate) {
  // FIX: Jira API does NOT accept 'state' on sprint creation — always creates as 'future'
  // State changes (active/closed) must be done via separate start/complete calls
  return await jiraPost('/rest/agile/1.0/sprint', {
    name,
    originBoardId: boardId,
    startDate: formatDateForJira(startDate),
    endDate: formatDateForJira(endDate),
  });
}

async function moveIssuesToSprint(sprintId, issueKeys) {
  if (issueKeys.length === 0) return;
  await jiraPost(`/rest/agile/1.0/sprint/${sprintId}/issue`, { issues: issueKeys });
}

async function createIssueLink(inwardKey, outwardKey) {
  try {
    await jiraPost('/rest/api/3/issueLink', {
      type: { name: 'Blocks' },
      inwardIssue: { key: inwardKey },
      outwardIssue: { key: outwardKey },
    });
  } catch (err) {
    console.error(`Link ${inwardKey} -> ${outwardKey}: ${err.message}`);
  }
}

async function createDashboard(name) {
  return await jiraPost('/rest/api/3/dashboard', {
    name,
    sharePermissions: [{ type: 'authenticated' }],
  });
}

async function addGadget(dashboardId, moduleKey, position, title) {
  return await jiraPost(`/rest/api/3/dashboard/${dashboardId}/gadget`, {
    moduleKey,
    position: { row: position.row, column: position.column },
    title,
  });
}

// ── MAIN RESOLVER ─────────────────────────────────────────────────────────────

resolver.define('createDemoEnvironment', async ({ payload }) => {
  // FIX #2: Declare ALL variables ONCE here, outside the try block
  // (previously declared twice — once here and once inside try — causing bugs)
  console.log('🚀 createDemoEnvironment started', JSON.stringify(payload));

  const {
    industry, environmentName,
    jsmProjectCount, incidentsPerProject,
    softwareProjectCount, issuesPerProject, sprintsPerProject,
  } = payload;

  const results = {
    jsmProjects: [],
    softwareProjects: [],
    totalIncidents: 0,
    totalIssues: 0,
    dashboardId: null,
    errors: [],
  };

  try {
    // ── AUTHENTICATION & AUTHORIZATION ───────────────────────────────────────
    console.log('📋 Checking user authentication and permissions...');
    let accountId;
    try {
      accountId = await getCurrentUser();
      console.log('✅ User authenticated:', accountId);
    } catch (err) {
      console.error('❌ Authentication failed:', err.message);
      return {
        success: false,
        summary: `Authentication Error: ${err.message}\n\nPlease ensure you are logged into Jira and try again.`,
      };
    }

    let permissions;
    try {
      permissions = await getMyGlobalPermissions();
      console.log('✅ Permissions retrieved');
    } catch (err) {
      console.error('❌ Permission check failed:', err.message);
      return {
        success: false,
        summary: `Permission Check Error: ${err.message}\n\nTry logging out and back in, then try again.`,
      };
    }

    const canAdministerJira = Boolean(permissions.ADMINISTER?.havePermission);
    if (!canAdministerJira) {
      return {
        success: false,
        summary: `The current user does not have the global "Administer Jira" permission.\nPlease open the app as a Jira administrator and try again.`,
      };
    }

    console.log('✅ All permission checks passed');

    const content = getContent(industry);
    const priorities = ['Highest', 'High', 'High', 'Medium', 'Medium', 'Medium', 'Low', 'Lowest'];

    // ── STEP 1: BUSINESS PROJECTS + INCIDENTS ─────────────────────────────────
    console.log(`Creating ${jsmProjectCount} Business project(s)...`);
    for (let i = 0; i < jsmProjectCount; i++) {
      try {
        const timestamp = Date.now();
        const projectName = `${environmentName} - ${industry} Ops ${i + 1} (${timestamp})`;
        const projectKey = generateKey(`${industry.substring(0, 2)}OP`, i + 1);
        console.log(`Creating Business project: ${projectName} (${projectKey})`);

        const project = await createJSMProject(projectName, projectKey, accountId);

        // Create incidents as regular Bug issues (no JSM API needed)
        const projectIncidents = [];
        const count = Math.min(incidentsPerProject, content.incidents.length);

        for (let j = 0; j < count; j++) {
          try {
            const inc = content.incidents[j];
            const dueDate = getDateString(getRandomInt(-60, 30));
            // Create incident as a Bug type issue using standard Jira API
            const created = await createIssue(projectKey, inc.title, 'Bug', null, inc.priority, dueDate, null);
            projectIncidents.push({ key: created.key, title: inc.title, priority: inc.priority });
            results.totalIncidents++;
          } catch (err) {
            results.errors.push(`Incident ${j + 1}: ${err.message}`);
          }
        }

        results.jsmProjects.push({ key: project.key, name: projectName, incidents: projectIncidents });
        console.log(`✅ Business project ${project.key} created with ${projectIncidents.length} incidents`);
      } catch (err) {
        console.error(`Business Project ${i + 1} error: ${err.message}`);
        results.errors.push(`Business Project ${i + 1}: ${err.message}`);
      }
    }

    // ── STEP 2: SOFTWARE PROJECTS ─────────────────────────────────────────────
    console.log(`Creating ${softwareProjectCount} Software project(s)...`);
    for (let i = 0; i < softwareProjectCount; i++) {
      try {
        const timestamp = Date.now();
        const projectName = `${environmentName} - ${industry} Dev ${i + 1} (${timestamp})`;
        const projectKey = generateKey(`${industry.substring(0, 2)}DV`, i + 1);
        console.log(`Creating software project: ${projectName} (${projectKey})`);

        const project = await createSoftwareProject(projectName, projectKey, accountId);

        // Versions
        const versions = [];
        const currentMonth = new Date().getMonth() + 1;
        for (let m = 2; m <= 5; m++) {
          try {
            const released = m < currentMonth;
            const releaseDate = `2026-${pad(m)}-28`;
            const v = await createVersion(project.id, `Version-2026.${pad(m)}`, releaseDate, released);
            versions.push(v);
          } catch (err) {
            console.warn(`Version 2026.${pad(m)} skipped: ${err.message}`);
          }
        }

        // Epics
        const epicKeys = [];
        for (const epicName of content.epics) {
          try {
            const epic = await createEpic(projectKey, epicName);
            epicKeys.push(epic.key);
          } catch (err) {
            results.errors.push(`Epic "${epicName}": ${err.message}`);
          }
        }

        // Issues
        const issueKeys = [];
        const count = Math.min(issuesPerProject, content.issues.length);
        for (let j = 0; j < count; j++) {
          try {
            const tmpl = content.issues[j];
            const dueDate = getDateString(getRandomInt(-90, 90));
            const issue = await createIssue(
              projectKey,
              tmpl.title,
              tmpl.type,
              epicKeys[j % epicKeys.length] || null,
              priorities[j % priorities.length],
              dueDate,
              versions[j % versions.length]?.id
            );
            issueKeys.push(issue.key);

            // FIX #7: transitionIssue now handles 204 No Content safely
            const status = getStatusFromDueDate(dueDate);
            if (status !== 'To Do') {
              await transitionIssue(issue.key, status);
            }
            results.totalIssues++;
          } catch (err) {
            results.errors.push(`Issue ${j + 1}: ${err.message}`);
          }
        }

        // Sprints
        const boardId = await getBoardId(projectKey);
        if (boardId && issueKeys.length > 0) {
          const chunkSize = Math.max(1, Math.ceil(issueKeys.length / sprintsPerProject));

          for (let s = 0; s < sprintsPerProject; s++) {
            try {
              const daysBack = (sprintsPerProject - 1 - s) * 14;
              const startDate = getDateString(-daysBack - 14);
              const endDate = getDateString(-daysBack);

              // FIX: No 'state' param — Jira API ignores/rejects it on creation
              const sprint = await createSprint(boardId, `Sprint ${s + 1}`, startDate, endDate);

              const chunk = issueKeys.slice(s * chunkSize, (s + 1) * chunkSize);
              if (chunk.length > 0) {
                await moveIssuesToSprint(sprint.id, chunk);
              }
              console.log(`Sprint ${s + 1} created with ${chunk.length} issues`);
            } catch (err) {
              results.errors.push(`Sprint ${s + 1}: ${err.message}`);
            }
          }
        }

        results.softwareProjects.push({
          key: project.key,
          name: projectName,
          issueCount: issueKeys.length,
          firstIssueKey: issueKeys[0] || null,
        });

        console.log(`✅ Software project ${project.key} created with ${issueKeys.length} issues`);
      } catch (err) {
        console.error(`Software Project ${i + 1} error: ${err.message}`);
        results.errors.push(`Software Project ${i + 1}: ${err.message}`);
      }
    }

    // ── STEP 3: DEPENDENCIES ──────────────────────────────────────────────────
    try {
      if (results.softwareProjects.length >= 2) {
        const k1 = results.softwareProjects[0].firstIssueKey;
        const k2 = results.softwareProjects[1].firstIssueKey;
        if (k1 && k2) await createIssueLink(k1, k2);
      }
      if (results.jsmProjects.length > 0 && results.softwareProjects.length > 0) {
        const jsmKey = results.jsmProjects[0].incidents[0]?.key;
        const swKey = results.softwareProjects[0].firstIssueKey;
        if (jsmKey && swKey) await createIssueLink(swKey, jsmKey);
      }
    } catch (err) {
      results.errors.push(`Dependencies: ${err.message}`);
    }

    // ── STEP 4: DASHBOARD ─────────────────────────────────────────────────────
    try {
      if (results.jsmProjects.length > 0 || results.softwareProjects.length > 0) {
        const dashboard = await createDashboard(`${environmentName} - Release Dashboard`);
        results.dashboardId = dashboard.id;

        const gadgets = [
          { key: 'com.atlassian.jira.gadgets:project-gadget', title: 'Projects Overview', row: 0, col: 0 },
          { key: 'com.atlassian.jira.gadgets:assigned-to-me-gadget', title: 'Issues Across Projects', row: 1, col: 0 },
          { key: 'com.atlassian.jira.gadgets:filter-results-gadget', title: 'Overdue Work Per Project', row: 2, col: 0 },
          { key: 'com.pyxis.greenhopper.jira:greenhopper-gadget-sprint-burndown', title: 'Sprint Burndown', row: 0, col: 1 },
          { key: 'com.pyxis.greenhopper.jira:greenhopper-sprint-health-gadget', title: 'Sprint Health', row: 1, col: 1 },
          { key: 'com.atlassian.jira.gadgets:average-age-chart-gadget', title: 'Average Time in Status', row: 2, col: 1 },
        ];

        for (const g of gadgets) {
          try {
            await addGadget(dashboard.id, g.key, { row: g.row, column: g.col }, g.title);
          } catch (err) {
            results.errors.push(`Gadget "${g.title}": ${err.message}`);
          }
        }
        console.log(`✅ Dashboard ${dashboard.id} created`);
      } else {
        results.errors.push('Dashboard skipped: no Jira projects were created successfully.');
      }
    } catch (err) {
      results.errors.push(`Dashboard: ${err.message}`);
    }

    // ── SUMMARY ───────────────────────────────────────────────────────────────
    const hasProjects = results.jsmProjects.length > 0 || results.softwareProjects.length > 0;
    const lines = [
      hasProjects
        ? `✅ "${environmentName}" demo environment created successfully!`
        : `⚠️ "${environmentName}" demo environment creation attempted but no resources were created.`,
      ``,
      `📊 Summary:`,
      `• Industry: ${industry}`,
      `• Business Projects: ${results.jsmProjects.length} (${results.totalIncidents} incidents total)`,
      `• Software Projects: ${results.softwareProjects.length} (${results.totalIssues} issues total)`,
      `• Dashboard: ${results.dashboardId ? '✅ Created' : '❌ Failed to create'}`,
      ``,
    ];

    if (results.jsmProjects.length > 0) {
      lines.push(`🛠️ Business Projects Created:`);
      lines.push(...results.jsmProjects.map(p => `  • ${p.key}: ${p.name} (${p.incidents.length} incidents)`));
      lines.push(``);
    }

    if (results.softwareProjects.length > 0) {
      lines.push(`💻 Software Projects Created:`);
      lines.push(...results.softwareProjects.map(p => `  • ${p.key}: ${p.name} (${p.issueCount} issues)`));
      lines.push(``);
    }

    if (hasProjects) {
      lines.push(`📋 Final Step (Required):`);
      lines.push(`  1. Go to Jira → Plans`);
      lines.push(`  2. Click "Create Plan"`);
      lines.push(`  3. Add all projects above`);
      lines.push(`  4. Click Save`);
      lines.push(``);
    }

    if (results.errors.length > 0) {
      lines.push(`⚠️ ${results.errors.length} error(s) occurred:`);
      lines.push(...results.errors.map(e => `  • ${e}`));
      lines.push(``);
      lines.push(`🔍 Check the browser console and run 'forge logs' for detailed error messages.`);
    } else if (hasProjects) {
      lines.push(`🎉 No errors!`);
    }

    return { success: hasProjects, summary: lines.join('\n') };

  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    return { success: false, summary: `❌ Failed: ${err.message}` };
  }
});

export const handler = resolver.getDefinitions();
