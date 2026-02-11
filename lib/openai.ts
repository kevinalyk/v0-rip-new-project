import { createOpenAI } from "@ai-sdk/openai"

// Vercel AI Gateway is used by default - no custom configuration needed
// Just use model strings like "gpt-4o-mini" and the gateway handles authentication
export const openai = createOpenAI({
  compatibility: "strict",
})
