# Paid User Seats Implementation

## Overview
Added support for custom/manual subscriptions where you can set a specific number of paid seats, preventing automatic billing for additional seats until that threshold is exceeded.

## Problem Solved
Previously, if you manually created a Stripe subscription for a client with 9 users but only 1 user was in the system, adding the remaining 8 users would trigger automatic billing for additional seats. This system now prevents that by allowing you to pre-define the total paid seats.

## Changes Made

### 1. Database Schema
**New Column:** `paidUserSeats` (optional integer)
- Location: `Client` table
- Purpose: Tracks total seats already paid for in custom/manual subscriptions
- When set, the system only charges for seats beyond this number
- When null/not set, uses standard calculation (base plan seats + additional purchased seats)

**Migration Script:** `/scripts/add-paid-user-seats-column.sql`
- Run this in Neon to add the column

### 2. Stripe Billing Logic (`lib/stripe-user-seats.ts`)
**Updated behavior:**
- If `paidUserSeats` is set: Only charges for users beyond `paidUserSeats`
- If `paidUserSeats` is null: Uses standard calculation (Pro plan = 3 base seats, then $50/seat)

**Example:**
```
Scenario 1 - Custom subscription:
- paidUserSeats = 9 (you charged them for 9 seats upfront with discount)
- Current users = 5
- Additional seats billed = 0 (5 < 9, within paid limit)

Scenario 2 - When they exceed:
- paidUserSeats = 9
- Current users = 11
- Additional seats billed = 2 (11 - 9 = 2 seats @ $50/month each = $100/month)

Scenario 3 - Standard Pro subscription:
- paidUserSeats = null (not set)
- Current users = 5
- Additional seats billed = 2 (5 - 3 base seats = 2 @ $50/month)
```

### 3. Invite Validation (`app/api/users/invite/route.tsx`)
**Updated behavior:**
- Checks `paidUserSeats` if set, uses that as seat limit
- Otherwise uses standard calculation (userSeatsIncluded + additionalUserSeats)
- Blocks invites if current user count >= seat limit
- Returns clear error message with current usage

## Usage Instructions

### For Custom/Manual Subscriptions:
1. Create custom Stripe subscription/product for the client
2. Update Client record in database:
   ```sql
   UPDATE "Client" 
   SET 
     "paidUserSeats" = 9,  -- Total seats they paid for
     "stripeSubscriptionId" = 'sub_xxx',
     "stripeCustomerId" = 'cus_xxx'
   WHERE id = 'client-id';
   ```
3. System will now:
   - Allow up to 9 users without additional charges
   - Only bill for seats beyond 9 at $50/month each
   - Block invites once seat limit is reached

### For Standard Subscriptions:
1. Leave `paidUserSeats` as null (default)
2. System uses normal billing:
   - Pro plan: 3 included seats, $50/month per additional seat
   - Enterprise: 999 seats (effectively unlimited)
   - Other plans: 1 seat

## Important Notes

1. **Seat Price:** Confirmed at $50/month per additional seat (not $15)
2. **CSV Example:** The NRCC client has:
   - `paidUserSeats`: null (uses standard 999 for enterprise)
   - `additionalUserSeats`: 6
   - `totalUsers`: 9
   - This works because enterprise plan includes 999 base seats
3. **Automatic Billing:** When users exceed `paidUserSeats`, Stripe automatically prorates and charges
4. **Seat Validation:** Invite endpoint blocks new invites if seat limit reached

## Testing

1. Set `paidUserSeats` to 5 for a test client
2. Add 5 users - should work fine
3. Try to add 6th user - should be blocked with error message
4. Check Stripe - should show no additional seat charges (if under limit)
5. If they need more seats, either:
   - Increase `paidUserSeats` manually
   - Let automatic billing kick in for seats beyond limit
