/**
 * Records short microphone turns and transcribes them through the server.
 * This avoids browser speech services that may be unavailable or offline.
 */

export interface SpeechRecognitionCallbacks {
  onStart?: () => void;
  onSpeechStart?: () => void;
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

export async function recordedAudioToWav(blob: Blob): Promise<Blob> {
  if (!/webm|ogg/.test(blob.type)) return blob;

  const sampleRate = 16000;
  const decoder = new OfflineAudioContext(1, 1, sampleRate);
  const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * sampleRate)), sampleRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);
  const wav = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(wav);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([wav], { type: 'audio/wav' });
}

export class SpeechRecognitionService {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private ownsStream = false;
  private callbacks: SpeechRecognitionCallbacks = {};
  private currentLanguage: 'my' | 'en' = 'my';
  private chunks: BlobPart[] = [];
  private monitorContext: AudioContext | null = null;
  private monitorSource: MediaStreamAudioSourceNode | null = null;
  private monitorAnalyser: AnalyserNode | null = null;
  private borrowedAnalyser = false;
  private monitorTimer: number | null = null;
  private maxDurationTimer: number | null = null;
  private isListening = false;
  private heardSpeech = false;
  private speechCandidateAt = 0;
  private speechStartedAt = 0;
  private lastVoiceAt = 0;
  private sessionId = 0;

  public isSupported(): boolean {
    return typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof MediaRecorder !== 'undefined';
  }

  public setLanguage(lang: 'my' | 'en') {
    this.currentLanguage = lang;
  }

