import { TranslationSegment } from '../types/translator';
import { createSynthesizedSpeechBlob } from './oggOpusEncoder';

const DB_NAME = 'voxguard_opus_vault_v1';
const STORE_NAME = 'segments';
const DB_VERSION = 1;

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSegmentToVault(segment: TranslationSegment): Promise<void> {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(segment);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function deleteSegmentFromVault(id: string): Promise<void> {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function clearAllVaultSegments(): Promise<void> {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function loadAllSegmentsFromVault(): Promise<TranslationSegment[]> {
  const db = await openVaultDb();
  const items: TranslationSegment[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();

  if (items.length === 0 && !localStorage.getItem('voxguard_seeded_v1')) {
    const seeded = createInitialSampleSegments();
    for (const seg of seeded) {
      await saveSegmentToVault(seg);
    }
    localStorage.setItem('voxguard_seeded_v1', 'true');
    return seeded.sort((a, b) => b.timestamp - a.timestamp);
  }

  return items.sort((a, b) => b.timestamp - a.timestamp);
}

function createInitialSampleSegments(): TranslationSegment[] {
  const now = Date.now();
  return [
    {
      id: 'seg_seed_es_1',
      timestamp: now - 1000 * 60 * 14,
      detectedLanguage: {
        code: 'es',
        name: 'Spanish',
        nativeName: 'Español',
        confidence: 0.97,
      },
      sourceText: 'La puerta de embarque ha cambiado a la terminal norte.',
      englishTranslation: 'The boarding gate has changed to the north terminal.',
      status: 'translated',
      audioOggBlob: createSynthesizedSpeechBlob(2.8, 185),
      audioMimeType: 'audio/ogg; codecs=opus',
      durationSec: 2.8,
      peakDb: -18.4,
      noiseReducedDb: 14.2,
      spokenToHeadphones: true,
      engineUsed: 'on_device_fast',
    },
    {
      id: 'seg_seed_ja_2',
      timestamp: now - 1000 * 60 * 32,
      detectedLanguage: {
        code: 'ja',
        name: 'Japanese',
        nativeName: '日本語',
        confidence: 0.98,
      },
      sourceText: '次の電車は3番線から発車します',
      englishTranslation: 'The next train departs from Track 3.',
      status: 'translated',
      audioOggBlob: createSynthesizedSpeechBlob(2.3, 220),
      audioMimeType: 'audio/ogg; codecs=opus',
      durationSec: 2.3,
      peakDb: -21.0,
      noiseReducedDb: 16.5,
      spokenToHeadphones: false,
      engineUsed: 'whisper_wasm',
    },
    {
      id: 'seg_seed_de_3',
      timestamp: now - 1000 * 60 * 55,
      detectedLanguage: {
        code: 'de',
        name: 'German',
        nativeName: 'Deutsch',
        confidence: 0.95,
      },
      sourceText: 'Bitte prüfen Sie die Sicherheitsventile vor dem Schichtwechsel.',
      englishTranslation: '',
      status: 'queued_raw',
      audioOggBlob: createSynthesizedSpeechBlob(3.4, 160),
      audioMimeType: 'audio/ogg; codecs=opus',
      durationSec: 3.4,
      peakDb: -19.7,
      noiseReducedDb: 12.8,
      spokenToHeadphones: false,
      engineUsed: 'pending_queue',
    },
  ];
}
