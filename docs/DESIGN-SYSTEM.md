# Design system

The visual contract of `apps/web`: the internal app (recruiters and generalist HR people, not only technical users) and the public careers pages (candidates). Anyone touching the interface follows it. If an exception is needed, update this file first.

Code cites it as `DESIGN-SYSTEM.md §n`.

## 1. Principles

The direction is editorial and crisp: precise, warm in tone. Intensity dials: app variance 5, motion 4, density 4; public pages 6 / 4 / 3.

1. **Transparency is the visual hero.** Salary, process stages and response times are the most prominent content, never a footnote.
2. **One accent.** Cobalt (`primary`) means action, link and selection. It does not decorate.
3. **Numbers matter.** Large figures, tabular numerals (`figure`), never buried in sentences.
4. **Cards only for real hierarchy.** A panel groups what is read together; everything else sits on the background, separated by space or a border.
5. **Copy:** natural language, short sentences, no em or en dashes (use a hyphen, comma, colon or two sentences). The product name comes from `usePlatform()`, never typed by hand.

## 2. Tokens

Defined in `app/assets/css/tailwind.css`.

### 2.1 Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#F6F7F9` | `#0E1013` | page background |
| `card` / `popover` | `#FDFDFE` | `#15181D` / `#1A1D23` | panels, menus, dialogs |
| `foreground` | `#111318` | `#ECEEF2` | text |
| `muted-foreground` | `#596070` | `#9AA1AD` | secondary text |
| `muted` / `secondary` | `#EDEFF3` / `#ECEEF2` | `#1B1F25` / `#1F232A` | neutral fills, neutral pills, hover |
| `border` / `input` | `#E3E6EB` / `#D2D7DE` | `#252A31` / `#323842` | borders, field border |
| `primary` | `#1F47D6` (hover `#1A3CB8`) | `#7D9BFF` (hover `#96AFFF`) | main action, links |
| `primary-foreground` | `#F6F7F9` | `#0B1020` | text on primary |
| `accent` / `accent-foreground` | `#E8EDFD` / `#1A3BB8` | `#18213D` / `#A9BDFF` | active item, selection |
| `success` / `-soft` | `#1E6B4B` / `#E4F2EB` | `#7CCBA2` / `#132620` | state only |
| `warning` / `-soft` | `#8A5300` / `#FAF0DC` | `#E2B864` / `#2A2213` | state only |
| `destructive` / `-soft` | `#B3261E` / `#FBEAE8` | `#F2938A` / `#2C1615` | errors, destructive actions |
| `inverse` (+ `-foreground`, `-muted`, `-accent`) | `#111318` | `#15181D` | promise panel (auth) |
| `sidebar` | `#F0F2F5` | `#111317` | app sidebar |
| `overlay` | ink at 42% | near black at 70% | behind dialogs and drawers |

Never pure `#000` or `#fff`. Shadows (`shadow-xs` to `shadow-lg`) are tinted with the cool hue of the background (`--shadow-color`).

### 2.2 Measured contrast (WCAG 2.x, AA requires 4.5:1)

| Pair | Light | Dark |
|---|---|---|
| foreground on background | 17.33 | 16.40 |
| foreground on card | 18.28 | 15.32 |
| muted-foreground on background | 5.88 | 7.33 |
| muted-foreground on card | 6.20 | 6.84 |
| muted-foreground on muted | 5.47 | 6.36 |
| muted-foreground on sidebar | 5.62 | 7.15 |
| muted-foreground on popover | 6.20 | 6.49 |
| primary button label | 6.68 | 7.22 |
| primary as link on background | 6.68 | 7.26 |
| accent-foreground on accent (active nav) | 7.61 | 8.62 |
| success on success-soft | 5.58 | 8.24 |
| warning on warning-soft | 5.59 | 8.43 |
| destructive on destructive-soft | 5.61 | 7.56 |
| destructive button label | 6.10 | 8.50 |
| inverse-muted on inverse | 8.51 | 6.84 |
| inverse-accent (numbers 01 02 03) on inverse | 7.08 | 6.78 |

