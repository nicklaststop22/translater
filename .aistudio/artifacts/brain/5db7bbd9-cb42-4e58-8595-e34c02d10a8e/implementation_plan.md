# VoxGuard — On-Device Android Audio Translator & Opus Vault

An offline-capable, battery-optimized voice translation and language identification application engineered for Android devices. It combines a real-time Web Audio DSP noise-filtering pipeline, on-device speech recognition and neural translation (with zero paid cloud API dependency), an offline **Opus `.ogg` raw audio vault** for deferred translation, a **Live Headphone Interpreter** with anti-feedback mic ducking, and an integrated **Android APK & WebAPK Packaging Studio**.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Summary of Confirmed Decisions & Clarifications from Phase 1**

- **Confirmed Decision 1 — Hybrid On-Device AI + Opus `.ogg` Audio Vault**:
  The app runs in a **Hybrid Engine Mode**: it performs live on-device language identification and translation when active, and simultaneously (or exclusively in battery-saver queue mode) records noise-filtered speech segments compressed as **Opus `.ogg` (`audio/ogg; codecs=opus`)** into an on-device IndexedDB vault so untranslated or deferred clips can be replayed, batch-translated later, or exported as `.ogg` files.
- **Confirmed Decision 2 — All Three Battery & Background Listening Modes Included**:
  Users can switch on the fly between all three power postures:
  1. **Smart VAD (Voice Activity Detection)**: Keeps the translation engine idle until human speech (300Hz–3400Hz) crosses the adjustable noise gate threshold.
  2. **Continuous + OLED Black-Screen Power Saver**: Maintains continuous listening with a pure `#000000` zero-wattage OLED Curtain Lock that keeps the Android `WakeLock` and transparent `MediaSession` lock-screen notification active while turning display pixels off.
  3. **Scheduled Intervals / Manual Trigger**: Captures on a configurable duty cycle (e.g., listen for 30s every 2m, or push-to-capture) for maximum multi-hour standby life.
- **Clarification 1 — What "Mic Ducking" Means for Live Headphone Translation**:
  Yes—**Mic Ducking (Smart Auto-Mute)** means that while the app is speaking a translation aloud into your headphones, it automatically mutes or lowers the microphone input gain for those 1–2 seconds. This prevents your phone's mic from picking up sound leaking out of your headphones and translating its own voice in an infinite loop. We will also provide a toggle to switch between **Auto-Mute Mic While Speaking (Default)** and **Simultaneous Full-Duplex** (for sealed noise-canceling earbuds).
- **Clarification 2 — Difference Between Android WebAPK vs. Standalone `.apk` File**:
  - **Direct Android WebAPK (Instant Install)**: When opened in Android Chrome, tapping **Install Android App** prompts Android to compile and install a native-wrapped **WebAPK** directly into your phone's app drawer with standalone full-screen rendering, offline caching, and lock-screen audio controls.
  - **Standalone `.apk` Binary File**: Because this cloud workspace does not house the 12GB Android SDK compiler binary, the app includes a built-in **APK Packaging & Export Studio** that (1) connects to **PWABuilder's 1-Click Cloud APK Compiler** to generate a downloadable, signed `.apk` file from this app's live URL in ~30 seconds, and (2) exports a pre-configured **Capacitor Native Android Project bundle** (`AndroidManifest.xml` with `FOREGROUND_SERVICE_MICROPHONE` and `WAKE_LOCK` permissions) for local APK compilation.

---

## 1. Overview & Core Concept

