import React, { useEffect, useState } from 'react';
import { AssistantState } from '../types';
import { audioManager } from '../utils/audio';

interface VoiceVisualizerProps {
  state: AssistantState;
  onOrbClick?: () => void;
}

export const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({ state, onOrbClick }) => {
  const [amplitude, setAmplitude] = useState(0);

  useEffect(() => {
    let animId: number;

    const updateAudioLevel = () => {
      if (state === 'speaking') {
        const level = audioManager.getFrequencyLevel(false);
        setAmplitude(level);
      } else if (state === 'listening') {
        const level = audioManager.getFrequencyLevel(true);
        setAmplitude(level);
      } else {
        setAmplitude(0);
      }
      animId = requestAnimationFrame(updateAudioLevel);
    };

    animId = requestAnimationFrame(updateAudioLevel);
    return () => cancelAnimationFrame(animId);
  }, [state]);

  // Color schemes based on state
  const getOrbGradient = () => {
    switch (state) {
      case 'listening':
        // Electric Cyan to Royal Indigo
        return 'from-cyan-400 via-sky-500 to-indigo-600';
      case 'thinking':
        // Emerald / Amber galaxy
        return 'from-emerald-400 via-teal-500 to-indigo-600';
      case 'speaking':
        // Vibrant Magenta / Fuchsia to Purple
        return 'from-pink-500 via-purple-500 to-indigo-600';
      case 'error':
        return 'from-rose-500 via-amber-500 to-red-600';
      case 'connecting':
        return 'from-indigo-400 via-blue-500 to-purple-600';
      case 'idle':
      default:
        // Sophisticated Deep Violet & Iris
        return 'from-indigo-500 via-purple-600 to-pink-600';
    }
  };

  const getGlowShadow = () => {
    switch (state) {
      case 'listening':
        return 'shadow-[0_0_90px_rgba(56,189,248,0.55)]';
      case 'thinking':
        return 'shadow-[0_0_90px_rgba(52,211,153,0.55)]';
      case 'speaking':
        return 'shadow-[0_0_110px_rgba(236,72,153,0.65)]';
      case 'error':
        return 'shadow-[0_0_80px_rgba(244,63,94,0.5)]';
      default:
        return 'shadow-[0_0_70px_rgba(129,140,248,0.35)]';
    }
  };

  const scaleFactor = 1 + amplitude * 0.45;

  return (
    <div className="relative flex items-center justify-center py-8 select-none">
      {/* Dynamic ripples when listening or speaking */}
      {(state === 'listening' || state === 'speaking') && (
        <>
          <div
            className={`absolute w-56 h-56 rounded-full border border-current opacity-30 animate-ripple-1 pointer-events-none ${
              state === 'listening' ? 'text-cyan-400' : 'text-pink-400'
            }`}
          />
          <div
            className={`absolute w-56 h-56 rounded-full border border-current opacity-20 animate-ripple-2 pointer-events-none ${
              state === 'listening' ? 'text-sky-400' : 'text-purple-400'
            }`}
          />
          <div
            className={`absolute w-56 h-56 rounded-full border border-current opacity-15 animate-ripple-3 pointer-events-none ${
              state === 'listening' ? 'text-indigo-400' : 'text-fuchsia-400'
            }`}
          />
        </>
      )}

      {/* Outer ambient glow field */}
      <div
        className={`absolute w-72 h-72 rounded-full blur-3xl opacity-40 transition-all duration-700 pointer-events-none bg-gradient-to-r ${getOrbGradient()}`}
        style={{
          transform: `scale(${scaleFactor * 1.15})`,
        }}
      />

      {/* Main Orb Container */}
      <button
        type="button"
        onClick={onOrbClick}
        aria-label="Voice visualization orb"
        className={`relative w-44 h-44 md:w-52 md:h-52 rounded-full cursor-pointer transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-indigo-500/30 active:scale-95 ${getGlowShadow()}`}
        style={{
          transform: `scale(${scaleFactor})`,
        }}
      >
        {/* Animated Fluid Orb */}
        <div
          className={`w-full h-full rounded-full bg-gradient-to-br ${getOrbGradient()} transition-all duration-700 flex items-center justify-center overflow-hidden relative ${
            state === 'speaking'
              ? 'animate-orb-speak'
              : state === 'listening' || state === 'idle'
              ? 'animate-orb-breathe'
              : ''
          }`}
        >
          {/* Inner Light Lens */}
          <div className="absolute inset-2 rounded-full bg-gradient-to-t from-black/40 via-transparent to-white/30 backdrop-blur-[2px]" />

          {/* Rotating internal core swirl */}
          <div
            className={`absolute w-full h-full rounded-full opacity-70 mix-blend-overlay transition-transform duration-1000 ${
              state === 'thinking' ? 'animate-spin' : ''
            }`}
            style={{
              background:
                'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), transparent 50%), radial-gradient(circle at 70% 70%, rgba(0,0,0,0.6), transparent 50%)',
              animationDuration: state === 'thinking' ? '2.5s' : '12s',
            }}
          />

          {/* Center Voice Icon / Waveform indicator */}
          <div className="relative z-10 flex items-center justify-center space-x-1.5">
            {state === 'listening' ? (
              // Active listening audio bars
              <div className="flex items-center space-x-1.5 h-10">
                {[0.4, 0.9, 0.6, 1, 0.7, 0.3].map((heightMulti, idx) => (
                  <span
                    key={idx}
                    className="w-1.5 bg-white/90 rounded-full transition-all duration-100"
                    style={{
                      height: `${Math.max(8, 36 * (amplitude * 1.5 + 0.2) * heightMulti)}px`,
                    }}
                  />
                ))}
              </div>
            ) : state === 'speaking' ? (
              // Active speaking dynamic audio wave
              <div className="flex items-center space-x-1.5 h-10">
                {[0.5, 1, 0.7, 0.9, 0.4].map((multi, idx) => (
                  <span
                    key={idx}
                    className="w-1.5 bg-white/95 rounded-full transition-all duration-75 shadow-sm"
                    style={{
                      height: `${Math.max(10, 38 * (amplitude * 1.8 + 0.3) * multi)}px`,
                    }}
                  />
                ))}
              </div>
            ) : state === 'thinking' ? (
              // Subtle thinking indicator
              <div className="flex space-x-1.5">
                <span className="w-2.5 h-2.5 bg-white/90 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2.5 h-2.5 bg-white/90 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2.5 h-2.5 bg-white/90 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            ) : (
              // Idle minimal soft spark / micro aura
              <div className="w-4 h-4 rounded-full bg-white/80 shadow-[0_0_15px_white] animate-pulse" />
            )}
          </div>
        </div>
      </button>
    </div>
  );
};
