const { EventEmitter } = require("events");
const mongoose = require("mongoose");
const app = require("../src/app");
const Session = require("../src/models/Session");
const Class = require("../src/models/Class");
const User = require("../src/models/User");
const TeacherScheduleLock = require("../src/models/TeacherScheduleLock");
const ScheduleIdempotencyKey = require("../src/models/ScheduleIdempotencyKey");
const sessionService = require("../src/services/sessionService");
const teacherClassService = require("../src/services/teacherClassService");
const { parseDateTimeInZone, computePlannedOccurrences } = require("../src/utils/timezone");

const invokeApp = ({ method = "GET", url, headers = {}, body = {}, nodeEnv = "test" }) =>
  new Promise((resolve) => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = nodeEnv;
    const normalizedHeaders = {};
    for (const [k, v] of Object.entries(headers)) normalizedHeaders[k.toLowerCase()] = v;

    const req = Object.assign(new EventEmitter(), { method, url, headers: normalizedHeaders, _body: true, body });
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      headers: {},
      setHeader(k, v) {
        this.headers[k.toLowerCase()] = v;
      },
      getHeader(k) {
        return this.headers[k.toLowerCase()];
      },
      removeHeader(k) {
        delete this.headers[k.toLowerCase()];
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        process.env.NODE_ENV = prevEnv;
        resolve({ status: this.statusCode, body: payload, headers: this.headers });
        return this;
      },
      end(data) {
        if (data !== undefined && !this.body) this.body = data;
        process.env.NODE_ENV = prevEnv;
        resolve({ status: this.statusCode, body: this.body, headers: this.headers });
      },
    });
    app(req, res, () => {
      process.env.NODE_ENV = prevEnv;
      resolve({ status: 404, body: { success: false, error: "NOT_FOUND" } });
    });
  });

const mockQuery = (result) => {
  const q = {
    sort: () => q,
    select: () => q,
    skip: () => q,
    limit: () => q,
    session: () => q,
    lean: async () => (result && typeof result.toObject === "function" ? result.toObject() : result),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected) => Promise.resolve(result).catch(onRejected),
  };
  return q;
};

