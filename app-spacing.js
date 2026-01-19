(() => {
  const STEP = 2;
  const PREV_KEY = `distortionStep${STEP - 1}`; // distortionStep1
  const CURR_KEY = `distortionStep${STEP}`;     // distortionStep2
  const DW = 1400, DH = 980;
  const PAD = 200; // big padding to avoid clipping while packing

  const canvas = document.getElementById('mainCanvas');
  const ctx = canvas.getContext('2d');
  const nextLink = document.getElementById('next');
  const diagEl = document.getElementById('diag');
  const counterEl = document.querySelector('.counter-box');

  let spacingLevel = 0; // 0..100
  let prevImg = null;
  let fallbackLines = ['Ako'];

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

  function bboxFromData(imgData, w, h) {
    const d = imgData.data;
    let minX=w, minY=h, maxX=-1, maxY=-1;
    for (let y=0; y<h; y++) {
      for (let x=0; x<w; x++) {
        const a = d[(y*w+x)*4+3];
        if (a>16) {
          if (x<minX) minX=x;
          if (y<minY) minY=y;
          if (x>maxX) maxX=x;
          if (y>maxY) maxY=y;
        }
      }
    }
    if (maxX<minX || maxY<minY) return null;
    return {minX,minY,maxX,maxY};
  }

  // Find components on alpha>16
  function findComponents(imgData, w, h) {
    const d = imgData.data;
    const visited = new Uint8Array(w*h);
    const comps = [];
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    const inb = (x,y)=> x>=0 && x<w && y>=0 && y<h;

    for (let y=0;y<h;y++){
      for (let x=0;x<w;x++){
        const idx = y*w + x;
        if (visited[idx]) continue;
        if (d[idx*4+3] <= 16) { visited[idx]=1; continue; }
        const q=[idx]; visited[idx]=1;
        const pixels=[];
        let minX=w,minY=h,maxX=0,maxY=0;
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
        comps.push({pixels,minX,maxX,minY,maxY});
      }
    }
    return comps;
  }

  // Compress gaps horizontally, allow overlap, preserve center
  function compress(imgData, w, h, level, origCx) {
    const comps = findComponents(imgData, w, h);
    if (!comps.length) return imgData;

    comps.sort((a,b)=> (a.minX+a.maxX)/2 - (b.minX+b.maxX)/2);

    const gapFactor = 1 - 0.9*(level/100); // 1→0.1
    const minGap = -30; // allow overlap
    const newStarts = [];
    let cursor = comps[0].minX;
    newStarts[0] = cursor;
    for (let i=1;i<comps.length;i++){
      const prev=comps[i-1], cur=comps[i];
      const gap = cur.minX - prev.maxX - 1;
      const desired = Math.max(minGap, Math.floor(gap*gapFactor));
      cursor = (newStarts[i-1] + (prev.maxX - prev.minX)) + desired + 1;
      newStarts[i] = cursor;
    }

    const out = new Uint8ClampedArray(w*h*4);
    for (let i=0;i<comps.length;i++){
      const comp = comps[i];
      const shift = newStarts[i] - comp.minX;
      for (const p of comp.pixels){
        const y = (p / w) | 0;
        const x = p - y*w;
        const nx = x + shift;
        if (nx < 0 || nx >= w) continue;
        const src = p*4, dst = (y*w + nx)*4;
        out[dst]   = imgData.data[src];
        out[dst+1] = imgData.data[src+1];
        out[dst+2] = imgData.data[src+2];
        out[dst+3] = imgData.data[src+3];
      }
    }

    // recenter to original center
    const packed = new ImageData(out, w, h);
    const bb = bboxFromData(packed, w, h);
    if (!bb || origCx == null) return packed;
    const newCx = (bb.minX + bb.maxX)/2;
    const dx = origCx - newCx;
    if (Math.abs(dx) < 0.5) return packed;

    const shifted = new Uint8ClampedArray(w*h*4);
    for (let y=0;y<h;y++){
      for (let x=0;x<w;x++){
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        const src = (y*w + x)*4;
        const dst = (y*w + (nx|0))*4;
        shifted[dst]   = packed.data[src];
        shifted[dst+1] = packed.data[src+1];
        shifted[dst+2] = packed.data[src+2];
        shifted[dst+3] = packed.data[src+3];
      }
    }
    return new ImageData(shifted, w, h);
  }

  function drawCompressedImage(img) {
    // big buffer to avoid clipping while packing
    const W = DW + PAD*2, H = DH + PAD*2;
    const big = document.createElement('canvas');
    big.width = W; big.height = H;
    const g = big.getContext('2d');
    g.clearRect(0,0,W,H);

    // draw previous render 1:1 at center offset so that original area lands at DW/2,DH/2
    const offX = PAD;
    const offY = PAD;
    g.drawImage(img, offX, offY, DW, DH);

    const srcData = g.getImageData(0,0,W,H);
    const origBB = bboxFromData(srcData, W, H);
    const origCx = origBB ? (origBB.minX + origBB.maxX)/2 : W/2;

    const packed = compress(srcData, W, H, spacingLevel, origCx);

    // draw only the original DWxDH region back to main canvas
    canvas.width = DW; canvas.height = DH;
    ctx.clearRect(0,0,DW,DH);
    setCounter(spacingLevel);
    ctx.putImageData(packed, -offX, -offY);
  }

  function drawText(lines) {
    canvas.width = DW; canvas.height = DH;
    ctx.clearRect(0,0,DW,DH);
    setCounter(spacingLevel);

    const margin = DW * 0.08;
    const availableH = DH - margin*2;
    let fontSize = Math.floor(availableH / (lines.length * 1.6));
    fontSize = Math.max(12, Math.min(fontSize, 180));

    const lsEm = 1 - 0.8 * (spacingLevel / 100);
    ctx.font = `900 ${fontSize}px "Press Start 2P", monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';

    const lh = fontSize * 1.2;
    const blockH = (lines.length - 1) * lh;
    let y = DH/2 - blockH/2;

    for (const line of lines) {
      let width = 0;
      for (const ch of line) width += ctx.measureText(ch).width + fontSize * lsEm;
      width = Math.max(0, width - fontSize * lsEm);
      let cursor = DW/2 - width/2;
      for (const ch of line) {
        ctx.fillText(ch, cursor, y);
        cursor += ctx.measureText(ch).width + fontSize * lsEm;
      }
      y += lh;
    }
  }

  function render() {
    if (prevImg) drawCompressedImage(prevImg);
    else drawText(fallbackLines);
  }

  function saveCurrent(){
    try {
      const url=canvas.toDataURL('image/png');
      localStorage.setItem(CURR_KEY,url);
      diag(`Saved ${CURR_KEY}`);
    } catch(e){ diag('Save failed'); }
  }

  function init(){
    fallbackLines = loadLinesOnly();
    loadPrevImage().then(img=>{
      if (img) { prevImg = img; diag('Loaded warped render; scroll to tighten.'); }
      else { diag('No previous render; tightening text fallback.'); }
      render();
    });

    canvas.addEventListener('wheel',(e)=>{
      e.preventDefault();
      spacingLevel = clamp(spacingLevel + e.deltaY * 0.05, 0, 100);
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
  }
  init();
})();