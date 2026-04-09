## BBP Bioprocess Scheduling (Take-home)

### What this is
Desktop-only proof-of-concept scheduler to plan **batches** and their **unit operations** across **equipment lanes**, with backend-enforced constraints and UI warnings.

### Tech stack
- **Frontend**: React + TypeScript + Vite
- **Backend**: FastAPI + SQLModel + SQLite

### Run locally
In one terminal:

```bash
cd backend
./.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

In another terminal:

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`.

### What to look for in the UI
- **Equipment lanes** on the Y axis.
- **Date range** on the X axis with controls to set start/end.
- **Batch envelopes** (subtle outlined grouping) around all UnitOps in the batch.
- Click a UnitOp to open the **edit modal** (start/end/equipment/status/color).
- UnitOps with backend constraint violations show a **red outline** and a `!` indicator.

### Constraint enforcement (backend)
The backend computes violations for each UnitOp and returns them in `GET /api/schedule`.

Key checks:
- **Time range**: `end > start`
- **Batch window**: UnitOp must be within the parent batch start/end
- **Equipment overlaps**: same equipment cannot run overlapping UnitOps
- **Sequence order**: respects Seed → Bioreactor → TFF → Spray → Sum within a batch
- **Dependencies**: a `UnitOperationDependency` graph is maintained per batch (adjacent present steps)

### Testing strategy (what I would do next)
- **Backend**
  - Unit tests for overlap logic (touching edges, contained intervals, multi-overlap).
  - Unit tests for batch-window boundaries (exact start/end inclusivity).
  - Unit tests for sequence logic across missing steps.
  - API tests (create/update/delete) verifying violations returned before/after updates.
  - Concurrency/integrity: transaction tests to prevent race-created overlaps (DB constraints + retry/locking).
- **Frontend**
  - Component tests for modal open/close, field editing, and save/delete flows.
  - Contract tests against mocked API responses to ensure violations render as warnings.
  - Lightweight e2e tests around the critical flow (open grid → edit op → see warning update), minimizing brittle pixel assertions.

### Architectural trade-offs & decision log
- **Custom grid vs off-the-shelf Gantt library**
  - Pros: small surface area, easy to reason about, no paid dependency risk.
  - Cons: less feature-rich (drag/drop, virtualization, snapping).
  - Chosen because the assessment focuses on correctness/clarity and a clean V1.
- **Compute violations on read (schedule) vs enforcing “hard errors” on write**
  - Pros: user can enter “invalid draft” states and immediately see warnings; fewer blocked workflows.
  - Cons: invalid rows can exist in storage; requires clear UI warnings.
  - Chosen to match “UI highlights backend-enforced constraints” without making the editor frustrating.

### Comprehensive quality strategy
- **Backend logic**
  - Add DB-level safeguards for overlaps (in Postgres: exclusion constraints) and unique per-batch kind if required.
  - Validate in the API layer and in the DB to handle races.
- **Frontend experience**
  - Keep tests focused on user intent (fields + submit results) rather than layout/geometry.
  - Use typed API wrappers and strict TS types to prevent payload drift.
- **Observability**
  - Structured logs on create/update/delete including batch_id/equipment_id and computed violations.
  - Metrics on request latency and violation rates; traces around schedule loads.
  - Error reporting for UI fetch failures with request correlation IDs.

