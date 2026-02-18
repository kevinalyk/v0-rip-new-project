-- Add Campaign table (PostgreSQL version)
CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    sender TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "deliveryRate" REAL DEFAULT 0,
    "sentDate" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add EmailDelivery table (PostgreSQL version)
CREATE TABLE IF NOT EXISTS email_deliveries (
    id TEXT PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "seedEmailId" TEXT NOT NULL,
    delivered BOOLEAN DEFAULT FALSE,
    "inInbox" BOOLEAN DEFAULT FALSE,
    "inSpam" BOOLEAN DEFAULT FALSE,
    headers JSONB, -- PostgreSQL native JSON type
    "receivedAt" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_campaign FOREIGN KEY ("campaignId") REFERENCES campaigns(id) ON DELETE CASCADE,
    CONSTRAINT fk_seed_email FOREIGN KEY ("seedEmailId") REFERENCES "SeedEmail"(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_email_deliveries_campaign ON email_deliveries("campaignId");
CREATE INDEX IF NOT EXISTS idx_email_deliveries_seed_email ON email_deliveries("seedEmailId");
CREATE INDEX IF NOT EXISTS idx_campaigns_sent_date ON campaigns("sentDate");
