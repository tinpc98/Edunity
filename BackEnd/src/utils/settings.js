const platformSettingService = require("../services/platformSettingService");

/**
 * Synchronous accessor backed by PlatformSetting cache + zero-safe env fallback + defaults.
 * Preserves full backwards compatibility with sync callers across Enrollment, Payment, Scholarship, and Settlement.
 */
function getSetting(key, now = new Date()) {
  return platformSettingService.getEffectiveSettingSync(key, now);
}

module.exports = {
  getSetting,
  getEffectiveSetting: platformSettingService.getEffectiveSetting,
  refreshSettingsCache: platformSettingService.warmCache,
  clearSettingsCache: platformSettingService.clearCache,
};
