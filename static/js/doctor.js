/* ═══════════════════════════════════════════════════════════
   RoboHeal AI — Doctor Portal Interactive Logic
   Glassmorphic dark medical theme CDSS • HTML5 Canvas • Biometrics
   ═══════════════════════════════════════════════════════════ */

'use strict';

let allCases = [];
let filteredCases = [];
let activeCase = null;
let currentFilters = {
  risk: '',
  severity: '',
  sort: 'newest',
  priorityQueue: 'all'
};

// Doctor Database & Auth State
let isDocSignUpActive = false;
let currentDoctor = null;
let doctorDatabase = JSON.parse(localStorage.getItem('doctorDatabase')) || {
  "smith@skinaid.org": {
    name: "Dr. Smith",
    password: "password123",
    major: "Dermatology",
    cases: ["CASE-9021", "CASE-4091", "CASE-1082", "CASE-3392", "CASE-1204"]
  }
};

function saveDoctorDatabase() {
  localStorage.setItem('doctorDatabase', JSON.stringify(doctorDatabase));
}

function toggleDocAuthForms() {
  isDocSignUpActive = !isDocSignUpActive;
  const title = document.getElementById('authTitle');
  const subtitle = document.getElementById('authSubtitle');
  const submitBtn = document.getElementById('btnSubmitDocAuth');
  const toggleLink = document.getElementById('docAuthToggleText');
  const nameGroup = document.getElementById('docNameGroup');
  const majorGroup = document.getElementById('docMajorGroup');

  if (isDocSignUpActive) {
    title.textContent = "Register Clinician";
    subtitle.textContent = "Create your professional SkinAid account";
    submitBtn.textContent = "Sign Up";
    toggleLink.textContent = "Already have an account? Sign In";
    if (nameGroup) nameGroup.classList.remove('hidden');
    if (majorGroup) majorGroup.classList.remove('hidden');
  } else {
    title.textContent = "Welcome Back, Doctor";
    subtitle.textContent = "Sign in to access the SkinAid AI Doctor Portal";
    submitBtn.textContent = "Sign In & Authorize";
    toggleLink.textContent = "Don't have an account? Sign Up";
    if (nameGroup) nameGroup.classList.add('hidden');
    if (majorGroup) majorGroup.classList.add('hidden');
  }
}

// Interactive visual controls
let activeTab = 'heatmap';
let isHeatmapActive = true;
let forecastTimer = null;
let forecastDay = 1;
let rotateAngleX = 0.5;
let rotateAngleY = 0.5;
let isDragging3D = false;
let startX3D = 0;
let startY3D = 0;

// Speech Dictation recognition
let recognition = null;
let isRecordingNotes = false;

// DICOM parsing details
let activeDcmHeader = null;

// Before & After slider dragging
let isDraggingSlider = false;

document.addEventListener('DOMContentLoaded', () => {
  // Pre-filling removed for autofill helper to respect browser autofills
  // Setup files drag & drop
  const fileInput = document.getElementById('docFileInput');
  const uploadBox = document.getElementById('docUploadBox');

  if (uploadBox && fileInput) {
    uploadBox.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        processSelectedFile(e.target.files[0]);
      }
    });

    uploadBox.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadBox.style.borderColor = 'var(--clinical-blue)';
    });

    uploadBox.addEventListener('dragleave', (e) => {
      e.preventDefault();
      uploadBox.style.borderColor = 'rgba(255,255,255,0.1)';
    });

    uploadBox.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadBox.style.borderColor = 'rgba(255,255,255,0.1)';
      if (e.dataTransfer.files.length) {
        processSelectedFile(e.dataTransfer.files[0]);
      }
    });
  }

  // Before & After slider mouse events
  const sliderContainer = document.getElementById('sliderContainer');
  if (sliderContainer) {
    sliderContainer.addEventListener('mousedown', (e) => {
      isDraggingSlider = true;
      updateSliderPosition(e);
    });
    window.addEventListener('mouseup', () => { isDraggingSlider = false; });
    window.addEventListener('mousemove', (e) => {
      if (isDraggingSlider) updateSliderPosition(e);
    });
  }

  // 3D Canvas mouse drag to rotate
  const topographyCanvas = document.getElementById('topography3DCanvas');
  if (topographyCanvas) {
    topographyCanvas.addEventListener('mousedown', (e) => {
      isDragging3D = true;
      startX3D = e.clientX;
      startY3D = e.clientY;
    });
    window.addEventListener('mouseup', () => { isDragging3D = false; });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging3D) return;
      const dx = e.clientX - startX3D;
      const dy = e.clientY - startY3D;
      rotateAngleX += dx * 0.01;
      rotateAngleY += dy * 0.01;
      startX3D = e.clientX;
      startY3D = e.clientY;
      draw3DTopography();
    });
  }

  // Populate specialist names lists
  populateCollaborateDoctors();
});

function autofillDoctorDemoCredentials() {
  if (isDocSignUpActive) {
    document.getElementById('docName').value = 'Dr. Smith';
    document.getElementById('docMajor').value = 'Dermatology';
  }
  document.getElementById('docEmail').value = 'smith@skinaid.org';
  document.getElementById('docPassword').value = 'password123';
}

