// Swaps emote names in Twitch chat text for emote images (7TV, BTTV, FFZ).
const FRAGMENT = "span.text-fragment:not([data-ce])";
const RESERVED = new Set(["videos", "directory", "settings", "subscriptions", "wallet", "inventory", "drops", "friends", "downloads", "turbo", "jobs", "search", "store", "p", "u"]);
const WRAPPERS = new Set(["popout", "embed", "moderator"]);

let login = null;
let emotes = null; // Map of name -> { url, zw }, null until loaded
let enabled = null; // null until the saved setting is read

function channelFromPath(path) {
  const parts = path.split("/").filter(Boolean);
  const name = WRAPPERS.has(parts[0]) ? parts[1] : parts[0];
  return name && !RESERVED.has(name) && /^\w{1,25}$/.test(name) ? name.toLowerCase() : null;
}

function makeImg(name, meta) {
  const img = document.createElement("img");
  img.className = "ce-emote";
  img.alt = name;
  img.title = name;
  img.src = meta.url;
  return img;
}

function render(fragment) {
  const wrap = document.createElement("span");
  wrap.className = "ce-text";
  let found = false;
  let prev = null; // last emote element, so a zero-width emote can overlay it
  let gap = null; // whitespace node after prev

  for (const part of fragment.textContent.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      gap = document.createTextNode(part);
      wrap.append(gap);
      continue;
    }
    const meta = emotes.get(part);
    if (!meta) {
      wrap.append(part);
      prev = gap = null;
      continue;
    }
    found = true;
    const img = makeImg(part, meta);
    if (meta.zw && prev) {
      gap?.remove();
      if (!prev.classList.contains("ce-stack")) {
        const stack = document.createElement("span");
        stack.className = "ce-stack";
        prev.replaceWith(stack);
        stack.append(prev);
        prev = stack;
      }
      prev.append(img);
    } else {
      wrap.append(img);
      prev = img;
    }
    gap = null;
  }

  fragment.dataset.ce = found ? "1" : "0";
  if (found) {
    fragment.classList.add("ce-hidden");
    fragment.after(wrap);
  }
}

function scan(root) {
  if (enabled !== true || !emotes?.size) return;
  if (root.matches?.(FRAGMENT)) render(root);
  root.querySelectorAll?.(FRAGMENT).forEach(render);
}

// Undo every replacement so chat shows the original text again.
function restore() {
  document.querySelectorAll(".ce-text").forEach((el) => el.remove());
  document.querySelectorAll("[data-ce]").forEach((el) => {
    el.classList.remove("ce-hidden");
    delete el.dataset.ce;
  });
}

// Lowest priority first; later layers win when names collide.
const SOURCES = ["ffz", "bttv", "7tv"];
const PARTS = ["global", "channel"];
let layers = {};

function rebuild() {
  const list = [];
  for (const part of PARTS) for (const src of SOURCES) list.push(...(layers[`${part}:${src}`] ?? []));
  emotes = new Map(list);
  document.querySelectorAll('[data-ce="0"]').forEach((el) => delete el.dataset.ce);
  scan(document.body);
}

// Every list loads on its own and a failed one is retried alone, so a slow source never holds up the rest.
async function loadList(name, src, part, attempt = 0) {
  try {
    const list = await browser.runtime.sendMessage({ type: "emotes", source: src, part, login: name });
    if (login !== name) return;
    layers[`${part}:${src}`] = list;
    rebuild();
  } catch (err) {
    console.warn(`[chat-emotes] could not load ${src} ${part} emotes`, err);
    if (attempt < 5) setTimeout(() => login === name && loadList(name, src, part, attempt + 1), 5000);
  }
}

function load(name) {
  login = name;
  emotes = null;
  layers = {};
  if (name) for (const src of SOURCES) for (const part of PARTS) loadList(name, src, part);
}

function applySetting(value) {
  enabled = value !== false;
  if (enabled) scan(document.body);
  else restore();
}

browser.storage.local.get("enabled").then((s) => applySetting(s.enabled));
browser.storage.onChanged.addListener((changes) => {
  if (changes.enabled) applySetting(changes.enabled.newValue);
});

new MutationObserver((records) => {
  for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) scan(n);
}).observe(document.body, { childList: true, subtree: true });

// Twitch is a single-page app, so watch for channel changes by polling the URL.
setInterval(() => {
  const name = channelFromPath(location.pathname);
  if (name !== login) load(name);
}, 1000);
load(channelFromPath(location.pathname));
