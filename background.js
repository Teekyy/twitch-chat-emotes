// Fetches 7TV / BTTV / FFZ emote lists for a channel and hands them to the content script.
const TTL = 10 * 60 * 1000;
const cache = new Map();

// Cached for TTL, but dropped if any request failed so a hiccup doesn't stick.
async function memo(key, build) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const ctx = { failed: false };
  const value = build(ctx);
  cache.set(key, { at: Date.now(), value });
  try {
    const list = await value;
    if (ctx.failed) cache.delete(key);
    return list;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

// A 404 means "no such channel/emotes" and is a valid empty answer, not a failure.
async function getJSON(url, init) {
  const res = await fetch(url, { credentials: "omit", ...init });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const soft = (ctx, promise) =>
  promise.catch(() => {
    ctx.failed = true;
    return null;
  });

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

const globalEmotes = () =>
  memo("global", async (ctx) => {
    const [s, b, f] = await Promise.all([
      soft(ctx, getJSON("https://7tv.io/v3/emote-sets/global")),
      soft(ctx, getJSON("https://api.betterttv.net/3/cached/emotes/global")),
      soft(ctx, getJSON("https://api.frankerfacez.com/v1/set/global")),
    ]);
    // Later entries win, so list lowest priority first.
    return [...fromFfz(f?.sets, f?.default_sets ?? []), ...fromBttv(b), ...from7tv(s)];
  });

async function twitchIdVia7tv(ctx, login) {
  const data = await soft(
    ctx,
    getJSON("https://7tv.io/v3/gql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "query($q:String!){users(query:$q){username connections{id platform}}}",
        variables: { q: login },
      }),
    })
  );
  const user = data?.data?.users?.find((u) => u.username.toLowerCase() === login);
  return user?.connections?.find((c) => c.platform === "TWITCH")?.id ?? null;
}

const channelEmotes = (login) =>
  memo(`channel:${login}`, async (ctx) => {
    const ffzRoom = await soft(ctx, getJSON(`https://api.frankerfacez.com/v1/room/${login}`));
    const id = ffzRoom?.room?.twitch_id ?? (await twitchIdVia7tv(ctx, login));
    if (!id) return [];
    const [s, b] = await Promise.all([
      soft(ctx, getJSON(`https://7tv.io/v3/users/twitch/${id}`)),
      soft(ctx, getJSON(`https://api.betterttv.net/3/cached/users/twitch/${id}`)),
    ]);
    const ffz = ffzRoom ? fromFfz(ffzRoom.sets, [ffzRoom.room.set]) : [];
    return [...ffz, ...fromBttv(b?.sharedEmotes), ...fromBttv(b?.channelEmotes), ...from7tv(s?.emote_set)];
  });

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (sender.id !== browser.runtime.id || msg?.type !== "emotes") return undefined;
  const login = String(msg.login ?? "").toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(login)) return [];
  const [g, c] = await Promise.all([globalEmotes(), channelEmotes(login)]);
  return [...g, ...c];
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
