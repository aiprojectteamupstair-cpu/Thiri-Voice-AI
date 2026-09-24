import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AssistantMode, AssistantState, GroundingSource, ConversationTurn } from './types';
import { VoiceVisualizer } from './components/VoiceVisualizer';
import { TranscriptBubble } from './components/TranscriptBubble';
import { CallControls } from './components/CallControls';
import { audioManager } from './utils/audio';
import { speechService } from './utils/speechRecognition';
import { Volume2, VolumeX, AlertCircle } from 'lucide-react';

export default function App() {
  const [state, setState] = useState<AssistantState>('idle');
  const [mode, setMode] = useState<AssistantMode>('fast'); // 'fast' (gemini-3.1-flash-lite) or 'thinking' (gemini-3.1-pro-preview)
  const [language, setLanguage] = useState<'my' | 'en'>('my');
  const [isMuted, setIsMuted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Transcript states
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantReply, setAssistantReply] = useState('');
  const [groundingSources, setGroundingSources] = useState<GroundingSource[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // References to keep callbacks fresh
  const stateRef = useRef(state);
  stateRef.current = state;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const languageRef = useRef(language);
  languageRef.current = language;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const latestTranscriptRef = useRef('');
  const callActiveRef = useRef(false);
  const sessionRef = useRef(0);
  const playbackRef = useRef(0);
  const listenRequestRef = useRef(0);

  // Stop everything
  const handleEndCall = useCallback(() => {
    sessionRef.current += 1;
    playbackRef.current += 1;
    listenRequestRef.current += 1;
    callActiveRef.current = false;
    audioManager.stopPlayback();
    audioManager.stopMic();
    speechService.abort();
    setState('idle');
    setUserTranscript('');
    setAssistantReply('');
    setGroundingSources([]);
    setErrorMessage(null);
  }, []);

  // Play spoken response via OpenRouter TTS with browser speech fallback
  const speakResponse = useCallback(
    async (text: string) => {
      const session = sessionRef.current;
      const playback = ++playbackRef.current;
      const inCall = callActiveRef.current;
      speechService.abort();
      setState('speaking');
      setAssistantReply(text);

      if (!soundEnabled) {
        // Sound muted, pause briefly then resume listening
        setTimeout(() => {
          if (session !== sessionRef.current || playback !== playbackRef.current) return;
          if (inCall && callActiveRef.current) {
            startListening();
          } else if (!inCall) {
            setState('idle');
          }
        }, 1500);
        return;
      }

      try {
        // Fetch audio from server OpenRouter TTS
        const res = await fetch('/api/thiri/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            language: languageRef.current,
          }),
        });

        const data = await res.json();
        if (session !== sessionRef.current || playback !== playbackRef.current) return;

        if (data.audio) {
          if (inCall && !isMutedRef.current) void startListening(true, playback);
          await audioManager.playTTS(data.audio, data.mimeType);
        } else {
          // Fallback to browser Web Speech synthesis
          if (inCall && !isMutedRef.current) void startListening(true, playback);
          await audioManager.playBrowserSpeech(text, languageRef.current);
        }
      } catch (err) {
        if (session !== sessionRef.current || playback !== playbackRef.current) return;
        console.warn('TTS playback error, trying speech synthesis fallback:', err);
        try {
          if (inCall && !isMutedRef.current) void startListening(true, playback);
          await audioManager.playBrowserSpeech(text, languageRef.current);
        } catch (synthErr) {
          console.error('Speech synthesis also failed:', synthErr);
        }
      } finally {
        // After speaking ends, automatically return to listening if still in call
        if (session !== sessionRef.current || playback !== playbackRef.current) return;
        if (inCall && callActiveRef.current) {
          startListening();
        } else if (!inCall) {
          setState('idle');
        }
      }
    },
    [soundEnabled]
  );

  // Send message to the OpenRouter reasoning engine
  const processUserQuery = useCallback(
    async (queryText: string) => {
      if (!queryText.trim()) return;
      const session = sessionRef.current;

      playbackRef.current += 1;
      audioManager.stopPlayback();
      speechService.stop();
      setState('thinking');
      setUserTranscript(queryText);
      setAssistantReply('');
      setGroundingSources([]);
      setErrorMessage(null);

      // Save user turn
      const userTurn: ConversationTurn = {
        id: Date.now().toString(),
        role: 'user',
        text: queryText,
        timestamp: new Date(),
      };
      setConversationHistory((prev) => [...prev.slice(-8), userTurn]);

      try {
        const response = await fetch('/api/thiri/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: queryText,
            history: conversationHistory.slice(-6).map((c) => ({
              role: c.role === 'assistant' ? 'model' : 'user',
              text: c.text,
            })),
            mode: modeRef.current,
            language: languageRef.current,
          }),
        });

        const data = await response.json();
        if (session !== sessionRef.current) return;

        if (!response.ok || data.error) {
          throw new Error(data.error || 'Failed to receive response from Thiri');
        }

        const reply = data.text;
        const sources = data.groundingChunks || [];

        setAssistantReply(reply);
        setGroundingSources(sources);

        // Record turn
        const assistantTurn: ConversationTurn = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text: reply,
          timestamp: new Date(),
          modelUsed: data.modelUsed,
          groundingSources: sources,
        };
        setConversationHistory((prev) => [...prev, assistantTurn]);

        // Speak out the reply
        await speakResponse(reply);
      } catch (err: any) {
        if (session !== sessionRef.current) return;
        console.error('Error during reasoning:', err);
        setState('error');
        setErrorMessage(err.message || 'Error communicating with assistant');
        const fallbackMessage =
          languageRef.current === 'my'
            ? 'တောင်းပန်ပါတယ်ရှင်။ စကားပြောဆိုမှုတွင် အခက်အခဲ အနည်းငယ်ရှိနေပါသည်။ ထပ်မံကြိုးစားပေးပါရှင်။'
            : 'I apologize, I encountered a temporary issue. Please try again.';
        setAssistantReply(fallbackMessage);
        await speakResponse(fallbackMessage);
      }
    },
    [conversationHistory, speakResponse]
  );

  // Start continuous listening loop
  const startListening = useCallback(async (duringSpeech = false, playback = playbackRef.current) => {
    if (isMutedRef.current || !callActiveRef.current) {
      return;
    }
    const listenRequest = ++listenRequestRef.current;

    if (!speechService.isSupported()) {
      setState('error');
      setErrorMessage('Voice recognition is unavailable in this browser. Use Type a message to chat.');
      return;
    }

    if (!duringSpeech) setState('listening');
    setUserTranscript('');
    latestTranscriptRef.current = '';
    let submitted = false;

    // Connect mic to analyser for visualizer
    const micAnalyser = await audioManager.initMicAnalyser();
    if (!callActiveRef.current || isMutedRef.current || listenRequest !== listenRequestRef.current || (duringSpeech && playback !== playbackRef.current)) return;
    let speechError = '';
    let fatalSpeechError = false;

    speechService.start(
      {
        onStart: () => {
          setErrorMessage(null);
          if (!duringSpeech) setState('listening');
        },
        onSpeechStart: duringSpeech ? () => {
          if (playback !== playbackRef.current || !callActiveRef.current || isMutedRef.current) return;
          playbackRef.current += 1;
          audioManager.stopPlayback();
          setState('listening');
          setAssistantReply('');
        } : undefined,
        onTranscript: (transcript, isFinal) => {
          setErrorMessage(null);
          latestTranscriptRef.current = transcript;
          setUserTranscript(transcript);
          if (isFinal && transcript.trim() && !submitted) {
            submitted = true;
            processUserQuery(transcript.trim());
          }
        },
        onError: (err) => {
          console.warn('Speech transcription error:', err);
          if (err === 'not-allowed' || err === 'service-not-allowed') {
            fatalSpeechError = true;
            speechError = 'Microphone access was blocked. Allow microphone access in the browser, or type a message instead.';
            setState('error');
            setErrorMessage(speechError);
          } else if (err === 'no-speech') {
            speechError = 'I did not catch any speech. Check microphone access and try again, or type a message.';
          } else if (err.startsWith('transcription:')) {
            fatalSpeechError = true;
            speechError = `${err.slice('transcription:'.length).trim()} You can type a message instead.`;
            setState('error');
            setErrorMessage(speechError);
          } else {
            fatalSpeechError = true;
            speechError = `Voice input failed (${err}). You can type a message instead.`;
            setState('error');
            setErrorMessage(speechError);
          }
        },
        onEnd: () => {
          if (duringSpeech && playback === playbackRef.current) return;
          const transcript = latestTranscriptRef.current.trim();
          if (stateRef.current === 'listening' && transcript && !submitted) {
            submitted = true;
            processUserQuery(transcript);
          } else if (stateRef.current === 'listening' && !transcript && !fatalSpeechError) {
            setErrorMessage(speechError || 'I did not catch any speech. Check microphone access and try again, or type a message.');
            window.setTimeout(() => {
              if (callActiveRef.current && !isMutedRef.current && stateRef.current === 'listening') {
                startListening();
              }
            }, 0);
          }
        },
      },
      languageRef.current,
      audioManager.getMicStream(),
      micAnalyser,
    );
  }, [processUserQuery]);

  // Start Call Session
  const handleStartCall = useCallback(async () => {
    sessionRef.current += 1;
    callActiveRef.current = true;
    audioManager.init();
    void audioManager.initMicAnalyser();
    setState('connecting');
    setErrorMessage(null);

    // Initial greeting from Thiri
    const greetingText =
      languageRef.current === 'my'
        ? 'မင်္ဂလာပါရှင်။ ကျွန်မ သီရိပါ။ ဘာများ ကူညီပေးရမလဲရှင်။'
        : "Hello! I'm Thiri, your personal AI assistant. How may I help you today?";

    setAssistantReply(greetingText);
    await speakResponse(greetingText);
  }, [speakResponse]);

  // Interrupt handler (tapping the orb while speaking or thinking)
  const handleOrbClick = useCallback(() => {
    if (state === 'speaking') {
      playbackRef.current += 1;
      audioManager.stopPlayback();
      if (speechService.getListening()) {
        setState('listening');
        setAssistantReply('');
      } else {
        startListening();
      }
    } else if (state === 'listening') {
      speechService.stop();
      if (userTranscript.trim()) {
        processUserQuery(userTranscript.trim());
      }
    } else if (state === 'idle') {
      handleStartCall();
    }
  }, [state, startListening, userTranscript, processUserQuery, handleStartCall]);

  // Mute toggle
  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      if (next) {
        listenRequestRef.current += 1;
        speechService.abort();
        if (stateRef.current === 'listening') {
          setState('connecting');
        }
      } else {
        if (callActiveRef.current && stateRef.current === 'speaking') {
          startListening(true, playbackRef.current);
        } else if (callActiveRef.current && stateRef.current === 'connecting') {
          startListening();
        }
      }
      return next;
    });
  }, [startListening]);

  // Mode toggle (Fast vs Thinking)
  const handleToggleMode = (newMode: AssistantMode) => {
    setMode(newMode);
  };

  // Language toggle
  const handleToggleLanguage = () => {
    const nextLang = language === 'my' ? 'en' : 'my';
    setLanguage(nextLang);
    speechService.setLanguage(nextLang);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioManager.stopPlayback();
      audioManager.stopMic();
      speechService.abort();
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col justify-between relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] rounded-full bg-gradient-to-tr from-indigo-900/20 via-purple-900/20 to-pink-900/10 blur-[130px] pointer-events-none" />

      {/* Subtle top header bar */}
      <header className="relative z-20 w-full max-w-2xl mx-auto px-6 pt-6 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs uppercase tracking-widest text-slate-400 font-medium">
            2026 AI Voice Agent
          </span>
        </div>

        {/* Audio output sound toggle */}
        <button
          type="button"
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? 'Mute Assistant Voice' : 'Unmute Assistant Voice'}
          className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-amber-400" />}
        </button>
      </header>

      {/* Centerpiece: Minimal Screen with Voice Visualizer and Agent Name */}
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-4 my-auto">
        {/* Agent Name */}
        <div className="text-center space-y-1.5 mb-2">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-100 to-slate-400 font-sans drop-shadow-sm">
            သီရိ
          </h1>
          <p className="text-xs md:text-sm tracking-wider uppercase text-indigo-300/80 font-medium">
            Thiri — Personal AI Voice Assistant
          </p>
        </div>

        {/* Dynamic Voice Visualization Orb */}
        <VoiceVisualizer state={state} onOrbClick={handleOrbClick} />

        {/* Real-time Subtitles / Live Transcript Bubble */}
        <TranscriptBubble
          state={state}
          userTranscript={userTranscript}
          assistantReply={assistantReply}
          groundingSources={groundingSources}
          language={language}
          mode={mode}
        />

        {/* Error notification banner if any */}
        {errorMessage && (
          <div className="mt-3 px-3.5 py-1.5 rounded-full bg-rose-950/50 border border-rose-800/40 text-rose-300 text-xs flex items-center space-x-2 backdrop-blur-md">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}
      </section>

      {/* Bottom Controls: Call button, in-call actions & mode toggles */}
      <footer className="relative z-20 w-full">
        <CallControls
          state={state}
          mode={mode}
          language={language}
          isMuted={isMuted}
          onStartCall={handleStartCall}
          onEndCall={handleEndCall}
          onToggleMute={handleToggleMute}
          onToggleMode={handleToggleMode}
          onToggleLanguage={handleToggleLanguage}
          onSendTextMessage={processUserQuery}
        />
      </footer>
    </main>
  );
}