Text with reduced opacity (`text-muted-foreground/70` and similar) does **not** pass. Do not use it for readable text.

### 2.3 Type scale

Geist (variable) for everything, Geist Mono only for ids, slugs and code. Self-hosted through `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` 5.3.0 (`font-display: swap`). Comparable figures: class `figure` (or `tabular-nums`).

| Role | Classes | Where |
|---|---|---|
| display | `text-5xl` / `text-[8rem]` `font-semibold tracking-tighter` | error code, overview numbers |
| h1 | `text-3xl font-semibold tracking-tight` (mobile `text-[1.75rem]`) | page title, one per page |
| h2 | `text-lg` or `text-base font-semibold tracking-tight` | sections |
| h3 | `text-[0.9375rem] font-medium` | list rows, steps |
| body | `text-sm` (app), `text-[0.9375rem]` / `text-base` (public, descriptions) | |
| small | `text-xs text-muted-foreground` | metadata, times |
| label | `text-sm font-medium` (`Label` component) | forms |

Headings use `text-wrap: balance`, paragraphs `pretty` (in the CSS base).

### 2.4 Radius, spacing, icons

- **Radius:** controls (buttons, inputs, selects) `rounded-md` = 8px. Cards, panels, dialogs, menus, toasts `rounded-lg` / `rounded-xl` = 14px. Items inside menus `rounded-md` within a `p-1.5` (concentric). Pills and badges `rounded-full`.
- **Spacing:** Tailwind 4px scale. Inside a panel `px-5 py-5` (`sm:px-6`); between page sections `gap-8`; between form fields `gap-5`; list rows `py-3.5` / `py-4`. App layout: content `max-w-6xl`, gutter `px-4 sm:px-6 lg:px-10`.
- **Icons:** `@lucide/vue` only, stroke 1.5 set once with `setLucideProps` (`app.vue`, `error.vue`). Sizes: 16px (`size-4`) in controls, 18px in navigation, 20px in the menu button.

### 2.5 Motion

One easing, `ease-snap` = `cubic-bezier(0.16, 1, 0.3, 1)`. Durations: 150ms for hover and press, 200ms dialogs and menus, 300ms drawers. Buttons: `active:scale-[0.98]`. Menus and dialogs enter with a fade plus zoom 0.98, no bounce. Skeletons use `animate-shimmer`, which stops under `motion-reduce`. `prefers-reduced-motion` zeroes animations and transitions globally. Switching theme does not animate colours.

## 3. Components

Base components live in `app/components/ui/*`.

| Component | When |
|---|---|
| `Button` `default` | the main action of the view, only one |
| `Button` `outline` / `secondary` | secondary actions |
| `Button` `ghost` | tertiary actions, toolbars, icons |
| `Button` `destructive` | confirming an irreversible action (inside a dialog) |
| `Button` `link` | inline links that behave as actions |
| `Input`, `Textarea` | text fields; `card` background, focus shows a primary border plus a faint ring |
| `NativeSelect` | **every** `<select>`: same height and states as `Input`, with chevron |
| `Label` + `FormField` | label above, help below in muted, error below in destructive (`role="alert"`) |
| `Badge` | pill: `secondary` neutral (roles), `default` cobalt tint (agent, selection), `success` / `warning` / `destructive` for state only, `outline` muted |
| `Card` | panel with real hierarchy |
| `Dialog` | confirmations and short forms; never long content |
| `Sheet` (`SheetContent side`) | side drawer: mobile navigation, panels |
| `DropdownMenu` | action menus, organization switcher, user menu |
| `Table` | comparable tabular data (ads). For people and events prefer lists |
| `Skeleton` | loading, with the **shape** of the final content |
| `Toaster` (sonner) | outcome of an action, bottom right, at most 3 |
| `Avatar` | initials on `accent`; people other than you on `secondary` |
| `Separator` | separate groups without creating a panel |