// ── Doctor Credentials Authentication ───────────────────────
async function triggerDoctorLogin() {
  const emailInput = document.getElementById('docEmail').value.trim();
  const passwordInput = document.getElementById('docPassword').value;
  const authBtn = document.getElementById('btnSubmitDocAuth');

  if (!emailInput || !passwordInput) {
    alert("Please enter both email and password.");
    return;
  }

  if (isDocSignUpActive) {
    const nameInput = document.getElementById('docName').value.trim();
    const majorSelect = document.getElementById('docMajor').value.trim();
    if (!nameInput || !majorSelect) {
      alert("Please fill in all fields (Name, Email, Password, Department) to sign up.");
      return;
    }

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput, password: passwordInput, name: nameInput, major: majorSelect, role: 'doctor' })
      });
      const data = await res.json();
      if (!data.success) {
        alert("Registration Failed: " + (data.error || "Unknown error"));
        return;
      }
      alert("Clinician account created successfully! Please sign in with your credentials.");
      toggleDocAuthForms();
    } catch (err) {
      alert("Error during registration. Server might be offline.");
    }
    return;
  }

  // SIGN IN FLOW
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput, password: passwordInput, role: 'doctor' })
    });
    const data = await res.json();
    if (!data.success) {
      alert("Authentication Failed. Invalid physician credentials. Try: smith@skinaid.org / password123");
      return;
    }

    const doctor = data.user;
    currentDoctor = {
      email: emailInput,
      name: doctor.name,
      major: doctor.major,
      cases: doctor.cases || []
    };

    authBtn.textContent = "Authorizing Access...";
    authBtn.disabled = true;

    setTimeout(() => {
      authBtn.disabled = false;
      authBtn.textContent = "Sign In & Authorize";

      document.getElementById('credentialsForm').classList.add('hidden');
      document.getElementById('welcomePanel').classList.remove('hidden');
      document.getElementById('authTitle').textContent = "Access Approved";
      document.getElementById('authSubtitle').textContent = "Clinical Credentials Authorized";
      
      const welcomeHeader = document.querySelector('#welcomePanel h4');
      if (welcomeHeader) {
        welcomeHeader.textContent = `Welcome back ${doctor.name}`;
      }
      document.getElementById('welcomeSpecialty').textContent = doctor.major;
      
      // Update workspace badge and sidebar details dynamically
      document.getElementById('doctorBadge').textContent = `${doctor.name} (${doctor.major})`;
      document.getElementById('sidebarDoctorName').textContent = doctor.name;
      document.getElementById('sidebarDoctorRole').textContent = doctor.major || "Clinician";
      
      // Compute initials
      const cleanName = doctor.name.replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.)\s+/i, '');
      const initials = cleanName.split(' ').map(w => w[0]).join('').toUpperCase();
      document.getElementById('sidebarDoctorInitials').textContent = initials || 'DS';
    }, 1000);
  } catch (err) {
    alert("Authentication Error. Server might be offline.");
  }
}

function proceedToWorkspace() {
  document.getElementById('doctorAuthPage').classList.add('hidden');
  document.getElementById('doctorWorkspace').classList.remove('hidden');
  goToDoctorDashboard();
  loadCasesList();
  loadHospitalStats();
}

function logDoctorOut() {
  document.getElementById('doctorWorkspace').classList.add('hidden');
  document.getElementById('doctorAuthPage').classList.remove('hidden');
  document.getElementById('credentialsForm').classList.remove('hidden');
  document.getElementById('welcomePanel').classList.add('hidden');
  document.getElementById('authTitle').textContent = "Welcome Back, Doctor";
  document.getElementById('authSubtitle').textContent = "Sign in to access the SkinAid AI Doctor Portal";
  
  activeCase = null;
  currentDoctor = null;
  deactivateDocWebcam();
  document.getElementById('activeCaseContent').classList.add('hidden');
  document.getElementById('emptyCaseState').classList.remove('hidden');
}

function goToDoctorDashboard() {
  document.getElementById('doctorDashboardView').classList.remove('hidden');
  document.getElementById('doctorCasesView').classList.add('hidden');
  document.getElementById('navDoctorDashboard').classList.add('active');
  document.getElementById('navDoctorCases').classList.remove('active');
}

function goToDoctorCases() {
  document.getElementById('doctorDashboardView').classList.add('hidden');
  document.getElementById('doctorCasesView').classList.remove('hidden');
  document.getElementById('navDoctorDashboard').classList.remove('active');
  document.getElementById('navDoctorCases').classList.add('active');
}

// ── Workstation Analyses loading & displaying ──────────
async function loadCasesList() {
  try {
    const res = await fetch('/api/cases');
    const data = await res.json();
    allCases = data;
    renderRecentAnalyses();
  } catch (err) {
    console.error("Failed to load assessments queue", err);
  }
}

