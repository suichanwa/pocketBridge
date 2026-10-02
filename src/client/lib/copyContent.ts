import { fetchWithRetry } from './fetchWithRetry.js';

/**
 * Converts any image Blob (JPEG, WEBP, GIF, SVG, etc.) into an image/png Blob
 * using an off-screen canvas. The Web Clipboard API strictly requires 'image/png'
 * for ClipboardItem across Safari (iOS/macOS) and Chromium.
 */
export async function convertBlobToPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') {
    return blob;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const objectUrl = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Canvas 2D context unavailable'));
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) {
          resolve(pngBlob);
        } else {
          reject(new Error('Failed to create PNG blob from canvas'));
        }
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for canvas PNG conversion'));
    };

    img.src = objectUrl;
  });
}

/**
 * Copies the raw image bitmap content into:
 * 1. The local client device clipboard (phone / browser pasteboard) via navigator.clipboard.write
 * 2. The host macOS system pasteboard via the PocketBridge server API
 */
export async function copyImageToClipboard(
  imageUrl: string,
  filePath?: string
): Promise<{ clientSuccess: boolean; macSuccess: boolean }> {
  let clientSuccess = false;
  let macSuccess = false;

  // 1. Copy image content into browser / phone clipboard
  try {
    const res = await fetchWithRetry(imageUrl);
    if (res.ok) {
      const rawBlob = await res.blob();
      const pngBlob = await convertBlobToPng(rawBlob);

      if (
        navigator.clipboard &&
        typeof navigator.clipboard.write === 'function' &&
        typeof ClipboardItem !== 'undefined'
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': pngBlob }),
        ]);
        clientSuccess = true;
      }
    }
  } catch (err) {
    console.warn('Could not copy image to browser clipboard:', err);
  }

  // 2. Also copy image content into the Mac host machine pasteboard
  try {
    const targetPath = filePath || (imageUrl.startsWith('/captures/') ? imageUrl : undefined);
    if (targetPath) {
      const apiRes = await fetchWithRetry('/api/files/copy-mac-clipboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath, type: 'image' }),
      });
      if (apiRes.ok) {
        macSuccess = true;
      }
    }
  } catch (err) {
    console.warn('Could not copy image to macOS host clipboard:', err);
  }

  return { clientSuccess, macSuccess };
}

/**
 * Copies text content into client clipboard and optionally syncs to macOS host clipboard.
 */
export async function copyTextToClipboard(
  text: string,
  filePath?: string
): Promise<boolean> {
  let copied = false;

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch {
    // Fallback if clipboard API is restricted
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      copied = true;
    } catch {
      copied = false;
    }
  }

  if (filePath) {
    fetchWithRetry('/api/files/copy-mac-clipboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, type: 'text' }),
    }).catch(() => {});
  }

  return copied;
}
