# Tracked links and sources

Every channel where you share an ad can have its own link. Reports then show, for each channel and campaign, how many
people opened the ad, how many applied and how many were hired.

## Build a link

Open a published ad, then its **Distribution** tab, then **Tracked links**.

1. Pick a channel: LinkedIn, Indeed, InfoJobs, Glassdoor, Facebook, Instagram, X, Newsletter, Referral, Career fair,
   University, or **Another channel** and type its name.
2. Optionally type a campaign, for example `autumn-2026`. Use the same campaign name on every channel of that campaign.
3. Copy the link. It is the public address of the ad with two parameters added:

```text
https://jobs.example.com/careers/acme/backend-developer?utm_source=linkedin&utm_campaign=autumn-2026
```

Names are lowercased and limited to letters, numbers, dots, dashes and underscores (60 characters at most). The page
shows how your text will appear in Reports. An email address is never accepted as a name.

You can also add `?utm_source=...` and `&utm_campaign=...` by hand, or just `?ref=...`. A link with no parameters is
counted by the site that sent the visitor (for example `google.com`), and as **direct** when there is none.

## What Reports show

In **Reports**, the **Sources** card lists every channel with the visits of the ad, the applications, the conversion
(applications over visits) and the hires with their rate. Below it, **Campaigns** shows the same per channel and campaign.
The Distribution tab of each ad shows the same figures for that ad only, over the last 90 days. The CSV export has a
`sources` and a `campaigns` block with visits and conversion.

- Conversion needs at least 5 visits to be shown; below that you see a dash, like every rate in Reports.
- A visit is counted when a browser shows the ad page. Search engines and other crawlers, link previews and headless
  browsers are not counted, and neither are visitors whose browser sends Do Not Track or Global Privacy Control.
- One client can count at most 30 visits a minute, so a reload loop cannot inflate the numbers.
- Applications that came from an older link, or from a browser that blocks scripts, have no matching visit: conversion
  can then be above 100% for a small channel.
- An ad that is not published (draft or closed) counts no visits.

## What is stored, and what is not

Visits are **counters**: one number per ad, day, source and campaign. Nothing else.

- No cookies and no browser storage (`localStorage`, `sessionStorage`).
- No IP address and no user agent are stored. The user agent is read only to leave crawlers out, the IP only to limit the
  rate.
- Two visits cannot be told apart, so the counters are not personal data and need no banner.
- Counters older than 25 months are deleted every night.

The application itself keeps the short source and campaign labels, never a full address.

::: tip Crawlers and `robots.txt`
Links with `utm_` parameters are not crawled by search engines (see `robots.txt`), and the counting route lives under
`/api/`, which is disallowed too.
:::
