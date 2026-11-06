# Candydati Chrome extension

Lets the Candydati assistant read LinkedIn people search and profiles, and Google results pages, in the recruiter's own
browser, when they ask it to source people for a job, and adds a "Save to Candydati" button to LinkedIn profiles. User
guide and privacy: `website/guide/chrome-extension.md`
(https://fabrilallo.github.io/candydati/guide/chrome-extension).

## How it works

- The web app sends `{ type: 'candydati.search_linkedin', keywords, location, limit }` with
  `chrome.runtime.sendMessage(extensionId, …)`; the extension answers only the origins in `externally_connectable`
  (`CANDYDATI_ORIGINS` at build time), one search at a time.
- `src/search.ts` opens one tab in a visible "Candydati" tab group, reads the search pages and then each profile, and
  closes the tab. The login wall ends the search (`not_logged_in`); a security check leaves the tab in front of the
  person (`captcha`) and is never bypassed; closing the tab cancels.
- `src/page-scripts.ts` runs inside the LinkedIn page and only reads text; `src/profile-parse.ts` turns it into the
  profile shape the api expects (`linkedinProfileSchema` of `@candydati/domain`).
- Web search: `{ type: 'candydati.search_web', query, limit }` (`src/web-search.ts`) opens
  `https://www.google.com/search?q=…&num=…` in the same visible tab, reads the organic results only (title, link,
  snippet; `src/google-page-scripts.ts`), pages with `start=` up to `limit` (30 at most), and closes the tab. Google's
  "unusual traffic" check (`/sorry/`) gives `captcha` and its cookie consent page gives `consent_required`: in both the
  tab stays in front of the person, never bypassed. The pages behind the results are never opened.
- Nothing of a search is stored, nothing is sent anywhere but back to the Candydati page that asked.

### "Save to Candydati" button

- `src/content-save.ts` (content script on `www.linkedin.com`) shows a small floating button on profile pages only
  (`/in/<handle>/`; LinkedIn changes page without loading one, so it watches the address). It reads nothing until the
  person clicks, and never clicks, types or changes anything on LinkedIn.
- On click it reads name, headline, location and address of the profile (`src/save-click.ts`, no photo, the page text
  is not sent on) and hands them to the background (`src/background-save.ts`, logic in `src/save-messages.ts`), which
  keeps it as the one **pending profile** in `chrome.storage.session` (replaced by the next click, refused after 10
  minutes) and opens `<Candydati origin>/app/sourcing/save`.
- The Candydati origin is the one of the last Candydati page that talked to the extension (the app sends
  `{ type: 'candydati.hello' }` when it loads), kept in `chrome.storage.local`. Without one, the button asks to open
  Candydati once first.
- The save page asks `{ type: 'candydati.pending_profile' }`: the background answers only the allowed origins, gives the
  pending profile and clears it. The page adds the person as a sourced contact of the position the recruiter picks.

## Build

```bash
pnpm --filter @candydati/extension build      # dist/ (load unpacked in chrome://extensions for a try)
pnpm --filter @candydati/extension package    # dist/candydati-extension-<version>.zip for the Chrome Web Store
CANDYDATI_EXTENSION_DEV=1 pnpm --filter @candydati/extension build   # also answers http://localhost:3000
CANDYDATI_EXTENSION_NAME="Acme Hire" pnpm --filter @candydati/extension build   # product name on the save button
```

## Publish (Chrome Web Store, unlisted)

1. `pnpm --filter @candydati/extension package`.
2. Chrome Web Store developer console → New item → upload the zip.
3. Fill the listing with the texts below; visibility **Unlisted**.
4. After review, copy the extension ID and the store URL into the web app: `NUXT_PUBLIC_EXTENSION_ID`,
   `NUXT_PUBLIC_EXTENSION_URL`.

The version comes from `package.json` (bumped with every release). Each update is uploaded the same way.

## Listing texts

**Name**: Candydati

**Short description** (132 characters at most):
Lets the Candydati assistant read LinkedIn and Google in your browser when you ask, and saves the profile you view in one click.

**Description**:
Candydati is a recruiting platform (ATS). With this extension, when you ask the Candydati assistant to find people for
one of your positions, it opens LinkedIn in a visible tab of your own Chrome, with your own account, reads the people
search and the profiles, and shows you who matches your criteria, with the facts from each profile. It can also run a
Google search for you, in the same visible tab, and read the results page (titles, links and snippets) to find public
profiles. You choose whom to add; nobody is contacted automatically.

While you browse LinkedIn yourself, a small "Save to Candydati" button on each profile adds that person to one of your
positions: one click opens Candydati with the name, headline and city; you pick the position and confirm.

- It reads LinkedIn and Google only when you start a search from Candydati, and a LinkedIn profile only when you click
  the save button; only on linkedin.com and google.com.
- The search tab is visible in a group named "Candydati": close it to stop.
- If LinkedIn asks for a verification, or Google shows its traffic check or cookie consent page, the extension stops and
  leaves it to you.
- It sends what it reads only to your Candydati. The only thing it keeps is the one profile you clicked, until your
  Candydati page picks it up (at most 10 minutes), and the address of your Candydati.

Important: LinkedIn's terms of use forbid the automated reading of profiles, and LinkedIn may restrict the account used.
Candydati asks you to accept this risk before the first search.

**Category**: Productivity (or Workflow & Planning)

**Single purpose**: Bring people for a job into the user's Candydati recruiting account: read LinkedIn people search
results and profiles, and Google search results pages, when the user starts a sourcing search from Candydati, or the
LinkedIn profile the user is viewing when they click "Save to Candydati", and hand them only to that Candydati.

**Permission justifications**:
- `tabGroups`: the search runs in one tab placed in a visible group named "Candydati", so the user sees it and can close it.
- `scripting`: to read the text of the LinkedIn and Google pages the extension itself opened for the search.
- `storage`: to keep the one profile the user clicked "Save to Candydati" on until their Candydati page picks it up
  (session storage, at most 10 minutes, cleared once read), and the address of their Candydati (local storage), where
  the save page opens.
- Host permission `https://www.linkedin.com/*`: the LinkedIn people search and profiles the user asked for. The content
  script on it shows the "Save to Candydati" button on profile pages and reads the profile only when the user clicks it.
- Host permission `https://www.google.com/*`: the Google results page of a web search the user asked for (titles, links
  and snippets of the organic results only). With LinkedIn, the only sites the extension reads.
- `externally_connectable` (no permission prompt): only the Candydati web app may start a search or pick up a saved profile.

**Remote code**: No. All code is in the package.

**Data usage** (disclosures):
- Collected: personally identifiable information (names) and website content (the text of LinkedIn profiles and the
  Google results the user searched for, or the name, headline and location of the profile the user chose to save).
- Certify: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used or
  transferred to determine creditworthiness or for lending.

**Privacy policy URL**: https://fabrilallo.github.io/candydati/guide/chrome-extension#privacy

**Support email**: fabrizio.lallo95@gmail.com
