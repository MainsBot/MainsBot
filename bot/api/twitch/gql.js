import fetch from "node-fetch";

const TWITCH_GQL_ENDPOINT = "https://gql.twitch.tv/gql";
const TWITCH_GQL_PUBLIC_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

function normalizeAuthToken(value) {
  return String(value || "")
    .trim()
    .replace(/^oauth:/i, "")
    .replace(/^bearer\\s+/i, "");
}

export async function twitchGqlCall({ ops, oauthToken } = {}) {
  const token = normalizeAuthToken(oauthToken);
  if (!token) throw new Error("twitchGqlCall: missing oauthToken");

  const res = await fetch(TWITCH_GQL_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `OAuth ${token}`,
      "client-id": TWITCH_GQL_PUBLIC_CLIENT_ID,
      "content-type": "application/json",
    },
    body: JSON.stringify(Array.isArray(ops) ? ops : [ops]),
  });

  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, text };
}

export async function setFreeformTags({
  oauthToken,
  contentId,
  tags = [],
} = {}) {
  const safeContentId = String(contentId || "").trim();
  if (!safeContentId) throw new Error("setFreeformTags: missing contentId");
  const safeTags = Array.isArray(tags) ? tags.map((t) => String(t || "").trim()).filter(Boolean) : [];

  return twitchGqlCall({
    oauthToken,
    ops: [
      {
        operationName: "EditBroadcastContext_FreeformTagsMutation",
        variables: {
          input: {
            contentID: safeContentId,
            contentType: "CHANNEL",
            freeformTagNames: safeTags,
          },
        },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash:
              "8aaac5a848941ff6a26bacb44b6b251909c77b84f39ce6eced8f4c694036fc08",
          },
        },
      },
    ],
  });
}

