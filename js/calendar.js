/**
 * calendar.js — Calendar view with event scheduling
 */

const Cal = (() => {
  let events      = [];
  let currentDate = new Date();
  let selectedDay = null;

  const CATEGORIES = {
    personal:  { label: 'Personal',  color: '#6c63ff' },
    business:  { label: 'Business',  color: '#00e5a0' },
    trade:     { label: 'Trade',     color: '#38b6ff' },
    reminder:  { label: 'Reminder',  color: '#ffc86b' },
    other:     { label: 'Other',     color: '#c77dff' },
  };

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    events = await DB.dbGetAll('events');
    _renderCalendar();
    _renderDayPanel(new Date());
    _bindEvents();
  }

  // ── Calendar Grid ────────────────────────────────────────
  function _renderCalendar() {
    const year  = currentDate.getFullYear();
    const month = currentDate.getMonth();

    document.getElementById('cal-month-label').textContent =
      new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays    = new Date(year, month, 0).getDate();

    const cells = [];
    // Fill leading days from prev month
    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({ d: prevDays - i, month: month - 1, year, otherMonth: true });
    }
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ d, month, year, otherMonth: false });
    }
    // Fill trailing days
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({ d, month: month + 1, year, otherMonth: true });
    }

    const today = new Date();
    const grid  = document.getElementById('cal-grid');
    grid.innerHTML = cells.map(c => {
      const dateStr = _isoDate(c.year, c.month, c.d);
      const isToday = today.getFullYear() === c.year && today.getMonth() === c.month && today.getDate() === c.d;
      const isSel   = selectedDay === dateStr;
      const dayEvts = events.filter(e => e.date === dateStr);
      const dots    = dayEvts.slice(0, 3).map(e => {
        const cat = CATEGORIES[e.category] || CATEGORIES.other;
        return `<span class="cal-event-dot" style="background:${cat.color}"></span>`;
      }).join('');
      return `
      <div class="cal-day${c.otherMonth ? ' other-month' : ''}${isToday ? ' today' : ''}${isSel ? ' selected' : ''}"
           data-date="${dateStr}" data-m="${c.otherMonth ? '1' : '0'}">
        <div class="cal-day-num">${c.d}</div>
        <div class="cal-event-dots">${dots}</div>
      </div>`;
    }).join('');

    // Click on a day
    grid.querySelectorAll('.cal-day').forEach(cell => {
      cell.addEventListener('click', () => {
        selectedDay = cell.dataset.date;
        const [y, m, d] = selectedDay.split('-').map(Number);
        // Jump to month if clicking other-month cell
        if (cell.dataset.m === '1') {
          currentDate = new Date(y, m - 1, 1);
          _renderCalendar();
        } else {
          // Highlight
          grid.querySelectorAll('.cal-day').forEach(c => c.classList.remove('selected'));
          cell.classList.add('selected');
        }
        _renderDayPanel(new Date(y, m - 1, d));
      });
    });
  }

  // ── Day Events Panel ─────────────────────────────────────
  function _renderDayPanel(date) {
    const dateStr  = _isoDate(date.getFullYear(), date.getMonth(), date.getDate());
    const dayLabel = date.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric', year:'numeric' });
    const panel    = document.getElementById('cal-events-panel');
    const dayEvts  = events.filter(e => e.date === dateStr).sort((a,b) => (a.time||'').localeCompare(b.time||''));

    panel.querySelector('.cal-events-panel-header').innerHTML = `
      <span>📅 ${dayLabel}</span>
      <button class="btn btn-primary btn-sm" id="add-cal-event-btn">+ Add</button>`;

    const evList = panel.querySelector('.cal-events-list');
    if (!dayEvts.length) {
      evList.innerHTML = `<div class="empty-state" style="padding:30px 20px">
        <div class="empty-icon">📋</div>
        <div class="empty-title" style="font-size:.9rem">No events</div>
        <div class="empty-sub">Click "+ Add" to plan your day</div>
      </div>`;
    } else {
      evList.innerHTML = dayEvts.map(ev => {
        const cat = CATEGORIES[ev.category] || CATEGORIES.other;
        return `
        <div class="cal-event-item" data-ev-id="${ev.id}">
          <div class="cal-event-color" style="background:${cat.color}"></div>
          <div class="cal-event-body">
            <div class="cal-event-title">${_esc(ev.title)}</div>
            <div class="cal-event-time">${ev.time ? '🕐 ' + _fmt12(ev.time) : ''} · ${cat.label}</div>
            ${ev.description ? `<div class="cal-event-desc">${_esc(ev.description)}</div>` : ''}
          </div>
          <div class="flex gap-8">
            <button class="btn-icon" data-edit-ev="${ev.id}" title="Edit" style="font-size:.85rem">✏️</button>
            <button class="btn-icon" data-del-ev="${ev.id}" title="Delete" style="font-size:.85rem">🗑</button>
          </div>
        </div>`;
      }).join('');

      evList.querySelectorAll('[data-del-ev]').forEach(btn =>
        btn.addEventListener('click', () => _deleteEvent(+btn.dataset.delEv))
      );
      evList.querySelectorAll('[data-edit-ev]').forEach(btn =>
        btn.addEventListener('click', () => _openEditEvent(+btn.dataset.editEv))
      );
    }

    // Bind add button
    panel.querySelector('#add-cal-event-btn')?.addEventListener('click', () => _openNewEvent(dateStr));
  }

  // ── CRUD ─────────────────────────────────────────────────
  function _openNewEvent(date) {
    const modal = document.getElementById('cal-modal');
    document.getElementById('cal-event-id').value    = '';
    document.getElementById('cal-event-date').value  = date || _isoToday();
    document.getElementById('cal-event-time').value  = '';
    document.getElementById('cal-event-title').value = '';
    document.getElementById('cal-event-cat').value   = 'personal';
    document.getElementById('cal-event-desc').value  = '';
    document.getElementById('cal-modal-title').textContent = 'New Event';
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  async function _openEditEvent(id) {
    const ev = events.find(e => e.id === id);
    if (!ev) return;
    document.getElementById('cal-event-id').value    = ev.id;
    document.getElementById('cal-event-date').value  = ev.date;
    document.getElementById('cal-event-time').value  = ev.time || '';
    document.getElementById('cal-event-title').value = ev.title;
    document.getElementById('cal-event-cat').value   = ev.category;
    document.getElementById('cal-event-desc').value  = ev.description || '';
    document.getElementById('cal-modal-title').textContent = 'Edit Event';
    document.getElementById('cal-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  async function _handleEventSubmit(e) {
    e.preventDefault();
    const id    = document.getElementById('cal-event-id').value;
    const title = document.getElementById('cal-event-title').value.trim();
    const date  = document.getElementById('cal-event-date').value;
    if (!title || !date) { App.toast('Title and date are required', 'error'); return; }
    const data = {
      title,
      date,
      time:        document.getElementById('cal-event-time').value,
      category:    document.getElementById('cal-event-cat').value,
      description: document.getElementById('cal-event-desc').value.trim(),
      updatedAt:   Date.now(),
    };
    if (id) {
      data.id = +id;
      await DB.dbPut('events', data);
      const idx = events.findIndex(x => x.id === data.id);
      if (idx > -1) events[idx] = data; else events.push(data);
      App.toast('Event updated ✓', 'success');
    } else {
      const newId = await DB.dbAdd('events', data);
      data.id = newId;
      events.push(data);
      App.toast('Event added ✓', 'success');
    }
    document.getElementById('cal-modal').classList.remove('open');
    document.body.style.overflow = '';
    _renderCalendar();
    const [y,m,d] = date.split('-').map(Number);
    _renderDayPanel(new Date(y, m-1, d));
    selectedDay = date;
  }

  async function _deleteEvent(id) {
    if (!confirm('Delete this event?')) return;
    await DB.dbDelete('events', id);
    events = events.filter(e => e.id !== id);
    _renderCalendar();
    if (selectedDay) {
      const [y,m,d] = selectedDay.split('-').map(Number);
      _renderDayPanel(new Date(y,m-1,d));
    }
    App.toast('Event deleted', 'info');
  }

  // ── Events ───────────────────────────────────────────────
  function _bindEvents() {
    document.getElementById('cal-prev')?.addEventListener('click', () => {
      currentDate.setMonth(currentDate.getMonth() - 1);
      _renderCalendar();
    });
    document.getElementById('cal-next')?.addEventListener('click', () => {
      currentDate.setMonth(currentDate.getMonth() + 1);
      _renderCalendar();
    });
    document.getElementById('cal-today')?.addEventListener('click', () => {
      currentDate = new Date();
      selectedDay = _isoToday();
      _renderCalendar();
      _renderDayPanel(new Date());
    });
    document.getElementById('cal-form')?.addEventListener('submit', _handleEventSubmit);
    document.querySelectorAll('[data-close-modal="cal"]').forEach(el =>
      el.addEventListener('click', () => { document.getElementById('cal-modal').classList.remove('open'); document.body.style.overflow=''; })
    );
  }

  // ── Helpers ──────────────────────────────────────────────
  function _esc(s) { return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function _isoDate(y, m, d) { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
  function _isoToday() { const t=new Date(); return _isoDate(t.getFullYear(), t.getMonth(), t.getDate()); }
  function _fmt12(t) {
    if (!t) return '';
    const [h,m] = t.split(':').map(Number);
    const ampm  = h >= 12 ? 'PM' : 'AM';
    return `${h%12||12}:${String(m).padStart(2,'0')} ${ampm}`;
  }

  function buildEventFormHTML() {
    const catOpts = Object.entries(CATEGORIES)
      .map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('');
    return `
    <input type="hidden" id="cal-event-id">
    <div class="form-group">
      <label class="form-label">Event Title *</label>
      <input id="cal-event-title" type="text" class="form-input" placeholder="Meeting, shipment arrival…" required>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Date *</label>
        <input id="cal-event-date" type="date" class="form-input" required>
      </div>
      <div class="form-group">
        <label class="form-label">Time</label>
        <input id="cal-event-time" type="time" class="form-input">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Category</label>
      <select id="cal-event-cat" class="form-select">${catOpts}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <textarea id="cal-event-desc" class="form-textarea" placeholder="Details…"></textarea>
    </div>
    <button type="submit" class="btn btn-primary w-full">💾 Save Event</button>`;
  }

  return { init, buildEventFormHTML };
})();

window.Cal = Cal;
