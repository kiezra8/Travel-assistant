/**
 * trade.js — Import/Export trade management
 */

const Trade = (() => {
  // ── State ────────────────────────────────────────────────
  let trades    = [];
  let filter    = 'all';   // 'all' | 'import' | 'export'
  let searchQ   = '';

  // ── DOM refs (resolved on init) ──────────────────────────
  let $list, $searchInput, $modal, $form;

  const CURRENCIES = ['USD', 'EUR', 'GBP', 'KES', 'UGX', 'NGN', 'ZAR', 'CNY', 'AED', 'INR', 'JPY', 'CAD', 'AUD', 'TZS', 'RWF'];
  const STATUSES   = ['Pending', 'In Transit', 'Delivered', 'Cancelled'];

  // ── Init ────────────────────────────────────────────────
  async function init() {
    $list        = document.getElementById('trade-list');
    $searchInput = document.getElementById('trade-search');
    $modal       = document.getElementById('trade-modal');
    $form        = document.getElementById('trade-form');

    trades = await DB.dbGetAll('trades');
    _renderList();
    _bindEvents();
  }

  // ── Render ───────────────────────────────────────────────
  function _renderList() {
    let filtered = trades;
    if (filter !== 'all') filtered = filtered.filter(t => t.type === filter);
    if (searchQ.trim())   filtered = filtered.filter(t =>
      t.name.toLowerCase().includes(searchQ.toLowerCase()) ||
      t.country.toLowerCase().includes(searchQ.toLowerCase())
    );
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (!filtered.length) {
      $list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📦</div>
          <div class="empty-title">No trades found</div>
          <div class="empty-sub">Tap + to log your first import or export</div>
        </div>`;
      return;
    }

    $list.innerHTML = filtered.map(t => _tradeCard(t)).join('');
    $list.querySelectorAll('[data-delete]').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); _delete(+btn.dataset.delete); })
    );
    $list.querySelectorAll('[data-edit]').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); _openEdit(+btn.dataset.edit); })
    );
  }

  function _tradeCard(t) {
    const sign  = t.type === 'export' ? '+' : '-';
    const amtCls = t.type === 'export' ? 'text-green' : 'text-blue';
    const statusBadge = t.status === 'Delivered' ? 'badge-done' :
                        t.status === 'Cancelled' ? 'badge-high' : 'badge-pending';
    const dirIcon = t.type === 'import' ? '📥' : '📤';
    
    let ownersHtml = `<div class="mt-8 text-sm"><span class="badge badge-low">Solely Owned</span></div>`;
    if (t.owners && t.owners.length > 0) {
      ownersHtml = `<div class="mt-8 text-sm" style="background:var(--bg-surface); padding:10px; border-radius:var(--radius-sm)">
         <div class="text-muted mb-4" style="font-size:0.75rem; text-transform:uppercase; font-weight:600">Receivers / Owners:</div>
         ${t.owners.map(o => `<div class="flex justify-between mt-4"><span>👤 ${_esc(o.name)}</span><span class="font-bold">${_num(o.quantity)} ${_esc(t.unit || 'units')}</span></div>`).join('')}
       </div>`;
    }

    return `
    <div class="trade-card ${t.type}" data-id="${t.id}">
      <div class="trade-card-top">
        <div>
          <div class="trade-card-name">${_esc(t.name)}</div>
          <div class="trade-card-country">
            <span class="flag">${_flag(t.country)}</span>
            ${_esc(t.country)}
            <span class="badge badge-${t.type}">${t.type.charAt(0).toUpperCase() + t.type.slice(1)}</span>
          </div>
        </div>
        <div class="trade-card-amount ${amtCls}">${sign}${t.currency} ${_num(t.totalCost)}</div>
      </div>
      <div class="trade-card-meta">
        <span>📦 Qty: <strong>${_num(t.quantity)} ${_esc(t.unit || 'units')}</strong></span>
        <span>💰 Unit Price: <strong>${t.currency} ${_num(t.unitPrice)}</strong></span>
        <span>📅 ${_fmtDate(t.date)}</span>
        <span class="badge ${statusBadge}">${t.status}</span>
      </div>
      ${ownersHtml}
      ${t.notes ? `<div class="mt-8 text-sm text-muted">${_esc(t.notes)}</div>` : ''}
      <div class="trade-card-actions">
        <button class="btn btn-ghost btn-sm" data-edit="${t.id}">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" data-delete="${t.id}">🗑 Delete</button>
      </div>
    </div>`;
  }

  // ── Events ───────────────────────────────────────────────
  function _bindEvents() {
    // Search
    if ($searchInput) {
      $searchInput.addEventListener('input', e => {
        searchQ = e.target.value;
        _renderList();
      });
    }
    // Filter chips
    document.querySelectorAll('[data-trade-filter]').forEach(chip =>
      chip.addEventListener('click', () => {
        filter = chip.dataset.tradeFilter;
        document.querySelectorAll('[data-trade-filter]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        _renderList();
      })
    );
    // FAB open modal
    const fab = document.getElementById('trade-fab');
    if (fab) fab.addEventListener('click', () => _openNew());

    // Form submit
    if ($form) $form.addEventListener('submit', _handleSubmit);

    // Close modal
    document.querySelectorAll('[data-close-modal="trade"]').forEach(el =>
      el.addEventListener('click', _closeModal)
    );
    // Calc total on price/qty change
    if ($form) {
      ['trade-unit-price', 'trade-qty'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', _calcTotal);
      });
    }
    
    // Add owner row
    const btnAddOwner = document.getElementById('trade-add-owner');
    if (btnAddOwner) btnAddOwner.addEventListener('click', () => _addOwnerRow());
  }

  function _addOwnerRow(name = '', qty = '') {
    const container = document.getElementById('trade-owners-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'owner-row flex gap-8 items-center mt-8';
    div.innerHTML = `
      <input type="text" class="form-input owner-name" placeholder="Name" value="${_esc(name)}" required style="flex:1">
      <input type="number" class="form-input owner-qty" placeholder="Qty" value="${qty}" min="0" step="any" required style="flex:1">
      <button type="button" class="btn-icon owner-remove" title="Remove" style="flex-shrink:0">✕</button>
    `;
    div.querySelector('.owner-remove').addEventListener('click', () => {
      div.remove();
      _calcTotal();
    });
    div.querySelector('.owner-qty').addEventListener('input', _calcTotal);
    container.appendChild(div);
    _calcTotal();
  }

  function _calcTotal() {
    const ownerRows = document.querySelectorAll('.owner-qty');
    let qty = 0;
    if (ownerRows.length > 0) {
      ownerRows.forEach(input => qty += (parseFloat(input.value) || 0));
      const qtyInput = document.getElementById('trade-qty');
      if (qtyInput) {
        qtyInput.value = qty;
        qtyInput.readOnly = true;
      }
    } else {
      const qtyInput = document.getElementById('trade-qty');
      if (qtyInput) qtyInput.readOnly = false;
      qty = parseFloat(document.getElementById('trade-qty')?.value) || 0;
    }
    const price = parseFloat(document.getElementById('trade-unit-price')?.value) || 0;
    const el    = document.getElementById('trade-total-display');
    if (el) el.textContent = _num(qty * price);
  }

  // ── CRUD ─────────────────────────────────────────────────
  function _openNew() {
    document.getElementById('trade-modal-title').textContent = 'New Trade Entry';
    if ($form) $form.reset();
    document.getElementById('trade-owners-container').innerHTML = '';
    document.getElementById('trade-id').value = '';
    document.getElementById('trade-date').value = new Date().toISOString().slice(0,10);
    _calcTotal();
    _openModal();
  }

  async function _openEdit(id) {
    const t = trades.find(x => x.id === id);
    if (!t) return;
    document.getElementById('trade-modal-title').textContent = 'Edit Trade';
    document.getElementById('trade-id').value        = t.id;
    document.getElementById('trade-type').value      = t.type;
    document.getElementById('trade-name').value      = t.name;
    document.getElementById('trade-country').value   = t.country;
    document.getElementById('trade-qty').value       = t.quantity;
    document.getElementById('trade-unit').value      = t.unit || '';
    document.getElementById('trade-unit-price').value= t.unitPrice;
    document.getElementById('trade-currency').value  = t.currency;
    document.getElementById('trade-date').value      = t.date;
    document.getElementById('trade-status').value    = t.status;
    document.getElementById('trade-notes').value     = t.notes || '';
    
    document.getElementById('trade-owners-container').innerHTML = '';
    if (t.owners && t.owners.length > 0) {
      t.owners.forEach(o => _addOwnerRow(o.name, o.quantity));
    }
    
    _calcTotal();
    _openModal();
  }

  async function _handleSubmit(e) {
    e.preventDefault();
    
    const ownerRows = document.querySelectorAll('#trade-owners-container .owner-row');
    const owners = [];
    ownerRows.forEach(row => {
      const n = row.querySelector('.owner-name').value.trim();
      const q = parseFloat(row.querySelector('.owner-qty').value) || 0;
      if (n && q > 0) owners.push({ name: n, quantity: q });
    });

    const id       = document.getElementById('trade-id').value;
    const qty      = parseFloat(document.getElementById('trade-qty').value) || 0;
    const unitPrice= parseFloat(document.getElementById('trade-unit-price').value) || 0;
    const data = {
      type:      document.getElementById('trade-type').value,
      name:      document.getElementById('trade-name').value.trim(),
      country:   document.getElementById('trade-country').value.trim(),
      quantity:  qty,
      unit:      document.getElementById('trade-unit').value.trim(),
      unitPrice: unitPrice,
      totalCost: qty * unitPrice,
      currency:  document.getElementById('trade-currency').value,
      date:      document.getElementById('trade-date').value,
      status:    document.getElementById('trade-status').value,
      notes:     document.getElementById('trade-notes').value.trim(),
      owners:    owners,
      updatedAt: Date.now(),
    };
    if (!data.name || !data.country) { App.toast('Please fill required fields', 'error'); return; }

    if (id) {
      data.id = +id;
      await DB.dbPut('trades', data);
      const idx = trades.findIndex(x => x.id === data.id);
      if (idx > -1) trades[idx] = data; else trades.push(data);
      App.toast('Trade updated ✓', 'success');
    } else {
      const newId = await DB.dbAdd('trades', data);
      data.id = newId;
      trades.push(data);
      App.toast('Trade logged ✓', 'success');
    }
    _closeModal();
    _renderList();
    App.refreshDashboard();
  }

  async function _delete(id) {
    if (!confirm('Delete this trade entry?')) return;
    await DB.dbDelete('trades', id);
    trades = trades.filter(t => t.id !== id);
    _renderList();
    App.refreshDashboard();
    App.toast('Deleted', 'info');
  }

  function _openModal()  { $modal.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function _closeModal() { $modal.classList.remove('open'); document.body.style.overflow = ''; }

  // ── Analytics ────────────────────────────────────────────
  function getStats() {
    const imports = trades.filter(t => t.type === 'import');
    const exports = trades.filter(t => t.type === 'export');
    const totalIn  = imports.reduce((s, t) => s + (t.totalCost || 0), 0);
    const totalOut = exports.reduce((s, t) => s + (t.totalCost || 0), 0);
    const topCountries = {};
    trades.forEach(t => { topCountries[t.country] = (topCountries[t.country] || 0) + 1; });
    const sortedCountries = Object.entries(topCountries).sort((a,b) => b[1]-a[1]).slice(0,5);
    return { total: trades.length, imports: imports.length, exports: exports.length,
             totalIn, totalOut, sortedCountries, recent: [...trades].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0,5) };
  }

  // ── Helpers ──────────────────────────────────────────────
  function _esc(s) { return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m])); }
  function _num(n) { return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function _fmtDate(d) { return d ? new Date(d).toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' }) : ''; }
  function _flag(country) {
    const c = country.trim().toLowerCase();
    const map = { kenya:'🇰🇪', nigeria:'🇳🇬', usa:'🇺🇸', 'united states':'🇺🇸', uk:'🇬🇧', 'united kingdom':'🇬🇧',
      china:'🇨🇳', india:'🇮🇳', germany:'🇩🇪', france:'🇫🇷', japan:'🇯🇵', 'south africa':'🇿🇦', ethiopia:'🇪🇹',
      ghana:'🇬🇭', tanzania:'🇹🇿', uganda:'🇺🇬', rwanda:'🇷🇼', 'uae':'🇦🇪', 'saudi arabia':'🇸🇦',
      canada:'🇨🇦', australia:'🇦🇺', brazil:'🇧🇷', mexico:'🇲🇽', singapore:'🇸🇬', malaysia:'🇲🇾',
      thailand:'🇹🇭', indonesia:'🇮🇩', turkey:'🇹🇷', egypt:'🇪🇬', morocco:'🇲🇦' };
    return map[c] || '🌍';
  }

  // ── Build form HTML (called from app.js) ─────────────────
  function buildFormHTML() {
    const currOpts  = CURRENCIES.map(c => `<option value="${c}">${c}</option>`).join('');
    const statOpts  = STATUSES.map(s => `<option value="${s}">${s}</option>`).join('');
    return `
    <input type="hidden" id="trade-id">
    <div class="form-group">
      <label class="form-label">Type *</label>
      <select id="trade-type" class="form-select">
        <option value="import">📥 Import</option>
        <option value="export">📤 Export</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Goods / Product Name *</label>
      <input id="trade-name" type="text" class="form-input" placeholder="e.g. Coffee Beans, Textiles…" required>
    </div>
    <div class="form-group">
      <label class="form-label">Country *</label>
      <input id="trade-country" type="text" class="form-input" placeholder="e.g. Kenya, China…" required>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Quantity *</label>
        <input id="trade-qty" type="number" class="form-input" placeholder="0" min="0" step="any" required>
      </div>
      <div class="form-group">
        <label class="form-label">Unit</label>
        <input id="trade-unit" type="text" class="form-input" placeholder="kg / pcs / tons…">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Unit Price *</label>
        <input id="trade-unit-price" type="number" class="form-input" placeholder="0.00" min="0" step="any" required>
      </div>
      <div class="form-group">
        <label class="form-label">Currency</label>
        <select id="trade-currency" class="form-select">${currOpts}</select>
      </div>
    </div>
    <div class="card card-sm mb-12" style="background:var(--bg-surface);">
      <div class="text-sm text-muted mb-4">Total Cost</div>
      <div class="stat-card-value" id="trade-total-display">0.00</div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Date</label>
        <input id="trade-date" type="date" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select id="trade-status" class="form-select">${statOpts}</select>
      </div>
    </div>
    
    <div class="form-group mb-16 p-12" style="background:var(--bg-surface); border: 1px solid var(--border); border-radius:var(--radius-md); padding: 12px;">
      <div class="flex justify-between items-center mb-8">
        <label class="form-label mb-0" style="margin-bottom:0">Receivers / Owners (Optional)</label>
        <button type="button" class="btn btn-ghost btn-sm" id="trade-add-owner">+ Add Person</button>
      </div>
      <div class="text-muted text-sm mb-8" style="font-size:0.75rem">Adding owners automatically calculates Total Quantity.</div>
      <div id="trade-owners-container" class="flex-col gap-8"></div>
    </div>

    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea id="trade-notes" class="form-textarea" placeholder="Additional details…"></textarea>
    </div>
    <button type="submit" class="btn btn-primary w-full">💾 Save Trade</button>`;
  }

  return { init, getStats, buildFormHTML };
})();

window.Trade = Trade;
