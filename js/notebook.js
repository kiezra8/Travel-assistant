/**
 * notebook.js — Notes / Notebook module
 */

const Notebook = (() => {
  let notes    = [];
  let editId   = null;
  let $grid;

  const NOTE_COLORS = ['#6c63ff','#00e5a0','#ff5e7e','#ffc86b','#38b6ff','#c77dff','#ff914d','#00c9ff'];
  let selectedColor = NOTE_COLORS[0];

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    $grid  = document.getElementById('notes-grid');
    notes  = await DB.dbGetAll('notes');
    _renderGrid();
    _bindEvents();
  }

  // ── Render Grid ──────────────────────────────────────────
  function _renderGrid(search = '') {
    let filtered = notes;
    if (search.trim()) filtered = notes.filter(n =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase())
    );
    filtered.sort((a,b) => b.updatedAt - a.updatedAt);

    if (!filtered.length) {
      $grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">📓</div>
          <div class="empty-title">Your notebook is empty</div>
          <div class="empty-sub">Tap + to write your first note</div>
        </div>`;
      return;
    }
    $grid.innerHTML = filtered.map(n => _noteCard(n)).join('');
    $grid.querySelectorAll('.note-card').forEach(card => {
      card.addEventListener('click', e => {
        if (!e.target.closest('[data-del-note]')) _openEdit(+card.dataset.id);
      });
    });
    $grid.querySelectorAll('[data-del-note]').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); _delete(+btn.dataset.delNote); })
    );
  }

  function _noteCard(n) {
    const plain = n.content.replace(/<[^>]+>/g, '');
    const fmtDate = new Date(n.updatedAt).toLocaleDateString(undefined, { month:'short', day:'numeric' });
    return `
    <div class="note-card" data-id="${n.id}" style="border-top: 3px solid ${n.color || NOTE_COLORS[0]}">
      <div class="note-card-title">${_esc(n.title) || 'Untitled'}</div>
      <div class="note-card-preview">${plain || '<em>No content</em>'}</div>
      <div class="note-card-footer">
        <span>
          <span class="note-color-dot" style="background:${n.color}"></span>
          ${fmtDate}
        </span>
        <button class="btn-icon" data-del-note="${n.id}" style="width:28px;height:28px;font-size:.8rem" title="Delete">🗑</button>
      </div>
    </div>`;
  }

  // ── Note Editor Modal ────────────────────────────────────
  function _openNew() {
    editId = null;
    selectedColor = NOTE_COLORS[0];
    document.getElementById('note-modal-title').textContent = 'New Note';
    document.getElementById('note-title-input').value = '';
    document.getElementById('note-editor').innerHTML = '';
    _syncColorPalette();
    document.getElementById('note-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function _openEdit(id) {
    const n = notes.find(x => x.id === id);
    if (!n) return;
    editId = id;
    selectedColor = n.color || NOTE_COLORS[0];
    document.getElementById('note-modal-title').textContent = 'Edit Note';
    document.getElementById('note-title-input').value = n.title;
    document.getElementById('note-editor').innerHTML = n.content;
    _syncColorPalette();
    document.getElementById('note-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function _syncColorPalette() {
    document.querySelectorAll('.color-swatch').forEach(sw => {
      sw.classList.toggle('selected', sw.dataset.color === selectedColor);
    });
  }

  async function _saveNote() {
    const title   = document.getElementById('note-title-input').value.trim();
    const content = document.getElementById('note-editor').innerHTML;
    if (!title && !content) { App.toast('Note is empty', 'error'); return; }
    const data = { title: title || 'Untitled', content, color: selectedColor, updatedAt: Date.now() };
    if (editId) {
      data.id = editId;
      await DB.dbPut('notes', data);
      const idx = notes.findIndex(n => n.id === editId);
      if (idx > -1) notes[idx] = data; else notes.push(data);
      App.toast('Note saved ✓', 'success');
    } else {
      const id = await DB.dbAdd('notes', data);
      data.id  = id;
      notes.push(data);
      App.toast('Note created ✓', 'success');
    }
    _closeNoteModal();
    _renderGrid();
  }

  async function _delete(id) {
    if (!confirm('Delete this note?')) return;
    await DB.dbDelete('notes', id);
    notes = notes.filter(n => n.id !== id);
    _renderGrid();
    App.toast('Note deleted', 'info');
  }

  function _closeNoteModal() {
    document.getElementById('note-modal').classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── Toolbar commands ─────────────────────────────────────
  function _execFormat(cmd, value = null) {
    document.execCommand(cmd, false, value);
    document.getElementById('note-editor').focus();
  }

  // ── Events ───────────────────────────────────────────────
  function _bindEvents() {
    const fab = document.getElementById('note-fab');
    if (fab) fab.addEventListener('click', _openNew);

    document.querySelectorAll('[data-close-modal="note"]').forEach(el =>
      el.addEventListener('click', _closeNoteModal)
    );

    const saveBtn = document.getElementById('note-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', _saveNote);

    // Search
    const searchEl = document.getElementById('note-search');
    if (searchEl) searchEl.addEventListener('input', e => _renderGrid(e.target.value));

    // Format toolbar
    document.querySelectorAll('[data-fmt]').forEach(btn =>
      btn.addEventListener('click', () => _execFormat(btn.dataset.fmt))
    );
    document.getElementById('fmt-link')?.addEventListener('click', () => {
      const url = prompt('Enter URL:');
      if (url) _execFormat('createLink', url);
    });

    // Color palette
    document.querySelectorAll('.color-swatch').forEach(sw =>
      sw.addEventListener('click', () => {
        selectedColor = sw.dataset.color;
        _syncColorPalette();
      })
    );
  }

  // ── Helpers ──────────────────────────────────────────────
  function _esc(s) { return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  function buildNoteEditorHTML() {
    const swatches = NOTE_COLORS.map(c =>
      `<span class="color-swatch" data-color="${c}" style="background:${c}" title="${c}"></span>`
    ).join('');
    return `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input id="note-title-input" type="text" class="form-input" placeholder="Note title…">
    </div>
    <div class="form-group">
      <label class="form-label">Color</label>
      <div class="color-palette">${swatches}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Content</label>
      <div class="note-editor-bar">
        <button data-fmt="bold" title="Bold"><strong>B</strong></button>
        <button data-fmt="italic" title="Italic"><em>I</em></button>
        <button data-fmt="underline" title="Underline"><u>U</u></button>
        <button data-fmt="strikeThrough" title="Strike"><s>S</s></button>
        <button data-fmt="insertUnorderedList" title="Bullet">•</button>
        <button data-fmt="insertOrderedList" title="Numbered">1.</button>
        <button data-fmt="justifyLeft" title="Left">⬅</button>
        <button data-fmt="justifyCenter" title="Center">⬛</button>
        <button data-fmt="justifyRight" title="Right">➡</button>
        <button id="fmt-link" title="Link">🔗</button>
        <button data-fmt="removeFormat" title="Clear">✕</button>
      </div>
      <div id="note-editor" contenteditable="true" spellcheck="true"></div>
    </div>
    <button id="note-save-btn" class="btn btn-primary w-full">💾 Save Note</button>`;
  }

  return { init, buildNoteEditorHTML };
})();

window.Notebook = Notebook;
