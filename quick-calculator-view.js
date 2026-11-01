import { evaluateCalculation, formatCalculation } from './quick-calculator.js?v=20';

const calculatorIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2m4 0h2m-8 4h2m4 0h2m-8 3h2m4 0h2"/></svg>';
export function quickCalculatorHTML() {
  const keys = [['C','Clear'],['%','Percent'],['⌫','Backspace'],['÷','Divide'],['7','7'],['8','8'],['9','9'],['×','Multiply'],['4','4'],['5','5'],['6','6'],['−','Subtract'],['1','1'],['2','2'],['3','3'],['+','Add'],['0','0'],['.','Decimal point'],['=','Equals']];
  return `<div class="quick-calculator" data-quick-calculator>
    <div class="quick-calc-dock"><button type="button" class="quick-calc-trigger" aria-label="Open quick calculator" aria-expanded="false" aria-controls="quick-calc-panel" title="Quick calculator">${calculatorIcon}</button><input class="quick-calc-inline" type="text" aria-label="Quick calculation" placeholder="120 × 1.8" maxlength="120" autocomplete="off" spellcheck="false"><button type="button" class="quick-calc-equals" aria-label="Calculate quick expression">=</button></div>
    <section id="quick-calc-panel" class="quick-calc-panel" role="dialog" aria-label="Quick calculator" hidden>
      <div class="quick-calc-head"><strong>Quick calculator</strong><button type="button" data-calc-close aria-label="Close calculator">×</button></div>
      <label class="sr-only" for="quick-calc-expression">Calculator expression</label><input id="quick-calc-expression" type="text" placeholder="120 × 1.8" maxlength="120" autocomplete="off" spellcheck="false">
      <output class="quick-calc-result" aria-live="polite" aria-atomic="true">0</output><p class="quick-calc-error" role="alert" hidden></p>
      <div class="quick-calc-keys">${keys.map(([key,label])=>`<button type="button" data-calc-key="${key}" aria-label="${label}"${key==='='?' class="quick-calc-key-equals"':''}>${key}</button>`).join('')}</div>
      <p class="quick-calc-help">+ − × ÷ · brackets · % means ÷ 100</p>
    </section></div>`;
}

export function mountQuickCalculator(container) {
  const heading=container.closest('.page-heading'), trigger=container.querySelector('.quick-calc-trigger');
  const panel=container.querySelector('.quick-calc-panel'), inline=container.querySelector('.quick-calc-inline');
  const expression=container.querySelector('#quick-calc-expression'), result=container.querySelector('output'), error=container.querySelector('.quick-calc-error');
  const controller=new AbortController(), {signal}=controller;
  let value='', finished=false, open=false;
  const sync=()=>{for(const input of [inline,expression])if(input.value!==value)input.value=value;};
  const clearError=()=>{error.hidden=true;error.textContent='';};
  function positionPanel() {
    if(!open)return;
    const rect=trigger.getBoundingClientRect(), margin=10, width=Math.min(224,window.innerWidth-margin*2);
    panel.style.width=`${width}px`;
    panel.style.left=`${Math.max(margin,Math.min(rect.left,window.innerWidth-width-margin))}px`;
    panel.style.maxHeight=`${Math.max(120,window.innerHeight-margin*2)}px`;
    const height=panel.getBoundingClientRect().height;
    const below=rect.bottom+8, above=rect.top-height-8;
    panel.style.top=`${Math.max(margin,below+height<=window.innerHeight-margin?below:above>=margin?above:window.innerHeight-height-margin)}px`;
  }
  function position() {
    const bounds=heading.getBoundingClientRect(), copy=heading.firstElementChild.getBoundingClientRect(), date=heading.querySelector('.date-control').getBoundingClientRect();
    const gap=date.left-copy.right-20, full=gap>=168;
    let left,top;
    if(gap>=32){const width=full?168:32;left=date.left-bounds.left-width-10;top=date.top-bounds.top+(date.height-32)/2;}
    else {left=bounds.width-32;top=copy.bottom-bounds.top-24;}
    container.classList.toggle('quick-calc-compact',!full);
    container.style.left=`${Math.max(0,left)}px`;container.style.top=`${Math.max(0,top)}px`;
    positionPanel();
  }
  function close(restore=false) {
    open=false;panel.hidden=true;trigger.setAttribute('aria-expanded','false');
    if(restore)trigger.focus({preventScroll:true});
  }
  function show() {
    open=true;panel.hidden=false;trigger.setAttribute('aria-expanded','true');positionPanel();
    expression.focus({preventScroll:true});expression.select();
  }
  function preview() {
    clearError();
    try {result.textContent=value.trim()?formatCalculation(evaluateCalculation(value)):'0';}
    catch {result.textContent='—';}
  }
  function calculate(input=expression) {
    try {value=formatCalculation(evaluateCalculation(value));sync();result.textContent=value;clearError();finished=true;input.select();}
    catch(caught){if(!open)show();result.textContent='—';error.textContent=caught.message;error.hidden=false;positionPanel();}
  }
  for(const input of [inline,expression]) {
    input.addEventListener('input',()=>{value=input.value;finished=false;sync();preview();},{signal});
    input.addEventListener('keydown',event=>{
      if(finished&&['+','-','*','/','×','÷','−','%'].includes(event.key)){input.setSelectionRange(value.length,value.length);finished=false;}
      if(event.key==='Enter'||event.key==='='){event.preventDefault();calculate(input);}
      else if(event.key==='Escape'&&open){event.preventDefault();close(true);}
    },{signal});
  }
  trigger.addEventListener('click',()=>{if(open)close(true);else show();},{signal});
  container.querySelector('.quick-calc-equals').addEventListener('click',()=>calculate(inline),{signal});
  container.querySelector('[data-calc-close]').addEventListener('click',()=>close(true),{signal});
  container.querySelector('.quick-calc-keys').addEventListener('pointerdown',event=>{if(event.target.closest('button'))event.preventDefault();},{signal});
  container.querySelector('.quick-calc-keys').addEventListener('click',event=>{
    const button=event.target.closest('[data-calc-key]');if(!button)return;
    const key=button.dataset.calcKey;
    if(key==='='){calculate();return;}
    if(key==='C'){value='';finished=false;sync();preview();expression.focus({preventScroll:true});return;}
    if(finished){if(/^[\d.]$/.test(key)){value='';sync();}expression.setSelectionRange(value.length,value.length);}
    const start=expression.selectionStart??value.length,end=expression.selectionEnd??value.length;
    const from=key==='⌫'&&start===end?Math.max(0,start-1):start;
    const insertion=key==='⌫'?'':key;
    const next=value.slice(0,from)+insertion+value.slice(end);
    if(next.length>120)return;
    value=next;finished=false;sync();preview();expression.focus({preventScroll:true});expression.setSelectionRange(from+insertion.length,from+insertion.length);
  },{signal});
  document.addEventListener('pointerdown',event=>{if(open&&!container.contains(event.target))close();},{signal});
  document.addEventListener('focusin',event=>{if(open&&!container.contains(event.target))close();},{signal});
  document.addEventListener('keydown',event=>{if(open&&event.key==='Escape'){event.preventDefault();close(true);}},{signal});
  window.addEventListener('resize',position,{signal,passive:true});
  window.addEventListener('scroll',positionPanel,{signal,passive:true,capture:true});
  const observer=new ResizeObserver(position);observer.observe(heading);observer.observe(heading.firstElementChild);observer.observe(heading.querySelector('.date-control'));
  position();
  return ()=>{controller.abort();observer.disconnect();};
}
