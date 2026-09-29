function getSetting(key) {
  // Temporary mock implementation. Later to be fetched from a DB settings collection or cache.
  const settings = {
    "SEAT_HOLD_DURATION": 15 * 60 * 1000, // 15 minutes in milliseconds
    "COMMISSION_RATE": 0.10, // 10%
  };
  return settings[key];
}

module.exports = {
  getSetting,
};