function renderRecentAnalyses() {
  const tbody = document.getElementById('recentAnalysesBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  // Filter cases: only show cases in currentDoctor.cases
  const allowedCases = allCases.filter(c => currentDoctor && currentDoctor.cases && currentDoctor.cases.includes(c.case_id));
  
  allowedCases.forEach(item => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border)';
    tr.style.fontSize = '13px';
    
    let sevColor = 'var(--text-main)';
    if (item.severity === 'Critical') sevColor = 'var(--color-critical)';
    else if (item.severity === 'Severe') sevColor = 'var(--color-severe)';
    else if (item.severity === 'Moderate') sevColor = 'var(--color-moderate)';
    else if (item.severity === 'Mild') sevColor = 'var(--color-minimal)';
    
    tr.innerHTML = `
      <td style="padding: 12px; font-weight: 700; color: var(--clinical-blue);">${item.case_id}</td>
      <td style="padding: 12px; color: var(--text-sub);">${item.date}</td>
      <td style="padding: 12px; font-weight: 600;">${t(item.wound_type)}</td>
      <td style="padding: 12px;"><span style="color: ${sevColor}; font-weight: 700;">${t(item.severity)}</span></td>
      <td style="padding: 12px; color: var(--text-sub);">${item.confidence_pct}</td>
      <td style="padding: 12px; text-align: right;">
        <button class="btn-clinical-secondary" style="padding: 4px 10px; font-size: 11.5px;" onclick="loadAnalysisRecord('${item.case_id}')">
          ${t('Open Telemetry')}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  document.getElementById('dashTotalAnalyses').textContent = allowedCases.length;
  const avgHealing = allowedCases.length ? Math.round(allowedCases.reduce((sum, item) => sum + (item.healing_percentage || 0), 0) / allowedCases.length) : 0;
  document.getElementById('dashAvgHealing').textContent = `${avgHealing}%`;
}

function getDifferentialDiagnosesList(woundType) {
  if (woundType === 'Ulcer') {
    return [
      { name: 'Diabetic Neuropathic Ulcer', pct: 82 },
      { name: 'Venous Stasis Ulcer', pct: 12 },
      { name: 'Pressure Injury', pct: 6 }
    ];
  } else if (woundType === 'Burn Wound') {
    return [
      { name: 'Second Degree Burn', pct: 88 },
      { name: 'Third Degree Burn', pct: 9 },
      { name: 'Chemical Dermatitis', pct: 3 }
    ];
  } else if (woundType === 'Laceration') {
    return [
      { name: 'Traumatic Laceration', pct: 91 },
      { name: 'Surgical Incision Margin', pct: 7 },
      { name: 'Linear Tear', pct: 2 }
    ];
  } else {
    return [
      { name: woundType || 'Dermal Lesion', pct: 85 },
      { name: 'Abrasion', pct: 10 },
      { name: 'Superficial Tear', pct: 5 }
    ];
  }
}

function copySoapNote() {
  const s = document.getElementById('soapSubjective').value;
  const o = document.getElementById('soapObjective').value;
  const a = document.getElementById('soapAssessment').value;
  const p = document.getElementById('soapPlan').value;
  
  const text = `CLINICAL SOAP NOTE\n\nSUBJECTIVE (S):\n${s}\n\nOBJECTIVE (O):\n${o}\n\nASSESSMENT (A):\n${a}\n\nPLAN (P):\n${p}`;
  
  navigator.clipboard.writeText(text).then(() => {
    alert("SOAP Note successfully copied to clipboard.");
  }).catch(err => {
    console.error("Failed to copy note", err);
  });
}

function resetWorkstation() {
  activeCase = null;
  deactivateDocWebcam();
  document.getElementById('activeCaseContent').classList.add('hidden');
  document.getElementById('emptyCaseState').classList.remove('hidden');
}

async function loadAnalysisRecord(caseId) {
  try {
    const res = await fetch(`/api/cases/${caseId}`);
    const caseData = await res.json();
    activeCase = caseData;

    // Show Workspace elements
    document.getElementById('emptyCaseState').classList.add('hidden');
    document.getElementById('activeCaseContent').classList.remove('hidden');

    // Wound Image
    document.getElementById('detWoundImage').src = caseData.image_url;
    document.getElementById('sliderCurrentImg').src = caseData.image_url;
    document.getElementById('sliderBeforeImg').src = caseData.history[0]?.image_placeholder || caseData.image_url;

    // Heatmap Overlay Draw
    setupHeatmapOverlay();

    // Telemetry Diagnostics
    document.getElementById('detWoundType').textContent = t(caseData.wound_type);
    const stageStr = caseData.wound_type === 'Ulcer' ? 'Stage 3' : (caseData.wound_type === 'Burn Wound' ? 'Stage 2' : 'N/A (Superficial)');
    document.getElementById('detWoundStage').textContent = t(stageStr);
    document.getElementById('detSeverity').textContent = t(caseData.severity);
    document.getElementById('detConfidence').textContent = caseData.confidence_pct;
    document.getElementById('detInfectionRisk').textContent = caseData.infection_risk;
    document.getElementById('detHealingPotential').textContent = `${caseData.healing_percentage || 74}%`;
    document.getElementById('detRecoveryTime').textContent = t(caseData.healing_prediction.replace('Expected recovery in ', ''));
    
    const riskClass = (caseData.severity === 'Critical' || caseData.severity === 'Severe') ? 'High Risk Category' : 'Moderate/Low Risk';
    document.getElementById('detClinicalRisk').textContent = t(riskClass);
    
    // Severity styling
    const severityElem = document.getElementById('detSeverity');
    severityElem.className = '';
    if (caseData.severity === 'Critical' || caseData.severity === 'Severe') {
      severityElem.classList.add('text-critical');
    } else if (caseData.severity === 'Moderate') {
      severityElem.classList.add('text-severe');
    } else {
      severityElem.classList.add('text-low');
    }

    // Image stats
    document.getElementById('imgRedRatio').textContent = caseData.image_stats?.redness_ratio || '1.42';
    document.getElementById('imgBrightness').textContent = caseData.image_stats?.brightness || '104';
    document.getElementById('imgResolution').textContent = caseData.image_stats?.resolution || '1024x768px';
    document.getElementById('imgModality').textContent = caseData.dicom_header ? 'DICOM Scan' : 'Optical Cam';

    if (caseData.dicom_header) {
      document.getElementById('dicomMetadataCard').classList.remove('hidden');
      document.getElementById('dcmManufacturer').textContent = caseData.dicom_header.manufacturer || '—';
      document.getElementById('dcmInstitution').textContent = caseData.dicom_header.institution || '—';
      document.getElementById('dcmStudyDate').textContent = caseData.dicom_header.study_date || '—';
    } else {
      document.getElementById('dicomMetadataCard').classList.add('hidden');
    }

    // Update circular gauges
    updateSVGTelemetryGauges(caseData.severity, caseData.healing_percentage || 74);

    // Explainable AI & Differential Diagnostics
    const eryth = caseData.severity === 'Critical' ? 'Critical (92%)' : (caseData.severity === 'Severe' ? 'High (80%)' : 'Moderate (45%)');
    document.getElementById('xaiErythema').textContent = t(eryth);
    document.getElementById('xaiBorders').textContent = t((caseData.severity === 'Critical' || caseData.severity === 'Severe') ? 'Highly Irregular' : 'Slightly Elevated');
    document.getElementById('xaiSlough').textContent = t(caseData.severity === 'Critical' ? 'Moderate' : 'None');
    document.getElementById('xaiExplanationText').textContent = t('AI prediction triggers primarily based on redness intensity ratios') + ` (${caseData.image_stats?.redness_ratio || '1.42'}), ` + t('border contrast gradients, and localized thermal margins.');

    // Differential Diagnostics ranked list
    const diffContainer = document.getElementById('diffDiagnosticsContainer');
    diffContainer.innerHTML = '';
    const diffs = getDifferentialDiagnosesList(caseData.wound_type);
    diffs.forEach(d => {
      const row = document.createElement('div');
      row.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 2px;">
          <span>${t(d.name)}</span>
          <strong>${d.pct}%</strong>
        </div>
        <div class="progress-track-bg" style="height: 6px; background: rgba(0,0,0,0.05); border-radius: 3px; overflow: hidden;">
          <div class="progress-fill" style="width: ${d.pct}%; height: 100%; background: var(--clinical-blue);"></div>
        </div>
      `;
      diffContainer.appendChild(row);
    });

    // Clinical Insights
    document.getElementById('insightObservations').textContent = t('Peripheral erythema present near wound borders. Granulation tissue estimated at ') + `${caseData.healing_percentage || 74}` + t('% coverage.');
    document.getElementById('insightConcerns').textContent = t(caseData.severity === 'Critical' ? 'High probability of peripheral tissue necrosis or chronic chronic chronic deep dermal wound expansion.' : 'Exudate control required. Monitor surrounding tissue daily for signs of expanding warmth.');
    document.getElementById('insightBarriers').textContent = t(caseData.wound_type === 'Ulcer' ? 'Local pressure friction and diabetic microangiopathy.' : 'Moisture imbalance at dressing site.');
    document.getElementById('insightAttention').textContent = t(caseData.healing_prediction);

    // SOAP Notes
    document.getElementById('soapSubjective').value = t('Patient presents for clinical evaluation of a diagnosed ') + t(caseData.wound_type) + '. ' + t('Reports localized discomfort and mild throbbing pain.');
    document.getElementById('soapObjective').value = t('Clinical image analysis reveals a ') + t(caseData.wound_type) + t(' classified at ') + t(caseData.severity) + t(' severity. Estimated wound area size: ') + (caseData.prediction?.wound_size || 'N/A') + t('. Erythema level: ') + (caseData.prediction?.infection_level || 'N/A') + '.';
    document.getElementById('soapAssessment').value = t('Assessment of wound margins indicates a Stage 2/3 classification with an AI-computed healing potential index of ') + `${caseData.healing_percentage || 74}` + t('%. Infection risk is currently monitored at ') + t(caseData.infection_risk) + '.';
    document.getElementById('soapPlan').value = t('Implement standard localized wound dressing. Ensure offloading. Review and acquire repeat telemetry in 7-14 days.');

    // AI Clinical Co-Pilot
    document.getElementById('copilotSummary').innerHTML = `<strong>${t('Executive Telemetry:')}</strong> ` + t('Multi-spectral analysis matches this tissue damage profile to a ') + t(caseData.wound_type) + t(' at ') + caseData.confidence_pct + t(' diagnostic confidence. Est. recovery: ') + (caseData.prediction?.estimated_days || '28') + t(' days.');
    document.getElementById('copilotRiskWarning').textContent = t(caseData.severity === 'Critical' ? 'Warning: Severe dermal compromise detected. Triage priority score is elevated. Critical clinical pathway protocol advised.' : 'Normal healing progression predicted. Continue monitoring and maintain dry dressing environment.');

    // Longitudinal progress canvas chart
    drawHealingChart(caseData.history ? caseData.history.map(h => h.percentage) : [10, 20, 30, 40]);

    // Switch to Heatmap Tab
    switchWorkspaceTab('heatmap');

    // Trigger 3D mesh topography crater
    draw3DTopography();

    // Navigate to Cases Workspace tab/view
    goToDoctorCases();
  } catch (err) {
    console.error("Failed to load analysis record details", err);
  }
}

