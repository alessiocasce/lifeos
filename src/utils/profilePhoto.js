export const MAX_PROFILE_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_PROFILE_PHOTO_BYTES = 1024 * 1024;
export const PROFILE_PHOTO_SIZE = 512;

export function validateProfilePhoto(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG or WebP photo.');
  }
  if (!file.size || file.size > MAX_PROFILE_SOURCE_BYTES) {
    throw new Error('Choose a photo up to 5 MB.');
  }
}

export function loadProfilePhoto(file) {
  validateProfilePhoto(file);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (!image.naturalWidth || !image.naturalHeight) reject(new Error('This photo could not be opened.'));
      else resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This photo could not be opened.'));
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
  for (const quality of [0.86, 0.72, 0.56]) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob || blob.type !== 'image/webp') throw new Error('WebP photo editing is unavailable in this browser.');
    if (blob.size <= MAX_PROFILE_PHOTO_BYTES) return blob;
  }
  throw new Error('This photo could not be compressed. Choose another photo.');
}
