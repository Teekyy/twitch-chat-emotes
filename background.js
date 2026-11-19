// Fetches 7TV / BTTV / FFZ emote lists and hands them to the content script, one list per request.
const TTL = 10 * 60 * 1000;
const TIMEOUT = 5000;
const cache = new Map();

// Cached for TTL per key; a failed request is dropped so the next ask tries again.
function memo(key, build) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = build();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}

// A 404 means "no such channel/emotes" and is a valid empty answer, not a failure.
async function fetchOnce(url, init) {
  const res = await fetch(url, { credentials: "omit", signal: AbortSignal.timeout(TIMEOUT), ...init });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// Each request retries once on its own.
async function getJSON(url, init) {
  try {
    return await fetchOnce(url, init);
  } catch {
    return fetchOnce(url, init);
  }
}

const abs = (u) => (u.startsWith("//") ? `https:${u}` : u);

// Each parser returns [name, { url, zw }] pairs; zw = zero-width overlay emote.
function from7tv(set) {
  const out = [];
  for (const e of set?.emotes ?? []) {
    const host = e.data?.host?.url;
    if (!host) continue;
    const zw = Boolean((e.flags & 1) || (e.data.flags & 256));
    out.push([e.name, { url: `${abs(host)}/2x.webp`, zw }]);
  }
  return out;
}

const fromBttv = (list) =>
  (list ?? []).map((e) => [e.code, { url: `https://cdn.betterttv.net/emote/${e.id}/2x.webp`, zw: Boolean(e.modifier) }]);

function fromFfz(sets, ids) {
  const out = [];
  for (const id of ids) {
    for (const e of sets?.[id]?.emoticons ?? []) {
      const u = e.urls?.["2"] ?? e.urls?.["1"];
      if (u) out.push([e.name, { url: abs(u), zw: false }]);
    }
  }
  return out;
}

const ffzRoom = (login) => memo(`ffz:room:${login}`, () => getJSON(`https://api.frankerfacez.com/v1/room/${login}`));

const idVia7tv = async (login) => {
  const data = await getJSON("https://7tv.io/v3/gql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "query($q:String!){users(query:$q){username connections{id platform}}}",
      variables: { q: login },
    }),
  });
  const user = data?.data?.users?.find((u) => u.username.toLowerCase() === login);
  return user?.connections?.find((c) => c.platform === "TWITCH")?.id ?? null;
};

// 7TV first; FFZ only if 7TV doesn't know the channel or fails.
const twitchId = (login) =>
  memo(`id:${login}`, async () => {
    try {
      const id = await idVia7tv(login);
      if (id) return id;
    } catch {}
    return (await ffzRoom(login))?.room?.twitch_id ?? null;
  });

// Each source has a global list and a channel list, requested separately; the page layers them by priority.
const sources = {
  "7tv": {
    global: async () => from7tv(await getJSON("https://7tv.io/v3/emote-sets/global")),
    channel: async (login) => {
      const id = await twitchId(login);
      return id ? from7tv((await getJSON(`https://7tv.io/v3/users/twitch/${id}`))?.emote_set) : [];
    },
  },
  bttv: {
    global: async () => fromBttv(await getJSON("https://api.betterttv.net/3/cached/emotes/global")),
    channel: async (login) => {
      const id = await twitchId(login);
      const d = id ? await getJSON(`https://api.betterttv.net/3/cached/users/twitch/${id}`) : null;
      return [...fromBttv(d?.sharedEmotes), ...fromBttv(d?.channelEmotes)];
    },
  },
  ffz: {
    global: async () => {
      const d = await getJSON("https://api.frankerfacez.com/v1/set/global");
      return fromFfz(d?.sets, d?.default_sets ?? []);
    },
    channel: async (login) => {
      const d = await ffzRoom(login);
      return d ? fromFfz(d.sets, [d.room.set]) : [];
    },
  },
};

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (sender.id !== browser.runtime.id || msg?.type !== "emotes") return undefined;
  const login = String(msg.login ?? "").toLowerCase();
  const source = Object.hasOwn(sources, msg.source) ? sources[msg.source] : null;
  if (!source || !/^[a-z0-9_]{1,25}$/.test(login)) return [];
  if (msg.part === "global") return memo(`${msg.source}:global`, source.global);
  if (msg.part === "channel") return memo(`${msg.source}:channel:${login}`, () => source.channel(login));
  return [];
});

// Toolbar button: click to switch replacement on or off; the icon shows the state.
async function refreshButton() {
  const { enabled } = await browser.storage.local.get("enabled");
  const on = enabled !== false;
  const name = on ? "icon" : "icon-off";
  browser.browserAction.setIcon({ path: { 16: `icons/${name}-16.png`, 32: `icons/${name}-32.png` } });
  browser.browserAction.setTitle({ title: `Twitch Chat Emotes: ${on ? "on" : "off"}` });
}

browser.browserAction.onClicked.addListener(async () => {
  const { enabled } = await browser.storage.local.get("enabled");
  await browser.storage.local.set({ enabled: enabled === false });
});
browser.storage.onChanged.addListener(refreshButton);
refreshButton();
