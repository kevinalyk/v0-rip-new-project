const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");

function getAuthenticatedClient(accessToken) {
  const client = Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });

  return client;
}

async function getInboxMessages(accessToken) {
  const client = getAuthenticatedClient(accessToken);
  const messages = await client.api("/me/mailfolders/inbox/messages").top(5).get();
  return messages.value;
}

module.exports = { getInboxMessages };
ss
