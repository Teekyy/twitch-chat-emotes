# twitch-chat-emotes

Firefox extension that shows 7TV, BetterTTV and FrankerFaceZ emotes in Twitch chat. Global and channel emotes, including zero-width overlays. No account or API key needed.

## Install

Requires Firefox 140 or newer.

1. Download the `.xpi` file from the [latest release](https://github.com/Teekyy/twitch-chat-emotes/releases/latest).
2. Drag it into a Firefox window, or open `about:addons`, click the gear icon and choose **Install Add-on From File**.
3. Click **Add** when Firefox asks for permission.
4. Open a Twitch channel.

The file is signed by Mozilla, so it stays installed after restarts.

## Privacy

Runs only on `www.twitch.tv`. It requests emote lists and images from `7tv.io`, `api.betterttv.net`, `api.frankerfacez.com` and their CDNs. Those sites can see your IP and which channel you opened. No analytics, no other network calls, no remote code.

## Development

To run from source, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and select `manifest.json`. It is removed when Firefox restarts.

- `background.js` fetches and merges the emote lists.
- `content.js` and `content.css` swap emote names in chat for images.
