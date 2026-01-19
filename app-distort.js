(() => {
  const STEP = Number(document.body.dataset.step || '3');
  const PREV_KEY = `distortionStep${STEP - 1}`; // distortionStep2
  const CURR_KEY = `distortionStep${STEP}`;     // distortionStep3
  const DW = 1400, DH = 980;
  const PW = 400, PH = 280;

  const canvas = document.getElementById('mainCanvas');
  const ctx = canvas.getContext('2d');
  const nextLink = document.getElementById('next');
  const diagEl = document.getElementById('diag');
  const counterEl = document.querySelector('.counter-box'); // counter
  let baseMask = null;
  let distortionLevel = 0;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const diag=(...m)=>{ if(diagEl) diagEl.textContent=m.join(' '); };
  const setCounter = v => { if (counterEl) counterEl.textContent = Math.round(v); };

  const procCanvas=document.createElement('canvas');
  procCanvas.width=PW; procCanvas.height=PH;
  const procCtx=procCanvas.getContext('2d');

  const params={ dilateMin:1,dilateMax:6,jitterMin:1,jitterMax:4,cavCountMin:2,cavCountMax:24,cavRMin:5,cavRMax:22,caItersMin:0,caItersMax:3,smoothPasses:1 };

  function blurAndThreshold(mask, w, h, passes=1, thresh=0.5){
    let cur=mask;
    for(let p=0;p<passes;p++){
      const nxt=new Uint8Array(w*h);
      for(let y=0;y<h;y++){
        const yOff=y*w, yPrev=y>0?(y-1)*w:yOff, yNext=y+1<h?(y+1)*w:yOff;
        for(let x=0;x<w;x++){
          const xl=x>0?x-1:x, xr=x+1<w?x+1:x;
          const sum =
            cur[yPrev+xl]+cur[yPrev+x]+cur[yPrev+xr]+
            cur[yOff +xl]+cur[yOff +x]+cur[yOff +xr]+
            cur[yNext+xl]+cur[yNext+x]+cur[yNext+xr];
          nxt[yOff+x]= sum >= thresh*9 ? 1 : 0;
        }
      }
      cur=nxt;
    }
    return cur;
  }

  function loadPrevImage(){
    return new Promise((resolve)=>{
      if(!PREV_KEY) return resolve(null);
      const url=localStorage.getItem(PREV_KEY);
      if(!url) return resolve(null);
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=()=>resolve(null);
      img.src=url;
    });
  }

  function linesToMaskSmall(lines){
    const clean=(lines||[]).map(s=>(s||'').trim()).filter(Boolean);
    const textLines=clean.length?clean:['Ako'];
    procCtx.clearRect(0,0,PW,PH);
    procCtx.fillStyle='#000'; procCtx.fillRect(0,0,PW,PH);
    const margin=Math.floor(PW*0.08);
    let fontSize=Math.floor(PH*0.6);
    const lineHeightFactor=1.2;
    let fits=false;
    while(!fits && fontSize>10){
      procCtx.font=`900 ${fontSize}px "Press Start 2P", monospace`;
      const widths=textLines.map(t=>procCtx.measureText(t).width);
      const maxW=Math.max(...widths);
      const totalH=textLines.length*fontSize*lineHeightFactor;
      if(maxW<=PW-margin*2 && totalH<=PH-margin*2) fits=true; else fontSize-=3;
    }
    procCtx.textBaseline='middle';
    procCtx.textAlign='center';
    procCtx.fillStyle='#fff';
    const lh=fontSize*lineHeightFactor;
    const blockH=(textLines.length-1)*lh;
    let y=PH/2-blockH/2;
    for(const line of textLines){ procCtx.fillText(line,PW/2,y); y+=lh; }
    const data=procCtx.getImageData(0,0,PW,PH).data;
    const m=new Uint8Array(PW*PH);
    for(let i=0,j=0;i<data.length;i+=4,j++){
      const lum=0.299*data[i]+0.587*data[i+1]+0.114*data[i+2];
      m[j]= lum>128 ? 1 : 0;
    }
    return m;
  }

  function imageToMaskSmall(img){
    procCtx.clearRect(0,0,PW,PH);
    procCtx.drawImage(img,0,0,PW,PH);
    const data=procCtx.getImageData(0,0,PW,PH).data;
    const m=new Uint8Array(PW*PH);
    for(let i=0,j=0;i<data.length;i+=4,j++){
      const lum=0.299*data[i]+0.587*data[i+1]+0.114*data[i+2];
      m[j]= lum>128 ? 1 : 0;
    }
    return m;
  }

  function dilate(src,r){
    if(r<=0) return src;
    const dst=new Uint8Array(PW*PH);
    const r2=r*r;
    for(let y=0;y<PH;y++){
      const yOff=y*PW;
      for(let x=0;x<PW;x++){
        let hit=0;
        for(let dy=-r;dy<=r && !hit;dy++){
          const yy=y+dy; if(yy<0||yy>=PH) continue;
          const dy2=dy*dy; const yyOff=yy*PW;
          for(let dx=-r;dx<=r;dx++){
            const xx=x+dx; if(xx<0||xx>=PW) continue;
            if(dx*dx+dy2<=r2 && src[yyOff+xx]) { hit=1; break; }
          }
        }
        dst[yOff+x]=hit;
      }
    }
    return dst;
  }

  function jitterEdges(src,r){
    if(r<=0) return src;
    const dst=src.slice();
    const block=Math.max(3,r);
    for(let y=0;y<PH;y+=block){
      for(let x=0;x<PW;x+=block){
        const jx=(Math.random()*2-1)*r;
        const jy=(Math.random()*2-1)*r;
        for(let yy=0; yy<block; yy++){
          const sy=y+yy; if(sy>=PH) continue;
          const syOff=sy*PW;
          for(let xx=0; xx<block; xx++){
            const sx=x+xx; if(sx>=PW) continue;
            const nx = sx + jx | 0, ny = sy + jy | 0;
            if(nx>=0 && nx<PW && ny>=0 && ny<PH){
              dst[ny*PW+nx] |= src[syOff+sx];
            }
          }
        }
      }
    }
    return dst;
  }

  function carveCavities(src,count,rMin,rMax){
    const dst=src.slice();
    for(let i=0;i<count;i++){
      const r=rMin+Math.random()*(rMax-rMin);
      const cx=(Math.random()*PW)|0;
      const cy=(Math.random()*PH)|0;
      const r2=r*r;
      const x0=Math.max(0,(cx-r)|0), x1=Math.min(PW-1,(cx+r)|0);
      const y0=Math.max(0,(cy-r)|0), y1=Math.min(PH-1,(cy+r)|0);
      for(let y=y0;y<=y1;y++){
        const dy=y-cy; const dy2=dy*dy; const yOff=y*PW;
        for(let x=x0;x<=x1;x++){
          const dx=x-cx;
          if(dx*dx+dy2<=r2) dst[yOff+x]=0;
        }
      }
    }
    return dst;
  }

  function cellularSmooth(src,iters){
    let cur=src;
    const nbrs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for(let k=0;k<iters;k++){
      const nxt=new Uint8Array(PW*PH);
      for(let y=0;y<PH;y++){
        const yOff=y*PW;
        for(let x=0;x<PW;x++){
          let sum=0;
          for(let n of nbrs){
            const nx=x+n[0], ny=y+n[1];
            if(nx>=0 && nx<PW && ny>=0 && ny<PH) sum+=cur[ny*PW+nx];
          }
          let v=cur[yOff+x];
          if(sum>=5) v=1; else if(sum<=3) v=0;
          nxt[yOff+x]=v;
        }
      }
      cur=nxt;
    }
    return cur;
  }

  function bbox(mask){
    let minX=PW,minY=PH,maxX=-1,maxY=-1;
    for(let y=0;y<PH;y++){
      const yOff=y*PW;
      for(let x=0;x<PW;x++){
        if(mask[yOff+x]){
          if(x<minX) minX=x;
          if(y<minY) minY=y;
          if(x>maxX) maxX=x;
          if(y>maxY) maxY=y;
        }
      }
    }
    if(maxX<minX||maxY<minY) return null;
    return {minX,minY,maxX,maxY,w:maxX-minX+1,h:maxY-minY+1};
  }

  function renderMaskToDisplay(mask){
    const out=new Uint8ClampedArray(PW*PH*4);
    for(let i=0,j=0;i<mask.length;i++,j+=4){
      const a = mask[i] ? 255 : 0;
      out[j]=255; out[j+1]=255; out[j+2]=255; out[j+3]=a;
    }
    procCtx.putImageData(new ImageData(out,PW,PH),0,0);

    const b=bbox(mask);
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,DW,DH);
    ctx.imageSmoothingEnabled=false;
    if(b){
      const pad=12;
      const scale=Math.min((DW-2*pad)/b.w,(DH-2*pad)/b.h);
      const cx=(b.minX+b.maxX)/2;
      const cy=(b.minY+b.maxY)/2;
      const offsetX=DW/2 - cx*scale;
      const offsetY=DH/2 - cy*scale;
      ctx.setTransform(scale,0,0,scale,offsetX,offsetY);
    }
    ctx.drawImage(procCanvas,0,0);
    ctx.restore();
  }

  function distortAndRender(){
    if(!baseMask) return;
    setCounter(distortionLevel);

    const t=distortionLevel/100;
    let m=baseMask.slice();

    const dilateR=Math.round(lerp(params.dilateMin,params.dilateMax,t));
    m=dilate(m,dilateR);

    const jitterR=Math.round(lerp(params.jitterMin,params.jitterMax,t));
    m=jitterEdges(m,jitterR);

    const cavCount=Math.round(lerp(params.cavCountMin,params.cavCountMax,t));
    m=carveCavities(m,cavCount,params.cavRMin,params.cavRMax);

    const caIters=Math.round(lerp(params.caItersMin,params.caItersMax,t*t));
    if(caIters>0) m=cellularSmooth(m,caIters);

    m=cellularSmooth(m,params.smoothPasses);
    m=blurAndThreshold(m,PW,PH,1,0.5);

    renderMaskToDisplay(m);
  }

  function saveCurrent(){
    try{
      const url=canvas.toDataURL('image/png');
      localStorage.setItem(CURR_KEY,url);
      diag(`Saved ${CURR_KEY}`);
    } catch(e){ diag('Save failed'); }
  }

  function initStep(){
    if(STEP===1){
      let lines=['Ako'];
      try{
        const stored=JSON.parse(localStorage.getItem('inputLines')||'[]');
        if(Array.isArray(stored)&&stored.some(s=>(s||'').trim())) lines=stored;
      }catch(_){}
      baseMask=linesToMaskSmall(lines);
      distortionLevel=0;
      distortAndRender();
    } else {
      loadPrevImage().then(img=>{
        if(!img){ baseMask=new Uint8Array(PW*PH); diag('No previous image'); }
        else baseMask=imageToMaskSmall(img);
        distortionLevel=0;
        distortAndRender();
      });
    }
  }

  function onWheel(e){
    e.preventDefault();
    distortionLevel=clamp(distortionLevel+e.deltaY*0.05,0,100);
    distortAndRender();
  }

  function init(){
    canvas.width=DW; canvas.height=DH;
    canvas.addEventListener('wheel', onWheel, {passive:false});
    initStep();
    if(nextLink){
      nextLink.addEventListener('click',(e)=>{
        e.preventDefault();
        saveCurrent();
        const target = nextLink.getAttribute('href') || 'page3.html';
        window.location.href = target;
      });
    }
    diag(`Step ${STEP} ready. Scroll to distort.`);
  }
  init();
})();