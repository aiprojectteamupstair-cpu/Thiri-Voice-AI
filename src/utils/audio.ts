/**
 * Web Audio and Speech Synthesis Manager for Thiri AI Voice Assistant
 */

class AudioManager {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private isPlaying = false;
  private micStream: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micSink: GainNode | null = null;
  private micInitPromise: Promise<AnalyserNode | null> | null = null;
  private micGeneration = 0;

  public init() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.8;
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  public getAudioContext(): AudioContext | null {
    return this.audioCtx;
  }

  public getMicStream(): MediaStream | null {
    return this.micStream;
  }

  /**
   * Connect microphone stream to an analyser to capture input sound levels
   */
  public async initMicAnalyser(): Promise<AnalyserNode | null> {
    if (this.micInitPromise) return this.micInitPromise;
    this.micInitPromise = this.createMicAnalyser();
    try {
      return await this.micInitPromise;
    } finally {
      this.micInitPromise = null;
    }
  }

  private async createMicAnalyser(): Promise<AnalyserNode | null> {
    try {
      this.init();
      if (!this.audioCtx) return null;

      if (!this.micStream) {
        const generation = this.micGeneration;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (generation !== this.micGeneration) {
          stream.getTracks().forEach((track) => track.stop());
          return null;
        }
        this.micStream = stream;
      }

      if (!this.micSource) {
        this.micSource = this.audioCtx.createMediaStreamSource(this.micStream);
        this.micAnalyser = this.audioCtx.createAnalyser();
        this.micAnalyser.fftSize = 512;
        this.micAnalyser.smoothingTimeConstant = 0.7;
        this.micSource.connect(this.micAnalyser);
        this.micSink = this.audioCtx.createGain();
        this.micSink.gain.value = 0;
        this.micAnalyser.connect(this.micSink);
        this.micSink.connect(this.audioCtx.destination);
      }

      return this.micAnalyser;
    } catch (err) {
      console.warn('Microphone stream access for visualizer:', err);
      return null;
    }
  }

  public stopMic() {
    this.micGeneration += 1;
    this.micSource?.disconnect();
    this.micAnalyser?.disconnect();
    this.micSink?.disconnect();
    this.micSink = null;
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
      this.micSource = null;
      this.micAnalyser = null;
    }
  }

  /**
   * Returns current average audio frequency level (0.0 to 1.0) for visualizer
   */
  public getFrequencyLevel(useMic = false): number {
    const targetAnalyser = useMic ? this.micAnalyser : this.analyser;
    if (!targetAnalyser) return 0;

    const dataArray = new Uint8Array(targetAnalyser.frequencyBinCount);
    targetAnalyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / (dataArray.length * 255);
    return Math.min(1, Math.max(0, avg * 1.5));
  }

  /**
   * Plays base64 audio returned by the configured TTS provider
   */
  public async playTTS(base64Audio: string, mimeType = 'audio/wav'): Promise<void> {
    this.stopPlayback();
    this.init();

    if (!this.audioCtx || !this.analyser) {
      throw new Error('AudioContext unavailable');
    }

    try {
      // Decode base64 into binary array
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await this.audioCtx.decodeAudioData(bytes.buffer.slice(0));

      return new Promise<void>((resolve) => {
        if (!this.audioCtx || !this.analyser) {
          resolve();
          return;
        }

        const source = this.audioCtx.createBufferSource();
        source.buffer = audioBuffer;

        source.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);

        this.currentSource = source;
        this.isPlaying = true;

        source.onended = () => {
          this.isPlaying = false;
          this.currentSource = null;
          resolve();
        };

        source.start(0);
      });
    } catch (error) {
      console.error(`Error decoding/playing TTS audio (${mimeType}):`, error);
      throw error;
    }
  }

  /**
   * Browser SpeechSynthesis fallback for resilience
   */
  public async playBrowserSpeech(text: string, language = 'my'): Promise<void> {
    this.stopPlayback();

    if (!('speechSynthesis' in window)) {
      return;
    }

    return new Promise((resolve) => {
      window.speechSynthesis.cancel();

      // Clean markdown characters
      const clean = text.replace(/[*_#`~[\]]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(clean);

      // Try selecting a voice matching Myanmar or English
      const voices = window.speechSynthesis.getVoices();
      if (language === 'my') {
        const myVoice = voices.find((v) => v.lang.startsWith('my') || v.name.toLowerCase().includes('burmese') || v.name.toLowerCase().includes('myanmar'));
        if (myVoice) utterance.voice = myVoice;
        utterance.lang = 'my-MM';
      } else {
        const femaleVoice = voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Victoria') || v.name.includes('Google US English')));
        if (femaleVoice) utterance.voice = femaleVoice;
        utterance.lang = 'en-US';
      }

      utterance.rate = 1.0;
      utterance.pitch = 1.05;

      utterance.onend = () => {
        this.isPlaying = false;
        resolve();
      };
      utterance.onerror = () => {
        this.isPlaying = false;
        resolve();
      };

      this.isPlaying = true;
      window.speechSynthesis.speak(utterance);
    });
  }

  public stopPlayback() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch (e) {
        // Already stopped
      }
      this.currentSource = null;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    this.isPlaying = false;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

export const audioManager = new AudioManager();
