# Reporting Phase 3

## Overview

Split the current single "Reporting" view into two distinct reports: **Trends** and **Inboxing**. The nav item currently labeled "Reporting" becomes "Trends", and a new "Inboxing" nav item is added alongside it.

---

## 1. Nav Bar Changes

- Rename the existing "Reporting" nav item to **"Trends"**
- Add a new nav item: **"Inboxing"**
- Both live under the same Reports section in the sidebar

---

## 2. Trends Report Changes

These are changes to the existing reporting view (now called Trends):

### Remove
- Remove the **Email Placement pie chart** (moving it to the Inboxing report)
- Remove the **disclaimer banner** at the top of the report

### Add
- Add a new **"Content by Hour of Day"** chart
  - Same concept as the existing "Day of Week" bar chart but bucketed by hour (0–23)
  - Include a **heat map** overlay or separate heat map showing which hours are busiest
  - Data source: `dateReceived` field on campaigns, grouped by hour

---

## 3. NEW: Inboxing Report

A brand new report page focused entirely on email placement/deliverability. **Email data only — no SMS.**

### Filters
- Date range (required)
- State filter (optional — may not add much value but available)

### Charts (top to bottom)

#### A. Overall Deliverability (Pie Chart)
- Move the existing Email Placement pie chart here
- Rename label to **"Overall Deliverability"**
- Shows inbox % vs spam % for the selected date range

#### B. Inbox Rate Over Time (Line Chart)
- Simple line chart to the right of the pie chart
- Shows **inbox rate vs spam rate** over time with a **moving average**
- X-axis: date, Y-axis: percentage

#### C. Inbox Rate by Party (Line Chart)
- 4 lines total:
  - Republican inbox rate
  - Republican spam rate
  - Democrat inbox rate
  - Democrat spam rate
- By day (same structure as the existing "Content Volume Over Time" chart)
- Note: If 4 lines gets too cluttered, simplify to just inbox rate per party (2 lines) since spam = 100 - inbox

#### D. Inbox Rate by Platform (Line Chart)
- One line per donation/send platform:
  - ActBlue
  - WinRed
  - Anedot
  - PSQ (PoliticalSurveyQuestions / similar)
- By day
- Same simplification note as above — inbox rate only if busy

#### E. House File vs Third-Party Inbox Rate (Line Chart)
- Two lines:
  - House file sends inbox rate
  - Third-party sends inbox rate
- Determined by the existing `assignmentMethod` / `isThirdParty` logic already on campaigns

---

## Data Notes

- All charts use the existing `inboxCount` and `spamCount` columns on `CompetitiveInsightCampaign`
- Inbox rate = `inboxCount / (inboxCount + spamCount)` — consistent with the fix already made to the analytics API
- Platform detection uses `ctaLinks` to identify which platform (ActBlue, WinRed, Anedot, PSQ) is present
- Party data comes from the assigned entity's `party` field
- Third-party detection uses the existing `isThirdParty` flag / `assignmentMethod` logic

---

## Files Likely Affected

- `components/sidebar.tsx` — rename "Reporting" nav item, add "Inboxing" nav item
- `app/[clientSlug]/reports/reporting/page.tsx` — rename/repurpose as Trends
- `app/[clientSlug]/reports/inboxing/page.tsx` — new page
- `app/api/ci/analytics/route.ts` — extend to support inboxing-specific queries
- `components/reporting-content.tsx` — remove placement chart and disclaimer
- `components/ci-analytics-view.tsx` — add hour-of-day chart
- New component: `components/inboxing-report-content.tsx`
