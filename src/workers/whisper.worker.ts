import { pipeline, env } from '@huggingface/transformers';

// Configure Transformers.js to use browser Cache API for offline persistence
env.allowLocalModels = false;
env.useBrowserCache = true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asrPipeline: any = null;

async function getWhisperPipeline(onProgress?: (info: { status: string; progress?: number; file?: string }) => void) {
  if (!asrPipeline) {
    asrPipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
      dtype: 'q8',
      progress_callback: (data: { status: string; progress?: number; file?: string }) => {
        if (onProgress) onProgress(data);
      },
    });
  }
  return asrPipeline;
}

self.addEventListener('message', async (event: MessageEvent) => {
  const { type, id, audioPcm, sourceLanguage } = event.data;

  if (type === 'PRELOAD_MODEL') {
    try {
      self.postMessage({ type: 'MODEL_STATUS', status: 'downloading', progress: 5 });
      await getWhisperPipeline((info) => {
        if (typeof info.progress === 'number') {
          self.postMessage({
            type: 'MODEL_STATUS',
            status: 'downloading',
            progress: Math.round(info.progress),
            file: info.file,
          });
        }
      });
      self.postMessage({ type: 'MODEL_STATUS', status: 'ready', progress: 100 });
    } catch (err) {
      self.postMessage({
        type: 'MODEL_STATUS',
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Failed to load Whisper WASM model',
      });
    }
    return;
  }

  if (type === 'TRANSLATE_AUDIO') {
    try {
      self.postMessage({ type: 'MODEL_STATUS', status: 'running', progress: 100 });
      const transcriber = await getWhisperPipeline((info) => {
        if (typeof info.progress === 'number') {
          self.postMessage({
            type: 'MODEL_STATUS',
            status: 'downloading',
            progress: Math.round(info.progress),
            file: info.file,
          });
        }
      });

      const langArg = sourceLanguage && sourceLanguage !== 'auto' ? sourceLanguage : undefined;

      // 1. Run Whisper in 'translate' task mode: translates ANY spoken language directly to English!
      const translateResult = await transcriber(audioPcm, {
        task: 'translate',
        language: langArg,
        chunk_length_s: 30,
        stride_length_s: 5,
      });

      // 2. Also run quick transcribe pass if needed to capture source language transcript
      let sourceTranscript = '';
      try {
        const transcribeResult = await transcriber(audioPcm, {
          task: 'transcribe',
          language: langArg,
          chunk_length_s: 30,
          stride_length_s: 5,
        });
        sourceTranscript = (transcribeResult?.text || '').trim();
      } catch {
        sourceTranscript = '';
      }

      const englishText = (translateResult?.text || '').trim();

      self.postMessage({
        type: 'TRANSLATE_RESULT',
        id,
        englishText: englishText || 'No clear speech detected in audio segment.',
        sourceText: sourceTranscript || englishText,
      });
      self.postMessage({ type: 'MODEL_STATUS', status: 'ready', progress: 100 });
    } catch (err) {
      self.postMessage({
        type: 'TRANSLATE_ERROR',
        id,
        errorMessage: err instanceof Error ? err.message : 'On-device Whisper inference failed',
      });
      self.postMessage({ type: 'MODEL_STATUS', status: 'error', errorMessage: 'Inference error' });
    }
  }
});
