import React, { useState } from 'react';
import { invoke } from '@forge/bridge';

const industries = ['Banking', 'Healthcare', 'Retail', 'SaaS', 'Manufacturing'];

const industryDescriptions = {
  Banking: 'Core Banking, Payments, Compliance',
  Healthcare: 'Patient Management, Clinical Systems',
  Retail: 'E-commerce, Inventory, Customer Experience',
  SaaS: 'Platform, API, Enterprise Features',
  Manufacturing: 'Production, Supply Chain, Quality',
};

function App() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [progress, setProgress] = useState('');

  const [form, setForm] = useState({
    industry: 'Banking',
    environmentName: '',
    jsmProjectCount: 1,
    incidentsPerProject: 5,
    softwareProjectCount: 1,
    issuesPerProject: 10,
    sprintsPerProject: 1,
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async () => {
    if (!form.environmentName.trim()) {
      setResult('Please enter an Environment Name');
      return;
    }

    setLoading(true);
    setResult('');
    setIsSuccess(false);
    setProgress('Starting environment creation...');

    try {
      setProgress('Creating JSM projects with incidents...');

      const res = await invoke('createDemoEnvironment', {
        industry: form.industry,
        environmentName: form.environmentName,
        jsmProjectCount: parseInt(form.jsmProjectCount, 10),
        incidentsPerProject: parseInt(form.incidentsPerProject, 10),
        softwareProjectCount: parseInt(form.softwareProjectCount, 10),
        issuesPerProject: parseInt(form.issuesPerProject, 10),
        sprintsPerProject: parseInt(form.sprintsPerProject, 10),
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
    maxWidth: '600px',
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

  const industryInfoStyle = {
    fontSize: '12px',
    color: '#5e6c84',
    marginTop: '4px',
  };

  const rowStyle = {
    display: 'flex',
    gap: '16px',
  };

  const colStyle = {
    flex: 1,
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

  const resultStyle = {
    marginTop: '24px',
    padding: '16px',
    borderRadius: '4px',
    fontSize: '13px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    backgroundColor: isSuccess ? '#e3fcef' : '#ffebe6',
    border: '1px solid',
    borderColor: isSuccess ? '#00875a' : '#ff5630',
    color: isSuccess ? '#006644' : '#ff5630',
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

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Cprime Demo Environment Creator</h1>
          <p style={subtitleStyle}>Create a complete Jira demo environment in minutes</p>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Industry</label>
          <select
            name="industry"
            value={form.industry}
            onChange={handleChange}
            style={selectStyle}
          >
            {industries.map(ind => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
          <div style={industryInfoStyle}>{industryDescriptions[form.industry]}</div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Environment Name</label>
          <input
            type="text"
            name="environmentName"
            value={form.environmentName}
            onChange={handleChange}
            placeholder="e.g., Acme Bank Q2 Demo"
            style={inputStyle}
          />
        </div>

        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Jira Service Management (ITSM)</div>
          <div style={rowStyle}>
            <div style={colStyle}>
              <label style={labelStyle}>JSM Projects (1-3)</label>
              <input
                type="number"
                name="jsmProjectCount"
                min="1"
                max="3"
                value={form.jsmProjectCount}
                onChange={handleChange}
                style={inputStyle}
              />
            </div>
            <div style={colStyle}>
              <label style={labelStyle}>Incidents per Project (5-20)</label>
              <input
                type="number"
                name="incidentsPerProject"
                min="5"
                max="20"
                value={form.incidentsPerProject}
                onChange={handleChange}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Jira Software (Dev)</div>
          <div style={rowStyle}>
            <div style={colStyle}>
              <label style={labelStyle}>Software Projects (1-5)</label>
              <input
                type="number"
                name="softwareProjectCount"
                min="1"
                max="5"
                value={form.softwareProjectCount}
                onChange={handleChange}
                style={inputStyle}
              />
            </div>
            <div style={colStyle}>
              <label style={labelStyle}>Issues per Project (10-30)</label>
              <input
                type="number"
                name="issuesPerProject"
                min="10"
                max="30"
                value={form.issuesPerProject}
                onChange={handleChange}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ marginTop: '16px' }}>
            <label style={labelStyle}>Sprints per Project (1-4)</label>
            <input
              type="number"
              name="sprintsPerProject"
              min="1"
              max="4"
              value={form.sprintsPerProject}
              onChange={handleChange}
              style={{ ...inputStyle, maxWidth: '200px' }}
            />
          </div>
        </div>

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