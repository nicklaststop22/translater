import { WhisperModelState } from '../types/translator';
import { decodeAudioBlobTo16kHzPcm } from './oggOpusEncoder';

type StatusListener = (state: WhisperModelState) => void;

class WhisperOnDeviceClient {
  private worker: Worker | null = null;
  private statusListeners = new Set<StatusListener>();
  private pendingRequests = new Map<
    string,
    {
      resolve: (res: { englishText: string; sourceText: string }) => void;
      reject: (err: Error) => void;
    }
  >();
  private currentState: WhisperModelState = {
    status: 'idle',
    progress: 0,
  };

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), {
        type: 'module',
      });

      this.worker.addEventListener('message', (event: MessageEvent) => {
        const data = event.data;
        if (data.type === 'MODEL_STATUS') {
          this.currentState = {
            status: data.status,
            progress: data.progress ?? this.currentState.progress,
            loadedFile: data.file,
            errorMessage: data.errorMessage,
          };
          this.statusListeners.forEach((cb) => cb(this.currentState));
        } else if (data.type === 'TRANSLATE_RESULT') {
          const req = this.pendingRequests.get(data.id);
          if (req) {
            this.pendingRequests.delete(data.id);
            req.resolve({
              englishText: data.englishText,
              sourceText: data.sourceText,
            });
          }
        } else if (data.type === 'TRANSLATE_ERROR') {
          const req = this.pendingRequests.get(data.id);
          if (req) {
            this.pendingRequests.delete(data.id);
            req.reject(new Error(data.errorMessage || 'Whisper translation error'));
          }
        }
      });
    }
    return this.worker;
  }

  public subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.currentState);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public preloadModel(): void {
    const worker = this.ensureWorker();
    worker.postMessage({ type: 'PRELOAD_MODEL' });
  }

  public async translateAudioBlobToEnglish(
    audioBlob: Blob,
    sourceLanguage = 'auto'
  ): Promise<{ englishText: string; sourceText: string }> {
    const pcm16k = await decodeAudioBlobTo16kHzPcm(audioBlob);
    const worker = this.ensureWorker();
    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      worker.postMessage(
        {
          type: 'TRANSLATE_AUDIO',
          id,
          audioPcm: pcm16k,
          sourceLanguage,
        },
        [pcm16k.buffer]
      );
    });
  }
}

export const whisperClient = new WhisperOnDeviceClient();
