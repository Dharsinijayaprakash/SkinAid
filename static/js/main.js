/* ═══════════════════════════════════════════════════════════
   SkinAid — Patient Portal Logic
   Modern Healthcare Product · Emotionally Engaging UI
   Webcam · AI Pipeline · Robot Voice · Dashboard Rendering
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ── Portal State ──────────────────────────────────────────
let isLoggedIn       = false;
let currentPatient   = null;
let activeFile       = null;
let webcamStream     = null;
let currentUtterance = null;
let lastAnalysis     = null;
let isSignUpFormActive = false;

// ── Simulated Patient Database ────────────────────────────
let patientDatabase = JSON.parse(localStorage.getItem('patientDatabase')) || {
  "john@roboheal.org": {
    name: "John Doe",
    password: "password123",
    history: [
      { id: "CASE-2891", date: "2026-05-15", wound: "Laceration", severity: "Mild", progress: 85, days: "5-7 Days", img: "" },
      { id: "CASE-4902", date: "2026-05-24", wound: "Abrasion", severity: "Minimal", progress: 95, days: "3-5 Days", img: "" }
    ]
  },
  "emily@roboheal.org": {
    name: "Emily Davis",
    password: "password123",
    history: [
      { id: "CASE-1084", date: "2026-06-01", wound: "Burn Wound", severity: "Severe", progress: 40, days: "28-35 Days", img: "" }
    ]
  }
};

function savePatientDatabase() {
  localStorage.setItem('patientDatabase', JSON.stringify(patientDatabase));
}

// ══════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // File upload listener
  const fileInput = document.getElementById('patFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        processSelectedImage(e.target.files[0]);
      }
    });
  }

  // Drag & drop on upload dropzone
  const uploadDropzone = document.getElementById('uploadDropzone');
  if (uploadDropzone) {
    uploadDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadDropzone.classList.add('dragover');
    });

    uploadDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      uploadDropzone.classList.remove('dragover');
    });

    uploadDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadDropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        processSelectedImage(e.dataTransfer.files[0]);
      }
    });

    // Clicking dropzone triggers file selection
    uploadDropzone.addEventListener('click', () => {
      document.getElementById('patFileInput').click();
    });
  }

  // Initialize scroll animations
  initScrollAnimations();
});

function autofillDemoCredentials() {
  const isSignUp = typeof isSignUpFormActive !== 'undefined' ? isSignUpFormActive : false;
  if (isSignUp) {
    document.getElementById('authName').value = "John Doe";
  }
  document.getElementById('authEmail').value = "john@roboheal.org";
  document.getElementById('authPassword').value = "password123";
}

// ══════════════════════════════════════════════════════════
// AUTHENTICATION
// ══════════════════════════════════════════════════════════

function toggleAuthForms() {
  isSignUpFormActive = !isSignUpFormActive;
  const title = document.getElementById('authMainTitle');
  const subtitle = document.getElementById('authSubTitle');
  const submitBtn = document.getElementById('btnSubmitAuth');
  const toggleLink = document.getElementById('authToggleText');
  const nameGroup = document.getElementById('nameGroup');

  if (isSignUpFormActive) {
    title.textContent = t("create_account");
    subtitle.textContent = t("signup_subtitle");
    submitBtn.textContent = t("sign_up");
    toggleLink.textContent = t("already_have_account");
    if (nameGroup) nameGroup.classList.remove('hidden');
  } else {
    title.textContent = t("welcome_back");
    subtitle.textContent = t("signin_subtitle");
    submitBtn.textContent = t("sign_in");
    toggleLink.textContent = t("dont_have_account");
    if (nameGroup) nameGroup.classList.add('hidden');
  }
}

async function processAuthSubmit() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;

  if (!email || !password) {
    alert(t("Missing email or password"));
    return;
  }

  if (isSignUpFormActive) {
    const name = document.getElementById('authName').value.trim();
    if (!name) {
      alert(t("Please enter your full name to sign up."));
      return;
    }

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, role: 'patient' })
      });
      const data = await res.json();
      if (!data.success) {
        alert(t("Sign Up Failed: ") + (data.error || "Unknown error"));
        return;
      }
      alert(t("Account created successfully! Please sign in with your credentials."));
      toggleAuthForms();
    } catch (err) {
      alert(t("Error during signup. Server might be offline."));
    }
    return;
  }

  // Sign In
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role: 'patient' })
    });
    const data = await res.json();
    if (!data.success) {
      alert(t("Invalid credentials. Try: john@roboheal.org / password123"));
      return;
    }

    const user = data.user;
    isLoggedIn = true;
    currentPatient = {
      email: email,
      name: user.name,
      history: user.history || []
    };

    document.getElementById('authPage').classList.add('hidden');
    document.getElementById('portalView').classList.remove('hidden');
    document.getElementById('userDisplayBadge').textContent = user.name;

    // Update sidebar user info
    const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase();
    document.getElementById('sidebarUserInitials').textContent = initials || 'P';
    document.getElementById('sidebarUserName').textContent = user.name;

    goToDashboard();
  } catch (err) {
    alert(t("Authentication Error. Server might be offline."));
  }
}

function logUserOut() {
  isLoggedIn = false;
  currentPatient = null;
  lastAnalysis = null;
  deactivateWebcamStream();
  stopSpeech();

  document.getElementById('portalView').classList.add('hidden');
  document.getElementById('authPage').classList.remove('hidden');
}

// ══════════════════════════════════════════════════════════
// DASHBOARD RENDERING
// ══════════════════════════════════════════════════════════

function updateDashboard() {
  updateHeroSection();
  updateHealthSummaryCards();
  updateJourneyProgress();
  renderTimelineHistory();
  initScrollAnimations();
}

// ── Hero Section ──────────────────────────────────────────
function updateHeroSection() {
  // Time-of-day greeting
  const hour = new Date().getHours();
  let greeting = t('good_evening');
  if (hour < 12) greeting = t('good_morning');
  else if (hour < 17) greeting = t('good_afternoon');

  const el = document.getElementById('heroGreeting');
  if (el && currentPatient) {
    el.textContent = `${greeting}, ${currentPatient.name}`;
  }

  const history = currentPatient ? currentPatient.history : [];

  if (history.length > 0) {
    const latest = history[0];

    // Update hero title based on state
    const titleEl = document.getElementById('heroTitle');
    if (titleEl) titleEl.textContent = t('how_is_wound');

    const subtitleEl = document.getElementById('heroSubtitle');
    if (subtitleEl) subtitleEl.textContent = t('Your latest assessment shows progress. Keep up the great care routine!');

    // Hero stats
    const statusEl = document.getElementById('heroLastStatus');
    if (statusEl) statusEl.textContent = t(latest.severity) || '—';

    const assessEl = document.getElementById('heroAssessments');
    if (assessEl) assessEl.textContent = history.length;

    // Healing ring
    const pct = latest.progress || 0;
    updateHealingRing(pct);

    const pctEl = document.getElementById('heroHealingPct');
    if (pctEl) pctEl.textContent = `${pct}%`;
  } else {
    // Empty state - first time user
    const titleEl = document.getElementById('heroTitle');
    if (titleEl) titleEl.textContent = t('first_time_hero_title');

    const subtitleEl = document.getElementById('heroSubtitle');
    if (subtitleEl) subtitleEl.textContent = t('first_time_hero_desc');

    const statusEl = document.getElementById('heroLastStatus');
    if (statusEl) statusEl.textContent = '—';

    const assessEl = document.getElementById('heroAssessments');
    if (assessEl) assessEl.textContent = '0';

    updateHealingRing(0);

    const pctEl = document.getElementById('heroHealingPct');
    if (pctEl) pctEl.textContent = '—';
  }
}

function updateHealingRing(percentage) {
  const ring = document.getElementById('heroRingProgress');
  if (!ring) return;

  const circumference = 2 * Math.PI * 52; // r = 52
  const offset = circumference - (percentage / 100) * circumference;

  // Animate after a brief delay
  setTimeout(() => {
    ring.style.strokeDashoffset = offset;
  }, 300);
}

// ── Health Summary Cards ──────────────────────────────────
function updateHealthSummaryCards() {
  const history = currentPatient ? currentPatient.history : [];

  if (history.length > 0) {
    const latest = history[0];

    // Wound Status
    document.getElementById('summaryWoundStatus').textContent = t(latest.wound) || '—';
    document.getElementById('summaryWoundSub').textContent = `${t(latest.severity)} ` + t('severity_level').toLowerCase();

    // Healing Progress
    document.getElementById('summaryHealingProgress').textContent = `${latest.progress}%`;
    document.getElementById('summaryHealingSub').textContent = t(getProgressMessage(latest.progress));

    // Recovery Time
    document.getElementById('summaryRecoveryTime').textContent = latest.days || '—';
    document.getElementById('summaryRecoverySub').textContent = t('Estimated timeline');

    // AI Status
    document.getElementById('summaryAIStatus').textContent = t('active');
    document.getElementById('summaryAISub').textContent = `${history.length} ` + t('assessments').toLowerCase();
  } else {
    document.getElementById('summaryWoundStatus').textContent = t('no_data_yet');
    document.getElementById('summaryWoundSub').textContent = t('complete_first_assessment');
    document.getElementById('summaryHealingProgress').textContent = '—';
    document.getElementById('summaryHealingSub').textContent = t('start_tracking_today');
    document.getElementById('summaryRecoveryTime').textContent = '—';
    document.getElementById('summaryRecoverySub').textContent = t('based_on_ai');
    document.getElementById('summaryAIStatus').textContent = t('ready');
    document.getElementById('summaryAISub').textContent = t('online_available');
  }
}

function getProgressMessage(pct) {
  if (pct >= 90) return 'Almost fully healed!';
  if (pct >= 70) return 'Healing well — keep it up!';
  if (pct >= 50) return 'Making steady progress';
  if (pct >= 30) return 'Healing has begun';
  return 'Early recovery stage';
}

// ── Journey Progress ──────────────────────────────────────
function updateJourneyProgress() {
  const history = currentPatient ? currentPatient.history : [];
  const hasAssessment = history.length > 0;

  for (let i = 1; i <= 5; i++) {
    const step = document.getElementById(`journeyStep${i}`);
    if (!step) continue;

    step.classList.remove('completed', 'active');

    if (hasAssessment) {
      if (i <= 5) step.classList.add('completed');
    } else {
      if (i === 1) step.classList.add('active');
    }
  }
}

// ── Timeline / Recent Assessments ─────────────────────────
function renderTimelineHistory() {
  const list = document.getElementById('timelineList');
  if (!list) return;

  const history = currentPatient ? currentPatient.history : [];

  if (history.length === 0) {
    // Beautiful empty state
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-visual">
          <div class="empty-illustration">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
        </div>
        <div class="empty-state-title" data-i18n="no_assessments_yet">${t('no_assessments_yet')}</div>
        <p class="empty-state-desc" data-i18n="first_assessment_desc">
          ${t('first_assessment_desc')}
        </p>
        <button class="empty-state-cta" onclick="scrollToUpload()" data-i18n="start_first_assessment_btn">
          ${t('start_first_assessment_btn')}
        </button>
      </div>
    `;
    return;
  }

  // Render timeline items (max 5 recent)
  const recent = history.slice(0, 5);
  list.innerHTML = recent.map((item, idx) => `
    <div class="timeline-item" style="animation-delay: ${idx * 0.08}s;">
      <div class="timeline-marker">
        <div class="timeline-dot" style="background: ${mapSeverityColorRaw(item.severity)};"></div>
        ${idx < recent.length - 1 ? '<div class="timeline-line"></div>' : ''}
      </div>
      <div class="timeline-card">
        <div class="timeline-card-header">
          <span class="timeline-wound-type">${t(item.wound)}</span>
          <span class="timeline-date">${formatDate(item.date)}</span>
        </div>
        <div class="timeline-meta">
          <span class="timeline-badge" style="background: ${mapSeverityColorRaw(item.severity)}15; color: ${mapSeverityColorRaw(item.severity)};">
            ${t(item.severity)}
          </span>
          <div class="timeline-progress-bar">
            <div class="timeline-progress-fill" style="width: ${item.progress}%;"></div>
          </div>
          <span class="timeline-progress-text">${item.progress}%</span>
        </div>
      </div>
    </div>
  `).join('');
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ══════════════════════════════════════════════════════════
// SCROLL ANIMATIONS
// ══════════════════════════════════════════════════════════

function initScrollAnimations() {
  const elements = document.querySelectorAll('.animate-on-scroll');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

    elements.forEach(el => {
      el.classList.remove('visible');
      observer.observe(el);
    });
  } else {
    // Fallback: show all
    elements.forEach(el => el.classList.add('visible'));
  }
}

// ══════════════════════════════════════════════════════════
// WEBCAM CAPTURE
// ══════════════════════════════════════════════════════════

async function activateWebcamStream() {
  clearWoundImage();

  document.getElementById('genUploadCard').classList.add('hidden');
  document.getElementById('cameraCard').classList.remove('hidden');

  const video = document.getElementById('webcamVideo');

  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false
    });
    video.srcObject = webcamStream;
  } catch (err) {
    alert("Unable to access camera. Please upload an image instead.");
    deactivateWebcamStream();
  }
}

function deactivateWebcamStream() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }

  document.getElementById('cameraCard').classList.add('hidden');
  document.getElementById('genUploadCard').classList.remove('hidden');
}

function captureWebcamFrame() {
  const video = document.getElementById('webcamVideo');
  const canvas = document.getElementById('photoCanvas');

  if (!webcamStream || !video || !canvas) return;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob((blob) => {
    const file = new File([blob], "camera_snapshot.jpg", { type: "image/jpeg" });
    processSelectedImage(file);
    deactivateWebcamStream();
  }, 'image/jpeg');
}

// ══════════════════════════════════════════════════════════
// IMAGE PROCESSING
// ══════════════════════════════════════════════════════════

function processSelectedImage(file) {
  activeFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('patPreviewImg').src = e.target.result;
  };
  reader.readAsDataURL(file);

  document.getElementById('genUploadCard').classList.add('hidden');
  document.getElementById('patPreviewCard').classList.remove('hidden');

  // Update journey step
  updateJourneyStepActive(1);
}

function clearWoundImage() {
  activeFile = null;
  document.getElementById('patFileInput').value = '';
  document.getElementById('patPreviewCard').classList.add('hidden');
  document.getElementById('patAnalyzeBtn').classList.remove('hidden');
  document.getElementById('genUploadCard').classList.remove('hidden');
  document.getElementById('patResultsSection').classList.add('hidden');
  document.getElementById('patRobotSection').classList.add('hidden');
  stopSpeech();
}

function updateJourneyStepActive(stepNum) {
  for (let i = 1; i <= 5; i++) {
    const step = document.getElementById(`journeyStep${i}`);
    if (!step) continue;
    step.classList.remove('active', 'completed');
    if (i < stepNum) step.classList.add('completed');
    else if (i === stepNum) step.classList.add('active');
  }
}

// ══════════════════════════════════════════════════════════
// AI ASSESSMENT
// ══════════════════════════════════════════════════════════

async function initiateAIEvaluation() {
  if (!activeFile) return;

  const previewCard = document.getElementById('patPreviewCard');
  const loaderCard = document.getElementById('patLoaderCard');
  const analyzeBtn = document.getElementById('patAnalyzeBtn');

  analyzeBtn.disabled = true;
  previewCard.classList.add('hidden');
  loaderCard.classList.remove('hidden');

  resetLoaderSteps();

  // Cinematic Robot Assistant enters from the right side of the screen at analysis start
  const robotCard = document.querySelector('.robot-assistant-card');
  if (robotCard) {
    robotCard.classList.remove('retreating');
    robotCard.classList.add('offscreen-right');
  }
  document.getElementById('patRobotSection').classList.remove('hidden');
  document.getElementById('robotDialogBubble').innerHTML = `<strong>AI Assistant:</strong><br>"Hello! I am scanning your wound image. Please give me a moment to analyze the details..."`;

  // Fly smoothly into view and float
  setTimeout(() => {
    if (robotCard) {
      robotCard.classList.remove('offscreen-right');
    }
  }, 100);

  const formData = new FormData();
  formData.append('image', activeFile);

  try {
    const apiPromise = fetch('/analyze', { method: 'POST', body: formData });

    // Animated pipeline stages
    await animateAILoaderStage(1, 16, "loadStep1");
    updateJourneyStepActive(2);
    await animateAILoaderStage(2, 33, "loadStep2");
    updateJourneyStepActive(3);
    await animateAILoaderStage(3, 50, "loadStep3");
    updateJourneyStepActive(4);
    await animateAILoaderStage(4, 66, "loadStep4");
    await animateAILoaderStage(5, 83, "loadStep5");
    await animateAILoaderStage(6, 100, "loadStep6");
    updateJourneyStepActive(5);

    const res = await apiPromise;
    const data = await res.json();

    loaderCard.classList.add('hidden');
    analyzeBtn.disabled = false;

    if (!data.success) {
      alert("Analysis failed: " + (data.error || "Unknown error"));
      previewCard.classList.remove('hidden');
      return;
    }

    // Keep preview card visible but hide the analyze button since analysis is complete
    previewCard.classList.remove('hidden');
    analyzeBtn.classList.add('hidden');

    lastAnalysis = data;
    renderDiagnosticResults(data);

    // Mark all journey steps complete
    for (let i = 1; i <= 5; i++) {
      const step = document.getElementById(`journeyStep${i}`);
      if (step) {
        step.classList.remove('active');
        step.classList.add('completed');
      }
    }

  } catch (err) {
    loaderCard.classList.add('hidden');
    analyzeBtn.disabled = false;
    previewCard.classList.remove('hidden');
    alert("Could not connect to the analysis server. Please try again.");
  }
}

// ── Loader Stage Animation ────────────────────────────────
async function animateAILoaderStage(stepNum, targetWidth, stepId) {
  const stepEl = document.getElementById(stepId);
  const bar = document.getElementById('patProgressBar');

  if (stepEl) stepEl.classList.add('active');

  let startWidth = parseInt(bar.style.width) || 0;
  let increment = (targetWidth - startWidth) / 10;
  for (let i = 0; i < 10; i++) {
    startWidth += increment;
    bar.style.width = `${startWidth}%`;
    await sleep(60);
  }

  if (stepEl) stepEl.classList.replace('active', 'done');
}

function resetLoaderSteps() {
  document.getElementById('patProgressBar').style.width = '0%';
  for (let i = 1; i <= 6; i++) {
    const el = document.getElementById(`loadStep${i}`);
    if (el) el.className = "loader-step";
  }
}

// ══════════════════════════════════════════════════════════
// RENDER DIAGNOSTIC RESULTS
// ══════════════════════════════════════════════════════════

function renderDiagnosticResults(data) {
  const robotCard = document.querySelector('.robot-assistant-card');
  if (robotCard) {
    robotCard.classList.remove('retreating', 'offscreen-right');
  }

  document.getElementById('patRobotSection').classList.remove('hidden');
  document.getElementById('patResultsSection').classList.add('hidden');

  // S: Subjective
  document.getElementById('resPatientName').textContent = data.patient_name || 'Anonymous';
  document.getElementById('resPatientId').textContent = data.patient_id || 'PAT-XXXX';
  document.getElementById('resPriorityScore').textContent = data.priority_score || '—';

  // O: Objective
  document.getElementById('resWoundSize').textContent = data.prediction.wound_size || '—';
  document.getElementById('resRednessRatio').textContent = data.image_stats.redness_ratio || '—';
  document.getElementById('resImgResolution').textContent = data.image_stats.resolution || '—';
  document.getElementById('resImgBrightness').textContent = data.image_stats.brightness || '—';

  // A: Assessment
  document.getElementById('resWoundType').textContent = t(data.wound_type) || '—';
  document.getElementById('resConfidence').textContent = data.confidence_pct || '—';
  document.getElementById('resInfectionLevel').textContent = data.prediction.infection_level || '—';
  document.getElementById('resWoundStage').textContent = mapEstimatedWoundStage(data.wound_type);

  // Severity badge
  const badge = document.getElementById('resSeverityBadge');
  badge.textContent = t(data.severity);
  badge.style.background = mapSeverityColorRaw(data.severity);

  // Hospital recommendation
  const hospText = document.getElementById('resHospitalText');
  const hospCard = document.getElementById('resHospitalCard');
  hospCard.style.borderLeftColor = mapSeverityColorRaw(data.severity);
  hospText.textContent = t(mapHospitalRecommendation(data.severity));

  // First Aid Checklist
  const checklist = document.getElementById('resFirstAidChecklist');
  const firstAidSteps = [
    "Wash your hands thoroughly with soap",
    "Gently clean the wound with clean water",
    "Apply the recommended antiseptic",
    "Cover with a clean, sterile dressing"
  ];
  checklist.innerHTML = firstAidSteps.map(step => `
    <div class="checklist-item" onclick="toggleChecklistItem(this)">
      <div class="check-box">✓</div>
      <span>${t(step)}</span>
    </div>
  `).join('');

  // Ointments
  const ointmentsList = document.getElementById('resOintmentsList');
  if (['Minimal', 'Mild', 'Moderate'].includes(data.severity)) {
    ointmentsList.innerHTML = [
      { name: "Neosporin / Polymyxin", type: "Antibiotic ointment for wound protection" },
      { name: "Hydrogel Wound Gel", type: "Moisture-retaining healing accelerator" }
    ].map(r => `
      <div class="ointment-card">
        <span class="ointment-name">${t(r.name)}</span>
        <span class="ointment-type">${t(r.type)}</span>
      </div>
    `).join('');
  } else {
    ointmentsList.innerHTML = `
      <div style="font-size: 12px; color: var(--sev-red); background: var(--rose-light); padding: 14px; border-radius: 10px; font-weight: 600; border: 1px dashed var(--sev-red);">
        ${t('hospital_warning')}
      </div>
    `;
  }

  // Healing metrics
  document.getElementById('resHealingPct').textContent = `${data.prediction.current_healing_pct}%`;
  const minDays = data.prediction.estimated_days - 2;
  const maxDays = data.prediction.estimated_days + 2;
  const recoveryDaysStr = `${minDays}-${maxDays} ${t('Days')}`;
  document.getElementById('resRecoveryTime').textContent = recoveryDaysStr;

  // Cinematic custom spoken report
  const robotSpeech = currentLang === 'ta' 
    ? `நான் உங்கள் காயத்தை பகுப்பாய்வு செய்தேன். இதன் வகை: ${t(data.wound_type)}, தீவிரத்தன்மை நிலை: ${t(data.severity)}. முதலுதவிக்கு: ${t(data.first_aid)}. உங்களின் குணமடைதல் காலம் ${minDays} முதல் ${maxDays} நாட்கள் ஆகும். தயவுசெய்து பரிந்துரைக்கப்பட்ட பராமரிப்பு படிகளைப் பின்பற்றவும்.`
    : `I have analyzed your wound. The condition is classified as a ${data.wound_type} with a severity level of ${data.severity}. For first aid: ${data.first_aid} Your expected recovery timeline is ${minDays} to ${maxDays} days. Please follow the recommended care steps.`;
  document.getElementById('robotDialogBubble').innerHTML = `<strong>${t('AI Assistant')}:</strong><br>"${robotSpeech}"`;

  // Update floating assistant widget bubble
  const floatText = document.getElementById('floatingBubbleText');
  if (floatText) {
    floatText.innerHTML = `<strong>${t('first_aid_steps')} ${t('for')} ${t(data.wound_type)}:</strong><br>${robotSpeech}`;
  }
  const floatBubble = document.getElementById('floatingBubble');
  if (floatBubble) {
    floatBubble.style.display = 'flex';
  }

  // Prompt speech synthesis quickly since the companion has already entered the viewport
  setTimeout(() => {
    speakText(robotSpeech, true);
  }, 400);

  // Add to history
  const historyRecord = {
    id: `CASE-${Math.floor(1000 + Math.random() * 9000)}`,
    date: new Date().toISOString().split('T')[0],
    wound: data.wound_type,
    severity: data.severity,
    progress: data.prediction.current_healing_pct,
    days: recoveryDaysStr,
    img: ""
  };

  currentPatient.history.unshift(historyRecord);
  syncPatientHistory();
  updateDashboard();
  updateHistoryListUI();

  // Emergency alert for severe/critical
  if (data.severity === 'Severe' || data.severity === 'Critical') {
    triggerEmergencyAlert(`Your assessment indicates ${data.severity.toLowerCase()} severity. ${mapHospitalRecommendation(data.severity)}`);
  }

  document.getElementById('patRobotSection').scrollIntoView({ behavior: 'smooth' });
}

function showDetailedReport() {
  document.getElementById('patResultsSection').classList.remove('hidden');
  document.getElementById('patResultsSection').scrollIntoView({ behavior: 'smooth' });
}

// ══════════════════════════════════════════════════════════
// HISTORY LIST UI (Separate History Page)
// ══════════════════════════════════════════════════════════

function updateHistoryListUI() {
  const list = document.getElementById('patHistoryList');
  if (!list) return;

  if (!currentPatient || currentPatient.history.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-visual">
          <div class="empty-illustration">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
        </div>
        <p style="font-size: 15px; font-weight: 600; color: var(--text-sub); margin-top: 16px; margin-bottom: 4px;">No assessments yet</p>
        <p style="font-size: 13px; color: var(--text-muted);">Your wound assessment history will appear here.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = currentPatient.history.map(item => `
    <div class="history-item">
      <div class="history-thumb-wrap">
        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--primary-light); font-size: 20px; border-radius: inherit;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M12 8v8"/>
            <path d="M8 12h8"/>
          </svg>
        </div>
      </div>
      <div class="history-details">
        <div class="history-name">${item.wound}</div>
        <div class="history-meta">${formatDate(item.date)} · Progress: ${item.progress}% · Est: ${item.days}</div>
      </div>
      <span class="history-badge" style="background: ${mapSeverityColorRaw(item.severity)}15; color: ${mapSeverityColorRaw(item.severity)};">
        ${item.severity}
      </span>
    </div>
  `).join('');
}

// ══════════════════════════════════════════════════════════
// CHECKLIST TOGGLE
// ══════════════════════════════════════════════════════════

function toggleChecklistItem(el) {
  el.classList.toggle('checked');
}

// ══════════════════════════════════════════════════════════
// ROBOT VOICE SYNTHESIS
// ══════════════════════════════════════════════════════════

function speakRobotGuidance() {
  if (lastAnalysis) {
    speakText(lastAnalysis.first_aid);
  }
}

function stopRobotGuidance() {
  stopSpeech();
}

function speakText(text, autoShowReport = false) {
  if (!('speechSynthesis' in window)) {
    if (autoShowReport) {
      setTimeout(() => {
        showDetailedReport();
      }, 1000);
    }
    return;
  }

  stopSpeech();

  const utterance = new SpeechSynthesisUtterance(text);
  currentUtterance = utterance;

  const voices = window.speechSynthesis.getVoices();
  const enVoice = voices.find(v => v.lang.startsWith('en'));
  if (enVoice) utterance.voice = enVoice;

  utterance.rate = 0.95;
  utterance.pitch = 1.05;

  utterance.onstart = () => toggleRobotSpeechIndicator(true);
  utterance.onend = () => { 
    toggleRobotSpeechIndicator(false); 
    currentUtterance = null; 
    if (autoShowReport) {
      const robotCard = document.querySelector('.robot-assistant-card');
      if (robotCard) {
        robotCard.classList.add('retreating');
        setTimeout(() => {
          showDetailedReport();
          document.getElementById('patRobotSection').classList.add('hidden');
        }, 1800);
      } else {
        showDetailedReport();
      }
    }
  };
  utterance.onerror = () => { 
    toggleRobotSpeechIndicator(false); 
    currentUtterance = null; 
    if (autoShowReport) {
      showDetailedReport();
    }
  };

  window.speechSynthesis.speak(utterance);
}

function stopSpeech() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  toggleRobotSpeechIndicator(false);
}

function toggleRobotSpeechIndicator(isSpeaking) {
  const head = document.getElementById('robotAvatarHead');
  const stopBtn = document.getElementById('btnStopRobot');
  const playBtn = document.getElementById('btnPlayRobot');
  const voiceWaves = document.getElementById('voiceWaves');

  // Floating widget elements
  const floatingHead = document.getElementById('floatingRobotHead');

  if (isSpeaking) {
    if (head) head.classList.add('speaking');
    if (voiceWaves) voiceWaves.classList.add('speaking');
    if (stopBtn) stopBtn.classList.remove('hidden');
    if (playBtn) playBtn.textContent = '🔊 Speaking...';
    if (floatingHead) floatingHead.classList.add('speaking');
  } else {
    if (head) head.classList.remove('speaking');
    if (voiceWaves) voiceWaves.classList.remove('speaking');
    if (stopBtn) stopBtn.classList.add('hidden');
    if (playBtn) playBtn.textContent = '🔊 Play Voice Guide';
    if (floatingHead) floatingHead.classList.remove('speaking');
  }
}

// ── Floating Robot Widget Handlers ───────────────────────
function toggleFloatingBubble(e) {
  if (e) e.stopPropagation();
  const bubble = document.getElementById('floatingBubble');
  if (!bubble) return;
  if (bubble.style.display === 'flex') {
    bubble.style.display = 'none';
  } else {
    bubble.style.display = 'flex';
  }
}

function startFloatingSpeech() {
  const textEl = document.getElementById('floatingBubbleText');
  if (textEl) {
    // Strip HTML tags for clean speech
    const cleanText = textEl.textContent.replace(/🤖\s*/g, '');
    speakText(cleanText);
  }
}

