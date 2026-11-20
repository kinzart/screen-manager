// Both the local window and the paired TV receive a complete output snapshot.
(() => {
  const stage = document.getElementById('stage');
  const logo = document.getElementById('logo');
  let sequence, current, video, revision = -1, receivedAt;

  function syncVideo() {
    if (!video || !video.readyState || !Number.isFinite(video.duration) || !video.duration) return;
    const seconds = current.position + (current.paused ? 0 : (performance.now() - receivedAt) / 1000);
    const target = video.loop ? seconds % video.duration : Math.min(seconds, video.duration);
    if (Math.abs(video.currentTime - target) > 0.7) video.currentTime = target;
    if (current.paused) video.pause();
    else if (video.paused && (!video.ended || video.loop)) video.play().catch(() => {});
  }

  function render(snapshot) {
    if (!snapshot || snapshot.revision < revision) return;
    revision = snapshot.revision;
    current = snapshot;
    receivedAt = performance.now();
    if (sequence !== snapshot.sequence) {
      sequence = snapshot.sequence;
      stage.querySelector('.media')?.remove();
      video = null;
      logo.hidden = snapshot.action !== 'logo';
      if (snapshot.action === 'show' && snapshot.item) {
        const item = snapshot.item;
        const media = document.createElement(item.type === 'video' ? 'video' : 'img');
        media.className = 'media ' + (item.fit || 'contain') + ' enter-' + (item.transition || 'fade');
        if (item.type === 'video') {
          video = media;
          video.muted = true; video.playsInline = true; video.loop = !!item.duration;
          video.addEventListener('loadedmetadata', syncVideo);
        }
        media.addEventListener('error', () => window.fbs?.status?.({ error: 'Não foi possível abrir ' + item.name }));
        media.src = item.url;
        stage.appendChild(media);
      }
    }
    syncVideo();
  }
  if (window.fbs) {
    window.fbs.onCommand(render);
    window.fbs.currentOutput().then(render);
  } else {
    window.addEventListener('fbs-state', event => render(event.detail.output));
    // A relaunched desktop has a new sequence counter, even with the same pairing.
    window.addEventListener('fbs-connected', () => { sequence = undefined; revision = -1; });
  }
})();
