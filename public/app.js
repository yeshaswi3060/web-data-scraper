let schemaFields = [];
let activeProperty = null;
let agentState = 'idle';

// DOM Elements
const propertyNameInput = document.getElementById('propertyNameInput');
const startAgentBtn = document.getElementById('startAgentBtn');
const pauseAgentBtn = document.getElementById('pauseAgentBtn');
const clearDataBtn = document.getElementById('clearDataBtn');
const terminalLogs = document.getElementById('terminalLogs');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const activeProjectTitle = document.getElementById('activeProjectTitle');
const activeProjectSubtitle = document.getElementById('activeProjectSubtitle');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const sourcesBar = document.getElementById('sourcesBar');
const sourcesList = document.getElementById('sourcesList');

const statusRing = document.getElementById('statusRing');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const headerContainer = document.querySelector('.agent-status-panel');

window.addEventListener('DOMContentLoaded', () => {
  fetchData();
  setupSSE();
  bindFieldEdits();
});

// Setup tab switching
window.switchTab = function(tabId) {
  // Deactivate all tabs
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

  // Find the button calling this
  const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => 
    btn.getAttribute('onclick').includes(tabId)
  );
  if (activeBtn) activeBtn.classList.add('active');

  const activePane = document.getElementById(tabId);
  if (activePane) activePane.classList.add('active');
};

// Fetch current database state
async function fetchData() {
  try {
    const res = await fetch('/api/data');
    const data = await res.json();
    schemaFields = data.schemaFields;
    agentState = data.agentState;
    
    // Get the first property (since we are testing single property target)
    if (data.properties && data.properties.length > 0) {
      activeProperty = data.properties[0];
    } else {
      activeProperty = null;
    }

    updateStatusUI();
    renderPropertyDetails();
  } catch (err) {
    console.error('Error fetching data:', err);
  }
}