// ── Tab visual overlays workspace manager ──────────────────
function switchWorkspaceTab(tab) {
  activeTab = tab;
  
  const tabIds = ['tabContentHeatmap', 'tabContentSlider', 'tabContentMesh', 'tabContentForecast'];
  tabIds.forEach(id => document.getElementById(id).classList.add('hidden'));

  const buttons = document.querySelectorAll('.workspace-tabs .workspace-tab-btn');
  buttons.forEach(btn => btn.classList.remove('active'));

  if (tab === 'heatmap') {
    document.getElementById('tabContentHeatmap').classList.remove('hidden');
    buttons[0].classList.add('active');
    setupHeatmapOverlay();
  } else if (tab === 'slider') {
    document.getElementById('tabContentSlider').classList.remove('hidden');
    buttons[1].classList.add('active');
    resetBeforeAfterSlider();
  } else if (tab === 'mesh') {
    document.getElementById('tabContentMesh').classList.remove('hidden');
    buttons[2].classList.add('active');
    draw3DTopography();
  } else if (tab === 'forecast') {
    document.getElementById('tabContentForecast').classList.remove('hidden');
    buttons[3].classList.add('active');
    resetForecastSimulation();
  }
}

// ── Before & After Image Slider ─────────────────────────────
function resetBeforeAfterSlider() {
  const overlay = document.getElementById('sliderBeforeOverlay');
  const handle = document.getElementById('sliderHandle');
  if (overlay && handle) {
    overlay.style.width = '50%';
    handle.style.left = '50%';
  }
}

function updateSliderPosition(e) {
  const container = document.getElementById('sliderContainer');
  const overlay = document.getElementById('sliderBeforeOverlay');
  const handle = document.getElementById('sliderHandle');
  if (!container || !overlay || !handle) return;

  const rect = container.getBoundingClientRect();
  const posX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const pct = (posX / rect.width) * 100;

  overlay.style.width = `${pct}%`;
  handle.style.left = `${pct}%`;
}