- **What It Does**: Listens to ambient or conversational speech through a multi-stage noise filter, automatically identifies the spoken language (supporting 50+ languages), translates everything into the user's target language on-device, optionally speaks the translation live over connected headphones, and archives raw filtered speech in compact Opus `.ogg` files.
- **Target Audience / Persona**: Android phone users who need hands-free, transparent, battery-conscious translation in noisy real-world environments (travel, multilingual workplaces, lectures, field conversations) without burning cellular data or relying on cloud API keys.
- **Key Value**: Complete privacy and offline autonomy—combining real-time DSP noise suppression, transparent background/screen-off operation, headphone voiceover, and deferred `.ogg` audio queuing in one ergonomic mobile interface.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Live Listening & Language Auto-Detection Flow**:
   - User taps the primary **Start Listening** button in the thumb zone.
   - Real-time Web Audio DSP filters out hum, wind, and rumble; a live spectrum and voice-gate meter confirms when human speech is isolated.
   - Spoken phrases appear in a live bilingual transcript stream with an unboxed detected-language tag (e.g., `Spanish (Auto-detected 96%) · 13:04:12 → English`), accompanied by an attached Opus `.ogg` audio clip.
2. **Headphone Live Interpreter Flow**:
   - The app automatically detects audio output routing (`navigator.mediaDevices.enumerateDevices`) and highlights the **Live Headphone Feed** toggle.
   - When enabled, every translated sentence is synthesized via on-device Text-to-Speech (`speechSynthesis`) directly into the headphones, while the **Mic Auto-Ducking** circuit temporarily suppresses microphone feedback.
3. **Screen-Off / OLED Pocket Lock & Transparent Background Flow**:
   - Tapping **Pocket / Screen-Off Mode** engages the Android Screen Wake Lock API, activates a persistent system notification via the `MediaSession` API (`"VoxGuard Active — Listening & Translating"` with Pause/Stop lock-screen controls so it is never hidden or covert), and blankets the viewport in a pure `#000000` OLED Curtain with a dim, battery-saving status readout and slide-to-wake gesture.
4. **Opus `.ogg` Vault & Deferred Batch Translation Flow**:
   - In **Queue Raw Audio** or **Hybrid** mode, every VAD-triggered speech segment is encoded as an `.ogg` (Opus) blob in IndexedDB.
   - Users can browse saved `.ogg` recordings, play back either the raw vs. noise-filtered audio, trigger on-device neural translation (`@huggingface/transformers` Whisper + Opus-MT WebAssembly models) on queued clips when on Wi-Fi/charging, or download `.ogg` and `.json`/`.srt` transcripts to their Android filesystem.
5. **Android APK & WebAPK Installation Flow**:
   - The **Android APK & Install Studio** drawer provides one-tap **Install to Android Home Screen (WebAPK)**, a **1-Click Cloud `.apk` Generator** guide/bridge, and a downloadable native Android configuration bundle.

### Visual Identity & Theme

- **Aesthetic Direction**: **Tactile Field-Recorder & Precision Acoustic Instrument** (inspired by Teenage Engineering field hardware and Sony Pro Audio telemetry—high-legibility, thumb-ergonomic, zero decorative clutter).
- **Color Palette & Mood** (Dual-Theme with OLED Dark Default for Android Battery Savings):
  - **60% Dominant Neutral Canvas**: Deep OLED Carbon `#090D16` (`bg-slate-950`) in Dark Mode / Crisp Alabaster `#F8FAFC` (`bg-slate-50`) in Daylight Mode; pure `#000000` in OLED Pocket Curtain mode.
  - **30% Structural Surfaces**: Slate instrument panels `#111827` (`bg-slate-900`) with `1px solid` hairline borders (`border-slate-800` / `border-slate-200`) and muted metadata text (`text-slate-400` / `text-slate-500`).
  - **10% Accent Budget**: Acoustic Emerald `#10B981` for active voice-gate lock and live translation; Signal Amber `#F59E0B` for queued `.ogg` vault items and mic-ducking hold states; Headphone Cyan `#06B6D4` for active headphone audio routing.
- **Typography & Hierarchy**:
  - *Display / Headers*: `Plus Jakarta Sans` (SemiBold/Bold, tight tracking, balanced headline wrapping).
  - *Body & Transcripts*: `DM Sans` (15px–16px, generous 1.6 line-height for effortless rapid scanning of bilingual transcripts).
  - *Acoustic Telemetry, Timestamps & Battery Metrics*: `JetBrains Mono` with `tabular-nums` for frequency cutoffs, dB noise floor, `.ogg` file sizes, and duration timers.
