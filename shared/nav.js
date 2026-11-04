// ── Háptica Staffing · barra de navegación por rol ──────────────────────────
// Requiere shared/auth.js cargado antes (usa HapticaAuth.VIEW_META / logout).
const HapticaNav = (() => {
  const VIEW_ORDER = ['time-report', 'staffing', 'dimensionamiento', 'reforecast', 'manual-edit', 'planeacion'];

  function initials(name) {
    return (name || '?').trim().split(/\s+/).map(p => p[0] || '').join('').toUpperCase().slice(0, 2);
  }

  function render(container, { persona, rol, allowedViews, currentView }) {
    if (typeof container === 'string') container = document.getElementById(container);
    if (!container) return;

    const links = [
      `<a class="hap-nav-link ${currentView === 'home' ? 'active' : ''}" href="index.html">Inicio</a>`,
      ...VIEW_ORDER
        .filter(v => (allowedViews || []).includes(v))
        .map(v => {
          const meta = HapticaAuth.VIEW_META[v];
          const badge = v === 'reforecast' ? '<span class="hap-nav-badge" id="hapNavBadge" style="display:none"></span>' : '';
          return `<a class="hap-nav-link ${currentView === v ? 'active' : ''}" href="${meta.href}">${meta.label}${badge}</a>`;
        }),
    ].join('');

    container.innerHTML = `
      <nav class="hap-nav">${links}</nav>
      <div class="hap-user-chip">
        <div class="hap-user-avatar">${initials(persona)}</div>
        <div class="hap-user-info">
          <span class="hap-user-name">${persona}</span>
        </div>
        <button class="hap-btn-logout" onclick="HapticaAuth.logout()" title="Cerrar sesión">Salir</button>
      </div>`;
    if ((allowedViews || []).includes('reforecast') && rol) refreshBadge(rol, false);
  }

  // ── Notificador: solicitudes de tiempo donde le toca responder al usuario ──
  const BADGE_CACHE_KEY = 'hapPendingReqCache';
  const BADGE_TTL_MS = 60 * 1000;

  function setBadge(count) {
    const el = document.getElementById('hapNavBadge');
    if (!el) return;
    el.textContent = count > 99 ? '99+' : String(count);
    el.style.display = count > 0 ? 'inline-flex' : 'none';
    el.title = count + ' solicitud(es) de tiempos esperan tu respuesta';
  }

  async function computePending(rol) {
    const ssid = HapticaAuth.SPREADSHEET_ID;
    const [cfg, sol] = await Promise.all([
      gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: ssid, range: 'Roles_Config' }),
      gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: ssid, range: 'Solicitudes_Tiempo' }),
    ]);
    const cr = cfg.result.values || [];
    if (cr.length < 2) return 0;
    const ch = cr[0].map(x => (x || '').trim().toLowerCase());
    const iRol = ch.indexOf('rol');
    const row = cr.slice(1).find(r => (r[iRol] || '').trim() === rol);
    if (!row) return 0;
    const sides = [];
    const iEq = ch.indexOf('solicitud de tiempos (equipos)');
    const iOps = ch.indexOf('solicitud de tiempos (ops)');
    if (iEq >= 0 && (row[iEq] || '').trim().toLowerCase() === 'si') sides.push('Equipos');
    if (iOps >= 0 && (row[iOps] || '').trim().toLowerCase() === 'si') sides.push('Ops');
    if (!sides.length) return 0;
    const sr = sol.result.values || [];
    if (sr.length < 2) return 0;
    const sh = sr[0].map(x => (x || '').trim().toLowerCase());
    const iP = sh.indexOf('proyecto'), iT = sh.indexOf('turno'), iL = sh.indexOf('proponelado'), iE = sh.indexOf('estado');
    const latest = {};
    sr.slice(1).forEach(r => {
      const p = r[iP] || '';
      if (!p) return;
      const t = Number(r[iT]) || 1;
      if (!latest[p] || t >= latest[p].t) latest[p] = { t, lado: r[iL] || '', estado: r[iE] || '' };
    });
    return Object.values(latest).filter(x => x.estado === 'Pendiente' && sides.includes(x.lado === 'Equipos' ? 'Ops' : 'Equipos')).length;
  }

  // force=true ignora el caché (p. ej. tras guardar una solicitud)
  async function refreshBadge(rol, force) {
    if (!document.getElementById('hapNavBadge')) return;
    try {
      if (!force) {
        const c = JSON.parse(sessionStorage.getItem(BADGE_CACHE_KEY) || 'null');
        if (c && c.rol === rol && Date.now() - c.t < BADGE_TTL_MS) { setBadge(c.n); return; }
      }
    } catch (e) {}
    try {
      const count = await computePending(rol);
      setBadge(count);
      try { sessionStorage.setItem(BADGE_CACHE_KEY, JSON.stringify({ rol, t: Date.now(), n: count })); } catch (e) {}
    } catch (e) { /* sin acceso a las hojas: sin insignia */ }
  }

  // Permite a una página que ya calculó el conteo fijarlo sin otra consulta
  function setPendingCount(rol, count) {
    setBadge(count);
    try { sessionStorage.setItem(BADGE_CACHE_KEY, JSON.stringify({ rol, t: Date.now(), n: count })); } catch (e) {}
  }

  return { render, refreshBadge, setPendingCount };
})();