// Render dynamic fields inside grid
function renderPropertyDetails() {
  const tableBody = document.getElementById('dataTableBody');
  const progressCounter = document.getElementById('dataProgressCounter');
  if (!tableBody) return;

  if (!activeProperty) {
    activeProjectTitle.textContent = "No Project Target Set";
    activeProjectSubtitle.textContent = "Enter a property name on the left and run research.";
    exportCsvBtn.disabled = true;
    sourcesBar.classList.add('hidden');
    if (progressCounter) progressCounter.style.display = 'none';
    sourcesList.innerHTML = '';
    
    // Clear all fields in HTML table
    tableBody.innerHTML = schemaFields.map(field => `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid var(--border-color); font-weight: bold; opacity: 0.8;">${field}</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid var(--border-color);">-</td>
      </tr>
    `).join('');
    return;
  }

  // Set titles
  activeProjectTitle.textContent = activeProperty.name;
  
  let subtitle = `Status: ${activeProperty.status.toUpperCase()}`;
  if (activeProperty.status === 'processing') subtitle = 'Status: DEEP RESEARCH RUNNING...';
  if (activeProperty.error) subtitle += ` (Error: ${activeProperty.error})`;
  activeProjectSubtitle.textContent = subtitle;

  exportCsvBtn.disabled = activeProperty.status !== 'completed';

  // Render sources
  if (activeProperty.sources && activeProperty.sources.length > 0) {
    sourcesBar.classList.remove('hidden');
    sourcesList.innerHTML = '';
    activeProperty.sources.forEach((url, i) => {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.textContent = `Link ${i + 1}`;
      a.title = url;
      sourcesList.appendChild(a);
    });
  } else {
    sourcesBar.classList.add('hidden');
  }

  // Render Files Gallery
  const filesGallery = document.getElementById('filesGallery');
  const filesList = document.getElementById('filesList');
  if (filesGallery && filesList) {
    if (activeProperty.data && activeProperty.data.files && Array.isArray(activeProperty.data.files) && activeProperty.data.files.length > 0) {
      filesGallery.style.display = 'block';
      filesList.innerHTML = '';
      activeProperty.data.files.forEach(fileObj => {
         const hasUrl = !!(fileObj && fileObj.fileUrl && fileObj.fileUrl.startsWith('http'));
         const isImage = hasUrl && fileObj.fileUrl.match(/\.(jpeg|jpg|gif|png|webp|svg)($|\?)/i);
         
         const card = document.createElement(hasUrl ? 'a' : 'div');
         if (hasUrl) {
           card.href = fileObj.fileUrl;
           card.target = '_blank';
         }
         card.style = "display: flex; flex-direction: column; width: 140px; text-decoration: none; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; background: var(--panel-bg);";
         
         if (hasUrl && isImage) {
            card.innerHTML = `<div style="height: 90px; background: url('${fileObj.fileUrl}') center/cover no-repeat;"></div>
                              <div style="padding: 8px; font-size: 10px; color: var(--text-primary); font-weight: 500; text-align: center;">${fileObj.fileType || 'IMAGE'}</div>`;
         } else if (hasUrl) {
            card.innerHTML = `<div style="height: 90px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2); color: var(--primary); font-size: 24px;">📄</div>
                              <div style="padding: 8px; font-size: 10px; color: var(--text-primary); font-weight: 500; text-align: center;">${fileObj.fileType || 'DOCUMENT'}</div>`;
         } else {
            card.innerHTML = `<div style="height: 90px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.1); color: var(--text-secondary); font-size: 20px;">❓</div>
                              <div style="padding: 8px; font-size: 10px; color: var(--text-secondary); font-style: italic; font-weight: 500; text-align: center;">${fileObj.fileType || 'NOT FOUND'}</div>`;
         }
         filesList.appendChild(card);
      });
    } else {
      filesGallery.style.display = 'none';
    }
  }

  // Populate table rows dynamically and count filled data
  let filledCount = 0;
  
  tableBody.innerHTML = schemaFields.map(field => {
    if (field === 'files') return ''; // Skip files in table since it has a gallery

    let val = activeProperty.data && activeProperty.data[field] !== undefined ? activeProperty.data[field] : '';
    
    // Count logic: if it's not empty, not null, not "-" and not "Not sure"
    if (val !== '' && val !== null && val !== '-' && val !== 'Not sure') {
      filledCount++;
    }

    // Format JSON objects or arrays cleanly
    if (typeof val === 'object' && val !== null) {
      val = JSON.stringify(val);
    } else {
      val = val !== null ? val : '';
    }

    if (val === '') val = '-';

    return `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid var(--border-color); font-weight: bold; opacity: 0.8;">${field}</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid var(--border-color);">
          <div class="editable-val" id="val-${field}" contenteditable="true" style="width:100%; min-height: 24px;">${escapeHtml(val)}</div>
        </td>
      </tr>
    `;
  }).join('');

  // Update progress UI
  if (progressCounter) {
    progressCounter.style.display = 'block';
    progressCounter.textContent = `${filledCount} / ${schemaFields.length} Fields Extracted`;
    
    // Color coding based on completion ratio
    const ratio = filledCount / schemaFields.length;
    if (ratio < 0.3) {
      progressCounter.style.color = '#ef4444'; // Red
    } else if (ratio < 0.7) {
      progressCounter.style.color = '#eab308'; // Yellow
    } else {
      progressCounter.style.color = '#4ade80'; // Green
    }
  }

  // Re-bind editable listeners after recreating DOM elements
  bindFieldEdits();
}

// Bind blur event listeners to all contenteditable containers
function bindFieldEdits() {
  document.querySelectorAll('.editable-val').forEach(elem => {
    elem.addEventListener('blur', () => {
      if (!activeProperty) return;
      
      const idAttr = elem.getAttribute('id');
      const fieldName = idAttr.replace('val-', '');
      let newValue = elem.textContent.trim();

      // Normalize '-' empty value
      if (newValue === '-') newValue = '';

      // Send update request
      updateCellValue(activeProperty.id, fieldName, newValue);
    });

    elem.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        elem.blur();
      }
    });
  });
}

// Update single cell on server
async function updateCellValue(id, field, value) {
  try {
    const res = await fetch('/api/properties/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, field, value })
    });
    if (res.ok) {
      appendConsoleLog(`Updated manually: [${field}] to "${value}"`, 'system');
    }
  } catch (err) {
    console.error('Failed to update value:', err);
  }
}