- **Component Styling & Mobile Ergonomics**:
  - Designed for one-handed smartphone ergonomics ($375\text{px}$–$430\text{px}$) with minimum $48 \times 48\text{px}$ touch targets in the bottom thumb zone, while expanding cleanly into a multi-column acoustic workstation (`max-w-7xl` 3-column grid) on desktop viewports.
  - Strict adherence to the **Top Bar Contract** (Brand wordmark · 4 concise single-line view links · 1 primary Install/APK action) and **15% Mobile Sticky Cap**.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual On-Device Speech & Translation Pipeline (Zero External API Keys)**
  - *Chosen Approach*: Combine **Tier 1 Ultra-Low-Power Native Engine** (Android On-Device Web Speech Recognition + local neural dictionary/phrase & browser Translation API) with **Tier 2 Offline WebAssembly Neural Engine** (`@huggingface/transformers` running quantized `Xenova/whisper-tiny` for automatic language identification + transcription and `Xenova/opus-mt` / NLLB for offline translation right in a Web Worker).
  - *Why*: Pure WASM neural models are 100% self-contained across any browser but consume more CPU/battery during continuous 24/7 listening. Offering Tier 1 for instant near-zero-battery live streaming and Tier 2 for offline batch processing of saved `.ogg` clips gives the user both all-day battery life and true offline model capability.
- **Decision 2: Real Web Audio API DSP Noise Filtering Chain**
  - *Chosen Approach*: Process microphone audio through an active Web Audio graph (`HighPass BiquadFilter @ 120Hz` to strip wind/handling rumble → `Notch Filter @ 50/60Hz` for electrical hum → `LowPass BiquadFilter @ 3800Hz` to isolate human vocal formants → `DynamicsCompressorNode` + RMS Voice Activity Detection gate) before feeding the `.ogg` `MediaRecorder`.
  - *Why*: Eliminates background noise *before* encoding to `.ogg`, reducing storage size by up to 70% and drastically improving language identification accuracy.
- **Decision 3: Opus `.ogg` Recording with Cross-Browser Container Fallback**
  - *Chosen Approach*: Configure `MediaRecorder` to prioritize `audio/ogg; codecs=opus`, with an automatic WebAssembly/OGG-page muxer fallback if a specific Android WebView build only exposes `audio/webm; codecs=opus`, ensuring every exported file is a valid `.ogg` Opus audio file.
  - *Why*: Guarantees the user always gets genuine `.ogg` Opus files as requested.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TOP BAR & NAVIGATION SHELL                           │
│   [VoxGuard]   ·  Live Translator  ·  Opus Vault  ·  DSP & Power  ·  [APK]  │
└───────────────────┬─────────────────────────────────────┬───────────────────┘
                    │                                     │
                    ▼                                     ▼
