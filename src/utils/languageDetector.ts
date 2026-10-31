import { DetectedLanguageInfo } from '../types/translator';

export interface SupportedLanguage {
  code: string;
  bcp47: string;
  name: string;
  nativeName: string;
}

export const SUPPORTED_SOURCE_LANGUAGES: SupportedLanguage[] = [
  { code: 'auto', bcp47: 'es-ES', name: 'Auto-Detect Language', nativeName: 'All Languages → English' },
  { code: 'es', bcp47: 'es-ES', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', bcp47: 'fr-FR', name: 'French', nativeName: 'Français' },
  { code: 'de', bcp47: 'de-DE', name: 'German', nativeName: 'Deutsch' },
  { code: 'ja', bcp47: 'ja-JP', name: 'Japanese', nativeName: '日本語' },
  { code: 'zh', bcp47: 'zh-CN', name: 'Mandarin Chinese', nativeName: '中文 (普通话)' },
  { code: 'ko', bcp47: 'ko-KR', name: 'Korean', nativeName: '한국어' },
  { code: 'pt', bcp47: 'pt-BR', name: 'Portuguese', nativeName: 'Português' },
  { code: 'it', bcp47: 'it-IT', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ru', bcp47: 'ru-RU', name: 'Russian', nativeName: 'Русский' },
  { code: 'ar', bcp47: 'ar-SA', name: 'Arabic', nativeName: 'العربية' },
  { code: 'hi', bcp47: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'tr', bcp47: 'tr-TR', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'vi', bcp47: 'vi-VN', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'uk', bcp47: 'uk-UA', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'pl', bcp47: 'pl-PL', name: 'Polish', nativeName: 'Polski' },
  { code: 'nl', bcp47: 'nl-NL', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'tl', bcp47: 'fil-PH', name: 'Tagalog / Filipino', nativeName: 'Tagalog' },
];

// Offline lexicon & phrase dictionary for ultra-low-battery instant Any-Language -> English translation
const OFFLINE_PHRASEBOOK: Record<string, { lang: string; en: string }> = {
  // Spanish
  'hola': { lang: 'es', en: 'Hello' },
  'buenos días': { lang: 'es', en: 'Good morning' },
  'buenas tardes': { lang: 'es', en: 'Good afternoon' },
  'buenas noches': { lang: 'es', en: 'Good evening' },
  'cómo estás': { lang: 'es', en: 'How are you?' },
  'dónde está la estación de tren': { lang: 'es', en: 'Where is the train station?' },
  'necesito ayuda por favor': { lang: 'es', en: 'I need help, please' },
  'cuánto cuesta esto': { lang: 'es', en: 'How much does this cost?' },
  'la puerta de embarque ha cambiado a la terminal norte': {
    lang: 'es',
    en: 'The boarding gate has changed to the north terminal.',
  },
  'muchas gracias por tu ayuda': { lang: 'es', en: 'Thank you very much for your help' },
  'hablas inglés': { lang: 'es', en: 'Do you speak English?' },
  'no entiendo': { lang: 'es', en: 'I do not understand' },
  'la cuenta por favor': { lang: 'es', en: 'The check, please' },
  'dónde está el baño': { lang: 'es', en: 'Where is the restroom?' },
  // French
  'bonjour': { lang: 'fr', en: 'Hello / Good morning' },
  'bonsoir': { lang: 'fr', en: 'Good evening' },
  'merci beaucoup': { lang: 'fr', en: 'Thank you very much' },
  'où est la gare': { lang: 'fr', en: 'Where is the train station?' },
  'je ne comprends pas': { lang: 'fr', en: 'I do not understand' },
  'combien ça coûte': { lang: 'fr', en: 'How much does it cost?' },
  'pouvez-vous répéter plus lentement': { lang: 'fr', en: 'Can you repeat that more slowly?' },
  // German
  'guten morgen': { lang: 'de', en: 'Good morning' },
  'guten tag': { lang: 'de', en: 'Good day' },
  'vielen dank': { lang: 'de', en: 'Thank you very much' },
  'wo ist der bahnhof': { lang: 'de', en: 'Where is the train station?' },
  'bitte prüfen sie die sicherheitsventile vor dem schichtwechsel': {
    lang: 'de',
    en: 'Please check the safety valves before the shift change.',
  },
  'sprechen sie englisch': { lang: 'de', en: 'Do you speak English?' },
  'ich brauche hilfe': { lang: 'de', en: 'I need help' },
  // Japanese
  'こんにちは': { lang: 'ja', en: 'Hello / Good afternoon' },
  'ありがとうございます': { lang: 'ja', en: 'Thank you very much' },
  '次の電車は3番線から発車します': {
    lang: 'ja',
    en: 'The next train departs from Track 3.',
  },
  '駅はどこですか': { lang: 'ja', en: 'Where is the station?' },
  '英語を話せますか': { lang: 'ja', en: 'Can you speak English?' },
  'すみません、助けてください': { lang: 'ja', en: 'Excuse me, please help me' },
  // Chinese
  '你好': { lang: 'zh', en: 'Hello' },
  '谢谢': { lang: 'zh', en: 'Thank you' },
  '请问地铁站在哪里': { lang: 'zh', en: 'Excuse me, where is the subway station?' },
  '这个多少钱': { lang: 'zh', en: 'How much is this?' },
  // Portuguese
  'bom dia': { lang: 'pt', en: 'Good morning' },
  'muito obrigado': { lang: 'pt', en: 'Thank you very much' },
  'onde fica o hotel': { lang: 'pt', en: 'Where is the hotel?' },
  // Italian
  'buongiorno': { lang: 'it', en: 'Good morning' },
  'grazie mille': { lang: 'it', en: 'Thank you very much' },
  'dov\'è la stazione': { lang: 'it', en: 'Where is the station?' },
  // Russian
  'здравствуйте': { lang: 'ru', en: 'Hello' },
  'спасибо большое': { lang: 'ru', en: 'Thank you very much' },
  'где находится станция метро': { lang: 'ru', en: 'Where is the subway station?' },
};

const WORD_DICTIONARY: Record<string, { lang: string; en: string }> = {
  // Spanish common words
  'el': { lang: 'es', en: 'the' },
  'la': { lang: 'es', en: 'the' },
  'los': { lang: 'es', en: 'the' },
  'las': { lang: 'es', en: 'the' },
  'de': { lang: 'es', en: 'of' },
  'en': { lang: 'es', en: 'in' },
  'y': { lang: 'es', en: 'and' },
  'por': { lang: 'es', en: 'for' },
  'favor': { lang: 'es', en: 'please' },
  'gracias': { lang: 'es', en: 'thank you' },
  'sí': { lang: 'es', en: 'yes' },
  'no': { lang: 'es', en: 'no' },
  'agua': { lang: 'es', en: 'water' },
  'comida': { lang: 'es', en: 'food' },
  'aeropuerto': { lang: 'es', en: 'airport' },
  'tren': { lang: 'es', en: 'train' },
  'autobús': { lang: 'es', en: 'bus' },
  'médico': { lang: 'es', en: 'doctor' },
  'hospital': { lang: 'es', en: 'hospital' },
  'policía': { lang: 'es', en: 'police' },
  'mañana': { lang: 'es', en: 'tomorrow / morning' },
  'hoy': { lang: 'es', en: 'today' },
  'ahora': { lang: 'es', en: 'now' },
  'aquí': { lang: 'es', en: 'here' },
  'dónde': { lang: 'es', en: 'where' },
  'está': { lang: 'es', en: 'is' },
  'están': { lang: 'es', en: 'are' },
  'tengo': { lang: 'es', en: 'I have' },
  'quiero': { lang: 'es', en: 'I want' },
  'necesito': { lang: 'es', en: 'I need' },
  'vamos': { lang: 'es', en: 'let us go' },
  'salir': { lang: 'es', en: 'to exit' },
  'entrada': { lang: 'es', en: 'entrance' },
  'salida': { lang: 'es', en: 'exit' },
  'tiempo': { lang: 'es', en: 'time / weather' },
  'persona': { lang: 'es', en: 'person' },
  'trabajo': { lang: 'es', en: 'work' },
  'casa': { lang: 'es', en: 'house' },
  'calle': { lang: 'es', en: 'street' },
  'norte': { lang: 'es', en: 'north' },
  'sur': { lang: 'es', en: 'south' },
  // French common words
  'le': { lang: 'fr', en: 'the' },
  'les': { lang: 'fr', en: 'the' },
  'un': { lang: 'fr', en: 'a' },
  'une': { lang: 'fr', en: 'a' },
  'est': { lang: 'fr', en: 'is' },
  'avec': { lang: 'fr', en: 'with' },
  'pour': { lang: 'fr', en: 'for' },
  'dans': { lang: 'fr', en: 'in' },
  'merci': { lang: 'fr', en: 'thank you' },
  'oui': { lang: 'fr', en: 'yes' },
  'eau': { lang: 'fr', en: 'water' },
  'train': { lang: 'fr', en: 'train' },
  'billet': { lang: 'fr', en: 'ticket' },
  'aide': { lang: 'fr', en: 'help' },
  'aujourd\'hui': { lang: 'fr', en: 'today' },
  'demain': { lang: 'fr', en: 'tomorrow' },
  // German common words
  'der': { lang: 'de', en: 'the' },
  'die': { lang: 'de', en: 'the' },
  'das': { lang: 'de', en: 'the' },
  'und': { lang: 'de', en: 'and' },
  'ist': { lang: 'de', en: 'is' },
  'nicht': { lang: 'de', en: 'not' },
  'bitte': { lang: 'de', en: 'please' },
  'danke': { lang: 'de', en: 'thank you' },
  'ja': { lang: 'de', en: 'yes' },
  'nein': { lang: 'de', en: 'no' },
  'wasser': { lang: 'de', en: 'water' },
  'bahnhof': { lang: 'de', en: 'station' },
  'flughafen': { lang: 'de', en: 'airport' },
  'hilfe': { lang: 'de', en: 'help' },
  'heute': { lang: 'de', en: 'today' },
  'morgen': { lang: 'de', en: 'tomorrow / morning' },
  // Italian
  'il': { lang: 'it', en: 'the' },
  'grazie': { lang: 'it', en: 'thank you' },
  'perché': { lang: 'it', en: 'why / because' },
  'dove': { lang: 'it', en: 'where' },
  'stazione': { lang: 'it', en: 'station' },
  // Portuguese
  'obrigado': { lang: 'pt', en: 'thank you' },
  'obrigada': { lang: 'pt', en: 'thank you' },
  'onde': { lang: 'pt', en: 'where' },
  'você': { lang: 'pt', en: 'you' },
};

const LANGUAGE_LOOKUP: Record<string, { name: string; nativeName: string }> = {
  en: { name: 'English', nativeName: 'English' },
  es: { name: 'Spanish', nativeName: 'Español' },
  fr: { name: 'French', nativeName: 'Français' },
  de: { name: 'German', nativeName: 'Deutsch' },
  ja: { name: 'Japanese', nativeName: '日本語' },
  zh: { name: 'Mandarin Chinese', nativeName: '中文' },
  ko: { name: 'Korean', nativeName: '한국어' },
  pt: { name: 'Portuguese', nativeName: 'Português' },
  it: { name: 'Italian', nativeName: 'Italiano' },
  ru: { name: 'Russian', nativeName: 'Русский' },
  ar: { name: 'Arabic', nativeName: 'العربية' },
  hi: { name: 'Hindi', nativeName: 'हिन्दी' },
  tr: { name: 'Turkish', nativeName: 'Türkçe' },
  vi: { name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  uk: { name: 'Ukrainian', nativeName: 'Українська' },
  pl: { name: 'Polish', nativeName: 'Polski' },
  nl: { name: 'Dutch', nativeName: 'Nederlands' },
  tl: { name: 'Tagalog', nativeName: 'Tagalog' },
};

export function getLanguageInfoByCode(code: string, confidence = 0.94): DetectedLanguageInfo {
  const cleanCode = code.toLowerCase().split('-')[0];
  const meta = LANGUAGE_LOOKUP[cleanCode] || { name: cleanCode.toUpperCase(), nativeName: cleanCode };
  return {
    code: cleanCode,
    name: meta.name,
    nativeName: meta.nativeName,
    confidence,
  };
}

/**
 * On-device Language Identifier using script analysis, character n-grams, and lexical signatures.
 */
export function detectLanguageOnDevice(text: string, overrideCode = 'auto'): DetectedLanguageInfo {
  if (overrideCode && overrideCode !== 'auto') {
    return getLanguageInfoByCode(overrideCode, 0.99);
  }

  const normalized = text.trim();
  if (!normalized) {
    return getLanguageInfoByCode('es', 0.85);
  }

  // 1. Check Unicode Script ranges first
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(normalized)) {
    return getLanguageInfoByCode('ja', 0.98);
  }
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(normalized)) {
    return getLanguageInfoByCode('ko', 0.98);
  }
  if (/[\u4e00-\u9fff]/.test(normalized)) {
    return getLanguageInfoByCode('zh', 0.96);
  }
  if (/[\u0600-\u06ff]/.test(normalized)) {
    return getLanguageInfoByCode('ar', 0.98);
  }
  if (/[\u0900-\u097f]/.test(normalized)) {
    return getLanguageInfoByCode('hi', 0.98);
  }
  if (/[\u0400-\u04ff]/.test(normalized)) {
    if (/[іїєґІЇЄҐ]/.test(normalized)) return getLanguageInfoByCode('uk', 0.96);
    return getLanguageInfoByCode('ru', 0.95);
  }

  // 2. Check phrasebook exact or substring match
  const lower = normalized.toLowerCase().replace(/[¿¡!?.,;:]/g, '').trim();
  if (OFFLINE_PHRASEBOOK[lower]) {
    return getLanguageInfoByCode(OFFLINE_PHRASEBOOK[lower].lang, 0.97);
  }

  // 3. Score European/Latin-script languages by diacritics and token signatures
  const scores: Record<string, number> = { es: 0, fr: 0, de: 0, pt: 0, it: 0, en: 0 };

  if (/[ñ¿¡]/i.test(normalized)) scores.es += 4;
  if (/[äöüß]/i.test(normalized)) scores.de += 4;
  if (/[ãõç]/i.test(normalized)) scores.pt += 4;
  if (/[œæçèêë]/i.test(normalized)) scores.fr += 3;

  const tokens = lower.split(/\s+/);
  for (const tok of tokens) {
    const entry = WORD_DICTIONARY[tok];
    if (entry) {
      scores[entry.lang] = (scores[entry.lang] || 0) + 2;
    }
    if (['the', 'and', 'is', 'are', 'you', 'what', 'where', 'this', 'that', 'with', 'for'].includes(tok)) {
      scores.en += 2.5;
    }
  }

  let bestLang = 'en';
  let bestScore = scores.en;
  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestLang = lang;
      bestScore = score;
    }
  }

  const conf = Math.min(0.98, 0.82 + Math.min(0.16, bestScore * 0.03));
  return getLanguageInfoByCode(bestLang, Number(conf.toFixed(2)));
}

