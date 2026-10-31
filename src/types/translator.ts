export type PowerMode = 'smart_vad' | 'continuous_oled' | 'scheduled_interval';

export type EngineMode = 'hybrid' | 'live_only' | 'queue_raw_ogg';

export type MicDuckingMode = 'mute_mic' | 'reduce_gain' | 'full_duplex';

export type SegmentStatus = 'translated' | 'queued_raw' | 'translating';

export interface DetectedLanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  confidence: number;
}

export interface TranslationSegment {
  id: string;
  timestamp: number;
  detectedLanguage: DetectedLanguageInfo;
  sourceText: string;
  englishTranslation: string;
  status: SegmentStatus;
  audioOggBlob: Blob | null;
  audioMimeType: string;
  durationSec: number;
  peakDb: number;
  noiseReducedDb: number;
  spokenToHeadphones: boolean;
  engineUsed: 'whisper_wasm' | 'on_device_fast' | 'pending_queue';
}

export interface DspAndPowerConfig {
  powerMode: PowerMode;
  engineMode: EngineMode;
  sourceLanguageOverride: string; // 'auto' or ISO code like 'es', 'fr', 'ja', 'de', 'zh', 'ar', 'ru'
  // Web Audio DSP Noise Filter settings
  noiseFilterEnabled: boolean;
  highPassHz: number; // Default 120 Hz (cuts wind/handling rumble)
  lowPassHz: number; // Default 3600 Hz (isolates human speech formants)
  notchHumHz: 50 | 60 | 0; // Mains hum filter
  vadThresholdDb: number; // Default -42 dB
  vadHoldMs: number; // Default 900 ms after speech stops
  // Scheduled Interval mode settings
  intervalListenSec: number; // e.g., 20s
  intervalSleepSec: number; // e.g., 40s
  // Headphone Live Interpreter settings
  headphoneLiveEnabled: boolean;
  micDuckingMode: MicDuckingMode;
  headphoneSpeechRate: number; // 0.85 to 1.35
  headphoneVoiceURI: string;
  // Screen & Background
  keepWakeLock: boolean;
  autoOledDimSec: number; // 0 = manual only, or 30s
}

export interface WhisperModelState {
  status: 'idle' | 'downloading' | 'ready' | 'running' | 'error';
  progress: number;
  loadedFile?: string;
  errorMessage?: string;
}
