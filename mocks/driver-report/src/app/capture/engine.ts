// mocks/driver-report/src/app/capture/engine.ts
/**
 * Which viewfinder the capture step opens, and everything the in-page one needs (§3.3 D-06, D4).
 *
 * The choice is a DECISION, not a capability probe: the stage draws its artefacts even on a laptop that has a camera,
 * because the presenter's window is on the projector and `getUserMedia` would put his face and a permission sheet in
 * front of the client (D4, §8.6 #14). So the rule is written as a pure function of three facts — `engineFor` — and
 * `chooseEngine` is that function applied to this page's own three. A test can then drive all four corners without
 * re-importing a module whose constants were read at init.
 *
 * The in-page half below never runs on the stage and never runs in a test: it is the touch-device path of §3.3 D-06
 * ([T2], exercised in W3-05 on a real phone). It is here rather than in the screen because a canvas, a track and a
 * data URL are not React, and because `chooseEngine` must be able to promise that the drawn engine touches
 * `navigator.mediaDevices` NOWHERE — a promise a component full of effects cannot make legibly.
 */
import { gt } from '../../domain/num';
import { IS_STAGE, IS_TOUCH } from '../device';

export type Engine = 'DRAWN' | 'INPAGE';

/** The long edge a real frame is downscaled to, and the JPEG quality it is kept at (§3.3 D-06). */
export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.8;
/** The edge of the thumbnail two frames are compared at (§3.3 D-06, EC-137). */
export const THUMB_EDGE = 400;

/** The rule, as three facts in and one engine out. A mouse gets the drawn engine as surely as the stage does: a
 *  desktop has no document on its passenger seat, and a webcam pointed at a face is not a viewfinder. */
export function engineFor(env: { stage: boolean; touch: boolean; camera: boolean }): Engine {
  if (env.stage) return 'DRAWN';
  if (!env.touch) return 'DRAWN';
  return env.camera ? 'INPAGE' : 'DRAWN';
}

/** Whether this browser exposes a camera at all. Reading the property is not asking for it: no prompt appears until
 *  `openCamera` is called, which the drawn engine never does. */
export function hasCamera(): boolean {
  if (typeof navigator === 'undefined') return false;
  const devices = navigator.mediaDevices as MediaDevices | undefined;
  return typeof devices?.getUserMedia === 'function';
}

/** I-15: the engine this page runs. The two facts that force the drawn engine are answered FIRST, so on the stage
 *  and on a desktop `navigator.mediaDevices` is not even read — the drawn path touches the camera API nowhere at
 *  all, which is the promise §8.6 #14 asks for and a property read would already blur. */
export function chooseEngine(): Engine {
  if (IS_STAGE || !IS_TOUCH) return engineFor({ stage: IS_STAGE, touch: IS_TOUCH, camera: false });
  return engineFor({ stage: false, touch: true, camera: hasCamera() });
}

/* ── the in-page camera ([T2]; never reached on the stage) ──────────────── */

/** The rear camera, asked for ONCE, after the pre-prompt the screen shows first. Rejects when the driver refuses,
 *  which is the «Без камери не вийде сфотографувати щиток.» branch. */
export async function openCamera(): Promise<MediaStream> {
  const devices = navigator.mediaDevices as MediaDevices | undefined;
  if (devices === undefined) throw new Error('no camera');
  return devices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
}

export function closeCamera(stream: MediaStream | null): void {
  if (stream === null) return;
  for (const track of stream.getTracks()) track.stop();
}

/** Whether the track can light the scene: «Світло» appears with «Темно» only then (§3.3 D-06). */
export function hasTorch(stream: MediaStream | null): boolean {
  if (stream === null) return false;
  const [track] = stream.getVideoTracks();
  if (track === undefined) return false;
  const caps = track.getCapabilities() as Record<string, unknown>;
  return 'torch' in caps;
}

export function setTorch(stream: MediaStream | null, on: boolean): void {
  if (stream === null) return;
  const [track] = stream.getVideoTracks();
  if (track === undefined) return;
  void track.applyConstraints({ advanced: [{ torch: on } as unknown as MediaTrackConstraintSet] });
}

/** The box a frame is drawn into: the same shape, with its long edge at most `maxEdge`. */
export function fitBox(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longEdge = gt(width, height) ? width : height;
  if (longEdge === 0 || !gt(longEdge, maxEdge)) return { width, height };
  // oxlint-disable-next-line agency/no-float-arithmetic -- canvas geometry in pixels: how far a frame shrinks, never money
  const scale = maxEdge / longEdge;
  // oxlint-disable-next-line agency/no-float-arithmetic -- the same pixel scale on the two edges
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** What a data URL weighs, for «0,7 МБ» on the review: four base64 characters carry three bytes. */
export function frameBytes(dataUrl: string): number {
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1);
  // oxlint-disable-next-line agency/no-float-arithmetic -- base64 → bytes, a length in a file, never money
  return Math.trunc((payload.length * 3) / 4);
}

export type Frame = { image: string; thumb: string; bytes: number };

function toDataUrl(source: CanvasImageSource, width: number, height: number, quality: number): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  ctx.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** One frame off the running video: the kept picture (≤ 1 600 px, JPEG 0.8) and the ≤ 400 px thumbnail two pages are
 *  compared at. Returns null before the first frame has decoded, when the video still has no size. */
export function grabFrame(video: HTMLVideoElement): Frame | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (w === 0 || h === 0) return null;
  const full = fitBox(w, h, MAX_EDGE);
  const small = fitBox(w, h, THUMB_EDGE);
  const image = toDataUrl(video, full.width, full.height, JPEG_QUALITY);
  const thumb = toDataUrl(video, small.width, small.height, JPEG_QUALITY);
  if (image === null || thumb === null) return null;
  return { image, thumb, bytes: frameBytes(image) };
}

/** The native camera's answer (`<input type="file" capture>`), downscaled the same way a live frame is. It is the
 *  denied branch of §3.3 D-06: the driver shoots in the phone's own camera app and hands the file back. */
export async function frameFromFile(file: File): Promise<Frame | null> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => { reject(new Error('unreadable')); };
    reader.onload = () => { resolve(typeof reader.result === 'string' ? reader.result : ''); };
    reader.readAsDataURL(file);
  });
  if (dataUrl === '') return null;
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const element = new Image();
    element.onload = () => { resolve(element); };
    element.onerror = () => { resolve(null); };
    element.src = dataUrl;
  });
  if (img === null) return null;
  const full = fitBox(img.naturalWidth, img.naturalHeight, MAX_EDGE);
  const small = fitBox(img.naturalWidth, img.naturalHeight, THUMB_EDGE);
  const image = toDataUrl(img, full.width, full.height, JPEG_QUALITY);
  const thumb = toDataUrl(img, small.width, small.height, JPEG_QUALITY);
  if (image === null || thumb === null) return null;
  return { image, thumb, bytes: frameBytes(image) };
}
