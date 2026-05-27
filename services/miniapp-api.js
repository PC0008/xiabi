const mockConfig = require("../mock/miniapp-config");

const ok = (data) => ({
  success: true,
  data,
  error: null,
  request_id: `mock_${Date.now()}`
});

const fail = (code, message) => ({
  success: false,
  data: null,
  error: { code, message },
  request_id: `mock_${Date.now()}`
});

const getMiniappConfig = async () => {
  // Mock adapter for the future miniappApi.config.getMiniappConfig cloud function.
  if (!mockConfig.homePage) {
    return fail("CONFIG_NOT_FOUND", "首页配置不存在");
  }

  return ok({
    home_page: mockConfig.homePage,
    switches: mockConfig.switches
  });
};

module.exports = {
  config: {
    getMiniappConfig
  }
};
