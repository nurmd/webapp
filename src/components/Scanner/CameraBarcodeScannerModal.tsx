import React, { useEffect, useRef, useState } from 'react';
import { audioService } from '../../services/barcodeService.ts';

interface CameraBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export const CameraBarcodeScannerModal: React.FC<CameraBarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const isScanningRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera device access is not supported by your browser/device.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Check for torch capability
      const track = stream.getVideoTracks()[0];
      const capabilities = (track as any).getCapabilities?.();
      if (capabilities && 'torch' in capabilities) {
        setHasTorch(true);
      }

      startDetectionLoop();
    } catch (err: any) {
      console.warn('Camera access denied or unavailable:', err);
      setCameraError(err.message || 'Could not start camera. You can still type barcode manually below.');
    }
  };

  const stopCamera = () => {
    isScanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    try {
      await (track as any).applyConstraints({
        advanced: [{ torch: !torchOn }],
      });
      setTorchOn(!torchOn);
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  };

  const startDetectionLoop = async () => {
    isScanningRef.current = true;

    // Check if BarcodeDetector is available natively in Chromium/Android
    const BarcodeDetectorClass = (window as any).BarcodeDetector;
    let detector: any = null;

    if (BarcodeDetectorClass) {
      try {
        const supported = await BarcodeDetectorClass.getSupportedFormats();
        detector = new BarcodeDetectorClass({
          formats: supported.length ? supported : ['ean_13', 'code_128', 'qr_code', 'upc_a'],
        });
      } catch (e) {
        console.warn('BarcodeDetector format init error:', e);
      }
    }

    const checkFrame = async () => {
      if (!isScanningRef.current) return;

      if (detector && videoRef.current && videoRef.current.readyState >= 2) {
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            if (code && code.trim()) {
              audioService.playScanSuccess();
              onScan(code.trim());
              onClose();
              return;
            }
          }
        } catch (e) {
          // Frame detect skip
        }
      }

      if (isScanningRef.current) {
        requestAnimationFrame(checkFrame);
      }
    };

    requestAnimationFrame(checkFrame);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    audioService.playScanSuccess();
    onScan(manualCode.trim());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-surface-container-lowest rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-outline-variant/30 flex flex-col">
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-outline-variant/20 bg-surface-container-low">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[22px]">
              barcode_scanner
            </span>
            <h3 className="font-headline-sm text-sm font-bold text-on-surface">
              Scan Barcode / QR Code
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Viewport Area */}
        <div className="relative bg-black h-72 flex items-center justify-center overflow-hidden">
          {cameraError ? (
            <div className="p-6 text-center text-white/80 space-y-2">
              <span className="material-symbols-outlined text-amber-400 text-[40px]">
                videocam_off
              </span>
              <p className="text-xs font-semibold">{cameraError}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Aiming Reticle Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-56 h-36 border-2 border-secondary/80 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                  {/* Laser Scan Line */}
                  <div className="absolute left-2 right-2 h-0.5 bg-red-500 shadow-[0_0_8px_#ef4444] animate-bounce top-1/2 -translate-y-1/2" />
                  {/* Corner accents */}
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-secondary" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-secondary" />
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-secondary" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-secondary" />
                </div>
              </div>

              {/* Torch Button */}
              {hasTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-md cursor-pointer ${
                    torchOn ? 'bg-amber-400 text-black' : 'bg-black/60 text-white hover:bg-black/80'
                  }`}
                  title="Toggle Flashlight"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {torchOn ? 'flashlight_on' : 'flashlight_off'}
                  </span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Manual Barcode Fallback */}
        <form onSubmit={handleManualSubmit} className="p-4 bg-surface flex flex-col gap-2">
          <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
            Enter Barcode / SKU Manually
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. 8901234567890 or SKU-101"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="flex-1 bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface font-mono outline-none focus:border-secondary"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-secondary text-on-secondary rounded-xl font-bold text-xs shadow-sm hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer"
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
