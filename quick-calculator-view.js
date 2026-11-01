import { evaluateCalculation, formatCalculation } from './quick-calculator.js?v=20';

export function quickCalculatorHTML() {
  const keys=[['C','Clear'],['±','Change sign'],['%','Percent'],['÷','Divide'],['7','7'],['8','8'],['9','9'],['×','Multiply'],['4','4'],['5','5'],['6','6'],['−','Subtract'],['1','1'],['2','2'],['3','3'],['+','Add'],['⌫','Backspace'],['0','0'],['.','Decimal point'],['=','Equals']];
  return `<section class="quick-calculator" data-quick-calculator aria-label="Calculator">
    <div class="quick-calc-display"><label class="sr-only" for="quick-calc-expression">Calculator expression</label><input id="quick-calc-expression" type="text" placeholder="0" maxlength="120" autocomplete="off" spellcheck="false"><output class="quick-calc-result" aria-live="polite" aria-atomic="true">0</output><p class="quick-calc-error" role="alert" hidden></p></div>
    <div class="quick-calc-keys">${keys.map(([key,label])=>`<button type="button" data-calc-key="${key}" aria-label="${label}" title="${label}" class="${key==='='?'quick-calc-key-equals':['÷','×','−','+'].includes(key)?'quick-calc-operator':''}">${key}</button>`).join('')}</div>
    <button class="quick-calc-close" type="button" aria-label="Close calculator">×</button>
  </section>`;
}

export function mountQuickCalculator(container) {
  const expression=container.querySelector('#quick-calc-expression'),result=container.querySelector('output'),error=container.querySelector('.quick-calc-error');
  const mobileToggle=document.querySelector('.sidebar-calculator-toggle'),bottom=container.closest('.sidebar-bottom');
  const controller=new AbortController(),{signal}=controller;
  let value='',finished=false;
  const sync=()=>{if(expression.value!==value)expression.value=value;};
  const clearError=()=>{error.hidden=true;error.textContent='';result.hidden=false;};
  function preview() {
    clearError();
    try {result.textContent=value.trim()?formatCalculation(evaluateCalculation(value)):'0';result.title=result.textContent;}
    catch {result.textContent='—';result.title='';}
  }
  function calculate(select=false) {
    try {value=formatCalculation(evaluateCalculation(value));sync();result.textContent=value;result.title=value;clearError();finished=true;if(select)expression.select();}
    catch(caught){result.hidden=true;error.textContent=caught.message;error.title=caught.message;error.hidden=false;}
  }
  function closeMobile(restore=false) {
    bottom.classList.remove('calculator-open');mobileToggle.setAttribute('aria-expanded','false');
    if(restore)mobileToggle.focus({preventScroll:true});
  }
  function changeSign() {
    if(!value.trim()){value='−';return;}
    const number=value.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/);
    if(number){
      const prefix=value.slice(0,number.index),last=prefix.at(-1),before=prefix.at(-2);
      const unary=['−','-'].includes(last)&&(prefix.length===1||['+','−','-','×','*','÷','/','('].includes(before));
      value=(unary?prefix.slice(0,-1):prefix+'−')+number[0];
    } else value=value.startsWith('−(')&&value.endsWith(')')?value.slice(2,-1):`−(${value})`;
  }
  expression.addEventListener('input',()=>{value=expression.value;finished=false;preview();},{signal});
  expression.addEventListener('keydown',event=>{
    if(finished&&['+','-','*','/','×','÷','−','%'].includes(event.key)){expression.setSelectionRange(value.length,value.length);finished=false;}
    if(event.key==='Enter'||event.key==='='){event.preventDefault();calculate(true);}
  },{signal});
  const keys=container.querySelector('.quick-calc-keys');
  keys.addEventListener('pointerdown',event=>{if(event.target.closest('button'))event.preventDefault();},{signal});
  keys.addEventListener('click',event=>{
    const button=event.target.closest('[data-calc-key]');if(!button)return;
    const key=button.dataset.calcKey;
    if(key==='='){calculate();return;}
    if(key==='C'){value='';finished=false;sync();preview();return;}
    if(key==='±'){changeSign();finished=false;sync();preview();expression.setSelectionRange(value.length,value.length);return;}
    if(finished){if(/^[\d.]$/.test(key)){value='';sync();}expression.setSelectionRange(value.length,value.length);}
    const start=expression.selectionStart??value.length,end=expression.selectionEnd??value.length;
    const from=key==='⌫'&&start===end?Math.max(0,start-1):start,insertion=key==='⌫'?'':key;
    const next=value.slice(0,from)+insertion+value.slice(end);
    if(next.length>120)return;
    value=next;finished=false;sync();preview();expression.setSelectionRange(from+insertion.length,from+insertion.length);
  },{signal});
  mobileToggle.addEventListener('click',()=>{
    const open=bottom.classList.toggle('calculator-open');mobileToggle.setAttribute('aria-expanded',String(open));
    if(open)keys.querySelector('button').focus({preventScroll:true});
  },{signal});
  container.querySelector('.quick-calc-close').addEventListener('click',()=>closeMobile(true),{signal});
  document.addEventListener('pointerdown',event=>{if(bottom.classList.contains('calculator-open')&&!container.contains(event.target)&&!mobileToggle.contains(event.target))closeMobile();},{signal});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&bottom.classList.contains('calculator-open')){event.preventDefault();closeMobile(true);}},{signal});
  return ()=>controller.abort();
}
