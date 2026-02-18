import crypto from "crypto"

// Get encryption key from environment variable
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || ""

if (!ENCRYPTION_KEY) {
  console.warn(
    "WARNING: ENCRYPTION_KEY environment variable is not set. Sensitive data will not be properly encrypted.",
  )
}

// Algorithm
const ALGORITHM = "aes-256-cbc"

/**
 * Encrypt a string
 */
export function encrypt(text: string): string {
  if (!ENCRYPTION_KEY) return text // Return plaintext if no key is set

  try {
    // Create an initialization vector
    const iv = crypto.randomBytes(16)

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv)

    // Encrypt the text
    let encrypted = cipher.update(text, "utf8", "hex")
    encrypted += cipher.final("hex")

    // Return iv + encrypted data
    return `${iv.toString("hex")}:${encrypted}`
  } catch (error) {
    console.error("Encryption error:", error)
    return text // Return plaintext on error
  }
}

/**
 * Decrypt a string
 */
export function decrypt(encryptedText: string): string {
  if (!ENCRYPTION_KEY || !encryptedText.includes(":")) return encryptedText

  try {
    // Split iv and encrypted data
    const [ivHex, encrypted] = encryptedText.split(":")

    // Convert iv from hex to Buffer
    const iv = Buffer.from(ivHex, "hex")

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv)

    // Decrypt the text
    let decrypted = decipher.update(encrypted, "hex", "utf8")
    decrypted += decipher.final("utf8")

    return decrypted
  } catch (error) {
    console.error("Decryption error:", error)
    return "**DECRYPTION_ERROR**"
  }
}
