import React, { useState } from 'react';
import { AssistantMode, AssistantState } from '../types';
import { Phone, PhoneOff, Mic, MicOff, Zap, Brain, MessageSquare, Globe2 } from 'lucide-react';

interface CallControlsProps {
  state: AssistantState;
  mode: AssistantMode;
  language: 'my' | 'en';
  isMuted: boolean;
  onStartCall: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
  onToggleMode: (newMode: AssistantMode) => void;
  onToggleLanguage: () => void;
  onSendTextMessage: (text: string) => void;
}

export const CallControls: React.FC<CallControlsProps> = ({
  state,
  mode,
  language,
  isMuted,
  onStartCall,
  onEndCall,
  onToggleMute,
  onToggleMode,
  onToggleLanguage,
  onSendTextMessage,
}) => {
  const [showTextInput, setShowTextInput] = useState(false);
  const [inputText, setInputText] = useState('');

  const isCallActive = state !== 'idle' && state !== 'error';

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendTextMessage(inputText.trim());
    setInputText('');
    setShowTextInput(false);
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center space-y-5 px-4 pb-8">
      {/* If Call is NOT active (Idle State) */}
      {!isCallActive ? (
        <div className="flex flex-col items-center space-y-6 w-full">
          {/* Main Start Call Action */}
          <button
            type="button"
            onClick={onStartCall}
            className="group relative inline-flex items-center justify-center space-x-3 px-8 py-4 rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 text-white font-medium text-base shadow-[0_0_40px_rgba(147,51,234,0.4)] hover:shadow-[0_0_60px_rgba(147,51,234,0.6)] active:scale-95 transition-all duration-300 cursor-pointer"
          >
            <span className="p-1 rounded-full bg-white/20">
              <Phone className="w-5 h-5 text-white animate-pulse" />
            </span>
            <span className="tracking-wide">
              {language === 'my' ? 'သီရိနှင့် စကားပြောမည်' : 'Start Voice Call'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowTextInput((visible) => !visible)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-sm transition-colors cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
            <span>{language === 'my' ? 'စာဖြင့် မေးမည်' : 'Type a message'}</span>
          </button>

        </div>
      ) : (
        /* Call is ACTIVE (In-Session Controls) */
        <div className="flex flex-col items-center space-y-4 w-full">
          <div className="flex items-center justify-center space-x-4">
            {/* Mute / Unmute Mic */}
            <button
              type="button"
              onClick={onToggleMute}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              className={`p-3.5 rounded-full border transition-all cursor-pointer ${
                isMuted
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-white/10 border-white/15 text-slate-200 hover:bg-white/20'
              }`}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* End Call Button */}
            <button
              type="button"
              onClick={onEndCall}
              title="End Voice Call"
              className="p-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-[0_0_30px_rgba(244,63,94,0.5)] active:scale-95 transition-all cursor-pointer"
            >
              <PhoneOff className="w-6 h-6" />
            </button>

            {/* Silent text chat fallback */}
            <button
              type="button"
              onClick={() => setShowTextInput(!showTextInput)}
              title="Type text message"
              className={`p-3.5 rounded-full border transition-all cursor-pointer ${
                showTextInput
                  ? 'bg-indigo-600 border-indigo-400 text-white'
                  : 'bg-white/10 border-white/15 text-slate-200 hover:bg-white/20'
              }`}
            >
              <MessageSquare className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Top / Secondary bar: Mode toggle & Language */}
      <div className="flex items-center space-x-2 pt-2 text-xs">
        {/* Low-latency vs Deep Thinking toggle */}
        <div className="inline-flex rounded-full bg-black/40 border border-white/10 p-1 backdrop-blur-md">
          <button
            type="button"
            onClick={() => onToggleMode('fast')}
            className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full transition-all cursor-pointer ${
              mode === 'fast'
                ? 'bg-indigo-600 text-white shadow-sm font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3 h-3 text-amber-300" />
            <span>{language === 'my' ? 'အမြန်နှုန်း (Flash)' : 'Low Latency'}</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleMode('thinking')}
            className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full transition-all cursor-pointer ${
              mode === 'thinking'
                ? 'bg-emerald-600 text-white shadow-sm font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Brain className="w-3 h-3 text-emerald-300" />
            <span>{language === 'my' ? 'နက်နဲတွေးခေါ် (Thinking)' : 'Deep Thinking'}</span>
          </button>
        </div>

        {/* Language Toggle */}
        <button
          type="button"
          onClick={onToggleLanguage}
          className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-full bg-black/40 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white transition-all cursor-pointer backdrop-blur-md"
        >
          <Globe2 className="w-3 h-3 text-slate-400" />
          <span className="font-medium">{language === 'my' ? 'မြန်မာ' : 'English'}</span>
        </button>
      </div>

      {/* Pop-up Text Input Dialog for text fallback */}
      {showTextInput && (
        <form
          onSubmit={handleTextSubmit}
          className="w-full mt-3 flex items-center space-x-2 bg-white/10 border border-white/20 rounded-full px-3 py-1.5 backdrop-blur-lg shadow-2xl"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              language === 'my'
                ? 'သီရိအား မေးလိုသည်ကို ရိုက်ထည့်ပါ...'
                : 'Type a message to Thiri...'
            }
            className="flex-1 bg-transparent px-3 py-1.5 text-sm text-slate-100 placeholder-slate-400 focus:outline-none"
            autoFocus
          />
          <button
            type="submit"
            className="px-4 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors cursor-pointer"
          >
            {language === 'my' ? 'ပို့မည်' : 'Send'}
          </button>
        </form>
      )}
    </div>
  );
};
