const stage = document.getElementById('stage');
const fileUrl = path => {
  const normalized = String(path || '').replace(/\\/g, '/');
  const encoded = normalized.split('/').map((part, index) => index === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)).join('/');
  return `file:///${encoded}`.replace('file:////','file:///');
};
function clear() { stage.querySelectorAll('.media,.blackout').forEach(x => x.remove()); }
function logo() { clear(); document.getElementById('logo').hidden = false; }
function show(item) {
  clear(); document.getElementById('logo').hidden = true;
  const el = document.createElement(item.type === 'video' ? 'video' : 'img');
  el.className = `media ${item.fit || 'contain'} enter-${item.transition || 'fade'}`;
  el.src = fileUrl(item.path);
  if (item.type === 'video') { el.autoplay = true; el.muted = true; el.playsInline = true; el.loop = !!item.duration; el.addEventListener('error', () => window.fbs.status({ error: `Não foi possível reproduzir ${item.name}` })); }
  else el.addEventListener('error', () => window.fbs.status({ error: `Arquivo não encontrado: ${item.name}` }));
  stage.appendChild(el);
}
window.fbs.onCommand(cmd => {
  if (cmd.action === 'show') show(cmd.item);
  if (cmd.action === 'blackout') { clear(); document.getElementById('logo').hidden = true; stage.insertAdjacentHTML('beforeend','<div class="blackout"></div>'); }
  if (cmd.action === 'logo') logo();
  if (cmd.action === 'pause') stage.querySelector('video')?.pause();
  if (cmd.action === 'resume') stage.querySelector('video')?.play().catch(()=>{});
});
