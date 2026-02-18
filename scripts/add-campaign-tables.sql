-- Add Campaign table
CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    sender TEXT NOT NULL,
    fromEmail TEXT NOT NULL,
    deliveryRate REAL DEFAULT 0,
    sentDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add EmailDelivery table
CREATE TABLE IF NOT EXISTS email_deliveries (
    id TEXT PRIMARY KEY,
    campaignId TEXT NOT NULL,
    seedEmailId TEXT NOT NULL,
    delivered BOOLEAN DEFAULT 0,
    inInbox BOOLEAN DEFAULT 0,
    inSpam BOOLEAN DEFAULT 0,
    headers TEXT, -- JSON stored as TEXT
    receivedAt DATETIME,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (seedEmailId) REFERENCES seed_emails(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_email_deliveries_campaign ON email_deliveries(campaignId);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_seed_email ON email_deliveries(seedEmailId);
CREATE INDEX IF NOT EXISTS idx_campaigns_sent_date ON campaigns(sentDate);