// ── HTML5 Canvas Explainable AI Heatmap Overlay ──────────────
function setupHeatmapOverlay() {
  const canvas = document.getElementById('heatmapCanvasOverlay');
  const img = document.getElementById('detWoundImage');
  if (!canvas || !img) return;

  canvas.width = img.clientWidth || 300;
  canvas.height = img.clientHeight || 200;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  const grad = ctx.createRadialGradient(centerX, centerY, 8, centerX, centerY, 55);
  grad.addColorStop(0, 'rgba(239, 68, 68, 0.85)');
  grad.addColorStop(0.5, 'rgba(249, 115, 22, 0.55)');
  grad.addColorStop(1, 'rgba(249, 115, 22, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
  ctx.fill();

  isHeatmapActive = true;
  canvas.classList.add('active');
}

function toggleHeatmapOverlay() {
  const canvas = document.getElementById('heatmapCanvasOverlay');
  if (!canvas) return;
  isHeatmapActive = !isHeatmapActive;
  if (isHeatmapActive) canvas.classList.add('active');
  else canvas.classList.remove('active');
}

// ── SVG circular telemetry gauges ──────────────────────────
function updateSVGTelemetryGauges(severity, healingPct) {
  const sevCircle = document.getElementById('gaugeSeverityCircle');
  const recCircle = document.getElementById('gaugeRecoveryCircle');
  const sevText = document.getElementById('gaugeSeverityText');
  const recText = document.getElementById('gaugeRecoveryText');

  let sevScore = 40;
  if (severity === 'Critical') sevScore = 95;
  else if (severity === 'Severe') sevScore = 80;
  else if (severity === 'Moderate') sevScore = 60;
  else if (severity === 'Mild') sevScore = 30;

  sevText.textContent = `${sevScore}%`;
  recText.textContent = `${healingPct}%`;

  const dashOffset = (percent) => 238.76 - (238.76 * (percent / 100));

  sevCircle.style.strokeDashoffset = dashOffset(sevScore);
  recCircle.style.strokeDashoffset = dashOffset(healingPct);
}

// ── HTML5 Canvas rotatable 3D topography mesh crater ───────
function draw3DTopography() {
  const canvas = document.getElementById('topography3DCanvas');
  if (!canvas || canvas.classList.contains('hidden')) return;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const rows = 14;
  const cols = 14;
  const spacing = 12;

  ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
  ctx.lineWidth = 1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Mesh matrix points relative to center
      const x = (c - cols/2) * spacing;
      const y = (r - rows/2) * spacing;
      
      // Heuristic depth center crater
      const distFromCenter = Math.sqrt(x*x + y*y);
      const z = -40 * Math.exp(-0.002 * distFromCenter * distFromCenter);

      // Perform matrix projection calculations
      const cosX = Math.cos(rotateAngleY);
      const sinX = Math.sin(rotateAngleY);
      const cosY = Math.cos(rotateAngleX);
      const sinY = Math.sin(rotateAngleX);

      // Rotate around Y and X axis
      const rx1 = x * cosY - z * sinY;
      const rz1 = x * sinY + z * cosY;
      const ry2 = y * cosX - rz1 * sinX;
      
      const px = cx + rx1;
      const py = cy + ry2;

      // Draw wireframe linking lines
      if (c < cols - 1) {
        const nx = (c + 1 - cols/2) * spacing;
        const nz = -40 * Math.exp(-0.002 * (nx*nx + y*y));
        const nrx = nx * cosY - nz * sinY;
        const nrz = nx * sinY + nz * cosY;
        const nry = y * cosX - nrz * sinX;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(cx + nrx, cy + nry);
        ctx.stroke();
      }

      if (r < rows - 1) {
        const ny = (r + 1 - rows/2) * spacing;
        const nz = -40 * Math.exp(-0.002 * (x*x + ny*ny));
        const nrx = x * cosY - nz * sinY;
        const nrz = x * sinY + nz * cosY;
        const nry = ny * cosX - nrz * sinX;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(cx + nrx, cy + nry);
        ctx.stroke();
      }
    }
  }
}

// ── Playback simulated wound contraction simulation ───────────
function resetForecastSimulation() {
  clearInterval(forecastTimer);
  forecastTimer = null;
  forecastDay = 1;
  document.getElementById('forecastDayLabel').textContent = `Day ${forecastDay}`;
  drawSimulationFrame();
}

function playForecastSimulation() {
  if (forecastTimer) return;
  forecastTimer = setInterval(() => {
    forecastDay++;
    if (forecastDay > 30) {
      clearInterval(forecastTimer);
      forecastTimer = null;
    } else {
      document.getElementById('forecastDayLabel').textContent = `Day ${forecastDay}`;
      drawSimulationFrame();
    }
  }, 100);
}

function pauseForecastSimulation() {
  clearInterval(forecastTimer);
  forecastTimer = null;
}

function drawSimulationFrame() {
  const canvas = document.getElementById('simulationForecastCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  // Wound gets smaller as time increases
  const shrinkFactor = 1 - (forecastDay - 1) / 30; // goes from 1 to 0
  const woundRadius = 50 * shrinkFactor;

  if (woundRadius > 2) {
    // Draw outer inflamed perimeter ring
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, woundRadius + 4, 0, Math.PI * 2);
    ctx.stroke();

    // Draw center tissue healing bed
    ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, woundRadius, 0, Math.PI * 2);
    ctx.fill();

    // Text details
    ctx.fillStyle = '#fff';
    ctx.font = '12px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText(`Area: ${Math.max(0.1, (8.5 * shrinkFactor * shrinkFactor)).toFixed(2)} cm²`, cx, cy + 4);
  } else {
    ctx.fillStyle = 'var(--clinical-teal)';
    ctx.font = '16px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText('Wound Fully Epitelialized', cx, cy);
  }
}

