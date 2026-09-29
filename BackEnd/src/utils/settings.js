function getSetting(key) {
  // Temporary mock implementation. Later to be fetched from a DB settings collection or cache.
  const holdMinutes = parseInt(process.env.SEAT_HOLD_MINUTES, 10) || 15;
  const commissionRate = parseFloat(process.env.COMMISSION_RATE) || 0.10;

  const settings = {
    "SEAT_HOLD_DURATION": holdMinutes * 60 * 1000,
    "COMMISSION_RATE": commissionRate,
  };
  return settings[key];
}

module.exports = {
  getSetting,
};
