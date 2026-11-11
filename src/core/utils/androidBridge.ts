export interface AndroidBridge {
  shareImage(base64Png: string, fileName: string, chooserTitle: string, phone?: string): void;
  [key: string]: unknown;
}

export function getAndroidBridge(): AndroidBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { AndroidBridge?: AndroidBridge }).AndroidBridge ?? null;
}