// ── Voice Dictation simulation using speech recognizer ─────────
function toggleVoiceDictation() {
  const btn = document.getElementById('btnToggleDictation');
  const textEditor = document.getElementById('doctorNotesText');

  if (isRecordingNotes) {
    isRecordingNotes = false;
    btn.classList.remove('recording');
    btn.textContent = '🎤 Speech Dictation';
    if (recognition) recognition.stop();
  } else {
    isRecordingNotes = true;
    btn.classList.add('recording');
    btn.textContent = 'Recording Voice...';

    // Check for web speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      
      recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript;
        textEditor.value += (textEditor.value ? ' ' : '') + transcript;
      };

      recognition.onerror = () => {
        isRecordingNotes = false;
        btn.classList.remove('recording');
        btn.textContent = '🎤 Speech Dictation';
      };

      recognition.start();
    } else {
      // Simulated speech to text transcript generator fallback
      let tick = 0;
      const dictationSim = setInterval(() => {
        if (!isRecordingNotes) {
          clearInterval(dictationSim);
          return;
        }
        tick++;
        let simulatedPhrase = '';
        if (tick === 1) simulatedPhrase = "Patient demonstrates positive dermal granulation.";
        if (tick === 2) simulatedPhrase = "Borders are clean, continue active compression dressings.";
        
        if (simulatedPhrase) {
          textEditor.value += (textEditor.value ? ' ' : '') + simulatedPhrase;
        }
      }, 2000);
    }
  }
}

// ── Comparative Cases rendering ──────────────────────────
function renderComparativeCases(current) {
  const area = document.getElementById('compCasesArea');
  if (!area) return;

  const matches = allCases.filter(c => c.case_id !== current.case_id && (c.wound_type === current.wound_type || c.severity === current.severity));
  
  if (matches.length === 0) {
    area.innerHTML = `<span style="font-size: 12.5px; color: var(--text-muted); font-style: italic;">No previous matching clinical cases found in active archives.</span>`;
    return;
  }

  const compareList = matches.slice(0, 2);
  area.innerHTML = compareList.map((m, idx) => {
    const similarity = idx === 0 ? '94%' : '88%';
    return `
      <div class="comp-card">
        <span class="comp-similarity">${similarity} Match</span>
        <div class="comp-details">
          <div class="comp-title">${m.patient_name} (${m.case_id})</div>
          <div class="comp-meta">
            Wound Type: <strong>${m.wound_type}</strong> &bull; Triage: <span style="font-weight: 700;">${m.severity}</span>
          </div>
          <div class="comp-meta" style="color: var(--clinical-teal);">
            Outcome: Resolved in ${m.healing_percentage}% Recovery Rate
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ── HTML5 Canvas progress multiline timeline graph ─────────────
function drawHealingChart(percentages) {
  const canvas = document.getElementById('healingProgressCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const width = canvas.width;
  const height = canvas.height;
  
  // Adjusted padding to avoid label clipping
  const paddingLeft = 32;
  const paddingRight = 32;
  const paddingTop = 24;
  const paddingBottom = 24;

  const graphHeight = height - (paddingTop + paddingBottom);
  const graphWidth = width - (paddingLeft + paddingRight);

  // Background grid lines (styled for clinical clarity)
  ctx.strokeStyle = 'rgba(60, 47, 47, 0.08)';
  ctx.lineWidth = 1;
  
  for (let i = 0; i <= 3; i++) {
    const y = paddingTop + graphHeight * (i / 3);
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();
  }

  // Draw chart lines
  const points = [];
  const days = ["Week 1", "Week 2", "Week 3", "Week 4"];
  
  percentages.forEach((pct, idx) => {
    const x = paddingLeft + graphWidth * (idx / 3);
    const y = height - paddingBottom - graphHeight * (pct / 100);
    points.push({ x, y, value: pct });
  });

  // Draw smooth area under the line
  if (points.length > 0) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, height - paddingBottom);
    points.forEach(pt => {
      ctx.lineTo(pt.x, pt.y);
    });
    ctx.lineTo(points[points.length - 1].x, height - paddingBottom);
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, paddingTop, 0, height - paddingBottom);
    fillGrad.addColorStop(0, 'rgba(179, 142, 93, 0.20)');
    fillGrad.addColorStop(1, 'rgba(179, 142, 93, 0.01)');
    ctx.fillStyle = fillGrad;
    ctx.fill();
  }

  // Draw trend line
  ctx.beginPath();
  ctx.strokeStyle = '#B38E5D'; // Clinical Gold/Teal theme
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  points.forEach((pt, idx) => {
    if (idx === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.stroke();

  // Draw data nodes & text values
  points.forEach((pt, idx) => {
    // Outer circle glow ring
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(179, 142, 93, 0.3)';
    ctx.fill();

    // Inner node circle
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#B38E5D';
    ctx.fill();

    // White core dot
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Value label
    ctx.fillStyle = '#3C2F2F';
    ctx.font = 'bold 10px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText(`${pt.value}%`, pt.x, pt.y - 10);

    // Timeline Week labels
    ctx.fillStyle = '#8C7E7E';
    ctx.font = '600 9px Outfit';
    ctx.fillText(days[idx], pt.x, height - 6);
  });
}

function selectTimelineChartPoint(idx) {
  const buttons = ['btnLongDay1', 'btnLongDay5', 'btnLongDay10', 'btnLongDay15'];
  buttons.forEach(id => document.getElementById(id).classList.remove('active'));
  document.getElementById(buttons[idx]).classList.add('active');
  
  // Display simulated notes update or detail change
  if (activeCase && activeCase.history[idx]) {
    document.getElementById('diagAbnormal').textContent = activeCase.history[idx].status;
  }
}

// ── Specialist referral populate & submit ───────────────────
function populateCollaborateDoctors() {
  const dept = document.getElementById('collabDept').value;
  const selectDoc = document.getElementById('collabDoctor');
  selectDoc.innerHTML = '<option value="">Select Specialist</option>';

  const docDatabase = {
    "Dermatology": ["Dr. Angela Ray, MD", "Dr. Victor Stone, MD"],
    "Vascular Surgery": ["Dr. Bruce Banner, MD", "Dr. Reed Richards, MD"],
    "Plastic Surgery": ["Dr. Charles Xavier, MD", "Dr. Jean Grey, MD"],
    "Infectious Disease": ["Dr. Stephen Strange, MD", "Dr. Hank Pym, MD"]
  };

  if (dept && docDatabase[dept]) {
    docDatabase[dept].forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      selectDoc.appendChild(opt);
    });
  }
}

async function submitSpecialistReferral() {
  if (!activeCase) return;

  const dept = document.getElementById('collabDept').value;
  const doc = document.getElementById('collabDoctor').value;
  const notes = document.getElementById('collabNotes').value;

  if (!dept || !doc) {
    alert("Please select specialty department and target consultant.");
    return;
  }

  try {
    const res = await fetch(`/api/cases/${activeCase.case_id}/collaborate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referral_dept: dept,
        referral_doctor: doc,
        collaboration_notes: notes
      })
    });
    const data = await res.json();
    if (data.success) {
      alert("Consultation referral sent successfully.");
      loadCasesList();
      selectPatientCase(activeCase.case_id);
    }
  } catch (err) {
    alert("Server error submitting specialist request.");
  }
}

