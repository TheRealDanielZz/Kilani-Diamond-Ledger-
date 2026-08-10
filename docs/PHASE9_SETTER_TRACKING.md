# Phase 9 Setter Tracking — Backend Preparation

## Feature state

Phase 9 records reliable Setter assignment events and intervals for future
Manager reporting. It does not enable a dashboard, CSV export, PDF export,
productivity score, attendance tracking, or surveillance.

The future-feature message is:

> Setter analytics will be available in a future update.

Only Setters are tracked. Designers, Jewellers, Managers, and Sales Reps are
not included in the tracking records.

## Measurement readiness

The pre-implementation score was **62/100 — Unreliable**.

- Decision alignment: 22/25
- Event model clarity: 9/20
- Data accuracy and integrity: 10/20
- Completion definition quality: 8/15
- Attribution and context: 7/10
- Governance and maintenance: 6/10

Historical assignment and progress timestamps remain reference-only when a
trusted server timestamp is not available. Reliable elapsed timing begins when
Phase 9 is activated.

## Authoritative records

| Information | Source |
| --- | --- |
| Assignment state changes | `setter_tracking_events` |
| Elapsed assignment interval | `setter_assignment_intervals` |
| Current bags and bag numbers | `bags` |
| Pending returns | `bags.status` and pending bag return records |
| Confirmed breakage | Manager-confirmed bag returns only |
| Project details | `projects` |

Bag, return, breakage, project, and inventory records are never copied or
rewritten by Phase 9.

The prepared bag contract returns bag number, project, Setter, issue date,
timing quality, days held, pending-return state, and confirmed broken pieces.
Setter estimates and unconfirmed breakage are deliberately ignored.

## Event model

Event types:

- `assignment_started`
- `assignment_ended`
- `project_completed`
- `stage_transition`

Every new event uses the Firestore project-change event ID to derive a stable
document ID. A processing marker makes retries idempotent. Every new timestamp
is recorded from the trusted backend.

`setter_assignment_intervals` is a derived view of the immutable event stream,
not a competing event source.

If a staff profile changes into the Setter role, reliable intervals begin for
that person's current assignments. If a Setter changes to another role or is
removed, their open intervals end at the trusted role-change time. Historical
intervals remain available as participation history.

## Activation baseline

Activation requires:

1. A Manager runs `getPhase9SetterTrackingDryRun`.
2. The dry-run checksum is reviewed.
3. A Manager calls `activatePhase9SetterTracking` with the checksum and a
   unique operation ID.

Current active Setter assignments receive a baseline interval beginning at the
activation timestamp. Legacy `assignedAt` values are retained only as labelled
reference data. Phase 9 does not backdate elapsed time or change project data.

## Privacy and authorization

- Direct client reads and writes to Phase 9 collections are blocked.
- Only a Manager may request the feature state, dry run, or activation.
- Analytics results and exports do not exist in Phase 9.
- No blocked time is recorded until a formal blocked workflow is approved.
- Inactivity, weekends, and missing events are never counted as blocked time.
- No productivity or employee ranking score is calculated.

## Future result contract

When a later phase explicitly approves analytics presentation, results may
combine:

- reliable Phase 9 intervals;
- legacy participation labelled as incomplete;
- authoritative bag and confirmed-return data.

Missing historical durations must remain blank. Future CSV and PDF renderers
must consume the same authorized result contract as the future Manager UI.
