// Bounded diagnostics, kept in this tab. No storage, network, user text, or extra frame loop.
// Interaction duration is a lab signal, not an official field INP calculation.
export function createExperienceMetrics({clock=()=>performance.now(),observer=globalThis.PerformanceObserver}={}) {
  const stages=Object.create(null), frames=new Uint32Array(251);
  let frameCount=0,frameTotal=0,frameWorst=0,over50=0,longTasks=0,longTaskMs=0,longestTask=0,interactionMs=0,lcpMs=null,cls=0,clsWindow=0,clsStart=0,clsLast=0;
  const subscriptions=[];
  function observe(type,consume,extra={}) {
    if(!observer?.supportedEntryTypes?.includes(type))return;
    try {const handle=new observer(list=>{for(const entry of list.getEntries())consume(entry);});handle.observe({type,buffered:true,...extra});subscriptions.push(handle);}catch{}
  }
  observe('longtask',entry=>{longTasks++;longTaskMs+=entry.duration;longestTask=Math.max(longestTask,entry.duration);});
  observe('event',entry=>{if(entry.interactionId)interactionMs=Math.max(interactionMs,entry.duration);},{durationThreshold:40});
  observe('largest-contentful-paint',entry=>{lcpMs=entry.startTime;});
  observe('layout-shift',entry=>{
    if(entry.hadRecentInput)return;
    if(!clsWindow||entry.startTime-clsLast>1000||entry.startTime-clsStart>5000){clsWindow=0;clsStart=entry.startTime;}
    clsWindow+=entry.value;clsLast=entry.startTime;cls=Math.max(cls,clsWindow);
  });
  const round=value=>Math.round(value*10)/10;
  return {
    mark(name) {if(stages[name]===undefined)stages[name]=round(clock());},
    frame(ms) {
      if(!Number.isFinite(ms)||ms<=0)return;
      frames[Math.min(250,Math.round(ms))]++;frameCount++;frameTotal+=ms;frameWorst=Math.max(frameWorst,ms);if(ms>50)over50++;
    },
    snapshot() {
      let cumulative=0,p95=null;
      if(frameCount)for(let i=0;i<frames.length;i++){cumulative+=frames[i];if(cumulative>=frameCount*.95){p95=i===250?'250+':i;break;}}
      return {stages:{...stages},activeFrames:{count:frameCount,meanMs:frameCount?round(frameTotal/frameCount):null,p95Ms:p95,worstMs:round(frameWorst),over50},
        browser:{lcpMs:lcpMs===null?null:round(lcpMs),cls:+cls.toFixed(4),maxObservedInteractionMs:round(interactionMs),longTasks,longTaskMs:round(longTaskMs),longestTaskMs:round(longestTask)},
        scope:'Local tab diagnostics; active frame gaps exclude menus, reading, and transition frames. Not field Core Web Vitals.'};
    },
    disconnect() {for(const handle of subscriptions)handle.disconnect();}
  };
}
