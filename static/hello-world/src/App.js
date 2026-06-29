import React, { useEffect, useState } from 'react';
import { invoke, router, view } from '@forge/bridge';

const industries = ['Banking & Insurance', 'Healthcare', 'Telecom', 'Retail & E-commerce', 'Manufacturing & Energy Utilities', 'SaaS', 'Public Sector', 'Education'];
const jsmServiceTypeOptions = ['ITSM', 'HRSM', 'CSM', 'FSM', 'LSM'];
const jsmServiceTypeLabels = {
  ITSM: 'IT Service Management',
  'ITSM-ESS': 'IT Service Management Essentials',
  GSM: 'General Service Management',
  HRSM: 'HR Service Management',
  CSM: 'Customer Service Management',
  FSM: 'Facilities Service Management',
  LSM: 'Legal Service Management',
};
const spaceTypeOptions = [
  { value: 'jpd:product-discovery', label: 'Jira Product Discovery', group: 'Product Management' },
  { value: 'business:project-management', label: 'Project Management', group: 'Work Management' },
  { value: 'business:task-tracking', label: 'Task Tracking', group: 'Work Management' },
  { value: 'business:budget-planning', label: 'Budget Planning', group: 'Work Management' },
  { value: 'business:recruitment-tracking', label: 'Recruitment Tracking', group: 'Work Management' },
  { value: 'business:procurement-management', label: 'Procurement Management', group: 'Work Management' },
  { value: 'jsm:ITSM', label: 'IT Service Management', group: 'Jira Service Management' },
  { value: 'jsm:HRSM', label: 'HR Service Management', group: 'Jira Service Management' },
  { value: 'jsm:CSM', label: 'Customer Service Management', group: 'Jira Service Management' },
  { value: 'jsm:FSM', label: 'Facilities Service Management', group: 'Jira Service Management' },
  { value: 'jsm:LSM', label: 'Legal Service Management', group: 'Jira Service Management' },
  { value: 'software:scrum', label: 'Software Project - Scrum', group: 'Jira Software Projects' },
  { value: 'software:kanban', label: 'Software Project - Kanban', group: 'Jira Software Projects' },
  { value: 'software:bug-tracking', label: 'Software Project - Bug Tracking', group: 'Jira Software Projects' },
];
const groupedSpaceTypeOptions = spaceTypeOptions.reduce((groups, option) => {
  if (!groups[option.group]) {
    groups[option.group] = [];
  }
  groups[option.group].push(option);
  return groups;
}, {});
const DEFAULT_DEMO_ISSUE_COUNT = 60;
const PRODUCT_DISCOVERY_VOLUME_ONLY_MESSAGE = 'Jira Product Discovery spaces must be created from Jira UI on this site. The Forge app can add demo ideas to an existing native Product Discovery space selected with Volume, but it will not create a new Product Discovery space through REST because Jira can create an incomplete Polaris shell.';
const agentActionOptions = [
  { value: 'volume', label: 'Add volume to existing space' },
  { value: 'delete', label: 'Delete demo space' },
  { value: 'create', label: 'Create new only if existing cannot fit' },
];
const agentSpaceCategoryOptions = [
  { value: 'jpd', label: 'Product Management' },
  { value: 'business', label: 'Work Management' },
  { value: 'jsm', label: 'Jira Service Management' },
  { value: 'software', label: 'Jira Software Projects' },
];
const agentManagementOptions = [
  { value: 'team-managed', label: 'Team-managed' },
  { value: 'company-managed', label: 'Company-managed' },
];
const agentReviewOptions = [
  { value: 'create-now', label: 'Create now' },
  { value: 'add-another', label: 'Add another domain / space type' },
  { value: 'start-over', label: 'Start over' },
];

const opsDashboardOptions = [
  {
    value: '',
    label: 'Default ITSM Dashboard',
    prompt: '',
  },
  { value: 'enterprise-service-health', label: 'Executive Dashboard (Cross-project)', prompt: 'Executive Dashboard for service management leadership. Show service health, total requests raised, open vs resolved requests, ticket trend over time, SLA compliance, tickets nearing SLA breach, breached ticket count, CSAT, escalation trend, major incidents, high-priority open issues, tickets by team/project, and workload distribution. Answer: How healthy are our services? Are commitments being met? Are customers satisfied? Which teams require attention? KPIs: SLA compliance %, MTTR, CSAT, resolution rate %.' },
  { value: 'service-desk-operations', label: 'Project-Level Dashboard (Single Service Project)', prompt: 'Project-Level Dashboard for a single service project. Show queue health, open tickets, aging tickets, tickets by priority, active incidents, escalated incidents, incident trend, tickets approaching SLA breach, breached tickets, tickets by assignee, agent workload, and knowledge/customer signals where available. Answer: What needs immediate action? Which tickets are at risk? Is work balanced? KPIs: first response time, resolution rate %, MTTR, SLA achievement %.' },
];

function getJsmDashboardOptions(serviceTypes = []) {
  const selectedTypes = Array.from(new Set((serviceTypes || []).filter(Boolean)));
  if (selectedTypes.length === 0 || selectedTypes.every(type => type === 'ITSM')) {
    return opsDashboardOptions;
  }

  return selectedTypes.flatMap(serviceType => {
    const label = jsmServiceTypeLabels[serviceType] || 'Service Management';
    if (serviceType === 'ITSM') {
      return opsDashboardOptions.filter(option => option.value !== 'enterprise-service-health');
    }
    return [{
      value: `jsm-${serviceType}-dashboard`,
      label: `Project-Level Dashboard - ${label}`,
      prompt: `Project-level dashboard for a Jira Service Management ${label} space. Show open work, work by status, priority mix, owner workload, aging work, overdue or at-risk items, created vs resolved trend, and recent activity for the selected service domain. Answer: What work needs attention for ${label}? Are requests moving and completing? KPIs: open work, high-priority work, overdue work, completion rate %, average age.`,
    }];
  });
}

const baseSoftwareDashboardOptions = [
  {
    value: '',
    label: 'Default Software Dashboard',
    prompt: '',
  },
  { value: 'engineering-portfolio-health', label: 'Executive Dashboard (Cross-project)', prompt: 'Executive Dashboard for software development leadership. Show delivery health, projects on track vs at risk, delivery trend, upcoming releases, release readiness, critical defects, defect trend, work completed by team, team workload, blocked items, and high-priority risks. Answer: Which projects need intervention? Are releases on schedule? Are quality issues increasing? KPIs: on-time delivery %, defect leakage %, release success %, project health score.' },
];

const scrumSoftwareDashboardOption = {
  value: 'scrum-sprint-health',
  label: 'Project-Level Dashboard - Scrum Project',
  prompt: 'Project-Level Dashboard for a Scrum project. Show sprint progress %, story points committed, story points completed, sprint burndown, scope changes, velocity trend, open defects, critical defects, blocked stories, and work by status. Answer: Is the sprint on track? What work is blocked? Can the team meet commitments? KPIs: sprint completion %, velocity, burndown adherence %, defect leakage %.',
};

const kanbanSoftwareDashboardOption = {
  value: 'kanban-flow-health',
  label: 'Project-Level Dashboard - Kanban Project',
  prompt: 'Project-Level Dashboard for a Kanban project. Show work by status, active work items, throughput, cycle time, lead time, blocked items, aging work items, open defects, critical defects, and WIP status. Answer: Is work flowing smoothly? Where are bottlenecks? Is delivery stable? KPIs: throughput, flow efficiency %, average cycle time, WIP compliance %.',
};

function buildDashboardPromptFromValues(options, values) {
  return values
    .map(value => options.find(option => option.value === value)?.prompt)
    .filter(Boolean)
    .join('\n\n');
}

function getSoftwareDashboardOptions(softwareProjects = []) {
  const hasScrumProject = softwareProjects.some(project => project.softwareTemplate === 'scrum');
  const hasKanbanProject = softwareProjects.some(project => project.softwareTemplate === 'kanban');
  const hasBugTrackingProject = softwareProjects.some(project => project.softwareTemplate === 'bug-tracking');

  if (hasBugTrackingProject && !hasScrumProject && !hasKanbanProject) {
    return [{
      value: 'bug-tracking-health',
      label: 'Project-Level Dashboard - Bug Tracking',
      prompt: 'Project-Level Dashboard for a Bug Tracking project. Show reported bugs, open defects, priority and severity mix, owner workload, aging bugs, fixed vs unresolved trend, and review status. Answer: Which bugs need attention and is defect resolution improving? KPIs: open defect count, fix rate %, high-priority bugs, average age.',
    }];
  }

  return [
    ...baseSoftwareDashboardOptions,
    ...(hasScrumProject ? [scrumSoftwareDashboardOption] : []),
    ...(hasKanbanProject ? [kanbanSoftwareDashboardOption] : []),
    ...(hasBugTrackingProject ? [{
      value: 'bug-tracking-health',
      label: 'Project-Level Dashboard - Bug Tracking',
      prompt: 'Project-Level Dashboard for a Bug Tracking project. Show reported bugs, open defects, priority and severity mix, owner workload, aging bugs, fixed vs unresolved trend, and review status. Answer: Which bugs need attention and is defect resolution improving? KPIs: open defect count, fix rate %, high-priority bugs, average age.',
    }] : []),
  ];
}

function getBusinessDashboardOptions(businessProjects = []) {
  const optionsByValue = new Map();
  businessProjects.forEach(project => {
    const businessSpaceType = project.businessSpaceType || 'task-tracking';
    const spaceOption = spaceTypeOptions.find(option => option.value === `business:${businessSpaceType}`);
    const label = spaceOption?.label || 'Task Tracking';
    const group = spaceOption?.group || 'Business';
    const value = `business-${businessSpaceType}-dashboard`;
    optionsByValue.set(value, {
      value,
      label: `Project-Level Dashboard - ${label}`,
      prompt: `Project-level dashboard for a Jira ${group} ${label} space. Show created vs resolved work, open work, overdue items, priority mix, owner workload, aging work, and completion trend for the selected business domain. Answer: What work needs attention for ${label}? Are items completing on time? KPIs: open work, overdue work, completion rate %, high-priority count, average age.`,
    });
  });
  return Array.from(optionsByValue.values());
}

function getProductDiscoveryDashboardOptions(productDiscoveryProjects = []) {
  return productDiscoveryProjects.length > 0
    ? [{
        value: 'product-discovery-dashboard',
        label: 'Project-Level Dashboard - Jira Product Discovery',
        prompt: 'Project-level dashboard for Jira Product Discovery. Show idea intake, open opportunities, priority or impact mix, owner workload, aging ideas, completion trend, and delivery readiness for the selected business domain. Answer: Which ideas need attention and what is ready for delivery? KPIs: open ideas, high-impact ideas, completion rate %, average idea age.',
      }]
    : [];
}

function filterDashboardValues(options, values) {
  const allowedValues = new Set(options.map(option => option.value).filter(Boolean));
  return (values || []).filter(value => allowedValues.has(value));
}

const chartColors = ['#6b9fe8', '#ef5b52', '#c29500', '#2ca46f', '#2f9db7', '#a957dc', '#f5c04d', '#43328a'];
const defaultSummaryFilters = {
  assignee: 'all',
  issueType: 'all',
  status: 'all',
  priority: 'all',
  creationDate: 'last-6-months',
};

