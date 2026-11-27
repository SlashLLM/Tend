/**
 * Short video with faces blurred ON THE DEVICE (PRD M4 "Capture: … short video", §11 "faces
 * blurred"). The clip is played through a canvas: every frame is face-detected and blurred, and the
 * canvas is re-recorded as WebM. Only that re-recorded copy is uploaded — the original never leaves
 * the phone. Processing runs in real time (a 20-second clip takes about 20 seconds).
 *
 * Privacy choices:
 *   - No audio track: dictation is the voice channel, and children's voices are not uploaded.
 *   - Boxes from the last few frames are kept, so a face the detector misses for a frame stays blurred.
 *   - If the face detector cannot load, every frame is blurred whole.
 */
import { blurBoxes, blurWhole, detector, padBox, type Box } from './blur';

export const VIDEO_MAX_SECONDS = 30;
export const VIDEO_MAX_SIDE = 720;
/** Frames of face boxes to keep (covers detector flicker on moving children). */
const STICKY_FRAMES = 4;

export type VideoPlan = { W: number; H: number; tooLong: boolean };

/** Output size (longest side ≤ maxSide, even numbers for the encoder) and whether the clip is too long. */
export function videoPlan(durationS: number, w: number, h: number, maxSeconds = VIDEO_MAX_SECONDS, maxSide = VIDEO_MAX_SIDE): VideoPlan {
  const scale = Math.min(1, maxSide / Math.max(w, h, 1));
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { W: even(w), H: even(h), tooLong: !Number.isFinite(durationS) || durationS > maxSeconds + 0.5 };
}

/** Union of the recent frames' boxes (newest last), capped so the list never grows. */
export function stickyBoxes(history: Box[][], latest: Box[], keep = STICKY_FRAMES): { history: Box[][]; boxes: Box[] } {
  const next = [...history, latest].slice(-keep);
  return { history: next, boxes: next.flat() };
}

export type VideoBlurResult = { blob: Blob; mode: 'faces' | 'whole'; frames: number; maxFaces: number; durationMs: number };

export class VideoTooLongError extends Error {
  constructor() {
    super('video too long');
  }
}

export async function blurVideo(file: Blob, opts: { onProgress?: (fraction: number) => void } = {}): Promise<VideoBlurResult> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('cannot read video'));
    });
    const plan = videoPlan(video.duration, video.videoWidth, video.videoHeight);
    if (plan.tooLong) throw new VideoTooLongError();

    const canvas = document.createElement('canvas');
    canvas.width = plan.W;
    canvas.height = plan.H;
    const ctx = canvas.getContext('2d')!;
    const det = await detector();
    const mode: VideoBlurResult['mode'] = det ? 'faces' : 'whole';

    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    const stream = canvas.captureStream(15);
    const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 1_500_000 });
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    const stopped = new Promise<void>((resolve) => (rec.onstop = () => resolve()));

    let frames = 0;
    let maxFaces = 0;
    let history: Box[][] = [];
    const draw = () => {
      ctx.drawImage(video, 0, 0, plan.W, plan.H);
      if (!det) blurWhole(ctx, canvas);
      else {
        const found = det.detect(canvas).map((b) => padBox(b, plan.W, plan.H, 0.5));
        maxFaces = Math.max(maxFaces, found.length);
        const s = stickyBoxes(history, found);
        history = s.history;
        blurBoxes(ctx, canvas, s.boxes);
      }
      frames++;
      opts.onProgress?.(Math.min(1, video.currentTime / (video.duration || 1)));
    };

    // Draw the first frame BEFORE recording starts, so no unblurred frame is ever captured.
    video.currentTime = 0;
    await new Promise<void>((r) => (video.onseeked = () => r()));
    draw();
    rec.start(1000);
    const ended = new Promise<void>((resolve) => (video.onended = () => resolve()));
    const vfc = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback?.bind(video);
    let running = true;
    const loop = () => {
      if (!running) return;
      draw();
      if (vfc) vfc(loop);
      else requestAnimationFrame(loop);
    };
    await video.play();
    if (vfc) vfc(loop);
    else requestAnimationFrame(loop);
    await ended;
    running = false;
    draw();
    rec.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    opts.onProgress?.(1);
    return { blob: new Blob(parts, { type: parts[0]?.type || 'video/webm' }), mode, frames, maxFaces, durationMs: Math.round(video.duration * 1000) };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
