/**
 * Matches partially-masked phone numbers where the area code and prefix are already
 * masked with placeholder characters but the last 4 digits are still shown, e.g.
 * "XXX-XXX-6680", "(XXX) XXX-6680", "xxx.xxx.6680", "XXXXXX6680", "***-***-6680".
 *
 * Intentionally scoped to numbers that are ALREADY partially masked (a run of masking
 * characters in the area code + prefix position). A whole/complete phone number written
 * out in full digits (e.g. "555-123-6680") is not matched here - that's a different
 * redaction concern and out of scope for this pattern.
 */
export const MASKED_PHONE_REGEX = /\(?[Xx*]{3}\)?[-.\s]?[Xx*]{3}[-.\s]?\d{4}\b/g

/**
 * Replace partially-masked phone numbers (see MASKED_PHONE_REGEX) with "[Omitted Number]"
 * so the last 4 digits aren't left exposed in message text.
 */
export function redactMaskedPhoneNumbers(message: string): string {
  return message.replace(MASKED_PHONE_REGEX, "[Omitted Number]")
}
