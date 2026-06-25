/**
 * app.js — Bootstrap, routing, dashboard, global utilities
 */

const App = (() => {
  // ── Toast ────────────────────────────────────────────────
  function toast(msg, type = 'info') {
    const iconMap = { success: '✅', error: '❌', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${iconMap[type]||''}</span> ${msg}`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  // ── Navigation ───────────────────────────────────────────
  function navigate(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    const view = document.getElementById(`view-${viewId}`);
    const tab  = document.querySelector(`[data-view="${viewId}"]`);
    if (view) view.classList.add('active');
    if (tab)  tab.classList.add('active');
    window.scrollTo(0, 0);
  }

  // ── Dashboard ────────────────────────────────────────────
  function refreshDashboard() {
    const stats = Trade.getStats();
    _el('dash-total-trades').textContent = stats.total;
    _el('dash-total-imports').textContent = stats.imports;
    _el('dash-total-exports').textContent = stats.exports;

    // Hero value: net balance (exports - imports)
    const net = stats.totalOut - stats.totalIn;
    _el('dash-hero-value').textContent = (net >= 0 ? '+' : '') + 'USD ' + _num(Math.abs(net));
    _el('dash-hero-sub').textContent   = net >= 0 ? 'Net Export Balance' : 'Net Import Deficit';
    _el('dash-import-total').textContent = 'USD ' + _num(stats.totalIn);
    _el('dash-export-total').textContent = 'USD ' + _num(stats.totalOut);

    // Recent activity
    const actList = _el('dash-activity-list');
    if (!actList) return;
    if (!stats.recent.length) {
      actList.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div>
        <div class="empty-title">No activity yet</div>
        <div class="empty-sub">Start logging your trades</div></div>`;
      return;
    }
    actList.innerHTML = stats.recent.map(t => {
      const sign   = t.type === 'export' ? '+' : '-';
      const amtCls = t.type === 'export' ? 'amount-export' : 'amount-import';
      const icon   = t.type === 'import' ? '📥' : '📤';
      return `
      <div class="activity-item">
        <div class="activity-dot ${t.type}">${icon}</div>
        <div class="activity-body">
          <div class="activity-name">${_esc(t.name)}</div>
          <div class="activity-meta">${_flag(t.country)} ${_esc(t.country)} · ${_fmtDate(t.date)}</div>
        </div>
        <div class="activity-amount ${amtCls}">${sign}${t.currency} ${_num(t.totalCost)}</div>
      </div>`;
    }).join('');

    // Top countries
    const ctList = _el('dash-top-countries');
    if (ctList && stats.sortedCountries.length) {
      const max = stats.sortedCountries[0][1];
      ctList.innerHTML = stats.sortedCountries.map(([c, cnt]) => `
        <div class="mt-8">
          <div class="flex justify-between text-sm mb-4">
            <span>${_flag(c)} ${_esc(c)}</span>
            <span class="text-muted">${cnt} trade${cnt>1?'s':''}</span>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar-fill" style="width:${(cnt/max*100).toFixed(1)}%"></div>
          </div>
        </div>`).join('');
    }
  }

  // ── Register Service Worker ───────────────────────────────
  function _registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('[SW] registered'))
        .catch(err => console.warn('[SW] error', err));
    }
  }

  // ── PWA Install ───────────────────────────────────────────
  let deferredInstall = null;
  function _setupInstall() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredInstall = e;
      document.getElementById('install-banner')?.classList.add('show');
    });
    document.getElementById('install-btn')?.addEventListener('click', async () => {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      const { outcome } = await deferredInstall.userChoice;
      if (outcome === 'accepted') document.getElementById('install-banner')?.classList.remove('show');
      deferredInstall = null;
    });
    document.getElementById('install-dismiss')?.addEventListener('click', () => {
      document.getElementById('install-banner')?.classList.remove('show');
    });
    window.addEventListener('appinstalled', () => {
      document.getElementById('install-banner')?.classList.remove('show');
    });
  }

  // ── Notification Permission ───────────────────────────────
  function _requestNotifPerm() {
    if ('Notification' in window && Notification.permission === 'default') {
      setTimeout(() => Notification.requestPermission(), 2000);
    }
  }

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    _registerSW();
    _setupInstall();
    _requestNotifPerm();

    // Wire up nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab =>
      tab.addEventListener('click', () => navigate(tab.dataset.view))
    );

    // Init modules
    await DB.openDB();
    await Trade.init();
    await Reminders.init();
    await Notebook.init();
    await Cal.init();

    refreshDashboard();
    navigate('dashboard');
  }

  // ── Helpers ──────────────────────────────────────────────
  function _el(id) { return document.getElementById(id); }
  function _esc(s) { return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function _num(n) { return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function _fmtDate(d) { return d ? new Date(d).toLocaleDateString(undefined, { month:'short', day:'numeric' }) : ''; }
  function _flag(c) {
    const map = { kenya:'🇰🇪', nigeria:'🇳🇬', usa:'🇺🇸', 'united states':'🇺🇸', uk:'🇬🇧', 'united kingdom':'🇬🇧',
      china:'🇨🇳', india:'🇮🇳', germany:'🇩🇪', france:'🇫🇷', japan:'🇯🇵', 'south africa':'🇿🇦',
      ethiopia:'🇪🇹', ghana:'🇬🇭', tanzania:'🇹🇿', uganda:'🇺🇬', rwanda:'🇷🇼', uae:'🇦🇪', 'saudi arabia':'🇸🇦',
      canada:'🇨🇦', australia:'🇦🇺', brazil:'🇧🇷', mexico:'🇲🇽', singapore:'🇸🇬', malaysia:'🇲🇾',
      thailand:'🇹🇭', indonesia:'🇮🇩', turkey:'🇹🇷', egypt:'🇪🇬', morocco:'🇲🇦' };
    return map[(c||'').trim().toLowerCase()] || '🌍';
  }

  return { init, toast, navigate, refreshDashboard };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', App.init);
