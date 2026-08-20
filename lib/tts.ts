export type TTSState = 'idle' | 'speaking' | 'paused';

export const TTS_NORMALIZATION_MAP = {
  'Sallallaho alaihe wasallam': 'May Allah bless him and grant him peace',
  'Radhiyallaho anho': 'May Allah be pleased with him',
  'Radhiyallaho anha': 'May Allah be pleased with her',
  'Radhiyallaho anhum': 'May Allah be pleased with them',
  'Rahmatullah alaih': 'May Allah have mercy upon him',
  'Rahmatullah alaihim': 'May Allah have mercy upon them',
  'Alayhis salaam': 'Peace be upon him',
  'Alayhimus salaam': 'Peace be upon them',
  Aameen: 'Amen',
  'Inshaa-allaah': 'God willing',
  'Ma’athallaah': 'Allah forbid',
} as const;

export function normalizeTextForTts(text: string): string {
  return Object.entries(TTS_NORMALIZATION_MAP).reduce(
    (normalized, [visibleText, spokenText]) => normalized.replaceAll(visibleText, spokenText),
    text
  );
}

type ProgressListener = (sentenceIndex: number, totalSentences: number) => void;
type PageEndListener = () => void;

const MALE_VOICE_HINTS = ['male', 'daniel', 'david', 'mark', 'alex', 'fred', 'george', 'james', 'arthur', 'guy', 'ryan'];
const FEMALE_VOICE_HINTS = ['female', 'samantha', 'victoria', 'karen', 'zira', 'susan', 'hazel'];

export function scoreEnglishVoice(voice: Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'default'>): number {
  const name = voice.name.toLocaleLowerCase();
  const lang = voice.lang.toLocaleLowerCase();
  if (!lang.startsWith('en')) return -1000;
  let score = 10;
  if (lang.startsWith('en-gb')) score += 40;
  else if (lang.startsWith('en-us')) score += 25;
  if (MALE_VOICE_HINTS.some((hint) => name.includes(hint))) score += 100;
  if (FEMALE_VOICE_HINTS.some((hint) => name.includes(hint))) score -= 80;
  if (/natural|neural|premium|enhanced/.test(name)) score += 8;
  if (voice.default) score += 1;
  return score;
}

class TTSEngine {
  private utterance: SpeechSynthesisUtterance | null = null;
  private state: TTSState = 'idle';
  private stateListeners: Set<(state: TTSState) => void> = new Set();
  private progressListeners: Set<ProgressListener> = new Set();
  private currentRate: number = 0.5;
  private currentVoice: SpeechSynthesisVoice | null = null;
  private sentences: string[] = [];
  private currentIndex: number = 0;
  private pageEndListener: PageEndListener | null = null;
  private lifecycleToken = 0;
  private voiceWaitAttempts = 0;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.currentVoice = this.getEnglishVoice();
      };
    }
  }

  private getEnglishVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    return [...window.speechSynthesis.getVoices()]
      .filter((voice) => voice.lang.toLocaleLowerCase().startsWith('en'))
      .sort((first, second) => scoreEnglishVoice(second) - scoreEnglishVoice(first))[0] || null;
  }

  getState(): TTSState {
    return this.state;
  }

  getCurrentSentenceIndex(): number {
    return this.currentIndex;
  }

  getTotalSentences(): number {
    return this.sentences.length;
  }

  subscribe(listener: (state: TTSState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  subscribeProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  private setState(state: TTSState) {
    this.state = state;
    this.stateListeners.forEach((l) => l(state));
  }

  private notifyProgress() {
    this.progressListeners.forEach((l) => l(this.currentIndex, this.sentences.length));
  }

  getRate(): number {
    return this.currentRate;
  }

  setRate(rate: number) {
    this.currentRate = rate;
  }

  speak(text: string, pageEndListener?: PageEndListener, startIndex: number = 0) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('Speech synthesis not available');
      return;
    }

    this.lifecycleToken++;
    window.speechSynthesis.cancel();
    this.utterance = null;

    const normalizedText = normalizeTextForTts(text);
    const rawSentences = normalizedText.match(/[^.!?]+[.!?]*/g) || [normalizedText];
    this.sentences = rawSentences.map((s) => s.trim()).filter(Boolean);
    this.voiceWaitAttempts = 0;
    this.currentIndex = startIndex;
    this.pageEndListener = pageEndListener ?? null;

    this.setState('speaking');
    this.notifyProgress();
    this.queueCurrentSentence();
  }

  speakFromIndex(index: number) {
    if (this.state === 'idle' || index >= this.sentences.length) return;
    this.currentIndex = index;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.lifecycleToken++;
      window.speechSynthesis.cancel();
    }
    this.utterance = null;
    this.setState('speaking');
    this.notifyProgress();
    this.queueCurrentSentence();
  }

  private queueCurrentSentence() {
    const token = this.lifecycleToken;
    // Android WebView/Chrome completes cancel asynchronously. A fresh task
    // prevents the replacement utterance being swallowed by the old cancel.
    setTimeout(() => {
      if (token === this.lifecycleToken && this.state === 'speaking') this.speakCurrentSentence(token);
    }, 60);
  }

  private speakCurrentSentence(token: number = this.lifecycleToken) {
    if (token !== this.lifecycleToken) return;
    if (this.currentIndex >= this.sentences.length) {
      this.utterance = null;
      this.setState('idle');
      this.notifyProgress();
      this.pageEndListener?.();
      this.pageEndListener = null;
      return;
    }

    const sentence = this.sentences[this.currentIndex];
    const availableVoices = window.speechSynthesis.getVoices();
    if (availableVoices.length === 0 && this.voiceWaitAttempts < 10) {
      this.voiceWaitAttempts++;
      setTimeout(() => this.speakCurrentSentence(token), 100);
      return;
    }
    this.voiceWaitAttempts = 0;
    this.utterance = new SpeechSynthesisUtterance(sentence);
    this.utterance.rate = this.currentRate;
    this.utterance.pitch = 0.6;
    this.utterance.lang = 'en-US';

    const voice = this.currentVoice || this.getEnglishVoice();
    if (voice) {
      this.utterance.voice = voice;
    }

    // Notify immediately so the highlight updates as soon as we start speaking
    this.notifyProgress();

    this.utterance.onstart = () => {
      if (token !== this.lifecycleToken) return;
      this.notifyProgress();
    };

    this.utterance.onend = () => {
      if (token === this.lifecycleToken && this.state === 'speaking') {
        this.currentIndex++;
        this.queueCurrentSentence();
      }
    };

    this.utterance.onerror = (e) => {
      if (token !== this.lifecycleToken) return;
      console.warn('TTS error:', e.error);
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        this.setState('idle');
      }
    };

    window.speechSynthesis.speak(this.utterance);
  }

  pause() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (this.state !== 'speaking') return;

    // Native pause/resume is unreliable in Android Chrome/WebView. Cancel the
    // current utterance but retain its sentence index, then create a new one on Play.
    this.lifecycleToken++;
    window.speechSynthesis.cancel();
    this.utterance = null;
    this.setState('paused');
  }

  resume() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (this.state !== 'paused') return;

    this.lifecycleToken++;
    window.speechSynthesis.cancel();
    this.utterance = null;
    this.setState('speaking');
    this.notifyProgress();
    this.queueCurrentSentence();
  }

  stop() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.lifecycleToken++;
      window.speechSynthesis.cancel();
    }
    this.sentences = [];
    this.currentIndex = 0;
    this.utterance = null;
    this.pageEndListener = null;
    this.setState('idle');
    this.notifyProgress();
  }
}

export const tts = new TTSEngine();
