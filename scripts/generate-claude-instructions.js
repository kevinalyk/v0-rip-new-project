const PDFDocument = require("pdfkit")
const fs = require("fs")
const path = require("path")

const doc = new PDFDocument({ margin: 50, size: "LETTER" })
const outputPath = path.join(__dirname, "../public/claude-digest-instructions.pdf")
doc.pipe(fs.createWriteStream(outputPath))

const RED = "#dc2a28"
const DARK = "#111111"
const GRAY = "#555555"
const LIGHT_GRAY = "#f5f5f5"
const BORDER = "#dddddd"

// ─── Header ───────────────────────────────────────────────────────────────────
doc.rect(0, 0, doc.page.width, 80).fill(RED)
doc
  .fillColor("#ffffff")
  .fontSize(22)
  .font("Helvetica-Bold")
  .text("Inbox.GOP", 50, 22)
doc
  .fillColor("rgba(255,255,255,0.85)")
  .fontSize(11)
  .font("Helvetica")
  .text("Intelligence Digest — Claude API Instructions", 50, 50)

doc.moveDown(3)

// ─── Helper functions ─────────────────────────────────────────────────────────
function sectionTitle(text) {
  doc
    .moveDown(0.8)
    .fillColor(RED)
    .fontSize(13)
    .font("Helvetica-Bold")
    .text(text)
    .moveDown(0.3)
    .moveTo(50, doc.y)
    .lineTo(doc.page.width - 50, doc.y)
    .strokeColor(RED)
    .lineWidth(0.5)
    .stroke()
    .moveDown(0.4)
}

function bodyText(text, opts = {}) {
  doc.fillColor(DARK).fontSize(10).font("Helvetica").text(text, { lineGap: 4, ...opts })
}

function label(text) {
  doc.fillColor(GRAY).fontSize(9).font("Helvetica-Bold").text(text, { continued: false })
}

function codeBlock(text) {
  const blockX = 50
  const blockW = doc.page.width - 100
  const startY = doc.y
  // measure height
  const textHeight = doc.heightOfString(text, { width: blockW - 24, fontSize: 8.5 })
  const blockH = textHeight + 20
  doc.rect(blockX, startY, blockW, blockH).fill(LIGHT_GRAY).stroke(BORDER)
  doc
    .fillColor("#333333")
    .fontSize(8.5)
    .font("Courier")
    .text(text, blockX + 12, startY + 10, { width: blockW - 24, lineGap: 3 })
  doc.moveDown(0.6)
}

// ─── Overview ─────────────────────────────────────────────────────────────────
sectionTitle("Overview")
bodyText(
  "You have access to the Inbox.GOP Intelligence Digest API. After writing a political article, publish it directly to the digest at the endpoint below using a POST request with Bearer token authentication."
)
doc.moveDown(0.5)
label("Endpoint")
codeBlock("POST https://app.rip-tool.com/api/v1/digest")
label("Authentication")
codeBlock("Authorization: Bearer <DIGEST_API_KEY>")
label("Content-Type")
codeBlock("Content-Type: application/json")

// ─── System Prompt Addition ───────────────────────────────────────────────────
sectionTitle("System Prompt Addition")
bodyText(
  "Add the following to Claude's system prompt so it knows when and how to use the tool:"
)
doc.moveDown(0.3)
codeBlock(
  `You have access to the Inbox.GOP Intelligence Digest API. When you write a political article, you can publish it directly to the digest at https://app.rip-tool.com/api/v1/digest using a POST request with Bearer token auth. Always include sources, relevant tags, a short summary, and clean semantic HTML in the body.`
)

// ─── Request Body Fields ──────────────────────────────────────────────────────
sectionTitle("Request Body Fields")

const fields = [
  ["title", "string", "Required", "Article headline"],
  ["summary", "string", "Required", "1–2 sentence summary shown on the list page"],
  ["body", "string", "Required", "Full article as HTML. Use <p>, <h2>, <h3>, <ul>, <li>, <strong>, <em>, <blockquote>. No inline styles."],
  ["imageUrl", "string", "Optional", "Public URL of a hero image"],
  ["imageBase64", "string", "Optional", "Base64-encoded image. Uploaded automatically to Blob storage. Use instead of imageUrl if you have raw image data."],
  ["sources", "array", "Optional", 'Array of { "label": "string", "url": "string" }. Always include when citing external content.'],
  ["tags", "array", "Optional", 'Array of strings e.g. ["economy", "immigration", "2026 elections"]'],
  ["slug", "string", "Optional", "Custom URL slug. Auto-generated from title if omitted."],
  ["publishedAt", "string", "Optional", "ISO 8601 datetime. Defaults to now if omitted."],
]