// ══════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════

function updateActiveNavigation(index) {
  const sidebarItems = document.querySelectorAll('.sidebar-nav-item');
  sidebarItems.forEach((item, idx) => {
    item.classList.toggle('active', idx === index);
  });

  const mobileItems = document.querySelectorAll('.mobile-nav-item');
  mobileItems.forEach((item, idx) => {
    item.classList.toggle('active', idx === index);
  });
}

function goToDashboard() {
  document.getElementById('patHistoryPage').classList.add('hidden');
  document.getElementById('patientDashboard').classList.remove('hidden');
  document.getElementById('patResultsSection').classList.add('hidden');
  document.getElementById('patRobotSection').classList.add('hidden');
  document.getElementById('patLoaderCard').classList.add('hidden');
  document.getElementById('patPreviewCard').classList.add('hidden');
  document.getElementById('cameraCard').classList.add('hidden');
  document.getElementById('genUploadCard').classList.remove('hidden');

  updateActiveNavigation(0);
  updateDashboard();
}

function scrollToUpload() {
  document.getElementById('patHistoryPage').classList.add('hidden');
  document.getElementById('patientDashboard').classList.remove('hidden');
  document.getElementById('patResultsSection').classList.add('hidden');
  document.getElementById('patRobotSection').classList.add('hidden');
  document.getElementById('patLoaderCard').classList.add('hidden');
  document.getElementById('patPreviewCard').classList.add('hidden');
  document.getElementById('cameraCard').classList.add('hidden');
  document.getElementById('genUploadCard').classList.remove('hidden');

  document.getElementById('genUploadCard').scrollIntoView({ behavior: 'smooth' });
  updateActiveNavigation(1);
}

