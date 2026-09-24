import React from 'react';
import { AssistantState, GroundingSource } from '../types';
import { Sparkles, Globe, BrainCircuit, Mic } from 'lucide-react';

interface TranscriptBubbleProps {
  state: AssistantState;
  userTranscript: string;
  assistantReply: string;
  groundingSources?: GroundingSource[];
  language: 'my' | 'en';
  mode: 'fast' | 'thinking';
  onOpenSource?: (source: GroundingSource) => void;
}

export const TranscriptBubble: React.FC<TranscriptBubbleProps> = ({
  state,
  userTranscript,
  assistantReply,
  groundingSources = [],
  language,
  mode,
  onOpenSource,
}) => {
  const getStatusLabel = () => {
    switch (state) {
      case 'connecting':
        return language === 'my' ? 'ချိတ်ဆက်နေသည်...' : 'Connecting...';
      case 'listening':
        return language === 'my' ? 'နားထောင်နေသည်...' : 'Listening...';
      case 'thinking':
        return mode === 'thinking'
          ? language === 'my'
            ? 'နက်နဲစွာ စဉ်းစားနေသည်...'
            : 'Deep Reasoning...'
          : language === 'my'
          ? 'အချက်အလက် ရှာဖွေတွေးတောနေသည်...'
          : 'Processing...';
      case 'speaking':
        return language === 'my' ? 'သီရိ ပြောနေပါသည် — ဝင်ပြောနိုင်ပါသည်' : 'Thiri is speaking — speak to interrupt';
      case 'error':
        return language === 'my' ? 'ချိတ်ဆက်မှု ပြဿနာရှိနေပါသည်' : 'Connection issue';
      case 'idle':
      default:
        return language === 'my' ? 'အသင့်ရှိပါသည်' : 'Ready to help';
    }
  };

  const getStatusIcon = () => {
    switch (state) {
      case 'listening':
        return <Mic className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />;
      case 'thinking':
        return mode === 'thinking' ? (
          <BrainCircuit className="w-3.5 h-3.5 text-emerald-400 animate-spin" style={{ animationDuration: '3s' }} />
        ) : (
          <Sparkles className="w-3.5 h-3.5 text-teal-400 animate-pulse" />
        );
      case 'speaking':
        return <Sparkles className="w-3.5 h-3.5 text-pink-400 animate-pulse" />;
      default:
        return <span className="w-2 h-2 rounded-full bg-emerald-400/80 inline-block" />;
    }
  };

  // Only render container if there's an active status, user speech, or reply
  return (
    <div className="w-full max-w-lg mx-auto px-4 flex flex-col items-center space-y-4">
      {/* Discreet Live Status Pill */}
      <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-xs text-slate-300 transition-all duration-300">
        {getStatusIcon()}
        <span className="tracking-wide font-medium">{getStatusLabel()}</span>
        {mode === 'thinking' && (
          <span className="ml-1 text-[10px] uppercase font-semibold text-emerald-400/90 bg-emerald-950/40 px-1.5 py-0.5 rounded">
            Deep Thinking
          </span>
        )}
      </div>

      {/* Floating Dialogue Area */}
      {state !== 'speaking' && (userTranscript || assistantReply) && (
        <div className="w-full space-y-3 transition-all duration-300">
          {/* User's spoken words */}
          {userTranscript && (
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-600/30 border border-indigo-500/20 px-4 py-2.5 backdrop-blur-md text-sm text-slate-100 shadow-lg">
                <p className="leading-relaxed">{userTranscript}</p>
              </div>
            </div>
          )}

          {/* Thiri's response */}
          {assistantReply && (
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white/5 border border-white/10 px-4 py-3 backdrop-blur-md text-sm text-slate-200 shadow-xl space-y-2.5">
                <p className="leading-relaxed text-slate-100 font-normal">
                  {assistantReply}
                </p>

                {/* Grounding Web Sources (News & Real-time Info) */}
                {groundingSources.length > 0 && (
                  <div className="pt-2 border-t border-white/10 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    <span className="inline-flex items-center text-[11px] text-slate-400 mr-1">
                      <Globe className="w-3 h-3 mr-1 text-cyan-400" />
                      {groundingSources.some((source) => source.uri.startsWith('/api/thiri/files/'))
                        ? language === 'my' ? 'ဖိုင်များ:' : 'Files:'
                        : language === 'my' ? 'ရင်းမြစ်များ:' : 'Sources:'}
                    </span>
                    {groundingSources.slice(0, 3).map((source, index) => (
                      <a
                        key={index}
                        href={source.uri}
                        onClick={onOpenSource ? (event) => { event.preventDefault(); onOpenSource(source); } : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block max-w-[160px] truncate px-2 py-0.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-[11px] text-cyan-300 transition-colors"
                        title={source.title}
                      >
                        {source.title || 'Source'}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
