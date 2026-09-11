# Dev Rotation Assigner

Picks the next **code reviewer** fairly for the team. Testing stays with QA.

## Assign a reviewer

1. Set **I am** to yourself. Suggestions skip you so anyone on the team can use the page.
2. Enter the ticket key (`DORYFE-1234`, or just `1234`).
3. Click **Suggest reviewer**, check the name, then **Confirm**.
4. Copy the Teams ping from the toast if you want (`@Name — reviewer for DORYFE-1234`).

To change the reviewer on an existing ticket, pick it from the assigned list (or the ticket log) and suggest again. That person’s review count drops by 1.

## How the next person is chosen

Lowest review count is next. If counts are tied, names go A–Z from **Starts with** on the team board, then wrap around.

Someone on leave is skipped and their count is left as-is, so they catch up when they return.

Open **How assignment works** on the page for the same rules in short.

## Team board

- **Starts with** — who wins a tie. Change this if the cycle is already underway; it does not change past tickets.
- **Edit** — name and time off. Set both dates to count as leave.
- **Add** / **Remove** — keep the list in sync with who is on the team.
- **QA** — a label only. QA is not assigned reviews.

A **catching up** badge means that person is at least 2 reviews behind. **Balanced** means everyone’s counts match.

## Undo and sharing

**Undo** reverses the last assignment.

The rotation is saved in this browser. To share it with a teammate or move to another computer, **Export JSON** here and **Import JSON** there. Who you are on this page is not overwritten by import.