function scrollToHistory() {
  document.getElementById('patientDashboard').classList.add('hidden');
  document.getElementById('patResultsSection').classList.add('hidden');
  document.getElementById('patRobotSection').classList.add('hidden');
  document.getElementById('patHistoryPage').classList.remove('hidden');

  updateActiveNavigation(2);
  updateHistoryListUI();
}

function showCareGuide() {
  triggerEmergencyAlert("Wash hands thoroughly with soap. Clean the wound gently using clean water. Apply recommended antiseptic cream. Cover with a sterile dressing. If the wound is deep, bleeding heavily, or shows signs of infection, please seek medical attention immediately.");
  const title = document.getElementById('emTitle');
  if (title) title.textContent = "CARE GUIDE";
  updateActiveNavigation(3);
}

// ══════════════════════════════════════════════════════════
// EMERGENCY ALERTS
// ══════════════════════════════════════════════════════════

function triggerEmergencyAlert(text) {
  const overlay = document.getElementById('emergencyOverlay');
  const desc = document.getElementById('emergencyDesc');
  if (overlay) {
    desc.textContent = text;
    overlay.classList.remove('hidden');
  }
}

function dismissEmergencyAlert() {
  const overlay = document.getElementById('emergencyOverlay');
  if (overlay) overlay.classList.add('hidden');
  const title = document.getElementById('emTitle');
  if (title) title.textContent = "EMERGENCY NOTICE";
}

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════

