# Competitive Insights Performance Optimization Plan

## Executive Summary

**Current Problem:** Loading campaigns page takes 4+ seconds, with frequent timeouts on page 3+ when filtering by donation platform (PSQ, WinRed, etc.)

**Root Cause:** The API fetches up to 10,000 records (5,000 emails + 5,000 SMS) into memory, then filters by donation platform in JavaScript, then paginates with `slice()`.

**Expected Result:** Load times reduced from 4+ seconds to <500ms by implementing database-level filtering and proper pagination.

---

## Current Architecture Analysis

### Database Schema
```
CompetitiveInsightCampaign
├── id (indexed)
├── senderEmail (indexed)
├── subject (indexed)
├── entityId (indexed)
├── dateReceived (indexed)
├── ctaLinks (JSON - NOT indexed)
├── isDeleted (NOT indexed)
├── isHidden (NOT indexed)
└── source (NOT indexed)

SmsQueue
├── id (indexed)
├── entityId (indexed)
├── createdAt (indexed)
├── ctaLinks (JSON - NOT indexed)
├── processed (NOT indexed)
├── isDeleted (NOT indexed)
└── isHidden (NOT indexed)
```

### Current Query Flow (Lines 188-396 in route.ts)
1. Determine if donation platform filter is set
2. If yes: Fetch 5,000 emails + 5,000 SMS (10,000 records total)
3. Load ALL related entity data + tags into memory
4. Parse JSON fields (ctaLinks, tags)
5. Filter in JavaScript by checking if ctaLinks contains platform domain
6. Sort combined results in JavaScript
7. Paginate with `slice(skip, skip + limit)`
8. Return 10 records (after processing 10,000)

**Result:** 4.26 seconds to return page 3 with PSQ filter

---

## Optimization Strategy (Phased Approach)

### Phase 1: Quick Wins (No Schema Changes)
**Timeline:** 1-2 hours
**Risk Level:** LOW
**Expected Impact:** 70-80% reduction in load time

#### Step 1.1: Remove the "Fetch All" Logic
**File:** `app/api/competitive-insights/route.ts` (Lines 188-272)

**Change:**
```typescript
// REMOVE THIS:
const shouldFetchAll = donationPlatform && donationPlatform !== "all"
const fetchAllForCombining = messageType === "all" || !messageType
const SAFETY_LIMIT = 5000

// ALWAYS use skip/take:
const emailInsights = await prisma.competitiveInsightCampaign.findMany({
  where: emailWhere,
  skip,
  take: limit,
  orderBy: { dateReceived: 'desc' }
})
```

**Tradeoff:** This will break donation platform filtering temporarily (will return 0 results). That's OK - we fix it in Step 1.2.

**Testing:**
- Test without donation platform filter - should be FAST
- Test with donation platform filter - will show 0 results (expected)

---

#### Step 1.2: Use PostgreSQL JSON Operators
**File:** `app/api/competitive-insights/route.ts` (Lines 144-176)

**Add to WHERE clause:**
```typescript
if (donationPlatform && donationPlatform !== "all") {
  const platformDomains: Record<string, string[]> = {
    winred: ["winred.com", "secure.winred.com"],
    actblue: ["actblue.com", "secure.actblue.com"],
    anedot: ["anedot.com"],
    psq: ["psqimpact.com", "secure.psqimpact.com"],
    ngpvan: ["ngpvan.com", "click.ngpvan.com", "secure.ngpvan.com"],
  }
  
  const domains = platformDomains[donationPlatform] || []
  
  // Add to emailWhere
  emailWhere.ctaLinks = {
    path: '$[*].finalUrl',
    array_contains: domains
  }
  
  // Add to smsWhere
  smsWhere.ctaLinks = {
    path: '$[*].finalUrl',
    array_contains: domains
  }
}
```

**Note:** This uses Prisma's JSON filter operators. The exact syntax may need adjustment based on testing.

**Testing:**
- Test each platform filter individually
- Verify correct campaigns are returned
- Check performance with `console.log` timestamps

---

#### Step 1.3: Remove JavaScript Filtering
**File:** `app/api/competitive-insights/route.ts` (Lines 346-385)

**Delete entire block:**
```typescript
// DELETE THIS:
if (donationPlatform && donationPlatform !== "all") {
  const platformDomains = {...}
  allInsights = allInsights.filter((insight) => {...})
}
```

**Testing:**
- Results should match Step 1.2
- No duplicate filtering

---

#### Step 1.4: Fix Total Count
**File:** `app/api/competitive-insights/route.ts` (Lines 387-396)

**Problem:** `totalCount = allInsights.length` only counts in-memory results

