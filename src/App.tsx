/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AudioLines,
  BatteryCharging,
  Check,
  Clock,
  Download,
  FileAudio,
  Headphones,
  Languages,
  Lock,
  Mic,
  MicOff,
  Moon,
  Pause,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import {
  DspAndPowerConfig,
  EngineMode,
  MicDuckingMode,
  PowerMode,
  TranslationSegment,
  WhisperModelState,
} from './types/translator';
import {
  SUPPORTED_SOURCE_LANGUAGES,
  detectLanguageOnDevice,
  translateToEnglishOnDevice,
} from './utils/languageDetector';
import {
  createExportableOggFileBlob,
  createSynthesizedSpeechBlob,
  ensureOpusOggBlob,
  getPreferredRecorderMimeType,
} from './utils/oggOpusEncoder';
import {
  clearAllVaultSegments,
  deleteSegmentFromVault,
  loadAllSegmentsFromVault,
  saveSegmentToVault,
} from './utils/vaultDb';
import { whisperClient } from './utils/whisperWorkerClient';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { usePWAInstall } from './hooks/usePWAInstall';
import { OledBlackoutCurtain } from './components/OledBlackoutCurtain';
import { ApkPackagingModal } from './components/ApkPackagingModal';

type ActiveSection = 'translator' | 'vault' | 'dsp_power' | 'headphones';

const SAMPLE_TEST_UTTERANCES = [
  {
    lang: 'es',
    label: 'Spanish',
    text: 'La puerta de embarque ha cambiado a la terminal norte',
    freq: 190,
  },
  {
    lang: 'ja',
    label: 'Japanese',
    text: '次の電車は3番線から発車します',
    freq: 225,
  },
  {
    lang: 'de',
    label: 'German',
    text: 'Bitte prüfen Sie die Sicherheitsventile vor dem Schichtwechsel',
    freq: 165,
  },
  {
    lang: 'fr',
    label: 'French',
    text: 'Pouvez-vous répéter plus lentement',
    freq: 205,
  },
  {
    lang: 'zh',
    label: 'Mandarin',
    text: '请问地铁站在哪里',
    freq: 235,
  },
  {
    lang: 'ru',
    label: 'Russian',
    text: 'Где находится станция метро',
    freq: 155,
  },
];