function mapSeverityColor(severity) {
  const colors = {
    Minimal: 'var(--sev-green)',
    Mild: 'var(--sev-green)',
    Moderate: 'var(--sev-yellow)',
    Severe: 'var(--sev-orange)',
    Critical: 'var(--sev-red)'
  };
  return colors[severity] || 'var(--primary)';
}

function mapSeverityColorRaw(severity) {
  const colors = {
    Minimal: '#10B981',
    Mild: '#10B981',
    Moderate: '#F59E0B',
    Severe: '#F97316',
    Critical: '#EF4444'
  };
  return colors[severity] || '#4F46E5';
}

function mapEstimatedWoundStage(woundType) {
  if (woundType === 'Ulcer') return 'Stage 3 (Deep tissue)';
  if (woundType === 'Burn Wound') return 'Stage 2 (Partial thickness)';
  if (woundType === 'Laceration' || woundType === 'Puncture Wound') return 'Stage 2 (Deep cut)';
  return 'Stage 1 (Surface level)';
}

function mapHospitalRecommendation(severity) {
  const recs = {
    Minimal: "Home care is sufficient. Keep the area clean and monitor for changes.",
    Mild: "Continue home care. Keep clean and change dressings regularly.",
    Moderate: "We recommend seeing a doctor within 24 hours for evaluation.",
    Severe: "Please visit an urgent care clinic or hospital soon.",
    Critical: "Seek emergency medical care immediately. Call emergency services if needed."
  };
  return recs[severity] || "Follow your care provider's instructions.";
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncPatientHistory() {
  if (!currentPatient || !currentPatient.email) return;
  try {
    await fetch('/api/auth/update_history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: currentPatient.email,
        history: currentPatient.history
      })
    });
  } catch (err) {
    console.error("Failed to sync patient history to server", err);
  }
}

