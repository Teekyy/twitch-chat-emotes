// Swaps emote names in Twitch chat text for emote images (7TV, BTTV, FFZ).
const FRAGMENT = "span.text-fragment:not([data-ce])";
const RESERVED = new Set(["videos", "directory", "settings", "subscriptions", "wallet", "inventory", "drops", "friends", "downloads", "turbo", "jobs", "search", "store", "p", "u"]);
const WRAPPERS = new Set(["popout", "embed", "moderator"]);

let login = null;
let emotes = null; // Map of name -> { url, zw }, null until loaded
const dataUrls = new Map();

function channelFromPath(path) {
  const parts = path.split("/").filter(Boolean);
  const name = WRAPPERS.has(parts[0]) ? parts[1] : parts[0];
  return name && !RESERVED.has(name) && /^\w{1,25}$/.test(name) ? name.toLowerCase() : null;
}

// Fallback when the page's CSP blocks the CDN: fetch as the extension and inline the bytes.
function toDataUrl(url) {
  if (!dataUrls.has(url)) {
    const p = fetch(url)
      .then((r) => r.blob())
      .then((b) => new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(b);
      }));
    p.catch(() => dataUrls.delete(url));
    dataUrls.set(url, p);
  }
  return dataUrls.get(url);
}

function makeImg(name, meta) {
  const img = document.createElement("img");
  img.className = "ce-emote";
  img.alt = name;
  img.title = name;
  img.src = meta.url;
  img.addEventListener("error", () => toDataUrl(meta.url).then((d) => { img.src = d; }).catch(() => {}), { once: true });
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
  if (!emotes?.size) return;
  if (root.matches?.(FRAGMENT)) render(root);
  root.querySelectorAll?.(FRAGMENT).forEach(render);
}

async function load(name) {
  login = name;
  emotes = null;
  if (!name) return;
  try {
    const list = await browser.runtime.sendMessage({ type: "emotes", login: name });
    if (login !== name) return;
    emotes = new Map(list);
    scan(document.body);
  } catch (err) {
    console.warn("[chat-emotes] could not load emotes", err);
  }
}

new MutationObserver((records) => {
  for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) scan(n);
}).observe(document.body, { childList: true, subtree: true });

// Twitch is a single-page app, so watch for channel changes by polling the URL.
setInterval(() => {
  const name = channelFromPath(location.pathname);
  if (name !== login) load(name);
}, 1000);
load(channelFromPath(location.pathname));