App components: `AppPage` (top bar plus main column), `AppTopBar`, `AppBreadcrumbs`, `AppNavPanel`, `PageHeader` (icon tile, title, pill, meta, actions, tabs), `UnderlineTabs`, `OrgSwitcher`, `UserMenu`, `FormAlert`. Overview: `StatCard`, `ChartEmpty` and one card per statistic in `components/dashboard/`.

## 4. Patterns

- **Page header:** `PageHeader`, detailed in §5.3. No eyebrow text above titles.
- **Empty states:** say what to do next, with direct links to the actions the role allows (see `FirstSteps`). Dashed border only for simple empties.
- **Loading:** a skeleton that mirrors the layout (list rows with a circle and two lines; number columns). During a refetch the content stays visible at 60% opacity.
- **Errors:** `FormAlert` plus a "Retry" button. Never invented or partial numbers in place of an error. Error page: large code in muted, title, explanation, "Back to start" (and "Retry" if it is not a 404).
- **Forms:** label above, field, help below, error below in place of the help. General error above the submit button. Full-width submit in narrow forms (auth, panels).
- **Lists of people and events:** row with avatar, name in `font-medium`, detail in muted, pill or time on the right.
- **Ad status pills** (`statusTone` in `lib/job-view.ts`): draft = `secondary` (neutral), published = `success`, closed = `outline` (muted). The same code in the overview dots.
- **Layout:** app with a navigation panel from `lg` (see §5), a drawer (`Sheet`) opened from the menu button below. Auth uses an asymmetric split from `lg` (form left, `inverse` panel with the three principles right), form only on mobile. Public pages: `max-w-3xl` column, header and footer aligned.
- **Responsive:** no horizontal scroll at 375px. Wide tables scroll inside their container.

## 5. App structure

The structural model, in words: a pipeline board of fixed-width columns on a soft background, one per stage, each with a header (state, name, count, menu) and compact candidate cards; a single sidebar navigation with titled sections, icon items with counts, the organization switcher on top and the user menu at the bottom; a candidate profile with a header (avatar, stage, status), a dense key-value list, attachments as cards and tabs for details, notes and history. Dragging lifts a card with a dashed placeholder and an insertion line in the destination column.

### 5.1 Shell (`layouts/app.vue`)

- **Navigation panel** (`AppNavPanel`, `w-64`, the only menu): logo (product initial on `primary`) and product name, `OrgSwitcher`, then sections with a title in `text-xs font-medium text-muted-foreground` (never small caps) and items (`h-9`, icon, label, count on the right in a `figure` pill with `ring-1 ring-border`). A count is shown only when it is a real number (Ads = published, from `GET /api/v1/stats/jobs`); screen readers hear "6 published". Items respect permissions (`navSections` in `lib/permissions-ui.ts`); the most specific one is active (`activeNavId`). At the bottom, above a border: the public careers page (globe, opens in a new tab) and the user menu.
- **One menu only.** No icon rail next to the panel: two menus with the same items confuse. The panel does not collapse.
- **Page:** inset panel (`lg:m-2 lg:rounded-xl lg:border lg:shadow-xs`, `background` fill) over the `sidebar` surface. Content `max-w-6xl`, `max-w-7xl` for the overview (`AppPage wide`).
- **Below `lg`:** the panel disappears; the menu button in the top bar opens a drawer with the panel, language, theme and user menu at the bottom.

### 5.2 Top bar and breadcrumbs (`AppTopBar`, `AppBreadcrumbs`)

- Every app page uses `AppPage`, which provides the top bar (`sticky top-0`, `min-h-14`, bottom border, `background/90` fill with blur) and the `main`.
- **Breadcrumbs** on the left: parents as links in `muted-foreground`, `/` separator, current page in `font-medium` with `aria-current="page"`. On a phone only the last step remains. Examples: `Selection / Ads`, `Ads / Data Engineer`, `Organization / Members`.
- **Secondary actions** on the right (slot `actions`): `ghost size="sm"` buttons with an icon (careers page, templates, history). Actions that must stay reachable while scrolling live here (in the editor: save state, what is missing, Save, Publish, the ... menu). Then, separated by a border, language and theme. On a phone the actions go on their own row below the breadcrumbs.