describe("TASK CUR-11: Timezone Normalization, Transactional Collision & Session Generation Suite", () => {
  const teacherId = new mongoose.Types.ObjectId();
  const classId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // 1. Timezone & Wall-Clock -> UTC Normalization (Asia/Ho_Chi_Minh)
  // =========================================================================
  describe("1. Asia/Ho_Chi_Minh <-> UTC Normalization", () => {
    test("CUR-11.TZ.1: Interprets naive ISO datetimes as Asia/Ho_Chi_Minh -> UTC regardless of host OS TZ", () => {
      const prevTz = process.env.TZ;
      try {
        for (const hostTz of ["UTC", "America/New_York", "Asia/Tokyo"]) {
          process.env.TZ = hostTz;
          const naive = parseDateTimeInZone("2027-03-15T19:00:00", "startDatetime");
          expect(naive.toISOString()).toBe("2027-03-15T12:00:00.000Z");

          const explicitOffset = parseDateTimeInZone("2027-03-15T19:00:00+07:00", "startDatetime");
          expect(explicitOffset.toISOString()).toBe("2027-03-15T12:00:00.000Z");

          const explicitUtc = parseDateTimeInZone("2027-03-15T12:00:00.000Z", "startDatetime");
          expect(explicitUtc.toISOString()).toBe("2027-03-15T12:00:00.000Z");
        }
      } finally {
        if (prevTz === undefined) delete process.env.TZ;
        else process.env.TZ = prevTz;
      }
    });

    test("CUR-11.TZ.2: Rejects impossible calendar dates (Feb 30) and unsupported IANA timezone", () => {
      expect(() => parseDateTimeInZone("2027-02-30T10:00:00", "startDatetime")).toThrow("calendar date");
      expect(() => parseDateTimeInZone("2027-03-15T10:00:00", "startDatetime", "Mars/Olympus")).toThrow("Unsupported timezone");
    });

    test("CUR-11.TZ.3: computePlannedOccurrences respects afternoon startDate cutoff and inclusive endDate calendar day in VN", () => {
      // 2027-03-02 is Tuesday (dayOfWeek = 2)
      const cls = {
        startDate: new Date("2027-03-02T07:00:00.000Z"), // 14:00+07:00 VN
        endDate: new Date("2027-03-09T12:00:00.000Z"), // 19:00+07:00 VN on Tue Mar 9
        schedule: [{ dayOfWeek: 2, startTime: "09:00", endTime: "11:00" }],
      };
      const occurrences = computePlannedOccurrences(cls);
      // Must skip Mar 2 09:00 VN (since startDate is Mar 2 14:00 VN) and include Mar 9 09:00 VN -> 02:00 UTC!
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0].startDatetime.toISOString()).toBe("2027-03-09T02:00:00.000Z");
      expect(occurrences[0].endDatetime.toISOString()).toBe("2027-03-09T04:00:00.000Z");
    });
  });

  // =========================================================================
  // 2. Transactional Schedule Generation, Write Lock & Idempotency
  // =========================================================================
  describe("2. Transactional Generate / Create Sessions, Retry Idempotency & Rollback", () => {
    const setupTxMocks = (clsDoc, { maxNum = null, existingSessions = [], idempotencyDoc = null } = {}) => {
      jest.spyOn(User, "findById").mockReturnValue(
        mockQuery({
          _id: teacherId,
          role: "TEACHER",
          status: "ACTIVE",
          teacherProfile: { fullName: "Teacher", verificationStatus: "VERIFIED" },
        })
      );
      jest.spyOn(Class, "findOne").mockReturnValue(mockQuery(clsDoc));
      const lockUpsertSpy = jest.spyOn(TeacherScheduleLock, "updateOne").mockResolvedValue({ acknowledged: true });
      const lockIncSpy = jest
        .spyOn(TeacherScheduleLock, "findOneAndUpdate")
        .mockResolvedValue({ _id: new mongoose.Types.ObjectId(), teacherId, lockSeq: 1 });
      const txSession = {
        withTransaction: jest.fn(async (cb) => cb()),
        endSession: jest.fn(),
      };
      jest.spyOn(mongoose, "startSession").mockResolvedValue(txSession);

      jest.spyOn(ScheduleIdempotencyKey, "findOne").mockReturnValue(mockQuery(idempotencyDoc));
      const idemCreateSpy = jest.spyOn(ScheduleIdempotencyKey, "create").mockResolvedValue([{}]);

      // Distinguish getNextSessionNumber (Session.findOne) vs overlap check / idempotency replay (Session.find)
      jest.spyOn(Session, "findOne").mockReturnValue(mockQuery(maxNum ? { sessionNumber: maxNum } : null));
      jest.spyOn(Session, "find").mockReturnValue(mockQuery(existingSessions));
      const insertSpy = jest.spyOn(Session, "insertMany").mockImplementation(async (docs) =>
        docs.map((d) => ({ ...d, _id: new mongoose.Types.ObjectId(), toObject: () => ({ ...d }) }))
      );

      return { lockUpsertSpy, lockIncSpy, txSession, idemCreateSpy, insertSpy };
    };

    const futureClass = {
      _id: classId,
      teacherId,
      className: "IELTS 7.0",
      status: "DRAFT",
      startDate: new Date("2028-01-03T17:00:00.000Z"), // 2028-01-04 00:00+07 (Tue Jan 4 is Tuesday: 2028-01-04!)
      endDate: new Date("2028-01-11T16:59:00.000Z"), // 2028-01-11 23:59+07 (Tue Jan 11)
      schedule: [{ dayOfWeek: 2, startTime: "19:00", endTime: "21:00" }],
    };

    test("CUR-11.TX.1: generateSessionsFromSchedule converts VN slots to UTC, acquires teacher write lock, assigns sequential sessionNumbers", async () => {
      const { lockUpsertSpy, lockIncSpy, insertSpy, txSession } = setupTxMocks(futureClass, { maxNum: 2 });

      const result = await sessionService.generateSessionsFromSchedule(teacherId, classId.toString(), {
        titlePrefix: "IELTS Module",
      });

      expect(lockUpsertSpy).toHaveBeenCalledTimes(1);
      expect(txSession.withTransaction).toHaveBeenCalledTimes(1);
      expect(lockIncSpy).toHaveBeenCalledWith(
        { teacherId },
        expect.objectContaining({ $inc: { lockSeq: 1 } }),
        expect.objectContaining({ session: txSession })
      );
      expect(insertSpy).toHaveBeenCalledTimes(1);
      const inserted = insertSpy.mock.calls[0][0];
      expect(inserted).toHaveLength(2);
      expect(inserted[0].sessionNumber).toBe(3);
      expect(inserted[1].sessionNumber).toBe(4);
      expect(inserted[0].scheduleSource).toBe("SCHEDULE_GENERATED");
      expect(inserted[0].startDatetime.toISOString()).toBe("2028-01-04T12:00:00.000Z"); // 19:00 VN
      expect(result.generatedCount).toBe(2);
      expect(result.idempotent).toBe(false);
    });

    test("CUR-11.TX.2: Overlap with another session of same Teacher aborts before insertMany with 409 SESSION_TIME_CONFLICT", async () => {
      const { insertSpy } = setupTxMocks(futureClass, {
        existingSessions: [
          {
            title: "Lớp B - Buổi 1",
            className: "Lớp B",
            startDatetime: new Date("2028-01-11T12:30:00.000Z"), // Overlaps Jan 11 12:00-14:00Z!
            endDatetime: new Date("2028-01-11T14:30:00.000Z"),
          },
        ],
      });

      await expect(
        sessionService.generateSessionsFromSchedule(teacherId, classId.toString(), {})
      ).rejects.toMatchObject({ code: "SESSION_TIME_CONFLICT", statusCode: 409 });

      expect(insertSpy).not.toHaveBeenCalled();
    });

    test("CUR-11.TX.3: Idempotency-Key replay returns stored sessions cleanly without re-inserting; payload mismatch returns 409", async () => {
      const savedIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
      const replayedDocs = savedIds.map((id, idx) => ({ _id: id, sessionNumber: idx + 1, title: `Buổi ${idx + 1}` }));

      const { insertSpy } = setupTxMocks(futureClass, {
        existingSessions: replayedDocs,
      });

      // Override ScheduleIdempotencyKey.findOne to compute matching hash via first call capture
      const storedKeys = new Map();
      ScheduleIdempotencyKey.findOne.mockImplementation(({ idempotencyKey }) => mockQuery(storedKeys.get(idempotencyKey) || null));
      ScheduleIdempotencyKey.create.mockImplementationOnce(async ([doc]) => {
        storedKeys.set(doc.idempotencyKey, { ...doc });
        return [doc];
      });
      Session.find.mockImplementation((filter) => {
        if (filter && filter._id && filter._id.$in) return mockQuery(replayedDocs);
        return mockQuery([]); // overlap query
      });

      const first = await sessionService.generateSessionsFromSchedule(
        teacherId,
        classId.toString(),
        { titlePrefix: "Buổi" },
        { idempotencyKey: "gen-key-1" }
      );
      expect(first.idempotent).toBe(false);
      expect(insertSpy).toHaveBeenCalledTimes(1);

      // Replay exact same request + Idempotency-Key
      const replay = await sessionService.generateSessionsFromSchedule(
        teacherId,
        classId.toString(),
        { titlePrefix: "Buổi" },
        { idempotencyKey: "gen-key-1" }
      );
      expect(replay.idempotent).toBe(true);
      expect(replay.sessions).toHaveLength(2);
      expect(insertSpy).toHaveBeenCalledTimes(1); // Still 1!

      // Reuse same Idempotency-Key with different payload -> 409 IDEMPOTENCY_KEY_CONFLICT
      await expect(
        sessionService.generateSessionsFromSchedule(
          teacherId,
          classId.toString(),
          { titlePrefix: "Different Title" },
          { idempotencyKey: "gen-key-1" }
        )
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT", statusCode: 409 });
    });

    test("CUR-11.TX.4: Blocks generateSessions on OPEN/IN_PROGRESS class with 409 RESCHEDULE_REQUIRED", async () => {
      setupTxMocks({ ...futureClass, status: "OPEN" });
      await expect(
        sessionService.generateSessionsFromSchedule(teacherId, classId.toString(), {})
      ).rejects.toMatchObject({ code: "RESCHEDULE_REQUIRED", statusCode: 409 });
    });

    test("CUR-11.TX.5: createSessions parses naive VN times and forwards Idempotency-Key + sessions/generate via Express route", async () => {
      const { insertSpy } = setupTxMocks(futureClass);

      const created = await sessionService.createSessions(teacherId, classId.toString(), {
        title: "Buổi Naive VN",
        startDatetime: "2028-01-05T19:00:00",
        endDatetime: "2028-01-05T21:00:00",
      });
      expect(created.startDatetime.toISOString()).toBe("2028-01-05T12:00:00.000Z");
      expect(insertSpy).toHaveBeenCalledTimes(1);

      // Verify HTTP route /teacher/classes/:classId/sessions/generate
      const res = await invokeApp({
        method: "POST",
        url: `/api/teacher/classes/${classId}/sessions/generate`,
        headers: { "x-user-id": teacherId.toString(), "idempotency-key": "http-gen-1" },
        body: { titlePrefix: "HTTP Session" },
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.generatedCount).toBe(2);
    });

    test("CUR-11.TX.6: createSessions single-mode Idempotency-Key replay & conflict; updateSession acquires lock on schedule change", async () => {
      const singleId = new mongoose.Types.ObjectId();
      const sessionId = new mongoose.Types.ObjectId();
      const singleDoc = {
        _id: singleId,
        classId,
        teacherId,
        title: "Manual Single",
        sessionNumber: 1,
        startDatetime: new Date("2028-01-05T12:00:00.000Z"),
        endDatetime: new Date("2028-01-05T14:00:00.000Z"),
      };

      const { insertSpy } = setupTxMocks(futureClass, { existingSessions: [] });
      const storedKeys = new Map();
      ScheduleIdempotencyKey.findOne.mockImplementation(({ idempotencyKey }) => mockQuery(storedKeys.get(idempotencyKey) || null));
      ScheduleIdempotencyKey.create.mockImplementationOnce(async ([doc]) => {
        storedKeys.set(doc.idempotencyKey, { ...doc });
        return [doc];
      });
      Session.insertMany.mockResolvedValueOnce([{ ...singleDoc, toObject: () => ({ ...singleDoc }) }]);
      Session.find.mockImplementation((filter) => {
        if (filter && filter._id && filter._id.$in) return mockQuery([singleDoc]);
        return mockQuery([]);
      });

      const first = await sessionService.createSessions(
        teacherId,
        classId.toString(),
        { title: "Manual Single", startDatetime: "2028-01-05T19:00:00", endDatetime: "2028-01-05T21:00:00" },
        { idempotencyKey: "single-1" }
      );
      expect(first._id).toBe(singleId);
      expect(insertSpy).toHaveBeenCalledTimes(1);

      const replay = await sessionService.createSessions(
        teacherId,
        classId.toString(),
        { title: "Manual Single", startDatetime: "2028-01-05T19:00:00", endDatetime: "2028-01-05T21:00:00" },
        { idempotencyKey: "single-1" }
      );
      expect(replay._id).toBe(singleId);
      expect(insertSpy).toHaveBeenCalledTimes(1);

      await expect(
        sessionService.createSessions(
          teacherId,
          classId.toString(),
          { title: "Modified Title", startDatetime: "2028-01-05T19:00:00", endDatetime: "2028-01-05T21:00:00" },
          { idempotencyKey: "single-1" }
        )
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT", statusCode: 409 });

      // updateSession title-only edit on OPEN class allowed without lock
      const openSessionDoc = {
        _id: sessionId,
        classId,
        teacherId,
        title: "Old",
        status: "SCHEDULED",
        save: jest.fn().mockResolvedValue(true),
        toObject() {
          return { _id: this._id, title: this.title, status: this.status };
        },
      };
      jest.spyOn(Session, "findById").mockReturnValue(mockQuery(openSessionDoc));
      jest.spyOn(Class, "findOne").mockReturnValue(mockQuery({ ...futureClass, status: "OPEN" }));
      const titleRes = await sessionService.updateSession(teacherId, sessionId.toString(), { title: "Updated Title" });
      expect(titleRes.title).toBe("Updated Title");

      // updateSession schedule edit on OPEN class -> RESCHEDULE_REQUIRED
      await expect(
        sessionService.updateSession(teacherId, sessionId.toString(), {
          startDatetime: "2028-01-06T19:00:00",
          endDatetime: "2028-01-06T21:00:00",
        })
      ).rejects.toMatchObject({ code: "RESCHEDULE_REQUIRED", statusCode: 409 });

      // updateSession schedule change on DRAFT class -> runs inside TeacherScheduleLock tx & checks overlap
      const draftSess = {
        ...openSessionDoc,
        startDatetime: new Date("2028-01-05T12:00:00.000Z"),
        endDatetime: new Date("2028-01-05T14:00:00.000Z"),
      };
      jest.spyOn(Session, "findById").mockReturnValue(mockQuery(draftSess));
      jest.spyOn(Class, "findOne").mockReturnValue(mockQuery(futureClass));
      Session.find.mockReturnValue(
        mockQuery([
          {
            title: "Busy",
            className: "Other Class",
            startDatetime: new Date("2028-01-06T12:00:00.000Z"),
            endDatetime: new Date("2028-01-06T14:00:00.000Z"),
          },
        ])
      );
      await expect(
        sessionService.updateSession(teacherId, sessionId.toString(), {
          startDatetime: "2028-01-06T19:00:00",
          endDatetime: "2028-01-06T21:00:00",
        })
      ).rejects.toMatchObject({ code: "SESSION_TIME_CONFLICT", statusCode: 409 });
    });
  });
});
