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
