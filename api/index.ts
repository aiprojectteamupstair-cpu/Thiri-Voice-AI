import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { timingSafeEqual } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

dotenv.config();

const PORT = Number(process.env.PORT) || 3003;

const FAST_CHAT_MODEL = 'openai/gpt-5.6-luna';
const THINKING_CHAT_MODEL = 'openai/gpt-5.6-terra';
const TTS_MODEL = 'google/gemini-3.1-flash-tts-preview';
const TTS_VOICE = 'Zephyr';

const retryableAudioStatuses = new Set([429, 500, 502, 503, 504, 524, 529]);

async function requestOpenRouterAudio<T>(
  endpoint: 'speech' | 'transcriptions',
  payload: object,
  readResponse: (response: globalThis.Response) => Promise<T>,
  res: Response,
): Promise<T | undefined> {
  const body = JSON.stringify(payload);
  for (let attempt = 0; attempt < 2; attempt++) {
    let retryDelay = 750 + Math.random() * 500;
    try {
      const response = await fetch(`https://openrouter.ai/api/v1/audio/${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || `http://localhost:${PORT}`,
          'X-OpenRouter-Title': 'Nandar AI Voice Assistant',
        },
        body,
        signal: AbortSignal.timeout(25000),
      });
      if (response.ok) return await readResponse(response);

      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        const seconds = Number(retryAfter);
        const wait = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
        if (Number.isFinite(wait)) retryDelay = Math.max(retryDelay, wait);
      }
      void response.body?.cancel().catch(() => {});
      console.warn('OpenRouter audio request failed', {
        endpoint, status: response.status, attempt: attempt + 1, generationId: response.headers.get('X-Generation-Id'),
      });
      if (attempt > 0 || !retryableAudioStatuses.has(response.status) || retryDelay > 5000) {
        if (retryAfter && response.status === 429) res.setHeader('Retry-After', retryAfter);
        const error = response.status === 429
          ? 'The speech provider is rate-limited. Try again shortly.'
          : [401, 403].includes(response.status)
            ? 'OpenRouter rejected the server credentials for speech.'
            : response.status === 402
              ? 'OpenRouter could not authorize payment for the speech request.'
              : 'The speech provider could not complete the request. Try again shortly.';
        res.status(response.status === 429 ? 429 : 502).json({ error });
        return;
      }
    } catch (error) {
      const cause = error instanceof Error ? error.cause as NodeJS.ErrnoException | undefined : undefined;
      console.warn('OpenRouter audio transport failed', {
        endpoint, attempt: attempt + 1, errorType: error instanceof Error ? error.name : undefined, causeCode: cause?.code,
      });
      if (attempt > 0) {
        res.status(502).json({ error: 'The server could not complete its connection to OpenRouter. Try again shortly.' });
        return;
      }
    }
    await delay(retryDelay);
    if (res.destroyed) return;
  }
}

function pcmToWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// Nandar Assistant System Instruction
const THIRI_SYSTEM_PROMPT = `
You are "နန္ဒာ (Nandar)", a premier young female personal AI voice assistant.
Current year: 2026. The current local date is September 2026.

Identity & Personality:
- Name: နန္ဒာ (Nandar)
- Gender & Role: Young female personal executive assistant.
- Traits: Extremely polite, respectful, warm, friendly, modern, youthful, and energetic yet professional. Speaks naturally like a real human personal assistant.
- Communication Style:
  * Short, crisp, and direct answers suitable for listening via voice.
  * Avoid long walls of text, markdown tables, or unnecessary filler words.
  * Understand user intent quickly.
  * Ask brief clarification only when needed.
  * When speaking in Myanmar (Burmese), speak grammatically natural, polite, respectful Burmese (e.g. using 'ရှင်', 'ဟုတ်ကဲ့ရှင်', 'နန္ဒာ ကူညီပေးပါမယ်ရှင်').
  * When speaking in English, be warm, clear, crisp, and executive.
  * Fluently adapt to whatever language the user speaks (Myanmar, English, etc.).
- Knowledge & Capabilities:
  * Help with questions, summaries, translations, calculations, and daily productivity.
  * Assistant tasks: Answering queries, summarizing, setting reminders, translations, calculations.
  * Be clear when you are unsure or cannot verify current facts.
`;

