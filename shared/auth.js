// ── Háptica Staffing · autenticación y control de acceso por rol ───────────
// Requiere que shared/staffing-utils.js esté cargado antes (usa SHEET_ROLES,
// SPREADSHEET_ID lo expone este módulo).
const HapticaAuth = (() => {
  const CLIENT_ID      = '662265278503-9lnnh14m6gle9aus0tuvhv3n556tu99j.apps.googleusercontent.com';
  const SPREADSHEET_ID = '1ci6FWu6IiLQOOiuYtwR9LVM4YH5GTwC_jG3_FSBK1LE';
  const SCOPES          = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email';

  const TOKEN_KEY  = 'haptica_token';
  const EXPIRY_KEY = 'haptica_token_expiry';

  // Respaldo por si la pestaña Roles_Config no existe todavía o no tiene el rol
  // — la fuente de verdad real vive en el Sheet (ver fetchRoleViewsConfig) para
  // que se puedan crear roles nuevos sin tocar código.
  const ROLE_VIEWS = {
    DirEst:    ['time-report', 'staffing'],
    LidEst:    ['time-report', 'staffing'],
    ConsVis:   ['time-report', 'staffing'],
    PS:        ['time-report', 'staffing'],
    DirEstCom: ['time-report', 'staffing', 'dimensionamiento'],
    Com:       ['time-report', 'staffing', 'dimensionamiento'],
    CEO:       ['time-report', 'staffing', 'dimensionamiento'],
    GerEjec:   ['time-report', 'staffing', 'dimensionamiento', 'manual-edit'],
    DirOps:    ['time-report', 'staffing', 'dimensionamiento', 'manual-edit'],
  };

  const VIEW_META = {
    'time-report':      { label: 'Registro de Horas',        href: 'time-report.html' },
    'staffing':         { label: 'Staffing del Equipo',       href: 'staffing-matrix.html' },
    'dimensionamiento': { label: 'Dimensionamiento de Venta', href: 'dimensionamiento-venta.html' },
    'manual-edit':      { label: 'Editar Presupuesto',        href: 'presupuesto.html' },
    'reforecast':       { label: 'Solicitud de Tiempos',      href: 'reforecast.html' },
  };

  // Encabezados que puede usar la pestaña Roles_Config (columna "Rol" + una por vista).
  // Las dos columnas de "Solicitud de tiempos" comparten la misma vista — la
  // página decide internamente si actúas como Equipos u Ops.
  const HEADER_TO_VIEW = {
    'registro de horas':                 'time-report',
    'staffing del equipo':               'staffing',
    'dimensionamiento de venta':         'dimensionamiento',
    'editar presupuesto':                'manual-edit',
    'solicitud de tiempos (equipos)':    'reforecast',
    'solicitud de tiempos (ops)':        'reforecast',
  };

  let gapiReady   = false;
  let tokenClient = null;
  let opts        = null;
  let session     = null;

  function $(id) { return document.getElementById(id); }

  function checkingOverlay() {
    let el = document.getElementById('hapCheckingOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hapCheckingOverlay';
      el.style.cssText = 'min-height:60vh;display:flex;align-items:center;justify-content:center;';
      el.innerHTML = '<div class="state-msg"><div class="spinner"></div>Verificando tu sesión…</div>';
      document.body.appendChild(el);
    }
    return el;
  }

  function hideChecking() {
    const el = document.getElementById('hapCheckingOverlay');
    if (el) el.style.display = 'none';
  }

  // Se muestra mientras validamos un token ya guardado en sessionStorage,
  // para no parpadear la pantalla de "Acceso restringido" al navegar entre vistas.
  function showChecking() {
    const login = $(opts.loginContainerId);
    const app   = $(opts.appContainerId);
    if (login) login.style.display = 'none';
    if (app)   app.style.display = 'none';
    checkingOverlay().style.display = 'flex';
  }

  function showLogin() {
    hideChecking();
    const login = $(opts.loginContainerId);
    const app   = $(opts.appContainerId);
    if (login) login.style.display = '';
    if (app)   app.style.display = 'none';
  }

  function showApp() {
    hideChecking();
    const login = $(opts.loginContainerId);
    const app   = $(opts.appContainerId);
    if (login) login.style.display = 'none';
    if (app)   app.style.display = 'block';
  }

  function showDenied(message) {
    hideChecking();
    const login = $(opts.loginContainerId);
    const app   = $(opts.appContainerId);
    if (app)   app.style.display = 'none';
    if (login) login.style.display = '';
    const el = $('accessDenied');
    if (el) { el.innerHTML = message; el.style.display = 'block'; }
    const btn = $('btnLogin');
    if (btn) btn.style.display = 'none';
  }

  function persistToken(accessToken, expiresInSec) {
    sessionStorage.setItem(TOKEN_KEY, accessToken);
    sessionStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresInSec * 1000 - 60000));
  }

  function storedToken() {
    const token  = sessionStorage.getItem(TOKEN_KEY);
    const expiry = Number(sessionStorage.getItem(EXPIRY_KEY) || 0);
    return (token && Date.now() < expiry) ? token : null;
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
  }

  function maybeEnableLogin() {
    const btn = $('btnLogin');
    if (btn && gapiReady && tokenClient) btn.disabled = false;
  }

  function gapiLoaded() {
    gapi.load('client', async () => {
      await gapi.client.load('https://sheets.googleapis.com/$discovery/rest?version=v4');
      gapiReady = true;
      maybeEnableLogin();
      const existing = storedToken();
      if (existing) {
        gapi.client.setToken({ access_token: existing });
        resolveSession(existing);
      }
    });
  }

  function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPES,
      callback: handleToken,
    });
    maybeEnableLogin();
  }

  function handleToken(resp) {
    if (resp.error) return;
    persistToken(resp.access_token, Number(resp.expires_in || 3600));
    gapi.client.setToken({ access_token: resp.access_token });
    resolveSession(resp.access_token);
  }

  async function lookupRole(email) {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID, range: SHEET_ROLES,
    });
    const rows = res.result.values || [];
    if (rows.length < 2) return null;
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const iPersona = headers.indexOf('persona');
    const iRol     = headers.indexOf('rol');
    const iCorreo  = headers.indexOf('correo');
    for (const row of rows.slice(1)) {
      const correo = (row[iCorreo] || '').trim().toLowerCase();
      if (correo === email) {
        return { persona: normalizaColaborador((row[iPersona] || '').trim()), rol: (row[iRol] || '').trim() };
      }
    }
    return null;
  }

  // Lee qué vistas tiene cada rol desde la pestaña Roles_Config del Sheet —
  // así se pueden crear roles nuevos (o cambiar los permisos de uno existente)
  // editando el Sheet, sin tocar código. Si la pestaña no existe todavía o el
  // rol no aparece ahí, resolveSession cae de vuelta al mapa ROLE_VIEWS fijo.
  async function fetchRoleViewsConfig() {
    try {
      const res = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID, range: SHEET_ROLE_CONFIG,
      });
      const rows = res.result.values || [];
      if (rows.length < 2) return {};
      const headers = rows[0].map(h => h.trim().toLowerCase());
      const iRol = headers.indexOf('rol');
      if (iRol === -1) return {};
      const map = {};
      rows.slice(1).forEach(row => {
        const rol = (row[iRol] || '').trim();
        if (!rol) return;
        const views = [];
        headers.forEach((h, i) => {
          if (i === iRol) return;
          const viewId = HEADER_TO_VIEW[h];
          const val = (row[i] || '').trim().toLowerCase();
          if (viewId && val && val !== 'no') views.push(viewId);
        });
        map[rol] = [...new Set(views)]; // ej. Equipos+Ops ambos "SI" no debe duplicar 'reforecast'
      });
      return map;
    } catch (e) {
      return {}; // pestaña opcional — sin ella se usa el respaldo ROLE_VIEWS
    }
  }

  async function resolveSession(accessToken) {
    try {
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const info = await infoRes.json();
      const email = (info.email || '').toLowerCase();
      if (!email) { clearToken(); showLogin(); return; }

      const roleRow = await lookupRole(email);
      if (!roleRow || !roleRow.rol) {
        clearToken();
        showDenied(`⛔ Tu correo (<strong>${email}</strong>) no está registrado en Háptica Staffing.<br>Contacta a GerEjec o DirOps para que te agreguen en <em>Roles_Usuarios</em>.`);
        return;
      }

      const roleViewsConfig = await fetchRoleViewsConfig();
      const allowedViews = roleViewsConfig[roleRow.rol] || ROLE_VIEWS[roleRow.rol] || [];
      if (opts.requiredView && !allowedViews.includes(opts.requiredView)) {
        const fallback = allowedViews[0];
        const link = fallback
          ? `<br><a href="${VIEW_META[fallback].href}">Ir a ${VIEW_META[fallback].label} →</a>`
          : '';
        showDenied(`⛔ Tu rol (<strong>${roleRow.rol}</strong>) no tiene acceso a esta vista.${link}`);
        return;
      }

      session = { email, persona: roleRow.persona, rol: roleRow.rol, allowedViews, accessToken };
      showApp();
      if (typeof opts.onReady === 'function') opts.onReady(session);
    } catch (err) {
      console.error(err);
      clearToken();
      if (isAuthError(err)) {
        // Token vencido o revocado: no es un error real, solo hay que volver a loguearse.
        showLogin();
      } else {
        showDenied(`⚠️ Error validando tu sesión: ${extractErrorMessage(err)}`);
      }
    }
  }

  function isAuthError(err) {
    // Solo 401 (token vencido/revocado). Un 403 puede ser falta de permisos reales
    // sobre el Sheet, y ese caso sí debe mostrarse como error, no ocultarse.
    const code = (err && err.status) || (err && err.result && err.result.error && err.result.error.code);
    return code === 401;
  }

  function extractErrorMessage(err) {
    // Los errores de gapi vienen como { result: { error: { message } } }, no como Error estándar.
    return (err && err.result && err.result.error && err.result.error.message)
      || (err && err.message)
      || 'Error desconocido';
  }

  function logout() {
    const token = storedToken();
    clearToken();
    if (token && window.google && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(token, () => location.reload());
    } else {
      location.reload();
    }
  }

  function loadScripts() {
    const g = document.createElement('script');
    g.src = 'https://apis.google.com/js/api.js'; g.onload = gapiLoaded;
    document.head.appendChild(g);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.onload = gisLoaded;
    document.head.appendChild(s);
  }

  function init(userOpts) {
    opts = Object.assign({
      requiredView: null,
      loginContainerId: 'loginScreen',
      appContainerId: 'app',
      onReady: null,
    }, userOpts);

    if (storedToken()) {
      showChecking();
    } else {
      showLogin();
    }
    const btn = $('btnLogin');
    if (btn) {
      btn.disabled = true;
      btn.addEventListener('click', () => {
        if (!gapiReady || !tokenClient) return;
        tokenClient.requestAccessToken({ prompt: '' });
      });
    }
    loadScripts();
  }

  return {
    init, logout,
    ROLE_VIEWS, VIEW_META, SPREADSHEET_ID,
    get session() { return session; },
  };
})();
