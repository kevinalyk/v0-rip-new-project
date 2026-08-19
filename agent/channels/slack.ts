import { connectSlackCredentials } from "@vercel/connect/eve"
import { defaultSlackAuth, slackChannel } from "eve/channels/slack"

// One Slack connector serves every client's workspace install (Connect
// resolves the right bot token per event). Client isolation happens in our
// own data layer via `SlackIntegration.teamId`, not via separate connectors.
export default slackChannel({
  credentials: connectSlackCredentials("slack/rip-tool"),
  onAppMention(ctx, message) {
    if (!message.author) return null
    return { auth: defaultSlackAuth(message, ctx) }
  },
  onDirectMessage(ctx, message) {
    if (!message.author) return null
    return { auth: defaultSlackAuth(message, ctx) }
  },
})