export function createThiriApp(desktopAvailable: boolean, companion?: { token: string; allowedOrigin: string }) {
  const app = express();
  if (desktopAvailable && !companion) {
    app.use((req, res, next) => {
      const allowed = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
      const host = `http://${req.headers.host || ''}`;
      if (!allowed.includes(host) || (req.headers.origin && !allowed.includes(req.headers.origin))) {
        res.status(403).json({ error: 'Local access only.' });
        return;
      }
      next();
    });
  }
  if (companion) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin === companion.allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Thiri-Pairing-Key');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
      }
      if (req.method === 'OPTIONS') {
        res.status(origin === companion.allowedOrigin ? 204 : 403).end();
        return;
      }
      const supplied = req.header('X-Thiri-Pairing-Key') || '';
      const expected = Buffer.from(companion.token);
      const actual = Buffer.from(supplied);
      if (origin !== companion.allowedOrigin || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        res.status(401).json({ error: 'Computer pairing is required.' });
        return;
      }
      next();
    });
  }
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      assistant: 'နန္ဒာ (Nandar)',
      desktopAvailable,
      time: new Date().toISOString(),
      models: {
        fast: FAST_CHAT_MODEL,
        thinking: THINKING_CHAT_MODEL,
        tts: TTS_MODEL,
        voice: TTS_VOICE,
        stt: { en: 'openai/whisper-large-v3-turbo', my: 'google/chirp-3' },
      },
    });
  });

  app.get('/api/thiri/files/:name', async (req: Request, res: Response) => {
    if (!desktopAvailable) {
      res.status(404).json({ error: 'Local files are unavailable on this deployment.' });
      return;
    }
    try {
      const name = String(req.params.name);
      if (!/\.(txt|docx|pptx)$/i.test(name)) throw new Error('Unsupported file type.');
      const { filePath } = await import('../desktopActions.js');
      res.download(filePath(name));
    } catch {
      res.status(400).json({ error: 'Invalid file name.' });
    }
  });

  // Chat endpoint for Nandar through OpenRouter
  app.post('/api/thiri/chat', async (req: Request, res: Response) => {
    try {
      const {
        message,
        history = [],
        mode = 'fast',
        language = 'my', // 'my' (Myanmar) or 'en' (English)
      } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      if (!process.env.OPENROUTER_API_KEY) {
        res.status(500).json({
          error: 'OPENROUTER_API_KEY is not configured on the server.',
        });
        return;
      }

      const messages = [
        {
          role: 'system',
          content: `${THIRI_SYSTEM_PROMPT}\n\nReply in ${language === 'my' ? 'natural, polite Burmese' : 'English'}. Keep replies concise and easy to speak aloud. ${!desktopAvailable ? 'This cloud deployment can chat and speak but cannot control the visitor’s computer or access their local files. Explain that limitation when asked.' : 'Use computer tools only when the user explicitly asks for a computer action. Files are limited to the Thiri Output folder. You can create, replace, rename, and delete files there. Updating a file replaces its entire contents; ask for missing original content when the user requests a partial edit. You may perform a short sequence of actions in an app when the user requests them, such as opening Notepad and typing text. For a user-named button or control in the active window, use click_named_element, which finds it locally through Windows accessibility. For a coordinate click or move, use only coordinates the user gave; never guess a position. If local accessibility cannot find a control, ask the user for coordinates.'} No screenshot or screen content may be sent to OpenRouter. Do not claim an action succeeded unless a tool result confirms it.`,
        },
        ...(Array.isArray(history)
          ? history.slice(-30).filter((item: any) => item?.text && ['user', 'assistant', 'model'].includes(item.role)).map((item: any) => ({
              role: item.role === 'assistant' || item.role === 'model' ? 'assistant' : 'user',
              content: String(item.text),
            }))
          : []),
        { role: 'user', content: message },
      ];
      const computerTools = desktopAvailable ? await import('../assistantTools.js') : undefined;
      const thinking = mode === 'thinking';
      const chatModel = thinking ? THINKING_CHAT_MODEL : FAST_CHAT_MODEL;

      const runCompletion = () => fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || `http://localhost:${PORT}`,
          'X-OpenRouter-Title': 'Nandar AI Voice Assistant',
        },
        body: JSON.stringify({
          model: chatModel,
          messages,
          max_tokens: 1800,
          reasoning: { effort: thinking ? 'low' : 'none' },
          ...(computerTools ? { tools: computerTools.assistantTools, tool_choice: 'auto' } : {}),
        }),
      });

      const completed: string[] = [];
      const files: string[] = [];
      let modelUsed = chatModel;
      for (let step = 0; step < 4; step++) {
        const completionResponse = await runCompletion();
        if (!completionResponse.ok) {
          const errorBody = await completionResponse.text();
          throw new Error(`OpenRouter chat failed (${completionResponse.status}): ${errorBody.slice(0, 500)}`);
        }
        const completion = await completionResponse.json();
        modelUsed = completion.model || chatModel;
        const assistantMessage = completion.choices?.[0]?.message;
        const toolCalls = assistantMessage?.tool_calls || [];
        if (!toolCalls.length) {
          const content = assistantMessage?.content;
          const responseText = typeof content === 'string' ? content.trim() : Array.isArray(content) ? content.map((part: any) => part.text || '').join('').trim() : '';
          res.json({ text: completed.length ? completed.join(' ') : responseText || 'Please try again.', modelUsed, groundingChunks: files.map((fileName) => ({ title: fileName, uri: `/api/thiri/files/${encodeURIComponent(fileName)}` })) });
          return;
        }
        messages.push({
          role: 'assistant',
          content: assistantMessage.content || null,
          tool_calls: toolCalls,
          reasoning_details: assistantMessage.reasoning_details,
        } as any);
        for (const toolCall of toolCalls) {
          try {
            if (!computerTools) throw new Error('Desktop controls are unavailable on the cloud deployment.');
            const result = await computerTools.executeAssistantTool(toolCall.function.name, toolCall.function.arguments, language === 'my' ? 'my' : 'en');
            completed.push(result.text);
            if (result.fileName) files.push(result.fileName);
            messages.push({ role: 'tool', tool_call_id: toolCall.id, content: result.text } as any);
          } catch (toolError: any) {
            const failure = toolError?.message || 'The computer action failed.';
            res.json({ text: [...completed, failure].join(' '), modelUsed, groundingChunks: files.map((fileName) => ({ title: fileName, uri: `/api/thiri/files/${encodeURIComponent(fileName)}` })) });
            return;
          }
        }
      }
      res.json({ text: completed.join(' ') || 'The action limit was reached.', modelUsed, groundingChunks: files.map((fileName) => ({ title: fileName, uri: `/api/thiri/files/${encodeURIComponent(fileName)}` })) });
    } catch (error: any) {
      console.error('Nandar chat error:', error);
      res.status(500).json({
        error: error.message || 'Failed to process voice assistant query',
      });
    }
  });

  // Transcribe short browser-recorded voice turns through OpenRouter.
  app.post(
    '/api/thiri/transcribe',
    express.raw({ type: 'audio/*', limit: '15mb' }),
    async (req: Request, res: Response) => {
      try {
        if (!process.env.OPENROUTER_API_KEY) {
          res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured on the server.' });
          return;
        }

        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          res.status(400).json({ error: 'No recorded audio was received.' });
          return;
        }

        const contentType = String(req.headers['content-type'] || 'audio/webm');
        const format = contentType.split(';')[0].split('/')[1]?.toLowerCase();
        const supportedFormats = new Set(['wav', 'mp3', 'flac', 'm4a', 'ogg', 'webm', 'aac']);
        if (!format || !supportedFormats.has(format)) {
          res.status(415).json({ error: `Unsupported audio format: ${format || 'unknown'}` });
          return;
        }

        const language = req.query.language === 'en' ? 'en' : req.query.language === 'my' ? 'my' : undefined;
        const transcription = await requestOpenRouterAudio('transcriptions', {
          model: language === 'my' ? 'google/chirp-3' : 'openai/whisper-large-v3-turbo',
          input_audio: { data: req.body.toString('base64'), format },
          ...(language ? { language: language === 'my' ? 'my-MM' : language } : {}),
        }, (response) => response.json(), res);
        if (transcription === undefined) return;
        res.json({ text: String(transcription.text || '').trim(), usage: transcription.usage });
      } catch (error: any) {
        console.warn('OpenRouter transcription error:', error.message);
        res.status(502).json({ error: error.message || 'Voice transcription failed.' });
      }
    },
  );

  // Text-to-speech for English and Burmese through Gemini.
  app.post('/api/thiri/tts', async (req: Request, res: Response) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'Text is required for TTS' });
        return;
      }

      if (!process.env.OPENROUTER_API_KEY) {
        res.status(500).json({
          error: 'OPENROUTER_API_KEY is not configured on the server.',
        });
        return;
      }

      // Limit length for low-latency voice delivery (up to 400 characters per vocalization)
      const cleanText = text.replace(/[*_#`~[\]]/g, '').trim().slice(0, 500);

      const audioBytes = await requestOpenRouterAudio('speech', {
        model: TTS_MODEL,
        input: cleanText,
        voice: TTS_VOICE,
        response_format: 'pcm',
      }, async (response) => {
        const audio = Buffer.from(await response.arrayBuffer());
        if (!audio.length || audio.length % 2 !== 0 || response.headers.get('Content-Type')?.includes('application/json')) {
          throw new Error('OpenRouter returned invalid PCM audio.');
        }
        return audio;
      }, res);
      if (audioBytes === undefined) return;
      const audioData = pcmToWav(audioBytes).toString('base64');
      res.json({
        audio: audioData,
        mimeType: 'audio/wav',
        text: cleanText,
      });
    } catch (error: any) {
      console.error('OpenRouter TTS error:', error.message);
      res.status(502).json({ error: error.message || 'Voice generation failed.' });
    }
  });

  return app;
}

export default createThiriApp(false);