**Fix:**
```typescript
// Instead of: const totalCount = allInsights.length
// Do separate count queries:

let totalCount = 0
if (messageType === "all" || !messageType) {
  const [emailCount, smsCount] = await Promise.all([
    prisma.competitiveInsightCampaign.count({ where: emailWhere }),
    prisma.smsQueue.count({ where: smsWhere })
  ])
  totalCount = emailCount + smsCount
} else if (messageType === "email") {
  totalCount = await prisma.competitiveInsightCampaign.count({ where: emailWhere })
} else {
  totalCount = await prisma.smsQueue.count({ where: smsWhere })
}
```

**Testing:**
- Verify pagination shows correct total pages
- Navigate to last page to confirm

---

### Phase 2: Database Optimizations (Schema Changes)
**Timeline:** 2-3 hours
**Risk Level:** MEDIUM
**Expected Impact:** Additional 20-30% improvement

#### Step 2.1: Add Composite Indexes
**File:** `scripts/32-add-performance-indexes.sql`

```sql
-- For competitive insights campaigns
CREATE INDEX idx_campaign_common_filters 
ON "CompetitiveInsightCampaign"("isDeleted", "isHidden", "dateReceived" DESC)
WHERE "isDeleted" = false;

CREATE INDEX idx_campaign_entity_date 
ON "CompetitiveInsightCampaign"("entityId", "dateReceived" DESC)
WHERE "isDeleted" = false AND "isHidden" = false;

CREATE INDEX idx_campaign_source 
ON "CompetitiveInsightCampaign"("source", "dateReceived" DESC);

-- For SMS
CREATE INDEX idx_sms_common_filters 
ON "SmsQueue"("processed", "isDeleted", "isHidden", "createdAt" DESC)
WHERE "isDeleted" = false;

CREATE INDEX idx_sms_entity_date 
ON "SmsQueue"("entityId", "createdAt" DESC)
WHERE "processed" = true AND "isDeleted" = false AND "isHidden" = false;
```

**Testing:**
- Run in dev environment first
- Check query plans with `EXPLAIN ANALYZE`
- Monitor for any index bloat

---

#### Step 2.2: Add GIN Index for JSON Search
**File:** `scripts/32-add-performance-indexes.sql`

```sql
-- For fast JSON searching on ctaLinks
CREATE INDEX idx_campaign_cta_links_gin 
ON "CompetitiveInsightCampaign" USING gin (("ctaLinks"::jsonb));

CREATE INDEX idx_sms_cta_links_gin 
ON "SmsQueue" USING gin (("ctaLinks"::jsonb));
```

**Purpose:** Makes JSON filtering in Step 1.2 much faster

**Testing:**
- Query should use GIN index in EXPLAIN ANALYZE
- Donation platform filters should be fast

---

### Phase 3: Add Donation Platform Column (Long-term Solution)
**Timeline:** 3-4 hours
**Risk Level:** MEDIUM-HIGH
**Expected Impact:** 90%+ improvement (best solution)

#### Step 3.1: Add Column to Schema
**File:** `scripts/33-add-donation-platform.sql`

```sql
-- Add donation platform column
ALTER TABLE "CompetitiveInsightCampaign" 
ADD COLUMN "donationPlatform" TEXT;

ALTER TABLE "SmsQueue" 
ADD COLUMN "donationPlatform" TEXT;

-- Add indexes
CREATE INDEX idx_campaign_donation_platform 
ON "CompetitiveInsightCampaign"("donationPlatform", "dateReceived" DESC);

CREATE INDEX idx_sms_donation_platform 
ON "SmsQueue"("donationPlatform", "createdAt" DESC);
```

**Testing:**
- Verify column added successfully
- Check indexes are created

---

#### Step 3.2: Backfill Existing Data
**File:** `scripts/34-backfill-donation-platforms.ts`

```typescript
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function backfillDonationPlatforms() {
  const platformDomains = {
    winred: ["winred.com", "secure.winred.com"],
    actblue: ["actblue.com", "secure.actblue.com"],
    anedot: ["anedot.com"],
    psq: ["psqimpact.com", "secure.psqimpact.com"],
    ngpvan: ["ngpvan.com", "click.ngpvan.com"],
  }

  // Process campaigns in batches
  let processed = 0
  const batchSize = 100

  while (true) {
    const campaigns = await prisma.competitiveInsightCampaign.findMany({
      where: { donationPlatform: null },
      take: batchSize,
      select: { id: true, ctaLinks: true }
    })

    if (campaigns.length === 0) break

    for (const campaign of campaigns) {
      let platform = null
      const ctaLinks = campaign.ctaLinks || []
      
      for (const [platformName, domains] of Object.entries(platformDomains)) {
        for (const link of ctaLinks) {
          const url = typeof link === 'string' ? link : link.finalUrl || link.url || ''
          if (domains.some(d => url.toLowerCase().includes(d))) {
            platform = platformName
            break
          }
        }
        if (platform) break
      }

      await prisma.competitiveInsightCampaign.update({
        where: { id: campaign.id },
        data: { donationPlatform: platform }
      })
    }

    processed += campaigns.length
    console.log(`Processed ${processed} campaigns...`)
  }

  // Process SMS similarly
  // ... (same logic for SmsQueue)
  
  console.log("Backfill complete!")
}

backfillDonationPlatforms()
```