### 5.3 Page header (`PageHeader`)

- **Icon tile**, optional: `size-12 rounded-xl bg-foreground text-background`, 22px icon. Ink, not cobalt: it identifies, it is not clickable.
- **Title** h1 with the **status pill** next to it (slot `badge`, `JobStatusBadge`). Below, a **meta row** (slot `meta`) in `text-sm text-muted-foreground`, items separated by a thin vertical bar (`text-input`): role, "Updated on ...", "Published on ...". Alternatively a one-line description.
- **Actions** on the right (wrapping on mobile): the primary one last. An avatar stack of the selection team appears only when per-ad teams exist, never as a placeholder.
- **Tabs** (slot `tabs`) close the header.

### 5.4 Underline tabs (`UnderlineTabs`)

- A group of buttons with `aria-pressed` and an `aria-label` on the group; they switch view or filter in place (ad list by status, editor Edit/Preview below `xl`).
- Item: 16px icon, `text-sm font-medium` label, optional count in a `figure` pill (active `accent`, otherwise `muted`). Selected = 2px bottom border in `primary`; the rest `muted-foreground`, hover `foreground`. Full-width `border-b` baseline.
- On a phone they scroll sideways inside themselves, never the page. When tabs lead to different pages (Candidates, Ad, Discussion, Agenda) they become links with `aria-current="page"`, same look (`LinkTabs`).

### 5.5 Pipeline board

- **Page:** the ad's header as above (tile, title, "Published" pill, meta "Published on ... | Answer within N days"), tabs `Candidates 12 | Ad | Activity`. Right of the tabs: search, Filter (`outline`), the primary action and the view switcher (board, list) as an icon button group.
- **Columns** = the stages declared in the ad (`PRODUCT.md §4.1`), in the same order. Fixed width `w-80`, `muted/60` fill, `rounded-xl p-2`, horizontal scroll of the board only. Header: stage status dot (8px, one colour per stage *type* from the neutral scale plus cobalt for the active stage; never decorative colours), name `font-semibold`, count in a `figure` pill, the ... menu on the right. The assistant's help for the stage ("Ask the assistant") lives there too; it works on the process and does not rank people.
- **Candidate card:** `bg-card rounded-lg border p-4 shadow-xs`, 12px inner gap.
  1. 36px avatar (initials on `secondary`), name `font-medium`, declared level below in `muted`; ... menu top right.
  2. Meta rows with a 16px icon in `muted-foreground`: years of experience, current company, response deadline. No scores and no "match": the product has none by design (`PRODUCT.md §2.4`).
  3. Separator, then the footer: relative time of last activity on the left, counters on the right (attachments, notes) with icon and `figure`. The response deadline, when near, is the only colour: `warning`, then `destructive` once past.
- **Dragging:** the grabbed card lifts (`shadow-lg`, 2 degree rotation, `cursor-grabbing`), a dashed placeholder stays in its place; the destination column shows a 2px `primary` line where it will drop. Keyboard: space to pick up, arrows to move, space to drop, Esc to cancel, with an `aria-live` announcement of the destination stage. Under `prefers-reduced-motion` no rotation and no return animation. Moving never sends messages by itself: it asks for confirmation (`PRODUCT.md §5.3`).

### 5.6 Candidate detail

- **Top bar:** `Candidates / Name`, secondary actions Export data (GDPR rights), share, the ... menu. Opened from a card it appears as a wide side panel (`Sheet side="right"`, `max-w-2xl`) with a button to open it full page.
- **Header:** 64px avatar, name h1, below two rows with icons: "Stage: Technical interview" (stage as a `primary` link), "Status: In progress" (state colour). On the right a secondary action and the primary "Move to" with a stage menu.
- **Key-value list:** grid `grid-cols-[12rem_1fr]` (one column on phones), label with icon in `muted-foreground`, value in `foreground`. Ads applied to as `secondary` pills with the ad code. Long text truncated at three lines with "show all".
- **Attachment:** card `rounded-lg border p-3` with file-type icon, name `font-medium`, below "1.5 MB · 26 Jul 2026, 13:22" in `muted`, ... menu. The original CV is always viewable (`PRODUCT.md §3.1`).
- **Tabs:** Details, Notes (count), History, Agenda; the assistant as the last tab with its own icon, never coloured like an action.

