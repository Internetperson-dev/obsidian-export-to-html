export interface YouTubeEmbed {
  videoId: string;
  /** The query string of the original embed URL, without the leading `?`. */
  params: string;
}

const FACADE_STYLE = 'position:relative;display:block;max-width:640px;aspect-ratio:16/9;background:#000;border-radius:4px;overflow:hidden;text-decoration:none;';
const THUMBNAIL_STYLE = 'width:100%;height:100%;object-fit:cover;display:block;';
const OVERLAY_STYLE = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;';
const PLAY_BUTTON_STYLE = 'width:68px;height:48px;background:rgba(0,0,0,0.72);border-radius:10px;display:flex;align-items:center;justify-content:center;';
const PLAY_ICON_STYLE = 'border-style:solid;border-width:11px 0 11px 19px;border-color:transparent transparent transparent #fff;display:block;';

const YOUTUBE_FACADE_CLASS = 'youtube-lazy-embed';

/**
 * Extracts the video id and query string from a YouTube embed URL.
 * @returns The parsed embed, or `null` if the URL is not a YouTube embed.
 */
export function parseYouTubeEmbed (source: string): YouTubeEmbed | null {
  let url: URL;

  try {
    url = new URL(source);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com' && host !== 'm.youtube.com') {
    return null;
  }

  const match = /^\/embed\/([A-Za-z0-9_-]+)/.exec(url.pathname);
  if (match === null) {
    return null;
  }

  return {
    videoId: match[1],
    params: url.search.replace(/^\?/, ''),
  };
}

/**
 * Builds a lightweight, click-to-play facade for a YouTube embed. It shows the
 * video thumbnail and links to YouTube, so that it degrades gracefully when
 * scripts are not available (for example when the HTML is pasted in an email).
 */
export function createYouTubeFacade (embed: YouTubeEmbed): HTMLAnchorElement {
  const link = activeDocument.createElement('a');
  link.className = YOUTUBE_FACADE_CLASS;
  link.href = `https://www.youtube.com/watch?v=${embed.videoId}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('data-youtube-id', embed.videoId);
  link.setAttribute('aria-label', 'Play YouTube video');
  link.setAttribute('style', FACADE_STYLE);

  if (embed.params !== '') {
    link.setAttribute('data-youtube-params', embed.params);
  }

  const thumbnail = activeDocument.createElement('img');
  thumbnail.src = `https://i.ytimg.com/vi/${embed.videoId}/hqdefault.jpg`;
  thumbnail.alt = 'YouTube video thumbnail';
  thumbnail.setAttribute('loading', 'lazy');
  thumbnail.setAttribute('referrerpolicy', 'no-referrer');
  thumbnail.setAttribute('style', THUMBNAIL_STYLE);
  link.appendChild(thumbnail);

  const overlay = activeDocument.createElement('span');
  overlay.setAttribute('style', OVERLAY_STYLE);

  const playButton = activeDocument.createElement('span');
  playButton.setAttribute('style', PLAY_BUTTON_STYLE);

  const playIcon = activeDocument.createElement('span');
  playIcon.setAttribute('style', PLAY_ICON_STYLE);

  playButton.appendChild(playIcon);
  overlay.appendChild(playButton);
  link.appendChild(overlay);

  return link;
}

/**
 * Small inline script that replaces a facade with the real YouTube iframe
 * (and starts playback) when its thumbnail is clicked.
 */
export const YOUTUBE_LAZY_LOAD_SCRIPT = `(function () {
  function activate(link) {
    var id = link.getAttribute('data-youtube-id');
    if (!id) { return; }
    var params = link.getAttribute('data-youtube-params');
    var query = 'autoplay=1' + (params ? '&' + params : '');
    var iframe = document.createElement('iframe');
    iframe.setAttribute('src', 'https://www.youtube.com/embed/' + id + '?' + query);
    iframe.setAttribute('title', 'YouTube video player');
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('style', 'width:100%;aspect-ratio:16/9;border:0;display:block;');
    link.replaceWith(iframe);
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    while (target && target !== document) {
      if (target.classList && target.classList.contains('${YOUTUBE_FACADE_CLASS}')) {
        event.preventDefault();
        activate(target);
        return;
      }
      target = target.parentNode;
    }
  });
})();`;
