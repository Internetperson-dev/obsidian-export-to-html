/**
 * A tiny (2x2) AVIF image used to feature-detect AVIF decoding support.
 * It is only ever fed to an `Image` element and never written anywhere.
 */
const AVIF_TEST_IMAGE = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUEAAADrbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAETAAAAHgAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABqaXBycAAAAEtpcGNvAAAAFGlzcGUAAAAAAAAAAgAAAAIAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBIAAAAAAAE2NvbHJuY2x4AAEADQAGgAAAABdpcG1hAAAAAAAAAAEAAQQBAoMEAAAAJm1kYXQSAAoHOAA2kBDQaTIRH/JihO////Fn4ACQNY48ftw=';

export const AV1_VIDEO_TYPE = 'video/mp4; codecs="av01.0.05M.08"';
export const H264_VIDEO_TYPE = 'video/mp4; codecs="avc1.42E01E"';

let avifImageSupport: boolean | null = null;

/**
 * Feature-detects whether the current browser can decode AVIF images.
 * The result is cached after the first call.
 */
export async function supportsAvifImage (): Promise<boolean> {
  if (avifImageSupport !== null) {
    return avifImageSupport;
  }

  avifImageSupport = await new Promise<boolean>((resolve) => {
    const image = activeDocument.createElement('img');
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = AVIF_TEST_IMAGE;
  });

  return avifImageSupport;
}

/**
 * Checks whether the current browser can play the given MIME type, using both
 * `HTMLMediaElement.canPlayType` and the Media Source Extensions API.
 */
export function canPlay (mimeType: string): boolean {
  const video = activeDocument.createElement('video');

  if (video.canPlayType(mimeType) !== '') {
    return true;
  }

  return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mimeType);
}

export function supportsAv1 (): boolean {
  return canPlay(AV1_VIDEO_TYPE);
}

export function supportsH264 (): boolean {
  return canPlay(H264_VIDEO_TYPE);
}

/**
 * Picks the best video codec supported by the current browser.
 */
export function getPreferredVideoCodec (): 'av1' | 'h264' {
  return supportsAv1() ? 'av1' : 'h264';
}
