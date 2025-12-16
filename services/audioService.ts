class AudioService {
  private synthesis: SpeechSynthesis;
  private lastSpeakTime: number = 0;
  private minInterval: number = 3000; // Minimum 3 seconds between alerts

  constructor() {
    this.synthesis = window.speechSynthesis;
  }

  speak(text: string, priority: boolean = false) {
    if (!this.synthesis) {
      console.warn("Speech synthesis not supported");
      return;
    }

    const now = Date.now();
    if (!priority && now - this.lastSpeakTime < this.minInterval) {
      return; // Debounce normal messages
    }

    // Cancel current if priority
    if (priority) {
      this.synthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.1; // Slightly faster
    utterance.pitch = 1.0;
    
    // Attempt to select a Chinese voice
    const voices = this.synthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN'));
    if (zhVoice) {
      utterance.voice = zhVoice;
    }

    this.synthesis.speak(utterance);
    this.lastSpeakTime = now;
  }
}

export const audioService = new AudioService();