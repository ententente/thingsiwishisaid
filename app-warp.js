(() => {
  const STEP = 1;
  const CURR_KEY = `distortionStep${STEP}`;
  const DW = 1400, DH = 980;
  const canvas = document.getElementById('mainCanvas');
  const ctx = canvas.getContext('2d');
  const nextLink = document.getElementById('next');
  const diagEl = document.getElementById('diag');
  const counterEl = document.querySelector('.counter-box'); // NEW
  let warpLevel = 0;
  let lines = ['say something, will you?'];

  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const diag=(...m)=>{ if(diagEl) diagEl.textContent=m.join(' '); };

  function setCounter(v){ if(counterEl) counterEl.textContent = Math.round(v); } // NEW

  function loadLines(){
    try {
      const s = JSON.parse(localStorage.getItem('inputLines')||'[]');
      if(Array.isArray(s)&&s.some(x=>(x||'').trim())) lines = s.map(x=>(x||'').trim()).filter(Boolean).slice(0,3);
    } catch(_){}
    if(!lines.length) lines=['Ako'];
  }

  function computeFontSize(text,maxW,base=48){
    let size=base;
    ctx.font=`900 ${size}px "Press Start 2P", monospace`;
    while(ctx.measureText(text).width>maxW && size>12){
      size-=2;
      ctx.font=`900 ${size}px "Press Start 2P", monospace`;
    }
    return size;
  }

  function drawWarp(){
    canvas.width=DW; canvas.height=DH;
    ctx.clearRect(0,0,DW,DH);
    ctx.fillStyle='#fff';
    setCounter(warpLevel); // NEW

    const t = warpLevel/100;
    const cx=DW/2, cy=DH/2;
    const barYBase = DH*0.35, barSpacing=110;
    const radiusBase=Math.min(DW,DH)*0.32;
    const arcCyBase=DH*0.6;
    const arcSpanMax=Math.PI*1.6;
    const margin=40;

    const bands=[{inset:0},{inset:60},{inset:120}].slice(0,lines.length);

    bands.forEach((band,idx)=>{
      const text=lines[idx]||''; if(!text) return;
      const maxTextW=DW*0.8;
      const fontSize=computeFontSize(text,maxTextW,48);
      ctx.font=`900 ${fontSize}px "Press Start 2P", monospace`;

      const barY=barYBase+idx*barSpacing;
      const barW=DW*0.8; const barX0=cx-barW/2;
      const inset=band.inset;
      const rOut=Math.max(radiusBase-inset, fontSize*2.2);
      const arcR=rOut;
      const arcSpan=lerp(Math.PI, arcSpanMax, clamp((t-0.0)/0.5,0,1));
      const arcStart=Math.PI;
      const arcCy=arcCyBase;
      const circleR=rOut;
      const circleStart=Math.PI;

      const totalW=ctx.measureText(text).width;
      let advance=0;

      for(let ci=0; ci<text.length; ci++){
        const ch=text[ci];
        const cw=ctx.measureText(ch).width;
        const u=(advance+cw*0.5)/totalW;

        const barX=barX0+u*barW;
        const barAngle=0;
        const arcAngle=arcStart+arcSpan*u;
        const arcX=cx+arcR*Math.cos(arcAngle);
        const arcY=arcCy+arcR*Math.sin(arcAngle);
        const arcTangent=arcAngle+Math.PI/2;

        const circAngle=circleStart+Math.PI*2*u;
        const circX=cx+circleR*Math.cos(circAngle);
        const circY=cy+circleR*Math.sin(circAngle);
        const circTangent=circAngle+Math.PI/2;

        let px,py,ang;
        if(t<=0.5){
          const k=t/0.5;
          px=lerp(barX,arcX,k); py=lerp(barY,arcY,k); ang=lerp(barAngle,arcTangent,k);
        } else {
          const k=(t-0.5)/0.5;
          px=lerp(arcX,circX,k); py=lerp(arcY,circY,k); ang=lerp(arcTangent,circTangent,k);
        }

        px=clamp(px,margin,DW-margin);
        py=clamp(py,margin,DH-margin);

        ctx.save();
        ctx.translate(px,py);
        ctx.rotate(ang);
        ctx.fillText(ch,-cw/2,fontSize*0.35);
        ctx.restore();

        advance+=cw;
      }
    });
  }

  function saveCurrent(){
    try {
      const url=canvas.toDataURL('image/png');
      localStorage.setItem(CURR_KEY,url);
      diag(`Saved ${CURR_KEY}`);
    } catch(e){diag('Save failed');}
  }

  function onWheel(e){
    e.preventDefault();
    warpLevel=clamp(warpLevel+e.deltaY*0.05,0,100);
    drawWarp();
  }

  function init(){
    canvas.width=DW; canvas.height=DH;
    canvas.addEventListener('wheel', onWheel, {passive:false});
    loadLines();
    ctx.fillStyle='#fff';
    drawWarp();
    if(nextLink){
      nextLink.addEventListener('click', (e)=>{
        e.preventDefault();
        saveCurrent();
        const target = nextLink.getAttribute('href') || 'page2.html';
        window.location.href = target;
      });
    }
    diag('Warp ready. Scroll to warp.');
  }
  init();
})();