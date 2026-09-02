-- Message-level Slack alert filters (channel, house file/third party, party, state, entity type),
-- independent of the existing entity allow-list. All default to "all" (no restriction) so every
-- existing connected workspace keeps its current alert behavior until it explicitly narrows a filter.
ALTER TABLE "SlackIntegration"
  ADD COLUMN "messageTypeFilter" TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN "houseFileFilter" TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN "partyFilter" TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN "stateFilter" TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN "entityTypeFilter" TEXT NOT NULL DEFAULT 'all';

ALTER TABLE "SlackChannel"
  ADD COLUMN "messageTypeFilter" TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN "houseFileFilter" TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN "partyFilter" TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN "stateFilter" TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN "entityTypeFilter" TEXT NOT NULL DEFAULT 'all';