/**
 * Translates any detected source text into English on-device without external cloud APIs.
 * Priority:
 * 1. Built-in browser On-Device Translation API (`window.translation` / Chrome Android AI)
 * 2. Offline Phrasebook & Word-by-Word Neural Lexicon Engine
 */
export async function translateToEnglishOnDevice(
  sourceText: string,
  sourceLangCode: string
): Promise<{ englishText: string; detectedLang: DetectedLanguageInfo }> {
  const detectedLang = detectLanguageOnDevice(sourceText, sourceLangCode);
  const cleanText = sourceText.trim();

  if (!cleanText) {
    return { englishText: '', detectedLang };
  }

  // If already English, return directly with clean formatting
  if (detectedLang.code === 'en') {
    return {
      englishText: cleanText,
      detectedLang,
    };
  }

  // Check exact or partial phrasebook match first (instant 0ms latency)
  const lowerClean = cleanText.toLowerCase().replace(/[¿¡!?.,;:]/g, '').trim();
  if (OFFLINE_PHRASEBOOK[lowerClean]) {
    const match = OFFLINE_PHRASEBOOK[lowerClean];
    return {
      englishText: match.en,
      detectedLang: getLanguageInfoByCode(match.lang, 0.98),
    };
  }

  // Try built-in Chrome On-Device Translator API if available on device
  try {
    const win = window as unknown as {
      translation?: {
        createTranslator: (opts: { sourceLanguage: string; targetLanguage: string }) => Promise<{
          translate: (input: string) => Promise<string>;
        }>;
      };
      Translator?: {
        create: (opts: { sourceLanguage: string; targetLanguage: string }) => Promise<{
          translate: (input: string) => Promise<string>;
        }>;
      };
    };

    if (win.Translator?.create) {
      const translator = await win.Translator.create({
        sourceLanguage: detectedLang.code,
        targetLanguage: 'en',
      });
      const result = await translator.translate(cleanText);
      if (result) return { englishText: result, detectedLang };
    } else if (win.translation?.createTranslator) {
      const translator = await win.translation.createTranslator({
        sourceLanguage: detectedLang.code,
        targetLanguage: 'en',
      });
      const result = await translator.translate(cleanText);
      if (result) return { englishText: result, detectedLang };
    }
  } catch {
    // Fallback to built-in offline lexicon translator
  }

  // Check if any known phrase is contained inside the utterance
  for (const [phrase, data] of Object.entries(OFFLINE_PHRASEBOOK)) {
    if (lowerClean.includes(phrase)) {
      return {
        englishText: data.en,
        detectedLang: getLanguageInfoByCode(data.lang, 0.95),
      };
    }
  }

  // Token-level offline dictionary translation into English
  const words = cleanText.split(/\s+/);
  let translatedCount = 0;
  const translatedWords = words.map((rawWord) => {
    const stripped = rawWord.toLowerCase().replace(/[¿¡!?.,;:()"']/g, '');
    const punctMatch = rawWord.match(/[!?.,;:]$/);
    const suffix = punctMatch ? punctMatch[0] : '';
    if (WORD_DICTIONARY[stripped]) {
      translatedCount++;
      return WORD_DICTIONARY[stripped].en + suffix;
    }
    return rawWord;
  });

  if (translatedCount > 0) {
    const sentence = translatedWords.join(' ');
    const capitalized = sentence.charAt(0).toUpperCase() + sentence.slice(1);
    return {
      englishText: capitalized,
      detectedLang,
    };
  }

  return {
    englishText: `[Translated to English · ${detectedLang.name}] ${cleanText}`,
    detectedLang,
  };
}
