
class AudioService {
  private synthesis: SpeechSynthesis;
  private lastSpeakTime: number = 0;
  private minInterval: number = 3000; // Minimum 3 seconds between alerts
  private keepAliveContext: AudioContext | null = null;
  private keepAliveSource: AudioBufferSourceNode | null = null;

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

  /**
   * Starts a silent infinite audio loop.
   * This tricks the browser into thinking the user is consuming media,
   * preventing the tab from being throttled or frozen in the background.
   */
  enableBackgroundMode() {
    if (this.keepAliveContext) return; // Already active

    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        
        this.keepAliveContext = new AudioContext();
        
        // Create a silent buffer (1 second)
        const buffer = this.keepAliveContext.createBuffer(1, 44100, 44100);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < 44100; i++) channelData[i] = 0; // Silence

        // Create source and loop it
        this.keepAliveSource = this.keepAliveContext.createBufferSource();
        this.keepAliveSource.buffer = buffer;
        this.keepAliveSource.loop = true;
        
        // Connect to destination (it's silent anyway)
        this.keepAliveSource.connect(this.keepAliveContext.destination);
        this.keepAliveSource.start();
        
        console.log("🔊 Background Audio Keep-Alive Enabled (Silent)");
    } catch (e) {
        console.warn("Failed to enable background audio", e);
    }
  }
}

export const audioService = new AudioService();
