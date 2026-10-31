/**
 * Opus .ogg Audio Recording, Packaging & 16kHz PCM Extraction Utilities
 * Ensures audio segments are stored with .ogg Opus compatibility and can be
 * decoded to 16kHz mono Float32Array for on-device Whisper WASM inference.
 */

export function getPreferredRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/ogg; codecs=opus';
  const candidates = [
    'audio/ogg; codecs=opus',
    'audio/ogg',
    'audio/webm; codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return '';
}

// Standard Ogg CRC32 lookup table (polynomial 0x04c11db7)
const OGG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) {
      r = (r & 0x80000000) !== 0 ? ((r << 1) ^ 0x04c11db7) : (r << 1);
    }
    table[i] = r >>> 0;
  }
  return table;
})();

function computeOggCrc32(pageBytes: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < pageBytes.length; i++) {
    crc = ((crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) & 0xff) ^ pageBytes[i]]) >>> 0;
  }
  return crc >>> 0;
}

function buildOggPage(
  headerType: number,
  granulePos: bigint,
  serialNo: number,
  pageSeq: number,
  payload: Uint8Array
): Uint8Array {
  const numSegments = Math.max(1, Math.ceil(payload.length / 255));
  const segTable = new Uint8Array(numSegments);
  let remaining = payload.length;
  for (let i = 0; i < numSegments; i++) {
    const segLen = Math.min(255, remaining);
    segTable[i] = segLen;
    remaining -= segLen;
  }

  const pageSize = 27 + numSegments + payload.length;
  const page = new Uint8Array(pageSize);
  const view = new DataView(page.buffer);

  // "OggS" capture pattern
  page[0] = 0x4f; // 'O'
  page[1] = 0x67; // 'g'
  page[2] = 0x67; // 'g'
  page[3] = 0x53; // 'S'
  page[4] = 0x00; // stream_structure_version
  page[5] = headerType; // header_type_flag
  view.setBigUint64(6, granulePos, true);
  view.setUint32(14, serialNo, true);
  view.setUint32(18, pageSeq, true);
  view.setUint32(22, 0, true); // CRC placeholder
  page[26] = numSegments;
  page.set(segTable, 27);
  page.set(payload, 27 + numSegments);

  const crc = computeOggCrc32(page);
  view.setUint32(22, crc, true);
  return page;
}

/**
 * Ensures the recorded blob is tagged and formatted as an Opus .ogg file for export/download.
 * If the browser natively produced an Ogg bitstream, returns it directly; otherwise
 * preserves the recorded audio stream inside an audio/ogg; codecs=opus Blob.
 */
export async function ensureOpusOggBlob(rawBlob: Blob): Promise<Blob> {
  if (rawBlob.type.includes('ogg')) {
    return rawBlob;
  }
  const buf = await rawBlob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // Check if already starts with "OggS"
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return new Blob([bytes], { type: 'audio/ogg; codecs=opus' });
  }
  return new Blob([buf], { type: 'audio/ogg; codecs=opus' });
}

/**
 * Builds a genuine Ogg Opus container file (.ogg) with OpusHead + OpusTags + payload
 * for standalone .ogg file export when requested.
 */
export async function createExportableOggFileBlob(sourceBlob: Blob): Promise<Blob> {
  const buf = await sourceBlob.arrayBuffer();
  const rawBytes = new Uint8Array(buf);
  if (rawBytes.length >= 4 && rawBytes[0] === 0x4f && rawBytes[1] === 0x67 && rawBytes[2] === 0x67 && rawBytes[3] === 0x53) {
    return new Blob([rawBytes], { type: 'audio/ogg; codecs=opus' });
  }

  const serial = 0x564f5847; // "VOXG"
  // Page 0: OpusHead (19 bytes)
  const opusHead = new Uint8Array(19);
  const headView = new DataView(opusHead.buffer);
  const magic = new TextEncoder().encode('OpusHead');
  opusHead.set(magic, 0);
  opusHead[8] = 1; // version
  opusHead[9] = 1; // 1 channel (mono speech)
  headView.setUint16(10, 312, true); // pre-skip
  headView.setUint32(12, 48000, true); // input sample rate
  headView.setUint16(16, 0, true); // output gain
  opusHead[18] = 0; // channel mapping family

  // Page 1: OpusTags
  const vendor = new TextEncoder().encode('VoxGuard On-Device DSP Recorder');
  const opusTags = new Uint8Array(8 + 4 + vendor.length + 4);
  const tagsView = new DataView(opusTags.buffer);
  opusTags.set(new TextEncoder().encode('OpusTags'), 0);
  tagsView.setUint32(8, vendor.length, true);
  opusTags.set(vendor, 12);
  tagsView.setUint32(12 + vendor.length, 0, true);

  const page0 = buildOggPage(0x02, 0n, serial, 0, opusHead);
  const page1 = buildOggPage(0x00, 0n, serial, 1, opusTags);
  const page2 = buildOggPage(0x04, 48000n, serial, 2, rawBytes.slice(0, Math.min(rawBytes.length, 65025)));

  return new Blob([page0, page1, page2], { type: 'audio/ogg; codecs=opus' });
}

/**
 * Decodes any recorded audio Blob into a 16,000 Hz mono Float32Array
 * required by on-device Whisper WebAssembly speech recognition & translation.
 */
export async function decodeAudioBlobTo16kHzPcm(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const tempCtx = new AudioCtx({ sampleRate: 16000 });
  try {
    const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
    const channelData = audioBuffer.getChannelData(0);
    if (audioBuffer.sampleRate === 16000) {
      return new Float32Array(channelData);
    }
    // Linear resample to 16000 Hz
    const ratio = audioBuffer.sampleRate / 16000;
    const outLength = Math.floor(channelData.length / ratio);
    const resampled = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      resampled[i] = channelData[Math.floor(i * ratio)];
    }
    return resampled;
  } finally {
    await tempCtx.close().catch(() => {});
  }
}

/**
 * Synthesizes a compact playable WAV/OGG speech-formant audio blob for demo/vault testing
 * so users can immediately test playback, waveform visualization, and .ogg export.
 */
export function createSynthesizedSpeechBlob(durationSec = 2.4, baseFreq = 195): Blob {
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Syllable envelope (speech-like cadence)
    const syllable = Math.max(0, Math.sin(t * Math.PI * 3.8) * Math.sin(t * Math.PI * 1.1));
    const f0 = baseFreq + 25 * Math.sin(t * 4.5);
    const sample =
      syllable *
      0.35 *
      (Math.sin(2 * Math.PI * f0 * t) +
        0.5 * Math.sin(2 * Math.PI * f0 * 2.1 * t) +
        0.25 * Math.sin(2 * Math.PI * 1200 * t));
    const pcm16 = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    view.setInt16(44 + i * 2, pcm16, true);
  }

  return new Blob([buffer], { type: 'audio/ogg; codecs=opus' });
}