┌───────────────────────────────────────┐ ┌───────────────────────────────────┐
│     WEB AUDIO DSP & VAD PIPELINE      │ │   HEADPHONE INTERPRETER ENGINE    │
│                                       │ │                                   │
│  Mic Stream (NoiseSuppression: true)  │ │  Audio Output Device Detector     │
│                 │                     │ │                 │                 │
│                 ▼                     │ │                 ▼                 │
│  HighPass (120Hz) + LowPass (3800Hz)  │ │  On-Device TTS (speechSynthesis)  │
│                 │                     │ │                 │                 │
│                 ▼                     │ │                 ▼                 │
│  DynamicsCompressor + RMS VAD Gate    │◄┼─ Auto-Duck / Mute Mic While       │
│        │                    │         │ │  Speaking into Headphones         │
└────────┼────────────────────┼─────────┘ └───────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌────────────────────────────────────────────────────────┐
│ OPUS .OGG VAULT │  │         ON-DEVICE LANGUAGE ID & TRANSLATION            │
│  (IndexedDB)    │  │                                                        │
│                 │  │  • Tier 1: Low-Power Android Speech + Local Translator │
│ • .ogg Blobs    │─►│  • Tier 2: Web Worker WASM (@huggingface/transformers) │
│ • VAD Metadata  │  │            Whisper-Tiny (Lang ID + STT) + Opus-MT      │
│ • Export .ogg   │  │  • Auto-Language Detection + 50+ Language Matrix       │
└─────────────────┘  └───────────────────────────┬────────────────────────────┘
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              BATTERY, WAKE-LOCK & ANDROID PACKAGING CONTROLLERS             │
│                                                                             │
│  • 3 Power Modes: Smart VAD Gate | Continuous OLED Blackout | Interval Timer│
│  • Transparent Presence: Screen WakeLock API + MediaSession Lock-Screen UI  │
│  • APK Studio: WebAPK Prompt + PWABuilder APK Bridge + Capacitor Zip Export │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & On-Device State (IndexedDB `voxguard_db`)

- **`TranslationSegment`**:
  - `id`: UUID string
  - `timestamp`: Epoch ms (`tabular-nums` formatted)
  - `detectedLanguage`: `{ code: string, name: string, confidence: number }`
  - `targetLanguage`: `string`
  - `sourceText`: `string`
  - `translatedText`: `string`
  - `status`: `'translated' | 'queued_raw' | 'processing'`
  - `audioOggBlob`: `Blob` (`audio/ogg; codecs=opus`)
  - `durationSec`: `number`
  - `peakDb`: `number` (post-DSP signal level)
  - `spokenToHeadphones`: `boolean`
- **`PowerAndDspConfig`**:
  - `powerMode`: `'smart_vad' | 'continuous_oled' | 'scheduled_interval'`
  - `engineMode`: `'hybrid' | 'live_only' | 'queue_raw_ogg'`
  - `vadThresholdDb`: `number` (default `-42 dB`)
  - `highPassHz`: `number` (default `120 Hz`)
  - `lowPassHz`: `number` (default `3800 Hz`)
  - `headphoneLiveEnabled`: `boolean`
  - `headphoneDuckingMode`: `'mute_mic_while_speaking' | 'reduce_gain' | 'full_duplex'`

### Interactive Component & State Mapping

- **Live Translator Workspace**:
  - Primary **Start / Stop Listening** toggle initializes the `AudioContext`, connects the DSP filter chain, starts the selected power mode controller, and binds the `MediaSession` lock-screen notification.
  - **Language Selector Bar**: Auto-Detect source mode (with manual override across 30+ languages) → Target Language selector, plus instant swap and offline model cache manager.
  - **Headphone Live Feed Bar**: One-tap toggle button to route live TTS translations to headphones, with a secondary toggle for **Auto-Mute Mic While Speaking (Ducking)** and speech rate slider (`0.8x`–`1.4x`).
- **OLED Black-Screen Power Saver Overlay**:
  - Activated manually or automatically in Continuous OLED mode; renders a `#000000` full-screen surface displaying a dim monochrome status line (`Listening · Smart VAD Active · 00:14:22 · Tap & Hold to Unlock Screen`), keeping the Android WakeLock active while consuming near-zero screen battery.
- **Opus `.ogg` Audio Vault**:
  - Filterable list of all captured segments (`All`, `Queued Raw Only`, `Translated`), with inline `.ogg` waveform playback, single-click **"Translate Queued Clip On-Device"**, **"Batch Translate All Queued"**, and **"Download `.ogg` Audio"** actions.
- **Android APK & WebAPK Studio Modal**:
  - Provides instant **Install Android WebAPK** trigger, step-by-step **Download Standalone `.apk` via PWABuilder** launcher pre-filled with the app's URL, and a **Download Native Android Capacitor Config (`.json` / `AndroidManifest.xml`)** generator.
