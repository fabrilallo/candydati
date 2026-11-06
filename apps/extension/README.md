# Candydati Chrome extension

Lets the Candydati assistant read LinkedIn people search and profiles in the recruiter's own browser, when they ask it
to source people for a job. User guide and privacy: `website/guide/chrome-extension.md`
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
- Nothing is stored, nothing is sent anywhere but back to the Candydati page that asked.

## Build

```bash
pnpm --filter @candydati/extension build      # dist/ (load unpacked in chrome://extensions for a try)
pnpm --filter @candydati/extension package    # dist/candydati-extension-<version>.zip for the Chrome Web Store
CANDYDATI_EXTENSION_DEV=1 pnpm --filter @candydati/extension build   # also answers http://localhost:3000
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
Lets your Candydati assistant read LinkedIn search results and profiles in your own browser, when you ask it to.

**Description**:
Candydati is a recruiting platform (ATS). With this extension, when you ask the Candydati assistant to find people for
one of your positions, it opens LinkedIn in a visible tab of your own Chrome, with your own account, reads the people
search and the profiles, and shows you who matches your criteria, with the facts from each profile. You choose whom to
add; nobody is contacted automatically.

- It works only when you start a search from Candydati, and only on linkedin.com.
- The tab is visible in a group named "Candydati": close it to stop.
- If LinkedIn asks for a verification, the extension stops and leaves it to you.
- It stores nothing and sends what it reads only to your Candydati.

Important: LinkedIn's terms of use forbid the automated reading of profiles, and LinkedIn may restrict the account used.
Candydati asks you to accept this risk before the first search.

**Category**: Productivity (or Workflow & Planning)

**Single purpose**: Read LinkedIn people search results and profiles in the user's browser when the user starts a
sourcing search from their Candydati account, and return them to that Candydati page.

**Permission justifications**:
- `tabGroups`: the search runs in one tab placed in a visible group named "Candydati", so the user sees it and can close it.
- `scripting`: to read the text of the LinkedIn pages the extension itself opened for the search.
- Host permission `https://www.linkedin.com/*`: the only site the extension reads.
- `externally_connectable` (no permission prompt): only the Candydati web app may start a search.

**Remote code**: No. All code is in the package.

**Data usage** (disclosures):
- Collected: personally identifiable information (names) and website content (the text of LinkedIn profiles the user
  searched for).
- Certify: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used or
  transferred to determine creditworthiness or for lending.

**Privacy policy URL**: https://fabrilallo.github.io/candydati/guide/chrome-extension#privacy

**Support email**: fabrizio.lallo95@gmail.com
