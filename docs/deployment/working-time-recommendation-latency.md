# Working-time recommendation latency

The mobile entry board requests `working_time_phases_recommendation` for the
selected periods. A PostgreSQL statement timeout clears the recommendation and
blocks saving or submitting that selection. The board can then display
“Politique requise” even when the company policy exists. A missing Planning
assignment still permits entry with the existing office approval fallback.

Both recommendation RPCs previously measured every half-hour restart candidate
over seven days and selected `MIN(resume_at)`. The multi-phase RPC also ran the
single-interval search while resolving permission and policy, repeating the
expensive work. Migration
`20261014155237_optimize_working_time_recommendation_restart.sql` visits those same
candidates in ascending order and exits at the first compatible restart.

The migration preserves both sides of the proposed restart, all work/rest,
amplitude and night-work conditions, future-date policy resolution in the
single-interval RPC, authorization guards, function grants and response fields.
It neither changes role timeouts nor writes working-time records. In the worst
case, a search still examines the full existing seven-day range.

Companion migration
`20261014160325_harden_working_time_recommendation_authorization.sql` requires
explicit true company membership and access authorization. The previous
nullable expression could admit a Marin with no linked HR person. Both RPCs
now reject that case with `42501`; the multi-phase RPC delegates its permission
check to the single-interval RPC. The guarded, idempotent patch preserves all
other function code and grants.

## Verification

- The new pgTAP fixture has 26 passing assertions covering linked Marin and
  Capitaine profiles, disjoint 07:30–12:00 / 12:30–15:00 periods without Planning,
  exact quotas and restart times, a policy transition, overlap rejection,
  anonymous, unlinked-profile and cross-company access, missing policy and read-only analysis. It
  retains the authenticated API's eight-second statement timeout.
- Complete responses match the previous functions for multi-phase and
  policy-transition fixtures. The frontend workflow/query/entry-board suites
  pass 62 tests, including saving both periods from a Marin fixture with no
  Planning assignment. The production build passes.
- Production verification used the affected linked Marin identity in
  `BEGIN READ ONLY`, with `SET LOCAL ROLE authenticated` and an eight-second
  statement timeout. The original request failed with SQLSTATE `57014`; a
  diagnostic read with a transaction-local 35-second budget took 8,474.43 ms.
  After migration, the same request took 1,840.66 ms, 619.48 ms and 621.06 ms.
  All three complete JSON responses equal the original diagnostic response.
  After authorization hardening, a cold read took 1,802.70 ms with the same JSON.
  Digests and counts of the affected person's intervals, registers, day
  approvals and calculation windows remained unchanged.
- Existing SQL `working_time_entry_recommendations_test.sql`,
  `working_time_work_cycle_capitaine_test.sql` and
  `working_time_work_cycle_reset_test.sql` have respectively 3, 6 and 5 failures
  on the local database before and after this migration. Their expectations
  predate current amplitude/v4 calculation behavior; this change introduces no
  additional failures. Their baseline comparison is retained outside Git.

Production migration history records version `20261014155237` with name
`optimize_working_time_recommendation_restart`. The repository filename uses the
same version to prevent a duplicate pending migration. Private identity and
row-level verification evidence remain outside the repository.
The companion authorization migration is recorded as version `20261014160325`.

## Follow-up on 15 October 2026

Production statement statistics still showed multi-phase recommendations averaging
4,218 ms and phase saves averaging 4,761 ms, with maxima immediately below the
authenticated API's eight-second timeout. The first optimization still calculated
an entire single-interval recommendation just to authorize the multi-phase call.
Both functions also measured all 48 possible extension ends even after the first
non-compliant end had made every remaining end ineligible.

`20261015073626_working_time_recommendation_single_validation.sql` resolves the
same access checks and applicable policy through a private helper without
calculating a second recommendation. The helper is not executable by API roles.
Both extension searches retain their existing grid and compliance predicates,
and stop at the first failing end. Restart searches, quotas, locked days,
signature requirements and approval rules retain their existing behavior.

`20261015073631_optimize_working_time_captain_period_access.sql` also resolves the
Captain's HR person once per period check and filters matching assignment pairs
before expanding their overlapping dates. The existing authoritative daily
Captain and effective work-status functions still decide access. This reduces
the repeated work performed by register and calculation RLS without adding any
role, vessel, watch or date permission.

Local verification uses an independently migrated database and real synthetic
Marin/Capitaine profiles under the `authenticator` session and `authenticated`
role. The new `working_time_recommendation_history_test.sql` seeds 356 historical
intervals for each profile and passes 19 assertions, including the actual
two-phase draft save, with an eight-second statement timeout. It must be launched
as the local cluster superuser so it can change session authorization after
seeding historical records; all fixtures and trigger changes are rolled back.

On this fixture, Marin/Capitaine multi-phase reads changed from 1,025/1,262 ms to
252/190 ms, and the two-phase save changed from 1,602 ms to 780 ms. These are local
measurements, not production latency guarantees. The existing restart suite
passes 26 assertions and the permanent Captain assignment suite passes 12. The
signed-entry API session suite passes 21 assertions, and the working-time query,
entry-board and workflow-panel frontend suites pass 95 tests. The
temporary Captain suite retains its 33 passing assertions and its pre-existing
DPR crew-label expectation failure; every working-time assertion passes.

## Deployment and rollback

Apply the migration before deploying the branch; no frontend protocol change is
required. Verify the real role-scoped RPC with read-only transactions instead
of an administrator's simulated Marin/Capitaine view. The
[Supabase timeout reference](https://supabase.com/docs/guides/database/postgres/timeouts)
documents the authenticated-role API budget.

To revert only the optimization, restore the definitions of
`working_time_interval_recommendation` and `working_time_phases_recommendation`
from `20260901181001_accept_consecutive_rest_as_24h_conformity.sql`, then reapply
the companion authorization migration to retain the explicit-true guards and
notify PostgREST to reload its schema. Reverting brings back the exhaustive restart
search and its timeout risk. No working-time data restoration is necessary.
