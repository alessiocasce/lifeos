export const MAX_PROFILE_SOURCE_BYTES = 15 * 1024 * 1024;
export const MAX_PROFILE_PHOTO_BYTES = 1024 * 1024;
export const PROFILE_PHOTO_SIZE = 512;

export function profilePhotoError(error) {
  if ([401,403].includes(Number(error?.status || error?.statusCode)) || /row.level security|permission denied/i.test(error?.message || '')) return 'You do not have permission to update this profile photo. Sign in again.';
  return error?.message || 'Photo could not be saved. Try again.';
}

export function validateProfilePhoto(file) {
  if (!file?.size || file.size > MAX_PROFILE_SOURCE_BYTES) {
    throw new Error('Choose a photo up to 15 MB.');
  }
}

export async function detectPhotoType(file) {
  const bytes = new Uint8Array(await file.slice(0, 40).arrayBuffer());
  const text = new TextDecoder('ascii').decode(bytes);
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes[0] === 137 && text.slice(1, 4) === 'PNG' && bytes[4] === 13 && bytes[5] === 10) return 'image/png';
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') return 'image/webp';
  if (text.startsWith('GIF87a') || text.startsWith('GIF89a')) return 'image/gif';
  if (text.slice(4, 8) === 'ftyp') {
    if (/avif|avis/.test(text.slice(8))) return 'image/avif';
    if (/heic|heix|hevc|hevx|mif1|msf1/.test(text.slice(8))) return 'image/heic';
  }
  throw new Error('Unsupported photo format. Choose JPEG, PNG, WebP, AVIF or a compatible HEIC photo.');
}

export async function loadProfilePhoto(file) {
  validateProfilePhoto(file);
  const type = await detectPhotoType(file);
  // Inspect bounded headers before asking the browser to allocate decoded pixels.
  const bytes = new Uint8Array(await file.slice(0, 2 * 1024 * 1024).arrayBuffer());
  const view = new DataView(bytes.buffer);
  let width, height;
  if (type === 'image/png' && bytes.length >= 24) { width = view.getUint32(16); height = view.getUint32(20); }
  if (type === 'image/gif' && bytes.length >= 10) { width = view.getUint16(6,true); height = view.getUint16(8,true); }
  if (type === 'image/webp' && bytes.length >= 30) {
    const chunk = new TextDecoder('ascii').decode(bytes.slice(12,16));
    if (chunk === 'VP8X') { width = 1 + bytes[24] + (bytes[25]<<8) + (bytes[26]<<16); height = 1 + bytes[27] + (bytes[28]<<8) + (bytes[29]<<16); }
    else if (chunk === 'VP8L') { const bits=view.getUint32(21,true); width=(bits & 16383)+1; height=((bits>>>14)&16383)+1; }
    else if (chunk === 'VP8 ') { width=view.getUint16(26,true)&16383; height=view.getUint16(28,true)&16383; }
  }
  if (type === 'image/jpeg') {
    let offset=2;
    while (offset+9<bytes.length) {
      if (bytes[offset++]!==255) break;
      while (bytes[offset]===255) offset++;
      if (offset+8>=bytes.length) break;
      const marker=bytes[offset++];
      if (marker===217 || marker===218) break;
      const length=view.getUint16(offset);
      if (length<2 || offset+length>bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) { height=view.getUint16(offset+3); width=view.getUint16(offset+5); break; }
      offset+=length;
    }
  }
  if (type === 'image/avif' || type === 'image/heic') {
    for (let i=4;i+16<=bytes.length;i++) {
      if (bytes[i]===105 && bytes[i+1]===115 && bytes[i+2]===112 && bytes[i+3]===101) { width=view.getUint32(i+8); height=view.getUint32(i+12); break; }
    }
  }
  if (!width || !height) throw new Error('This photo is corrupt or cannot be decoded by this browser.');
  if (width>16384 || height>16384 || width*height>60000000) throw new Error('Photo dimensions are too large. Choose a photo under 60 megapixels.');
  const source = new Blob([file], { type });
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (!image.naturalWidth || !image.naturalHeight) reject(new Error('This photo could not be opened.'));
      else if (image.naturalWidth * image.naturalHeight > 60000000) reject(new Error('Photo dimensions are too large. Choose a photo under 60 megapixels.'));
      else resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(type === 'image/heic' ? 'This browser cannot decode HEIC. Export the photo as JPEG or use a compatible browser.' : 'This photo is corrupt or cannot be decoded by this browser.'));
    };
    image.src = url;
  });
}

export function profilePhotoCrop(width, height, { zoom = 1, x = 50, y = 50 } = {}) {
  const side = Math.min(width, height) / Math.max(1, Math.min(3, zoom));
  return { x: (width - side) * Math.max(0, Math.min(100, x)) / 100,
    y: (height - side) * Math.max(0, Math.min(100, y)) / 100, side };
}

export function drawProfilePhoto(canvas, image, crop) {
  canvas.width = PROFILE_PHOTO_SIZE;
  canvas.height = PROFILE_PHOTO_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Photo editing is unavailable in this browser.');
  const area = profilePhotoCrop(image.naturalWidth, image.naturalHeight, crop);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, area.x, area.y, area.side, area.side, 0, 0, canvas.width, canvas.height);
}

export async function compressProfilePhoto(image, crop) {
  const canvas = document.createElement('canvas');
  drawProfilePhoto(canvas, image, crop);
  for (const type of ['image/webp', 'image/jpeg']) {
    for (const quality of [0.86, 0.72, 0.56]) {
      const blob = await new Promise(resolve => { try { canvas.toBlob(resolve, type, quality); } catch { resolve(null); } });
      if (!blob || blob.type !== type) break;
      if (blob.size <= MAX_PROFILE_PHOTO_BYTES) return blob;
    }
  }
  throw new Error('This photo could not be compressed. Choose another photo.');
}