// Start research for the property
async function startResearch() {
  const name = propertyNameInput.value.trim();
  if (!name) {
    alert('Please enter a target property name first.');
    return;
  }

  try {
    // 1. Add property to queue (which replaces current list)
    const addRes = await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (addRes.ok) {
      propertyNameInput.value = '';
      // 2. Start agent state
      const controlRes = await fetch('/api/agent/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'running' })
      });
      if (controlRes.ok) {
        fetchData();
      }
    }
  } catch (err) {
    console.error('Failed to start research:', err);
  }
}

// Reset view
async function resetDeck() {
  try {
    const res = await fetch('/api/properties/clear', { method: 'POST' });
    if (res.ok) {
      fetchData();
    }
  } catch (err) {
    console.error('Failed to clear:', err);
  }
}

// Setup SSE log listener
function setupSSE() {
  const eventSource = new EventSource('/api/logs/stream');

  eventSource.onmessage = (event) => {
    const log = JSON.parse(event.data);
    appendConsoleLog(log.message, log.type);

    // Refresh dashboard values on key state updates
    if (log.message.includes('Finished extraction') || 
        log.message.includes('Successfully parsed') || 
        log.message.includes('state changed') ||
        log.message.includes('Set research target') ||
        log.message.includes('Cleared')) {
      fetchData();
    }
  };

  eventSource.onerror = (err) => {
    console.error('SSE connection lost. Reconnecting...');
    eventSource.close();
    setTimeout(setupSSE, 5000);
  };
}

function appendConsoleLog(message, type = 'info') {
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.innerHTML = `[${new Date().toLocaleTimeString()}] ${escapeHtml(message)}`;
  terminalLogs.appendChild(line);
  terminalLogs.scrollTop = terminalLogs.scrollHeight;
}

// Status visual tags
function updateStatusUI() {
  if (agentState === 'running') {
    startAgentBtn.disabled = true;
    pauseAgentBtn.disabled = false;
    headerContainer.className = 'agent-status-panel status-running';
    statusText.textContent = 'Agent Running';
  } else if (agentState === 'paused') {
    startAgentBtn.disabled = false;
    pauseAgentBtn.disabled = true;
    headerContainer.className = 'agent-status-panel status-paused';
    statusText.textContent = 'Agent Paused';
  } else {
    startAgentBtn.disabled = false;
    pauseAgentBtn.disabled = true;
    headerContainer.className = 'agent-status-panel status-idle';
    statusText.textContent = 'Agent Idle';
  }
}

// Export CSV for single active property
function exportToCsv() {
  if (!activeProperty || activeProperty.status !== 'completed') {
    alert('No completed project results to export.');
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,";
  
  // Create double row CSV format or simple horizontal CSV
  const csvHeaders = schemaFields;
  csvContent += csvHeaders.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + "\r\n";

  const row = schemaFields.map(field => {
    const val = activeProperty.data && activeProperty.data[field] !== undefined ? activeProperty.data[field] : '';
    if (typeof val === 'object' && val !== null) {
      return JSON.stringify(val);
    }
    return val !== null ? val : '';
  });
  
  csvContent += row.map(r => `"${String(r).replace(/"/g, '""')}"`).join(',') + "\r\n";

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${activeProperty.name.replace(/\s+/g, '_')}_details.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function escapeHtml(text) {
  if (!text) return '';
  return text.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function pauseAgent() {
  try {
    const res = await fetch('/api/agent/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'paused' })
    });
    if (res.ok) {
      fetchData();
    }
  } catch (err) {
    console.error('Failed to pause agent:', err);
  }
}

// Bind clicks
startAgentBtn.addEventListener('click', startResearch);
pauseAgentBtn.addEventListener('click', pauseAgent);
clearDataBtn.addEventListener('click', resetDeck);
clearLogsBtn.addEventListener('click', () => {
  terminalLogs.innerHTML = '<div class="log-line system">[SYSTEM] Console cleared. Logs are still recording in backend.</div>';
});
exportCsvBtn.addEventListener('click', exportToCsv);
