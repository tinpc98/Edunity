# Backend Read-Only Blockers

This report identifies gaps in the Backend that prevent matching the SRS completely. **NO BACKEND CHANGES WILL BE MADE** based on this report, it is for Frontend adaptation awareness only.

| ID | Domain | Severity | SRS Expected | Backend Actual | Frontend Impact | FE Adaptation | Backend Change Reqd |
|---|---|---|---|---|---|---|---|
| BLK-01 | Schedule | B1 | Dedicated Schedule model and API | Embedded inside Class/Session | Frontend `useSchedule` must parse `Session` dates instead of fetching a standalone Schedule API. | YES | YES |
| BLK-02 | Platform Settings | B3 | Admin Config UI via DB settings | Hardcoded in `constants.js` and `.env` | Admin Dashboard cannot modify variables like `COMMISSION_RATE` dynamically. | YES (Hide UI) | YES |
| BLK-03 | Database Architecture | B4 | PostgreSQL Relational | MongoDB NoSQL | `_id` is used instead of `id`. Relational integrity handled in application layer. | YES (Map `_id` to `id`) | YES |
