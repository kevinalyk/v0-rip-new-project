# Cursor-Based Pagination for Unwrap Links Cron Job

## Problem
The unwrap-links cron job was re-processing the same 100 most recent campaigns every 15 minutes, never reaching older or newer campaigns that needed processing.

## Solution
Implemented cursor-based pagination with persistent state storage to incrementally process all campaigns.

## Implementation Steps

### 1. Run Database Migration
Execute the SQL migration in Neon:
```sql
-- File: scripts/add-cron-job-state-table.sql
```

This creates the `CronJobState` table to store cursor positions.

### 2. Update Prisma Schema
The `CronJobState` model has been added to `prisma/schema.prisma`:
```prisma
model CronJobState {
  id                    Int       @id @default(autoincrement())
  jobName               String    @unique
  lastProcessedEmailId  Int?
  lastProcessedSmsId    Int?
  lastRunAt             DateTime?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([jobName])
}
```

After running the SQL migration, run:
```bash
npx prisma generate
```

### 3. How It Works

**Cursor-Based Processing:**
1. Cron fetches or creates state record for "unwrap-links" job
2. Queries campaigns with `id > lastProcessedEmailId` (cursor)
3. Processes up to 100 campaigns per run
4. Updates cursor to last processed campaign ID
5. Next run continues from where it left off

**Automatic Reset:**
- When no more campaigns are found (reached the end), cursor resets to null
- Next run starts from the beginning, picking up any new campaigns
- Creates a continuous cycle through the database

**Benefits:**
- Every campaign gets processed exactly once per cycle
- No re-processing of already-handled campaigns
- New campaigns are guaranteed pickup on next cycle
- Processes database incrementally without overload

### 4. Monitoring

Check logs for cursor state:
```
[v0] Unwrap Links Cron: Current cursor state: { lastProcessedEmailId: 12345, lastProcessedSmsId: 678 }
[v0] Unwrap Links Cron: Updated email cursor to 12445
[v0] Unwrap Links Cron: Reached end of campaigns, resetting cursor to start over
```

Query current state:
```sql
SELECT * FROM "CronJobState" WHERE "jobName" = 'unwrap-links';
```

### 5. Manual Reset (if needed)

To reset cursors and start from beginning:
```sql
UPDATE "CronJobState" 
SET "lastProcessedEmailId" = NULL, "lastProcessedSmsId" = NULL 
WHERE "jobName" = 'unwrap-links';
```
