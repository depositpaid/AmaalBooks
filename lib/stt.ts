// Web Speech Recognition helper for voice search
// Uses the Web Speech API (available in Chrome/Edge/Safari)

type SpeechRecognitionResult = {
  transcript: string;
  isFinal: boolean;
};

type SpeechRecognitionCallbacks = {
  onResult: (result: SpeechRecognitionResult) => void;
  onError: (error: string) => void;
  onEnd: () => void;
};

class SpeechRecognitionEngine {
  private recognition: any = null;
  private isListening: boolean = false;
  private callbacks: SpeechRecognitionCallbacks | null = null;

  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      'SpeechRecognition' in window ||
      'webkitSpeechRecognition' in window
    );
  }

  start(callbacks: SpeechRecognitionCallbacks) {
    if (!this.isSupported()) {
      callbacks.onError('Speech recognition is not supported in this browser');
      return;
    }

    if (this.isListening) {
      this.stop();
    }

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    this.recognition = new SpeechRecognitionClass();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    this.callbacks = callbacks;
    this.isListening = true;

    this.recognition.onresult = (event: any) => {
      let transcript = '';
      let isFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          isFinal = true;
        }
      }

      this.callbacks?.onResult({ transcript: transcript.trim(), isFinal });
    };

    this.recognition.onerror = (event: any) => {
      this.isListening = false;
      this.callbacks?.onError(event.error || 'Unknown error');
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.callbacks?.onEnd();
    };

    try {
      this.recognition.start();
    } catch (e) {
      this.isListening = false;
      callbacks.onError('Failed to start speech recognition');
    }
  }

  stop() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
    }
    this.isListening = false;
  }
}

export const speechRecognition = new SpeechRecognitionEngine();
