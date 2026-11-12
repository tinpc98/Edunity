/**
 * Central System Clock Provider for Edunity V3 Financial Operations
 * Ensures absolute time integrity and prevents HTTP clients from manipulating business time.
 */

let testTime = null;

const clock = {
  /**
   * Returns current system time.
   * In production and staging, this ALWAYS returns real Date.now().
   * In test environment, returns injected test time if explicitly set by internal test harnesses.
   */
  getNow() {
    if (process.env.NODE_ENV === "test" && testTime) {
      return new Date(testTime);
    }
    return new Date();
  },

  /**
   * Injects fake time for in-process test assertions.
   * Strictly forbidden and rejected outside NODE_ENV=test.
   */
  setTestTime(time) {
    if (process.env.NODE_ENV !== "test" || process.env.EDUNITY_RUNNING_SERVER === "true") {
      throw new Error("P0 Security Violation: setTestTime is forbidden on running server or outside test environment");
    }
    testTime = time ? new Date(time) : null;
  },

  /**
   * Resets test time to real system clock.
   */
  clearTestTime() {
    testTime = null;
  },
};

module.exports = clock;

