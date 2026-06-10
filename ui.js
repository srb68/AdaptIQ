/**
 * AdaptIQ — UI Module (ui.js)
 * Owns: screen transitions, chart rendering, overlay management,
 *       metric updates, event log, calibration animation, session timer.
 *
 * Depends on: Bus (global), Chart.js (CDN)
 * Does NOT depend on sensors.js or brain.js — communicates via Bus events.
 */

window.AdaptIQ_UI = (() => {
  'use strict';

  // ============================================================
  // STATE
  // ============================================================
  const state = {
    currentScreen: 'profile',
    profile: null,
    sessionStart: null,
    sessionTimerInterval: null,
    engagementTimerInterval: null,
    sessionSeconds: 0,
    engagedSeconds: 0,
    lastFaceTime: 0,
    scores: { eyeContact: 0, headStability: 0, vocalConfidence: 0, speechClarity: 0, overall: 0, grade: '—' },
    metrics: { gds: 0, osr: 0, hpd: 0, et: 0, ves: 0, pvs: 0, silr: 0, sr: 0, bra: 0, ces: 0 },
    faceDetected: false,
    calibrationStages: { face: 'pending', gaze: 'pending', audio: 'pending' },
    flags: [],
    flagTimers: [],
    intervention: { active: false, timer: null, progressTimer: null },
    orb: { severity: 'blue', lastUpdate: 0, hideTimer: null },
    eventLog: [],
    charts: {},
    sparkBuffers: { gds: [], hpd: [], ves: [], ces: [], silr: [] },
    maxSparkPoints: 40,
    mode: 'simple',
    gazeLastRenderTime: 0,
    // New: per-question tracking
    questionIndex: 0,
    questionSnapshots: Array.from({ length: 30 }, () => ({
      eyeContact: 0, headStability: 0, vocalConfidence: 0, speechClarity: 0, samples: 0
    })),
    coachBuffer: '',
  };

  // ============================================================
  // SCREEN MANAGEMENT
  // ============================================================
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`screen-${id}`);
    if (target) target.classList.add('active');
    state.currentScreen = id;
  }

  // ============================================================
  // PROFILE SELECTION SCREEN
  // ============================================================
  function initProfileScreen() {
    const ctaText = document.getElementById('lp-cta-text');
    const ctaBtn  = document.getElementById('lp-cta-btn');

    document.querySelectorAll('.profile-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;

        // Visual selection state
        document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('profile-selected'));
        card.classList.add('profile-selected');
        if (ctaText) {
          const name = card.querySelector('h3')?.textContent || id.toUpperCase();
          ctaText.textContent = `Start as ${name}`;
        }

        state.profile = id;
        document.getElementById('topbar-profile-label').textContent = id.toUpperCase();
        Bus.emit('profile:selected', { id });
        addEventLog('info', `Profile selected: <strong>${id.toUpperCase()}</strong>`);
        showScreen('dashboard');
        startSession();
      });
    });

    // CTA button also triggers last-selected profile (if any)
    if (ctaBtn) {
      ctaBtn.addEventListener('click', () => {
        const selected = document.querySelector('.profile-card.profile-selected');
        if (selected) selected.click();
      });
    }
  }

  // ============================================================
  // SESSION MANAGEMENT
  // ============================================================
  function startSession() {
    state.sessionStart = Date.now();
    state.sessionSeconds = 0;
    state.engagedSeconds = 0;
    state.lastFaceTime = 0;
    initDashboard();

    // Show "Warming up…" pill and auto-dismiss after 8s
    const warmupPill = document.getElementById('warmup-pill');
    if (warmupPill) {
      warmupPill.style.opacity = '1';
      setTimeout(() => { warmupPill.style.opacity = '0'; }, 8000);
    }

    state.sessionTimerInterval = setInterval(() => {
      state.sessionSeconds++;
      updateTimer();
    }, 1000);

    // Engagement Time: count seconds where a face was actively detected
    state.engagementTimerInterval = setInterval(() => {
      if (state.lastFaceTime && Date.now() - state.lastFaceTime < 2000) {
        state.engagedSeconds++;
        updateMetricValue('metric-et', state.engagedSeconds, 0);
      }
    }, 1000);

    addEventLog('info', `Session started · Profile: <strong>${(state.profile || 'default').toUpperCase()}</strong>`);
  }

  function updateTimer() {
    const el = document.getElementById('session-timer');
    if (!el) return;
    const m = String(Math.floor(state.sessionSeconds / 60)).padStart(2, '0');
    const s = String(state.sessionSeconds % 60).padStart(2, '0');
    el.textContent = `${m}:${s}`;
  }

  function formatTime() {
    const m = String(Math.floor(state.sessionSeconds / 60)).padStart(2, '0');
    const s = String(state.sessionSeconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function endSession() {
    clearInterval(state.sessionTimerInterval);
    clearInterval(state.engagementTimerInterval);

    // Build summary from current scores
    showSummary({
      eyeContact:      state.scores.eyeContact,
      headStability:   state.scores.headStability,
      vocalConfidence: state.scores.vocalConfidence,
      speechClarity:   state.scores.speechClarity,
      overall:         state.scores.overall,
      grade:           state.scores.grade,
    });
  }

  // ============================================================
  // DASHBOARD INIT
  // ============================================================
  function initDashboard() {
    initSparklines();
    initScoreRing();
    initVideoFeed();

    // End session wired in app init; also wire here for safety
    document.getElementById('btn-end-session')?.addEventListener('click', () => {
      Bus.emit('session:end', {});
      endSession();
    });

    // Mic toggle
    const btnMic = document.getElementById('btn-mic-toggle');
    if (btnMic) {
      btnMic.addEventListener('click', () => {
        const icon = document.getElementById('mic-icon');
        const muted = btnMic.classList.toggle('muted');
        if (icon) icon.className = muted ? 'ti ti-microphone-off' : 'ti ti-microphone';
        // Mute/unmute the media stream if available
        const video = document.getElementById('video-feed');
        if (video && video.srcObject) {
          video.srcObject.getAudioTracks().forEach(t => { t.enabled = !muted; });
        }
      });
    }

    // Camera toggle
    const btnCam = document.getElementById('btn-cam-toggle');
    if (btnCam) {
      btnCam.addEventListener('click', () => {
        const icon = document.getElementById('cam-icon');
        const hidden = btnCam.classList.toggle('muted');
        if (icon) icon.className = hidden ? 'ti ti-video-off' : 'ti ti-video';
        const video = document.getElementById('video-feed');
        if (video && video.srcObject) {
          video.srcObject.getVideoTracks().forEach(t => { t.enabled = !hidden; });
        }
        if (video) video.style.opacity = hidden ? '0' : '1';
      });
    }

    // Track question index changes for per-question snapshots
    document.getElementById('btn-next-q')?.addEventListener('click', () => {
      state.questionIndex = Math.min(state.questionSnapshots.length - 1, state.questionIndex + 1);
    });
    document.getElementById('btn-prev-q')?.addEventListener('click', () => {
      state.questionIndex = Math.max(0, state.questionIndex - 1);
    });

    // Mode toggle pill buttons (legacy)
    const btnSimple = document.getElementById('mode-btn-simple');
    const btnTech   = document.getElementById('mode-btn-technical');
    if (btnSimple) btnSimple.addEventListener('click', () => setMode('simple'));
    if (btnTech)   btnTech.addEventListener('click',   () => setMode('technical'));

    const modeToggle = document.getElementById('mode-toggle');
    if (modeToggle) {
      modeToggle.addEventListener('change', (e) => {
        setMode(e.target.checked ? 'technical' : 'simple');
      });
    }

    const apiKeyInput = document.getElementById('api-key-input');
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
    updateSensorDot('ai', apiKey ? 'active' : 'inactive',
      apiKey ? 'AI ready' : 'AI offline — enter API key');

    initPanelToggles();
    initCameraViewModes();
    setMode('simple');
  }

  // ============================================================
  // PANEL TOGGLE LOGIC
  // ============================================================
  function initPanelToggles() {
    const panelMap = {
      coach:   { btn: 'btn-coach',   panel: 'panel-coach' },
      score:   { btn: 'btn-score',   panel: 'panel-score' },
      signals: { btn: 'btn-signals', panel: 'panel-signals' },
    };

    function closeAll() {
      Object.values(panelMap).forEach(({ btn, panel }) => {
        document.getElementById(panel)?.classList.remove('visible');
        document.getElementById(btn)?.classList.remove('active');
      });
    }

    Object.entries(panelMap).forEach(([key, { btn, panel }]) => {
      const btnEl   = document.getElementById(btn);
      const panelEl = document.getElementById(panel);
      if (!btnEl || !panelEl) return;

      btnEl.addEventListener('click', () => {
        const isOpen = panelEl.classList.contains('visible');
        closeAll();
        if (!isOpen) {
          panelEl.classList.add('visible');
          btnEl.classList.add('active');
        }
      });

      // Close button inside panel
      panelEl.querySelector('.overlay-panel-close')?.addEventListener('click', closeAll);
    });
  }

  // ============================================================
  // CAMERA VIEW MODES
  // ============================================================
  function initCameraViewModes() {
    const container     = document.getElementById('video-container');
    const btnDefault    = document.getElementById('cam-btn-default');
    const btnMinimized  = document.getElementById('cam-btn-minimized');
    const btnFullscreen = document.getElementById('cam-btn-fullscreen');
    if (!container || !btnDefault) return;

    function setViewMode(mode) {
      container.className = 'video-container' + (mode === 'default' ? '' : ' cam-' + mode);
      [btnDefault, btnMinimized, btnFullscreen].forEach(b => b && b.classList.remove('active'));
      const activeBtn = { default: btnDefault, minimized: btnMinimized, fullscreen: btnFullscreen }[mode];
      if (activeBtn) activeBtn.classList.add('active');

      if (mode !== 'minimized') {
        container.style.cssText = '';
      }
    }

    btnDefault    && btnDefault.addEventListener('click',    () => setViewMode('default'));
    btnMinimized  && btnMinimized.addEventListener('click',  () => setViewMode('minimized'));
    btnFullscreen && btnFullscreen.addEventListener('click', () => setViewMode('fullscreen'));

    // Drag for minimized PiP
    let dragging = false, dragOffX = 0, dragOffY = 0;

    container.addEventListener('mousedown', (e) => {
      if (!container.classList.contains('cam-minimized')) return;
      if (e.target.closest('.cam-mode-toggle')) return;
      dragging = true;
      const rect = container.getBoundingClientRect();
      dragOffX = e.clientX - rect.left;
      dragOffY = e.clientY - rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      container.style.left   = (e.clientX - dragOffX) + 'px';
      container.style.top    = (e.clientY - dragOffY) + 'px';
      container.style.right  = 'auto';
      container.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => { dragging = false; });
  }

  // ============================================================
  // VIDEO FEED
  // ============================================================
  function initVideoFeed() {
    const video = document.getElementById('video-feed');
    if (!video) return;

    // Video stream is now provided by APP INIT (shared with AudioEngine)
    // Only request if not already set (for standalone testing)
    if (!video.srcObject) {
      navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
        .then(stream => {
          video.srcObject = stream;
          updateSensorDot('camera', 'nominal', 'Camera active');
        })
        .catch(err => {
          console.warn('[AdaptIQ UI] Camera access denied:', err);
          updateVideoStatus(false);
          updateSensorDot('camera', 'error', 'Camera denied');
          updateSystemStatus('error', 'Camera access denied — please allow camera permission');
          updateOrb('red', 'Camera Denied', 'Allow camera access in browser settings.');
        });
    } else {
      updateSensorDot('camera', 'nominal', 'Camera active');
    }
  }

  function updateVideoStatus(detected) {
    state.faceDetected = detected;
    updateSensorDot('camera', detected ? 'active' : 'warning',
      detected ? 'Camera — face detected' : 'Camera — no face');
    if (!detected) updateOrb('yellow', 'No Face', 'Move closer or adjust lighting.');
  }

  // ============================================================
  // FACE OVERLAY RENDERING
  // ============================================================
  function drawFaceOverlay(data) {
    const canvas = document.getElementById('face-overlay-canvas');
    const video  = document.getElementById('video-feed');
    if (!canvas || !video) return;

    canvas.width  = video.videoWidth  || canvas.offsetWidth;
    canvas.height = video.videoHeight || canvas.offsetHeight;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state.mode !== 'technical') return;
    if (!data || !data.bbox) return;

    const { x, y, width, height } = data.bbox;
    const W = canvas.width;
    const H = canvas.height;

    // Scale bbox to canvas size
    const sx = W / (video.videoWidth  || W);
    const sy = H / (video.videoHeight || H);
    const bx = x * sx, by = y * sy, bw = width * sx, bh = height * sy;

    // Face bounding box
    ctx.strokeStyle = 'rgba(0,229,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, bw, bh);

    // Corner accents
    const cs = 12;
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2.5;
    [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]].forEach(([cx, cy], i) => {
      const dx = i % 2 === 0 ? 1 : -1;
      const dy = i < 2 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(cx + dx * cs, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * cs);
      ctx.stroke();
    });

    // Landmarks
    if (data.landmarks && Array.isArray(data.landmarks)) {
      ctx.fillStyle = 'rgba(0,229,255,0.6)';
      data.landmarks.forEach(pt => {
        ctx.beginPath();
        ctx.arc((pt.x || pt[0]) * sx, (pt.y || pt[1]) * sy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Expression label
    if (data.expressions) {
      const top = Object.entries(data.expressions).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > 0.4) {
        ctx.fillStyle = 'rgba(0,229,255,0.9)';
        ctx.font = '11px JetBrains Mono, monospace';
        ctx.fillText(top[0].toUpperCase(), bx, by - 6);
      }
    }
  }

  // ============================================================
  // SPARKLINE CHARTS (Chart.js)
  // ============================================================
  function makeSparkline(canvasId, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    return new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: color,
          borderWidth: 1.5,
          fill: true,
          backgroundColor: hexToRgba(color, 0.08),
          pointRadius: 0,
          tension: 0.4,
        }]
      },
      options: {
        responsive: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false },
        },
        elements: { line: { borderCapStyle: 'round' } }
      }
    });
  }

  function hexToRgba(hex, alpha) {
    // Accepts CSS var names or hex
    if (hex.startsWith('var(')) {
      return `rgba(0,229,255,${alpha})`; // fallback
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function initSparklines() {
    state.charts.gds  = makeSparkline('spark-gds',  '#00e5ff');
    state.charts.hpd  = makeSparkline('spark-hpd',  '#ffb700');
    state.charts.ves  = makeSparkline('spark-ves',  '#a855f7');
    state.charts.ces  = makeSparkline('spark-ces',  '#ffb700');
    state.charts.silr = makeSparkline('spark-silr', '#00b4d8');
  }

  function pushSparkData(key, value) {
    const buf = state.sparkBuffers[key];
    if (!buf) return;
    buf.push(value);
    if (buf.length > state.maxSparkPoints) buf.shift();

    const chart = state.charts[key];
    if (!chart) return;
    chart.data.labels = buf.map((_, i) => i);
    chart.data.datasets[0].data = [...buf];
    chart.update('none');
  }

  // ============================================================
  // SCORE RING (Canvas-based donut)
  // ============================================================
  function initScoreRing() {
    updateScoreRing(0, '—');
  }

  function updateScoreRing(overall, grade) {
    const canvas = document.getElementById('score-ring-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const r = 40, lineW = 7;

    ctx.clearRect(0, 0, W, H);

    // Background track
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = lineW;
    ctx.stroke();

    // Progress arc
    const pct = (overall || 0) / 100;
    const start = -Math.PI / 2;
    const end = start + pct * Math.PI * 2;

    const gradeColor = {
      'A': '#00ff88', 'A+': '#00ff88', 'A-': '#00ff88',
      'B': '#00e5ff', 'B+': '#00e5ff', 'B-': '#00e5ff',
      'C': '#ffb700', 'C+': '#ffb700', 'C-': '#ffb700',
      'D': '#ff3d5a', 'F': '#ff3d5a',
    }[grade] || '#00e5ff';

    if (pct > 0) {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, gradeColor);
      grad.addColorStop(1, '#a855f7');

      ctx.beginPath();
      ctx.arc(cx, cy, r, start, end);
      ctx.strokeStyle = grad;
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Center values
    document.getElementById('score-overall').textContent = overall > 0 ? Math.round(overall) : '--';
    document.getElementById('score-grade').textContent   = grade || '—';
  }

  // ============================================================
  // METRIC UPDATES
  // ============================================================
  function animateValue(el, value, decimals = 0) {
    if (!el) return;
    const formatted = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
    if (el.dataset.lastVal === formatted) return;
    el.dataset.lastVal = formatted;
    el.classList.remove('value-update');
    void el.offsetWidth; // reflow
    el.classList.add('value-update');
    // Update only the text node, preserving the unit <span>
    const textNode = Array.from(el.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = formatted;
    else el.firstChild && (el.firstChild.textContent = formatted);
  }

  function setBarWidth(barId, pct) {
    const el = document.getElementById(barId);
    if (el) el.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  }

  function updateSignal(data) {
    const m = state.metrics;
    if (data.gds   !== undefined) { m.gds   = data.gds;   pushSparkData('gds', data.gds); }
    if (data.osr   !== undefined) { m.osr   = data.osr;   }
    if (data.hpd   !== undefined) { m.hpd   = data.hpd;   pushSparkData('hpd', data.hpd); }
    if (data.et    !== undefined) { m.et    = data.et;    }
    if (data.ves   !== undefined) { m.ves   = data.ves;   pushSparkData('ves', data.ves); }
    if (data.pvs   !== undefined) { m.pvs   = data.pvs;   }
    if (data.silr  !== undefined) { m.silr  = data.silr;  pushSparkData('silr', data.silr); }
    if (data.sr    !== undefined) { m.sr    = data.sr;    }
    if (data.bra   !== undefined) { m.bra   = data.bra;   }
    if (data.ces   !== undefined) { m.ces   = data.ces;   pushSparkData('ces', data.ces); }

    renderMetrics();
    renderSignalsPanel();
  }

  function renderSignalsPanel() {
    const m = state.metrics;
    // Eye = 100 - off-screen ratio
    const eyeVal  = Math.round(Math.max(0, 100 - (m.osr || 0)));
    // Calm = 100 - emotional tension
    const calmVal = Math.round(Math.max(0, 100 - (m.et || 0)));
    // Voice = vocal energy spread (0-100)
    const voiceVal = Math.round(Math.max(0, Math.min(100, (m.ves || 0))));

    function setSignal(id, val) {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val;
      el.style.color = scoreColor(val);
    }
    setSignal('sig-eye',   eyeVal);
    setSignal('sig-calm',  calmVal);
    setSignal('sig-voice', voiceVal);
  }

  function renderMetrics() {
    const m = state.metrics;

    // Left panel
    updateMetricValue('metric-gds',  m.gds,  2);
    updateMetricValue('metric-hpd',  m.hpd,  1);
    updateMetricValue('metric-bra',  m.bra,  0);
    updateMetricValue('metric-ves',  m.ves,  2);
    updateMetricValue('metric-sr',   m.sr,   0);

    // Right panel
    updateMetricValue('metric-osr',  m.osr,  1);
    // metric-et is Engagement Time — updated by its own 1s interval in startSession, not from signal
    updateMetricValue('metric-ces',  m.ces,  2);
    updateMetricValue('metric-silr', m.silr, 2);
    updateMetricValue('metric-pvs',  m.pvs,  2);

    // Bar fills
    setBarWidth('bar-bra',  (m.bra / 30) * 100);   // norm 0-30 blinks/min
    setBarWidth('bar-sr',   (m.sr  / 200) * 100);  // norm 0-200 wpm
    setBarWidth('bar-osr',  m.osr);
    setBarWidth('bar-pvs',  (m.pvs / 2) * 100);    // norm 0-2
  }

  function updateMetricValue(id, value, decimals) {
    const el = document.getElementById(id);
    if (!el) return;
    const numStr = decimals > 0 ? (+value).toFixed(decimals) : Math.round(+value).toString();
    // Find the text node (before any unit span)
    const nodes = Array.from(el.childNodes);
    const textNode = nodes.find(n => n.nodeType === Node.TEXT_NODE);
    if (textNode) {
      if (textNode.textContent !== numStr) {
        textNode.textContent = numStr;
        el.classList.remove('value-update');
        void el.offsetWidth;
        el.classList.add('value-update');
      }
    } else {
      el.textContent = numStr;
    }
  }

  // ============================================================
  // FACE SIGNAL
  // ============================================================
  function handleFaceSignal(data) {
    if (!data) return;
    updateVideoStatus(true);

    // Track when face was last seen — used by the engagement time counter in startSession
    if (data.bbox) state.lastFaceTime = Date.now();
    if (data.hpd !== undefined) {
      updateMetricValue('metric-hpd', data.hpd, 1);
      pushSparkData('hpd', data.hpd);
    }
    if (data.bra !== undefined) {
      updateMetricValue('metric-bra', data.bra, 0);
      setBarWidth('bar-bra', (data.bra / 30) * 100);
    }

    drawFaceOverlay(data);
  }

  // ============================================================
  // GAZE SIGNAL
  // ============================================================
  function handleGazeSignal(data) {
    if (!data) return;
    if (data.gds !== undefined) {
      updateMetricValue('metric-gds', data.gds, 2);
      pushSparkData('gds', data.gds);
    }
    if (data.osr !== undefined) {
      updateMetricValue('metric-osr', data.osr, 1);
      setBarWidth('bar-osr', data.osr);
    }

    // Gaze dot: Technical Mode only, capped at 10fps
    if (state.mode === 'technical') {
      const now = Date.now();
      if (now - state.gazeLastRenderTime >= 100) {
        state.gazeLastRenderTime = now;
        const dot = document.getElementById('gaze-dot');
        if (dot && data.x !== undefined && data.y !== undefined) {
          dot.style.display = 'block';
          dot.style.left = `${data.x}px`;
          dot.style.top  = `${data.y}px`;
        }
      }
    }
  }

  // ============================================================
  // STATUS ORB
  // ============================================================

  const ORB_SEVERITY = { blue: 0, green: 1, yellow: 2, orange: 3, red: 4 };
  const ORB_RATE_MS  = 5000;

  function updateOrb(severity, label, desc) {
    const now = Date.now();
    // Rate-limit: only update if ≥5s since last update OR incoming severity is higher
    const cur = state.orb.severity;
    const isHigher = (ORB_SEVERITY[severity] || 0) > (ORB_SEVERITY[cur] || 0);
    if (!isHigher && now - state.orb.lastUpdate < ORB_RATE_MS) return;

    state.orb.severity  = severity;
    state.orb.lastUpdate = now;

    const orb = document.getElementById('status-orb');
    if (orb) {
      orb.className = `orb-${severity}`;
    }

    // Update card contents (but don't auto-show the card)
    const labelEl = document.getElementById('orb-card-label');
    const descEl  = document.getElementById('orb-card-desc');
    if (labelEl) labelEl.textContent = label || severity;
    if (descEl)  descEl.textContent  = desc  || '';

    // Auto-return to blue (nominal) after 12s if not red
    if (state.orb.hideTimer) clearTimeout(state.orb.hideTimer);
    if (severity !== 'red') {
      state.orb.hideTimer = setTimeout(() => {
        state.orb.severity = 'blue';
        const o = document.getElementById('status-orb');
        if (o) o.className = 'orb-blue';
      }, 12000);
    }

    console.log(`[AdaptIQ Orb:${severity.toUpperCase()}]`, label, desc || '');
  }

  function initOrbClickHandler() {
    const orb  = document.getElementById('status-orb');
    const card = document.getElementById('orb-card');
    const dismissBtn = document.getElementById('orb-card-dismiss');

    if (!orb || !card) return;

    orb.addEventListener('click', (e) => {
      e.stopPropagation();
      card.classList.toggle('hidden');
    });

    dismissBtn && dismissBtn.addEventListener('click', () => {
      card.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!card.classList.contains('hidden') && !card.contains(e.target) && e.target !== orb) {
        card.classList.add('hidden');
      }
    });
  }

  // ============================================================
  // SCORE COLOR HELPER
  // ============================================================
  function scoreColor(val) {
    if (val >= 75) return '#30d158';
    if (val >= 50) return '#ffd60a';
    return '#ff453a';
  }

  // Legacy no-ops kept for any external callers
  function hideIntervention() {}
  function handleFlag(data) {
    if (!data) return;
    const { type, severity = 'low', message } = data;
    const orbSev = severity === 'high' ? 'red' : severity === 'medium' ? 'orange' : 'yellow';
    updateOrb(orbSev, type || 'Alert', message || '');
  }
  function handleIntervention(data) {
    if (!data) return;
    const ACTION_LABELS = {
      claude_response: 'AI Coach',
      banner:          'Attention',
      focus_object:    'Focus Exercise',
      content_swap:    'Try This',
      break_timer:     'Take a Break',
    };
    const label = ACTION_LABELS[data.action] || 'Intervention';
    const desc  = (data.chunk !== undefined ? '' : data.message) || '';
    updateOrb('orange', label, desc);

    // Feed the Coach panel
    if (data.action === 'claude_response') {
      if (data.chunk !== undefined) {
        state.coachBuffer += data.chunk;
        updateCoachPanel(state.coachBuffer, false);
      }
      if (data.done) {
        if (!state.coachBuffer && data.message) state.coachBuffer = data.message;
        updateCoachPanel(state.coachBuffer, true);
        state.coachBuffer = '';
      }
    } else if (data.message) {
      updateCoachPanel(data.message, true);
    }

    console.log('[AdaptIQ Intervention]', data.action || 'adaptive break');
  }

  function updateCoachPanel(text, final) {
    const el = document.getElementById('coach-tip-text');
    if (!el || !text) return;
    el.innerHTML = text.replace(/\n/g, '<br>') + (final ? '' : ' <span style="opacity:0.5">▌</span>');
  }

  // ============================================================
  // SCORES UPDATE
  // ============================================================
  function handleScoresUpdate(data) {
    if (!data) return;
    const { eyeContact, headStability, vocalConfidence, speechClarity, overall, grade } = data;

    state.scores = { eyeContact, headStability, vocalConfidence, speechClarity, overall, grade };

    updateScoreRing(overall, grade);

    // Legacy hidden breakdown
    const legacyVals = [
      ['score-eye',    'sbar-eye',    eyeContact],
      ['score-head',   'sbar-head',   headStability],
      ['score-vocal',  'sbar-vocal',  vocalConfidence],
      ['score-clarity','sbar-clarity', speechClarity],
    ];
    legacyVals.forEach(([scoreId, barId, val]) => {
      const scoreEl = document.getElementById(scoreId);
      const barEl   = document.getElementById(barId);
      if (scoreEl) scoreEl.textContent = Math.round(val || 0);
      if (barEl)   barEl.style.width = `${Math.min(100, val || 0)}%`;
    });

    // ── Score overlay panel ──
    const panelVals = [
      ['ps-eye',    'psb-eye',    eyeContact],
      ['ps-head',   'psb-head',   headStability],
      ['ps-vocal',  'psb-vocal',  vocalConfidence],
      ['ps-clarity','psb-clarity', speechClarity],
    ];
    panelVals.forEach(([valId, barId, val]) => {
      const v = Math.round(val || 0);
      const color = scoreColor(v);
      const valEl = document.getElementById(valId);
      const barEl = document.getElementById(barId);
      if (valEl) { valEl.textContent = v; valEl.style.color = color; }
      if (barEl) { barEl.style.width = `${v}%`; barEl.style.background = color; }
    });

    // ── Per-question snapshot (running average) ──
    const qi = state.questionIndex;
    if (qi >= 0 && qi < state.questionSnapshots.length) {
      const snap = state.questionSnapshots[qi];
      snap.samples++;
      const n = snap.samples;
      snap.eyeContact      += ((eyeContact      || 0) - snap.eyeContact)      / n;
      snap.headStability   += ((headStability   || 0) - snap.headStability)   / n;
      snap.vocalConfidence += ((vocalConfidence || 0) - snap.vocalConfidence) / n;
      snap.speechClarity   += ((speechClarity  || 0) - snap.speechClarity)   / n;
    }

    console.log(`[AdaptIQ Scores] Overall: ${Math.round(overall)}% (${grade})`);
  }

  // ============================================================
  // CALIBRATION COMPLETE
  // ============================================================
  function handleCalibrationComplete(data) {
    // Calibration completes silently in background — dashboard is already showing
  }

  // ============================================================
  // EVENT LOG (dev-only — no longer rendered in the UI)
  // ============================================================
  function addEventLog(type, html) {
    const plain = html.replace(/<[^>]+>/g, '');
    console.log(`[AdaptIQ:${type}]`, plain);
  }

  // ============================================================
  // SESSION SUMMARY
  // ============================================================
  function showSummary(data) {
    showScreen('summary');

    document.getElementById('summary-grade').textContent    = data.grade || '—';
    document.getElementById('summary-subtitle').textContent =
      `Session ended · Profile: ${(state.profile || 'default').toUpperCase()} · Duration: ${formatTime()}`;

    document.getElementById('sum-overall').textContent = data.overall  ? Math.round(data.overall)  : '--';
    document.getElementById('sum-eye').textContent     = data.eyeContact    ? Math.round(data.eyeContact)    : '--';
    document.getElementById('sum-head').textContent    = data.headStability ? Math.round(data.headStability) : '--';
    document.getElementById('sum-vocal').textContent   = data.vocalConfidence ? Math.round(data.vocalConfidence) : '--';

    // Summary actions
    document.getElementById('btn-new-session').addEventListener('click', () => {
      state.profile = null;
      state.sessionSeconds = 0;
      state.questionIndex = 0;
      state.coachBuffer = '';
      state.questionSnapshots = Array.from({ length: 30 }, () => ({
        eyeContact: 0, headStability: 0, vocalConfidence: 0, speechClarity: 0, samples: 0
      }));
      state.sparkBuffers = { gds: [], hpd: [], ves: [], ces: [], silr: [] };
      // Reset coach panel
      const coachTip = document.getElementById('coach-tip-text');
      if (coachTip) coachTip.innerHTML = '<em>Listening for cues…</em>';
      showScreen('profile');
    });

    document.getElementById('btn-export').addEventListener('click', exportReport);
  }

  async function exportReport() {
    const btn = document.getElementById('btn-export');
    if (btn) { btn.textContent = 'Generating…'; btn.disabled = true; }
    try {
      await generatePDF();
    } finally {
      if (btn) {
        btn.innerHTML = '<i class="ti ti-download"></i> Download PDF Report';
        btn.disabled = false;
      }
    }
  }

  // ============================================================
  // PDF GENERATION
  // ============================================================
  async function generatePDF() {
    if (!window.jspdf) {
      console.warn('[PDF] jsPDF not loaded');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    const profile  = state.profile || 'default';
    const scores   = state.scores;
    const dateStr  = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const duration = formatTime();
    const pageW    = doc.internal.pageSize.getWidth();
    const pageH    = doc.internal.pageSize.getHeight();
    const margin   = 40;
    const contentW = pageW - margin * 2;
    let y = margin;
    let pageNum = 1;

    function addFooter() {
      const fy = pageH - 20;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(margin, fy - 8, pageW - margin, fy - 8);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.setFont('helvetica', 'normal');
      doc.text('AdaptIQ — Adaptive Interview Intelligence', margin, fy);
      doc.text(`Page ${pageNum}`, pageW - margin, fy, { align: 'right' });
    }

    function newPage() {
      addFooter();
      doc.addPage();
      pageNum++;
      y = margin;
    }

    function checkBreak(needed) {
      if (y + needed > pageH - 40) newPage();
    }

    // ── Cover ──
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(41, 151, 255);
    doc.text('AdaptIQ', margin, y);
    y += 24;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('Session Report', margin, y);
    y += 14;

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`${dateStr}  ·  Duration: ${duration}  ·  Profile: ${profile.toUpperCase()}`, margin, y);
    y += 10;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 16;

    // ── Overall Scores ──
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 50);
    doc.text('Overall Scores', margin, y);
    y += 12;

    [
      ['Eye Contact',       scores.eyeContact],
      ['Head Stability',    scores.headStability],
      ['Vocal Confidence',  scores.vocalConfidence],
      ['Clarity',           scores.speechClarity],
    ].forEach(([label, val]) => {
      const v = Math.round(val || 0);
      const rgb = v >= 75 ? [48, 209, 88] : v >= 50 ? [245, 166, 35] : [255, 69, 58];
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(label, margin + 8, y);
      doc.setTextColor(...rgb);
      doc.setFont('helvetica', 'bold');
      doc.text(`${v}`, pageW - margin, y, { align: 'right' });
      y += 8;
    });
    y += 10;

    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageW - margin, y);
    y += 16;

    // ── Fetch per-question notes from Claude ──
    let questionNotes = {};
    const apiKey = document.getElementById('api-key-input')?.value?.trim();
    if (apiKey) {
      const snapshots = state.questionSnapshots
        .map((s, i) => s.samples > 0 ? {
          q: i + 1,
          eye: Math.round(s.eyeContact),
          head: Math.round(s.headStability),
          vocal: Math.round(s.vocalConfidence),
          clarity: Math.round(s.speechClarity),
        } : null)
        .filter(Boolean);

      if (snapshots.length > 0) {
        try {
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
              'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-6',
              max_tokens: 2000,
              messages: [{
                role: 'user',
                content: `You are a supportive interview coach writing a session report for a neurodivergent job seeker (profile: ${profile}). For each question below, write 2-3 plain-English sentences about what went well, what to improve, and one concrete tip. Be warm, specific, and never use jargon or acronyms. Return a JSON array where each element has "q" (question number) and "note" fields only. Data: ${JSON.stringify(snapshots)}`,
              }],
            }),
          });
          if (resp.ok) {
            const json = await resp.json();
            const text = json.content?.[0]?.text || '';
            const match = text.match(/\[[\s\S]*\]/);
            if (match) {
              JSON.parse(match[0]).forEach(item => { questionNotes[item.q] = item.note; });
            }
          }
        } catch (err) {
          console.warn('[PDF] Claude notes failed:', err);
        }
      }
    }

    // ── Per-question breakdown ──
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 50);
    doc.text('Question-by-question Breakdown', margin, y);
    y += 14;

    const qm = window.QuestionManager;
    const total = qm ? qm.total : state.questionSnapshots.length;

    for (let i = 0; i < total; i++) {
      const snap  = state.questionSnapshots[i];
      if (!snap || snap.samples === 0) continue;

      const qData = qm ? qm.get(i) : null;
      const qText = qData ? `Q${i + 1}. ${qData.q}` : `Question ${i + 1}`;
      const overallQ = snap.samples > 0
        ? snap.eyeContact * 0.25 + snap.headStability * 0.20 + snap.vocalConfidence * 0.25 + snap.speechClarity * 0.30
        : 0;
      const grade = overallQ >= 85 ? 'A' : overallQ >= 70 ? 'B' : overallQ >= 55 ? 'C' : overallQ >= 40 ? 'D' : 'F';

      checkBreak(60);

      // Question text + grade
      const lines = doc.splitTextToSize(qText, contentW - 30);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(50, 50, 50);
      doc.text(lines, margin, y);
      doc.setTextColor(41, 151, 255);
      doc.text(grade, pageW - margin, y, { align: 'right' });
      y += lines.length * 12 + 4;

      // Tags
      const tags = [];
      if (snap.eyeContact >= 75)     tags.push({ t: '✓ Good eye contact',       c: [48,209,88]  });
      if (snap.headStability >= 75)  tags.push({ t: '✓ Stable head position',    c: [48,209,88]  });
      if (snap.vocalConfidence >= 75)tags.push({ t: '✓ Strong vocal confidence', c: [48,209,88]  });
      if (snap.eyeContact < 50)      tags.push({ t: '⚠ Eye contact needs work',  c: [255,214,10] });
      if (snap.headStability < 50)   tags.push({ t: '⚠ Head movement detected',  c: [255,214,10] });
      if (snap.speechClarity < 50)   tags.push({ t: '✗ Speech clarity low',      c: [255,69,58]  });

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      tags.forEach(({ t, c }) => {
        checkBreak(12);
        doc.setTextColor(...c);
        doc.text(t, margin + 8, y);
        y += 11;
      });

      // AI note
      const note = questionNotes[i + 1];
      if (note) {
        checkBreak(20);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(80, 80, 80);
        const noteLines = doc.splitTextToSize(note, contentW - 8);
        checkBreak(noteLines.length * 11 + 4);
        doc.text(noteLines, margin + 8, y);
        y += noteLines.length * 11 + 4;
      }

      // Separator
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y);
      y += 10;
    }

    addFooter();
    doc.save(`adaptiq-report-${new Date().toISOString().split('T')[0]}.pdf`);
  }

  // ============================================================
  // DISPLAY MODE
  // ============================================================
  function setMode(mode) {
    state.mode = mode;
    document.body.classList.toggle('mode-simple',    mode === 'simple');
    document.body.classList.toggle('mode-technical', mode === 'technical');

    // Hide gaze dot immediately when switching to simple
    if (mode === 'simple') {
      const dot = document.getElementById('gaze-dot');
      if (dot) dot.style.display = 'none';
    }

    // Pill toggle buttons (new design)
    const btnSimple = document.getElementById('mode-btn-simple');
    const btnTech   = document.getElementById('mode-btn-technical');
    if (btnSimple) btnSimple.classList.toggle('active', mode === 'simple');
    if (btnTech)   btnTech.classList.toggle('active',   mode === 'technical');

    // Legacy hidden checkbox
    const modeToggle = document.getElementById('mode-toggle');
    if (modeToggle) modeToggle.checked = (mode === 'technical');

    // Legacy hidden label spans (kept for any external code)
    const lblSimple    = document.getElementById('mode-label-simple');
    const lblTechnical = document.getElementById('mode-label-technical');
    if (lblSimple)    lblSimple.classList.toggle('active',    mode === 'simple');
    if (lblTechnical) lblTechnical.classList.toggle('active', mode === 'technical');
  }

  // ============================================================
  // SENSOR DOT UPDATES
  // ============================================================
  function updateSensorDot(id, dotState, message) {
    // dotState: 'inactive' | 'nominal' | 'active' | 'warning' | 'error'
    const dot = document.getElementById(`status-dot-${id}`);
    if (!dot) return;
    dot.className = `sensor-dot ${dotState}`;
    const tooltip = dot.querySelector('.sensor-dot-tooltip');
    if (tooltip && message) tooltip.textContent = message;
  }

  function updateSystemStatus(level, message) {
    // Map to sensor dot on the new design
    const stateMap = { nominal: 'nominal', warning: 'warning', error: 'error' };
    const dotState = stateMap[level] || 'inactive';
    const defaultMsg = level === 'nominal' ? 'All systems nominal'
                     : level === 'warning' ? 'Warning — degraded state'
                     : 'Error — check permissions';
    updateSensorDot('system', dotState, message || defaultMsg);

    // Backward compat: legacy status dot (may not exist in new HTML)
    const dot     = document.getElementById('system-status-dot');
    const tooltip = document.getElementById('ssd-tooltip-text');
    if (dot) dot.className = `system-status-dot status-${level}`;
    if (tooltip) tooltip.textContent = message || defaultMsg;
  }

  // ============================================================
  // BUS SUBSCRIPTIONS
  // ============================================================
  function attachBusListeners() {
    Bus.on('signal:update',         updateSignal);
    Bus.on('signal:face',           handleFaceSignal);
    Bus.on('signal:gaze',           handleGazeSignal);
    Bus.on('flag:fired',            handleFlag);
    Bus.on('intervention:trigger',  handleIntervention);
    Bus.on('scores:update',         handleScoresUpdate);
    Bus.on('calibration:complete',  handleCalibrationComplete);
    Bus.on('models:loaded',         () => { /* models ready */ });
    Bus.on('session:end', (data) => {
      if (data && data.summary) showSummary(data.summary);
      else endSession();
    });
    Bus.on('session:debrief', ({ text }) => {
      const insightsEl = document.getElementById('summary-insights');
      if (insightsEl && text) insightsEl.textContent = text;
    });

    // Sensor dot wiring — camera handled via handleFaceSignal → updateVideoStatus
    Bus.on('signal:audio', (data) => {
      if (data && data.ves !== undefined) {
        updateSensorDot('mic', 'active', 'Microphone active');
      }
    });
    Bus.on('claude:ready', () => {
      updateSensorDot('ai', 'active', 'AI ready');
    });
    Bus.on('claude:error', (err) => {
      updateSensorDot('ai', 'error', err && err.message ? err.message : 'AI error');
      updateOrb('red', 'AI Error', err && err.message ? err.message : 'Claude API error');
    });
  }

  // ============================================================
  // KEYBOARD SHORTCUTS
  // ============================================================
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const card = document.getElementById('orb-card');
        if (card && !card.classList.contains('hidden')) card.classList.add('hidden');
      }
      if (e.key === 'g' && state.currentScreen === 'dashboard' && state.mode === 'technical') {
        const dot = document.getElementById('gaze-dot');
        if (dot) dot.style.display = dot.style.display === 'none' ? 'block' : 'none';
      }
    });
  }

  // ============================================================
  // PUBLIC INIT
  // ============================================================
  function init() {
    attachBusListeners();
    initProfileScreen();
    initOrbClickHandler();
    initKeyboardShortcuts();
  }

  // Expose a minimal public API for debugging/external use
  return {
    init,
    showScreen,
    addEventLog,
    updateOrb,
    handleFlag,
    handleIntervention,
    updateSignal,
    handleFaceSignal,
    handleGazeSignal,
    handleScoresUpdate,
    handleCalibrationComplete,
    setMode,
    updateSystemStatus,
    updateSensorDot,
  };

})();
