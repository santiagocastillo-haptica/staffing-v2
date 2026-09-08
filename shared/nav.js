// ── Háptica Staffing · barra de navegación por rol ──────────────────────────
// Requiere shared/auth.js cargado antes (usa HapticaAuth.VIEW_META / logout).
const HapticaNav = (() => {
  const VIEW_ORDER = ['time-report', 'staffing', 'dimensionamiento', 'reforecast', 'manual-edit'];

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
          return `<a class="hap-nav-link ${currentView === v ? 'active' : ''}" href="${meta.href}">${meta.label}</a>`;
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
  }

  return { render };
})();
