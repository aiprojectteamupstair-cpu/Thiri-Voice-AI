<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/cfd9be36-ce25-4a1f-9e84-69d7afe216d0

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `OPENROUTER_API_KEY` in `.env` for Gemini chat, Chirp/Whisper transcription, and Gemini speech
3. Run the app:
   `npm run dev`

## Deploy on Vercel

The repository includes `api/index.ts` and `vercel.json` so the Vite site and Thiri's chat, transcription, and speech routes deploy together. In the Vercel project settings, add `OPENROUTER_API_KEY` to the Production and Preview environments, then redeploy. You can optionally set `APP_URL` to your deployed HTTPS URL. Keep the key server-side; do not use a `VITE_` prefix.

The configured models are Gemini 3 Flash Preview for chat, Gemini 3.1 Flash TTS Preview with the Zephyr voice, Chirp 3 for Burmese transcription, and Whisper Large V3 Turbo for English transcription. Check `/api/health` on the deployed site to see the active configuration. If Gemini speech fails, the app now shows the error instead of silently using a different browser voice.

## Control your Windows PC from the hosted site

The Vercel app cannot directly access Windows. Run Thiri Companion on the PC you want to control, then pair the hosted page with it. Commands execute on that PC; the browser sends its chat, voice, and file requests directly to the paired companion. Screenshots are not sent to OpenRouter.

1. On the Windows PC, run `npm run dev` and open `http://localhost:3003` (or the port you configured). Select **Pair devices** to see the pairing code. Keep this server running.
2. Install `cloudflared` from [Cloudflare's official downloads](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/). In a second PowerShell window run `powershell -ExecutionPolicy Bypass -File scripts/start-remote-access.ps1` and keep it running. It prints a temporary HTTPS `trycloudflare.com` URL.
3. On any device, open the deployed Thiri site, select **Connect PC**, and enter the tunnel URL and pairing code. The pairing lasts for that browser tab session. The PC must stay online with Thiri Companion and the tunnel running.

The tunnel exposes only port 3004, which requires the pairing code and accepts browser requests from the configured hosted origin. Port 3003 stays on Windows loopback. Set `THIRI_ALLOWED_ORIGIN` on the PC if your hosted site uses a different origin. For a stable URL and ongoing use, set up a named Cloudflare Tunnel instead of a temporary Quick Tunnel. [Cloudflare describes Quick Tunnels as testing tools](https://developers.cloudflare.com/tunnel/get-started/).