**Testing:**
- Run on subset first
- Verify platforms are detected correctly
- Check NULL vs actual platform distribution

---

#### Step 3.3: Update Campaign Detection
**File:** `lib/ci-entity-utils.ts` (where campaigns are created)

**Add to campaign creation:**
```typescript
// After detecting CTA links, determine platform
function detectDonationPlatform(ctaLinks: any[]): string | null {
  const platformDomains = {
    winred: ["winred.com", "secure.winred.com"],
    actblue: ["actblue.com", "secure.actblue.com"],
    anedot: ["anedot.com"],
    psq: ["psqimpact.com", "secure.psqimpact.com"],
    ngpvan: ["ngpvan.com", "click.ngpvan.com"],
  }

  for (const [platform, domains] of Object.entries(platformDomains)) {
    for (const link of ctaLinks) {
      const url = typeof link === 'string' ? link : link.finalUrl || link.url || ''
      if (domains.some(d => url.toLowerCase().includes(d))) {
        return platform
      }
    }
  }
  return null
}

// When creating campaign:
await prisma.competitiveInsightCampaign.create({
  data: {
    // ... existing fields
    donationPlatform: detectDonationPlatform(ctaLinks)
  }
})
```

**Testing:**
- Create new test campaigns
- Verify platform is set correctly
- Check null for non-donation emails

---

#### Step 3.4: Update API Route
**File:** `app/api/competitive-insights/route.ts`

**Replace JSON filtering with simple column filter:**
```typescript
if (donationPlatform && donationPlatform !== "all") {
  emailWhere.donationPlatform = donationPlatform
  smsWhere.donationPlatform = donationPlatform
}
```

**Testing:**
- Test all donation platform filters
- Verify performance improvement
- Check pagination works correctly

---

### Phase 4: Additional Optimizations
**Timeline:** 2-3 hours
**Risk Level:** LOW
**Expected Impact:** 10-20% improvement (mostly UX)

#### Step 4.1: Optimize Data Transfer
**File:** `app/api/competitive-insights/route.ts`

**Only select needed fields:**
```typescript
select: {
  id: true,
  senderName: true,
  senderEmail: true,
  subject: true,
  dateReceived: true,
  inboxRate: true,
  inboxCount: true,
  spamCount: true,
  notDeliveredCount: true,
  ctaLinks: true,
  emailPreview: true,
  entityId: true,
  isHidden: true,
  entity: {
    select: {
      id: true,
      name: true,
      type: true,
      party: true,
      state: true,
      tags: {
        where: { clientId: authResult.user.clientId! },
        select: { tagName: true, tagColor: true }
      }
    }
  }
  // Don't fetch emailContent, resultIds, etc.
}
```

**Testing:**
- Frontend should still work
- Check for missing fields

---

#### Step 4.2: Parallel Queries
**File:** `app/api/competitive-insights/route.ts`

```typescript
// Instead of sequential queries:
const [emailInsights, smsMessages, emailCount, smsCount] = await Promise.all([
  messageType !== "sms" ? prisma.competitiveInsightCampaign.findMany(emailQuery) : Promise.resolve([]),
  messageType !== "email" ? prisma.smsQueue.findMany(smsQuery) : Promise.resolve([]),
  messageType !== "sms" ? prisma.competitiveInsightCampaign.count({ where: emailWhere }) : Promise.resolve(0),
  messageType !== "email" ? prisma.smsQueue.count({ where: smsWhere }) : Promise.resolve(0),
])
```

**Testing:**
- Verify counts match
- Check error handling

---

#### Step 4.3: Remove Client-Side Filtering
**File:** `components/competitive-insights.tsx` (Lines 378-447)

**Problem:** Frontend re-filters already filtered data

**Fix:** Remove duplicate filtering logic, trust API response

**Testing:**
- All filters should still work
- No visual changes

---

## Rollback Strategy

### If Phase 1 Breaks
1. Revert `app/api/competitive-insights/route.ts` to previous version
2. No database changes were made
3. Zero downtime

