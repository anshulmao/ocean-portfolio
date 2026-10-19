// Scales each fixed-size screen canvas to its container width.
const fit=screen=>{
  const canvas=screen.querySelector('.canvas');
  const w=+screen.dataset.w,h=+screen.dataset.h,s=screen.clientWidth/w;
  canvas.style.width=w+'px';canvas.style.height=h+'px';canvas.style.transform=`scale(${s})`;
  screen.style.height=h*s+'px';
};
const ro=new ResizeObserver(entries=>entries.forEach(e=>fit(e.target)));
document.querySelectorAll('.screen').forEach(s=>{fit(s);ro.observe(s)});