// ── Save Notes & Follow-up plans ──────────────────────
async function saveDoctorNotes() {
  if (!activeCase) return;
  const notesText = document.getElementById('doctorNotesText').value;

  try {
    const res = await fetch(`/api/cases/${activeCase.case_id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notesText })
    });
    const data = await res.json();
    if (data.success) {
      alert("Clinical notes saved successfully.");
      loadCasesList();
    }
  } catch (err) {
    alert("Server error saving notes.");
  }
}

async function saveFollowUpPlan() {
  if (!activeCase) return;
  
  const followUpDate = document.getElementById('followUpDate').value;
  const reminders = document.getElementById('dressingReminders').value;
  const monitoring = document.getElementById('monitoringSchedule').value;

  try {
    const res = await fetch(`/api/cases/${activeCase.case_id}/followup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        follow_up_date: followUpDate,
        follow_up_reminders: reminders,
        monitoring_schedule: monitoring
      })
    });
    const data = await res.json();
    if (data.success) {
      alert("Follow-up plan scheduled successfully.");
      loadCasesList();
    }
  } catch (err) {
    alert("Server error scheduling plan.");
  }
}

// ── File acquisition drag & drop triggers ────────────────────
function toggleAcquisitionPanel() {
  const panel = document.getElementById('acquisitionPanel');
  if (panel) {
    panel.classList.toggle('hidden');
    if (panel.classList.contains('hidden')) {
      deactivateDocWebcam();
      document.getElementById('docPreviewContainer').classList.add('hidden');
      document.getElementById('docLoaderContainer').classList.add('hidden');
      document.getElementById('qualityAssessmentDashboard').classList.add('hidden');
      document.getElementById('dicomMetadataPanel').classList.add('hidden');
      activeDcmHeader = null;
    }
  }
}

async function activateDocWebcam() {
  document.getElementById('docPreviewContainer').classList.add('hidden');
  document.getElementById('docWebcamContainer').classList.remove('hidden');

  const video = document.getElementById('docWebcamVideo');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false
    });
    video.srcObject = stream;
    window.docWebcamStream = stream;
  } catch (err) {
    alert("Unable to access camera device.");
    deactivateDocWebcam();
  }
}

function deactivateDocWebcam() {
  if (window.docWebcamStream) {
    window.docWebcamStream.getTracks().forEach(track => track.stop());
    window.docWebcamStream = null;
  }
  document.getElementById('docWebcamContainer').classList.add('hidden');
}

function captureDocWebcamFrame() {
  const video = document.getElementById('docWebcamVideo');
  const canvas = document.getElementById('docWebcamCanvas');
  
  if (!window.docWebcamStream || !video || !canvas) return;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob((blob) => {
    const file = new File([blob], "snapshot_eval.jpg", { type: "image/jpeg" });
    processSelectedFile(file);
    deactivateDocWebcam();
  }, 'image/jpeg');
}

function processSelectedFile(file) {
  const isDcm = file.name.toLowerCase().endsWith('.dcm');
  const reader = new FileReader();

  reader.onload = (e) => {
    if (isDcm) {
      // Populate mock DICOM header info display
      activeDcmHeader = {
        modality: "OT (Secondary Capture)",
        manufacturer: "Siemens Healthineers",
        institution: "Metro General Hospital",
        studyDate: new Date().toISOString().split('T')[0]
      };
      
      document.getElementById('dcmModality').textContent = activeDcmHeader.modality;
      document.getElementById('dcmManufacturer').textContent = activeDcmHeader.manufacturer;
      document.getElementById('dcmInstitution').textContent = activeDcmHeader.institution;
      document.getElementById('dcmStudyDate').textContent = activeDcmHeader.studyDate;

      document.getElementById('dicomMetadataPanel').classList.remove('hidden');
      document.getElementById('docPreviewImg').src = "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=400";
    } else {
      document.getElementById('dicomMetadataPanel').classList.add('hidden');
      document.getElementById('docPreviewImg').src = e.target.result;
      activeDcmHeader = null;
    }

    // Trigger Image Quality assessment panel display
    document.getElementById('compositeQualityScore').textContent = isDcm ? "98%" : "95%";
    document.getElementById('qualityAssessmentDashboard').classList.remove('hidden');

    document.getElementById('docPreviewContainer').classList.remove('hidden');
    window.docActiveFile = file;
  };

  reader.readAsDataURL(file);
}

// ── Run AI Vision analytics loader ──────────────────────────
async function runLiveClinicalAnalysis() {
  if (!window.docActiveFile) return;

  const previewBox = document.getElementById('docPreviewContainer');
  const loaderContainer = document.getElementById('docLoaderContainer');
  const progressBar = document.getElementById('docProgressBar');
  const analyzeBtn = document.getElementById('btnRunClinicalAnalysis');

  analyzeBtn.disabled = true;
  previewBox.classList.add('hidden');
  loaderContainer.classList.remove('hidden');

  // Reset progress steps
  for (let i = 1; i <= 5; i++) {
    document.getElementById(`docStep${i}`).className = "loader-step";
  }
  progressBar.style.width = '0%';

  const formData = new FormData();
  formData.append('image', window.docActiveFile);

  try {
    const apiPromise = fetch('/analyze', { method: 'POST', body: formData });

    await animateLoaderStage(1, 20, "docStep1");
    await animateLoaderStage(2, 40, "docStep2");
    await animateLoaderStage(3, 60, "docStep3");
    await animateLoaderStage(4, 80, "docStep4");
    await animateLoaderStage(5, 100, "docStep5");

    const res = await apiPromise;
    const data = await res.json();

    loaderContainer.classList.add('hidden');
    analyzeBtn.disabled = false;

    if (!data.success) {
      alert("Analysis pipeline error: " + (data.error || "Unknown"));
      previewBox.classList.remove('hidden');
      return;
    }

    if (currentDoctor) {
      if (!currentDoctor.cases) currentDoctor.cases = [];
      currentDoctor.cases.unshift(data.case_id);
      syncDoctorCases();
    }

    await loadCasesList();
    loadAnalysisRecord(data.case_id);

  } catch (err) {
    loaderContainer.classList.add('hidden');
    analyzeBtn.disabled = false;
    previewBox.classList.remove('hidden');
    alert("Connection error to diagnostics core servers.");
  }
}

