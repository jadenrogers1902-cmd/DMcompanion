// Client-side map image compression to cut Supabase storage + egress.
//
// Downscales oversized maps and re-encodes to WebP before upload. Runs in the
// browser (canvas), so it's imported only by client components. Returns the
// file to upload PLUS its final pixel dimensions, which become the map/token
// coordinate space — callers must store these, not the original dimensions.
//
// Safe-guards: GIFs are passed through untouched (they may be animated); if the
// image isn't downscaled and the WebP re-encode isn't actually smaller, the
// original file + dimensions are kept.

export interface PreparedMapUpload {
  file: File
  width: number
  height: number
}

const DEFAULT_MAX_DIMENSION = 2500
const DEFAULT_QUALITY = 0.82

function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image.'))
    }
    img.src = url
  })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image.'))
    }
    img.src = url
  })
}

export async function prepareMapImageUpload(
  file: File,
  opts?: { maxDimension?: number; quality?: number },
): Promise<PreparedMapUpload> {
  const maxDimension = opts?.maxDimension ?? DEFAULT_MAX_DIMENSION
  const quality = opts?.quality ?? DEFAULT_QUALITY

  // Never re-encode GIFs (animation would be flattened) or run server-side.
  if (file.type === 'image/gif' || typeof document === 'undefined') {
    const { width, height } = await readDimensions(file)
    return { file, width, height }
  }

  let img: HTMLImageElement
  try {
    img = await loadImage(file)
  } catch {
    const { width, height } = await readDimensions(file)
    return { file, width, height }
  }

  const sourceW = img.naturalWidth
  const sourceH = img.naturalHeight
  const scale = Math.min(1, maxDimension / Math.max(sourceW, sourceH))
  const width = Math.max(1, Math.round(sourceW * scale))
  const height = Math.max(1, Math.round(sourceH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return { file, width: sourceW, height: sourceH }
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((result) => resolve(result), 'image/webp', quality),
  )
  if (!blob) return { file, width: sourceW, height: sourceH }

  // No downscale + not smaller → keep the original (and its real dimensions).
  if (scale === 1 && blob.size >= file.size) {
    return { file, width: sourceW, height: sourceH }
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'map'
  const compressed = new File([blob], `${baseName}.webp`, { type: 'image/webp' })
  return { file: compressed, width, height }
}
