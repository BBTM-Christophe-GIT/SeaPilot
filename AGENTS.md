# Project delivery workflow

## Node package manager

Use pnpm 10.34.5 exclusively for Node.js dependencies and scripts. Do not use npm and do not create `package-lock.json`.

- Install dependencies with `pnpm install --frozen-lockfile`.
- Run scripts with `pnpm <script>`.
- Commit `pnpm-lock.yaml` whenever dependency metadata changes.
- Keep dependency lifecycle scripts blocked unless they are explicitly reviewed in `pnpm-workspace.yaml`.

After completing any coding request in this repository, unless the user explicitly asks otherwise:

1. Update any documentation, database migrations, configuration examples, or deployment metadata required by the change.
2. Run the relevant automated tests and a production build.
3. Review the diff and stage only files that belong to the completed request.
4. Create a concise Git commit and push the current branch to GitHub.
5. Update the existing pull request, or create one when needed.
6. Verify that Vercel has deployed the pushed commit successfully. If the automatic deployment did not run or failed, diagnose and complete the deployment before handing off.

Never include unrelated local changes, secrets, or generated credentials in a commit.

## Profile-specific UI verification

For Marin and Capitaine workflows, never use the Marin or Capitaine views simulated from the current user session as the source of truth: they do not represent what real Marin and Capitaine accounts see. Inspect and test the role-gated application code, RPC/RLS rules, and profile-specific test fixtures for each real profile instead.

## User-requested release notes

Create an in-app release note only when the user requests one. Append it to `src/features/releaseNotes/releaseNotesCatalog.ts` with a unique stable ID, version, publication date, and user-facing description. Keep previous notes and IDs so missed updates remain available. See `docs/deployment/release-notes-and-lifting-sections.md` for the acknowledgement and read-later behavior.

## Vessel filter ordering

Always order vessel filters and selectors from longest to shortest using `compareFleetAssets` / `compareFleetNames` in `src/features/fleet/fleetDisplay.ts`. Prefer the vessel record's overall length, with the existing fleet catalog as fallback. Unknown lengths follow known lengths; yards and offices follow vessels. Keep aggregate options such as “Flotte” or “Tous les navires” first. Do not replace this order with alphabetical sorting in new filters.
