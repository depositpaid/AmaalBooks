export type TTSState = 'idle' | 'speaking' | 'paused';

type ProgressListener = (sentenceIndex: number, totalSentences: number) => void;
type PageEndListener = () => void;

class TTSEngine {
  private utterance: SpeechSynthesisUtterance | null = null;
  private state: TTSState = 'idle';
  private stateListeners: Set<(state: TTSState) => void> = new Set();
  private progressListeners: Set<ProgressListener> = new Set();
  private currentRate: number = 1.0;
  private currentVoice: SpeechSynthesisVoice | null = null;
  private sentences: string[] = [];
  private currentIndex: number = 0;
  private pageEndListener: PageEndListener | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.currentVoice = this.getEnglishVoice();
      };
    }
  }

  private getEnglishVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    const maleKeywords = ['male', 'daniel', 'david', 'mark', 'alex', 'fred', 'george', 'james', 'arthur'];
    return (
      voices.find((v) => v.lang.startsWith('en') && maleKeywords.some((kw) => v.name.toLowerCase().includes(kw))) ||
      voices.find((v) => v.lang.startsWith('en-GB') && v.name.toLowerCase().includes('male')) ||
      voices.find((v) => v.lang.startsWith('en-US') && v.name.toLowerCase().includes('male')) ||
      voices.find((v) => v.lang.startsWith('en-GB')) ||
      voices.find((v) => v.lang.startsWith('en-US')) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      null
    );
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

    this.stop();

    const rawSentences = text.match(/[^.!?]+[.!?]*/g) || [text];
    this.sentences = rawSentences.map((s) => s.trim()).filter(Boolean);
    this.currentIndex = startIndex;
    this.pageEndListener = pageEndListener ?? null;

    this.setState('speaking');
    this.notifyProgress();
    this.speakCurrentSentence();
  }

  speakFromIndex(index: number) {
    if (this.state === 'idle' || index >= this.sentences.length) return;
    this.currentIndex = index;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.utterance = null;
    this.setState('speaking');
    this.notifyProgress();
    this.speakCurrentSentence();
  }

  private speakCurrentSentence() {
    if (this.currentIndex >= this.sentences.length) {
      this.utterance = null;
      this.setState('idle');
      this.notifyProgress();
      this.pageEndListener?.();
      this.pageEndListener = null;
      return;
    }

    const sentence = this.sentences[this.currentIndex];
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
      this.notifyProgress();
    };

    this.utterance.onend = () => {
      if (this.state === 'speaking') {
        this.currentIndex++;
        this.speakCurrentSentence();
      }
    };

    this.utterance.onerror = (e) => {
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

    // Use the native pause API so we can resume without losing position
    if (window.speechSynthesis.paused) {
      // already paused somehow
    }
    this.utterance = null;
    window.speechSynthesis.pause();
    this.setState('paused');
  }

  resume() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (this.state !== 'paused') return;

    // If the browser still has the utterance paused, resume it
    if (window.speechSynthesis.paused) {
      this.setState('speaking');
      window.speechSynthesis.resume();
    } else {
      // Fallback: re-speak the current sentence (some browsers cancel on pause)
      this.setState('speaking');
      this.speakCurrentSentence();
    }
  }

  stop() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
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
