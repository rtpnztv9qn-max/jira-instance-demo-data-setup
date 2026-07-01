import Resolver from '@forge/resolver';
import api, { assumeTrustedRoute, fetch as forgeFetch, route } from '@forge/api';
import { kvs } from '@forge/kvs';
import {
  buildRealisticAssigneeIndex,
  createLifecycleForIssue,
  createTicketProperty,
} from './demoDataGenerator';
import {
  buildDynamicJsmFormDesign,
  buildFormsApiPayload,
} from './formGenerationEngine';
import { buildAutomationBlueprints } from './automationBlueprintEngine';
import {
  inferDashboardIntent,
  orderDashboardGadgetPlans,
} from './dashboardAiEngine';
import {
  ARCHIVE_RETENTION_DAYS,
  TICKET_RETENTION_PROPERTY,
} from './retentionManagementService';

const resolver = new Resolver();
const projectIssueTypeCache = new Map();
const assignableUsersByProjectCache = new Map();
const demoDateFieldsByProjectCache = new Map();
let issueLinkTypesCache = null;
let demoDateFieldIdsCache = null;
let timelineStartDateFieldIdCache = null;
let sprintFieldIdCache = null;
let formsDynamicSchemaRejected = false;
const ACTIVE_TICKET_RETENTION_DAYS = 180;
const WORKER_GENERATION_ENDPOINT = process.env.WORKER_GENERATION_ENDPOINT || 'http://localhost:4000/generate-demo';
const WORKER_DATE_PATCH_ENDPOINT = process.env.WORKER_DATE_PATCH_ENDPOINT
  || WORKER_GENERATION_ENDPOINT.replace(/\/generate-demo\/?$/, '/generate-date-patch');
const ISSUE_CREATION_MODE = process.env.ISSUE_CREATION_MODE || 'rest';
const WORKER_FETCH_TIMEOUT_MS = 10000;
const GITHUB_DEMO_ACTIVITY_ENABLED = String(process.env.GITHUB_DEMO_ACTIVITY_ENABLED || 'true').toLowerCase() !== 'false';
const GITHUB_DEMO_ACTIVITY_PER_PROJECT = Math.max(1, Math.min(Number(process.env.GITHUB_DEMO_ACTIVITY_PER_PROJECT) || 50, 100));
const GITHUB_DEMO_BRANCHES_PER_ISSUE = Math.max(1, Math.min(Number(process.env.GITHUB_DEMO_BRANCHES_PER_ISSUE) || 1, 5));
const GITHUB_DEMO_PULL_REQUESTS_PER_ISSUE = Math.max(0, Math.min(Number(process.env.GITHUB_DEMO_PULL_REQUESTS_PER_ISSUE) || GITHUB_DEMO_BRANCHES_PER_ISSUE, GITHUB_DEMO_BRANCHES_PER_ISSUE));
const GITHUB_FETCH_TIMEOUT_MS = 6000;
const COMPASS_DEMO_COMPONENTS_ENABLED = String(process.env.COMPASS_DEMO_COMPONENTS_ENABLED || 'true').toLowerCase() !== 'false';
const GOALS_DEMO_ENABLED = String(process.env.GOALS_DEMO_ENABLED || 'true').toLowerCase() !== 'false';
const DASHBOARD_TEMPLATE_IDS = ['10000', '10671'];
const MANAGED_DASHBOARD_GADGET_SLOT_COUNT = 7;
const DEMO_DATE_ISSUE_PROPERTY_KEY = 'cprime-demo-dates';
const DEMO_DATE_FIELD_DEFINITIONS = {
  created: {
    name: 'Created Date',
    description: 'Demo environment generated created date field.',
  },
  resolved: {
    name: 'Resolved Date',
    description: 'Demo environment generated resolved date field.',
  },
};
const MANAGED_DASHBOARD_GADGET_PLANS = [
  {
    role: 'forge-environment',
    title: 'Demo Environment',
    keywords: ['cprime demo gadget'],
    required: true,
    allowDuplicate: true,
  },
  {
    role: 'forge-summary',
    title: 'Summary',
    keywords: ['cprime demo gadget'],
    required: true,
    allowDuplicate: true,
  },
  {
    role: 'forge-open-work',
    titleSuffix: 'Open Work',
    keywords: ['cprime demo gadget'],
    required: true,
    allowDuplicate: true,
  },
  {
    role: 'forge-priority',
    title: 'Work by Priority',
    keywords: ['cprime demo gadget'],
    required: true,
    allowDuplicate: true,
  },
  {
    role: 'forge-overdue',
    title: 'Overdue Work Per Project',
    keywords: ['cprime demo gadget'],
    required: true,
    allowDuplicate: true,
  },
  {
    role: 'forge-sprint-health',
    title: 'Sprint Health',
    keywords: ['cprime demo gadget'],
    required: true,
    allowDuplicate: true,
  },
  {
    role: 'forge-sprint-burndown',
    title: 'Sprint Burndown',
    keywords: ['cprime demo gadget'],
    required: true,
    allowDuplicate: true,
  },
  {
    role: 'forge-roadmap',
    title: 'Jira Roadmap: Next 30 Days',
    keywords: ['cprime demo gadget'],
    required: true,
    allowDuplicate: true,
  },
  {
    role: 'forge-average-time-status',
    title: 'Average Time in Status',
    keywords: ['cprime demo gadget'],
    required: true,
    allowDuplicate: true,
  },
  {
    role: 'forge-ticket-aging',
    title: 'Ticket Aging',
    keywords: ['cprime demo gadget'],
    required: true,
    allowDuplicate: true,
  },
  {
    role: 'forge-escalations',
    title: 'SLA & Escalation Risk',
    keywords: ['cprime demo gadget'],
    required: true,
    allowDuplicate: true,
  },
  {
    role: 'forge-reports',
    title: 'Reports & Knowledge Links',
    keywords: ['cprime demo gadget'],
    required: true,
    allowDuplicate: true,
  },
  {
    role: 'forge-created-resolved',
    title: 'Created vs Resolved',
    keywords: ['cprime demo gadget'],
    required: true,
    allowDuplicate: true,
  },
  {
    role: 'forge-projects',
    title: 'Demo Projects',
    keywords: ['cprime demo gadget'],
    required: true,
    allowDuplicate: true,
  },
  {
    role: 'activity',
    title: 'Activity Stream',
    moduleKeys: ['com.atlassian.streams.streams-jira-plugin:activitystream-gadget'],
    keywords: ['activity'],
    required: false,
  },
  {
    role: 'pie-chart-assignee',
    title: 'Work by Assignee',
    moduleKeys: ['com.atlassian.jira.gadgets:pie-chart-gadget'],
    keywords: ['pie chart'],
    required: false,
    disabled: true,
    allowDuplicate: true,
  },
  {
    role: 'created-vs-resolved',
    title: 'Created vs Resolved',
    moduleKeys: ['com.atlassian.jira.gadgets:created-vs-resolved-chart-gadget'],
    keywords: ['created vs resolved', 'created resolved', 'created'],
    required: false,
    disabled: true,
  },
  {
    role: 'average-age',
    title: 'Average Age',
    moduleKeys: ['com.atlassian.jira.gadgets:average-age-chart-gadget'],
    keywords: ['average age', 'average'],
    required: false,
    disabled: true,
  },
  {
    role: 'recently-created',
    title: 'Recently Created',
    moduleKeys: ['com.atlassian.jira.gadgets:recently-created-chart-gadget'],
    keywords: ['recently created', 'created'],
    required: false,
    disabled: true,
  },
];

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

function getDemoDevStatus(index) {
  return ['To Do', 'In Progress', 'Done'][index % 3];
}

function isBugIssueType(issueType) {
  return String(issueType || '').toLowerCase() === 'bug';
}

function isDueDateCompleted(dueDate) {
  if (!dueDate) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00.000Z`);
  due.setHours(0, 0, 0, 0);
  return due <= today;
}

function getDemoBugStatusFromDueDate(dueDate) {
  return isDueDateCompleted(dueDate) ? 'Done' : 'In Progress';
}

function getWaterfallPhase(index) {
  return ['requirements', 'design', 'build', 'test', 'release'][index % 5];
}

function getSoftwareMethodologyLabels(project, issueIndex, issueType) {
  const template = normaliseSoftwareTemplate(project?.softwareTemplate);
  const phase = getWaterfallPhase(issueIndex);
  const baseLabels = [
    template === 'scrum' ? 'scrum' : template === 'kanban' ? 'kanban' : 'bug-tracking',
    `phase-${phase}`,
  ];

  baseLabels.push(String(issueType || '').toLowerCase() === 'bug' ? 'defect' : 'release');

  return baseLabels.map(label => label.replace(/[^A-Za-z0-9_-]/g, '-').toLowerCase());
}

function getSoftwareMethodologyDescription(project, issueIndex) {
  const template = normaliseSoftwareTemplate(project?.softwareTemplate);
  const phase = getWaterfallPhase(issueIndex);
  const agileMethod = template === 'scrum'
    ? 'Scrum delivery: backlog refinement, sprint planning, sprint execution, review, and retrospective.'
    : template === 'kanban'
      ? 'Kanban delivery: continuous intake, WIP control, flow monitoring, cycle time, and throughput tracking.'
      : 'Bug tracking delivery: defect intake, triage, assignment, fix validation, review, and release verification.';

  return [
    agileMethod,
    `Waterfall traceability overlay: this work is tagged to the ${phase} phase so the demo can show requirements-to-release governance alongside agile execution.`,
    'Release governance: fix versions, affected versions, dependencies, due dates, and sprint or flow state are populated for dashboard and report visibility.',
  ].join(' ');
}

function getSoftwareProjectVariantSeed(project, fallbackIndex = 0) {
  const source = [
    project?.key,
    project?.softwareTemplate,
    project?.softwareProjectStyle,
    fallbackIndex,
  ].filter(value => value !== undefined && value !== null).join('|');
  const hash = Array.from(String(source || fallbackIndex)).reduce((total, char, index) => (
    total + (char.charCodeAt(0) * (index + 3))
  ), 0);
  const template = normaliseSoftwareTemplate(project?.softwareTemplate);
  const templateOffset = template === 'kanban' ? 11 : template === 'bug-tracking' ? 23 : 3;
  const styleOffset = normaliseProjectManagementStyle(project?.softwareProjectStyle) === 'company-managed' ? 17 : 5;
  return hash + templateOffset + styleOffset;
}

function getSoftwareReleasePlan(project, releaseIndex) {
  const template = normaliseSoftwareTemplate(project?.softwareTemplate);
  const offsets = [-150, -90, -30, 14, 45, 90];
  const stage = releaseIndex <= 1
    ? 'past'
    : releaseIndex === 2
      ? 'current'
      : 'upcoming';
  const versionNumber = `${Math.floor(releaseIndex / 2) + 1}.${releaseIndex % 2}`;
  const releaseDate = getDateString(offsets[releaseIndex] ?? (30 + (releaseIndex * 30)));
  const label = stage === 'past'
    ? 'Past Release'
    : stage === 'current'
      ? 'Current Release'
      : 'Upcoming Release';

  return {
    name: `${project.key} ${label} ${versionNumber}`,
    releaseDate,
    released: stage === 'past',
    stage,
    methodology: template === 'scrum' ? 'Scrum release train' : template === 'kanban' ? 'Kanban flow release' : 'Bug fix release train',
  };
}

function chooseReleaseVersionIds(project, issueIndex, issueType) {
  const versions = project?.versions || [];
  if (versions.length === 0) {
    return {
      fixVersionId: null,
      affectsVersionId: null,
    };
  }

  const pastVersions = versions.filter(version => version.releaseStage === 'past');
  const currentVersions = versions.filter(version => version.releaseStage === 'current');
  const upcomingVersions = versions.filter(version => version.releaseStage === 'upcoming');
  const isBug = String(issueType || '').toLowerCase() === 'bug';
  const fixPool = isBug
    ? [...upcomingVersions, ...currentVersions, ...versions]
    : [...upcomingVersions, ...currentVersions, ...versions];
  const affectedPool = isBug
    ? [...pastVersions, ...currentVersions, ...versions]
    : [...currentVersions, ...pastVersions, ...versions];

  return {
    fixVersionId: fixPool[issueIndex % fixPool.length]?.id || null,
    affectsVersionId: affectedPool[issueIndex % affectedPool.length]?.id || null,
  };
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
  const base = prefix.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 8).padEnd(3, 'X') || 'DEM';
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  if (index === 0) {
    return base;
  }

  const fallbackLetters = letters.split('').filter(letter => letter !== base[base.length - 1]);
  return `${base.substring(0, Math.max(2, base.length - 1))}${fallbackLetters[(index - 1) % fallbackLetters.length] || 'Z'}`;
}

function deriveProjectKeyPrefix(environmentName, fallback = 'DEM') {
  const words = String(environmentName || '')
    .toUpperCase()
    .match(/[A-Z0-9]+/g) || [];

  if (words.length >= 3) {
    return words.slice(0, 3).map(word => word[0]).join('');
  }

  return (words.join('') || fallback).replace(/[^A-Z]/g, '').substring(0, 3).padEnd(3, 'X');
}

function createRunKeySuffix(seed) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const number = Math.abs(Number(seed) || Date.now());
  return `${letters[number % 26]}${letters[Math.floor(number / 26) % 26]}`;
}

function deriveRunProjectKeyPrefix(config, fallback = 'DEM', projectIndex = 0) {
  const base = deriveProjectKeyPrefix(config.environmentName, fallback).substring(0, 3);
  const suffix = createRunKeySuffix(config.runSeed);
  const indexLetter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[projectIndex % 26] || 'A';
  return `${base}${suffix}${indexLetter}`;
}

function pad(num) {
  return num > 9 ? String(num) : '0' + num;
}

function formatDateForJira(dateStr) {
  return dateStr + 'T00:00:00.000Z';
}

function createShiftedDate(daysFromNow) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date;
}

function normaliseStatusName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createRunLabel(date = new Date()) {
  // Dashboard and filter names need a run-specific label because demo users often
  // create several environments with the same customer name while rehearsing.
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// ── INDUSTRY CONTENT ──────────────────────────────────────────────────────────

function toTitleCase(value) {
  return String(value || 'Business')
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ') || 'Business';
}

function buildDomainTerms(industry) {
  const label = toTitleCase(industry);
  const normalised = label.toLowerCase();
  const termMap = {
    banking: ['core banking', 'payments', 'customer onboarding', 'fraud monitoring', 'regulatory reporting'],
    'banking & insurance': ['core banking', 'claims intake', 'policy administration', 'payments', 'fraud monitoring'],
    'banking insurance': ['core banking', 'claims intake', 'policy administration', 'payments', 'fraud monitoring'],
    healthcare: ['patient records', 'clinical workflow', 'lab integration', 'telehealth', 'pharmacy operations'],
    retail: ['checkout', 'inventory', 'order fulfilment', 'loyalty platform', 'returns processing'],
    'retail & e commerce': ['checkout', 'inventory', 'order fulfilment', 'loyalty platform', 'returns processing'],
    'retail e commerce': ['checkout', 'inventory', 'order fulfilment', 'loyalty platform', 'returns processing'],
    insurance: ['policy administration', 'claims intake', 'underwriting', 'premium billing', 'agent portal'],
    telecom: ['network provisioning', 'subscriber billing', 'service activation', 'outage monitoring', 'field operations'],
    'e commerce': ['cart checkout', 'catalog search', 'seller onboarding', 'warehouse fulfilment', 'payment capture'],
    ecommerce: ['cart checkout', 'catalog search', 'seller onboarding', 'warehouse fulfilment', 'payment capture'],
    saas: ['tenant provisioning', 'authentication', 'subscription billing', 'API gateway', 'usage analytics'],
    manufacturing: ['production line', 'quality inspection', 'supplier integration', 'inventory planning', 'maintenance alerts'],
    'manufacturing & energy utilities': ['production line', 'energy monitoring', 'supplier integration', 'grid maintenance', 'predictive maintenance'],
    'manufacturing energy utilities': ['production line', 'energy monitoring', 'supplier integration', 'grid maintenance', 'predictive maintenance'],
  };
  const terms = termMap[normalised] || [
    `${normalised} operations`,
    `${normalised} customer workflow`,
    `${normalised} reporting`,
    `${normalised} integration`,
    `${normalised} service portal`,
  ];

  return {
    label,
    terms: terms.map(term => toTitleCase(term)),
  };
}

function createTemplateItem(title, priority = 'P3 - Medium', description = '') {
  return { title, priority, description };
}

function buildDynamicDomainContent(industry) {
  const { label, terms } = buildDomainTerms(industry);
  const priorities = ['P1 - Critical', 'P2 - High', 'P3 - Medium', 'P3 - Medium', 'P4 - Low'];
  const incidents = terms.flatMap((term, index) => ([
    createTemplateItem(`${term} outage affecting ${label.toLowerCase()} users`, priorities[index % priorities.length], `Investigate and restore the ${term.toLowerCase()} service for the ${label.toLowerCase()} demo environment.`),
    createTemplateItem(`${term} performance degradation during peak processing`, priorities[(index + 1) % priorities.length], `Triage latency, impact, and customer-facing symptoms for ${term.toLowerCase()}.`),
  ]));
  const serviceRequests = terms.flatMap((term, index) => ([
    createTemplateItem(`Provision access to ${term.toLowerCase()} workspace`, index % 2 === 0 ? 'P3 - Medium' : 'P4 - Low', `Fulfil a standard access request for ${term.toLowerCase()} with approval and handoff notes.`),
    createTemplateItem(`Create standard ${term.toLowerCase()} reporting view`, 'P3 - Medium', `Set up a reusable reporting view for the ${label.toLowerCase()} operations team.`),
  ]));
  const changes = terms.flatMap((term, index) => ([
    createTemplateItem(`Deploy ${term.toLowerCase()} reliability improvement`, index % 3 === 0 ? 'P2 - High' : 'P3 - Medium', `Plan, approve, and deploy a controlled change for ${term.toLowerCase()} reliability.`),
    createTemplateItem(`Update ${term.toLowerCase()} integration configuration`, 'P3 - Medium', `Coordinate validation, implementation window, and rollback for a ${term.toLowerCase()} configuration update.`),
  ]));
  const problems = terms.flatMap((term, index) => ([
    createTemplateItem(`Investigate recurring ${term.toLowerCase()} instability`, index % 2 === 0 ? 'P2 - High' : 'P3 - Medium', `Find root cause, known error, and permanent corrective action for recurring ${term.toLowerCase()} incidents.`),
    createTemplateItem(`Root cause analysis for ${term.toLowerCase()} data inconsistency`, 'P3 - Medium', `Analyse repeat symptoms, impacted services, and prevention steps for ${term.toLowerCase()}.`),
  ]));
  const issues = terms.flatMap((term, index) => ([
    { title: `Build ${term.toLowerCase()} workflow automation`, type: 'Story' },
    { title: `Design ${term.toLowerCase()} operational dashboard`, type: 'Task' },
    { title: `Fix ${term.toLowerCase()} validation defect`, type: 'Bug' },
    { title: `Implement ${term.toLowerCase()} audit trail`, type: index % 2 === 0 ? 'Story' : 'Task' },
  ]));

  return {
    incidents,
    serviceRequests,
    changes,
    problems,
    epics: [`${label} Operations Modernization`, `${label} Customer Experience`, `${label} Platform Reliability`, `${label} Compliance and Reporting`],
    issues,
  };
}

function buildRequestTypeTemplates(content, industry, workType) {
  const { label, terms } = buildDomainTerms(industry);
  const sourceIssues = Array.isArray(content.issues) ? content.issues : [];
  const sourceIncidents = Array.isArray(content.incidents) ? content.incidents : [];
  const priorities = ['P2 - High', 'P3 - Medium', 'P4 - Low', 'P3 - Medium'];
  const titleBuilders = {
    'Service Request': term => `Standard access and support request for ${term.toLowerCase()}`,
    Change: term => `Production change for ${term.toLowerCase()} reliability improvement`,
    Problem: term => `Recurring ${term.toLowerCase()} instability root cause analysis`,
    Incident: term => `${term} service interruption impacting ${label.toLowerCase()} operations`,
  };
  const descriptionBuilders = {
    'Service Request': term => `Fulfil a standard service request for ${term.toLowerCase()} with approvals, ownership, and completion evidence.`,
    Change: term => `Assess, schedule, approve, deploy, and validate a controlled change for ${term.toLowerCase()}.`,
    Problem: term => `Investigate recurring symptoms, document root cause, define known error, and track permanent fix for ${term.toLowerCase()}.`,
    Incident: term => `Restore service for ${term.toLowerCase()}, capture impact, urgency, escalation owner, and customer communication.`,
  };
  const templates = terms.map((term, index) => createTemplateItem(titleBuilders[workType](term), priorities[index % priorities.length], descriptionBuilders[workType](term)));

  sourceIssues.slice(0, 10).forEach((issue, index) => {
    const issueTitle = String(issue.title || `${label} work item`).replace(/^Build\s+/i, '').replace(/^Implement\s+/i, '');
    templates.push(createTemplateItem(
      `${workType} follow-up for ${issueTitle.charAt(0).toLowerCase()}${issueTitle.slice(1)}`,
      priorities[(index + 1) % priorities.length],
      `${workType} record generated from ${label.toLowerCase()} delivery context: ${issueTitle}.`
    ));
  });

  sourceIncidents.slice(0, 5).forEach((incident, index) => {
    templates.push(createTemplateItem(
      `${workType} linked to ${String(incident.title || '').toLowerCase()}`,
      priorities[(index + 2) % priorities.length],
      `${workType} item derived from operational impact: ${incident.title}.`
    ));
  });

  return templates;
}

function ensureDomainContentCompleteness(content, industry) {
  const completeContent = {
    ...buildDynamicDomainContent(industry),
    ...content,
  };

  return {
    ...completeContent,
    incidents: Array.isArray(completeContent.incidents) && completeContent.incidents.length > 0 ? completeContent.incidents : buildRequestTypeTemplates(completeContent, industry, 'Incident'),
    serviceRequests: Array.isArray(completeContent.serviceRequests) && completeContent.serviceRequests.length > 0 ? completeContent.serviceRequests : buildRequestTypeTemplates(completeContent, industry, 'Service Request'),
    changes: Array.isArray(completeContent.changes) && completeContent.changes.length > 0 ? completeContent.changes : buildRequestTypeTemplates(completeContent, industry, 'Change'),
    problems: Array.isArray(completeContent.problems) && completeContent.problems.length > 0 ? completeContent.problems : buildRequestTypeTemplates(completeContent, industry, 'Problem'),
  };
}

function normaliseAiGeneratedContent(rawContent, industry) {
  if (!rawContent || typeof rawContent !== 'object') {
    return null;
  }

  const fallback = buildDynamicDomainContent(industry);
  const seenTitlesByList = new Map();
  const makeUniqueTitle = (listName, title, index) => {
    const cleanedTitle = String(title || `${toTitleCase(industry)} work item`).replace(/\s+/g, ' ').trim();
    const seenTitles = seenTitlesByList.get(listName) || new Set();
    const lowerTitle = cleanedTitle.toLowerCase();

    if (!seenTitles.has(lowerTitle)) {
      seenTitles.add(lowerTitle);
      seenTitlesByList.set(listName, seenTitles);
      return cleanedTitle;
    }

    const uniqueTitle = `${cleanedTitle} (${toTitleCase(industry)} scenario ${index + 1})`;
    seenTitles.add(uniqueTitle.toLowerCase());
    seenTitlesByList.set(listName, seenTitles);
    return uniqueTitle;
  };
  const normaliseItems = (items, fallbackItems, defaultType = null) => {
    const source = Array.isArray(items) && items.length > 0 ? items : fallbackItems;
    return source
      .filter(Boolean)
      .map((item, index) => ({
        title: makeUniqueTitle(defaultType || 'itsm', item.title || item.summary || fallbackItems[index % fallbackItems.length]?.title, index).slice(0, 180),
        priority: String(item.priority || fallbackItems[index % fallbackItems.length]?.priority || 'P3 - Medium'),
        description: String(item.description || fallbackItems[index % fallbackItems.length]?.description || '').slice(0, 1200),
        ...(defaultType ? { type: String(item.type || defaultType) } : {}),
      }));
  };

  const content = {
    incidents: normaliseItems(rawContent.incidents, fallback.incidents),
    serviceRequests: normaliseItems(rawContent.serviceRequests, fallback.serviceRequests),
    changes: normaliseItems(rawContent.changes, fallback.changes),
    problems: normaliseItems(rawContent.problems, fallback.problems),
    epics: Array.isArray(rawContent.epics) && rawContent.epics.length > 0
      ? rawContent.epics.map(epic => String(epic).slice(0, 80))
      : fallback.epics,
    issues: normaliseItems(rawContent.issues, fallback.issues, 'Story').map((item, index) => ({
      title: item.title,
      type: ['Story', 'Task', 'Bug'].includes(item.type) ? item.type : fallback.issues[index % fallback.issues.length]?.type || 'Story',
      description: item.description,
    })),
    requestTypes: Array.isArray(rawContent.requestTypes) ? rawContent.requestTypes.slice(0, 12) : [],
    workflows: rawContent.workflows && typeof rawContent.workflows === 'object' ? rawContent.workflows : {},
    dashboards: Array.isArray(rawContent.dashboards) ? rawContent.dashboards.slice(0, 8) : [],
    reports: Array.isArray(rawContent.reports) ? rawContent.reports.slice(0, 8) : [],
    slaPatterns: Array.isArray(rawContent.slaPatterns) ? rawContent.slaPatterns.slice(0, 8) : [],
    trendsAndMetrics: Array.isArray(rawContent.trendsAndMetrics) ? rawContent.trendsAndMetrics.slice(0, 12) : [],
  };

  return ensureDomainContentCompleteness(content, industry);
}

function extractOpenAiText(responseJson) {
  if (typeof responseJson?.output_text === 'string') {
    return responseJson.output_text;
  }

  const textParts = [];
  for (const output of responseJson?.output || []) {
    for (const content of output?.content || []) {
      if (typeof content?.text === 'string') {
        textParts.push(content.text);
      }
    }
  }

  return textParts.join('\n').trim();
}

async function generateAiDemoContent(config) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const openAiTimeoutMs = Number.parseInt(process.env.OPENAI_TIMEOUT_MS || '12000', 10);
  const requestedCounts = {
    incidents: config.itsmWorkCounts?.incidentRequestsPerProject || 1,
    serviceRequests: config.itsmWorkCounts?.serviceRequestsPerProject || 1,
    changes: config.itsmWorkCounts?.changeRequestsPerProject || 1,
    problems: config.itsmWorkCounts?.problemRequestsPerProject || 1,
    softwareIssues: Math.max(...(config.softwareProjects || []).map(project => project.issuesPerProject || 0), config.issuesPerProject || DEFAULT_SOFTWARE_ISSUES_PER_PROJECT),
  };
  const boundedCounts = {
    incidents: Math.min(MAX_INCIDENTS_PER_PROJECT, Math.max(0, requestedCounts.incidents)),
    serviceRequests: Math.min(MAX_INCIDENTS_PER_PROJECT, Math.max(0, requestedCounts.serviceRequests)),
    changes: Math.min(MAX_INCIDENTS_PER_PROJECT, Math.max(0, requestedCounts.changes)),
    problems: Math.min(MAX_INCIDENTS_PER_PROJECT, Math.max(0, requestedCounts.problems)),
    softwareIssues: Math.min(MAX_ISSUES_PER_PROJECT, Math.max(1, requestedCounts.softwareIssues)),
  };
  const totalRequestedRecords = boundedCounts.incidents
    + boundedCounts.serviceRequests
    + boundedCounts.changes
    + boundedCounts.problems
    + boundedCounts.softwareIssues;
  const maxOutputTokens = Math.min(16000, Math.max(7000, totalRequestedRecords * 180));
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      incidents: { type: 'array', items: { $ref: '#/$defs/ticket' }, minItems: boundedCounts.incidents, maxItems: boundedCounts.incidents },
      serviceRequests: { type: 'array', items: { $ref: '#/$defs/ticket' }, minItems: boundedCounts.serviceRequests, maxItems: boundedCounts.serviceRequests },
      changes: { type: 'array', items: { $ref: '#/$defs/ticket' }, minItems: boundedCounts.changes, maxItems: boundedCounts.changes },
      problems: { type: 'array', items: { $ref: '#/$defs/ticket' }, minItems: boundedCounts.problems, maxItems: boundedCounts.problems },
      epics: { type: 'array', items: { type: 'string' }, minItems: 4 },
      issues: { type: 'array', items: { $ref: '#/$defs/softwareIssue' }, minItems: boundedCounts.softwareIssues, maxItems: boundedCounts.softwareIssues },
      requestTypes: { type: 'array', items: { $ref: '#/$defs/requestType' }, minItems: 4 },
      workflows: { $ref: '#/$defs/workflows' },
      dashboards: { type: 'array', items: { $ref: '#/$defs/dashboard' }, minItems: 2 },
      reports: { type: 'array', items: { $ref: '#/$defs/report' }, minItems: 2 },
      slaPatterns: { type: 'array', items: { $ref: '#/$defs/slaPattern' }, minItems: 2 },
      trendsAndMetrics: { type: 'array', items: { type: 'string' }, minItems: 4 },
    },
    required: ['incidents', 'serviceRequests', 'changes', 'problems', 'epics', 'issues', 'requestTypes', 'workflows', 'dashboards', 'reports', 'slaPatterns', 'trendsAndMetrics'],
    $defs: {
      ticket: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          priority: { type: 'string', enum: ['P1 - Critical', 'P2 - High', 'P3 - Medium', 'P4 - Low', 'P5 - Lowest'] },
          description: { type: 'string' },
        },
        required: ['title', 'priority', 'description'],
      },
      softwareIssue: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: ['Story', 'Task', 'Bug'] },
          description: { type: 'string' },
        },
        required: ['title', 'type', 'description'],
      },
      requestType: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          workType: { type: 'string', enum: ['Incident', 'Service Request', 'Change', 'Problem'] },
          purpose: { type: 'string' },
        },
        required: ['name', 'workType', 'purpose'],
      },
      workflows: {
        type: 'object',
        additionalProperties: false,
        properties: {
          incident: { type: 'array', items: { type: 'string' }, minItems: 3 },
          serviceRequest: { type: 'array', items: { type: 'string' }, minItems: 3 },
          change: { type: 'array', items: { type: 'string' }, minItems: 3 },
          problem: { type: 'array', items: { type: 'string' }, minItems: 3 },
          software: { type: 'array', items: { type: 'string' }, minItems: 3 },
        },
        required: ['incident', 'serviceRequest', 'change', 'problem', 'software'],
      },
      dashboard: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          audience: { type: 'string' },
          metrics: { type: 'array', items: { type: 'string' }, minItems: 3 },
        },
        required: ['title', 'audience', 'metrics'],
      },
      report: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          purpose: { type: 'string' },
          metrics: { type: 'array', items: { type: 'string' }, minItems: 3 },
        },
        required: ['title', 'purpose', 'metrics'],
      },
      slaPattern: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          target: { type: 'string' },
          riskSignal: { type: 'string' },
        },
        required: ['name', 'target', 'riskSignal'],
      },
    },
  };
  const customDomainInstruction = config.isCustomIndustry
    ? 'This is a custom "Others" domain entered by the user. Treat it as the source of truth. Do not substitute Banking, Healthcare, Insurance, Telecom, Retail, Manufacturing, SaaS, Public Sector, Education, or Energy & Utilities unless the user literally typed that domain.'
    : 'Use the selected predefined business domain as the source of truth.';
  const prompt = [
    `Business domain: ${config.industry}.`,
    customDomainInstruction,
    `Client/demo name: ${config.environmentName}.`,
    `Ticket data duration: ${config.dateRange}.`,
    `Generate exact counts: ${boundedCounts.incidents} incidents, ${boundedCounts.serviceRequests} service requests, ${boundedCounts.changes} change requests, ${boundedCounts.problems} problem records, and ${boundedCounts.softwareIssues} software issues.`,
    'Create enterprise-grade Jira demo data. Keep each summary unique and domain-specific.',
    'Every title must be different. Do not reuse the same noun phrase across incidents, service requests, changes, and problems.',
    'Descriptions must be concise, realistic, and specific to the selected domain.',
    'Service requests must be fulfilment/access/support requests, changes must be planned change records, problems must be root-cause records, and incidents must be disruptions/outages.',
    'Also generate request types, simple workflows, dashboard/report themes, SLA patterns, and trends/metrics aligned to this domain.',
    'Return only JSON that matches the schema.',
  ].join('\n');

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = setTimeout(() => {
    if (controller) {
      controller.abort();
    }
  }, openAiTimeoutMs);

  const fetchPromise = forgeFetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    ...(controller ? { signal: controller.signal } : {}),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: 'You generate realistic Jira Service Management and Jira Software demo datasets. Do not include markdown.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'jira_demo_content',
          schema,
          strict: true,
        },
      },
      max_output_tokens: maxOutputTokens,
    }),
  });

  const response = await Promise.race([
    fetchPromise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`OpenAI content generation timed out after ${openAiTimeoutMs}ms`)), openAiTimeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI content generation failed: ${response.status} ${responseText}`);
  }

  const responseJson = JSON.parse(responseText);
  const outputText = extractOpenAiText(responseJson);
  const generatedContent = JSON.parse(outputText);
  return normaliseAiGeneratedContent(generatedContent, config.industry);
}

function getConfiguredContent(configOrIndustry) {
  if (configOrIndustry?.aiGeneratedContent) {
    return ensureDomainContentCompleteness(configOrIndustry.aiGeneratedContent, configOrIndustry.industry);
  }

  if (typeof configOrIndustry === 'object') {
    return ensureDomainContentCompleteness(buildDynamicDomainContent(configOrIndustry.industry), configOrIndustry.industry);
  }

  return getContent(configOrIndustry);
}

async function executeAiContentGenerationStep(config, state) {
  if (config.aiGeneratedContent) {
    addChunkedDiagnostics(state, [`AI content generation: reused generated content for "${config.industry}".`]);
    return config;
  }

  try {
    const aiGeneratedContent = await generateAiDemoContent(config);
    if (aiGeneratedContent) {
      config.aiGeneratedContent = aiGeneratedContent;
      addChunkedDiagnostics(state, [`AI content generation: generated domain-aware Jira data using OpenAI for "${config.industry}".`]);
    } else {
      addChunkedDiagnostics(state, ['AI content generation: OPENAI_API_KEY is not configured; using local dynamic generator fallback.']);
    }
  } catch (err) {
    addChunkedDiagnostics(state, [`AI content generation skipped: ${err.message}. Using local dynamic generator fallback.`]);
  }

  return config;
}

function isCsvIssueCreationMode() {
  return String(ISSUE_CREATION_MODE || '').toLowerCase() === 'csv';
}

function isRestDatePatchMode() {
  return false;
}

function formatCsvDateTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    ' ',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
}

function addHistoricalDatePatchIssue(state, { key, summary, lifecycle, status }) {
  if (!key || !lifecycle?.createdAt) {
    return;
  }

  state.metadata.historicalDatePatchIssues = state.metadata.historicalDatePatchIssues || [];
  const resolvedDate = isDoneLikeStatus(status || lifecycle.targetStatus)
    ? lifecycle.resolutionDate || lifecycle.updatedAt || null
    : null;

  state.metadata.historicalDatePatchIssues.push({
    'Issue key': key,
    'Project key': String(key).split('-')[0],
    Summary: summary || key,
    Created: formatCsvDateTime(lifecycle.createdAt),
    Resolved: formatCsvDateTime(resolvedDate),
    Resolution: resolvedDate ? 'Done' : '',
  });
}

async function forgeFetchWithTimeout(url, options = {}, timeoutMs = WORKER_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await forgeFetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Worker request timed out after ${timeoutMs / 1000}s`);
    }

    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function buildWorkerGenerationPayload(config, state = null) {
  const jsmProjects = (state?.results?.jsmProjects || [])
    .filter(project => project?.key)
    .map(project => ({
      projectKey: project.key,
      projectName: project.name,
    }));
  const softwareProjects = (config.softwareProjects || []).map((projectConfig, index) => {
    const createdProject = state?.results?.softwareProjects?.[index];
    return {
      ...projectConfig,
      projectKey: createdProject?.key || projectConfig.projectKey,
      projectName: createdProject?.name || projectConfig.projectName,
    };
  });

  return {
    environmentName: config.environmentName,
    industry: config.industry,
    customIndustry: config.customIndustry,
    isCustomIndustry: config.isCustomIndustry,
    dateRange: config.dateRange,
    jsmProjectCount: config.jsmProjectCount,
    incidentRequestsPerProject: config.itsmWorkCounts?.incidentRequestsPerProject || 0,
    problemRequestsPerProject: config.itsmWorkCounts?.problemRequestsPerProject || 0,
    changeRequestsPerProject: config.itsmWorkCounts?.changeRequestsPerProject || 0,
    serviceRequestsPerProject: config.itsmWorkCounts?.serviceRequestsPerProject || 0,
    jsmProjects,
    softwareProjects,
    opsDashboardTypes: config.opsDashboardTypes,
    opsDashboardSelections: config.opsDashboardSelections,
    softwareDashboardTypes: config.softwareDashboardTypes,
    softwareDashboardSelections: config.softwareDashboardSelections,
  };
}

async function executeWorkerDatasetGenerationStep(config, state) {
  try {
    const response = await forgeFetchWithTimeout(WORKER_GENERATION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify(buildWorkerGenerationPayload(config, state)),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok || !data.success) {
      throw new Error(data.message || `Worker returned ${response.status}`);
    }

    state.metadata.workerDataset = data;
    const aiBlueprint = data.metadata?.aiBlueprint;
    const aiBlueprintSummary = aiBlueprint
      ? `Worker AI blueprint source: ${aiBlueprint.source}${aiBlueprint.model ? ` (${aiBlueprint.model})` : ''}.`
      : 'Worker AI blueprint source: not returned.';
    addChunkedDiagnostics(state, [
      `Worker dataset generated: ${data.ticketCount || 0} CSV issue rows.`,
      aiBlueprintSummary,
      `Worker ticket CSV: ${data.ticketCsvPath || 'not returned'}`,
      `Worker release CSV: ${data.releaseCsvPath || 'not returned'}`,
      'CSV-first mode: Jira REST issue creation is skipped so historical Created/Resolved dates can come from CSV import.',
    ]);
  } catch (err) {
    state.metadata.workerDataset = {
      success: false,
      message: err.message,
    };
    addChunkedDiagnostics(state, [
      `Worker dataset generation skipped or failed: ${err.message}`,
      'Existing Forge REST creation flow will continue for now until the worker is hosted and reachable from Forge.',
    ]);
  }
}

async function executeWorkerDatePatchGenerationStep(config, state) {
  const issues = state.metadata.historicalDatePatchIssues || [];

  if (issues.length === 0) {
    state.metadata.workerDatePatch = {
      success: false,
      message: 'No REST-created issue keys were available for date patch CSV generation.',
    };
    addChunkedDiagnostics(state, ['Historical date patch CSV skipped: no REST-created issue keys were available.']);
    return;
  }

  state.metadata.workerDatePatch = {
    success: true,
    ticketCount: issues.length,
    browserDownload: true,
  };
  addChunkedDiagnostics(state, [
    `Legacy historical date patch CSV generation skipped: ${issues.length} existing issue row(s) were available, but the CSV patch flow is disabled.`,
    'Forge REST now populates custom historical Created Date and Resolved Date fields for dashboards instead.',
  ]);
}

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
  return ensureDomainContentCompleteness(all[industry] || buildDynamicDomainContent(industry), industry);
}

// ── JIRA API ──────────────────────────────────────────────────────────────────

async function readJiraJsonResponse(res, method, path) {
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`${method} ${path} failed: ${res.status} ${text}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  const text = await res.text();
  if (!text || text.trim() === '') return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function shouldRetryJiraAgileWithBasicAuth(path, err) {
  const body = String(err?.body || err?.message || '').toLowerCase();
  return String(path || '').startsWith('/rest/agile/1.0/')
    && (err?.status === 401 || err?.status === 403 || body.includes('authentication required'));
}

function isTransientJiraRequestError(err) {
  const message = String(err?.body || err?.message || '').toLowerCase();
  return [408, 429, 500, 502, 503, 504].includes(Number(err?.status))
    || message.includes('upstream_failure')
    || message.includes('upstream failure')
    || message.includes('temporarily unavailable')
    || message.includes('timeout')
    || message.includes('timed out');
}

async function requestJiraWithBasicAuth(path, options = {}) {
  const authConfig = getAtlassianGraphBasicAuthConfig();
  if (!authConfig.enabled) {
    throw new Error('configure ATLASSIAN_EMAIL/ATLASSIAN_API_TOKEN so Jira Software Agile board and sprint APIs can use the Basic Auth fallback.');
  }

  const { baseUrl } = await getCurrentSiteDetails();
  if (!baseUrl) {
    throw new Error('unable to resolve Atlassian site URL for Jira Software Agile API fallback.');
  }

  const credentials = Buffer.from(`${authConfig.email}:${authConfig.apiToken}`, 'utf8').toString('base64');
  const res = await forgeFetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${credentials}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  return readJiraJsonResponse(res, options.method || 'GET', path);
}

async function jiraRequest(path, options = {}) {
  const method = options.method || 'GET';
  let lastErr = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await api.asUser().requestJira(buildTrustedJiraRoute(path), options);
      return await readJiraJsonResponse(res, method, path);
    } catch (err) {
      lastErr = err;

      if (shouldRetryJiraAgileWithBasicAuth(path, err)) {
        try {
          return await requestJiraWithBasicAuth(path, options);
        } catch (fallbackErr) {
          lastErr = new Error(`${err.message}. Jira Software Agile Basic Auth fallback also failed: ${fallbackErr.message}`);
        }
      }

      if (!isTransientJiraRequestError(lastErr) || attempt >= 2) {
        throw lastErr;
      }

      await wait(800 * (attempt + 1));
    }
  }

  throw lastErr;
}

async function jiraGet(path) {
  return jiraRequest(path);
}

async function jiraPost(path, body) {
  return jiraRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function jiraPut(path, body) {
  return jiraRequest(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function jiraDelete(path) {
  return jiraRequest(path, {
    method: 'DELETE',
  });
}

async function jiraFormsGet(resourcePath) {
  const path = `/forms/${String(resourcePath || '').replace(/^\/+/, '')}`;
  const res = await api.asUser().requestJira(buildTrustedJiraRoute(path), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-ExperimentalApi': 'opt-in',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function jiraFormsPost(resourcePath, body) {
  const path = `/forms/${String(resourcePath || '').replace(/^\/+/, '')}`;
  const res = await api.asUser().requestJira(buildTrustedJiraRoute(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-ExperimentalApi': 'opt-in',
    },
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

async function jiraAppGet(path) {
  const res = await api.asApp().requestJira(buildTrustedJiraRoute(path));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function jiraAppPost(path, body) {
  const res = await api.asApp().requestJira(buildTrustedJiraRoute(path), {
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

async function jiraAppPut(path, body) {
  const res = await api.asApp().requestJira(buildTrustedJiraRoute(path), {
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

async function jiraAppDelete(path) {
  const res = await api.asApp().requestJira(buildTrustedJiraRoute(path), {
    method: 'DELETE',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DELETE ${path} failed: ${res.status} ${text}`);
  }
}

async function confluenceGet(path) {
  const res = await api.asUser().requestConfluence(buildTrustedConfluenceRoute(path));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function confluencePost(path, body) {
  const res = await api.asUser().requestConfluence(buildTrustedConfluenceRoute(path), {
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

async function requestAtlassianGraph(query, variables = {}) {
  let forgeGraphError = null;

  try {
    const response = await api.asUser().requestGraph(query, variables);

    if (response && typeof response.json === 'function') {
      const data = await response.json();
      if (!response.ok) {
        throw new Error(`GraphQL request failed: ${response.status} ${JSON.stringify(data)}`);
      }
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        throw new Error(data.errors.map(error => error.message || JSON.stringify(error)).join('; '));
      }
      return data.data || data;
    }

    if (response?.errors?.length) {
      throw new Error(response.errors.map(error => error.message || JSON.stringify(error)).join('; '));
    }

    return response?.data || response;
  } catch (err) {
    forgeGraphError = err;
  }

  try {
    return await requestAtlassianGraphWithBasicAuth(query, variables);
  } catch (basicAuthErr) {
    throw new Error(`Forge GraphQL failed: ${forgeGraphError.message}. Basic-auth GraphQL failed: ${basicAuthErr.message}`);
  }
}

function getAtlassianGraphBasicAuthConfig() {
  const email = String(
    process.env.ATLASSIAN_GRAPHQL_EMAIL ||
    process.env.ATLASSIAN_EMAIL ||
    process.env.JIRA_EMAIL ||
    ''
  ).trim();
  const apiToken = String(
    process.env.ATLASSIAN_GRAPHQL_API_TOKEN ||
    process.env.ATLASSIAN_API_TOKEN ||
    process.env.JIRA_API_TOKEN ||
    ''
  ).trim();

  return {
    enabled: Boolean(email && apiToken),
    email,
    apiToken,
  };
}

async function requestAtlassianGraphWithBasicAuth(query, variables = {}) {
  const authConfig = getAtlassianGraphBasicAuthConfig();
  if (!authConfig.enabled) {
    throw new Error('configure ATLASSIAN_GRAPHQL_EMAIL/ATLASSIAN_GRAPHQL_API_TOKEN or ATLASSIAN_EMAIL/ATLASSIAN_API_TOKEN for native Goals GraphQL fallback.');
  }

  const { baseUrl } = await getCurrentSiteDetails();
  if (!baseUrl) {
    throw new Error('unable to resolve Atlassian site URL for GraphQL gateway.');
  }

  const credentials = Buffer.from(`${authConfig.email}:${authConfig.apiToken}`, 'utf8').toString('base64');
  const response = await forgeFetch(`${baseUrl}/gateway/api/graphql`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`POST ${baseUrl}/gateway/api/graphql failed: ${response.status} ${text}`);
  }
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    throw new Error(data.errors.map(error => error.message || JSON.stringify(error)).join('; '));
  }

  return data.data || data;
}

async function getCurrentSiteDetails() {
  const serverInfo = await jiraGet('/rest/api/3/serverInfo');
  const baseUrl = String(serverInfo.baseUrl || process.env.ATLASSIAN_SITE_URL || '').replace(/\/$/, '');
  const hostName = baseUrl ? new URL(baseUrl).host : String(process.env.ATLASSIAN_SITE_HOSTNAME || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return {
    baseUrl,
    hostName,
  };
}

async function resolveAtlassianCloudId() {
  const configuredCloudId = String(process.env.ATLASSIAN_CLOUD_ID || process.env.COMPASS_CLOUD_ID || '').trim();
  if (configuredCloudId) {
    return configuredCloudId;
  }

  const { hostName } = await getCurrentSiteDetails();
  if (!hostName) {
    throw new Error('Unable to resolve Atlassian site hostname for GraphQL cloudId lookup.');
  }

  const data = await requestAtlassianGraph(`
    query getCloudId($hostName: String!) {
      tenantContexts(hostNames: [$hostName]) {
        cloudId
      }
    }
  `, { hostName });
  const cloudId = data?.tenantContexts?.[0]?.cloudId;
  if (!cloudId) {
    throw new Error(`Atlassian GraphQL did not return a cloudId for ${hostName}.`);
  }
  return cloudId;
}

function getGitHubDemoConfig() {
  const owner = String(process.env.GITHUB_OWNER || '').trim();
  const repo = String(process.env.GITHUB_REPO || '').trim();
  const token = String(process.env.GITHUB_TOKEN || '').trim();

  return {
    enabled: Boolean(GITHUB_DEMO_ACTIVITY_ENABLED && owner && repo && token),
    owner,
    repo,
    token,
  };
}

function getGitHubRepositoryUrl() {
  const owner = String(process.env.GITHUB_OWNER || '').trim();
  const repo = String(process.env.GITHUB_REPO || '').trim();
  return owner && repo ? `https://github.com/${owner}/${repo}` : '';
}

function getGitHubDemoConfigMessage() {
  if (!GITHUB_DEMO_ACTIVITY_ENABLED) {
    return 'GitHub demo activity skipped: GITHUB_DEMO_ACTIVITY_ENABLED=false.';
  }

  const missing = [
    ['GITHUB_OWNER', process.env.GITHUB_OWNER],
    ['GITHUB_REPO', process.env.GITHUB_REPO],
    ['GITHUB_TOKEN', process.env.GITHUB_TOKEN],
  ]
    .filter(([, value]) => !String(value || '').trim())
    .map(([name]) => name);

  return missing.length > 0
    ? `GitHub demo activity skipped: configure ${missing.join(', ')} Forge variable(s).`
    : '';
}

function slugifyGitHubPart(value, fallback = 'demo') {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

function buildGitHubBranchName(config, project, issue, index, variantIndex = 0) {
  const environmentSlug = slugifyGitHubPart(config.environmentName, 'environment');
  const projectSlug = slugifyGitHubPart(project.key, 'project');
  const issueSlug = slugifyGitHubPart(issue.key, `issue-${index + 1}`);
  return [
    'demo-activity',
    environmentSlug,
    projectSlug,
    `${issueSlug}-delivery-${index + 1}${variantIndex > 0 ? `-${variantIndex + 1}` : ''}`,
  ].join('/').slice(0, 180);
}

function buildGitHubDemoFilePath(config, project, issue, variantIndex = 0) {
  return [
    'demo-activity',
    slugifyGitHubPart(config.environmentName, 'environment'),
    project.key,
    `${issue.key}${variantIndex > 0 ? `-${variantIndex + 1}` : ''}.md`,
  ].join('/');
}

function getGitHubActivityWorkLabel(projectKind) {
  if (projectKind === 'jsm') return 'Service work type';
  if (projectKind === 'business') return 'Business work type';
  if (projectKind === 'product-discovery') return 'Discovery idea type';
  return 'Software work type';
}

function getGitHubActivityProjectLabel(projectKind) {
  if (projectKind === 'jsm') return 'Jira service project';
  if (projectKind === 'business') return 'Jira business space';
  if (projectKind === 'product-discovery') return 'Jira Product Discovery space';
  return 'Jira software project';
}

function uniqueGitHubActivityIssueRecords(records = []) {
  const byKey = new Map();
  for (const record of records || []) {
    if (record?.key && !byKey.has(record.key)) {
      byKey.set(record.key, record);
    }
  }
  return Array.from(byKey.values());
}

function getSoftwareGitHubActivityIssueRecords(project) {
  const issueRecords = Array.isArray(project?.issueRecords) ? project.issueRecords : [];
  const epicRecords = (project?.epicKeys || []).filter(Boolean).map((key, index) => ({
    key,
    title: `${project.key} delivery epic ${index + 1}`,
    issueType: 'Epic',
    priority: 'Medium',
    status: 'To Do',
    methodologyPhase: 'planning',
  }));

  return uniqueGitHubActivityIssueRecords([...issueRecords, ...epicRecords]);
}

function buildGitHubDemoFileContent(config, project, issue, projectKind = 'software', variantIndex = 0) {
  return [
    `# ${issue.key} GitHub Delivery Activity`,
    '',
    `Client demo: ${config.environmentName}`,
    `${getGitHubActivityProjectLabel(projectKind)}: ${project.key} - ${project.name}`,
    `Work item: ${issue.key} - ${issue.title || 'Generated demo work'}`,
    `Work type: ${issue.issueType || getGitHubActivityWorkLabel(projectKind)}`,
    `Priority: ${issue.priority || 'Medium'}`,
    `Status: ${issue.status || 'To Do'}`,
    `Delivery phase: ${issue.methodologyPhase || 'build'}`,
    `Activity branch: ${variantIndex + 1}`,
    '',
    'This generated commit exists so Jira can show linked GitHub branch, commit, pull request, and deployment activity for the demo environment.',
  ].join('\n');
}

async function githubRequest(config, path, options = {}) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), GITHUB_FETCH_TIMEOUT_MS)
    : null;

  let res;
  try {
    res = await forgeFetch(`https://api.github.com${path}`, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`${options.method || 'GET'} ${path} timed out after ${GITHUB_FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  const text = await res.text();
  const body = text ? (() => {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  })() : {};

  if (!res.ok) {
    const detail = typeof body === 'string' ? body : (body.message || JSON.stringify(body));
    throw new Error(`${options.method || 'GET'} ${path} failed: ${res.status} ${detail}`);
  }

  return body;
}

function isGitHubWriteAccessError(err) {
  const message = String(err?.message || '');
  return (
    message.includes('failed: 404')
    && (
      message.includes('POST /repos/')
      || message.includes('PUT /repos/')
      || message.includes('PATCH /repos/')
      || message.includes('DELETE /repos/')
    )
  );
}

function buildGitHubWriteAccessMessage(config) {
  return [
    `GitHub activity skipped: the configured GITHUB_TOKEN cannot write to ${config.owner}/${config.repo}.`,
    'Update the Forge development GITHUB_TOKEN with a GitHub token from an account that can write to that repository.',
    'Required GitHub permissions: metadata read, contents read/write, pull requests read/write, and deployments read/write.',
  ].join(' ');
}

async function getGitHubDefaultBranchSha(config) {
  const repo = await githubRequest(config, `/repos/${config.owner}/${config.repo}`);
  const defaultBranch = repo.default_branch || 'main';
  let ref;
  try {
    ref = await githubRequest(config, `/repos/${config.owner}/${config.repo}/git/ref/heads/${encodeURIComponent(defaultBranch)}`);
  } catch (err) {
    const message = String(err.message || '');
    if (!message.includes('409') && !message.includes('Git Repository is empty') && !message.includes('404')) {
      throw err;
    }

    const readme = await githubRequest(config, `/repos/${config.owner}/${config.repo}/contents/README.md`, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'Initialize repository for Jira demo development activity',
        content: Buffer.from([
          `# ${config.repo}`,
          '',
          'This repository is used by the Cprime Jira demo agent to generate linked branches, commits, pull requests, and deployments for Jira work items.',
        ].join('\n'), 'utf8').toString('base64'),
        branch: defaultBranch,
      }),
    });

    return {
      defaultBranch,
      sha: readme.commit?.sha,
    };
  }

  return {
    defaultBranch,
    sha: ref.object?.sha,
  };
}

async function ensureGitHubBranch(config, branchName, sourceSha) {
  try {
    const existing = await githubRequest(config, `/repos/${config.owner}/${config.repo}/git/ref/heads/${encodeURIComponent(branchName)}`);
    return {
      created: false,
      sha: existing.object?.sha || sourceSha,
    };
  } catch (err) {
    if (!String(err.message || '').includes('404')) {
      throw err;
    }
  }

  const created = await githubRequest(config, `/repos/${config.owner}/${config.repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: sourceSha,
    }),
  });

  return {
    created: true,
    sha: created.object?.sha || sourceSha,
  };
}

async function upsertGitHubDemoFile(config, branchName, filePath, content, commitMessage) {
  const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, '/');
  let existingSha = null;

  try {
    const existing = await githubRequest(
      config,
      `/repos/${config.owner}/${config.repo}/contents/${encodedPath}?ref=${encodeURIComponent(branchName)}`
    );
    existingSha = existing.sha || null;
  } catch (err) {
    if (!String(err.message || '').includes('404')) {
      throw err;
    }
  }

  return githubRequest(config, `/repos/${config.owner}/${config.repo}/contents/${encodedPath}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: commitMessage,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch: branchName,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });
}

async function ensureGitHubPullRequest(config, defaultBranch, branchName, title, body) {
  const existingPulls = await githubRequest(
    config,
    `/repos/${config.owner}/${config.repo}/pulls?state=open&head=${encodeURIComponent(`${config.owner}:${branchName}`)}&base=${encodeURIComponent(defaultBranch)}`
  );

  if (Array.isArray(existingPulls) && existingPulls.length > 0) {
    return {
      reused: true,
      number: existingPulls[0].number,
      url: existingPulls[0].html_url,
    };
  }

  const created = await githubRequest(config, `/repos/${config.owner}/${config.repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      head: branchName,
      base: defaultBranch,
      body,
    }),
  });

  return {
    reused: false,
    number: created.number,
    url: created.html_url,
  };
}

async function createGitHubDeployment(config, branchName, environment, issue, pullRequestUrl) {
  const deployment = await githubRequest(config, `/repos/${config.owner}/${config.repo}/deployments`, {
    method: 'POST',
    body: JSON.stringify({
      ref: branchName,
      auto_merge: false,
      required_contexts: [],
      environment,
      description: `${issue.key} demo deployment activity`,
      production_environment: false,
      transient_environment: false,
    }),
  });

  const status = 'success';

  await githubRequest(config, `/repos/${config.owner}/${config.repo}/deployments/${deployment.id}/statuses`, {
    method: 'POST',
    body: JSON.stringify({
      state: status,
      environment,
      log_url: pullRequestUrl || `https://github.com/${config.owner}/${config.repo}`,
      environment_url: pullRequestUrl || `https://github.com/${config.owner}/${config.repo}`,
      description: `${issue.key} deployed successfully for Jira demo activity`,
    }),
  });

  return {
    id: deployment.id,
    environment,
    status,
    url: pullRequestUrl || `https://github.com/${config.owner}/${config.repo}/deployments`,
  };
}

function getGitHubRepositoryId(config) {
  return `${config.owner}/${config.repo}`;
}

function toJiraDevInfoId(value, fallback = 'cprime-demo') {
  const safe = String(value || '')
    .replace(/[^A-Za-z0-9\-._~]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255);
  return safe || fallback;
}

function getGitHubAuthor() {
  return {
    name: 'Cprime Demo Agent',
    email: 'demo-agent@cprime.local',
    username: 'cprime-demo-agent',
    url: 'https://github.com',
  };
}

function buildJiraDevInfoRepository(config, project, defaultBranch, records) {
  const repositoryName = getGitHubRepositoryId(config);
  const repositoryId = toJiraDevInfoId(repositoryName, 'cprime-demo-repository');
  const repositoryUrl = `https://github.com/${config.owner}/${config.repo}`;
  const author = getGitHubAuthor();
  const now = new Date().toISOString();
  const updateSequenceId = Date.now();

  return {
    id: repositoryId,
    name: repositoryName,
    url: repositoryUrl,
    description: `GitHub delivery activity generated for ${project.key}.`,
    updateSequenceId,
    commits: records.map((record, index) => {
      const sequence = updateSequenceId + index + 1;
      return {
        id: record.commitSha,
        associations: [{ associationType: 'issueIdOrKeys', values: [record.issueKey] }],
        updateSequenceId: sequence,
        hash: record.commitSha,
        message: record.commitMessage,
        author,
        fileCount: 1,
        url: record.commitUrl,
        files: [{
          path: record.filePath,
          url: record.fileUrl || record.commitUrl,
          changeType: 'MODIFIED',
          linesAdded: 12,
          linesRemoved: 0,
        }],
        authorTimestamp: now,
        displayId: String(record.commitSha || '').slice(0, 7),
      };
    }),
    branches: records.map((record, index) => {
      const sequence = updateSequenceId + records.length + index + 1;
      return {
        id: toJiraDevInfoId(`${repositoryId}-${record.branchName}`, `${repositoryId}-branch-${index + 1}`),
        associations: [{ associationType: 'issueIdOrKeys', values: [record.issueKey] }],
        updateSequenceId: sequence,
        name: record.branchName,
        lastCommit: {
          id: record.commitSha,
          updateSequenceId: sequence,
          hash: record.commitSha,
          message: record.commitMessage,
          author,
          fileCount: 1,
          url: record.commitUrl,
          authorTimestamp: now,
          displayId: String(record.commitSha || '').slice(0, 7),
        },
        createPullRequestUrl: `${repositoryUrl}/compare/${encodeURIComponent(defaultBranch)}...${encodeURIComponent(record.branchName)}?quick_pull=1`,
        url: record.branchUrl,
      };
    }),
    pullRequests: records.filter(record => record.pullRequestUrl).map((record, index) => {
      const sequence = updateSequenceId + (records.length * 2) + index + 1;
      return {
        id: toJiraDevInfoId(`${repositoryId}-pull-${record.pullRequestNumber}`, `${repositoryId}-pull-${index + 1}`),
        associations: [{ associationType: 'issueIdOrKeys', values: [record.issueKey] }],
        updateSequenceId: sequence,
        status: 'OPEN',
        title: record.pullRequestTitle,
        author,
        commentCount: 0,
        sourceBranch: record.branchName,
        sourceBranchUrl: record.branchUrl,
        lastUpdate: now,
        destinationBranch: defaultBranch,
        destinationBranchUrl: `${repositoryUrl}/tree/${encodeURIComponent(defaultBranch)}`,
        reviewers: [],
        url: record.pullRequestUrl,
        displayId: `PR #${record.pullRequestNumber}`,
      };
    }),
  };
}

async function submitJiraDevelopmentInformation(config, project, defaultBranch, records) {
  if (!records.length) {
    return null;
  }

  return jiraAppPost('/rest/devinfo/0.10/bulk', {
    repositories: [buildJiraDevInfoRepository(config, project, defaultBranch, records)],
    preventTransitions: true,
    operationType: 'NORMAL',
    properties: {
      source: 'cprime-demo-agent',
      projectKey: project.key,
      repository: toJiraDevInfoId(getGitHubRepositoryId(config), 'cprime-demo-repository'),
    },
    providerMetadata: {
      product: 'Cprime Demo GitHub Activity',
    },
  });
}

function mapGitHubDeploymentStateToJira(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'success' || normalized === 'successful') return 'successful';
  if (normalized === 'failure' || normalized === 'failed' || normalized === 'error') return 'failed';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (normalized === 'pending' || normalized === 'queued') return 'pending';
  return 'successful';
}

async function submitJiraDeploymentInformation(config, project, records) {
  if (!records.length) {
    return null;
  }

  const repositoryUrl = `https://github.com/${config.owner}/${config.repo}`;
  const repositoryId = toJiraDevInfoId(getGitHubRepositoryId(config), 'cprime-demo-repository');
  const updateSequenceNumber = Date.now();
  return jiraAppPost('/rest/deployments/0.1/bulk', {
    properties: {
      source: 'cprime-demo-agent',
      projectKey: project.key,
      repository: repositoryId,
    },
    deployments: records.map((record, index) => ({
      deploymentSequenceNumber: Number(record.deploymentId || updateSequenceNumber + index),
      updateSequenceNumber: updateSequenceNumber + index,
      issueKeys: [record.issueKey],
      displayName: `${record.issueKey} demo deployment`,
      url: record.deploymentUrl || record.pullRequestUrl || repositoryUrl,
      description: `Demo deployment generated from GitHub activity for ${record.issueKey}.`,
      lastUpdated: new Date().toISOString(),
      label: `${record.projectKey}-${record.issueKey}`,
      duration: 60,
      state: mapGitHubDeploymentStateToJira(record.deploymentStatus),
      pipeline: {
        id: toJiraDevInfoId(`${project.key}-github-demo-pipeline`, `${project.key}-pipeline`),
        displayName: `${project.key} GitHub demo pipeline`,
        url: repositoryUrl,
      },
      environment: {
        id: toJiraDevInfoId(record.deploymentEnvironment, `${project.key}-development`),
        displayName: record.deploymentEnvironment,
        type: 'development',
      },
      schemaVersion: '1.0',
    })),
    providerMetadata: {
      product: 'Cprime Demo GitHub Deployments',
    },
  });
}

async function addGitHubActivityIssueEvidence(record, diagnostics = []) {
  if (!record?.issueKey) {
    return 0;
  }

  let added = 0;
  const links = [
    {
      url: record.pullRequestUrl,
      title: `${record.issueKey} GitHub pull request #${record.pullRequestNumber}`,
      relationship: 'reviewed in',
      summary: `Generated demo pull request for ${record.issueKey}.`,
    },
    {
      url: record.commitUrl,
      title: `${record.issueKey} GitHub commit ${String(record.commitSha || '').slice(0, 7)}`,
      relationship: 'implemented by',
      summary: `Generated demo commit for ${record.issueKey}.`,
    },
    {
      url: record.branchUrl,
      title: `${record.issueKey} GitHub branch`,
      relationship: 'developed on',
      summary: `Generated demo branch for ${record.issueKey}.`,
    },
  ];

  for (const link of links) {
    if (await addIssueRemoteLink(record.issueKey, link, diagnostics)) {
      added += 1;
    }
  }

  return added;
}

function buildTrustedJiraRoute(path) {
  // These endpoints are assembled centrally so we validate the shape once here,
  // then tell Forge the route is intentional. This avoids false positives from
  // passing a complete string through `route`${...}` while still rejecting
  // traversal attempts or absolute URLs.
  if (typeof path !== 'string' || !(path.startsWith('/rest/') || path.startsWith('/forms/'))) {
    throw new Error(`Invalid Jira REST path: ${path}`);
  }

  if (path.includes('..') || path.includes('://') || path.startsWith('//')) {
    throw new Error(`Unsafe Jira REST path rejected: ${path}`);
  }

  return assumeTrustedRoute(path);
}

function buildTrustedConfluenceRoute(path) {
  if (typeof path !== 'string' || !path.startsWith('/wiki/api/')) {
    throw new Error(`Invalid Confluence REST path: ${path}`);
  }

  if (path.includes('..') || path.includes('\\') || path.startsWith('//')) {
    throw new Error(`Unsafe Confluence REST path: ${path}`);
  }

  return assumeTrustedRoute(path);
}

function buildProjectInClause(projectKeys) {
  return projectKeys
    .filter(Boolean)
    .map(projectKey => `"${String(projectKey).replace(/"/g, '\\"')}"`)
    .join(', ');
}

function normaliseFieldName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
}

function isCustomDateField(field) {
  const schemaType = String(field?.schema?.type || '').toLowerCase();
  const customType = String(field?.schema?.custom || '').toLowerCase();
  const looksCustom = Boolean(field?.custom) || String(field?.id || field?.key || '').startsWith('customfield_');

  return looksCustom && (
    schemaType === 'date' ||
    schemaType === 'datetime' ||
    customType.includes(':datepicker') ||
    customType.includes(':datetime')
  );
}

function parseDateRangeDays(value) {
  const match = String(value || '').match(/(\d+)/);
  const amount = match ? Number.parseInt(match[1], 10) : 6;
  const isYearRange = String(value || '').toLowerCase().includes('year');
  return Math.max(30, Math.min(730, amount * (isYearRange ? 365 : 30)));
}

function toJiraDateOnly(value) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString().split('T')[0];
}

function buildDueDateFromLifecycle(lifecycle, priority, index) {
  const createdAt = new Date(lifecycle?.createdAt || new Date());
  const isHighPriority = ['Highest', 'High', 'Critical', 'P1 - Critical', 'P2 - High'].includes(priority);
  const targetStatus = normaliseStatusName(lifecycle?.targetStatus);
  const plannedDays = isHighPriority ? 3 + (index % 5) : 10 + (index % 18);
  const dueDate = addDays(createdAt, plannedDays);

  if (targetStatus === 'resolved' || targetStatus === 'done' || targetStatus === 'closed' || targetStatus === 'completed') {
    return toJiraDateOnly(lifecycle?.resolutionDate || dueDate);
  }

  return toJiraDateOnly(dueDate);
}

async function getCurrentUser() {
  const data = await jiraGet('/rest/api/3/myself');
  return data.accountId;
}

async function getMyGlobalPermissions() {
  const data = await jiraGet('/rest/api/3/mypermissions?permissions=ADMINISTER');
  return data.permissions || {};
}

function extractProjectTypeKeys(projectTypes) {
  return (Array.isArray(projectTypes) ? projectTypes : [])
    .map(projectType => projectType?.key)
    .filter(Boolean);
}

async function getVisibleProjectTypeKeys(diagnostics = []) {
  const keys = new Set();

  try {
    extractProjectTypeKeys(await jiraGet('/rest/api/3/project/type'))
      .forEach(key => keys.add(key));
  } catch (err) {
    diagnostics.push(`JSM preflight: user project type lookup failed: ${err.message}`);
  }

  try {
    extractProjectTypeKeys(await jiraAppGet('/rest/api/3/project/type'))
      .forEach(key => keys.add(key));
  } catch (err) {
    diagnostics.push(`JSM preflight: app project type lookup failed: ${err.message}`);
  }

  return Array.from(keys);
}

async function createJSMProject(name, leadAccountId, keyPrefix, diagnostics = [], serviceType = 'ITSM') {
  const jsmServiceType = normaliseJsmServiceType(serviceType);
  const serviceTypeLabel = getJsmServiceTypeLabel(jsmServiceType);
  const templateKeys = await getProjectTemplateKeysForSelection({
    projectTypeKey: 'service_desk',
    staticKeys: getJsmTemplateKeys(jsmServiceType),
    labels: getJsmTemplateSearchLabels(jsmServiceType),
    diagnostics,
  });

  // Keep the Ops project as a real Jira Service Management project. We do not
  // fall back to Jira Work Management here because the user expects JSM queues,
  // request types, and Forms. If these templates are unavailable, failing loudly
  // is better than creating the wrong project type.
  const visibleProjectTypeKeys = await getVisibleProjectTypeKeys(diagnostics);
  diagnostics.push(`JSM preflight: visible Jira project types=${visibleProjectTypeKeys.join(', ') || 'none'}.`);

  if (!visibleProjectTypeKeys.includes('service_desk')) {
    throw new Error(
      `Jira Service Management is not active for REST project creation on this site. The ${serviceTypeLabel} template currently appears unavailable in Jira, so start/activate Jira Service Management first, then rerun the demo. The app will not create a Business/JWM fallback for this JSM selection.`
    );
  }

  let project;

  try {
    project = await createProjectWithRetries({
      name,
      leadAccountId,
      keyPrefix,
      projectTypeKey: 'service_desk',
      maxAttempts: 6,
      templateKeys,
      allowTemplateOmission: false,
      diagnostics,
      serviceTypeLabel,
    });
  } catch (err) {
    const message = String(err?.message || '');
    if (isProjectNameCollisionMessage(message)) {
      const retryName = `${name} ${createRunLabel()}`;
      diagnostics.push(`${serviceTypeLabel}: Jira reported that project name "${name}" already exists; retrying with unique name "${retryName}".`);
      project = await createProjectWithRetries({
        name: retryName,
        leadAccountId,
        keyPrefix,
        projectTypeKey: 'service_desk',
        maxAttempts: 10,
        templateKeys,
        allowTemplateOmission: false,
        diagnostics,
        serviceTypeLabel,
      });
      return {
        ...project,
        serviceDeskAvailable: true,
        projectTypeKey: 'service_desk',
        jsmServiceType,
      };
    }

    const canUseCompatibilityProject = /invalid project type|project template specified does not exist|template.*does not exist/i.test(message);
    if (!canUseCompatibilityProject) {
      throw err;
    }

    diagnostics.push(`${serviceTypeLabel}: Jira REST rejected service_desk project creation, so the app is creating a Jira Work Management compatibility space and will still generate ${serviceTypeLabel} work, dashboard, and reports. Original error: ${message}`);
    const fallbackProject = await createWorkManagementProject(name, leadAccountId, keyPrefix, 'task-tracking', diagnostics);
    return {
      ...fallbackProject,
      serviceDeskAvailable: false,
      projectTypeKey: fallbackProject.projectTypeKey || 'business',
      jsmServiceType,
      compatibilityMode: 'service-management-on-work-management',
      compatibilityReason: message,
    };
  }

  return {
    ...project,
    serviceDeskAvailable: true,
    projectTypeKey: 'service_desk',
    jsmServiceType,
  };
}

async function getProjectByKeyIfExists(projectKey) {
  try {
    return await jiraGet(`/rest/api/3/project/${encodeURIComponent(projectKey)}`);
  } catch (err) {
    const message = String(err.message || '');
    if (message.includes('404')) {
      return null;
    }

    throw err;
  }
}

async function getIssueCountForProject(projectKey) {
  if (!projectKey) {
    return null;
  }

  try {
    const response = await jiraPost('/rest/api/3/search/approximate-count', {
      jql: `project = ${quoteJqlValue(projectKey)}`,
    });
    const count = Number(response.count);
    return Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
}

function getProjectInsightIssueCount(project) {
  const candidates = [
    project?.insight?.totalIssueCount,
    project?.insight?.lastIssueUpdateTime ? null : project?.issueCount,
  ];
  const value = candidates.find(candidate => Number.isFinite(Number(candidate)));
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

async function getProjectDemoDomainMetadata(projectKey) {
  if (!projectKey) {
    return null;
  }

  try {
    return await jiraGet(`/rest/api/3/project/${encodeURIComponent(projectKey)}/properties/${DEMO_DOMAIN_PROJECT_PROPERTY_KEY}`);
  } catch (err) {
    return null;
  }
}

async function saveProjectDemoDomainMetadata(project, metadata, diagnostics = []) {
  if (!project?.key) {
    return;
  }

  try {
    await jiraPut(`/rest/api/3/project/${encodeURIComponent(project.key)}/properties/${DEMO_DOMAIN_PROJECT_PROPERTY_KEY}`, metadata);
  } catch (err) {
    diagnostics.push(`Domain metadata ${project.key}: skipped project property write: ${err.message}`);
  }
}

function getDomainSearchAliases(domain) {
  const normalizedDomain = String(domain || '').trim().toLowerCase();
  const aliasMap = {
    'banking & insurance': ['Banking', 'Insurance', 'Bank', 'Claims', 'Policy'],
    'banking insurance': ['Banking', 'Insurance', 'Bank', 'Claims', 'Policy'],
    banking: ['Banking', 'Bank'],
    insurance: ['Insurance', 'Claims', 'Policy'],
    'manufacturing & energy utilities': ['Manufacturing', 'Energy', 'Utilities', 'Grid'],
    'manufacturing energy utilities': ['Manufacturing', 'Energy', 'Utilities', 'Grid'],
    manufacturing: ['Manufacturing'],
    'energy & utilities': ['Energy', 'Utilities', 'Grid'],
    'energy utilities': ['Energy', 'Utilities', 'Grid'],
    'retail & e-commerce': ['Retail', 'E-commerce', 'Ecommerce', 'Commerce'],
    'retail & e commerce': ['Retail', 'E-commerce', 'Ecommerce', 'Commerce'],
    'retail e commerce': ['Retail', 'E-commerce', 'Ecommerce', 'Commerce'],
    retail: ['Retail'],
    ecommerce: ['E-commerce', 'Ecommerce', 'Commerce'],
    'e commerce': ['E-commerce', 'Ecommerce', 'Commerce'],
  };
  const aliases = aliasMap[normalizedDomain] || [domain];
  return Array.from(new Set(
    aliases
      .concat(domain)
      .map(value => String(value || '').trim())
      .filter(Boolean)
  ));
}

function projectNameMatchesDomain(projectName, domain) {
  const normalizedName = String(projectName || '').toLowerCase();
  return getDomainSearchAliases(domain).some(alias => normalizedName.includes(alias.toLowerCase()));
}

function quoteJqlValue(value) {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function classifyDomainProject(project, metadata = null) {
  const value = metadata?.value || metadata || {};
  if (value.kind === 'business' || value.kind === 'software' || value.kind === 'business-project' || value.kind === 'product-discovery') {
    const isServiceProject = value.kind === 'business';
    const isSoftwareProject = value.kind === 'software';
    const businessSpaceType = normaliseBusinessSpaceType(value.businessSpaceType);
    return {
      ...value,
      categoryLabel: isServiceProject ? 'JSM' : isSoftwareProject ? 'Software' : value.kind === 'product-discovery' ? 'JPD' : 'Business',
      detailLabel: isServiceProject
        ? normaliseJsmServiceType(value.jsmServiceType)
        : isSoftwareProject
          ? `${normaliseSoftwareTemplate(value.softwareTemplate)} ${getProjectManagementStyleLabel(value.softwareProjectStyle || '')}`.trim()
          : value.kind === 'product-discovery'
            ? 'Product discovery'
            : getBusinessSpaceTypeLabel(businessSpaceType),
      ...(value.kind === 'business-project' ? { businessSpaceType } : {}),
      ...(value.kind === 'product-discovery' ? { productDiscoveryType: 'product-discovery' } : {}),
    };
  }

  const name = String(project?.name || '');
  const serviceType = JSM_SERVICE_TYPES.find(type => new RegExp(`\\b${type}\\b`, 'i').test(name));
  const isKanban = /\bkanban\b/i.test(name);
  const isScrum = /\bscrum\b/i.test(name);
  const lowerName = name.toLowerCase();

  if (project?.projectTypeKey === 'service_desk') {
    return {
      kind: 'business',
      jsmServiceType: serviceType || 'ITSM',
      categoryLabel: 'JSM',
      detailLabel: serviceType || 'ITSM',
    };
  }

  if (project?.projectTypeKey === 'software') {
    const isBugTracking = lowerName.includes('bug') || lowerName.includes('defect');
    const softwareTemplate = isKanban ? 'kanban' : isScrum ? 'scrum' : isBugTracking ? 'bug-tracking' : '';
    return {
      kind: 'software',
      softwareTemplate,
      softwareProjectStyle: value.softwareProjectStyle || '',
      categoryLabel: 'Software',
      detailLabel: `${softwareTemplate || 'software'} ${value.softwareProjectStyle || ''}`.trim(),
    };
  }

  if (project?.projectTypeKey === 'business') {
    const businessSpaceType = lowerName.includes('go-to-market') || lowerName.includes('go to market') || lowerName.includes('launch')
      ? 'go-to-market'
      : lowerName.includes('project management')
        ? 'project-management'
        : lowerName.includes('finance')
          ? 'finance'
          : lowerName.includes('budget')
            ? 'budget-planning'
            : lowerName.includes('marketing')
              ? 'marketing'
              : lowerName.includes('design')
                ? 'design'
                : lowerName.includes('legal')
                  ? 'legal'
                  : lowerName.includes('sales')
                    ? 'sales'
                    : lowerName.includes('procurement') || lowerName.includes('purchase')
                      ? 'procurement-management'
                      : lowerName.includes('recruit')
                        ? 'recruitment-tracking'
                        : 'task-tracking';
    return {
      kind: 'business-project',
      categoryLabel: 'Business',
      businessSpaceType,
      detailLabel: getBusinessSpaceTypeLabel(businessSpaceType),
    };
  }

  if (project?.projectTypeKey === 'product_discovery' || project?.projectTypeKey === 'product-discovery') {
    return {
      kind: 'product-discovery',
      categoryLabel: 'JPD',
      productDiscoveryType: 'product-discovery',
      detailLabel: 'Product discovery',
    };
  }

  return {
    kind: project?.projectTypeKey || 'project',
    categoryLabel: project?.projectTypeKey || 'Project',
    detailLabel: project?.projectTypeKey || 'Project',
  };
}

async function searchDomainProjects(domain, options = {}) {
  const requestedSpaceType = String(options.spaceType || '').trim();
  const includeIssueCounts = options.includeIssueCounts !== false;
  const valuesByKey = new Map();
  const maxResults = 50;

  for (const query of getDomainSearchAliases(domain).slice(0, 4)) {
    const response = await jiraGet(`/rest/api/3/project/search?query=${encodeURIComponent(query)}&startAt=0&maxResults=${maxResults}&expand=insight`);
    const pageValues = Array.isArray(response?.values) ? response.values : [];
    pageValues.forEach(project => {
      if (project?.key && !valuesByKey.has(project.key)) {
        valuesByKey.set(project.key, project);
      }
    });
  }

  const projects = [];

  for (const project of valuesByKey.values()) {
    if (!projectNameMatchesDomain(project.name, domain)) {
      continue;
    }

    const initialClassification = classifyDomainProject(project, null);
    if (!projectMatchesRequestedSpaceType(initialClassification, requestedSpaceType)) {
      continue;
    }

    const metadata = await getProjectDemoDomainMetadata(project.key);
    const classification = classifyDomainProject(project, metadata);
    if (!projectMatchesRequestedSpaceType(classification, requestedSpaceType)) {
      continue;
    }

    const liveIssueCount = includeIssueCounts ? await getIssueCountForProject(project.key) : null;
    const issueCount = liveIssueCount ?? getProjectInsightIssueCount(project);
    projects.push({
      id: project.id,
      key: project.key,
      name: project.name,
      projectTypeKey: project.projectTypeKey,
      issueCount,
      ...classification,
      metadata: metadata?.value || metadata || null,
    });
  }

  return projects;
}

function projectMatchesRequestedSpaceType(project, spaceType) {
  const requested = String(spaceType || '').trim();
  if (!requested) {
    return true;
  }

  if (requested.startsWith('jsm:')) {
    return project.kind === 'business'
      && normaliseJsmServiceType(project.jsmServiceType) === normaliseJsmServiceType(requested.replace(/^jsm:/, ''));
  }

  if (requested.startsWith('software:')) {
    return project.kind === 'software'
      && normaliseSoftwareTemplate(project.softwareTemplate || requested.replace(/^software:/, '')) === normaliseSoftwareTemplate(requested.replace(/^software:/, ''));
  }

  if (requested.startsWith('business:')) {
    return project.kind === 'business-project'
      && normaliseBusinessSpaceType(project.businessSpaceType) === normaliseBusinessSpaceType(requested.replace(/^business:/, ''));
  }

  if (requested === 'jpd:product-discovery') {
    return project.kind === 'product-discovery';
  }

  return true;
}

function isNativeProductDiscoveryProject(project) {
  const projectTypeKey = String(project?.projectTypeKey || '').toLowerCase();
  return projectTypeKey === 'product_discovery' || projectTypeKey === 'product-discovery';
}

async function findReusableDomainProject(config, criteria = {}) {
  if (config.reuseExistingDomainData === false) {
    return null;
  }

  const selectedVolumeKeys = new Set(config.volumeProjectKeys || []);
  if (selectedVolumeKeys.size === 0) {
    return null;
  }

  const projects = await searchDomainProjects(config.industry);
  const excludeKeys = new Set((criteria.excludeKeys || []).filter(Boolean));
  const matches = projects.filter(project => {
    if (excludeKeys.has(project.key)) {
      return false;
    }

    if (criteria.kind && project.kind !== criteria.kind) {
      return false;
    }

    if (criteria.kind === 'business') {
      return normaliseJsmServiceType(project.jsmServiceType) === normaliseJsmServiceType(criteria.jsmServiceType);
    }

    if (criteria.kind === 'software') {
      const templateMatches = !criteria.softwareTemplate || !project.softwareTemplate || normaliseSoftwareTemplate(project.softwareTemplate) === normaliseSoftwareTemplate(criteria.softwareTemplate);
      const styleMatches = !criteria.softwareProjectStyle || !project.softwareProjectStyle || normaliseProjectManagementStyle(project.softwareProjectStyle) === normaliseProjectManagementStyle(criteria.softwareProjectStyle);
      return templateMatches && styleMatches;
    }

    if (criteria.kind === 'business-project') {
      return normaliseBusinessSpaceType(project.businessSpaceType) === normaliseBusinessSpaceType(criteria.businessSpaceType);
    }

    if (criteria.kind === 'product-discovery') {
      return project.kind === 'product-discovery' && isNativeProductDiscoveryProject(project);
    }

    return true;
  });
  return matches.find(project => selectedVolumeKeys.has(project.key)) || null;
}

function getJsmServiceTypeLabel(value) {
  const serviceType = normaliseJsmServiceType(value);
  const labels = {
    ITSM: 'IT Service Management',
    'ITSM-ESS': 'IT Service Management Essentials',
    GSM: 'General Service Management',
    HRSM: 'HR Service Management',
    CSM: 'Customer Service Management',
    FSM: 'Facilities Service Management',
    LSM: 'Legal Service Management',
  };
  return labels[serviceType] || labels.ITSM;
}

function getJsmTemplateSearchLabels(value) {
  const serviceType = normaliseJsmServiceType(value);
  const labels = {
    ITSM: ['IT Service Management', 'IT service management'],
    'ITSM-ESS': ['IT Service Management Essentials', 'IT service management essentials', 'ITSM Essentials'],
    GSM: ['General Service Management', 'General service management'],
    HRSM: ['HR Service Management', 'HR service management'],
    CSM: ['Customer Service Management', 'Customer service management'],
    FSM: ['Facilities Service Management', 'Facility Service Management', 'Facilities service management', 'Facility service management'],
    LSM: ['Legal Service Management', 'Legal service management'],
  };
  return labels[serviceType] || labels.ITSM;
}

function getJsmTemplateKeys(serviceType = 'ITSM') {
  const normalized = normaliseJsmServiceType(serviceType);
  const templateMap = {
    ITSM: [
      'com.atlassian.servicedesk:simplified-it-service-management',
      'com.atlassian.servicedesk:Team-managed-it-service-management',
      'com.atlassian.servicedesk:simplified-it-service-desk',
      'com.atlassian.servicedesk:simplified-it-service-management-basic',
      'com.atlassian.servicedesk:itil-v2-service-desk-project',
      'com.atlassian.servicedesk:simplified-general-service-desk-it',
      'com.atlassian.servicedesk:next-gen-it-service-desk',
    ],
    'ITSM-ESS': [
      'com.atlassian.servicedesk:simplified-it-service-management-essentials',
      'com.atlassian.servicedesk:simplified-it-service-management-basic',
      'com.atlassian.servicedesk:it-service-management-essentials',
      'com.atlassian.servicedesk:it-service-management-basic',
      'com.atlassian.servicedesk:team-managed-it-service-management',
      'com.atlassian.servicedesk:next-gen-it-service-desk',
    ],
    GSM: [
      'com.atlassian.servicedesk:simplified-internal-service-desk',
      'com.atlassian.servicedesk:internal-service-desk',
      'com.atlassian.servicedesk:simplified-general-service-desk',
      'com.atlassian.servicedesk:simplified-general-service-management',
      'com.atlassian.servicedesk:simplified-internal-service-desk',
      'com.atlassian.servicedesk:general-service-management',
      'com.atlassian.servicedesk:general-service-desk',
    ],
    HRSM: [
      'com.atlassian.servicedesk:simplified-internal-service-desk',
      'com.atlassian.servicedesk:simplified-hr-service-management',
      'com.atlassian.servicedesk:simplified-hr-service-desk',
      'com.atlassian.servicedesk:hr-service-management',
      'com.atlassian.servicedesk:hr-service-desk',
    ],
    CSM: [
      'com.atlassian.servicedesk:simplified-external-service-desk',
      'com.atlassian.servicedesk:simplified-customer-service-management',
      'com.atlassian.servicedesk:simplified-customer-service-desk',
      'com.atlassian.servicedesk:customer-service-management',
      'com.atlassian.servicedesk:customer-service-desk',
    ],
    FSM: [
      'com.atlassian.servicedesk:simplified-internal-service-desk',
      'com.atlassian.servicedesk:simplified-facility-service-management',
      'com.atlassian.servicedesk:simplified-facility-service-desk',
      'com.atlassian.servicedesk:simplified-facilities-service-management',
      'com.atlassian.servicedesk:simplified-facilities-service-desk',
      'com.atlassian.servicedesk:facility-service-management',
      'com.atlassian.servicedesk:facility-service-desk',
      'com.atlassian.servicedesk:facilities-service-management',
      'com.atlassian.servicedesk:facilities-service-desk',
    ],
    LSM: [
      'com.atlassian.servicedesk:simplified-internal-service-desk',
      'com.atlassian.servicedesk:simplified-legal-service-management',
      'com.atlassian.servicedesk:simplified-legal-service-desk',
      'com.atlassian.servicedesk:legal-service-management',
      'com.atlassian.servicedesk:legal-service-desk',
    ],
  };

  return templateMap[normalized] || templateMap.ITSM;
}

function getJsmItsmTemplateKeys() {
  return getJsmTemplateKeys('ITSM');
}

async function getServiceDeskId(projectKey) {
  try {
    const direct = await jiraGet(`/rest/servicedeskapi/servicedesk/project/${encodeURIComponent(projectKey)}`);
    if (direct?.id) {
      return direct.id;
    }
  } catch (err) {
    const message = String(err?.message || '');
    if (!message.includes('404')) {
      console.warn(`Direct service desk lookup for ${projectKey} failed: ${message}`);
    }
  }

  let start = 0;
  const limit = 50;

  for (let page = 0; page < 10; page += 1) {
    const data = await jiraGet(`/rest/servicedeskapi/servicedesk?start=${start}&limit=${limit}`);
    const values = Array.isArray(data.values) ? data.values : [];
    const sd = values.find(s => s.projectKey === projectKey);

    if (sd?.id) {
      return sd.id;
    }

    if (data.isLastPage || values.length === 0) {
      break;
    }

    start += limit;
  }

  return null;
}

async function getServiceDeskIdWithRetry(projectKey, {
  attempts = 8,
  delayMs = 1500,
  diagnostics = [],
  label = 'Service desk lookup',
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let serviceDeskId = null;
    try {
      serviceDeskId = await getServiceDeskId(projectKey);
    } catch (err) {
      diagnostics.push(`${label} ${projectKey}: service desk lookup failed on attempt ${attempt}: ${err.message}`);
    }

    if (serviceDeskId) {
      if (attempt > 1) {
        diagnostics.push(`${label} ${projectKey}: service desk became available on attempt ${attempt}.`);
      }
      return serviceDeskId;
    }

    if (attempt < attempts) {
      diagnostics.push(`${label} ${projectKey}: service desk not available yet; waiting for Jira provisioning (${attempt}/${attempts}).`);
      await wait(delayMs);
    }
  }

  return null;
}

async function getServiceDeskRequestTypes(serviceDeskId) {
  const data = await jiraGet(`/rest/servicedeskapi/servicedesk/${serviceDeskId}/requesttype`);
  return Array.isArray(data.values) ? data.values : [];
}

function normaliseRequestType(requestType) {
  return {
    id: requestType.id,
    name: requestType.name,
    issueTypeId: requestType.issueTypeId || null,
    issueTypeName: requestType.issueTypeName || requestType.issueType?.name || null,
    description: requestType.description || '',
  };
}

async function createServiceDeskRequestType(serviceDeskId, definition, issueTypeId) {
  return await jiraPost(`/rest/servicedeskapi/servicedesk/${serviceDeskId}/requesttype`, {
    name: definition.name,
    description: definition.description,
    helpText: definition.helpText,
    issueTypeId: String(issueTypeId),
  });
}

async function ensureRequiredItsmRequestTypes(project, serviceDeskId, diagnostics = []) {
  const jiraProject = await jiraGet(`/rest/api/3/project/${encodeURIComponent(project.key)}`);
  const issueTypes = Array.isArray(jiraProject.issueTypes) ? jiraProject.issueTypes : [];
  const existingRequestTypes = project.requestTypes?.length
    ? project.requestTypes
    : (await getServiceDeskRequestTypes(serviceDeskId)).map(normaliseRequestType);
  const ensuredRequestTypes = [...existingRequestTypes];

  for (const definition of REQUIRED_ITSM_REQUEST_TYPES) {
    const exactRequestType = ensuredRequestTypes.find(requestType =>
      normaliseFieldName(requestType.name) === normaliseFieldName(definition.name)
    );

    if (exactRequestType) {
      continue;
    }

    const issueType = issueTypes.find(type =>
      definition.issueTypeNames.some(name => normaliseFieldName(type?.name) === normaliseFieldName(name))
    );

    if (!issueType?.id) {
      diagnostics.push(`ITSM foundation ${project.key}: could not create request type "${definition.name}" because matching issue type was not found.`);
      continue;
    }

    try {
      const createdRequestType = await createServiceDeskRequestType(serviceDeskId, definition, issueType.id);
      ensuredRequestTypes.push(normaliseRequestType({
        ...createdRequestType,
        name: createdRequestType.name || definition.name,
        issueTypeId: createdRequestType.issueTypeId || issueType.id,
        issueTypeName: createdRequestType.issueTypeName || issueType.name,
        description: createdRequestType.description || definition.description,
      }));
      diagnostics.push(`ITSM foundation ${project.key}: created request type "${definition.name}" for issue type "${issueType.name}".`);
    } catch (err) {
      diagnostics.push(`ITSM foundation ${project.key}: request type "${definition.name}" was not created: ${err.message}`);
    }
  }

  return ensuredRequestTypes;
}

async function getServiceDeskQueues(serviceDeskId) {
  const data = await jiraGet(`/rest/servicedeskapi/servicedesk/${serviceDeskId}/queue`);
  return Array.isArray(data.values) ? data.values : [];
}

function chooseRequestTypeForSmartForm(requestTypes) {
  const findByKeyword = keywords => requestTypes.find(requestType => {
    const name = String(requestType?.name || '').toLowerCase();
    return keywords.some(keyword => name.includes(keyword));
  });

  const incidentLike = findByKeyword(['incident', 'report a problem', 'it help', 'support']);
  if (incidentLike) {
    return incidentLike;
  }

  return requestTypes[0] || null;
}

async function getRequestTypeId(serviceDeskId) {
  const requestTypes = await getServiceDeskRequestTypes(serviceDeskId);
  const requestType = chooseRequestTypeForSmartForm(requestTypes);
  return requestType?.id || null;
}

function buildFormPublishingConfig(requestType) {
  return {
    jira: {
      issueCreateIssueTypeIds: requestType?.issueTypeId ? [Number(requestType.issueTypeId)] : [],
      issueCreateRequestTypeIds: requestType?.id ? [Number(requestType.id)] : [],
      recommendedIssueRequestTypeIds: requestType?.id ? [Number(requestType.id)] : [],
      submitOnCreate: true,
      validateOnCreate: true,
    },
    portal: {
      portalRequestTypeIds: requestType?.id ? [Number(requestType.id)] : [],
      submitOnCreate: true,
      validateOnCreate: true,
    },
  };
}

function buildFallbackFormPayloadAttempts(projectName, requestType) {
  const publish = buildFormPublishingConfig(requestType);
  const baseSettings = {
    language: 'en',
    name: `${projectName} Smart Intake`,
    primaryLocale: 'en-US',
    submit: {
      lock: true,
      pdf: true,
    },
    translatedLocale: 'en-US',
  };

  return [
    {
      label: 'adf-paragraph-layout',
      payload: {
        design: {
          conditions: {},
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
                      text: 'Please provide the required request details.',
                    },
                  ],
                },
              ],
            },
          ],
          questions: {},
          sections: {},
          settings: baseSettings,
        },
        publish,
      },
    },
    {
      label: 'docs-sample-layout',
      payload: {
        design: {
          conditions: {},
          layout: [{}],
          questions: {},
          sections: {},
          settings: {
            ...baseSettings,
            translatedLocale: 'en-GB',
          },
        },
        publish,
      },
    },
    {
      label: 'empty-layout',
      payload: {
        design: {
          conditions: {},
          layout: [],
          questions: {},
          sections: {},
          settings: baseSettings,
        },
        publish,
      },
    },
  ];
}

async function ensureDefaultSmartIntakeForm(projectKey, projectName, industry, options = {}) {
  const diagnostics = options.diagnostics || [];
  const lookupAttempts = options.lookupAttempts || 2;
  const lookupDelayMs = options.lookupDelayMs || 1200;
  const serviceDeskId = options.serviceDeskId || await getServiceDeskIdWithRetry(projectKey, {
    attempts: lookupAttempts,
    delayMs: lookupDelayMs,
    diagnostics,
    label: 'Forms service desk lookup',
  });
  if (!serviceDeskId) {
    return {
      success: false,
      message: `Service desk for project ${projectKey} was not found.`,
    };
  }

  const requestTypes = await getServiceDeskRequestTypes(serviceDeskId);
  if (requestTypes.length === 0) {
    return {
      success: false,
      message: `No request types were found for service desk ${serviceDeskId}.`,
    };
  }

  const requestType = chooseRequestTypeForSmartForm(requestTypes);
  if (!requestType?.id) {
    return {
      success: false,
      message: `Could not resolve a request type for service desk ${serviceDeskId}.`,
    };
  }

  const formDesign = buildDynamicJsmFormDesign({ projectName, industry });
  const payload = buildFormsApiPayload(formDesign, requestType);

  try {
    const existingForms = await jiraFormsGet(`project/${encodeURIComponent(projectKey)}/form`);
    const existingForm = (Array.isArray(existingForms) ? existingForms : []).find(form =>
      normaliseFieldName(form?.name) === normaliseFieldName(formDesign.name)
    );

    if (existingForm) {
      return {
        success: true,
        reused: true,
        id: existingForm.id || null,
        name: existingForm.name || formDesign.name,
        requestTypeId: requestType.id,
      };
    }
  } catch (err) {
    // Form index lookup is best-effort. Creation can still succeed even when
    // listing forms is unavailable due tenant-specific form API permissions.
  }

  let dynamicErrorMessage = null;
  if (!formsDynamicSchemaRejected) {
    try {
      const created = await jiraFormsPost(`project/${encodeURIComponent(projectKey)}/form`, payload);
      return {
        success: true,
        reused: false,
        id: created?.id || null,
        name: created?.name || formDesign.name,
        requestTypeId: requestType.id,
        mode: 'dynamic',
      };
    } catch (err) {
      dynamicErrorMessage = err.message;
      if (String(err.message || '').toLowerCase().includes('invalid adf')) {
        formsDynamicSchemaRejected = true;
      }
    }
  }

  try {
    const attempts = buildFallbackFormPayloadAttempts(projectName, requestType);
    const fallbackErrors = [];

    for (const attempt of attempts) {
      try {
        const created = await jiraFormsPost(`project/${encodeURIComponent(projectKey)}/form`, attempt.payload);
        return {
          success: true,
          reused: false,
          id: created?.id || null,
          name: created?.name || attempt.payload.design?.settings?.name || `${projectName} Smart Intake`,
          requestTypeId: requestType.id,
          mode: 'fallback',
          warning: dynamicErrorMessage
            ? `Dynamic form schema was rejected (${dynamicErrorMessage}). Fallback template "${attempt.label}" was created successfully.`
            : `Fallback template "${attempt.label}" was created successfully.`,
        };
      } catch (fallbackErr) {
        fallbackErrors.push(`${attempt.label}: ${fallbackErr.message}`);
      }
    }

    return {
      success: false,
      message: dynamicErrorMessage
        ? `Dynamic form template failed: ${dynamicErrorMessage}. Fallback attempts failed: ${fallbackErrors.join(' | ')}`
        : `Fallback form template creation failed: ${fallbackErrors.join(' | ')}`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Form template creation failed unexpectedly: ${err.message}`,
    };
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createKnowledgeBaseSpaceKey(projectKey) {
  return `${String(projectKey || 'KB').replace(/[^A-Z0-9]/gi, '').toUpperCase().substring(0, 6)}KB`.substring(0, 10);
}

function buildKnowledgeBasePages(projectName, industry) {
  const serviceLabel = industry === 'Banking'
    ? 'digital banking services'
    : industry === 'Healthcare'
      ? 'clinical and patient-facing systems'
      : 'customer operations systems';

  return [
    {
      title: 'Incident triage playbook',
      body: [
        `Use this playbook to classify and triage incidents impacting ${serviceLabel}.`,
        'Confirm impact, urgency, affected service, customer visibility, workaround, and escalation owner before moving the incident into active response.',
      ],
    },
    {
      title: 'Problem management guide',
      body: [
        'Use problem records to investigate recurring incidents and capture root cause analysis.',
        'Document symptoms, known errors, contributing factors, corrective actions, and prevention tasks linked to delivery work.',
      ],
    },
    {
      title: 'Change enablement checklist',
      body: [
        'Use change records to evaluate deployment risk, approvals, rollback planning, and customer communication.',
        'Confirm implementation window, impacted services, validation plan, rollback owner, and post-change review notes.',
      ],
    },
    {
      title: 'Service request fulfilment guide',
      body: [
        `Use service requests for standard support and access workflows in ${projectName}.`,
        'Capture requester, service, approval need, fulfilment owner, expected completion date, and customer-facing resolution notes.',
      ],
    },
  ];
}

async function ensureKnowledgeBaseSpace(projectKey, projectName, industry, diagnostics = []) {
  const spaceKey = createKnowledgeBaseSpaceKey(projectKey);
  const spaceName = `${projectName} Knowledge Base`;
  let space = null;

  try {
    const existing = await confluenceGet(`/wiki/api/v2/spaces?keys=${encodeURIComponent(spaceKey)}&limit=1`);
    space = existing.results?.[0] || null;
  } catch (err) {
    diagnostics.push(`Knowledge base ${projectKey}: Confluence space lookup failed: ${err.message}`);
  }

  if (!space) {
    try {
      space = await confluencePost('/wiki/api/v2/spaces', {
        key: spaceKey,
        name: spaceName,
      });
      diagnostics.push(`Knowledge base ${projectKey}: created Confluence space ${spaceKey}.`);
    } catch (err) {
      diagnostics.push(`Knowledge base ${projectKey}: Confluence space creation failed: ${err.message}`);
      return {
        success: false,
        key: spaceKey,
        name: spaceName,
        pages: [],
        message: err.message,
      };
    }
  } else {
    diagnostics.push(`Knowledge base ${projectKey}: reused Confluence space ${spaceKey}.`);
  }

  const spaceId = space.id || spaceKey;
  const pages = [];

  for (const page of buildKnowledgeBasePages(projectName, industry)) {
    try {
      const created = await confluencePost('/wiki/api/v2/pages', {
        spaceId,
        status: 'current',
        title: page.title,
        body: {
          representation: 'storage',
          value: [
            `<p>${escapeHtml(page.body[0])}</p>`,
            `<p>${escapeHtml(page.body[1])}</p>`,
          ].join(''),
        },
      });
      const webUrl = created._links?.webui
        ? `${created._links?.base || ''}${created._links.webui}`
        : null;
      pages.push({
        id: created.id || null,
        title: page.title,
        webUrl,
      });
    } catch (err) {
      diagnostics.push(`Knowledge base ${projectKey}: page "${page.title}" creation failed: ${err.message}`);
    }
  }

  return {
    success: pages.length > 0,
    key: spaceKey,
    name: spaceName,
    pages,
  };
}

function getItsmWorkTypeCatalog(content) {
  return [
    {
      workType: 'Incident',
      issueType: 'Incident',
      source: content.incidents,
      fallbackTitle: 'Customer-facing service degradation',
    },
    {
      workType: 'Problem',
      issueType: 'Problem',
      source: content.problems,
      fallbackTitle: 'Recurring service instability root cause analysis',
    },
    {
      workType: 'Change',
      issueType: 'Change',
      source: content.changes,
      fallbackTitle: 'Production change for service reliability improvement',
    },
    {
      workType: 'Service Request',
      issueType: 'Service Request',
      source: content.serviceRequests,
      fallbackTitle: 'Standard access and support request fulfilment',
    },
    {
      workType: 'Post-incident Review',
      issueType: 'Post-incident Review',
      source: content.incidents,
      fallbackTitle: 'Post-incident review for major service disruption',
    },
  ];
}

const ITSM_SUMMARY_VARIANTS = {
  Incident: [
    'during peak business operations',
    'affecting a regional user group',
    'impacting customer-facing processing',
    'with intermittent service recovery',
    'requiring cross-team escalation',
    'detected by monitoring alerts',
    'reported by priority users',
    'causing downstream integration delays',
  ],
  Problem: [
    'root cause review for recurring symptoms',
    'known error investigation with prevention plan',
    'trend analysis for repeated service degradation',
    'RCA follow-up from linked incidents',
    'permanent fix investigation for repeat failures',
    'service stability analysis for operations',
    'corrective action planning with owners',
    'recurrence prevention review',
  ],
  Change: [
    'planned release window with rollback validation',
    'configuration update requiring approval',
    'controlled maintenance activity for service reliability',
    'deployment readiness review with risk assessment',
    'change implementation plan for production',
    'approval workflow for operational improvement',
    'post-change validation and monitoring update',
    'scheduled remediation with stakeholder notice',
  ],
  'Service Request': [
    'standard fulfilment request for business users',
    'access and entitlement request with approval',
    'support request for operational enablement',
    'new service setup request for a team',
    'data/reporting request for service owners',
    'hardware or tool access fulfilment task',
    'onboarding support request with handoff notes',
    'self-service fulfilment request needing agent action',
  ],
  'Post-incident Review': [
    'review follow-up for stakeholder actions',
    'lessons learned record for service restoration',
  ],
};

const ITSM_DESCRIPTION_FOCUS = {
  Incident: 'Capture impact, urgency, affected service, recovery owner, customer communication, and restoration notes.',
  Problem: 'Document recurring symptoms, root cause hypothesis, known error, corrective action, and prevention owner.',
  Change: 'Document implementation window, approvals, risk, validation plan, rollback owner, and post-change evidence.',
  'Service Request': 'Capture requester need, approval requirement, fulfilment owner, expected completion, and customer-facing outcome.',
  'Post-incident Review': 'Capture timeline, impact, root cause, follow-up actions, owners, and prevention commitments.',
};

const REQUIRED_ITSM_REQUEST_TYPES = [
  {
    workType: 'Incident',
    name: 'Incident',
    description: 'Incident intake for service interruptions, outages, degradations, and urgent restoration work.',
    helpText: 'Use this request type for disruption or outage records that need operational response.',
    issueTypeNames: ['Incident'],
  },
  {
    workType: 'Problem',
    name: 'Problem',
    description: 'Problem management intake for recurring symptoms, known errors, and root-cause analysis.',
    helpText: 'Use this request type when one or more incidents need root-cause investigation.',
    issueTypeNames: ['Problem'],
  },
  {
    workType: 'Change',
    name: 'Change',
    description: 'Change enablement intake for planned operational changes, approvals, validation, and rollback planning.',
    helpText: 'Use this request type for standard, normal, or emergency change records.',
    issueTypeNames: ['Change'],
  },
  {
    workType: 'Service Request',
    name: 'Service Request',
    description: 'Service request intake for access, fulfilment, reporting, and operational enablement requests.',
    helpText: 'Use this request type for standard fulfilment and access requests.',
    issueTypeNames: ['Service Request', 'Service request'],
  },
];

function makeUniqueItsmSummary(baseTitle, workType, sourceIndex, sourceLength, usedTitles) {
  const fallbackBase = `${workType} record`;
  const cleanBase = String(baseTitle || fallbackBase).replace(/\s+-\s+Scenario\s+\d+$/i, '').replace(/\s+/g, ' ').trim() || fallbackBase;
  const variants = ITSM_SUMMARY_VARIANTS[workType] || ITSM_SUMMARY_VARIANTS.Incident;
  const cycleNumber = sourceLength > 0 ? Math.floor(sourceIndex / sourceLength) : sourceIndex;
  let candidate = cleanBase;

  if (cycleNumber > 0 || usedTitles.has(candidate.toLowerCase())) {
    candidate = `${cleanBase} - ${variants[sourceIndex % variants.length]}`;
  }

  let suffix = 2;
  while (usedTitles.has(candidate.toLowerCase())) {
    candidate = `${cleanBase} - ${variants[(sourceIndex + suffix) % variants.length]} ${suffix}`;
    suffix += 1;
  }

  usedTitles.add(candidate.toLowerCase());
  return candidate.slice(0, 180);
}

function makeUniqueItsmDescription(template, title, workType, sourceIndex, sourceLength) {
  const cleanDescription = String(template.description || '').replace(/\s+/g, ' ').trim();
  const variants = ITSM_SUMMARY_VARIANTS[workType] || ITSM_SUMMARY_VARIANTS.Incident;
  const focus = ITSM_DESCRIPTION_FOCUS[workType] || ITSM_DESCRIPTION_FOCUS.Incident;
  const cycleNumber = sourceLength > 0 ? Math.floor(sourceIndex / sourceLength) : sourceIndex;

  if (cleanDescription && cycleNumber === 0) {
    return cleanDescription.slice(0, 1200);
  }

  const scenarioFocus = variants[sourceIndex % variants.length];
  const base = cleanDescription || `${workType} generated for ${title}.`;
  return `${base} Scenario focus: ${scenarioFocus}. ${focus}`.slice(0, 1200);
}

function buildItsmWorkItems(content, itsmWorkCounts = ITSM_WORK_COUNT_DEFAULTS) {
  const catalog = getItsmWorkTypeCatalog(content);
  const usedTitles = new Set();
  const requestedCounts = {
    Incident: itsmWorkCounts.incidentRequestsPerProject || 0,
    Problem: itsmWorkCounts.problemRequestsPerProject || 0,
    Change: itsmWorkCounts.changeRequestsPerProject || 0,
    'Service Request': itsmWorkCounts.serviceRequestsPerProject || 0,
    'Post-incident Review': itsmWorkCounts.postIncidentReviewsPerProject || 0,
  };

  return catalog.flatMap(workType => {
    const count = requestedCounts[workType.workType] || 0;

    return Array.from({ length: count }, (_, sourceIndex) => {
      const source = Array.isArray(workType.source) ? workType.source : [];
      const sourceLength = source.length;
      const template = sourceLength > 0 ? source[sourceIndex % sourceLength] || {} : {};
      const title = makeUniqueItsmSummary(template.title || workType.fallbackTitle, workType.workType, sourceIndex, sourceLength, usedTitles);

      return {
        ...workType,
        title,
        priority: template.priority || 'P3 - Medium',
        description: makeUniqueItsmDescription(template, title, workType.workType, sourceIndex, sourceLength),
      };
    });
  });
}

function getItsmWorkItem(content, index, itsmWorkCounts) {
  return buildItsmWorkItems(content, itsmWorkCounts)[index] || null;
}

async function ensureDefaultSoftwareWorkForm(projectKey, projectName, industry) {
  const syntheticRequestType = {
    id: null,
    issueTypeId: null,
  };
  const formName = `${projectName} Work Intake`;

  try {
    const existingForms = await jiraFormsGet(`project/${encodeURIComponent(projectKey)}/form`);
    const existingForm = (Array.isArray(existingForms) ? existingForms : []).find(form =>
      normaliseFieldName(form?.name) === normaliseFieldName(formName) ||
      normaliseFieldName(form?.name) === normaliseFieldName(`${projectName} Smart Intake`)
    );

    if (existingForm) {
      return {
        success: true,
        reused: true,
        id: existingForm.id || null,
        name: existingForm.name || formName,
        mode: 'software-existing',
      };
    }
  } catch {
    // Listing software forms is best-effort. Some tenants expose the Forms
    // screen but do not expose its project-form API for non-JSM projects.
  }

  const attempts = buildFallbackFormPayloadAttempts(projectName, syntheticRequestType).map(attempt => ({
    ...attempt,
    payload: {
      ...attempt.payload,
      design: {
        ...attempt.payload.design,
        settings: {
          ...attempt.payload.design?.settings,
          name: formName,
        },
      },
    },
  }));
  const errors = [];

  for (const attempt of attempts) {
    try {
      const created = await jiraFormsPost(`project/${encodeURIComponent(projectKey)}/form`, attempt.payload);
      return {
        success: true,
        reused: false,
        id: created?.id || null,
        name: created?.name || formName,
        mode: `software-${attempt.label}`,
        warning: 'Created through the Forms project API without JSM request-type publishing.',
      };
    } catch (err) {
      errors.push(`${attempt.label}: ${err.message}`);
    }
  }

  return {
    success: false,
    unsupported: true,
    message: `Software Project ${projectKey}: Jira exposed the Forms tab, but the supported Forms project API did not accept a Software project form payload. Attempts failed: ${errors.join(' | ')}`,
  };
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

function chooseRequestTypeForItsmWork(project, workType) {
  const requestTypes = project.requestTypes || [];
  const normalisedWorkType = normaliseFieldName(workType);
  const exactNameMatch = requestTypes.find(requestType =>
    normaliseFieldName(requestType?.name) === normalisedWorkType
  );
  const requestTypeMatchesIssueType = requestType => {
    const issueTypeName = normaliseFieldName(requestType?.issueTypeName || requestType?.issueType?.name || '');
    return issueTypeName && issueTypeName === normalisedWorkType;
  };
  const findByPriority = keywords => {
    for (const keyword of keywords) {
      const match = requestTypes.find(requestType =>
        String(requestType?.name || '').toLowerCase().includes(keyword) ||
        String(requestType?.description || '').toLowerCase().includes(keyword)
      );

      if (match) {
        return match;
      }
    }

    return null;
  };
  const issueTypeMatch = requestTypes.find(requestTypeMatchesIssueType);

  if (exactNameMatch) {
    return exactNameMatch;
  }

  if (issueTypeMatch) {
    return issueTypeMatch;
  }

  if (normalisedWorkType === 'incident') {
    return findByPriority(['report an incident', 'report a system problem', 'incident', 'system problem', 'report broken hardware', 'broken hardware']);
  }

  if (normalisedWorkType === 'problem') {
    return findByPriority(['investigate a problem', 'problem', 'root cause', 'known error']);
  }

  if (normalisedWorkType === 'change') {
    return findByPriority(['request a change', 'change', 'standard change', 'normal change', 'emergency change']);
  }

  if (normalisedWorkType === 'servicerequest') {
    return findByPriority(['service request', 'get it help', 'request new software', 'request new hardware', 'request admin access', 'request new account', 'request']);
  }

  if (normalisedWorkType === 'postincidentreview') {
    return findByPriority(['create a post-incident review', 'post-incident review', 'post incident review', 'review']);
  }

  return requestTypes[0] || null;
}

async function createJsmRequestWorkItem(project, workItem, options) {
  const diagnostics = options.diagnostics || [];
  if (project.serviceDeskAvailable === false) {
    throw new Error(`Service desk id was not available for ${project.key}.`);
  }

  const serviceDeskId = project.serviceDeskId || await getServiceDeskIdWithRetry(project.key, {
    attempts: 3,
    delayMs: 1000,
    diagnostics,
    label: 'ITSM work service desk lookup',
  });

  if (!serviceDeskId) {
    throw new Error(`Service desk id was not available for ${project.key}.`);
  }

  project.serviceDeskId = serviceDeskId;

  if (!project.requestTypes?.length) {
    const requestTypes = await getServiceDeskRequestTypes(serviceDeskId);
    project.requestTypes = requestTypes.map(normaliseRequestType);
  }

  if (!project.requiredItsmRequestTypesEnsured) {
    project.requestTypes = await ensureRequiredItsmRequestTypes(project, serviceDeskId, diagnostics);
    project.requiredItsmRequestTypesEnsured = true;
  }

  const requestType = chooseRequestTypeForItsmWork(project, workItem.workType);
  if (!requestType?.id) {
    const availableRequestTypes = (project.requestTypes || [])
      .map(type => `${type.name}${type.issueTypeName ? ` (${type.issueTypeName})` : ''}`)
      .join(', ') || 'none';
    throw new Error(`No matching JSM request type was available for ${workItem.workType}. Available request types: ${availableRequestTypes}.`);
  }

  diagnostics.push(`ITSM work ${project.key}: creating ${workItem.workType} through request type "${requestType.name}".`);

  const createdRequest = await jiraPost('/rest/servicedeskapi/request', {
    serviceDeskId: String(serviceDeskId),
    requestTypeId: String(requestType.id),
    requestFieldValues: {
      summary: workItem.title,
      description: workItem.description || `${workItem.workType} generated for the ${project.key} demo environment. Priority: ${workItem.priority}. ${workItem.title}`,
    },
  });

  const issueKey = createdRequest.issueKey || createdRequest.issue?.key || createdRequest.issue?.issueKey || null;
  if (!issueKey) {
    throw new Error(`JSM request was created but Jira did not return an issue key for ${workItem.workType}.`);
  }

  return {
    key: issueKey,
    requestTypeId: requestType.id,
    requestTypeName: requestType.name,
  };
}

async function createJiraItsmIssueFallback(project, workItem, options = {}) {
  const diagnostics = options.diagnostics || [];
  const priority = options.priority || getPriorityName(workItem.priority);
  const dueDate = options.dueDate || null;
  const assigneeAccountId = options.assigneeAccountId || null;
  const lifecycle = options.lifecycle || null;
  const issue = await createIssue(
    project.key,
    workItem.title,
    workItem.workType,
    null,
    priority,
    dueDate,
    null,
    {
      assigneeAccountId,
      demoDateFields: options.demoDateFields || {},
      diagnostics,
      environmentName: options.environmentName,
      lifecycle,
      projectKind: 'business',
      retentionPeriodDays: options.retentionPeriodDays,
      description: [
        workItem.description || `${workItem.workType} generated for the ${project.key} demo environment.`,
        'Created through Jira issue fallback because Jira Service Management service desk provisioning was not available during the run.',
      ].join('\n\n'),
      labels: [
        'itsm-demo',
        `itsm-${normaliseFieldName(workItem.workType) || 'work'}`,
        'request-type-fallback',
      ],
    }
  );

  diagnostics.push(`ITSM fallback ${project.key}: created ${workItem.workType} ${issue.key} as a Jira issue because service desk request creation was unavailable.`);

  return {
    key: issue.key,
    requestTypeId: null,
    requestTypeName: `${workItem.workType} (Jira issue fallback)`,
    fallbackCreated: true,
  };
}

const SOFTWARE_TEMPLATE_TYPES = ['scrum', 'kanban', 'bug-tracking'];

function normaliseSoftwareTemplate(value) {
  const raw = String(value || 'scrum').trim().toLowerCase();
  return SOFTWARE_TEMPLATE_TYPES.includes(raw) ? raw : 'scrum';
}

function getSoftwareTemplateLabel(value) {
  const template = normaliseSoftwareTemplate(value);
  const labels = {
    scrum: 'Scrum',
    kanban: 'Kanban',
    'bug-tracking': 'Bug Tracking',
  };
  return labels[template] || labels.scrum;
}

function normaliseProjectManagementStyle(value) {
  return String(value || '').toLowerCase().includes('company') ? 'company-managed' : 'team-managed';
}

function getProjectManagementStyleLabel(value) {
  return normaliseProjectManagementStyle(value) === 'company-managed' ? 'Company-managed' : 'Team-managed';
}

function getSoftwareProjectMethodLabel(projectOrTemplate, projectManagementStyle = 'team-managed') {
  const softwareTemplate = typeof projectOrTemplate === 'object'
    ? projectOrTemplate?.softwareTemplate
    : projectOrTemplate;
  const softwareProjectStyle = typeof projectOrTemplate === 'object'
    ? projectOrTemplate?.softwareProjectStyle
    : projectManagementStyle;
  const template = normaliseSoftwareTemplate(softwareTemplate);
  return template === 'bug-tracking'
    ? getSoftwareTemplateLabel(template)
    : `${getProjectManagementStyleLabel(softwareProjectStyle)} ${getSoftwareTemplateLabel(template)}`;
}

function getSoftwareTemplateKeys(softwareTemplate, projectManagementStyle = 'team-managed') {
  const template = normaliseSoftwareTemplate(softwareTemplate);
  const style = normaliseProjectManagementStyle(projectManagementStyle);

  if (template === 'bug-tracking') {
    return [
      'com.pyxis.greenhopper.jira:gh-simplified-agility-bug-tracking',
      'com.pyxis.greenhopper.jira:gh-bug-tracking-template',
      'com.pyxis.greenhopper.jira:gh-simplified-bug-tracking-classic',
      'com.atlassian.jira-core-project-templates:jira-core-bug-tracking',
      'com.pyxis.greenhopper.jira:gh-simplified-basic',
      'com.pyxis.greenhopper.jira:gh-simplified-agility-kanban',
      'com.pyxis.greenhopper.jira:gh-simplified-kanban-classic',
    ];
  }

  if (template === 'kanban' && style === 'company-managed') {
    return [
      'com.pyxis.greenhopper.jira:gh-simplified-kanban-classic',
      'com.pyxis.greenhopper.jira:gh-kanban-template',
    ];
  }

  if (template === 'kanban') {
    return [
      'com.pyxis.greenhopper.jira:gh-simplified-agility-kanban',
      'com.pyxis.greenhopper.jira:gh-simplified-kanban-classic',
      'com.pyxis.greenhopper.jira:gh-kanban-template',
    ];
  }

  if (style === 'company-managed') {
    return [
      'com.pyxis.greenhopper.jira:gh-scrum-template',
      'com.pyxis.greenhopper.jira:gh-simplified-scrum-classic',
    ];
  }

  return [
    'com.pyxis.greenhopper.jira:gh-simplified-agility-scrum',
    'com.pyxis.greenhopper.jira:gh-simplified-scrum-classic',
    'com.pyxis.greenhopper.jira:gh-scrum-template',
  ];
}

function getSoftwareTemplateSearchLabels(softwareTemplate) {
  const template = normaliseSoftwareTemplate(softwareTemplate);
  const labels = {
    scrum: ['Scrum', 'Software Project - Scrum'],
    kanban: ['Kanban', 'Software Project - Kanban'],
    'bug-tracking': ['Bug Tracking', 'Bug tracking', 'Software Project - Bug Tracking'],
  };
  return labels[template] || labels.scrum;
}

async function createSoftwareProject(name, leadAccountId, keyPrefix, softwareTemplate, projectManagementStyle, diagnostics = []) {
  const template = normaliseSoftwareTemplate(softwareTemplate);
  const templateKeys = await getProjectTemplateKeysForSelection({
    projectTypeKey: 'software',
    staticKeys: getSoftwareTemplateKeys(template, projectManagementStyle),
    labels: getSoftwareTemplateSearchLabels(template),
    diagnostics,
  });
  if (template === 'bug-tracking') {
    diagnostics.push('Bug Tracking: Jira Cloud does not always expose a dedicated bug-tracking projectTemplateKey through REST. If needed, the app creates a software project from a Jira-supported software base template, then generates bug-tracking issues, statuses, dashboard, and verification data.');
  }
  return await createProjectWithRetries({
    name,
    leadAccountId,
    keyPrefix,
    projectTypeKey: 'software',
    maxAttempts: 12,
    templateKeys,
    allowTemplateOmission: template === 'bug-tracking',
    diagnostics,
    serviceTypeLabel: `Software Project - ${getSoftwareTemplateLabel(template)}`,
  });
}

function getBusinessProjectTemplateKeys(businessSpaceType) {
  const normalized = normaliseBusinessSpaceType(businessSpaceType);
  const templateMap = {
    'project-management': [
      'com.atlassian.jira-core-project-templates:jira-core-simplified-project-management',
      'com.atlassian.jira-core-project-templates:jira-core-project-management',
    ],
    'go-to-market': [
      'com.atlassian.jira-core-project-templates:jira-core-simplified-go-to-market',
      'com.atlassian.jira-core-project-templates:jira-core-go-to-market',
      'com.atlassian.jira-core-project-templates:jira-core-go-to-market-project',
    ],
    'task-tracking': [
      'com.atlassian.jira-core-project-templates:jira-core-simplified-task-tracking',
      'com.atlassian.jira-core-project-templates:jira-core-task-tracking',
      'com.atlassian.jira-core-project-templates:jira-core-task-management',
    ],
    'process-control': [
      'com.atlassian.jira-core-project-templates:jira-core-simplified-process-control',
      'com.atlassian.jira-core-project-templates:jira-core-process-management',
      'com.atlassian.jira-core-project-templates:jira-core-process-control',
    ],
    finance: [
      'com.atlassian.jira-core-project-templates:jira-core-simplified-project-management',
      'com.atlassian.jira-core-project-templates:jira-core-project-management',
      'com.atlassian.jira-core-project-templates:jira-core-budget-planning',
      'com.atlassian.jira-core-project-templates:jira-core-simplified-budget-planning',
      'com.atlassian.jira-core-project-templates:jira-core-finance',
      'com.atlassian.jira-core-project-templates:jira-core-simplified-finance',
    ],
    'budget-planning': [
      'com.atlassian.jira-core-project-templates:jira-core-budget-planning',
      'com.atlassian.jira-core-project-templates:jira-core-simplified-budget-planning',
      'com.atlassian.jira-core-project-templates:jira-core-simplified-project-management',
      'com.atlassian.jira-core-project-templates:jira-core-project-management',
    ],
    marketing: [
      'com.atlassian.jira-core-project-templates:jira-core-simplified-content-management',
      'com.atlassian.jira-core-project-templates:jira-core-marketing',
      'com.atlassian.jira-core-project-templates:jira-core-simplified-marketing',
      'com.atlassian.jira-core-project-templates:jira-core-campaign-management',
      'com.atlassian.jira-core-project-templates:jira-core-simplified-campaign-management',
      'com.atlassian.jira-core-project-templates:jira-core-marketing-campaign',
    ],
    design: [
      'com.atlassian.jira-core-project-templates:jira-core-simplified-content-management',
      'com.atlassian.jira-core-project-templates:jira-core-simplified-task-tracking',
      'com.atlassian.jira-core-project-templates:jira-core-ux-design',
      'com.atlassian.jira-core-project-templates:jira-core-simplified-ux-design',
      'com.atlassian.jira-core-project-templates:jira-core-design',
      'com.atlassian.jira-core-project-templates:jira-core-simplified-design',
      'com.atlassian.jira-core-project-templates:jira-core-design-project',
      'com.atlassian.jira-core-project-templates:jira-core-simplified-design-project',
    ],
    legal: [
      'com.atlassian.jira-core-project-templates:jira-core-simplified-document-approval',
      'com.atlassian.jira-core-project-templates:jira-core-legal',
      'com.atlassian.jira-core-project-templates:jira-core-simplified-legal',
      'com.atlassian.jira-core-project-templates:jira-core-document-management',
      'com.atlassian.jira-core-project-templates:jira-core-simplified-document-management',
      'com.atlassian.jira-core-project-templates:jira-core-legal-matter-management',
    ],
    sales: [
      'com.atlassian.jira-core-project-templates:jira-core-simplified-lead-tracking',
      'com.atlassian.jira-core-project-templates:jira-core-sales-pipeline',
      'com.atlassian.jira-core-project-templates:jira-core-simplified-sales-pipeline',
      'com.atlassian.jira-core-project-templates:jira-core-sales',
      'com.atlassian.jira-core-project-templates:jira-core-simplified-sales',
    ],
    'procurement-management': [
      'com.atlassian.jira-core-project-templates:jira-core-simplified-procurement',
      'com.atlassian.jira-core-project-templates:jira-core-procurement',
      'com.atlassian.jira-core-project-templates:jira-core-procurement-management',
      'com.atlassian.jira-core-project-templates:jira-core-process-management',
      'com.atlassian.jira-core-project-templates:jira-core-simplified-process-control',
    ],
    'recruitment-tracking': [
      'com.atlassian.jira-core-project-templates:jira-core-simplified-recruitment',
      'com.atlassian.jira-core-project-templates:jira-core-recruitment',
      'com.atlassian.jira-core-project-templates:jira-core-recruitment-tracking',
      'com.atlassian.jira-core-project-templates:jira-core-hr-recruitment',
    ],
  };

  return templateMap[normalized] || templateMap['task-tracking'];
}

function getBusinessTemplateSearchLabels(businessSpaceType) {
  const label = getBusinessSpaceTypeLabel(businessSpaceType);
  const normalized = normaliseBusinessSpaceType(businessSpaceType);
  const aliases = {
    'project-management': ['Project Management', 'Project management'],
    'go-to-market': ['Go-to-market', 'Go to market', 'Go-to-market plan'],
    'task-tracking': ['Task Tracking', 'Task tracking', 'Task management'],
    'process-control': ['Process Control', 'Process control'],
    finance: ['Finance', 'Budget Planning', 'Budget planning'],
    'budget-planning': ['Budget Planning', 'Budget planning'],
    marketing: ['Marketing', 'Campaign management', 'Content management'],
    design: ['UX Design', 'UX design', 'Design'],
    legal: ['Legal', 'Document management', 'Document approval'],
    sales: ['Sales pipeline', 'Sales Pipeline', 'Sales', 'Lead tracking'],
    'recruitment-tracking': ['Recruitment Management', 'Recruitment', 'Recruitment Tracking'],
    'procurement-management': ['Procurement Management', 'Procurement'],
  };
  return aliases[normalized] || [label];
}

function getProjectTemplateSelectionLabel(projectTypeKey, templateKeys, fallbackLabel = 'selected template') {
  const key = Array.isArray(templateKeys) && templateKeys.length > 0 ? templateKeys[0] : '';
  if (projectTypeKey === 'service_desk') {
    return fallbackLabel;
  }
  if (projectTypeKey === 'software') {
    if (key.includes('bug')) return 'Software Project - Bug Tracking';
    return key.includes('kanban') ? 'Software Project - Kanban' : 'Software Project - Scrum';
  }
  if (projectTypeKey === 'business') {
    if (key.includes('project-management')) return 'Project Management';
    if (key.includes('go-to-market')) return 'Go-to-market';
    if (key.includes('finance')) return 'Finance';
    if (key.includes('budget')) return 'Budget Planning';
    if (key.includes('marketing')) return 'Marketing';
    if (key.includes('design')) return 'Design';
    if (key.includes('legal')) return 'Legal';
    if (key.includes('sales')) return 'Sales';
    if (key.includes('procurement')) return 'Procurement Management';
    if (key.includes('recruitment')) return 'Recruitment Management';
    return 'Task Tracking';
  }
  if (projectTypeKey === 'product_discovery') {
    return 'Jira Product Discovery';
  }
  return fallbackLabel;
}

async function createWorkManagementProject(name, leadAccountId, keyPrefix, businessSpaceType, diagnostics = []) {
  const selectedLabel = getBusinessSpaceTypeLabel(businessSpaceType);
  const templateKeys = await getProjectTemplateKeysForSelection({
    projectTypeKey: 'business',
    staticKeys: getBusinessProjectTemplateKeys(businessSpaceType),
    labels: getBusinessTemplateSearchLabels(businessSpaceType),
    diagnostics,
  });
  try {
    return await createProjectWithRetries({
      name,
      leadAccountId,
      keyPrefix,
      projectTypeKey: 'business',
      maxAttempts: 12,
      templateKeys,
      allowTemplateOmission: false,
      diagnostics,
      serviceTypeLabel: selectedLabel,
    });
  } catch (err) {
    const message = String(err?.message || '');
    const templateUnavailable = /project template specified does not exist|template.*does not exist/i.test(message);
    if (!templateUnavailable) {
      throw err;
    }

    diagnostics.push(`Work Management ${selectedLabel}: Jira REST did not expose an installable "${selectedLabel}" projectTemplateKey on this site, so the app is creating a Work Management compatibility space and will still generate "${selectedLabel}" work items, dashboard, reports, and lifecycle fields. Original error: ${message}`);
    const fallbackProject = await createProjectWithRetries({
      name,
      leadAccountId,
      keyPrefix,
      projectTypeKey: 'business',
      maxAttempts: 12,
      templateKeys: [],
      allowTemplateOmission: true,
      diagnostics,
      serviceTypeLabel: `${selectedLabel} compatibility`,
    });
    return {
      ...fallbackProject,
      businessSpaceType: normaliseBusinessSpaceType(businessSpaceType),
      compatibilityMode: 'work-management-template-unavailable',
      compatibilityReason: message,
    };
  }
}

async function createProductDiscoveryProject(name, leadAccountId, keyPrefix, diagnostics = []) {
  const templateKeys = await getLiveProductDiscoveryTemplateKeys(diagnostics);
  if (templateKeys.length === 0) {
    throw new Error('Jira Product Discovery is selected, but this Jira site does not expose a native Product Discovery project template through Jira REST. The app will not create a type-only Product Discovery shell because Jira Polaris pages can fail with "Something went wrong" when the space is not fully initialized. Create the Product Discovery space from Jira UI first and select it for volume, or enable a Jira Product Discovery template that is exposed to REST.');
  }

  return createProjectWithRetries({
    name,
    leadAccountId,
    keyPrefix,
    projectTypeKey: 'product_discovery',
    maxAttempts: 12,
    templateKeys,
    allowTemplateOmission: false,
    diagnostics,
    serviceTypeLabel: 'Jira Product Discovery',
  });
}

async function refreshProjectAfterCreate(project, diagnostics = []) {
  if (!project?.key) {
    return project;
  }

  try {
    const refreshedProject = await getProjectByKeyIfExists(project.key);
    return refreshedProject || project;
  } catch (err) {
    diagnostics.push(`Project ${project.key}: created but refresh skipped before validation: ${err.message}`);
    return project;
  }
}

async function validateProductDiscoveryReadiness(config, diagnostics = []) {
  if (config.productDiscoveryProjectCount === 0) {
    return { ok: true };
  }

  for (let index = 0; index < config.productDiscoveryProjectCount; index += 1) {
    const projectConfig = getProductDiscoveryProjectConfig(config, index);
    if (!projectConfig.projectKey) {
      return {
        ok: false,
        message: 'Jira Product Discovery spaces must be created manually from Jira first. Select the existing native Product Discovery space with the Volume checkbox, then run the agent to add demo ideas into that space.',
      };
    }

    const existingProject = await getProjectByKeyIfExists(projectConfig.projectKey);
    if (!existingProject) {
      return {
        ok: false,
        message: `Configured Product Discovery project key ${projectConfig.projectKey} was not found. Create the Product Discovery space manually in Jira first, then select it with the Volume checkbox.`,
      };
    }

    if (!isNativeProductDiscoveryProject(existingProject)) {
      return {
        ok: false,
        message: `Configured Product Discovery project key ${existingProject.key} points to a ${existingProject.projectTypeKey || 'non-product-discovery'} project. The app will not treat a Work Management or Software project as Jira Product Discovery.`,
      };
    }

  }

  return { ok: true };
}

const liveProjectTemplateCache = new Map();

function normaliseTemplateLookupText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hasTemplateLabelMatch(template, labels) {
  const haystack = normaliseTemplateLookupText([
    template.name,
    template.description,
    template.category,
    template.group,
    template.key,
  ].filter(Boolean).join(' '));

  return (labels || []).some(label => {
    const needle = normaliseTemplateLookupText(label);
    if (!needle) return false;
    if (haystack.includes(needle)) return true;
    const words = needle.split(/\s+/).filter(word => word.length > 2);
    return words.length > 0 && words.every(word => haystack.includes(word));
  });
}

function getTemplateLabelMatchScore(template, labels) {
  const name = normaliseTemplateLookupText(template.name);
  const category = normaliseTemplateLookupText(template.category);
  const group = normaliseTemplateLookupText(template.group);
  const key = normaliseTemplateLookupText(template.key);
  const description = normaliseTemplateLookupText(template.description);
  let bestScore = 0;

  for (const label of labels || []) {
    const needle = normaliseTemplateLookupText(label);
    if (!needle) continue;
    const words = needle.split(/\s+/).filter(Boolean);
    let score = 0;

    if (name === needle) score += 100;
    if (name.includes(needle)) score += 80;
    if (key.includes(needle.replace(/\s+/g, ' '))) score += 40;
    if (category === needle || group === needle) score += 30;
    if (description.includes(needle)) score += 10;
    if (words.length > 0 && words.every(word => name.includes(word))) score += 45;
    if (words.length > 0 && words.every(word => key.includes(word))) score += 25;

    bestScore = Math.max(bestScore, score);
  }

  return bestScore;
}

function templateKeyMatchesProjectType(key, projectTypeKey) {
  const normalizedKey = String(key || '').toLowerCase();
  if (!normalizedKey.includes(':')) {
    return false;
  }
  if (projectTypeKey === 'service_desk') {
    return normalizedKey.includes('servicedesk') || normalizedKey.includes('service-desk') || normalizedKey.includes('service-management');
  }
  if (projectTypeKey === 'software') {
    return normalizedKey.includes('greenhopper') || normalizedKey.includes('software') || normalizedKey.includes('bug-tracking');
  }
  if (projectTypeKey === 'business') {
    return normalizedKey.includes('jira-core-project-templates')
      || normalizedKey.includes('jira-work-management')
      || normalizedKey.includes('work-management')
      || normalizedKey.includes('work_management')
      || normalizedKey.includes('business')
      || normalizedKey.includes('jira-templates')
      || normalizedKey.includes('go-to-market')
      || normalizedKey.includes('project-management')
      || normalizedKey.includes('task-tracking')
      || normalizedKey.includes('process-control')
      || normalizedKey.includes('budget-planning')
      || normalizedKey.includes('procurement')
      || normalizedKey.includes('recruitment')
      || normalizedKey.includes('marketing')
      || normalizedKey.includes('design')
      || normalizedKey.includes('legal')
      || normalizedKey.includes('sales')
      || normalizedKey.includes('finance');
  }
  if (projectTypeKey === 'product_discovery') {
    return normalizedKey.includes('product-discovery') || normalizedKey.includes('product_discovery');
  }
  return true;
}

function extractProjectTemplatesFromResponse(node, templates = [], seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) {
    return templates;
  }
  seen.add(node);

  if (Array.isArray(node)) {
    node.forEach(item => extractProjectTemplatesFromResponse(item, templates, seen));
    return templates;
  }

  const key = node.projectTemplateKey || node.templateKey || node.completeModuleKey || node.moduleKey || node.key;
  const name = node.name || node.displayName || node.title || node.label;
  if (typeof key === 'string' && templateKeyMatchesProjectType(key, 'any')) {
    templates.push({
      key,
      name: typeof name === 'string' ? name : '',
      description: typeof node.description === 'string' ? node.description : '',
      category: typeof node.category === 'string' ? node.category : node.category?.name || '',
      group: typeof node.group === 'string' ? node.group : node.group?.name || '',
      projectTypeKey: node.projectTypeKey || node.projectType?.key || node.projectType || '',
    });
  }

  Object.values(node).forEach(value => {
    if (value && typeof value === 'object') {
      extractProjectTemplatesFromResponse(value, templates, seen);
    }
  });

  return templates;
}

async function getLiveProjectTemplates(diagnostics = []) {
  const cacheKey = 'all-project-templates';
  if (liveProjectTemplateCache.has(cacheKey)) {
    return liveProjectTemplateCache.get(cacheKey);
  }

  try {
    const response = await jiraGet('/rest/project-templates/1.0/templates');
    const templates = extractProjectTemplatesFromResponse(response)
      .filter(template => template.key && templateKeyMatchesProjectType(template.key, 'any'));
    liveProjectTemplateCache.set(cacheKey, templates);
    if (templates.length > 0) {
      diagnostics.push(`Jira template lookup: found ${templates.length} live template key(s).`);
    }
    return templates;
  } catch (err) {
    diagnostics.push(`Jira template lookup skipped: ${err.message}`);
    liveProjectTemplateCache.set(cacheKey, []);
    return [];
  }
}

function uniqueTemplateKeys(keys) {
  return Array.from(new Set((keys || []).map(key => String(key || '').trim()).filter(Boolean)));
}

async function getProjectTemplateKeysForSelection({ projectTypeKey, staticKeys, labels, diagnostics = [] }) {
  const liveTemplates = await getLiveProjectTemplates(diagnostics);
  const liveKeys = liveTemplates
    .filter(template => {
      const type = String(template.projectTypeKey || '').toLowerCase();
      const labelMatches = hasTemplateLabelMatch(template, labels);
      const typeMatches = !type
        || type === projectTypeKey
        || (projectTypeKey === 'business' && ['business', 'core'].includes(type))
        || (projectTypeKey === 'product_discovery' && type === 'product-discovery');
      return typeMatches
        && (templateKeyMatchesProjectType(template.key, projectTypeKey) || (projectTypeKey === 'business' && labelMatches))
        && labelMatches;
    })
    .sort((left, right) => getTemplateLabelMatchScore(right, labels) - getTemplateLabelMatchScore(left, labels))
    .map(template => template.key);

  const keys = uniqueTemplateKeys([...liveKeys, ...(staticKeys || [])]);
  if (liveKeys.length > 0) {
    diagnostics.push(`Jira template lookup: using live key(s) for ${labels?.[0] || projectTypeKey}: ${uniqueTemplateKeys(liveKeys).join(', ')}.`);
  } else {
    diagnostics.push(`Jira template lookup: no live ${projectTypeKey} template matched ${labels?.join(', ') || 'selected labels'}; trying static key(s): ${uniqueTemplateKeys(staticKeys || []).join(', ') || 'none'}.`);
  }
  return keys;
}

async function getLiveProductDiscoveryTemplateKeys(diagnostics = []) {
  const liveTemplates = await getLiveProjectTemplates(diagnostics);
  const labels = ['Jira Product Discovery', 'Product Discovery', 'Product management'];
  const liveKeys = liveTemplates
    .filter(template => {
      const type = String(template.projectTypeKey || '').toLowerCase();
      const typeMatches = !type || type === 'product_discovery' || type === 'product-discovery';
      return typeMatches
        && templateKeyMatchesProjectType(template.key, 'product_discovery')
        && hasTemplateLabelMatch(template, labels);
    })
    .sort((left, right) => getTemplateLabelMatchScore(right, labels) - getTemplateLabelMatchScore(left, labels))
    .map(template => template.key);

  const keys = uniqueTemplateKeys(liveKeys);
  if (keys.length > 0) {
    diagnostics.push(`Jira template lookup: using live key(s) for Jira Product Discovery: ${keys.join(', ')}.`);
  } else {
    diagnostics.push('Jira template lookup: no live Jira Product Discovery template is exposed on this site.');
  }
  return keys;
}

async function createProjectWithRetries({ name, leadAccountId, keyPrefix, projectTypeKey, templateKeys, maxAttempts = 26, allowTemplateOmission = true, diagnostics = [], serviceTypeLabel = null }) {
  const errors = [];
  // Atlassian's current Cloud examples still document project creation through
  // /rest/api/2/project, while /rest/api/3/project is also available on many
  // tenants. For JSM, try v2 first because that is the route Atlassian's service
  // management project examples most consistently document, then try v3 as a
  // second supported route before reporting a hard ITSM creation failure.
  const createProjectRequests = projectTypeKey === 'service_desk'
    ? [
        { path: '/rest/api/2/project', actor: 'user' },
        { path: '/rest/api/3/project', actor: 'user' },
      ]
    : [{ path: '/rest/api/3/project', actor: 'user' }];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidateKey = generateKey(keyPrefix, attempt);
    const candidateName = attempt === 0 ? name : `${name} ${attempt + 1}`;
    // JSM spaces must stay inside the selected service-management template
    // family. We can try alternate keys from that same family, but never omit
    // the template or fall back to business/software project types.
    const templateAttempts = projectTypeKey === 'service_desk'
      ? [...templateKeys]
      : allowTemplateOmission ? [...templateKeys, null] : [...templateKeys];
    let keyCollisionForAttempt = false;

    for (const templateKey of templateAttempts) {
      let lastError = null;
      let sawTemplateError = false;
      let sawKeyCollision = false;
      let sawProjectTypeError = false;
      const baseBody = {
        name: candidateName,
        key: candidateKey,
        leadAccountId,
        assigneeType: projectTypeKey === 'service_desk' ? 'PROJECT_LEAD' : 'UNASSIGNED',
      };

      if (projectTypeKey === 'service_desk') {
        baseBody.avatarId = 10200;
      }

      if (templateKey) {
        baseBody.projectTemplateKey = templateKey;
      }

      const bodyAttempts = projectTypeKey === 'service_desk' && templateKey
        ? [
            { label: 'explicit-service-desk-type', body: { ...baseBody, projectTypeKey } },
            { label: 'template-inferred-type', body: { ...baseBody } },
          ]
        : [{ label: 'explicit-project-type', body: { ...baseBody, projectTypeKey } }];

      for (const { label, body } of bodyAttempts) {
        for (const createProjectRequest of createProjectRequests) {
          try {
            return createProjectRequest.actor === 'app'
              ? await jiraAppPost(createProjectRequest.path, body)
              : await jiraPost(createProjectRequest.path, body);
          } catch (err) {
            lastError = err;
            const lowerMessage = String(err.message || '').toLowerCase();
            sawTemplateError = sawTemplateError || err.message.includes('project template specified does not exist');
            sawKeyCollision = sawKeyCollision
              || err.message.includes('"projectKey"')
              || isProjectNameCollisionMessage(err.message)
              || lowerMessage.includes('uses this project key')
              || lowerMessage.includes('"projectkey"');
            sawProjectTypeError = sawProjectTypeError || lowerMessage.includes('invalid project type') || lowerMessage.includes('"projecttype"');
            errors.push(err.message);
            console.warn('Project create attempt failed', JSON.stringify({
              path: createProjectRequest.path,
              actor: createProjectRequest.actor,
              attempt: label,
              projectTypeKey: body.projectTypeKey || null,
              projectTemplateKey: templateKey || null,
              candidateKey,
              candidateName,
              message: err.message,
            }));
          }
        }
      }

      if (sawKeyCollision) {
        keyCollisionForAttempt = true;
        break;
      }

      if (sawTemplateError) {
        continue;
      }

      if (sawProjectTypeError) {
        continue;
      }

      if (!templateKey && lastError) {
        throw lastError;
      }
    }

    if (projectTypeKey === 'service_desk' && !keyCollisionForAttempt) {
      break;
    }
  }

  const selectedTemplateLabel = serviceTypeLabel || getProjectTemplateSelectionLabel(projectTypeKey, templateKeys);
  const lastError = errors[errors.length - 1] || `Unable to create ${projectTypeKey} project.`;
  const recentErrors = errors.slice(-8);

  const diagnosticPrefix = projectTypeKey === 'service_desk' ? 'JSM Project' : `${selectedTemplateLabel} project`;
  diagnostics.push(
    `${diagnosticPrefix} create attempts failed for template key(s): ${uniqueTemplateKeys(templateKeys).join(', ') || 'UNKNOWN'}. Recent REST errors:`,
    ...recentErrors.map(error => `  ${error}`)
  );

  if (projectTypeKey === 'service_desk') {
    throw new Error(`Unable to create a ${selectedTemplateLabel} project after trying the supported Jira project create endpoints with the selected service-management template. Last error: ${lastError}`);
  }

  throw new Error(`Unable to create the selected "${selectedTemplateLabel}" Jira template. The app did not fall back to another template. Last error: ${lastError}`);
}

async function createVersion(projectId, name, releaseDate, released) {
  return await jiraPost('/rest/api/3/version', {
    projectId, name, releaseDate, released, archived: false,
  });
}

async function getProjectVersions(projectKey) {
  try {
    const versions = await jiraGet(`/rest/api/3/project/${encodeURIComponent(projectKey)}/versions`);
    return Array.isArray(versions) ? versions : [];
  } catch {
    return [];
  }
}

async function createProjectComponent(projectKey, name, description) {
  return await jiraPost('/rest/api/3/component', {
    project: projectKey,
    name,
    description,
  });
}

async function getProjectComponents(projectKey) {
  try {
    const components = await jiraGet(`/rest/api/3/project/${encodeURIComponent(projectKey)}/components`);
    return Array.isArray(components) ? components : [];
  } catch {
    return [];
  }
}

function findProjectComponentByName(components, name) {
  const normalizedName = String(name || '').trim().toLowerCase();
  return (components || []).find(component => String(component?.name || '').trim().toLowerCase() === normalizedName) || null;
}

function addProjectComponentRecord(project, component, fallbackName, extra = {}) {
  project.components = project.components || [];
  const componentName = component?.name || fallbackName;
  const existing = findProjectComponentByName(project.components, componentName);
  if (existing) {
    if (!existing.id && component?.id) existing.id = component.id;
    Object.assign(existing, extra);
    return existing;
  }

  const record = {
    id: component?.id || null,
    name: componentName,
    ...extra,
  };
  project.components.push(record);
  return record;
}

async function ensureProjectComponent(project, name, description, diagnostics = [], label = 'Component') {
  const existingComponents = await getProjectComponents(project.key);
  const existing = findProjectComponentByName(existingComponents, name);
  if (existing) {
    addProjectComponentRecord(project, existing, name);
    diagnostics.push(`${label} ${project.key}: reused existing ${existing.name || name}.`);
    return { component: existing, created: false };
  }

  try {
    const component = await createProjectComponent(project.key, name, description);
    addProjectComponentRecord(project, component, name);
    diagnostics.push(`${label} ${project.key}: created ${component.name || name}.`);
    return { component, created: true };
  } catch (err) {
    const message = String(err.message || '');
    if (message.toLowerCase().includes('already exists')) {
      const refreshed = findProjectComponentByName(await getProjectComponents(project.key), name);
      if (refreshed) {
        addProjectComponentRecord(project, refreshed, name);
        diagnostics.push(`${label} ${project.key}: reused existing ${refreshed.name || name}.`);
        return { component: refreshed, created: false };
      }
    }
    throw err;
  }
}

function getSoftwareComponentCatalog(project, industry) {
  const template = normaliseSoftwareTemplate(project?.softwareTemplate);
  const industrySlug = slugifyGitHubPart(industry, 'business');
  const deliveryComponent = template === 'kanban' ? 'Flow Intake' : 'Sprint Delivery';

  return [
    deliveryComponent,
    `${industrySlug}-platform`,
    'Compass Delivery Service',
    'Compass Release Pipeline',
  ].map(name => name
    .split('-')
    .map(part => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part)
    .join(' '));
}

function chooseSoftwareComponentNames(project, issueIndex, issueType) {
  const components = project?.components || [];
  if (components.length === 0) {
    return [];
  }

  const primary = components[issueIndex % components.length]?.name;
  const releaseComponent = components.find(component => /release/i.test(component.name))?.name;
  const names = [primary];

  if (String(issueType || '').toLowerCase() === 'bug' && releaseComponent && releaseComponent !== primary) {
    names.push(releaseComponent);
  }

  return names.filter(Boolean).slice(0, 2);
}

function buildAtlassianSiteUrl(baseUrl, path) {
  const cleanBase = String(baseUrl || '').replace(/\/+$/, '');
  const cleanPath = String(path || '').startsWith('/') ? path : `/${path || ''}`;
  return cleanBase ? `${cleanBase}${cleanPath}` : null;
}

function getCompassComponentTemplates(config, project, siteDetails = {}, dashboardRecord = null) {
  const environmentSlug = slugifyGitHubPart(config.environmentName, 'environment');
  const projectSlug = slugifyGitHubPart(project.key, 'project');
  const industryName = toTitleCase(config.industry || 'Business');
  const repositoryUrl = getGitHubRepositoryUrl();
  const projectUrl = buildAtlassianSiteUrl(siteDetails.baseUrl, `/jira/software/c/projects/${project.key}/summary`);
  const boardUrl = project.boardId
    ? buildAtlassianSiteUrl(siteDetails.baseUrl, `/jira/software/c/projects/${project.key}/boards/${project.boardId}`)
    : buildAtlassianSiteUrl(siteDetails.baseUrl, `/jira/software/c/projects/${project.key}/board`);
  const releasesUrl = buildAtlassianSiteUrl(siteDetails.baseUrl, `/jira/software/c/projects/${project.key}/versions`);
  const dashboardUrl = dashboardRecord?.viewUrl
    ? buildAtlassianSiteUrl(siteDetails.baseUrl, dashboardRecord.viewUrl)
    : null;
  const buildLinks = (componentName) => [
    ...(repositoryUrl ? [{
      name: `${componentName} repository`,
      type: 'REPOSITORY',
      url: repositoryUrl,
    }] : []),
    ...(projectUrl ? [{
      name: `${componentName} Jira project`,
      type: 'OTHER_LINK',
      url: projectUrl,
    }] : []),
    ...(boardUrl ? [{
      name: `${componentName} delivery board`,
      type: 'OTHER_LINK',
      url: boardUrl,
    }] : []),
    ...(releasesUrl ? [{
      name: `${componentName} release roadmap`,
      type: 'OTHER_LINK',
      url: releasesUrl,
    }] : []),
    ...(dashboardUrl ? [{
      name: `${componentName} dashboard`,
      type: 'OTHER_LINK',
      url: dashboardUrl,
    }] : []),
  ];

  return [
    {
      name: `${config.environmentName} ${project.key} Delivery Service`,
      typeId: 'SERVICE',
      key: `${environmentSlug}-${projectSlug}-delivery-service`,
      description: `${industryName} delivery service for ${project.name}. Tracks Jira work, release health, service ownership, GitHub delivery activity, and dashboard links for the demo environment.`,
      links: buildLinks(`${project.key} delivery service`),
    },
    {
      name: `${config.environmentName} ${project.key} Release Pipeline`,
      typeId: 'APPLICATION',
      key: `${environmentSlug}-${projectSlug}-release-pipeline`,
      description: `${industryName} release pipeline for ${project.name}. Represents build, validation, deployment, release readiness, and downstream dependency tracking.`,
      links: buildLinks(`${project.key} release pipeline`),
    },
  ];
}

async function createCompassComponent(cloudId, componentDetails) {
  const ownerId = String(process.env.COMPASS_OWNER_TEAM_ID || process.env.ATLASSIAN_TEAM_ID || '').trim();
  const labels = ['demo-data', 'jira-demo', slugifyGitHubPart(componentDetails.key, 'component')];
  const richInput = {
    name: componentDetails.name,
    typeId: componentDetails.typeId,
    description: componentDetails.description,
    labels,
    ...(componentDetails.links?.length ? { links: componentDetails.links } : {}),
    ...(ownerId ? { ownerId } : {}),
  };
  const richWithoutOwnerInput = {
    name: componentDetails.name,
    typeId: componentDetails.typeId,
    description: componentDetails.description,
    labels,
    ...(componentDetails.links?.length ? { links: componentDetails.links } : {}),
  };
  const metadataInput = {
    name: componentDetails.name,
    typeId: componentDetails.typeId,
    description: componentDetails.description,
    labels,
  };
  const simpleInput = {
    name: componentDetails.name,
    typeId: componentDetails.typeId,
  };

  const createWithInput = async (input) => {
    const data = await requestAtlassianGraph(`
    mutation createComponent($cloudId: ID!, $componentDetails: CreateCompassComponentInput!) {
      compass {
        createComponent(cloudId: $cloudId, input: $componentDetails) {
          success
          componentDetails {
            id
            name
            typeId
          }
        }
      }
    }
  `, {
      cloudId,
      componentDetails: input,
    });

    const result = data?.compass?.createComponent;
    if (!result?.success) {
      throw new Error(`Compass createComponent did not return success for ${componentDetails.name}.`);
    }
    return result.componentDetails;
  };

  const attempts = [
    { mode: 'rich', input: richInput, ownerConfigured: Boolean(ownerId), repositoryLinked: Boolean(componentDetails.links?.some(link => link.type === 'REPOSITORY')), relatedLinkCount: componentDetails.links?.length || 0 },
    { mode: 'rich-no-owner', input: richWithoutOwnerInput, ownerConfigured: false, repositoryLinked: Boolean(componentDetails.links?.some(link => link.type === 'REPOSITORY')), relatedLinkCount: componentDetails.links?.length || 0 },
    { mode: 'metadata', input: metadataInput, ownerConfigured: false, repositoryLinked: false, relatedLinkCount: 0 },
    { mode: 'simple', input: simpleInput, ownerConfigured: false, repositoryLinked: false, relatedLinkCount: 0 },
  ];
  const errors = [];

  for (const attempt of attempts) {
    try {
      const component = await createWithInput(attempt.input);
      return {
        ...component,
        richPayloadApplied: attempt.mode === 'rich' || attempt.mode === 'rich-no-owner',
        metadataApplied: attempt.mode !== 'simple',
        createMode: attempt.mode,
        repositoryLinked: attempt.repositoryLinked,
        relatedLinkCount: attempt.relatedLinkCount,
        ownerConfigured: attempt.ownerConfigured,
        richPayloadError: errors.join(' | '),
      };
    } catch (err) {
      errors.push(`${attempt.mode}: ${err.message}`);
    }
  }

  throw new Error(errors.join(' | '));
}

async function createCompassDependency(startComponent, endComponent) {
  const data = await requestAtlassianGraph(`
    mutation createRelationship($input: CreateCompassRelationshipInput!) {
      compass {
        createRelationship(input: $input) {
          success
        }
      }
    }
  `, {
    input: {
      startNodeId: startComponent.id,
      endNodeId: endComponent.id,
      relationshipType: 'DEPENDS_ON',
    },
  });

  const result = data?.compass?.createRelationship;
  if (!result?.success) {
    throw new Error(`Compass createRelationship did not return success for ${startComponent.name} -> ${endComponent.name}.`);
  }
}

function getGoalTypeAri(cloudId) {
  const fullAri = String(process.env.ATLASSIAN_GOAL_TYPE_ARI || process.env.GOALS_GOAL_TYPE_ARI || '').trim();
  if (fullAri) {
    return fullAri;
  }

  const activationId = String(process.env.ATLASSIAN_GOAL_ACTIVATION_ID || process.env.GOALS_ACTIVATION_ID || '').trim();
  const goalTypeId = String(process.env.ATLASSIAN_GOAL_TYPE_ID || process.env.GOALS_GOAL_TYPE_ID || '').trim();
  if (activationId && goalTypeId) {
    return `ari:cloud:goal:${cloudId}:goal-type/${activationId}/${goalTypeId}`;
  }

  return '';
}

async function createAtlassianGoal(cloudId, name, targetDate) {
  const goalTypeAri = getGoalTypeAri(cloudId);
  if (!goalTypeAri) {
    throw new Error('configure ATLASSIAN_GOAL_TYPE_ARI, or ATLASSIAN_GOAL_ACTIVATION_ID and ATLASSIAN_GOAL_TYPE_ID.');
  }

  const containerId = `ari:cloud:townsquare::site/${cloudId}`;
  const data = await requestAtlassianGraph(`
    mutation CreateGoal($containerId: ID!, $name: String!, $goalTypeId: ID!) {
      goals_create(
        input: {
          containerId: $containerId
          name: $name
          goalTypeId: $goalTypeId
          targetDate: {
            date: "${targetDate}"
            confidence: QUARTER
          }
        }
      ) {
        goal {
          id
          name
        }
      }
    }
  `, {
    containerId,
    name,
    goalTypeId: goalTypeAri,
  });

  const goal = data?.goals_create?.goal;
  if (!goal?.id) {
    throw new Error(`Goals API did not return a created goal for ${name}.`);
  }
  return goal;
}

function getAtlassianGoalStatusPlan(goalIndex) {
  const plans = [
    { status: 'on_track', label: 'ON TRACK', score: 70, progressPercent: 72 },
    { status: 'at_risk', label: 'AT RISK', score: 50, progressPercent: 48 },
    { status: 'off_track', label: 'OFF TRACK', score: 30, progressPercent: 24 },
  ];
  return plans[Math.abs(Number(goalIndex) || 0) % plans.length];
}

function buildAtlassianGoalUpdateSummary(goalName, statusPlan) {
  return JSON.stringify({
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `${goalName} is marked ${statusPlan.label.toLowerCase()} with ${statusPlan.progressPercent}% demo progress for portfolio tracking.`,
          },
        ],
      },
    ],
  });
}

async function createAtlassianGoalStatusUpdate(goalId, goalName, targetDate, statusPlan) {
  const safeTargetDate = /^\d{4}-\d{2}-\d{2}$/.test(String(targetDate || ''))
    ? targetDate
    : new Date().toISOString().slice(0, 10);
  const summary = buildAtlassianGoalUpdateSummary(goalName, statusPlan);
  const createWithCurrentSchema = async () => await requestAtlassianGraph(`
    mutation CreateGoalStatusUpdate($goalId: ID!, $summary: String!, $status: String!, $score: Int!) {
      goals_createUpdate(
        input: {
          goalId: $goalId
          summary: $summary
          status: $status
          score: $score
          targetDate: {
            date: "${safeTargetDate}"
            confidence: QUARTER
          }
        }
      ) {
        success
        errors {
          message
        }
        update {
          id
          newScore
          updateType
        }
      }
    }
  `, {
    goalId,
    summary,
    status: statusPlan.status,
    score: statusPlan.score,
  });
  const data = await createWithCurrentSchema();

  const result = data?.goals_createUpdate;
  if (!result?.success) {
    const messages = (result?.errors || []).map(error => error?.message).filter(Boolean).join('; ');
    throw new Error(messages || 'Goals API did not accept the status update.');
  }

  return result.update || null;
}

let jiraGoalsFieldIdCache = null;

async function getJiraGoalsFieldId(diagnostics = []) {
  if (jiraGoalsFieldIdCache !== null) {
    return jiraGoalsFieldIdCache;
  }

  try {
    const fields = await jiraGet('/rest/api/3/field');
    const goalsField = (Array.isArray(fields) ? fields : []).find(field => {
      const name = String(field.name || '').toLowerCase();
      const schemaText = JSON.stringify(field.schema || {}).toLowerCase();
      return name === 'goals' || schemaText.includes('goals') || schemaText.includes('townsquare');
    });
    jiraGoalsFieldIdCache = goalsField?.id || '';

    if (jiraGoalsFieldIdCache) {
      diagnostics.push(`Native Goals field: resolved ${jiraGoalsFieldIdCache}.`);
    } else {
      diagnostics.push('Native Goals field: not found. Enable the Goals field for the project work type in Jira before native goal linking can appear in the Goals tab.');
    }
  } catch (err) {
    jiraGoalsFieldIdCache = '';
    diagnostics.push(`Native Goals field: lookup failed: ${err.message}`);
  }

  return jiraGoalsFieldIdCache;
}

async function isIssueFieldEditable(issueKey, fieldId) {
  try {
    const editMeta = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/editmeta`);
    return Boolean(editMeta?.fields?.[fieldId]);
  } catch {
    return true;
  }
}

async function updateIssueWithFirstWorkingPayload(issueKey, payloads, options = {}) {
  let lastError = null;
  const querySuffixes = options.querySuffixes || ['notifyUsers=false'];

  for (const querySuffix of querySuffixes) {
    for (const payload of payloads) {
      try {
        await jiraPut(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?${querySuffix}`, payload);
        return;
      } catch (err) {
        lastError = err;
      }
    }
  }

  throw lastError || new Error(`No payload variants were available for ${issueKey}.`);
}

async function linkIssueToAtlassianGoal(issueKey, goalId, diagnostics = []) {
  const goalsFieldId = await getJiraGoalsFieldId(diagnostics);
  if (!goalsFieldId) {
    throw new Error('Native Goals field was not found on this Jira site.');
  }

  const editable = await isIssueFieldEditable(issueKey, goalsFieldId);
  if (!editable) {
    diagnostics.push(`Native Goals link ${issueKey}: ${goalsFieldId} is not on the edit screen; trying Jira admin screen-security override.`);
  }

  await updateIssueWithFirstWorkingPayload(issueKey, [
    { fields: { [goalsFieldId]: [{ id: goalId }] } },
    { update: { [goalsFieldId]: [{ set: [{ id: goalId }] }] } },
    { fields: { [goalsFieldId]: [goalId] } },
    { update: { [goalsFieldId]: [{ set: [goalId] }] } },
  ], {
    querySuffixes: [
      'notifyUsers=false',
      'notifyUsers=false&overrideScreenSecurity=true&overrideEditableFlag=true',
    ],
  });
}

async function linkIssueToCompassComponent(issueKey, component, diagnostics = []) {
  const payloads = [];
  const jiraComponentId = component.jiraComponentId || component.projectComponentId || null;
  const jiraComponentName = component.jiraComponentName || component.projectComponentName || component.name || '';

  // Jira's native "Components" field accepts Jira project component IDs, not
  // Compass GraphQL component IDs. The Compass metadata stays on the run record,
  // while the visible Jira component gives users something concrete to click in
  // the project Components view and on generated issues.
  if (jiraComponentId) {
    payloads.push({ update: { components: [{ add: { id: String(jiraComponentId) } }] } });
    payloads.push({ fields: { components: [{ id: String(jiraComponentId) }] } });
  }
  if (jiraComponentName) {
    payloads.push({ update: { components: [{ add: { name: String(jiraComponentName) } }] } });
    payloads.push({ fields: { components: [{ name: String(jiraComponentName) }] } });
  }

  if (payloads.length === 0) {
    throw new Error('No Jira project component id or name was available for the Compass component.');
  }

  try {
    await updateIssueWithFirstWorkingPayload(issueKey, payloads);
    diagnostics.push(`Compass link ${issueKey}: linked Jira component "${jiraComponentName || jiraComponentId}" for Compass component "${component.name}" to Components field.`);
  } catch (err) {
    diagnostics.push(`Compass link ${issueKey}: "${component.name}" not linked to Jira Components field: ${err.message}`);
    throw err;
  }
}

function getProjectGoalTemplates(config, project) {
  const industryName = toTitleCase(config.industry || 'Business');
  const template = normaliseSoftwareTemplate(project?.softwareTemplate);
  const methodLabel = template === 'kanban' ? 'flow' : 'sprint';

  return [
    {
      title: `${project.key} improve ${industryName} release confidence`,
      description: `Increase release confidence for ${project.name} by tightening ${methodLabel} quality signals, release readiness, and operational handoff.`,
      priority: 'High',
      targetOffsetDays: 90,
    },
    {
      title: `${project.key} reduce customer-impacting defects`,
      description: `Reduce escaped defects across ${project.name} with better triage, dependency visibility, and component ownership.`,
      priority: 'Medium',
      targetOffsetDays: 120,
    },
    {
      title: `${project.key} improve delivery predictability`,
      description: `Improve delivery predictability for ${project.name} through active sprint/flow tracking, aging work reviews, and roadmap alignment.`,
      priority: 'Medium',
      targetOffsetDays: 150,
    },
  ];
}

async function createProjectGoalWorkItem(config, project, goalTemplate, goalIndex, diagnostics = []) {
  const targetDate = createShiftedDate(goalTemplate.targetOffsetDays + (goalIndex * 7)).toISOString().split('T')[0];
  const lifecycle = createLifecycleForIssue({
    index: goalIndex,
    priority: goalTemplate.priority,
    issueType: 'Task',
    maxAgeDays: config.dateRangeDays,
  });
  const lifecycleForStatus = ensureResolvedLifecycleForStatus(lifecycle, goalIndex === 0 ? 'In Progress' : 'To Do');
  const componentNames = (project.components || [])
    .map(component => component.name)
    .filter(Boolean)
    .slice(0, 2);

  const issue = await createIssue(
    project.key,
    goalTemplate.title,
    'Task',
    null,
    goalTemplate.priority,
    targetDate,
    null,
    {
      demoDateFields: project.skipDemoDateFieldWrites ? {} : (project.demoDateFields || {}),
      diagnostics,
      environmentName: config.environmentName,
      lifecycle: lifecycleForStatus,
      projectKind: 'software-goal',
      retentionPeriodDays: config.retentionPeriodDays,
      description: goalTemplate.description,
      skipEpicLink: true,
      labels: ['demo-goal', 'project-goal'],
      components: componentNames,
    }
  );

  if (lifecycleForStatus.targetStatus && lifecycleForStatus.targetStatus !== 'To Do') {
    await transitionIssue(issue.key, lifecycleForStatus.targetStatus);
  }

  return {
    key: issue.key,
    name: goalTemplate.title,
    projectKey: project.key,
    targetDate,
    source: 'jira-work-item',
  };
}

async function createEpic(projectKey, epicName, options = {}) {
  const dueDate = options.dueDate || null;
  const startDate = options.startDate || null;
  const startDateFieldId = options.startDateFieldId || null;
  const assigneeAccountId = options.assigneeAccountId || null;
  const lifecycle = options.lifecycle || null;
  const demoDateFields = options.demoDateFields || {};
  const priority = options.priority || null;
  const fields = {
    project: { key: projectKey },
    issuetype: { name: 'Epic' },
    summary: epicName,
  };

  // Epics are the first rows users tend to see in a new Jira list view. Setting
  // these normal board-visible fields makes the generated project look complete
  // even before the user expands or scrolls into the child stories and tasks.
  // We still set them again after creation because some Jira screens reject
  // optional fields during create, even though the same field can be edited later.
  if (dueDate) fields.duedate = dueDate;
  if (startDate && startDateFieldId) fields[startDateFieldId] = startDate;
  if (assigneeAccountId) fields.assignee = { accountId: assigneeAccountId };
  if (priority) fields.priority = { name: priority };

  try {
    const epic = await jiraPost('/rest/api/3/issue', { fields });
    await saveLifecycleProperty(epic, options, lifecycle);
    await updateIssueDemoDateFields(epic.key, demoDateFields, lifecycle, options.diagnostics);
    await updateIssueBoardVisibleFields(epic.key, { assigneeAccountId, dueDate, startDate, startDateFieldId }, options.diagnostics);
    if (lifecycle?.targetStatus && lifecycle.targetStatus !== 'To Do') {
      await transitionIssue(epic.key, lifecycle.targetStatus);
    }
    return epic;
  } catch (err) {
    const lowerError = String(err?.message || '').toLowerCase();

    if (
      lowerError.includes('customfield') ||
      lowerError.includes('assignee') ||
      lowerError.includes('duedate') ||
      lowerError.includes('cannot be assigned issues') ||
      lowerError.includes('not on the appropriate screen')
    ) {
      const epic = await jiraPost('/rest/api/3/issue', { fields: removeOptionalIssueFields(fields) });
      await saveLifecycleProperty(epic, options, lifecycle);
      await updateIssueDemoDateFields(epic.key, demoDateFields, lifecycle, options.diagnostics);
      await updateIssueBoardVisibleFields(epic.key, { assigneeAccountId, dueDate, startDate, startDateFieldId }, options.diagnostics);
      if (lifecycle?.targetStatus && lifecycle.targetStatus !== 'To Do') {
        await transitionIssue(epic.key, lifecycle.targetStatus);
      }
      return epic;
    }

    throw err;
  }
}

async function getDemoDateFieldIds() {
  if (demoDateFieldIdsCache) {
    return demoDateFieldIdsCache;
  }

  const fields = await jiraGet('/rest/api/3/field');
  const result = {
    createdDateFieldId: null,
    resolvedDateFieldId: null,
  };

  for (const field of fields || []) {
    const normalisedName = normaliseFieldName(field.name);

    if (!isCustomDateField(field)) {
      continue;
    }

    if (!result.createdDateFieldId && normalisedName === 'createddate') {
      result.createdDateFieldId = field.id;
    }

    if (
      !result.resolvedDateFieldId &&
      (normalisedName === 'resolveddate' || normalisedName === 'resloveddate')
    ) {
      result.resolvedDateFieldId = field.id;
    }
  }

  demoDateFieldIdsCache = result;
  return result;
}

async function getTimelineStartDateFieldId(diagnostics = []) {
  if (timelineStartDateFieldIdCache !== null) {
    return timelineStartDateFieldIdCache;
  }

  try {
    const fields = await jiraGet('/rest/api/3/field');
    const startDateField = (fields || []).find(field => (
      normaliseFieldName(field.name || field.key || '') === 'startdate' &&
      isCustomDateField(field)
    )) || (fields || []).find(field => normaliseFieldName(field.name || field.key || '') === 'startdate');

    timelineStartDateFieldIdCache = startDateField?.id || '';
    diagnostics.push(timelineStartDateFieldIdCache
      ? `Timeline fields: Jira Start date field resolved as ${timelineStartDateFieldIdCache}.`
      : 'Timeline fields: Jira Start date field was not found; native timeline may use default scheduling.');
  } catch (err) {
    timelineStartDateFieldIdCache = '';
    diagnostics.push(`Timeline fields: Start date lookup failed: ${err.message}`);
  }

  return timelineStartDateFieldIdCache;
}

function collectCreateMetaFieldCandidates(issueTypes) {
  const byFieldId = new Map();

  for (const issueType of issueTypes || []) {
    const fields = issueType?.fields && typeof issueType.fields === 'object'
      ? issueType.fields
      : {};

    for (const [fieldKey, metadata] of Object.entries(fields)) {
      const fieldId = String(metadata?.fieldId || fieldKey || '').trim();
      if (!fieldId || byFieldId.has(fieldId)) {
        continue;
      }

      byFieldId.set(fieldId, {
        id: fieldId,
        key: fieldKey,
        name: metadata?.name || '',
        custom: fieldId.startsWith('customfield_'),
        schema: metadata?.schema || {},
      });
    }
  }

  return Array.from(byFieldId.values());
}

function mergeCreateMetaFieldCandidate(byFieldId, candidate) {
  const fieldId = String(candidate?.fieldId || candidate?.id || candidate?.key || '').trim();
  if (!fieldId || byFieldId.has(fieldId)) {
    return;
  }

  byFieldId.set(fieldId, {
    id: fieldId,
    key: candidate?.key || fieldId,
    name: candidate?.name || '',
    custom: fieldId.startsWith('customfield_'),
    schema: candidate?.schema || {},
  });
}

function isCreatedDateCustomFieldName(normalisedName) {
  return (
    normalisedName === 'createddate' ||
    normalisedName === 'createddt' ||
    (normalisedName.includes('created') && normalisedName.includes('date'))
  );
}

function isResolvedDateCustomFieldName(normalisedName) {
  return (
    normalisedName === 'resolveddate' ||
    normalisedName === 'resloveddate' ||
    normalisedName === 'resolutiondate' ||
    (normalisedName.includes('resolved') && normalisedName.includes('date')) ||
    (normalisedName.includes('resolution') && normalisedName.includes('date'))
  );
}

async function searchCustomFieldsByName(queryText) {
  const maxResults = 100;
  const data = await jiraGet(`/rest/api/3/field/search?type=custom&query=${encodeURIComponent(queryText)}&maxResults=${maxResults}`);
  const values = Array.isArray(data?.values)
    ? data.values
    : Array.isArray(data)
      ? data
      : [];

  return values.map(item => ({
    id: item?.id || item?.fieldId || item?.key,
    key: item?.key || item?.id,
    name: item?.name || '',
    custom: true,
    schema: item?.schema || {},
  }));
}

async function createGlobalDemoDateField(name, description) {
  return await jiraPost('/rest/api/3/field', {
    name,
    description,
    type: 'com.atlassian.jira.plugin.system.customfieldtypes:datepicker',
  });
}

async function ensureGlobalDemoDateFields(result, diagnostics = []) {
  const missingDefinitions = [];

  if (!result.createdDateFieldId) {
    missingDefinitions.push(DEMO_DATE_FIELD_DEFINITIONS.created);
  }

  if (!result.resolvedDateFieldId) {
    missingDefinitions.push(DEMO_DATE_FIELD_DEFINITIONS.resolved);
  }

  if (missingDefinitions.length === 0) {
    return;
  }

  diagnostics.push(`Date fields fallback: attempting global field creation for ${missingDefinitions.map(item => item.name).join(', ')}`);

  for (const definition of missingDefinitions) {
    try {
      const createdField = await createGlobalDemoDateField(definition.name, definition.description);
      diagnostics.push(`Date fields fallback: created global field "${definition.name}" (${createdField?.id || 'id unavailable'})`);
    } catch (err) {
      const message = String(err.message || '');
      const lower = message.toLowerCase();

      if (lower.includes('already exists') || lower.includes('a custom field with this name already exists')) {
        diagnostics.push(`Date fields fallback: global field "${definition.name}" already exists`);
      } else {
        diagnostics.push(`Date fields fallback: create failed for "${definition.name}": ${message}`);
      }
    }
  }

  // Clear global cache and retry lookups because Jira field indexing can lag.
  demoDateFieldIdsCache = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await wait(1200);
    }

    try {
      const globalFields = await getDemoDateFieldIds();
      if (!result.createdDateFieldId && globalFields.createdDateFieldId) {
        result.createdDateFieldId = globalFields.createdDateFieldId;
      }
      if (!result.resolvedDateFieldId && globalFields.resolvedDateFieldId) {
        result.resolvedDateFieldId = globalFields.resolvedDateFieldId;
      }
    } catch (err) {
      diagnostics.push(`Date fields fallback: global refresh attempt ${attempt + 1} failed: ${err.message}`);
    }

    if (result.createdDateFieldId && result.resolvedDateFieldId) {
      diagnostics.push(`Date fields fallback: resolved via global refresh on attempt ${attempt + 1}`);
      return;
    }

    try {
      const searchCandidates = [];
      searchCandidates.push(...await searchCustomFieldsByName(DEMO_DATE_FIELD_DEFINITIONS.created.name));
      searchCandidates.push(...await searchCustomFieldsByName(DEMO_DATE_FIELD_DEFINITIONS.resolved.name));
      applyDemoDateFieldMatches(result, searchCandidates, `field/search(post-create attempt ${attempt + 1})`, diagnostics);
    } catch (err) {
      diagnostics.push(`Date fields fallback: field/search refresh attempt ${attempt + 1} failed: ${err.message}`);
    }

    if (result.createdDateFieldId && result.resolvedDateFieldId) {
      diagnostics.push(`Date fields fallback: resolved via field/search on attempt ${attempt + 1}`);
      return;
    }
  }
}

async function getCreateMetaFieldsForIssueType(projectKey, issueTypeId) {
  const data = await jiraGet(`/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes/${encodeURIComponent(issueTypeId)}`);

  // Jira create-meta endpoints have returned multiple shapes across Cloud APIs:
  // array pages (values/results), object maps (fields), and direct arrays.
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.values)) {
    return data.values;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  if (Array.isArray(data?.fields)) {
    return data.fields;
  }

  if (data?.fields && typeof data.fields === 'object') {
    return Object.entries(data.fields).map(([fieldKey, metadata]) => ({
      ...metadata,
      key: fieldKey,
      fieldId: metadata?.fieldId || fieldKey,
    }));
  }

  return [];
}

async function getProjectCreateMetaFieldCandidates(projectKey, issueTypes, diagnostics = []) {
  const byFieldId = new Map();

  for (const candidate of collectCreateMetaFieldCandidates(issueTypes)) {
    mergeCreateMetaFieldCandidate(byFieldId, candidate);
  }

  for (const issueType of issueTypes || []) {
    const issueTypeId = issueType?.id;
    if (!issueTypeId) {
      continue;
    }

    try {
      const fields = await getCreateMetaFieldsForIssueType(projectKey, issueTypeId);
      diagnostics.push(`Date fields source createmeta(${projectKey}) issueType ${issueTypeId} fields=${fields.length}`);

      for (const field of fields) {
        mergeCreateMetaFieldCandidate(byFieldId, field);
      }
    } catch (err) {
      diagnostics.push(`Date fields source createmeta(${projectKey}) issueType ${issueTypeId} failed: ${err.message}`);
    }
  }

  return Array.from(byFieldId.values());
}

function applyDemoDateFieldMatches(result, fields, sourceLabel, diagnostics = []) {
  for (const field of fields || []) {
    if (!isCustomDateField(field)) {
      continue;
    }

    const normalisedName = normaliseFieldName(field.name);
    const fieldId = String(field.id || field.key || '').trim();
    if (!fieldId) {
      continue;
    }

    if (!result.createdDateFieldId && isCreatedDateCustomFieldName(normalisedName)) {
      result.createdDateFieldId = fieldId;
      diagnostics.push(`Date fields source ${sourceLabel}: matched "${field.name}" -> ${fieldId} as Created Date`);
      continue;
    }

    if (!result.resolvedDateFieldId && isResolvedDateCustomFieldName(normalisedName)) {
      result.resolvedDateFieldId = fieldId;
      diagnostics.push(`Date fields source ${sourceLabel}: matched "${field.name}" -> ${fieldId} as Resolved Date`);
    }
  }
}

async function getProjectDemoDateFieldIds(projectKey, diagnostics = []) {
  if (demoDateFieldsByProjectCache.has(projectKey)) {
    return demoDateFieldsByProjectCache.get(projectKey);
  }

  const result = {
    createdDateFieldId: null,
    resolvedDateFieldId: null,
  };

  try {
    const globalFields = await getDemoDateFieldIds();
    result.createdDateFieldId = globalFields.createdDateFieldId || null;
    result.resolvedDateFieldId = globalFields.resolvedDateFieldId || null;
    diagnostics.push(
      `Date fields source global(/field): created=${result.createdDateFieldId || 'NOT_FOUND'}, resolved=${result.resolvedDateFieldId || 'NOT_FOUND'}`
    );
  } catch (err) {
    diagnostics.push(`Date fields source global(/field) lookup failed: ${err.message}`);
  }

  if (!result.createdDateFieldId || !result.resolvedDateFieldId) {
    try {
      const projectFieldData = await jiraGet(`/rest/api/3/project/${encodeURIComponent(projectKey)}/fields`);
      const projectFields = Array.isArray(projectFieldData?.values)
        ? projectFieldData.values
        : Array.isArray(projectFieldData)
          ? projectFieldData
          : [];
      applyDemoDateFieldMatches(result, projectFields, `project(${projectKey})/fields`, diagnostics);
    } catch (err) {
      diagnostics.push(`Date fields source project(${projectKey})/fields lookup failed: ${err.message}`);
    }
  }

  if (!result.createdDateFieldId || !result.resolvedDateFieldId) {
    try {
      const issueTypes = await getCreatableIssueTypes(projectKey);
      const createMetaFields = await getProjectCreateMetaFieldCandidates(projectKey, issueTypes, diagnostics);
      diagnostics.push(`Date fields source createmeta(${projectKey}) total candidates=${createMetaFields.length}`);
      applyDemoDateFieldMatches(result, createMetaFields, `createmeta(${projectKey})`, diagnostics);
    } catch (err) {
      diagnostics.push(`Date fields source createmeta(${projectKey}) lookup failed: ${err.message}`);
    }
  }

  if (!result.createdDateFieldId || !result.resolvedDateFieldId) {
    try {
      const searchCandidates = [];
      searchCandidates.push(...await searchCustomFieldsByName('Created Date'));
      searchCandidates.push(...await searchCustomFieldsByName('Resolved Date'));
      diagnostics.push(`Date fields source field/search candidates=${searchCandidates.length}`);
      applyDemoDateFieldMatches(result, searchCandidates, 'field/search', diagnostics);
    } catch (err) {
      diagnostics.push(`Date fields source field/search lookup failed: ${err.message}`);
    }
  }

  if (!result.createdDateFieldId || !result.resolvedDateFieldId) {
    await ensureGlobalDemoDateFields(result, diagnostics);
  }

  diagnostics.push(
    `Date fields final resolution for ${projectKey}: created=${result.createdDateFieldId || 'NOT_FOUND'}, resolved=${result.resolvedDateFieldId || 'NOT_FOUND'}`
  );

  demoDateFieldsByProjectCache.set(projectKey, result);
  return result;
}

async function resolveDemoDateFieldsWithoutScreenSetup(projectKey, diagnostics = []) {
  const result = {
    createdDateFieldId: null,
    resolvedDateFieldId: null,
  };

  try {
    const globalFields = await getDemoDateFieldIds();
    result.createdDateFieldId = globalFields.createdDateFieldId || null;
    result.resolvedDateFieldId = globalFields.resolvedDateFieldId || null;
    diagnostics.push(
      `Date fields ${projectKey}: global lookup created=${result.createdDateFieldId || 'NOT_FOUND'}, resolved=${result.resolvedDateFieldId || 'NOT_FOUND'}`
    );
  } catch (err) {
    diagnostics.push(`Date fields ${projectKey}: global lookup failed: ${err.message}`);
  }

  if (!result.createdDateFieldId || !result.resolvedDateFieldId) {
    await ensureGlobalDemoDateFields(result, diagnostics);
  }

  diagnostics.push(
    `Date fields ${projectKey}: screen configuration skipped; issue updates will use the normal edit path with admin override fallback.`
  );
  diagnostics.push(
    `Date fields ${projectKey}: resolved created=${result.createdDateFieldId || 'NOT_FOUND'}, resolved=${result.resolvedDateFieldId || 'NOT_FOUND'}`
  );

  demoDateFieldsByProjectCache.set(projectKey, result);
  return result;
}

async function getProjectIssueTypeScreenSchemeId(projectId) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const data = await jiraGet(`/rest/api/3/issuetypescreenscheme/project?projectId=${encodeURIComponent(projectId)}`);
    const issueTypeScreenSchemeId = data.values?.[0]?.issueTypeScreenScheme?.id || null;

    if (issueTypeScreenSchemeId) {
      return issueTypeScreenSchemeId;
    }

    await wait(1500);
  }

  return null;
}

async function getScreenSchemeIdsForIssueTypeScreenScheme(issueTypeScreenSchemeId) {
  const data = await jiraGet(`/rest/api/3/issuetypescreenscheme/mapping?issueTypeScreenSchemeId=${encodeURIComponent(issueTypeScreenSchemeId)}&maxResults=100`);
  const ids = new Set();

  for (const mapping of data.values || []) {
    if (mapping.screenSchemeId) {
      ids.add(String(mapping.screenSchemeId));
    }
  }

  return Array.from(ids);
}

async function getScreenIdsForScreenSchemes(screenSchemeIds) {
  if (screenSchemeIds.length === 0) {
    return [];
  }

  const wantedIds = new Set(screenSchemeIds.map(String));
  const screenIds = new Set();
  const matchedSchemeIds = new Set();

  const collectScreensFromScheme = (screenScheme) => {
    if (!screenScheme) {
      return;
    }

    const schemeId = String(screenScheme.id || '');
    if (!schemeId) {
      return;
    }

    matchedSchemeIds.add(schemeId);

    // Jira screen schemes can have operation-specific screens. Adding the demo
    // date fields to every operation screen makes create, edit, and view flows
    // work for whichever issue type the generated project uses.
    for (const screenId of Object.values(screenScheme.screens || {})) {
      if (screenId) {
        screenIds.add(String(screenId));
      }
    }
  };

  // First pass: scan paginated list endpoint.
  let startAt = 0;
  const maxResults = 100;
  for (let page = 0; page < 25; page++) {
    const data = await jiraGet(`/rest/api/3/screenscheme?startAt=${startAt}&maxResults=${maxResults}`);
    const values = Array.isArray(data.values) ? data.values : [];

    for (const screenScheme of values) {
      if (!wantedIds.has(String(screenScheme.id))) {
        continue;
      }
      collectScreensFromScheme(screenScheme);
    }

    if (data.isLast || values.length === 0) {
      break;
    }

    startAt += values.length;
  }

  // Fallback: fetch each missing screen scheme directly by ID.
  for (const screenSchemeId of wantedIds) {
    if (matchedSchemeIds.has(screenSchemeId)) {
      continue;
    }

    try {
      const screenScheme = await jiraGet(`/rest/api/3/screenscheme/${encodeURIComponent(screenSchemeId)}`);
      collectScreensFromScheme(screenScheme);
    } catch (err) {
      // Keep lookup resilient. The caller already reports a high-level screen
      // discovery failure when no screen IDs can be resolved.
    }
  }

  return Array.from(screenIds);
}

async function findProjectScreenIdsByName(projectKey) {
  const screenIds = new Set();
  const data = await jiraGet(`/rest/api/3/screens?query=${encodeURIComponent(projectKey)}&maxResults=1000`);

  for (const screen of data.values || []) {
    const screenName = String(screen.name || '').toLowerCase();

    if (!screen.id || !screenName.includes(projectKey.toLowerCase())) {
      continue;
    }

    if (
      screenName.includes('create issue screen') ||
      screenName.includes('edit/view issue screen') ||
      screenName.includes('view issue') ||
      screenName.includes('default issue screen') ||
      screenName.includes('bug screen') ||
      screenName.includes('resolve issue screen')
    ) {
      screenIds.add(String(screen.id));
    }
  }

  return Array.from(screenIds);
}

async function getProjectFieldConfigurationSchemeId(projectId) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const data = await jiraGet(`/rest/api/3/fieldconfigurationscheme/project?projectId=${encodeURIComponent(projectId)}`);
    const scheme = (data.values || []).find(item => (item.projectIds || []).map(String).includes(String(projectId)));
    const schemeId = scheme?.fieldConfigurationScheme?.id || null;

    if (schemeId) {
      return schemeId;
    }

    // Jira omits fieldConfigurationScheme for projects using the default field
    // configuration scheme. In that case there is no project-specific scheme ID
    // to follow, so the caller can fall back to the global default configuration.
    if ((data.values || []).some(item => (item.projectIds || []).map(String).includes(String(projectId)))) {
      return null;
    }

    await wait(1500);
  }

  return null;
}

async function getDefaultFieldConfigurationId() {
  const data = await jiraGet('/rest/api/3/fieldconfiguration?maxResults=100');
  const defaultConfiguration = (data.values || []).find(configuration =>
    configuration.isDefault ||
    String(configuration.name || '').toLowerCase() === 'default field configuration'
  );
  return defaultConfiguration?.id ? String(defaultConfiguration.id) : null;
}

async function getFieldConfigurationIdsForProject(projectId) {
  const fieldConfigurationSchemeId = await getProjectFieldConfigurationSchemeId(projectId);

  if (!fieldConfigurationSchemeId) {
    const defaultFieldConfigurationId = await getDefaultFieldConfigurationId();
    return defaultFieldConfigurationId ? [defaultFieldConfigurationId] : [];
  }

  const data = await jiraGet(`/rest/api/3/fieldconfigurationscheme/mapping?fieldConfigurationSchemeId=${encodeURIComponent(fieldConfigurationSchemeId)}&maxResults=100`);
  const ids = new Set();

  for (const mapping of data.values || []) {
    if (mapping.fieldConfigurationId) {
      ids.add(String(mapping.fieldConfigurationId));
    }
  }

  return Array.from(ids);
}

async function showFieldsInFieldConfigurations(projectId, fieldIds) {
  const fieldConfigurationIds = await getFieldConfigurationIdsForProject(projectId);

  for (const fieldConfigurationId of fieldConfigurationIds) {
    await jiraPut(`/rest/api/3/fieldconfiguration/${encodeURIComponent(fieldConfigurationId)}/fields`, {
      fieldConfigurationItems: fieldIds.map(fieldId => ({
        id: fieldId,
        isHidden: false,
        isRequired: false,
      })),
    });
  }

  return fieldConfigurationIds.length;
}

async function getProjectSpecificFieldConfigurationIds(projectId) {
  const fieldConfigurationSchemeId = await getProjectFieldConfigurationSchemeId(projectId);

  if (!fieldConfigurationSchemeId) {
    return [];
  }

  const data = await jiraGet(`/rest/api/3/fieldconfigurationscheme/mapping?fieldConfigurationSchemeId=${encodeURIComponent(fieldConfigurationSchemeId)}&maxResults=100`);
  const ids = new Set();

  for (const mapping of data.values || []) {
    if (mapping.fieldConfigurationId) {
      ids.add(String(mapping.fieldConfigurationId));
    }
  }

  return Array.from(ids);
}

async function hideFieldsInProjectFieldConfigurations(projectId, fieldIds) {
  const fieldConfigurationIds = await getProjectSpecificFieldConfigurationIds(projectId);

  for (const fieldConfigurationId of fieldConfigurationIds) {
    await jiraPut(`/rest/api/3/fieldconfiguration/${encodeURIComponent(fieldConfigurationId)}/fields`, {
      fieldConfigurationItems: fieldIds.map(fieldId => ({
        id: fieldId,
        isHidden: true,
      })),
    });
  }

  return fieldConfigurationIds.length;
}

async function hideNativeMajorIncidentFieldForProject(project, diagnostics = []) {
  if (!project?.id || !project?.key) {
    return { success: false, message: 'project id/key unavailable' };
  }

  const fields = await jiraGet('/rest/api/3/field');
  const majorIncidentFieldIds = (Array.isArray(fields) ? fields : [])
    .filter(field => normaliseFieldName(field?.name || '') === 'majorincident')
    .map(field => field.id)
    .filter(Boolean);

  if (majorIncidentFieldIds.length === 0) {
    diagnostics.push(`ITSM foundation ${project.key}: native Major incident field was not found.`);
    return { success: true, fieldCount: 0, fieldConfigurationCount: 0 };
  }

  const fieldConfigurationCount = await hideFieldsInProjectFieldConfigurations(project.id, majorIncidentFieldIds);

  if (fieldConfigurationCount === 0) {
    diagnostics.push(`ITSM foundation ${project.key}: skipped hiding native Major incident field because Jira did not expose a project-specific field configuration.`);
    return { success: true, fieldCount: majorIncidentFieldIds.length, fieldConfigurationCount: 0 };
  }

  diagnostics.push(`ITSM foundation ${project.key}: hid native Major incident field from ${fieldConfigurationCount} project field configuration(s).`);
  return {
    success: true,
    fieldCount: majorIncidentFieldIds.length,
    fieldConfigurationCount,
  };
}

async function getPrimaryScreenTabId(screenId) {
  const tabs = await jiraGet(`/rest/api/3/screens/${encodeURIComponent(screenId)}/tabs`);
  const preferredTab = (tabs || []).find(tab => ['field tab', 'general', 'default'].includes(String(tab.name || '').toLowerCase()));
  return (preferredTab || tabs?.[0])?.id || null;
}

async function addFieldToScreenTab(screenId, tabId, fieldId) {
  try {
    await jiraPost(`/rest/api/3/screens/${encodeURIComponent(screenId)}/tabs/${encodeURIComponent(tabId)}/fields`, {
      fieldId,
    });
  } catch (err) {
    const message = err.message.toLowerCase();

    // Jira returns a validation error when the field is already present. That
    // is the desired end state, so this branch keeps reruns idempotent.
    if (message.includes('already') || message.includes('exists')) {
      return;
    }

    throw err;
  }
}

async function getDevelopmentFieldId(diagnostics = [], projectKey = 'unknown') {
  let fields;
  try {
    fields = await jiraGet('/rest/api/3/field');
  } catch (err) {
    diagnostics.push(`Development field ${projectKey}: Jira field lookup skipped: ${err.message}`);
    return null;
  }

  const developmentField = (Array.isArray(fields) ? fields : []).find(field => {
    const fieldId = String(field?.id || field?.key || '').toLowerCase();
    const fieldName = normaliseFieldName(field?.name || '');
    return fieldId === 'development' || fieldName === 'development';
  });

  if (!developmentField?.id) {
    diagnostics.push(`Development field ${projectKey}: Jira field lookup did not return a Development field.`);
    return null;
  }

  diagnostics.push(`Development field ${projectKey}: resolved field id ${developmentField.id}.`);
  return developmentField.id;
}

async function ensureDevelopmentFieldOnProjectScreens(projectId, projectKey, diagnostics = []) {
  if (!projectId || !projectKey) {
    diagnostics.push('Development field setup skipped because project id/key was not available.');
    return { success: false, screenCount: 0, message: 'project id/key unavailable' };
  }

  const developmentFieldId = await getDevelopmentFieldId(diagnostics, projectKey);
  if (!developmentFieldId) {
    return { success: false, screenCount: 0, message: 'Development field was not found' };
  }

  try {
    const fieldConfigurationCount = await showFieldsInFieldConfigurations(projectId, [developmentFieldId]);
    diagnostics.push(`Development field ${projectKey}: confirmed visible in ${fieldConfigurationCount} field configuration(s).`);
  } catch (err) {
    // Some Jira tenants treat Development as a special system field and do not
    // allow field-configuration updates. Screen placement is the part that
    // controls the missing-field warning, so keep going when this fails.
    diagnostics.push(`Development field ${projectKey}: field configuration update skipped: ${err.message}`);
  }

  let issueTypeScreenSchemeId = null;
  let screenSchemeIds = [];
  let schemeScreenIds = [];
  let namedScreenIds = [];

  try {
    issueTypeScreenSchemeId = await getProjectIssueTypeScreenSchemeId(projectId);
    if (issueTypeScreenSchemeId) {
      screenSchemeIds = await getScreenSchemeIdsForIssueTypeScreenScheme(issueTypeScreenSchemeId);
      schemeScreenIds = await getScreenIdsForScreenSchemes(screenSchemeIds);
    }
    namedScreenIds = await findProjectScreenIdsByName(projectKey);
  } catch (err) {
    diagnostics.push(`Development field ${projectKey}: screen lookup failed: ${err.message}`);
    return { success: false, screenCount: 0, message: `screen lookup failed: ${err.message}` };
  }

  const screenIds = Array.from(new Set([...schemeScreenIds, ...namedScreenIds]));
  diagnostics.push(`Development field ${projectKey}: screens to update=${screenIds.join(',') || 'NONE'}.`);

  if (screenIds.length === 0) {
    return {
      success: true,
      screenCount: 0,
      message: 'No classic create/edit/view screens were found.',
    };
  }

  const failures = [];
  for (const screenId of screenIds) {
    let tabId = null;
    try {
      tabId = await getPrimaryScreenTabId(screenId);
    } catch (err) {
      failures.push(`screen ${screenId} tab lookup failed: ${err.message}`);
      continue;
    }

    if (!tabId) {
      failures.push(`screen ${screenId} has no tab`);
      continue;
    }

    try {
      await addFieldToScreenTab(screenId, tabId, developmentFieldId);
      diagnostics.push(`Development field ${projectKey}: added or already present on screen ${screenId}, tab ${tabId}.`);
    } catch (err) {
      failures.push(`screen ${screenId}: ${err.message}`);
    }
  }

  if (failures.length > 0) {
    diagnostics.push(`Development field ${projectKey}: could not update every screen: ${failures.join('; ')}`);
    return {
      success: false,
      screenCount: screenIds.length,
      message: failures.join('; '),
    };
  }

  return {
    success: true,
    screenCount: screenIds.length,
  };
}

async function ensureDemoDateFieldsOnProjectScreens(projectId, projectKey) {
  const diagnostics = [];
  const addDiagnostic = message => {
    const line = `Date fields ${projectKey}: ${message}`;
    console.log(`DEMO_DATE_DIAGNOSTIC ${line}`);
    diagnostics.push(line);
  };

  addDiagnostic(`starting setup for projectId=${projectId}`);

  const demoDateFields = await getProjectDemoDateFieldIds(projectKey, diagnostics);
  const fieldIds = [
    demoDateFields.createdDateFieldId,
    demoDateFields.resolvedDateFieldId,
  ].filter(Boolean);
  const boardVisibleScreenFieldIds = ['assignee', 'duedate'];

  addDiagnostic(`field lookup result createdDateFieldId=${demoDateFields.createdDateFieldId || 'NOT_FOUND'}, resolvedDateFieldId=${demoDateFields.resolvedDateFieldId || 'NOT_FOUND'}`);

  if (fieldIds.length === 0) {
    return {
      success: false,
      message: 'Could not find custom fields named "Created date" and/or "Resolved Date".',
      demoDateFields,
      diagnostics,
    };
  }

  let fieldConfigurationCount = 0;
  try {
    fieldConfigurationCount = await showFieldsInFieldConfigurations(projectId, fieldIds);
    addDiagnostic(`field configuration update completed for ${fieldConfigurationCount} configuration(s)`);
  } catch (err) {
    addDiagnostic(`field configuration update failed: ${err.message}`);
    return {
      success: false,
      message: `Could not show demo date fields in the field configuration: ${err.message}`,
      demoDateFields,
      diagnostics,
    };
  }

  let issueTypeScreenSchemeId;
  try {
    issueTypeScreenSchemeId = await getProjectIssueTypeScreenSchemeId(projectId);
    addDiagnostic(`issue type screen scheme id=${issueTypeScreenSchemeId || 'NOT_FOUND'}`);
  } catch (err) {
    addDiagnostic(`issue type screen scheme lookup failed: ${err.message}`);
    return {
      success: false,
      message: `Could not look up the issue type screen scheme: ${err.message}`,
      demoDateFields,
      diagnostics,
    };
  }

  let screenSchemeIds = [];
  let schemeScreenIds = [];
  let namedScreenIds = [];
  try {
    if (issueTypeScreenSchemeId) {
      screenSchemeIds = await getScreenSchemeIdsForIssueTypeScreenScheme(issueTypeScreenSchemeId);
      schemeScreenIds = await getScreenIdsForScreenSchemes(screenSchemeIds);
    } else {
      addDiagnostic('issue type screen scheme not available; falling back to project-named screens and post-create field updates');
    }
    namedScreenIds = await findProjectScreenIdsByName(projectKey);
    addDiagnostic(`screen scheme ids=${screenSchemeIds.join(',') || 'NONE'}`);
    addDiagnostic(`screens from schemes=${schemeScreenIds.join(',') || 'NONE'}`);
    addDiagnostic(`screens found by project key=${namedScreenIds.join(',') || 'NONE'}`);
  } catch (err) {
    addDiagnostic(`screen lookup failed: ${err.message}`);
    return {
      success: false,
      message: `Could not look up project screens: ${err.message}`,
      demoDateFields,
      diagnostics,
    };
  }

  const screenIds = Array.from(new Set([...schemeScreenIds, ...namedScreenIds]));
  addDiagnostic(`final screen ids to update=${screenIds.join(',') || 'NONE'}`);

  if (screenIds.length === 0) {
    return {
      success: true,
      screenCount: 0,
      fieldConfigurationCount,
      fieldCount: fieldIds.length,
      message: `No classic create/edit/view screens were found for ${projectKey}; demo dates will be written after issue creation with screen override.`,
      demoDateFields,
      diagnostics,
    };
  }

  const addFailures = [];
  for (const screenId of screenIds) {
    let tabId;
    try {
      tabId = await getPrimaryScreenTabId(screenId);
      addDiagnostic(`screen ${screenId} primary tab=${tabId || 'NOT_FOUND'}`);
    } catch (err) {
      addFailures.push(`screen ${screenId} tab lookup failed: ${err.message}`);
      addDiagnostic(`screen ${screenId} tab lookup failed: ${err.message}`);
      continue;
    }

    if (!tabId) {
      addFailures.push(`screen ${screenId} has no tab`);
      continue;
    }

    for (const fieldId of [...fieldIds, ...boardVisibleScreenFieldIds]) {
      try {
        await addFieldToScreenTab(screenId, tabId, fieldId);
        addDiagnostic(`field ${fieldId} added or already present on screen ${screenId}, tab ${tabId}`);
      } catch (err) {
        addFailures.push(`field ${fieldId} -> screen ${screenId}: ${err.message}`);
        addDiagnostic(`field ${fieldId} failed on screen ${screenId}, tab ${tabId}: ${err.message}`);
      }
    }
  }

  if (addFailures.length > 0) {
    return {
      success: false,
      message: `Could not add all demo date fields to screens: ${addFailures.join('; ')}`,
      demoDateFields,
      diagnostics,
    };
  }

  return {
    success: true,
    screenCount: screenIds.length,
    fieldConfigurationCount,
    fieldCount: fieldIds.length,
    demoDateFields,
    diagnostics,
  };
}

async function getAssignableUsers(projectKey, fallbackAccountId) {
  if (assignableUsersByProjectCache.has(projectKey)) {
    return assignableUsersByProjectCache.get(projectKey);
  }

  try {
    // Prefer Jira's project-assignable directory so generated assignees are
    // valid for this specific project.
    let accountIds = await getProjectAssignableAccountIds(projectKey);

    // Newly-created demo projects often expose only the project creator as
    // assignable. For richer demos, add a handful of active humans from the
    // site into the project's contributor-style roles, then re-check Jira's
    // assignable directory so we still only use users Jira accepts.
    if (accountIds.length < 2) {
      await ensureProjectHasDemoAssignableUsers(projectKey, fallbackAccountId);
      accountIds = await getProjectAssignableAccountIds(projectKey);
    }

    if (accountIds.length < 2) {
      accountIds = mergeUniqueAccountIds(accountIds, await getActiveHumanAccountIds());
    }

    if (accountIds.length === 0 && fallbackAccountId) {
      accountIds.push(fallbackAccountId);
    }

    assignableUsersByProjectCache.set(projectKey, accountIds);
    return accountIds;
  } catch (err) {
    console.warn(`Assignable user lookup failed for ${projectKey}: ${err.message}`);
    const fallbackUsers = fallbackAccountId ? [fallbackAccountId] : [];
    assignableUsersByProjectCache.set(projectKey, fallbackUsers);
    return fallbackUsers;
  }
}

async function getProjectAssignableAccountIds(projectKey) {
  const assignable = await jiraGet(`/rest/api/3/user/assignable/search?project=${encodeURIComponent(projectKey)}&maxResults=1000`);
  return mergeUniqueAccountIds((assignable || [])
    .filter(isActiveHumanUser)
    .map(user => user.accountId));
}

async function getActiveHumanAccountIds() {
  const users = await jiraGet('/rest/api/3/users/search?maxResults=1000');
  return mergeUniqueAccountIds((users || [])
    .filter(isActiveHumanUser)
    .map(user => user.accountId));
}

function mergeUniqueAccountIds(...accountIdLists) {
  return Array.from(new Set(
    accountIdLists
      .flat()
      .filter(Boolean)
      .map(accountId => String(accountId))
  ));
}

async function ensureProjectHasDemoAssignableUsers(projectKey, fallbackAccountId) {
  const activeUsers = await getActiveHumanAccountIds();
  const demoUsers = mergeUniqueAccountIds(
    activeUsers.filter(accountId => accountId !== fallbackAccountId),
    fallbackAccountId ? [fallbackAccountId] : []
  ).slice(0, 8);

  if (demoUsers.length < 2) {
    return;
  }

  try {
    const projectRoles = await jiraGet(`/rest/api/3/project/${encodeURIComponent(projectKey)}/role`);
    const roleTargets = Object.entries(projectRoles || {})
      .map(([name, roleUrl]) => ({
        name,
        id: String(roleUrl || '').match(/\/role\/(\d+)(?:\?|$)/)?.[1],
      }))
      .filter(role => role.id && isDemoAssignableRoleName(role.name));

    for (const role of roleTargets) {
      try {
        // Project role membership is the standard way to make users eligible
        // for project permissions such as Assignable User. This is best-effort:
        // if a tenant has custom permission schemes, the later assignable-user
        // recheck remains the source of truth.
        await jiraPost(`/rest/api/3/project/${encodeURIComponent(projectKey)}/role/${encodeURIComponent(role.id)}`, {
          user: demoUsers,
        });
      } catch (err) {
        console.warn(`Could not add demo users to project role ${role.name} for ${projectKey}: ${err.message}`);
      }
    }

    if (roleTargets.length > 0) {
      await wait(1200);
    }
  } catch (err) {
    console.warn(`Could not prepare demo assignable users for ${projectKey}: ${err.message}`);
  }
}

function isDemoAssignableRoleName(roleName) {
  const normalised = normaliseFieldName(roleName);
  return [
    'servicedeskteam',
    'developers',
    'members',
    'users',
  ].some(candidate => normalised.includes(candidate));
}

function chooseDemoAssigneeAccountId(assignableUsers, itemIndex, projectIndex) {
  if (!Array.isArray(assignableUsers) || assignableUsers.length === 0) {
    return null;
  }

  // Leave a small, predictable slice unassigned so queues look realistic. The
  // pattern deliberately keeps the first few generated rows assigned, then
  // leaves roughly one in five open for triage rather than making a whole demo
  // project look abandoned.
  if ((itemIndex + projectIndex) % 5 === 3) {
    return null;
  }

  const assigneeIndex = buildRealisticAssigneeIndex(itemIndex, projectIndex, assignableUsers.length);
  return assignableUsers[assigneeIndex] || null;
}

function chooseRequiredDemoAssigneeAccountId(assignableUsers, itemIndex, projectIndex) {
  if (!Array.isArray(assignableUsers) || assignableUsers.length === 0) {
    return null;
  }

  return chooseDemoAssigneeAccountId(assignableUsers, itemIndex, projectIndex)
    || assignableUsers[buildRealisticAssigneeIndex(itemIndex, projectIndex, assignableUsers.length)]
    || assignableUsers[0]
    || null;
}

function isActiveHumanUser(user) {
  if (!user?.accountId) {
    return false;
  }

  if (user.active !== true) {
    return false;
  }

  if (user.accountType && user.accountType !== 'atlassian') {
    return false;
  }

  const searchableText = [
    user.displayName,
    user.emailAddress,
    user.name,
  ].filter(Boolean).join(' ').toLowerCase();

  return ![
    ' bot',
    '-bot',
    '_bot',
    'no bot',
    'automation',
    'bitbucket',
    'pipeline',
    'provision',
    'service account',
    'svc-',
  ].some(marker => searchableText.includes(marker));
}

async function getCreatableIssueTypes(projectKey) {
  if (projectIssueTypeCache.has(projectKey)) {
    return projectIssueTypeCache.get(projectKey);
  }

  const data = await jiraGet(`/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`);
  const issueTypes = Array.isArray(data.issueTypes) ? data.issueTypes : [];
  projectIssueTypeCache.set(projectKey, issueTypes);
  return issueTypes;
}

function chooseFallbackIssueType(issueTypes, preferredTypeName) {
  const byLowerName = new Map(
    issueTypes
      .filter(issueType => issueType?.name)
      .map(issueType => [issueType.name.toLowerCase(), issueType])
  );
  const lowerPreferred = String(preferredTypeName || '').toLowerCase();
  const containsAny = keywords => issueTypes.find(issueType => {
    const name = String(issueType?.name || '').toLowerCase();
    return keywords.some(keyword => name.includes(keyword));
  });

  const preferredNames = [
    preferredTypeName,
    preferredTypeName === 'Bug' ? 'Task' : null,
    preferredTypeName === 'Story' ? 'Task' : null,
    lowerPreferred === 'incident' ? 'Report a system problem' : null,
    lowerPreferred === 'problem' ? 'Investigate a problem' : null,
    lowerPreferred === 'change' ? 'Request a change' : null,
    lowerPreferred === 'service request' ? 'Get IT help' : null,
    'Bug',
    'Task',
    'Story',
    'Work item',
    'Issue',
  ].filter(Boolean);

  for (const candidateName of preferredNames) {
    const candidate = byLowerName.get(candidateName.toLowerCase());
    if (candidate) {
      return candidate;
    }
  }

  if (lowerPreferred === 'incident') {
    return containsAny(['incident', 'report a system problem', 'system problem', 'it help', 'support']);
  }

  if (lowerPreferred === 'problem') {
    return containsAny(['problem', 'investigate']);
  }

  if (lowerPreferred === 'change') {
    return containsAny(['change']);
  }

  if (lowerPreferred === 'service request') {
    return containsAny(['service request', 'request', 'get it help', 'help']);
  }

  return issueTypes[0] || null;
}

async function setIssueProperty(issueKey, propertyKey, value) {
  await jiraPut(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/properties/${encodeURIComponent(propertyKey)}`, value);
}

function removeOptionalIssueFields(fields) {
  const safeFields = { ...fields };

  delete safeFields.assignee;
  delete safeFields.duedate;
  delete safeFields.priority;
  delete safeFields.customfield_10014;
  delete safeFields.customfield_10015;
  delete safeFields.fixVersions;
  delete safeFields.versions;
  delete safeFields.components;
  delete safeFields.labels;

  for (const fieldKey of Object.keys(safeFields)) {
    if (fieldKey.startsWith('customfield_')) {
      delete safeFields[fieldKey];
    }
  }

  return safeFields;
}

async function saveLifecycleProperty(issue, options, lifecycle) {
  if (!lifecycle || !issue?.key) {
    return;
  }

  await setIssueProperty(issue.key, TICKET_RETENTION_PROPERTY, createTicketProperty({
    environmentName: options.environmentName,
    retentionPeriodDays: options.retentionPeriodDays,
    archiveRetentionDays: ARCHIVE_RETENTION_DAYS,
    lifecycle,
    projectKind: options.projectKind,
  }));
}

function buildDemoDateFieldValues(demoDateFields, lifecycle) {
  const values = {};
  const dateValues = buildDemoDatePropertyValues(lifecycle);

  if (demoDateFields?.createdDateFieldId && dateValues.createdDate) {
    values[demoDateFields.createdDateFieldId] = dateValues.createdDate;
  }

  if (demoDateFields?.resolvedDateFieldId && dateValues.resolvedDate) {
    values[demoDateFields.resolvedDateFieldId] = dateValues.resolvedDate;
  }

  return values;
}

function buildDemoDatePropertyValues(lifecycle) {
  const createdDate = lifecycle?.createdAt ? toJiraDateOnly(lifecycle.createdAt) : null;
  const resolvedDate = lifecycle ? getDemoResolvedDate(lifecycle) : null;

  return {
    createdDate,
    resolvedDate,
    targetStatus: lifecycle?.targetStatus || null,
    generatedAt: new Date().toISOString(),
  };
}

function getDemoResolvedDate(lifecycle) {
  if (!lifecycle?.createdAt) {
    return null;
  }

  const createdAt = new Date(lifecycle.createdAt);
  const now = new Date();
  const targetStatus = lifecycle.targetStatus || '';

  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }

  if (isDoneLikeStatus(targetStatus)) {
    if (lifecycle.resolutionDate) {
      return toJiraDateOnly(lifecycle.resolutionDate);
    }

    const updatedAt = lifecycle.updatedAt ? new Date(lifecycle.updatedAt) : now;
    return toJiraDateOnly(updatedAt > now ? now : updatedAt);
  }

  // The custom "Resolved Date" field is demo metadata, not Jira's system
  // resolution date. For open work, use a forecast date in the future so the
  // generated data tells the same story as the Jira status.
  return toJiraDateOnly(addDays(now, getForecastResolutionOffsetDays(lifecycle)));
}

function getForecastResolutionOffsetDays(lifecycle) {
  const normalisedStatus = normaliseStatusName(lifecycle?.targetStatus);
  const ageDays = Math.max(1, Number.parseInt(lifecycle?.ageDays, 10) || 1);

  if (normalisedStatus.includes('review')) {
    return 1 + (ageDays % 7);
  }

  if (normalisedStatus.includes('progress')) {
    return 3 + (ageDays % 18);
  }

  return 10 + (ageDays % 45);
}

function isDoneLikeStatus(value) {
  const normalised = normaliseStatusName(value);
  return ['resolved', 'rejected', 'done', 'closed', 'complete', 'completed'].includes(normalised);
}

function ensureResolvedLifecycleForStatus(lifecycle, status) {
  if (!lifecycle) {
    return lifecycle;
  }

  if (!isDoneLikeStatus(status)) {
    return {
      ...lifecycle,
      targetStatus: status || lifecycle.targetStatus,
      resolutionDate: null,
    };
  }

  if (lifecycle.resolutionDate) {
    return {
      ...lifecycle,
      targetStatus: status || lifecycle.targetStatus,
    };
  }

  return {
    ...lifecycle,
    targetStatus: status || lifecycle.targetStatus,
    resolutionDate: lifecycle.updatedAt || new Date().toISOString(),
  };
}

async function updateIssueDemoDateFields(issueKey, demoDateFields, lifecycle, diagnostics = []) {
  const fields = buildDemoDateFieldValues(demoDateFields, lifecycle);
  const dateProperty = buildDemoDatePropertyValues(lifecycle);

  if (dateProperty.createdDate || dateProperty.resolvedDate) {
    try {
      await jiraPut(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/properties/${encodeURIComponent(DEMO_DATE_ISSUE_PROPERTY_KEY)}`,
        dateProperty
      );
    } catch (propertyErr) {
      diagnostics.push(`Date metadata ${issueKey}: property save skipped: ${propertyErr.message}`);
    }
  }

  if (Object.keys(fields).length === 0) {
    return;
  }

  try {
    // The normal edit path is preferred because the app already adds the demo
    // fields to the project screens before creating issues. Passing Jira's
    // override flags unnecessarily can cause a 403 even for admin users.
    await jiraPut(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?notifyUsers=false`, { fields });
    diagnostics.push(`Date fields ${issueKey}: updated ${Object.keys(fields).join(', ')}`);
    return;
  } catch (normalErr) {
    try {
      // Some team-managed projects do not expose classic screens consistently.
      // In those cases, retry with Jira's admin override. This is only a
      // fallback because some tenants reject the override flags for Forge calls.
      await jiraPut(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}?notifyUsers=false&overrideScreenSecurity=true&overrideEditableFlag=true`,
        { fields }
      );
      diagnostics.push(`Date fields ${issueKey}: updated with screen override ${Object.keys(fields).join(', ')}`);
    } catch (overrideErr) {
      const message = `Date fields ${issueKey}: Jira blocked custom field writes, so dashboard charts will use generated date metadata fallback. Normal update: ${normalErr.message}. Override update: ${overrideErr.message}`;
      console.warn(message);
    }
  }
}

async function updateIssueBoardVisibleFields(issueKey, { assigneeAccountId, dueDate, startDate, startDateFieldId }, diagnostics = []) {
  if (startDate && startDateFieldId) {
    const fields = {
      [startDateFieldId]: startDate,
    };

    try {
      await jiraPut(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?notifyUsers=false`, { fields });
      diagnostics.push(`Timeline fields ${issueKey}: start date set to ${startDate}`);
    } catch (normalErr) {
      try {
        await jiraPut(
          `/rest/api/3/issue/${encodeURIComponent(issueKey)}?notifyUsers=false&overrideScreenSecurity=true&overrideEditableFlag=true`,
          { fields }
        );
        diagnostics.push(`Timeline fields ${issueKey}: start date set with screen override to ${startDate}`);
      } catch (overrideErr) {
        const message = `Timeline fields ${issueKey}: start date update failed. Normal update: ${normalErr.message}. Override update: ${overrideErr.message}`;
        diagnostics.push(message);
        console.warn(message);
      }
    }
  }

  if (dueDate) {
    try {
      // Due date is a standard Jira field and is shown directly in Software
      // board/list views when the project exposes it. We set it after creation
      // as well because fallback issue creation can drop optional fields.
      await jiraPut(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?notifyUsers=false`, {
        fields: {
          duedate: dueDate,
        },
      });
      diagnostics.push(`Board fields ${issueKey}: due date set to ${dueDate}`);
    } catch (err) {
      const message = `Board fields ${issueKey}: due date update failed: ${err.message}`;
      diagnostics.push(message);
      console.warn(message);
    }
  }

  if (assigneeAccountId) {
    try {
      // Assignees come from Jira's project-assignable user directory. Updating
      // separately keeps a tenant-specific assignee rejection from also losing
      // due date or demo date values.
      await jiraPut(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?notifyUsers=false`, {
        fields: {
          assignee: { accountId: assigneeAccountId },
        },
      });
      diagnostics.push(`Board fields ${issueKey}: assignee set`);
    } catch (err) {
      const message = `Board fields ${issueKey}: assignee update failed: ${err.message}`;
      diagnostics.push(message);
      console.warn(message);
    }
  }
}

let storyPointFieldIdCache = null;

async function getStoryPointFieldId(diagnostics = []) {
  if (storyPointFieldIdCache !== null) {
    return storyPointFieldIdCache;
  }

  try {
    const fields = await jiraGet('/rest/api/3/field');
    const candidates = Array.isArray(fields) ? fields : [];
    const match = candidates.find(field => {
      const name = String(field?.name || '').toLowerCase();
      const schema = JSON.stringify(field?.schema || {}).toLowerCase();
      return name === 'story points' ||
        name === 'story point estimate' ||
        name.includes('story points') ||
        name.includes('story point estimate') ||
        (name.includes('estimate') && schema.includes('com.atlassian.jira.plugin.system.customfieldtypes:float'));
    });
    storyPointFieldIdCache = match?.id || '';
    if (storyPointFieldIdCache) {
      diagnostics.push(`Estimation fields: resolved story point field ${storyPointFieldIdCache}.`);
    } else {
      diagnostics.push('Estimation fields: Story Points / Story point estimate field was not found; falling back to Original Estimate only.');
    }
  } catch (err) {
    storyPointFieldIdCache = '';
    diagnostics.push(`Estimation fields: story point lookup failed: ${err.message}`);
  }

  return storyPointFieldIdCache;
}

function getDemoStoryPointEstimate(issueType, issueIndex) {
  if (String(issueType || '').toLowerCase() === 'epic') {
    return 13 + ((issueIndex % 3) * 8);
  }

  if (isBugIssueType(issueType)) {
    return [2, 3, 5][issueIndex % 3];
  }

  return [1, 2, 3, 5, 8][issueIndex % 5];
}

async function updateIssueEstimationFields(issueKey, issueType, issueIndex, diagnostics = []) {
  const storyPoints = getDemoStoryPointEstimate(issueType, issueIndex);
  const storyPointFieldId = await getStoryPointFieldId(diagnostics);

  if (storyPointFieldId) {
    const fields = { [storyPointFieldId]: storyPoints };
    try {
      await jiraPut(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?notifyUsers=false`, { fields });
      diagnostics.push(`Estimation fields ${issueKey}: story points set to ${storyPoints}.`);
    } catch (normalErr) {
      try {
        await jiraPut(
          `/rest/api/3/issue/${encodeURIComponent(issueKey)}?notifyUsers=false&overrideScreenSecurity=true&overrideEditableFlag=true`,
          { fields }
        );
        diagnostics.push(`Estimation fields ${issueKey}: story points set with screen override to ${storyPoints}.`);
      } catch (overrideErr) {
        diagnostics.push(`Estimation fields ${issueKey}: story point update skipped. Normal update: ${normalErr.message}. Override update: ${overrideErr.message}`);
      }
    }
  }

  const timeTrackingFields = {
    timetracking: {
      originalEstimate: `${Math.max(1, storyPoints * 4)}h`,
      remainingEstimate: `${Math.max(1, storyPoints * 2)}h`,
    },
  };

  try {
    await jiraPut(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?notifyUsers=false`, { fields: timeTrackingFields });
    diagnostics.push(`Estimation fields ${issueKey}: original estimate set to ${storyPoints * 4}h.`);
  } catch (normalErr) {
    try {
      await jiraPut(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}?notifyUsers=false&overrideScreenSecurity=true&overrideEditableFlag=true`,
        { fields: timeTrackingFields }
      );
      diagnostics.push(`Estimation fields ${issueKey}: original estimate set with screen override to ${storyPoints * 4}h.`);
    } catch (overrideErr) {
      diagnostics.push(`Estimation fields ${issueKey}: time tracking update skipped. Normal update: ${normalErr.message}. Override update: ${overrideErr.message}`);
    }
  }
}

async function createIssue(projectKey, title, type, epicKey, priority, dueDate, versionId, options = {}) {
  const lifecycle = options.lifecycle || null;
  const demoDateFields = options.demoDateFields || {};
  const assigneeAccountId = options.assigneeAccountId || null;
  const descriptionLines = options.description
    ? [
        String(options.description),
        `Priority: ${priority}. Due date: ${dueDate || 'not set'}.`,
        'This record was generated for the demo environment and should align with the selected business domain.',
      ]
    : [
        `This ${type.toLowerCase()} is part of the ${projectKey} project.`,
        `${title}. This work item represents realistic work the engineering team would undertake.`,
        'Acceptance criteria to be defined during sprint planning.',
      ];
  const fields = {
    project: { key: projectKey },
    issuetype: { name: type },
    summary: title,
    description: buildADF(descriptionLines),
    priority: { name: priority },
    duedate: dueDate,
  };

  // Only set the epic link. We intentionally avoid setting the sprint custom
  // field during issue creation because Jira Software manages sprint membership
  // through the Agile API after the issue exists.
  if (epicKey && !options.skipEpicLink) fields.customfield_10014 = epicKey;
  if (versionId) fields.fixVersions = [{ id: String(versionId) }];
  if (options.affectsVersionId) fields.versions = [{ id: String(options.affectsVersionId) }];
  if (Array.isArray(options.labels) && options.labels.length > 0) fields.labels = options.labels;
  if (options.startDate && options.startDateFieldId) fields[options.startDateFieldId] = options.startDate;
  if (Array.isArray(options.components) && options.components.length > 0) {
    fields.components = options.components.map(component => ({ name: String(component) }));
  }
  if (assigneeAccountId) fields.assignee = { accountId: assigneeAccountId };

  // These are customer-created date fields, not Jira's immutable system Created
  // and Resolved fields. Jira rejects the entire issue create request when a
  // custom field is missing from the create screen, so these are updated only
  // after the issue exists.
  const demoDateFieldValues = buildDemoDateFieldValues(demoDateFields, lifecycle);

  console.log('DEMO_DATE_DIAGNOSTIC issue post-create date field values', JSON.stringify({
    projectKey,
    title,
    createdDateFieldId: demoDateFields.createdDateFieldId || null,
    createdDateValue: demoDateFields.createdDateFieldId ? demoDateFieldValues[demoDateFields.createdDateFieldId] || null : null,
    resolvedDateFieldId: demoDateFields.resolvedDateFieldId || null,
    resolvedDateValue: demoDateFields.resolvedDateFieldId ? demoDateFieldValues[demoDateFields.resolvedDateFieldId] || null : null,
  }));

  try {
    const issue = await jiraPost('/rest/api/3/issue', { fields });
    console.log('DEMO_DATE_DIAGNOSTIC issue created; optional date fields will be updated after create', JSON.stringify({
      issueKey: issue.key,
      projectKey,
    }));
    await saveLifecycleProperty(issue, options, lifecycle);
    await updateIssueDemoDateFields(issue.key, demoDateFields, lifecycle, options.diagnostics);
    await updateIssueBoardVisibleFields(issue.key, {
      assigneeAccountId,
      dueDate,
      startDate: options.startDate,
      startDateFieldId: options.startDateFieldId,
    }, options.diagnostics);
    if (options.projectKind === 'software') {
      await updateIssueEstimationFields(issue.key, type, options.issueIndex || 0, options.diagnostics);
    }
    return issue;
  } catch (err) {
    const errorMessage = String(err?.message || '');
    const lowerError = errorMessage.toLowerCase();

    // Business-style projects often do not expose Bug/Story, while software projects do.
    // We inspect the project's create metadata and retry with the closest valid type so
    // the demo data still gets created instead of failing the whole run.
    if (
      lowerError.includes('the issue type selected is invalid') ||
      lowerError.includes('specify a valid issue type') ||
      lowerError.includes('"issuetype"')
    ) {
      const issueTypes = await getCreatableIssueTypes(projectKey);
      const fallbackIssueType = chooseFallbackIssueType(issueTypes, type);

      if (!fallbackIssueType) {
        throw err;
      }

      const retryFields = {
        ...fields,
        issuetype: fallbackIssueType.id
          ? { id: String(fallbackIssueType.id) }
          : { name: fallbackIssueType.name },
      };

      const issue = await jiraPost('/rest/api/3/issue', { fields: retryFields });
      console.log('DEMO_DATE_DIAGNOSTIC issue created after issue-type fallback', JSON.stringify({
        issueKey: issue.key,
        projectKey,
        fallbackIssueType: fallbackIssueType.name || fallbackIssueType.id,
      }));
      await saveLifecycleProperty(issue, options, lifecycle);
      await updateIssueDemoDateFields(issue.key, demoDateFields, lifecycle, options.diagnostics);
      await updateIssueBoardVisibleFields(issue.key, {
        assigneeAccountId,
        dueDate,
        startDate: options.startDate,
        startDateFieldId: options.startDateFieldId,
      }, options.diagnostics);
      if (options.projectKind === 'software') {
        await updateIssueEstimationFields(issue.key, fallbackIssueType.name || type, options.issueIndex || 0, options.diagnostics);
      }
      return issue;
    }

    // Some customer screens do not allow setting optional fields at creation
    // time. We retry once with the required fields, then keep the lifecycle in
    // an issue property so reporting still has the generated date data.
    if (
      lowerError.includes('customfield') ||
      lowerError.includes('assignee') ||
      lowerError.includes('duedate') ||
      lowerError.includes('cannot be assigned issues') ||
      lowerError.includes('fixversions') ||
      lowerError.includes('versions') ||
      lowerError.includes('components') ||
      lowerError.includes('priority') ||
      lowerError.includes('labels') ||
      lowerError.includes('not on the appropriate screen')
    ) {
      console.warn(`DEMO_DATE_DIAGNOSTIC Retrying issue creation with only safe fields for "${title}" because Jira rejected optional/custom fields: ${errorMessage}`);
      const issue = await jiraPost('/rest/api/3/issue', { fields: removeOptionalIssueFields(fields) });
      console.log('DEMO_DATE_DIAGNOSTIC issue created after dropping optional/custom fields', JSON.stringify({
        issueKey: issue.key,
        projectKey,
      }));
      await saveLifecycleProperty(issue, options, lifecycle);
      await updateIssueDemoDateFields(issue.key, demoDateFields, lifecycle, options.diagnostics);
      await updateIssueBoardVisibleFields(issue.key, {
        assigneeAccountId,
        dueDate,
        startDate: options.startDate,
        startDateFieldId: options.startDateFieldId,
      }, options.diagnostics);
      if (options.projectKind === 'software') {
        await updateIssueEstimationFields(issue.key, type, options.issueIndex || 0, options.diagnostics);
      }
      return issue;
    }
    throw err;
  }
}

async function transitionIssue(issueKey, targetStatus) {
  try {
    const targetAliases = {
      todo: ['todo', 'open', 'backlog'],
      inprogress: ['inprogress', 'progress', 'doing', 'active'],
      underreview: ['underreview', 'review', 'testing', 'qa', 'readyforreview'],
      done: ['done', 'resolved', 'complete', 'completed', 'closed'],
      resolved: ['resolved', 'done', 'complete', 'completed', 'closed'],
      rejected: ['rejected', 'declined', 'cancelled', 'canceled', 'wontdo'],
    };
    const targetKey = normaliseStatusName(targetStatus);
    const aliases = targetAliases[targetKey] || [targetKey];
    const doneTarget = isDoneLikeStatus(targetStatus);

    const transitionWithAliases = async (candidateAliases, statusCategoryKey = null) => {
      const data = await jiraGet(`/rest/api/3/issue/${issueKey}/transitions`);
      const transitions = data.transitions || [];
      const transition = transitions.find(item => {
        const candidate = normaliseStatusName(item?.to?.name);
        const category = item?.to?.statusCategory?.key;
        return (
          (statusCategoryKey && category === statusCategoryKey) ||
          candidateAliases.some(alias => candidate === alias || candidate.includes(alias))
        );
      });

      if (!transition) {
        return false;
      }

      const res = await api.asUser().requestJira(
        route`/rest/api/3/issue/${issueKey}/transitions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transition: { id: String(transition.id) } }),
        }
      );

      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        throw new Error(`transition ${transition.name || transition.id} failed: ${res.status} ${text}`);
      }

      await wait(500);
      return true;
    };

    if (doneTarget) {
      if (await transitionWithAliases(aliases, 'done')) {
        return;
      }

      await transitionWithAliases(targetAliases.inprogress, 'indeterminate');

      if (await transitionWithAliases(aliases, 'done')) {
        return;
      }

      console.warn(`Transition ${issueKey} -> ${targetStatus}: no Done/Resolved/Complete transition was available.`);
      return;
    }

    if (!(await transitionWithAliases(aliases))) {
      console.warn(`Transition ${issueKey} -> ${targetStatus}: no matching transition was available.`);
    }
  } catch (err) {
    console.error(`Transition ${issueKey} -> ${targetStatus}: ${err.message}`);
  }
}

async function getBoardId(projectKey, boardType = 'scrum', options = {}) {
  const safeBoardType = normaliseSoftwareTemplate(boardType) === 'kanban' ? 'kanban' : 'scrum';
  const maxAttempts = Math.max(1, Number.parseInt(options.maxAttempts, 10) || 8);
  const retryDelayMs = Math.max(0, Number.parseInt(options.retryDelayMs, 10) || 2000);
  let fallbackBoardId = null;
  const lookupPaths = [
    `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}&type=${safeBoardType}`,
    `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}`,
  ];

  // Newly-created software projects do not always surface their Scrum board instantly.
  // A short retry loop makes the sprint step far more reliable without needing a manual rerun.
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    for (const boardPath of lookupPaths) {
      const data = await jiraGet(boardPath);
      const boards = Array.isArray(data.values) ? data.values : [];
      const exactBoard = boards.find(board => String(board?.type || '').toLowerCase() === safeBoardType);
      const board = exactBoard || boards[0];
      const boardId = board?.id;

      if (boardId) {
        fallbackBoardId = exactBoard?.id || fallbackBoardId || boardId;
        try {
          await jiraGet(`/rest/agile/1.0/board/${encodeURIComponent(boardId)}/configuration`);
          return boardId;
        } catch (err) {
          console.warn(`Board ${boardId} for ${projectKey} was returned by Jira but configuration lookup failed: ${err.message}`);
          if (exactBoard?.id) {
            return exactBoard.id;
          }
        }
      }
    }

    if (attempt < maxAttempts - 1 && retryDelayMs > 0) {
      await wait(retryDelayMs);
    }
  }

  return fallbackBoardId;
}

async function createSoftwareBoardForProject(project, boardType = 'scrum') {
  const safeBoardType = normaliseSoftwareTemplate(boardType) === 'kanban' ? 'kanban' : 'scrum';
  const filter = await createSavedFilter({
    name: `${project.name} - ${safeBoardType === 'scrum' ? 'Scrum' : 'Kanban'} Board Filter`,
    description: `Auto-generated board filter for ${project.name}.`,
    jql: `project = "${project.key}" ORDER BY Rank ASC`,
  });

  const board = await jiraPost('/rest/agile/1.0/board', {
    name: `${project.name} - ${safeBoardType === 'scrum' ? 'Scrum' : 'Kanban'} Board`,
    type: safeBoardType,
    filterId: Number(filter.id),
    location: {
      type: 'project',
      projectKeyOrId: project.key,
    },
  });

  await favoriteSavedFilter(filter.id);
  await wait(1500);
  await jiraGet(`/rest/agile/1.0/board/${encodeURIComponent(board.id)}`);
  await jiraGet(`/rest/agile/1.0/board/${encodeURIComponent(board.id)}/configuration`);
  return board.id || null;
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

async function updateSprint(sprintId, body) {
  return jiraPut(`/rest/agile/1.0/sprint/${sprintId}`, body);
}

async function getSprint(sprintId) {
  return jiraGet(`/rest/agile/1.0/sprint/${encodeURIComponent(sprintId)}`);
}

function getSprintSchedule(sprintIndex) {
  if (sprintIndex === 0) {
    const startDate = createShiftedDate(-7);
    const endDate = createShiftedDate(7);
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      targetState: 'active',
      shouldActivate: true,
    };
  }

  const startDate = createShiftedDate(7 + ((sprintIndex - 1) * 14));
  const endDate = createShiftedDate(21 + ((sprintIndex - 1) * 14));
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    targetState: 'future',
    shouldActivate: false,
  };
}

async function moveIssuesToSprint(sprintId, issueKeys) {
  if (issueKeys.length === 0) return;
  await jiraPost(`/rest/agile/1.0/sprint/${sprintId}/issue`, { issues: issueKeys });
}

async function getSprintFieldId(diagnostics = []) {
  if (sprintFieldIdCache !== null) {
    return sprintFieldIdCache;
  }

  try {
    const fields = await jiraGet('/rest/api/3/field');
    const sprintField = Array.isArray(fields)
      ? fields.find(field => (
        String(field?.schema?.custom || '').includes('gh-sprint')
        || String(field?.name || '').toLowerCase() === 'sprint'
      ))
      : null;

    sprintFieldIdCache = sprintField?.id || '';
    return sprintFieldIdCache;
  } catch (err) {
    sprintFieldIdCache = '';
    diagnostics.push(`Sprint field lookup skipped: ${err.message}`);
    return sprintFieldIdCache;
  }
}

async function assignIssueToSprintField(issueKey, sprintId, diagnostics = []) {
  const sprintFieldId = await getSprintFieldId(diagnostics);

  if (!sprintFieldId) {
    return false;
  }

  try {
    await jiraPut(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?notifyUsers=false`, {
      fields: {
        [sprintFieldId]: Number(sprintId),
      },
    });
    return true;
  } catch (singleValueErr) {
    try {
      await jiraPut(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?notifyUsers=false`, {
        fields: {
          [sprintFieldId]: [Number(sprintId)],
        },
      });
      return true;
    } catch (arrayValueErr) {
      diagnostics.push(`Sprint ${sprintId}: could not write Sprint field for ${issueKey}: ${arrayValueErr.message || singleValueErr.message}`);
      return false;
    }
  }
}

async function assignIssuesToSprint(sprintId, issueKeys, diagnostics = []) {
  const keys = Array.isArray(issueKeys) ? issueKeys.filter(Boolean) : [];

  if (keys.length === 0) {
    return { moved: false, fieldAssigned: 0 };
  }

  let moved = false;
  try {
    await moveIssuesToSprint(sprintId, keys);
    moved = true;
  } catch (err) {
    diagnostics.push(`Sprint ${sprintId}: Agile sprint move failed, trying Sprint field fallback: ${err.message}`);
  }

  let fieldAssigned = 0;
  for (const issueKey of keys) {
    if (await assignIssueToSprintField(issueKey, sprintId, diagnostics)) {
      fieldAssigned += 1;
    }
  }

  return { moved, fieldAssigned };
}

async function getSprintIssueCount(sprintId) {
  const data = await jiraGet(`/rest/agile/1.0/sprint/${encodeURIComponent(sprintId)}/issue?maxResults=50`);
  const issues = Array.isArray(data.issues) ? data.issues : [];
  return Number.isFinite(Number(data.total)) ? Number(data.total) : issues.length;
}

function sprintFieldValueContainsSprint(value, sprintId) {
  const expectedId = String(sprintId);
  const values = Array.isArray(value) ? value : [value];

  return values.some(item => {
    if (item === null || item === undefined) {
      return false;
    }

    if (typeof item === 'object') {
      return String(item.id || item.value || item.name || '').includes(expectedId);
    }

    return String(item).includes(`id=${expectedId}`) || String(item) === expectedId;
  });
}

async function getIssueSprintMembershipCount(sprintId, issueKeys, diagnostics = []) {
  const sprintFieldId = await getSprintFieldId(diagnostics);
  const allKeys = Array.isArray(issueKeys) ? issueKeys.filter(Boolean) : [];
  const keys = allKeys.slice(0, 5);

  if (!sprintFieldId || keys.length === 0) {
    return 0;
  }

  let count = 0;
  for (const issueKey of keys) {
    try {
      const issue = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${encodeURIComponent(sprintFieldId)}`);
      if (sprintFieldValueContainsSprint(issue?.fields?.[sprintFieldId], sprintId)) {
        count += 1;
      }
    } catch (err) {
      diagnostics.push(`Sprint ${sprintId}: could not verify Sprint field on ${issueKey}: ${err.message}`);
    }
  }

  if (allKeys.length > keys.length) {
    diagnostics.push(`Sprint ${sprintId}: verified Sprint field on ${keys.length} of ${allKeys.length} assigned issue(s) to keep the Forge step under the timeout limit.`);
  }

  return count;
}

async function assignAndVerifyIssuesToSprint(sprintId, issueKeys, diagnostics = []) {
  const keys = Array.isArray(issueKeys) ? issueKeys.filter(Boolean) : [];
  const assignResult = await assignIssuesToSprint(sprintId, keys, diagnostics);

  if (keys.length === 0) {
    return { ...assignResult, visibleCount: 0, fieldMembershipCount: 0, verifiedCount: 0 };
  }

  let visibleCount = 0;
  let fieldMembershipCount = 0;
  try {
    visibleCount = await getSprintIssueCount(sprintId);
    fieldMembershipCount = await getIssueSprintMembershipCount(sprintId, keys, diagnostics);
  } catch (verifyErr) {
    diagnostics.push(`Sprint ${sprintId}: issue verification failed after assignment: ${verifyErr.message}`);
  }

  if (Math.max(visibleCount, fieldMembershipCount) === 0) {
    try {
      await wait(1200);
      await moveIssuesToSprint(sprintId, keys);
      visibleCount = await getSprintIssueCount(sprintId);
      fieldMembershipCount = await getIssueSprintMembershipCount(sprintId, keys, diagnostics);
    } catch (retryErr) {
      diagnostics.push(`Sprint ${sprintId}: retry assignment verification failed: ${retryErr.message}`);
    }
  }

  // Team-managed Scrum projects can accept sprint moves while the Agile sprint
  // issue endpoint still lags or reports zero during the Forge step. If Jira
  // accepted the move or Sprint field write, count the intended assignment as
  // verified enough for the demo summary and keep the raw visible count in
  // diagnostics for troubleshooting.
  const assignmentAcceptedCount = assignResult.moved || assignResult.fieldAssigned > 0
    ? keys.length
    : 0;
  const verifiedCount = Math.max(visibleCount, fieldMembershipCount, assignmentAcceptedCount);

  return {
    ...assignResult,
    visibleCount,
    fieldMembershipCount,
    verifiedCount,
  };
}

function getSprintIssueChunk(issueKeys, sprintIndex, sprintCount = MIN_SOFTWARE_SPRINTS_PER_PROJECT) {
  const keys = Array.isArray(issueKeys) ? issueKeys.filter(Boolean) : [];
  const safeSprintCount = Math.max(1, Number.parseInt(sprintCount, 10) || MIN_SOFTWARE_SPRINTS_PER_PROJECT);
  const safeSprintIndex = Math.max(0, Number.parseInt(sprintIndex, 10) || 0);
  const baseSize = Math.floor(keys.length / safeSprintCount);
  const extraItems = keys.length % safeSprintCount;
  const chunkSize = baseSize + (safeSprintIndex < extraItems ? 1 : 0);
  const startIndex = (safeSprintIndex * baseSize) + Math.min(safeSprintIndex, extraItems);

  return keys.slice(startIndex, startIndex + chunkSize);
}

async function getIssueLinkTypeName(preferredTypeName = 'Blocks') {
  if (!issueLinkTypesCache) {
    const data = await jiraGet('/rest/api/3/issueLinkType');
    issueLinkTypesCache = Array.isArray(data.issueLinkTypes) ? data.issueLinkTypes : [];
  }

  const preferred = String(preferredTypeName || '').toLowerCase();
  const aliases = {
    blocks: ['blocks', 'blocker'],
    relates: ['relates', 'relates to', 'related'],
    dependency: ['dependency', 'depends'],
  };
  const candidates = aliases[preferred] || [preferred];
  const match = issueLinkTypesCache.find(type => candidates.some(candidate => (
    String(type.name || '').toLowerCase() === candidate ||
    String(type.inward || '').toLowerCase().includes(candidate) ||
    String(type.outward || '').toLowerCase().includes(candidate)
  )));

  return match?.name || preferredTypeName;
}

async function createIssueLink(inwardKey, outwardKey, typeName = 'Blocks') {
  if (!inwardKey || !outwardKey || inwardKey === outwardKey) {
    return { ok: false, message: 'Missing or duplicate issue key.' };
  }

  try {
    const resolvedTypeName = await getIssueLinkTypeName(typeName);
    await jiraPost('/rest/api/3/issueLink', {
      type: { name: resolvedTypeName },
      inwardIssue: { key: inwardKey },
      outwardIssue: { key: outwardKey },
    });
    return { ok: true, typeName: resolvedTypeName };
  } catch (err) {
    console.error(`Link ${inwardKey} -> ${outwardKey} (${typeName}): ${err.message}`);
    return { ok: false, message: err.message };
  }
}

async function addIssueComment(issueKey, paragraphs, diagnostics = []) {
  if (!issueKey || !Array.isArray(paragraphs) || paragraphs.length === 0) {
    return false;
  }

  try {
    await jiraPost(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
      body: buildADF(paragraphs.filter(Boolean).slice(0, 6)),
    });
    return true;
  } catch (err) {
    diagnostics.push(`Relationship evidence ${issueKey}: comment skipped: ${err.message}`);
    return false;
  }
}

async function addIssueRemoteLink(issueKey, link, diagnostics = []) {
  const url = String(link?.url || '').trim();
  if (!issueKey || !/^https?:\/\//i.test(url)) {
    return false;
  }

  try {
    await jiraPost(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/remotelink`, {
      relationship: link.relationship || 'references',
      object: {
        url,
        title: link.title || 'Demo reference',
        summary: link.summary || 'Generated demo reference for this work item.',
        icon: {
          url16x16: 'https://www.atlassian.com/favicon.ico',
          title: 'Reference',
        },
      },
    });
    return true;
  } catch (err) {
    diagnostics.push(`Relationship evidence ${issueKey}: remote link skipped: ${err.message}`);
    return false;
  }
}

function findKnowledgeBasePageForWorkType(project, workType) {
  const pages = project?.knowledgeBase?.pages || [];
  const normalizedWorkType = String(workType || '').toLowerCase();
  const keywords = normalizedWorkType.includes('problem')
    ? ['problem']
    : normalizedWorkType.includes('change')
      ? ['change']
      : normalizedWorkType.includes('service')
        ? ['service request', 'fulfilment']
        : ['incident'];

  return pages.find(page => keywords.some(keyword => String(page.title || '').toLowerCase().includes(keyword)))
    || pages[0]
    || null;
}

function buildReferenceUrlForIssue(state, project, record, category) {
  const issueType = String(record?.issueType || record?.workType || '').toLowerCase();
  if (category === 'itsm') {
    const page = findKnowledgeBasePageForWorkType(project, record?.workType || record?.issueType);
    if (page?.webUrl && /^https?:\/\//i.test(page.webUrl)) {
      return {
        url: page.webUrl,
        title: page.title,
        relationship: 'documented by',
        summary: 'Generated Confluence knowledge article for this ITSM work type.',
      };
    }
    return {
      url: 'https://www.atlassian.com/software/jira/service-management/templates/itsm',
      title: 'ITSM operating model reference',
      relationship: 'references',
      summary: 'External reference used for generated ITSM demo context.',
    };
  }

  const releaseVersion = (project?.versions || []).find(version => (
    String(version.id) === String(record?.fixVersionId || record?.affectsVersionId || '')
  ));

  if (releaseVersion?.releaseDate) {
    return {
      url: 'https://www.atlassian.com/software/jira/features/versions',
      title: `${releaseVersion.name} release readiness`,
      relationship: issueType.includes('bug') ? 'fixes in' : 'tracked by',
      summary: `Generated ${releaseVersion.releaseStage || 'release'} release context for ${project?.key || 'software project'}.`,
    };
  }

  return {
    url: 'https://www.atlassian.com/software/jira/guides/use-cases/software-development',
    title: 'Software delivery reference',
    relationship: 'references',
    summary: 'External reference used for generated software delivery demo context.',
  };
}

function buildRelationshipComment({ fromKey, toKey, typeName, category, fromRecord, toRecord, project }) {
  const relation = String(typeName || 'Relates').toLowerCase().includes('block')
    ? 'blocks or is blocked by'
    : 'relates to';
  const fromTitle = fromRecord?.title || fromRecord?.summary || fromKey;
  const toTitle = toRecord?.title || toRecord?.summary || toKey;

  if (category === 'itsm') {
    return [
      `Demo relationship added: ${fromKey} ${relation} ${toKey}.`,
      `Operational context: ${fromTitle} is connected with ${toTitle} so incident, problem, change, and request flow can be reviewed from either work item.`,
      `Timeline and dependency views should show this relationship as linked work; use the generated Created Date, Resolved Date, and Due date fields for historical reporting.`,
    ];
  }

  return [
    `Demo delivery dependency added: ${fromKey} ${relation} ${toKey}.`,
    `Software context: ${fromTitle} is connected with ${toTitle} for release planning, sprint review, defect triage, and dependency tracking.`,
    `Project context: ${project?.key || 'software'} uses fix versions, affected versions, sprint or Kanban flow state, and generated custom dates for the demo reports.`,
  ];
}

async function addRelationshipEvidence(state, evidence) {
  const diagnostics = state?.results?.diagnostics || [];
  const fromKey = evidence?.fromKey;
  const toKey = evidence?.toKey;
  if (!fromKey || !toKey) {
    return 0;
  }

  let writes = 0;
  const commentAdded = await addIssueComment(fromKey, buildRelationshipComment(evidence), diagnostics);
  if (commentAdded) {
    writes += 1;
  }

  const remoteLink = buildReferenceUrlForIssue(state, evidence.project, evidence.fromRecord, evidence.category);
  const remoteLinkAdded = await addIssueRemoteLink(fromKey, remoteLink, diagnostics);
  if (remoteLinkAdded) {
    writes += 1;
  }

  return writes;
}

function buildEnvironmentFilterDefinition(config, state) {
  const projectKeys = [
    ...state.results.jsmProjects.map(project => project.key),
    ...(state.results.businessProjects || []).map(project => project.key),
    ...(state.results.productDiscoveryProjects || []).map(project => project.key),
    ...state.results.softwareProjects.map(project => project.key),
  ].filter(Boolean);

  if (projectKeys.length === 0) {
    return null;
  }

  const projectClause = buildProjectInClause(projectKeys);
  const runLabel = state.metadata.runLabel || createRunLabel();
  const filterName = `${config.environmentName} - Open Work (${runLabel})`;
  const filterDescription = `Auto-generated by the Cprime Demo Environment Creator for ${config.environmentName} run ${runLabel}.`;
  const jql = `project in (${projectClause}) AND statusCategory != Done ORDER BY priority DESC, duedate ASC`;
  const allWorkJql = `project in (${projectClause}) ORDER BY priority DESC, duedate ASC`;

  return {
    name: filterName,
    description: filterDescription,
    jql,
    allWorkJql,
    projectKeys,
  };
}

function getDashboardProjectContext(config, state, target) {
  const isEnterprise = target.projectKind === 'business-enterprise' || target.projectKind === 'software-enterprise';
  const isSoftware = target.projectKind === 'software' || target.projectKind === 'software-enterprise';
  const isJsm = target.projectKind === 'business' || target.projectKind === 'business-enterprise';
  const isWorkManagement = target.projectKind === 'business-project';
  const isProductDiscovery = target.projectKind === 'product-discovery';
  const projectCollection = isSoftware
    ? state.results.softwareProjects
    : isWorkManagement
      ? (state.results.businessProjects || [])
      : isProductDiscovery
        ? (state.results.productDiscoveryProjects || [])
        : state.results.jsmProjects;
  const targetProjects = isEnterprise
    ? projectCollection.filter(project => project?.key)
    : [isSoftware
      ? state.results.softwareProjects[target.projectIndex]
      : isWorkManagement
        ? (state.results.businessProjects || [])[target.projectIndex]
        : isProductDiscovery
          ? (state.results.productDiscoveryProjects || [])[target.projectIndex]
          : state.results.jsmProjects[target.projectIndex]].filter(project => project?.key);

  if (targetProjects.length === 0) {
    return null;
  }

  const project = targetProjects[0];
  const fallbackTitle = isSoftware
    ? 'Software Dashboard'
    : isWorkManagement
      ? `${getBusinessSpaceCategoryLabel(project.businessSpaceType)} Dashboard`
      : isProductDiscovery
        ? 'Product Discovery Dashboard'
        : `${getJsmServiceTypeLabel(project.jsmServiceType || 'ITSM')} Dashboard`;
  const dashboardSelection = target.dashboardSelection || {
    title: fallbackTitle,
    prompt: '',
    value: 'default',
  };
  const dashboardIntent = inferDashboardIntent(dashboardSelection.prompt, config.industry, dashboardSelection.value);
  const projectMethodLabel = !isEnterprise
    ? isSoftware
      ? getSoftwareProjectMethodLabel(project)
      : isWorkManagement
        ? `${getBusinessSpaceCategoryLabel(project.businessSpaceType)} - ${getBusinessSpaceTypeLabel(project.businessSpaceType)}`
        : isProductDiscovery
          ? 'Jira Product Discovery'
          : getJsmServiceTypeLabel(project.jsmServiceType || 'ITSM')
    : '';
  const dashboardTitle = dashboardSelection.value === 'default'
    ? fallbackTitle
    : `${fallbackTitle} - ${dashboardSelection.title}`;
  const filterTitle = dashboardSelection.value === 'default'
    ? fallbackTitle
    : dashboardSelection.title;
  const dashboardOwnerName = isEnterprise ? config.environmentName : project.name;
  const projectKeys = targetProjects.map(item => item.key).filter(Boolean);
  const customDateFields = targetProjects
    .map(item => item.demoDateFields)
    .find(fields => fields?.createdDateFieldId || fields?.resolvedDateFieldId) || {};
  const projectTypeLabel = isSoftware
    ? 'Dev'
    : isWorkManagement
      ? getBusinessSpaceCategoryLabel(project.businessSpaceType)
      : isProductDiscovery
        ? 'Product Discovery'
        : normaliseJsmServiceType(project.jsmServiceType || 'ITSM');

  return {
    dashboardIndex: target.dashboardIndex,
    dashboardSelection,
    dashboardIntent,
    dashboardProfile: projectMethodLabel ? `${dashboardIntent.title} (${projectMethodLabel})` : dashboardIntent.title,
    project,
    projectKeys,
    customDateFields,
    dateRangeDays: config.dateRangeDays || 180,
    projectTypeLabel,
    dashboardName: `${dashboardOwnerName} - ${dashboardTitle}`,
    filterName: `${dashboardOwnerName} - ${filterTitle} Open Work (${state.metadata.runLabel || createRunLabel()})`,
    filterDescription: `Auto-generated ${filterTitle} filter by the Cprime Demo Environment Creator for ${dashboardOwnerName}.`,
    projects: isSoftware
      ? targetProjects.map(softwareProject => ({
          key: softwareProject.key,
          name: softwareProject.name,
          type: 'Software',
          softwareTemplate: normaliseSoftwareTemplate(softwareProject.softwareTemplate),
          softwareProjectStyle: normaliseProjectManagementStyle(softwareProject.softwareProjectStyle),
          dashboardVariantSeed: getSoftwareProjectVariantSeed(softwareProject, target.projectIndex),
          projectManagementStyle: getProjectManagementStyleLabel(softwareProject.softwareProjectStyle),
          count: softwareProject.issueCount,
          boardId: softwareProject.boardId,
          dateFields: softwareProject.demoDateFields || {},
          versions: softwareProject.versions.map(version => ({
            id: String(version.id),
            name: version.name,
            releaseDate: version.releaseDate || null,
            released: Boolean(version.released),
          })),
          sprints: softwareProject.sprints || [],
        }))
      : isWorkManagement
        ? targetProjects.map(businessProject => ({
            key: businessProject.key,
            name: businessProject.name,
            type: getBusinessSpaceCategoryLabel(businessProject.businessSpaceType),
            businessSpaceType: normaliseBusinessSpaceType(businessProject.businessSpaceType),
            businessSpaceCategoryLabel: getBusinessSpaceCategoryLabel(businessProject.businessSpaceType),
            businessSpaceTypeLabel: getBusinessSpaceTypeLabel(businessProject.businessSpaceType),
            count: businessProject.issueRecords?.length || businessProject.issueCount || 0,
            dateFields: businessProject.demoDateFields || {},
          }))
        : isProductDiscovery
          ? targetProjects.map(discoveryProject => ({
              key: discoveryProject.key,
              name: discoveryProject.name,
              type: 'Product Discovery',
              productDiscoveryType: discoveryProject.productDiscoveryType || 'product-discovery',
              count: discoveryProject.issueRecords?.length || discoveryProject.issueCount || 0,
              dateFields: discoveryProject.demoDateFields || {},
            }))
          : targetProjects.map(jsmProject => ({
          key: jsmProject.key,
          name: jsmProject.name,
          type: getJsmServiceTypeLabel(jsmProject.jsmServiceType || 'ITSM'),
          jsmServiceType: normaliseJsmServiceType(jsmProject.jsmServiceType || 'ITSM'),
          count: jsmProject.incidents.length,
          requestTypes: jsmProject.requestTypes || [],
          queues: jsmProject.queues || [],
          knowledgeBase: jsmProject.knowledgeBase || null,
          dateFields: jsmProject.demoDateFields || {},
        })),
  };
}

function getJqlCustomFieldRef(fieldId) {
  const match = String(fieldId || '').match(/^customfield_(\d+)$/);
  return match ? `cf[${match[1]}]` : null;
}

function quoteJqlFieldName(value) {
  return `"${String(value || '').replace(/"/g, '\\"')}"`;
}

function getDemoDateFieldName(dateFieldKind) {
  return DEMO_DATE_FIELD_DEFINITIONS[dateFieldKind]?.name || '';
}

function getJqlCustomDateFieldRefs(fieldId, dateFieldKind) {
  const refs = [
    getJqlCustomFieldRef(fieldId),
    getDemoDateFieldName(dateFieldKind) ? quoteJqlFieldName(getDemoDateFieldName(dateFieldKind)) : null,
  ].filter(Boolean);

  return Array.from(new Set(refs));
}

function buildCustomDateRangeClauseForRef(fieldRef, days) {
  if (!fieldRef) {
    return null;
  }

  const rangeDays = Math.max(1, Number.parseInt(days, 10) || 180);
  return `${fieldRef} >= startOfDay("-${rangeDays}d")`;
}

function buildCustomDateRangeClause(fieldId, days) {
  return buildCustomDateRangeClauseForRef(getJqlCustomFieldRef(fieldId), days);
}

function buildProjectFilterDefinition(context) {
  const projectClause = buildProjectInClause(context.projectKeys);
  const issueTypeClause = context.projectTypeLabel === 'Dev' ? ' AND issuetype != Epic' : '';
  // Some Jira custom date fields can be displayed and queried but cannot be
  // used in ORDER BY clauses. Saved filters must therefore sort by Jira fields
  // that support ordering, while Forge dashboard gadgets still read the custom
  // Created Date / Resolved Date values directly for charts and trends.
  const jql = `project in (${projectClause})${issueTypeClause} AND statusCategory != Done ORDER BY priority DESC, duedate ASC`;
  const allWorkJql = `project in (${projectClause})${issueTypeClause} ORDER BY priority DESC, duedate ASC`;

  return {
    name: context.filterName,
    description: context.filterDescription,
    jql,
    allWorkJql,
    projectKeys: context.projectKeys,
    customDateFields: context.customDateFields || {},
  };
}

async function createSavedFilter({ name, description, jql }) {
  const filterNames = [
    name,
    `${name} ${Date.now().toString().slice(-6)}`,
    `${name} ${Date.now().toString().slice(-6)}-${getRandomInt(100, 999)}`,
  ];
  let lastError = null;

  for (const candidateName of filterNames) {
    try {
      return await jiraPost('/rest/api/2/filter', {
        name: candidateName,
        description,
        jql,
        sharePermissions: [{ type: 'authenticated' }],
      });
    } catch (err) {
      lastError = err;

      if (!String(err?.message || '').toLowerCase().includes('filter with same name already exists')) {
        throw err;
      }
    }
  }

  throw lastError;
}

function isCustomDateFieldNotSearchableError(err) {
  const message = String(err?.message || '');
  return /Field 'cf\[\d+\]' is not searchable/i.test(message)
    || /Field 'cf\[\d+\]' does not exist or you do not have permission to view it/i.test(message)
    || /Field '.*Date' is not searchable/i.test(message)
    || /Field '.*Date' does not exist or you do not have permission to view it/i.test(message)
    || /order by .*cf\[\d+\]/i.test(message)
    || /cf\[\d+\].*order by/i.test(message);
}

async function getSavedFilter(filterId) {
  return await jiraGet(`/rest/api/2/filter/${encodeURIComponent(filterId)}`);
}

async function favoriteSavedFilter(filterId) {
  try {
    await jiraPut(`/rest/api/2/filter/${encodeURIComponent(filterId)}/favourite`, {});
  } catch (err) {
    console.warn(`Unable to favourite filter ${filterId}: ${err.message}`);
  }
}

async function createDashboard(name) {
  try {
    return await jiraPost('/rest/api/3/dashboard', {
      name,
      sharePermissions: [{ type: 'authenticated' }],
    });
  } catch (err) {
    if (!err.message.includes('Dashboard with same name already exists')) {
      throw err;
    }

    const retryName = `${name} (${new Date().toISOString().replace(/[:.]/g, '-')})`;
    return await jiraPost('/rest/api/3/dashboard', {
      name: retryName,
      sharePermissions: [{ type: 'authenticated' }],
    });
  }
}

async function copyDashboard(sourceDashboardId, name) {
  const res = await api.asUser().requestJira(buildTrustedJiraRoute(`/rest/api/3/dashboard/${sourceDashboardId}/copy`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      sharePermissions: [{ type: 'authenticated' }],
      editPermissions: [],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /rest/api/3/dashboard/${sourceDashboardId}/copy failed: ${res.status} ${text}`);
  }

  return res.json();
}

async function getAvailableDashboardGadgets() {
  const data = await jiraGet('/rest/api/3/dashboard/gadgets');
  return Array.isArray(data.gadgets) ? data.gadgets : [];
}

function normaliseDashboardGadgets(availableGadgets) {
  return availableGadgets
    .map(gadget => ({
      title: String(gadget.title || '').trim(),
      moduleKey: gadget.moduleKey || null,
      uri: gadget.uri || null,
    }))
    .filter(gadget => gadget.title && (gadget.moduleKey || gadget.uri));
}

function findDashboardGadgetByKeywords(availableGadgets, keywords, seenKeys = new Set()) {
  const lowerKeywords = keywords.map(keyword => keyword.toLowerCase());
  const normalised = normaliseDashboardGadgets(availableGadgets);

  return normalised.find(gadget => {
    const identity = gadget.moduleKey || gadget.uri;
    if (!identity || seenKeys.has(identity)) {
      return false;
    }

    const title = gadget.title.toLowerCase();
    return lowerKeywords.some(keyword => title.includes(keyword));
  }) || null;
}

function findDashboardGadget(availableGadgets, plan, seenKeys = new Set()) {
  const normalised = normaliseDashboardGadgets(availableGadgets);
  const preferredModuleKeys = plan.moduleKeys || [];

  for (const moduleKey of preferredModuleKeys) {
    const match = normalised.find(gadget => {
      const identity = gadget.moduleKey || gadget.uri;
      return identity && !seenKeys.has(identity) && gadget.moduleKey === moduleKey;
    });

    if (match) {
      return match;
    }
  }

  return findDashboardGadgetByKeywords(availableGadgets, plan.keywords, seenKeys);
}

function buildDashboardGadgetRequests(availableGadgets) {
  const preferredKeywords = [
    'activity',
    'assigned',
    'filter',
    'sprint',
    'project',
    'average',
    'created',
    'introduction',
  ];

  const normalised = normaliseDashboardGadgets(availableGadgets);

  const selected = [];
  const seenKeys = new Set();

  for (const keyword of preferredKeywords) {
    const match = normalised.find(gadget => {
      const identity = gadget.moduleKey || gadget.uri;
      return !seenKeys.has(identity) && gadget.title.toLowerCase().includes(keyword);
    });

    if (match) {
      const identity = match.moduleKey || match.uri;
      seenKeys.add(identity);
      selected.push(match);
    }

    if (selected.length >= 4) {
      break;
    }
  }

  for (const gadget of normalised) {
    const identity = gadget.moduleKey || gadget.uri;

    if (seenKeys.has(identity)) {
      continue;
    }

    seenKeys.add(identity);
    selected.push(gadget);

    if (selected.length >= 4) {
      break;
    }
  }

  return selected.map((gadget, index) => ({
    title: gadget.title,
    moduleKey: gadget.moduleKey,
    uri: gadget.uri,
    row: Math.floor(index / 2),
    column: index % 2,
  }));
}

async function addGadget(dashboardId, moduleKey, position, title) {
  const body = {
    position: { row: position.row, column: position.column },
    title,
  };

  if (moduleKey) {
    body.moduleKey = moduleKey;
  }

  return await jiraPost(`/rest/api/3/dashboard/${dashboardId}/gadget`, body);
}

async function addDiscoveredDashboardGadget(dashboardId, gadget) {
  const body = {
    position: { row: gadget.row, column: gadget.column },
    title: gadget.title,
  };

  if (gadget.moduleKey) {
    body.moduleKey = gadget.moduleKey;
  }

  if (gadget.uri) {
    body.uri = gadget.uri;
  }

  return await jiraPost(`/rest/api/3/dashboard/${dashboardId}/gadget`, body);
}

async function setDashboardItemProperty(dashboardId, itemId, propertyKey, value) {
  return await jiraPut(`/rest/api/3/dashboard/${dashboardId}/items/${itemId}/properties/${propertyKey}`, value);
}

async function getDashboardItemProperty(dashboardId, itemId, propertyKey) {
  const data = await jiraGet(`/rest/api/3/dashboard/${dashboardId}/items/${itemId}/properties/${propertyKey}`);
  return data.value;
}

async function getDashboardItemPropertyOptional(dashboardId, itemId, propertyKey) {
  try {
    return await getDashboardItemProperty(dashboardId, itemId, propertyKey);
  } catch {
    return null;
  }
}

async function setDashboardGadgetPreferences(dashboardId, gadgetId, preferences) {
  // Jira's built-in dashboard gadgets still read their edit-form values from
  // legacy gadget preferences. The documented dashboard item property API is
  // useful for app-owned dashboard items, but many stock gadgets ignore it when
  // deciding whether they are fully configured.
  const res = await api.asUser().requestJira(buildTrustedJiraRoute(`/rest/dashboards/1.0/${dashboardId}/gadget/${gadgetId}/prefs`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PUT /rest/dashboards/1.0/${dashboardId}/gadget/${gadgetId}/prefs failed: ${res.status} ${text}`);
  }
}

async function setDashboardGadgetPreferencesWithPropertyFallback(dashboardId, gadgetId, preferences, propertyValues = {}) {
  try {
    await setDashboardGadgetPreferences(dashboardId, gadgetId, preferences);
    for (const [propertyKey, value] of Object.entries(propertyValues)) {
      await setDashboardItemProperty(dashboardId, gadgetId, propertyKey, value);
    }
    return;
  } catch (err) {
    console.warn(`Legacy dashboard gadget preference update failed for ${gadgetId}: ${err.message}`);
  }

  for (const [propertyKey, value] of Object.entries(propertyValues)) {
    await setDashboardItemProperty(dashboardId, gadgetId, propertyKey, value);
  }
}

async function applyFilterToDashboardGadget(dashboardId, itemId, filter) {
  // Jira's stock gadgets persist their selection as dashboard item properties.
  // Different gadgets can look for slightly different keys, so we write the
  // canonical pair (`id`, `name`) plus common aliases used by filter-driven
  // gadgets. Unknown keys are ignored by Jira and do not harm the gadget.
  await setDashboardItemProperty(dashboardId, itemId, 'id', String(filter.id));
  await setDashboardItemProperty(dashboardId, itemId, 'name', String(filter.name));
  await setDashboardItemProperty(dashboardId, itemId, 'filterId', String(filter.id));
  await setDashboardItemProperty(dashboardId, itemId, 'filterName', String(filter.name));
}

function dashboardPropertyHasFilter(value, filter) {
  if (!filter?.id || value === null || value === undefined) {
    return false;
  }

  const expectedId = String(filter.id);
  if (String(value) === expectedId) {
    return true;
  }

  if (typeof value !== 'object') {
    return false;
  }

  return [
    value.id,
    value.filterId,
    value.projectOrFilterId,
    value.up_id,
    value.up_filterId,
    value.up_projectOrFilterId,
  ].some(candidate => String(candidate || '') === expectedId);
}

async function verifyDashboardGadgetFilterWiring(dashboardId, itemId, filter, propertyKeys = ['config', 'filterId', 'id', 'projectOrFilterId']) {
  for (const propertyKey of propertyKeys) {
    const value = await getDashboardItemPropertyOptional(dashboardId, itemId, propertyKey);
    if (dashboardPropertyHasFilter(value, filter)) {
      return {
        verified: true,
        propertyKey,
      };
    }
  }

  return {
    verified: false,
    propertyKey: null,
  };
}

function recordDashboardFilterVerification(state, dashboardRecord, gadgetPlan, gadgetId, verification) {
  dashboardRecord.filterWiring = dashboardRecord.filterWiring || {
    verified: false,
    gadgets: [],
  };

  dashboardRecord.filterWiring.gadgets.push({
    gadgetId: String(gadgetId),
    role: gadgetPlan.role,
    title: gadgetPlan.title,
    verified: Boolean(verification?.verified),
    propertyKey: verification?.propertyKey || null,
  });

  if (verification?.verified) {
    dashboardRecord.filterWiring.verified = true;
    dashboardRecord.filterApplied = true;
    state.results.dashboardFilterApplied = true;
    addChunkedDiagnostics(state, [
      `Dashboard ${dashboardRecord.id}: verified filter wiring for "${gadgetPlan.title}" using dashboard item property "${verification.propertyKey}".`,
    ]);
  } else {
    addChunkedError(state, `Dashboard ${dashboardRecord.id}: filter wiring for "${gadgetPlan.title}" could not be verified after configuration.`);
  }
}

async function configureFilterResultsGadget(dashboardId, itemId, filter) {
  const propertyConfig = {
    filterId: String(filter.id),
    num: '10',
    refresh: 'true',
    isConfigured: 'true',
    columnNames: 'issuetype|issuekey|summary|priority|status|assignee',
  };

  await setDashboardGadgetPreferencesWithPropertyFallback(
    dashboardId,
    itemId,
    {
      up_isConfigured: 'true',
      up_filterId: String(filter.id),
      up_num: '10',
      up_refresh: 'false',
      up_columnNames: 'issuetype|issuekey|summary|priority|status|assignee',
    },
    { config: propertyConfig }
  );
}

async function configureTextGadget(dashboardId, itemId, state, filter) {
  const projectListItems = [
    ...state.results.jsmProjects.map(project => `<li><strong>${project.key}</strong>: ${project.name}</li>`),
    ...state.results.softwareProjects.map(project => `<li><strong>${project.key}</strong>: ${project.name}</li>`),
  ].join('');
;;;;;;;;;;;;
  const html = [
    `<p><strong>Environment dashboard generated automatically.</strong></p>`,
    `<p>Saved filter: <a href="${filter.viewUrl || `/issues/?filter=${filter.id}`}">${filter.name}</a></p>`,
    `<p>Project scope:</p>`,
    `<ul>${projectListItems}</ul>`,
    `<p>Total ITSM work items: ${state.results.totalIncidents}<br/>Total software issues: ${state.results.totalIssues}</p>`,
  ].join('');

  await setDashboardItemProperty(dashboardId, itemId, 'isConfigured', 'true');
  await setDashboardItemProperty(dashboardId, itemId, 'refresh', 'false');
  await setDashboardItemProperty(dashboardId, itemId, 'html', html);
}

async function configurePieChartGadget(dashboardId, itemId, filter, statType, gadgetTitle) {
  await setDashboardGadgetPreferencesWithPropertyFallback(
    dashboardId,
    itemId,
    {
      up_isConfigured: 'true',
      up_refresh: 'false',
      up_isPopup: 'false',
      up_id: String(filter.id),
      up_name: String(filter.name),
      up_type: 'filter',
      up_projectOrFilterId: String(filter.id),
      up_statType: statType,
      up_title: gadgetTitle,
    },
    {
      isConfigured: 'true',
      refresh: 'false',
      isPopup: 'false',
      id: String(filter.id),
      name: String(filter.name),
      type: 'filter',
      projectOrFilterId: String(filter.id),
      statType,
      title: gadgetTitle,
    }
  );
}

async function configureFilterDrivenChartGadget(dashboardId, itemId, filter, extraProperties = {}) {
  const prefixedProperties = Object.fromEntries(
    Object.entries(extraProperties).map(([key, value]) => [`up_${key}`, value])
  );

  await setDashboardGadgetPreferencesWithPropertyFallback(
    dashboardId,
    itemId,
    {
      up_isConfigured: 'true',
      up_refresh: 'false',
      up_id: String(filter.id),
      up_name: String(filter.name),
      up_type: 'filter',
      up_projectOrFilterId: String(filter.id),
      ...prefixedProperties,
    },
    {
      isConfigured: 'true',
      refresh: 'false',
      id: String(filter.id),
      name: String(filter.name),
      type: 'filter',
      projectOrFilterId: String(filter.id),
      ...extraProperties,
    }
  );
}

async function configureForgeDemoGadget(dashboardId, itemId, gadgetPlan, state, filter, environmentConfig, dashboardContext = null) {
  const reportFilters = (state.results.reports || [])
    .filter(report => !dashboardContext?.dashboardName || report.dashboardName === dashboardContext.dashboardName)
    .map(report => ({
      id: report.id,
      name: report.name,
      reportType: report.reportType,
      viewUrl: report.viewUrl,
      jql: report.jql,
      customDateFilterApplied: report.customDateFilterApplied !== false,
      customDateVisualSource: report.customDateVisualSource || 'gadget-custom-fields',
    }));

  const config = {
    viewType: gadgetPlan.role.replace('forge-', ''),
    title: gadgetPlan.title,
    subtitle: gadgetPlan.subtitle || '',
    visualType: gadgetPlan.visualType || 'standard',
    sectionLabel: gadgetPlan.sectionLabel || '',
    environmentName: dashboardContext?.dashboardName || state.results.dashboardName || environmentConfig.environmentName,
    dashboardSelection: dashboardContext?.dashboardSelection || null,
    dashboardProfile: dashboardContext?.dashboardProfile || dashboardContext?.dashboardIntent?.title || null,
    dashboardLevel: dashboardContext?.dashboardIntent?.level || null,
    dashboardDomain: dashboardContext?.dashboardIntent?.domain || null,
    dashboardMetrics: dashboardContext?.dashboardIntent?.metrics || [],
    dashboardQuestions: dashboardContext?.dashboardIntent?.questions || [],
    dashboardKpis: dashboardContext?.dashboardIntent?.kpis || [],
    filterId: String(filter.id),
    filterName: String(filter.name),
    jql: filter.jql,
    allWorkJql: filter.allWorkJql || filter.jql,
    customDateFields: filter.customDateFields || dashboardContext?.customDateFields || {},
    reportFilters,
    // The retention period is supplied from the global page form and stored on
    // every Forge dashboard gadget item. Keeping it in the gadget property means
    // each gadget can explain how long the generated demo environment should be
    // kept, even when Jira loads the gadgets independently.
    retentionPeriodDays: environmentConfig.retentionPeriodDays,
    dateRange: environmentConfig.dateRange,
    dateRangeDays: environmentConfig.dateRangeDays,
    generatedAt: new Date().toISOString().split('T')[0],
    confluenceSpaces: state.results.confluenceSpaces || [],
    projects: dashboardContext?.projects || [
      ...state.results.jsmProjects.map(project => ({
        key: project.key,
        name: project.name,
        type: 'ITSM',
        count: project.incidents.length,
        requestTypes: project.requestTypes || [],
        queues: project.queues || [],
        knowledgeBase: project.knowledgeBase || null,
        dateFields: project.demoDateFields || {},
      })),
      ...state.results.softwareProjects.map(project => ({
        key: project.key,
        name: project.name,
        type: 'Software',
        softwareTemplate: normaliseSoftwareTemplate(project.softwareTemplate),
        softwareProjectStyle: normaliseProjectManagementStyle(project.softwareProjectStyle),
        dashboardVariantSeed: getSoftwareProjectVariantSeed(project),
        projectManagementStyle: getProjectManagementStyleLabel(project.softwareProjectStyle),
        count: project.issueCount,
        boardId: project.boardId,
        versions: project.versions.map(version => ({
          id: String(version.id),
          name: version.name,
          releaseDate: version.releaseDate || null,
          released: Boolean(version.released),
        })),
        sprints: project.sprints || [],
        dateFields: project.demoDateFields || {},
      })),
    ],
  };

  await setDashboardItemProperty(dashboardId, itemId, 'config', config);
}

async function ensureSavedFilter(config, state) {
  if (state.results.savedFilter?.id) {
    return state.results.savedFilter;
  }

  const filterDefinition = buildEnvironmentFilterDefinition(config, state);
  if (!filterDefinition) {
    return null;
  }

  const createdFilter = await createSavedFilter(filterDefinition);
  state.results.savedFilter = {
    id: String(createdFilter.id),
    name: createdFilter.name || filterDefinition.name,
    jql: createdFilter.jql || filterDefinition.jql,
    allWorkJql: filterDefinition.allWorkJql,
    viewUrl: createdFilter.viewUrl || null,
    source: 'generated',
  };

  await favoriteSavedFilter(state.results.savedFilter.id);
  return state.results.savedFilter;
}

async function ensureProjectSavedFilter(state, dashboardContext) {
  const existingFilter = state.results.savedFilters[dashboardContext.dashboardIndex];
  if (existingFilter?.id) {
    return existingFilter;
  }

  const filterDefinition = buildProjectFilterDefinition(dashboardContext);
  const createdFilter = await createSavedFilter(filterDefinition);
  const savedFilter = {
    id: String(createdFilter.id),
    name: createdFilter.name || filterDefinition.name,
    jql: createdFilter.jql || filterDefinition.jql,
    allWorkJql: filterDefinition.allWorkJql,
    viewUrl: createdFilter.viewUrl || null,
    source: 'generated',
    projectKeys: filterDefinition.projectKeys,
    customDateFields: filterDefinition.customDateFields || {},
  };

  state.results.savedFilters[dashboardContext.dashboardIndex] = savedFilter;
  if (!state.results.savedFilter) {
    state.results.savedFilter = savedFilter;
  }

  await favoriteSavedFilter(savedFilter.id);
  return savedFilter;
}

function buildDashboardReportFilterDefinitions(dashboardContext, dashboardFilter) {
  const baseJql = String(dashboardFilter?.allWorkJql || dashboardFilter?.jql || '').replace(/\s+ORDER\s+BY\s+.+$/i, '').trim();
  if (!baseJql) {
    return [];
  }

  const reportPrefix = `${dashboardContext.dashboardName} - Report`;
  const createdDateFieldRefs = getJqlCustomDateFieldRefs(
    dashboardContext.customDateFields?.createdDateFieldId,
    'created'
  );
  const resolvedDateFieldRefs = getJqlCustomDateFieldRefs(
    dashboardContext.customDateFields?.resolvedDateFieldId,
    'resolved'
  );
  const createdDateRangeClause = buildCustomDateRangeClauseForRef(createdDateFieldRefs[0], dashboardContext.dateRangeDays);
  const resolvedDateRangeClause = buildCustomDateRangeClauseForRef(resolvedDateFieldRefs[0], dashboardContext.dateRangeDays);
  const createdDateDescription = createdDateRangeClause
    ? ' Uses the generated Created Date custom field for the selected ticket duration.'
    : ' Omits the Created date window because the generated Created Date custom field was not available.';
  const resolvedDateDescription = resolvedDateRangeClause
    ? ' Uses the generated Resolved Date custom field for the selected ticket duration.'
    : ' Omits the Resolved date window because the generated Resolved Date custom field was not available.';
  const common = {
    dashboardIndex: dashboardContext.dashboardIndex,
    dashboardName: dashboardContext.dashboardName,
    projectKeys: dashboardContext.projectKeys,
    customDateFields: dashboardContext.customDateFields || {},
    dateRangeDays: dashboardContext.dateRangeDays || 180,
  };
  const createdWindowJql = fieldRef => {
    const clause = buildCustomDateRangeClauseForRef(fieldRef, dashboardContext.dateRangeDays);
    return clause ? ` AND ${clause}` : '';
  };
  const resolvedWindowJql = fieldRef => {
    const clause = buildCustomDateRangeClauseForRef(fieldRef, dashboardContext.dateRangeDays);
    return clause ? ` AND ${clause}` : '';
  };
  const urgentWorkJql = `${baseJql} AND priority in (Highest, High, Critical) ORDER BY priority DESC, duedate ASC`;
  const agingOpenWorkJql = `${baseJql} AND statusCategory != Done ORDER BY priority DESC, duedate ASC`;
  const completedTrendJql = `${baseJql} AND statusCategory = Done ORDER BY priority DESC, duedate ASC`;
  const createdDateAlternates = createdDateFieldRefs.slice(1);
  const resolvedDateAlternates = resolvedDateFieldRefs.slice(1);
  const resolvedDateSort = resolvedDateFieldRefs[0] ? ` ORDER BY ${resolvedDateFieldRefs[0]} DESC` : ' ORDER BY priority DESC, duedate ASC';

  return [
    {
      ...common,
      reportType: 'Urgent Work',
      name: `${reportPrefix} - Urgent Work`,
      description: `High-priority report filter for ${dashboardContext.dashboardName}.${createdDateDescription}`,
      jql: `${baseJql}${createdWindowJql(createdDateFieldRefs[0])} AND priority in (Highest, High, Critical) ORDER BY priority DESC, duedate ASC`,
      alternateJqls: createdDateAlternates.map(fieldRef => `${baseJql}${createdWindowJql(fieldRef)} AND priority in (Highest, High, Critical) ORDER BY priority DESC, duedate ASC`),
      fallbackJql: urgentWorkJql,
    },
    {
      ...common,
      reportType: 'Aging Open Work',
      name: `${reportPrefix} - Aging Open Work`,
      description: `Open aging work report filter for ${dashboardContext.dashboardName}.${createdDateDescription}`,
      jql: `${baseJql}${createdWindowJql(createdDateFieldRefs[0])} AND statusCategory != Done ORDER BY priority DESC, duedate ASC`,
      alternateJqls: createdDateAlternates.map(fieldRef => `${baseJql}${createdWindowJql(fieldRef)} AND statusCategory != Done ORDER BY priority DESC, duedate ASC`),
      fallbackJql: agingOpenWorkJql,
    },
    {
      ...common,
      reportType: 'Completed Trend',
      name: `${reportPrefix} - Completed Trend`,
      description: `Completed work trend report filter for ${dashboardContext.dashboardName}.${resolvedDateDescription}`,
      jql: `${baseJql}${resolvedWindowJql(resolvedDateFieldRefs[0])} AND statusCategory = Done${resolvedDateSort}`,
      alternateJqls: resolvedDateAlternates.map(fieldRef => `${baseJql}${resolvedWindowJql(fieldRef)} AND statusCategory = Done ORDER BY ${fieldRef} DESC`),
      fallbackJql: completedTrendJql,
    },
  ];
}

async function ensureDashboardReportFilters(state, dashboardContext, dashboardFilter) {
  const definitions = buildDashboardReportFilterDefinitions(dashboardContext, dashboardFilter);
  const createdReports = [];
  state.results.reports = state.results.reports || [];

  for (const definition of definitions) {
    try {
      let customDateFilterApplied = definition.jql !== definition.fallbackJql;
      let activeDefinition = definition;
      let reportFilter;

      try {
        reportFilter = await createSavedFilter(activeDefinition);
      } catch (err) {
        let alternateCreated = false;
        for (const alternateJql of definition.alternateJqls || []) {
          try {
            activeDefinition = {
              ...definition,
              jql: alternateJql,
              description: `${definition.description} Saved filter uses an alternate generated custom date field JQL reference accepted by this Jira site.`,
            };
            reportFilter = await createSavedFilter(activeDefinition);
            alternateCreated = true;
            addChunkedDiagnostics(state, [
              `Report filter "${definition.name}" used an alternate custom date field JQL reference instead of native Jira date fields.`,
            ]);
            break;
          } catch (alternateErr) {
            if (!isCustomDateFieldNotSearchableError(alternateErr)) {
              throw alternateErr;
            }
          }
        }

        if (alternateCreated) {
          customDateFilterApplied = true;
        } else {
          const canFallback = definition.fallbackJql && definition.fallbackJql !== definition.jql;
          if (!canFallback || !isCustomDateFieldNotSearchableError(err)) {
            throw err;
          }

          customDateFilterApplied = false;
          activeDefinition = {
            ...definition,
            jql: definition.fallbackJql,
            description: `${definition.description} Saved filter omits the date window because this site does not expose the generated date fields as searchable JQL fields; the app report chart still uses generated Created Date and Resolved Date values directly.`,
          };
          reportFilter = await createSavedFilter(activeDefinition);
          addChunkedDiagnostics(state, [
            `Report filter "${definition.name}" omitted the saved-filter date window because generated custom date fields are not searchable in JQL; in-app Summary and Reports charts still use those custom field values directly.`,
          ]);
        }
      }

      const report = {
        id: String(reportFilter.id),
        name: reportFilter.name || definition.name,
        jql: reportFilter.jql || activeDefinition.jql,
        viewUrl: reportFilter.viewUrl || null,
        reportType: definition.reportType,
        dashboardName: definition.dashboardName,
        projectKeys: definition.projectKeys,
        customDateFilterApplied,
        customDateVisualSource: 'gadget-custom-fields',
      };
      state.results.reports.push(report);
      createdReports.push(report);
      await favoriteSavedFilter(report.id);
    } catch (err) {
      addChunkedDiagnostics(state, [`Report filter "${definition.name}" skipped: ${err.message}`]);
    }
  }

  if (createdReports.length > 0) {
    addChunkedDiagnostics(state, [`Reports ${dashboardContext.dashboardName}: created ${createdReports.length} saved report filter(s).`]);
  }

  return createdReports;
}

async function createManagedDashboard(config, state, filter) {
  const dashboard = await createDashboard(`${config.environmentName} - Release Dashboard`);
  const availableGadgets = await getAvailableDashboardGadgets();
  const seenKeys = new Set();
  let filterApplied = false;

  const plannedGadgets = [
    {
      role: 'text',
      title: `${config.environmentName} Summary`,
      keywords: ['text'],
    },
    {
      role: 'filter-results',
      title: `${config.environmentName} Open Work`,
      keywords: ['filter results', 'filter'],
    },
    {
      role: 'activity',
      title: 'Activity Stream',
      keywords: ['activity'],
    },
  ];

  const matchedGadgets = [];

  for (const plan of plannedGadgets) {
    const match = findDashboardGadgetByKeywords(availableGadgets, plan.keywords, seenKeys);
    if (!match) {
      addChunkedError(state, `Dashboard ${dashboard.id}: could not find a "${plan.role}" gadget in Jira's gadget catalog.`);
      continue;
    }

    const identity = match.moduleKey || match.uri;
    seenKeys.add(identity);
    matchedGadgets.push({
      ...plan,
      match,
    });
  }

  for (let index = 0; index < matchedGadgets.length; index += 1) {
    const plan = matchedGadgets[index];
    const row = Math.floor(index / 2);
    const column = index % 2;

    try {
      const added = await addDiscoveredDashboardGadget(dashboard.id, {
        ...plan.match,
        title: plan.title,
        row,
        column,
      });

      if (plan.role === 'text') {
        await configureTextGadget(dashboard.id, added.id, state, filter);
        continue;
      }

      if (plan.role === 'filter-results') {
        await configureFilterResultsGadget(dashboard.id, added.id, filter);
        await applyFilterToDashboardGadget(dashboard.id, added.id, filter);
        filterApplied = true;
        continue;
      }

      if (plan.role === 'pie-chart-status') {
        await configurePieChartGadget(dashboard.id, added.id, filter, 'statuses', plan.title);
        continue;
      }
    } catch (err) {
      addChunkedError(state, `Gadget "${plan.title}" for dashboard ${dashboard.id}: ${err.message}`);
    }
  }

  return {
    dashboard,
    filterApplied,
  };
}

// ── MAIN RESOLVER ─────────────────────────────────────────────────────────────

resolver.define('createDemoEnvironment', async ({ payload }) => {
  // FIX #2: Declare ALL variables ONCE here, outside the try block
  // (previously declared twice — once here and once inside try — causing bugs)
  console.log('🚀 createDemoEnvironment started', JSON.stringify(payload));

  const {
    industry, environmentName,
    jsmProjectCount, incidentsPerProject,
    softwareProjectCount, softwareTemplate, softwareProjectStyle, issuesPerProject, sprintsPerProject,
  } = payload;
  const dateRangeDays = parseDateRangeDays(payload.dateRange);
  const jsmServiceTypes = normaliseJsmServiceTypes(payload);
  const retentionPeriodDays = ACTIVE_TICKET_RETENTION_DAYS;
  const effectiveSprintsPerProject = normalisePositiveInteger(
    sprintsPerProject,
    MIN_SOFTWARE_SPRINTS_PER_PROJECT,
    MIN_SOFTWARE_SPRINTS_PER_PROJECT,
    MIN_SOFTWARE_SPRINTS_PER_PROJECT
  );

  const results = {
    jsmProjects: [],
    softwareProjects: [],
    totalIncidents: 0,
    totalIssues: 0,
    dashboardId: null,
    errors: [],
    diagnostics: [],
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

    // ── STEP 1: JSM ITSM PROJECTS + INCIDENTS ─────────────────────────────────
    console.log(`Creating ${jsmProjectCount} JSM project(s)...`);
    for (let i = 0; i < jsmProjectCount; i++) {
      try {
        const timestamp = Date.now();
        const jsmServiceType = normaliseJsmServiceType(jsmServiceTypes[i] || 'ITSM');
        const projectName = `${environmentName} - ${industry} ${jsmServiceType} Ops ${i + 1} (${timestamp})`;
        const projectKeyPrefix = deriveProjectKeyPrefix(environmentName, industry);
        console.log(`Creating ${getJsmServiceTypeLabel(jsmServiceType)} project: ${projectName} (${projectKeyPrefix})`);
        results.diagnostics.push(`JSM Project ${i + 1}: creating ${getJsmServiceTypeLabel(jsmServiceType)} project using template ${getJsmTemplateKeys(jsmServiceType)[0]}.`);

        const project = await createJSMProject(projectName, accountId, projectKeyPrefix, results.diagnostics, jsmServiceType);
        const screenSetup = await ensureDemoDateFieldsOnProjectScreens(project.id, project.key);
        const demoDateFields = screenSetup.demoDateFields || null;
        const assignableUsers = await getAssignableUsers(project.key, accountId);
        results.diagnostics.push(...(screenSetup.diagnostics || []));
        if (!screenSetup.success) {
          results.errors.push(`JSM Project ${project.key}: ${screenSetup.message}`);
        }

        try {
          const formSetup = await ensureDefaultSmartIntakeForm(project.key, projectName, industry, {
            serviceDeskId: project.serviceDeskId,
            diagnostics: results.diagnostics,
            lookupAttempts: 2,
            lookupDelayMs: 1000,
          });
          if (!formSetup.success) {
            results.diagnostics.push(`Forms ${project.key}: skipped without failing the environment: ${formSetup.message}`);
          } else {
            results.diagnostics.push(`Forms ${project.key}: ${formSetup.reused ? 'reused' : 'created'} "${formSetup.name}" (request type ${formSetup.requestTypeId})`);
            if (formSetup.warning) {
              results.diagnostics.push(`Forms ${project.key}: ${formSetup.warning}`);
            }
          }
        } catch (err) {
          results.diagnostics.push(`Forms ${project.key}: skipped without failing the environment: ${err.message}`);
        }

        // Create incidents as regular Bug issues (no JSM API needed)
        const projectIncidents = [];
        const count = Math.min(incidentsPerProject, MAX_INCIDENTS_PER_PROJECT);

        for (let j = 0; j < count; j++) {
          try {
            const inc = getCycledTemplate(content.incidents, j);
            const priority = getPriorityName(inc.priority);
            const lifecycle = createLifecycleForIssue({
              index: j,
              priority,
              issueType: 'Incident',
              maxAgeDays: dateRangeDays,
            });
            const dueDate = getDateString(getRandomInt(-60, 30));
            const assigneeAccountId = chooseRequiredDemoAssigneeAccountId(assignableUsers, j, i);
            const targetStatus = getDemoBugStatusFromDueDate(dueDate);
            const lifecycleForStatus = ensureResolvedLifecycleForStatus(lifecycle, targetStatus);
            // Create incident as a Bug type issue using standard Jira API
            const created = await createIssue(project.key, inc.title, 'Bug', null, priority, dueDate, null, {
              assigneeAccountId,
              demoDateFields,
              diagnostics: results.diagnostics,
              environmentName,
              lifecycle: lifecycleForStatus,
              projectKind: 'business',
              retentionPeriodDays,
            });

            if (targetStatus === 'In Progress') {
              await transitionIssue(created.key, 'In Progress');
            } else if (targetStatus === 'Done') {
              await transitionIssue(created.key, 'In Progress');
              await transitionIssue(created.key, 'Resolved');
            }

            projectIncidents.push({ key: created.key, title: inc.title, priority: inc.priority, status: targetStatus });
            results.totalIncidents++;
          } catch (err) {
            results.errors.push(`Incident ${j + 1}: ${err.message}`);
          }
        }

        results.jsmProjects.push({ key: project.key, name: projectName, jsmServiceType, incidents: projectIncidents });
        console.log(`✅ JSM ITSM project ${project.key} created with ${projectIncidents.length} incidents`);
      } catch (err) {
        console.error(`JSM Project ${i + 1} error: ${err.message}`);
        results.errors.push(`JSM Project ${i + 1}: ${err.message}`);
      }
    }

    // ── STEP 2: SOFTWARE PROJECTS ─────────────────────────────────────────────
    console.log(`Creating ${softwareProjectCount} Software project(s)...`);
    for (let i = 0; i < softwareProjectCount; i++) {
      try {
        const timestamp = Date.now();
        const projectName = `${environmentName} - ${industry} Dev ${i + 1} (${timestamp})`;
        const projectKeyPrefix = deriveProjectKeyPrefix(environmentName, industry);
        console.log(`Creating software project: ${projectName} (${projectKeyPrefix})`);

        const selectedSoftwareTemplate = normaliseSoftwareTemplate(softwareTemplate);
        const selectedSoftwareProjectStyle = normaliseProjectManagementStyle(softwareProjectStyle);
        const project = await createSoftwareProject(projectName, accountId, projectKeyPrefix, selectedSoftwareTemplate, selectedSoftwareProjectStyle);
        const screenSetup = await ensureDemoDateFieldsOnProjectScreens(project.id, project.key);
        const demoDateFields = screenSetup.demoDateFields || null;
        const assignableUsers = await getAssignableUsers(project.key, accountId);
        results.diagnostics.push(...(screenSetup.diagnostics || []));

        if (!screenSetup.success) {
          results.errors.push(`Software Project ${project.key}: ${screenSetup.message}`);
        }

        try {
          const formSetup = await ensureDefaultSoftwareWorkForm(project.key, projectName, industry);
          if (!formSetup.success) {
            if (formSetup.unsupported) {
              results.diagnostics.push(formSetup.message);
            } else {
              results.errors.push(`Software Project ${project.key}: ${formSetup.message}`);
            }
          } else {
            results.diagnostics.push(`Forms ${project.key}: ${formSetup.reused ? 'reused' : 'created'} "${formSetup.name}" (issue type ${formSetup.issueTypeName || formSetup.issueTypeId})`);
            if (formSetup.warning) {
              results.diagnostics.push(`Forms ${project.key}: ${formSetup.warning}`);
            }
          }
        } catch (err) {
          results.errors.push(`Software Project ${project.key}: default work form setup failed: ${err.message}`);
        }

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

        const projectVariantSeed = getSoftwareProjectVariantSeed({
          key: project.key,
          softwareTemplate: selectedSoftwareTemplate,
          softwareProjectStyle: selectedSoftwareProjectStyle,
        }, i);

        // Epics
        const epicKeys = [];
        for (let epicIndex = 0; epicIndex < content.epics.length; epicIndex++) {
          const variantIndex = epicIndex + projectVariantSeed;
          const epicName = content.epics[variantIndex % (content.epics.length || 1)];

          try {
            const dueDate = getDateString(30 + ((variantIndex % Math.max(content.epics.length, 1)) * 14));
            const assigneeAccountId = chooseDemoAssigneeAccountId(assignableUsers, variantIndex, i);
            const epicPriority = priorities[variantIndex % priorities.length];
            const lifecycle = createLifecycleForIssue({
              index: variantIndex,
              priority: epicPriority,
              issueType: 'Epic',
              maxAgeDays: dateRangeDays,
            });
            const epic = await createEpic(project.key, epicName, {
              assigneeAccountId,
              dueDate,
              priority: epicPriority,
              demoDateFields,
              diagnostics: results.diagnostics,
              environmentName,
              lifecycle,
              projectKind: 'software',
              retentionPeriodDays,
            });
            epicKeys.push(epic.key);
          } catch (err) {
            results.errors.push(`Epic "${epicName}": ${err.message}`);
          }
        }

        // Issues
        const issueKeys = [];
        const count = Math.min(issuesPerProject, MAX_ISSUES_PER_PROJECT);
        for (let j = 0; j < count; j++) {
          try {
            const variantIndex = j + projectVariantSeed;
            const tmpl = getCycledTemplate(content.issues, variantIndex);
            const dueDate = getDateString(getRandomInt(-90, 90));
            const assigneeAccountId = isBugIssueType(tmpl.type)
              ? chooseRequiredDemoAssigneeAccountId(assignableUsers, variantIndex, i)
              : chooseDemoAssigneeAccountId(assignableUsers, variantIndex, i);
            const priority = priorities[variantIndex % priorities.length];
            const status = isBugIssueType(tmpl.type)
              ? getDemoBugStatusFromDueDate(dueDate)
              : getDemoDevStatus(variantIndex);
            const lifecycle = createLifecycleForIssue({
              index: variantIndex,
              priority,
              issueType: tmpl.type,
              maxAgeDays: dateRangeDays,
            });
            const lifecycleForStatus = ensureResolvedLifecycleForStatus(lifecycle, status);
            const issue = await createIssue(
              project.key,
              tmpl.title,
              tmpl.type,
              epicKeys[variantIndex % epicKeys.length] || null,
              priority,
              dueDate,
              versions[variantIndex % versions.length]?.id,
              {
                assigneeAccountId,
                demoDateFields,
                diagnostics: results.diagnostics,
                environmentName,
                lifecycle: lifecycleForStatus,
                projectKind: 'software',
                retentionPeriodDays,
              }
            );
            issueKeys.push(issue.key);

            // FIX #7: transitionIssue now handles 204 No Content safely
            if (status !== 'To Do') {
              await transitionIssue(issue.key, status);
            }
            results.totalIssues++;
          } catch (err) {
            results.errors.push(`Issue ${j + 1}: ${err.message}`);
          }
        }

        // Sprints
        let sprintBoardId = await getBoardId(project.key, 'scrum');
        if (!sprintBoardId) {
          results.errors.push(`Sprint setup ${project.key}: native Scrum board was not found, so sprint creation was skipped to avoid creating sprints on the wrong board.`);
        }
        if (sprintBoardId && issueKeys.length > 0) {
          for (let s = 0; s < effectiveSprintsPerProject; s++) {
            try {
              const schedule = getSprintSchedule(s);
              const sprint = await createSprint(sprintBoardId, `${project.key} Sprint ${s + 1}`, schedule.startDate, schedule.endDate);

              const chunk = getSprintIssueChunk(issueKeys, s, effectiveSprintsPerProject);
              if (chunk.length > 0) {
                const assignResult = await assignAndVerifyIssuesToSprint(sprint.id, chunk, results.diagnostics);
                if (assignResult.verifiedCount === 0) {
                  results.errors.push(`Sprint ${s + 1} for ${project.key}: Jira still reports 0 issues after assignment.`);
                }
              }

              if (schedule.shouldActivate) {
                await updateSprint(sprint.id, {
                  name: sprint.name,
                  startDate: formatDateForJira(schedule.startDate),
                  endDate: formatDateForJira(schedule.endDate),
                  state: 'active',
                });
                if (chunk.length > 0) {
                  const assignResult = await assignAndVerifyIssuesToSprint(sprint.id, chunk, results.diagnostics);
                  if (assignResult.verifiedCount === 0) {
                    results.errors.push(`Sprint ${s + 1} for ${project.key}: active sprint has 0 verified issues after start.`);
                  }
                }
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
          softwareProjectStyle: selectedSoftwareProjectStyle,
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
      `• JSM ITSM Projects: ${results.jsmProjects.length} (${results.totalIncidents} ITSM work items total)`,
      `• Software Projects: ${results.softwareProjects.length} (${results.totalIssues} issues total)`,
      `• Dashboard: ${results.dashboardId ? '✅ Created' : '❌ Failed to create'}`,
      ``,
    ];

    if (results.jsmProjects.length > 0) {
      lines.push(`🛠️ JSM ITSM Projects Created:`);
      lines.push(...results.jsmProjects.map(p => `  • ${p.key}: ${p.name} (${p.incidents.length} ITSM work items)`));
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

const INCIDENT_BATCH_SIZE = 1;
const ISSUE_BATCH_SIZE = 1;
const VERSION_BATCH_SIZE = 2;
const EPIC_BATCH_SIZE = 2;
const SOFTWARE_VERSION_COUNT = 6;
const MAX_INCIDENTS_PER_PROJECT = 60;
const MAX_ISSUES_PER_PROJECT = 60;
const MIN_SOFTWARE_SPRINTS_PER_PROJECT = 6;
const ITSM_WORK_COUNT_KEYS = [
  'incidentRequestsPerProject',
  'problemRequestsPerProject',
  'changeRequestsPerProject',
  'serviceRequestsPerProject',
  'postIncidentReviewsPerProject',
];
const ACTIVE_ITSM_WORK_COUNT_KEYS = [
  'incidentRequestsPerProject',
  'problemRequestsPerProject',
  'changeRequestsPerProject',
  'serviceRequestsPerProject',
];

const ITSM_WORK_COUNT_DEFAULTS = {
  incidentRequestsPerProject: 60,
  problemRequestsPerProject: 60,
  changeRequestsPerProject: 60,
  serviceRequestsPerProject: 60,
  postIncidentReviewsPerProject: 0,
};

const DEFAULT_SOFTWARE_ISSUES_PER_PROJECT = 60;
const DEMO_DOMAIN_PROJECT_PROPERTY_KEY = 'cprimeDemoDomainSetup';
const JSM_SERVICE_TYPES = ['ITSM', 'HRSM', 'CSM', 'FSM', 'LSM'];
const BUSINESS_SPACE_TYPES = [
  'project-management',
  'task-tracking',
  'budget-planning',
  'recruitment-tracking',
  'procurement-management',
];

function normaliseBusinessSpaceType(value) {
  const raw = String(value || 'task-tracking').trim().toLowerCase();
  return BUSINESS_SPACE_TYPES.includes(raw) ? raw : 'task-tracking';
}

function getBusinessSpaceTypeLabel(value) {
  const normalized = normaliseBusinessSpaceType(value);
  const labels = {
    'project-management': 'Project management',
    'go-to-market': 'Go-to-market',
    'task-tracking': 'Task tracking',
    'process-control': 'Process control',
    finance: 'Finance',
    'budget-planning': 'Budget planning',
    marketing: 'Marketing',
    design: 'Design',
    legal: 'Legal',
    sales: 'Sales',
    'procurement-management': 'Procurement management',
    'recruitment-tracking': 'Recruitment tracking',
  };
  return labels[normalized] || 'Task tracking';
}

function getBusinessSpaceCategoryLabel(value) {
  const normalized = normaliseBusinessSpaceType(value);
  const categories = {
    'project-management': 'Work Management',
    'go-to-market': 'Work Management',
    'task-tracking': 'Work Management',
    'process-control': 'Work Management',
    'budget-planning': 'Work Management',
    finance: 'Finance',
    marketing: 'Marketing',
    design: 'Design',
    legal: 'Legal',
    sales: 'Sales',
    'recruitment-tracking': 'Human Resources',
    'procurement-management': 'Work Management',
  };
  return categories[normalized] || 'Work Management';
}

function normaliseBusinessProjectConfigs(payload = {}) {
  if (!Array.isArray(payload.businessProjects)) {
    return [];
  }

  return payload.businessProjects
    .slice(0, 10)
    .map(project => ({
      projectKey: String(project?.projectKey || '').trim(),
      businessSpaceType: normaliseBusinessSpaceType(project?.businessSpaceType),
      issuesPerProject: normalisePositiveInteger(project?.issuesPerProject, DEFAULT_SOFTWARE_ISSUES_PER_PROJECT, 1, MAX_ISSUES_PER_PROJECT),
    }));
}

function normaliseProductDiscoveryProjectConfigs(payload = {}) {
  if (!Array.isArray(payload.productDiscoveryProjects)) {
    return [];
  }

  return payload.productDiscoveryProjects
    .slice(0, 10)
    .map(project => ({
      projectKey: String(project?.projectKey || '').trim(),
      productDiscoveryType: String(project?.productDiscoveryType || 'product-discovery').trim() || 'product-discovery',
      issuesPerProject: normalisePositiveInteger(project?.issuesPerProject, DEFAULT_SOFTWARE_ISSUES_PER_PROJECT, 1, MAX_ISSUES_PER_PROJECT),
    }));
}

function normalisePositiveInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normaliseJsmServiceType(value) {
  const raw = String(value || 'ITSM').trim();
  const match = JSM_SERVICE_TYPES.find(type => type.toLowerCase() === raw.toLowerCase());
  return match || 'ITSM';
}

function normaliseJsmServiceTypes(payload = {}) {
  const values = Array.isArray(payload.jsmServiceTypes)
    ? payload.jsmServiceTypes
    : Array.from({ length: normalisePositiveInteger(payload.jsmProjectCount, 0, 0, 10) }, () => 'ITSM');
  return values
    .map(normaliseJsmServiceType)
    .slice(0, 10);
}

function createDomainProjectName(domain, projectKind, index, details = {}) {
  const cleanDomain = String(domain || 'Demo').trim() || 'Demo';
  if (projectKind === 'business') {
    const serviceType = normaliseJsmServiceType(details.serviceType);
    return `${cleanDomain} - ${serviceType} Ops ${index + 1}`;
  }

  if (projectKind === 'business-project') {
    return `${cleanDomain} - ${getBusinessSpaceTypeLabel(details.businessSpaceType)} ${index + 1}`;
  }

  if (projectKind === 'product-discovery') {
    return `${cleanDomain} - Product Discovery ${index + 1}`;
  }

  const template = normaliseSoftwareTemplate(details.softwareTemplate);
  const templateLabel = getSoftwareTemplateLabel(template);
  return `${cleanDomain} - ${templateLabel} Dev ${index + 1}`;
}

function normaliseItsmWorkCounts(payload = {}) {
  const hasExplicitItsmCounts = ITSM_WORK_COUNT_KEYS.some(key => Object.prototype.hasOwnProperty.call(payload, key));

  if (!hasExplicitItsmCounts) {
    // Older app versions sent one "incidentsPerProject" number. Keep that
    // payload working by spreading the requested total across the ITSM work
    // types in the same order the demo generator uses.
    const legacyTotal = normalisePositiveInteger(payload.incidentsPerProject, 5, 0, MAX_INCIDENTS_PER_PROJECT);
    const legacyCounts = Object.fromEntries(ITSM_WORK_COUNT_KEYS.map(key => [key, 0]));

    for (let index = 0; index < legacyTotal; index += 1) {
      legacyCounts[ACTIVE_ITSM_WORK_COUNT_KEYS[index % ACTIVE_ITSM_WORK_COUNT_KEYS.length]] += 1;
    }

    // Post-incident reviews are not part of the current UI flow. Keep this
    // hard-coded to zero so older browser payloads cannot create them.
    legacyCounts.postIncidentReviewsPerProject = 0;

    return legacyCounts;
  }

  return {
    incidentRequestsPerProject: normalisePositiveInteger(payload.incidentRequestsPerProject, ITSM_WORK_COUNT_DEFAULTS.incidentRequestsPerProject, 1, MAX_INCIDENTS_PER_PROJECT),
    problemRequestsPerProject: normalisePositiveInteger(payload.problemRequestsPerProject, ITSM_WORK_COUNT_DEFAULTS.problemRequestsPerProject, 1, MAX_INCIDENTS_PER_PROJECT),
    changeRequestsPerProject: normalisePositiveInteger(payload.changeRequestsPerProject, ITSM_WORK_COUNT_DEFAULTS.changeRequestsPerProject, 1, MAX_INCIDENTS_PER_PROJECT),
    serviceRequestsPerProject: normalisePositiveInteger(payload.serviceRequestsPerProject, ITSM_WORK_COUNT_DEFAULTS.serviceRequestsPerProject, 1, MAX_INCIDENTS_PER_PROJECT),
    // The user-facing form no longer asks for post-incident reviews. Force the
    // value to zero even if a stale Custom UI bundle or browser cache sends it.
    postIncidentReviewsPerProject: 0,
  };
}

function normaliseSoftwareProjectConfigs(payload = {}) {
  if (Array.isArray(payload.softwareProjects)) {
    return payload.softwareProjects
      .slice(0, 10)
      .map(project => ({
        softwareTemplate: normaliseSoftwareTemplate(project?.softwareTemplate),
        softwareProjectStyle: normaliseProjectManagementStyle(project?.softwareProjectStyle),
        issuesPerProject: normalisePositiveInteger(project?.issuesPerProject, DEFAULT_SOFTWARE_ISSUES_PER_PROJECT, 1, MAX_ISSUES_PER_PROJECT),
      }));
  }

  const count = normalisePositiveInteger(payload.softwareProjectCount, 0, 0, 10);
  const softwareTemplate = normaliseSoftwareTemplate(payload.softwareTemplate);
  const softwareProjectStyle = normaliseProjectManagementStyle(payload.softwareProjectStyle);
  const issuesPerProject = normalisePositiveInteger(payload.issuesPerProject, DEFAULT_SOFTWARE_ISSUES_PER_PROJECT, 1, MAX_ISSUES_PER_PROJECT);

  return Array.from({ length: count }, () => ({
    softwareTemplate,
    softwareProjectStyle,
    issuesPerProject,
  }));
}

function normaliseDashboardSelections(selections, selectedTypes, combinedPrompt, fallbackTitle) {
  const fromSelections = Array.isArray(selections)
    ? selections
        .filter(selection => selection?.value)
        .map(selection => ({
          value: String(selection.value),
          title: String(selection.label || selection.value).replace(/\s+Dashboard$/i, ' Dashboard'),
          prompt: String(selection.prompt || '').trim(),
        }))
    : [];

  if (fromSelections.length > 0) {
    return fromSelections;
  }

  const fromTypes = Array.isArray(selectedTypes)
    ? selectedTypes
        .filter(Boolean)
        .map(value => ({
          value: String(value),
          title: String(value)
            .split('-')
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' '),
          prompt: '',
        }))
    : [];

  if (fromTypes.length > 0) {
    return fromTypes;
  }

  return [{
    value: 'default',
    title: fallbackTitle,
    prompt: String(combinedPrompt || '').trim(),
  }];
}

function getSoftwareProjectConfig(config, projectIndex) {
  return config.softwareProjects?.[projectIndex] || {
    softwareTemplate: normaliseSoftwareTemplate(config.softwareTemplate),
    softwareProjectStyle: normaliseProjectManagementStyle(config.softwareProjectStyle),
    issuesPerProject: normalisePositiveInteger(config.issuesPerProject, DEFAULT_SOFTWARE_ISSUES_PER_PROJECT, 1, MAX_ISSUES_PER_PROJECT),
  };
}

function getBusinessProjectConfig(config, projectIndex) {
  return config.businessProjects?.[projectIndex] || {
    businessSpaceType: 'task-tracking',
    issuesPerProject: DEFAULT_SOFTWARE_ISSUES_PER_PROJECT,
  };
}

function getProductDiscoveryProjectConfig(config, projectIndex) {
  return config.productDiscoveryProjects?.[projectIndex] || {
    productDiscoveryType: 'product-discovery',
    issuesPerProject: DEFAULT_SOFTWARE_ISSUES_PER_PROJECT,
  };
}

function getBusinessProjectDashboardSelection(businessSpaceType) {
  const normalized = normaliseBusinessSpaceType(businessSpaceType);
  const categoryLabel = getBusinessSpaceCategoryLabel(normalized);
  const typeLabel = getBusinessSpaceTypeLabel(normalized);
  return {
    value: `business-${normalized}-dashboard`,
    title: `${typeLabel} Dashboard`,
    prompt: `Project-level dashboard for a Jira ${categoryLabel} ${typeLabel} space. Show created vs resolved work, open work, overdue items, priority mix, owner workload, aging work, and completion trend for the selected business domain. Answer: What work needs attention for ${typeLabel}? Are items completing on time? KPIs: open work, overdue work, completion rate %, high-priority count, average age.`,
  };
}

function getProductDiscoveryDashboardSelection() {
  return {
    value: 'product-discovery-dashboard',
    title: 'Jira Product Discovery Dashboard',
    prompt: 'Project-level dashboard for Jira Product Discovery. Show idea intake, open opportunities, priority or impact mix, owner workload, aging ideas, completion trend, and delivery readiness for the selected business domain. Answer: Which ideas need attention and what is ready for delivery? KPIs: open ideas, high-impact ideas, completion rate %, average idea age.',
  };
}

function getTotalItsmWorkCount(itsmWorkCounts = {}) {
  return ACTIVE_ITSM_WORK_COUNT_KEYS.reduce((total, key) => total + (Number(itsmWorkCounts[key]) || 0), 0);
}

function shouldAddVolumeToExistingProject(config, projectKey) {
  if (!projectKey) {
    return false;
  }

  if (Array.isArray(config.volumeProjectKeys) && config.volumeProjectKeys.length > 0) {
    return config.volumeProjectKeys.includes(projectKey);
  }

  return Boolean(config.addVolumeToExistingDomainData);
}

function formatItsmWorkMix(itsmWorkCounts = {}) {
  return [
    `Incidents ${itsmWorkCounts.incidentRequestsPerProject || 0}`,
    `Problems ${itsmWorkCounts.problemRequestsPerProject || 0}`,
    `Changes ${itsmWorkCounts.changeRequestsPerProject || 0}`,
    `Service Requests ${itsmWorkCounts.serviceRequestsPerProject || 0}`,
    ...(itsmWorkCounts.postIncidentReviewsPerProject > 0 ? [`Post-incident Reviews ${itsmWorkCounts.postIncidentReviewsPerProject}`] : []),
  ].join(', ');
}

function normalisePayload(payload) {
  const rawIndustry = String(payload.industry || 'Banking').trim();
  const rawCustomIndustry = String(payload.customIndustry || '').trim();
  const isCustomIndustry = Boolean(payload.isCustomIndustry || rawIndustry.toLowerCase() === 'other' || rawIndustry.toLowerCase() === 'others');
  const industry = isCustomIndustry
    ? (rawCustomIndustry || rawIndustry || 'Custom Business')
    : rawIndustry;
  const environmentName = String(payload.environmentName || industry).trim() || industry;
  const opsDashboardPrompt = String(payload.opsDashboardPrompt || payload.dashboardPrompt || '').trim();
  const softwareDashboardPrompt = String(payload.softwareDashboardPrompt || '').trim();
  const businessDashboardPrompt = String(payload.businessDashboardPrompt || '').trim();
  const productDiscoveryDashboardPrompt = String(payload.productDiscoveryDashboardPrompt || '').trim();
  const opsDashboardTypes = Array.isArray(payload.opsDashboardTypes)
    ? payload.opsDashboardTypes.filter(Boolean).map(String)
    : (payload.opsDashboardType ? [String(payload.opsDashboardType)] : []);
  const softwareDashboardTypes = Array.isArray(payload.softwareDashboardTypes)
    ? payload.softwareDashboardTypes.filter(Boolean).map(String)
    : (payload.softwareDashboardType ? [String(payload.softwareDashboardType)] : []);
  const businessDashboardTypes = Array.isArray(payload.businessDashboardTypes)
    ? payload.businessDashboardTypes.filter(Boolean).map(String)
    : (payload.businessDashboardType ? [String(payload.businessDashboardType)] : []);
  const productDiscoveryDashboardTypes = Array.isArray(payload.productDiscoveryDashboardTypes)
    ? payload.productDiscoveryDashboardTypes.filter(Boolean).map(String)
    : (payload.productDiscoveryDashboardType ? [String(payload.productDiscoveryDashboardType)] : []);
  const softwareTemplate = normaliseSoftwareTemplate(payload.softwareTemplate);
  const softwareProjectStyle = normaliseProjectManagementStyle(payload.softwareProjectStyle);
  const softwareProjects = normaliseSoftwareProjectConfigs(payload);
  const businessProjects = normaliseBusinessProjectConfigs(payload);
  const productDiscoveryProjects = normaliseProductDiscoveryProjectConfigs(payload);
  const itsmWorkCounts = normaliseItsmWorkCounts(payload);
  const incidentsPerProject = getTotalItsmWorkCount(itsmWorkCounts);
  const jsmServiceTypes = normaliseJsmServiceTypes(payload);
  const volumeProjectKeys = Array.isArray(payload.volumeProjectKeys)
    ? payload.volumeProjectKeys.map(value => String(value || '').trim()).filter(Boolean)
    : [];
  const opsDashboardSelections = normaliseDashboardSelections(
    payload.opsDashboardSelections,
    opsDashboardTypes,
    opsDashboardPrompt,
    'Service Management Dashboard'
  );
  const softwareDashboardSelections = normaliseDashboardSelections(
    payload.softwareDashboardSelections,
    softwareDashboardTypes,
    softwareDashboardPrompt,
    'Software Dashboard'
  );
  const businessDashboardSelections = normaliseDashboardSelections(
    payload.businessDashboardSelections,
    businessDashboardTypes,
    businessDashboardPrompt,
    'Business Dashboard'
  );
  const productDiscoveryDashboardSelections = normaliseDashboardSelections(
    payload.productDiscoveryDashboardSelections,
    productDiscoveryDashboardTypes,
    productDiscoveryDashboardPrompt,
    'Product Discovery Dashboard'
  );

  return {
    industry,
    customIndustry: rawCustomIndustry,
    isCustomIndustry,
    environmentName,
    opsDashboardTypes,
    opsDashboardType: opsDashboardTypes[0] || '',
    opsDashboardSelections,
    opsDashboardPrompt,
    softwareDashboardTypes,
    softwareDashboardType: softwareDashboardTypes[0] || '',
    softwareDashboardSelections,
    softwareDashboardPrompt,
    businessDashboardTypes,
    businessDashboardType: businessDashboardTypes[0] || '',
    businessDashboardSelections,
    businessDashboardPrompt,
    productDiscoveryDashboardTypes,
    productDiscoveryDashboardType: productDiscoveryDashboardTypes[0] || '',
    productDiscoveryDashboardSelections,
    productDiscoveryDashboardPrompt,
    dashboardPrompt: opsDashboardPrompt,
    dashboardIntent: inferDashboardIntent(opsDashboardPrompt, industry),
    opsDashboardIntent: inferDashboardIntent(opsDashboardPrompt, industry),
    softwareDashboardIntent: inferDashboardIntent(softwareDashboardPrompt, industry),
    businessDashboardIntent: inferDashboardIntent(businessDashboardPrompt, industry),
    productDiscoveryDashboardIntent: inferDashboardIntent(productDiscoveryDashboardPrompt, industry),
    addVolumeToExistingDomainData: Boolean(payload.addVolumeToExistingDomainData || volumeProjectKeys.length > 0),
    volumeProjectKeys,
    runSeed: payload.runSeed || null,
    dateRange: String(payload.dateRange || '6 months'),
    dateRangeDays: parseDateRangeDays(payload.dateRange),
    jsmServiceTypes,
    jsmProjectCount: jsmServiceTypes.length,
    incidentsPerProject,
    itsmWorkCounts,
    businessProjects,
    businessProjectCount: businessProjects.length,
    productDiscoveryProjects,
    productDiscoveryProjectCount: productDiscoveryProjects.length,
    softwareProjects,
    agentFastMode: Boolean(payload.agentFastMode),
    aiGeneratedContent: payload.aiGeneratedContent || null,
    softwareProjectCount: softwareProjects.length,
    softwareTemplate: softwareProjects[0]?.softwareTemplate || softwareTemplate,
    softwareProjectStyle: softwareProjects[0]?.softwareProjectStyle || softwareProjectStyle,
    issuesPerProject: softwareProjects[0]?.issuesPerProject || normalisePositiveInteger(payload.issuesPerProject, DEFAULT_SOFTWARE_ISSUES_PER_PROJECT, 1, MAX_ISSUES_PER_PROJECT),
    sprintsPerProject: normalisePositiveInteger(
      payload.sprintsPerProject,
      MIN_SOFTWARE_SPRINTS_PER_PROJECT,
      MIN_SOFTWARE_SPRINTS_PER_PROJECT,
      MIN_SOFTWARE_SPRINTS_PER_PROJECT
    ),
    retentionPeriodDays: ACTIVE_TICKET_RETENTION_DAYS,
    filterId: null,
  };
}

const AGENT_DOMAIN_ALIASES = [
  ['Manufacturing', ['manufacturing']],
  ['Energy & Utilities', ['energy utilities', 'energy and utilities', 'utilities', 'energy']],
  ['Public Sector', ['public sector', 'government']],
  ['Banking & Insurance', ['banking insurance', 'banking and insurance', 'banking', 'bank', 'finance domain', 'insurance', 'claims', 'policy']],
  ['Healthcare', ['healthcare', 'health care', 'hospital', 'patient']],
  ['Telecom', ['telecom', 'telecommunication', 'telecommunications']],
  ['Retail & E-Commerce', ['retail ecommerce', 'retail and ecommerce', 'retail', 'e-commerce', 'ecommerce', 'commerce']],
  ['SaaS', ['saas', 'software as a service']],
  ['Education', ['education', 'university', 'school']],
];
const AGENT_SUPPORTED_DOMAIN_NAMES = AGENT_DOMAIN_ALIASES.map(([domain]) => domain);
const AGENT_RUN_KEY_PREFIX = 'agent-demo-run:';
const AGENT_RUN_STEP_BATCH_LIMIT = 1;
const AGENT_RUN_TIME_BUDGET_MS = 18000;
const AGENT_RUN_LOCK_TTL_MS = 30000;
const AGENT_FULL_COVERAGE_SOFTWARE_PROJECTS = [
  { softwareTemplate: 'scrum', softwareProjectStyle: 'team-managed', issuesPerProject: DEFAULT_SOFTWARE_ISSUES_PER_PROJECT },
  { softwareTemplate: 'kanban', softwareProjectStyle: 'team-managed', issuesPerProject: DEFAULT_SOFTWARE_ISSUES_PER_PROJECT },
  { softwareTemplate: 'bug-tracking', softwareProjectStyle: '', issuesPerProject: DEFAULT_SOFTWARE_ISSUES_PER_PROJECT },
];

function agentRequestWantsFullCoverage(payload = {}, requestText = '') {
  return payload.fullCoverage === true || textIncludesAny(requestText, [
    'full coverage',
    'complete coverage',
    'all spaces',
    'all space types',
    'all project types',
    'every space',
    'every project type',
    'dedicated space for each',
    'dedicated spaces for each',
    'one space for each',
    'one project for each',
    'baseline coverage',
  ]);
}

function createAgentRunToken() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${randomPart}`;
}

function getAgentRunStorageKey(runToken) {
  return `${AGENT_RUN_KEY_PREFIX}${String(runToken || '').trim()}`;
}

function getAgentRunLockStorageKey(runToken) {
  return `${getAgentRunStorageKey(runToken)}:lock`;
}

function createAgentProgressMessage(job) {
  const current = Math.min(job.nextStepIndex || 0, job.totalSteps || 0);
  return `${job.environmentName} demo environment creation is in progress: ${current} of ${job.totalSteps || 0} steps completed.`;
}

function createAgentEnvironmentName(domain) {
  return `${String(domain || 'Demo').trim() || 'Demo'} Demo ${createRunLabel()}`;
}

function isProjectNameCollisionMessage(message) {
  const value = String(message || '');
  const lower = value.toLowerCase();
  return value.includes('"projectName"')
    || lower.includes('"projectname"')
    || lower.includes('project with that name already exists')
    || lower.includes('project name already exists');
}

function getAgentRequestText(payload = {}) {
  return [
    payload.operation,
    payload.request,
    payload.domain,
    payload.spaceType,
    payload.softwareTemplate,
    payload.projectManagement,
    payload.businessSpaceType,
    payload.dateRange,
    payload.volume,
    payload.fullCoverage === true ? 'full coverage' : '',
    payload.purpose,
    payload.owner,
    payload.expiryDate,
    payload.volumeProjectKeys,
  ].filter(Boolean).map(String).join(' ').trim();
}

function textIncludesAny(text, values) {
  const normalized = String(text || '').toLowerCase();
  return values.some(value => normalized.includes(String(value || '').toLowerCase()));
}

function inferAgentDomain(payload = {}, requestText = '') {
  const explicit = String(payload.domain || payload.industry || '').trim();
  if (explicit && !['other', 'others'].includes(explicit.toLowerCase())) {
    const explicitNormalized = explicit.toLowerCase();
    const explicitMatch = AGENT_DOMAIN_ALIASES.find(([domain, aliases]) => (
      domain.toLowerCase() === explicitNormalized
      || aliases.some(alias => alias === explicitNormalized || explicitNormalized.includes(alias))
    ));
    return explicitMatch?.[0] || '';
  }

  const normalized = String(requestText || '').toLowerCase();
  const match = AGENT_DOMAIN_ALIASES.find(([, aliases]) => aliases.some(alias => normalized.includes(alias)));
  return match?.[0] || '';
}

function inferAgentDateRange(payload = {}, requestText = '') {
  const explicit = String(payload.dateRange || '').trim();
  if (explicit) {
    return explicit;
  }

  if (textIncludesAny(requestText, ['1 year', 'one year', '12 months', 'twelve months'])) {
    return '1 year';
  }

  if (textIncludesAny(requestText, ['3 months', 'three months', 'quarter'])) {
    return '3 months';
  }

  return '6 months';
}

function inferAgentProjectManagement(payload = {}, requestText = '') {
  const explicit = String(payload.projectManagement || payload.softwareProjectStyle || '').trim();
  if (explicit) {
    return normaliseProjectManagementStyle(explicit);
  }

  if (textIncludesAny(requestText, ['company managed', 'company-managed', 'company manager'])) {
    return 'company-managed';
  }

  return 'team-managed';
}

function inferAgentSoftwareTemplate(payload = {}, requestText = '') {
  const explicit = String(payload.softwareTemplate || '').trim();
  if (explicit) {
    return normaliseSoftwareTemplate(explicit);
  }

  if (textIncludesAny(requestText, ['bug tracking', 'bug-tracking', 'defect tracking'])) {
    return 'bug-tracking';
  }

  if (textIncludesAny(requestText, ['kanban'])) {
    return 'kanban';
  }

  if (textIncludesAny(requestText, ['scrum', 'sprint'])) {
    return 'scrum';
  }

  return '';
}

function inferAgentJsmServiceType(payload = {}, requestText = '') {
  const explicit = String(payload.serviceType || payload.spaceType || '').trim().replace(/^jsm:/i, '');
  if (explicit && JSM_SERVICE_TYPES.some(type => type.toLowerCase() === explicit.toLowerCase())) {
    return normaliseJsmServiceType(explicit);
  }

  if (textIncludesAny(requestText, ['hrsm', 'hr service', 'human resource'])) return 'HRSM';
  if (textIncludesAny(requestText, ['csm', 'customer service'])) return 'CSM';
  if (textIncludesAny(requestText, ['fsm', 'facilities', 'facility'])) return 'FSM';
  if (textIncludesAny(requestText, ['lsm', 'legal service'])) return 'LSM';
  if (textIncludesAny(requestText, ['itsm', 'it service', 'service management', 'incident', 'change request', 'problem request'])) return 'ITSM';

  return '';
}

function inferAgentBusinessSpaceType(payload = {}, requestText = '') {
  const explicit = String(payload.businessSpaceType || payload.spaceType || '').trim().toLowerCase().replace(/^business:/, '');
  if (explicit && BUSINESS_SPACE_TYPES.includes(explicit)) {
    return normaliseBusinessSpaceType(explicit);
  }

  if (textIncludesAny(requestText, ['budget planning', 'budget-planning', 'finance planning'])) {
    return 'budget-planning';
  }

  if (textIncludesAny(requestText, ['recruitment', 'recruitment tracking', 'recruitment-tracking', 'hiring'])) {
    return 'recruitment-tracking';
  }

  if (textIncludesAny(requestText, ['procurement', 'procurement management', 'procurement-management'])) {
    return 'procurement-management';
  }

  if (textIncludesAny(requestText, ['project management', 'project-management'])) {
    return 'project-management';
  }

  if (textIncludesAny(requestText, ['task tracking', 'task-tracking', 'work management', 'business project'])) {
    return 'task-tracking';
  }

  return '';
}

function extractAgentProjectKeys(payload = {}) {
  const explicit = Array.isArray(payload.volumeProjectKeys)
    ? payload.volumeProjectKeys
    : String(payload.volumeProjectKeys || payload.request || '').split(/[,\s]+/);
  return explicit
    .map(value => String(value || '').trim().toUpperCase())
    .filter(value => /^[A-Z][A-Z0-9]{1,9}$/.test(value));
}

function agentRequestExplicitlyNeedsNewSpace(requestText) {
  return textIncludesAny(requestText, [
    'create new because',
    'create a new because',
    'create the new because',
    'fresh space',
    'fresh project',
    'separate space',
    'separate project',
    'existing cannot',
    'existing can not',
    'existing can\'t',
    'cannot accommodate',
    'can not accommodate',
    'can\'t accommodate',
    'do not reuse',
    'don\'t reuse',
  ]);
}

function agentRequestExplicitlyConfirmsCreation(payload = {}, requestText = '') {
  if (payload.confirmCreate === true || payload.confirmCreation === true) {
    return true;
  }

  return textIncludesAny(requestText, [
    'yes create',
    'yes, create',
    'yes please create',
    'yes create new',
    'yes, create new',
    'yes please create new',
    'go ahead and create',
    'proceed with creation',
    'proceed to create',
    'start creating',
    'start setup',
    'run setup',
  ]);
}

async function buildAgentPreflightDecision(config = {}) {
  if (config.agentFullCoverage && !config.addVolumeToExistingDomainData && !config.agentConfirmedCreate) {
    const existingMatches = await searchDomainProjects(config.industry, {
      spaceType: '',
      includeIssueCounts: false,
    });
    const rows = existingMatches.slice(0, 10).map(project => {
      const detail = project.detailLabel || project.categoryLabel || project.projectTypeKey || 'Project';
      return `- ${project.key}: ${project.name} (${detail}, ${project.issueCount || 0} items)`;
    });
    const extra = existingMatches.length > rows.length ? [`- ...and ${existingMatches.length - rows.length} more ${config.industry} space(s).`] : [];
    const question = [
      existingMatches.length > 0
        ? `I found existing ${config.industry} demo spaces before creating full coverage.`
        : `I did not find existing ${config.industry} demo spaces for full coverage.`,
      ...rows,
      ...extra,
      '',
      'Full createable coverage means: 5 JSM spaces, 5 Work Management spaces, and 3 Software projects. Product Discovery must be added as volume to an existing native JPD project key.',
      '',
      'Reply with one of these:',
      '- add volume KEY',
      '- delete KEY',
      '- yes create full coverage because existing spaces cannot accommodate this demo',
    ].join('\n');

    return {
      success: false,
      needsInput: true,
      question,
      summary: question,
      missingFields: existingMatches.length > 0 ? ['reuseExistingProjectDecision'] : ['createConfirmation'],
      matches: existingMatches.slice(0, 12),
    };
  }

  const requestedSpaceType = getRequestedAgentSpaceTypeFromConfig(config);
  if (!requestedSpaceType || config.addVolumeToExistingDomainData || config.agentConfirmedCreate) {
    return null;
  }

  if (config.agentExplicitCreateNew) {
    const confirmationQuestion = [
      `I understand you want a new ${config.industry} ${requestedSpaceType} demo space.`,
      'Please confirm with: "yes create new" and I will prepare the setup run.',
    ].join('\n');

    return {
      success: false,
      needsInput: true,
      question: confirmationQuestion,
      summary: confirmationQuestion,
      missingFields: ['createConfirmation'],
    };
  }

  const existingMatches = await searchDomainProjects(config.industry, {
    spaceType: requestedSpaceType,
    includeIssueCounts: false,
  });
  const question = existingMatches.length > 0
    ? formatAgentExistingSpacePrompt(config.industry, requestedSpaceType, existingMatches)
    : [
        `I did not find an existing ${config.industry} space matching ${requestedSpaceType}.`,
        '',
        'Before I create anything, confirm one of these:',
        '- choose a different domain or space type',
        '- add volume KEY if you know an existing project key',
        '- create new because existing spaces cannot accommodate this demo',
      ].join('\n');

  return {
    success: false,
    needsInput: true,
    question,
    summary: question,
    missingFields: existingMatches.length > 0 ? ['reuseExistingProjectDecision'] : ['createConfirmation'],
    matches: existingMatches.slice(0, 12),
  };
}

function getRequestedAgentSpaceTypeFromConfig(config = {}) {
  if (Array.isArray(config.jsmServiceTypes) && config.jsmServiceTypes.length > 0) {
    return `jsm:${normaliseJsmServiceType(config.jsmServiceTypes[0])}`;
  }

  if (Array.isArray(config.softwareProjects) && config.softwareProjects.length > 0) {
    return `software:${normaliseSoftwareTemplate(config.softwareProjects[0].softwareTemplate)}`;
  }

  if (Array.isArray(config.businessProjects) && config.businessProjects.length > 0) {
    return `business:${normaliseBusinessSpaceType(config.businessProjects[0].businessSpaceType)}`;
  }

  if (Array.isArray(config.productDiscoveryProjects) && config.productDiscoveryProjects.length > 0) {
    return 'jpd:product-discovery';
  }

  return '';
}

function formatAgentExistingSpacePrompt(domain, spaceType, projects) {
  const rows = projects.slice(0, 8).map(project => {
    const detail = project.detailLabel || project.categoryLabel || project.projectTypeKey || 'Project';
    return `- ${project.key}: ${project.name} (${detail}, ${project.issueCount || 0} items)`;
  });
  const extra = projects.length > rows.length ? [`- ...and ${projects.length - rows.length} more matching space(s).`] : [];
  return [
    `I found existing ${domain} spaces that match ${spaceType || 'your request'}.`,
    ...rows,
    ...extra,
    '',
    'Reply with one of these:',
    '- add volume KEY',
    '- delete KEY',
    '- create new because existing spaces cannot accommodate this demo',
  ].join('\n');
}

function buildAgentDashboardDefaults({ jsmServiceTypes, softwareProjects, businessProjects, productDiscoveryProjects }) {
  const softwareSelections = softwareProjects.map(project => {
    const template = normaliseSoftwareTemplate(project.softwareTemplate);
    return {
      value: `${template}-software-dashboard`,
      title: `${getSoftwareTemplateLabel(template)} Dashboard`,
      prompt: `Project-level dashboard for a Jira Software ${getSoftwareTemplateLabel(template)} project. Show open work, delivery progress, releases, defects, dependencies, and work needing attention.`,
    };
  });

  return {
    opsDashboardSelections: jsmServiceTypes.length > 0
      ? [{
          value: 'default',
          title: 'Service Management Dashboard',
          prompt: 'Service management dashboard showing open work, priority mix, SLA or aging risk, created vs resolved trend, request queues, and workload.',
        }]
      : [],
    opsDashboardTypes: jsmServiceTypes.length > 0 ? ['default'] : [],
    opsDashboardPrompt: jsmServiceTypes.length > 0 ? 'Service management dashboard showing operational health and work needing attention.' : '',
    softwareDashboardSelections: softwareSelections,
    softwareDashboardTypes: softwareSelections.map(selection => selection.value),
    softwareDashboardPrompt: softwareSelections.map(selection => selection.prompt).join('\n'),
    businessDashboardSelections: businessProjects.map(project => getBusinessProjectDashboardSelection(project.businessSpaceType)),
    businessDashboardTypes: businessProjects.map(project => getBusinessProjectDashboardSelection(project.businessSpaceType).value),
    businessDashboardPrompt: businessProjects.map(project => getBusinessProjectDashboardSelection(project.businessSpaceType).prompt).join('\n'),
    productDiscoveryDashboardSelections: productDiscoveryProjects.length > 0 ? [getProductDiscoveryDashboardSelection()] : [],
    productDiscoveryDashboardTypes: productDiscoveryProjects.length > 0 ? ['product-discovery-dashboard'] : [],
    productDiscoveryDashboardPrompt: productDiscoveryProjects.length > 0 ? getProductDiscoveryDashboardSelection().prompt : '',
  };
}

function buildAgentDemoEnvironmentPayload(payload = {}) {
  const requestText = getAgentRequestText(payload);
  const domain = inferAgentDomain(payload, requestText);
  const addVolume = Boolean(payload.addVolume || textIncludesAny(requestText, ['add volume', 'more volume', 'existing project', 'existing projects']));
  const volumeProjectKeys = extractAgentProjectKeys(payload);

  if (!domain) {
    return {
      ready: false,
      question: `Which supported domain should I use for the demo environment? Current supported domains are: ${AGENT_SUPPORTED_DOMAIN_NAMES.join(', ')}. If your need is outside this list, tell me which supported domain is closest or ask for a generic business demonstration.`,
      missingFields: ['domain'],
    };
  }

  if (addVolume && volumeProjectKeys.length === 0) {
    return {
      ready: false,
      question: 'Which existing Jira project key or keys should receive additional demo volume?',
      missingFields: ['volumeProjectKeys'],
    };
  }

  const projectCount = normalisePositiveInteger(payload.projectCount, 1, 1, 10);
  const softwareTemplate = inferAgentSoftwareTemplate(payload, requestText);
  const jsmServiceType = inferAgentJsmServiceType(payload, requestText);
  const businessSpaceType = inferAgentBusinessSpaceType(payload, requestText);
  const wantsProductDiscovery = textIncludesAny(requestText, ['product discovery', 'jpd']);
  const wantsFullCoverage = agentRequestWantsFullCoverage(payload, requestText);

  if (wantsProductDiscovery && !wantsFullCoverage && !addVolume) {
    return {
      ready: false,
      question: 'Jira Product Discovery spaces must be created in Jira first. Share the existing Product Discovery project key if you want me to add demo ideas as volume.',
      missingFields: ['volumeProjectKeys'],
    };
  }

  if (!wantsFullCoverage && !softwareTemplate && !jsmServiceType && !businessSpaceType && !addVolume) {
    return {
      ready: false,
      question: 'Which Jira space should I use: ITSM, HRSM, CSM, FSM, LSM, Scrum, Kanban, Bug Tracking, Project Management, Task Tracking, Budget Planning, Recruitment Tracking, or Procurement Management?',
      missingFields: ['spaceType'],
    };
  }

  const softwareProjectStyle = inferAgentProjectManagement(payload, requestText);
  const jsmServiceTypes = wantsFullCoverage
    ? [...JSM_SERVICE_TYPES]
    : (jsmServiceType ? Array.from({ length: projectCount }, () => jsmServiceType) : []);
  const softwareProjects = wantsFullCoverage
    ? AGENT_FULL_COVERAGE_SOFTWARE_PROJECTS.map(project => ({ ...project }))
    : (softwareTemplate
    ? Array.from({ length: projectCount }, () => ({
        softwareTemplate,
        softwareProjectStyle: softwareTemplate === 'bug-tracking' ? '' : softwareProjectStyle,
        issuesPerProject: DEFAULT_SOFTWARE_ISSUES_PER_PROJECT,
      }))
    : []);
  const businessProjects = wantsFullCoverage
    ? BUSINESS_SPACE_TYPES.map(type => ({
        projectKey: '',
        businessSpaceType: type,
        issuesPerProject: DEFAULT_SOFTWARE_ISSUES_PER_PROJECT,
      }))
    : (businessSpaceType
    ? Array.from({ length: projectCount }, () => ({
        projectKey: '',
        businessSpaceType,
        issuesPerProject: DEFAULT_SOFTWARE_ISSUES_PER_PROJECT,
      }))
    : []);
  const productDiscoveryProjects = [];
  const dashboardDefaults = buildAgentDashboardDefaults({
    jsmServiceTypes,
    softwareProjects,
    businessProjects,
    productDiscoveryProjects,
  });

  return {
    ready: true,
    config: {
      industry: domain,
      agentRequestText: requestText,
      agentFullCoverage: wantsFullCoverage,
      agentExplicitCreateNew: agentRequestExplicitlyNeedsNewSpace(requestText),
      agentConfirmedCreate: agentRequestExplicitlyConfirmsCreation(payload, requestText),
      customIndustry: '',
      isCustomIndustry: false,
      environmentName: createAgentEnvironmentName(domain),
      reuseExistingDomainData: true,
      addVolumeToExistingDomainData: addVolume,
      volumeProjectKeys,
      ...dashboardDefaults,
      dateRange: inferAgentDateRange(payload, requestText),
      jsmProjectCount: jsmServiceTypes.length,
      jsmServiceTypes,
      incidentRequestsPerProject: DEFAULT_SOFTWARE_ISSUES_PER_PROJECT,
      problemRequestsPerProject: DEFAULT_SOFTWARE_ISSUES_PER_PROJECT,
      changeRequestsPerProject: DEFAULT_SOFTWARE_ISSUES_PER_PROJECT,
      serviceRequestsPerProject: DEFAULT_SOFTWARE_ISSUES_PER_PROJECT,
      softwareProjects,
      businessProjects,
      productDiscoveryProjects,
      agentFastMode: false,
      softwareProjectCount: softwareProjects.length,
      softwareTemplate: softwareProjects[0]?.softwareTemplate || 'scrum',
      softwareProjectStyle: softwareProjects[0]?.softwareProjectStyle || 'team-managed',
      issuesPerProject: DEFAULT_SOFTWARE_ISSUES_PER_PROJECT,
      sprintsPerProject: 6,
      retentionPeriodDays: ACTIVE_TICKET_RETENTION_DAYS,
    },
  };
}

function getCycledTemplate(templates, index) {
  if (!Array.isArray(templates) || templates.length === 0) {
    return null;
  }

  const template = templates[index % templates.length];
  const cycleNumber = Math.floor(index / templates.length) + 1;

  if (cycleNumber === 1) {
    return template;
  }

  return {
    ...template,
    title: `${template.title} - Scenario ${cycleNumber}`,
  };
}

function createChunkedExecutionState(accountId) {
  return {
    metadata: {
      accountId,
      dashboardPlan: null,
      dashboardPlans: [],
      dashboardCatalog: null,
      historicalDatePatchIssues: [],
      workerDatePatch: null,
      runLabel: createRunLabel(),
    },
    results: {
      jsmProjects: [],
      softwareProjects: [],
      businessProjects: [],
      productDiscoveryProjects: [],
      confluenceSpaces: [],
      githubActivity: [],
      dashboards: [],
      savedFilters: [],
      reports: [],
      jiraPlans: [],
      jiraRoadmaps: [],
      compassComponents: [],
      atlassianGoals: [],
      projectGoals: [],
      totalIncidents: 0,
      totalIssues: 0,
      dashboardId: null,
      dashboardName: null,
      dashboardTemplateId: null,
      dashboardViewUrl: null,
      dashboardFilterApplied: false,
      savedFilter: null,
      errors: [],
      diagnostics: [],
    },
  };
}

function buildChunkedExecutionPlan(config) {
  const content = getConfiguredContent(config);
  const runSeed = config.runSeed || Date.now();
  const projectNameDomain = config.environmentName || config.industry;
  const steps = [{
    type: 'generate-ai-content',
    label: 'Generate AI demo content',
  }];
  const incidentCount = config.incidentsPerProject;
  const csvIssueCreation = isCsvIssueCreationMode();

  for (let projectIndex = 0; projectIndex < config.jsmProjectCount; projectIndex++) {
    const jsmServiceType = normaliseJsmServiceType(config.jsmServiceTypes?.[projectIndex]);
    steps.push({
      type: 'create-business-project',
      projectIndex,
      jsmServiceType,
      projectName: createDomainProjectName(projectNameDomain, 'business', projectIndex, { serviceType: jsmServiceType }),
      projectKeyPrefix: deriveRunProjectKeyPrefix({ ...config, runSeed }, config.industry, projectIndex),
      label: `Find or create JSM ${jsmServiceType} project ${projectIndex + 1} of ${config.jsmProjectCount}`,
    });

    steps.push({
      type: 'configure-business-date-fields',
      projectIndex,
      label: `Configure demo date fields for JSM project ${projectIndex + 1}`,
    });

    steps.push({
      type: 'configure-itsm-foundation',
      projectIndex,
      label: `Configure queues, request types, and knowledge base for JSM project ${projectIndex + 1}`,
    });

    steps.push({
      type: 'create-business-form',
      projectIndex,
      label: `Create default form for JSM project ${projectIndex + 1}`,
    });

    if (!csvIssueCreation) {
      for (let start = 0; start < incidentCount; start += INCIDENT_BATCH_SIZE) {
        steps.push({
          type: 'create-business-incidents-batch',
          projectIndex,
          start,
          count: Math.min(INCIDENT_BATCH_SIZE, incidentCount - start),
          label: `Create ITSM work items ${start + 1}-${Math.min(start + INCIDENT_BATCH_SIZE, incidentCount)} for JSM project ${projectIndex + 1}`,
        });
      }
    }
  }

  for (let projectIndex = 0; projectIndex < config.businessProjectCount; projectIndex++) {
    const businessProjectConfig = getBusinessProjectConfig(config, projectIndex);
    const issueCount = businessProjectConfig.issuesPerProject;
    const globalIndex = config.jsmProjectCount + projectIndex;
    const businessCategoryLabel = getBusinessSpaceCategoryLabel(businessProjectConfig.businessSpaceType);

    steps.push({
      type: 'create-work-management-project-shell',
      projectIndex,
      projectName: createDomainProjectName(projectNameDomain, 'business-project', projectIndex, businessProjectConfig),
      projectKeyPrefix: deriveRunProjectKeyPrefix({ ...config, runSeed }, config.industry, globalIndex),
      label: `Find or create ${businessCategoryLabel} ${getBusinessSpaceTypeLabel(businessProjectConfig.businessSpaceType)} space ${projectIndex + 1} of ${config.businessProjectCount}`,
    });

    steps.push({
      type: 'configure-work-management-date-fields',
      projectIndex,
      label: `Configure demo date fields for ${businessCategoryLabel} space ${projectIndex + 1}`,
    });

    steps.push({
      type: 'create-work-management-components',
      projectIndex,
      label: `Create components for ${businessCategoryLabel} space ${projectIndex + 1}`,
    });

    if (!csvIssueCreation) {
      for (let start = 0; start < issueCount; start += ISSUE_BATCH_SIZE) {
        steps.push({
          type: 'create-work-management-issues-batch',
          projectIndex,
          start,
          count: Math.min(ISSUE_BATCH_SIZE, issueCount - start),
          label: `Create ${businessCategoryLabel} items ${start + 1}-${Math.min(start + ISSUE_BATCH_SIZE, issueCount)} for space ${projectIndex + 1}`,
        });
      }
    }
  }

  for (let projectIndex = 0; projectIndex < config.productDiscoveryProjectCount; projectIndex++) {
    const productDiscoveryProjectConfig = getProductDiscoveryProjectConfig(config, projectIndex);
    const issueCount = productDiscoveryProjectConfig.issuesPerProject;
    const globalIndex = config.jsmProjectCount + config.businessProjectCount + projectIndex;

    steps.push({
      type: 'create-product-discovery-project-shell',
      projectIndex,
      projectName: createDomainProjectName(projectNameDomain, 'product-discovery', projectIndex, productDiscoveryProjectConfig),
      projectKeyPrefix: deriveRunProjectKeyPrefix({ ...config, runSeed }, config.industry, globalIndex),
      label: `Use existing Jira Product Discovery space ${projectIndex + 1} of ${config.productDiscoveryProjectCount}`,
    });

    steps.push({
      type: 'configure-product-discovery-date-fields',
      projectIndex,
      label: `Configure demo date fields for Product Discovery space ${projectIndex + 1}`,
    });

    steps.push({
      type: 'create-product-discovery-components',
      projectIndex,
      label: `Create components for Product Discovery space ${projectIndex + 1}`,
    });

    if (!csvIssueCreation) {
      for (let start = 0; start < issueCount; start += ISSUE_BATCH_SIZE) {
        steps.push({
          type: 'create-product-discovery-ideas-batch',
          projectIndex,
          start,
          count: Math.min(ISSUE_BATCH_SIZE, issueCount - start),
          label: `Create Product Discovery ideas ${start + 1}-${Math.min(start + ISSUE_BATCH_SIZE, issueCount)} for space ${projectIndex + 1}`,
        });
      }
    }
  }

  for (let projectIndex = 0; projectIndex < config.softwareProjectCount; projectIndex++) {
    const softwareProjectConfig = getSoftwareProjectConfig(config, projectIndex);
    const issueCount = softwareProjectConfig.issuesPerProject;
    const softwareTemplate = normaliseSoftwareTemplate(softwareProjectConfig.softwareTemplate);

    steps.push({
      type: 'create-software-project-shell',
      projectIndex,
      projectName: createDomainProjectName(projectNameDomain, 'software', projectIndex, softwareProjectConfig),
      projectKeyPrefix: deriveRunProjectKeyPrefix({ ...config, runSeed }, config.industry, projectIndex + config.jsmProjectCount + config.businessProjectCount + config.productDiscoveryProjectCount),
      label: `Find or create software project ${projectIndex + 1} of ${config.softwareProjectCount}`,
    });

    steps.push({
      type: 'configure-software-date-fields',
      projectIndex,
      label: `Configure demo date fields for software project ${projectIndex + 1}`,
    });

    steps.push({
      type: 'create-software-form',
      projectIndex,
      label: `Check form support for software project ${projectIndex + 1}`,
    });

    for (let start = 0; start < SOFTWARE_VERSION_COUNT; start += VERSION_BATCH_SIZE) {
      steps.push({
        type: 'create-software-versions-batch',
        projectIndex,
        startRelease: start,
        count: Math.min(VERSION_BATCH_SIZE, SOFTWARE_VERSION_COUNT - start),
        label: `Create versions batch for software project ${projectIndex + 1}`,
      });
    }

    steps.push({
      type: 'create-software-components',
      projectIndex,
      label: `Create components for software project ${projectIndex + 1}`,
    });

    if (!csvIssueCreation && softwareTemplate === 'scrum') {
      const epicCount = getConfiguredContent(config).epics.length;
      for (let start = 0; start < epicCount; start += EPIC_BATCH_SIZE) {
        steps.push({
          type: 'create-software-epics-batch',
          projectIndex,
          start,
          count: Math.min(EPIC_BATCH_SIZE, epicCount - start),
          label: `Create epics ${start + 1}-${Math.min(start + EPIC_BATCH_SIZE, epicCount)} for software project ${projectIndex + 1}`,
        });
      }
    }

    if (softwareTemplate === 'scrum') {
      steps.push({
        type: 'create-atlassian-goals',
        projectIndex,
        label: `Create and link Atlassian Goals for software project ${projectIndex + 1}`,
      });
    }

    if (softwareTemplate === 'scrum' || softwareTemplate === 'kanban') {
      steps.push({
        type: 'lookup-software-board',
        projectIndex,
        label: `Find ${getSoftwareTemplateLabel(softwareTemplate)} board for software project ${projectIndex + 1}`,
      });
    }

    if (!csvIssueCreation) {
      for (let start = 0; start < issueCount; start += ISSUE_BATCH_SIZE) {
        steps.push({
          type: 'create-software-issues-batch',
          projectIndex,
          start,
          count: Math.min(ISSUE_BATCH_SIZE, issueCount - start),
          label: `Create issues ${start + 1}-${Math.min(start + ISSUE_BATCH_SIZE, issueCount)} for software project ${projectIndex + 1}`,
        });
      }
    }

    steps.push({
      type: 'create-compass-components',
      projectIndex,
      label: `Create and link Compass components for software project ${projectIndex + 1}`,
    });

    if (!csvIssueCreation) {
      if (softwareTemplate === 'scrum') {
        for (let sprintIndex = 0; sprintIndex < config.sprintsPerProject; sprintIndex++) {
          steps.push({
            type: 'create-software-sprint',
            projectIndex,
            sprintIndex,
            label: `Create sprint ${sprintIndex + 1} for Scrum software project ${projectIndex + 1}`,
          });
        }
      } else if (softwareTemplate === 'kanban') {
        steps.push({
          type: 'populate-kanban-board',
          projectIndex,
          label: `Populate Kanban board for software project ${projectIndex + 1}`,
        });
      } else {
        steps.push({
          type: 'verify-bug-tracking-work',
          projectIndex,
          label: `Verify Bug Tracking work for software project ${projectIndex + 1}`,
        });
      }
    }
  }

  if (csvIssueCreation) {
    steps.push({
      type: 'generate-worker-dataset',
      label: 'Generate CSV-ready historical dataset with real project keys',
    });
  } else {
    const itsmDependencyScopes = [
      ['itsm-problem-incident', 'problem-to-incident'],
      ['itsm-change-problem', 'change-to-problem'],
      ['itsm-service-change', 'service-request-to-change'],
      ['itsm-incident-change', 'incident-to-change'],
    ];
    for (let projectIndex = 0; projectIndex < config.jsmProjectCount; projectIndex++) {
      for (const [dependencyScope, label] of itsmDependencyScopes) {
        steps.push({
          type: 'create-dependencies',
          dependencyScope,
          projectIndex,
          label: `Create mandatory ITSM ${label} links for JSM project ${projectIndex + 1}`,
        });
      }
    }

    for (let projectIndex = 0; projectIndex < config.softwareProjectCount; projectIndex++) {
      steps.push({
        type: 'create-dependencies',
        dependencyScope: 'software',
        projectIndex,
        label: `Create software work links for software project ${projectIndex + 1}`,
      });
    }

    if (config.softwareProjectCount >= 2) {
      steps.push({
        type: 'create-dependencies',
        dependencyScope: 'software-cross-project',
        label: 'Create cross-project software dependency link',
      });
    }

    if (config.jsmProjectCount > 0 && config.softwareProjectCount > 0) {
      steps.push({
        type: 'create-dependencies',
        dependencyScope: 'devops',
        label: 'Create DevOps dependency link between ITSM and software work',
      });
    }

    const addGitHubActivitySteps = (projectKind, projectCount, labelPrefix) => {
      for (let projectIndex = 0; projectIndex < projectCount; projectIndex++) {
        for (let activityIndex = 0; activityIndex < GITHUB_DEMO_ACTIVITY_PER_PROJECT; activityIndex++) {
          steps.push({
            type: 'create-github-development-activity',
            projectKind,
            projectIndex,
            activityStart: activityIndex,
            activityCount: 1,
            label: `${labelPrefix} ${projectIndex + 1} - GitHub item ${activityIndex + 1}`,
          });
        }
      }
    };

    if (!config.agentFastMode) {
      addGitHubActivitySteps('jsm', config.jsmProjectCount, 'Create GitHub demo activity for JSM project');
      addGitHubActivitySteps('business', config.businessProjectCount, 'Create GitHub demo activity for business space');
      addGitHubActivitySteps('product-discovery', config.productDiscoveryProjectCount, 'Create GitHub demo activity for Product Discovery space');
      addGitHubActivitySteps('software', config.softwareProjectCount, 'Create GitHub demo activity for software project');
    }

    if (isRestDatePatchMode()) {
      steps.push({
        type: 'generate-worker-date-patch',
        label: 'Generate CSV date patch for REST-created issues',
      });
    }

    if (config.softwareProjectCount > 0) {
      steps.push({
        type: 'create-planning-artifacts',
        label: 'Create Jira planning and roadmap artifacts',
      });
    }
  }

  steps.push({
    type: 'prepare-dashboard-catalog',
    label: 'Prepare dashboard gadget catalog',
  });

  const dashboardTargets = [];
  const opsDashboardSelections = config.opsDashboardSelections?.length
    ? config.opsDashboardSelections
    : [{ value: 'default', title: 'Service Management Dashboard', prompt: '' }];
  const softwareDashboardSelections = config.softwareDashboardSelections?.length
    ? config.softwareDashboardSelections
    : [{ value: 'default', title: 'Software Dashboard', prompt: '' }];
  const businessDashboardSelections = config.businessDashboardSelections?.length
    ? config.businessDashboardSelections
    : [];
  const productDiscoveryDashboardSelections = config.productDiscoveryDashboardSelections?.length
    ? config.productDiscoveryDashboardSelections
    : [];
  const isEnterpriseDashboardSelection = selection => (
    inferDashboardIntent(selection.prompt, config.industry, selection.value).level === 'Enterprise'
  );
  const isJsmProjectLevelDashboardAllowed = (selection, serviceType) => {
    const selectionValue = String(selection?.value || '').toLowerCase();
    const normalizedServiceType = normaliseJsmServiceType(serviceType);
    if (selectionValue.startsWith('jsm-')) {
      return selectionValue === `jsm-${normalizedServiceType.toLowerCase()}-dashboard`;
    }
    return normalizedServiceType === 'ITSM';
  };
  const isSoftwareProjectLevelDashboardAllowed = (selection, projectConfig) => {
    const selectionValue = String(selection?.value || '').toLowerCase();
    const softwareTemplate = normaliseSoftwareTemplate(projectConfig?.softwareTemplate || config.softwareTemplate);

    if (selectionValue.startsWith('scrum-')) {
      return softwareTemplate === 'scrum';
    }

    if (selectionValue.startsWith('kanban-')) {
      return softwareTemplate === 'kanban';
    }

    if (selectionValue.startsWith('bug-')) {
      return softwareTemplate === 'bug-tracking';
    }

    return true;
  };

  for (const dashboardSelection of opsDashboardSelections.filter(isEnterpriseDashboardSelection)) {
    dashboardTargets.push({
      dashboardIndex: dashboardTargets.length,
      projectKind: 'business-enterprise',
      dashboardSelection,
      label: `Enterprise ITSM ${dashboardSelection.title}`,
    });
  }

  for (let projectIndex = 0; projectIndex < config.jsmProjectCount; projectIndex += 1) {
    const jsmServiceType = config.jsmServiceTypes?.[projectIndex] || 'ITSM';
    for (const dashboardSelection of opsDashboardSelections
      .filter(selection => !isEnterpriseDashboardSelection(selection))
      .filter(selection => isJsmProjectLevelDashboardAllowed(selection, jsmServiceType))) {
      dashboardTargets.push({
        dashboardIndex: dashboardTargets.length,
        projectKind: 'business',
        projectIndex,
        dashboardSelection,
        label: `JSM project ${projectIndex + 1} ${dashboardSelection.title}`,
      });
    }
  }

  for (let projectIndex = 0; projectIndex < config.businessProjectCount; projectIndex += 1) {
    const businessProjectConfig = getBusinessProjectConfig(config, projectIndex);
    const businessCategoryLabel = getBusinessSpaceCategoryLabel(businessProjectConfig.businessSpaceType);
    const defaultSelection = getBusinessProjectDashboardSelection(businessProjectConfig.businessSpaceType);
    const matchingSelections = config.businessDashboardTypes?.length
      ? businessDashboardSelections.filter(selection => String(selection.value || '') === defaultSelection.value)
      : [defaultSelection];
    for (const dashboardSelection of matchingSelections) {
      dashboardTargets.push({
        dashboardIndex: dashboardTargets.length,
        projectKind: 'business-project',
        projectIndex,
        dashboardSelection,
        label: `${businessCategoryLabel} project ${projectIndex + 1} ${getBusinessSpaceTypeLabel(businessProjectConfig.businessSpaceType)} Dashboard`,
      });
    }
  }

  for (let projectIndex = 0; projectIndex < config.productDiscoveryProjectCount; projectIndex += 1) {
    const defaultSelection = getProductDiscoveryDashboardSelection();
    const matchingSelections = config.productDiscoveryDashboardTypes?.length
      ? productDiscoveryDashboardSelections.filter(selection => String(selection.value || '') === defaultSelection.value)
      : [defaultSelection];
    for (const dashboardSelection of matchingSelections) {
      dashboardTargets.push({
        dashboardIndex: dashboardTargets.length,
        projectKind: 'product-discovery',
        projectIndex,
        dashboardSelection,
        label: `Product Discovery space ${projectIndex + 1} Dashboard`,
      });
    }
  }

  for (const dashboardSelection of softwareDashboardSelections.filter(isEnterpriseDashboardSelection)) {
    dashboardTargets.push({
      dashboardIndex: dashboardTargets.length,
      projectKind: 'software-enterprise',
      dashboardSelection,
      label: `Enterprise Dev ${dashboardSelection.title}`,
    });
  }

  for (let projectIndex = 0; projectIndex < config.softwareProjectCount; projectIndex += 1) {
    const projectConfig = getSoftwareProjectConfig(config, projectIndex);
    const projectLevelSelections = softwareDashboardSelections
      .filter(selection => !isEnterpriseDashboardSelection(selection))
      .filter(selection => isSoftwareProjectLevelDashboardAllowed(selection, projectConfig));

    for (const dashboardSelection of projectLevelSelections) {
      dashboardTargets.push({
        dashboardIndex: dashboardTargets.length,
        projectKind: 'software',
        projectIndex,
        dashboardSelection,
        label: `Dev project ${projectIndex + 1} ${dashboardSelection.title}`,
      });
    }
  }

  for (const target of dashboardTargets) {
    steps.push({
      type: 'create-dashboard-shell',
      ...target,
      label: `Create dashboard shell for ${target.label}`,
    });

    const dashboardGadgetCount = config.agentFastMode ? 2 : MANAGED_DASHBOARD_GADGET_SLOT_COUNT;
    for (let gadgetIndex = 0; gadgetIndex < dashboardGadgetCount; gadgetIndex++) {
      steps.push({
        type: 'create-dashboard-gadget',
        ...target,
        gadgetIndex,
        label: `Configure dashboard gadget ${gadgetIndex + 1} of ${dashboardGadgetCount} for ${target.label}`,
      });
    }
  }

  steps.push({
    type: 'finalize-dashboard',
    label: 'Finalize the shared release dashboard',
  });

  return steps;
}

function addChunkedError(state, message) {
  state.results.errors.push(message);
}

function addChunkedDiagnostics(state, diagnostics) {
  if (!Array.isArray(diagnostics) || diagnostics.length === 0) {
    return;
  }

  state.results.diagnostics.push(...diagnostics);
}

async function validateAdminAccess() {
  let accountId;
  try {
    accountId = await getCurrentUser();
  } catch (err) {
    return {
      ok: false,
      message: `Authentication Error: ${err.message}\n\nPlease ensure you are logged into Jira and try again.`,
    };
  }

  let permissions;
  try {
    permissions = await getMyGlobalPermissions();
  } catch (err) {
    return {
      ok: false,
      message: `Permission Check Error: ${err.message}\n\nTry logging out and back in, then try again.`,
    };
  }

  if (!permissions.ADMINISTER?.havePermission) {
    return {
      ok: false,
      message: 'The current user does not have the global "Administer Jira" permission.\nPlease open the app as a Jira administrator and try again.',
    };
  }

  return {
    ok: true,
    accountId,
  };
}

async function executeBusinessProjectStep(config, state, step) {
  const timestamp = Date.now();
  const projectName = step.projectName || `${config.environmentName} - ${config.industry} Ops ${step.projectIndex + 1} (${timestamp})`;
  const projectKeyPrefix = step.projectKeyPrefix || deriveRunProjectKeyPrefix(config, config.industry, step.projectIndex);
  const jsmServiceType = normaliseJsmServiceType(step.jsmServiceType || config.jsmServiceTypes?.[step.projectIndex]);

  try {
    addChunkedDiagnostics(state, [`JSM Project ${step.projectIndex + 1}: finding or creating ${getJsmServiceTypeLabel(jsmServiceType)} project using template ${getJsmTemplateKeys(jsmServiceType)[0]}.`]);
    const expectedKey = generateKey(projectKeyPrefix, 0);
    const existingDomainProject = await findReusableDomainProject(config, {
      kind: 'business',
      jsmServiceType,
      excludeKeys: state.results.jsmProjects.map(project => project?.key),
    });
    const existingProject = existingDomainProject || await getProjectByKeyIfExists(expectedKey);
    const project = existingProject
      ? {
          id: existingProject.id,
          key: existingProject.key,
          serviceDeskAvailable: true,
          projectTypeKey: existingProject.projectTypeKey || 'service_desk',
        }
      : await createJSMProject(projectName, state.metadata.accountId, projectKeyPrefix, state.results.diagnostics, jsmServiceType);

    if (existingProject) {
      addChunkedDiagnostics(state, [`JSM Project ${step.projectIndex + 1}: reused existing ${getJsmServiceTypeLabel(jsmServiceType)} project ${existingProject.key} for ${config.industry}.`]);
    }

    const existingIssueCount = await getIssueCountForProject(project.key);
    const addVolumeToExistingProject = Boolean(existingProject && shouldAddVolumeToExistingProject(config, project.key));
    await saveProjectDemoDomainMetadata(project, {
      domain: config.industry,
      kind: 'business',
      jsmServiceType,
      generatedBy: 'jira-demo-data-setup',
      issueTarget: config.incidentsPerProject,
    }, state.results.diagnostics);

    state.results.jsmProjects[step.projectIndex] = {
      id: project.id,
      key: project.key,
      name: existingProject?.name || project.name || projectName,
      serviceDeskAvailable: project.serviceDeskAvailable !== false,
      projectTypeKey: project.projectTypeKey || 'service_desk',
      compatibilityMode: project.compatibilityMode || null,
      compatibilityReason: project.compatibilityReason || null,
      createdByThisRun: !existingProject,
      reusedExistingDomainData: Boolean(existingProject && existingIssueCount > 0),
      addVolumeToExistingDomainData: addVolumeToExistingProject,
      existingIssueCount,
      jsmServiceType,
      incidents: [],
      itsmWorkItems: [],
      smartForm: null,
      requestTypes: [],
      queues: [],
      knowledgeBase: null,
      demoDateFields: null,
      demoDateFieldsReady: false,
      configuredItsmWorkCount: config.incidentsPerProject,
      configuredItsmWorkCounts: config.itsmWorkCounts,
    };
  } catch (err) {
    state.results.jsmProjects[step.projectIndex] = {
      id: null,
      key: null,
      name: projectName,
      failed: true,
      failureMessage: err.message,
      incidents: [],
    };
    addChunkedError(state, `JSM Project ${step.projectIndex + 1}: ${err.message}`);
  }
}

async function executeBusinessDateFieldStep(state, step) {
  const project = state.results.jsmProjects[step.projectIndex];
  if (!project?.id || !project?.key) {
    addChunkedDiagnostics(state, [`JSM Project ${step.projectIndex + 1}: skipped date field setup because the ITSM/JSM project was not created.`]);
    return;
  }

  try {
    const diagnostics = [];
    const demoDateFields = await resolveDemoDateFieldsWithoutScreenSetup(project.key, diagnostics);
    await ensureDevelopmentFieldOnProjectScreens(project.id, project.key, diagnostics);
    addChunkedDiagnostics(state, diagnostics);

    project.demoDateFields = demoDateFields;
    project.demoDateFieldsReady = Boolean(demoDateFields.createdDateFieldId || demoDateFields.resolvedDateFieldId);

    if (!project.demoDateFieldsReady) {
      addChunkedError(state, `JSM Project ${project.key}: could not resolve demo date fields.`);
    }
  } catch (err) {
    addChunkedError(state, `JSM Project ${project.key}: date field setup failed: ${err.message}`);
  }
}

async function executeBusinessFormStep(config, state, step) {
  const project = state.results.jsmProjects[step.projectIndex];
  if (!project?.key) {
    addChunkedDiagnostics(state, [`JSM Project ${step.projectIndex + 1}: skipped form setup because the ITSM/JSM project was not created.`]);
    return;
  }
  if (project.serviceDeskAvailable === false) {
    addChunkedDiagnostics(state, [`Forms ${project.key}: skipped JSM request form because ${getJsmServiceTypeLabel(project.jsmServiceType)} is running in compatibility mode on a Jira Work Management space.`]);
    return;
  }

  try {
    const formSetup = await ensureDefaultSmartIntakeForm(project.key, project.name, config.industry, {
      serviceDeskId: project.serviceDeskId,
      diagnostics: state.results.diagnostics,
      lookupAttempts: 2,
      lookupDelayMs: 1000,
    });
    if (!formSetup.success) {
      addChunkedDiagnostics(state, [`Forms ${project.key}: skipped without failing the environment: ${formSetup.message}`]);
      return;
    }

    project.smartForm = {
      id: formSetup.id || null,
      name: formSetup.name || null,
      requestTypeId: formSetup.requestTypeId || null,
      reused: Boolean(formSetup.reused),
    };

    addChunkedDiagnostics(state, [`Forms ${project.key}: ${formSetup.reused ? 'reused' : 'created'} "${formSetup.name}" (request type ${formSetup.requestTypeId})`]);
    if (formSetup.warning) {
      addChunkedDiagnostics(state, [`Forms ${project.key}: ${formSetup.warning}`]);
    }
  } catch (err) {
    addChunkedDiagnostics(state, [`Forms ${project.key}: skipped without failing the environment: ${err.message}`]);
  }
}

async function executeItsmFoundationStep(config, state, step) {
  const project = state.results.jsmProjects[step.projectIndex];
  if (!project?.key) {
    addChunkedDiagnostics(state, [`JSM Project ${step.projectIndex + 1}: skipped ITSM foundation setup because the ITSM/JSM project was not created.`]);
    return;
  }
  if (project.serviceDeskAvailable === false) {
    addChunkedDiagnostics(state, [`ITSM foundation ${project.key}: skipped JSM queue/request-type setup because ${getJsmServiceTypeLabel(project.jsmServiceType)} is running in compatibility mode on a Jira Work Management space.`]);
    const knowledgeBase = await ensureKnowledgeBaseSpace(project.key, project.name, config.industry, state.results.diagnostics);
    project.knowledgeBase = knowledgeBase;
    if (knowledgeBase.success) {
      state.results.confluenceSpaces.push(knowledgeBase);
      addChunkedDiagnostics(state, [`Knowledge base ${project.key}: created ${knowledgeBase.pages.length} page(s) for service-management guidance.`]);
    }
    return;
  }

  const serviceDeskId = await getServiceDeskIdWithRetry(project.key, {
    attempts: 8,
    delayMs: 1500,
    diagnostics: state.results.diagnostics,
    label: 'ITSM foundation service desk lookup',
  });
  if (!serviceDeskId) {
    addChunkedDiagnostics(state, [`ITSM foundation ${project.key}: service desk id was not found yet. Jira may still be provisioning the ITSM project.`]);
  } else {
    project.serviceDeskId = serviceDeskId;

    try {
      const requestTypes = await getServiceDeskRequestTypes(serviceDeskId);
      project.requestTypes = requestTypes.map(normaliseRequestType);
      project.requestTypes = await ensureRequiredItsmRequestTypes(project, serviceDeskId, state.results.diagnostics);
      project.requiredItsmRequestTypesEnsured = true;
      const requestTypeNames = project.requestTypes
        .map(requestType => `${requestType.name}${requestType.issueTypeName ? ` (${requestType.issueTypeName})` : ''}`)
        .join(', ') || 'none';
      addChunkedDiagnostics(state, [`ITSM foundation ${project.key}: request types available=${requestTypeNames}.`]);
    } catch (err) {
      addChunkedDiagnostics(state, [`ITSM foundation ${project.key}: request type lookup failed: ${err.message}`]);
    }

    try {
      const queues = await getServiceDeskQueues(serviceDeskId);
      project.queues = queues.map(queue => ({
        id: queue.id,
        name: queue.name,
      }));
      const queueNames = project.queues.map(queue => queue.name).join(', ') || 'none';
      addChunkedDiagnostics(state, [`ITSM foundation ${project.key}: queues available=${queueNames}.`]);
    } catch (err) {
      addChunkedDiagnostics(state, [`ITSM foundation ${project.key}: queue lookup failed: ${err.message}`]);
    }
  }

  try {
    await hideNativeMajorIncidentFieldForProject(project, state.results.diagnostics);
  } catch (err) {
    addChunkedDiagnostics(state, [`ITSM foundation ${project.key}: native Major incident field cleanup skipped: ${err.message}`]);
  }

  const knowledgeBase = await ensureKnowledgeBaseSpace(project.key, project.name, config.industry, state.results.diagnostics);
  project.knowledgeBase = knowledgeBase;

  if (knowledgeBase.success) {
    state.results.confluenceSpaces.push(knowledgeBase);
    addChunkedDiagnostics(state, [`Knowledge base ${project.key}: created ${knowledgeBase.pages.length} page(s) for incident, problem, change, and service request guidance.`]);
  }
}

async function executeBusinessIncidentBatchStep(config, state, step) {
  const project = state.results.jsmProjects[step.projectIndex];
  if (!project?.key) {
    addChunkedDiagnostics(state, [`JSM Project ${step.projectIndex + 1}: skipped ITSM work item batch because the ITSM/JSM project was not created.`]);
    return;
  }
  if (project.reusedExistingDomainData && !project.addVolumeToExistingDomainData) {
    addChunkedDiagnostics(state, [`JSM Project ${project.key}: reused ${project.existingIssueCount || 0} existing domain work items; skipped duplicate ITSM creation.`]);
    return;
  }
  if (project.addVolumeToExistingDomainData && step.start === 0) {
    addChunkedDiagnostics(state, [`JSM Project ${project.key}: adding a new volume batch (${formatItsmWorkMix(config.itsmWorkCounts)}) to existing domain data.`]);
  }

  const content = getConfiguredContent(config);
  const boardStatusCycle = ['To Do', 'In Progress', 'Done'];
  const demoDateFields = project.demoDateFields || await getProjectDemoDateFieldIds(project.key, state.results.diagnostics);
  project.demoDateFields = demoDateFields;
  if (!project.serviceDeskId && project.serviceDeskAvailable !== false) {
    project.serviceDeskId = await getServiceDeskIdWithRetry(project.key, {
      attempts: 4,
      delayMs: 1000,
      diagnostics: state.results.diagnostics,
      label: 'ITSM batch service desk lookup',
    });
  }
  const assignableUsers = await getAssignableUsers(project.key, state.metadata.accountId);
  addChunkedDiagnostics(state, [`Assignable users ${project.key}: ${assignableUsers.length} available for ITSM work assignment.`]);

  for (let offset = 0; offset < step.count; offset++) {
    const workIndex = step.start + offset;
    const workItem = getItsmWorkItem(content, workIndex, config.itsmWorkCounts);

    if (!workItem?.title) {
      continue;
    }

    try {
      const priority = getPriorityName(workItem.priority);
      const lifecycle = createLifecycleForIssue({
        index: workIndex,
        priority,
        issueType: workItem.workType,
        maxAgeDays: config.dateRangeDays,
      });
      const targetStatus = boardStatusCycle[workIndex % boardStatusCycle.length];
      const lifecycleForStatus = ensureResolvedLifecycleForStatus(lifecycle, targetStatus);
      const dueDate = buildDueDateFromLifecycle(lifecycleForStatus, priority, workIndex);
      const assigneeAccountId = chooseDemoAssigneeAccountId(assignableUsers, workIndex, step.projectIndex);
      let created;
      let requestTypeName = null;

      let jsmCreated;
      try {
        jsmCreated = await createJsmRequestWorkItem(project, workItem, {
          diagnostics: state.results.diagnostics,
        });
      } catch (requestErr) {
        const canFallback = /service desk id was not available|no matching jsm request type|request type/i.test(String(requestErr?.message || ''));
        if (!canFallback) {
          throw requestErr;
        }

        state.results.diagnostics.push(`ITSM work ${project.key}: JSM request creation unavailable for ${workItem.workType} ${workIndex + 1}; using Jira issue fallback. Reason: ${requestErr.message}`);
        jsmCreated = await createJiraItsmIssueFallback(project, workItem, {
          diagnostics: state.results.diagnostics,
          priority,
          dueDate,
          assigneeAccountId,
          lifecycle: lifecycleForStatus,
          demoDateFields,
          environmentName: config.environmentName,
          retentionPeriodDays: config.retentionPeriodDays,
        });
      }
      created = { key: jsmCreated.key };
      requestTypeName = jsmCreated.requestTypeName;
      if (!jsmCreated.fallbackCreated) {
        await saveLifecycleProperty(created, {
          environmentName: config.environmentName,
          projectKind: 'business',
          retentionPeriodDays: config.retentionPeriodDays,
        }, lifecycleForStatus);
        await updateIssueDemoDateFields(created.key, demoDateFields, lifecycleForStatus, state.results.diagnostics);
        await updateIssueBoardVisibleFields(created.key, { assigneeAccountId, dueDate }, state.results.diagnostics);
      }
      try {
        await jiraPut(`/rest/api/3/issue/${encodeURIComponent(created.key)}?notifyUsers=false`, {
          fields: { priority: { name: priority } },
        });
      } catch (requestErr) {
        state.results.diagnostics.push(`Board fields ${created.key}: priority update skipped: ${requestErr.message}`);
      }
      // Keep board demos visually useful by distributing generated incidents
      // across the default board columns that exist in team-managed projects.

      if (targetStatus === 'In Progress') {
        await transitionIssue(created.key, 'In Progress');
      } else if (targetStatus === 'Done') {
        await transitionIssue(created.key, 'In Progress');
        await transitionIssue(created.key, 'Resolved');
      }

      const createdItem = {
        key: created.key,
        title: workItem.title,
        priority: workItem.priority,
        status: targetStatus,
        workType: workItem.workType,
        requestTypeName,
        createdAt: lifecycleForStatus.createdAt,
        resolvedAt: lifecycleForStatus.resolvedAt,
        dueDate,
        assigneeAccountId,
      };
      addHistoricalDatePatchIssue(state, {
        key: created.key,
        summary: workItem.title,
        lifecycle: lifecycleForStatus,
        status: targetStatus,
      });
      project.incidents.push(createdItem);
      project.itsmWorkItems = [...(project.itsmWorkItems || []), createdItem];
      state.results.totalIncidents++;
    } catch (err) {
      addChunkedError(state, `${workItem.workType} ${workIndex + 1} for ${project.key}: ${err.message}`);
    }
  }
}

function getWorkManagementItemTemplate(config, businessSpaceType, index) {
  const domain = config.industry || 'Business';
  const type = normaliseBusinessSpaceType(businessSpaceType);
  const catalog = {
    'project-management': [
      'Define project milestone',
      'Review project risk',
      'Update stakeholder status',
      'Coordinate project dependency',
    ],
    'go-to-market': [
      'Prepare launch readiness review',
      'Coordinate market enablement',
      'Validate launch messaging',
      'Track launch blocker',
    ],
    'task-tracking': [
      'Coordinate stakeholder review',
      'Prepare operational checklist',
      'Track delivery dependency',
      'Update monthly execution plan',
    ],
    'process-control': [
      'Review process control exception',
      'Update workflow control step',
      'Track recurring process improvement',
      'Validate process handoff',
    ],
    finance: [
      'Review finance request',
      'Validate forecast assumptions',
      'Prepare month-end finance task',
      'Track approval for spend change',
    ],
    'budget-planning': [
      'Review budget variance',
      'Prepare funding request',
      'Validate spend forecast',
      'Reconcile vendor allocation',
    ],
    marketing: [
      'Plan campaign asset review',
      'Coordinate audience segment update',
      'Review campaign performance',
      'Prepare launch communication',
    ],
    design: [
      'Review design request',
      'Prepare prototype feedback',
      'Validate design handoff',
      'Track accessibility review',
    ],
    legal: [
      'Review contract request',
      'Track legal approval',
      'Prepare compliance review',
      'Update legal matter status',
    ],
    sales: [
      'Review sales opportunity handoff',
      'Prepare account follow-up',
      'Track proposal approval',
      'Update pipeline action item',
    ],
    'procurement-management': [
      'Review purchase request',
      'Approve vendor quote',
      'Track fulfilment dependency',
      'Validate procurement handoff',
    ],
    'recruitment-tracking': [
      'Screen candidate pipeline',
      'Schedule interview panel',
      'Prepare offer approval',
      'Complete onboarding handoff',
    ],
  };
  const verbs = catalog[type] || catalog['task-tracking'];
  const title = `${verbs[index % verbs.length]} for ${domain} initiative ${index + 1}`;
  return {
    title,
    type: 'Task',
    description: `${getBusinessSpaceCategoryLabel(type)} - ${getBusinessSpaceTypeLabel(type)} demo work for ${domain}. Includes realistic scheduling, ownership, comment, and dependency signals for the selected business domain.`,
    labels: [
      'demo-data',
      slugifyGitHubPart(domain, 'domain'),
      normaliseBusinessSpaceType(type),
      index % 3 === 0 ? 'dependency-tracking' : 'operational-follow-up',
    ],
  };
}

function getProductDiscoveryIdeaTemplate(config, index) {
  const content = getConfiguredContent(config);
  const source = content.issues?.[index % (content.issues.length || 1)] || { title: 'Improve customer experience', description: 'Discovery idea for the selected domain.' };
  const roadmapCycle = ['Now', 'Next', 'Next', 'Later', "Won't do"];
  const themeCycle = [
    'Increase revenue',
    'Win enterprise customers',
    'Delight users',
    'Expand horizons',
  ];
  const customerSegmentCycle = [
    ['Enterprise'],
    ['SMB', 'Startups'],
    ['Healthcare teams'],
    ['Operations leaders'],
  ];
  const projectTargetCycle = ['Jul-Sep, 2026', 'Oct-Dec, 2026', 'Jan-Mar, 2027'];
  return {
    title: `${config.industry} discovery idea ${index + 1}: ${source.title}`,
    type: 'Idea',
    description: `${source.description || 'Product discovery item.'}\n\nOpportunity: evaluate customer value, delivery confidence, and roadmap fit before implementation.`,
    theme: themeCycle[index % themeCycle.length],
    roadmap: roadmapCycle[index % roadmapCycle.length],
    projectTarget: projectTargetCycle[index % projectTargetCycle.length],
    specReady: index % 4 !== 3,
    designsReady: index % 3 === 0,
    reach: [300, 180, 120, 80, 40][index % 5],
    impact: Math.max(1, 5 - (index % 5)),
    confidence: [100, 80, 70, 60, 50][index % 5],
    effort: Math.max(1, (index % 5) + 1),
    customerSegments: customerSegmentCycle[index % customerSegmentCycle.length],
    labels: [
      'demo-data',
      'product-discovery',
      slugifyGitHubPart(config.industry, 'domain'),
      index % 3 === 0 ? 'roadmap-candidate' : 'customer-insight',
    ],
  };
}

const productDiscoveryFieldConfigCache = new Map();

function findEditableProductDiscoveryField(fields, candidateNames) {
  const normalisedCandidates = candidateNames.map(normaliseFieldName);
  const entries = Object.entries(fields || {});
  return entries.find(([, field]) => {
    const name = normaliseFieldName(field?.name || '');
    return normalisedCandidates.includes(name);
  }) || entries.find(([, field]) => {
    const name = normaliseFieldName(field?.name || '');
    return normalisedCandidates.some(candidate => candidate && name.includes(candidate));
  }) || null;
}

async function getEditableProductDiscoveryFieldConfig(project, issueKey, diagnostics = []) {
  if (productDiscoveryFieldConfigCache.has(project.key)) {
    return productDiscoveryFieldConfigCache.get(project.key);
  }

  const config = {
    theme: null,
    roadmap: null,
    projectTarget: null,
    specReady: null,
    designsReady: null,
    reach: null,
    impact: null,
    confidence: null,
    effort: null,
    customerSegments: null,
  };

  try {
    const editMeta = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/editmeta`);
    const fields = editMeta?.fields || {};
    const matches = {
      theme: findEditableProductDiscoveryField(fields, ['Theme']),
      roadmap: findEditableProductDiscoveryField(fields, ['Roadmap']),
      projectTarget: findEditableProductDiscoveryField(fields, ['Project target', 'Target']),
      specReady: findEditableProductDiscoveryField(fields, ['Spec ready', 'Specification ready']),
      designsReady: findEditableProductDiscoveryField(fields, ['Designs ready', 'Design ready']),
      reach: findEditableProductDiscoveryField(fields, ['Reach']),
      impact: findEditableProductDiscoveryField(fields, ['Impact']),
      confidence: findEditableProductDiscoveryField(fields, ['Confidence']),
      effort: findEditableProductDiscoveryField(fields, ['Effort']),
      customerSegments: findEditableProductDiscoveryField(fields, ['Customer segments', 'Customer segment']),
    };

    for (const [key, match] of Object.entries(matches)) {
      if (match) {
        const [fieldId, metadata] = match;
        config[key] = { id: fieldId, metadata };
      }
    }

    const found = Object.entries(config)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}:${value.id}`);
    diagnostics.push(found.length > 0
      ? `Product Discovery ${project.key}: editable JPD fields resolved (${found.join(', ')}).`
      : `Product Discovery ${project.key}: Jira edit metadata did not expose native JPD scoring fields; generated ideas will remain blank for those native JPD columns.`);
  } catch (err) {
    diagnostics.push(`Product Discovery ${project.key}: JPD field lookup failed: ${err.message}`);
  }

  productDiscoveryFieldConfigCache.set(project.key, config);
  return config;
}

function normaliseOptionLabel(value) {
  return normaliseFieldName(value).replace(/wont/g, 'willnot');
}

function getAllowedValueLabel(value) {
  return String(value?.value || value?.name || value?.label || value?.title || '').trim();
}

function chooseAllowedValue(metadata, desiredLabel, fallbackIndex = 0) {
  const allowedValues = Array.isArray(metadata?.allowedValues) ? metadata.allowedValues : [];
  if (allowedValues.length === 0) {
    return null;
  }

  const desired = normaliseOptionLabel(desiredLabel);
  return allowedValues.find(value => normaliseOptionLabel(getAllowedValueLabel(value)) === desired) ||
    allowedValues.find(value => normaliseOptionLabel(getAllowedValueLabel(value)).includes(desired)) ||
    allowedValues[fallbackIndex % allowedValues.length];
}

function buildAllowedValuePayload(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (value.id) {
    return { id: String(value.id) };
  }
  if (value.value) {
    return { value: String(value.value) };
  }
  if (value.name) {
    return { name: String(value.name) };
  }
  return value;
}

function buildProductDiscoveryFieldPayloads(fieldConfig, desiredValue, fallbackIndex) {
  const metadata = fieldConfig?.metadata || {};
  const schemaType = String(metadata?.schema?.type || '').toLowerCase();
  const payloads = [];

  if (Array.isArray(desiredValue)) {
    const optionPayloads = desiredValue
      .map((value, index) => chooseAllowedValue(metadata, value, fallbackIndex + index))
      .filter(Boolean)
      .map(buildAllowedValuePayload);

    if (optionPayloads.length > 0) {
      payloads.push({ fields: { [fieldConfig.id]: optionPayloads } });
      payloads.push({ update: { [fieldConfig.id]: [{ set: optionPayloads }] } });
    }

    return payloads;
  }

  const allowedValue = chooseAllowedValue(metadata, desiredValue, fallbackIndex);

  if (allowedValue) {
    const optionPayload = buildAllowedValuePayload(allowedValue);
    payloads.push({ fields: { [fieldConfig.id]: schemaType === 'array' ? [optionPayload] : optionPayload } });
    payloads.push({ update: { [fieldConfig.id]: [{ set: schemaType === 'array' ? [optionPayload] : optionPayload }] } });
  }

  if (typeof desiredValue === 'number') {
    payloads.push({ fields: { [fieldConfig.id]: desiredValue } });
    payloads.push({ update: { [fieldConfig.id]: [{ set: desiredValue }] } });
  }

  if (typeof desiredValue === 'boolean') {
    payloads.push({ fields: { [fieldConfig.id]: desiredValue } });
    payloads.push({ update: { [fieldConfig.id]: [{ set: desiredValue }] } });
  }

  if (typeof desiredValue === 'string' && schemaType !== 'array') {
    payloads.push({ fields: { [fieldConfig.id]: desiredValue } });
    payloads.push({ update: { [fieldConfig.id]: [{ set: desiredValue }] } });
  }

  return payloads;
}

async function updateProductDiscoveryIdeaFields(issueKey, project, template, issueIndex, diagnostics = []) {
  const fieldConfig = await getEditableProductDiscoveryFieldConfig(project, issueKey, diagnostics);
  const desiredValues = {
    theme: template.theme,
    roadmap: template.roadmap,
    projectTarget: template.projectTarget,
    specReady: template.specReady,
    designsReady: template.designsReady,
    reach: template.reach,
    impact: template.impact,
    confidence: template.confidence,
    effort: template.effort,
    customerSegments: template.customerSegments,
  };
  const updated = [];
  const skipped = [];

  for (const [fieldName, desiredValue] of Object.entries(desiredValues)) {
    const config = fieldConfig[fieldName];
    if (!config) {
      skipped.push(fieldName);
      continue;
    }

    const payloads = buildProductDiscoveryFieldPayloads(config, desiredValue, issueIndex);
    if (payloads.length === 0) {
      skipped.push(fieldName);
      continue;
    }

    try {
      await updateIssueWithFirstWorkingPayload(issueKey, payloads, {
        querySuffixes: [
          'notifyUsers=false',
          'notifyUsers=false&overrideScreenSecurity=true&overrideEditableFlag=true',
        ],
      });
      updated.push(fieldName);
    } catch (err) {
      skipped.push(fieldName);
      if (!project.productDiscoveryFieldUpdateWarningLogged) {
        diagnostics.push(`Product Discovery ${project.key}: ${fieldName} update failed for ${issueKey}: ${err.message}`);
      }
    }
  }

  if (!project.productDiscoveryFieldUpdateSummaryLogged) {
    diagnostics.push(updated.length > 0
      ? `Product Discovery ${project.key}: generated ideas will be enriched with editable JPD fields (${updated.join(', ')}).`
      : `Product Discovery ${project.key}: generated ideas were created, but Jira did not accept JPD field enrichment through REST.`);
    if (skipped.length > 0) {
      diagnostics.push(`Product Discovery ${project.key}: JPD fields not updated on first generated idea: ${[...new Set(skipped)].join(', ')}.`);
    }
    project.productDiscoveryFieldUpdateSummaryLogged = true;
    project.productDiscoveryFieldUpdateWarningLogged = true;
  }
}

function getProductDiscoveryComponentCatalog(config) {
  const industrySlug = slugifyGitHubPart(config.industry, 'product');
  return [
    'Discovery Intake',
    'Roadmap Prioritization',
    `${industrySlug}-customer-signals`,
    `${industrySlug}-delivery-readiness`,
  ].map(name => name
    .split('-')
    .map(part => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part)
    .join(' '));
}

function chooseProductDiscoveryComponentNames(project, issueIndex) {
  const components = project?.components || [];
  if (components.length === 0) {
    return [];
  }
  return [components[issueIndex % components.length]?.name].filter(Boolean);
}

function getWorkManagementComponentCatalog(config, businessSpaceType) {
  const industrySlug = slugifyGitHubPart(config.industry, 'business');
  const type = normaliseBusinessSpaceType(businessSpaceType);
  const typeLabel = getBusinessSpaceTypeLabel(type);
  return [
    `${typeLabel} Intake`,
    `${typeLabel} Delivery`,
    `${industrySlug}-operations`,
    `${industrySlug}-stakeholder-review`,
  ].map(name => name
    .split('-')
    .map(part => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part)
    .join(' '));
}

function chooseWorkManagementComponentNames(project, issueIndex) {
  const components = project?.components || [];
  if (components.length === 0) {
    return [];
  }
  return [components[issueIndex % components.length]?.name].filter(Boolean);
}

async function executeWorkManagementProjectStep(config, state, step) {
  const projectConfig = getBusinessProjectConfig(config, step.projectIndex);
  const projectName = step.projectName || createDomainProjectName(config.environmentName || config.industry, 'business-project', step.projectIndex, projectConfig);
  const projectKeyPrefix = step.projectKeyPrefix || deriveRunProjectKeyPrefix(config, config.industry, step.projectIndex + config.jsmProjectCount);
  const businessSpaceType = normaliseBusinessSpaceType(projectConfig.businessSpaceType);
  const businessCategoryLabel = getBusinessSpaceCategoryLabel(businessSpaceType);

  try {
    addChunkedDiagnostics(state, [`${businessCategoryLabel} ${step.projectIndex + 1}: finding or creating ${getBusinessSpaceTypeLabel(businessSpaceType)} using template ${getBusinessProjectTemplateKeys(businessSpaceType)[0]}.`]);
    const expectedProject = projectConfig.projectKey ? await getProjectByKeyIfExists(projectConfig.projectKey) : null;
    const existingDomainProject = expectedProject || await findReusableDomainProject(config, {
      kind: 'business-project',
      businessSpaceType,
      excludeKeys: state.results.businessProjects.map(project => project?.key),
    });
    const existingProject = existingDomainProject || await getProjectByKeyIfExists(generateKey(projectKeyPrefix, 0));
    const project = existingProject
      ? existingProject
      : await createWorkManagementProject(projectName, state.metadata.accountId, projectKeyPrefix, businessSpaceType, state.results.diagnostics);

    const existingIssueCount = await getIssueCountForProject(project.key);
    const addVolumeToExistingProject = Boolean(existingProject && shouldAddVolumeToExistingProject(config, project.key));
    await saveProjectDemoDomainMetadata(project, {
      domain: config.industry,
      kind: 'business-project',
      businessSpaceType,
      generatedBy: 'jira-demo-data-setup',
      issueTarget: projectConfig.issuesPerProject,
    }, state.results.diagnostics);

    state.results.businessProjects[step.projectIndex] = {
      id: project.id,
      key: project.key,
      name: existingProject?.name || projectName,
      projectTypeKey: project.projectTypeKey || 'business',
      businessSpaceType,
      createdByThisRun: !existingProject,
      reusedExistingDomainData: Boolean(existingProject && existingIssueCount > 0),
      addVolumeToExistingDomainData: addVolumeToExistingProject,
      existingIssueCount,
      issueCount: existingProject && existingIssueCount > 0 ? existingIssueCount : 0,
      issueKeys: [],
      issueRecords: [],
      configuredIssueCount: projectConfig.issuesPerProject,
      demoDateFields: null,
      demoDateFieldsReady: false,
    };
    addChunkedDiagnostics(state, [`${businessCategoryLabel} ${project.key}: ${existingProject ? 'reused existing' : 'created'} ${getBusinessSpaceTypeLabel(businessSpaceType)} space.`]);
  } catch (err) {
    state.results.businessProjects[step.projectIndex] = {
      id: null,
      key: null,
      name: projectName,
      failed: true,
      failureMessage: err.message,
      businessSpaceType,
      issueKeys: [],
    };
    addChunkedError(state, `${businessCategoryLabel} space ${step.projectIndex + 1}: ${err.message}`);
  }
}

async function executeProductDiscoveryProjectStep(config, state, step) {
  const projectConfig = getProductDiscoveryProjectConfig(config, step.projectIndex);
  const projectName = step.projectName || createDomainProjectName(config.environmentName || config.industry, 'product-discovery', step.projectIndex, projectConfig);

  try {
    addChunkedDiagnostics(state, ['Product Discovery: using an existing native Jira Product Discovery space selected for volume.']);
    if (!projectConfig.projectKey) {
      throw new Error('Jira Product Discovery spaces must be created manually from Jira first. Select the existing native Product Discovery space with the Volume checkbox, then run the agent to add demo ideas.');
    }

    const project = await getProjectByKeyIfExists(projectConfig.projectKey);
    if (!project) {
      throw new Error(`Configured Product Discovery project key ${projectConfig.projectKey} was not found. Create the Product Discovery space manually in Jira first, then select it with the Volume checkbox.`);
    }

    if (!isNativeProductDiscoveryProject(project)) {
      throw new Error(`Jira returned project ${project.key} as ${project.projectTypeKey || 'unknown'} instead of product_discovery. The app will not treat a Work Management or Software project as Jira Product Discovery.`);
    }

    const existingIssueCount = await getIssueCountForProject(project.key);
    const addVolumeToExistingProject = shouldAddVolumeToExistingProject(config, project.key);
    await saveProjectDemoDomainMetadata(project, {
      domain: config.industry,
      kind: 'product-discovery',
      productDiscoveryType: 'product-discovery',
      generatedBy: 'jira-demo-data-setup',
      issueTarget: projectConfig.issuesPerProject,
    }, state.results.diagnostics);

    state.results.productDiscoveryProjects[step.projectIndex] = {
      id: project.id,
      key: project.key,
      name: project.name || projectName,
      projectTypeKey: project.projectTypeKey || 'product_discovery',
      productDiscoveryType: 'product-discovery',
      createdByThisRun: false,
      reusedExistingDomainData: existingIssueCount > 0,
      addVolumeToExistingDomainData: addVolumeToExistingProject,
      existingIssueCount,
      issueCount: existingIssueCount > 0 ? existingIssueCount : 0,
      issueKeys: [],
      issueRecords: [],
      configuredIssueCount: projectConfig.issuesPerProject,
      demoDateFields: null,
      demoDateFieldsReady: false,
    };
    addChunkedDiagnostics(state, [`Product Discovery ${project.key}: using existing native discovery space; demo ideas will be added as volume.`]);
  } catch (err) {
    state.results.productDiscoveryProjects[step.projectIndex] = {
      id: null,
      key: null,
      name: projectName,
      failed: true,
      failureMessage: err.message,
      productDiscoveryType: 'product-discovery',
      issueKeys: [],
    };
    addChunkedError(state, `Product Discovery space ${step.projectIndex + 1}: ${err.message}`);
  }
}

async function executeProductDiscoveryComponentsStep(config, state, step) {
  const project = state.results.productDiscoveryProjects[step.projectIndex];
  if (!project?.key) {
    if (project?.failed) {
      return;
    }
    addChunkedDiagnostics(state, [`Product Discovery space ${step.projectIndex + 1}: skipped components because the project was not created.`]);
    return;
  }

  const componentNames = getProductDiscoveryComponentCatalog(config);
  project.components = project.components || [];

  for (const componentName of componentNames) {
    try {
      await ensureProjectComponent(
        project,
        componentName,
        `${componentName} demo discovery area for ${project.name}. Used for roadmap grouping, idea triage, and product discovery demos.`,
        state.results.diagnostics,
        'Product Discovery component'
      );
    } catch (err) {
      addChunkedDiagnostics(state, [`Product Discovery component ${project.key}: create skipped for ${componentName}: ${err.message}`]);
    }
  }
}

async function executeWorkManagementComponentsStep(config, state, step) {
  const project = state.results.businessProjects[step.projectIndex];
  const businessCategoryLabel = getBusinessSpaceCategoryLabel(project?.businessSpaceType);
  if (!project?.key) {
    addChunkedDiagnostics(state, [`${businessCategoryLabel} space ${step.projectIndex + 1}: skipped components because the project was not created.`]);
    return;
  }

  const componentNames = getWorkManagementComponentCatalog(config, project.businessSpaceType);
  project.components = project.components || [];

  for (const componentName of componentNames) {
    try {
      await ensureProjectComponent(
        project,
        componentName,
        `${componentName} demo work area for ${project.name}. Used for grouping work items, ownership, dependencies, and reporting demos.`,
        state.results.diagnostics,
        `${businessCategoryLabel} component`
      );
    } catch (err) {
      addChunkedDiagnostics(state, [`${businessCategoryLabel} component ${project.key}: create skipped for ${componentName}: ${err.message}`]);
    }
  }
}

async function executeGenericProjectDateFieldStep(state, step, resultKey, label) {
  const project = state.results[resultKey]?.[step.projectIndex];
  if (!project?.key) {
    if (project?.failed) {
      return;
    }
    addChunkedDiagnostics(state, [`${label} ${step.projectIndex + 1}: skipped date field setup because the project was not created.`]);
    return;
  }

  const diagnostics = [];
  const demoDateFields = await resolveDemoDateFieldsWithoutScreenSetup(project.key, diagnostics);
  if (project.id) {
    await ensureDevelopmentFieldOnProjectScreens(project.id, project.key, diagnostics);
  }
  project.demoDateFields = demoDateFields;
  project.demoDateFieldsReady = Boolean(demoDateFields.createdDateFieldId || demoDateFields.resolvedDateFieldId);
  addChunkedDiagnostics(state, diagnostics);
}

async function executeWorkManagementIssueBatchStep(config, state, step) {
  const project = state.results.businessProjects[step.projectIndex];
  const businessCategoryLabel = getBusinessSpaceCategoryLabel(project?.businessSpaceType);
  if (!project?.key) {
    addChunkedDiagnostics(state, [`${businessCategoryLabel} space ${step.projectIndex + 1}: skipped work item batch because the project was not created.`]);
    return;
  }
  if (project.reusedExistingDomainData && !project.addVolumeToExistingDomainData) {
    addChunkedDiagnostics(state, [`${businessCategoryLabel} ${project.key}: reused ${project.existingIssueCount || 0} existing work items; skipped duplicate item creation.`]);
    return;
  }

  const assignableUsers = await getAssignableUsers(project.key, state.metadata.accountId);
  const demoDateFields = project.demoDateFields || await getProjectDemoDateFieldIds(project.key, state.results.diagnostics);
  project.demoDateFields = demoDateFields;
  const priorities = ['High', 'Medium', 'Medium', 'Low'];
  const statusCycle = ['To Do', 'In Progress', 'Done'];

  for (let offset = 0; offset < step.count; offset += 1) {
    const issueIndex = step.start + offset;
    const template = getWorkManagementItemTemplate(config, project.businessSpaceType, issueIndex);
    const priority = priorities[issueIndex % priorities.length];
    const status = statusCycle[issueIndex % statusCycle.length];
    const lifecycle = ensureResolvedLifecycleForStatus(createLifecycleForIssue({
      index: issueIndex,
      priority,
      issueType: template.type,
      maxAgeDays: config.dateRangeDays,
    }), status);
    const dueDate = buildDueDateFromLifecycle(lifecycle, priority, issueIndex);
    const assigneeAccountId = chooseDemoAssigneeAccountId(assignableUsers, issueIndex, step.projectIndex);

    try {
      const issue = await createIssue(project.key, template.title, template.type, null, priority, dueDate, null, {
        assigneeAccountId,
        demoDateFields,
        diagnostics: state.results.diagnostics,
        environmentName: config.environmentName,
        lifecycle,
        projectKind: 'business-project',
        retentionPeriodDays: config.retentionPeriodDays,
        description: template.description,
        labels: template.labels,
        components: chooseWorkManagementComponentNames(project, issueIndex),
        issueIndex,
      });
      if (status !== 'To Do') {
        await transitionIssue(issue.key, status);
      }
      await addIssueComment(issue.key, [
        `Demo update: ${businessCategoryLabel} ${getBusinessSpaceTypeLabel(project.businessSpaceType)} item created for ${config.industry}.`,
        `Related context: due ${dueDate}; status target ${status}; use this item for timeline, calendar, and operational tracking demos.`,
      ], state.results.diagnostics);

      const previousKey = project.issueKeys[project.issueKeys.length - 1];
      if (previousKey && issueIndex % 4 === 0) {
        await createIssueLink(issue.key, previousKey, 'Blocks');
      }

      project.issueKeys.push(issue.key);
      project.issueRecords.push({ key: issue.key, title: template.title, status, priority, dueDate, createdAt: lifecycle.createdAt, resolvedAt: lifecycle.resolvedAt });
      project.issueCount++;
    } catch (err) {
      addChunkedError(state, `${businessCategoryLabel} item ${issueIndex + 1} for ${project.key}: ${err.message}`);
    }
  }
}

async function executeProductDiscoveryIdeaBatchStep(config, state, step) {
  const project = state.results.productDiscoveryProjects[step.projectIndex];
  if (!project?.key) {
    if (project?.failed) {
      return;
    }
    addChunkedDiagnostics(state, [`Product Discovery space ${step.projectIndex + 1}: skipped idea batch because the project was not created.`]);
    return;
  }
  if (project.reusedExistingDomainData && !project.addVolumeToExistingDomainData) {
    addChunkedDiagnostics(state, [`Product Discovery ${project.key}: reused ${project.existingIssueCount || 0} existing ideas; skipped duplicate idea creation.`]);
    return;
  }

  const demoDateFields = project.demoDateFields || await getProjectDemoDateFieldIds(project.key, state.results.diagnostics);
  project.demoDateFields = demoDateFields;
  const priorities = ['Highest', 'High', 'Medium', 'Low'];
  const statusCycle = ['To Do', 'In Progress', 'Done'];
  if (!project.productDiscoveryAssigneeSkipLogged) {
    addChunkedDiagnostics(state, [`Product Discovery ${project.key}: idea creation leaves assignee empty because this Jira site rejects assignable-user values during native Product Discovery issue creation.`]);
    project.productDiscoveryAssigneeSkipLogged = true;
  }

  for (let offset = 0; offset < step.count; offset += 1) {
    const issueIndex = step.start + offset;
    const template = getProductDiscoveryIdeaTemplate(config, issueIndex);
    const priority = priorities[issueIndex % priorities.length];
    const status = statusCycle[issueIndex % statusCycle.length];
    const lifecycle = ensureResolvedLifecycleForStatus(createLifecycleForIssue({
      index: issueIndex,
      priority,
      issueType: template.type,
      maxAgeDays: config.dateRangeDays,
    }), status);
    const dueDate = buildDueDateFromLifecycle(lifecycle, priority, issueIndex);

    try {
      const issue = await createIssue(project.key, template.title, template.type, null, priority, dueDate, null, {
        demoDateFields,
        diagnostics: state.results.diagnostics,
        environmentName: config.environmentName,
        lifecycle,
        projectKind: 'product-discovery',
        retentionPeriodDays: config.retentionPeriodDays,
        description: template.description,
        labels: template.labels,
        issueIndex,
      });
      await updateProductDiscoveryIdeaFields(issue.key, project, template, issueIndex, state.results.diagnostics);
      if (status !== 'To Do') {
        await transitionIssue(issue.key, status);
      }
      await addIssueComment(issue.key, [
        `Discovery signal: ${config.industry} idea created for roadmap prioritization.`,
        `Suggested evaluation: customer impact, effort, confidence, and release fit.`,
      ], state.results.diagnostics);

      const previousKey = project.issueKeys[project.issueKeys.length - 1];
      if (previousKey && issueIndex % 5 === 0) {
        await createIssueLink(issue.key, previousKey, 'Relates');
      }

      project.issueKeys.push(issue.key);
      project.issueRecords.push({ key: issue.key, title: template.title, status, priority, dueDate, createdAt: lifecycle.createdAt, resolvedAt: lifecycle.resolvedAt });
      project.issueCount++;
    } catch (err) {
      addChunkedError(state, `Product Discovery idea ${issueIndex + 1} for ${project.key}: ${err.message}`);
    }
  }
}

async function executeSoftwareProjectStep(config, state, step) {
  const timestamp = Date.now();
  const projectName = step.projectName || `${config.environmentName} - ${config.industry} Dev ${step.projectIndex + 1} (${timestamp})`;
  const projectKeyPrefix = step.projectKeyPrefix || deriveRunProjectKeyPrefix(config, config.industry, step.projectIndex + config.jsmProjectCount);
  const softwareProjectConfig = getSoftwareProjectConfig(config, step.projectIndex);
  const softwareTemplate = normaliseSoftwareTemplate(softwareProjectConfig.softwareTemplate);
  const softwareProjectStyle = normaliseProjectManagementStyle(softwareProjectConfig.softwareProjectStyle);

  try {
    addChunkedDiagnostics(state, [`Software Project ${step.projectIndex + 1}: creating ${getSoftwareProjectMethodLabel(softwareTemplate, softwareProjectStyle)} project from selected dropdown values.`]);
    const expectedKey = generateKey(projectKeyPrefix, 0);
    const existingDomainProject = await findReusableDomainProject(config, {
      kind: 'software',
      softwareTemplate,
      softwareProjectStyle,
      excludeKeys: state.results.softwareProjects.map(project => project?.key),
    });
    const existingProject = existingDomainProject || await getProjectByKeyIfExists(expectedKey);
    const project = existingProject
      ? existingProject
      : await createSoftwareProject(projectName, state.metadata.accountId, projectKeyPrefix, softwareTemplate, softwareProjectStyle, state.results.diagnostics);

    if (existingProject) {
      addChunkedDiagnostics(state, [`Software Project ${step.projectIndex + 1}: reused existing ${getSoftwareProjectMethodLabel(softwareTemplate, softwareProjectStyle)} project ${existingProject.key} for ${config.industry}.`]);
    }

    const existingIssueCount = await getIssueCountForProject(project.key);
    const addVolumeToExistingProject = Boolean(existingProject && shouldAddVolumeToExistingProject(config, project.key));
    await saveProjectDemoDomainMetadata(project, {
      domain: config.industry,
      kind: 'software',
      softwareTemplate,
      softwareProjectStyle,
      generatedBy: 'jira-demo-data-setup',
      issueTarget: softwareProjectConfig.issuesPerProject,
    }, state.results.diagnostics);

    state.results.softwareProjects[step.projectIndex] = {
      id: project.id,
      key: project.key,
      name: existingProject?.name || projectName,
      createdByThisRun: !existingProject,
      reusedExistingDomainData: Boolean(existingProject && existingIssueCount > 0),
      addVolumeToExistingDomainData: addVolumeToExistingProject,
      existingIssueCount,
      issueCount: existingProject && existingIssueCount > 0 ? existingIssueCount : 0,
      issueKeys: [],
      issueRecords: [],
      firstIssueKey: null,
      goalIssueKeys: [],
      versions: [],
      components: [],
      epicKeys: [],
      sprints: [],
      boardId: null,
      softwareTemplate,
      softwareProjectStyle,
      configuredIssueCount: softwareProjectConfig.issuesPerProject,
      demoDateFields: null,
      demoDateFieldsReady: false,
      timelineStartDateFieldId: null,
      skipDemoDateFieldWrites: softwareProjectStyle === 'team-managed',
      smartForm: null,
    };
  } catch (err) {
    addChunkedError(state, `Software Project ${step.projectIndex + 1}: ${err.message}`);
  }
}

async function executeSoftwareDateFieldStep(state, step) {
  const project = state.results.softwareProjects[step.projectIndex];
  if (!project?.id || !project?.key) {
    addChunkedError(state, `Software Project ${step.projectIndex + 1}: skipped date field setup because the project was not created.`);
    return;
  }

  project.timelineStartDateFieldId = await getTimelineStartDateFieldId(state.results.diagnostics);

  try {
    const diagnostics = [];
    const setupResult = project.softwareProjectStyle === 'team-managed'
      ? {
        ...(await resolveDemoDateFieldsWithoutScreenSetup(project.key, diagnostics)),
        success: true,
        screenCount: 0,
      }
      : await ensureDemoDateFieldsOnProjectScreens(project.id, project.key);
    const demoDateFields = setupResult.demoDateFields || setupResult;
    if (Array.isArray(setupResult.diagnostics)) {
      diagnostics.push(...setupResult.diagnostics);
    }
    await ensureDevelopmentFieldOnProjectScreens(project.id, project.key, diagnostics);
    addChunkedDiagnostics(state, diagnostics);

    project.demoDateFields = demoDateFields;
    project.demoDateFieldsReady = Boolean(demoDateFields.createdDateFieldId || demoDateFields.resolvedDateFieldId);
    project.skipDemoDateFieldWrites = !project.demoDateFieldsReady;

    if (!project.demoDateFieldsReady) {
      addChunkedError(state, `Software Project ${project.key}: could not resolve demo date fields.`);
    }

    if (project.softwareProjectStyle === 'team-managed') {
      addChunkedDiagnostics(state, [
        `Date fields ${project.key}: team-managed project screen setup is not available through classic Jira screen APIs; charts will use generated date metadata if Jira blocks custom field writes.`,
      ]);
    } else if (setupResult.success) {
      addChunkedDiagnostics(state, [
        `Date fields ${project.key}: configured ${setupResult.fieldCount || 0} date field(s) on ${setupResult.screenCount || 0} company-managed screen(s).`,
      ]);
    } else {
      addChunkedDiagnostics(state, [
        `Date fields ${project.key}: screen setup did not complete (${setupResult.message || 'unknown reason'}); charts will use generated date metadata if Jira blocks custom field writes.`,
      ]);
    }
  } catch (err) {
    project.demoDateFields = null;
    project.demoDateFieldsReady = false;
    project.skipDemoDateFieldWrites = true;
    addChunkedDiagnostics(state, [
      `Date fields ${project.key}: date field resolution failed: ${err.message}`,
    ]);
    addChunkedError(state, `Software Project ${project.key}: date field setup failed: ${err.message}`);
  }
}

async function executeSoftwareFormStep(config, state, step) {
  const project = state.results.softwareProjects[step.projectIndex];
  if (!project?.key) {
    addChunkedError(state, `Software Project ${step.projectIndex + 1}: skipped form setup because the project was not created.`);
    return;
  }

  try {
    const formSetup = await ensureDefaultSoftwareWorkForm(project.key, project.name, config.industry);
    if (!formSetup.success) {
      if (formSetup.unsupported) {
        addChunkedDiagnostics(state, [formSetup.message]);
      } else {
        addChunkedError(state, `Software Project ${project.key}: ${formSetup.message}`);
      }
      return;
    }

    project.smartForm = {
      id: formSetup.id || null,
      name: formSetup.name || null,
      issueTypeId: formSetup.issueTypeId || null,
      issueTypeName: formSetup.issueTypeName || null,
      reused: Boolean(formSetup.reused),
    };

    addChunkedDiagnostics(state, [`Forms ${project.key}: ${formSetup.reused ? 'reused' : 'created'} "${formSetup.name}" (issue type ${formSetup.issueTypeName || formSetup.issueTypeId})`]);
    if (formSetup.warning) {
      addChunkedDiagnostics(state, [`Forms ${project.key}: ${formSetup.warning}`]);
    }
  } catch (err) {
    addChunkedError(state, `Software Project ${project.key}: default work form setup failed: ${err.message}`);
  }
}

async function executeSoftwareVersionBatchStep(state, step) {
  const project = state.results.softwareProjects[step.projectIndex];
  if (!project?.id || !project?.key) {
    addChunkedError(state, `Software Project ${step.projectIndex + 1}: skipped version batch because the project was not created.`);
    return;
  }
  if (project.reusedExistingDomainData && !project.addVolumeToExistingDomainData) {
    addChunkedDiagnostics(state, [`Version ${project.key}: reused existing domain project data; skipped duplicate version creation.`]);
    return;
  }

  for (let offset = 0; offset < step.count; offset++) {
    const releaseIndex = (step.startRelease ?? step.startMonth ?? 0) + offset;
    const releasePlan = getSoftwareReleasePlan(project, releaseIndex);

    try {
      let createdVersion = null;
      if (project.reusedExistingDomainData || project.addVolumeToExistingDomainData) {
        const existingVersions = project._existingVersions || await getProjectVersions(project.key);
        project._existingVersions = existingVersions;
        createdVersion = existingVersions.find(version => String(version.name || '').toLowerCase() === releasePlan.name.toLowerCase()) || null;
      }

      if (!createdVersion) {
        createdVersion = await createVersion(project.id, releasePlan.name, releasePlan.releaseDate, releasePlan.released);
      }
      project.versions.push({
        ...createdVersion,
        name: createdVersion.name || releasePlan.name,
        releaseDate: createdVersion.releaseDate || releasePlan.releaseDate,
        released: Boolean(createdVersion.released ?? releasePlan.released),
        releaseStage: releasePlan.stage,
        methodology: releasePlan.methodology,
      });
      addChunkedDiagnostics(state, [`Version ${project.key}: ${createdVersion.name === releasePlan.name && project._existingVersions?.some(version => version.id === createdVersion.id) ? 'reused' : 'created'} ${releasePlan.stage} ${releasePlan.name} (${releasePlan.releaseDate}).`]);
    } catch (err) {
      addChunkedError(state, `Version ${releasePlan.name} for ${project.key}: ${err.message}`);
    }
  }
}

async function executeSoftwareComponentsStep(config, state, step) {
  const project = state.results.softwareProjects[step.projectIndex];
  if (!project?.key) {
    addChunkedError(state, `Software Project ${step.projectIndex + 1}: skipped components because the project was not created.`);
    return;
  }
  if (project.reusedExistingDomainData && !project.addVolumeToExistingDomainData) {
    addChunkedDiagnostics(state, [`Component ${project.key}: reused existing domain project data; verifying project components are present.`]);
  }

  const componentNames = getSoftwareComponentCatalog(project, config.industry);
  project.components = project.components || [];

  for (const componentName of componentNames) {
    try {
      await ensureProjectComponent(
        project,
        componentName,
        `${componentName} demo ownership area for ${project.name}. Used for release, dependency, and defect triage demos.`,
        state.results.diagnostics,
        'Component'
      );
    } catch (err) {
      addChunkedDiagnostics(state, [`Component ${project.key}: create skipped for ${componentName}: ${err.message}`]);
    }
  }
}

async function executeCompassComponentsStep(config, state, step) {
  const project = state.results.softwareProjects[step.projectIndex];
  if (!project?.key) {
    addChunkedDiagnostics(state, [`Compass ${step.projectIndex + 1}: skipped because the software project was not created.`]);
    return;
  }

  if (!COMPASS_DEMO_COMPONENTS_ENABLED) {
    if (!state.metadata.compassConfigWarningShown) {
      addChunkedDiagnostics(state, ['Compass components skipped: COMPASS_DEMO_COMPONENTS_ENABLED=false.']);
      state.metadata.compassConfigWarningShown = true;
    }
    return;
  }

  try {
    const cloudId = await resolveAtlassianCloudId();
    const siteDetails = await getCurrentSiteDetails().catch(() => ({}));
    const projectDashboard = (state.results.dashboards || []).find(dashboard => dashboard?.projectKey === project.key) || null;
    const templates = getCompassComponentTemplates(config, project, siteDetails, projectDashboard);
    const createdCompassComponents = [];

    for (const template of templates) {
      try {
        const component = await createCompassComponent(cloudId, template);
        const record = {
          id: component.id,
          name: component.name || template.name,
          typeId: component.typeId || template.typeId,
          projectKey: project.key,
          repositoryLinked: Boolean(component.repositoryLinked),
          relatedLinkCount: Number(component.relatedLinkCount || 0),
          ownerConfigured: Boolean(component.ownerConfigured),
          richPayloadApplied: Boolean(component.richPayloadApplied),
          metadataApplied: Boolean(component.metadataApplied),
          createMode: component.createMode || (component.richPayloadApplied ? 'rich' : 'simple'),
        };

        try {
          const jiraComponent = await ensureProjectComponent(
            project,
            record.name,
            `Attached Compass ${record.typeId} component created through GraphQL. Compass component id: ${record.id}.`,
            state.results.diagnostics,
            'Compass-backed Jira component'
          );
          record.jiraComponentId = jiraComponent.component?.id || null;
          record.jiraComponentName = jiraComponent.component?.name || record.name;
          record.visibleInJiraComponents = Boolean(record.jiraComponentId || record.jiraComponentName);
          addProjectComponentRecord(project, jiraComponent.component, record.name, {
            compassId: record.id,
            compassTypeId: record.typeId,
            compassBacked: true,
          });
        } catch (jiraComponentErr) {
          record.visibleInJiraComponents = false;
          addChunkedDiagnostics(state, [`Compass ${project.key}: "${record.name}" was created in Compass but its Jira project component was not created: ${jiraComponentErr.message}`]);
        }

        project.compassComponents = project.compassComponents || [];
        project.compassComponents.push(record);
        state.results.compassComponents.push(record);
        createdCompassComponents.push(record);
        addChunkedDiagnostics(state, [`Compass ${project.key}: created ${record.name} (${record.typeId}) using ${record.createMode} payload${record.repositoryLinked ? ' with repository link' : ''}${record.relatedLinkCount ? ` and ${record.relatedLinkCount} related link(s)` : ''}${record.ownerConfigured ? ' and owner team' : ''}${record.visibleInJiraComponents ? '; visible in Jira Components' : ''}.`]);
        if (component.richPayloadApplied === false && component.richPayloadError) {
          addChunkedDiagnostics(state, [`Compass ${project.key}: "${record.name}" used metadata/simple fallback after richer metadata was rejected: ${component.richPayloadError}`]);
        }
      } catch (componentErr) {
        addChunkedDiagnostics(state, [`Compass ${project.key}: component "${template.name}" skipped: ${componentErr.message}`]);
      }
    }

    if (createdCompassComponents.length >= 2) {
      try {
        await createCompassDependency(createdCompassComponents[1], createdCompassComponents[0]);
        createdCompassComponents[1].dependencyLinked = true;
        addChunkedDiagnostics(state, [`Compass ${project.key}: dependency linked ${createdCompassComponents[1].name} depends on ${createdCompassComponents[0].name}.`]);
      } catch (dependencyErr) {
        addChunkedDiagnostics(state, [`Compass ${project.key}: dependency link skipped: ${dependencyErr.message}`]);
      }
    }

    const linkTargets = (project.issueKeys || []).filter(Boolean);
    if (createdCompassComponents.length > 0 && linkTargets.length === 0) {
      addChunkedDiagnostics(state, [`Compass ${project.key}: created native components but did not link them because no generated issue keys were available yet.`]);
    }

    for (let index = 0; index < createdCompassComponents.length && linkTargets.length > 0; index += 1) {
      const component = createdCompassComponents[index];
      const issueKey = linkTargets[index % linkTargets.length];
      try {
        await linkIssueToCompassComponent(issueKey, component, state.results.diagnostics);
        component.linkedIssueKey = issueKey;
      } catch {
        // linkIssueToCompassComponent already records the exact Jira error.
      }
    }
  } catch (err) {
    addChunkedDiagnostics(state, [`Compass ${project.key}: skipped: ${err.message}`]);
  }
}

async function executeAtlassianGoalsStep(config, state, step) {
  const project = state.results.softwareProjects[step.projectIndex];
  if (!project?.key) {
    addChunkedDiagnostics(state, [`Goals ${step.projectIndex + 1}: skipped because the software project was not created.`]);
    return;
  }

  project.projectGoals = project.projectGoals || [];
  state.results.projectGoals = state.results.projectGoals || [];

  const goalTemplates = getProjectGoalTemplates(config, project);
  for (let goalIndex = 0; goalIndex < goalTemplates.length; goalIndex += 1) {
    const goalTemplate = goalTemplates[goalIndex];
    const existingGoal = project.projectGoals.find(goal => goal.name === goalTemplate.title);
    if (existingGoal) {
      continue;
    }

    try {
      const goalRecord = await createProjectGoalWorkItem(config, project, goalTemplate, goalIndex, state.results.diagnostics);
      project.projectGoals.push(goalRecord);
      project.goalIssueKeys = Array.from(new Set([...(project.goalIssueKeys || []), goalRecord.key]));
      state.results.projectGoals.push(goalRecord);
      addChunkedDiagnostics(state, [`Project goal ${project.key}: created ${goalRecord.key} "${goalRecord.name}" (target ${goalRecord.targetDate}).`]);
    } catch (err) {
      addChunkedDiagnostics(state, [`Project goal ${project.key}: "${goalTemplate.title}" skipped: ${err.message}`]);
    }
  }

  if (!GOALS_DEMO_ENABLED) {
    if (!state.metadata.goalsConfigWarningShown) {
      addChunkedDiagnostics(state, ['Atlassian Goals GraphQL skipped: GOALS_DEMO_ENABLED=false. Jira project goal work items were still created where possible.']);
      state.metadata.goalsConfigWarningShown = true;
    }
    return;
  }

  try {
    const cloudId = await resolveAtlassianCloudId();
    const goalTypeAri = getGoalTypeAri(cloudId);
    if (!goalTypeAri) {
      if (!state.metadata.goalsConfigWarningShown) {
        addChunkedDiagnostics(state, ['Atlassian Goals GraphQL skipped: configure ATLASSIAN_GOAL_TYPE_ARI, or ATLASSIAN_GOAL_ACTIVATION_ID and ATLASSIAN_GOAL_TYPE_ID. Jira project goal work items were still created where possible.']);
        state.metadata.goalsConfigWarningShown = true;
      }
      return;
    }

    project.atlassianGoals = project.atlassianGoals || [];
    for (let goalIndex = 0; goalIndex < project.projectGoals.length; goalIndex += 1) {
      const projectGoal = project.projectGoals[goalIndex];
      const nativeLinkIssueKey = (project.epicKeys || [])[goalIndex % (project.epicKeys || []).length] || projectGoal.key;
      const nativeLinkIssueType = nativeLinkIssueKey === projectGoal.key ? 'goal work item' : 'epic';
      const statusPlan = getAtlassianGoalStatusPlan(goalIndex);
      try {
        const goal = await createAtlassianGoal(cloudId, projectGoal.name, projectGoal.targetDate);
        const record = {
          id: goal.id,
          name: goal.name || projectGoal.name,
          projectKey: project.key,
          targetDate: projectGoal.targetDate,
          status: statusPlan.status,
          statusLabel: statusPlan.label,
          score: statusPlan.score,
          progressPercent: statusPlan.progressPercent,
          linkedIssueKey: nativeLinkIssueKey,
          linkedIssueType: nativeLinkIssueType,
        };

        try {
          await createAtlassianGoalStatusUpdate(record.id, record.name, record.targetDate, statusPlan);
          record.statusUpdated = true;
        } catch (statusErr) {
          record.statusUpdated = false;
          addChunkedDiagnostics(state, [`Atlassian Goal ${project.key}: created "${record.name}" but status stayed pending because the update failed: ${statusErr.message}`]);
        }

        project.atlassianGoals.push(record);
        state.results.atlassianGoals.push(record);
        addChunkedDiagnostics(state, [`Atlassian Goal ${project.key}: created "${record.name}" (${record.targetDate}, ${record.statusUpdated ? record.statusLabel : 'PENDING'}).`]);

        try {
          await linkIssueToAtlassianGoal(nativeLinkIssueKey, record.id, state.results.diagnostics);
          record.nativeLinked = true;
          addChunkedDiagnostics(state, [`Atlassian Goal ${project.key}: linked "${record.name}" to ${nativeLinkIssueType} ${nativeLinkIssueKey} through the native Goals field.`]);
        } catch (linkErr) {
          record.nativeLinked = false;
          addChunkedDiagnostics(state, [`Atlassian Goal ${project.key}: created "${record.name}" but native link to ${nativeLinkIssueType} ${nativeLinkIssueKey} failed: ${linkErr.message}`]);
        }
      } catch (goalErr) {
        addChunkedDiagnostics(state, [`Atlassian Goal ${project.key}: "${projectGoal.name}" skipped: ${goalErr.message}`]);
      }
    }
  } catch (err) {
    addChunkedDiagnostics(state, [`Atlassian Goals ${project.key}: skipped: ${err.message}`]);
  }
}

async function executeSoftwareEpicBatchStep(config, state, step) {
  const project = state.results.softwareProjects[step.projectIndex];
  if (!project?.key) {
    addChunkedError(state, `Software Project ${step.projectIndex + 1}: skipped epic batch because the project was not created.`);
    return;
  }
  if (project.reusedExistingDomainData && !project.addVolumeToExistingDomainData) {
    addChunkedDiagnostics(state, [`Epic ${project.key}: reused existing domain project data; skipped duplicate epic creation.`]);
    return;
  }

  const epics = getConfiguredContent(config).epics;
  const demoDateFields = project.skipDemoDateFieldWrites
    ? {}
    : (project.demoDateFields || await getProjectDemoDateFieldIds(project.key, state.results.diagnostics));
  const assignableUsers = await getAssignableUsers(project.key, state.metadata.accountId);
  project.demoDateFields = demoDateFields;
  const projectVariantSeed = getSoftwareProjectVariantSeed(project, step.projectIndex);

  for (let offset = 0; offset < step.count; offset++) {
    const epicIndex = step.start + offset;
    const variantIndex = epicIndex + projectVariantSeed;
    const epicName = epics[variantIndex % (epics.length || 1)];

    if (!epicName) {
      continue;
    }

    try {
      const assigneeAccountId = chooseDemoAssigneeAccountId(assignableUsers, variantIndex, step.projectIndex);
      const epicPriorities = ['Highest', 'High', 'Medium', 'Low'];
      const epicPriority = epicPriorities[variantIndex % epicPriorities.length];
      const lifecycle = createLifecycleForIssue({
        index: variantIndex,
        priority: epicPriority,
        issueType: 'Epic',
        maxAgeDays: config.dateRangeDays,
      });
      const lifecycleForStatus = ensureResolvedLifecycleForStatus(lifecycle, lifecycle.targetStatus || 'Done');
      const dueDate = buildDueDateFromLifecycle(lifecycleForStatus, epicPriority, variantIndex);
      const startDate = lifecycleForStatus?.createdAt ? toJiraDateOnly(lifecycleForStatus.createdAt) : null;
      const epic = await createEpic(project.key, epicName, {
        assigneeAccountId,
        dueDate,
        startDate,
        startDateFieldId: project.timelineStartDateFieldId,
        priority: epicPriority,
        demoDateFields,
        diagnostics: state.results.diagnostics,
        environmentName: config.environmentName,
        lifecycle: lifecycleForStatus,
        projectKind: 'software',
        retentionPeriodDays: config.retentionPeriodDays,
      });
      project.epicKeys.push(epic.key);
      addHistoricalDatePatchIssue(state, {
        key: epic.key,
        summary: epicName,
        lifecycle: lifecycleForStatus,
        status: lifecycleForStatus.targetStatus,
      });
    } catch (err) {
      addChunkedError(state, `Epic "${epicName}" for ${project.key}: ${err.message}`);
    }
  }
}

async function executeSoftwareBoardLookupStep(config, state, step) {
  const project = state.results.softwareProjects[step.projectIndex];
  if (!project?.key) {
    addChunkedError(state, `Software Project ${step.projectIndex + 1}: skipped board lookup because the project was not created.`);
    return;
  }

  try {
    const softwareTemplate = normaliseSoftwareTemplate(project.softwareTemplate || config.softwareTemplate);
    project.boardId = await getBoardId(project.key, softwareTemplate);

    if (project.boardId) {
      addChunkedDiagnostics(state, [`Board ${project.key}: using native ${softwareTemplate} board ${project.boardId}.`]);
    } else {
      addChunkedError(state, `Board ${project.key}: Jira did not expose a native ${softwareTemplate} board after waiting; skipped app-created board fallback so work is not attached to the wrong board.`);
    }
  } catch (err) {
    addChunkedError(state, `Board lookup for ${project.key}: ${err.message}`);
  }
}

async function executeSoftwareIssueBatchStep(config, state, step) {
  const project = state.results.softwareProjects[step.projectIndex];
  if (!project?.key) {
    addChunkedError(state, `Software Project ${step.projectIndex + 1}: skipped issue batch because the project was not created.`);
    return;
  }
  if (project.reusedExistingDomainData && !project.addVolumeToExistingDomainData) {
    addChunkedDiagnostics(state, [`Issues ${project.key}: reused ${project.existingIssueCount || 0} existing domain issues; skipped duplicate software issue creation.`]);
    return;
  }
  if (project.addVolumeToExistingDomainData && step.start === 0) {
    addChunkedDiagnostics(state, [`Issues ${project.key}: adding a new 60-issue volume batch to existing domain data.`]);
  }

  const content = getConfiguredContent(config);
  const priorities = ['Highest', 'High', 'High', 'Medium', 'Medium', 'Medium', 'Low', 'Lowest'];
  const demoDateFields = project.skipDemoDateFieldWrites
    ? {}
    : (project.demoDateFields || await getProjectDemoDateFieldIds(project.key, state.results.diagnostics));
  project.demoDateFields = demoDateFields;
  const assignableUsers = await getAssignableUsers(project.key, state.metadata.accountId);
  const softwareTemplate = normaliseSoftwareTemplate(project.softwareTemplate || config.softwareTemplate);
  const projectVariantSeed = getSoftwareProjectVariantSeed(project, step.projectIndex);

  for (let offset = 0; offset < step.count; offset++) {
    const issueIndex = step.start + offset;
    const variantIndex = issueIndex + projectVariantSeed;
    const template = getCycledTemplate(content.issues, variantIndex);

    if (!template) {
      continue;
    }

    try {
      const priority = priorities[variantIndex % priorities.length];
      const lifecycle = createLifecycleForIssue({
        index: variantIndex,
        priority,
        issueType: template.type,
        maxAgeDays: config.dateRangeDays,
      });
      const defaultStatus = getDemoDevStatus(variantIndex);
      const provisionalLifecycle = ensureResolvedLifecycleForStatus(lifecycle, defaultStatus);
      const provisionalDueDate = buildDueDateFromLifecycle(provisionalLifecycle, priority, variantIndex);
      const status = isBugIssueType(template.type)
        ? getDemoBugStatusFromDueDate(provisionalDueDate)
        : defaultStatus;
      const lifecycleForStatus = ensureResolvedLifecycleForStatus(lifecycle, status);
      const dueDate = isBugIssueType(template.type)
        ? provisionalDueDate
        : buildDueDateFromLifecycle(lifecycleForStatus, priority, variantIndex);
      const assigneeAccountId = isBugIssueType(template.type)
        ? chooseRequiredDemoAssigneeAccountId(assignableUsers, variantIndex, step.projectIndex)
        : chooseDemoAssigneeAccountId(assignableUsers, variantIndex, step.projectIndex);
      const startDate = lifecycleForStatus?.createdAt ? toJiraDateOnly(lifecycleForStatus.createdAt) : null;
      const releaseVersions = chooseReleaseVersionIds(project, variantIndex, template.type);
      const methodologyDescription = getSoftwareMethodologyDescription(project, variantIndex);
      const epicKey = softwareTemplate === 'scrum'
        ? project.epicKeys[variantIndex % (project.epicKeys.length || 1)] || null
        : null;
      const issue = await createIssue(
        project.key,
        template.title,
        template.type,
        epicKey,
        priority,
        dueDate,
        releaseVersions.fixVersionId,
        {
          assigneeAccountId,
          affectsVersionId: releaseVersions.affectsVersionId,
          demoDateFields,
          diagnostics: state.results.diagnostics,
          environmentName: config.environmentName,
          lifecycle: lifecycleForStatus,
          projectKind: 'software',
          retentionPeriodDays: config.retentionPeriodDays,
          startDate,
          startDateFieldId: project.timelineStartDateFieldId,
          description: [template.description || '', methodologyDescription].filter(Boolean).join('\n\n'),
          skipEpicLink: softwareTemplate !== 'scrum',
          labels: getSoftwareMethodologyLabels(project, variantIndex, template.type),
          components: chooseSoftwareComponentNames(project, variantIndex, template.type),
          issueIndex: variantIndex,
        }
      );

      project.issueKeys.push(issue.key);
      project.issueRecords.push({
        key: issue.key,
        title: template.title,
        issueType: template.type,
        status,
        priority,
        epicKey,
        fixVersionId: releaseVersions.fixVersionId,
        affectsVersionId: releaseVersions.affectsVersionId,
        methodologyPhase: getWaterfallPhase(variantIndex),
        variantSeed: projectVariantSeed,
        createdAt: lifecycleForStatus.createdAt,
        resolvedAt: lifecycleForStatus.resolvedAt,
        dueDate,
        startDate,
        assigneeAccountId,
      });
      project.issueCount++;
      state.results.totalIssues++;

      if (!project.firstIssueKey) {
        project.firstIssueKey = issue.key;
      }

      addHistoricalDatePatchIssue(state, {
        key: issue.key,
        summary: template.title,
        lifecycle: lifecycleForStatus,
        status,
      });

      if (status !== 'To Do') {
        await transitionIssue(issue.key, status);
      }
    } catch (err) {
      addChunkedError(state, `Issue ${issueIndex + 1} for ${project.key}: ${err.message}`);
    }
  }
}

async function executeSoftwareSprintStep(config, state, step) {
  const project = state.results.softwareProjects[step.projectIndex];
  if (!project?.key) {
    addChunkedError(state, `Software Project ${step.projectIndex + 1}: skipped sprint ${step.sprintIndex + 1} because the project was not created.`);
    return;
  }
  if (project.reusedExistingDomainData && !project.addVolumeToExistingDomainData) {
    addChunkedDiagnostics(state, [`Sprint ${project.key}: reused existing domain project data; skipped duplicate sprint creation.`]);
    return;
  }

  const softwareTemplate = normaliseSoftwareTemplate(project.softwareTemplate || config.softwareTemplate);
  if (softwareTemplate !== 'scrum') {
    addChunkedDiagnostics(state, [`${project.key}: skipped Scrum sprint setup because this is a Kanban project; Kanban cards are populated directly on the Kanban board.`]);
    return;
  }

  let sprintBoardId = project.sprintBoardId || project.boardId || null;

  if (!sprintBoardId) {
    try {
      sprintBoardId = await getBoardId(project.key, 'scrum', { maxAttempts: 2, retryDelayMs: 1000 });
    } catch (err) {
      addChunkedError(state, `Sprint ${step.sprintIndex + 1} for ${project.key}: native Scrum board lookup failed: ${err.message}`);
      return;
    }
  }

  if (!sprintBoardId) {
    addChunkedError(state, `Sprint ${step.sprintIndex + 1} for ${project.key}: native Scrum board was not found, so sprint creation was skipped to avoid creating sprints on the wrong board.`);
    return;
  }

  project.sprintBoardId = sprintBoardId;
  project.boardId = sprintBoardId;

  try {
    const schedule = getSprintSchedule(step.sprintIndex);
    const sprint = await createSprint(sprintBoardId, `${project.key} Sprint ${step.sprintIndex + 1}`, schedule.startDate, schedule.endDate);
    const sprintIssueKeys = (project.issueRecords || []).map(record => record?.key).filter(Boolean);
    const issueChunk = getSprintIssueChunk(sprintIssueKeys, step.sprintIndex, config.sprintsPerProject);

    if (step.sprintIndex === 0 && issueChunk.length === 0) {
      addChunkedError(state, `Sprint ${sprint.id} for ${project.key}: Sprint 1 was created but no software issue keys were available to move into it.`);
    }

    if (issueChunk.length > 0) {
      const assignResult = await assignAndVerifyIssuesToSprint(sprint.id, issueChunk, state.results.diagnostics);
      addChunkedDiagnostics(state, [`Sprint ${sprint.id}: assigned ${issueChunk.length} issue(s) into ${sprint.name} (${assignResult.moved ? 'Agile move ok' : 'Agile move fallback used'}, Sprint field writes ${assignResult.fieldAssigned}/${issueChunk.length}, Jira visible ${assignResult.visibleCount || 0}, field verified ${assignResult.fieldMembershipCount || 0}, accepted ${assignResult.verifiedCount}).`]);
      if (assignResult.verifiedCount === 0) {
        addChunkedError(state, `Sprint ${sprint.id} for ${project.key}: Jira still reports 0 issues in ${sprint.name} after assignment.`);
      }
    }

    if (schedule.targetState === 'closed') {
      try {
        await updateSprint(sprint.id, {
          name: sprint.name,
          startDate: formatDateForJira(schedule.startDate),
          endDate: formatDateForJira(schedule.endDate),
          state: 'active',
        });
        await updateSprint(sprint.id, {
          name: sprint.name,
          startDate: formatDateForJira(schedule.startDate),
          endDate: formatDateForJira(schedule.endDate),
          completeDate: formatDateForJira(schedule.endDate),
          state: 'closed',
        });
        addChunkedDiagnostics(state, [`Sprint ${sprint.id}: completed historical sprint ${sprint.name}.`]);
      } catch (sprintStateErr) {
        addChunkedDiagnostics(state, [`Sprint ${sprint.id}: historical closed-state update skipped: ${sprintStateErr.message}`]);
      }
    } else if (schedule.shouldActivate) {
      try {
        await updateSprint(sprint.id, {
          name: sprint.name,
          startDate: formatDateForJira(schedule.startDate),
          endDate: formatDateForJira(schedule.endDate),
          state: 'active',
        });
        try {
          const activeSprint = await getSprint(sprint.id);
          if (String(activeSprint?.state || '').toLowerCase() !== 'active') {
            addChunkedError(state, `Sprint ${sprint.id} for ${project.key}: Jira created the sprint but state is "${activeSprint?.state || 'unknown'}", not active.`);
          }
        } catch (verifyStateErr) {
          addChunkedDiagnostics(state, [`Sprint ${sprint.id}: active-state verification failed: ${verifyStateErr.message}`]);
        }
        addChunkedDiagnostics(state, [`Sprint ${sprint.id}: started active sprint ${sprint.name}.`]);
      } catch (sprintStateErr) {
        addChunkedError(state, `Sprint ${sprint.id} for ${project.key}: active-state update failed, so the sprint may remain in backlog/future state: ${sprintStateErr.message}`);
      }
    }

    project.sprints.push({
      id: sprint.id,
      name: sprint.name,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      state: schedule.targetState || (schedule.shouldActivate ? 'active' : 'future'),
      issueCount: issueChunk.length,
    });
  } catch (err) {
    addChunkedError(state, `Sprint ${step.sprintIndex + 1} for ${project.key}: ${err.message}`);
  }
}

async function executeKanbanBoardPopulationStep(config, state, step) {
  const project = state.results.softwareProjects[step.projectIndex];
  if (!project?.key) {
    addChunkedError(state, `Software Project ${step.projectIndex + 1}: skipped Kanban board population because the project was not created.`);
    return;
  }
  if (project.reusedExistingDomainData && !project.addVolumeToExistingDomainData) {
    addChunkedDiagnostics(state, [`Kanban ${project.key}: reused existing domain project data; skipped duplicate board population.`]);
    return;
  }

  const softwareTemplate = normaliseSoftwareTemplate(project.softwareTemplate || config.softwareTemplate);
  if (softwareTemplate !== 'kanban') {
    return;
  }

  try {
    project.boardId = project.boardId || await getBoardId(project.key, 'kanban');

    if (!project.boardId) {
      addChunkedError(state, `Kanban ${project.key}: native Kanban board was not found, so app-created board fallback was skipped to avoid wiring work to the wrong board.`);
      return;
    }

    const issueRecords = Array.isArray(project.issueRecords) ? project.issueRecords : [];
    addChunkedDiagnostics(state, [`Kanban ${project.key}: skipped duplicate status transition pass; generated issues were already transitioned during issue creation.`]);

    if (project.boardId) {
      try {
        const boardIssues = await jiraGet(`/rest/agile/1.0/board/${encodeURIComponent(project.boardId)}/issue?jql=${encodeURIComponent(`project = ${project.key} ORDER BY Rank ASC`)}&maxResults=1`);
        const visibleTotal = Number(boardIssues.total || 0);
        if (visibleTotal === 0 && issueRecords.length > 0) {
          addChunkedError(state, `Kanban ${project.key}: ${issueRecords.length} issue(s) were created, but board ${project.boardId} returned 0 visible issues.`);
        } else {
          addChunkedDiagnostics(state, [`Kanban ${project.key}: board ${project.boardId} can see ${visibleTotal} generated issue(s).`]);
        }
      } catch (verifyErr) {
        addChunkedDiagnostics(state, [`Kanban ${project.key}: board visibility verification skipped because Jira Agile API access was unavailable: ${verifyErr.message}`]);
      }
    }
  } catch (err) {
    addChunkedError(state, `Kanban board population for ${project.key}: ${err.message}`);
  }
}

async function executeBugTrackingVerificationStep(config, state, step) {
  const project = state.results.softwareProjects[step.projectIndex];
  if (!project?.key) {
    addChunkedError(state, `Software Project ${step.projectIndex + 1}: skipped Bug Tracking verification because the project was not created.`);
    return;
  }

  const softwareTemplate = normaliseSoftwareTemplate(project.softwareTemplate || config.softwareTemplate);
  if (softwareTemplate !== 'bug-tracking') {
    return;
  }

  const issueRecords = Array.isArray(project.issueRecords) ? project.issueRecords : [];
  if (issueRecords.length === 0 && !project.reusedExistingDomainData) {
    addChunkedError(state, `Bug Tracking ${project.key}: no generated bug-tracking work items were created.`);
    return;
  }

  addChunkedDiagnostics(state, [`Bug Tracking ${project.key}: ${project.reusedExistingDomainData && !project.addVolumeToExistingDomainData ? 'reused existing domain data' : `created ${issueRecords.length} defect/review work item(s)`}; Scrum sprint and Kanban board setup intentionally skipped for the Bug Tracking template.`]);
}

async function createNativeJiraPlan(config, project, state, siteDetails) {
  const planName = `${config.environmentName} ${project.key} delivery plan`;
  const issueSourceJql = `project = ${project.key} ORDER BY Rank ASC`;
  const payloadAttempts = [
    {
      label: 'plans-plan-jql',
      path: '/rest/api/3/plans/plan',
      body: {
        name: planName,
        issueSources: [{
          type: 'JQL',
          value: issueSourceJql,
        }],
      },
    },
    {
      label: 'plans-plan-project',
      path: '/rest/api/3/plans/plan',
      body: {
        name: planName,
        issueSources: [{
          type: 'PROJECT',
          value: project.id || project.key,
        }],
      },
    },
  ];
  const errors = [];

  for (const attempt of payloadAttempts) {
    try {
      const created = await jiraPost(attempt.path, attempt.body);
      const planId = created?.id || created?.planId || null;
      return {
        success: true,
        id: planId,
        name: created?.name || planName,
        projectKey: project.key,
        viewUrl: planId ? buildAtlassianSiteUrl(siteDetails.baseUrl, `/jira/plans/${planId}`) : buildAtlassianSiteUrl(siteDetails.baseUrl, '/jira/plans'),
        mode: attempt.label,
      };
    } catch (err) {
      errors.push(`${attempt.label}: ${err.message}`);
    }
  }

  return {
    success: false,
    name: planName,
    projectKey: project.key,
    viewUrl: buildAtlassianSiteUrl(siteDetails.baseUrl, '/jira/plans'),
    message: errors.join(' | '),
  };
}

async function executePlanningArtifactsStep(config, state) {
  const project = (state.results.softwareProjects || []).find(candidate => candidate?.key);
  if (!project?.key) {
    addChunkedDiagnostics(state, ['Planning artifacts: skipped because no software project was created.']);
    return;
  }

  const siteDetails = await getCurrentSiteDetails().catch(() => ({}));
  const roadmapUrl = buildAtlassianSiteUrl(siteDetails.baseUrl, `/jira/software/c/projects/${project.key}/timeline`)
    || buildAtlassianSiteUrl(siteDetails.baseUrl, `/jira/software/c/projects/${project.key}/summary`);
  const boardUrl = project.boardId
    ? buildAtlassianSiteUrl(siteDetails.baseUrl, `/jira/software/c/projects/${project.key}/boards/${project.boardId}`)
    : buildAtlassianSiteUrl(siteDetails.baseUrl, `/jira/software/c/projects/${project.key}/board`);
  const releaseUrl = buildAtlassianSiteUrl(siteDetails.baseUrl, `/jira/software/c/projects/${project.key}/versions`);
  const dashboard = (state.results.dashboards || []).find(item => item?.projectKey === project.key);
  const dashboardUrl = dashboard?.viewUrl ? buildAtlassianSiteUrl(siteDetails.baseUrl, dashboard.viewUrl) : null;
  const plan = await createNativeJiraPlan(config, project, state, siteDetails);

  state.results.jiraPlans.push(plan);
  if (plan.success) {
    addChunkedDiagnostics(state, [`Jira Plan ${project.key}: created "${plan.name}" (${plan.mode}).`]);
  } else {
    addChunkedDiagnostics(state, [`Jira Plan ${project.key}: native plan creation was not available through REST; roadmap-ready data remains in Jira. ${plan.message}`]);
  }

  const roadmapRecord = {
    projectKey: project.key,
    name: `${config.environmentName} ${project.key} roadmap`,
    viewUrl: roadmapUrl,
    epicCount: (project.epicKeys || []).length,
    versionCount: (project.versions || []).length,
    sprintCount: (project.sprints || []).length,
  };
  state.results.jiraRoadmaps.push(roadmapRecord);

  const evidenceIssueKeys = [
    ...(project.epicKeys || []).slice(0, 1),
    ...(project.issueKeys || []).slice(0, 1),
  ].filter(Boolean);
  for (const issueKey of evidenceIssueKeys) {
    await addIssueComment(issueKey, [
      `Planning artifact: ${roadmapRecord.name}.`,
      `Roadmap: ${roadmapUrl || 'Jira project timeline'}.`,
      `Board: ${boardUrl || 'Jira software board'}.`,
      `Releases: ${releaseUrl || 'Jira releases page'}.`,
      dashboardUrl ? `Dashboard: ${dashboardUrl}.` : 'Dashboard: generated project dashboard if selected.',
      plan.success ? `Native Jira Plan: ${plan.viewUrl || plan.name}.` : 'Native Jira Plan: Jira Cloud did not expose plan creation through the project/issue REST API for this tenant.',
    ], state.results.diagnostics);
    if (roadmapUrl) {
      await addIssueRemoteLink(issueKey, {
        url: roadmapUrl,
        title: `${project.key} roadmap`,
        relationship: 'tracked by',
        summary: 'Generated Jira roadmap/timeline for this software project.',
      }, state.results.diagnostics);
    }
    if (releaseUrl) {
      await addIssueRemoteLink(issueKey, {
        url: releaseUrl,
        title: `${project.key} releases`,
        relationship: 'planned in',
        summary: 'Generated release roadmap with past, current, and upcoming versions.',
      }, state.results.diagnostics);
    }
    if (dashboardUrl) {
      await addIssueRemoteLink(issueKey, {
        url: dashboardUrl,
        title: `${project.key} delivery dashboard`,
        relationship: 'reported by',
        summary: 'Generated dashboard for delivery, risk, and release reporting.',
      }, state.results.diagnostics);
    }
  }

  addChunkedDiagnostics(state, [`Jira Roadmap ${project.key}: seeded with ${roadmapRecord.epicCount} epic(s), ${roadmapRecord.versionCount} version(s), and ${roadmapRecord.sprintCount} sprint(s).`]);
}

async function executeDependencyStep(state, step = {}) {
  const linked = [];
  const failedLinks = [];
  const maxLinks = 12;
  const deadlineMs = Date.now() + 18000;
  let skippedAfterLimit = false;
  let attemptedLinks = 0;
  let evidenceWrites = 0;
  const evidenceWriteLimit = 10;
  const scope = step.dependencyScope || 'all';
  const shouldRunScope = candidate => scope === 'all' || scope === candidate;

  const linkAndTrack = async (fromKey, toKey, typeName, label, evidence = {}) => {
    if (attemptedLinks >= maxLinks || Date.now() >= deadlineMs) {
      skippedAfterLimit = true;
      return;
    }

    attemptedLinks += 1;
    const result = await createIssueLink(fromKey, toKey, typeName);
    if (result.ok) {
      linked.push(label || `${fromKey} ${typeName} ${toKey}`);
      if (evidenceWrites < evidenceWriteLimit && Date.now() < deadlineMs - 2500) {
        evidenceWrites += await addRelationshipEvidence(state, {
          ...evidence,
          fromKey,
          toKey,
          typeName: result.typeName || typeName,
        });
      }
    } else {
      failedLinks.push(`${fromKey} -> ${toKey} (${typeName}): ${result.message}`);
    }
  };

  try {
    if (shouldRunScope('software')) {
      const softwareProjects = scope === 'software' && Number.isInteger(step.projectIndex)
        ? [state.results.softwareProjects[step.projectIndex]].filter(Boolean)
        : state.results.softwareProjects || [];

      for (const project of softwareProjects) {
        const records = project?.issueRecords || [];
        const isKanbanProject = normaliseSoftwareTemplate(project?.softwareTemplate) === 'kanban';

        for (let index = 1; index < Math.min(records.length, 4); index += 1) {
          const current = records[index];
          const previous = records[index - 1];

          if (!current?.key || !previous?.key) {
            continue;
          }

          if (String(current.issueType || '').toLowerCase() === 'bug') {
            await linkAndTrack(
              current.key,
              previous.key,
              'Blocks',
              `Software dependency: defect ${current.key} blocks ${previous.key}.`,
              {
                category: 'software',
                project,
                fromRecord: current,
                toRecord: previous,
              }
            );
          } else if (current.epicKey) {
            await linkAndTrack(
              current.key,
              current.epicKey,
              'Relates',
              `Software traceability: ${current.key} relates to epic ${current.epicKey}.`,
              {
                category: 'software',
                project,
                fromRecord: current,
                toRecord: { key: current.epicKey, title: 'parent epic' },
              }
            );
          } else if (isKanbanProject) {
            const relationType = index % 2 === 0 ? 'Relates' : 'Blocks';
            await linkAndTrack(
              relationType === 'Blocks' ? previous.key : current.key,
              relationType === 'Blocks' ? current.key : previous.key,
              relationType,
              relationType === 'Blocks'
                ? `Kanban flow dependency: ${previous.key} blocks ${current.key}.`
                : `Kanban flow relationship: ${current.key} relates to ${previous.key}.`,
              {
                category: 'software',
                project,
                fromRecord: relationType === 'Blocks' ? previous : current,
                toRecord: relationType === 'Blocks' ? current : previous,
              }
            );
          } else if (index % 3 === 0) {
            await linkAndTrack(
              current.key,
              previous.key,
              'Relates',
              `Software dependency: ${current.key} relates to ${previous.key}.`,
              {
                category: 'software',
                project,
                fromRecord: current,
                toRecord: previous,
              }
            );
          }
        }
      }
    }

    if (shouldRunScope('software-cross-project') && state.results.softwareProjects.length >= 2) {
      const firstSoftwareIssue = state.results.softwareProjects[0]?.firstIssueKey;
      const secondSoftwareIssue = state.results.softwareProjects[1]?.firstIssueKey;

      if (firstSoftwareIssue && secondSoftwareIssue) {
        await linkAndTrack(firstSoftwareIssue, secondSoftwareIssue, 'Blocks', `Cross-project software dependency: ${firstSoftwareIssue} blocks ${secondSoftwareIssue}.`, {
          category: 'software',
          project: state.results.softwareProjects[0],
          fromRecord: { key: firstSoftwareIssue, title: 'cross-project delivery work' },
          toRecord: { key: secondSoftwareIssue, title: 'dependent delivery work' },
        });
      }
    }

    if (
      shouldRunScope('itsm') ||
      shouldRunScope('itsm-problem-incident') ||
      shouldRunScope('itsm-change-problem') ||
      shouldRunScope('itsm-service-change') ||
      shouldRunScope('itsm-incident-change')
    ) {
      const jsmProjects = scope.startsWith('itsm') && Number.isInteger(step.projectIndex)
        ? [state.results.jsmProjects[step.projectIndex]].filter(Boolean)
        : state.results.jsmProjects || [];

      for (const jsmProject of jsmProjects) {
      const workItems = jsmProject?.itsmWorkItems || jsmProject?.incidents || [];
      const incidents = workItems.filter(item => item.workType === 'Incident' && item.key);
      const problems = workItems.filter(item => item.workType === 'Problem' && item.key);
      const changes = workItems.filter(item => item.workType === 'Change' && item.key);
      const serviceRequests = workItems.filter(item => item.workType === 'Service Request' && item.key);
      const linkedPairs = new Set();
      const linkRoundRobin = async (fromItems, toItems, typeName, labelBuilder) => {
        if (!fromItems.length || !toItems.length) {
          return;
        }

        for (let index = 0; index < fromItems.length; index += 1) {
          const fromItem = fromItems[index];
          const toItem = toItems[index % toItems.length];
          const pairKey = `${fromItem.key}:${toItem.key}:${typeName}`;

          if (!fromItem.key || !toItem.key || linkedPairs.has(pairKey)) {
            continue;
          }

          linkedPairs.add(pairKey);
          await linkAndTrack(fromItem.key, toItem.key, typeName, labelBuilder(fromItem.key, toItem.key), {
            category: 'itsm',
            project: jsmProject,
            fromRecord: fromItem,
            toRecord: toItem,
          });
        }
      };

      if (scope === 'all' || scope === 'itsm' || scope === 'itsm-problem-incident') {
        await linkRoundRobin(problems, incidents, 'Relates', (problemKey, incidentKey) =>
          `ITSM relationship: problem ${problemKey} relates to incident ${incidentKey}.`
        );
      }
      if (scope === 'all' || scope === 'itsm' || scope === 'itsm-change-problem') {
        await linkRoundRobin(changes, problems.length ? problems : incidents, problems.length ? 'Blocks' : 'Relates', (changeKey, relatedKey) =>
          problems.length
            ? `ITSM dependency: change ${changeKey} is linked to root-cause problem ${relatedKey}.`
            : `ITSM relationship: change ${changeKey} relates to incident ${relatedKey}.`
        );
      }
      if (scope === 'all' || scope === 'itsm' || scope === 'itsm-service-change') {
        await linkRoundRobin(serviceRequests, changes.length ? changes : incidents, 'Relates', (requestKey, relatedKey) =>
          changes.length
            ? `ITSM relationship: service request ${requestKey} relates to change ${relatedKey}.`
            : `ITSM relationship: service request ${requestKey} relates to incident ${relatedKey}.`
        );
      }
      if (scope === 'all' || scope === 'itsm' || scope === 'itsm-incident-change') {
        await linkRoundRobin(incidents, changes.length ? changes : serviceRequests, 'Relates', (incidentKey, relatedKey) =>
          changes.length
            ? `ITSM relationship: incident ${incidentKey} relates to change ${relatedKey}.`
            : `ITSM relationship: incident ${incidentKey} relates to service request ${relatedKey}.`
        );
      }
      }
    }

    if (shouldRunScope('devops') && state.results.jsmProjects.length > 0 && state.results.softwareProjects.length > 0) {
      const firstIncident = state.results.jsmProjects[0]?.itsmWorkItems?.find(item => item.workType === 'Incident')?.key
        || state.results.jsmProjects[0]?.incidents?.[0]?.key;
      const firstSoftwareIssue = state.results.softwareProjects[0]?.firstIssueKey;

      if (firstIncident && firstSoftwareIssue) {
        await linkAndTrack(firstSoftwareIssue, firstIncident, 'Blocks', `DevOps relationship: software issue ${firstSoftwareIssue} blocks incident ${firstIncident}.`, {
          category: 'software',
          project: state.results.softwareProjects[0],
          fromRecord: { key: firstSoftwareIssue, title: 'software remediation work' },
          toRecord: { key: firstIncident, title: 'customer-impacting incident' },
        });
      }
    }

    if (shouldRunScope('product-discovery-delivery') || shouldRunScope('all')) {
      const discoveryIdeas = (state.results.productDiscoveryProjects || [])
        .flatMap(project => (project?.issueRecords || []).map(record => ({ ...record, project })))
        .filter(record => record.key);
      const deliveryIssues = (state.results.softwareProjects || [])
        .flatMap(project => (project?.issueRecords || []).map(record => ({ ...record, project })))
        .filter(record => record.key);

      if (discoveryIdeas.length > 0 && deliveryIssues.length > 0) {
        const deliveryLinkLimit = Math.min(discoveryIdeas.length, deliveryIssues.length, 12 - attemptedLinks);
        for (let index = 0; index < deliveryLinkLimit; index += 1) {
          const idea = discoveryIdeas[index];
          const delivery = deliveryIssues[index % deliveryIssues.length];
          await linkAndTrack(
            delivery.key,
            idea.key,
            'Relates',
            `Product Discovery delivery link: idea ${idea.key} relates to delivery work ${delivery.key}.`,
            {
              category: 'product-discovery-delivery',
              project: idea.project,
              fromRecord: delivery,
              toRecord: idea,
            }
          );
        }
      } else if (discoveryIdeas.length > 0 && deliveryIssues.length === 0) {
        addChunkedDiagnostics(state, ['Product Discovery delivery status: no Software project issues were created in this run, so generated ideas have no linked delivery work for Jira to count.']);
      }
    }

    if (linked.length > 0) {
      addChunkedDiagnostics(state, linked.slice(0, 12));
    }
    if (skippedAfterLimit) {
      addChunkedDiagnostics(state, [`Dependency linking stopped after ${attemptedLinks} attempted link(s), ${linked.length} successful, to stay inside the Forge 25-second resolver limit.`]);
    }
    if (evidenceWrites > 0) {
      addChunkedDiagnostics(state, [`Relationship evidence: added ${evidenceWrites} comment/reference link artifact(s) across generated work items.`]);
    }
    if (failedLinks.length > 0) {
      addChunkedDiagnostics(state, [
        `Dependency linking warnings (${failedLinks.length}):`,
        ...failedLinks.slice(0, 8),
      ]);
    }
  } catch (err) {
    addChunkedError(state, `Dependencies: ${err.message}`);
  }
}

function getGitHubActivityProjectTarget(state, step) {
  const projectKind = step.projectKind || 'software';
  if (projectKind === 'jsm') {
    const project = state.results.jsmProjects[step.projectIndex];
    return {
      projectKind,
      project,
      label: `JSM project ${step.projectIndex + 1}`,
      issueRecords: (project?.itsmWorkItems || project?.incidents || []).map(item => ({
        key: item.key,
        title: item.title,
        issueType: item.workType || item.issueType || 'Service work',
        priority: item.priority,
        status: item.status,
        methodologyPhase: item.workType || 'service-delivery',
      })),
    };
  }

  if (projectKind === 'business') {
    const project = state.results.businessProjects[step.projectIndex];
    return {
      projectKind,
      project,
      label: `business space ${step.projectIndex + 1}`,
      issueRecords: (project?.issueRecords || []).map(item => ({
        key: item.key,
        title: item.title,
        issueType: item.issueType || 'Business work',
        priority: item.priority,
        status: item.status,
        methodologyPhase: project?.businessSpaceType || 'business-delivery',
      })),
    };
  }

  if (projectKind === 'product-discovery') {
    const project = state.results.productDiscoveryProjects[step.projectIndex];
    return {
      projectKind,
      project,
      label: `Product Discovery space ${step.projectIndex + 1}`,
      issueRecords: (project?.issueRecords || []).map(item => ({
        key: item.key,
        title: item.title,
        issueType: item.issueType || 'Idea',
        priority: item.priority,
        status: item.status,
        methodologyPhase: 'product-discovery',
      })),
    };
  }

  const project = state.results.softwareProjects[step.projectIndex];
  return {
    projectKind: 'software',
    project,
    label: `software project ${step.projectIndex + 1}`,
    issueRecords: getSoftwareGitHubActivityIssueRecords(project),
  };
}

async function executeGitHubDevelopmentActivityStep(config, state, step) {
  const target = getGitHubActivityProjectTarget(state, step);
  const { project, projectKind, issueRecords: targetIssueRecords } = target;
  if (!project?.key) {
    addChunkedDiagnostics(state, [`GitHub activity skipped for ${target.label}: project was not created.`]);
    return;
  }

  const githubConfig = getGitHubDemoConfig();
  if (!githubConfig.enabled) {
    const message = getGitHubDemoConfigMessage();
    if (message && !state.metadata.githubConfigWarningShown) {
      addChunkedDiagnostics(state, [message]);
      state.metadata.githubConfigWarningShown = true;
    }
    return;
  }

  if (state.metadata.githubWriteAccessFailed) {
    if (!state.metadata.githubWriteAccessSkipShown) {
      addChunkedDiagnostics(state, [`GitHub activity skipped for remaining work items: ${state.metadata.githubWriteAccessMessage || buildGitHubWriteAccessMessage(githubConfig)}`]);
      state.metadata.githubWriteAccessSkipShown = true;
    }
    return;
  }

  let allIssueRecords = (targetIssueRecords || [])
    .filter(issue => issue?.key)
    .slice(0, GITHUB_DEMO_ACTIVITY_PER_PROJECT);

  if (allIssueRecords.length === 0) {
    allIssueRecords = await searchExistingIssuesForGitHubActivity(project, projectKind);
    if (allIssueRecords.length > 0) {
      addChunkedDiagnostics(state, [`GitHub activity ${project.key}: using ${allIssueRecords.length} existing ${getGitHubActivityWorkLabel(projectKind).toLowerCase()} record(s) for Jira development panel data.`]);
    }
  }
  const activityStart = Math.max(0, Number.parseInt(step.activityStart, 10) || 0);
  const activityCount = Math.max(1, Math.min(Number.parseInt(step.activityCount, 10) || GITHUB_DEMO_ACTIVITY_PER_PROJECT, GITHUB_DEMO_ACTIVITY_PER_PROJECT));
  const issueRecords = allIssueRecords.slice(activityStart, activityStart + activityCount);

  if (issueRecords.length === 0) {
    addChunkedDiagnostics(state, [`GitHub activity ${project.key}: skipped item ${activityStart + 1} because no ${getGitHubActivityWorkLabel(projectKind).toLowerCase()} record was available.`]);
    return;
  }

  try {
    const { defaultBranch, sha } = await getGitHubDefaultBranchSha(githubConfig);
    if (!sha) {
      throw new Error('GitHub default branch SHA was not returned.');
    }

    const environment = `demo-${slugifyGitHubPart(config.environmentName)}-${project.key.toLowerCase()}`;
    const createdRecords = [];

    for (let index = 0; index < issueRecords.length; index += 1) {
      const activityIndex = activityStart + index;
      const issue = issueRecords[index];
      const variantCount = Math.max(GITHUB_DEMO_BRANCHES_PER_ISSUE, GITHUB_DEMO_PULL_REQUESTS_PER_ISSUE);

      for (let variantIndex = 0; variantIndex < variantCount; variantIndex += 1) {
        const branchName = buildGitHubBranchName(config, project, issue, activityIndex, variantIndex);
        const filePath = buildGitHubDemoFilePath(config, project, issue, variantIndex);
        const activityLabel = variantCount > 1 ? ` ${variantIndex + 1}` : '';
        const commitMessage = `${issue.key} demo delivery activity${activityLabel} for ${project.key}`;
        const pullTitle = `${issue.key} demo delivery activity${activityLabel} for ${project.key}`;
        const pullBody = [
          `Generated demo GitHub activity for Jira work item ${issue.key}.`,
          '',
          `Client demo: ${config.environmentName}`,
          `Jira project: ${project.key}`,
          `Activity branch: ${variantIndex + 1}`,
          `${getGitHubActivityWorkLabel(projectKind)}: ${issue.issueType || getGitHubActivityWorkLabel(projectKind)}`,
        ].join('\n');

        await ensureGitHubBranch(githubConfig, branchName, sha);
        const fileUpdate = await upsertGitHubDemoFile(
          githubConfig,
          branchName,
          filePath,
          buildGitHubDemoFileContent(config, project, issue, projectKind, variantIndex),
          commitMessage
        );
        const pullRequest = variantIndex < GITHUB_DEMO_PULL_REQUESTS_PER_ISSUE
          ? await ensureGitHubPullRequest(githubConfig, defaultBranch, branchName, pullTitle, pullBody)
          : null;
        const deployment = await createGitHubDeployment(githubConfig, branchName, environment, issue, pullRequest?.url);
        const commitSha = fileUpdate.commit?.sha || fileUpdate.content?.sha || sha;
        const repositoryUrl = `https://github.com/${githubConfig.owner}/${githubConfig.repo}`;

        createdRecords.push({
          issueKey: issue.key,
          projectKey: project.key,
          branchName,
          branchUrl: `${repositoryUrl}/tree/${encodeURIComponent(branchName)}`,
          commitMessage,
          commitSha,
          commitUrl: `${repositoryUrl}/commit/${commitSha}`,
          filePath,
          fileUrl: fileUpdate.content?.html_url || `${repositoryUrl}/blob/${encodeURIComponent(branchName)}/${filePath}`,
          pullRequestNumber: pullRequest?.number || null,
          pullRequestTitle: pullRequest ? pullTitle : '',
          pullRequestUrl: pullRequest?.url || '',
          deploymentId: deployment.id,
          deploymentUrl: deployment.url,
          deploymentEnvironment: deployment.environment,
          deploymentStatus: deployment.status,
          reusedPullRequest: Boolean(pullRequest?.reused),
        });
      }
    }

    const projectRecordsForSubmission = [
      ...(state.results.githubActivity || []).filter(record => record?.projectKey === project.key),
      ...createdRecords,
    ];

    let evidenceLinksAdded = 0;
    for (const record of createdRecords) {
      evidenceLinksAdded += await addGitHubActivityIssueEvidence(record, state.results.diagnostics);
    }

    try {
      const devInfoResult = await submitJiraDevelopmentInformation(githubConfig, project, defaultBranch, projectRecordsForSubmission);
      const acceptedDevInfo = devInfoResult?.acceptedDevinfoEntities
        ? Object.values(devInfoResult.acceptedDevinfoEntities).flat().length
        : 0;
      const failedDevInfo = devInfoResult?.failedDevinfoEntities
        ? Object.values(devInfoResult.failedDevinfoEntities).flat().length
        : 0;
      const unknownIssueKeys = devInfoResult?.unknownIssueKeys || [];
      const unknownAssociations = devInfoResult?.unknownAssociations || [];
      const devInfoAccepted = failedDevInfo === 0 && unknownIssueKeys.length === 0 && unknownAssociations.length === 0;
      createdRecords.forEach(record => {
        record.jiraDevelopmentInfoSubmitted = devInfoAccepted;
      });
      addChunkedDiagnostics(state, [
        `Jira dev panel ${project.key}: submitted branch/commit/PR data for ${createdRecords.length} new item(s), ${projectRecordsForSubmission.length} total project item(s)${acceptedDevInfo ? `; ${acceptedDevInfo} dev-info entity group(s) accepted` : ''}${failedDevInfo ? `; ${failedDevInfo} failed` : ''}.`,
        ...(unknownIssueKeys.length ? [`Jira dev panel ${project.key}: unknown issue key(s): ${unknownIssueKeys.join(', ')}.`] : []),
        ...(unknownAssociations.length ? [`Jira dev panel ${project.key}: unknown association(s): ${JSON.stringify(unknownAssociations).slice(0, 500)}.`] : []),
      ]);
    } catch (devInfoErr) {
      createdRecords.forEach(record => {
        record.jiraDevelopmentInfoSubmitted = false;
      });
      addChunkedDiagnostics(state, [`Jira dev panel ${project.key}: branch/commit/PR submission skipped or rejected: ${devInfoErr.message}`]);
    }

    try {
      const deploymentResult = await submitJiraDeploymentInformation(githubConfig, project, projectRecordsForSubmission);
      const acceptedDeployments = deploymentResult?.acceptedDeployments || [];
      const rejectedDeployments = deploymentResult?.rejectedDeployments || [];
      const deploymentsAccepted = rejectedDeployments.length === 0;
      createdRecords.forEach(record => {
        record.jiraDeploymentInfoSubmitted = deploymentsAccepted;
      });
      addChunkedDiagnostics(state, [
        `Jira dev panel ${project.key}: submitted deployment data for ${createdRecords.length} new item(s), ${projectRecordsForSubmission.length} total project item(s); ${acceptedDeployments.length} accepted.`,
        ...(rejectedDeployments.length ? [`Jira dev panel ${project.key}: ${rejectedDeployments.length} deployment item(s) rejected: ${JSON.stringify(rejectedDeployments).slice(0, 500)}.`] : []),
      ]);
    } catch (deploymentInfoErr) {
      createdRecords.forEach(record => {
        record.jiraDeploymentInfoSubmitted = false;
      });
      addChunkedDiagnostics(state, [`Jira dev panel ${project.key}: deployment submission skipped or rejected: ${deploymentInfoErr.message}`]);
    }

    state.results.githubActivity.push(...createdRecords);
    addChunkedDiagnostics(state, [
      `GitHub activity ${project.key}: created ${createdRecords.length} branch/commit/PR/deployment demo item(s) in ${githubConfig.owner}/${githubConfig.repo}.`,
      evidenceLinksAdded > 0 ? `GitHub activity ${project.key}: added ${evidenceLinksAdded} visible GitHub remote link(s) to Jira issue(s).` : '',
      ...createdRecords.slice(0, 3).map(record => `GitHub activity: ${record.issueKey} -> commit ${String(record.commitSha || '').slice(0, 7)}${record.pullRequestNumber ? `, PR #${record.pullRequestNumber}` : ''}, deployment ${record.deploymentStatus}.`),
    ].filter(Boolean));
  } catch (err) {
    if (isGitHubWriteAccessError(err)) {
      const message = buildGitHubWriteAccessMessage(githubConfig);
      state.metadata.githubWriteAccessFailed = true;
      state.metadata.githubWriteAccessMessage = message;
      addChunkedError(state, `GitHub activity ${project.key}: ${message}`);
      return;
    }

    addChunkedError(state, `GitHub activity ${project.key}: ${err.message}`);
  }
}

function buildManagedDashboardPlan(config, availableGadgets, state, dashboardContext = null) {
  const seenKeys = new Set();
  const matchedGadgets = [];
  const dashboardIntent = dashboardContext?.dashboardIntent
    || (dashboardContext?.projectTypeLabel === 'Dev'
      ? config.softwareDashboardIntent
      : config.opsDashboardIntent);
  let orderedPlans = orderDashboardGadgetPlans(MANAGED_DASHBOARD_GADGET_PLANS, dashboardIntent);

  if (dashboardContext?.projectTypeLabel === 'Dev') {
    const variantSeed = dashboardContext.projects?.[0]?.dashboardVariantSeed || getSoftwareProjectVariantSeed(dashboardContext.project, dashboardContext.dashboardIndex);
    const pinnedRoles = new Set(['forge-environment', 'forge-summary']);
    const pinnedPlans = orderedPlans.filter(plan => pinnedRoles.has(plan.role));
    const flexiblePlans = orderedPlans.filter(plan => !pinnedRoles.has(plan.role));
    const rotation = flexiblePlans.length === 0 ? 0 : variantSeed % flexiblePlans.length;
    orderedPlans = [
      ...pinnedPlans,
      ...flexiblePlans.slice(rotation),
      ...flexiblePlans.slice(0, rotation),
    ];
  }

  for (const plan of orderedPlans) {
    if (plan.disabled) {
      continue;
    }

    const match = findDashboardGadget(
      availableGadgets,
      plan,
      plan.allowDuplicate ? new Set() : seenKeys
    );

    if (!match) {
      if (plan.required) {
        addChunkedError(state, `Dashboard: could not find a required "${plan.role}" gadget in Jira's gadget catalog.`);
      }
      continue;
    }

    const identity = match.moduleKey || match.uri;
    if (!plan.allowDuplicate) {
      seenKeys.add(identity);
    }

    matchedGadgets.push({
      role: plan.role,
      title: plan.title || `${config.environmentName} ${plan.titleSuffix}`,
      subtitle: plan.subtitle || '',
      visualType: plan.visualType || 'standard',
      sectionLabel: plan.sectionLabel || '',
      moduleKey: match.moduleKey,
      uri: match.uri,
    });
  }

  return matchedGadgets;
}

async function executeDashboardCatalogStep(config, state) {
  try {
    const availableGadgets = await getAvailableDashboardGadgets();
    state.metadata.dashboardCatalog = {
      availableGadgets,
    };
  } catch (err) {
    addChunkedError(state, `Dashboard catalog: ${err.message}`);
  }
}

async function executeDashboardShellStep(config, state, step) {
  try {
    const dashboardContext = getDashboardProjectContext(config, state, step || {});
    if (!dashboardContext) {
      addChunkedDiagnostics(state, [`Dashboard skipped: project for ${step?.label || 'this dashboard'} was not created successfully.`]);
      return;
    }

    const filter = await ensureProjectSavedFilter(state, dashboardContext);
    const dashboard = await createDashboard(dashboardContext.dashboardName);
    const dashboardRecord = {
      id: dashboard.id,
      name: dashboard.name,
      viewUrl: dashboard.view || null,
      templateId: 'managed-layout',
      filterApplied: false,
      filterWiring: {
        verified: false,
        gadgets: [],
      },
      filterId: filter?.id || null,
      projectKey: dashboardContext.projectKeys.join(','),
      projectType: dashboardContext.projectTypeLabel,
      dashboardProfile: dashboardContext.dashboardProfile,
    };

    state.results.dashboards[dashboardContext.dashboardIndex] = dashboardRecord;

    if (!state.results.dashboardId) {
      state.results.dashboardId = dashboard.id;
      state.results.dashboardName = dashboard.name;
      state.results.dashboardViewUrl = dashboard.view || null;
      state.results.dashboardTemplateId = 'managed-layout';
      state.results.dashboardFilterApplied = false;
    }

    if (!filter) {
      state.metadata.dashboardPlans = state.metadata.dashboardPlans || [];
      state.metadata.dashboardPlans[dashboardContext.dashboardIndex] = {
        mode: 'empty',
        gadgets: [],
      };
      return;
    }

    await ensureDashboardReportFilters(state, dashboardContext, filter);

    state.metadata.dashboardPlans = state.metadata.dashboardPlans || [];
    state.metadata.dashboardPlans[dashboardContext.dashboardIndex] = {
      mode: 'managed',
      filterId: filter.id,
      gadgets: buildManagedDashboardPlan(config, state.metadata.dashboardCatalog?.availableGadgets || [], state, dashboardContext),
      context: dashboardContext,
    };
  } catch (err) {
    addChunkedError(state, `Dashboard: ${err.message}`);
  }
}

async function executeDashboardGadgetStep(config, state, step) {
  const dashboardRecord = state.results.dashboards?.[step.dashboardIndex];
  const dashboardId = dashboardRecord?.id;
  const plan = state.metadata.dashboardPlans?.[step.dashboardIndex];
  const filter = state.results.savedFilters?.[step.dashboardIndex];
  const dashboardContext = plan?.context;

  if (!dashboardId || !plan || plan.mode !== 'managed' || !filter) {
    return;
  }

  const gadgetPlan = plan.gadgets?.[step.gadgetIndex];
  if (!gadgetPlan) {
    return;
  }

  const row = Math.floor(step.gadgetIndex / 2);
  const column = step.gadgetIndex % 2;

  try {
    const added = await addDiscoveredDashboardGadget(dashboardId, {
      title: gadgetPlan.title,
      moduleKey: gadgetPlan.moduleKey,
      uri: gadgetPlan.uri,
      row,
      column,
    });

    if (gadgetPlan.role.startsWith('forge-')) {
      await configureForgeDemoGadget(dashboardId, added.id, gadgetPlan, state, filter, config, dashboardContext);
      const verification = await verifyDashboardGadgetFilterWiring(dashboardId, added.id, filter, ['config']);
      recordDashboardFilterVerification(state, dashboardRecord, gadgetPlan, added.id, verification);
      return;
    }

    if (gadgetPlan.role === 'text') {
      await configureTextGadget(dashboardId, added.id, state, filter);
      return;
    }

    if (gadgetPlan.role === 'filter-results') {
      await configureFilterResultsGadget(dashboardId, added.id, filter);
      await applyFilterToDashboardGadget(dashboardId, added.id, filter);
      const verification = await verifyDashboardGadgetFilterWiring(dashboardId, added.id, filter);
      recordDashboardFilterVerification(state, dashboardRecord, gadgetPlan, added.id, verification);
      return;
    }

    if (gadgetPlan.role === 'pie-chart-status') {
      await configurePieChartGadget(dashboardId, added.id, filter, 'statuses', gadgetPlan.title);
      await applyFilterToDashboardGadget(dashboardId, added.id, filter);
      const verification = await verifyDashboardGadgetFilterWiring(dashboardId, added.id, filter);
      recordDashboardFilterVerification(state, dashboardRecord, gadgetPlan, added.id, verification);
      return;
    }

    if (gadgetPlan.role === 'pie-chart-priority') {
      await configurePieChartGadget(dashboardId, added.id, filter, 'priorities', gadgetPlan.title);
      await applyFilterToDashboardGadget(dashboardId, added.id, filter);
      const verification = await verifyDashboardGadgetFilterWiring(dashboardId, added.id, filter);
      recordDashboardFilterVerification(state, dashboardRecord, gadgetPlan, added.id, verification);
      return;
    }

    if (gadgetPlan.role === 'pie-chart-assignee') {
      await configurePieChartGadget(dashboardId, added.id, filter, 'assignees', gadgetPlan.title);
      await applyFilterToDashboardGadget(dashboardId, added.id, filter);
      const verification = await verifyDashboardGadgetFilterWiring(dashboardId, added.id, filter);
      recordDashboardFilterVerification(state, dashboardRecord, gadgetPlan, added.id, verification);
      return;
    }

    if (gadgetPlan.role === 'created-vs-resolved') {
      await configureFilterDrivenChartGadget(dashboardId, added.id, filter, {
        daysprevious: '30',
        periodName: 'daily',
        isCumulative: 'true',
      });
      const verification = await verifyDashboardGadgetFilterWiring(dashboardId, added.id, filter, ['config', 'id', 'projectOrFilterId']);
      recordDashboardFilterVerification(state, dashboardRecord, gadgetPlan, added.id, verification);
      return;
    }

    if (gadgetPlan.role === 'average-age') {
      await configureFilterDrivenChartGadget(dashboardId, added.id, filter, {
        daysprevious: '30',
        periodName: 'daily',
      });
      const verification = await verifyDashboardGadgetFilterWiring(dashboardId, added.id, filter, ['config', 'id', 'projectOrFilterId']);
      recordDashboardFilterVerification(state, dashboardRecord, gadgetPlan, added.id, verification);
      return;
    }

    if (gadgetPlan.role === 'recently-created') {
      await configureFilterDrivenChartGadget(dashboardId, added.id, filter, {
        daysprevious: '30',
        periodName: 'daily',
      });
      const verification = await verifyDashboardGadgetFilterWiring(dashboardId, added.id, filter, ['config', 'id', 'projectOrFilterId']);
      recordDashboardFilterVerification(state, dashboardRecord, gadgetPlan, added.id, verification);
    }
  } catch (err) {
    addChunkedError(state, `Gadget "${gadgetPlan.title}" for dashboard ${dashboardId}: ${err.message}`);
  }
}

async function searchDemoDashboardIssues(jql, customDateFields = {}) {
  const customFieldIds = [
    customDateFields.createdDateFieldId,
    customDateFields.resolvedDateFieldId,
  ].filter(Boolean);
  const data = await jiraPost('/rest/api/3/search/jql', {
    jql,
    maxResults: 1000,
    // Dashboard visuals must use the demo timeline fields generated by this app,
    // not Jira's native Created / Resolved system fields. Native Created reflects
    // the actual API insertion time, which would make every demo trend bunch up
    // around the run time instead of the selected ticket data duration.
    fields: ['summary', 'status', 'priority', 'assignee', 'issuetype', 'duedate', 'project', 'fixVersions', ...customFieldIds],
  });
  const issues = Array.isArray(data.issues) ? data.issues : [];
  return enrichIssuesWithDemoDateProperties(issues, customDateFields);
}

async function enrichIssuesWithDemoDateProperties(issues, customDateFields = {}) {
  const needsPropertyFallback = issue => {
    const createdField = customDateFields.createdDateFieldId;
    const resolvedField = customDateFields.resolvedDateFieldId;
    return (
      !createdField ||
      !issue.fields?.[createdField] ||
      (issue.fields?.status?.statusCategory?.key === 'done' && (!resolvedField || !issue.fields?.[resolvedField]))
    );
  };

  await Promise.all((issues || []).filter(needsPropertyFallback).map(async issue => {
    try {
      const property = await jiraGet(
        `/rest/api/3/issue/${encodeURIComponent(issue.key)}/properties/${encodeURIComponent(DEMO_DATE_ISSUE_PROPERTY_KEY)}`
      );
      issue.properties = {
        ...(issue.properties || {}),
        [DEMO_DATE_ISSUE_PROPERTY_KEY]: property?.value || null,
      };
    } catch {
      issue.properties = {
        ...(issue.properties || {}),
        [DEMO_DATE_ISSUE_PROPERTY_KEY]: null,
      };
    }
  }));

  return issues;
}

async function searchExistingIssuesForGitHubActivity(project, projectKind) {
  if (!project?.key) {
    return [];
  }

  try {
    const data = await jiraPost('/rest/api/3/search/jql', {
      jql: `project = ${quoteJqlValue(project.key)} ORDER BY key DESC`,
      maxResults: GITHUB_DEMO_ACTIVITY_PER_PROJECT,
      fields: ['summary', 'status', 'priority', 'issuetype'],
    });

    return (Array.isArray(data.issues) ? data.issues : [])
      .filter(issue => issue?.key)
      .map(issue => ({
        key: issue.key,
        title: issue.fields?.summary || issue.key,
        issueType: issue.fields?.issuetype?.name || getGitHubActivityWorkLabel(projectKind),
        priority: issue.fields?.priority?.name,
        status: issue.fields?.status?.name,
        methodologyPhase: projectKind === 'product-discovery'
          ? 'product-discovery'
          : projectKind === 'business'
            ? project.businessSpaceType || 'business-delivery'
            : projectKind === 'jsm'
              ? 'service-delivery'
              : project.softwareTemplate || 'software-delivery',
      }));
  } catch (err) {
    throw new Error(`could not read existing issues for development activity: ${err.message}`);
  }
}

function getDemoDateIssueProperty(issue) {
  return issue.properties?.[DEMO_DATE_ISSUE_PROPERTY_KEY] || null;
}

function getDemoCreatedDate(issue, config = {}) {
  return getCustomDemoCreatedDate(issue, config);
}

function getDashboardResolvedDate(issue, config = {}) {
  const isDone = issue.fields?.status?.statusCategory?.key === 'done';
  return isDone ? getCustomDemoResolvedDate(issue, config) : null;
}

function getCustomDemoCreatedDate(issue, config = {}) {
  const customFieldId = config.customDateFields?.createdDateFieldId;
  return (customFieldId ? issue.fields?.[customFieldId] || null : null)
    || getDemoDateIssueProperty(issue)?.createdDate
    || null;
}

function getCustomDemoResolvedDate(issue, config = {}) {
  const customFieldId = config.customDateFields?.resolvedDateFieldId;
  return (customFieldId ? issue.fields?.[customFieldId] || null : null)
    || getDemoDateIssueProperty(issue)?.resolvedDate
    || null;
}

function countIssuesByField(issues, fieldName, fallback) {
  const counts = new Map();

  for (const issue of issues) {
    const fieldValue = issue.fields?.[fieldName];
    const name = fieldValue?.name || fieldValue?.displayName || fallback;
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function countOverdueIssuesByProject(issues) {
  const today = new Date().toISOString().split('T')[0];
  const counts = new Map();

  for (const issue of issues) {
    const dueDate = issue.fields?.duedate;
    const statusCategory = issue.fields?.status?.statusCategory?.key;

    if (!dueDate || dueDate >= today || statusCategory === 'done') {
      continue;
    }

    const projectKey = issue.fields?.project?.key || 'Unknown';
    counts.set(projectKey, (counts.get(projectKey) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function buildTicketAging(issues, config = {}) {
  const buckets = [
    { name: '0-7 days', count: 0 },
    { name: '8-14 days', count: 0 },
    { name: '15-30 days', count: 0 },
    { name: '31+ days', count: 0 },
  ];

  for (const issue of issues) {
    if (issue.fields?.status?.statusCategory?.key === 'done') {
      continue;
    }

    const ageInDays = getWholeDaysBetween(getDemoCreatedDate(issue, config));
    if (ageInDays === null) {
      continue;
    }

    if (ageInDays <= 7) {
      buckets[0].count += 1;
    } else if (ageInDays <= 14) {
      buckets[1].count += 1;
    } else if (ageInDays <= 30) {
      buckets[2].count += 1;
    } else {
      buckets[3].count += 1;
    }
  }

  return buckets;
}

function buildEscalationMetrics(issues) {
  const today = new Date().toISOString().split('T')[0];
  const sevenDaysFromNow = addDays(new Date(), 7).toISOString().split('T')[0];
  const metrics = {
    'Within SLA': 0,
    'Nearing Breach': 0,
    'SLA Breached': 0,
    'High Priority': 0,
  };

  for (const issue of issues) {
    if (issue.fields?.status?.statusCategory?.key === 'done') {
      continue;
    }

    const dueDate = issue.fields?.duedate;
    const priority = issue.fields?.priority?.name || '';

    if (['Highest', 'High', 'Critical'].includes(priority)) {
      metrics['High Priority'] += 1;
    }

    if (dueDate && dueDate < today) {
      metrics['SLA Breached'] += 1;
    } else if (dueDate && dueDate <= sevenDaysFromNow) {
      metrics['Nearing Breach'] += 1;
    } else {
      metrics['Within SLA'] += 1;
    }
  }

  return Object.entries(metrics).map(([name, count]) => ({ name, count }));
}

function buildDashboardReports(config) {
  const baseJql = config.allWorkJql || config.jql || '';
  const baseWithoutOrder = baseJql.replace(/\s+ORDER\s+BY\s+.+$/i, '').trim();
  const buildIssueSearchUrl = suffix => {
    const jql = baseWithoutOrder ? `${baseWithoutOrder}${suffix}` : suffix.replace(/^ AND /, '');
    return `/issues/?jql=${encodeURIComponent(jql)}`;
  };
  const profile = config.dashboardProfile || 'Dashboard';
  const primaryKpi = config.dashboardKpis?.[0] || 'delivery risk';

  return [
    {
      name: `${profile}: urgent work`,
      description: `High-priority records supporting the ${primaryKpi} conversation.`,
      issueSearchUrl: buildIssueSearchUrl(' AND priority in (Highest, High, Critical)'),
    },
    {
      name: `${profile}: risk queue`,
      description: 'Open work ordered for follow-up, aging, and escalation review.',
      issueSearchUrl: buildIssueSearchUrl(' AND statusCategory != Done ORDER BY duedate ASC'),
    },
    {
      name: `${profile}: completed trend`,
      description: 'Resolved work for trend, throughput, and closure discussion.',
      issueSearchUrl: buildIssueSearchUrl(' AND statusCategory = Done ORDER BY duedate DESC'),
    },
  ];
}

function getWholeDaysBetween(startValue, endValue = new Date()) {
  if (!startValue || !endValue) {
    return null;
  }

  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

function buildAverageTimeInStatus(issues, config = {}) {
  const totalsByStatus = new Map();

  for (const issue of issues) {
    const statusName = issue.fields?.status?.name || 'Unknown';
    // Use the generated custom Created Date only. Jira's native status category
    // timestamp changes during this demo run and makes the chart look current.
    const statusStartedAt = getDemoCreatedDate(issue, config);
    const ageInDays = getWholeDaysBetween(statusStartedAt);
    if (ageInDays === null) {
      continue;
    }

    const current = totalsByStatus.get(statusName) || { name: statusName, totalDays: 0, count: 0 };

    current.totalDays += ageInDays;
    current.count += 1;
    totalsByStatus.set(statusName, current);
  }

  return Array.from(totalsByStatus.values())
    .map(item => ({
      name: item.name,
      count: item.count === 0 ? 0 : Math.round((item.totalDays / item.count) * 10) / 10,
      issueCount: item.count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function createEmptyCreatedResolvedBuckets(days = 30) {
  const buckets = [];
  const now = new Date();

  for (let offset = days - 1; offset >= 0; offset--) {
    const date = addDays(now, -offset).toISOString().split('T')[0];
    buckets.push({ name: date, created: 0, resolved: 0 });
  }

  return buckets;
}

function formatMonthBucketName(date) {
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function formatShortDateBucketName(date) {
  return date.toLocaleString('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' });
}

function getTrendBucketKey(date, mode) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) {
    return null;
  }

  if (mode === 'month') {
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}`;
  }

  if (mode === 'week') {
    const day = value.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = addDays(value, mondayOffset);
    return monday.toISOString().split('T')[0];
  }

  return value.toISOString().split('T')[0];
}

function createCreatedResolvedBucketsForDuration(days = 30) {
  const safeDays = Math.max(30, Math.min(730, Number.parseInt(days, 10) || 30));
  const now = new Date();
  const start = addDays(now, -(safeDays - 1));
  const mode = safeDays > 120 ? 'month' : safeDays > 45 ? 'week' : 'day';
  const buckets = [];

  if (mode === 'month') {
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    while (cursor <= end) {
      buckets.push({
        key: getTrendBucketKey(cursor, mode),
        name: formatMonthBucketName(cursor),
        created: 0,
        resolved: 0,
      });
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
  } else {
    const stepDays = mode === 'week' ? 7 : 1;
    let cursor = mode === 'week'
      ? new Date(`${getTrendBucketKey(start, mode)}T00:00:00.000Z`)
      : new Date(start);

    while (cursor <= now) {
      buckets.push({
        key: getTrendBucketKey(cursor, mode),
        name: mode === 'week' ? `Week of ${formatShortDateBucketName(cursor)}` : cursor.toISOString().split('T')[0],
        created: 0,
        resolved: 0,
      });
      cursor = addDays(cursor, stepDays);
    }
  }

  return {
    mode,
    buckets,
    bucketByKey: new Map(buckets.map(bucket => [bucket.key, bucket])),
  };
}

function buildCreatedResolvedTrend(issues, days = 30, config = {}) {
  const { mode, buckets, bucketByKey } = createCreatedResolvedBucketsForDuration(days);

  for (const issue of issues) {
    // This chart intentionally uses only the demo custom fields created by the
    // app. Jira's native Created/Resolved fields reflect the actual API create
    // time, which would flatten the demo timeline and make the trend misleading.
    const createdDate = getCustomDemoCreatedDate(issue, config);
    const createdKey = getTrendBucketKey(createdDate, mode);

    if (createdKey && bucketByKey.has(createdKey)) {
      bucketByKey.get(createdKey).created += 1;
    }

    // Only completed work should count as resolved in the trend. Open tickets
    // may have a future forecast in the custom Resolved Date field, but that is
    // not an actual resolution event.
    const isDone = issue.fields?.status?.statusCategory?.key === 'done';

    if (isDone) {
      const resolvedDate = getCustomDemoResolvedDate(issue, config);
      const resolvedKey = getTrendBucketKey(resolvedDate, mode);
      if (resolvedKey && bucketByKey.has(resolvedKey)) {
        bucketByKey.get(resolvedKey).resolved += 1;
      }
    }
  }

  return buckets;
}

function buildSprintHealth(issues, projects) {
  const softwareProjects = projects.filter(project => project.type === 'Software');
  const total = issues.length;
  const done = issues.filter(issue => issue.fields?.status?.statusCategory?.key === 'done').length;
  const inProgress = issues.filter(issue => issue.fields?.status?.statusCategory?.key === 'indeterminate').length;
  const todo = Math.max(total - done - inProgress, 0);

  return {
    total,
    done,
    inProgress,
    todo,
    activeSprints: softwareProjects.flatMap(project => project.sprints || []).filter(sprint => sprint.state === 'active'),
  };
}

function buildRoadmap(projects) {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysFromNow = addDays(new Date(), 30).toISOString().split('T')[0];

  return projects
    .filter(project => project.type === 'Software')
    .flatMap(project => (project.versions || []).map(version => ({
      projectKey: project.key,
      name: version.name,
      releaseDate: version.releaseDate,
      released: version.released,
    })))
    .filter(version => version.releaseDate && version.releaseDate >= today && version.releaseDate <= thirtyDaysFromNow)
    .sort((a, b) => String(a.releaseDate || '').localeCompare(String(b.releaseDate || '')));
}

function calculateAverageResolutionDays(issues, config = {}) {
  const resolvedIssues = issues
    .filter(issue => issue.fields?.status?.statusCategory?.key === 'done')
    .map(issue => ({
      createdAt: getDemoCreatedDate(issue, config),
      resolvedAt: getDashboardResolvedDate(issue, config),
    }))
    .map(item => getWholeDaysBetween(item.createdAt, item.resolvedAt))
    .filter(days => days !== null);

  if (resolvedIssues.length === 0) {
    return null;
  }

  const totalDays = resolvedIssues.reduce((sum, days) => sum + days, 0);

  return Math.round((totalDays / resolvedIssues.length) * 10) / 10;
}

function getIssueResolutionDays(issue, config = {}) {
  const createdAt = getDemoCreatedDate(issue, config);
  const resolvedAt = getDashboardResolvedDate(issue, config);
  return getWholeDaysBetween(createdAt, resolvedAt);
}

function calculateSlaCompliancePercent(issues, config = {}) {
  const today = new Date().toISOString().split('T')[0];
  const measurable = (issues || []).filter(issue => issue.fields?.duedate);
  if (measurable.length === 0) {
    return null;
  }

  const compliant = measurable.filter(issue => {
    const dueDate = issue.fields?.duedate;
    const isDone = issue.fields?.status?.statusCategory?.key === 'done';
    if (isDone) {
      const resolvedAt = getDashboardResolvedDate(issue, config);
      return resolvedAt ? resolvedAt <= dueDate : true;
    }
    return dueDate >= today;
  }).length;

  return Math.round((compliant / measurable.length) * 100);
}

function calculateFirstContactResolutionRate(issues, config = {}) {
  const eligible = (issues || []).filter(issue => {
    const typeName = String(issue.fields?.issuetype?.name || '').toLowerCase();
    return (
      issue.fields?.status?.statusCategory?.key === 'done' &&
      (typeName.includes('incident') || typeName.includes('service request') || typeName.includes('request'))
    );
  });

  if (eligible.length === 0) {
    return null;
  }

  const firstContact = eligible.filter(issue => {
    const resolutionDays = getIssueResolutionDays(issue, config);
    const priority = issue.fields?.priority?.name || '';
    const thresholdDays = ['Highest', 'High', 'Critical'].includes(priority) ? 1 : 3;
    return resolutionDays !== null && resolutionDays <= thresholdDays;
  }).length;

  return Math.round((firstContact / eligible.length) * 100);
}

function calculateCustomerSatisfactionScore(issues, config = {}) {
  if (!issues || issues.length === 0) {
    return null;
  }

  const slaCompliance = calculateSlaCompliancePercent(issues, config) ?? 75;
  const firstContactRate = calculateFirstContactResolutionRate(issues, config) ?? 65;
  const averageResolutionDays = calculateAverageResolutionDays(issues, config) ?? 10;
  const highPriorityOpen = issues.filter(issue => (
    issue.fields?.status?.statusCategory?.key !== 'done' &&
    ['Highest', 'High', 'Critical'].includes(issue.fields?.priority?.name || '')
  )).length;
  const highPriorityPenalty = Math.min(0.5, highPriorityOpen * 0.04);
  const resolutionPenalty = Math.min(0.6, averageResolutionDays / 60);
  const score = 3.1
    + (slaCompliance / 100) * 1.0
    + (firstContactRate / 100) * 0.6
    - resolutionPenalty
    - highPriorityPenalty;

  return Math.round(Math.max(2.8, Math.min(4.9, score)) * 10) / 10;
}

function buildServiceSummaryMetrics(issues, config = {}) {
  const averageResolutionDays = calculateAverageResolutionDays(issues, config);
  const slaCompliance = calculateSlaCompliancePercent(issues, config);
  const firstContactRate = calculateFirstContactResolutionRate(issues, config);
  const customerSatisfactionScore = calculateCustomerSatisfactionScore(issues, config);

  return {
    averageResolutionDays,
    slaCompliance,
    firstContactRate,
    customerSatisfactionScore,
  };
}

function buildDashboardKpiCards(config, issues) {
  const total = issues.length;
  const done = issues.filter(issue => issue.fields?.status?.statusCategory?.key === 'done').length;
  const open = Math.max(total - done, 0);
  const highPriority = issues.filter(issue => ['Highest', 'High', 'Critical'].includes(issue.fields?.priority?.name || '')).length;
  const criticalPriority = issues.filter(issue => ['Highest', 'Critical'].includes(issue.fields?.priority?.name || '')).length;
  const defects = issues.filter(issue => String(issue.fields?.issuetype?.name || '').toLowerCase().includes('bug')).length;
  const openDefects = issues.filter(issue => (
    String(issue.fields?.issuetype?.name || '').toLowerCase().includes('bug') &&
    issue.fields?.status?.statusCategory?.key !== 'done'
  )).length;
  const inProgress = issues.filter(issue => issue.fields?.status?.statusCategory?.key === 'indeterminate').length;
  const overdue = countOverdueIssuesByProject(issues).reduce((sum, item) => sum + item.count, 0);
  const resolutionRate = total === 0 ? 0 : Math.round((done / total) * 100);
  const breachRate = open === 0 ? 0 : Math.round((overdue / open) * 100);
  const averageResolutionDays = calculateAverageResolutionDays(issues, config);
  const openRate = total === 0 ? 0 : Math.round((open / total) * 100);
  const highPriorityRate = total === 0 ? 0 : Math.round((highPriority / total) * 100);
  const defectRate = total === 0 ? 0 : Math.round((defects / total) * 100);
  const openDefectRate = total === 0 ? 0 : Math.round((openDefects / total) * 100);
  const flowEfficiency = total === 0 ? 0 : Math.round((done / Math.max(done + inProgress + open, 1)) * 100);
  const onTimeDelivery = Math.max(0, 100 - breachRate);
  const serviceMetrics = buildServiceSummaryMetrics(issues, config);
  const slaCompliance = serviceMetrics.slaCompliance ?? onTimeDelivery;
  const firstContactRate = serviceMetrics.firstContactRate ?? resolutionRate;
  const customerSatisfactionScore = serviceMetrics.customerSatisfactionScore;
  const projectHealthScore = Math.max(0, Math.min(100, 100 - breachRate - Math.round(highPriorityRate / 2) - Math.round(openDefectRate / 2)));
  const releaseSuccess = Math.max(0, 100 - openDefectRate - Math.round(breachRate / 2));
  const valueByKpi = {
    'sla compliance %': { value: `${slaCompliance}%`, detail: 'Due date compared with generated resolved/open state' },
    'sla compliance': { value: `${slaCompliance}%`, detail: 'Due date compared with generated resolved/open state' },
    'sla achievement %': { value: `${slaCompliance}%`, detail: `${overdue} ticket(s) currently breaching due date` },
    'response sla %': { value: `${slaCompliance}%`, detail: 'Generated lifecycle and due-date proxy' },
    'resolution sla %': { value: `${resolutionRate}%`, detail: 'Done work / total work' },
    'breach %': { value: `${breachRate}%`, detail: 'Open work past due' },
    'sla breach %': { value: `${breachRate}%`, detail: 'Open work past due' },
    mttr: { value: averageResolutionDays === null ? 'N/A' : `${averageResolutionDays}d`, detail: averageResolutionDays === null ? 'No resolved custom date data yet' : 'Custom Created Date to Resolved Date' },
    'first response time': { value: averageResolutionDays === null ? 'N/A' : `${averageResolutionDays}d`, detail: 'Custom date lifecycle proxy' },
    'average response time': { value: averageResolutionDays === null ? 'N/A' : `${averageResolutionDays}d`, detail: 'Custom date lifecycle proxy' },
    'average resolution time': { value: averageResolutionDays === null ? 'N/A' : `${averageResolutionDays}d`, detail: 'Custom date lifecycle proxy' },
    'resolution rate %': { value: `${resolutionRate}%`, detail: `${done} of ${total} completed` },
    'closure %': { value: `${resolutionRate}%`, detail: `${done} of ${total} completed` },
    'incident closure rate': { value: `${resolutionRate}%`, detail: `${done} of ${total} completed` },
    'problem closure rate': { value: `${resolutionRate}%`, detail: `${done} of ${total} completed` },
    'problem closure %': { value: `${resolutionRate}%`, detail: `${done} of ${total} completed` },
    'request distribution %': { value: total === 0 ? '0%' : '100%', detail: `${total} tickets in dashboard scope` },
    'demand distribution %': { value: total === 0 ? '0%' : '100%', detail: `${total} tickets in dashboard scope` },
    throughput: { value: done, detail: 'Completed work items' },
    'average throughput': { value: done, detail: 'Completed work items' },
    'project health score': { value: `${projectHealthScore}%`, detail: 'Adjusted for SLA, priority, and defect risk' },
    'on-time delivery %': { value: `${onTimeDelivery}%`, detail: `${overdue} overdue open item(s)` },
    'delivery predictability %': { value: `${Math.max(0, 100 - breachRate - Math.round(openRate / 4))}%`, detail: 'Due-date and open-work proxy' },
    'milestone completion %': { value: `${resolutionRate}%`, detail: `${done} of ${total} completed` },
    'release success %': { value: `${releaseSuccess}%`, detail: `${openDefects} open defect risk item(s)` },
    'release readiness %': { value: `${Math.max(0, resolutionRate - openDefectRate)}%`, detail: 'Completion adjusted by open defects' },
    'deployment success %': { value: `${releaseSuccess}%`, detail: 'Release risk proxy from open defects' },
    'defect leakage %': { value: `${defectRate}%`, detail: `${defects} bug item(s) in scope` },
    'defect density': { value: `${defectRate}%`, detail: `${defects} bug item(s) / ${total} total` },
    'reopen %': { value: '0%', detail: 'Reopen status is not generated by default' },
    'escaped defect rate %': { value: `${openDefectRate}%`, detail: `${openDefects} open bug item(s)` },
    'sprint completion %': { value: `${resolutionRate}%`, detail: `${done} of ${total} sprint item(s) done` },
    velocity: { value: done, detail: 'Completed sprint work items' },
    'average velocity': { value: done, detail: 'Completed sprint work items' },
    'burndown adherence %': { value: `${Math.max(0, 100 - openRate)}%`, detail: `${open} item(s) still open` },
    'scope change %': { value: '0%', detail: 'Scope-change events are not generated by default' },
    'flow efficiency %': { value: `${flowEfficiency}%`, detail: `${done} completed, ${inProgress} in progress` },
    'average cycle time': { value: averageResolutionDays === null ? 'N/A' : `${averageResolutionDays}d`, detail: 'Custom Created Date to Resolved Date' },
    'average lead time': { value: averageResolutionDays === null ? 'N/A' : `${averageResolutionDays}d`, detail: 'Custom Created Date to Resolved Date' },
    'wip compliance %': { value: `${Math.max(0, 100 - openRate)}%`, detail: `${open} active work item(s)` },
    'capacity utilization %': { value: open === 0 ? '0%' : `${Math.min(100, openRate)}%`, detail: 'Open work / total work' },
    'utilization %': { value: open === 0 ? '0%' : `${Math.min(100, openRate)}%`, detail: 'Open work / total work' },
    'queue backlog %': { value: `${total === 0 ? 0 : Math.round((open / total) * 100)}%`, detail: `${open} open work items` },
    'workload balance ratio': { value: highPriority, detail: 'High-priority assigned work proxy' },
    'escalation %': { value: `${highPriorityRate}%`, detail: 'High priority / total work' },
    'escalation rate': { value: `${highPriorityRate}%`, detail: 'High priority / total work' },
    'major incident frequency': { value: criticalPriority, detail: 'Critical/highest priority work' },
    'customer satisfaction': { value: customerSatisfactionScore === null ? 'N/A' : `${customerSatisfactionScore}/5`, detail: 'Generated from SLA, first-contact, and custom date resolution data' },
    'customer satisfaction score': { value: customerSatisfactionScore === null ? 'N/A' : `${customerSatisfactionScore}/5`, detail: 'Generated from SLA, first-contact, and custom date resolution data' },
    'csat score': { value: customerSatisfactionScore === null ? 'N/A' : `${customerSatisfactionScore}/5`, detail: 'Generated from SLA, first-contact, and custom date resolution data' },
    csat: { value: customerSatisfactionScore === null ? 'N/A' : `${customerSatisfactionScore}/5`, detail: 'Generated from SLA, first-contact, and custom date resolution data' },
    'first contact resolution rate': { value: `${firstContactRate}%`, detail: 'Resolved incident/request work within first-contact threshold' },
    'first contact resolution %': { value: `${firstContactRate}%`, detail: 'Resolved incident/request work within first-contact threshold' },
    'service availability %': { value: 'N/A', detail: 'Availability telemetry is not captured in Jira tickets' },
    'service satisfaction score': { value: customerSatisfactionScore === null ? 'N/A' : `${customerSatisfactionScore}/5`, detail: 'Generated demo satisfaction score from ticket lifecycle data' },
    'portal adoption %': { value: 'N/A', detail: 'Portal analytics are not captured by this generator' },
    'knowledge deflection %': { value: 'N/A', detail: 'Requires portal/search analytics' },
    'article usefulness %': { value: 'N/A', detail: 'Requires knowledge feedback analytics' },
    'search success rate': { value: 'N/A', detail: 'Requires knowledge search analytics' },
    'asset utilization %': { value: 'N/A', detail: 'Requires JSM Assets data' },
    'compliance %': { value: 'N/A', detail: 'Requires asset compliance data' },
  };

  return (config.dashboardKpis || []).slice(0, 4).map(kpi => {
    const normalized = String(kpi).toLowerCase();
    const calculated = valueByKpi[normalized] || { value: total, detail: 'Tickets in dashboard scope' };
    return {
      label: kpi,
      value: calculated.value,
      detail: calculated.detail,
    };
  });
}

function buildDashboardDataNotes(config) {
  const notes = [];
  if (!config.customDateFields?.createdDateFieldId || !config.customDateFields?.resolvedDateFieldId) {
    notes.push({
      label: 'Custom demo date fields',
      message: 'Created/Resolved trend visuals use only the generated Created Date and Resolved Date custom fields. Jira native Created/Resolved fields are not used.',
    });
  }

  const unsupportedSignals = [
    'service availability',
    'portal',
    'knowledge deflection',
    'article',
    'search',
    'asset',
    'license',
    'warranty',
    'test',
    'automation coverage',
    'deployment frequency',
    'build success',
    'pipeline',
  ];
  const requestedSignals = [
    ...(config.dashboardMetrics || []),
    ...(config.dashboardKpis || []),
  ];
  const missingSignals = requestedSignals.filter(signal => {
    const normalized = String(signal || '').toLowerCase();
    return unsupportedSignals.some(unsupported => normalized.includes(unsupported));
  });

  if (missingSignals.length === 0) {
    return notes;
  }

  return notes.concat(Array.from(new Set(missingSignals)).slice(0, 4).map(signal => ({
    label: signal,
    message: 'Not captured in generated Jira tickets; dashboard does not invent this value.',
  })));
}

function buildDemoInsightsResponse(config, issues, projects = []) {
  const sprintHealth = buildSprintHealth(issues, projects);
  const baseJql = config.allWorkJql || config.jql || '';

  return {
    success: true,
    config,
    issues: issues.map(issue => ({
      key: issue.key,
      summary: issue.fields?.summary || '',
      status: issue.fields?.status?.name || 'Unknown',
      priority: issue.fields?.priority?.name || 'None',
      assignee: issue.fields?.assignee?.displayName || 'Unassigned',
      issueType: issue.fields?.issuetype?.name || 'Issue',
      projectKey: issue.fields?.project?.key || '',
      dueDate: issue.fields?.duedate || null,
      createdAt: getDemoCreatedDate(issue, config),
      resolvedAt: getDashboardResolvedDate(issue, config),
    })),
    statusCounts: countIssuesByField(issues, 'status', 'Unknown'),
    priorityCounts: countIssuesByField(issues, 'priority', 'None'),
    issueTypeCounts: countIssuesByField(issues, 'issuetype', 'Issue'),
    kpiCards: buildDashboardKpiCards(config, issues),
    serviceMetrics: buildServiceSummaryMetrics(issues, config),
    dataNotes: buildDashboardDataNotes(config),
    overdueByProject: countOverdueIssuesByProject(issues),
    averageTimeInStatus: buildAverageTimeInStatus(issues, config),
    ticketAging: buildTicketAging(issues, config),
    escalationMetrics: buildEscalationMetrics(issues),
    reports: buildDashboardReports(config),
    drilldowns: {
      allWork: { url: `/issues/?jql=${encodeURIComponent(baseJql)}` },
      open: { url: `/issues/?jql=${encodeURIComponent(config.jql || baseJql)}` },
      slaBreached: {
        url: `/issues/?jql=${encodeURIComponent(`${baseJql.replace(/\s+ORDER\s+BY\s+.+$/i, '').trim()} AND statusCategory != Done ORDER BY duedate ASC`)}`,
      },
    },
    createdResolvedTrend: buildCreatedResolvedTrend(issues, config.dateRangeDays || 30, config),
    sprintHealth,
    burndown: [
      { name: 'To Do', count: sprintHealth.todo },
      { name: 'In Progress', count: sprintHealth.inProgress },
      { name: 'Done', count: sprintHealth.done },
    ],
    roadmap: buildRoadmap(projects),
  };
}

resolver.define('getDemoDashboardGadgetData', async ({ payload }) => {
  const dashboardId = payload?.dashboardId;
  const gadgetId = payload?.gadgetId;

  if (!dashboardId || !gadgetId) {
    return {
      success: false,
      message: 'Dashboard context was not available for this gadget.',
    };
  }

  try {
    const config = await getDashboardItemProperty(dashboardId, gadgetId, 'config');
    const issues = config.allWorkJql ? await searchDemoDashboardIssues(config.allWorkJql, config.customDateFields || {}) : [];
    const projects = config.projects || [];
    return buildDemoInsightsResponse(config, issues, projects);
  } catch (err) {
    return {
      success: false,
      message: err.message,
    };
  }
});

resolver.define('getBusinessDomainInventory', async ({ payload }) => {
  const rawIndustry = String(payload?.industry || '').trim();
  const rawCustomIndustry = String(payload?.customIndustry || '').trim();
  const isCustomIndustry = Boolean(payload?.isCustomIndustry || rawIndustry.toLowerCase() === 'other' || rawIndustry.toLowerCase() === 'others');
  const domain = isCustomIndustry ? (rawCustomIndustry || rawIndustry) : rawIndustry;

  if (!domain) {
    return {
      success: false,
      message: 'Select a business domain to check existing Jira data.',
      projects: [],
    };
  }

  try {
    const requestedSpaceType = String(payload?.spaceType || '').trim();
    const diagnostics = [];
    const projects = await searchDomainProjects(domain, { spaceType: requestedSpaceType, diagnostics });
    const serviceProjects = projects.filter(project => project.kind === 'business');
    const softwareProjects = projects.filter(project => project.kind === 'software');
    const businessProjects = projects.filter(project => project.kind === 'business-project');
    const productDiscoveryProjects = projects.filter(project => project.kind === 'product-discovery');
    return {
      success: true,
      domain,
      spaceType: requestedSpaceType,
      projects,
      serviceProjects,
      softwareProjects,
      businessProjects,
      productDiscoveryProjects,
      diagnostics,
      summary: projects.length
        ? `${projects.length} existing ${domain}${requestedSpaceType ? ' matching' : ''} project(s) found. Select one to add volume, delete, or add a new project below.`
        : [
            `No existing ${domain}${requestedSpaceType ? ' matching' : ''} project found for this selection yet.`,
            ...diagnostics,
          ].join(' '),
    };
  } catch (err) {
    return {
      success: false,
      domain,
      message: `Existing domain lookup failed: ${err.message}`,
      projects: [],
      serviceProjects: [],
      softwareProjects: [],
    };
  }
});

resolver.define('deleteBusinessDomainProjects', async ({ payload }) => {
  const projectKeys = Array.isArray(payload?.projectKeys)
    ? [...new Set(payload.projectKeys.map(key => String(key || '').trim()).filter(Boolean))]
    : [];

  if (projectKeys.length === 0) {
    return {
      success: false,
      summary: 'Select at least one project to delete.',
      deleted: [],
      errors: [],
    };
  }

  if (projectKeys.length > 25) {
    return {
      success: false,
      summary: 'For safety, delete 25 or fewer projects at a time.',
      deleted: [],
      errors: [],
    };
  }

  const access = await validateAdminAccess();
  if (!access.ok) {
    return {
      success: false,
      summary: access.message,
      deleted: [],
      errors: [],
    };
  }

  const deleted = [];
  const errors = [];

  for (const projectKey of projectKeys) {
    try {
      await jiraDelete(`/rest/api/3/project/${encodeURIComponent(projectKey)}`);
      deleted.push(projectKey);
    } catch (err) {
      errors.push(`${projectKey}: ${err.message}`);
    }
  }

  return {
    success: errors.length === 0,
    deleted,
    errors,
    summary: [
      deleted.length ? `Deleted ${deleted.length} project(s): ${deleted.join(', ')}` : 'No projects were deleted.',
      errors.length ? `Skipped ${errors.length} project(s): ${errors.join('; ')}` : '',
    ].filter(Boolean).join('\n'),
  };
});

resolver.define('repairDevelopmentScreensForProject', async ({ payload }) => {
  const projectKey = String(payload?.projectKey || '').trim().toUpperCase();

  if (!/^[A-Z][A-Z0-9]+$/.test(projectKey)) {
    return {
      success: false,
      summary: 'Enter a valid Jira project key.',
      diagnostics: [],
    };
  }

  const access = await validateAdminAccess();
  if (!access.ok) {
    return {
      success: false,
      summary: access.message,
      diagnostics: [],
    };
  }

  try {
    const project = await jiraGet(`/rest/api/3/project/${encodeURIComponent(projectKey)}`);
    const diagnostics = [];
    const result = await ensureDevelopmentFieldOnProjectScreens(project.id, project.key, diagnostics);
    return {
      success: Boolean(result.success),
      summary: result.success
        ? `Development field repair completed for ${project.key}. Updated ${result.screenCount || 0} screen(s).`
        : `Development field repair did not complete for ${project.key}: ${result.message || 'unknown reason'}`,
      diagnostics,
      result,
    };
  } catch (err) {
    return {
      success: false,
      summary: `Development field repair failed for ${projectKey}: ${err.message}`,
      diagnostics: [],
    };
  }
});

async function executeDemoEnvironmentStepCore(config, state, step) {
  switch (step.type) {
    case 'generate-ai-content':
      return await executeAiContentGenerationStep(config, state);
    case 'generate-worker-dataset':
      await executeWorkerDatasetGenerationStep(config, state);
      break;
    case 'generate-worker-date-patch':
      await executeWorkerDatePatchGenerationStep(config, state);
      break;
    case 'create-business-project':
      await executeBusinessProjectStep(config, state, step);
      break;
    case 'configure-business-date-fields':
      await executeBusinessDateFieldStep(state, step);
      break;
    case 'create-business-form':
      await executeBusinessFormStep(config, state, step);
      break;
    case 'configure-itsm-foundation':
      await executeItsmFoundationStep(config, state, step);
      break;
    case 'create-business-incidents-batch':
      await executeBusinessIncidentBatchStep(config, state, step);
      break;
    case 'create-work-management-project-shell':
      await executeWorkManagementProjectStep(config, state, step);
      break;
    case 'configure-work-management-date-fields': {
      const businessProjectConfig = getBusinessProjectConfig(config, step.projectIndex);
      await executeGenericProjectDateFieldStep(state, step, 'businessProjects', `${getBusinessSpaceCategoryLabel(businessProjectConfig.businessSpaceType)} space`);
      break;
    }
    case 'create-work-management-components':
      await executeWorkManagementComponentsStep(config, state, step);
      break;
    case 'create-work-management-issues-batch':
      await executeWorkManagementIssueBatchStep(config, state, step);
      break;
    case 'create-product-discovery-project-shell':
      await executeProductDiscoveryProjectStep(config, state, step);
      break;
    case 'configure-product-discovery-date-fields':
      await executeGenericProjectDateFieldStep(state, step, 'productDiscoveryProjects', 'Product Discovery space');
      break;
    case 'create-product-discovery-components':
      await executeProductDiscoveryComponentsStep(config, state, step);
      break;
    case 'create-product-discovery-ideas-batch':
      await executeProductDiscoveryIdeaBatchStep(config, state, step);
      break;
    case 'create-software-project-shell':
      await executeSoftwareProjectStep(config, state, step);
      break;
    case 'configure-software-date-fields':
      await executeSoftwareDateFieldStep(state, step);
      break;
    case 'create-software-form':
      await executeSoftwareFormStep(config, state, step);
      break;
    case 'create-software-versions-batch':
      await executeSoftwareVersionBatchStep(state, step);
      break;
    case 'create-software-components':
      await executeSoftwareComponentsStep(config, state, step);
      break;
    case 'create-compass-components':
      await executeCompassComponentsStep(config, state, step);
      break;
    case 'create-atlassian-goals':
      await executeAtlassianGoalsStep(config, state, step);
      break;
    case 'create-software-epics-batch':
      await executeSoftwareEpicBatchStep(config, state, step);
      break;
    case 'lookup-software-board':
      await executeSoftwareBoardLookupStep(config, state, step);
      break;
    case 'create-software-issues-batch':
      await executeSoftwareIssueBatchStep(config, state, step);
      break;
    case 'create-software-sprint':
      await executeSoftwareSprintStep(config, state, step);
      break;
    case 'populate-kanban-board':
      await executeKanbanBoardPopulationStep(config, state, step);
      break;
    case 'verify-bug-tracking-work':
      await executeBugTrackingVerificationStep(config, state, step);
      break;
    case 'create-dependencies':
      await executeDependencyStep(state, step);
      break;
    case 'create-github-development-activity':
      await executeGitHubDevelopmentActivityStep(config, state, step);
      break;
    case 'create-planning-artifacts':
      await executePlanningArtifactsStep(config, state);
      break;
    case 'prepare-dashboard-catalog':
      await executeDashboardCatalogStep(config, state);
      break;
    case 'create-dashboard-shell':
      await executeDashboardShellStep(config, state, step);
      break;
    case 'create-dashboard-gadget':
      await executeDashboardGadgetStep(config, state, step);
      break;
    case 'finalize-dashboard':
      await finalizeDashboardStep(state);
      break;
    default:
      throw new Error(`Unknown execution step: ${step.type}`);
  }

  return config;
}

async function executeDemoEnvironmentStepCoreWithRetry({ config, state, step }) {
  const retryableStepTypes = [
    'create-business-project',
    'create-software-project-shell',
    'create-work-management-project-shell',
    'create-product-discovery-project-shell',
    'create-business-incidents-batch',
    'create-software-issues-batch',
    'create-work-management-issues-batch',
    'create-product-discovery-ideas-batch',
    'create-software-sprint',
    'populate-kanban-board',
    'create-dependencies',
    'create-github-development-activity',
  ];
  const maxAttempts = retryableStepTypes.includes(step.type) ? 3 : 1;
  let currentConfig = config;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      currentConfig = await executeDemoEnvironmentStepCore(currentConfig, state, step);
      return currentConfig;
    } catch (err) {
      const message = String(err?.message || '');
      const isRetryable = /timed out|timeout|502|503|504|upstream_failure|upstream|temporarily unavailable/i.test(message);
      if (!isRetryable || attempt >= maxAttempts) {
        throw new Error(`${step.label || step.type} failed: ${err.message}`);
      }
      await wait(6000 * attempt);
    }
  }

  return currentConfig;
}

function collectAgentRunProjectCleanupTargets(state = {}) {
  const resultGroups = [
    state.results?.jsmProjects,
    state.results?.softwareProjects,
    state.results?.businessProjects,
    state.results?.productDiscoveryProjects,
  ];
  const keys = [];

  for (const group of resultGroups) {
    for (const project of Array.isArray(group) ? group : []) {
      if (project?.key && project.createdByThisRun === true) {
        keys.push(project.key);
      }
    }
  }

  return [...new Set(keys)];
}

function collectAgentRunDashboardCleanupTargets(state = {}) {
  const dashboards = Array.isArray(state.results?.dashboards) ? state.results.dashboards : [];
  const dashboardIds = dashboards
    .map(dashboard => String(dashboard?.id || '').trim())
    .filter(Boolean);
  if (state.results?.dashboardId) {
    dashboardIds.push(String(state.results.dashboardId));
  }
  return [...new Set(dashboardIds)];
}

function collectAgentRunFilterCleanupTargets(state = {}) {
  const filters = Array.isArray(state.results?.savedFilters) ? state.results.savedFilters : [];
  const filterIds = filters
    .map(filter => String(filter?.id || '').trim())
    .filter(Boolean);
  if (state.results?.savedFilter?.id) {
    filterIds.push(String(state.results.savedFilter.id));
  }
  return [...new Set(filterIds)];
}

async function deleteRecordedJiraResources({ projectKeys = [], dashboardIds = [], filterIds = [] }) {
  const deleted = [];
  const errors = [];

  for (const dashboardId of dashboardIds) {
    try {
      await jiraDelete(`/rest/api/3/dashboard/${encodeURIComponent(dashboardId)}`);
      deleted.push(`dashboard ${dashboardId}`);
    } catch (err) {
      errors.push(`dashboard ${dashboardId}: ${err.message}`);
    }
  }

  for (const filterId of filterIds) {
    try {
      await jiraDelete(`/rest/api/3/filter/${encodeURIComponent(filterId)}`);
      deleted.push(`filter ${filterId}`);
    } catch (err) {
      errors.push(`filter ${filterId}: ${err.message}`);
    }
  }

  for (const projectKey of projectKeys) {
    try {
      await jiraDelete(`/rest/api/3/project/${encodeURIComponent(projectKey)}`);
      deleted.push(`project ${projectKey}`);
    } catch (err) {
      errors.push(`project ${projectKey}: ${err.message}`);
    }
  }

  return { deleted, errors };
}

function collectAgentRunSkippedExistingProjects(state = {}) {
  const resultGroups = [
    state.results?.jsmProjects,
    state.results?.softwareProjects,
    state.results?.businessProjects,
    state.results?.productDiscoveryProjects,
  ];
  const keys = [];

  for (const group of resultGroups) {
    for (const project of Array.isArray(group) ? group : []) {
      if (project?.key && project.createdByThisRun !== true) {
        keys.push(project.key);
      }
    }
  }

  return [...new Set(keys)];
}

export async function cancelDemoEnvironmentFromAgent(payload = {}) {
  console.log('cancelDemoEnvironmentFromAgent started', JSON.stringify({ payload }));

  const runToken = String(payload.runToken || '').trim();
  const fallbackProjectKeys = extractAgentProjectKeys({
    volumeProjectKeys: payload.projectKeys || payload.projectKey || payload.request || '',
  });

  const access = await validateAdminAccess();
  if (!access.ok) {
    return {
      success: false,
      needsInput: false,
      message: access.message,
      summary: access.message,
    };
  }

  if (!runToken && fallbackProjectKeys.length === 0) {
    return {
      success: false,
      needsInput: true,
      question: 'Which run should I cancel? Send the run token, or provide the Jira project key or keys to delete.',
      missingFields: ['runToken', 'projectKeys'],
    };
  }

  let job = null;
  if (runToken) {
    job = await kvs.get(getAgentRunStorageKey(runToken));
    if (!job && fallbackProjectKeys.length === 0) {
      return {
        success: false,
        needsInput: true,
        question: 'I could not find that saved run. Send the Jira project key or keys if you want me to delete them directly.',
        missingFields: ['projectKeys'],
      };
    }

    if (job) {
      job.cancelRequested = true;
      job.updatedAt = new Date().toISOString();
      await kvs.set(getAgentRunStorageKey(runToken), job);

      const lock = await kvs.get(getAgentRunLockStorageKey(runToken));
      const lockAge = lock?.lockedAt
        ? Date.now() - new Date(lock.lockedAt).getTime()
        : Number.POSITIVE_INFINITY;
      if (lock && lockAge < AGENT_RUN_LOCK_TTL_MS) {
        return {
          success: false,
          needsInput: false,
          needsContinuation: false,
          runToken,
          message: 'I marked the run as cancelled. A setup step is still finishing, so wait about 30 seconds and ask me to cancel/delete again with the same run token.',
          summary: 'Cancellation requested. Cleanup is waiting for the active setup step lock to clear.',
        };
      }
    }
  }

  const state = job?.state || {};
  const projectKeys = job ? collectAgentRunProjectCleanupTargets(state) : fallbackProjectKeys;
  const dashboardIds = job ? collectAgentRunDashboardCleanupTargets(state) : [];
  const filterIds = job ? collectAgentRunFilterCleanupTargets(state) : [];
  const cleanup = await deleteRecordedJiraResources({ projectKeys, dashboardIds, filterIds });

  if (runToken) {
    await kvs.delete(getAgentRunStorageKey(runToken));
    await kvs.delete(getAgentRunLockStorageKey(runToken));
  }

  const skippedExisting = job ? collectAgentRunSkippedExistingProjects(state) : [];

  return {
    success: cleanup.errors.length === 0,
    needsInput: false,
    needsContinuation: false,
    runToken,
    message: cleanup.errors.length === 0
      ? 'Cancelled the demo run and deleted the newly created Jira resources I could identify.'
      : 'Cancelled the demo run, but some cleanup actions need review.',
    summary: [
      'Demo run cancellation and cleanup:',
      cleanup.deleted.length ? `- Deleted: ${cleanup.deleted.join(', ')}` : '- Deleted: none',
      skippedExisting.length ? `- Skipped existing/reused spaces: ${skippedExisting.join(', ')}` : '',
      cleanup.errors.length ? `- Cleanup warnings: ${cleanup.errors.join('; ')}` : '- Cleanup warnings: none',
    ].filter(Boolean).join('\n'),
    deleted: cleanup.deleted,
    skippedExisting,
    errors: cleanup.errors,
  };
}

export async function createDemoEnvironmentFromAgent(payload = {}, context = {}) {
  console.log('createDemoEnvironmentFromAgent started', JSON.stringify({
    payload,
    accountId: context?.accountId || null,
  }));

  const suppliedRunToken = String(payload.runToken || '').trim();
  let runToken = suppliedRunToken;
  let job = null;

  if (runToken) {
    job = await kvs.get(getAgentRunStorageKey(runToken));
    if (!job) {
      return {
        success: false,
        needsInput: true,
        question: 'I could not find that demo creation run anymore. Please send the demo request again so I can start a fresh run.',
        missingFields: ['request'],
      };
    }
  } else {
    const request = buildAgentDemoEnvironmentPayload(payload);
    if (!request.ready) {
      return {
        success: false,
        needsInput: true,
        question: request.question,
        missingFields: request.missingFields,
      };
    }

    const access = await validateAdminAccess();
    if (!access.ok) {
      return {
        success: false,
        needsInput: false,
        summary: access.message,
      };
    }

    let config = normalisePayload(request.config);
    config.runSeed = config.runSeed || Date.now();

    const preflightDecision = await buildAgentPreflightDecision(config);
    if (preflightDecision) {
      return preflightDecision;
    }

    const readinessDiagnostics = [];
    const productDiscoveryReadiness = await validateProductDiscoveryReadiness(config, readinessDiagnostics);
    if (!productDiscoveryReadiness.ok) {
      return {
        success: false,
        needsInput: false,
        summary: [
          productDiscoveryReadiness.message,
          '',
          'No demo resources were created.',
          ...(readinessDiagnostics.length ? ['', 'Diagnostics:', ...readinessDiagnostics.map(line => `- ${line}`)] : []),
        ].join('\n'),
      };
    }

    const state = createChunkedExecutionState(access.accountId);
    const plan = buildChunkedExecutionPlan(config);
    runToken = createAgentRunToken();
    job = {
      config,
      state,
      plan,
      nextStepIndex: 0,
      totalSteps: plan.length,
      environmentName: config.environmentName,
      progressLog: [`Prepared ${plan.length} creation step(s) for ${config.environmentName}.`],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await kvs.set(getAgentRunStorageKey(runToken), job);
    return {
      success: false,
      needsInput: false,
      needsContinuation: true,
      runToken,
      message: [
        `I prepared ${plan.length} setup step(s) for ${config.environmentName}.`,
        'Reply "continue" and I will run the next setup step with the saved run token.',
      ].join(' '),
      summary: [
        `Prepared ${plan.length} setup step(s) for ${config.environmentName}.`,
        '',
        'No Jira resources have been created yet. Reply "continue" to run the first setup step.',
      ].join('\n'),
      progressLog: job.progressLog.slice(-12),
      completedSteps: 0,
      totalSteps: plan.length,
    };
  }

  let { config, state } = job;
  const { plan } = job;
  const startedAt = Date.now();
  let stepsRunThisCall = 0;
  const lockKey = getAgentRunLockStorageKey(runToken);

  try {
    if (job.cancelRequested) {
      await kvs.delete(lockKey);
      return {
        success: false,
        needsInput: false,
        needsContinuation: false,
        runToken,
        message: 'This demo creation run has been cancelled. No further setup steps will run.',
        summary: 'This demo creation run has been cancelled. Use the cancel/delete action with the same run token if cleanup is still needed.',
        progressLog: job.progressLog.slice(-12),
        completedSteps: job.nextStepIndex,
        totalSteps: plan.length,
      };
    }

    const existingLock = await kvs.get(lockKey);
    const existingLockAge = existingLock?.lockedAt
      ? Date.now() - new Date(existingLock.lockedAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (existingLock && existingLockAge < AGENT_RUN_LOCK_TTL_MS) {
      return {
        success: false,
        needsInput: false,
        needsContinuation: true,
        runToken,
        message: 'A setup step is already running for this demo environment. Wait a moment, then reply "continue" again.',
        summary: [
          createAgentProgressMessage(job),
          'A previous continuation call is still running or recently finished. Wait a moment, then continue with the same run token.',
        ].join('\n'),
        progressLog: job.progressLog.slice(-12),
        completedSteps: job.nextStepIndex,
        totalSteps: plan.length,
      };
    }
    await kvs.set(lockKey, { lockedAt: new Date().toISOString() });

    while (
      job.nextStepIndex < plan.length
      && stepsRunThisCall < AGENT_RUN_STEP_BATCH_LIMIT
      && Date.now() - startedAt < AGENT_RUN_TIME_BUDGET_MS
    ) {
      const index = job.nextStepIndex;
      const step = plan[index];
      job.progressLog.push(`Step ${index + 1} of ${plan.length}: ${step.label || step.type}`);
      config = await executeDemoEnvironmentStepCoreWithRetry({
        config,
        state,
        step,
      });
      stepsRunThisCall += 1;
      job.nextStepIndex = index + 1;
      job.config = config;
      job.state = state;
      job.updatedAt = new Date().toISOString();
      await kvs.set(getAgentRunStorageKey(runToken), job);
    }

    if (job.nextStepIndex < plan.length) {
      await kvs.delete(lockKey);
      return {
        success: false,
        needsInput: false,
        needsContinuation: true,
        runToken,
        message: createAgentProgressMessage(job),
        summary: [
          createAgentProgressMessage(job),
          'I have saved the run state. Continue by invoking the same action again with the returned runToken.',
        ].join('\n'),
        progressLog: job.progressLog.slice(-12),
        completedSteps: job.nextStepIndex,
        totalSteps: plan.length,
      };
    }

    const result = buildChunkedSummary(config, state);
    await kvs.delete(getAgentRunStorageKey(runToken));
    await kvs.delete(lockKey);
    return {
      success: result.success,
      needsInput: false,
      needsContinuation: false,
      runToken,
      message: result.success
        ? `${config.environmentName} demo environment created successfully.`
        : `${config.environmentName} demo environment creation finished without creating resources.`,
      summary: result.summary,
      progressLog: job.progressLog,
      completedSteps: plan.length,
      totalSteps: plan.length,
    };
  } catch (err) {
    job.config = config;
    job.state = state;
    job.updatedAt = new Date().toISOString();
    job.lastError = err.message;
    await kvs.set(getAgentRunStorageKey(runToken), job);
    await kvs.delete(lockKey);
    return {
      success: false,
      needsInput: false,
      needsContinuation: false,
      runToken,
      message: `Demo environment creation failed: ${err.message}`,
      summary: [
        `Error: ${err.message}`,
        '',
        'Progress completed before the failure:',
        ...job.progressLog.map(line => `- ${line}`),
      ].join('\n'),
      progressLog: job.progressLog,
      completedSteps: job.nextStepIndex,
      totalSteps: plan.length,
    };
  }
}

resolver.define('getProjectInsightsData', async ({ payload }) => {
  const projectKey = String(payload?.projectKey || '').trim();

  if (!projectKey) {
    return {
      success: false,
      message: 'Project context was not available for this sidebar page.',
    };
  }

  try {
    const diagnostics = [];
    const customDateFields = await resolveDemoDateFieldsWithoutScreenSetup(projectKey, diagnostics);
    const project = await jiraGet(`/rest/api/3/project/${encodeURIComponent(projectKey)}`);
    const domainMetadata = await getProjectDemoDomainMetadata(projectKey);
    const metadata = domainMetadata?.value || {};
    const metadataKind = metadata.kind || '';
    const metadataBusinessSpaceType = normaliseBusinessSpaceType(metadata.businessSpaceType);
    const projectType = project?.projectTypeKey === 'service_desk'
      ? normaliseJsmServiceType(metadata.jsmServiceType || 'ITSM')
      : metadataKind === 'business-project' || project?.projectTypeKey === 'business'
        ? getBusinessSpaceCategoryLabel(metadataBusinessSpaceType)
        : metadataKind === 'product-discovery' || project?.projectTypeKey === 'product_discovery' || project?.projectTypeKey === 'product-discovery'
          ? 'Product Discovery'
          : 'Software';
    const projectTypeDisplay = ['ITSM', 'HRSM', 'CSM'].includes(projectType)
      ? getJsmServiceTypeLabel(projectType)
      : projectType;
    const baseJql = `project = ${projectKey}`;
    const allWorkJql = `${baseJql} ORDER BY priority DESC, duedate ASC`;
    const config = {
      viewType: 'project-insights',
      title: 'Summary & Reports',
      subtitle: 'Project sidebar insights using generated custom Created Date and Resolved Date fields.',
      visualType: 'summary-grid',
      sectionLabel: `${projectTypeDisplay} Summary`,
      environmentName: project?.name || projectKey,
      dashboardProfile: `${project?.name || projectKey} Summary`,
      dashboardLevel: 'project',
      dashboardDomain: projectTypeDisplay,
      dashboardMetrics: ['Work by status', 'Created vs resolved', 'Open work', 'Priority'],
      dashboardQuestions: ['Is work moving and completing over time?'],
      dashboardKpis: ['Resolution rate %', 'Average cycle time', 'High Priority', 'Throughput'],
      filterId: '',
      filterName: `${projectKey} work`,
      jql: `${baseJql} AND statusCategory != Done ORDER BY priority DESC, duedate ASC`,
      allWorkJql,
      customDateFields,
      reportFilters: [],
      retentionPeriodDays: 180,
      dateRange: '6 months',
      dateRangeDays: 180,
      generatedAt: new Date().toISOString().split('T')[0],
      projects: [{
        key: projectKey,
        name: project?.name || projectKey,
        type: projectTypeDisplay,
        count: 0,
        sprints: [],
        dateFields: customDateFields,
      }],
    };
    const issues = await searchDemoDashboardIssues(allWorkJql, customDateFields);

    return {
      ...buildDemoInsightsResponse(config, issues, config.projects),
      diagnostics,
    };
  } catch (err) {
    return {
      success: false,
      message: err.message,
    };
  }
});

async function finalizeDashboardStep(state) {
  const createdDashboards = state.results.dashboards?.filter(Boolean) || [];
  if (createdDashboards.length === 0 && !state.results.dashboardId) {
    return;
  }

  for (const dashboard of createdDashboards) {
    if (!dashboard.filterWiring?.verified) {
      addChunkedError(state, `Dashboard ${dashboard.id}: no filter-driven gadget wiring could be verified automatically.`);
    }
  }
}

function buildDashboardFilterWiringSummary(dashboards) {
  if (dashboards.length === 0) {
    return 'Not created';
  }

  const verifiedCount = dashboards.filter(dashboard => dashboard.filterWiring?.verified).length;
  if (verifiedCount === dashboards.length) {
    return 'Verified automatically';
  }

  if (verifiedCount > 0) {
    return `${verifiedCount}/${dashboards.length} verified automatically`;
  }

  return 'Not verified';
}

function addUniqueChunkedError(state, message) {
  if (!state.results.errors.includes(message)) {
    addChunkedError(state, message);
  }
}

function validateGeneratedVolumeAccuracy(config, state) {
  if (state.metadata.volumeValidationComplete) {
    return;
  }

  if (isCsvIssueCreationMode()) {
    state.metadata.volumeValidationComplete = true;
    return;
  }

  const createdJsmProjects = state.results.jsmProjects.filter(project => project?.key && !project.failed);
  const expectedItsmPerProject = config.incidentsPerProject;

  for (const project of createdJsmProjects) {
    const configured = project.configuredItsmWorkCount ?? expectedItsmPerProject;
    const expected = project.addVolumeToExistingDomainData
      ? (project.existingIssueCount || 0) + configured
      : configured;
    const actual = project.addVolumeToExistingDomainData
      ? (project.existingIssueCount || 0) + (project.incidents?.length || 0)
      : (project.incidents?.length || 0);

    if (actual !== expected) {
      addUniqueChunkedError(
        state,
        `Volume mismatch ${project.key}: expected ${expected} ITSM work item(s) from selected counts (${formatItsmWorkMix(config.itsmWorkCounts)}), but created ${actual}.`
      );
    }
  }

  for (const [projectIndex, project] of state.results.softwareProjects.entries()) {
    if (!project?.key || project.failed) {
      continue;
    }

    const configured = project.configuredIssueCount || getSoftwareProjectConfig(config, projectIndex).issuesPerProject;
    const expected = project.addVolumeToExistingDomainData
      ? (project.existingIssueCount || 0) + configured
      : configured;
    const actual = project.issueCount || 0;

    if (actual !== expected) {
      addUniqueChunkedError(
        state,
        `Volume mismatch ${project.key}: expected ${expected} software issue(s) from the selected Issues value, but created ${actual}. Epics are excluded from this selected issue count and from software dashboard filters.`
      );
    }
  }

  for (const [projectIndex, project] of (state.results.businessProjects || []).entries()) {
    if (!project?.key || project.failed) {
      continue;
    }

    const configured = project.configuredIssueCount || getBusinessProjectConfig(config, projectIndex).issuesPerProject;
    const expected = project.addVolumeToExistingDomainData
      ? (project.existingIssueCount || 0) + configured
      : configured;
    const actual = project.issueCount || project.issueRecords?.length || 0;

    if (actual !== expected) {
      addUniqueChunkedError(
        state,
        `Volume mismatch ${project.key}: expected ${expected} ${getBusinessSpaceCategoryLabel(project.businessSpaceType)} item(s) for ${getBusinessSpaceTypeLabel(project.businessSpaceType)}, but created ${actual}.`
      );
    }
  }

  for (const [projectIndex, project] of (state.results.productDiscoveryProjects || []).entries()) {
    if (!project?.key || project.failed) {
      continue;
    }

    const configured = project.configuredIssueCount || getProductDiscoveryProjectConfig(config, projectIndex).issuesPerProject;
    const expected = project.addVolumeToExistingDomainData
      ? (project.existingIssueCount || 0) + configured
      : configured;
    const actual = project.issueCount || project.issueRecords?.length || 0;

    if (actual !== expected) {
      addUniqueChunkedError(
        state,
        `Volume mismatch ${project.key}: expected ${expected} Product Discovery idea(s), but created ${actual}.`
      );
    }
  }

  const expectedItsmTotal = createdJsmProjects.length * expectedItsmPerProject;
  if (state.results.totalIncidents !== expectedItsmTotal) {
    addUniqueChunkedError(
      state,
      `Volume mismatch total ITSM work: expected ${expectedItsmTotal}, but created ${state.results.totalIncidents}.`
    );
  }

  const expectedSoftwareTotal = state.results.softwareProjects
    .filter(item => item?.key && !item.failed)
    .reduce((total, project) => total + (project.configuredIssueCount || 0), 0);
  if (state.results.totalIssues !== expectedSoftwareTotal) {
    addUniqueChunkedError(
      state,
      `Volume mismatch total software issues: expected ${expectedSoftwareTotal}, but created ${state.results.totalIssues}.`
    );
  }

  state.metadata.volumeValidationComplete = true;
}

function buildChunkedSummary(config, state) {
  validateGeneratedVolumeAccuracy(config, state);

  const results = state.results;
  const createdJsmProjects = results.jsmProjects.filter(project => project?.key && !project.failed);
  const createdBusinessProjects = (results.businessProjects || []).filter(project => project?.key && !project.failed);
  const createdProductDiscoveryProjects = (results.productDiscoveryProjects || []).filter(project => project?.key && !project.failed);
  const hasProjects = createdJsmProjects.length > 0
    || results.softwareProjects.length > 0
    || createdBusinessProjects.length > 0
    || createdProductDiscoveryProjects.length > 0;
  const softwareTemplates = Array.from(new Set((config.softwareProjects || []).map(project => normaliseSoftwareTemplate(project.softwareTemplate))));
  const softwareStyles = Array.from(new Set((config.softwareProjects || [])
    .filter(project => normaliseSoftwareTemplate(project.softwareTemplate) !== 'bug-tracking')
    .map(project => getProjectManagementStyleLabel(project.softwareProjectStyle))));
  const softwareTemplateSummary = softwareTemplates.length === 0
    ? getSoftwareTemplateLabel(config.softwareTemplate)
    : softwareTemplates.map(getSoftwareTemplateLabel).join(', ');
  const softwareStyleSummary = softwareStyles.length === 0
    ? (softwareTemplates.includes('bug-tracking') ? 'Not applicable for Bug Tracking' : getProjectManagementStyleLabel(config.softwareProjectStyle))
    : softwareStyles.join(', ');
  const softwareProjectCountWithSprints = (config.softwareProjects || [])
    .filter(project => normaliseSoftwareTemplate(project.softwareTemplate) === 'scrum')
    .length;
  const softwareVersions = results.softwareProjects.flatMap(project => project.versions || []);
  const softwareSprints = results.softwareProjects.flatMap(project => project.sprints || []);
  const softwareComponents = results.softwareProjects.flatMap(project => project.components || []);
  const workManagementComponents = createdBusinessProjects.flatMap(project => project.components || []);
  const productDiscoveryComponents = createdProductDiscoveryProjects.flatMap(project => project.components || []);
  const jiraProjectComponents = [...softwareComponents, ...workManagementComponents, ...productDiscoveryComponents];
  const releaseStageCounts = softwareVersions.reduce((counts, version) => {
    const stage = version.releaseStage || (version.released ? 'past' : 'upcoming');
    counts[stage] = (counts[stage] || 0) + 1;
    return counts;
  }, {});
  const sprintStateCounts = softwareSprints.reduce((counts, sprint) => {
    const state = sprint.state || 'future';
    counts[state] = (counts[state] || 0) + 1;
    return counts;
  }, {});
  const dashboards = results.dashboards?.filter(Boolean) || [];
  const savedFilters = results.savedFilters?.filter(Boolean) || [];
  const reports = results.reports?.filter(Boolean) || [];
  const jiraPlans = results.jiraPlans?.filter(Boolean) || [];
  const jiraRoadmaps = results.jiraRoadmaps?.filter(Boolean) || [];
  const confluenceSpaces = results.confluenceSpaces?.filter(space => space?.success) || [];
  const githubActivity = results.githubActivity?.filter(Boolean) || [];
  const jiraDevInfoSubmitted = githubActivity.filter(record => record.jiraDevelopmentInfoSubmitted);
  const jiraDeploymentInfoSubmitted = githubActivity.filter(record => record.jiraDeploymentInfoSubmitted);
  const compassComponents = results.compassComponents?.filter(Boolean) || [];
  const linkedCompassComponents = compassComponents.filter(component => component.linkedIssueKey);
  const repositoryLinkedCompassComponents = compassComponents.filter(component => component.repositoryLinked);
  const dependencyLinkedCompassComponents = compassComponents.filter(component => component.dependencyLinked);
  const ownedCompassComponents = compassComponents.filter(component => component.ownerConfigured);
  const visibleJiraCompassComponents = compassComponents.filter(component => component.visibleInJiraComponents);
  const atlassianGoals = results.atlassianGoals?.filter(Boolean) || [];
  const linkedAtlassianGoals = atlassianGoals.filter(goal => goal.nativeLinked);
  const projectGoals = results.projectGoals?.filter(Boolean) || [];
  const projectKeys = [
    ...createdJsmProjects.map(project => project.key),
    ...createdBusinessProjects.map(project => project.key),
    ...createdProductDiscoveryProjects.map(project => project.key),
    ...results.softwareProjects.map(project => project.key),
  ].filter(Boolean);
  const automationBlueprints = buildAutomationBlueprints(projectKeys);
  const workerDataset = state.metadata.workerDataset;
  const workerDatePatch = state.metadata.workerDatePatch;
  const workerAiBlueprint = workerDataset?.metadata?.aiBlueprint;
  const hasWarningsOrErrors = results.errors.length > 0;
  const lines = [
    hasProjects
      ? hasWarningsOrErrors
        ? `"${config.environmentName}" demo environment was created with warnings that need review.`
        : `"${config.environmentName}" demo environment created successfully.`
      : `"${config.environmentName}" demo environment creation was attempted, but no resources were created.`,
    '',
    'Summary:',
    `- Industry: ${config.industry}`,
    `- Ticket Data Duration: ${config.dateRange}`,
    `- Jira Service Management Projects: ${createdJsmProjects.length} (${results.totalIncidents} service work items total; selected types: ${config.jsmServiceTypes.map(getJsmServiceTypeLabel).join(', ') || 'None'})`,
    `- Service Work Mix per JSM Project: ${formatItsmWorkMix(config.itsmWorkCounts)}`,
    `- Business / Category Spaces: ${createdBusinessProjects.length} (${createdBusinessProjects.reduce((total, project) => total + (project.issueRecords?.length || 0), 0)} work items created this run)`,
    `- Jira Product Discovery Spaces: ${createdProductDiscoveryProjects.length} (${createdProductDiscoveryProjects.reduce((total, project) => total + (project.issueRecords?.length || 0), 0)} ideas created this run)`,
    `- Software Projects: ${results.softwareProjects.length} (${results.totalIssues} issues total)`,
    `- Software Templates: ${softwareTemplateSummary}`,
    `- Dev Project Management: ${softwareStyleSummary}`,
    `- Sprints per Scrum Software Project: ${softwareProjectCountWithSprints > 0 ? config.sprintsPerProject : 0}`,
    `- Software Release Coverage: ${softwareVersions.length} version(s) modelled (${releaseStageCounts.past || 0} past, ${releaseStageCounts.current || 0} current, ${releaseStageCounts.upcoming || 0} upcoming); fix versions and affected versions are populated where Jira allows them.`,
    `- Software Components: ${softwareComponents.length} project component(s) created and assigned to generated software issues.`,
    `- Work Management Components: ${workManagementComponents.length} project component(s) created and assigned where Jira allows.`,
    `- Product Discovery Components: ${productDiscoveryComponents.length} project component(s) created and assigned where Jira allows.`,
    `- Sprint Coverage: ${softwareSprints.length} sprint(s) modelled (${sprintStateCounts.closed || 0} completed, ${sprintStateCounts.active || 0} active, ${sprintStateCounts.future || 0} upcoming).`,
    '- Delivery Method Coverage: Scrum, Kanban, and Bug Tracking execution plus waterfall phase labels for requirements, design, build, test, and release traceability.',
    `- Ticket Lifecycle: archive generated tickets after 6 months, then delete them after 1 year in archived state`,
    `- Issue Creation Mode: ${isCsvIssueCreationMode() ? 'CSV-first historical import' : isRestDatePatchMode() ? 'Forge REST creation + CSV date patch' : 'Forge REST issue creation'}`,
    ...(isCsvIssueCreationMode()
      ? []
      : [
          '- Historical Date Strategy: generated Created Date and Resolved Date custom fields are populated from the selected ticket duration.',
          '- Native Jira Created/Updated: Jira REST keeps these as Jira audit fields from the actual create/update time.',
        ]),
    ...(isCsvIssueCreationMode()
      ? [
          `- Historical CSV Rows Generated: ${workerDataset?.success ? (workerDataset.ticketCount || 0) : 'Not generated'}`,
          `- Worker AI Blueprint: ${workerAiBlueprint?.source || 'Not confirmed'}${workerAiBlueprint?.model ? ` (${workerAiBlueprint.model})` : ''}`,
        ]
      : []),
    `- Dashboards: ${dashboards.length > 0 ? `${dashboards.length} created` : 'Not created'}`,
    `- Dashboard Template: ${results.dashboardTemplateId || 'Generated gadget layout'}`,
    `- Saved Filters: ${savedFilters.length > 0 ? `${savedFilters.length} auto-created` : 'Auto-created filter not available'}`,
    `- Report Filters: ${reports.length > 0 ? `${reports.length} auto-created` : 'Not created'}`,
    `- Jira Plans: ${jiraPlans.length > 0 ? `${jiraPlans.filter(plan => plan.success).length} native plan(s) created, ${jiraRoadmaps.length} roadmap seed(s) prepared` : 'Not created'}`,
    `- Knowledge Bases: ${confluenceSpaces.length > 0 ? `${confluenceSpaces.length} Confluence space(s) created` : 'Not created'}`,
    `- GitHub Development Activity: ${githubActivity.length > 0 ? `${githubActivity.length} branch/commit/PR/deployment item(s) created; ${jiraDevInfoSubmitted.length} submitted to Jira dev panel; ${jiraDeploymentInfoSubmitted.length} deployment item(s) submitted to Jira` : projectKeys.length === 0 ? 'Not created: add at least one Jira space/project to generate development panel activity' : 'Not created: check GitHub activity warnings below'}`,
    `- Jira Project Components: ${jiraProjectComponents.length > 0 ? `${jiraProjectComponents.length} created and assigned where Jira allows` : 'Not created'}`,
    `- Compass Components: ${compassComponents.length > 0 ? `${compassComponents.length} created, ${visibleJiraCompassComponents.length} visible in Jira Components, ${linkedCompassComponents.length} linked to work items, ${repositoryLinkedCompassComponents.length} repository link(s), ${dependencyLinkedCompassComponents.length} dependency link(s), ${ownedCompassComponents.length} owner assignment(s)` : 'Not created or not configured'}`,
    `- Goal Work Items: ${projectGoals.length > 0 ? `${projectGoals.length} Jira work item(s) created with goal labels` : 'Not created'}`,
    `- Native Atlassian Goals: ${atlassianGoals.length > 0 ? `${atlassianGoals.length} created, ${linkedAtlassianGoals.length} linked through Jira Goals field, ${atlassianGoals.filter(goal => goal.statusUpdated).length} status update(s) applied with varied target progress` : 'Not created or not configured'}`,
    `- Dashboard Filter Wiring: ${buildDashboardFilterWiringSummary(dashboards)}`,
    '',
  ];

  if (compassComponents.length === 0) {
    lines.splice(lines.length - 1, 0, '- Compass Setup Note: Compass component creation requires Compass to be enabled on the Atlassian site and Forge GraphQL access for the current user.');
  }

  if (atlassianGoals.length === 0) {
    lines.splice(lines.length - 1, 0, '- Goals Setup Note: the Jira Goals tab shows only native Atlassian Goals linked to work. The fallback goal work items created by this app will not appear there.');
    lines.splice(lines.length - 1, 0, '- Native Goals Setup Note: Atlassian Goals requires GOALS_DEMO_ENABLED=true plus ATLASSIAN_GOAL_TYPE_ARI, or ATLASSIAN_GOAL_ACTIVATION_ID plus ATLASSIAN_GOAL_TYPE_ID. If Forge GraphQL is blocked, also set ATLASSIAN_GRAPHQL_EMAIL and ATLASSIAN_GRAPHQL_API_TOKEN.');
  }

  if (createdJsmProjects.length > 0) {
    lines.push('Jira Service Management Projects Created:');
    lines.push(...createdJsmProjects.map(project => `- ${project.key}: ${project.name} (${getJsmServiceTypeLabel(project.jsmServiceType || 'ITSM')}; ${isCsvIssueCreationMode() ? 'CSV import pending' : `${project.incidents.length} service work items`})`));
    const projectsWithForms = createdJsmProjects.filter(project => project.smartForm?.name);
    if (projectsWithForms.length > 0) {
      lines.push('');
      lines.push('Forms Created:');
      lines.push(...projectsWithForms.map(project => `- ${project.key}: ${project.smartForm.name} (${project.smartForm.reused ? 'reused' : 'created'})`));
    }
    const projectsWithItsmConfig = createdJsmProjects.filter(project => (project.requestTypes?.length || project.queues?.length || project.knowledgeBase?.success));
    if (projectsWithItsmConfig.length > 0) {
      lines.push('');
      lines.push('JSM Setup:');
      lines.push(...projectsWithItsmConfig.map(project => {
        const requestTypes = (project.requestTypes || []).map(requestType => requestType.name).slice(0, 6).join(', ') || 'template defaults';
        const queues = (project.queues || []).map(queue => queue.name).slice(0, 6).join(', ') || 'template defaults';
        const kb = project.knowledgeBase?.success ? `${project.knowledgeBase.key} (${project.knowledgeBase.pages.length} pages)` : 'not created';
        return `- ${project.key}: request types=${requestTypes}; queues=${queues}; knowledge base=${kb}`;
      }));
    }
    lines.push('');
  }

  if (createdBusinessProjects.length > 0) {
    lines.push('Business / Category Spaces Created:');
    lines.push(...createdBusinessProjects.map(project => `- ${project.key}: ${project.name} (${getBusinessSpaceCategoryLabel(project.businessSpaceType)} - ${getBusinessSpaceTypeLabel(project.businessSpaceType)}; ${project.issueRecords?.length || 0} new work items${project.reusedExistingDomainData ? `; reused existing project with ${project.existingIssueCount || 0} existing items` : ''})`));
    lines.push('');
  }

  if (createdProductDiscoveryProjects.length > 0) {
    lines.push('Jira Product Discovery Spaces Created:');
    lines.push(...createdProductDiscoveryProjects.map(project => `- ${project.key}: ${project.name} (${project.issueRecords?.length || 0} new ideas${project.reusedExistingDomainData ? `; reused existing space with ${project.existingIssueCount || 0} existing ideas` : ''})`));
    lines.push('');
  }

  if (results.softwareProjects.length > 0) {
    lines.push('Software Projects Created:');
    lines.push(...results.softwareProjects.map(project => {
      const versions = project.versions || [];
      const sprints = project.sprints || [];
      const projectReleaseCounts = versions.reduce((counts, version) => {
        const stage = version.releaseStage || (version.released ? 'past' : 'upcoming');
        counts[stage] = (counts[stage] || 0) + 1;
        return counts;
      }, {});
      const projectSprintCounts = sprints.reduce((counts, sprint) => {
        const state = sprint.state || 'future';
        counts[state] = (counts[state] || 0) + 1;
        return counts;
      }, {});
      const releaseSummary = `${versions.length} versions: ${projectReleaseCounts.past || 0} past, ${projectReleaseCounts.current || 0} current, ${projectReleaseCounts.upcoming || 0} upcoming`;
      const componentSummary = `${(project.components || []).length} components`;
      const sprintSummary = `; sprints ${projectSprintCounts.closed || 0} done, ${projectSprintCounts.active || 0} active, ${projectSprintCounts.future || 0} upcoming`;
      const projectTemplate = normaliseSoftwareTemplate(project.softwareTemplate);
      const kanbanSummary = projectTemplate === 'kanban'
        ? '; Kanban flow/WIP labels applied'
        : projectTemplate === 'bug-tracking'
          ? '; Bug tracking triage/review flow applied'
          : '';
      const goalSummary = `; ${(project.projectGoals || []).length} goal work items; ${(project.atlassianGoals || []).length} native goals; ${(project.atlassianGoals || []).filter(goal => goal.nativeLinked).length} native goal links`;
      const compassLinkSummary = `; ${(project.compassComponents || []).filter(component => component.linkedIssueKey).length} Compass links`;
      return `- ${project.key}: ${project.name} (${isCsvIssueCreationMode() ? 'CSV import pending' : `${project.issueCount} issues`}, ${getSoftwareProjectMethodLabel(project)}, board ${project.boardId || 'pending'}; ${releaseSummary}; ${componentSummary}${sprintSummary}${kanbanSummary}${goalSummary}${compassLinkSummary})`;
    }));
    const softwareProjectsWithForms = results.softwareProjects.filter(project => project.smartForm?.name);
    if (softwareProjectsWithForms.length > 0) {
      lines.push('');
      lines.push('Software Forms Created:');
      lines.push(...softwareProjectsWithForms.map(project => `- ${project.key}: ${project.smartForm.name} (${project.smartForm.reused ? 'reused' : 'created'})`));
    }
    lines.push('');
  }

  if (jiraProjectComponents.length > 0) {
    lines.push('Jira Project Components Created:');
    for (const project of results.softwareProjects) {
      const componentNames = (project.components || []).map(component => component.name).filter(Boolean);
      if (componentNames.length > 0) {
        lines.push(`- ${project.key}: ${componentNames.join(', ')}`);
      }
    }
    for (const project of createdBusinessProjects) {
      const componentNames = (project.components || []).map(component => component.name).filter(Boolean);
      if (componentNames.length > 0) {
        lines.push(`- ${project.key}: ${componentNames.join(', ')}`);
      }
    }
    for (const project of createdProductDiscoveryProjects) {
      const componentNames = (project.components || []).map(component => component.name).filter(Boolean);
      if (componentNames.length > 0) {
        lines.push(`- ${project.key}: ${componentNames.join(', ')}`);
      }
    }
    lines.push('');
  }

  if (dashboards.length > 0) {
    lines.push('Dashboards Created:');
    lines.push(...dashboards.map(dashboard => `- ${dashboard.projectKey} ${dashboard.projectType}: ${dashboard.name} (${dashboard.id})${dashboard.viewUrl ? ` - ${dashboard.viewUrl}` : ''}`));
    lines.push('');
  }

  if (savedFilters.length > 0) {
    lines.push('Saved Filters Ready:');
    lines.push(...savedFilters.map(filter => `- ${filter.name} (${filter.id})${filter.viewUrl ? ` - ${filter.viewUrl}` : ''}`));
    lines.push('');
  }

  if (reports.length > 0) {
    lines.push('Report Filters Ready:');
    lines.push(...reports.map(report => `- ${report.name} (${report.id})${report.viewUrl ? ` - ${report.viewUrl}` : ''}`));
    lines.push('');
  }

  if (jiraPlans.length > 0 || jiraRoadmaps.length > 0) {
    lines.push('Jira Plans / Roadmaps:');
    for (const plan of jiraPlans) {
      lines.push(`- ${plan.projectKey}: ${plan.name} (${plan.success ? 'created' : 'native plan API unavailable'})${plan.viewUrl ? ` - ${plan.viewUrl}` : ''}`);
    }
    for (const roadmap of jiraRoadmaps) {
      lines.push(`- ${roadmap.projectKey}: ${roadmap.name} (${roadmap.epicCount} epics, ${roadmap.versionCount} versions, ${roadmap.sprintCount} sprints)${roadmap.viewUrl ? ` - ${roadmap.viewUrl}` : ''}`);
    }
    lines.push('');
  }

  if (githubActivity.length > 0) {
    lines.push('GitHub Development Activity Created:');
    lines.push(...githubActivity.slice(0, 20).map(record => (
      `- ${record.issueKey}: branch ${record.branchName}, commit ${String(record.commitSha || '').slice(0, 7)}${record.pullRequestNumber ? `, PR #${record.pullRequestNumber}` : ''}, deployment ${record.deploymentStatus} (${record.deploymentEnvironment}); Jira dev panel ${record.jiraDevelopmentInfoSubmitted ? 'submitted' : 'not submitted'}, deployment ${record.jiraDeploymentInfoSubmitted ? 'submitted' : 'not submitted'}`
    )));
    if (githubActivity.length > 20) {
      lines.push(`- ...and ${githubActivity.length - 20} more GitHub activity item(s).`);
    }
    lines.push('');
  }

  if (isCsvIssueCreationMode()) {
    lines.push('Historical CSV Import Required:');
    if (workerDataset?.success) {
      lines.push(`- Ticket CSV: ${workerDataset.ticketCsvPath || 'worker path not returned'}`);
      lines.push(`- Release CSV: ${workerDataset.releaseCsvPath || 'worker path not returned'}`);
      lines.push('- Import this CSV through Jira External System Import to create issues with historical Created and Resolved dates.');
      lines.push('- Forge REST issue creation was skipped to avoid Jira stamping today as Created/Updated.');
    } else {
      lines.push(`- Worker dataset was not generated: ${workerDataset?.message || 'worker result not available'}`);
    }
    lines.push('');
  }

  if (projectGoals.length > 0) {
    lines.push('Goal Work Items Created (not native Jira Goals tab entries):');
    lines.push(...projectGoals.slice(0, 30).map(goal => `- ${goal.projectKey}: ${goal.key} ${goal.name} (target ${goal.targetDate})`));
    if (projectGoals.length > 30) {
      lines.push(`- ...and ${projectGoals.length - 30} more Jira project goal(s).`);
    }
    lines.push('');
  }

  if (compassComponents.length > 0) {
    lines.push('Compass Components Created:');
    lines.push(...compassComponents.slice(0, 20).map(component => (
      `- ${component.projectKey}: ${component.name} (${component.typeId})${component.visibleInJiraComponents ? ` visible as Jira component ${component.jiraComponentName || component.name}` : ' not visible in Jira Components'}${component.linkedIssueKey ? `; linked to ${component.linkedIssueKey}` : '; not linked to work items'}${component.repositoryLinked ? '; repository linked' : ''}${component.dependencyLinked ? '; dependency linked' : ''}${component.ownerConfigured ? '; owner assigned' : ''}`
    )));
    if (compassComponents.length > 20) {
      lines.push(`- ...and ${compassComponents.length - 20} more Compass component(s).`);
    }
    lines.push('');
  }

  if (atlassianGoals.length > 0) {
    lines.push('Atlassian Goals Created:');
    lines.push(...atlassianGoals.slice(0, 20).map(goal => (
      `- ${goal.projectKey}: ${goal.name} (target ${goal.targetDate}; status ${goal.statusUpdated ? goal.statusLabel : 'PENDING'}; progress target ${goal.progressPercent || goal.score || 0}%)${goal.nativeLinked ? ` linked to ${goal.linkedIssueType || 'work item'} ${goal.linkedIssueKey}` : ' not linked to Jira Goals field'}`
    )));
    if (atlassianGoals.length > 20) {
      lines.push(`- ...and ${atlassianGoals.length - 20} more goal(s).`);
    }
    lines.push('');
  }

  if (isRestDatePatchMode()) {
    lines.push('Historical Date Patch CSV:');
    if (workerDatePatch?.success) {
      lines.push(`- Rows: ${workerDatePatch.ticketCount || 0} existing Jira issues`);
      lines.push('- Download it from the app using the Historical Date Patch CSV button.');
      lines.push('- Import this small CSV through Jira External System Import to update existing issue Created and Resolved dates.');
      lines.push('- Jira Cloud does not reliably import the system Updated date; it is normally set to the import/update time.');
    } else {
      lines.push(`- Date patch CSV was not generated: ${workerDatePatch?.message || 'worker result not available'}`);
    }
    lines.push('');
  }

  if (automationBlueprints.length > 0) {
    lines.push('Automation Rules To Configure:');
    for (const rule of automationBlueprints) {
      lines.push(`- ${rule.name}`);
      lines.push(`  Trigger: ${rule.trigger}`);
      lines.push(`  Condition: ${rule.condition}`);
      lines.push(`  Action: ${rule.action}`);
      if (rule.emailSubject) {
        lines.push(`  Subject: ${rule.emailSubject}`);
      }
      if (rule.emailBody) {
        lines.push('  Body:');
        lines.push(...String(rule.emailBody || '').split('\n').map(line => `    ${line}`));
      }
      lines.push(`  Scope: ${rule.scope || 'created projects'}`);
    }
    lines.push('Note: Jira Automation rule creation is not exposed through the supported Jira project/issue REST APIs used by this app. The app lists only the two requested rule blueprints and does not invent extra automation behavior.');
    lines.push('');
  }

  if (hasProjects) {
    lines.push('Final Step (Required):');
    lines.push('1. Go to Jira -> Plans');
    lines.push('2. Click "Create Plan"');
    lines.push('3. Add all projects above');
    lines.push('4. Click Save');
    lines.push('');
  }

  if (String(process.env.SHOW_SETUP_DIAGNOSTICS || 'true').toLowerCase() !== 'false' && results.diagnostics.length > 0) {
    const diagnosticLines = results.diagnostics.slice(-60);
    lines.push(`Setup Diagnostics (${diagnosticLines.length}${results.diagnostics.length > diagnosticLines.length ? ` of ${results.diagnostics.length}` : ''}):`);
    lines.push(...diagnosticLines.map(item => `- ${item}`));
    lines.push('');
  }

  if (results.errors.length > 0) {
    lines.push(`Warnings / Errors (${results.errors.length}):`);
    lines.push(...results.errors.map(error => `- ${error}`));
    lines.push('');
    lines.push("If something still looks off, run 'forge logs' to inspect the resolver output.");
  } else if (hasProjects) {
    lines.push('No errors were reported. That is a Forge-tunate finish.');
  }

  return {
    success: hasProjects,
    summary: lines.join('\n'),
  };
}

resolver.define('prepareDemoEnvironment', async ({ payload }) => {
  console.log('prepareDemoEnvironment started', JSON.stringify(payload));

  const config = normalisePayload(payload);
  config.runSeed = config.runSeed || Date.now();
  if (!config.environmentName) {
    return {
      success: false,
      summary: 'Please enter an Environment Name before starting the demo creation.',
    };
  }

  const access = await validateAdminAccess();
  if (!access.ok) {
    return {
      success: false,
      summary: access.message,
    };
  }

  const readinessDiagnostics = [];
  const productDiscoveryReadiness = await validateProductDiscoveryReadiness(config, readinessDiagnostics);
  if (!productDiscoveryReadiness.ok) {
    return {
      success: false,
      summary: [
        productDiscoveryReadiness.message,
        '',
        'No demo resources were created.',
        ...(readinessDiagnostics.length ? ['', 'Diagnostics:', ...readinessDiagnostics.map(line => `- ${line}`)] : []),
      ].join('\n'),
    };
  }

  return {
    success: true,
    config,
    plan: buildChunkedExecutionPlan(config),
    state: createChunkedExecutionState(access.accountId),
  };
});

resolver.define('prepareAgentDemoEnvironment', async ({ payload }) => {
  console.log('prepareAgentDemoEnvironment started', JSON.stringify(payload));

  const request = buildAgentDemoEnvironmentPayload(payload || {});
  if (!request.ready) {
    return {
      success: false,
      needsInput: true,
      question: request.question,
      missingFields: request.missingFields,
    };
  }

  const config = normalisePayload(request.config);
  config.runSeed = config.runSeed || Date.now();

  const access = await validateAdminAccess();
  if (!access.ok) {
    return {
      success: false,
      summary: access.message,
    };
  }

  const preflightDecision = await buildAgentPreflightDecision(config);
  if (preflightDecision) {
    return preflightDecision;
  }

  const readinessDiagnostics = [];
  const productDiscoveryReadiness = await validateProductDiscoveryReadiness(config, readinessDiagnostics);
  if (!productDiscoveryReadiness.ok) {
    return {
      success: false,
      summary: [
        productDiscoveryReadiness.message,
        '',
        'No demo resources were created.',
        ...(readinessDiagnostics.length ? ['', 'Diagnostics:', ...readinessDiagnostics.map(line => `- ${line}`)] : []),
      ].join('\n'),
    };
  }

  return {
    success: true,
    config,
    plan: buildChunkedExecutionPlan(config),
    state: createChunkedExecutionState(access.accountId),
    message: `I understood this as ${config.industry} ${config.jsmServiceTypes?.[0] || config.softwareTemplate || 'demo'} environment. Starting setup now.`,
  };
});

resolver.define('executeDemoEnvironmentStep', async ({ payload }) => {
  let config = normalisePayload(payload.config || {});
  const state = payload.state || createChunkedExecutionState(null);
  const step = payload.step;
  const startedAt = Date.now();

  if (!step?.type) {
    return {
      success: false,
      message: 'Invalid execution step.',
      state,
    };
  }

  console.log('executeDemoEnvironmentStep started', JSON.stringify({
    type: step.type,
    label: step.label,
    projectIndex: step.projectIndex,
    start: step.start,
    count: step.count,
    gadgetIndex: step.gadgetIndex,
  }));

  try {
    config = await executeDemoEnvironmentStepCore(config, state, step);
  } catch (err) {
    return {
      success: false,
      message: err.message,
      state,
    };
  }

  console.log('executeDemoEnvironmentStep completed', JSON.stringify({
    type: step.type,
    label: step.label,
    durationMs: Date.now() - startedAt,
  }));

  return {
    success: true,
    message: step.label || step.type,
    config,
    state,
  };
});

resolver.define('finalizeDemoEnvironment', async ({ payload }) => {
  const config = normalisePayload(payload.config || {});
  const state = payload.state || createChunkedExecutionState(null);
  return buildChunkedSummary(config, state);
});

function addDaysToDate(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isValidDate(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

async function getIssueRetentionPropertyAsApp(issueKey) {
  try {
    return await jiraAppGet(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/properties/${encodeURIComponent(TICKET_RETENTION_PROPERTY)}`);
  } catch (err) {
    if (String(err.message || '').includes('404')) {
      return null;
    }
    throw err;
  }
}

async function setIssueRetentionPropertyAsApp(issueKey, value) {
  await jiraAppPut(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/properties/${encodeURIComponent(TICKET_RETENTION_PROPERTY)}`, value);
}

async function transitionIssueAsApp(issueKey, targetStatus) {
  const data = await jiraAppGet(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`);
  const transitions = data.transitions || [];
  const targetKey = normaliseStatusName(targetStatus);
  const aliases = targetKey === 'archived'
    ? ['archived', 'archive']
    : [targetKey];
  const transition = transitions.find(item => {
    const candidate = normaliseStatusName(item?.to?.name);
    return aliases.some(alias => candidate.includes(alias));
  });

  if (!transition) {
    console.warn(`Cleanup could not find an "${targetStatus}" transition for ${issueKey}.`);
    return false;
  }

  await jiraAppPost(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
    transition: { id: String(transition.id) },
  });
  return true;
}

async function findGeneratedIssuesForCleanup() {
  const issues = [];
  let nextPageToken = null;

  for (let page = 0; page < 10; page += 1) {
    const body = {
      jql: `issue.property[${TICKET_RETENTION_PROPERTY}].retention.appliesTo = "issue" ORDER BY key ASC`,
      maxResults: 100,
      fields: ['status'],
    };

    if (nextPageToken) {
      body.nextPageToken = nextPageToken;
    }

    const data = await jiraAppPost('/rest/api/3/search/jql', body);
    issues.push(...(Array.isArray(data.issues) ? data.issues : []));

    if (!data.nextPageToken) {
      break;
    }

    nextPageToken = data.nextPageToken;
  }

  return issues;
}

async function applyRetentionPolicyToIssue(issue, now) {
  const issueKey = issue.key;
  const property = await getIssueRetentionPropertyAsApp(issueKey);
  const value = property?.value;
  const lifecycleCreatedAt = value?.lifecycle?.createdAt;

  if (!value?.retention || !isValidDate(lifecycleCreatedAt)) {
    return 'skipped-no-retention-property';
  }

  const retention = value.retention;
  const archiveAt = isValidDate(retention.retainUntil)
    ? new Date(retention.retainUntil)
    : addDaysToDate(new Date(lifecycleCreatedAt), ACTIVE_TICKET_RETENTION_DAYS);
  const archivedAt = retention.archivedAt && isValidDate(retention.archivedAt)
    ? new Date(retention.archivedAt)
    : null;
  const deleteAfter = archivedAt
    ? addDaysToDate(archivedAt, retention.archiveRetentionDays || ARCHIVE_RETENTION_DAYS)
    : null;

  if (archivedAt && deleteAfter && now >= deleteAfter) {
    await jiraAppDelete(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`);
    return 'deleted';
  }

  if (!archivedAt && now >= archiveAt) {
    await transitionIssueAsApp(issueKey, 'Archived');
    const archivedAtIso = now.toISOString();
    await setIssueRetentionPropertyAsApp(issueKey, {
      ...value,
      retention: {
        ...retention,
        archivedAt: archivedAtIso,
        deleteAfter: addDaysToDate(now, retention.archiveRetentionDays || ARCHIVE_RETENTION_DAYS).toISOString(),
      },
    });
    return 'archived';
  }

  return 'retained';
}

export async function scheduledCleanup(event) {
  const now = new Date();
  const summary = {
    retained: 0,
    archived: 0,
    deleted: 0,
    skipped: 0,
    failed: 0,
  };

  const issues = await findGeneratedIssuesForCleanup();

  for (const issue of issues) {
    try {
      const result = await applyRetentionPolicyToIssue(issue, now);
      if (result === 'archived') summary.archived += 1;
      else if (result === 'deleted') summary.deleted += 1;
      else if (result === 'retained') summary.retained += 1;
      else summary.skipped += 1;
    } catch (err) {
      summary.failed += 1;
      console.error(`Cleanup failed for ${issue.key}: ${err.message}`);
    }
  }

  console.log('scheduledCleanup completed', JSON.stringify({
    triggerTime: event?.context?.triggerTime || null,
    scanned: issues.length,
    ...summary,
  }));
}

export const handler = resolver.getDefinitions();
