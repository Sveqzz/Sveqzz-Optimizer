const $ = (i) => document.getElementById(i);
  const col = (v, a, b) => v == null ? '' : v < a ? 'r' : v < b ? 'y' : 'g';
  window.velox.onOverlay((d) => {
    $('game').textContent = d.game || 'Sveqzz Optimizer';
    $('fps').textContent = d.fps == null ? '—' : d.fps; $('fps').className = col(d.fps, 30, 60);
    $('low').textContent = d.low1 == null ? '—' : Math.round(d.low1);
    $('ping').textContent = d.ping == null ? '—' : Math.round(d.ping) + 'ms'; $('ping').className = d.ping == null ? '' : d.ping > 120 ? 'r' : d.ping > 60 ? 'y' : 'g';
    $('cpu').textContent = d.cpu + '%'; $('gpu').textContent = d.gpu == null ? '—' : d.gpu + '%'; $('tmp').textContent = d.gpuTemp == null ? '—' : d.gpuTemp + '°';
    const h = $('hint');
    if (d.fps == null) { h.hidden = false; h.textContent = d.downloading ? 'Descargando medidor de FPS…' : d.fpsError ? 'FPS: ' + d.fpsError : 'Esperando fotogramas del juego…'; } else h.hidden = true;
  });
