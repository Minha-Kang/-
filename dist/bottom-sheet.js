// Mobile itinerary sheet. The content area keeps its native scrolling behavior.
export function createBottomSheet({app,sheet,handle,toggle,stage,content,onSnap=()=>{}}){
  if(!app||!sheet||!handle||!toggle||!stage)throw new Error('Bottom sheet elements are required.');
  const mobile=matchMedia('(max-width:700px)');
  const reduceMotion=matchMedia('(prefers-reduced-motion:reduce)');
  const root=document.documentElement;
  const brand=sheet.querySelector('.brand');
  let snap=1,currentHeight=0,drag=null,blockedClickUntil=0;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const heights=()=>{
    const h=app.clientHeight||window.innerHeight;
    return [0,Math.round(h*.47),Math.round(Math.max(h*.47,Math.min(h*.86,h-130)))];
  };
  const duration=()=>reduceMotion.matches?0:260;

  function drawHeight(value){
    currentHeight=value;
    const css=`${Math.round(value)}px`;
    app.style.setProperty('--sheet-height',css);
    root.style.setProperty('--sheet-height',css);
  }

  function releasePointer(session){
    if(!session)return;
    try{if(session.owner.hasPointerCapture(session.id))session.owner.releasePointerCapture(session.id);}catch{}
  }

  function applySnap(index,ms=duration()){
    snap=clamp(Math.round(Number(index)||0),0,2);
    if(!mobile.matches){desktop();return;}
    const hidden=snap===0;
    app.classList.toggle('sheet-is-expanded',snap===2);
    // Move focus before making the sheet inert, so Safari and screen readers
    // never keep their active control inside a hidden subtree.
    if(hidden&&sheet.contains(document.activeElement))toggle.focus({preventScroll:true});
    sheet.inert=hidden;
    sheet.setAttribute('aria-hidden',String(hidden));
    sheet.classList.toggle('collapsed',hidden);
    stage.classList.toggle('expanded',hidden);
    app.classList.remove('sheet-dragging');
    app.dataset.sheetSnap=String(snap);
    app.style.setProperty('--sheet-duration',`${ms}ms`);
    const hint=handle.querySelector('.sheet-grab-hint');if(hint)hint.textContent=snap===2?'아래로 끌어 접기':'위로 끌어 더 보기';
    toggle.innerHTML=hidden?'☰ 일정 펼치기 <span>⌃</span>':'일정 숨기기 <span>⌄</span>';
    handle.setAttribute('aria-expanded',String(snap===2));
    handle.setAttribute('aria-label',snap===2?'일정 창 줄이기':'일정 창 크게 보기');
    toggle.setAttribute('aria-expanded',String(!hidden));
    toggle.setAttribute('aria-label',hidden?'여행 일정 펼치기':'여행 일정 숨기기');
    drawHeight(heights()[snap]);
    onSnap({height:currentHeight,hidden,duration:ms});
  }

  function desktop(){
    sheet.inert=false;
    sheet.removeAttribute('aria-hidden');
    sheet.classList.remove('collapsed');
    stage.classList.remove('expanded');
    app.classList.remove('sheet-dragging','sheet-is-expanded');
    delete app.dataset.sheetSnap;
    app.style.removeProperty('--sheet-height');
    root.style.removeProperty('--sheet-height');
    handle.removeAttribute('aria-expanded');
    toggle.removeAttribute('aria-expanded');
    currentHeight=0;
    onSnap({height:0,hidden:false,duration:0});
  }

  function endDrag(cancel=false){
    const session=drag;
    if(!session)return;
    drag=null;
    releasePointer(session);
    app.classList.remove('sheet-dragging');
    if(!session.moved){if(cancel)applySnap(session.startSnap,0);return;}
    blockedClickUntil=performance.now()+450;
    if(cancel){applySnap(session.startSnap);return;}
    const levels=heights();
    let target=levels.reduce((best,h,index)=>Math.abs(h-currentHeight)<Math.abs(levels[best]-currentHeight)?index:best,0);
    const last=session.samples.at(-1);
    const first=session.samples[0];
    const elapsed=last.time-first.time;
    const speed=performance.now()-last.time<110&&elapsed>0?(last.y-first.y)/elapsed:0;
    // A flick can move to an adjacent level; it never projects unbounded speed
    // or skips levels unless the actual drag has already crossed them.
    if(target===session.startSnap&&Math.abs(speed)>.5&&Math.abs(session.lastY-session.startY)>14){
      target=clamp(session.startSnap+(speed<0?1:-1),0,2);
    }
    applySnap(target);
  }

  function startDrag(event){
    if(!mobile.matches||drag||!event.isPrimary||event.button!==0)return;
    if(event.currentTarget===brand&&event.target.closest('a,button,input,select,textarea,[role="button"],[contenteditable="true"]'))return;
    blockedClickUntil=0;
    const owner=event.currentTarget;
    const startHeight=sheet.getBoundingClientRect().height;
    drag={id:event.pointerId,owner,startX:event.clientX,startY:event.clientY,lastY:event.clientY,startHeight,startSnap:snap,moved:false,samples:[{y:event.clientY,time:performance.now()}]};
    try{owner.setPointerCapture(event.pointerId);}catch{}
  }

  function moveDrag(event){
    const session=drag;
    if(!session||event.pointerId!==session.id)return;
    const dx=event.clientX-session.startX,dy=event.clientY-session.startY;
    if(!session.moved){
      if(Math.abs(dx)<8&&Math.abs(dy)<8)return;
      if(Math.abs(dx)>Math.abs(dy)){
        blockedClickUntil=performance.now()+450;
        endDrag(true);
        return;
      }
      session.moved=true;
      app.classList.add('sheet-dragging');
    }
    event.preventDefault();
    session.lastY=event.clientY;
    const now=performance.now();
    session.samples.push({y:event.clientY,time:now});
    session.samples=session.samples.filter(sample=>now-sample.time<=120);
    drawHeight(clamp(session.startHeight-dy,0,heights()[2]));
  }

  function finishDrag(event){
    if(!drag||event.pointerId!==drag.id)return;
    endDrag(event.type==='pointercancel'||event.type==='lostpointercapture');
  }

  [handle,brand].filter(Boolean).forEach(target=>{
    target.addEventListener('pointerdown',startDrag);
    target.addEventListener('pointermove',moveDrag,{passive:false});
    target.addEventListener('pointerup',finishDrag);
    target.addEventListener('pointercancel',finishDrag);
    target.addEventListener('lostpointercapture',finishDrag);
  });
  sheet.addEventListener('pointerdown',()=>{blockedClickUntil=0;},true);
  sheet.addEventListener('click',event=>{
    if(performance.now()<blockedClickUntil&&event.detail!==0){
      event.preventDefault();
      event.stopImmediatePropagation();
      blockedClickUntil=0;
    }
  },true);
  handle.addEventListener('click',()=>{if(mobile.matches)applySnap(snap===2?1:2);});
  toggle.addEventListener('click',()=>{if(mobile.matches)applySnap(snap===0?1:0);});
  sheet.addEventListener('keydown',event=>{
    if(!mobile.matches)return;
    if(event.key==='Escape'){
      event.preventDefault();
      event.stopPropagation();
      setSnap(0);
      return;
    }
    if(event.target!==handle)return;
    const target={ArrowUp:snap+1,ArrowDown:snap-1,Home:0,End:2}[event.key];
    if(target!==undefined){event.preventDefault();setSnap(target);}
  });

  function setSnap(index){
    if(drag){const session=drag;drag=null;releasePointer(session);}
    applySnap(index);
  }
  function refresh(){
    if(drag){const session=drag;drag=null;snap=session.startSnap;releasePointer(session);}
    if(mobile.matches)applySnap(snap,0);else desktop();
  }
  // Resize is owned by this component; consumers only need refresh() when their
  // app container changes size without a window resize.
  window.addEventListener('resize',refresh);
  mobile.addEventListener('change',refresh);
  refresh();
  return {get height(){return currentHeight;},setSnap,refresh};
}
