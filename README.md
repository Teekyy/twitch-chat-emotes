# twitch-chat-emotes

Firefox extension that shows 7TV, BetterTTV and FrankerFaceZ emotes in Twitch chat. Global and channel emotes, including zero-width overlays. No account or API key needed.

## Install

1. Clone this repo:
   ```bash
   git clone https://github.com/Teekyy/twitch-chat-emotes.git
   ```
2. In Firefox, open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on** and select `manifest.json` from the cloned folder.
4. Open a Twitch channel.

Temporary add-ons are removed when Firefox restarts, so repeat steps 2–3 after a restart.

## Privacy

Runs only on `www.twitch.tv`. It requests emote lists and images from `7tv.io`, `api.betterttv.net`, `api.frankerfacez.com` and their CDNs. Those sites can see your IP and which channel you opened. No analytics, no other network calls, no remote code.

## Files

- `background.js` fetches and merges the emote lists.
- `content.js` and `content.css` swap emote names in chat for images.
