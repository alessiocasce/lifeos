# Issue tracker: GitHub

Issues and published specs for this repo live in GitHub Issues for `alessiocasce/lifeos`. Use the `gh` CLI for these operations. Local spec documents remain valid working references; publish their full content or an accessible source when creating a spec issue.

## Target and issue operations

- Before the first write, verify the target with `gh repo view --json nameWithOwner`. Use `--repo alessiocasce/lifeos` explicitly on issue, label, and pull-request commands; never publish into the skills author's repository or an upstream fork by accident.
- Create: write the exact multiline body to a UTF-8 temporary file, then run `gh issue create --repo alessiocasce/lifeos --title "..." --body-file <path>`.
- Read: `gh issue view <number> --repo alessiocasce/lifeos --json number,title,body,labels,comments,state,parent,subIssues,blockedBy`.
- List: `gh issue list --repo alessiocasce/lifeos --state open --limit 100 --json number,title,body,labels,assignees`. Paginate when an exhaustive result is needed.
- Comment: `gh issue comment <number> --repo alessiocasce/lifeos --body-file <path>`; preserve actual newlines and literal text.
- Labels: `gh issue edit <number> --repo alessiocasce/lifeos --add-label "..."` or `--remove-label "..."`. Role names are mapped in `triage-labels.md`.
- Close after verification: post the resolution and validation evidence with `gh issue comment ... --body-file <path>`, then `gh issue close <number> --repo alessiocasce/lifeos`. Do not rely on `close --comment` to preserve an explanation on an already-closed issue.

## Ticket graph

- Use native GitHub sub-issues for tickets under a spec: `gh issue create --repo alessiocasce/lifeos --parent <parent> ...`, or `gh issue edit <parent> --repo alessiocasce/lifeos --add-sub-issue <child>`.
- Use native blocking relationships: `gh issue create --repo alessiocasce/lifeos --blocked-by <n>,<n> ...`, or `gh issue edit <child> --repo alessiocasce/lifeos --add-blocked-by <blocker>`.
- A ticket is ready only when every blocker is closed. Read `blockedBy` and check issue states; a shared dependency is not itself a blocking relationship.
- If native relationships are unavailable, document `Part of #<parent>` and `Blocked by: #<n>, #<n>` in ticket bodies, and maintain a child task list on the parent.
- Resolve implementation tickets with evidence as described above. A pull request may reference or close them when a pull request is authorized; do not close a spec or parent merely because its ticket breakdown has been published.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and pull requests. Resolve ambiguous references before treating them as issues.

## Skill operations

When a skill says "publish to the issue tracker", create a GitHub issue. When it says "fetch the relevant ticket", read the issue body, comments, and blocking relationships. Apply the configured `ready-for-agent` label to approved, sufficiently specified agent tickets.

Existing repository rules on commits, pushes, deployment, and production changes still apply. Configuring the tracker does not itself authorize publishing implementation work or modifying unrelated issues.
