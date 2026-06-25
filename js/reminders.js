/**
 * reminders.js — Reminder & Alarm system (offline-first, Web Audio API)
 */

const Reminders = (() => {
  let reminders = [];
  let timers    = {};
  let $list;
  let audioCtx  = null;

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    $list = document.getElementById('reminder-list');
    reminders = await DB.dbGetAll('reminders');
    _renderList();
    _scheduleAll();
    _bindEvents();
    // Refresh countdown every 30s
    setInterval(_updateCountdowns, 30000);
  }

  // ── Render ───────────────────────────────────────────────
  function _renderList() {
    if (!$list) return;
    const sorted = [...reminders].sort((a,b) => new Date(a.datetime) - new Date(b.datetime));
    if (!sorted.length) {
      $list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⏰</div>
          <div class="empty-title">No reminders yet</div>
          <div class="empty-sub">Set an alarm and never miss a shipment deadline</div>
        </div>`;
      return;
    }
    $list.innerHTML = sorted.map(r => _reminderCard(r)).join('');
    $list.querySelectorAll('[data-delete-rem]').forEach(btn =>
      btn.addEventListener('click', () => _delete(+btn.dataset.deleteRem))
    );
  }

  function _reminderCard(r) {
    const fired   = new Date(r.datetime) < new Date() || r.fired;
    const ringCls = fired ? 'fired' : '';
    const countdown = _countdownText(r.datetime);
    const priorityMap = { high: 'badge-high', medium: 'badge-medium', low: 'badge-low' };
    const pBadge = priorityMap[r.priority || 'medium'] || 'badge-medium';
    return `
    <div class="reminder-card" data-id="${r.id}">
      <div class="reminder-ring ${ringCls}">${fired ? '✅' : '⏰'}</div>
      <div class="reminder-body">
        <div class="reminder-title">${_esc(r.title)}</div>
        <div class="reminder-time">📅 ${_fmtDateTime(r.datetime)}</div>
        ${r.note ? `<div class="text-sm text-muted mt-4">${_esc(r.note)}</div>` : ''}
        <div class="flex gap-8 mt-8">
          <span class="badge ${pBadge}">${(r.priority||'medium').charAt(0).toUpperCase()+(r.priority||'medium').slice(1)} Priority</span>
          ${fired ? '' : `<span class="reminder-countdown" data-countdown="${r.id}">${countdown}</span>`}
        </div>
      </div>
      <div class="reminder-actions">
        <button class="btn-icon" data-delete-rem="${r.id}" title="Delete">🗑</button>
      </div>
    </div>`;
  }

  function _updateCountdowns() {
    document.querySelectorAll('[data-countdown]').forEach(el => {
      const id = +el.dataset.countdown;
      const r  = reminders.find(x => x.id === id);
      if (r) el.textContent = _countdownText(r.datetime);
    });
  }

  function _countdownText(dt) {
    const diff = new Date(dt) - new Date();
    if (diff <= 0) return 'Overdue';
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0)  return `in ${d}d ${h % 24}h`;
    if (h > 0)  return `in ${h}h ${m % 60}m`;
    return `in ${m}m`;
  }

  // ── Events ───────────────────────────────────────────────
  function _bindEvents() {
    const fab   = document.getElementById('reminder-fab');
    const modal = document.getElementById('reminder-modal');
    const form  = document.getElementById('reminder-form');

    if (fab)   fab.addEventListener('click', () => { if(form) form.reset(); modal.classList.add('open'); });
    if (form)  form.addEventListener('submit', _handleSubmit);
    document.querySelectorAll('[data-close-modal="reminder"]').forEach(el =>
      el.addEventListener('click', () => modal.classList.remove('open'))
    );

    // Set default datetime to +1hr
    const dtInput = document.getElementById('rem-datetime');
    if (dtInput) {
      const d = new Date();
      d.setHours(d.getHours() + 1, 0, 0, 0);
      dtInput.value = d.toISOString().slice(0,16);
    }

    // Dismiss alarm overlay
    document.getElementById('alarm-dismiss')?.addEventListener('click', _dismissAlarm);
    document.getElementById('snooze-alarm')?.addEventListener('click', _snoozeAlarm);
  }

  async function _handleSubmit(e) {
    e.preventDefault();
    const title    = document.getElementById('rem-title').value.trim();
    const datetime = document.getElementById('rem-datetime').value;
    const priority = document.getElementById('rem-priority').value;
    const note     = document.getElementById('rem-note').value.trim();
    const repeat   = document.getElementById('rem-repeat').value;
    if (!title || !datetime) { App.toast('Title and time are required', 'error'); return; }
    const data = { title, datetime, priority, note, repeat, fired: false, createdAt: Date.now() };
    const id   = await DB.dbAdd('reminders', data);
    data.id = id;
    reminders.push(data);
    _scheduleOne(data);
    _renderList();
    document.getElementById('reminder-modal').classList.remove('open');
    App.toast('Reminder set ✓', 'success');
  }

  async function _delete(id) {
    clearTimeout(timers[id]);
    delete timers[id];
    await DB.dbDelete('reminders', id);
    reminders = reminders.filter(r => r.id !== id);
    _renderList();
    App.toast('Reminder removed', 'info');
  }

  // ── Scheduling ───────────────────────────────────────────
  function _scheduleAll() {
    reminders.forEach(r => { if (!r.fired) _scheduleOne(r); });
  }

  function _scheduleOne(r) {
    const delay = new Date(r.datetime) - Date.now();
    if (delay <= 0) return;
    timers[r.id] = setTimeout(() => _fireAlarm(r), delay);
  }

  async function _fireAlarm(r) {
    r.fired = true;
    await DB.dbPut('reminders', r);
    _playAlarm();
    _showAlarmOverlay(r);
    _renderList();

    // Browser notification
    if (Notification.permission === 'granted') {
      new Notification(`⏰ ${r.title}`, { body: r.note || 'Reminder from TradeFlow', icon: './icons/icon-512.svg' });
    }
  }

  function _showAlarmOverlay(r) {
    const overlay = document.getElementById('alarm-overlay');
    if (!overlay) return;
    document.getElementById('alarm-msg-title').textContent = r.title;
    document.getElementById('alarm-msg-sub').textContent   = r.note || _fmtDateTime(r.datetime);
    overlay.classList.add('ringing');
    overlay.dataset.reminderId = r.id;
  }

  function _dismissAlarm() {
    const overlay = document.getElementById('alarm-overlay');
    overlay.classList.remove('ringing');
    _stopAlarm();
  }

  async function _snoozeAlarm() {
    const overlay = document.getElementById('alarm-overlay');
    const id      = +overlay.dataset.reminderId;
    const r       = reminders.find(x => x.id === id);
    if (r) {
      // Snooze 5 minutes
      const newDt = new Date(Date.now() + 5 * 60000);
      r.fired    = false;
      r.datetime = newDt.toISOString().slice(0,16);
      await DB.dbPut('reminders', r);
      _scheduleOne(r);
      App.toast('Snoozed 5 minutes ⏱', 'info');
    }
    _dismissAlarm();
    _renderList();
  }

  // ── Audio ────────────────────────────────────────────────
  let alarmInterval = null;

  function _playAlarm() {
    _stopAlarm();
    alarmInterval = setInterval(_beep, 900);
    _beep();
  }

  function _stopAlarm() {
    clearInterval(alarmInterval);
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
  }

  function _beep() {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.15);
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.6, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.7);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.75);
    } catch(e) { /* audio not available */ }
  }

  // ── Helpers ──────────────────────────────────────────────
  function _esc(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function _fmtDateTime(dt) {
    if (!dt) return '';
    return new Date(dt).toLocaleString(undefined, { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  function buildFormHTML() {
    return `
    <div class="form-group">
      <label class="form-label">Reminder Title *</label>
      <input id="rem-title" type="text" class="form-input" placeholder="e.g. Confirm shipment from China…" required>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Date & Time *</label>
        <input id="rem-datetime" type="datetime-local" class="form-input" required>
      </div>
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select id="rem-priority" class="form-select">
          <option value="low">🟢 Low</option>
          <option value="medium" selected>🟡 Medium</option>
          <option value="high">🔴 High</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Repeat</label>
      <select id="rem-repeat" class="form-select">
        <option value="none">No Repeat</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Note</label>
      <textarea id="rem-note" class="form-textarea" placeholder="Optional details…"></textarea>
    </div>
    <button type="submit" class="btn btn-primary w-full">⏰ Set Reminder</button>`;
  }

  return { init, buildFormHTML };
})();

window.Reminders = Reminders;
