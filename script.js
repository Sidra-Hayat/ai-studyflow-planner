

// ============================================================
// STATE
// ============================================================
let state = {
  subjects: [],
  plan: null,
  progress: {},
  calMonth: new Date().getMonth(),
  calYear: new Date().getFullYear(),
  dailyHours: 6,
  startDate: null
};

const COLORS = ['#7c6aff','#f472b6','#34d399','#fbbf24','#f87171','#38bdf8','#a78bfa','#fb923c'];

// Load from localStorage if available
function loadState() {
  try {
    const saved = localStorage.getItem('studyflow');
    if (saved) state = { ...state, ...JSON.parse(saved) };
  } catch(e) {}
}
function saveState() {
  try { localStorage.setItem('studyflow', JSON.stringify(state)); } catch(e) {}
}

// ============================================================
// NAVIGATION
// ============================================================
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  const navBtns = document.querySelectorAll('.nav-item');
  navBtns.forEach(b => {
    const txt = b.textContent.toLowerCase();
    if (name === 'ai' && txt.includes('advisor')) b.classList.add('active');
    else if (name !== 'ai' && txt.includes(name.substring(0,4))) b.classList.add('active');
  });
  // Update relevant pages
  if (name === 'dashboard') updateDashboard();
  if (name === 'subjects') renderSubjects();
  if (name === 'generate') renderGenPreview();
  if (name === 'timetable') renderTimetable();
  if (name === 'calendar') renderCalendar();
  if (name === 'progress') renderProgress();
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, icon = '✅') {
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.querySelector('span').previousSibling.textContent = icon + ' ';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ============================================================
// SUBJECTS
// ============================================================
function openAddSubject() {
  // set default exam date to 30 days from now
  const d = new Date(); d.setDate(d.getDate() + 30);
  document.getElementById('sub-exam-date').value = d.toISOString().split('T')[0];
  document.getElementById('modal-subject').classList.add('open');
}
function closeModal() {
  document.getElementById('modal-subject').classList.remove('open');
  document.getElementById('sub-name').value = '';
}
function addSubject() {
  const name = document.getElementById('sub-name').value.trim();
  if (!name) { showToast('Please enter a subject name', '⚠️'); return; }
  const subject = {
    id: Date.now(),
    name,
    difficulty: document.getElementById('sub-difficulty').value,
    examDate: document.getElementById('sub-exam-date').value,
    topics: parseInt(document.getElementById('sub-topics').value) || 10,
    color: COLORS[state.subjects.length % COLORS.length]
  };
  state.subjects.push(subject);
  state.progress[subject.id] = { completed: 0, total: subject.topics };
  saveState();
  closeModal();
  renderSubjects();
  showToast(`"${name}" added successfully!`);
  updateDashboard();
}
function deleteSubject(id) {
  state.subjects = state.subjects.filter(s => s.id !== id);
  delete state.progress[id];
  if (state.plan) state.plan = null;
  saveState();
  renderSubjects();
  updateDashboard();
  showToast('Subject removed', '🗑️');
}
function renderSubjects() {
  const container = document.getElementById('subjects-list');
  if (!state.subjects.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📖</div><p>No subjects added yet.</p><button class="btn btn-primary mt-4" onclick="openAddSubject()">+ Add Your First Subject</button></div>`;
    return;
  }
  container.innerHTML = state.subjects.map(s => {
    const daysLeft = Math.max(0, Math.ceil((new Date(s.examDate) - new Date()) / 86400000));
    const urgency = daysLeft < 7 ? 'high' : daysLeft < 14 ? 'medium' : 'low';
    return `<div class="subject-item">
      <div class="subject-dot" style="background:${s.color}"></div>
      <div style="flex:1">
        <div class="subject-name">${s.name}</div>
        <div class="subject-info">${s.topics} topics · Exam in ${daysLeft} days</div>
      </div>
      <span class="badge badge-${s.difficulty}">${s.difficulty}</span>
      <span class="badge badge-${urgency}-p" style="margin-left:6px">${daysLeft < 7 ? '🔴 Urgent' : daysLeft < 14 ? '🟡 Soon' : '🟢 Plenty'}</span>
      <div class="subject-actions">
        <button class="btn btn-danger btn-sm" onclick="deleteSubject(${s.id})">Remove</button>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// AI PRIORITY CALCULATION
// ============================================================
function calcPriority(subject, hardW, medW, easyW) {
  const diffW = subject.difficulty === 'hard' ? hardW : subject.difficulty === 'medium' ? medW : easyW;
  const daysLeft = Math.max(1, Math.ceil((new Date(subject.examDate) - new Date()) / 86400000));
  const urgency = Math.max(1, 30 / daysLeft); // higher when exam is closer
  return (diffW * 3) + (urgency * 2);
}

// ============================================================
// GENERATE PLAN
// ============================================================
function renderGenPreview() {
  const container = document.getElementById('gen-subjects-preview');
  if (!state.subjects.length) {
    container.innerHTML = `<p class="text-muted text-sm">No subjects added yet. <button class="btn btn-sm btn-secondary" onclick="showPage('subjects')">Add Subjects →</button></p>`;
    return;
  }
  // Set today as default start date
  const today = new Date().toISOString().split('T')[0];
  if (!document.getElementById('gen-start').value) document.getElementById('gen-start').value = today;

  const hardW = parseInt(document.getElementById('gen-hard-w').value) || 3;
  const medW = parseInt(document.getElementById('gen-med-w').value) || 2;
  const easyW = parseInt(document.getElementById('gen-easy-w').value) || 1;
  const totalPriority = state.subjects.reduce((sum, s) => sum + calcPriority(s, hardW, medW, easyW), 0);
  const dailyHours = parseFloat(document.getElementById('gen-hours').value) || 6;

  container.innerHTML = state.subjects.map(s => {
    const p = calcPriority(s, hardW, medW, easyW);
    const allocHours = ((p / totalPriority) * dailyHours).toFixed(1);
    const pct = Math.round((p / totalPriority) * 100);
    return `<div style="margin-bottom:12px">
      <div class="flex items-center justify-between mb-2">
        <span style="font-size:14px;font-weight:500;display:flex;align-items:center;gap:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:${s.color};display:inline-block"></span>
          ${s.name}
        </span>
        <span style="font-size:13px;color:var(--accent2);font-weight:600">${allocHours}h/day</span>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar" style="width:${pct}%;background:${s.color}"></div>
      </div>
    </div>`;
  }).join('');
}
function generatePlan() {
  if (!state.subjects.length) {
    showToast('Add subjects first!', '⚠️');
    showPage('subjects');
    return;
  }

  const startDate = document.getElementById('gen-start').value;
  if (!startDate) {
    showToast('Please select a start date', '⚠️');
    return;
  }

  const start = new Date(startDate); // ✅ FIXED

  const dailyHours = parseFloat(document.getElementById('gen-hours').value) || 6;
  const sessionMins = parseInt(document.getElementById('gen-session').value) || 60;
  const includeRevision = document.getElementById('gen-revision').value === 'yes';

  const hardW = parseInt(document.getElementById('gen-hard-w').value) || 3;
  const medW = parseInt(document.getElementById('gen-med-w').value) || 2;
  const easyW = parseInt(document.getElementById('gen-easy-w').value) || 1;

  // Find latest exam date
  const latestExam = state.subjects.reduce((max, s) => {
    return new Date(s.examDate) > new Date(max) ? s.examDate : max;
  }, startDate);

  const end = new Date(latestExam);
  const totalDays = Math.max(
    1,
    Math.ceil((end - start) / 86400000)
  ) + 1;

  // Calculate priorities
  const totalPriority = state.subjects.reduce(
    (sum, s) => sum + calcPriority(s, hardW, medW, easyW),
    0
  );

  const allocations = state.subjects.map(s => ({
    ...s,
    priority: calcPriority(s, hardW, medW, easyW),
    dailyHours:
      (calcPriority(s, hardW, medW, easyW) / totalPriority) * dailyHours
  }));

  // Build plan
  const days = [];

  for (let i = 0; i < totalDays; i++) {
    const date = new Date(start); // ✅ FIXED
    date.setDate(start.getDate() + i);

    const dateStr = date.toISOString().split('T')[0];

    const examSubjects = state.subjects.filter(
      s => s.examDate === dateStr
    );

    const isRevision =
      includeRevision && i > 0 && i % 7 === 0;

    const sessions = [];

    if (examSubjects.length) {
      examSubjects.forEach(s =>
        sessions.push({
          subjectId: s.id,
          subjectName: s.name,
          hours: 0,
          type: 'exam',
          color: s.color
        })
      );
    } else if (isRevision) {
      const top2 = [...allocations]
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 2);

      top2.forEach(s =>
        sessions.push({
          subjectId: s.id,
          subjectName: s.name,
          hours: dailyHours / 2,
          type: 'revision',
          color: s.color
        })
      );
    } else {
      const activeSubjects = allocations.filter(
        s => new Date(s.examDate) >= new Date(dateStr)
      );

      if (activeSubjects.length) {
        const activePriority = activeSubjects.reduce(
          (sum, s) => sum + s.priority,
          0
        );

        activeSubjects.forEach(s => {
          const hrs =
            (s.priority / activePriority) * dailyHours;

          if (hrs > 0.25) {
            sessions.push({
              subjectId: s.id,
              subjectName: s.name,
              hours: Math.round(hrs * 4) / 4,
              type: 'study',
              color: s.color
            });
          }
        });
      }
    }

    days.push({
      date: dateStr,
      dayNum: i + 1,
      sessions,
      isRevision,
      isExam: examSubjects.length > 0
    });
  }

  state.plan = {
    days,
    dailyHours,
    sessionMins,
    startDate,
    totalDays
  };

  state.dailyHours = dailyHours;

  saveState();
  showToast('Study plan generated! 🎉');
  showPage('timetable');
}
// ============================================================
// TIMETABLE RENDER
// ============================================================
function renderTimetable() {
  if (!state.plan) return;
  const { days, dailyHours, sessionMins } = state.plan;
  // Summary
  document.getElementById('timetable-summary').style.display = 'block';
  document.getElementById('tt-total-days').textContent = days.length;
  document.getElementById('tt-total-hours').textContent = (days.filter(d => !d.isExam).length * dailyHours).toFixed(0) + 'h';
  document.getElementById('tt-subjects').textContent = state.subjects.length;
  document.getElementById('tt-revision').textContent = days.filter(d => d.isRevision).length;

  const container = document.getElementById('timetable-content');
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  container.innerHTML = days.map(day => {
    const d = new Date(day.date);
    const dayName = dayNames[d.getDay()];
    let dayTypeLabel = '';
    if (day.isExam) dayTypeLabel = `<span class="badge" style="background:rgba(248,113,113,0.2);color:var(--red)">📝 Exam Day</span>`;
    else if (day.isRevision) dayTypeLabel = `<span class="badge" style="background:rgba(251,191,36,0.2);color:var(--amber)">🔄 Revision</span>`;
    else dayTypeLabel = `<span class="badge" style="background:rgba(52,211,153,0.15);color:var(--accent3)">📚 Study</span>`;

    const sessionsHTML = day.sessions.length ? day.sessions.map((s, i) => {
      // Generate a time (starting from 9am)
      const startHour = 9 + Math.floor(i * (sessionMins / 60));
      const endHour = startHour + (s.hours < 0.5 ? 0.5 : s.hours);
      const fmt = h => `${Math.floor(h) % 12 || 12}:${(h % 1 * 60).toString().padStart(2,'0')} ${h < 12 ? 'AM' : 'PM'}`;
      return `<div class="session-row">
        <div class="session-time">${s.type === 'exam' ? '📝 Exam' : fmt(startHour)}</div>
        <div style="width:4px;height:32px;border-radius:2px;background:${s.color};flex-shrink:0"></div>
        <div class="session-subj">${s.subjectName}</div>
        ${s.type !== 'exam' ? `<div class="session-dur">${s.hours}h</div>` : ''}
        <div class="session-type">
          ${s.type === 'exam' ? `<span class="badge badge-high">EXAM</span>` : s.type === 'revision' ? `<span class="badge badge-medium">Revision</span>` : ''}
        </div>
      </div>`;
    }).join('') : `<p class="text-muted text-sm" style="padding:0.5rem 0">Rest day</p>`;

    return `<div class="timetable-day">
      <div class="day-header">
        <span class="day-badge">${dayName} ${day.dayNum}</span>
        <span class="day-date">${new Date(day.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
        ${dayTypeLabel}
      </div>
      <div class="card" style="padding:1rem">${sessionsHTML}</div>
    </div>`;
  }).join('');
}

// ============================================================
// CALENDAR
// ============================================================
function renderCalendar() {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-month-label').textContent = `${months[state.calMonth]} ${state.calYear}`;

  const headerEl = document.getElementById('cal-days-header');
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  headerEl.innerHTML = days.map(d => `<div class="cal-header">${d}</div>`).join('');

  const grid = document.getElementById('calendar-grid');
  const firstDay = new Date(state.calYear, state.calMonth, 1).getDay();
  const daysInMonth = new Date(state.calYear, state.calMonth + 1, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

  // Build plan lookup
  const planDays = {};
  if (state.plan) state.plan.days.forEach(d => { planDays[d.date] = d; });
  const examDates = {};
  state.subjects.forEach(s => { examDates[s.examDate] = s; });

  let html = '';
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${state.calYear}-${String(state.calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const planDay = planDays[dateStr];
    const isToday = dateStr === today;
    const isExam = examDates[dateStr];
    let cls = 'cal-day';
    if (planDay && !planDay.isExam) cls += ' has-study';
    if (isToday) cls += ' today';
    let events = '';
    if (planDay && planDay.sessions.length) {
      planDay.sessions.slice(0,2).forEach(s => {
        const cls2 = s.type === 'exam' ? 'cal-exam' : '';
        events += `<div class="cal-event ${cls2}">${s.subjectName}</div>`;
      });
      if (planDay.sessions.length > 2) events += `<div class="cal-event">+${planDay.sessions.length - 2} more</div>`;
    }
if (examDates[dateStr]) {
  events += `<div class="cal-event cal-exam">📝 ${examDates[dateStr].name}</div>`;
}
    html += `<div class="${cls}"><div class="cal-day-num">${d}</div>${events}</div>`;
  }
  grid.innerHTML = html;
}
function prevMonth() {
  state.calMonth--;
  if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
  renderCalendar();
}
function nextMonth() {
  state.calMonth++;
  if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
  renderCalendar();
}

// ============================================================
// PROGRESS
// ============================================================
function renderProgress() {
  if (!state.subjects.length) return;
  const total = Object.values(state.progress).reduce((s,p) => s + p.total, 0);
  const completed = Object.values(state.progress).reduce((s,p) => s + p.completed, 0);
  const pct = total ? Math.round((completed / total) * 100) : 0;

  document.getElementById('progress-pct').textContent = pct + '%';
  document.getElementById('progress-summary').textContent = `${completed} of ${total} topics completed`;
  const circumference = 2 * Math.PI * 50;
  const offset = circumference - (pct / 100) * circumference;
  document.getElementById('progress-ring').style.strokeDashoffset = offset;

  // Subject progress
  const spList = document.getElementById('subject-progress-list');
  spList.innerHTML = state.subjects.map(s => {
    const p = state.progress[s.id] || { completed: 0, total: s.topics };
    const spct = p.total ? Math.round((p.completed / p.total) * 100) : 0;
    return `<div style="margin-bottom:14px">
      <div class="flex items-center justify-between mb-2">
        <span style="font-size:14px;display:flex;align-items:center;gap:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:${s.color};display:inline-block"></span>
          ${s.name}
        </span>
        <span style="font-size:13px;font-weight:600;color:var(--accent2)">${spct}%</span>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar" style="width:${spct}%;background:${s.color}"></div>
      </div>
      <div class="flex items-center justify-between mt-2">
        <span class="text-muted text-sm">${p.completed}/${p.total} topics</span>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-secondary" onclick="updateProgress(${s.id},-1)">−</button>
          <button class="btn btn-sm btn-primary" onclick="updateProgress(${s.id},1)">+ Mark Done</button>
        </div>
      </div>
    </div>`;
  }).join('');

  // Checklist
  const cl = document.getElementById('topic-checklist');
  if (!state.subjects.length) return;
  cl.innerHTML = state.subjects.map(s => {
    const p = state.progress[s.id] || { completed: 0, total: s.topics };
    const topics = Array.from({length: p.total}, (_,i) => {
      const done = i < p.completed;
      return `<label style="display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer;border-bottom:1px solid var(--border)">
        <input type="checkbox" ${done ? 'checked' : ''} onchange="toggleTopic(${s.id}, ${i}, this.checked)" style="width:16px;height:16px;accent-color:${s.color}">
        <span style="font-size:14px;${done ? 'text-decoration:line-through;color:var(--muted)' : ''}">Topic ${i+1}</span>
      </label>`;
    }).join('');
    return `<div style="margin-bottom:1.5rem">
      <h3 style="display:flex;align-items:center;gap:8px;margin-bottom:0.5rem">
        <span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block"></span>
        ${s.name}
      </h3>
      ${topics}
    </div>`;
  }).join('');
}
function updateProgress(id, delta) {
  const p = state.progress[id];
  if (!p) return;
  p.completed = Math.max(0, Math.min(p.total, p.completed + delta));
  saveState();
  renderProgress();
  updateDashboard();
  showToast(delta > 0 ? 'Topic marked complete!' : 'Topic unchecked');
}
function toggleTopic(id, idx, checked) {
  const p = state.progress[id];
  if (!p) return;
  if (checked && idx >= p.completed) p.completed = idx + 1;
  else if (!checked && idx < p.completed) p.completed = idx;
  saveState();
  renderProgress();
  updateDashboard();
}

// ============================================================
// DASHBOARD UPDATE
// ============================================================
let weekChart = null;
function updateDashboard() {
  document.getElementById('today-date').textContent =
    new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });

  document.getElementById('stat-subjects').textContent = state.subjects.length;

  const total = Object.values(state.progress).reduce((s, p) => s + p.total, 0);
  const completed = Object.values(state.progress).reduce((s, p) => s + p.completed, 0);
  const pct = total ? Math.round((completed / total) * 100) : 0;

  document.getElementById('stat-progress').textContent = pct + '%';

  document.getElementById('stat-hours').textContent =
    state.dailyHours ||
    (document.getElementById('gen-hours')
      ? document.getElementById('gen-hours').value
      : 0);

  // ============================================================
  // TODAY'S PLAN
  // ============================================================
  if (state.plan) {
    document.getElementById('stat-days').textContent = state.plan.totalDays;

    const today = new Date().toISOString().split('T')[0];
    const todayPlan = state.plan.days.find(d => d.date === today);
    const todayEl = document.getElementById('today-plan');

    if (todayPlan && todayPlan.sessions.length) {
      todayEl.innerHTML = todayPlan.sessions.map(s =>
        `<div class="session-row">
          <div style="width:4px;height:32px;border-radius:2px;background:${s.color};flex-shrink:0"></div>
          <div class="session-subj">${s.subjectName}</div>
          ${s.type !== 'exam' ? `<div class="session-dur">${s.hours}h</div>` : ''}
          <span class="badge badge-${
            s.type === 'exam'
              ? 'high'
              : s.type === 'revision'
              ? 'medium'
              : 'easy'
          }">${s.type}</span>
        </div>`
      ).join('');
    } else {
      todayEl.innerHTML =
        `<div class="alert alert-warning">
          No study session today — rest day or outside plan range.
        </div>`;
    }

  } else {
    // FIXED: proper date comparison
    const latestExam = state.subjects.reduce((max, s) =>
      new Date(s.examDate) > new Date(max) ? s.examDate : max,
      ''
    );

    document.getElementById('stat-days').textContent =
      state.subjects.length
        ? Math.ceil((new Date(latestExam) - new Date()) / 86400000)
        : 0;
  }

  // ============================================================
  // PRIORITY LIST
  // ============================================================
  const pl = document.getElementById('priority-list');

  if (!state.subjects.length) {
    pl.innerHTML =
      `<div class="empty-state">
        <p>Add subjects and generate a plan to see priorities.</p>
      </div>`;
  } else {
    const sorted = [...state.subjects]
      .map(s => ({ ...s, p: calcPriority(s, 3, 2, 1) }))
      .sort((a, b) => b.p - a.p);

    const maxP = sorted[0]?.p || 1;

    pl.innerHTML = sorted.map((s, i) => {
      const pct = Math.round((s.p / maxP) * 100);

      const daysLeft = Math.max(
        0,
        Math.ceil((new Date(s.examDate) - new Date()) / 86400000)
      );

      return `<div style="margin-bottom:14px">
        <div class="flex items-center justify-between mb-2">
          <span style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500">
            <span style="font-family:var(--font-head);font-size:12px;color:var(--muted);width:16px">#${i + 1}</span>
            <span style="width:8px;height:8px;border-radius:50%;background:${s.color};display:inline-block"></span>
            ${s.name}
          </span>

          <div style="display:flex;align-items:center;gap:8px">
            <span class="badge badge-${s.difficulty}">${s.difficulty}</span>
            <span class="text-muted text-sm">${daysLeft}d left</span>
          </div>
        </div>

        <div class="progress-bar-wrap">
          <div class="progress-bar"
               style="width:${pct}%;background:${s.color}">
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // ============================================================
  // WEEKLY CHART (FIXED)
  // ============================================================
  const ctx = document.getElementById('weeklyChart');
  if (!ctx) return;

  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() + 1);

  const data = state.plan
    ? labels.map((_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);

        const dateStr = d.toISOString().split('T')[0];

        const day = state.plan.days.find(x => x.date === dateStr);

        return day
          ? day.sessions.reduce((sum, s) => sum + (s.hours || 0), 0)
          : 0;
      })
    : [0, 0, 0, 0, 0, 0, 0];

  if (weekChart) weekChart.destroy();

  weekChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: 'rgba(124,106,255,0.6)',
        borderColor: 'rgba(124,106,255,1)',
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8884a8', font: { size: 12 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8884a8', font: { size: 12 } }
        }
      }
    }
  });
}
// ============================================================
// EXPORT
// ============================================================
function exportTimetable() {
  if (!state.plan) return;
  const generated = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  let text = '================================================\n';
  text += '   AI StudyFlow Planner — Study Timetable\n';
  text += '   Generated by AI StudyFlow Planner\n';
  text += `   Created on: ${generated}\n`;
  text += '================================================\n\n';
  text += `Daily Study Hours: ${state.plan.dailyHours}h | Total Days: ${state.plan.totalDays} | Subjects: ${state.subjects.length}\n\n`;
  text += '------------------------------------------------\n\n';
  state.plan.days.forEach(day => {
    text += `📅 Day ${day.dayNum} — ${day.date}`;
    if (day.isRevision) text += ' [REVISION DAY]';
    if (day.isExam) text += ' [EXAM DAY]';
    text += '\n';
    if (day.sessions.length) {
      day.sessions.forEach(s => text += `   • ${s.subjectName}: ${s.type === 'exam' ? 'EXAM' : s.hours + 'h'} (${s.type})\n`);
    } else {
      text += '   Rest Day\n';
    }
    text += '\n';
  });
  text += '------------------------------------------------\n';
  text += 'Generated by AI StudyFlow Planner\n';
  text += 'github.com/YOUR-USERNAME/study-planner\n';
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'AI-StudyFlow-Timetable.txt';
  a.click();
  showToast('Timetable exported!');
}

// ============================================================
// INIT
// ============================================================
loadState();
// Set today as default start
const todayStr = new Date().toISOString().split('T')[0];
document.getElementById('gen-start').value = todayStr;
updateDashboard();

// Init calendar to current month
state.calMonth = new Date().getMonth();
state.calYear = new Date().getFullYear();

// ============================================================
// AI ADVISOR — Powered by Claude API
// ============================================================
let aiHistory = [];

function buildSystemPrompt() {
  const today = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  let sysPrompt = `You are a friendly, expert AI Study Advisor built into the StudyFlow app. Today is ${today}.

You have full context about this student's study plan:

SUBJECTS:
${state.subjects.length ? state.subjects.map(s => {
    const p = state.progress[s.id] || { completed: 0, total: s.topics };
    const daysLeft = Math.max(0, Math.ceil((new Date(s.examDate) - new Date()) / 86400000));
    const pct = p.total ? Math.round((p.completed / p.total) * 100) : 0;
    return `- ${s.name}: difficulty=${s.difficulty}, exam in ${daysLeft} days (${s.examDate}), ${p.completed}/${p.total} topics done (${pct}% complete)`;
  }).join('\n') : 'No subjects added yet.'}

STUDY PLAN:
${state.plan ? `- Daily hours: ${state.plan.dailyHours}h/day, Total days: ${state.plan.totalDays}, Start: ${state.plan.startDate}` : 'No plan generated yet.'}

OVERALL PROGRESS:
${(() => {
    const total = Object.values(state.progress).reduce((s,p) => s + p.total, 0);
    const done = Object.values(state.progress).reduce((s,p) => s + p.completed, 0);
    return total ? `${done}/${total} topics complete (${Math.round(done/total*100)}%)` : 'No progress tracked yet.';
  })()}

Your role:
- Give specific, actionable, personalized advice based on THEIR actual data above
- Be encouraging, warm, and motivating — like a real tutor
- Keep responses concise but helpful (3-6 sentences usually)
- Use bullet points when listing multiple tips
- If they ask what to study today, look at which subject has the nearest exam and lowest progress
- If no subjects/plan exist yet, kindly guide them to add subjects first
- Never give generic advice — always reference their specific subjects and data`;
  return sysPrompt;
}

async function sendAiMessage() {
  const input = document.getElementById('ai-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';

  appendAiMessage('user', msg);
  aiHistory.push({ role: 'user', content: msg });

  const btn = document.getElementById('ai-send-btn');
  btn.disabled = true;
  const typingId = showTyping();

  try {
    // -------------------------------------------------------
    // SECURITY NOTE FOR GITHUB:
    // This app is used inside Claude.ai which handles the API
    // authentication securely on the server side.
    // No API key is stored or exposed in this frontend code.
    // For standalone deployment, connect to your own backend
    // proxy that holds the API key securely (never in JS).
    // -------------------------------------------------------
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: buildSystemPrompt(),
        messages: aiHistory
      })
    });
    const data = await response.json();
    removeTyping(typingId);

    if (data.content && data.content[0]) {
      const reply = data.content[0].text;
      aiHistory.push({ role: 'assistant', content: reply });
      appendAiMessage('assistant', reply);
      if (aiHistory.length > 20) aiHistory = aiHistory.slice(-20);
    } else {
      appendAiMessage('assistant', '⚠️ Sorry, I got an unexpected response. Please try again.');
    }
  } catch(err) {
    removeTyping(typingId);
    // In public/GitHub version, AI chat requires backend proxy
    appendAiMessage('assistant', `ℹ️ **AI Advisor** requires a backend API proxy when running locally.\n\nFor the live demo, this works inside Claude.ai. To deploy standalone:\n- Set up a simple backend (Node.js/Python)\n- Store your API key there securely\n- Never put API keys in frontend JavaScript\n\nSee README.md for setup instructions.`);
  }
  btn.disabled = false;
}

function appendAiMessage(role, text) {
  const container = document.getElementById('ai-messages');
  const div = document.createElement('div');
  div.className = `ai-msg ${role}`;
  const avatar = role === 'assistant'
    ? `<div class="ai-avatar bot">🤖</div>`
    : `<div class="ai-avatar user-av">👤</div>`;
  // Simple markdown-like formatting
  const formatted = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .split('\n\n').map(p => p.startsWith('<ul>') ? p : `<p>${p}</p>`).join('');
  div.innerHTML = `${avatar}<div class="ai-bubble">${formatted}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = document.getElementById('ai-messages');
  const id = 'typing-' + Date.now();
  const div = document.createElement('div');
  div.id = id;
  div.className = 'ai-msg assistant';
  div.innerHTML = `<div class="ai-avatar bot">🤖</div><div class="ai-bubble"><div class="ai-typing"><span></span><span></span><span></span></div></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}
function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function askChip(question) {
  document.getElementById('ai-input').value = question;
  sendAiMessage();
}

function clearAiChat() {
  aiHistory = [];
  const container = document.getElementById('ai-messages');
  container.innerHTML = `<div class="ai-msg assistant">
    <div class="ai-avatar bot">🤖</div>
    <div class="ai-bubble"><p>Chat cleared! What would you like help with?</p></div>
  </div>`;
}
