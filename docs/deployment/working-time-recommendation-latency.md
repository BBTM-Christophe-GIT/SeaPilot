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