async function animateLoaderStage(stepNum, targetWidth, stepId) {
  const stepEl = document.getElementById(stepId);
  const bar = document.getElementById('docProgressBar');
  if (stepEl) stepEl.classList.add('active');

  let startWidth = parseInt(bar.style.width) || 0;
  let increment = (targetWidth - startWidth) / 10;
  for (let i = 0; i < 10; i++) {
    startWidth += increment;
    bar.style.width = `${startWidth}%`;
    await new Promise(resolve => setTimeout(resolve, 40));
  }

  if (stepEl) stepEl.classList.replace('active', 'done');
}

// ── Report Generator PDF preview window ───────────────────────
function generateCaseSummaryReport() {
  if (!activeCase) return;

  document.getElementById('repPatientName').textContent = activeCase.patient_name;
  document.getElementById('repPatientID').textContent = activeCase.patient_id;
  document.getElementById('repPatientAge').textContent = activeCase.patient_age;
  document.getElementById('repPatientGender').textContent = activeCase.patient_gender;
  document.getElementById('repReportDate').textContent = new Date().toLocaleDateString();

  document.getElementById('repWoundType').textContent = activeCase.wound_type;
  document.getElementById('repSeverity').textContent = activeCase.severity;
  document.getElementById('repConfidence').textContent = activeCase.confidence_pct;
  document.getElementById('repInfectionRisk').textContent = activeCase.infection_risk;
  document.getElementById('repPrediction').textContent = activeCase.healing_prediction;

  document.getElementById('repHealingPct').textContent = `${activeCase.healing_percentage}%`;
  
  const h1 = activeCase.history[0]?.percentage || 10;
  const h4 = activeCase.history[3]?.percentage || 70;
  document.getElementById('repRecoveryTrend').textContent = `Recovery Delta index is positive at +${h4 - h1}%`;

  document.getElementById('repNotes').textContent = document.getElementById('doctorNotesText').value || 'No observations recorded.';
  
  document.getElementById('repFollowUpDate').textContent = document.getElementById('followUpDate').value || 'Not scheduled';
  document.getElementById('repDressingSchedule').textContent = document.getElementById('dressingReminders').value || 'None';
  document.getElementById('repMonitoringSchedule').textContent = document.getElementById('monitoringSchedule').value || 'PRN (As needed)';

  if (activeCase.collaboration) {
    document.getElementById('repCollabSpecialist').textContent = activeCase.collaboration.referral_doctor;
    document.getElementById('repCollabDept').textContent = activeCase.collaboration.referral_dept;
    document.getElementById('repCollabNotes').textContent = activeCase.collaboration.collaboration_notes || 'None';
  } else {
    document.getElementById('repCollabSpecialist').textContent = "None Referred";
    document.getElementById('repCollabDept').textContent = "—";
    document.getElementById('repCollabNotes').textContent = "—";
  }

  document.getElementById('reportOverlay').classList.remove('hidden');
}

function closeCaseReport() {
  document.getElementById('reportOverlay').classList.add('hidden');
}

async function syncDoctorCases() {
  if (!currentDoctor || !currentDoctor.email) return;
  try {
    await fetch('/api/auth/update_doctor_cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: currentDoctor.email,
        cases: currentDoctor.cases
      })
    });
  } catch (err) {
    console.error("Failed to sync clinician cases to server", err);
  }
}

// React to language switches in real time
document.addEventListener('languagechanged', () => {
  if (activeCase) {
    loadAnalysisRecord(activeCase.case_id);
  }
  renderRecentAnalyses();
});

// Expose functions globally
window.triggerBiometricScan = typeof triggerBiometricScan !== 'undefined' ? triggerBiometricScan : null;
window.proceedToWorkspace = proceedToWorkspace;
window.logDoctorOut = logDoctorOut;
window.loadAnalysisRecord = loadAnalysisRecord;
window.copySoapNote = copySoapNote;
window.resetWorkstation = resetWorkstation;
window.goToDoctorDashboard = goToDoctorDashboard;
window.goToDoctorCases = goToDoctorCases;
window.switchWorkspaceTab = switchWorkspaceTab;
window.toggleHeatmapOverlay = toggleHeatmapOverlay;
window.playForecastSimulation = playForecastSimulation;
window.pauseForecastSimulation = pauseForecastSimulation;
window.resetForecastSimulation = resetForecastSimulation;
window.toggleVoiceDictation = toggleVoiceDictation;
window.selectTimelineChartPoint = selectTimelineChartPoint;
window.toggleAcquisitionPanel = toggleAcquisitionPanel;
window.activateDocWebcam = activateDocWebcam;
window.deactivateDocWebcam = deactivateDocWebcam;
window.captureDocWebcamFrame = captureDocWebcamFrame;
window.runLiveClinicalAnalysis = runLiveClinicalAnalysis;
window.generateCaseSummaryReport = generateCaseSummaryReport;
window.closeCaseReport = closeCaseReport;
window.autofillDoctorDemoCredentials = autofillDoctorDemoCredentials;
window.syncDoctorCases = syncDoctorCases;
