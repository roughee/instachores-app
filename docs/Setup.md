# Setting up a real household

The one-time procedure that turns an empty Google Sheet into a working HomeCrew household: the sheet, the deployed Apps Script, the catalog, the two adults and the kid, and the link that connects the second phone. Everything a script can do, `scripts/household.ts` does (`npm run household -- <command>`, see `scripts/household.ts`'s own `--help`-style usage when run with no command). Everything that needs a human clicking inside Google's own UI is one numbered step below. Budget about ten minutes.

Read first: `docs/Architecture.md` §4 (the sheet), §5 (the Apps Script API), §7 (identity and the setup link), and `apps-script/README.md`.

## The procedure

1. Create a new Google Sheet (sheets.new). Rename it something recognizable, for example "HomeCrew".
2. In the sheet, open **Extensions > Apps Script**. This creates a script bound to the sheet.
3. Paste the contents of `apps-script/Code.js` into the editor's `Code.gs`, and paste `apps-script/appsscript.json` into the manifest (the gear icon > "Show appsscript.json" if it is not already visible). If you have `clasp` set up instead, `clasp push` from `apps-script/` does the same thing.
4. In the function picker at the top of the editor, choose `setupTemplate` and click Run. (The picker only lists functions whose names do not end in an underscore, so the private `setupTemplate_` helper is deliberately not there.) Authorize the script when prompted (it is your own script acting on your own sheet). This creates the five tabs with header rows and plain-text formatting; it is safe to re-run.
5. Deploy the script as a web app: **Deploy > New deployment**, type "Web app", execute as **Me**, who has access **Anyone**. Click Deploy and copy the web app URL and the deployment id it shows. Write the deployment id (not the secret) into `apps-script/README.md` where the next deploy will look for it.
6. Run `npm run household -- secret`. It prints a fresh secret and the exact steps to store it as the Script Property `SECRET` in the Apps Script editor (Project Settings > Script Properties). Do that now.
7. Run `npm run household -- check --url <the web app URL> --secret <the secret>`. It should print two `PASS` lines: the right secret is accepted, a wrong one is rejected. If either says `FAIL`, fix the Script Property before continuing.
8. If the Phase 0 session changed any point value from what is in `src/domain/seed.ts`, edit the `ROWS` array there first (that file is what the `seed` command sends) and run `npm run check` before continuing, so the catalog it seeds already carries the agreed values. A handful of rows also carry an `intervalDays` (Fridge cleanout, Vacuum, Mop, Clean bathroom, and so on): the `seed` command sends it straight through for the rows that have one, and leaves it blank for the rows that don't.
9. Run `npm run household -- seed --url <the web app URL> --secret <the secret>`. It asks for confirmation before sending; answer `y`. It refuses cleanly (and sends nothing) if the tabs already have rows, so it is safe to run again on a truly empty sheet.
10. Run `npm run household -- members --adult <uid>:<Name>:<#hex> --adult <uid>:<Name>:<#hex> --kid <uid>:<Name>:<#hex>` with the two adults' and the kid's chosen slugs, names and colors (a slug is a short lowercase word like `ana`, `ben`, `mia`; colors are 6-digit hex like `#128369`). Paste the rows it prints under the header row of the sheet's `members` tab by hand. There is no API action for this; the members tab is always edited directly.
11. In the Google Sheet, click **Share** and add your partner as an **Editor**.
12. Run `npm run household -- link --url <the web app URL> --secret <the secret>`. It prints one URL and how to share it.
13. Send that URL to your partner the way you would share a password: a direct message, not a group chat or anything archived or forwarded. Open it on your own phone too.
14. Both phones open the link, `bootstrap`, and the person taps their name from the `members` list. Setup is done.

## Rotating the secret

Do this if the secret ever leaks (screenshot in the wrong chat, shared device, and so on).

1. Run `npm run household -- secret` for a new value.
2. In the Apps Script editor, Project Settings > Script Properties, edit `SECRET` to the new value.
3. Run `npm run household -- check --url <the web app URL> --secret <the new secret>` to confirm the new value took effect and the old one no longer works.
4. Run `npm run household -- link --url <the web app URL> --secret <the new secret>` and re-share it with your partner over the same private channel. Every phone still holding the old secret gets `unauthorized` until it opens the new link.

## Adding the schedule columns to an existing sheet

Issue #67 added three columns to a household sheet created before the Schedule
tab (issue #64) existed: `intervalDays` on `tasks`, and `dueAt` and `days` on
`events`. A sheet created after this change already has them from
`setupTemplate`; a sheet created before it needs them added by hand, once:

1. Open the household spreadsheet.
2. On the `tasks` tab, append a header cell reading `intervalDays` right
   after `comboBonus`.
3. On the `events` tab, append two header cells reading `dueAt` and `days`
   after the last column (`day`).
4. Format the new columns as plain text (select the columns, **Format >
   Number > Plain text**), matching every other column on those tabs.
5. Redeploy the script (below): `eventsAppend`/`genericUpsert` write new rows
   using the header list baked into the deployed `Code.js`, not the sheet's
   own header row, so a schedule/unschedule event's `dueAt`/`days` (or a
   task's `intervalDays`) only land in the sheet once the deployed script
   knows about those columns too.

Existing rows read fine either way: a blank cell parses as absent (no
`intervalDays` on an old task, no `dueAt`/`days` on an old event), the same
as any other optional column.

## Redeploying the script

Do this whenever `apps-script/Code.js` or `apps-script/appsscript.json` changes. Two partners approving the change, per `docs/Architecture.md` §10, applies here.

1. Before deploying, open the Apps Script editor, select `runTests` in the function picker and click Run. Check **View > Logs** for `PASS` on every scenario and a final `ALL PASS (n)`.
2. Update the existing deployment rather than creating a new one, so the URL (and every setup link already handed out) keeps working: `clasp push && clasp deploy -i <the deployment id from apps-script/README.md>`. Without a UI for this, use **Deploy > Manage deployments**, pick the existing deployment, click the pencil to edit it, and choose "New version" instead of "New deployment".
3. Run `npm run household -- check --url <the web app URL> --secret <the secret>` once more to confirm the redeployed script still answers correctly.

## Troubleshooting

- `check` fails both lines: the web app URL is wrong, or the deployment's access is not set to "Anyone". Re-check step 5.
- `check` fails only the wrong-secret line: the Script Property `SECRET` is empty or missing. Re-check step 6.
- `seed` refuses with "tasks and/or rewards tab already has rows": clear both tabs by hand (keep the header row) if you meant to start over, then run `seed` again.
- `members` rejects a spec: it prints exactly which part failed (an invalid hex color, an empty name, and so on); fix that one `--adult`/`--kid` argument and rerun.