  public async start(
    callbacks: SpeechRecognitionCallbacks,
    lang: 'my' | 'en' = 'my',
    existingStream?: MediaStream | null,
    existingAnalyser?: AnalyserNode | null,
  ) {
    this.abort();
    const sessionId = ++this.sessionId;
    this.callbacks = callbacks;
    this.currentLanguage = lang;

    if (!this.isSupported()) {
      callbacks.onError?.('Voice recording is not supported in this browser.');
      callbacks.onEnd?.();
      return;
    }

    try {
      if (existingStream) {
        this.stream = existingStream;
        this.ownsStream = false;
      } else {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        this.ownsStream = true;
      }

      if (sessionId !== this.sessionId || !this.stream) return;

      const preferredMimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
        .find((type) => MediaRecorder.isTypeSupported(type));
      this.recorder = preferredMimeType
        ? new MediaRecorder(this.stream, { mimeType: preferredMimeType })
        : new MediaRecorder(this.stream);
      this.chunks = [];
      this.heardSpeech = false;
      this.speechCandidateAt = 0;
      this.speechStartedAt = 0;
      this.lastVoiceAt = 0;

      this.recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      this.recorder.onerror = () => {
        this.callbacks.onError?.('Microphone recording failed. Check microphone access and try again.');
      };
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || 'audio/webm' });
        void this.transcribe(blob, sessionId);
      };

      this.recorder.start(250);
      this.isListening = true;
      this.callbacks.onStart?.();
      this.maxDurationTimer = window.setTimeout(() => this.stop(), callbacks.onSpeechStart ? 60000 : 20000);
      await this.monitorSpeech(sessionId, existingAnalyser);
    } catch (error: any) {
      if (sessionId !== this.sessionId) return;
      this.isListening = false;
      this.callbacks.onError?.(
        error?.name === 'NotAllowedError'
          ? 'not-allowed'
          : error?.message || 'Could not start microphone recording.',
      );
      this.callbacks.onEnd?.();
      this.releaseResources();
    }
  }

  private async monitorSpeech(sessionId: number, existingAnalyser?: AnalyserNode | null) {
    if (!this.stream) return;

    if (existingAnalyser) {
      this.monitorAnalyser = existingAnalyser;
      this.borrowedAnalyser = true;
    } else {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.monitorContext = new AudioContextClass();
      if (this.monitorContext.state === 'suspended') await this.monitorContext.resume();
      if (sessionId !== this.sessionId || !this.stream || !this.monitorContext) return;
      this.monitorSource = this.monitorContext.createMediaStreamSource(this.stream);
      this.monitorAnalyser = this.monitorContext.createAnalyser();
      this.monitorAnalyser.fftSize = 512;
      this.monitorSource.connect(this.monitorAnalyser);
    }
    if (!this.monitorAnalyser) return;
    const samples = new Float32Array(this.monitorAnalyser.fftSize);

    this.monitorTimer = window.setInterval(() => {
      if (!this.monitorAnalyser || !this.isListening) return;

      this.monitorAnalyser.getFloatTimeDomainData(samples);
      let squareSum = 0;
      for (const sample of samples) squareSum += sample * sample;
      const rms = Math.sqrt(squareSum / samples.length);
      const now = Date.now();

      const threshold = this.callbacks.onSpeechStart ? 0.025 : 0.008;
      if (rms > threshold) {
        if (!this.speechCandidateAt) this.speechCandidateAt = now;
        if (!this.heardSpeech && now - this.speechCandidateAt >= 240) {
          this.heardSpeech = true;
          this.speechStartedAt = now;
          this.callbacks.onSpeechStart?.();
        }
        this.lastVoiceAt = now;
      } else {
        this.speechCandidateAt = 0;
        if (this.heardSpeech && now - this.lastVoiceAt > 1100 && now - this.speechStartedAt > 600) {
          this.stop();
        }
      }
    }, 120);

  }

  private async transcribe(blob: Blob, sessionId: number) {
    this.isListening = false;
    this.releaseMonitor();

    try {
      if (sessionId !== this.sessionId) return;
      if (blob.size < 500) {
        this.callbacks.onError?.('no-speech');
        return;
      }

      let upload = blob;
      try {
        upload = await recordedAudioToWav(blob);
      } catch (error) {
        console.warn('Could not convert microphone recording to WAV:', error);
      }
      if (sessionId !== this.sessionId) return;
      const response = await fetch(`/api/thiri/transcribe?language=${this.currentLanguage}`, {
        method: 'POST',
        headers: { 'Content-Type': upload.type || 'audio/webm' },
        body: upload,
        signal: AbortSignal.timeout(65000),
      });
      const data = await response.json();
      if (sessionId !== this.sessionId) return;

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Voice transcription failed.');
      }

      const transcript = typeof data.text === 'string' ? data.text.trim() : '';
      if (transcript) {
        this.callbacks.onTranscript?.(transcript, true);
      } else {
        this.callbacks.onError?.('no-speech');
      }
    } catch (error: any) {
      if (sessionId !== this.sessionId) return;
      this.callbacks.onError?.(`transcription: ${error.message || 'Voice transcription failed.'}`);
    } finally {
      if (sessionId === this.sessionId) {
        this.callbacks.onEnd?.();
        this.releaseResources();
        this.recorder = null;
      }
    }
  }

  public stop() {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop();
      } catch {
        // The recorder may have stopped between the state check and stop call.
      }
    }
    this.isListening = false;
  }

  public abort() {
    this.sessionId += 1;
    this.isListening = false;
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      this.recorder.onerror = null;
      this.recorder.onstop = null;
      if (this.recorder.state !== 'inactive') {
        try {
          this.recorder.stop();
        } catch {
          // Already stopped.
        }
      }
    }
    this.recorder = null;
    this.chunks = [];
    this.callbacks = {};
    this.releaseResources();
  }

  private releaseMonitor() {
    if (this.monitorTimer !== null) window.clearInterval(this.monitorTimer);
    if (this.maxDurationTimer !== null) window.clearTimeout(this.maxDurationTimer);
    this.monitorTimer = null;
    this.maxDurationTimer = null;
    this.monitorSource?.disconnect();
    if (!this.borrowedAnalyser) this.monitorAnalyser?.disconnect();
    this.monitorSource = null;
    this.monitorAnalyser = null;
    this.borrowedAnalyser = false;
    if (this.monitorContext && this.monitorContext.state !== 'closed') {
      void this.monitorContext.close();
    }
    this.monitorContext = null;
  }

  private releaseResources() {
    this.releaseMonitor();
    if (this.ownsStream) this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.ownsStream = false;
  }

  public getListening(): boolean {
    return this.isListening;
  }
}

export const speechService = new SpeechRecognitionService();
