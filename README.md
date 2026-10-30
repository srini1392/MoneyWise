# MoneyWise

A private, offline-first expense tracker that installs to your phone's home
screen. No ads, no accounts, no analytics. Data lives on the device and,
optionally, in a Google Sheet you own.

**Current version: 1.1.0** — shown at the foot of the app's Settings screen, so
you can always confirm which build is live.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app — markup, styles and logic in one file |
| `manifest.json` | App name, icons, colours, full-screen mode, share target |
| `sw.js` | Service worker — caches the app so it works with no network |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon-96.png` | Icons, deliberately at the root so they can be uploaded from a phone |
| `apps-script.gs` | The optional Google Sheets backend, pasted into Apps Script |
| `_headers` | Content-type rules for Netlify / Cloudflare. Ignored by GitHub Pages |

Everything is flat — no folders — because mobile file pickers cannot upload a
directory. Keep it that way.

## First-time setup: GitHub Pages

1. Unzip the package on the phone (Files by Google → tap the zip → Extract).
2. On github.com, create a new **public** repository.
3. **Add file → Upload files**, select all the files, **Commit changes**.
4. **Settings → Pages** → Source: *Deploy from a branch* → branch `main`,
   folder `/ (root)` → **Save**.
5. Wait about a minute. The URL appears at the top of the Pages settings:
   `https://<username>.github.io/<repo>/`
6. Open it in Chrome and install it (⋮ → **Install app**, not "Create shortcut").

The app uses relative paths throughout, so serving from a `/repo/` subpath works
without any configuration.

## Updating from the phone

1. In the repo: **Add file → Upload files**.
2. Select the changed files — usually just `index.html`, sometimes `sw.js` too.
3. **Commit changes**. GitHub Pages rebuilds in about thirty seconds.
4. Open the app and **reload twice**. The first launch fetches the new copy, the
   second runs it. The service worker cache version in `sw.js` (`spending-vN`)
   must be bumped in any release that changes `index.html`, or installed copies
   will keep serving the old shell.
5. Confirm the new version number at the foot of Settings.

Uploading a file with the same name replaces it — you don't need to delete
anything first.

## Google Sheets sync (optional)

The app works entirely offline without this. To keep a live copy in Drive:

1. Create a Google Sheet, open **Extensions → Apps Script**, paste
   `apps-script.gs` over the sample code, and save.
2. **Deploy → New deployment → Web app**, with *Execute as: Me* and *Who has
   access: Anyone*.
3. Copy the `/exec` URL into the app: ⋯ → Script URL → **Save and sync now**.

Reading is automatic — the app pulls the sheet when it opens, when you come back
to it, and when the phone reconnects. Pushing is manual: the ↻ button uploads
what's queued, then verifies it landed. Editing the script later requires
**Manage deployments → edit → New version**; a fresh deployment gives a new URL
and the app keeps posting to the old one.

## Notes

- **iOS** has no share target and no install prompt. Use Safari → Share → Add to
  Home Screen, and use Settings → *Paste a message* instead of sharing.
- **Share target** on Android only works for an installed PWA, and Chrome reads
  it at install time — so after a manifest change, reinstall.
- **Data is per-origin.** Moving to a new URL starts empty; export a JSON backup
  from the old one and import it after.
- Categories, budgets, auto-categorise rules and recurring payments are all
  editable in Settings and stored in `localStorage`.
