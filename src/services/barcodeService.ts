/**
 * Barcode & Audio Feedback Service
 * Handles Web Audio API synth beeps, hardware scanner wedge listeners, and camera barcode detector.
 */

// Web Audio API Beep Generator (100% offline, zero assets required)
class AudioService {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public playScanSuccess(): void {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      console.warn('Audio feedback failed:', e);
    }
  }

  public playScanError(): void {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      console.warn('Audio feedback failed:', e);
    }
  }
}

export const audioService = new AudioService();

/**
 * Hook or class to listen for Hardware USB / Bluetooth Barcode Guns (Keyboard Wedge)
 */
export type BarcodeScanCallback = (barcode: string) => void;

class HardwareBarcodeWedge {
  private buffer: string = '';
  private lastKeyTime: number = 0;
  private readonly thresholdMs: number = 55; // Barcode scanners input characters under 40-50ms apart
  private listeners: Set<BarcodeScanCallback> = new Set();
  private boundHandler: (e: KeyboardEvent) => void;

  constructor() {
    this.boundHandler = this.handleKeyDown.bind(this);
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.boundHandler, true);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Ignore keystrokes if focused inside an active input or textarea
    const activeEl = document.activeElement;
    const isEditingText =
      activeEl &&
      (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') &&
      (activeEl as HTMLInputElement).type !== 'button' &&
      (activeEl as HTMLInputElement).type !== 'checkbox';

    const now = Date.now();
    const timeDiff = now - this.lastKeyTime;
    this.lastKeyTime = now;

    if (e.key === 'Enter') {
      if (this.buffer.length >= 3) {
        // High confidence barcode scanned
        const scanned = this.buffer.trim();
        this.buffer = '';
        audioService.playScanSuccess();
        this.notifyListeners(scanned);
      }
      this.buffer = '';
      return;
    }

    // Reset buffer if delay is longer than scanner threshold
    if (timeDiff > this.thresholdMs && this.buffer.length > 0) {
      this.buffer = '';
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // If user is actively typing in a normal text input and it's slow, do not capture
      if (isEditingText && timeDiff > this.thresholdMs) {
        return;
      }
      this.buffer += e.key;
    }
  }

  public subscribe(cb: BarcodeScanCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notifyListeners(code: string): void {
    this.listeners.forEach((cb) => cb(code));
  }
}

export const hardwareScanner = new HardwareBarcodeWedge();
