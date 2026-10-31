import React, { useState, useEffect } from 'react';
import { Headphones, Lock, Mic, ShieldCheck, Volume2 } from 'lucide-react';
import { PowerMode, TranslationSegment } from '../types/translator';

interface OledBlackoutCurtainProps {
  isOpen: boolean;
  onUnlock: () => void;
  isListening: boolean;
  isSpeechActive: boolean;
  isMicDucked: boolean;
  powerMode: PowerMode;
  headphoneLiveEnabled: boolean;
  onToggleHeadphoneLive: () => void;
  latestSegment: TranslationSegment | null;
  sessionElapsedSec: number;
  currentDb: number;
}

export const OledBlackoutCurtain: React.FC<OledBlackoutCurtainProps> = ({
  isOpen,
  onUnlock,
  isListening,
  isSpeechActive,
  isMicDucked,
  powerMode,
  headphoneLiveEnabled,
  onToggleHeadphoneLive,
  latestSegment,
  sessionElapsedSec,
  currentDb,
}) => {
  const [holdProgress, setHoldProgress] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setHoldProgress(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black text-slate-400 flex flex-col justify-between p-6 select-none"
      role="dialog"
      aria-label="OLED Screen-Off Power Saver Mode"
    >
      {/* Top transparent notice bar — never hidden from user */}
      <div className="flex items-center justify-between border-b border-slate-900 pb-4">
        <div className="flex items-center gap-2.5 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>VoxGuard Active Foreground Listener</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-slate-300">{formatTimer(sessionElapsedSec)}</span>
        </div>
        <div className="text-xs font-mono tabular-nums text-slate-500">
          OLED 0.0W Pixel Lock
        </div>
      </div>

      {/* Center Minimal Telemetry & Latest English Translation */}
      <div className="my-auto max-w-md mx-auto w-full space-y-6 text-center">
        <div className="inline-flex items-center gap-3 px-4 py-2 rounded-xl border border-slate-900 bg-slate-950/50 text-xs">
          <Mic className={`w-4 h-4 ${isMicDucked ? 'text-amber-400' : isSpeechActive ? 'text-emerald-400' : 'text-slate-500'}`} />
          <span>
            {isMicDucked
              ? 'Mic Auto-Muted (Speaking in Headphones)'
              : !isListening
              ? 'Paused'
              : isSpeechActive
              ? 'Voice Gate Open · Recording Opus .ogg'
              : powerMode === 'smart_vad'
              ? 'Smart VAD Standby (Filtering Noise)'
              : 'Continuous Low-Power Listening'}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{currentDb.toFixed(0)} dB</span>
        </div>

        {latestSegment ? (
          <div className="space-y-2 px-4">
            <div className="text-xs text-slate-500">
              {latestSegment.detectedLanguage.name} ({Math.round(latestSegment.detectedLanguage.confidence * 100)}%) → English
            </div>
            <p className="text-lg font-medium text-slate-200 leading-relaxed">
              {latestSegment.englishTranslation || latestSegment.sourceText}
            </p>
            {latestSegment.englishTranslation && (
              <p className="text-xs text-slate-600 truncate">
                {latestSegment.sourceText}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Waiting for speech above noise gate threshold...
          </p>
        )}

        {/* Quick Pocket Headphone Toggle Button */}
        <div className="pt-2 flex justify-center">
          <button
            type="button"
            onClick={onToggleHeadphoneLive}
            className={`min-h-[48px] px-5 py-3 rounded-2xl border text-xs font-medium flex items-center gap-2.5 transition-colors ${
              headphoneLiveEnabled
                ? 'border-cyan-800/80 bg-cyan-950/30 text-cyan-300'
                : 'border-slate-900 bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
          >
            {headphoneLiveEnabled ? (
              <Volume2 className="w-4 h-4 text-cyan-400 shrink-0" />
            ) : (
              <Headphones className="w-4 h-4 text-slate-500 shrink-0" />
            )}
            <span>
              {headphoneLiveEnabled
                ? 'Headphone Live English Audio: ON (Mic Auto-Duck)'
                : 'Tap to Enable Live Headphone Audio'}
            </span>
          </button>
        </div>
      </div>

      {/* Bottom Unlock Trigger (Pocket-safe double-click or tap) */}
      <div className="max-w-sm mx-auto w-full space-y-2 text-center">
        <button
          type="button"
          onClick={() => {
            if (holdProgress >= 50) {
              onUnlock();
            } else {
              setHoldProgress(100);
              onUnlock();
            }
          }}
          className="w-full min-h-[52px] rounded-2xl border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-300 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <Lock className="w-4 h-4 text-slate-400" />
          <span>Wake Screen &amp; Return to Workspace</span>
        </button>
        <p className="text-[11px] text-slate-600">
          Screen WakeLock &amp; Android MediaSession keep audio translation active while pixels are black.
        </p>
      </div>
    </div>
  );
};
