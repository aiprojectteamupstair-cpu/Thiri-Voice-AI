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

Desktop app and file control require the local Windows server. A Vercel function cannot operate the visitor's Windows desktop or keep files in the local `Thiri Output` folder.
