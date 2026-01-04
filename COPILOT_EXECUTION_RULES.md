NOTICE TO COPILOT / CODING AGENTS
This is a root-level file for the RED repository.
You must follow these rules for every work order and every code change in this repo.

1) Follow instructions verbatim

Implement exactly what is written in the work order.

Do not change spelling, casing, pluralization, enum values, string literals, endpoint paths, file paths, folder names, class names, or field names.

Do not “improve” naming (e.g., do not change menu to menus, TipGrid to Tip Grid, tip-menu to tip-grid, etc.) unless the work order explicitly instructs it.

2) Do not invent or substitute file paths

Only create/edit the exact files and paths specified in the work order.

If a referenced file/path does not exist, stop and ask a clarification question. Do not create a “closest match” path.

3) Do not guess missing details

If any required dependency, enum, constant, schema field, DTO, import, or module wiring is missing or unclear, you must:

Attempt to locate it in the repo first.

If still unclear, stop and ask a clarification question with exact file/line context.

Never fabricate types, fields, or modules “that probably exist.”

4) No silent scope expansion

Do not refactor unrelated code.

Do not add “nice-to-have” features.

Do not change existing behavior outside the explicit scope (except where the work order explicitly instructs a refactor).

5) Evidence-first reporting

After completing each part of a work order, report:

Exact files changed/created (full paths)

Key code blocks added/modified (short excerpts)

Any deviations required (should be none). If any deviation is necessary, explain why and ask for approval before proceeding.

6) If blocked, ask questions early and precisely

If you hit a blocker, return a short list of questions including:

What you tried

What file/path you inspected

What exact symbol/field was missing

The smallest decision needed to proceed

Do not proceed until clarified.

7) No “interpretation mode”

Treat every work order as an implementation checklist, not a design prompt.
Execute steps in order.

8) Conflict rule

If these rules conflict with a work order, follow the work order.

If a work order says “follow COPILOT_EXECUTION_RULES.md” and also pastes rules inline, and there is a conflict, the inline pasted rules win.