fields.forEach(([name, type, req, desc]) => {
  const rowY = doc.y
  doc.rect(50, rowY, doc.page.width - 100, 1).fill(BORDER)
  doc.moveDown(0.15)
  doc
    .fillColor(RED)
    .fontSize(9.5)
    .font("Courier-Bold")
    .text(name, 55, doc.y, { continued: true, width: 100 })
  doc
    .fillColor(GRAY)
    .fontSize(8.5)
    .font("Courier")
    .text(`  ${type}`, { continued: true })
  doc
    .fillColor(req === "Required" ? "#b45309" : GRAY)
    .fontSize(8)
    .font("Helvetica-Bold")
    .text(`  ${req}`, { continued: false })
  doc.fillColor(DARK).fontSize(9).font("Helvetica").text(desc, 55, doc.y, { width: doc.page.width - 120, lineGap: 2 })
  doc.moveDown(0.4)
})

// ─── Tool Definition JSON ─────────────────────────────────────────────────────
sectionTitle("Tool Definition (Claude Tool Use)")
bodyText("Provide this JSON as a tool definition in Claude's tool configuration:")
doc.moveDown(0.3)
codeBlock(`{
  "name": "publish_digest_article",
  "description": "Publishes a political intelligence article to the Inbox.GOP Intelligence Digest.",
  "input_schema": {
    "type": "object",
    "required": ["title", "body", "summary"],
    "properties": {
      "title":       { "type": "string" },
      "summary":     { "type": "string" },
      "body":        { "type": "string", "description": "Semantic HTML only. No inline styles." },
      "imageUrl":    { "type": "string" },
      "imageBase64": { "type": "string" },
      "sources": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "label": { "type": "string" },
            "url":   { "type": "string" }
          }
        }
      },
      "tags":        { "type": "array", "items": { "type": "string" } },
      "slug":        { "type": "string" },
      "publishedAt": { "type": "string" }
    }
  }
}`)

// ─── Example Request ──────────────────────────────────────────────────────────
sectionTitle("Example Request")
codeBlock(`POST https://app.rip-tool.com/api/v1/digest
Authorization: Bearer <DIGEST_API_KEY>
Content-Type: application/json

{
  "title": "Senate Republicans Pass Budget Framework",
  "summary": "The Senate passed a budget resolution 51-48, advancing Trump's tax and spending priorities.",
  "body": "<p>Senate Republicans passed...</p><h2>What This Means</h2><p>...</p>",
  "tags": ["budget", "senate", "2025-reconciliation"],
  "sources": [
    { "label": "Reuters", "url": "https://reuters.com/..." },
    { "label": "Politico", "url": "https://politico.com/..." }
  ]
}`)

// ─── Success Response ─────────────────────────────────────────────────────────
sectionTitle("Success Response (201)")
codeBlock(`{
  "id": "cuid...",
  "slug": "senate-republicans-pass-budget-framework",
  "url": "https://app.rip-tool.com/digest/senate-republicans-pass-budget-framework"
}`)

// ─── Notes ────────────────────────────────────────────────────────────────────
sectionTitle("Important Notes")
const notes = [
  "Never hardcode the DIGEST_API_KEY — pass it as an environment variable in Claude's runtime context.",
  "Body HTML must be clean semantic tags only. No inline styles, no <script>, no <iframe>.",
  "Always include sources when citing external articles, polls, or statements.",
  "The slug is auto-generated from the title if omitted — no need to provide it manually.",
  "If both imageUrl and imageBase64 are provided, imageBase64 takes precedence.",
  "publishedAt defaults to the current time if not provided.",
]
notes.forEach((n, i) => {
  doc
    .fillColor(DARK)
    .fontSize(10)
    .font("Helvetica")
    .text(`${i + 1}.  ${n}`, 50, doc.y, { width: doc.page.width - 100, lineGap: 4 })
  doc.moveDown(0.3)
})

// ─── Footer ───────────────────────────────────────────────────────────────────
doc.moveDown(2)
doc
  .moveTo(50, doc.y)
  .lineTo(doc.page.width - 50, doc.y)
  .strokeColor(BORDER)
  .lineWidth(0.5)
  .stroke()
doc
  .moveDown(0.4)
  .fillColor(GRAY)
  .fontSize(8.5)
  .font("Helvetica")
  .text("Inbox.GOP — Intelligence Digest API  |  app.rip-tool.com", { align: "center" })

doc.end()
console.log("PDF written to:", outputPath)
