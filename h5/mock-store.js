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
    const data = await apiFetch("/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    writeFlag(adminAuthKey, true);
    return data.admin || data;
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
      localStorage.removeItem(adminAuthKey);
      return null;
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

  async function listLetters() {
    return apiFetch("/letters");
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

  async function listOrders() {
    await ensureGuestSession();
    return apiFetch("/orders");
  }

  async function getEntitlements() {
    await ensureGuestSession();
    return apiFetch("/entitlements");
  }

  async function sendSmsCode(phone) {
    await ensureGuestSession();
    return apiFetch("/sms/send-code", {
      method: "POST",
      body: JSON.stringify({ phone })
    });
  }

  async function bindPhone(phone, code) {
    await ensureGuestSession();
    return apiFetch("/users/bind-phone", {
      method: "POST",
      body: JSON.stringify({ phone, code })
    });
  }

  async function speak(text) {
    await ensureGuestSession();
    return apiFetch("/voice/speak", {
      method: "POST",
      body: JSON.stringify({ text })
    });
  }

  async function exportLetter(letterId) {
    return apiFetch(`/exports/letters/${letterId}`, { method: "POST" });
  }

  async function submitFeedback(content, category = "用户反馈") {
    await ensureGuestSession();
    return apiFetch("/feedback", {
      method: "POST",
      body: JSON.stringify({ content, category })
    });
  }

  async function adminFetch(path) {
    return apiFetch(`/admin${path}`);
  }

  async function adminPost(path, body = {}) {
    return apiFetch(`/admin${path}`, {
      method: "POST",
      body: JSON.stringify(body)
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
    listLetters,
    claimLetter,
    createOrder,
    listOrders,
    getEntitlements,
    sendSmsCode,
    bindPhone,
    speak,
    exportLetter,
    submitFeedback,
    adminFetch,
    adminPost,
    getAppState,
    persistAppState,
    setAuthed,
    setGuest,
    clearGuest,
    logout,
    clearAppState
  };
}());
