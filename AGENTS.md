# Project delivery workflow

After completing any coding request in this repository, unless the user explicitly asks otherwise:

1. Update any documentation, database migrations, configuration examples, or deployment metadata required by the change.
2. Run the relevant automated tests and a production build.
3. Review the diff and stage only files that belong to the completed request.
4. Create a concise Git commit and push the current branch to GitHub.
5. Update the existing pull request, or create one when needed.
6. Verify that Vercel has deployed the pushed commit successfully. If the automatic deployment did not run or failed, diagnose and complete the deployment before handing off.

Never include unrelated local changes, secrets, or generated credentials in a commit.
