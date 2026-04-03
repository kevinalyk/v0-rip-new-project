/**
 * API Redaction Utilities
 * Sanitizes data before returning via public API endpoints
 * Ensures no sensitive information is exposed
 */

interface CtaLink {
  url?: string;
  type?: string;
  finalUrl?: string;
  strippedFinalUrl?: string;
}

interface SanitizedCtaLink {
  url: string;
  type?: string;
}

/**
 * Sanitize a single CTA link
 * Priority: strippedFinalUrl > finalUrl > url
 * This prevents exposure of tracking parameters while maintaining the core link
 */
export function sanitizeCtaLink(link: CtaLink): SanitizedCtaLink {
  const url = link.strippedFinalUrl || link.finalUrl || link.url;
  
  if (!url) {
    throw new Error("CTA link must have at least one URL field");
  }

  return {
    url,
    ...(link.type && { type: link.type }),
  };
}

/**
 * Sanitize an array of CTA links
 */
export function sanitizeCtaLinks(links: unknown): SanitizedCtaLink[] {
  if (!links) return [];
  
  try {
    const linksArray = Array.isArray(links) ? links : JSON.parse(String(links));
    return linksArray
      .map((link) => sanitizeCtaLink(link))
      .filter((link) => link.url); // Remove any invalid links
  } catch (error) {
    console.error("[v0] Error sanitizing CTA links:", error);
    return [];
  }
}

/**
 * Sanitize a CompetitiveInsightCampaign for public API
 * Only expose explicitly allowed fields
 */
export function sanitizeCampaign(campaign: any) {
  return {
    id: campaign.id,
    senderName: campaign.senderName,
    senderEmail: campaign.senderEmail,
    subject: campaign.subject,
    dateReceived: campaign.dateReceived,
    inboxCount: campaign.inboxCount,
    spamCount: campaign.spamCount,
    inboxRate: campaign.inboxRate,
    ctaLinks: sanitizeCtaLinks(campaign.ctaLinks),
    tags: campaign.tags ? (Array.isArray(campaign.tags) ? campaign.tags : JSON.parse(String(campaign.tags))) : [],
    emailContent: campaign.emailContent,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
    entityId: campaign.entityId,
    shareViewCount: campaign.shareViewCount,
    donationPlatform: campaign.donationPlatform,
  };
}

/**
 * Sanitize an SmsQueue message for public API
 * Only expose explicitly allowed fields
 */
export function sanitizeSms(sms: any) {
  return {
    id: sms.id,
    phoneNumber: sms.phoneNumber, // Sender short code (e.g., "88022")
    message: sms.message,
    createdAt: sms.createdAt,
    entityId: sms.entityId,
    ctaLinks: sanitizeCtaLinks(sms.ctaLinks),
    shareViewCount: sms.shareViewCount,
  };
}

/**
 * Sanitize a CiEntity for public API
 * Only expose explicitly allowed fields
 */
export function sanitizeEntity(entity: any) {
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    description: entity.description || null,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    party: entity.party || null,
    state: entity.state || null,
    // Include tag names if available
    tags: entity.tags
      ? entity.tags.map((tag: any) => tag.tagName).filter(Boolean)
      : [],
  };
}

/**
 * Sanitize a campaign with its related entity
 */
export function sanitizeCampaignWithEntity(campaign: any) {
  const sanitized = sanitizeCampaign(campaign);
  
  return {
    ...sanitized,
    entity: campaign.entity ? sanitizeEntity(campaign.entity) : null,
  };
}

/**
 * Sanitize an SMS with its related entity
 */
export function sanitizeSmsWithEntity(sms: any) {
  const sanitized = sanitizeSms(sms);
  
  return {
    ...sanitized,
    entity: sms.entity ? sanitizeEntity(sms.entity) : null,
  };
}
