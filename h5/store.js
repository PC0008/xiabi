(function () {
  const keys = {
    adminConfig: "xiabiAdminConfig",
    authed: "h5Authed",
    guest: "h5Guest",
    answers: "h5Answers",
    answerItems: "h5AnswerItems",
    pendingLetter: "h5PendingLetter",
    letter: "h5Letter",
    productProfiles: "h5ProductProfiles",
    paymentIntent: "h5PaymentIntent",
    generationTaskId: "h5GenerationTaskId"
  };
  const legacyStateKeys = ["h5PhoneBound", "h5AnnualActive"];
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
      const error = new Error(payload.error?.message || "请求失败");
      error.code = payload.error?.code || "";
      error.status = response.status;
      error.payload = payload;
      throw error;
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
      capabilities: data.capabilities || {},
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

  async function getSession() {
    await ensureGuestSession();
    return apiFetch("/session/me");
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

  async function logoutSession() {
    return apiFetch("/session/logout", { method: "POST" });
  }

  async function createGenerationTask(answers, input = {}) {
    await ensureGuestSession();
    return apiFetch("/tasks", {
      method: "POST",
      body: JSON.stringify({ answers, input })
    });
  }

  async function getGenerationTask(taskId) {
    await ensureGuestSession();
    return apiFetch(`/tasks/${taskId}`);
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

  async function getOrderPaymentStatus(orderId) {
    await ensureGuestSession();
    return apiFetch(`/orders/${orderId}/payment-status`);
  }

  async function continueOrderPayment(orderId) {
    await ensureGuestSession();
    return apiFetch(`/orders/${orderId}/pay`, { method: "POST" });
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

  async function listProductProfiles() {
    await ensureGuestSession();
    return apiFetch("/profiles");
  }

  async function createProductProfile(profile) {
    await ensureGuestSession();
    return apiFetch("/profiles", {
      method: "POST",
      body: JSON.stringify(profile)
    });
  }

  async function updateProductProfile(profileId, profile) {
    await ensureGuestSession();
    return apiFetch(`/profiles/${profileId}`, {
      method: "PATCH",
      body: JSON.stringify(profile)
    });
  }

  async function deleteProductProfile(profileId) {
    await ensureGuestSession();
    return apiFetch(`/profiles/${profileId}`, { method: "DELETE" });
  }

  async function speak(text) {
    await ensureGuestSession();
    return apiFetch("/voice/speak", {
      method: "POST",
      body: JSON.stringify({ text })
    });
  }

  async function transcribeVoice(input) {
    await ensureGuestSession();
    return apiFetch("/voice/transcribe", {
      method: "POST",
      body: JSON.stringify(input)
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

  async function adminPatch(path, body = {}) {
    return apiFetch(`/admin${path}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
  }

  function getAppState() {
    return {
      authed: readFlag(keys.authed),
      guest: readFlag(keys.guest),
      answers: readJson(keys.answers, []),
      answerItems: readJson(keys.answerItems, []),
      pendingLetter: readFlag(keys.pendingLetter),
      letter: readJson(keys.letter, null),
      productProfiles: readJson(keys.productProfiles, []),
      paymentIntent: readJson(keys.paymentIntent, null),
      generationTaskId: localStorage.getItem(keys.generationTaskId) || ""
    };
  }

  function persistAppState(state) {
    writeJson(keys.answers, state.answers || []);
    writeJson(keys.answerItems, state.answerItems || []);
    writeFlag(keys.pendingLetter, !!state.pendingLetter);
    writeJson(keys.productProfiles, Array.isArray(state.productProfiles) ? state.productProfiles : []);
    if (state.paymentIntent) writeJson(keys.paymentIntent, state.paymentIntent);
    else localStorage.removeItem(keys.paymentIntent);
    if (state.generationTaskId) localStorage.setItem(keys.generationTaskId, state.generationTaskId);
    else localStorage.removeItem(keys.generationTaskId);
    if (state.letter) writeJson(keys.letter, state.letter);
    else localStorage.removeItem(keys.letter);
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

  async function logout() {
    let remoteCleared = true;
    let message = "";
    try {
      await logoutSession();
    } catch (error) {
      remoteCleared = false;
      message = error.message || "服务端会话清理失败";
    }
    localStorage.removeItem(keys.authed);
    localStorage.removeItem(keys.guest);
    return { remoteCleared, message };
  }

  async function clearAppState() {
    let remoteCleared = true;
    let message = "";
    try {
      await logoutSession();
    } catch (error) {
      remoteCleared = false;
      message = error.message || "服务端会话清理失败";
    }
    [
      keys.authed,
      keys.guest,
      keys.answers,
      keys.answerItems,
      keys.pendingLetter,
      keys.letter,
      keys.productProfiles,
      keys.paymentIntent,
      keys.generationTaskId,
      ...legacyStateKeys
    ].forEach((key) => localStorage.removeItem(key));
    return { remoteCleared, message };
  }

  const store = {
    getAdminConfig,
    setAdminConfig,
    syncPublicConfig,
    adminLogin,
    adminLogout,
    getAdminSession,
    syncAdminConfig,
    saveAdminConfig,
    ensureGuestSession,
    logoutSession,
    getSession,
    createGenerationTask,
    getGenerationTask,
    getLetter,
    listLetters,
    claimLetter,
    createOrder,
    listOrders,
    getOrderPaymentStatus,
    continueOrderPayment,
    getEntitlements,
    sendSmsCode,
    bindPhone,
    listProductProfiles,
    createProductProfile,
    updateProductProfile,
    deleteProductProfile,
    speak,
    transcribeVoice,
    exportLetter,
    submitFeedback,
    adminFetch,
    adminPost,
    adminPatch,
    getAppState,
    persistAppState,
    setAuthed,
    setGuest,
    clearGuest,
    logout,
    clearAppState
  };

  window.XiabiStore = store;
}());
