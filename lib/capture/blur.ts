/**
 * On-device face blur (PRD M4.8). Runs BEFORE upload, so raw faces never leave the phone.
 * Privacy-first fallback: if the face detector cannot load, the whole photo is blurred.
 */
type Box = { x: number; y: number; w: number; h: number };
let detectorPromise: Promise<{ detect: (img: HTMLCanvasElement) => Box[] } | null> | null = null;

async function detector() {
  detectorPromise ??= (async () => {
    try {
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      const fd = await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/mediapipe/blaze_face_short_range.tflite' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.4,
      });
      return {
        detect: (img: HTMLCanvasElement) =>
          fd.detect(img).detections.map((d) => {
            const b = d.boundingBox!;
            return { x: b.originX, y: b.originY, w: b.width, h: b.height };
          }),
      };
    } catch {
      return null;
    }
  })();
  return detectorPromise;
}

export type BlurResult = { blob: Blob; faces: number; mode: 'faces' | 'whole' };

/** Grow each face box by 35% so hair/ears are covered too. */
export function padBox(b: Box, W: number, H: number, pad = 0.35): Box {
  const dx = b.w * pad;
  const dy = b.h * pad;
  const x = Math.max(0, b.x - dx);
  const y = Math.max(0, b.y - dy);
  return { x, y, w: Math.min(W - x, b.w + 2 * dx), h: Math.min(H - y, b.h + 2 * dy) };
}

export async function blurFaces(file: Blob, maxSide = 1600): Promise<BlurResult> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const W = Math.round(bmp.width * scale);
  const H = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, W, H);

  const det = await detector();
  let mode: BlurResult['mode'] = 'faces';
  let faces = 0;
  if (!det) {
    mode = 'whole';
    ctx.filter = 'blur(28px)';
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
  } else {
    const boxes = det.detect(canvas).map((b) => padBox(b, W, H));
    faces = boxes.length;
    for (const b of boxes) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.clip();
      ctx.filter = `blur(${Math.max(12, Math.round(b.w / 6))}px)`;
      ctx.drawImage(canvas, 0, 0);
      ctx.restore();
      // second pass: pixelate for robustness against de-blurring
      const px = Math.max(6, Math.round(b.w / 12));
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.round(b.w / px));
      small.height = Math.max(1, Math.round(b.h / px));
      small.getContext('2d')!.drawImage(canvas, b.x, b.y, b.w, b.h, 0, 0, small.width, small.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, small.width, small.height, b.x, b.y, b.w, b.h);
      ctx.imageSmoothingEnabled = true;
    }
  }
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.85));
  return { blob, faces, mode };
}