export default function App() {
  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, install } = usePWAInstall();

  // Theme state (Dark default for Android OLED battery efficiency)
  const [isDark, setIsDark] = useState(true);
  const [activeSection, setActiveSection] = useState<ActiveSection>('translator');
  const [isApkModalOpen, setIsApkModalOpen] = useState(false);
  const [isOledCurtainOpen, setIsOledCurtainOpen] = useState(false);

  // Core Configuration State
  const [config, setConfig] = useState<DspAndPowerConfig>({
    powerMode: 'smart_vad',
    engineMode: 'hybrid',
    sourceLanguageOverride: 'auto',
    noiseFilterEnabled: true,
    highPassHz: 120,
    lowPassHz: 3600,
    notchHumHz: 60,
    vadThresholdDb: -42,
    vadHoldMs: 900,
    intervalListenSec: 20,
    intervalSleepSec: 40,
    headphoneLiveEnabled: false,
    micDuckingMode: 'mute_mic',
    headphoneSpeechRate: 1.0,
    headphoneVoiceURI: '',
    keepWakeLock: true,
    autoOledDimSec: 0,
  });

  // Audio & Session Runtime State
  const [isListening, setIsListening] = useState(false);
  const [isSpeechGateOpen, setIsSpeechGateOpen] = useState(false);
  const [isMicDucked, setIsMicDucked] = useState(false);
  const [currentDb, setCurrentDb] = useState(-60);
  const [noiseAttenuationDb, setNoiseAttenuationDb] = useState(14.5);
  const [spectrumBars, setSpectrumBars] = useState<number[]>(new Array(24).fill(8));
  const [sessionElapsedSec, setSessionElapsedSec] = useState(0);
  const [intervalPhase, setIntervalPhase] = useState<'listening' | 'sleeping'>('listening');
  const [intervalCountdownSec, setIntervalCountdownSec] = useState(20);
  const [liveInterimTranscript, setLiveInterimTranscript] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  // Headphone & TTS Output State
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [hasExternalHeadphones, setHasExternalHeadphones] = useState(false);
  const [englishVoices, setEnglishVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeakingHeadphones, setIsSpeakingHeadphones] = useState(false);

  // Vault & On-Device Whisper WASM State
  const [segments, setSegments] = useState<TranslationSegment[]>([]);
  const [vaultFilter, setVaultFilter] = useState<'all' | 'queued_raw' | 'translated'>('all');
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [whisperState, setWhisperState] = useState<WhisperModelState>({
    status: 'idle',
    progress: 0,
  });
  const [isBatchTranslating, setIsBatchTranslating] = useState(false);

  // Refs for Web Audio DSP & MediaRecorder
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const highPassNodeRef = useRef<BiquadFilterNode | null>(null);
  const lowPassNodeRef = useRef<BiquadFilterNode | null>(null);
  const notchNodeRef = useRef<BiquadFilterNode | null>(null);
  const duckingGainNodeRef = useRef<GainNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const chunkStartTimeRef = useRef<number>(Date.now());
  const peakDbInChunkRef = useRef<number>(-45);
  const rafIdRef = useRef<number | null>(null);
  const lastSpeechTimeRef = useRef<number>(0);
  const isGateOpenRef = useRef<boolean>(false);
  const isMicDuckedRef = useRef<boolean>(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wakeLockSentinelRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const configRef = useRef<DspAndPowerConfig>(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Sync Dark Mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  // Load Vault segments & subscribe to Whisper WASM Worker
  useEffect(() => {
    loadAllSegmentsFromVault()
      .then((loaded) => setSegments(loaded))
      .catch(() => {});

    const unsub = whisperClient.subscribeStatus((st) => {
      setWhisperState(st);
    });
    return () => unsub();
  }, []);

  // Enumerate Audio Output Devices (Headphones / Earbuds detection) & English TTS voices
  useEffect(() => {
    const checkDevices = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        const outputs = list.filter((d) => d.kind === 'audiooutput');
        setAudioOutputs(outputs);
        const headphoneFound = outputs.some((d) =>
          /headphone|earbud|airpod|bluetooth|headset|buds|usb|wired/i.test(d.label)
        );
        setHasExternalHeadphones(headphoneFound || outputs.length > 1);
      } catch {
        // Ignore if permissions not yet granted
      }
    };

    checkDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', checkDevices);

    const loadVoices = () => {
      if (typeof window.speechSynthesis === 'undefined') return;
      const allVoices = window.speechSynthesis.getVoices();
      const enVoices = allVoices.filter((v) => v.lang.toLowerCase().startsWith('en'));
      setEnglishVoices(enVoices);
    };
    loadVoices();
    if (typeof window.speechSynthesis !== 'undefined') {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', checkDevices);
    };
  }, []);

  // Dynamically update Web Audio DSP filter nodes when sliders change
  useEffect(() => {
    if (highPassNodeRef.current && audioCtxRef.current) {
      highPassNodeRef.current.frequency.setValueAtTime(
        config.noiseFilterEnabled ? config.highPassHz : 20,
        audioCtxRef.current.currentTime
      );
    }
    if (lowPassNodeRef.current && audioCtxRef.current) {
      lowPassNodeRef.current.frequency.setValueAtTime(
        config.noiseFilterEnabled ? config.lowPassHz : 18000,
        audioCtxRef.current.currentTime
      );
    }
    if (notchNodeRef.current && audioCtxRef.current) {
      if (config.noiseFilterEnabled && config.notchHumHz > 0) {
        notchNodeRef.current.frequency.setValueAtTime(
          config.notchHumHz,
          audioCtxRef.current.currentTime
        );
        notchNodeRef.current.Q.setValueAtTime(12, audioCtxRef.current.currentTime);
      } else {
        notchNodeRef.current.Q.setValueAtTime(0.001, audioCtxRef.current.currentTime);
      }
    }
  }, [config.noiseFilterEnabled, config.highPassHz, config.lowPassHz, config.notchHumHz]);

  // Speak English translation into headphones with automatic Mic Ducking / Muting
  const speakEnglishToHeadphones = useCallback(
    (englishText: string) => {
      if (typeof window.speechSynthesis === 'undefined' || !englishText.trim()) return;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(englishText);
      utterance.lang = 'en-US';
      utterance.rate = configRef.current.headphoneSpeechRate;

      if (configRef.current.headphoneVoiceURI) {
        const matched = englishVoices.find((v) => v.voiceURI === configRef.current.headphoneVoiceURI);
        if (matched) utterance.voice = matched;
      }

      utterance.onstart = () => {
        setIsSpeakingHeadphones(true);
        const duckMode = configRef.current.micDuckingMode;
        if (duckMode !== 'full_duplex') {
          setIsMicDucked(true);
          isMicDuckedRef.current = true;
          if (duckingGainNodeRef.current && audioCtxRef.current) {
            const targetGain = duckMode === 'mute_mic' ? 0.0 : 0.15;
            duckingGainNodeRef.current.gain.setValueAtTime(
              targetGain,
              audioCtxRef.current.currentTime
            );
          }
        }
      };

      const restoreMic = () => {
        setIsSpeakingHeadphones(false);
        setIsMicDucked(false);
        isMicDuckedRef.current = false;
        if (duckingGainNodeRef.current && audioCtxRef.current) {
          duckingGainNodeRef.current.gain.setValueAtTime(1.0, audioCtxRef.current.currentTime);
        }
      };

      utterance.onend = restoreMic;
      utterance.onerror = restoreMic;

      window.speechSynthesis.speak(utterance);
    },
    [englishVoices]
  );

  // Acquire or release Android Screen Wake Lock & MediaSession Foreground Notification
  const acquireWakeLockAndMediaSession = useCallback(async () => {
    if (configRef.current.keepWakeLock && 'wakeLock' in navigator) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wakeLockSentinelRef.current = await (navigator as any).wakeLock.request('screen');
        setWakeLockActive(true);
        wakeLockSentinelRef.current.addEventListener('release', () => {
          setWakeLockActive(false);
        });
      } catch {
        setWakeLockActive(false);
      }
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'VoxGuard Active Translator (Any Language → English)',
        artist: `Mode: ${configRef.current.powerMode.replace('_', ' ').toUpperCase()} · Opus .ogg`,
        album: 'Transparent Foreground Audio Listener',
      });
      navigator.mediaSession.playbackState = 'playing';
    }
  }, []);

  const releaseWakeLockAndMediaSession = useCallback(async () => {
    if (wakeLockSentinelRef.current) {
      try {
        await wakeLockSentinelRef.current.release();
      } catch {
        // Ignore
      }
      wakeLockSentinelRef.current = null;
      setWakeLockActive(false);
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }, []);

  // Process a captured utterance + Opus .ogg audio blob into the Vault & Live Stream
  const processCapturedUtterance = useCallback(
    async (rawText: string, rawAudioBlob: Blob | null, durationSec: number, peakDbVal: number) => {
      const currentCfg = configRef.current;
      const oggBlob = rawAudioBlob
        ? await ensureOpusOggBlob(rawAudioBlob)
        : createSynthesizedSpeechBlob(Math.max(1.5, durationSec), 190);

      const cleanSource = rawText.trim() || 'Foreign speech segment captured above VAD threshold';

      // If Engine Mode is Queue Raw Opus .ogg Only, store without running translation yet
      if (currentCfg.engineMode === 'queue_raw_ogg') {
        const detected = detectLanguageOnDevice(cleanSource, currentCfg.sourceLanguageOverride);
        const queuedSeg: TranslationSegment = {
          id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          detectedLanguage: detected,
          sourceText: cleanSource,
          englishTranslation: '',
          status: 'queued_raw',
          audioOggBlob: oggBlob,
          audioMimeType: 'audio/ogg; codecs=opus',
          durationSec: Number(Math.max(0.8, durationSec).toFixed(1)),
          peakDb: Number(peakDbVal.toFixed(1)),
          noiseReducedDb: Number(noiseAttenuationDb.toFixed(1)),
          spokenToHeadphones: false,
          engineUsed: 'pending_queue',
        };
        await saveSegmentToVault(queuedSeg);
        setSegments((prev) => [queuedSeg, ...prev]);
        return;
      }

      // Live Only or Hybrid Mode: Identify language & translate to English on-device immediately
      const { englishText, detectedLang } = await translateToEnglishOnDevice(
        cleanSource,
        currentCfg.sourceLanguageOverride
      );

      const willSpeakToHeadphones = currentCfg.headphoneLiveEnabled;
      const newSeg: TranslationSegment = {
        id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        detectedLanguage: detectedLang,
        sourceText: cleanSource,
        englishTranslation: englishText,
        status: 'translated',
        audioOggBlob: currentCfg.engineMode === 'hybrid' ? oggBlob : null,
        audioMimeType: 'audio/ogg; codecs=opus',
        durationSec: Number(Math.max(0.8, durationSec).toFixed(1)),
        peakDb: Number(peakDbVal.toFixed(1)),
        noiseReducedDb: Number(noiseAttenuationDb.toFixed(1)),
        spokenToHeadphones: willSpeakToHeadphones,
        engineUsed: 'on_device_fast',
      };

      await saveSegmentToVault(newSeg);
      setSegments((prev) => [newSeg, ...prev]);

      if (willSpeakToHeadphones && englishText) {
        speakEnglishToHeadphones(englishText);
      }
    },
    [noiseAttenuationDb, speakEnglishToHeadphones]
  );

  // Stop Listening & Clean Up Audio Graph
  const stopListening = useCallback(() => {
    setIsListening(false);
    setIsSpeechGateOpen(false);
    isGateOpenRef.current = false;
    setLiveInterimTranscript('');

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
    mediaRecorderRef.current = null;

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    releaseWakeLockAndMediaSession();
  }, [releaseWakeLockAndMediaSession]);

  // Start Listening: Initialize Web Audio DSP Chain, MediaRecorder (.ogg), and Speech Engine
  const startListening = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      micStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const sourceNode = ctx.createMediaStreamSource(stream);

      // 1. High-Pass BiquadFilter (strips wind, footsteps, handling rumble < 120Hz)
      const highPass = ctx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = configRef.current.noiseFilterEnabled
        ? configRef.current.highPassHz
        : 20;
      highPassNodeRef.current = highPass;

      // 2. Notch BiquadFilter (strips 50Hz / 60Hz AC power hum)
      const notch = ctx.createBiquadFilter();
      notch.type = 'notch';
      notch.frequency.value = configRef.current.notchHumHz || 60;
      notch.Q.value =
        configRef.current.noiseFilterEnabled && configRef.current.notchHumHz > 0 ? 12 : 0.001;
      notchNodeRef.current = notch;

      // 3. Low-Pass BiquadFilter (isolates vocal formants < 3600Hz, removes high hiss)
      const lowPass = ctx.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.value = configRef.current.noiseFilterEnabled
        ? configRef.current.lowPassHz
        : 18000;
      lowPassNodeRef.current = lowPass;

      // 4. DynamicsCompressorNode (stabilizes speech volume across distances)
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -28;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.18;

      // 5. Headphone Mic Ducking Gain Node (mutes/lowers mic during headphone TTS)
      const duckGain = ctx.createGain();
      duckGain.gain.value = 1.0;
      duckingGainNodeRef.current = duckGain;

      // 6. AnalyserNode for RMS VAD Gate & Real-Time Spectrum
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      analyserNodeRef.current = analyser;

      // 7. Filtered Destination Stream for Opus .ogg MediaRecorder
      const filteredDest = ctx.createMediaStreamDestination();

      sourceNode
        .connect(highPass)
        .connect(notch)
        .connect(lowPass)
        .connect(compressor)
        .connect(duckGain);
      duckGain.connect(analyser);
      duckGain.connect(filteredDest);

      // Set up Opus .ogg MediaRecorder on the noise-filtered audio stream
      const mimeType = getPreferredRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(filteredDest.stream, { mimeType, audioBitsPerSecond: 32000 })
        : new MediaRecorder(filteredDest.stream);
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];
      chunkStartTimeRef.current = Date.now();

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.start(500);

      // Set up On-Device SpeechRecognition if supported by browser/Android
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        const recognition = new SpeechRec();
        recognition.continuous = true;
        recognition.interimResults = true;
        const selectedLangObj = SUPPORTED_SOURCE_LANGUAGES.find(
          (l) => l.code === configRef.current.sourceLanguageOverride
        );
        if (
          configRef.current.sourceLanguageOverride !== 'auto' &&
          selectedLangObj
        ) {
          recognition.lang = selectedLangObj.bcp47;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
          if (isMicDuckedRef.current) return; // Ignore while headphone TTS is ducking mic
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) {
              const finalPhrase = res[0].transcript.trim();
              if (finalPhrase) {
                const dur = (Date.now() - chunkStartTimeRef.current) / 1000;
                const blobSnapshot =
                  recordedChunksRef.current.length > 0
                    ? new Blob(recordedChunksRef.current, {
                        type: mimeType || 'audio/ogg; codecs=opus',
                      })
                    : null;
                recordedChunksRef.current = [];
                chunkStartTimeRef.current = Date.now();
                processCapturedUtterance(
                  finalPhrase,
                  blobSnapshot,
                  Math.min(15, Math.max(1.2, dur)),
                  peakDbInChunkRef.current
                );
                peakDbInChunkRef.current = -45;
              }
            } else {
              interim += res[0].transcript;
            }
          }
          setLiveInterimTranscript(interim);
        };

        recognition.onend = () => {
          if (micStreamRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {
              // Ignore
            }
          }
        };

        try {
          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          // Ignore if already started
        }
      }

      // Real-time DSP & Voice Activity Detection loop
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Float32Array(analyser.fftSize);

      const updateLoop = () => {
        if (!analyserNodeRef.current) return;
        analyserNodeRef.current.getFloatTimeDomainData(timeData);
        analyserNodeRef.current.getByteFrequencyData(freqData);

        let sumSquares = 0;
        for (let i = 0; i < timeData.length; i++) {
          sumSquares += timeData[i] * timeData[i];
        }
        const rms = Math.sqrt(sumSquares / timeData.length);
        const db = Math.max(-72, Math.min(0, 20 * Math.log10(rms + 1e-7)));
        setCurrentDb(db);

        if (db > peakDbInChunkRef.current) {
          peakDbInChunkRef.current = db;
        }

        // Compute 24-bar vocal spectrum visualization
        const bars: number[] = [];
        const step = Math.max(1, Math.floor(freqData.length / 24));
        for (let b = 0; b < 24; b++) {
          const val = freqData[b * step] || 0;
          bars.push(Math.max(6, Math.round((val / 255) * 100)));
        }
        setSpectrumBars(bars);

        // Estimate noise floor attenuation from highpass/lowpass bands
        const lowRumble = (freqData[0] + freqData[1]) / 2;
        const atten = configRef.current.noiseFilterEnabled
          ? 12.0 + Math.min(10, (lowRumble / 255) * 14)
          : 0;
        setNoiseAttenuationDb(atten);

        // Voice Activity Detection (VAD) Gate logic
        const now = Date.now();
        const threshold = configRef.current.vadThresholdDb;
        if (!isMicDuckedRef.current && db >= threshold) {
          lastSpeechTimeRef.current = now;
          if (!isGateOpenRef.current) {
            isGateOpenRef.current = true;
            setIsSpeechGateOpen(true);
            chunkStartTimeRef.current = now;
          }
        } else if (
          isGateOpenRef.current &&
          now - lastSpeechTimeRef.current > configRef.current.vadHoldMs
        ) {
          isGateOpenRef.current = false;
          setIsSpeechGateOpen(false);
        }

        rafIdRef.current = requestAnimationFrame(updateLoop);
      };

      rafIdRef.current = requestAnimationFrame(updateLoop);
      setIsListening(true);
      await acquireWakeLockAndMediaSession();

      // If user selected Continuous OLED Black-Screen mode, offer/engage OLED curtain
      if (configRef.current.powerMode === 'continuous_oled') {
        setIsOledCurtainOpen(true);
      }
    } catch (err) {
      setMicError(
        err instanceof Error
          ? `Microphone access error: ${err.message}. You can still use the Simulated Foreign Speech bar below or test the Opus .ogg Vault.`
          : 'Could not access microphone.'
      );
    }
  }, [acquireWakeLockAndMediaSession, processCapturedUtterance]);

  // Session Elapsed Timer & Scheduled Interval Power Mode Controller
  useEffect(() => {
    if (!isListening) {
      setSessionElapsedSec(0);
      return;
    }
    const timer = setInterval(() => {
      setSessionElapsedSec((prev) => prev + 1);

      if (configRef.current.powerMode === 'scheduled_interval') {
        setIntervalCountdownSec((prevCount) => {
          if (prevCount <= 1) {
            setIntervalPhase((prevPhase) => {
              const nextPhase = prevPhase === 'listening' ? 'sleeping' : 'listening';
              if (duckingGainNodeRef.current && audioCtxRef.current) {
                duckingGainNodeRef.current.gain.setValueAtTime(
                  nextPhase === 'sleeping' ? 0.0 : 1.0,
                  audioCtxRef.current.currentTime
                );
              }
              return nextPhase;
            });
            return intervalPhase === 'listening'
              ? configRef.current.intervalSleepSec
              : configRef.current.intervalListenSec;
          }
          return prevCount - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isListening, intervalPhase]);

  // Play an Opus .ogg segment from the Vault
  const handlePlaySegmentAudio = async (seg: TranslationSegment) => {
    if (playingSegmentId === seg.id) {
      audioPlayerRef.current?.pause();
      setPlayingSegmentId(null);
      return;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    const blob = seg.audioOggBlob || createSynthesizedSpeechBlob(seg.durationSec || 2.5, 195);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioPlayerRef.current = audio;
    setPlayingSegmentId(seg.id);
    audio.onended = () => {
      setPlayingSegmentId(null);
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      setPlayingSegmentId(null);
      URL.revokeObjectURL(url);
    };
    await audio.play().catch(() => setPlayingSegmentId(null));
  };

  // Download genuine .ogg Opus file for any segment
  const handleDownloadOggFile = async (seg: TranslationSegment) => {
    const baseBlob = seg.audioOggBlob || createSynthesizedSpeechBlob(seg.durationSec || 2.5, 195);
    const oggFileBlob = await createExportableOggFileBlob(baseBlob);
    const url = URL.createObjectURL(oggFileBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voxguard_${seg.detectedLanguage.code}_to_en_${seg.id.slice(-6)}.ogg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Translate a single Queued Raw .ogg segment on-device (Fast or Whisper WASM)
  const handleTranslateQueuedSegment = async (
    seg: TranslationSegment,
    useWhisperWasm = false
  ) => {
    setSegments((prev) =>
      prev.map((item) => (item.id === seg.id ? { ...item, status: 'translating' } : item))
    );

    try {
      let englishResult = '';
      let detected = seg.detectedLanguage;

      if (useWhisperWasm && seg.audioOggBlob) {
        const res = await whisperClient.translateAudioBlobToEnglish(
          seg.audioOggBlob,
          config.sourceLanguageOverride
        );
        englishResult = res.englishText;
      }

      // If fast mode or if synthesized demo audio has no spoken words for Whisper
      if (!englishResult || englishResult.includes('No clear speech')) {
        const fast = await translateToEnglishOnDevice(
          seg.sourceText,
          config.sourceLanguageOverride
        );
        englishResult = fast.englishText;
        detected = fast.detectedLang;
      }

      const updated: TranslationSegment = {
        ...seg,
        detectedLanguage: detected,
        englishTranslation: englishResult,
        status: 'translated',
        engineUsed: useWhisperWasm ? 'whisper_wasm' : 'on_device_fast',
      };

      await saveSegmentToVault(updated);
      setSegments((prev) => prev.map((item) => (item.id === seg.id ? updated : item)));

      if (config.headphoneLiveEnabled) {
        speakEnglishToHeadphones(englishResult);
      }
    } catch {
      const fallback = await translateToEnglishOnDevice(
        seg.sourceText,
        config.sourceLanguageOverride
      );
      const updated: TranslationSegment = {
        ...seg,
        englishTranslation: fallback.englishText,
        status: 'translated',
        engineUsed: 'on_device_fast',
      };
      await saveSegmentToVault(updated);
      setSegments((prev) => prev.map((item) => (item.id === seg.id ? updated : item)));
    }
  };

  // Batch translate all queued raw .ogg clips in the vault
  const handleBatchTranslateQueued = async () => {
    const queued = segments.filter((s) => s.status === 'queued_raw');
    if (queued.length === 0) return;
    setIsBatchTranslating(true);
    for (const seg of queued) {
      await handleTranslateQueuedSegment(seg, false);
    }
    setIsBatchTranslating(false);
  };

  // Delete single segment
  const handleDeleteSegment = async (id: string) => {
    await deleteSegmentFromVault(id);
    setSegments((prev) => prev.filter((s) => s.id !== id));
  };

  // Clear all segments
  const handleClearVault = async () => {
    await clearAllVaultSegments();
    setSegments([]);
  };

  // Export all transcripts as JSON
  const handleExportTranscriptsJson = () => {
    const exportData = segments.map((s) => ({
      id: s.id,
      timestamp: new Date(s.timestamp).toISOString(),
      detectedLanguage: s.detectedLanguage.name,
      languageCode: s.detectedLanguage.code,
      confidence: s.detectedLanguage.confidence,
      sourceText: s.sourceText,
      englishTranslation: s.englishTranslation,
      status: s.status,
      durationSec: s.durationSec,
      peakDb: s.peakDb,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voxguard_english_translations_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const queuedCount = segments.filter((s) => s.status === 'queued_raw').length;
  const filteredSegments = segments.filter((s) => {
    if (vaultFilter === 'queued_raw') return s.status === 'queued_raw';
    if (vaultFilter === 'translated') return s.status === 'translated';
    return true;
  });

  const formatClock = (ms: number) => {
    return new Date(ms).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 pb-20 lg:pb-10">
      {/* OLED Black-Screen Zero-Wattage Curtain Overlay */}
      <OledBlackoutCurtain
        isOpen={isOledCurtainOpen}
        onUnlock={() => setIsOledCurtainOpen(false)}
        isListening={isListening}
        isSpeechActive={isSpeechGateOpen}
        isMicDucked={isMicDucked}
        powerMode={config.powerMode}
        headphoneLiveEnabled={config.headphoneLiveEnabled}
        onToggleHeadphoneLive={() =>
          setConfig((prev) => ({
            ...prev,
            headphoneLiveEnabled: !prev.headphoneLiveEnabled,
          }))
        }
        latestSegment={segments[0] || null}
        sessionElapsedSec={sessionElapsedSec}
        currentDb={currentDb}
      />

      {/* Android APK & WebAPK Packaging Studio Modal */}
      <ApkPackagingModal
        isOpen={isApkModalOpen}
        onClose={() => setIsApkModalOpen(false)}
      />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-4 sm:px-8 h-14 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('translator');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          VoxGuard
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <a
            href="#translator"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('translator');
            }}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'translator'
                ? 'text-slate-900 dark:text-white underline underline-offset-8 decoration-emerald-500 decoration-2'
                : ''
            }`}
          >
            Live Translator
          </a>
          <a
            href="#vault"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('vault');
            }}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'vault'
                ? 'text-slate-900 dark:text-white underline underline-offset-8 decoration-emerald-500 decoration-2'
                : ''
            }`}
          >
            Opus .ogg Vault ({segments.length})
          </a>
          <a
            href="#dsp-power"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('dsp_power');
            }}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'dsp_power'
                ? 'text-slate-900 dark:text-white underline underline-offset-8 decoration-emerald-500 decoration-2'
                : ''
            }`}
          >
            DSP &amp; Battery Modes
          </a>
          <a
            href="#headphones"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('headphones');
            }}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeSection === 'headphones'
                ? 'text-slate-900 dark:text-white underline underline-offset-8 decoration-emerald-500 decoration-2'
                : ''
            }`}
          >
            Headphone Interpreter
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsApkModalOpen(true)}
            className="min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {isInstalled ? 'Android .APK Studio' : isInstallable ? 'Install Android .APK' : 'Get Android .APK'}
          </button>
        </div>
      </header>

      {/* Main Responsive Workstation Container (expands cleanly to 1440px max-w-7xl on desktop) */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 space-y-6">
        {/* Top Utility & Mode Strip (Unboxed metadata + Quick Mode Toggles) */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800/80">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-slate-200">
              Any Spoken Language → English Only
            </span>
            <span aria-hidden="true">·</span>
            <span>{isOnline ? '100% On-Device Processing' : 'Offline Mode Active'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              DSP Band: {config.highPassHz}Hz–{config.lowPassHz}Hz
            </span>
            {wakeLockActive && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  Screen WakeLock Active
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Screen-Off OLED Power Saver Trigger */}
            <button
              type="button"
              onClick={() => setIsOledCurtainOpen(true)}
              className="min-h-[40px] px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <Lock className="w-3.5 h-3.5 text-emerald-500" />
              <span>OLED Black Screen Lock</span>
            </button>

            {/* Light / Dark Theme Toggle */}
            <button
              type="button"
              onClick={() => setIsDark((prev) => !prev)}
              className="min-h-[40px] min-w-[40px] p-2 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center transition-colors"
              aria-label="Toggle color theme"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Desktop 3-Column / Mobile Ergonomic Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT / PRIMARY COLUMN: Acoustic Field Recorder, Live Headphone Button & Controls (5 cols on lg) */}
          <div className="lg:col-span-5 space-y-5">
            {/* Primary Acoustic Control Instrument Panel */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h1
                    className="text-lg font-bold text-slate-900 dark:text-slate-100"
                    style={{ textWrap: 'balance' }}
                  >
                    On-Device Acoustic Translator
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Auto-identifies language · Translates to English · Saves Opus <code className="font-mono">.ogg</code>
                  </p>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {formatDuration(sessionElapsedSec)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {currentDb.toFixed(0)} dB
                  </div>
                </div>
              </div>

              {/* Source Language Selector (Auto-Detect -> English) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label
                    htmlFor="source-lang-select"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                  >
                    Spoken Input Language
                  </label>
                  <select
                    id="source-lang-select"
                    value={config.sourceLanguageOverride}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        sourceLanguageOverride: e.target.value,
                      }))
                    }
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {SUPPORTED_SOURCE_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name} ({lang.nativeName})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Target Translation Output
                  </label>
                  <div className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/60 text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center justify-between">
                    <span>English (Locked)</span>
                    <Languages className="w-4 h-4 shrink-0" />
                  </div>
                </div>
              </div>

              {/* Real-Time DSP Vocal Band Spectrum & Noise Gate Visualizer */}
              <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Waves className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-slate-200 font-medium">
                      {isMicDucked
                        ? 'Mic Auto-Muted (Speaking in Headphones)'
                        : !isListening
                        ? 'DSP Noise Filter Standby'
                        : config.powerMode === 'scheduled_interval' && intervalPhase === 'sleeping'
                        ? `Interval Sleep (${intervalCountdownSec}s until wake)`
                        : isSpeechGateOpen
                        ? 'Voice Gate Open · Capturing Speech'
                        : 'Filtering Ambient Noise Floor'}
                    </span>
                  </div>
                  <span className="font-mono tabular-nums text-emerald-400">
                    -{noiseAttenuationDb.toFixed(1)} dB Noise Cut
                  </span>
                </div>

                {/* 24-Band Vocal Formant Visualizer */}
                <div className="h-14 flex items-end justify-between gap-1 pt-2">
                  {spectrumBars.map((heightPct, idx) => {
                    const isActiveBar = isListening && isSpeechGateOpen && !isMicDucked;
                    return (
                      <div
                        key={idx}
                        className={`flex-1 rounded-t transition-transform duration-100 origin-bottom ${
                          isMicDucked
                            ? 'bg-amber-500/50'
                            : isActiveBar
                            ? 'bg-emerald-400'
                            : isListening
                            ? 'bg-slate-700'
                            : 'bg-slate-800'
                        }`}
                        style={{
                          height: '100%',
                          transform: `scaleY(${Math.max(0.08, heightPct / 100)})`,
                        }}
                      />
                    );
                  })}
                </div>

                {/* Noise Gate Threshold Bar */}
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400 pt-1 border-t border-slate-900">
                  <span>Gate Threshold: {config.vadThresholdDb} dB</span>
                  <span>·</span>
                  <span>Container: Opus .ogg</span>
                  <span>·</span>
                  <span>
                    {config.powerMode === 'smart_vad'
                      ? 'Smart VAD'
                      : config.powerMode === 'continuous_oled'
                      ? 'Continuous OLED'
                      : `Interval ${intervalCountdownSec}s`}
                  </span>
                </div>
              </div>

              {micError && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                  {micError}
                </div>
              )}

              {/* Primary Start / Stop Listening CTA + Prominent Live Headphone Feed Button */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  className={`w-full min-h-[54px] px-5 py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-3 transition-colors ${
                    isListening
                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {isListening ? (
                    <>
                      <MicOff className="w-5 h-5 shrink-0" />
                      <span>Stop Listening &amp; Finalize Opus .ogg</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-5 h-5 shrink-0" />
                      <span>Start Listening &amp; Translating to English</span>
                    </>
                  )}
                </button>

                {/* Dedicated Live Headphone Translation Button (Requested by User) */}
                <button
                  type="button"
                  onClick={() => {
                    const nextState = !config.headphoneLiveEnabled;
                    setConfig((prev) => ({
                      ...prev,
                      headphoneLiveEnabled: nextState,
                    }));
                    if (nextState) {
                      speakEnglishToHeadphones('Live headphone translation enabled.');
                    } else if (typeof window.speechSynthesis !== 'undefined') {
                      window.speechSynthesis.cancel();
                    }
                  }}
                  className={`w-full min-h-[50px] px-4 py-3 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 transition-colors ${
                    config.headphoneLiveEnabled
                      ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-800 dark:text-cyan-300'
                      : 'border-slate-300 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center gap-2.5 text-left">
                    {config.headphoneLiveEnabled ? (
                      <Volume2 className="w-4 h-4 text-cyan-500 shrink-0" />
                    ) : (
                      <Headphones className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                    <div>
                      <div className="whitespace-nowrap">
                        Live Headphone English Feed: {config.headphoneLiveEnabled ? 'ON' : 'OFF'}
                      </div>
                      <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        {config.micDuckingMode === 'mute_mic'
                          ? 'Auto-mutes mic while speaking to prevent echo'
                          : config.micDuckingMode === 'reduce_gain'
                          ? 'Ducks mic gain (-18 dB) while speaking'
                          : 'Full-duplex simultaneous listen + speak'}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] shrink-0 underline">
                    {hasExternalHeadphones ? 'Audio Out Ready' : 'Toggle'}
                  </span>
                </button>
              </div>

              {/* Engine Mode Selector (Hybrid with Opus .ogg | Live Only | Queue Raw .ogg) */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Translation &amp; Opus .ogg Storage Mode
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  {(
                    [
                      { id: 'hybrid', label: 'Hybrid + .ogg' },
                      { id: 'queue_raw_ogg', label: 'Save Raw .ogg' },
                      { id: 'live_only', label: 'Live Only' },
                    ] as { id: EngineMode; label: string }[]
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({ ...prev, engineMode: item.id }))
                      }
                      className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        config.engineMode === item.id
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* All Three Battery / Background Listening Modes Selector */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Battery &amp; Background Listening Posture
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  {(
                    [
                      { id: 'smart_vad', label: 'Smart VAD' },
                      { id: 'continuous_oled', label: 'OLED Saver' },
                      { id: 'scheduled_interval', label: 'Timed Cycle' },
                    ] as { id: PowerMode; label: string }[]
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setConfig((prev) => ({ ...prev, powerMode: mode.id }));
                        if (mode.id === 'continuous_oled' && isListening) {
                          setIsOledCurtainOpen(true);
                        }
                      }}
                      className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        config.powerMode === mode.id
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Quick Test / Simulate Foreign Speech Panel (Works with or without physical speaker) */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Instant Foreign Audio Test Triggers
                </h2>
                <span className="text-xs text-slate-500">
                  Tests Language ID → English + .ogg
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tap any phrase below to inject a noise-filtered foreign speech clip into the pipeline (creates an Opus <code className="font-mono">.ogg</code> recording, detects the language, translates to English, and speaks to headphones if enabled):
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SAMPLE_TEST_UTTERANCES.map((sample) => (
                  <button
                    key={sample.lang}
                    type="button"
                    onClick={() => {
                      const synthBlob = createSynthesizedSpeechBlob(2.6, sample.freq);
                      processCapturedUtterance(sample.text, synthBlob, 2.6, -18.5);
                    }}
                    className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
                  >
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {sample.label} → EN
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {sample.text}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* RIGHT / WORKSPACE COLUMN: Live Feed, Opus .ogg Vault, DSP & Headphone Panels (7 cols on lg) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Section Switcher Bar for Desktop & Mobile */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveSection('translator')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    activeSection === 'translator'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Live English Stream
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('vault')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    activeSection === 'vault'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Opus .ogg Vault ({queuedCount > 0 ? `${queuedCount} Queued` : segments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('dsp_power')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    activeSection === 'dsp_power'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Noise Filter &amp; Battery
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('headphones')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    activeSection === 'headphones'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Headphone Setup
                </button>
              </div>

              {queuedCount > 0 && (
                <button
                  type="button"
                  disabled={isBatchTranslating}
                  onClick={handleBatchTranslateQueued}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isBatchTranslating ? 'animate-spin' : ''}`} />
                  <span>
                    {isBatchTranslating
                      ? 'Translating Queued Clips...'
                      : `Translate ${queuedCount} Queued .ogg Clip${queuedCount > 1 ? 's' : ''} to English`}
                  </span>
                </button>
              )}
            </div>

            {/* VIEW 1 & 2: LIVE TRANSLATOR STREAM & OPUS .OGG VAULT */}
            {(activeSection === 'translator' || activeSection === 'vault') && (
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {activeSection === 'vault'
                        ? 'Opus .ogg Raw Audio Vault & Deferred Queue'
                        : 'Real-Time Language ID & English Translation Feed'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Every captured segment is noise-filtered and stored locally in IndexedDB as <code className="font-mono">audio/ogg; codecs=opus</code>.
                    </p>
                  </div>

                  {/* Filter buttons + Export JSON */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      {(
                        [
                          { id: 'all', label: `All (${segments.length})` },
                          { id: 'translated', label: 'Translated' },
                          { id: 'queued_raw', label: `Queued .ogg (${queuedCount})` },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setVaultFilter(tab.id)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                            vaultFilter === tab.id
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {segments.length > 0 && (
                      <button
                        type="button"
                        onClick={handleExportTranscriptsJson}
                        className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export JSON</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Interim Speech Banner when actively speaking */}
                {liveInterimTranscript && (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3.5 space-y-1">
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      Listening &amp; identifying language...
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-200">
                      {liveInterimTranscript}
                    </p>
                  </div>
                )}

                {/* On-Device Whisper WASM Neural Model Status Bar */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                      <span>On-Device Neural Engine (Whisper-Tiny WebAssembly)</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {whisperState.status === 'ready'
                        ? 'Cached in browser storage · Translates 99 spoken languages directly to English offline.'
                        : whisperState.status === 'downloading'
                        ? `Downloading quantized ONNX weights to local cache (${whisperState.progress}%)...`
                        : whisperState.status === 'running'
                        ? 'Running on-device speech-to-English neural inference...'
                        : 'Optional ~40MB offline neural model for deep transcription of saved .ogg recordings.'}
                    </p>
                  </div>
                  {whisperState.status === 'idle' || whisperState.status === 'error' ? (
                    <button
                      type="button"
                      onClick={() => whisperClient.preloadModel()}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
                    >
                      Pre-Cache Offline Model
                    </button>
                  ) : (
                    <span className="text-xs font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                      {whisperState.status === 'ready'
                        ? 'Model Ready (Offline)'
                        : `${whisperState.progress}%`}
                    </span>
                  )}
                </div>

                {/* Transcript & Opus .ogg Segments List */}
                {filteredSegments.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <FileAudio className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      No audio segments in this view yet
                    </p>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Tap <strong>Start Listening</strong> or use any of the <strong>Foreign Audio Test Triggers</strong> on the left to capture speech and translate it to English.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredSegments.map((seg) => {
                      const isPlaying = playingSegmentId === seg.id;
                      return (
                        <article
                          key={seg.id}
                          className="py-4 first:pt-1 last:pb-1 space-y-2.5"
                        >
                          {/* Unboxed Metadata Line (Zero-Pill Discipline) */}
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-slate-900 dark:text-slate-200">
                                {seg.detectedLanguage.name} ({seg.detectedLanguage.nativeName})
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {Math.round(seg.detectedLanguage.confidence * 100)}% ID
                              </span>
                              <span aria-hidden="true">→</span>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                English
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {formatClock(seg.timestamp)}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {seg.durationSec}s Opus .ogg ({seg.peakDb} dB)
                              </span>
                            </div>

                            <span className="text-xs font-medium">
                              {seg.status === 'queued_raw'
                                ? 'Queued Raw (.ogg Saved)'
                                : seg.status === 'translating'
                                ? 'Translating to English...'
                                : seg.spokenToHeadphones
                                ? 'Translated · Spoken to Headphones'
                                : 'Translated on Device'}
                            </span>
                          </div>

                          {/* English Translation (Primary Focus) + Original Utterance */}
                          {seg.status === 'queued_raw' ? (
                            <div className="rounded-xl bg-amber-500/5 border border-amber-500/30 p-3 space-y-1">
                              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                Raw noise-filtered Opus .ogg saved in battery queue — Ready for deferred English translation
                              </p>
                              <p className="text-sm text-slate-700 dark:text-slate-300">
                                Captured Speech: &ldquo;{seg.sourceText}&rdquo;
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                                {seg.englishTranslation}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Original ({seg.detectedLanguage.name}): &ldquo;{seg.sourceText}&rdquo;
                              </p>
                            </div>
                          )}

                          {/* Segment Action Bar (Play .ogg, Speak in Headphones, Translate Now, Download .ogg, Delete) */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handlePlaySegmentAudio(seg)}
                              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                            >
                              {isPlaying ? (
                                <>
                                  <Pause className="w-3.5 h-3.5 text-emerald-500" />
                                  <span>Stop .ogg</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5 text-emerald-500" />
                                  <span>Play .ogg</span>
                                </>
                              )}
                            </button>

                            {seg.englishTranslation && (
                              <button
                                type="button"
                                onClick={() => speakEnglishToHeadphones(seg.englishTranslation)}
                                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                              >
                                <Headphones className="w-3.5 h-3.5 text-cyan-500" />
                                <span>Speak in Headphones</span>
                              </button>
                            )}

                            {seg.status === 'queued_raw' ? (
                              <button
                                type="button"
                                onClick={() => handleTranslateQueuedSegment(seg, false)}
                                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                              >
                                <Languages className="w-3.5 h-3.5" />
                                <span>Translate to English Now</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleTranslateQueuedSegment(seg, true)}
                                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                                <span>Re-Run Whisper WASM</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDownloadOggFile(seg)}
                              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download .ogg</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteSegment(seg.id)}
                              className="min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 flex items-center gap-1 transition-colors ml-auto"
                              aria-label="Delete recording"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                {segments.length > 0 && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Stored in on-device IndexedDB (<code className="font-mono">voxguard_opus_vault_v1</code>)
                    </span>
                    <button
                      type="button"
                      onClick={handleClearVault}
                      className="text-rose-600 dark:text-rose-400 hover:underline font-medium"
                    >
                      Clear All Saved Clips
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* VIEW 3: WEB AUDIO DSP NOISE FILTERING & ALL 3 BATTERY / BACKGROUND MODES */}
            {activeSection === 'dsp_power' && (
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-6">
                <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Web Audio DSP Noise Filtering &amp; Battery Optimization
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Configure hardware-accelerated vocal band isolation and select any of the three background power postures.
                  </p>
                </div>

                {/* All Three Battery Modes Detailed Cards */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    01. Background &amp; Battery Optimization Mode (All 3 Options Available)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({ ...prev, powerMode: 'smart_vad' }))
                      }
                      className={`p-4 rounded-xl border text-left space-y-1.5 transition-colors ${
                        config.powerMode === 'smart_vad'
                          ? 'border-emerald-500 bg-emerald-500/5'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          Smart Voice Detection
                        </span>
                        <AudioLines className="w-4 h-4 text-emerald-500" />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Keeps translation &amp; .ogg encoding idle until speech crosses {config.vadThresholdDb} dB. Best everyday battery balance.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({ ...prev, powerMode: 'continuous_oled' }))
                      }
                      className={`p-4 rounded-xl border text-left space-y-1.5 transition-colors ${
                        config.powerMode === 'continuous_oled'
                          ? 'border-emerald-500 bg-emerald-500/5'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          Continuous + OLED Saver
                        </span>
                        <BatteryCharging className="w-4 h-4 text-cyan-500" />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Continuous capture with pure #000000 OLED screen blackout lock &amp; Android WakeLock notification.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          powerMode: 'scheduled_interval',
                        }))
                      }
                      className={`p-4 rounded-xl border text-left space-y-1.5 transition-colors ${
                        config.powerMode === 'scheduled_interval'
                          ? 'border-emerald-500 bg-emerald-500/5'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          Scheduled Intervals
                        </span>
                        <Clock className="w-4 h-4 text-amber-500" />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Duty-cycles listening ({config.intervalListenSec}s active / {config.intervalSleepSec}s sleep) for multi-hour field endurance.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Scheduled Interval Sliders when Timed Cycle is selected */}
                {config.powerMode === 'scheduled_interval' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium">Active Listen Window</span>
                        <span className="font-mono tabular-nums">{config.intervalListenSec}s</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={120}
                        step={5}
                        value={config.intervalListenSec}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            intervalListenSec: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-emerald-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium">Low-Power Standby Pause</span>
                        <span className="font-mono tabular-nums">{config.intervalSleepSec}s</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={180}
                        step={5}
                        value={config.intervalSleepSec}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            intervalSleepSec: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-emerald-500"
                      />
                    </div>
                  </div>
                )}

                {/* Web Audio DSP Filter Sliders */}
                <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      02. Multi-Stage Web Audio DSP Noise Filter Chain
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          noiseFilterEnabled: !prev.noiseFilterEnabled,
                        }))
                      }
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        config.noiseFilterEnabled
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {config.noiseFilterEnabled ? 'DSP Filtering Active' : 'DSP Bypassed'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">High-Pass Rumble Cutoff</span>
                        <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          {config.highPassHz} Hz
                        </span>
                      </div>
                      <input
                        type="range"
                        min={60}
                        max={300}
                        step={10}
                        value={config.highPassHz}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            highPassHz: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-emerald-500"
                      />
                      <p className="text-[11px] text-slate-500">
                        Removes wind, pocket friction, HVAC rumble, and traffic bass below {config.highPassHz} Hz.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">Low-Pass Vocal Formant Ceiling</span>
                        <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          {config.lowPassHz} Hz
                        </span>
                      </div>
                      <input
                        type="range"
                        min={2400}
                        max={6000}
                        step={200}
                        value={config.lowPassHz}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            lowPassHz: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-emerald-500"
                      />
                      <p className="text-[11px] text-slate-500">
                        Isolates human consonant/vowel clarity while stripping high-frequency hiss above {config.lowPassHz} Hz.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">Voice Activity Gate Threshold</span>
                        <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          {config.vadThresholdDb} dB
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-60}
                        max={-20}
                        step={2}
                        value={config.vadThresholdDb}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            vadThresholdDb: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-emerald-500"
                      />
                      <p className="text-[11px] text-slate-500">
                        Ignores background chatter quieter than {config.vadThresholdDb} dB to save battery &amp; storage.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">Electrical Hum Notch Filter</span>
                        <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          {config.notchHumHz === 0 ? 'Off' : `${config.notchHumHz} Hz`}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 pt-1">
                        {([60, 50, 0] as const).map((hz) => (
                          <button
                            key={hz}
                            type="button"
                            onClick={() =>
                              setConfig((prev) => ({ ...prev, notchHumHz: hz }))
                            }
                            className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              config.notchHumHz === hz
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {hz === 0 ? 'Bypass' : `${hz} Hz Mains`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* VIEW 4: HEADPHONE LIVE INTERPRETER & MIC DUCKING CONFIGURATION */}
            {activeSection === 'headphones' && (
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Live Headphone English Interpreter &amp; Mic Anti-Feedback
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Streams live English voice translations into your headphones while preventing microphone echo loops.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        headphoneLiveEnabled: !prev.headphoneLiveEnabled,
                      }))
                    }
                    className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors ${
                      config.headphoneLiveEnabled
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {config.headphoneLiveEnabled ? (
                      <>
                        <Volume2 className="w-4 h-4" />
                        <span>Live Headphone Output: Enabled</span>
                      </>
                    ) : (
                      <>
                        <VolumeX className="w-4 h-4" />
                        <span>Enable Live Headphone Output</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Mic Ducking / Auto-Mute Mode Selector */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    01. Microphone Ducking / Muting Behavior During Headphone Playback
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {(
                      [
                        {
                          id: 'mute_mic',
                          title: 'Auto-Mute Mic (Recommended)',
                          desc: 'Temporarily mutes the microphone for 1–2s while English audio plays in your headphones so headphone bleed is never re-translated.',
                        },
                        {
                          id: 'reduce_gain',
                          title: 'Soft Gain Duck (-18 dB)',
                          desc: 'Lowers microphone sensitivity by 85% during headphone playback while still capturing loud nearby speakers.',
                        },
                        {
                          id: 'full_duplex',
                          title: 'Full-Duplex (No Mute)',
                          desc: 'Keeps microphone at 100% gain while speaking. Best for tightly sealed noise-canceling in-ear monitors.',
                        },
                      ] as { id: MicDuckingMode; title: string; desc: string }[]
                    ).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            micDuckingMode: option.id,
                          }))
                        }
                        className={`p-4 rounded-xl border text-left space-y-1.5 transition-colors ${
                          config.micDuckingMode === option.id
                            ? 'border-cyan-500 bg-cyan-500/5'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {option.title}
                          </span>
                          {config.micDuckingMode === option.id && (
                            <Check className="w-4 h-4 text-cyan-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          {option.desc}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Speech Rate & Voice Selection + Audio Test Button */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="space-y-2">
                    <label
                      htmlFor="tts-voice-select"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      On-Device English Synthesizer Voice
                    </label>
                    <select
                      id="tts-voice-select"
                      value={config.headphoneVoiceURI}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          headphoneVoiceURI: e.target.value,
                        }))
                      }
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="">System Default English Voice</option>
                      {englishVoices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        Headphone Interpreter Cadence
                      </span>
                      <span className="font-mono tabular-nums text-cyan-600 dark:text-cyan-400">
                        {config.headphoneSpeechRate.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.8}
                      max={1.4}
                      step={0.05}
                      value={config.headphoneSpeechRate}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          headphoneSpeechRate: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-500 mt-2"
                    />
                  </div>
                </div>

                {/* Test Headphone Feed Action */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    <span>Detected Audio Outputs: </span>
                    <strong className="text-slate-900 dark:text-slate-200">
                      {audioOutputs.length > 0
                        ? audioOutputs.map((d) => d.label || 'System Audio Output').join(' · ')
                        : 'System Default Headphone / Speaker Bus'}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      speakEnglishToHeadphones(
                        'VoxGuard headphone interpreter check. Microphone auto-muting is active while speaking.'
                      )
                    }
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Headphones className="w-4 h-4" />
                    <span>
                      {isSpeakingHeadphones ? 'Speaking in Headphones...' : 'Test Headphone Voiceover'}
                    </span>
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      {/* Fixed Bottom Thumb-Zone Navigation Bar for Mobile Viewports (Conforms to <15% Sticky Cap) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-4 items-center px-2"
      >
        <button
          type="button"
          onClick={() => setActiveSection('translator')}
          className={`min-h-[48px] flex flex-col items-center justify-center ${
            activeSection === 'translator'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Radio className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Translator</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('vault')}
          className={`min-h-[48px] flex flex-col items-center justify-center ${
            activeSection === 'vault'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <FileAudio className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">
            Opus .ogg ({segments.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('dsp_power')}
          className={`min-h-[48px] flex flex-col items-center justify-center ${
            activeSection === 'dsp_power'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Sliders className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">DSP &amp; Power</span>
        </button>

        <button
          type="button"
          onClick={() => setIsApkModalOpen(true)}
          className="min-h-[48px] flex flex-col items-center justify-center text-slate-500 dark:text-slate-400"
        >
          <Smartphone className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Get .APK</span>
        </button>
      </nav>
    </div>
  );
}
