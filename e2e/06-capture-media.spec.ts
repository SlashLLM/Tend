import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { captureItems, downloadCapture } from './db';
import { signInAs } from './helpers';

const FIXTURES = join(__dirname, 'fixtures');
/** ~6 s of synthetic speech (Windows SAPI): "Why do you think the bear is hiding in the forest? Tell me more about the bear." */
const SPEECH_WAV = join(FIXTURES, 'speech.wav');
/** MediaPipe's own sample portrait (public-domain official photo), 820×1024, one face. */
const FACE_JPG = join(FIXTURES, 'face.jpg');
const LIVE_AI = process.env.E2E_LIVE_AI === '1';

// Chromium's fake microphone plays the WAV on a loop; the permission prompt is auto-accepted.
test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${SPEECH_WAV}`] },
  permissions: ['microphone'],
});

/** Sandra schedules a fresh observation of Farah and starts it. Returns the observation id. */
async function startFreshObservation(page: Page, activity: string): Promise<string> {
  await signInAs(page, 'sandra');
  await page.goto('/observe');
  await page.getByLabel('Educator').selectOption({ label: 'Farah Ismail' });
  await page.getByLabel('Activity').fill(activity);
  await page.getByLabel('When (Singapore time)').fill('2026-12-15T09:30');
  await page.getByRole('button', { name: 'Schedule' }).click();
  await page.getByRole('link', { name: new RegExp(`Farah Ismail · ${activity}`) }).click();
  await expect(page).toHaveURL(/\/observe\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;
  await page.getByRole('button', { name: 'Start observation' }).click();
  await expect(page.getByRole('button', { name: 'Record dictation' })).toBeVisible();
  return id;
}

test.describe('Capture · microphone and photos', () => {
  test('microphone: dictation is recorded in 5-second clips and every clip reaches storage @mobile', async ({ page }) => {
    const id = await startFreshObservation(page, `Mic test ${Date.now()}`);

    await page.getByRole('button', { name: 'Record dictation' }).click();
    await expect(page.getByRole('button', { name: 'Pause dictation' })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(12_000); // two full 5 s clips, plus the partial one sent on pause
    await page.getByRole('button', { name: 'Pause dictation' }).click();
    await expect(page.getByRole('button', { name: 'Record dictation' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('All saved')).toBeVisible({ timeout: 60_000 });

    const clips = await captureItems(id, 'audio_chunk');
    expect(clips.length).toBeGreaterThanOrEqual(2);
    for (const c of clips) expect(c.storage_path, `clip ${c.seq} has no stored file`).toMatch(new RegExp(`/${id}/audio_chunk-\\d+\\.webm$`));
    // Every clip must be a complete, standalone audio file — not a fragment of one long recording
    // (fragments can't be transcribed or played back on their own).
    for (const c of clips) {
      const bytes = await downloadCapture(c.storage_path!);
      expect(bytes.length, `clip ${c.seq} is empty`).toBeGreaterThan(2_000);
      expect(bytes.subarray(0, 4).toString('hex'), `clip ${c.seq} is not a standalone WebM file`).toBe('1a45dfa3');
    }
    // clips are stamped with when they started, ~5 s apart
    const starts = clips.map((c) => c.t_offset_ms);
    expect(starts[0]).toBeLessThan(2_000);
    expect(starts[1] - starts[0]).toBeGreaterThan(3_500);

    const transcript = page.getByLabel('Live transcript');
    if (LIVE_AI) {
      // speech-to-text with the configured model (AI_STT_MODEL, default gpt-4o-mini-transcribe).
      // The fake mic loops the sentence, so every full clip has speech in it.
      await expect(transcript).toContainText(/bear/i, { timeout: 30_000 });
      const after = await captureItems(id, 'audio_chunk');
      for (const c of after.slice(0, -1)) expect(c.transcript, `clip ${c.seq} was not transcribed`).toMatch(/\w{3,}/);
      expect(after.map((c) => c.transcript ?? '').join(' ')).toMatch(/bear/i);
    } else {
      // offline mode never sends audio anywhere: clips are kept, nothing is transcribed
      expect(clips.every((c) => c.transcript === null)).toBe(true);
    }
  });

  test('a device clock 2 minutes behind the server loses nothing captured right after start @mobile', async ({ page }) => {
    // Regression: offsets were device-now minus SERVER start → negative → rejected (400) → silently dropped
    // while the screen said "All saved".
    await page.clock.install({ time: new Date(Date.now() - 2 * 60_000) });
    const id = await startFreshObservation(page, `Clock test ${Date.now()}`);
    await page.getByLabel('Note', { exact: true }).fill('Right at the start.');
    await page.getByRole('button', { name: 'Add note' }).click();
    await page.getByRole('button', { name: 'Mark a moment' }).click();
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles(FACE_JPG);
    await expect(page.getByLabel('Live transcript')).toContainText('Photo added', { timeout: 30_000 });
    await expect(page.getByText('All saved')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/could not be saved/)).toHaveCount(0);

    for (const kind of ['note', 'moment', 'photo']) {
      const rows = await captureItems(id, kind);
      expect(rows, `${kind} missing`).toHaveLength(1);
    }
  });

  test('photo: the face is found and blurred on the device before upload @mobile', async ({ page }) => {
    const id = await startFreshObservation(page, `Photo test ${Date.now()}`);

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles(FACE_JPG);
    await expect(page.getByLabel('Live transcript')).toContainText('Photo added · 1 face blurred', { timeout: 30_000 });
    await expect(page.getByText('All saved')).toBeVisible({ timeout: 60_000 });

    const [photo] = await captureItems(id, 'photo');
    expect(photo?.storage_path).toMatch(new RegExp(`/${id}/photo-\\d+\\.jpg$`));
    const stored = await downloadCapture(photo.storage_path!);
    expect(stored.subarray(0, 2).toString('hex')).toBe('ffd8'); // JPEG
    const original = readFileSync(FACE_JPG);
    expect(stored.equals(original)).toBe(false);

    // Compare fine detail (mean brightness gradient) in the stored photo vs the original:
    // the face must lose almost all of it; the background must keep it (only the face is blurred).
    const FACE = { x: 320, y: 120, w: 160, h: 200 }; // inside the face in the 820×1024 fixture
    const BACKGROUND = { x: 10, y: 20, w: 200, h: 380 }; // flag and curtain, well away from the face
    const r = await page.evaluate(
      async ({ orig, kept, face, bg }) => {
        const load = async (b64: string) => {
          const img = new Image();
          img.src = `data:image/jpeg;base64,${b64}`;
          await img.decode();
          return img;
        };
        const detail = (img: HTMLImageElement, box: { x: number; y: number; w: number; h: number }) => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(box.x, box.y, box.w, box.h).data;
          const lum = (i: number) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
          let sum = 0;
          for (let y = 0; y < box.h - 1; y++)
            for (let x = 0; x < box.w - 1; x++) {
              const i = (y * box.w + x) * 4;
              sum += Math.abs(lum(i) - lum(i + 4)) + Math.abs(lum(i) - lum(i + box.w * 4));
            }
          return sum / ((box.w - 1) * (box.h - 1));
        };
        const [a, b] = await Promise.all([load(orig), load(kept)]);
        return { w: b.naturalWidth, h: b.naturalHeight, face: detail(b, face) / detail(a, face), background: detail(b, bg) / detail(a, bg) };
      },
      { orig: original.toString('base64'), kept: stored.toString('base64'), face: FACE, bg: BACKGROUND },
    );
    expect({ w: r.w, h: r.h }).toEqual({ w: 820, h: 1024 }); // ≤ 1600 px already, so not resized
    expect(r.face, 'face detail kept (should be blurred)').toBeLessThan(0.35);
    expect(r.background, 'background detail lost (only faces should be blurred)').toBeGreaterThan(0.7);
  });
});
