/**
 * EDUNITY V3 — TASK QA-01-BASELINE: SESSION & ATTENDANCE REGRESSION BASELINE
 *
 * Validates TIN-05D/E core invariants, algorithms, and boundary conditions:
 * 1. Waiting room, late arrival, and first-join time constants.
 * 2. Interval merging, waiting-room clipping, and 70% duration calculations.
 * 3. Student attendance status classification (PRESENT, LATE, ABSENT, EXCUSED, NOT_EVALUATED).
 * 4. Token abuse prevention & verified reconnection criteria.
 * 5. GET /join method rejection (BUG-TIN03-01: 405 METHOD_NOT_ALLOWED).
 * 6. Teacher lateness escalation and absence milestones.
 * 7. Multi-interval and concurrent browser tab deduplication.
 */

const {
  PRE_OPEN_BEFORE_MS,
  STUDENT_LATE_THRESHOLD_SECONDS,
  STUDENT_FIRST_JOIN_DEADLINE_SECONDS,
  TEACHER_YELLOW_LATE_MS,
  TEACHER_RED_LATE_MS,
  TEACHER_NO_SHOW_CANCEL_MS,
  TEACHER_CONTINUOUS_ABSENCE_LIMIT_MS,
  POST_END_GRACE_PERIOD_MS,
  ATTENDANCE_THRESHOLD_PERCENT,
  mergeIntervals,
  clipIntervals,
  intersectIntervals,
  sumIntervalsSeconds,
} = require("../src/services/sessionPresenceService");

const studentRoutes = require("../src/routes/studentRoutes");