### 5.7 Notes feed

- **Composer** on top: author avatar plus an `Input` "Write a note"; on the right the keyboard hint (`kbd` "N to add a note"). Submit with Ctrl/Cmd+Enter.
- **Note:** 36px avatar, name `font-medium` plus a team-role pill (`secondary`, e.g. "Recruiter"), the company role below in `muted`. On the right the stage it was written in (dot plus name) and date and time in `figure`. Text `text-sm` / `text-[0.9375rem]`, `pretty`. Attachments as `rounded-lg border` thumbnails with the name truncated in the middle. Notes separated by `divide-y`, no card per note.
- Notes are internal: never visible to the candidate, and the composer says so.

## 6. Charts (overview)

- **Library:** `@unovis/vue` + `@unovis/ts` 1.7.1 (exact versions, `apps/web` only), the same one shadcn-vue charts build on. Always inside `<ClientOnly>` with a fallback of the same height.
- **Data:** only from the `getJobStats` use case (`GET /api/v1/stats/jobs`, `JobStatsDto` validated with Zod). No invented, estimated or sample numbers: with no data there is an empty state (`ChartEmpty`), and candidate metrics are declared "coming soon" until they exist.
- **Colours:** main series `primary`, others `--chart-neutral`; `success`, `warning` and `input` only to encode a state (ad status, below threshold). The `--vis-*` variables are bound to the tokens on `.tt-chart` (unovis injects its defaults on `:root`), so both themes work without redrawing.
- **Card:** `StatCard` with title `text-sm font-semibold`, hint in `text-xs muted`, key figure `text-3xl` / `text-4xl` `figure`, then the chart. Bento grid on 12 columns from `lg` with cells of different sizes (5/7, 7/5, 8/4, 12), one column below.
- **Accessibility:** every chart is `aria-hidden` and has a text alternative (`sr-only` table in the card, or the legend itself as a `dl`). HTML tooltips always pass user text through `escapeHtml`. `tabular-nums` figures on the axes too.
- **Motion:** 450ms duration, zero under `prefers-reduced-motion` (`usePreferredReducedMotion`).
- **Shapes:** composition by state = donut with the total in the centre; series over time = grouped bars with crosshair; score against threshold = horizontal bars with a dashed threshold line; range = horizontal bar from minimum to maximum with dashed medians; short rankings = list with HTML bars.

## 7. Accessibility rules

- Text contrast meets WCAG 2.x AA (4.5:1) in both themes using the pairs in §2.2. No reduced-opacity text.
- Every control is reachable and operable by keyboard; focus is always visible (primary border plus ring on fields).
- Drag and drop has a full keyboard equivalent with live announcements (§5.5).
- Errors use `role="alert"`; counts and states are announced in words ("6 published"), not by colour alone.
- Charts are `aria-hidden` and always have a text alternative (§6).
- `prefers-reduced-motion` removes animation and transitions globally.
- No horizontal page scroll at 375px.
- Current page and pressed states use `aria-current` and `aria-pressed`.

## 8. Do not

- Purple, glow, decorative gradients, gradient text.
- Three identical cards in a row as "features"; use a split panel or a list.
- Eyebrow text above every heading.
- Decorative dots: a dot exists only when it encodes a state.
- Em dash or en dash in visible text, including ranges (`45,000 € - 60,000 €`). A test on the language files checks it.
- Everything centred. Left-align by default; centre only a short empty state.
- Fake screenshots made of divs, stock photos, decorative illustrations.
- State colours used to decorate, or cobalt used for something that cannot be clicked or selected.
- `#000`, `#fff`, black shadows, `shadow-2xl`.
