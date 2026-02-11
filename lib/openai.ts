import { createOpenAI } from "@ai-sdk/openai"

// Configure OpenAI to use Vercel's AI Gateway
// The gateway handles authentication, so we use a placeholder API key
export const openai = createOpenAI({
  baseURL: "https://gateway.ai.cloudflare.com/v1/cfai/openai",
  apiKey: process.env.OPENAI_API_KEY || "placeholder-key-for-gateway",
  compatibility: "strict",
})
