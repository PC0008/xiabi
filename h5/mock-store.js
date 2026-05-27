(function () {
  const keys = {
    adminConfig: "xiabiAdminConfig",
    authed: "h5Authed",
    guest: "h5Guest",
    answers: "h5Answers",
    pendingLetter: "h5PendingLetter",
    phoneBound: "h5PhoneBound",
    annualActive: "h5AnnualActive",
    letter: "h5Letter",
    orders: "h5MockOrders",
    ledger: "h5MockLedger"
  };
  const adminAuthKey = "xiabiAdminAuthed";
  const apiBase = window.XIABI_API_BASE || "/api/public";

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readFlag(key) {
    return localStorage.getItem(key) === "1";
  }

  function writeFlag(key, value) {
    localStorage.setItem(key, value ? "1" : "0");
  }

  function getAdminConfig() {
    return readJson(keys.adminConfig, {});
  }

  function setAdminConfig(config) {
    writeJson(keys.adminConfig, config);
  }

  async function apiFetch(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error?.message || "请求失败");
    }
    return payload.data ?? payload;
  }

  function normalizeRemoteConfig(data) {
    return {
      homeConfig: data.homeConfig || data.home || {},
      pricing: data.pricing || {},
      guideStages: data.guideStages || [],
      templates: data.templates || [],
      system: data.system || {},
      versions: data.versions || {},
      updatedAt: new Date().toISOString()
    };
  }

  async function syncPublicConfig() {
    try {
      const config = normalizeRemoteConfig(await apiFetch("/config"));
      setAdminConfig(Object.assign({}, getAdminConfig(), config));
      window.dispatchEvent(new CustomEvent("xiabi:config-updated", { detail: config }));
      return config;
    } catch (error) {
      return getAdminConfig();
    }
  }

  async function adminLogin(username, password) {
    try {
      const data = await apiFetch("/admin/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      writeFlag(adminAuthKey, true);
      return data.admin || data;
    } catch (error) {
      if (username === "admin" && password === "ChangeMe123!") {
        writeFlag(adminAuthKey, true);
        return { username: "admin", displayName: "Owner", role: "owner", localFallback: true };
      }
      throw error;
    }
  }

  async function adminLogout() {
    try {
      await apiFetch("/admin/logout", { method: "POST" });
    } catch (error) {
      // Local static preview may not have the API server running.
    }
    localStorage.removeItem(adminAuthKey);
  }

  async function getAdminSession() {
    try {
      const data = await apiFetch("/admin/me");
      writeFlag(adminAuthKey, true);
      return data.admin || data;
    } catch (error) {
      return readFlag(adminAuthKey) ? { username: "admin", displayName: "Owner", role: "owner", localFallback: true } : null;
    }
  }

  async function syncAdminConfig() {
    try {
      const config = normalizeRemoteConfig(await apiFetch("/admin/config"));
      setAdminConfig(Object.assign({}, getAdminConfig(), config));
      return config;
    } catch (error) {
      return getAdminConfig();
    }
  }

  async function saveAdminConfig(config) {
    setAdminConfig(config);
    try {
      const remote = normalizeRemoteConfig(await apiFetch("/admin/config", {
        method: "PATCH",
        body: JSON.stringify({
          home: config.homeConfig || {},
          pricing: config.pricing || {},
          guideStages: config.guideStages || [],
          templates: config.templates || [],
          system: config.system || {}
        })
      }));
      setAdminConfig(Object.assign({}, config, remote));
      return remote;
    } catch (error) {
      return config;
    }
  }

  async function ensureGuestSession() {
    return apiFetch("/session/guest", { method: "POST" });
  }

  async function createGenerationTask(answers, input = {}) {
    await ensureGuestSession();
    return apiFetch("/tasks", {
      method: "POST",
      body: JSON.stringify({ answers, input })
    });
  }

  async function getLetter(letterId) {
    return apiFetch(`/letters/${letterId}`);
  }

  async function claimLetter(letterId) {
    return apiFetch(`/letters/${letterId}/claim`, { method: "POST" });
  }

  async function createOrder(order) {
    await ensureGuestSession();
    return apiFetch("/orders", {
      method: "POST",
      body: JSON.stringify(order)
    });
  }

  function getAppState() {
    return {
      authed: readFlag(keys.authed),
      guest: readFlag(keys.guest),
      answers: readJson(keys.answers, []),
      pendingLetter: readFlag(keys.pendingLetter),
      phoneBound: readFlag(keys.phoneBound),
      annualActive: readFlag(keys.annualActive),
      letter: readJson(keys.letter, null),
      mockOrders: readJson(keys.orders, []),
      mockLedger: readJson(keys.ledger, [])
    };
  }

  function persistAppState(state) {
    writeJson(keys.answers, state.answers || []);
    writeFlag(keys.pendingLetter, !!state.pendingLetter);
    writeFlag(keys.phoneBound, !!state.phoneBound);
    writeFlag(keys.annualActive, !!state.annualActive);
    if (state.letter) writeJson(keys.letter, state.letter);
    else localStorage.removeItem(keys.letter);
    writeJson(keys.orders, state.mockOrders || []);
    writeJson(keys.ledger, state.mockLedger || []);
  }

  function setAuthed(value) {
    writeFlag(keys.authed, value);
  }

  function setGuest(value) {
    writeFlag(keys.guest, value);
  }

  function clearGuest() {
    localStorage.removeItem(keys.guest);
  }

  function logout() {
    localStorage.removeItem(keys.authed);
    localStorage.removeItem(keys.guest);
  }

  function clearAppState() {
    [
      keys.authed,
      keys.guest,
      keys.answers,
      keys.pendingLetter,
      keys.phoneBound,
      keys.annualActive,
      keys.letter,
      keys.orders,
      keys.ledger
    ].forEach((key) => localStorage.removeItem(key));
  }

  window.XiabiMockStore = {
    getAdminConfig,
    setAdminConfig,
    syncPublicConfig,
    adminLogin,
    adminLogout,
    getAdminSession,
    syncAdminConfig,
    saveAdminConfig,
    ensureGuestSession,
    createGenerationTask,
    getLetter,
    claimLetter,
    createOrder,
    getAppState,
    persistAppState,
    setAuthed,
    setGuest,
    clearGuest,
    logout,
    clearAppState
  };
}());