// React to language switches in real time
document.addEventListener('languagechanged', () => {
  if (isLoggedIn) {
    updateDashboard();
    updateHistoryListUI();
    if (lastAnalysis) {
      // Re-render without triggering speech again to avoid audio overlap
      const origSpeakText = speakText;
      speakText = () => {};
      try {
        renderDiagnosticResults(lastAnalysis);
      } finally {
        speakText = origSpeakText;
      }
    }
  }
});

// ══════════════════════════════════════════════════════════
// GLOBAL EXPOSE
// ══════════════════════════════════════════════════════════

window.processAuthSubmit = processAuthSubmit;
window.toggleAuthForms = toggleAuthForms;
window.logUserOut = logUserOut;
window.activateWebcamStream = activateWebcamStream;
window.deactivateWebcamStream = deactivateWebcamStream;
window.captureWebcamFrame = captureWebcamFrame;
window.clearWoundImage = clearWoundImage;
window.initiateAIEvaluation = initiateAIEvaluation;
window.toggleChecklistItem = toggleChecklistItem;
window.speakRobotGuidance = speakRobotGuidance;
window.stopRobotGuidance = stopRobotGuidance;
window.goToDashboard = goToDashboard;
window.scrollToUpload = scrollToUpload;
window.dismissEmergencyAlert = dismissEmergencyAlert;
window.showDetailedReport = showDetailedReport;
window.scrollToHistory = scrollToHistory;
window.showCareGuide = showCareGuide;
window.toggleFloatingBubble = toggleFloatingBubble;
window.startFloatingSpeech = startFloatingSpeech;
window.autofillDemoCredentials = autofillDemoCredentials;
window.syncPatientHistory = syncPatientHistory;
