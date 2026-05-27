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
    getAppState,
    persistAppState,
    setAuthed,
    setGuest,
    clearGuest,
    logout,
    clearAppState
  };
}());
