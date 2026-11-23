/* FBS core: fila de mídias (nível 1) e avaliação de plano.
 * Puro e sem I/O. Carregado pelo servidor (require) e pelo receptor /tv (<script>, compatível com WebView 83).
 * Nunca conhece a fila de sessões: recebe apenas segmentos já resolvidos pelo servidor. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FBSCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PROTOCOL = 2;

  function itemDuration(item) {
    return item && isFinite(item.durationMs) && item.durationMs > 0 ? item.durationMs : 1000;
  }

  function totalDuration(items) {
    var total = 0;
    for (var i = 0; i < (items || []).length; i++) total += itemDuration(items[i]);
    return total;
  }

  /* Posição dentro da fila de mídias.
   * passes: número de passagens completas (>= 1) ou null/Infinity para repetição sem fim.
   * Retorna o item no ar, o deslocamento dentro dele e se a fila terminou. */
  function sequenceAt(items, offsetMs, passes) {
    var list = items || [];
    var total = totalDuration(list);
    if (!list.length || !total) return { index: -1, itemOffsetMs: 0, itemStartMs: 0, pass: 0, ended: true, totalMs: 0 };
    var limit = passes == null || passes === Infinity ? Infinity : total * Math.max(1, passes);
    var offset = Math.max(0, Number(offsetMs) || 0);
    var ended = offset >= limit;
    if (ended) {
      var last = list.length - 1;
      return { index: last, itemOffsetMs: itemDuration(list[last]), itemStartMs: limit - itemDuration(list[last]),
        pass: Math.max(0, Math.round(limit / total) - 1), ended: true, totalMs: total };
    }
    var pass = Math.floor(offset / total);
    var within = offset - pass * total;
    var start = 0;
    for (var i = 0; i < list.length; i++) {
      var duration = itemDuration(list[i]);
      if (within < start + duration || i === list.length - 1) {
        return { index: i, itemOffsetMs: Math.min(within - start, duration), itemStartMs: pass * total + start,
          pass: pass, ended: false, totalMs: total };
      }
      start += duration;
    }
    return { index: -1, itemOffsetMs: 0, itemStartMs: 0, pass: 0, ended: true, totalMs: total };
  }

  function mediaUrl(mediaId) {
    return '/api/v1/media/' + mediaId + '?role=screen';
  }

  /* Deslocamento (ms) dentro da sessão do segmento no instante t (relógio do servidor). */
  function segmentOffset(segment, t) {
    var base = Number(segment.offsetAtFromMs) || 0;
    return segment.playing ? base + Math.max(0, t - segment.fromMs) : base;
  }

  /* Saída no mesmo formato de playlistOutput() do servidor (protocolo 1). */
  function segmentOutput(segment, playlist, mediaById, t) {
    if (!segment || segment.kind === 'idle') return null;
    if (segment.kind === 'logo' || segment.kind === 'blackout') {
      return { mode: segment.kind, item: null, positionMs: 0, playing: false, totalMs: 0, currentIndex: -1 };
    }
    var items = (playlist && playlist.items) || [];
    var position = sequenceAt(items, segmentOffset(segment, t), segment.passes);
    var selected = items[position.index];
    var media = selected && mediaById && Object.prototype.hasOwnProperty.call(mediaById, selected.mediaId) ? mediaById[selected.mediaId] : null;
    return {
      mode: 'media',
      item: media ? { id: selected.id, mediaId: media.id, name: media.name, type: media.type, mime: media.mime,
        url: mediaUrl(media.id), durationMs: itemDuration(selected) } : null,
      positionMs: selected ? Math.max(0, Math.min(position.itemOffsetMs, itemDuration(selected))) : 0,
      playing: Boolean(segment.playing && position.totalMs && !position.ended),
      totalMs: position.totalMs,
      currentIndex: position.index,
    };
  }

  function findSegment(plan, t) {
    var segments = (plan && plan.segments) || [];
    for (var i = 0; i < segments.length; i++) {
      var to = segments[i].toMs == null ? Infinity : segments[i].toMs;
      if (t >= segments[i].fromMs && t < to) return segments[i];
    }
    return null;
  }

  /* Avalia o plano local, usado pelo receptor sem rede. */
  function planOutput(plan, t) {
    var segment = findSegment(plan, t);
    if (!segment) return { segment: null, output: plan && t >= plan.horizonEndMs ? { mode: 'logo', item: null, positionMs: 0, playing: false, totalMs: 0, currentIndex: -1 } : null };
    var playlist = segment.playlistId && plan.playlists ? plan.playlists[segment.playlistId] : null;
    return { segment: segment, output: segmentOutput(segment, playlist, plan.media, t) };
  }

  /* Mídias do plano na ordem do primeiro uso, para o pré-carregamento. */
  function planMediaOrder(plan, fromMs) {
    var seen = {};
    var order = [];
    var segments = (plan && plan.segments) || [];
    for (var i = 0; i < segments.length; i++) {
      var segment = segments[i];
      if (segment.kind !== 'media' || (segment.toMs != null && segment.toMs <= fromMs)) continue;
      var playlist = plan.playlists && plan.playlists[segment.playlistId];
      var items = (playlist && playlist.items) || [];
      var first = sequenceAt(items, segmentOffset(segment, Math.max(fromMs, segment.fromMs)), segment.passes).index;
      for (var k = 0; k < items.length; k++) {
        var item = items[(Math.max(0, first) + k) % items.length];
        if (!seen[item.mediaId]) { seen[item.mediaId] = true; order.push(item.mediaId); }
      }
    }
    return order;
  }

  return { PROTOCOL: PROTOCOL, itemDuration: itemDuration, totalDuration: totalDuration, sequenceAt: sequenceAt,
    segmentOffset: segmentOffset, segmentOutput: segmentOutput, findSegment: findSegment, planOutput: planOutput,
    planMediaOrder: planMediaOrder, mediaUrl: mediaUrl };
});
