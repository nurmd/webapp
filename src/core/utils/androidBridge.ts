export interface AndroidBridge {
  shareImage(base64Png: string, fileName: string, chooserTitle: string, phone?: string): void;
  [key: string]: any;
}

export function getAndroidBridge(): AndroidBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as any).AndroidBridge ?? null;
}
