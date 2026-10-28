# Tracked links and sources

Every channel where you share an ad can have its own link. Reports then show, for each channel and campaign, how many
people opened the ad, how many applied and how many were hired.

## Build a link

Open a published ad, then its **Distribution** tab, then **Tracked links**.

1. Pick a channel: LinkedIn, Indeed, InfoJobs, Glassdoor, Facebook, Instagram, X, Newsletter, Referral, Career fair,
   University, or **Another channel** and type its name.
2. Optionally type a campaign, for example `autumn-2026`. Use the same campaign name on every channel of that campaign.
3. Press **Save link**. It goes under **Saved links**, where you find it every time you come back to the tab. Save
   as many as you need, one per channel and campaign: saving a pair you already have keeps the one you have.
4. Copy the link. It is the public address of the ad with two parameters added:

```text
https://jobs.example.com/careers/acme/backend-developer?utm_source=linkedin&utm_campaign=autumn-2026
```

Each saved link shows how many applications came through it and, with **See who applied through…**, who they are:
name, date and stage, with a link to the profile. Only the channel and the campaign are
saved, never the address: if the address of the ad changes, the saved links follow it. Removing a link changes no figure,
the applications that came through it keep their source. Saving and removing links takes the same permission as
publishing the ad, and both are written to the audit log.

Names are lowercased and limited to letters, numbers, dots, dashes and underscores (60 characters at most). The page
shows how your text will appear in Reports. An email address is never accepted as a name.

You can also add `?utm_source=...` and `&utm_campaign=...` by hand, or just `?ref=...`. A link with no parameters is
counted by the site that sent the visitor (for example `google.com`), and as **direct** when there is none.

## Visits and applications on the Distribution tab

Below the links, **Visits and applications** shows the ad day by day over the last 7, 30 or 90 days: visits are the
light bars, applications the dark bars inside them. In **Source** pick all sources, a saved link, a source or a campaign
to see it alone. Above the chart are three figures:

- **Visits** and **Applications** of the period.
- **Applications per 100 visits**: 20 means 20 applications for every 100 openings of the ad. It shows from 5 visits up;
  below that the tile says how many visits are needed instead of a figure that means nothing (one visit and one
  application do not make a rate).

The table below the chart has the same figures per source and campaign. Press a source to see it alone and to list who
applied through it. The list shows the people you also see on the pipeline of the ad, with the same permissions. Each
candidate's profile says where the application came from, for example **Came from: LinkedIn, campaign autumn-2026**, or
Direct, Import or Added by hand.

## What Reports show

In **Reports**, the **Sources** card lists every channel with the visits of the ad, the applications, the conversion
(applications per 100 visits) and the hires with their rate. Below it, **Campaigns** shows the same per channel and
campaign. The CSV export has a `sources` and a `campaigns` block with visits and conversion.

- Conversion needs at least 5 visits to be shown; below that it reads "too few for a rate". The hire rate shows from 5
  applications up.
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
