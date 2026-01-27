(() => {
  const STEP = 2;
  const PREV_KEY = `distortionStep${STEP - 1}`;
  const CURR_KEY = `distortionStep${STEP}`;
  const DW = 1400, DH = 980;
  const PAD = 200;

  const canvas = document.getElementById('mainCanvas');
  const ctx = canvas.getContext('2d');
  const nextLink = document.getElementById('next');
  const diagEl = document.getElementById('diag');
  const counterEl = document.querySelector('.counter-box');
  const resetBtn = document.getElementById('reset-btn');
  const startOverBtn = document.getElementById('startover-btn');

  let spacingLevel = 0; // 0 = widest, 100 = very tight/overlapping
  let components = [];
  let origCx = DW / 2;
  let hasSource = false;

  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const diag = (...m)=>{ if(diagEl) diagEl.textContent=m.join(' '); };
  const setCounter = v => { if (counterEl) counterEl.textContent = Math.round(v); };

  function loadPrevImage() {
    return new Promise((resolve) => {
      const url = localStorage.getItem(PREV_KEY);
      if (!url) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.crossOrigin = 'anonymous';
      img.src = url;
    });
  }

  function loadLinesOnly() {
    try {
      const s = JSON.parse(localStorage.getItem('inputLines')||'[]');
      if (Array.isArray(s) && s.some(t=>(t||'').trim())) return s;
    } catch(_){}
    return ['Ako'];
  }

  function buildSourceAndComponents(img, fallbackLines) {
    const src = document.createElement('canvas');
    src.width = DW; src.height = DH;
    const g = src.getContext('2d');
    g.clearRect(0,0,DW,DH);
    if (img) {
      g.drawImage(img, 0, 0, DW, DH);
    } else {
      const margin = DW * 0.08;
      const availableH = DH - margin*2;
      const lines = fallbackLines;
      let fontSize = Math.floor(availableH / (lines.length * 1.6));
      fontSize = Math.max(12, Math.min(fontSize, 180));
      const lsEm = 1;
      g.font = `900 ${fontSize}px "Press Start 2P", monospace`;
      g.textBaseline = 'middle';
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      const lh = fontSize * 1.2;
      const blockH = (lines.length - 1) * lh;
      let y = DH/2 - blockH/2;
      for (const line of lines) {
        let width = 0;
        for (const ch of line) width += g.measureText(ch).width + fontSize * lsEm;
        width = Math.max(0, width - fontSize * lsEm);
        let cursor = DW/2 - width/2;
        for (const ch of line) {
          g.fillText(ch, cursor, y);
          cursor += g.measureText(ch).width + fontSize * lsEm;
        }
        y += lh;
      }
    }
    extractComponents(src);
  }

  function extractComponents(srcCanvas) {
    const w = srcCanvas.width, h = srcCanvas.height;
    const g = srcCanvas.getContext('2d');
    const data = g.getImageData(0,0,w,h);
    const d = data.data;
    const visited = new Uint8Array(w*h);
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    const inb = (x,y)=> x>=0 && x<w && y>=0 && y<h;
    const comps = [];

    for (let y=0;y<h;y++){
      for (let x=0;x<w;x++){
        const idx = y*w + x;
        if (visited[idx]) continue;
        if (d[idx*4+3] <= 16) { visited[idx]=1; continue; }
        const q=[idx]; visited[idx]=1;
        let minX=w,minY=h,maxX=0,maxY=0;
        const pixels = [];
        while(q.length){
          const cur=q.pop();
          const cy=Math.floor(cur/w), cx=cur - cy*w;
          pixels.push(cur);
          if(cx<minX)minX=cx; if(cy<minY)minY=cy;
          if(cx>maxX)maxX=cx; if(cy>maxY)maxY=cy;
          for(const ddir of dirs){
            const nx=cx+ddir[0], ny=cy+ddir[1];
            if(!inb(nx,ny)) continue;
            const nidx=ny*w+nx;
            if(visited[nidx]) continue;
            if(d[nidx*4+3] > 16){ visited[nidx]=1; q.push(nidx); }
            else visited[nidx]=1;
          }
        }
        const cw = maxX - minX + 1;
        const ch = maxY - minY + 1;
        const compCanvas = document.createElement('canvas');
        compCanvas.width = cw; compCanvas.height = ch;
        const cg = compCanvas.getContext('2d');
        const compData = cg.createImageData(cw, ch);
        for (const p of pixels) {
          const py = (p / w) | 0;
          const px = p - py*w;
          const cx0 = px - minX;
          const cy0 = py - minY;
          const srcIdx = p*4;
          const dstIdx = (cy0*cw + cx0)*4;
          compData.data[dstIdx  ] = d[srcIdx  ];
          compData.data[dstIdx+1] = d[srcIdx+1];
          compData.data[dstIdx+2] = d[srcIdx+2];
          compData.data[dstIdx+3] = d[srcIdx+3];
        }
        cg.putImageData(compData, 0, 0);
        const cxCenter = (minX + maxX) / 2;
        comps.push({ canvas: compCanvas, minX, maxX, minY, maxY, w: cw, h: ch, cx: cxCenter });
      }
    }

    comps.sort((a,b)=> a.cx - b.cx);
    components = comps;
    if (comps.length) {
      const bbMin = comps[0].minX;
      const bbMax = comps[comps.length-1].maxX;
      origCx = (bbMin + bbMax) / 2;
    } else {
      origCx = DW/2;
    }
    hasSource = true;
  }

  // More aggressive compression: allow heavy negative gaps based on level
  function computePositions(level) {
    if (!components.length) return [];
    // gapFactor goes from 1 (level 0) down to -2 (level 100), so gaps become strongly negative
    const gapFactor = 1 - 3.0 * (level / 100); // 1 -> -2
    const minGap = -400; // hard cap on overlap distance
    const starts = [];
    let cursor = components[0].minX;
    starts[0] = cursor;
    for (let i=1;i<components.length;i++){
      const prev = components[i-1], cur = components[i];
      const gap = cur.minX - prev.maxX - 1;
      // add an extra negative push proportional to level to force overlap
      const desired = Math.max(minGap, Math.round(gap * gapFactor - level * 1.2));
      cursor = (starts[i-1] + (prev.maxX - prev.minX)) + desired + 1;
      starts[i] = cursor;
    }

    let minX = starts[0];
    let maxX = starts[0] + (components[0].maxX - components[0].minX);
    for (let i=1;i<components.length;i++){
      const w = components[i].maxX - components[i].minX;
      if (starts[i] < minX) minX = starts[i];
      if (starts[i] + w > maxX) maxX = starts[i] + w;
    }
    const newCx = (minX + maxX) / 2;
    const dx = origCx - newCx;
    for (let i=0;i<starts.length;i++) starts[i] += dx;
    return starts;
  }

  function render() {
    canvas.width = DW; canvas.height = DH;
    ctx.clearRect(0,0,DW,DH);
    setCounter(spacingLevel);
    if (!hasSource || !components.length) return;
    const starts = computePositions(spacingLevel);
    for (let i=0;i<components.length;i++) {
      const comp = components[i];
      const x = starts[i];
      const y = comp.minY;
      ctx.drawImage(comp.canvas, x, y);
    }
  }

  function saveCurrent(){
    try {
      const url=canvas.toDataURL('image/png');
      localStorage.setItem(CURR_KEY,url);
      diag(`Saved ${CURR_KEY}`);
    } catch(e){ diag('Save failed'); }
  }

  function resetState(){
    spacingLevel = 0;
    render();
  }

  function init(){
    const fallbackLines = loadLinesOnly();
    loadPrevImage().then(img=>{
      buildSourceAndComponents(img, fallbackLines);
      render();
      diag(img ? 'Loaded warped render; scroll to tighten.' : 'No previous render; tightening text fallback.');
    });

    canvas.addEventListener('wheel',(e)=>{
      e.preventDefault();
      const delta = e.deltaY;
      const step = Math.max(Math.abs(delta) * 0.05, 0.5);
      spacingLevel = clamp(spacingLevel + (delta < 0 ? step : -step), 0, 100);
      render();
    }, {passive:false});

    if(nextLink){
      nextLink.addEventListener('click',(e)=>{
        e.preventDefault();
        saveCurrent();
        const target = nextLink.getAttribute('href') || 'page2.html';
        window.location.href = target;
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        resetState();
      });
    }
    if (startOverBtn) {
      startOverBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'comment1.html';
      });
    }
  }
  init();
})();