### If Phase 2 Breaks
1. Drop indexes: `DROP INDEX idx_campaign_common_filters;` etc.
2. Revert application code if needed
3. Minimal impact (indexes don't affect correctness)

### If Phase 3 Breaks
1. Stop using `donationPlatform` column in queries
2. Keep column (no harm in having it)
3. Revert to Phase 1 or 2 solution
4. Optionally drop column later

---

## Testing Checklist

### Functional Testing
- [ ] No donation platform filter works
- [ ] Each donation platform filter (winred, actblue, anedot, psq, ngpvan) works
- [ ] Message type filters (all, email, sms) work
- [ ] Search works with platform filters
- [ ] Party filter works with platform filters
- [ ] Tag filter works with platform filters
- [ ] Subscriptions-only filter works
- [ ] Date range filters work
- [ ] Pagination works (pages 1, 2, 3, last)
- [ ] Results are sorted by date (newest first)
- [ ] Total count is accurate
- [ ] Empty states show correctly

### Performance Testing
- [ ] Page 1 loads in <500ms
- [ ] Page 2 loads in <500ms
- [ ] Page 3 loads in <500ms
- [ ] No timeouts occur
- [ ] Database query time logged
- [ ] Memory usage acceptable

### Edge Cases
- [ ] No results found
- [ ] Only 1 result
- [ ] Exactly 10 results (1 page)
- [ ] 11 results (pagination boundary)
- [ ] Super admin sees hidden campaigns
- [ ] Regular users don't see hidden campaigns
- [ ] Free plan sees last 24 hours only
- [ ] Paid plan sees last 30 days

---

## Implementation Order

### Recommended Sequence

**Week 1 - Quick Wins:**
1. **Day 1 Morning:** Implement Phase 1 (Steps 1.1-1.4)
2. **Day 1 Afternoon:** Test thoroughly, fix any issues
3. **Day 2:** Deploy to production, monitor

**Week 2 - Database Optimization:**
4. **Day 1:** Implement Phase 2 (Steps 2.1-2.2)
5. **Day 2:** Test in staging, monitor query performance
6. **Day 3:** Deploy to production

**Week 3 - Long-term Solution:**
7. **Day 1-2:** Implement Phase 3 (Steps 3.1-3.2)
8. **Day 3:** Test backfill in staging
9. **Day 4:** Implement Steps 3.3-3.4
10. **Day 5:** Deploy to production

**Week 4 - Polish:**
11. **Day 1:** Implement Phase 4
12. **Day 2:** Final testing and monitoring

---

## Success Metrics

### Before Optimization
- Page 1: 2-3 seconds
- Page 2: 3-4 seconds
- Page 3: 4-5 seconds (timeouts)
- Timeout rate: 30-40%

### After Phase 1 (Target)
- Page 1: 0.5-1 second
- Page 2: 0.5-1 second
- Page 3: 0.5-1 second
- Timeout rate: 0%

### After Phase 2 (Target)
- Page 1: 0.3-0.5 seconds
- Page 2: 0.3-0.5 seconds
- Page 3: 0.3-0.5 seconds

### After Phase 3 (Target)
- Page 1: 0.2-0.3 seconds
- Page 2: 0.2-0.3 seconds
- Page 3: 0.2-0.3 seconds

---

## Risk Assessment

| Phase | Risk Level | Potential Issues | Mitigation |
|-------|-----------|------------------|------------|
| Phase 1 | LOW | JSON query syntax, temporary broken filtering | Quick rollback, test JSON operators |
| Phase 2 | MEDIUM | Index creation time, disk space | Run during low traffic, monitor |
| Phase 3 | MEDIUM-HIGH | Backfill errors, wrong platform detection | Test on subset, validate thoroughly |
| Phase 4 | LOW | Missing data in response | Include all needed fields |

---

## Questions to Answer Before Starting

1. **Do you want to implement all phases, or just Phase 1 first?**
   - Recommendation: Start with Phase 1, it's low risk and high impact

2. **What's your tolerance for temporary feature breakage?**
   - If low: Test each step in staging first
   - If high: Can move faster

3. **Can we afford database downtime for index creation?**
   - Indexes can be created concurrently with `CREATE INDEX CONCURRENTLY`
   - But this takes longer and uses more resources

4. **Do you want monitoring/logging for performance?**
   - Add `console.log` timestamps at key points
   - Or integrate with monitoring tool

5. **Should we keep the old filtering code as a fallback?**
   - Can add feature flag to switch between old/new
   - Good for A/B testing

---

## Next Steps

Once you approve this plan, I recommend:

1. **Review and adjust** - Any concerns or changes needed?
2. **Start with Phase 1** - Low risk, high impact
3. **Test in development** - Make sure it works
4. **Deploy to production** - Monitor closely
5. **Proceed to Phase 2** - Once Phase 1 is stable

Would you like me to start implementing Phase 1?