function formatDisplayDate(dateValue) {
  if (!dateValue) {
    return 'today';
  }

  const date = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getRetainUntilDate(generatedAt, retentionPeriodDays) {
  const startDate = generatedAt ? new Date(`${generatedAt}T00:00:00`) : new Date();

  if (Number.isNaN(startDate.getTime())) {
    return null;
  }

  startDate.setDate(startDate.getDate() + retentionPeriodDays);
  return startDate.toISOString().split('T')[0];
}

function DashboardGadget({ context, source = 'dashboard' }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [hoveredChartItem, setHoveredChartItem] = useState(null);
  const [selectedGeneratedReport, setSelectedGeneratedReport] = useState(null);
  const [reportSearchTerm, setReportSearchTerm] = useState('');
  const [reportListView, setReportListView] = useState(false);
  const [projectInsightTab, setProjectInsightTab] = useState('summary');
  const [summaryFilters, setSummaryFilters] = useState(defaultSummaryFilters);
  const [openSummaryFilter, setOpenSummaryFilter] = useState(null);

  useEffect(() => {
    if (source === 'project') {
      const projectKey = context?.extension?.project?.key;

      invoke('getProjectInsightsData', { projectKey })
        .then((response) => {
          if (!response.success) {
            setError(response.message || 'Unable to load project Summary & Reports.');
            return;
          }
          setData(response);
        })
        .catch((err) => setError(err.message));
      return;
    }

    const dashboardId = context?.extension?.dashboard?.id;
    const gadgetId = context?.extension?.gadget?.id;

    invoke('getDemoDashboardGadgetData', { dashboardId, gadgetId })
      .then((response) => {
        if (!response.success) {
          setError(response.message || 'Unable to load dashboard gadget data.');
          return;
        }
        setData(response);
      })
      .catch((err) => setError(err.message));
  }, [context, source]);

  if (error) {
    return <div style={{ padding: '16px', color: '#bf2600', fontSize: '13px' }}>{error}</div>;
  }

  if (!data) {
    return <div style={{ padding: '16px', color: '#5e6c84', fontSize: '13px' }}>Loading...</div>;
  }

  const config = data.config || {};
  const viewType = config.viewType || 'open-work';
  const visualType = config.visualType || 'standard';
  const issues = data.issues || [];
  const retentionPeriodDays = config.retentionPeriodDays || 180;
  const generatedAt = config.generatedAt || new Date().toISOString().split('T')[0];
  const retainUntil = getRetainUntilDate(generatedAt, retentionPeriodDays);

  const shellStyle = {
    border: '1px solid #dfe1e6',
    borderRadius: '3px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#172b4d',
    fontSize: '13px',
    background: '#ffffff',
    overflow: 'hidden',
  };

  const titleStyle = {
    margin: '0',
    fontSize: '14px',
    fontWeight: 800,
    lineHeight: '20px',
    color: '#172b4d',
  };

  const sectionLabelStyle = {
    color: '#0052cc',
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.4px',
    textTransform: 'uppercase',
  };

  const mutedStyle = {
    color: '#5e6c84',
    fontSize: '12px',
    lineHeight: '16px',
  };

  const bodyStyle = {
    padding: '14px 16px 16px',
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px 14px 8px',
    background: '#ffffff',
    borderTop: '3px solid #36b37e',
    borderBottom: '1px solid #ebecf0',
  };

  const headerSubtitleStyle = {
    padding: '8px 14px',
    borderBottom: '1px solid #dfe1e6',
    background: '#fafbfc',
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    alignItems: 'center',
  };

  const headerActionStyle = {
    border: '1px solid #b3d4ff',
    borderRadius: '3px',
    color: '#0052cc',
    fontSize: '11px',
    fontWeight: 700,
    padding: '2px 6px',
    textDecoration: 'none',
    cursor: 'pointer',
    background: '#deebff',
  };

  const badgeStyle = {
    borderRadius: '3px',
    background: '#e3fcef',
    color: '#006644',
    fontSize: '11px',
    fontWeight: 700,
    padding: '3px 8px',
    whiteSpace: 'nowrap',
  };

  const profilePanelStyle = {
    border: '1px solid #dfe1e6',
    borderTop: '3px solid #0052cc',
    background: '#f4f8ff',
    borderRadius: '3px',
    padding: '10px 12px',
    marginBottom: '14px',
  };

  const chipRowStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '8px',
  };

  const chipStyle = {
    borderRadius: '3px',
    background: '#deebff',
    color: '#0747a6',
    fontSize: '11px',
    fontWeight: 700,
    padding: '3px 8px',
  };

  const retentionPanelStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    alignItems: 'center',
    gap: '12px',
    border: '1px solid #c1f0d4',
    borderRadius: '6px',
    background: '#f3fff7',
    padding: '10px 12px',
    marginBottom: '14px',
  };

  const retentionValueStyle = {
    color: '#006644',
    fontSize: '18px',
    fontWeight: 700,
    lineHeight: '22px',
    whiteSpace: 'nowrap',
  };

  const cardGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '10px',
    margin: '0 16px 14px',
  };

  const metricCardStyle = {
    border: '1px solid #dfe1e6',
    borderTop: '3px solid #0052cc',
    borderRadius: '3px',
    padding: '11px',
    background: '#ffffff',
    boxShadow: '0 1px 2px rgba(9, 30, 66, 0.08)',
  };

  const compactRowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '9px 12px',
    borderTop: '1px solid #ebecf0',
  };

  const timelineRowStyle = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    columnGap: '14px',
    minHeight: '38px',
    padding: '9px 12px',
    borderTop: '1px solid #ebecf0',
  };

  const timelineTitleStyle = {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: '18px',
  };

  const tableHeaderStyle = {
    display: 'grid',
    gridTemplateColumns: '48px 78px minmax(260px, 1fr) 48px',
    gap: '10px',
    padding: '7px 10px',
    background: '#f4f5f7',
    borderBottom: '1px solid #dfe1e6',
    color: '#42526e',
    fontSize: '10px',
    fontWeight: 800,
    textTransform: 'uppercase',
  };

  const tableRowStyle = {
    display: 'grid',
    gridTemplateColumns: '48px 78px minmax(260px, 1fr) 48px',
    gap: '10px',
    alignItems: 'center',
    padding: '8px 10px',
    borderBottom: '1px solid #ebecf0',
    color: '#172b4d',
    textDecoration: 'none',
    cursor: 'pointer',
    minHeight: '36px',
  };

  const visualPanelStyle = {
    border: '1px solid #dfe1e6',
    borderRadius: '3px',
    background: '#ffffff',
    padding: '12px',
    boxShadow: '0 1px 2px rgba(9, 30, 66, 0.08)',
  };

  const signalPanelStyle = {
    border: '1px solid #dfe1e6',
    borderRadius: '6px',
    background: '#ffffff',
    padding: '10px',
    marginTop: '12px',
  };

  const chartTooltipStyle = {
    position: 'absolute',
    left: '50%',
    top: '-2px',
    transform: 'translate(-50%, -100%)',
    zIndex: 2,
    background: '#172b4d',
    color: '#ffffff',
    borderRadius: '4px',
    padding: '6px 8px',
    fontSize: '12px',
    lineHeight: '16px',
    fontWeight: 600,
    boxShadow: '0 4px 10px rgba(9, 30, 66, 0.24)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  };

  const formatPercent = (count, total) => {
    if (!total) {
      return '0%';
    }

    const percent = (count / total) * 100;
    return `${percent >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10}%`;
  };

  const getChartTooltipText = (item, total) => (
    `${item.name}: ${item.count} (${formatPercent(item.count, total)})`
  );

  const clearChartTooltip = () => {
    setHoveredChartItem(null);
  };

  const showChartTooltip = (item, total) => {
    setHoveredChartItem({
      name: item.name,
      count: item.count,
      percent: formatPercent(item.count, total),
      label: getChartTooltipText(item, total),
    });
  };

  const getStatusColor = (statusName) => {
    const normalized = (statusName || '').toLowerCase();
    if (normalized.includes('done') || normalized.includes('closed') || normalized.includes('resolved')) return '#00875a';
    if (normalized.includes('progress') || normalized.includes('review') || normalized.includes('waiting')) return '#ff991f';
    if (normalized.includes('reopen') || normalized.includes('blocked')) return '#de350b';
    return '#0052cc';
  };

  const renderStatusMatrix = () => {
    const statuses = (data.statusCounts || [])
      .filter(status => status.count > 0)
      .map(status => status.name)
      .slice(0, 4);
    const visibleStatuses = statuses.length > 0 ? statuses : ['To Do', 'In Progress', 'Done'];
    const assignees = Array.from(new Set(issues.map(issue => issue.assignee || 'Unassigned'))).slice(0, 5);
    const rowNames = assignees.length > 0 ? assignees : ['Unassigned'];
    const gridTemplateColumns = `minmax(150px, 1.4fr) repeat(${visibleStatuses.length}, minmax(86px, 1fr)) 76px`;
    const matrixCellStyle = {
      minHeight: '20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    };
    const statusTotals = visibleStatuses.map(status => issues.filter(issue => issue.status === status).length);
    const grandTotal = statusTotals.reduce((sum, value) => sum + value, 0);

    return (
      <div style={{ margin: '0 16px 14px', border: '1px solid #dfe1e6', borderRadius: '3px', overflowX: 'auto', overflowY: 'hidden', background: '#ffffff' }}>
        <div style={{ minWidth: '720px' }}>
          <div style={{ display: 'grid', gridTemplateColumns, gap: '8px', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #dfe1e6', background: '#ffffff' }}>
            <strong>Assignee</strong>
            {visibleStatuses.map(status => (
              <span key={status} style={{ ...badgeStyle, ...matrixCellStyle, justifySelf: 'center', background: '#f4f5f7', color: getStatusColor(status), border: `1px solid ${getStatusColor(status)}33` }}>
                {status}
              </span>
            ))}
            <strong style={{ ...matrixCellStyle, justifyContent: 'center' }}>Total</strong>
          </div>
          {rowNames.map(assignee => {
            const cells = visibleStatuses.map(status => issues.filter(issue => (issue.assignee || 'Unassigned') === assignee && issue.status === status).length);
            const rowTotal = cells.reduce((sum, value) => sum + value, 0);

            return (
              <div key={assignee} style={{ display: 'grid', gridTemplateColumns, gap: '8px', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #ebecf0' }}>
                <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignee}</span>
                {cells.map((count, index) => renderDrilldownLink(getItemDrilldownUrl('status', { name: visibleStatuses[index] }), (
                  <span key={visibleStatuses[index]} style={{ ...matrixCellStyle, color: '#0052cc', fontWeight: 700, cursor: 'pointer' }}>{count}</span>
                ), { display: 'block' }))}
                <strong style={{ ...matrixCellStyle, justifyContent: 'center', color: '#0747a6' }}>{rowTotal}</strong>
              </div>
            );
          })}
          <div style={{ display: 'grid', gridTemplateColumns, gap: '8px', alignItems: 'center', padding: '10px 12px', background: '#f4f5f7' }}>
            <strong>Total Unique Issues:</strong>
            {statusTotals.map((count, index) => <strong key={visibleStatuses[index]} style={{ ...matrixCellStyle, color: '#0052cc' }}>{count}</strong>)}
            <strong style={{ ...matrixCellStyle, justifyContent: 'center', color: '#0747a6' }}>{grandTotal}</strong>
          </div>
        </div>
      </div>
    );
  };

  const renderProfileContext = () => {
    return null;
  };

  const isDuplicateGadgetTitle = (title) => (
    String(title || '').trim().toLowerCase() === String(config.title || '').trim().toLowerCase()
  );

  const renderInlineVisualTitle = (title, fallbackTitle) => {
    const displayTitle = title || fallbackTitle;

    if (!displayTitle || isDuplicateGadgetTitle(displayTitle)) {
      return null;
    }

    return <div style={{ fontSize: '15px', fontWeight: 800, textAlign: 'left', marginBottom: '10px' }}>{displayTitle}</div>;
  };

  const renderHeader = (title, subtitle) => (
    <>
      <div style={headerStyle}>
        <div style={{ minWidth: 0 }}>
          {config.sectionLabel && <div style={sectionLabelStyle}>{config.sectionLabel}</div>}
          {!isDuplicateGadgetTitle(title) && <h3 style={titleStyle}>{title}</h3>}
          <div style={{ ...mutedStyle, marginTop: '3px' }}>{config.subtitle || subtitle || 'Interactive dashboard gadget'}</div>
        </div>
      </div>
    </>
  );

  const renderRetentionPanel = () => null;

  const renderMetricCard = (label, value, detail, color = '#0052cc') => renderDrilldownLink(data.drilldowns?.allWork?.url, (
    <div style={{ ...metricCardStyle, borderTopColor: color, cursor: 'pointer' }}>
      <div style={{ ...mutedStyle, marginBottom: '5px' }}>{label}</div>
      <div style={{ color, fontSize: '24px', lineHeight: '28px', fontWeight: 700 }}>{value}</div>
      {detail && <div style={{ ...mutedStyle, marginTop: '4px' }}>{detail}</div>}
    </div>
  ), { display: 'block' });

  const renderKpiBarChart = (cards) => {
    const chartItems = cards.map((card, index) => {
      const rawValue = String(card.value ?? '');
      const numericValue = Number.parseFloat(rawValue.replace(/[^0-9.]/g, '')) || 0;
      const isPercent = rawValue.includes('%') || String(card.label || '').includes('%');
      return {
        ...card,
        isPercent,
        numericValue,
        displayValue: isPercent && !rawValue.includes('%') ? `${numericValue}%` : card.value,
        color: chartColors[index % chartColors.length],
      };
    });

    const chartGroups = [
      { key: 'percent', title: 'Percentage KPIs', items: chartItems.filter(item => item.isPercent), unit: '%' },
      { key: 'count', title: 'Count KPIs', items: chartItems.filter(item => !item.isPercent), unit: '' },
    ].filter(group => group.items.length > 0);

    const renderChartGroup = (group) => {
      const chartHeight = 180;
      const maxValue = Math.max(...group.items.map(item => item.numericValue), 1);
      const yAxisMax = group.unit === '%' ? 100 : Math.max(5, Math.ceil(maxValue / 5) * 5);
      const tickValues = [yAxisMax, yAxisMax * 0.75, yAxisMax * 0.5, yAxisMax * 0.25, 0].map(value => Math.round(value));
      const formatTick = (tick) => group.unit === '%' ? `${tick}%` : tick;
      const formatTooltip = (item) => `${item.label}: ${item.displayValue}`;

      return (
        <div key={group.key} style={{ marginTop: group.key === chartGroups[0].key ? 0 : '22px' }}>
          {chartGroups.length > 1 && <div style={{ fontSize: '13px', fontWeight: 800, marginBottom: '8px', color: '#172b4d' }}>{group.title}</div>}
          <div style={{ overflowX: 'auto', paddingBottom: '6px' }}>
            <div style={{ minWidth: `${Math.max(520, group.items.length * 140)}px` }}>
              <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: '10px' }}>
                <div style={{ height: `${chartHeight}px`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: '#7a869a', fontSize: '11px', textAlign: 'right' }}>
                  {tickValues.map((tick, index) => <span key={`${group.key}-${tick}-${index}`}>{formatTick(tick)}</span>)}
                </div>
                <div style={{ position: 'relative', height: `${chartHeight}px`, borderLeft: '1px solid #dfe1e6', borderBottom: '1px solid #dfe1e6' }}>
                  {[0, 25, 50, 75, 100].map(line => (
                    <div key={line} style={{ position: 'absolute', left: 0, right: 0, bottom: `${line}%`, borderTop: '1px solid #ebecf0' }} />
                  ))}
                  <div style={{ position: 'absolute', inset: '0 10px 0 10px', display: 'flex', alignItems: 'flex-end', gap: '14px' }}>
                    {group.items.map((item) => {
                      const barHeight = Math.max(4, Math.round((item.numericValue / yAxisMax) * chartHeight));

                      return renderDrilldownLink(data.drilldowns?.allWork?.url, (
                      <div key={item.label} title={formatTooltip(item)} style={{ position: 'relative', width: '100%', height: `${chartHeight}px`, cursor: 'pointer' }}>
                        <strong style={{ position: 'absolute', left: 0, right: 0, bottom: `${barHeight + 6}px`, color: '#172b4d', textAlign: 'center' }}>{item.displayValue}</strong>
                        <div style={{ position: 'absolute', left: '16%', right: '16%', bottom: 0, minHeight: '4px', height: `${barHeight}px`, background: item.color, borderRadius: '4px 4px 0 0' }} />
                      </div>
                    ), { flex: 1, minWidth: '96px', height: `${chartHeight}px`, display: 'block' });
                    })}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `46px repeat(${group.items.length}, minmax(96px, 1fr))`, gap: '10px', marginTop: '10px' }}>
                <span />
                {group.items.map((item) => (
                  <div key={item.label} style={{ minWidth: 0, textAlign: 'left' }}>
                    <div title={item.label} style={{ ...mutedStyle, whiteSpace: 'normal', lineHeight: '15px' }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div style={{ ...visualPanelStyle, margin: '0 16px 14px', padding: '18px' }}>
        {renderInlineVisualTitle(config.dashboardProfile, 'Dashboard KPIs')}
        <div style={{ ...mutedStyle, marginBottom: '14px' }}>KPI comparison by generated ticket data</div>
        {chartGroups.map(renderChartGroup)}
      </div>
    );
  };

  const renderDataNotes = () => {
    return null;
  };

  const renderDrilldownLink = (url, children, style = {}) => {
    if (!url) {
      return children;
    }

    return (
      <a
        href={url}
        onClick={(event) => {
          event.preventDefault();
          router.open(url).catch(() => window.open(url, '_blank', 'noopener,noreferrer'));
        }}
        style={{ color: 'inherit', textDecoration: 'none', ...style }}
      >
        {children}
      </a>
    );
  };

  const getItemDrilldownUrl = (type, item) => {
    const base = (config.allWorkJql || config.jql || '').replace(/\s+ORDER\s+BY\s+.+$/i, '').trim();

    if (!base || !item?.name) {
      return data.drilldowns?.allWork?.url;
    }

    if (type === 'sprint' && item.projectKey && item.sprintName) {
      return `/issues/?jql=${encodeURIComponent(`project = "${item.projectKey}" AND sprint = "${item.sprintName}" AND status = "${item.statusName || item.name}"`)}`;
    }

    if (type === 'status') return `/issues/?jql=${encodeURIComponent(`${base} AND status = "${item.name}"`)}`;
    if (type === 'priority') return `/issues/?jql=${encodeURIComponent(`${base} AND priority = "${item.name}"`)}`;
    if (type === 'project') return `/issues/?jql=${encodeURIComponent(`project = "${item.name}"`)}`;
    if (type === 'aging') return data.drilldowns?.open?.url;
    if (type === 'escalations') return item.name === 'Within SLA' ? data.drilldowns?.open?.url : data.drilldowns?.slaBreached?.url;
    if (type === 'sprint') return `/issues/?jql=${encodeURIComponent(`${base} AND sprint in openSprints() AND status = "${item.name}"`)}`;
    if (type === 'sprint-health') return `/issues/?jql=${encodeURIComponent(`${base} AND sprint in openSprints() AND status = "${item.name}"`)}`;
    if (type === 'reports') return `/issues/?jql=${encodeURIComponent(`${base} AND status = "${item.name}"`)}`;

    return data.drilldowns?.allWork?.url;
  };

  const renderHorizontalBars = (items, emptyMessage, drilldownType) => {
    const max = Math.max(...items.map((item) => item.count), 1);
    const total = items.reduce((sum, item) => sum + item.count, 0);

    if (items.length === 0) {
      return <div style={{ ...mutedStyle, margin: '0 16px 14px' }}>{emptyMessage}</div>;
    }

    return (
      <div style={{ ...visualPanelStyle, margin: '0 16px 14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 74px', gap: '10px', ...mutedStyle, fontWeight: 800, textTransform: 'uppercase', marginBottom: '10px' }}>
          <span>Dimension</span>
          <span>Count</span>
          <span>Share</span>
        </div>
        {items.map((item, index) => {
          const percent = formatPercent(item.count, total);

          return renderDrilldownLink(getItemDrilldownUrl(drilldownType, item), (
            <div key={item.name} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 74px', gap: '10px', alignItems: 'center', marginBottom: '10px', cursor: 'pointer' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '5px' }}>
                  <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                </div>
                <div style={{ height: '11px', background: '#ebecf0', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(8, Math.round((item.count / max) * 100))}%`, height: '100%', background: chartColors[index % chartColors.length] }} />
                </div>
              </div>
              <strong>{item.count}</strong>
              <span style={mutedStyle}>{percent}</span>
            </div>
          ), { display: 'block' });
        })}
      </div>
    );
  };

  const renderVerticalBars = (items, emptyMessage, drilldownType) => {
    const max = Math.max(...items.map((item) => item.count), 1);
    const total = items.reduce((sum, item) => sum + item.count, 0);
    const yAxisTicks = [max, Math.round(max * 0.75), Math.round(max * 0.5), Math.round(max * 0.25), 0]
      .filter((value, index, values) => values.indexOf(value) === index);

    if (items.length === 0) {
      return <div style={{ ...mutedStyle, margin: '0 16px 14px' }}>{emptyMessage}</div>;
    }

    return (
      <div
        onMouseLeave={clearChartTooltip}
        style={{ ...visualPanelStyle, margin: '0 16px 14px', position: 'relative', minHeight: '250px', padding: '18px 18px 14px' }}
      >
        {hoveredChartItem && <div style={chartTooltipStyle}>{typeof hoveredChartItem === 'string' ? hoveredChartItem : hoveredChartItem.label}</div>}
        {renderInlineVisualTitle(config.title, 'Bar Chart')}
        <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '160px', color: '#7a869a', fontSize: '11px', textAlign: 'right' }}>
            {yAxisTicks.map(tick => <span key={tick}>{tick}</span>)}
          </div>
          <div style={{ position: 'relative', height: '160px', borderLeft: '1px solid #dfe1e6', borderBottom: '1px solid #dfe1e6' }}>
            {[0, 25, 50, 75, 100].map(line => (
              <div key={line} style={{ position: 'absolute', left: 0, right: 0, bottom: `${line}%`, borderTop: '1px solid #ebecf0' }} />
            ))}
            <div style={{ position: 'absolute', inset: '0 8px 0 8px', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
              {items.map((item, index) => {
                const segmentCount = Math.max(1, Math.min(4, item.count));
                const segmentHeight = Math.max(3, Math.round((item.count / max) * 150));

                return (
                  <div key={`${item.projectKey || ''}-${item.sprintId || ''}-${item.name}`} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                    {renderDrilldownLink(getItemDrilldownUrl(drilldownType, item), (
                      <div
                        title={getChartTooltipText(item, total)}
                        onMouseEnter={() => showChartTooltip(item, total)}
                        onFocus={() => showChartTooltip(item, total)}
                        onTouchStart={() => showChartTooltip(item, total)}
                        onBlur={clearChartTooltip}
                        style={{
                          height: `${segmentHeight}px`,
                          minHeight: item.count > 0 ? '7px' : '2px',
                          width: '72%',
                          margin: '0 auto',
                          display: 'flex',
                          flexDirection: 'column-reverse',
                          borderRadius: '4px 4px 0 0',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          boxShadow: (typeof hoveredChartItem === 'object' ? hoveredChartItem.label : hoveredChartItem) === getChartTooltipText(item, total) ? '0 0 0 3px rgba(0, 82, 204, 0.18)' : 'none',
                        }}
                        tabIndex="0"
                      >
                        {Array.from({ length: segmentCount }).map((_, segmentIndex) => (
                          <span
                            key={segmentIndex}
                            style={{
                              flex: 1,
                              minHeight: '3px',
                              background: chartColors[(index + segmentIndex) % chartColors.length],
                              borderTop: segmentIndex === 0 ? 'none' : '1px solid rgba(255,255,255,0.55)',
                            }}
                          />
                        ))}
                      </div>
                    ), { display: 'block' })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `34px repeat(${items.length}, minmax(0, 1fr))`, gap: '8px', marginTop: '8px' }}>
          <span />
          {items.map((item) => (
            <div key={`${item.name}-label`} style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ fontWeight: 800 }}>{item.count}</div>
              <div style={{ ...mutedStyle, transform: items.length > 6 ? 'rotate(-38deg)' : 'none', transformOrigin: 'top center', height: items.length > 6 ? '42px' : 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.projectKey ? `${item.projectKey} ${item.name}` : item.name}
              </div>
            </div>
          ))}
        </div>
        <div style={{ ...mutedStyle, marginTop: '10px', textAlign: 'left', textTransform: 'uppercase' }}>{drilldownType === 'sprint' ? 'Sprint / Status' : 'Category'}</div>
      </div>
    );
  };

  const renderGaugeChart = (items, emptyMessage, drilldownType, label = 'Current risk') => {
    const visibleItems = (items || []).filter(item => item.count > 0);
    const total = visibleItems.reduce((sum, item) => sum + item.count, 0);
    const riskItems = visibleItems.filter(item => /critical|highest|high|breach|overdue|risk|blocked|open|in progress|waiting/i.test(item.name));
    const riskCount = riskItems.reduce((sum, item) => sum + item.count, 0) || visibleItems[0]?.count || 0;
    const percent = total === 0 ? 0 : Math.min(100, Math.round((riskCount / total) * 100));
    const angle = -90 + ((percent / 100) * 180);

    if (visibleItems.length === 0 || total === 0) {
      return <div style={{ ...mutedStyle, margin: '0 16px 14px' }}>{emptyMessage}</div>;
    }

    return (
      <div style={{ ...visualPanelStyle, margin: '0 16px 14px', padding: '18px', display: 'grid', gridTemplateColumns: 'minmax(220px, 340px) 1fr', gap: '22px', alignItems: 'center', overflowX: 'auto' }}>
        {renderDrilldownLink(getItemDrilldownUrl(drilldownType, visibleItems[0]), (
          <div title={`${label}: ${percent}% (${riskCount} of ${total})`} style={{ minWidth: '220px', cursor: 'pointer' }}>
            <svg viewBox="0 0 220 130" style={{ width: '100%', height: 'auto', display: 'block' }}>
              <path d="M30 110 A80 80 0 0 1 190 110" fill="none" stroke="#ebecf0" strokeWidth="28" strokeLinecap="round" />
              <path d="M30 110 A80 80 0 0 1 190 110" fill="none" stroke="#de350b" strokeWidth="28" strokeLinecap="round" strokeDasharray={`${percent * 2.52} 252`} />
              <line x1="110" y1="110" x2={110 + (68 * Math.cos((angle * Math.PI) / 180))} y2={110 + (68 * Math.sin((angle * Math.PI) / 180))} stroke="#172b4d" strokeWidth="5" strokeLinecap="round" />
              <circle cx="110" cy="110" r="7" fill="#172b4d" />
              <text x="110" y="82" textAnchor="middle" fill="#de350b" fontSize="24" fontWeight="800">{percent}%</text>
              <text x="110" y="101" textAnchor="middle" fill="#42526e" fontSize="12">{riskCount} of {total}</text>
            </svg>
            <div style={{ ...mutedStyle, textAlign: 'center', marginTop: '4px' }}>{label}</div>
          </div>
        ), { display: 'block' })}
        <div style={{ display: 'grid', gap: '9px', minWidth: '260px' }}>
          {visibleItems.slice(0, 6).map((item, index) => renderDrilldownLink(getItemDrilldownUrl(drilldownType, item), (
            <div key={item.name} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: '8px', alignItems: 'center', cursor: 'pointer' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: chartColors[index % chartColors.length] }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
              <strong>{item.count}</strong>
            </div>
          ), { display: 'block' }))}
        </div>
      </div>
    );
  };

  const renderGroupedComparisonBars = () => {
    const statuses = (data.statusCounts || []).filter(item => item.count > 0).slice(0, 5);
    const priorityBands = [
      { name: 'Critical / High', priorities: ['Critical', 'Highest', 'High'], color: '#de350b' },
      { name: 'Medium', priorities: ['Medium'], color: '#ff991f' },
      { name: 'Low', priorities: ['Low', 'Lowest', 'Informational'], color: '#36b37e' },
    ];
    const maxCount = Math.max(...statuses.flatMap(status => priorityBands.map(band => (
      issues.filter(issue => issue.status === status.name && band.priorities.includes(issue.priority)).length
    ))), 1);

    if (statuses.length === 0) {
      return <div style={{ ...mutedStyle, margin: '0 16px 14px' }}>No status data found.</div>;
    }

    return (
      <div style={{ ...visualPanelStyle, margin: '0 16px 14px', padding: '18px', overflowX: 'auto' }}>
        <div style={{ minWidth: `${Math.max(620, statuses.length * 126)}px` }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginBottom: '12px', ...mutedStyle }}>
            {priorityBands.map(band => <span key={band.name}><span style={{ display: 'inline-block', width: '10px', height: '10px', background: band.color, marginRight: '5px' }} />{band.name}</span>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '42px 1fr', gap: '10px' }}>
            <div style={{ height: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: '#7a869a', fontSize: '11px', textAlign: 'right' }}>
              {[maxCount, Math.round(maxCount * 0.5), 0].map(tick => <span key={tick}>{tick}</span>)}
            </div>
            <div style={{ position: 'relative', height: '180px', borderLeft: '1px solid #dfe1e6', borderBottom: '1px solid #dfe1e6' }}>
              {[0, 50, 100].map(line => <div key={line} style={{ position: 'absolute', left: 0, right: 0, bottom: `${line}%`, borderTop: '1px solid #ebecf0' }} />)}
              <div style={{ position: 'absolute', inset: '0 12px', display: 'grid', gridTemplateColumns: `repeat(${statuses.length}, minmax(90px, 1fr))`, gap: '18px', alignItems: 'end' }}>
                {statuses.map(status => (
                  <div key={status.name} style={{ display: 'flex', alignItems: 'end', gap: '5px', height: '100%' }}>
                    {priorityBands.map(band => {
                      const count = issues.filter(issue => issue.status === status.name && band.priorities.includes(issue.priority)).length;
                      const height = Math.max(count > 0 ? 4 : 0, Math.round((count / maxCount) * 168));
                      return renderDrilldownLink(getItemDrilldownUrl('status', status), (
                        <div key={band.name} title={`${status.name} / ${band.name}: ${count}`} style={{ flex: 1, height: `${height}px`, background: band.color, borderRadius: '4px 4px 0 0', cursor: 'pointer' }} />
                      ), { flex: 1, display: 'block' });
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `42px repeat(${statuses.length}, minmax(90px, 1fr))`, gap: '18px', marginTop: '9px' }}>
            <span />
            {statuses.map(status => <div key={status.name} style={{ ...mutedStyle, textAlign: 'center', fontWeight: 700 }}>{status.name}</div>)}
          </div>
        </div>
      </div>
    );
  };

  const renderTimelineGantt = () => {
    const sourceIssues = issues
      .filter(issue => issue.dueDate || issue.createdAt)
      .slice(0, 10);
    const generated = new Date(`${config.generatedAt || new Date().toISOString().split('T')[0]}T00:00:00`);

    if (sourceIssues.length === 0) {
      return <div style={{ ...mutedStyle, margin: '0 16px 14px' }}>No dated work found for timeline.</div>;
    }

    const dayMs = 86400000;
    const getDate = value => {
      const date = value ? new Date(`${value}T00:00:00`) : null;
      return date && !Number.isNaN(date.getTime()) ? date : null;
    };
    const rows = sourceIssues.map((issue, index) => {
      const created = getDate(issue.createdAt) || new Date(generated.getTime() - (index * 2 * dayMs));
      const due = getDate(issue.dueDate) || new Date(created.getTime() + ((index % 5) + 4) * dayMs);
      const start = created <= due ? created : due;
      const end = due >= created ? due : created;
      return { issue, start, end };
    });
    const minTime = Math.min(...rows.map(row => row.start.getTime()));
    const maxTime = Math.max(...rows.map(row => row.end.getTime()), minTime + (14 * dayMs));
    const span = Math.max(dayMs, maxTime - minTime);

    return (
      <div style={{ ...visualPanelStyle, margin: '0 16px 14px', padding: '14px', overflowX: 'auto' }}>
        <div style={{ minWidth: '760px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '12px', ...mutedStyle, fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>
            <span>Work item</span>
            <span>Schedule</span>
          </div>
          {rows.map(({ issue, start, end }, index) => {
            const left = Math.max(0, Math.round(((start.getTime() - minTime) / span) * 100));
            const width = Math.max(8, Math.round(((end.getTime() - start.getTime()) / span) * 100));
            const color = getIssueRiskColor(issue);

            return renderDrilldownLink(getIssueUrl(issue), (
              <div key={issue.key} style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '12px', alignItems: 'center', padding: '8px 0', borderTop: '1px solid #ebecf0', cursor: 'pointer' }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ color: '#0052cc' }}>{issue.key}</strong>
                  <div title={issue.summary} style={{ ...mutedStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.summary}</div>
                </div>
                <div style={{ position: 'relative', height: '28px', background: '#f4f5f7', borderRadius: '3px', overflow: 'hidden' }}>
                  <div title={`${issue.key}: ${issue.createdAt || 'No start'} to ${issue.dueDate || 'No due date'}`} style={{ position: 'absolute', left: `${left}%`, width: `${Math.min(width, 100 - left)}%`, top: '5px', height: '18px', background: color, borderRadius: '3px', color: '#ffffff', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', paddingLeft: '6px', boxSizing: 'border-box', whiteSpace: 'nowrap' }}>
                    {issue.status}
                  </div>
                </div>
              </div>
            ), { display: 'block' });
          })}
        </div>
      </div>
    );
  };

  const renderLaneCards = (field = 'status') => {
    const groups = Array.from(new Set(issues.map(issue => issue[field] || 'Unassigned'))).slice(0, 4);

    if (groups.length === 0) {
      return <div style={{ ...mutedStyle, margin: '0 16px 14px' }}>No work found.</div>;
    }

    return (
      <div style={{ margin: '0 16px 14px', display: 'grid', gridTemplateColumns: `repeat(${groups.length}, minmax(170px, 1fr))`, gap: '12px', overflowX: 'auto' }}>
        {groups.map((group, groupIndex) => {
          const groupIssues = issues.filter(issue => (issue[field] || 'Unassigned') === group).slice(0, 4);
          return (
            <div key={group} style={{ border: '1px solid #dfe1e6', borderTop: `3px solid ${chartColors[groupIndex % chartColors.length]}`, borderRadius: '3px', background: '#f7f8f9', minWidth: '170px', padding: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
                <strong>{group}</strong>
                <span style={badgeStyle}>{issues.filter(issue => (issue[field] || 'Unassigned') === group).length}</span>
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {groupIssues.map(issue => renderDrilldownLink(getIssueUrl(issue), (
                  <div key={issue.key} style={{ border: '1px solid #dfe1e6', borderRadius: '3px', background: '#ffffff', padding: '8px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '5px' }}>
                      <strong style={{ color: '#0052cc' }}>{issue.key}</strong>
                      <span>{renderPriorityIcon(issue.priority)}</span>
                    </div>
                    <div title={issue.summary} style={{ fontSize: '12px', lineHeight: '16px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{issue.summary}</div>
                  </div>
                ), { display: 'block' }))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };


  const renderPieChart = (items, emptyMessage) => {
    const visibleItems = items.filter((item) => item.count > 0);
    const total = visibleItems.reduce((sum, item) => sum + item.count, 0);
    let runningTotal = 0;
    const segmentRanges = [];

    if (visibleItems.length === 0 || total === 0) {
      return <div style={{ ...mutedStyle, margin: '0 16px 14px' }}>{emptyMessage}</div>;
    }

    const segments = visibleItems.map((item, index) => {
      const start = (runningTotal / total) * 360;
      runningTotal += item.count;
      const end = (runningTotal / total) * 360;
      segmentRanges.push({ item, start, end });
      return `${chartColors[index % chartColors.length]} ${start}deg ${end}deg`;
    });

    const getTotalHoverItem = () => ({
      name: 'Total',
      count: total,
      percent: '100%',
      label: `Total: ${total}`,
    });
    const centerItem = typeof hoveredChartItem === 'object' && hoveredChartItem
      ? hoveredChartItem
      : {
          name: visibleItems[0].name,
          count: visibleItems[0].count,
          percent: formatPercent(visibleItems[0].count, total),
          label: getChartTooltipText(visibleItems[0], total),
        };

    const showPieTooltipForPointer = (event) => {
      const pointer = event.touches?.[0] || event;
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = pointer.clientX - bounds.left - (bounds.width / 2);
      const y = pointer.clientY - bounds.top - (bounds.height / 2);
      const distanceFromCenter = Math.sqrt((x * x) + (y * y));
      const outerRadius = bounds.width / 2;
      const innerRadius = outerRadius * 0.47;

      if (distanceFromCenter < innerRadius || distanceFromCenter > outerRadius) {
        setHoveredChartItem(getTotalHoverItem());
        return;
      }

      // CSS conic gradients start at the top of the circle. This conversion
      // keeps the calculated pointer angle aligned with the rendered segments.
      const angle = (Math.atan2(y, x) * (180 / Math.PI) + 450) % 360;
      const segment = segmentRanges.find((range) => angle >= range.start && angle < range.end);

      if (segment) {
        showChartTooltip(segment.item, total);
      }
    };

    return (
      <div
        onMouseLeave={clearChartTooltip}
        style={{
          ...visualPanelStyle,
          margin: '0 16px 14px',
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '24px',
          alignItems: 'center',
          minHeight: '260px',
          padding: '18px 24px',
          overflowX: 'auto',
        }}
      >
        {hoveredChartItem && <div style={chartTooltipStyle}>{typeof hoveredChartItem === 'string' ? hoveredChartItem : hoveredChartItem.label}</div>}
        {renderDrilldownLink(data.drilldowns?.allWork?.url, (
        <div
          title={`Total: ${total}`}
          onMouseMove={showPieTooltipForPointer}
          onTouchStart={showPieTooltipForPointer}
          onFocus={() => setHoveredChartItem(getTotalHoverItem())}
          onBlur={clearChartTooltip}
          style={{
            width: 'min(260px, 76vw)',
            height: 'min(260px, 76vw)',
            maxWidth: '260px',
            maxHeight: '260px',
            minWidth: '210px',
            minHeight: '210px',
            borderRadius: '50%',
            background: `radial-gradient(circle at center, #ffffff 0 33%, transparent 34%), conic-gradient(${segments.join(', ')})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            margin: '0 auto',
            transition: 'filter 0.15s, box-shadow 0.15s',
            boxShadow: hoveredChartItem ? '0 0 0 4px rgba(0, 82, 204, 0.14)' : 'none',
          }}
          tabIndex="0"
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#0052cc', fontSize: '36px', lineHeight: '38px', fontWeight: 800 }}>{centerItem.percent}</div>
            <div style={{ ...mutedStyle, maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{centerItem.name}</div>
          </div>
        </div>
        ), { display: 'block' })}
        <div>
          <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '2px' }}>{viewType === 'priority' ? 'Priority' : 'Project'}</div>
          <div style={{ ...mutedStyle, paddingBottom: '9px', marginBottom: '11px', borderBottom: '1px solid #7a869a' }}>Total Issues: {total}</div>
          {visibleItems.map((item, index) => {
            const percent = Math.round((item.count / total) * 100);

            return (
              <div
                key={item.name}
                title={getChartTooltipText(item, total)}
                onMouseEnter={() => showChartTooltip(item, total)}
                onFocus={() => showChartTooltip(item, total)}
                onTouchStart={() => showChartTooltip(item, total)}
                onBlur={clearChartTooltip}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '11px', cursor: 'pointer' }}
                tabIndex="0"
              >
                {renderDrilldownLink(getItemDrilldownUrl(viewType, item), (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ width: '13px', height: '13px', background: chartColors[index % chartColors.length], flex: '0 0 auto' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                    </div>
                    <strong>{item.count} ({percent}%)</strong>
                  </>
                ), { display: 'contents' })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAverageTimeBars = (items) => {
    const maxDays = Math.max(...items.map((item) => item.count), 1);

    if (items.length === 0) {
      return <div style={{ ...mutedStyle, margin: '0 16px 14px' }}>No status timing data found.</div>;
    }

    return <div style={{ ...visualPanelStyle, margin: '0 16px 14px' }}>{items.map((item) => (
      <div key={item.name} style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '5px' }}>
          <span>{item.name}</span>
          <strong>{item.count} days</strong>
        </div>
        <div style={{ height: '8px', background: '#ebecf0', borderRadius: '999px', overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(6, Math.round((item.count / maxDays) * 100))}%`, height: '100%', background: '#ff991f' }} />
        </div>
        <div style={{ ...mutedStyle, marginTop: '4px' }}>{item.issueCount} issue{item.issueCount === 1 ? '' : 's'} currently in this status</div>
      </div>
    ))}</div>;
  };

  const renderCreatedResolvedTrend = (items) => {
    const recentItems = items;
    const maxTotal = Math.max(...recentItems.map((item) => item.created + item.resolved), 1);
    const chartHeight = 170;
    const axisBucketWidth = 74;
    const chartMinWidth = Math.max(560, recentItems.length * axisBucketWidth);
    const points = recentItems.map((item, index) => {
      const x = recentItems.length === 1 ? 0 : (index / (recentItems.length - 1)) * 100;
      const yCreated = 100 - ((item.created / maxTotal) * 100);
      const yResolved = 100 - ((item.resolved / maxTotal) * 100);
      return { ...item, x, yCreated, yResolved };
    });
    const createdPolyline = points.map(point => `${point.x},${point.yCreated}`).join(' ');
    const resolvedPolyline = points.map(point => `${point.x},${point.yResolved}`).join(' ');
    const createdArea = points.length > 0
      ? `0,100 ${createdPolyline} 100,100`
      : '';

    if (recentItems.length === 0) {
      return <div style={{ ...mutedStyle, margin: '0 16px 14px' }}>No created or resolved work found.</div>;
    }

    return (
      <div style={{ ...visualPanelStyle, margin: '0 16px 14px', padding: '18px' }}>
        {renderInlineVisualTitle(config.title, 'Custom Created Date vs Resolved Date')}
        <div style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: '4px' }}>
          <div style={{ minWidth: `${chartMinWidth}px` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr)', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: `${chartHeight}px`, color: '#7a869a', fontSize: '11px', textAlign: 'right' }}>
                {[maxTotal, Math.round(maxTotal * 0.75), Math.round(maxTotal * 0.5), Math.round(maxTotal * 0.25), 0].map(tick => <span key={tick}>{tick}</span>)}
              </div>
              <div style={{ position: 'relative', height: `${chartHeight}px`, borderLeft: '1px solid #dfe1e6', borderBottom: '1px solid #dfe1e6' }}>
                {[0, 25, 50, 75, 100].map(line => (
                  <div key={line} style={{ position: 'absolute', left: 0, right: 0, bottom: `${line}%`, borderTop: '1px solid #ebecf0' }} />
                ))}
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
                  <polygon points={createdArea} fill="rgba(222, 53, 11, 0.72)" stroke="none" />
                  <polyline points={createdPolyline} fill="none" stroke="#de350b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                  <polyline points={resolvedPolyline} fill="none" stroke="#36b37e" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                  {points.map((point) => (
                    <circle key={`${point.name}-resolved`} cx={point.x} cy={point.yResolved} r="1.2" fill="#36b37e" vectorEffect="non-scaling-stroke" />
                  ))}
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: '6px', padding: '0 8px', pointerEvents: 'none' }}>
                  {recentItems.map((item, index) => (
                    <div key={`${item.name}-bars`} style={{ flex: 1, minWidth: `${axisBucketWidth - 20}px`, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '2px', height: '100%' }}>
                      <div style={{ width: '32%', height: `${Math.max(2, Math.round((item.created / maxTotal) * chartHeight))}px`, background: 'rgba(222, 53, 11, 0.25)' }} />
                      <div style={{ width: '32%', height: `${Math.max(2, Math.round((item.resolved / maxTotal) * chartHeight))}px`, background: 'rgba(54, 179, 126, 0.35)' }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `34px repeat(${recentItems.length}, minmax(${axisBucketWidth - 14}px, 1fr))`, gap: '6px', marginTop: '10px', alignItems: 'start' }}>
              <span />
              {recentItems.map(item => (
                <div
                  key={`${item.name}-axis`}
                  title={item.name}
                  style={{
                    ...mutedStyle,
                    minHeight: '34px',
                    lineHeight: '14px',
                    textAlign: 'center',
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {item.name}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '14px', justifyContent: 'flex-start', marginTop: '10px', ...mutedStyle }}>
          <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#de350b', marginRight: '5px' }} />Created</span>
          <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#36b37e', marginRight: '5px' }} />Resolved</span>
        </div>
      </div>
    );
  };

  const renderReportSparkline = (items) => {
    const trendItems = (items || []).filter(item => item.created > 0 || item.resolved > 0).slice(-12);
    const maxTotal = Math.max(...trendItems.map(item => Math.max(item.created, item.resolved)), 1);

    if (trendItems.length === 0) {
      return <div style={{ ...mutedStyle, minHeight: '48px', display: 'flex', alignItems: 'center' }}>No custom date trend data found.</div>;
    }

    const points = trendItems.map((item, index) => {
      const x = trendItems.length === 1 ? 0 : (index / (trendItems.length - 1)) * 100;
      return {
        ...item,
        x,
        yCreated: 100 - ((item.created / maxTotal) * 100),
        yResolved: 100 - ((item.resolved / maxTotal) * 100),
      };
    });
    const createdLine = points.map(point => `${point.x},${point.yCreated}`).join(' ');
    const resolvedLine = points.map(point => `${point.x},${point.yResolved}`).join(' ');

    return (
      <div style={{ height: '54px', borderLeft: '1px solid #dfe1e6', borderBottom: '1px solid #dfe1e6', position: 'relative' }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <polyline points={createdLine} fill="none" stroke="#de350b" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <polyline points={resolvedLine} fill="none" stroke="#36b37e" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    );
  };

  const countIssuesForSummary = (items, field, fallback = 'None') => {
    const counts = (items || []).reduce((acc, issue) => {
      const key = issue[field] || fallback;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  };

  const renderSummaryPanel = (title, items = [], mode = 'trend') => {
    const trendItems = data.createdResolvedTrend || [];
    const maxValue = Math.max(...trendItems.map(item => Math.max(item.created || 0, item.resolved || 0)), 1);
    const createdPoints = trendItems.map((item, index) => {
      const x = trendItems.length <= 1 ? 0 : (index / (trendItems.length - 1)) * 100;
      const y = 100 - (((item.created || 0) / maxValue) * 100);
      return `${x},${y}`;
    }).join(' ');
    const resolvedPoints = trendItems.map((item, index) => {
      const x = trendItems.length <= 1 ? 0 : (index / (trendItems.length - 1)) * 100;
      const y = 100 - (((item.resolved || 0) / maxValue) * 100);
      return `${x},${y}`;
    }).join(' ');
    const barItems = (items || []).filter(item => item.count > 0).slice(0, 12);
    const barMax = Math.max(...barItems.map(item => item.count), 1);

    return (
      <div style={{ border: '1px solid #dfe1e6', borderRadius: '3px', background: '#ffffff', minHeight: '190px', padding: '12px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: '12px', fontWeight: 800, color: '#172b4d', marginBottom: '8px' }}>{title}</div>
        <div style={{ height: '132px', position: 'relative', borderLeft: '1px solid #6b778c', borderBottom: '1px solid #6b778c' }}>
          {[25, 50, 75].map(line => (
            <div key={line} style={{ position: 'absolute', left: 0, right: 0, bottom: `${line}%`, borderTop: '1px solid #dfe1e6' }} />
          ))}
          {mode === 'bars' ? (
            <div style={{ position: 'absolute', inset: '8px 10px 0', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
              {barItems.map(item => (
                <div key={item.name} title={`${item.name}: ${item.count}`} style={{ flex: 1, minWidth: '8px', height: `${Math.max(4, Math.round((item.count / barMax) * 100))}%`, background: '#b3d4ff' }} />
              ))}
            </div>
          ) : (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: '8px 10px 0 10px', width: 'calc(100% - 20px)', height: 'calc(100% - 8px)' }}>
              <polyline points={createdPoints} fill="none" stroke="#de350b" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <polyline points={resolvedPoints} fill="none" stroke="#36b37e" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </div>
        <div style={{ ...mutedStyle, textAlign: 'center', marginTop: '6px' }}>{mode === 'bars' ? 'Count of work items' : 'Work item custom date trend'}</div>
      </div>
    );
  };

  const renderGeneratedSummaryDashboard = () => {
    const normaliseFilterValue = value => String(value || 'none');
    const buildIssueOptions = (field, fallback) => {
      const names = Array.from(new Set(issues.map(issue => normaliseFilterValue(issue[field] || fallback)))).filter(Boolean).sort();
      return [
        { value: 'all', label: `All ${fallback.toLowerCase()}s` },
        ...names.map(name => ({ value: name, label: name })),
      ];
    };
    const creationDateOptions = [
      { value: 'all', label: 'All time' },
      { value: 'last-30-days', label: 'Last 30 days' },
      { value: 'last-90-days', label: 'Last 90 days' },
      { value: 'last-6-months', label: 'Last 6 months' },
    ];
    const generatedDate = new Date(`${config.generatedAt || new Date().toISOString().split('T')[0]}T00:00:00`);
    const creationDateCutoff = (() => {
      const cutoff = new Date(generatedDate);
      if (summaryFilters.creationDate === 'last-30-days') cutoff.setDate(cutoff.getDate() - 30);
      if (summaryFilters.creationDate === 'last-90-days') cutoff.setDate(cutoff.getDate() - 90);
      if (summaryFilters.creationDate === 'last-6-months') cutoff.setMonth(cutoff.getMonth() - 6);
      return summaryFilters.creationDate === 'all' ? null : cutoff;
    })();
    const filteredIssues = issues.filter(issue => {
      const created = issue.createdAt ? new Date(`${issue.createdAt}T00:00:00`) : null;
      return (summaryFilters.assignee === 'all' || normaliseFilterValue(issue.assignee || 'Unassigned') === summaryFilters.assignee)
        && (summaryFilters.issueType === 'all' || normaliseFilterValue(issue.issueType || 'Request type') === summaryFilters.issueType)
        && (summaryFilters.status === 'all' || normaliseFilterValue(issue.status || 'Status') === summaryFilters.status)
        && (summaryFilters.priority === 'all' || normaliseFilterValue(issue.priority || 'Priority') === summaryFilters.priority)
        && (!creationDateCutoff || (created && !Number.isNaN(created.getTime()) && created >= creationDateCutoff));
    });
    const openIssues = filteredIssues.filter(issue => issue.status !== 'Done');
    const doneIssues = filteredIssues.filter(issue => issue.status === 'Done');
    const highPriorityIssues = filteredIssues.filter(issue => ['Critical', 'Highest', 'High'].includes(issue.priority));
    const issueTypeItems = countIssuesForSummary(openIssues, 'issueType', 'Request type').sort((a, b) => b.count - a.count);
    const priorityItems = countIssuesForSummary(filteredIssues, 'priority', 'Priority').sort((a, b) => b.count - a.count);
    const statusItems = countIssuesForSummary(filteredIssues, 'status', 'Status').sort((a, b) => b.count - a.count);
    const today = new Date(`${config.generatedAt || new Date().toISOString().split('T')[0]}T00:00:00`);
    const durations = doneIssues.map(issue => {
      const start = issue.createdAt ? new Date(`${issue.createdAt}T00:00:00`) : null;
      const end = issue.resolvedAt ? new Date(`${issue.resolvedAt}T00:00:00`) : null;
      if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
      return Math.max(0, Math.round((end - start) / 86400000));
    }).filter(value => value !== null);
    const avgResolutionDays = durations.length === 0 ? 0 : Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
    const getIssueDurationDays = issue => {
      const start = issue.createdAt ? new Date(`${issue.createdAt}T00:00:00`) : null;
      const end = issue.resolvedAt ? new Date(`${issue.resolvedAt}T00:00:00`) : null;
      if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
      return Math.max(0, Math.round((end - start) / 86400000));
    };
    const isWithinSla = issue => {
      if (!issue.dueDate) return true;
      if (issue.status === 'Done') {
        return !issue.resolvedAt || issue.resolvedAt <= issue.dueDate;
      }
      return issue.dueDate >= (config.generatedAt || new Date().toISOString().split('T')[0]);
    };
    const slaMeasurableIssues = filteredIssues.filter(issue => issue.dueDate);
    const slaComplianceRate = slaMeasurableIssues.length === 0
      ? 0
      : Math.round((slaMeasurableIssues.filter(isWithinSla).length / slaMeasurableIssues.length) * 100);
    const firstContactEligibleIssues = doneIssues.filter(issue => {
      const typeName = String(issue.issueType || '').toLowerCase();
      return typeName.includes('incident') || typeName.includes('service request') || typeName.includes('request');
    });
    const firstContactResolvedIssues = firstContactEligibleIssues.filter(issue => {
      const resolutionDays = getIssueDurationDays(issue);
      const thresholdDays = ['Critical', 'Highest', 'High'].includes(issue.priority) ? 1 : 3;
      return resolutionDays !== null && resolutionDays <= thresholdDays;
    });
    const firstContactRate = firstContactEligibleIssues.length === 0
      ? 0
      : Math.round((firstContactResolvedIssues.length / firstContactEligibleIssues.length) * 100);
    const customerSatisfactionScore = (() => {
      if (filteredIssues.length === 0) return 0;
      const highPriorityOpen = filteredIssues.filter(issue => issue.status !== 'Done' && ['Critical', 'Highest', 'High'].includes(issue.priority)).length;
      const resolutionPenalty = Math.min(0.6, avgResolutionDays / 60);
      const priorityPenalty = Math.min(0.5, highPriorityOpen * 0.04);
      const score = 3.1 + (slaComplianceRate / 100) * 1.0 + (firstContactRate / 100) * 0.6 - resolutionPenalty - priorityPenalty;
      return Math.round(Math.max(2.8, Math.min(4.9, score)) * 10) / 10;
    })();
    const median = values => {
      if (!values.length) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
    };
    const ageByPriority = priorityItems.map(priority => {
      const ages = filteredIssues.filter(issue => issue.priority === priority.name).map(issue => {
        const start = issue.createdAt ? new Date(`${issue.createdAt}T00:00:00`) : null;
        if (!start || Number.isNaN(start.getTime()) || Number.isNaN(today.getTime())) return null;
        const end = issue.resolvedAt ? new Date(`${issue.resolvedAt}T00:00:00`) : today;
        if (Number.isNaN(end.getTime())) return null;
        return Math.max(0, Math.round((end - start) / 86400000));
      }).filter(value => value !== null);
      return { name: priority.name, count: median(ages) };
    });
    const slaItems = [
      { name: 'Within SLA', count: slaComplianceRate },
      { name: 'At risk or breached', count: Math.max(0, 100 - slaComplianceRate) },
    ];
    const firstContactItems = [
      { name: 'First contact', count: firstContactRate },
      { name: 'Follow-up needed', count: Math.max(0, 100 - firstContactRate) },
    ];
    const recentIssues = [...filteredIssues].sort((a, b) => String(b.resolvedAt || b.createdAt || '').localeCompare(String(a.resolvedAt || a.createdAt || ''))).slice(0, 4);
    const baseTrendItems = data.createdResolvedTrend || [];
    const trendMode = baseTrendItems.some(item => String(item.key || '').length === 7)
      ? 'month'
      : baseTrendItems.some(item => String(item.name || '').startsWith('Week of '))
        ? 'week'
        : 'day';
    const getSummaryTrendKey = dateValue => {
      const value = new Date(`${dateValue}T00:00:00.000Z`);
      if (!dateValue || Number.isNaN(value.getTime())) return null;
      if (trendMode === 'month') {
        return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
      }
      if (trendMode === 'week') {
        const day = value.getUTCDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        value.setUTCDate(value.getUTCDate() + mondayOffset);
        return value.toISOString().split('T')[0];
      }
      return value.toISOString().split('T')[0];
    };
    const summaryTrendItems = baseTrendItems.map(bucket => ({
      ...bucket,
      created: filteredIssues.filter(issue => getSummaryTrendKey(issue.createdAt) === bucket.key).length,
      resolved: filteredIssues.filter(issue => issue.status === 'Done' && getSummaryTrendKey(issue.resolvedAt) === bucket.key).length,
    }));
    const summaryFilterConfigs = [
      { id: 'assignee', label: 'Work item assignee', options: buildIssueOptions('assignee', 'Assignee') },
      { id: 'issueType', label: 'Request type', options: buildIssueOptions('issueType', 'Request type') },
      { id: 'status', label: 'Work item status', options: buildIssueOptions('status', 'Status') },
      { id: 'priority', label: 'Work item priority', options: buildIssueOptions('priority', 'Priority') },
      { id: 'creationDate', label: 'Work item creation date', options: creationDateOptions },
    ];
    const getSelectedFilterLabel = filter => (
      filter.options.find(option => option.value === summaryFilters[filter.id])?.label || filter.options[0]?.label || 'All'
    );
    const updateSummaryFilter = (id, value) => {
      setSummaryFilters(current => ({ ...current, [id]: value }));
      setOpenSummaryFilter(null);
      hideSummaryTooltip();
    };
    const resetSummaryFilters = () => {
      setSummaryFilters(defaultSummaryFilters);
      setOpenSummaryFilter(null);
      hideSummaryTooltip();
    };
    const summaryTooltipStyle = {
      ...chartTooltipStyle,
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      maxWidth: 'min(360px, calc(100% - 28px))',
      whiteSpace: 'pre-line',
      textAlign: 'left',
      zIndex: 5,
    };
    const showSummaryTooltip = label => setHoveredChartItem({ label });
    const hideSummaryTooltip = () => setHoveredChartItem(null);
    const formatSummaryValue = (value, unit = 'work item') => `${value} ${unit}${value === 1 ? '' : 's'}`;
    const panelTitleStyle = { fontSize: '12px', lineHeight: '16px', fontWeight: 700, color: '#172b4d', marginBottom: '8px' };
    const axisLabelStyle = { color: '#5e6c84', fontSize: '10px', fontWeight: 700, lineHeight: '12px' };
    const gadgetStyle = {
      background: '#ffffff',
      border: '1px solid #dfe1e6',
      borderRadius: '3px',
      minHeight: '232px',
      padding: '12px 14px',
      boxSizing: 'border-box',
      position: 'relative',
      overflow: 'hidden',
    };
    const filterButton = filter => {
      const selectedLabel = getSelectedFilterLabel(filter);
      const isDefaultValue = summaryFilters[filter.id] === defaultSummaryFilters[filter.id];
      const buttonText = isDefaultValue && filter.id !== 'creationDate'
        ? filter.label
        : `${filter.label}: ${selectedLabel}`;
      return (
        <div key={filter.id} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setOpenSummaryFilter(openSummaryFilter === filter.id ? null : filter.id)}
            style={{ height: '32px', border: '1px solid #dfe1e6', borderRadius: '3px', background: isDefaultValue ? '#ffffff' : '#deebff', color: '#172b4d', padding: '0 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
          >
            <span style={{ color: '#0052cc', fontWeight: 800 }}>v</span>{buttonText}
          </button>
          {openSummaryFilter === filter.id && (
            <div style={{ position: 'absolute', top: '36px', left: 0, zIndex: 10, minWidth: '220px', maxHeight: '240px', overflowY: 'auto', background: '#ffffff', border: '1px solid #dfe1e6', borderRadius: '3px', boxShadow: '0 8px 18px rgba(9,30,66,0.18)', padding: '6px' }}>
              {filter.options.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateSummaryFilter(filter.id, option.value)}
                  style={{ width: '100%', border: 0, background: summaryFilters[filter.id] === option.value ? '#deebff' : '#ffffff', color: '#172b4d', minHeight: '30px', padding: '6px 8px', textAlign: 'left', borderRadius: '3px', cursor: 'pointer', fontSize: '12px' }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    };
    const emptyChart = (title, yAxis, xAxis, options = {}) => (
      <div style={{ ...gadgetStyle, minHeight: options.tall ? '284px' : '232px' }}>
        <div style={panelTitleStyle}>{title}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: '10px', height: options.tall ? '228px' : '176px', alignItems: 'stretch' }}>
          <div style={{ ...axisLabelStyle, writingMode: 'vertical-rl', transform: 'rotate(180deg)', textAlign: 'center', alignSelf: 'center' }}>{yAxis}</div>
          <div style={{ position: 'relative', borderLeft: '1px solid #6b778c', borderBottom: '1px solid #6b778c' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(to right, #dfe1e6 1px, transparent 1px), linear-gradient(to bottom, #dfe1e6 1px, transparent 1px)', backgroundSize: '48px 100%, 100% 44px', opacity: 0.85 }} />
            {options.children}
          </div>
        </div>
        <div style={{ ...axisLabelStyle, textAlign: 'center', marginLeft: '38px', marginTop: '8px' }}>{xAxis}</div>
      </div>
    );
    const barChart = (title, items, yAxis, xAxis, color, options = {}) => {
      const visible = items.filter(item => item.count > 0).slice(0, options.maxItems || 7);
      const maxCount = Math.max(...visible.map(item => item.count), 1);
      const unit = options.unit || 'work item';
      return emptyChart(title, yAxis, xAxis, {
        tall: options.tall,
        children: visible.length > 0 && (
          <div style={{ position: 'absolute', inset: '10px 10px 0 10px', display: options.horizontal ? 'grid' : 'flex', gap: '8px', alignItems: options.horizontal ? 'center' : 'end' }}>
            {visible.map(item => {
              const size = Math.max(4, Math.round((item.count / maxCount) * 100));
              const label = `${title}\n${options.horizontal ? yAxis : xAxis}: ${item.name}\n${options.horizontal ? xAxis : yAxis}: ${formatSummaryValue(item.count, unit)}`;
              return (
                <div key={item.name} tabIndex="0" title={label} onMouseEnter={() => showSummaryTooltip(label)} onFocus={() => showSummaryTooltip(label)} onClick={() => showSummaryTooltip(label)} onBlur={hideSummaryTooltip} style={options.horizontal ? { display: 'grid', gridTemplateColumns: 'minmax(72px, 22%) minmax(0, 1fr)', alignItems: 'center', gap: '8px', outline: 'none', cursor: 'pointer' } : { flex: 1, minWidth: '16px', alignSelf: 'stretch', display: 'flex', alignItems: 'end', justifyContent: 'center', outline: 'none', cursor: 'pointer' }}>
                  {options.horizontal && <span style={{ ...axisLabelStyle, writingMode: 'initial', transform: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>}
                  <span style={options.horizontal ? { display: 'block', width: `${size}%`, height: '18px', background: color } : { display: 'block', width: '100%', height: `${size}%`, background: color }} />
                </div>
              );
            })}
          </div>
        ),
      });
    };
    const lineChart = (title, yAxis, xAxis, color, useResolved) => {
      const trend = summaryTrendItems.slice(-8);
      const metricMode = typeof useResolved === 'string'
        ? useResolved
        : useResolved
          ? 'resolution-time'
          : 'created-count';
      const bucketIssues = bucket => filteredIssues.filter(issue => (
        getSummaryTrendKey(metricMode === 'resolution-time' ? issue.resolvedAt : issue.createdAt) === bucket.key
      ));
      const bucketMetric = bucket => {
        const scopedIssues = bucketIssues(bucket);
        if (metricMode === 'satisfaction') {
          if (scopedIssues.length === 0) return customerSatisfactionScore;
          const scopedSla = scopedIssues.filter(isWithinSla).length / Math.max(scopedIssues.length, 1);
          const scopedDone = scopedIssues.filter(issue => issue.status === 'Done').length / Math.max(scopedIssues.length, 1);
          return Math.round(Math.max(2.8, Math.min(4.9, 3.0 + scopedSla + (scopedDone * 0.6))) * 10) / 10;
        }
        if (metricMode === 'resolution-time') {
          const scopedDurations = scopedIssues.map(getIssueDurationDays).filter(value => value !== null);
          return scopedDurations.length === 0
            ? avgResolutionDays
            : Math.round(scopedDurations.reduce((sum, value) => sum + value, 0) / scopedDurations.length);
        }
        return metricMode === 'resolved-count' ? bucket.resolved || 0 : bucket.created || 0;
      };
      const metricValues = trend.map(bucketMetric);
      const maxValue = Math.max(...metricValues, metricMode === 'satisfaction' ? 5 : avgResolutionDays || 1, 1);
      const pointData = trend.map((item, index) => {
        const x = trend.length === 1 ? 8 : 8 + ((index / (trend.length - 1)) * 84);
        const metric = metricValues[index] || 0;
        const y = 92 - ((metric / maxValue) * 76);
        const metricLabel = metricMode === 'satisfaction'
          ? `${metric}/5`
          : metricMode === 'resolution-time'
            ? `${metric} day${metric === 1 ? '' : 's'}`
            : formatSummaryValue(metric);
        return {
          x,
          y,
          metric,
          name: item.name,
          label: `${title}\n${xAxis}: ${item.name}\n${yAxis}: ${metricLabel}${metricMode === 'resolution-time' ? `\nOverall average time to resolution: ${avgResolutionDays} day${avgResolutionDays === 1 ? '' : 's'}` : ''}`,
        };
      });
      const points = pointData.map(point => `${point.x},${point.y}`).join(' ');
      return emptyChart(title, yAxis, xAxis, {
        children: points && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%' }}>
            <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {pointData.map(point => (
              <g key={`${title}-${point.name}`}>
                <circle cx={point.x} cy={point.y} r="1.6" fill={color} vectorEffect="non-scaling-stroke" />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="6"
                  fill="transparent"
                  stroke="transparent"
                  tabIndex="0"
                  onMouseEnter={() => showSummaryTooltip(point.label)}
                  onFocus={() => showSummaryTooltip(point.label)}
                  onClick={() => showSummaryTooltip(point.label)}
                  onBlur={hideSummaryTooltip}
                  style={{ cursor: 'pointer', outline: 'none' }}
                />
              </g>
            ))}
          </svg>
        ),
      });
    };
    const stackedChart = () => {
      const maxCount = Math.max(...priorityItems.map(item => item.count), ...statusItems.map(item => item.count), 1);
      return emptyChart('Priority and status breakdown', 'Work item status', 'Count of work items', {
        children: (
          <div style={{ position: 'absolute', inset: '12px 10px 0 10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(32px, 1fr))', gap: '8px', alignItems: 'end' }}>
            {priorityItems.slice(0, 6).map((item, index) => {
              const status = statusItems[index % Math.max(statusItems.length, 1)] || { name: 'Status', count: 0 };
              const priorityLabel = `Priority and status breakdown\nWork item priority: ${item.name}\nCount of work items: ${formatSummaryValue(item.count)}`;
              const statusLabel = `Priority and status breakdown\nWork item status: ${status.name}\nCount of work items: ${formatSummaryValue(status.count)}`;
              return (
                <div key={item.name} style={{ display: 'flex', gap: '3px', height: '100%', alignItems: 'end' }}>
                  <span tabIndex="0" title={priorityLabel} onMouseEnter={() => showSummaryTooltip(priorityLabel)} onFocus={() => showSummaryTooltip(priorityLabel)} onClick={() => showSummaryTooltip(priorityLabel)} onBlur={hideSummaryTooltip} style={{ flex: 1, height: `${Math.max(4, Math.round((item.count / maxCount) * 92))}%`, background: '#0052cc', cursor: 'pointer', outline: 'none' }} />
                  <span tabIndex="0" title={statusLabel} onMouseEnter={() => showSummaryTooltip(statusLabel)} onFocus={() => showSummaryTooltip(statusLabel)} onClick={() => showSummaryTooltip(statusLabel)} onBlur={hideSummaryTooltip} style={{ flex: 1, height: `${Math.max(4, Math.round((status.count / maxCount) * 92))}%`, background: '#36b37e', cursor: 'pointer', outline: 'none' }} />
                </div>
              );
            })}
          </div>
        ),
      });
    };
    const recentActivity = () => (
      <div style={{ ...gadgetStyle, minHeight: '232px' }}>
        <div style={panelTitleStyle}>Recent Activity</div>
        <div style={{ ...mutedStyle, marginBottom: '8px' }}>Today</div>
        <div style={{ display: 'grid', gap: '10px' }}>
          {recentIssues.length === 0 ? <div style={mutedStyle}>No recent activity.</div> : recentIssues.map((issue, index) => (
            <a
              key={issue.key}
              href={getIssueUrl(issue)}
              onClick={(event) => {
                event.preventDefault();
                router.open(getIssueUrl(issue)).catch(() => window.open(getIssueUrl(issue), '_blank', 'noopener,noreferrer'));
              }}
              title={`Open ${issue.key}: ${issue.summary}`}
              style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', gap: '8px', alignItems: 'start', color: 'inherit', textDecoration: 'none', cursor: 'pointer' }}
            >
              <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#deebff', color: '#0052cc', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>+</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '12px', color: '#172b4d' }}>Work item was updated {index + 3} minutes ago</div>
                <div style={{ fontSize: '12px', color: '#0052cc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline' }}>{issue.summary}</div>
                <div style={{ ...mutedStyle, color: '#0052cc' }}>{issue.key} - {issue.status}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    );

    return (
      <div onMouseLeave={clearChartTooltip} style={{ margin: '0', background: '#ffffff', color: '#172b4d', position: 'relative', overflow: 'visible' }}>
        {hoveredChartItem && <div style={summaryTooltipStyle}>{typeof hoveredChartItem === 'string' ? hoveredChartItem : hoveredChartItem.label}</div>}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #dfe1e6', background: '#ffffff' }}>
          {summaryFilterConfigs.map(filterButton)}
          <button type="button" onClick={resetSummaryFilters} style={{ border: 0, background: 'transparent', color: '#5e6c84', fontSize: '12px', marginLeft: '4px', cursor: 'pointer', padding: '6px 4px' }}>Reset to default</button>
        </div>
        <div style={{ padding: '22px 16px', background: '#ffffff', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
          {lineChart('Customer satisfaction', 'Average satisfaction rating', 'Generated lifecycle date', '#6554c0', 'satisfaction')}
          {lineChart('Average time to resolution', 'Average elapsed time in days', 'Work item resolution date', '#0052cc', 'resolution-time')}
          {barChart('First contact resolution rate', firstContactItems, '% of work items resolved on first contact', 'Request types', '#0052cc', { tall: true })}
          {barChart('Unresolved work items by request types', issueTypeItems, 'Request types', 'Count of work items', '#0052cc', { horizontal: true, tall: true })}
          {stackedChart()}
          {barChart('Median work item age by priority', ageByPriority, 'Median age of items (seconds)', 'Work item priority', '#0052cc', { unit: 'day' })}
          {barChart('SLA compliance', slaItems, '% of work items within SLA', 'SLA status', '#36b37e', { tall: true })}
          {recentActivity()}
        </div>
      </div>
    );
  };

  const renderGeneratedReports = () => {
    const reportFilters = config.reportFilters || [];
    const fallbackBaseJql = (config.allWorkJql || config.jql || '').replace(/\s+ORDER\s+BY\s+.+$/i, '').trim();
    const fallbackReportUrl = (suffix) => fallbackBaseJql
      ? `/issues/?jql=${encodeURIComponent(`${fallbackBaseJql}${suffix}`)}`
      : data.drilldowns?.allWork?.url;
    const findReport = (type) => reportFilters.find(report => report.reportType === type);
    const completedTrendReport = findReport('Completed Trend');
    const urgentWorkReport = findReport('Urgent Work');
    const doneIssues = issues.filter(issue => issue.status === 'Done');
    const openIssues = issues.filter(issue => issue.status !== 'Done');
    const highPriorityIssues = issues.filter(issue => ['Highest', 'Critical', 'High'].includes(issue.priority));
    const serviceRequestIssues = issues.filter(issue => String(issue.issueType || '').toLowerCase().includes('service request'));
    const incidentIssues = issues.filter(issue => String(issue.issueType || '').toLowerCase().includes('incident') || String(issue.issueType || '').toLowerCase().includes('bug'));
    const problemIssues = issues.filter(issue => String(issue.issueType || '').toLowerCase().includes('problem'));
    const changeIssues = issues.filter(issue => String(issue.issueType || '').toLowerCase().includes('change'));
    const serviceMetrics = data.serviceMetrics || {};
    const getResolutionDays = issue => {
      const start = issue.createdAt ? new Date(`${issue.createdAt}T00:00:00`) : null;
      const end = issue.resolvedAt ? new Date(`${issue.resolvedAt}T00:00:00`) : null;
      if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
      return Math.max(0, Math.round((end - start) / 86400000));
    };
    const isWithinSla = issue => {
      if (!issue.dueDate) return true;
      if (issue.status === 'Done') {
        return !issue.resolvedAt || issue.resolvedAt <= issue.dueDate;
      }
      return issue.dueDate >= (config.generatedAt || new Date().toISOString().split('T')[0]);
    };
    const slaMeasuredIssues = issues.filter(issue => issue.dueDate);
    const slaMetCount = slaMeasuredIssues.filter(isWithinSla).length;
    const slaBreachedCount = Math.max(0, slaMeasuredIssues.length - slaMetCount);
    const slaComplianceRate = serviceMetrics.slaCompliancePercent ?? (slaMeasuredIssues.length === 0 ? 0 : Math.round((slaMetCount / slaMeasuredIssues.length) * 100));
    const firstContactRate = serviceMetrics.firstContactResolutionRate ?? (() => {
      const eligible = doneIssues.filter(issue => {
        const typeName = String(issue.issueType || '').toLowerCase();
        return typeName.includes('incident') || typeName.includes('service request') || typeName.includes('request');
      });
      const resolvedFast = eligible.filter(issue => {
        const duration = getResolutionDays(issue);
        return duration !== null && duration <= (['Highest', 'Critical', 'High'].includes(issue.priority) ? 1 : 3);
      });
      return eligible.length === 0 ? 0 : Math.round((resolvedFast.length / eligible.length) * 100);
    })();
    const customerSatisfactionScore = serviceMetrics.customerSatisfactionScore ?? (() => {
      if (issues.length === 0) return 0;
      const durations = doneIssues.map(getResolutionDays).filter(value => value !== null);
      const average = durations.length === 0 ? 0 : durations.reduce((sum, value) => sum + value, 0) / durations.length;
      const score = 3.2 + (slaComplianceRate / 100) * 0.9 + (firstContactRate / 100) * 0.5 - Math.min(0.7, average / 50);
      return Math.round(Math.max(2.8, Math.min(4.9, score)) * 10) / 10;
    })();
    const avgResolutionDays = (() => {
      if (serviceMetrics.averageTimeToResolutionDays !== undefined) return `${serviceMetrics.averageTimeToResolutionDays}d`;
      const durations = doneIssues.map(getResolutionDays).filter(value => value !== null);
      return durations.length === 0 ? 'N/A' : `${Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)}d`;
    })();
    const deflectedRate = issues.length === 0
      ? 0
      : Math.round(Math.min(72, Math.max(18, ((serviceRequestIssues.length + problemIssues.length) / Math.max(issues.length, 1)) * 100 + 12)));
    const reportCatalog = [
      {
        section: 'Default',
        reports: [
          { id: 'workload', title: 'Workload', value: openIssues.length, type: 'bars', detail: 'Open work by assignee from generated Jira data.' },
          { id: 'satisfaction', title: 'Satisfaction', value: customerSatisfactionScore ? `${customerSatisfactionScore}/5` : '0/5', type: 'rating', detail: 'Generated CSAT proxy from custom lifecycle dates, SLA compliance, and first-contact resolution.' },
          { id: 'requests-deflected', title: 'Requests deflected', value: `${deflectedRate}%`, type: 'line', detail: 'Generated knowledge-deflection proxy from request mix and knowledge-base setup.' },
          { id: 'requests-resolved', title: 'Requests resolved', value: doneIssues.length, type: 'line-check', detail: 'Resolved count from generated custom Resolved Date values.' },
          { id: 'atlassian-analytics', title: 'Atlassian Analytics', value: issues.length, type: 'analytics', detail: 'Generated project totals and trend signals.' },
        ],
      },
      {
        section: 'Custom',
        reports: [
          {
            id: 'created-resolved',
            title: 'Created vs Resolved',
            value: `${issues.length}/${doneIssues.length}`,
            type: 'analytics',
            detail: 'Custom Created Date and Resolved Date trend.',
            url: completedTrendReport?.viewUrl || fallbackReportUrl(''),
            hasSavedReportFilter: Boolean(completedTrendReport?.viewUrl),
            customDateFilterApplied: completedTrendReport?.customDateFilterApplied,
          },
          { id: 'time-resolution', title: 'Time to resolution', value: avgResolutionDays, type: 'analytics', detail: 'Custom Created Date to custom Resolved Date duration.' },
          {
            id: 'sla-met-breached',
            title: 'SLA met vs breached',
            value: `${slaMetCount}/${slaBreachedCount}`,
            type: 'analytics',
            detail: 'SLA met and breached from generated due dates, custom Created Date, and custom Resolved Date.',
            url: urgentWorkReport?.viewUrl || fallbackReportUrl(' AND priority in (Highest, High, Critical)'),
            hasSavedReportFilter: Boolean(urgentWorkReport?.viewUrl),
            customDateFilterApplied: urgentWorkReport?.customDateFilterApplied,
          },
          { id: 'incidents-priority', title: 'Incidents by priority', value: incidentIssues.length, type: 'analytics', detail: 'Incident and defect mix by priority.' },
          { id: 'sla-success-rate', title: 'SLA success rate', value: `${slaComplianceRate}%`, type: 'analytics', detail: 'Generated SLA success using due date and custom lifecycle fields.' },
          { id: 'service-requests', title: 'Service requests', value: serviceRequestIssues.length, type: 'analytics', detail: 'Generated service request volume.' },
          { id: 'problems-priority', title: 'Problems by priority', value: problemIssues.length, type: 'analytics', detail: 'Problem records grouped by priority.' },
          { id: 'change-type', title: 'Change by type', value: changeIssues.length, type: 'analytics', detail: 'Generated change records and delivery change work.' },
        ],
      },
    ];
    const allReports = reportCatalog.flatMap(section => section.reports.map(report => ({ ...report, section: section.section })));
    const selectedReport = selectedGeneratedReport
      ? allReports.find(report => report.id === selectedGeneratedReport) || allReports[0]
      : null;
    const search = reportSearchTerm.trim().toLowerCase();
    const filteredCatalog = reportCatalog.map(section => ({
      ...section,
      reports: section.reports.filter(report => report.title.toLowerCase().includes(search)),
    })).filter(section => section.reports.length > 0);

    const countBy = (items, field, fallback = 'None') => {
      const counts = items.reduce((acc, issue) => {
        const key = issue[field] || fallback;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      return Object.entries(counts).map(([name, count]) => ({ name, count }));
    };
    const fallbackItems = (items, field = 'status', fallback = 'Unknown') => {
      const source = items.length > 0 ? items : issues;
      const counted = countBy(source, field, fallback);
      return counted.length > 0 ? counted : [{ name: 'Generated demo data', count: 1 }];
    };
    const getReportItems = (report) => {
      if (report.id === 'workload') return fallbackItems(openIssues, 'assignee', 'Unassigned');
      if (report.id === 'satisfaction') return [
        { name: 'CSAT score', count: Math.round(customerSatisfactionScore * 20) },
        { name: 'Opportunity gap', count: Math.max(0, 100 - Math.round(customerSatisfactionScore * 20)) },
      ];
      if (report.id === 'requests-deflected') return [
        { name: 'Deflected by KB', count: deflectedRate },
        { name: 'Agent assisted', count: Math.max(0, 100 - deflectedRate) },
      ];
      if (report.id === 'incidents-priority') return fallbackItems(incidentIssues, 'priority', 'None');
      if (report.id === 'problems-priority') return fallbackItems(problemIssues, 'priority', 'None');
      if (report.id === 'change-type') return fallbackItems(changeIssues, 'status', 'Unknown');
      if (report.id === 'service-requests') return fallbackItems(serviceRequestIssues, 'status', 'Unknown');
      if (report.id === 'sla-met-breached') return [
        { name: 'Met', count: slaMetCount },
        { name: 'Breached risk', count: slaBreachedCount },
      ];
      if (report.id === 'sla-success-rate') return [
        { name: 'Within SLA', count: slaComplianceRate },
        { name: 'At risk', count: Math.max(0, 100 - slaComplianceRate) },
      ];
      if (report.id === 'requests-resolved') return fallbackItems(doneIssues, 'status', 'Done');
      return fallbackItems(issues, 'status', 'Unknown');
    };
    const getReportLinkLabel = (report) => (
      report.hasSavedReportFilter ? 'Open saved filter' : 'Open issue search'
    );
    const getReportLinkNote = (report) => {
      if (!report.hasSavedReportFilter) {
        return 'Issue search uses Jira-native JQL; chart uses custom date fields';
      }

      return report.customDateFilterApplied === false
        ? 'Saved filter uses Jira-native JQL; chart uses custom date fields'
        : 'Saved filter uses generated custom date-field JQL';
    };

    const renderReportThumbnail = (type) => (
      <div style={{ height: '78px', background: type === 'analytics' ? '#deebff' : '#eae6ff', borderBottom: '1px solid #dfe1e6', padding: '12px 14px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: '7px', marginBottom: '12px' }}>
          <span style={{ width: '32px', height: '8px', borderRadius: '4px', background: '#ffffff', opacity: 0.85 }} />
          <span style={{ width: '12px', height: '8px', borderRadius: '4px', background: '#ffffff', opacity: 0.65 }} />
          <span style={{ width: '12px', height: '8px', borderRadius: '4px', background: '#ffffff', opacity: 0.65 }} />
        </div>
        {type === 'rating' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', alignItems: 'end' }}>
            <div style={{ height: '8px', background: '#ffffff', borderRadius: '4px' }} />
            <div style={{ color: '#8777d9', letterSpacing: '2px', fontWeight: 800 }}>***</div>
            <div style={{ height: '8px', background: '#ffffff', borderRadius: '4px' }} />
            <div style={{ color: '#8777d9', letterSpacing: '2px', fontWeight: 800 }}>*****</div>
          </div>
        ) : type === 'line' || type === 'line-check' ? (
          <svg viewBox="0 0 120 42" preserveAspectRatio="none" style={{ width: '100%', height: '42px' }}>
            <polyline points={type === 'line' ? '0,16 35,16 70,30 120,30' : '0,30 35,30 70,16 120,16'} fill="none" stroke="#9f8fef" strokeWidth="4" />
            {type === 'line-check' && <circle cx="104" cy="28" r="7" fill="#9f8fef" />}
          </svg>
        ) : (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'end', height: '42px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#b3d4ff' }} />
            {[14, 22, 34, 26].map((height, index) => <span key={height + index} style={{ width: '13px', height: `${height}px`, background: '#b3d4ff', borderRadius: '2px 2px 0 0' }} />)}
          </div>
        )}
      </div>
    );

    const renderReportTile = (report) => (
      <button
        key={report.id}
        type="button"
        onClick={() => setSelectedGeneratedReport(report.id)}
        style={{
          padding: 0,
          border: '1px solid #dfe1e6',
          borderRadius: '3px',
          background: '#ffffff',
          textAlign: 'left',
          cursor: 'pointer',
          overflow: 'hidden',
          minHeight: '112px',
        }}
      >
        {renderReportThumbnail(report.type)}
        <div style={{ padding: '9px 10px', fontWeight: 700, fontSize: '12px', color: '#172b4d' }}>{report.title}</div>
      </button>
    );

    if (selectedReport) {
      const detailItems = getReportItems(selectedReport);
      const detailIssues = selectedReport.id === 'service-requests'
        ? serviceRequestIssues
        : selectedReport.id === 'incidents-priority'
          ? incidentIssues
          : selectedReport.id === 'problems-priority'
            ? problemIssues
            : selectedReport.id === 'change-type'
              ? changeIssues
              : selectedReport.id === 'requests-resolved' || selectedReport.id === 'time-resolution'
                ? doneIssues
                : issues;
      const visibleDetailIssues = detailIssues.length > 0 ? detailIssues : issues;

      return (
        <div style={{ margin: '0 16px 14px' }}>
          <button
            type="button"
            onClick={() => setSelectedGeneratedReport(null)}
            style={{ border: '1px solid #dfe1e6', background: '#ffffff', borderRadius: '3px', padding: '7px 10px', cursor: 'pointer', marginBottom: '12px', color: '#172b4d' }}
          >
            Back to reports
          </button>
          <div style={{ ...visualPanelStyle, padding: '18px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'start', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#172b4d' }}>{selectedReport.title}</div>
                <div style={{ ...mutedStyle, marginTop: '4px' }}>{selectedReport.detail}</div>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#0052cc' }}>{selectedReport.value}</div>
            </div>
            {selectedReport.id === 'created-resolved'
              ? renderCreatedResolvedTrend(data.createdResolvedTrend || [])
              : selectedReport.id === 'time-resolution'
                ? renderAverageTimeBars(data.averageTimeInStatus || [])
                : renderHorizontalBars(detailItems, 'No report data found.', 'reports')}
            <div style={{ display: 'flex', gap: '14px', justifyContent: 'flex-start', marginTop: '10px', ...mutedStyle }}>
              <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#de350b', marginRight: '5px' }} />Created Date</span>
              <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#36b37e', marginRight: '5px' }} />Resolved Date</span>
            </div>
          </div>
          {selectedReport.url && renderDrilldownLink(selectedReport.url, (
            <div style={{ ...compactRowStyle, border: '1px solid #dfe1e6', marginBottom: '12px', cursor: 'pointer' }}>
              <strong>{getReportLinkLabel(selectedReport)}</strong>
              <span style={mutedStyle}>{getReportLinkNote(selectedReport)}</span>
            </div>
          ), { display: 'block' })}
          {renderIssueCards(visibleDetailIssues, 'No matching work found.')}
        </div>
      );
    }

    return (
      <div style={{ margin: '0 16px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
          <input
            type="search"
            value={reportSearchTerm}
            onChange={event => setReportSearchTerm(event.target.value)}
            placeholder="Search for reports"
            style={{ width: '248px', maxWidth: '100%', border: '1px solid #dfe1e6', borderRadius: '3px', padding: '8px 10px', fontSize: '13px' }}
          />
          <button
            type="button"
            onClick={() => setReportListView(!reportListView)}
            style={{ border: '1px solid #dfe1e6', background: '#ffffff', borderRadius: '3px', padding: '8px 10px', cursor: 'pointer', color: '#172b4d' }}
          >
            {reportListView ? 'Switch to card view' : 'Switch to list view'}
          </button>
        </div>
        {filteredCatalog.map(section => (
          <div key={section.section} style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '8px', color: '#172b4d' }}>{section.section}</div>
            <div style={reportListView
              ? { display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }
              : { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(142px, 1fr))', gap: '10px' }}
            >
              {section.reports.map(report => reportListView ? (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setSelectedGeneratedReport(report.id)}
                  style={{ ...compactRowStyle, border: '1px solid #dfe1e6', background: '#ffffff', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontWeight: 700 }}>{report.title}</span>
                  <span style={mutedStyle}>{report.value}</span>
                </button>
              ) : renderReportTile(report))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderSprintHealthPanel = (health, activeSprintNames) => {
    const total = Math.max(health.total || 0, 1);
    const todo = health.todo || 0;
    const inProgress = health.inProgress || 0;
    const done = health.done || 0;
    const completionPercent = Math.round((done / total) * 100);
    const activePercent = Math.round(((inProgress + done) / total) * 100);
    const blockers = issues.filter(issue => issue.status !== 'Done' && ['Highest', 'Critical', 'High'].includes(issue.priority)).length;
    const flagged = issues.filter(issue => ['Highest', 'Critical'].includes(issue.priority)).length;
    const assignees = Array.from(new Set(issues.map(issue => issue.assignee).filter(Boolean))).slice(0, 6);

    return (
      <div style={{ margin: '0 16px 14px', border: '1px solid #dfe1e6', background: '#ffffff' }}>
        <div style={{ padding: '22px 22px 18px', borderBottom: '1px solid #dfe1e6' }}>
          <div style={{ fontSize: '34px', lineHeight: '42px', color: '#172b4d' }}>
            Sprint <span style={{ color: '#7a869a' }}>- {activeSprintNames}</span>
          </div>
        </div>
        <div style={{ padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', alignItems: 'center', marginBottom: '18px' }}>
            <div style={{ fontSize: '20px', fontWeight: 800 }}>Overall sprint progress <span style={{ fontWeight: 400 }}>(Work Items)</span></div>
            <div style={{ color: '#7a869a', fontSize: '20px', fontWeight: 800 }}>active</div>
          </div>
          {renderDrilldownLink(data.drilldowns?.allWork?.url, (
            <div style={{ display: 'flex', height: '64px', borderRadius: '4px', overflow: 'hidden', cursor: 'pointer' }}>
              <div style={{ flex: Math.max(todo, 0.1), background: '#4f6f91', color: '#ffffff', display: 'flex', alignItems: 'center', paddingLeft: '14px', fontSize: '20px', fontWeight: 800 }}>{todo}</div>
              <div style={{ flex: Math.max(inProgress, 0.1), background: '#ffcb2f', color: '#172b4d', display: 'flex', alignItems: 'center', paddingLeft: '14px', fontSize: '20px', fontWeight: 800 }}>{inProgress}</div>
              <div style={{ flex: Math.max(done, 0.1), background: '#008c2e', color: '#ffffff', display: 'flex', alignItems: 'center', paddingLeft: '14px', fontSize: '20px', fontWeight: 800 }}>{done}</div>
            </div>
          ), { display: 'block' })}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '14px', marginTop: '20px', textAlign: 'center' }}>
            {[
              { value: `${activePercent}%`, label: 'Time elapsed' },
              { value: `${completionPercent}%`, label: 'Work complete' },
              { value: '0%', label: 'Scope change' },
              { value: blockers, label: 'Blocker' },
              { value: flagged, label: 'Flagged' },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontSize: '28px', lineHeight: '32px', color: '#172b4d' }}>{item.value}</div>
                <div style={{ fontSize: '15px', marginTop: '5px' }}>{item.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '22px' }}>
            <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '12px' }}>Assignees in Sprint</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {assignees.length === 0
                ? <span style={mutedStyle}>No assignees found.</span>
                : assignees.map((assignee, index) => (
                  <div key={assignee} title={assignee} style={{ width: '42px', height: '42px', borderRadius: '4px', background: chartColors[index % chartColors.length], color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                    {assignee.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const getIssueRiskColor = (issue) => {
    if (['Highest', 'Critical'].includes(issue.priority)) return '#de350b';
    if (issue.priority === 'High') return '#ff991f';
    if (issue.status === 'Done') return '#00875a';
    return '#0052cc';
  };

  const getIssueUrl = (issue) => `/browse/${issue.key}`;

  const getIssueTypeIcon = (issueType = '') => {
    const normalized = issueType.toLowerCase();

    if (normalized.includes('bug') || normalized.includes('incident')) {
      return normalized.includes('incident')
        ? { icon: 'incident', color: '#de350b' }
        : { icon: 'bug', color: '#de350b' };
    }

    if (normalized.includes('story') || normalized.includes('service request')) {
      return normalized.includes('service request')
        ? { icon: 'service-request', color: '#00875a' }
        : { icon: 'story', color: '#36b37e' };
    }

    if (normalized.includes('task')) {
      return { icon: 'task', color: '#0052cc' };
    }

    if (normalized.includes('epic')) {
      return { icon: 'epic', color: '#6554c0' };
    }

    if (normalized.includes('change')) {
      return { icon: 'change', color: '#ff8b00' };
    }

    if (normalized.includes('problem')) {
      return { icon: 'problem', color: '#bf2600' };
    }

    return { icon: 'work-item', color: '#42526e' };
  };

  const renderIssueTypeIcon = (issueType) => {
    const issueTypeIcon = getIssueTypeIcon(issueType);
    const commonProps = {
      width: 18,
      height: 18,
      viewBox: '0 0 18 18',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      role: 'img',
      'aria-label': issueType || 'Work item',
      style: { display: 'block' },
    };

    const strokeProps = {
      stroke: issueTypeIcon.color,
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    };

    if (issueTypeIcon.icon === 'story') {
      return (
        <svg {...commonProps}>
          <path d="M5 3.5h8v11l-4-2.7-4 2.7v-11z" {...strokeProps} />
        </svg>
      );
    }

    if (issueTypeIcon.icon === 'bug') {
      return (
        <svg {...commonProps}>
          <circle cx="9" cy="9.5" r="3.2" {...strokeProps} />
          <path d="M6.8 5.6 5.6 4.3M11.2 5.6l1.2-1.3M5.5 8H3.8M14.2 8h-1.7M5.8 12.2l-1.5 1.1M12.2 12.2l1.5 1.1M9 6.2V14" {...strokeProps} />
        </svg>
      );
    }

    if (issueTypeIcon.icon === 'task') {
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="3.5" width="11" height="11" rx="2" {...strokeProps} />
          <path d="m6.3 9.1 1.9 1.9 3.7-4" {...strokeProps} />
        </svg>
      );
    }

    if (issueTypeIcon.icon === 'epic') {
      return (
        <svg {...commonProps}>
          <path d="M10.2 2.7 4.4 9.7h3.8l-.8 5.6 6.2-7.7H9.7l.5-4.9z" {...strokeProps} />
        </svg>
      );
    }

    if (issueTypeIcon.icon === 'incident') {
      return (
        <svg {...commonProps}>
          <path d="M9 3.2 15.3 14H2.7L9 3.2z" {...strokeProps} />
          <path d="M9 7v3.2M9 12.6h.1" {...strokeProps} />
        </svg>
      );
    }

    if (issueTypeIcon.icon === 'change') {
      return (
        <svg {...commonProps}>
          <path d="M4 6.2h8.5l-2-2M14 11.8H5.5l2 2" {...strokeProps} />
        </svg>
      );
    }

    if (issueTypeIcon.icon === 'problem') {
      return (
        <svg {...commonProps}>
          <circle cx="9" cy="9" r="5.8" {...strokeProps} />
          <path d="m5.2 12.8 7.6-7.6" {...strokeProps} />
        </svg>
      );
    }

    if (issueTypeIcon.icon === 'service-request') {
      return (
        <svg {...commonProps}>
          <path d="M4.2 10.2V8.4a4.8 4.8 0 0 1 9.6 0v1.8M4.2 10.2h2.1v3H4.2v-3zM11.7 10.2h2.1v3h-2.1v-3zM11.5 14.2H9.4" {...strokeProps} />
        </svg>
      );
    }

    return (
      <svg {...commonProps}>
        <rect x="3.5" y="3.5" width="11" height="11" rx="2" {...strokeProps} />
        <path d="M6.2 7h5.6M6.2 9.5h5.6M6.2 12h3.4" {...strokeProps} />
      </svg>
    );
  };

  const renderPriorityIcon = (priority) => {
    const priorityName = priority || 'Priority';
    const normalized = priorityName.toLowerCase();
    const isCritical = normalized === 'critical';
    const isHighest = normalized === 'highest';
    const isHigh = normalized === 'high';
    const isMedium = normalized === 'medium';
    const isLow = normalized === 'low';
    const isLowest = normalized === 'lowest';
    const isInformational = normalized === 'informational';
    const color = (isCritical || isHighest || isHigh)
      ? '#ff5630'
      : isMedium
        ? '#ff8b00'
        : (isLow || isLowest || isInformational)
          ? '#0065ff'
          : '#42526e';

    const commonProps = {
      width: 18,
      height: 18,
      viewBox: '0 0 18 18',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      role: 'img',
      'aria-label': `Priority: ${priorityName}`,
      style: { display: 'block' },
    };

    const strokeProps = {
      stroke: color,
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    };

    if (isCritical) {
      return (
        <svg {...commonProps}>
          <circle cx="9" cy="9" r="6.2" {...strokeProps} />
          <path d="M5.8 9h6.4" {...strokeProps} />
        </svg>
      );
    }

    if (isHighest) {
      return (
        <svg {...commonProps}>
          <path d="m5 10 4-4 4 4" {...strokeProps} />
          <path d="m5 14 4-4 4 4" {...strokeProps} />
        </svg>
      );
    }

    if (isHigh) {
      return (
        <svg {...commonProps}>
          <path d="m5 11 4-4 4 4" {...strokeProps} />
        </svg>
      );
    }

    if (isMedium) {
      return (
        <svg {...commonProps}>
          <path d="M5.5 7.4h7M5.5 10.6h7" {...strokeProps} />
        </svg>
      );
    }

    if (isLow) {
      return (
        <svg {...commonProps}>
          <path d="m5 7 4 4 4-4" {...strokeProps} />
        </svg>
      );
    }

    if (isLowest) {
      return (
        <svg {...commonProps}>
          <path d="m5 5 4 4 4-4" {...strokeProps} />
          <path d="m5 9 4 4 4-4" {...strokeProps} />
        </svg>
      );
    }

    if (isInformational) {
      return (
        <svg {...commonProps}>
          <path d="m5 4 4 4 4-4" {...strokeProps} />
          <path d="m5 8 4 4 4-4" {...strokeProps} />
          <path d="m5 12 4 4 4-4" {...strokeProps} />
        </svg>
      );
    }

    return (
      <svg {...commonProps}>
        <circle cx="9" cy="9" r="3.2" fill={color} />
      </svg>
    );
  };

  const renderIssueCards = (items, emptyMessage) => {
    if (items.length === 0) {
      return <div style={{ ...mutedStyle, margin: '0 16px 14px' }}>{emptyMessage}</div>;
    }

    const visibleItems = items.slice(0, 10);

    return (
      <div style={{ margin: '0 16px 14px', border: '1px solid #dfe1e6', borderRadius: '3px', overflowX: 'auto', overflowY: 'hidden', background: '#ffffff' }}>
        <div style={{ minWidth: '660px' }}>
        <div style={{ background: '#2f75b5', color: '#ffffff', padding: '4px 8px', fontSize: '11px', fontWeight: 800 }}>
          {config.title || 'Assigned To Me'}
        </div>
        <div style={tableHeaderStyle}>
          <span>Type</span>
          <span>Key</span>
          <span>Summary</span>
          <span style={{ textAlign: 'center' }}>P</span>
        </div>
        {visibleItems.map(issue => {
          return (
            <a
              key={issue.key}
              href={getIssueUrl(issue)}
              onClick={(event) => {
                event.preventDefault();
                router.open(getIssueUrl(issue)).catch(() => window.open(getIssueUrl(issue), '_blank', 'noopener,noreferrer'));
              }}
              style={tableRowStyle}
            >
              <span
                title={issue.issueType}
                style={{
                  justifySelf: 'center',
                  width: '22px',
                  height: '22px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {renderIssueTypeIcon(issue.issueType)}
              </span>
              <span style={{ color: '#0052cc', fontWeight: 800, fontSize: '12px' }}>{issue.key}</span>
              <span title={`${issue.issueType} - ${issue.status} - ${issue.priority} - ${issue.assignee}`} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0052cc', fontSize: '12px', lineHeight: '18px' }}>
                {issue.summary}
                <span style={{ color: '#5e6c84' }}> - {issue.status}</span>
              </span>
              <span
                title={issue.priority}
                aria-label={`Priority: ${issue.priority}`}
                style={{
                  color: getIssueRiskColor(issue),
                  textAlign: 'center',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '22px',
                  justifySelf: 'center',
                }}
              >
                {renderPriorityIcon(issue.priority)}
              </span>
            </a>
          );
        })}
        </div>
      </div>
    );
  };

  const getReadableViewPurpose = () => {
    if (viewType === 'environment') {
      return 'Top-level KPIs for health, SLA risk, delivery, and completion.';
    }
    if (viewType === 'summary') {
      return 'Replicates the service project summary using generated custom Created Date and Resolved Date fields.';
    }
    if (viewType === 'created-resolved') {
      return 'Trend uses generated Created Date and Resolved Date demo values, preferring the custom fields when Jira allows them.';
    }
    if (viewType === 'status') {
      return 'Shows where work is sitting across the workflow so bottlenecks are visible.';
    }
    if (viewType === 'priority') {
      return 'Shows risk mix so high-priority work is easy to spot.';
    }
    if (viewType === 'reports') {
      return 'Shows generated report drilldowns using the generated Created Date and Resolved Date demo values.';
    }
    if (viewType === 'open-work') {
      return 'Lists the records that need follow-up; click any ticket to open it.';
    }
    if (viewType === 'escalations') {
      return 'Highlights SLA breach, near-breach, and high-priority pressure.';
    }
    if (viewType === 'ticket-aging') {
      return 'Groups open work by age to show stale or delayed items.';
    }
    if (viewType === 'average-time-status') {
      return 'Shows how long work has stayed in each current status.';
    }
    if (viewType === 'sprint-health') {
      return 'Summarizes sprint completion, active work, blockers, and assignees.';
    }
    if (viewType === 'sprint-burndown') {
      return 'Shows remaining sprint work by status for commitment tracking.';
    }
    if (viewType === 'roadmap') {
      return 'Shows upcoming releases and dates that may need attention.';
    }
    if (viewType === 'projects') {
      return 'Compares work volume across projects or teams.';
    }
    return 'Shows generated Jira demo data for this dashboard section.';
  };

  const getReadableAction = () => {
    if (viewType === 'created-resolved') {
      return 'Created higher than resolved means demand is outpacing completion.';
    }
    if (viewType === 'summary') {
      return 'Use the custom-date fluctuations to explain generated work intake and completion over time.';
    }
    if (viewType === 'priority') {
      return 'Start with Critical, Highest, and High items first.';
    }
    if (viewType === 'status') {
      return 'Large In Progress or Waiting columns indicate workflow pressure.';
    }
    if (viewType === 'escalations') {
      return 'Review breached and near-breach tickets before healthy work.';
    }
    if (viewType === 'reports') {
      return 'Open a report card to inspect the saved filter behind that trend.';
    }
    if (viewType === 'open-work') {
      return 'Open a row to inspect the source Jira ticket.';
    }
    if (viewType === 'ticket-aging') {
      return 'Investigate the oldest bands before newer work.';
    }
    if (viewType === 'sprint-health' || viewType === 'sprint-burndown') {
      return 'Use this to decide whether the sprint is still on track.';
    }
    if (viewType === 'roadmap') {
      return 'Use this to confirm release readiness and upcoming milestones.';
    }
    if (viewType === 'projects') {
      return 'Use higher-volume projects to identify capacity or demand hotspots.';
    }
    return 'Use the chart and drilldowns to identify where attention is needed.';
  };

  const renderVisualSummary = () => {
    const metricNames = (config.dashboardMetrics || []).slice(0, 3);
    const kpiNames = (config.dashboardKpis || []).slice(0, 3);

    return (
      <div style={{
        margin: '0 16px 14px',
        border: '1px solid #dfe1e6',
        borderLeft: '4px solid #0052cc',
        borderRadius: '3px',
        background: '#fafbfc',
        padding: '10px 12px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
        gap: '12px',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#42526e', fontSize: '10px', fontWeight: 800, letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: '4px' }}>What this shows</div>
          <div style={{ color: '#172b4d', fontSize: '12px', lineHeight: '17px' }}>{getReadableViewPurpose()}</div>
          {metricNames.length > 0 && (
            <div style={{ ...mutedStyle, marginTop: '5px' }}>
              Metrics: {metricNames.join(', ')}
            </div>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#42526e', fontSize: '10px', fontWeight: 800, letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: '4px' }}>How to read it</div>
          <div style={{ color: '#172b4d', fontSize: '12px', lineHeight: '17px' }}>{getReadableAction()}</div>
          {kpiNames.length > 0 && (
            <div style={{ ...mutedStyle, marginTop: '5px' }}>
              KPIs: {kpiNames.join(', ')}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (viewType === 'environment') {
    const projects = config.projects || [];
    const businessCount = projects.filter((project) => project.type === 'ITSM' || project.type === 'Business').length;
    const softwareCount = projects.filter((project) => project.type === 'Software').length;
    const totalWork = projects.reduce((sum, project) => sum + (project.count || 0), 0);
    const kpiCards = data.kpiCards || [];
    const fallbackKpiCards = [
      { label: 'JSM ITSM projects', value: businessCount, detail: 'JSM demo operations' },
      { label: 'Software projects', value: softwareCount, detail: 'Delivery teams' },
      { label: 'Total demo work', value: totalWork, detail: 'Issues and incidents' },
      { label: 'Generated snapshot', value: projects.length || 1, detail: formatDisplayDate(generatedAt) },
    ];

    return (
      <div style={shellStyle}>
        {renderHeader(config.environmentName || config.title || 'Demo Environment', config.filterName)}
        {visualType === 'executive-scorecard' ? null : renderRetentionPanel()}
        {renderKpiBarChart(kpiCards.length > 0 ? kpiCards : fallbackKpiCards)}
        {renderDataNotes()}
      </div>
    );
  }

  if (viewType === 'projects') {
    const projectRows = (config.projects || []).map(project => ({
      name: project.key,
      count: project.count || 0,
      projectKey: project.key,
    }));

    return (
      <div style={shellStyle}>
        {renderHeader(config.title || 'Demo Projects', config.filterName)}
        {renderVisualSummary()}
        {visualType.includes('tiles') || visualType.includes('workload')
          ? renderLaneCards('assignee')
          : visualType.includes('bars')
          ? renderHorizontalBars(projectRows, 'No project work found.', 'project')
          : (config.projects || []).map((project) => (
            <div key={project.key} style={compactRowStyle}>
              <div>
                <span style={{ fontWeight: 700 }}>{project.key}</span> {project.name}
                <div style={{ ...mutedStyle, marginTop: '2px' }}>{project.type}{project.boardId ? `, board ${project.boardId}` : ''}</div>
              </div>
              <span style={{ ...badgeStyle, background: '#deebff', color: '#0747a6' }}>{project.count}</span>
            </div>
          ))}
      </div>
    );
  }

  if (viewType === 'status' || viewType === 'priority') {
    const rows = viewType === 'status' ? data.statusCounts : data.priorityCounts;

    return (
      <div style={shellStyle}>
        {renderHeader(config.title, config.filterName)}
        {renderVisualSummary()}
        {visualType.includes('gauge')
          ? renderGaugeChart(rows || [], 'No matching work found.', viewType, viewType === 'priority' ? 'Priority risk' : 'Workflow risk')
          : visualType.includes('grouped')
            ? renderGroupedComparisonBars()
            : visualType.includes('lane') || visualType.includes('stage')
              ? renderLaneCards('status')
              : viewType === 'priority' || visualType.includes('donut')
          ? renderPieChart(rows || [], 'No matching work found.')
          : renderStatusMatrix()}
      </div>
    );
  }

  if (viewType === 'overdue') {
    return (
      <div style={shellStyle}>
        {renderHeader(config.title, 'Overdue open work by project')}
        {renderVisualSummary()}
        {visualType.includes('gauge')
          ? renderGaugeChart(data.overdueByProject || [], 'No overdue work found.', 'project', 'Due date risk')
          : renderHorizontalBars(data.overdueByProject || [], 'No overdue work found.', 'project')}
      </div>
    );
  }

  if (viewType === 'sprint-burndown') {
    return (
      <div style={shellStyle}>
        {renderHeader(config.title, 'Current sprint work distribution')}
        {renderVisualSummary()}
        {renderVerticalBars(data.burndown || [], 'No sprint work found.', 'sprint')}
      </div>
    );
  }

  if (viewType === 'average-time-status') {
    return (
      <div style={shellStyle}>
        {renderHeader(config.title, 'Average days since each issue entered its current status')}
        {renderVisualSummary()}
        {visualType.includes('gauge')
          ? renderGaugeChart(data.averageTimeInStatus || [], 'No status timing data found.', 'status', 'Cycle time pressure')
          : renderAverageTimeBars(data.averageTimeInStatus || [])}
      </div>
    );
  }

  if (viewType === 'ticket-aging') {
    return (
      <div style={shellStyle}>
        {renderHeader(config.title, 'Generated lifecycle age bands')}
        {renderVisualSummary()}
        {visualType.includes('gauge')
          ? renderGaugeChart(data.ticketAging || [], 'No ticket aging data found.', 'aging', 'Aging risk')
          : renderHorizontalBars(data.ticketAging || [], 'No ticket aging data found.', 'aging')}
      </div>
    );
  }

  if (viewType === 'escalations') {
    return (
      <div style={shellStyle}>
        {renderHeader(config.title, 'Escalation and SLA indicators')}
        {renderVisualSummary()}
        {renderPieChart(data.escalationMetrics || [], 'No escalation data found.')}
      </div>
    );
  }

  if (viewType === 'summary') {
    return (
      <div style={shellStyle}>
        {renderVisualSummary()}
        {renderGeneratedSummaryDashboard()}
      </div>
    );
  }

  if (viewType === 'project-insights') {
    const tabButton = (tab, label) => (
      <button
        type="button"
        onClick={() => {
          setProjectInsightTab(tab);
          setSelectedGeneratedReport(null);
          clearChartTooltip();
        }}
        style={{
          border: 'none',
          borderBottom: projectInsightTab === tab ? '3px solid #0c66e4' : '3px solid transparent',
          background: 'transparent',
          color: projectInsightTab === tab ? '#0c66e4' : '#172b4d',
          fontWeight: 700,
          padding: '11px 12px 8px',
          cursor: 'pointer',
          fontSize: '14px',
        }}
      >
        {label}
      </button>
    );

    return (
      <div style={{ ...shellStyle, border: 'none', borderRadius: 0, minHeight: 'calc(100vh - 120px)' }}>
        <div style={{ padding: '18px 20px 8px', borderBottom: '1px solid #dfe1e6', background: '#ffffff' }}>
          <div style={{ ...mutedStyle, marginBottom: '4px' }}>{config.environmentName || 'Project'}</div>
          <h1 style={{ margin: 0, fontSize: '24px', lineHeight: '30px', color: '#172b4d' }}>Summary & Reports</h1>
        </div>
        <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #dfe1e6', background: '#ffffff', paddingLeft: '8px' }}>
          {tabButton('summary', 'Summary')}
          {tabButton('reports', 'Reports')}
        </div>
        <div style={{ paddingTop: '14px' }}>
          {projectInsightTab === 'summary' ? (
            <>
              {renderVisualSummary()}
              {renderGeneratedSummaryDashboard()}
            </>
          ) : (
            <>
              {renderVisualSummary()}
              {renderGeneratedReports()}
            </>
          )}
        </div>
      </div>
    );
  }

  if (viewType === 'reports') {
    return (
      <div style={shellStyle}>
        {renderHeader(config.title, 'Custom date-field report drilldowns')}
        {renderVisualSummary()}
        {renderGeneratedReports()}
        {renderIssueCards(issues, 'No matching work found.')}
      </div>
    );
  }

  if (viewType === 'created-resolved') {
    return (
      <div style={shellStyle}>
        {renderHeader(config.title, 'Custom Created Date / Resolved Date across selected ticket duration')}
        {renderVisualSummary()}
        {renderCreatedResolvedTrend(data.createdResolvedTrend || [])}
      </div>
    );
  }

  if (viewType === 'sprint-health') {
    const health = data.sprintHealth || {};
    const activeSprintNames = (health.activeSprints || []).map((sprint) => sprint.name).join(', ') || 'No active sprint found';

    return (
      <div style={shellStyle}>
        {renderHeader(config.title, activeSprintNames)}
        {renderVisualSummary()}
        {renderSprintHealthPanel(health, activeSprintNames)}
      </div>
    );
  }

  if (viewType === 'roadmap') {
    return (
      <div style={shellStyle}>
        {renderHeader(config.title, 'Release versions due in the next 30 days')}
        {renderVisualSummary()}
        {visualType.includes('gantt') || visualType.includes('timeline')
          ? renderTimelineGantt()
          : (data.roadmap || []).length === 0
          ? <div style={mutedStyle}>No releases are due in the next 30 days.</div>
          : (data.roadmap || []).map((version) => (
            <div key={`${version.projectKey}-${version.name}`} style={timelineRowStyle}>
              <span style={timelineTitleStyle} title={`${version.projectKey} ${version.name}`}>
                <strong>{version.projectKey}</strong> {version.name}
              </span>
              <span style={{ ...badgeStyle, justifySelf: 'end', whiteSpace: 'nowrap', background: version.released ? '#e3fcef' : '#fff0b3', color: version.released ? '#006644' : '#7a5d00' }}>
                {version.releaseDate || 'No date'}{version.released ? ' released' : ''}
              </span>
            </div>
          ))}
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      {renderHeader(config.title || 'Open Work', config.filterName)}
      {renderVisualSummary()}
      {visualType.includes('lane') || visualType.includes('cards')
        ? renderLaneCards(visualType.includes('owner') || visualType.includes('agent') ? 'assignee' : 'status')
        : renderIssueCards(issues, 'No matching work found.')}
      {renderDataNotes()}
    </div>
  );
}

function App() {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [progress, setProgress] = useState('');
  const [agentRequest, setAgentRequest] = useState('Create an ITSM demo environment for retail banking');
  const [agentMessages, setAgentMessages] = useState([
    {
      role: 'agent',
      text: 'Tell me what demo environment you want, or start with "create demo environment" and I will guide you.',
    },
  ]);
  const [agentDraft, setAgentDraft] = useState({});
  const [agentLoading, setAgentLoading] = useState(false);
  const [openDashboardPicker, setOpenDashboardPicker] = useState(null);
  const [domainInventory, setDomainInventory] = useState(null);
  const [domainInventoryLoading, setDomainInventoryLoading] = useState(false);
  const [selectionFeedback, setSelectionFeedback] = useState('');
  const [selectedVolumeProjectKeys, setSelectedVolumeProjectKeys] = useState([]);
  const [selectedDeleteProjectKeys, setSelectedDeleteProjectKeys] = useState([]);

  const [form, setForm] = useState({
    industry: '',
    customIndustry: '',
    opsDashboardTypes: [],
    opsDashboardPrompt: '',
    softwareDashboardTypes: [],
    softwareDashboardPrompt: '',
    businessDashboardTypes: [],
    businessDashboardPrompt: '',
    productDiscoveryDashboardTypes: [],
    productDiscoveryDashboardPrompt: '',
    dateRange: '6 months',
    spaceType: '',
    softwareProjectStyle: 'team-managed',
    jsmServiceTypes: [],
    softwareProjects: [],
    businessProjects: [],
    productDiscoveryProjects: [],
    retentionPeriodDays: 180,
  });

  useEffect(() => {
    view.getContext().then(setContext).catch(() => setContext({}));
  }, []);

  const getSelectedIndustry = (sourceForm = form) => (
    sourceForm.industry === 'Other' ? sourceForm.customIndustry.trim() : sourceForm.industry
  );

  const loadDomainInventory = async (sourceForm = form) => {
    const selectedIndustry = getSelectedIndustry(sourceForm);
    if (!selectedIndustry) {
      setDomainInventory(null);
      return;
    }
    if (!sourceForm.spaceType) {
      setDomainInventory(null);
      return;
    }

    setDomainInventoryLoading(true);
    try {
      const response = await invoke('getBusinessDomainInventory', {
        industry: selectedIndustry,
        customIndustry: sourceForm.customIndustry,
        isCustomIndustry: sourceForm.industry === 'Other',
        spaceType: sourceForm.spaceType,
      });
      const availableKeys = new Set((response?.projects || []).map(project => project.key));
      setSelectedVolumeProjectKeys(keys => keys.filter(key => availableKeys.has(key)));
      setSelectedDeleteProjectKeys(keys => keys.filter(key => availableKeys.has(key)));
      setDomainInventory(response);
    } catch (err) {
      setDomainInventory({
        success: false,
        message: `Existing domain lookup failed: ${err.message}`,
        projects: [],
      });
      setSelectedVolumeProjectKeys([]);
      setSelectedDeleteProjectKeys([]);
    } finally {
      setDomainInventoryLoading(false);
    }
  };

  useEffect(() => {
    const selectedIndustry = getSelectedIndustry(form);
    if (!selectedIndustry || !form.spaceType || (form.industry === 'Other' && !form.customIndustry.trim())) {
      setDomainInventory(null);
      return undefined;
    }

    const timer = setTimeout(() => {
      loadDomainInventory(form);
    }, 450);

    return () => clearTimeout(timer);
  }, [form.industry, form.customIndustry, form.spaceType]);

  if (context?.extension?.type === 'jira:dashboardGadget') {
    return <DashboardGadget context={context} />;
  }

  if (context?.extension?.type === 'jira:projectPage') {
    return <DashboardGadget context={context} source="project" />;
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({
      ...form,
      [name]: value,
      ...(name === 'industry' && value !== 'Other' ? { customIndustry: '' } : {}),
      ...(name === 'industry' ? { spaceType: '' } : {}),
    });
    if (name === 'industry' || name === 'customIndustry' || name === 'spaceType') {
      setSelectedVolumeProjectKeys([]);
      setSelectedDeleteProjectKeys([]);
      setSelectionFeedback('');
    }
  };

  const toggleDashboardSelection = (fieldName, promptFieldName, options, value) => {
    const currentValues = form[fieldName] || [];
    const selectedValues = currentValues.includes(value)
      ? currentValues.filter(item => item !== value)
      : [...currentValues, value].filter(Boolean);

    setForm({
      ...form,
      [fieldName]: selectedValues,
      [promptFieldName]: buildDashboardPromptFromValues(options, selectedValues),
    });
  };

  const invokeDemoStepWithRetry = async ({ currentConfig, currentState, step }) => {
    const isProjectCreationStep = [
      'create-business-project',
      'create-software-project-shell',
      'create-work-management-project-shell',
      'create-product-discovery-project-shell',
    ].includes(step.type);
    const isTransientStep = [
      'create-business-incidents-batch',
      'create-software-issues-batch',
      'create-work-management-issues-batch',
      'create-product-discovery-ideas-batch',
      'create-software-sprint',
      'populate-kanban-board',
      'create-dependencies',
      'create-github-development-activity',
    ].includes(step.type);
    const maxAttempts = isProjectCreationStep ? 3 : isTransientStep ? 3 : 1;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await invoke('executeDemoEnvironmentStep', {
          config: currentConfig,
          state: currentState,
          step,
        });
      } catch (err) {
        lastError = err;
        const message = String(err?.message || '');
        const isRetryable = /timed out|timeout|502|503|504|upstream_failure|upstream|temporarily unavailable/i.test(message);
        if (!isRetryable || attempt >= maxAttempts) {
          throw new Error(`${step.label || step.type} failed: ${err.message}`);
        }

        setProgress(`Retrying ${step.label || step.type} after a temporary Forge/Jira response (${attempt + 1} of ${maxAttempts})...`);
        await new Promise(resolve => setTimeout(resolve, 6000 * attempt));
      }
    }

    throw new Error(`${step.label || step.type} failed: ${lastError?.message || 'Unknown error'}`);
  };

  const appendAgentMessage = (message) => {
    setAgentMessages(messages => [...messages, message]);
  };

  const normalizeAgentText = (value) => String(value || '').trim().toLowerCase();

  const inferAgentDomain = (text) => {
    const normalized = normalizeAgentText(text);
    return industries.find(industry => normalized.includes(industry.toLowerCase()))
      || (normalized.includes('retail banking') ? 'Banking & Insurance' : '')
      || (normalized.includes('bank') || normalized.includes('insur') || normalized.includes('claims') ? 'Banking & Insurance' : '')
      || (normalized.includes('health') ? 'Healthcare' : '')
      || (normalized.includes('telecom') ? 'Telecom' : '')
      || (normalized.includes('retail') || normalized.includes('commerce') ? 'Retail & E-commerce' : '')
      || (normalized.includes('manufactur') || normalized.includes('energy') || normalized.includes('utilities') ? 'Manufacturing & Energy Utilities' : '')
      || (normalized.includes('saas') ? 'SaaS' : '')
      || (normalized.includes('education') ? 'Education' : '')
      || '';
  };

  const inferAgentAction = (text) => {
    const normalized = normalizeAgentText(text);
    if (/delete|remove|clean/.test(normalized)) return 'delete';
    if (/add volume|volume|more data|existing/.test(normalized)) return 'volume';
    if (/create|new|demo environment|setup|set up/.test(normalized)) return 'create';
    return '';
  };

  const inferAgentSpaceType = (text) => {
    const normalized = normalizeAgentText(text);
    if (normalized.includes('hrsm') || normalized.includes('hr service')) return 'jsm:HRSM';
    if (normalized.includes('csm') || normalized.includes('customer service')) return 'jsm:CSM';
    if (normalized.includes('fsm') || normalized.includes('facilit')) return 'jsm:FSM';
    if (normalized.includes('lsm') || normalized.includes('legal')) return 'jsm:LSM';
    if (normalized.includes('itsm') || normalized.includes('it service')) return 'jsm:ITSM';
    if (normalized.includes('scrum')) return 'software:scrum';
    if (normalized.includes('kanban')) return 'software:kanban';
    if (normalized.includes('bug')) return 'software:bug-tracking';
    if (normalized.includes('project management')) return 'business:project-management';
    if (normalized.includes('budget')) return 'business:budget-planning';
    if (normalized.includes('recruit')) return 'business:recruitment-tracking';
    if (normalized.includes('procurement')) return 'business:procurement-management';
    if (normalized.includes('task') || normalized.includes('work management')) return 'business:task-tracking';
    if (normalized.includes('product discovery') || normalized.includes('jpd')) return 'jpd:product-discovery';
    return '';
  };

  const inferAgentManagement = (text) => {
    const normalized = normalizeAgentText(text);
    if (normalized.includes('company')) return 'company-managed';
    if (normalized.includes('team')) return 'team-managed';
    return '';
  };

  const extractAgentProjectKeys = (text) => (
    String(text || '')
      .toUpperCase()
      .split(/[\s,]+/)
      .map(value => value.trim())
      .filter(value => /^[A-Z][A-Z0-9]{1,9}$/.test(value))
      .join(', ')
  );

  const getAgentSpaceCategory = (spaceType) => String(spaceType || '').split(':')[0] || '';

  const getAgentOptionsForCategory = (category) => spaceTypeOptions
    .filter(option => option.value.startsWith(`${category}:`))
    .map(option => ({ value: option.value, label: option.label }));

  const buildAgentRequestFromDraft = (draft) => {
    const option = spaceTypeOptions.find(item => item.value === draft.spaceType);
    return [
      draft.action === 'volume' ? 'Add demo volume to' : draft.action === 'delete' ? 'Delete demo spaces for' : 'Create',
      option?.label || draft.spaceType || 'demo environment',
      'demo environment for',
      draft.domain,
      draft.management ? `using ${draft.management}` : '',
      draft.volumeProjectKeys ? `project keys ${draft.volumeProjectKeys}` : '',
    ].filter(Boolean).join(' ');
  };

  const describeAgentSelection = (draft, index = null) => {
    const option = spaceTypeOptions.find(item => item.value === draft.spaceType);
    const action = agentActionOptions.find(item => item.value === draft.action)?.label || 'Create new only if existing cannot fit';
    const management = draft.management ? `, ${draft.management}` : '';
    const keys = draft.volumeProjectKeys ? `, keys: ${draft.volumeProjectKeys}` : '';
    return `${index === null ? '' : `${index + 1}. `}${draft.domain} - ${option?.group || 'Space'} - ${option?.label || draft.spaceType} - ${action}${management}${keys}`;
  };

  const getAgentReviewText = (selections = []) => [
    'Please review what I understood:',
    ...selections.map((selection, index) => describeAgentSelection(selection, index)),
    '',
    'Shall I create this now, or do you want to add another domain / space type?',
  ].join('\n');

  const inferAgentReviewAction = (text) => {
    const normalized = normalizeAgentText(text);
    if (/start over|restart|reset|clear/.test(normalized)) return 'start-over';
    if (/add another|another|add more|one more|more space|more domain/.test(normalized)) return 'add-another';
    if (/create now|proceed|continue|confirm|yes|run|start|create it|go ahead/.test(normalized)) return 'create-now';
    return '';
  };

  const getNextAgentQuestion = (draft) => {
    if (!draft.domain) {
      return {
        text: 'Which business domain should I use?',
        options: industries.map(value => ({ value, label: value })),
        field: 'domain',
      };
    }

    if (!draft.spaceCategory && !draft.spaceType) {
      return {
        text: 'Select space type:',
        options: agentSpaceCategoryOptions,
        field: 'spaceCategory',
      };
    }

    const category = draft.spaceCategory || getAgentSpaceCategory(draft.spaceType);
    if (!draft.spaceType) {
      const selectedGroupLabel = agentSpaceCategoryOptions.find(option => option.value === category)?.label || 'selected group';
      return {
        text: `Select the space type under ${selectedGroupLabel}:`,
        options: getAgentOptionsForCategory(category),
        field: 'spaceType',
      };
    }

    if (!draft.action) {
      return {
        text: 'What should I do first? I will prefer existing matching spaces; create new only when the current spaces cannot meet the need.',
        options: agentActionOptions,
        field: 'action',
      };
    }

    if ((draft.action === 'volume' || draft.action === 'delete') && !draft.volumeProjectKeys) {
      return {
        text: draft.action === 'delete'
          ? 'Please enter the existing Jira project key or keys to delete.'
          : 'Please enter the existing Jira project key or keys to add volume to.',
        options: [],
        field: 'volumeProjectKeys',
      };
    }

    if (draft.spaceType === 'software:scrum' || draft.spaceType === 'software:kanban') {
      if (!draft.management) {
        return {
          text: 'Should the Jira Software project be team-managed or company-managed?',
          options: agentManagementOptions,
          field: 'management',
        };
      }
    }

    return null;
  };

  const runAgentRequest = async (request) => {
    appendAgentMessage({ role: 'agent', text: 'Understood. I am preparing the demo environment plan now.' });

    const preparation = await invoke('prepareAgentDemoEnvironment', {
      request,
    });

    if (preparation.needsInput) {
      appendAgentMessage({ role: 'agent', text: preparation.question || 'I need one more detail before I can start.' });
      return;
    }

    if (!preparation.success) {
      appendAgentMessage({ role: 'agent', text: preparation.summary || 'I could not prepare the demo environment.' });
      setResult(preparation.summary || 'Unable to prepare the demo environment.');
      setIsSuccess(false);
      return;
    }

    let currentConfig = preparation.config;
    let currentState = preparation.state;
    const totalSteps = preparation.plan.length;
    appendAgentMessage({
      role: 'agent',
      text: `${preparation.message || 'Plan ready.'} I will run ${totalSteps} backend step${totalSteps === 1 ? '' : 's'} and show progress here.`,
    });

    for (let index = 0; index < totalSteps; index += 1) {
      const step = preparation.plan[index];
      const progressText = `Step ${index + 1} of ${totalSteps}: ${step.label}`;
      setProgress(progressText);
      appendAgentMessage({ role: 'agent', text: progressText });

      const stepResult = await invokeDemoStepWithRetry({
        currentConfig,
        currentState,
        step,
      });

      if (!stepResult.success) {
        throw new Error(stepResult.message || 'A step failed during environment creation.');
      }

      currentConfig = stepResult.config || currentConfig;
      currentState = stepResult.state;
    }

    setProgress('Finalizing summary...');
    appendAgentMessage({ role: 'agent', text: 'Finalizing the environment summary and dashboard links.' });

    const res = await invoke('finalizeDemoEnvironment', {
      config: currentConfig,
      state: currentState,
    });

    setProgress('');
    setResult(res.summary);
    setIsSuccess(res.success);
    setAgentDraft({});
    appendAgentMessage({
      role: 'agent',
      text: res.success
        ? `Demo environment created successfully.\n\n${res.summary}`
        : `The demo environment run finished, but Jira reported issues.\n\n${res.summary}`,
    });
  };

  const runAgentSelections = async (selections = []) => {
    for (let index = 0; index < selections.length; index += 1) {
      const selection = selections[index];
      appendAgentMessage({ role: 'agent', text: `Starting request ${index + 1} of ${selections.length}: ${describeAgentSelection(selection)}` });

      if (selection.action === 'delete') {
        const projectKeys = extractAgentProjectKeys(selection.volumeProjectKeys);
        if (!projectKeys) {
          appendAgentMessage({ role: 'agent', text: 'I could not find valid project keys to delete. Please start again with the project key.' });
          continue;
        }
        const response = await invoke('deleteBusinessDomainProjects', {
          projectKeys: projectKeys.split(/,\s*/).filter(Boolean),
        });
        setResult(response.summary || 'Delete request completed.');
        setIsSuccess(Boolean(response.success));
        appendAgentMessage({ role: 'agent', text: response.summary || 'Delete request completed.' });
        continue;
      }

      await runAgentRequest(buildAgentRequestFromDraft(selection));
    }
    setAgentDraft({});
  };

  const continueAgentConversation = async (draft) => {
    const nextQuestion = getNextAgentQuestion(draft);
    if (nextQuestion) {
      appendAgentMessage({
        role: 'agent',
        text: nextQuestion.text,
        options: nextQuestion.options,
        field: nextQuestion.field,
      });
      return;
    }

    const completedSelection = {
      domain: draft.domain,
      spaceCategory: draft.spaceCategory || getAgentSpaceCategory(draft.spaceType),
      spaceType: draft.spaceType,
      action: draft.action,
      management: draft.management,
      volumeProjectKeys: draft.volumeProjectKeys,
    };
    const selections = [...(draft.selections || []), completedSelection];
    setAgentDraft({ selections });
    appendAgentMessage({
      role: 'agent',
      text: getAgentReviewText(selections),
      options: agentReviewOptions,
      field: 'reviewAction',
    });
  };

  const handleAgentOptionSelect = async (field, value, label) => {
    if (agentLoading || loading) return;
    setAgentLoading(true);
    appendAgentMessage({ role: 'user', text: label || value });

    if (field === 'reviewAction') {
      try {
        if (value === 'start-over') {
          setAgentDraft({});
          appendAgentMessage({
            role: 'agent',
            text: 'No problem. Let us start again. Which business domain should I use?',
            options: industries.map(industry => ({ value: industry, label: industry })),
            field: 'domain',
          });
        } else if (value === 'add-another') {
          const selections = agentDraft.selections || [];
          const nextDraft = { selections };
          setAgentDraft(nextDraft);
          appendAgentMessage({
            role: 'agent',
            text: 'Sure. Let us add another domain / space type. Which business domain should I use?',
            options: industries.map(industry => ({ value: industry, label: industry })),
            field: 'domain',
          });
        } else {
          await runAgentSelections(agentDraft.selections || []);
        }
      } catch (err) {
        const message = `Error: ${err.message}`;
        setProgress('');
        setResult(message);
        setIsSuccess(false);
        appendAgentMessage({ role: 'agent', text: message });
      }
      setAgentLoading(false);
      return;
    }

    const nextDraft = {
      ...agentDraft,
      [field]: value,
      ...(field === 'spaceType' ? { spaceCategory: getAgentSpaceCategory(value) } : {}),
    };
    setAgentDraft(nextDraft);
    try {
      await continueAgentConversation(nextDraft);
    } catch (err) {
      const message = `Error: ${err.message}`;
      setProgress('');
      setResult(message);
      setIsSuccess(false);
      appendAgentMessage({ role: 'agent', text: message });
    }
    setAgentLoading(false);
  };

  const handleAgentSubmit = async () => {
    const request = agentRequest.trim();
    if (!request || agentLoading || loading) {
      return;
    }

    setAgentLoading(true);
    setResult('');
    setIsSuccess(false);
    setProgress('');
    appendAgentMessage({ role: 'user', text: request });

    const pendingSelections = agentDraft.selections || [];
    const reviewAction = pendingSelections.length > 0 ? inferAgentReviewAction(request) : '';
    if (reviewAction) {
      try {
        if (reviewAction === 'start-over') {
          setAgentDraft({});
          appendAgentMessage({
            role: 'agent',
            text: 'No problem. Let us start again. Which business domain should I use?',
            options: industries.map(industry => ({ value: industry, label: industry })),
            field: 'domain',
          });
        } else if (reviewAction === 'add-another') {
          const nextDraft = { selections: pendingSelections };
          setAgentDraft(nextDraft);
          appendAgentMessage({
            role: 'agent',
            text: 'Sure. Let us add another domain / space type. Which business domain should I use?',
            options: industries.map(industry => ({ value: industry, label: industry })),
            field: 'domain',
          });
        } else {
          await runAgentSelections(pendingSelections);
        }
      } catch (err) {
        const message = `Error: ${err.message}`;
        setProgress('');
        setResult(message);
        setIsSuccess(false);
        appendAgentMessage({ role: 'agent', text: message });
      }
      setAgentLoading(false);
      return;
    }

    const inferredDraft = {
      ...agentDraft,
      domain: agentDraft.domain || inferAgentDomain(request),
      action: agentDraft.action || inferAgentAction(request),
      spaceType: agentDraft.spaceType || inferAgentSpaceType(request),
      management: agentDraft.management || inferAgentManagement(request),
      volumeProjectKeys: agentDraft.volumeProjectKeys
        || ((agentDraft.action === 'volume' || agentDraft.action === 'delete') ? extractAgentProjectKeys(request) : ''),
    };
    if (inferredDraft.spaceType && !inferredDraft.spaceCategory) {
      inferredDraft.spaceCategory = getAgentSpaceCategory(inferredDraft.spaceType);
    }

    try {
      setAgentDraft(inferredDraft);
      await continueAgentConversation(inferredDraft);
    } catch (err) {
      const message = `Error: ${err.message}`;
      setProgress('');
      setResult(message);
      setIsSuccess(false);
      appendAgentMessage({ role: 'agent', text: message });
    }

    setAgentLoading(false);
  };

  const handleSubmit = async ({ volumeOnly = false } = {}) => {
    if (!form.industry) {
      setResult('Please select a Domain');
      return;
    }

    const selectedIndustry = getSelectedIndustry(form);
    const selectedVolumeProjects = (domainInventory?.projects || [])
      .filter(project => selectedVolumeProjectKeys.includes(project.key));
    if (volumeOnly && selectedVolumeProjects.length === 0) {
      setResult('Please select at least one existing project with the Volume checkbox.');
      setIsSuccess(false);
      return;
    }
    const selectedVolumeJsmServiceTypes = selectedVolumeProjects
      .filter(project => project.kind === 'business')
      .map(project => project.jsmServiceType || 'ITSM');
    const selectedVolumeSoftwareProjects = selectedVolumeProjects
      .filter(project => project.kind === 'software')
      .map(project => ({
        softwareTemplate: project.softwareTemplate || 'scrum',
        softwareProjectStyle: project.softwareProjectStyle || 'team-managed',
        issuesPerProject: DEFAULT_DEMO_ISSUE_COUNT,
      }));
    const selectedVolumeBusinessProjects = selectedVolumeProjects
      .filter(project => project.kind === 'business-project')
      .map(project => ({
        projectKey: project.key,
        businessSpaceType: project.businessSpaceType || form.spaceType.replace(/^business:/, '') || 'task-tracking',
        issuesPerProject: DEFAULT_DEMO_ISSUE_COUNT,
      }));
    const selectedVolumeProductDiscoveryProjects = selectedVolumeProjects
      .filter(project => project.kind === 'product-discovery')
      .map(project => ({
        projectKey: project.key,
        productDiscoveryType: project.productDiscoveryType || 'product-discovery',
        issuesPerProject: DEFAULT_DEMO_ISSUE_COUNT,
      }));
    const jsmServiceTypesForRun = [
      ...selectedVolumeJsmServiceTypes,
      ...(volumeOnly ? [] : form.jsmServiceTypes),
    ];
    const softwareProjectsForRun = [
      ...selectedVolumeSoftwareProjects,
      ...(volumeOnly ? [] : form.softwareProjects),
    ];
    const businessProjectsForRun = [
      ...selectedVolumeBusinessProjects,
      ...(volumeOnly ? [] : form.businessProjects),
    ];
    const productDiscoveryProjectsForRun = [
      ...selectedVolumeProductDiscoveryProjects,
      ...(volumeOnly ? [] : form.productDiscoveryProjects),
    ];

    if (form.industry === 'Other' && !selectedIndustry) {
      setResult('Please enter a custom Domain');
      return;
    }

    if (
      jsmServiceTypesForRun.length === 0
      && softwareProjectsForRun.length === 0
      && businessProjectsForRun.length === 0
      && productDiscoveryProjectsForRun.length === 0
      && selectedVolumeProjects.length === 0
    ) {
      setResult('Please select at least one space to create, or select an existing project to add volume to.');
      return;
    }

    const incompleteSoftwareProjectIndex = softwareProjectsForRun.findIndex(project => (
      !project.softwareTemplate
      || (project.softwareTemplate !== 'bug-tracking' && !project.softwareProjectStyle)
    ));

    if (incompleteSoftwareProjectIndex >= 0) {
      setResult(`Please complete Project Template${softwareProjectsForRun[incompleteSoftwareProjectIndex]?.softwareTemplate === 'bug-tracking' ? '' : ' and Management'} for Software Project ${incompleteSoftwareProjectIndex + 1}`);
      return;
    }

    if (productDiscoveryProjectsForRun.some(project => !project.projectKey)) {
      setResult(PRODUCT_DISCOVERY_VOLUME_ONLY_MESSAGE);
      setIsSuccess(false);
      return;
    }

    setLoading(true);
    setResult('');
    setIsSuccess(false);
    setProgress('Preparing the demo environment plan...');

    try {
      const availableSoftwareDashboardOptions = getSoftwareDashboardOptions(form.softwareProjects);
      const selectedSoftwareDashboardTypes = filterDashboardValues(
        availableSoftwareDashboardOptions,
        form.softwareDashboardTypes
      );
      const selectedSoftwareDashboardPrompt = buildDashboardPromptFromValues(
        availableSoftwareDashboardOptions,
        selectedSoftwareDashboardTypes
      ) || form.softwareDashboardPrompt;
      const availableOpsDashboardOptions = getJsmDashboardOptions(jsmServiceTypesForRun);
      const selectedOpsDashboardTypes = filterDashboardValues(
        availableOpsDashboardOptions,
        form.opsDashboardTypes
      );
      const selectedOpsDashboardPrompt = buildDashboardPromptFromValues(
        availableOpsDashboardOptions,
        selectedOpsDashboardTypes
      ) || form.opsDashboardPrompt;
      const availableBusinessDashboardOptions = getBusinessDashboardOptions(businessProjectsForRun);
      const selectedBusinessDashboardTypes = filterDashboardValues(
        availableBusinessDashboardOptions,
        form.businessDashboardTypes
      );
      const selectedBusinessDashboardPrompt = buildDashboardPromptFromValues(
        availableBusinessDashboardOptions,
        selectedBusinessDashboardTypes
      ) || form.businessDashboardPrompt;
      const availableProductDiscoveryDashboardOptions = getProductDiscoveryDashboardOptions(productDiscoveryProjectsForRun);
      const selectedProductDiscoveryDashboardTypes = filterDashboardValues(
        availableProductDiscoveryDashboardOptions,
        form.productDiscoveryDashboardTypes
      );
      const selectedProductDiscoveryDashboardPrompt = buildDashboardPromptFromValues(
        availableProductDiscoveryDashboardOptions,
        selectedProductDiscoveryDashboardTypes
      ) || form.productDiscoveryDashboardPrompt;

      const preparation = await invoke('prepareDemoEnvironment', {
        industry: selectedIndustry,
        customIndustry: form.customIndustry.trim(),
        isCustomIndustry: form.industry === 'Other',
        environmentName: selectedIndustry,
        reuseExistingDomainData: true,
        addVolumeToExistingDomainData: selectedVolumeProjectKeys.length > 0,
        volumeProjectKeys: selectedVolumeProjectKeys,
        opsDashboardTypes: selectedOpsDashboardTypes,
        opsDashboardSelections: selectedOpsDashboardTypes
          .map(value => availableOpsDashboardOptions.find(option => option.value === value))
          .filter(Boolean)
          .map(option => ({ value: option.value, label: option.label, prompt: option.prompt })),
        opsDashboardPrompt: selectedOpsDashboardPrompt,
        softwareDashboardTypes: selectedSoftwareDashboardTypes,
        softwareDashboardSelections: selectedSoftwareDashboardTypes
          .map(value => availableSoftwareDashboardOptions.find(option => option.value === value))
          .filter(Boolean)
          .map(option => ({ value: option.value, label: option.label, prompt: option.prompt })),
        softwareDashboardPrompt: selectedSoftwareDashboardPrompt,
        businessDashboardTypes: selectedBusinessDashboardTypes,
        businessDashboardSelections: selectedBusinessDashboardTypes
          .map(value => availableBusinessDashboardOptions.find(option => option.value === value))
          .filter(Boolean)
          .map(option => ({ value: option.value, label: option.label, prompt: option.prompt })),
        businessDashboardPrompt: selectedBusinessDashboardPrompt,
        productDiscoveryDashboardTypes: selectedProductDiscoveryDashboardTypes,
        productDiscoveryDashboardSelections: selectedProductDiscoveryDashboardTypes
          .map(value => availableProductDiscoveryDashboardOptions.find(option => option.value === value))
          .filter(Boolean)
          .map(option => ({ value: option.value, label: option.label, prompt: option.prompt })),
        productDiscoveryDashboardPrompt: selectedProductDiscoveryDashboardPrompt,
        dateRange: form.dateRange,
        jsmProjectCount: jsmServiceTypesForRun.length,
        jsmServiceTypes: jsmServiceTypesForRun,
        incidentRequestsPerProject: DEFAULT_DEMO_ISSUE_COUNT,
        problemRequestsPerProject: DEFAULT_DEMO_ISSUE_COUNT,
        changeRequestsPerProject: DEFAULT_DEMO_ISSUE_COUNT,
        serviceRequestsPerProject: DEFAULT_DEMO_ISSUE_COUNT,
        softwareProjects: softwareProjectsForRun.map(project => ({
          softwareTemplate: project.softwareTemplate,
          softwareProjectStyle: project.softwareProjectStyle,
          issuesPerProject: DEFAULT_DEMO_ISSUE_COUNT,
        })),
        businessProjects: businessProjectsForRun.map(project => ({
          projectKey: project.projectKey || '',
          businessSpaceType: project.businessSpaceType,
          issuesPerProject: DEFAULT_DEMO_ISSUE_COUNT,
        })),
        productDiscoveryProjects: productDiscoveryProjectsForRun.map(project => ({
          projectKey: project.projectKey || '',
          productDiscoveryType: project.productDiscoveryType || 'product-discovery',
          issuesPerProject: DEFAULT_DEMO_ISSUE_COUNT,
        })),
        softwareProjectCount: softwareProjectsForRun.length,
        softwareTemplate: softwareProjectsForRun[0]?.softwareTemplate || 'scrum',
        softwareProjectStyle: softwareProjectsForRun[0]?.softwareProjectStyle || 'team-managed',
        issuesPerProject: DEFAULT_DEMO_ISSUE_COUNT,
        sprintsPerProject: 6,
        retentionPeriodDays: parseInt(form.retentionPeriodDays, 10),
      });

      if (!preparation.success) {
        setProgress('');
        setResult(preparation.summary || 'Unable to prepare the demo environment.');
        setIsSuccess(false);
        setLoading(false);
        return;
      }

      let currentConfig = preparation.config;
      let currentState = preparation.state;
      const totalSteps = preparation.plan.length;

      for (let index = 0; index < totalSteps; index += 1) {
        const step = preparation.plan[index];
        setProgress(`Step ${index + 1} of ${totalSteps}: ${step.label}`);

        const stepResult = await invokeDemoStepWithRetry({
          currentConfig,
          currentState,
          step,
        });

        if (!stepResult.success) {
          throw new Error(stepResult.message || 'A step failed during environment creation.');
        }

        currentConfig = stepResult.config || currentConfig;
        currentState = stepResult.state;
      }

      setProgress('Finalizing summary...');

      const res = await invoke('finalizeDemoEnvironment', {
        config: currentConfig,
        state: currentState,
      });

      setProgress('');
      setResult(res.summary);
      setIsSuccess(res.success);
    } catch (err) {
      setProgress('');
      setResult('Error: ' + err.message);
      setIsSuccess(false);
    }

    setLoading(false);
  };

  const containerStyle = {
    minHeight: '100vh',
    backgroundColor: '#f4f5f7',
    padding: '40px 20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  const cardStyle = {
    maxWidth: '920px',
    margin: '0 auto',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    padding: '32px',
  };

  const headerStyle = {
    marginBottom: '32px',
    borderBottom: '1px solid #dfe1e6',
    paddingBottom: '16px',
  };

  const titleStyle = {
    fontSize: '24px',
    fontWeight: '600',
    color: '#172b4d',
    margin: '0 0 8px 0',
  };

  const subtitleStyle = {
    fontSize: '14px',
    color: '#5e6c84',
    margin: 0,
  };

  const fieldStyle = {
    marginBottom: '20px',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#172b4d',
    marginBottom: '8px',
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #dfe1e6',
    borderRadius: '4px',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };

  const selectStyle = {
    ...inputStyle,
    backgroundColor: '#fff',
    cursor: 'pointer',
  };

  const rowStyle = {
    display: 'flex',
    gap: '16px',
  };

  const colStyle = {
    flex: 1,
  };

  const countGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '16px',
    marginTop: '16px',
  };

  const threeColumnGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '16px',
    alignItems: 'end',
  };

  const projectCardStyle = {
    marginTop: '14px',
    padding: '14px',
    backgroundColor: '#fff',
    border: '1px solid #dfe1e6',
    borderRadius: '4px',
  };

  const projectCardHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    alignItems: 'center',
    marginBottom: '12px',
  };

  const jsmProjectRowStyle = {
    display: 'grid',
    gridTemplateColumns: '130px repeat(4, minmax(110px, 1fr)) 82px',
    gap: '12px',
    alignItems: 'end',
  };

  const softwareProjectRowStyle = {
    display: 'grid',
    gridTemplateColumns: '150px minmax(150px, 1fr) minmax(170px, 1fr) minmax(90px, 0.7fr) 82px',
    gap: '12px',
    alignItems: 'end',
  };

  const removeButtonStyle = {
    ...inputStyle,
    width: 'auto',
    padding: '10px 12px',
    cursor: 'pointer',
    backgroundColor: '#fff',
  };

  const buttonStyle = {
    width: '100%',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '500',
    color: '#fff',
    backgroundColor: '#0052cc',
    border: 'none',
    borderRadius: '4px',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
    transition: 'background-color 0.2s',
  };

  const resultHasWarningsOrErrors = /(^|\n)\s*(Warnings \/ Errors|Error:)/i.test(result || '');
  const resultIsError = !isSuccess || resultHasWarningsOrErrors;

  const resultStyle = {
    marginTop: '24px',
    padding: '16px',
    borderRadius: '4px',
    fontSize: '13px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    backgroundColor: resultIsError ? '#ffebe6' : '#e3fcef',
    border: '1px solid',
    borderColor: resultIsError ? '#ff5630' : '#00875a',
    color: resultIsError ? '#bf2600' : '#006644',
  };

  const progressStyle = {
    marginTop: '16px',
    padding: '12px',
    backgroundColor: '#deebff',
    borderRadius: '4px',
    fontSize: '14px',
    color: '#0747a6',
    textAlign: 'center',
  };

  const sectionStyle = {
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: '#f4f5f7',
    borderRadius: '4px',
  };

  const sectionTitleStyle = {
    fontSize: '12px',
    fontWeight: '600',
    color: '#5e6c84',
    textTransform: 'uppercase',
    marginBottom: '12px',
    letterSpacing: '0.5px',
  };

  const optionalSectionStyle = {
    ...sectionStyle,
    backgroundColor: '#fff',
    border: '1px solid #dfe1e6',
  };

  const pickerButtonStyle = {
    ...inputStyle,
    minHeight: '44px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  };

  const pickerMenuStyle = {
    marginTop: '4px',
    border: '1px solid #dfe1e6',
    borderRadius: '4px',
    backgroundColor: '#fff',
    boxShadow: '0 8px 16px rgba(9, 30, 66, 0.15)',
    maxHeight: '240px',
    overflowY: 'auto',
    padding: '6px 0',
    position: 'relative',
    zIndex: 3,
  };

  const pickerOptionStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    fontSize: '14px',
    color: '#172b4d',
    cursor: 'pointer',
  };

  const infoIconStyle = {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    border: '1px solid #6b778c',
    color: '#42526e',
    fontSize: '12px',
    fontWeight: 800,
    lineHeight: '16px',
    textAlign: 'center',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    cursor: 'help',
  };

  const selectedSoftwareProjectCount = form.softwareProjects.length;
  const selectedJsmProjectCount = form.jsmServiceTypes.length;
  const jsmDashboardOptions = getJsmDashboardOptions(form.jsmServiceTypes);
  const softwareDashboardOptions = getSoftwareDashboardOptions(form.softwareProjects);
  const businessDashboardOptions = getBusinessDashboardOptions(form.businessProjects);
  const productDiscoveryDashboardOptions = getProductDiscoveryDashboardOptions(form.productDiscoveryProjects);
  const toggleVolumeProjectSelection = (projectKey) => {
    setSelectedVolumeProjectKeys(keys => (
      keys.includes(projectKey)
        ? keys.filter(key => key !== projectKey)
        : [...keys, projectKey]
    ));
    setSelectedDeleteProjectKeys(keys => keys.filter(key => key !== projectKey));
  };

  const toggleDeleteProjectSelection = (projectKey) => {
    setSelectedDeleteProjectKeys(keys => (
      keys.includes(projectKey)
        ? keys.filter(key => key !== projectKey)
        : [...keys, projectKey]
    ));
    setSelectedVolumeProjectKeys(keys => keys.filter(key => key !== projectKey));
  };

  const getProjectInventoryLabel = (project) => {
    if (project.kind === 'business') {
      const serviceLabels = {
        ITSM: 'IT Service Management',
        HRSM: 'HR Service Management',
        CSM: 'Customer Service Management',
      };
      return serviceLabels[project.jsmServiceType] || project.detailLabel || 'Jira Service Management';
    }

    if (project.kind === 'software') {
      const template = project.softwareTemplate === 'kanban'
        ? 'Kanban'
        : project.softwareTemplate === 'scrum'
          ? 'Scrum'
          : project.softwareTemplate === 'bug-tracking'
            ? 'Bug Tracking'
            : 'Project';
      return `Software Projects - ${template}`;
    }

    if (project.kind === 'business-project') {
      const option = spaceTypeOptions.find(item => item.value === `business:${project.businessSpaceType}`);
      return `${option?.group || project.categoryLabel || 'Business'} - ${project.detailLabel || option?.label || 'Task Tracking'}`;
    }

    if (project.kind === 'product-discovery') {
      return 'Jira Product Discovery';
    }

    if (project.categoryLabel && project.detailLabel) {
      return `${project.categoryLabel} - ${project.detailLabel}`;
    }

    return project.projectTypeKey || project.kind || 'Project';
  };

  const selectedSpaceTypeOption = spaceTypeOptions.find(option => option.value === form.spaceType);
  const selectedSpaceTypeLabel = selectedSpaceTypeOption?.label || '';
  const addSelectedSpaceButtonLabel = 'Add selected space';
  const isSelectedJsmSpace = form.spaceType.startsWith('jsm:');
  const isSelectedSoftwareSpace = form.spaceType.startsWith('software:');
  const isSelectedBugTrackingSpace = form.spaceType === 'software:bug-tracking';
  const isSelectedBusinessSpace = form.spaceType.startsWith('business:');
  const isSelectedJpdSpace = form.spaceType === 'jpd:product-discovery';

  const addSelectedSpace = () => {
    if (isSelectedJsmSpace) {
      const serviceType = form.spaceType.replace(/^jsm:/, '');
      setForm({
        ...form,
        jsmServiceTypes: [...form.jsmServiceTypes, serviceType],
      });
      setSelectionFeedback(`${selectedSpaceTypeLabel} added below. It will create 60 incidents, 60 problems, 60 changes, and 60 service requests with relationship links, queues, forms, knowledge base, SLA/report fields, and dashboards.`);
      return;
    }

    if (isSelectedSoftwareSpace) {
      const softwareTemplate = form.spaceType.replace(/^software:/, '');
      const isBugTrackingTemplate = softwareTemplate === 'bug-tracking';
      setForm({
        ...form,
        softwareProjects: [
          ...form.softwareProjects,
          {
            softwareTemplate,
            softwareProjectStyle: isBugTrackingTemplate ? '' : form.softwareProjectStyle || 'team-managed',
            issuesPerProject: DEFAULT_DEMO_ISSUE_COUNT,
          },
        ],
      });
      setSelectionFeedback(`${selectedSpaceTypeLabel} added below. It will create 60 software issues with releases, bugs, dependencies, timeline fields, ${isBugTrackingTemplate ? 'bug triage/review flow' : 'sprints or Kanban flow'}, Compass/Goals links where configured, development activity, and dashboards.`);
      return;
    }

    if (isSelectedBusinessSpace) {
      const businessSpaceType = form.spaceType.replace(/^business:/, '');
      setForm({
        ...form,
        businessProjects: [
          ...form.businessProjects,
          {
            businessSpaceType,
            issuesPerProject: DEFAULT_DEMO_ISSUE_COUNT,
          },
        ],
      });
      setSelectionFeedback(`${selectedSpaceTypeLabel} added below. It will create 60 realistic work-management items with due dates, generated custom dates, labels, relationship links, comments, and domain-specific tracking fields where Jira allows them.`);
      return;
    }

    if (isSelectedJpdSpace) {
      setSelectionFeedback(PRODUCT_DISCOVERY_VOLUME_ONLY_MESSAGE);
    }
  };

  const deleteSelectedDomainProjects = async () => {
    if (selectedDeleteProjectKeys.length === 0) {
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedDeleteProjectKeys.length} selected Jira project(s)?\n\n${selectedDeleteProjectKeys.join(', ')}\n\nThis cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setLoading(true);
    setProgress('Deleting selected Jira projects...');
    setResult('');
    setIsSuccess(false);

    try {
      const response = await invoke('deleteBusinessDomainProjects', {
        projectKeys: selectedDeleteProjectKeys,
      });
      setResult(response.summary || 'Delete request completed.');
      setIsSuccess(Boolean(response.success));
      const deletedKeys = new Set(response.deleted || selectedDeleteProjectKeys);
      setSelectedDeleteProjectKeys([]);
      setSelectedVolumeProjectKeys(keys => keys.filter(key => !deletedKeys.has(key)));
      await loadDomainInventory(form);
    } catch (err) {
      setResult(`Delete request failed: ${err.message}`);
      setIsSuccess(false);
    } finally {
      setProgress('');
      setLoading(false);
    }
  };

  const addJsmProject = () => {
    if (selectedJsmProjectCount >= 10) {
      return;
    }

    setForm({
      ...form,
      jsmServiceTypes: [...form.jsmServiceTypes, 'ITSM'],
    });
  };

  const updateJsmServiceType = (index, value) => {
    const nextJsmServiceTypes = form.jsmServiceTypes.map((serviceType, serviceIndex) => (
      serviceIndex === index ? value : serviceType
    ));
    const availableOptions = getJsmDashboardOptions(nextJsmServiceTypes);
    const selectedValues = filterDashboardValues(availableOptions, form.opsDashboardTypes);
    setForm({
      ...form,
      jsmServiceTypes: nextJsmServiceTypes,
      opsDashboardTypes: selectedValues,
      opsDashboardPrompt: buildDashboardPromptFromValues(availableOptions, selectedValues),
    });
  };

  const removeJsmProject = (index) => {
    const nextJsmServiceTypes = form.jsmServiceTypes.filter((_, serviceIndex) => serviceIndex !== index);
    const availableOptions = getJsmDashboardOptions(nextJsmServiceTypes);
    const selectedValues = filterDashboardValues(availableOptions, form.opsDashboardTypes);

    setForm({
      ...form,
      jsmServiceTypes: nextJsmServiceTypes,
      ...(nextJsmServiceTypes.length === 0 ? {
        opsDashboardTypes: [],
        opsDashboardPrompt: '',
      } : {
        opsDashboardTypes: selectedValues,
        opsDashboardPrompt: buildDashboardPromptFromValues(availableOptions, selectedValues),
      }),
    });

    if (nextJsmServiceTypes.length === 0 && openDashboardPicker === 'ops') {
      setOpenDashboardPicker(null);
    }
  };

  const updateSoftwareProject = (index, field, value) => {
    const updatedProjects = form.softwareProjects.map((project, projectIndex) => {
      if (projectIndex !== index) {
        return project;
      }

      const nextProject = { ...project, [field]: value };
      if (field === 'softwareTemplate' && value === 'bug-tracking') {
        return { ...nextProject, softwareProjectStyle: '' };
      }
      if (field === 'softwareTemplate' && value && !nextProject.softwareProjectStyle) {
        return { ...nextProject, softwareProjectStyle: 'team-managed' };
      }
      return nextProject;
    });
    const availableOptions = getSoftwareDashboardOptions(updatedProjects);
    const selectedValues = filterDashboardValues(availableOptions, form.softwareDashboardTypes);

    setForm({
      ...form,
      softwareProjects: updatedProjects,
      softwareDashboardTypes: selectedValues,
      softwareDashboardPrompt: buildDashboardPromptFromValues(availableOptions, selectedValues),
    });
  };

  const addSoftwareProject = () => {
    if (form.softwareProjects.length >= 10) {
      return;
    }

    const source = {
      softwareTemplate: '',
      softwareProjectStyle: '',
      issuesPerProject: DEFAULT_DEMO_ISSUE_COUNT,
    };

    setForm({
      ...form,
      softwareProjects: [...form.softwareProjects, { ...source }],
    });
  };

  const removeSoftwareProject = (index) => {
    const updatedProjects = form.softwareProjects.filter((_, projectIndex) => projectIndex !== index);
    const availableOptions = getSoftwareDashboardOptions(updatedProjects);
    const selectedValues = filterDashboardValues(availableOptions, form.softwareDashboardTypes);

    setForm({
      ...form,
      softwareProjects: updatedProjects,
      softwareDashboardTypes: selectedValues,
      softwareDashboardPrompt: buildDashboardPromptFromValues(availableOptions, selectedValues),
    });
  };

  const removeBusinessProject = (index) => {
    const updatedProjects = form.businessProjects.filter((_, projectIndex) => projectIndex !== index);
    const availableOptions = getBusinessDashboardOptions(updatedProjects);
    const selectedValues = filterDashboardValues(availableOptions, form.businessDashboardTypes);
    setForm({
      ...form,
      businessProjects: updatedProjects,
      businessDashboardTypes: selectedValues,
      businessDashboardPrompt: buildDashboardPromptFromValues(availableOptions, selectedValues),
    });
  };

  const removeProductDiscoveryProject = (index) => {
    const updatedProjects = form.productDiscoveryProjects.filter((_, projectIndex) => projectIndex !== index);
    const availableOptions = getProductDiscoveryDashboardOptions(updatedProjects);
    const selectedValues = filterDashboardValues(availableOptions, form.productDiscoveryDashboardTypes);
    setForm({
      ...form,
      productDiscoveryProjects: updatedProjects,
      productDiscoveryDashboardTypes: selectedValues,
      productDiscoveryDashboardPrompt: buildDashboardPromptFromValues(availableOptions, selectedValues),
    });
  };

  const getDashboardSelectionLabel = (options, selectedValues, emptyLabel) => {
    const selectedLabels = selectedValues
      .map(value => options.find(option => option.value === value)?.label)
      .filter(Boolean);

    if (selectedLabels.length === 0) {
      return emptyLabel;
    }

    if (selectedLabels.length <= 2) {
      return selectedLabels.join(', ');
    }

    return `${selectedLabels.slice(0, 2).join(', ')} +${selectedLabels.length - 2} more`;
  };

  const renderDashboardMultiDropdown = ({
    id,
    options,
    selectedValues,
    fieldName,
    promptFieldName,
    disabled = false,
    emptyLabel,
  }) => (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpenDashboardPicker(openDashboardPicker === id ? null : id)}
        style={{
          ...pickerButtonStyle,
          backgroundColor: disabled ? '#f4f5f7' : '#fff',
          color: disabled ? '#6b778c' : '#172b4d',
        }}
      >
        <span>{getDashboardSelectionLabel(options, selectedValues, emptyLabel)}</span>
        <span aria-hidden="true">{openDashboardPicker === id ? '^' : 'v'}</span>
      </button>
      {openDashboardPicker === id && !disabled && (
        <div style={pickerMenuStyle}>
          {options.filter(option => option.value).map(option => (
            <label
              key={option.value}
              style={{ ...pickerOptionStyle, cursor: 'pointer' }}
              onClick={(event) => {
                event.preventDefault();
                toggleDashboardSelection(fieldName, promptFieldName, options, option.value);
              }}
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(option.value)}
                readOnly
                tabIndex={-1}
                style={{ pointerEvents: 'none' }}
              />
              <span style={{ flex: 1 }}>{option.label}</span>
              <span
                title={option.prompt}
                aria-label={`Information about ${option.label}`}
                style={infoIconStyle}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                i
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );

  const renderItsmCountField = (name, label, min = 0) => (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type="number"
        name={name}
        min={String(min)}
        max="60"
        value={form[name]}
        onChange={handleChange}
        style={inputStyle}
      />
    </div>
  );

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Jira Instance - Demo Data Setup</h1>
          <p style={{ ...subtitleStyle, fontStyle: 'italic' }}>Create the demo environment in minutes</p>
        </div>
        <div style={{ ...sectionStyle, marginTop: 0, borderColor: '#0052cc', backgroundColor: '#f4f8ff' }}>
          <div style={sectionTitleStyle}>Demo Agent</div>
          <div style={{ color: '#42526e', fontSize: '13px', marginBottom: '12px' }}>
            Ask for the environment in plain English. The agent will ask for missing details, then run the full backend setup flow and show live progress.
          </div>
          <div style={{ display: 'grid', gap: '10px', marginBottom: '12px', maxHeight: '260px', overflowY: 'auto', paddingRight: '4px' }}>
            {agentMessages.map((message, index) => (
              <div
                key={`agent-message-${index}`}
                style={{
                  justifySelf: message.role === 'user' ? 'end' : 'start',
                  maxWidth: '86%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  whiteSpace: 'pre-wrap',
                  fontSize: '13px',
                  lineHeight: '18px',
                  color: message.role === 'user' ? '#ffffff' : '#172b4d',
                  backgroundColor: message.role === 'user' ? '#0052cc' : '#ffffff',
                  border: message.role === 'user' ? '1px solid #0052cc' : '1px solid #dfe1e6',
                }}
              >
                {message.text}
                {message.options?.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                    {message.options.map(option => (
                      <button
                        key={`${message.field}-${option.value}`}
                        type="button"
                        disabled={agentLoading || loading}
                        onClick={() => handleAgentOptionSelect(message.field, option.value, option.label)}
                        style={{
                          border: '1px solid #0052cc',
                          backgroundColor: '#ffffff',
                          color: '#0052cc',
                          borderRadius: '4px',
                          padding: '7px 10px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: agentLoading || loading ? 'not-allowed' : 'pointer',
                          opacity: agentLoading || loading ? 0.6 : 1,
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px', gap: '10px', alignItems: 'start' }}>
            <textarea
              value={agentRequest}
              onChange={(event) => setAgentRequest(event.target.value)}
              placeholder="Create an ITSM demo for Banking & Insurance, reusing existing spaces first"
              rows={3}
              disabled={agentLoading || loading}
              style={{
                ...inputStyle,
                resize: 'vertical',
                minHeight: '72px',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="button"
              onClick={handleAgentSubmit}
              disabled={agentLoading || loading || !agentRequest.trim()}
              style={{
                ...buttonStyle,
                width: '150px',
                padding: '12px 14px',
                fontSize: '14px',
                opacity: agentLoading || loading || !agentRequest.trim() ? 0.65 : 1,
              }}
            >
              {agentLoading ? 'Running...' : 'Run agent'}
            </button>
          </div>
        </div>
        <div style={{ ...fieldStyle, display: 'grid', gridTemplateColumns: form.industry === 'Other' ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: '16px', alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>
              Business Domain
              <span
                title="The selected business domain determines the type of project data, ticket summaries, workflows, dashboards, and reports generated."
                aria-label="Business domain information"
                style={{ ...infoIconStyle, marginLeft: '8px', width: '14px', height: '14px', fontSize: '10px', lineHeight: '14px' }}
              >
                i
              </span>
            </label>
            <select
              name="industry"
              value={form.industry}
              onChange={handleChange}
              style={selectStyle}
            >
              <option value="">Select Domain</option>
              {industries.map(ind => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
              <option value="Other">Others</option>
            </select>
          </div>
          {form.industry === 'Other' && (
            <div>
              <label style={labelStyle}>Custom Domain</label>
              <input
                type="text"
                name="customIndustry"
                value={form.customIndustry}
                onChange={handleChange}
                placeholder="Type the domain you want"
                style={inputStyle}
              />
            </div>
          )}
          <div>
            <label style={labelStyle}>Space Type</label>
            <select
              name="spaceType"
              value={form.spaceType}
              onChange={handleChange}
              style={selectStyle}
              disabled={!getSelectedIndustry(form)}
            >
              <option value="">Select space type</option>
              {Object.entries(groupedSpaceTypeOptions).map(([groupLabel, options]) => (
                <optgroup key={groupLabel} label={groupLabel}>
                  {options.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {(domainInventoryLoading || domainInventory) && (
          <div style={{ ...optionalSectionStyle, marginTop: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '10px' }}>
              <div style={sectionTitleStyle}>Matching existing spaces</div>
              <button type="button" onClick={() => loadDomainInventory(form)} disabled={domainInventoryLoading} style={{ ...removeButtonStyle, padding: '8px 12px' }}>
                {domainInventoryLoading ? 'Checking...' : 'Refresh'}
              </button>
            </div>
            <div style={{ color: domainInventory?.success === false ? '#bf2600' : '#42526e', fontSize: '13px', marginBottom: domainInventory?.projects?.length ? '12px' : 0 }}>
              {domainInventoryLoading ? 'Checking Jira for matching projects...' : domainInventory?.summary || domainInventory?.message}
            </div>
            {domainInventory?.projects?.length > 0 && (
              <div style={{ display: 'grid', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '10px', border: '1px solid #dfe1e6', borderRadius: '4px', backgroundColor: '#fff' }}>
                  <div style={{ color: '#42526e', fontSize: '13px' }}>
                    Select individual projects to add a new demo volume batch or delete old demo projects. JSM volume means 60 incidents, 60 problems, 60 changes, and 60 service requests per selected JSM project; Software volume means 60 issues per selected software project.
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleSubmit({ volumeOnly: true })}
                      disabled={loading || selectedVolumeProjectKeys.length === 0}
                      style={{
                        ...buttonStyle,
                        minWidth: '190px',
                        width: 'auto',
                        padding: '11px 18px',
                        fontSize: '14px',
                        backgroundColor: selectedVolumeProjectKeys.length ? '#0052cc' : '#f4f5f7',
                        color: selectedVolumeProjectKeys.length ? '#ffffff' : '#6b778c',
                        border: `1px solid ${selectedVolumeProjectKeys.length ? '#0052cc' : '#dfe1e6'}`,
                        boxShadow: selectedVolumeProjectKeys.length ? '0 2px 5px rgba(9, 30, 66, 0.25)' : 'none',
                        fontWeight: 700,
                        opacity: loading || selectedVolumeProjectKeys.length === 0 ? 0.7 : 1,
                      }}
                    >
                      Add volume selected ({selectedVolumeProjectKeys.length})
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelectedDomainProjects}
                      disabled={loading || selectedDeleteProjectKeys.length === 0}
                      style={{
                        ...buttonStyle,
                        minWidth: '180px',
                        width: 'auto',
                        padding: '11px 18px',
                        fontSize: '14px',
                        backgroundColor: selectedDeleteProjectKeys.length ? '#de350b' : '#f4f5f7',
                        color: selectedDeleteProjectKeys.length ? '#ffffff' : '#6b778c',
                        border: `1px solid ${selectedDeleteProjectKeys.length ? '#de350b' : '#dfe1e6'}`,
                        boxShadow: selectedDeleteProjectKeys.length ? '0 2px 5px rgba(9, 30, 66, 0.25)' : 'none',
                        fontWeight: 700,
                        opacity: loading || selectedDeleteProjectKeys.length === 0 ? 0.7 : 1,
                      }}
                    >
                      Delete selected ({selectedDeleteProjectKeys.length})
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '88px 72px 90px minmax(0, 1fr) 170px 90px', gap: '10px', alignItems: 'center', padding: '8px 10px', color: '#42526e', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
                  <span>Add</span>
                  <span>Delete</span>
                  <span>Key</span>
                  <span>Project</span>
                  <span>Type</span>
                  <span>Items</span>
                </div>
                {domainInventory.projects.map(project => (
                  (() => {
                    const canAddVolume = ['business', 'software', 'business-project', 'product-discovery'].includes(project.kind);
                    return (
                  <div key={project.key} style={{ display: 'grid', gridTemplateColumns: '88px 72px 90px minmax(0, 1fr) 170px 90px', gap: '10px', alignItems: 'center', padding: '10px', border: '1px solid #dfe1e6', borderRadius: '4px', backgroundColor: '#fafbfc', fontSize: '13px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        disabled={!canAddVolume}
                        checked={selectedVolumeProjectKeys.includes(project.key)}
                        onChange={() => toggleVolumeProjectSelection(project.key)}
                      />
                      <span>{canAddVolume ? 'Volume' : 'N/A'}</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedDeleteProjectKeys.includes(project.key)}
                        onChange={() => toggleDeleteProjectSelection(project.key)}
                      />
                      <span>Delete</span>
                    </label>
                    <strong>{project.key}</strong>
                    <span>{project.name}</span>
                    <span>{getProjectInventoryLabel(project)}</span>
                    <span>
                      {Number.isFinite(Number(project.issueCount))
                        ? `${Number(project.issueCount)} items`
                        : 'count unavailable'}
                    </span>
                  </div>
                    );
                  })()
                ))}
              </div>
            )}
          </div>
        )}

        {form.spaceType && (
          <div style={{ ...sectionStyle, marginTop: '16px' }}>
            <div style={sectionTitleStyle}>Add selected space</div>
            <div style={{ color: '#42526e', fontSize: '13px', marginBottom: '12px' }}>
              Add {selectedSpaceTypeLabel} for {getSelectedIndustry(form)}. You can switch the dropdown and add multiple space types before creating the demo.
            </div>
            {isSelectedSoftwareSpace && !isSelectedBugTrackingSpace && (
              <div style={{ ...fieldStyle, maxWidth: '260px' }}>
                <label style={labelStyle}>Management</label>
                <select
                  name="softwareProjectStyle"
                  value={form.softwareProjectStyle}
                  onChange={handleChange}
                  style={selectStyle}
                >
                  <option value="team-managed">Team-managed</option>
                  <option value="company-managed">Company-managed</option>
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={addSelectedSpace}
              style={{
                ...buttonStyle,
                width: 'auto',
                minWidth: '180px',
                maxWidth: '100%',
                padding: '10px 18px',
                fontSize: '14px',
                whiteSpace: 'normal',
                lineHeight: '18px',
              }}
            >
              {addSelectedSpaceButtonLabel}
            </button>
            {selectionFeedback && (
              <div style={{ color: '#42526e', fontSize: '13px', marginTop: '10px', padding: '10px', border: '1px solid #dfe1e6', borderRadius: '4px', backgroundColor: '#fff' }}>
                {selectionFeedback}
              </div>
            )}
          </div>
        )}

        <div style={fieldStyle}>
          <label style={labelStyle}>
            Ticket Data Duration
            <span
              title="The selected duration determines how ticket creation, resolution, trends, and SLA metrics are distributed across weeks/months."
              aria-label="Ticket data duration information"
              style={{ ...infoIconStyle, marginLeft: '8px', width: '14px', height: '14px', fontSize: '10px', lineHeight: '14px' }}
            >
              i
            </span>
          </label>
          <select
            name="dateRange"
            value={form.dateRange}
            onChange={handleChange}
            style={{ ...selectStyle, maxWidth: '220px' }}
          >
            <option value="3 months">3 months</option>
            <option value="6 months">6 months</option>
            <option value="12 months">12 months</option>
          </select>
        </div>

        {form.jsmServiceTypes.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Jira Service Management</div>
          <div style={{ color: '#42526e', fontSize: '13px', marginBottom: '12px' }}>
            Select the JSM service areas to reuse or create. Each selected service area uses 60 incidents, 60 problems, 60 changes, and 60 service requests connected for reports and dashboards.
          </div>
          <div style={{ marginBottom: selectedJsmProjectCount > 0 ? '12px' : 0 }}>
            <button type="button" onClick={addJsmProject} disabled={selectedJsmProjectCount >= 10} style={{ ...buttonStyle, width: '220px', padding: '10px 18px', fontSize: '14px', whiteSpace: 'nowrap' }}>
              Add JSM Service
            </button>
          </div>
          {form.jsmServiceTypes.map((serviceType, index) => (
            <div key={`jsm-project-${index}`} style={projectCardStyle}>
              <div style={{ ...jsmProjectRowStyle, gridTemplateColumns: '150px minmax(170px, 1fr) minmax(0, 1fr) 82px' }}>
                <div style={{ fontWeight: 600, color: '#172b4d', paddingBottom: '10px', whiteSpace: 'nowrap' }}>
                  JSM Service {index + 1}
                </div>
                <div>
                  <label style={labelStyle}>Service Type</label>
                  <select
                    value={serviceType}
                    onChange={(event) => updateJsmServiceType(index, event.target.value)}
                    style={selectStyle}
                  >
                    {jsmServiceTypeOptions.map(option => (
                      <option key={option} value={option}>{jsmServiceTypeLabels[option] || option}</option>
                    ))}
                  </select>
                </div>
                <div style={{ color: '#42526e', fontSize: '13px', paddingBottom: '10px' }}>
                  60 incidents, 60 problems, 60 changes, 60 service requests, relationship links, queues, forms, knowledge base, SLA/report fields
                </div>
                <button type="button" onClick={() => removeJsmProject(index)} style={removeButtonStyle}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          {selectedJsmProjectCount > 0 && (
            <div style={{ ...optionalSectionStyle, marginTop: '16px', marginBottom: 0 }}>
              <div style={{ ...fieldStyle, marginBottom: 0 }}>
                <label style={labelStyle}>Dashboard - Ops / Service Management</label>
                {renderDashboardMultiDropdown({
                  id: 'ops',
                  options: jsmDashboardOptions,
                  selectedValues: form.opsDashboardTypes,
                  fieldName: 'opsDashboardTypes',
                  promptFieldName: 'opsDashboardPrompt',
                  emptyLabel: 'Choose service management dashboards',
                })}
              </div>
            </div>
          )}
        </div>
        )}

        {form.businessProjects.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Business / Category Spaces</div>
          <div style={{ color: '#42526e', fontSize: '13px', marginBottom: '12px' }}>
            Each selected category space creates 60 domain-specific work items with due dates, generated custom dates, comments, relationship links, and tracking labels.
          </div>
          {form.businessProjects.map((project, index) => (
            <div key={`business-project-${index}`} style={projectCardStyle}>
              <div style={{ ...softwareProjectRowStyle, gridTemplateColumns: '170px minmax(170px, 1fr) minmax(0, 1fr) 82px' }}>
                <div style={{ fontWeight: 600, color: '#172b4d', paddingBottom: '10px', whiteSpace: 'nowrap' }}>
                  Business Space {index + 1}
                </div>
                <div style={{ color: '#172b4d', fontSize: '14px', paddingBottom: '10px', fontWeight: 600 }}>
                  {(() => {
                    const option = spaceTypeOptions.find(item => item.value === `business:${project.businessSpaceType}`);
                    return `${option?.group || 'Business'} - ${option?.label || 'Task Tracking'}`;
                  })()}
                </div>
                <div style={{ color: '#42526e', fontSize: '13px', paddingBottom: '10px' }}>
                  60 work items with schedule data, owner-ready fields, dependencies, and comments
                </div>
                <button type="button" onClick={() => removeBusinessProject(index)} style={removeButtonStyle}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          {businessDashboardOptions.length > 0 && (
            <div style={{ ...optionalSectionStyle, marginTop: '16px', marginBottom: 0 }}>
              <div style={{ ...fieldStyle, marginBottom: 0 }}>
                <label style={labelStyle}>Dashboard - Business / Category</label>
                {renderDashboardMultiDropdown({
                  id: 'business',
                  options: businessDashboardOptions,
                  selectedValues: form.businessDashboardTypes,
                  fieldName: 'businessDashboardTypes',
                  promptFieldName: 'businessDashboardPrompt',
                  emptyLabel: 'Choose matching category dashboards',
                })}
              </div>
            </div>
          )}
        </div>
        )}

        {form.productDiscoveryProjects.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Jira Product Discovery</div>
          <div style={{ color: '#42526e', fontSize: '13px', marginBottom: '12px' }}>
            Each selected Product Discovery space creates 60 discovery ideas with opportunity, impact, roadmap, comments, and relationship signals where Jira allows them.
          </div>
          {form.productDiscoveryProjects.map((project, index) => (
            <div key={`jpd-project-${index}`} style={projectCardStyle}>
              <div style={{ ...softwareProjectRowStyle, gridTemplateColumns: '170px minmax(170px, 1fr) minmax(0, 1fr) 82px' }}>
                <div style={{ fontWeight: 600, color: '#172b4d', paddingBottom: '10px', whiteSpace: 'nowrap' }}>
                  Discovery Space {index + 1}
                </div>
                <div style={{ color: '#172b4d', fontSize: '14px', paddingBottom: '10px', fontWeight: 600 }}>
                  Jira Product Discovery
                </div>
                <div style={{ color: '#42526e', fontSize: '13px', paddingBottom: '10px' }}>
                  60 product ideas with discovery labels, roadmap dates, comments, and links
                </div>
                <button type="button" onClick={() => removeProductDiscoveryProject(index)} style={removeButtonStyle}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          {productDiscoveryDashboardOptions.length > 0 && (
            <div style={{ ...optionalSectionStyle, marginTop: '16px', marginBottom: 0 }}>
              <div style={{ ...fieldStyle, marginBottom: 0 }}>
                <label style={labelStyle}>Dashboard - Product Discovery</label>
                {renderDashboardMultiDropdown({
                  id: 'product-discovery',
                  options: productDiscoveryDashboardOptions,
                  selectedValues: form.productDiscoveryDashboardTypes,
                  fieldName: 'productDiscoveryDashboardTypes',
                  promptFieldName: 'productDiscoveryDashboardPrompt',
                  emptyLabel: 'Choose product discovery dashboard',
                })}
              </div>
            </div>
          )}
        </div>
        )}

        {form.softwareProjects.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Jira Software (Dev)</div>
          <div style={{ color: '#42526e', fontSize: '13px', marginBottom: '12px' }}>
            Select Scrum/Kanban projects to reuse or create. Each selected software project uses 60 default issues with releases, sprints or flow data, dependencies, bugs, Compass, Goals, development activity, and dashboards.
          </div>
          <div style={{ marginBottom: '12px' }}>
            <button type="button" onClick={addSoftwareProject} disabled={selectedSoftwareProjectCount >= 10} style={{ ...buttonStyle, width: '220px', padding: '10px 18px', fontSize: '14px', whiteSpace: 'nowrap' }}>
              Add Project
            </button>
          </div>
          {form.softwareProjects.map((project, index) => (
            <div key={`software-project-${index}`} style={projectCardStyle}>
              <div style={{ ...softwareProjectRowStyle, gridTemplateColumns: project.softwareTemplate === 'bug-tracking' ? '150px minmax(150px, 1fr) minmax(0, 1fr) 82px' : '150px minmax(150px, 1fr) minmax(170px, 1fr) minmax(0, 1fr) 82px' }}>
                <div style={{ fontWeight: 600, color: '#172b4d', paddingBottom: '10px', whiteSpace: 'nowrap' }}>
                  Software Project {index + 1}
                </div>
                <div>
                  <label style={labelStyle}>Project Template</label>
                  <select
                    value={project.softwareTemplate}
                    onChange={(event) => updateSoftwareProject(index, 'softwareTemplate', event.target.value)}
                    style={selectStyle}
                  >
                    <option value="">Select template</option>
                    <option value="scrum">Scrum</option>
                    <option value="kanban">Kanban</option>
                    <option value="bug-tracking">Bug Tracking</option>
                  </select>
                </div>
                {project.softwareTemplate !== 'bug-tracking' && (
                <div>
                  <label style={labelStyle}>Management</label>
                  <select
                    value={project.softwareProjectStyle}
                    onChange={(event) => updateSoftwareProject(index, 'softwareProjectStyle', event.target.value)}
                    style={selectStyle}
                  >
                    <option value="">Select management</option>
                    <option value="team-managed">Team-managed</option>
                    <option value="company-managed">Company-managed</option>
                  </select>
                </div>
                )}
                <div style={{ color: '#42526e', fontSize: '13px', paddingBottom: '10px' }}>
                  {project.softwareTemplate === 'bug-tracking'
                    ? '60 bug tracking issues with triage, review, dependencies, timeline, and development signals'
                    : '60 default issues with release versions, bugs, dependencies, timeline, and development signals'}
                </div>
                <button type="button" onClick={() => removeSoftwareProject(index)} style={removeButtonStyle}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          {selectedSoftwareProjectCount > 0 && (
            <div style={{ ...optionalSectionStyle, marginTop: '16px', marginBottom: 0 }}>
              <div style={{ ...fieldStyle, marginBottom: 0 }}>
                <label style={labelStyle}>Dashboard - Software</label>
                {renderDashboardMultiDropdown({
                  id: 'software',
                  options: softwareDashboardOptions,
                  selectedValues: form.softwareDashboardTypes,
                  fieldName: 'softwareDashboardTypes',
                  promptFieldName: 'softwareDashboardPrompt',
                  emptyLabel: 'Choose software dashboards',
                })}
              </div>
            </div>
          )}
        </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={buttonStyle}
          onMouseOver={(e) => { if (!loading) e.target.style.backgroundColor = '#0065ff'; }}
          onMouseOut={(e) => { e.target.style.backgroundColor = '#0052cc'; }}
        >
          {loading ? 'Creating Demo Environment...' : 'CREATE DEMO ENVIRONMENT'}
        </button>

        {progress && <div style={progressStyle}>{progress}</div>}

        {result && <div style={resultStyle}>{result}</div>}
      </div>
    </div>
  );
}

export default App;