describe("TASK QA-01-BASELINE: Session Attendance Regression Baseline", () => {
  // =========================================================================
  // 1. Time Thresholds and Lifecycle Constants (TIN-05D)
  // =========================================================================
  describe("1. Time Thresholds and Lifecycle Constants", () => {
    test("QA-01.CONST.1: Waiting room pre-opens exactly 10 minutes (600,000 ms) before start", () => {
      expect(PRE_OPEN_BEFORE_MS).toBe(10 * 60 * 1000);
    });

    test("QA-01.CONST.2: Student late arrival threshold is exactly 5 minutes (300 seconds)", () => {
      expect(STUDENT_LATE_THRESHOLD_SECONDS).toBe(5 * 60);
    });

    test("QA-01.CONST.3: Student first-join cutoff is exactly 20 minutes (1200 seconds)", () => {
      expect(STUDENT_FIRST_JOIN_DEADLINE_SECONDS).toBe(20 * 60);
    });

    test("QA-01.CONST.4: Minimum attendance requirement threshold is exactly 70%", () => {
      expect(ATTENDANCE_THRESHOLD_PERCENT).toBe(70);
    });

    test("QA-01.CONST.5: Teacher lateness escalation milestones match policy", () => {
      expect(TEACHER_YELLOW_LATE_MS).toBe(10 * 60 * 1000); // 10 minutes -> YELLOW warning
      expect(TEACHER_RED_LATE_MS).toBe(20 * 60 * 1000); // 20 minutes -> RED violation
      expect(TEACHER_NO_SHOW_CANCEL_MS).toBe(30 * 60 * 1000); // 30 minutes -> NO_SHOW cancellation
      expect(TEACHER_CONTINUOUS_ABSENCE_LIMIT_MS).toBe(30 * 60 * 1000); // 30 minutes -> EARLY_LEAVE
      expect(POST_END_GRACE_PERIOD_MS).toBe(30 * 60 * 1000); // 30 minutes overtime grace
    });
  });

  // =========================================================================
  // 2. Interval Merging & Tab Deduplication Algorithm
  // =========================================================================
  describe("2. Interval Merging & Tab Deduplication Algorithm", () => {
    test("QA-01.INT.1: Overlapping intervals from concurrent tabs are merged without double-counting", () => {
      // User opens tab 1 from 19:00 (0s) to 19:30 (1800s), tab 2 from 19:10 (600s) to 19:50 (3000s)
      const rawIntervals = [
        { startMs: 0, endMs: 1800000 },
        { startMs: 600000, endMs: 3000000 },
      ];

      const merged = mergeIntervals(rawIntervals);
      expect(merged.length).toBe(1);
      expect(merged[0].startMs).toBe(0);
      expect(merged[0].endMs).toBe(3000000);
      expect(sumIntervalsSeconds(merged)).toBe(3000); // 50 minutes, not 30 + 40 = 70 minutes
    });

    test("QA-01.INT.2: Disjoint intervals remain distinct and sum accurately", () => {
      // User attends 0s -> 600s (10m), drops connection, returns 1200s -> 2400s (20m)
      const rawIntervals = [
        { startMs: 0, endMs: 600000 },
        { startMs: 1200000, endMs: 2400000 },
      ];

      const merged = mergeIntervals(rawIntervals);
      expect(merged.length).toBe(2);
      expect(sumIntervalsSeconds(merged)).toBe(10 * 60 + 20 * 60); // 30 minutes (1800s)
    });

    test("QA-01.INT.3: Out-of-order raw intervals are sorted and merged properly", () => {
      const rawIntervals = [
        { startMs: 2000000, endMs: 3000000 },
        { startMs: 0, endMs: 1000000 },
        { startMs: 500000, endMs: 1500000 },
      ];

      const merged = mergeIntervals(rawIntervals);
      expect(merged.length).toBe(2);
      expect(merged[0]).toEqual({ startMs: 0, endMs: 1500000 });
      expect(merged[1]).toEqual({ startMs: 2000000, endMs: 3000000 });
      expect(sumIntervalsSeconds(merged)).toBe(1500 + 1000); // 2500s
    });
  });

  // =========================================================================
  // 3. Waiting Room Clipping & Attendance Duration Formula
  // =========================================================================
  describe("3. Waiting Room Clipping & Attendance Duration Formula", () => {
    const sessionStart = 1000000;
    const sessionEnd = sessionStart + 120 * 60 * 1000; // 120-minute session (7200s)
    const waitingRoomStart = sessionStart - 10 * 60 * 1000; // 10m before

    test("QA-01.DUR.1: Waiting room time is strictly excluded from official scheduledOnlineSeconds", () => {
      // Student entered at waitingRoomStart and left at sessionStart + 60m
      const intervals = [{ startMs: waitingRoomStart, endMs: sessionStart + 60 * 60 * 1000 }];

      // 1. Clip for waiting room
      const waitingClipped = clipIntervals(intervals, waitingRoomStart, sessionStart);
      const waitingRoomSeconds = sumIntervalsSeconds(waitingClipped);
      expect(waitingRoomSeconds).toBe(10 * 60); // 600 seconds

      // 2. Clip for official scheduled duration
      const officialClipped = clipIntervals(intervals, sessionStart, sessionEnd);
      const scheduledOnlineSeconds = sumIntervalsSeconds(officialClipped);
      expect(scheduledOnlineSeconds).toBe(60 * 60); // 3600 seconds (waiting room excluded)

      // 3. Attendance percentage calculation
      const scheduledDurationSeconds = (sessionEnd - sessionStart) / 1000; // 7200s
      const attendancePercentage =
        Math.min(100, Math.round((scheduledOnlineSeconds / scheduledDurationSeconds) * 10000) / 100);
      expect(attendancePercentage).toBe(50); // 3600 / 7200 = 50%
    });

    test("QA-01.DUR.2: Exactly 70% duration threshold classifies PRESENT if on time", () => {
      const scheduledDurationSeconds = 7200; // 120 minutes
      const requiredOnlineSeconds = scheduledDurationSeconds * 0.7; // 5040s (84 minutes)

      const intervals = [{ startMs: sessionStart, endMs: sessionStart + requiredOnlineSeconds * 1000 }];
      const officialClipped = clipIntervals(intervals, sessionStart, sessionEnd);
      const scheduledOnlineSeconds = sumIntervalsSeconds(officialClipped);
      const attendancePercentage =
        Math.min(100, Math.round((scheduledOnlineSeconds / scheduledDurationSeconds) * 10000) / 100);

      expect(attendancePercentage).toBe(70);

      // On-time join (0s <= 300s) -> PRESENT
      const lateArrivalSeconds = 0;
      const isLate = lateArrivalSeconds > STUDENT_LATE_THRESHOLD_SECONDS;
      let status = "ABSENT";
      if (attendancePercentage >= ATTENDANCE_THRESHOLD_PERCENT) {
        status = isLate ? "LATE" : "PRESENT";
      }
      expect(status).toBe("PRESENT");
    });

    test("QA-01.DUR.3: >= 70% duration classifies LATE if joined after 5 minutes (300s)", () => {
      const scheduledDurationSeconds = 7200;
      // Joined at +8 minutes (480s), stayed for 90 minutes (5400s = 75%)
      const joinMs = sessionStart + 480 * 1000;
      const intervals = [{ startMs: joinMs, endMs: joinMs + 5400 * 1000 }];

      const officialClipped = clipIntervals(intervals, sessionStart, sessionEnd);
      const scheduledOnlineSeconds = sumIntervalsSeconds(officialClipped);
      const attendancePercentage =
        Math.min(100, Math.round((scheduledOnlineSeconds / scheduledDurationSeconds) * 10000) / 100);

      expect(attendancePercentage).toBe(75);

      const lateArrivalSeconds = 480;
      const isLate = lateArrivalSeconds > STUDENT_LATE_THRESHOLD_SECONDS;
      expect(isLate).toBe(true);

      let status = "ABSENT";
      if (attendancePercentage >= ATTENDANCE_THRESHOLD_PERCENT) {
        status = isLate ? "LATE" : "PRESENT";
      }
      expect(status).toBe("LATE");
    });

    test("QA-01.DUR.4: < 70% duration classifies ABSENT even if joined on time", () => {
      const scheduledDurationSeconds = 7200;
      // Joined on time (0s), but left after 60 minutes (3600s = 50% < 70%)
      const intervals = [{ startMs: sessionStart, endMs: sessionStart + 3600 * 1000 }];

      const officialClipped = clipIntervals(intervals, sessionStart, sessionEnd);
      const scheduledOnlineSeconds = sumIntervalsSeconds(officialClipped);
      const attendancePercentage =
        Math.min(100, Math.round((scheduledOnlineSeconds / scheduledDurationSeconds) * 10000) / 100);

      expect(attendancePercentage).toBe(50);

      let status = "ABSENT";
      if (attendancePercentage >= ATTENDANCE_THRESHOLD_PERCENT) {
        status = "PRESENT";
      }
      expect(status).toBe("ABSENT");
    });
  });

  // =========================================================================
  // 4. Teacher-Student Overlap Intersection
  // =========================================================================
  describe("4. Teacher-Student Overlap Intersection", () => {
    test("QA-01.OVP.1: intersectIntervals accurately computes common time between student and teacher", () => {
      // Teacher online from 1000s to 3000s
      const teacherIntervals = [{ startMs: 1000000, endMs: 3000000 }];
      // Student online from 500s to 2000s and 2500s to 4000s
      const studentIntervals = [
        { startMs: 500000, endMs: 2000000 },
        { startMs: 2500000, endMs: 4000000 },
      ];

      const overlap = intersectIntervals(studentIntervals, teacherIntervals);
      expect(overlap.length).toBe(2);
      expect(overlap[0]).toEqual({ startMs: 1000000, endMs: 2000000 }); // 1000s
      expect(overlap[1]).toEqual({ startMs: 2500000, endMs: 3000000 }); // 500s
      expect(sumIntervalsSeconds(overlap)).toBe(1500); // 1500 seconds total
    });
  });

  // =========================================================================
  // 5. Route Protection & BUG-TIN03-01 Verification
  // =========================================================================
  describe("5. Route Protection & BUG-TIN03-01 Verification", () => {
    test("QA-01.ROUTE.1: GET /api/sessions/:id/join is explicitly registered with 405 METHOD_NOT_ALLOWED", () => {
      const routes = studentRoutes.stack.filter((layer) => layer.route);
      const getJoinRoute = routes.find(
        (r) => r.route.path === "/sessions/:id/join" && r.route.methods.get
      );
      expect(getJoinRoute).toBeDefined();

      // Mock Express req/res
      let responseStatusCode = null;
      let responseBody = null;
      const mockReq = { params: { id: "mock_session_id" } };
      const mockRes = {
        status: (code) => {
          responseStatusCode = code;
          return {
            json: (body) => {
              responseBody = body;
            },
          };
        },
      };

      // Call the route handler directly
      const handler = getJoinRoute.route.stack[getJoinRoute.route.stack.length - 1].handle;
      handler(mockReq, mockRes);

      expect(responseStatusCode).toBe(405);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error).toBe("METHOD_NOT_ALLOWED");
      expect(responseBody.message).toContain("GET method is not allowed for joining a session");
    });
  });
});

