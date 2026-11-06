# Chrome extension (LinkedIn, Google)

The Candydati extension lets the assistant read LinkedIn **in your own browser, with your own account**, when you ask
it to find people for a job ("find backend engineers in Stockholm like Maja"). Candydati never logs in to LinkedIn and
keeps no LinkedIn credentials: the extension opens the pages in a tab of your Chrome, reads what they show and gives it
to your Candydati.

The same extension also lets the assistant **search Google in your browser** (see [Web search](#web-search-google)):
public results only, no LinkedIn account involved.

## Before you use it

- **LinkedIn's terms of use forbid the automated reading of profiles.** LinkedIn may ask you to verify, restrict or block
  the account used. The risk is on that account: the first time, Candydati asks you to accept it, and records it.
- An owner or admin turns LinkedIn sourcing on for the organization (Privacy → Retention) and sets the most profiles one
  search may read. You choose how many for each search, within that limit.
- If LinkedIn shows a check (CAPTCHA, verification), the extension stops and leaves the tab in front of you. It never
  tries to get around it.

## How a search works

1. You ask the assistant; it proposes objective criteria and waits for you to confirm them.
2. A tab opens in a group named **Candydati** in your Chrome: LinkedIn people search, then each profile, one at a time.
   Close the tab to stop.
3. The tab closes at the end. Your Candydati computes, for each person, what the profile says about each criterion (no
   score, no ranking) and whether they are already a contact or a candidate.
4. You choose whom to add. They become contacts of the job; they get the privacy notice with your first message and are
   erased after 30 days unless they apply.

## Web search (Google)

Ask the assistant to search the web for a job ("look on Google for Go developers in Torino"). It writes the search
itself, often an "X-ray" search such as `site:linkedin.com/in "Go" Torino` or `site:github.com Rust Milano`, and the
extension runs it on `www.google.com` in the same visible **Candydati** tab.

- It reads the **results pages only**: the title, link and snippet of each organic result. Ads, "People also ask" and
  Google's own boxes are left out; the pages behind the results are never opened.
- Your Candydati keeps the results that point to a person (a LinkedIn or GitHub profile, a page titled with a name),
  shows first name, city when Google shows it and the snippet as the fact, in Google's order (never a ranking), and
  flags who is already a contact or a candidate. People who asked not to be contacted are left out.
- No organization setting and no risk to accept: it is an ordinary Google search, in your browser. You need the
  extension and the permission to source people.
- If Google shows its "unusual traffic" check or its cookie consent page, the extension stops and leaves the tab in
  front of you: answer it yourself, then ask the assistant to search again. It never tries to get around it.

## Save a profile while you browse

On any LinkedIn profile you visit yourself, a small **Save to Candydati** button sits in the bottom right corner.

1. Click it: Candydati opens in a new tab with the person's name, headline and city, and a link to the profile.
2. Pick the open position, add if you like what in the profile relates to it (one "criterion: fact" per line), and click
   **Add as contact**.
3. Candydati says whether the person was added, is already a contact or a candidate, or asked not to be contacted again.

Open Candydati once in the same Chrome first: that is how the extension learns the address of your Candydati. The button
works without turning on LinkedIn sourcing for the organization: it reads only the profile you are looking at, when you
click. Owners, admins and recruiters can use it (the roles that manage sourced contacts).

## Privacy

What the extension does with data, in full:

- **What it reads**: only the LinkedIn and Google pages it opens for a search you started, in the tab it opened. Of each
  LinkedIn profile: the name, the headline, the location and the visible text of the page (capped). Of a Google results
  page: the title, link and snippet of each organic result. With the save button, only the profile you are viewing and
  only when you click: its name, headline, location and address (the page text is not sent). Never photos, never contact
  details behind buttons, never your messages, your network or your Google account, never other tabs or sites.
- **Where it goes**: only to the Candydati instance you are signed in to, from the page that asked for the search or the
  save page of your Candydati. Not to the makers of Candydati, not to any third party, not to analytics.
- **What it stores**: no history. The only things it keeps are the one profile you clicked "Save" on, in the browser's
  session storage until your Candydati page picks it up (then it is deleted; after 10 minutes it is refused and the next
  click replaces it), and the address of your Candydati, so the button knows where to open.
- **Permissions**: `tabGroups` (the visible "Candydati" group), `scripting` (reading the pages it opened), `storage` (the
  profile waiting to be saved and the address of your Candydati) and access to `www.linkedin.com` (where it also shows
  the save button) and `www.google.com` only. It accepts requests only from the Candydati addresses it was built for.
- **Limited use**: the data is used only to show you the people you searched for and to add the ones you choose. It is
  never sold, never used for advertising, never used to train models.

Your Candydati organization is the data controller of the people you add; their rights are handled from the personal link
of the notice they receive.

## Self-hosted instances

The published extension answers the hosted Candydati only. A self-hosted instance on its own domain builds its own:

```bash
CANDYDATI_ORIGINS=https://jobs.example.com pnpm --filter @candydati/extension package
```

Then load the zip in Chrome (Extensions → Developer mode → Load unpacked, from `apps/extension/dist`) or publish it, and
set `NUXT_PUBLIC_EXTENSION_ID` (and `NUXT_PUBLIC_EXTENSION_URL`) on the web app.
