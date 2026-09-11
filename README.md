# Dev Rotation Assigner

A small static page that picks the next **code reviewer** fairly for Anusree, Hrithik, Krithika, Rohan, and Sharon. Testing stays with QA for now.

Copy these four files into a repo (keep them in the same folder). Rename this file to `README.md` if it is the only app in that repo.

- `index.html`
- `styles.css`
- `app.js`
- this README

No build, npm, or server is required.

## Run it

Open `index.html` in a browser, or drop the folder on GitHub Pages / Vercel / Netlify as a static site.

## How to use it

1. Set **I am** to whoever is using the page. Suggestions skip that person so anyone can assign.
2. Enter a ticket key (`DORYFE-1234`, or just `1234`) and **Suggest reviewer**, then **Confirm**.
3. Copy the Teams ping from the toast if you want (`@Name — reviewer for DORYFE-1234`).
4. Mark leave on the team board when someone is out. They are skipped; their count does not change, so they catch up when they return.

**How assignment works** (also on the page, under that heading): lowest review count wins. Ties go A–Z from the person set as **Starts with**, then wrap around.

## Sharing state

Rotation is saved in **this browser** under `rotation_state_v1`. Who you are and the theme are saved separately, so importing a teammate’s file does not change them.

To share or back up the rotation: **Export JSON** / **Import JSON**. Use **Undo** if the last assignment was a mistake.

## Notes

- Default team is the five names above. You can add or remove people on the team board.
- QA is a label only, not in the rotation.
- To round-robin testing later, set `TESTING_ROTATION` to `true` at the top of `app.js`.
