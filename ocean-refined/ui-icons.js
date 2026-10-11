const paths = {
  about:'<circle cx="12" cy="5" r="2"/><path d="M12 7v14M6 12H3c0 5 4 9 9 9s9-4 9-9h-3M8 10h8"/>',
  experience:'<path d="m3 14 3 7h12l3-7-9 2-9-2ZM12 3v13M12 4l7 7h-7M10 6l-5 6h5M2 22c2-2 4 2 6 0s4 2 6 0 4 2 8 0"/>',
  projects:'<path d="M4 9h16v12H4ZM4 9l3-5h10l3 5M3 9h18M10 9v5h4V9"/>',
  resume:'<path d="M6 3h9l4 4v14H6V3ZM14 3v5h5M9 12h7M9 16h7"/>',
  overview:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  approach:'<path d="M12 3 3 7v6c0 4 5 7 9 9 4-2 9-5 9-9V7l-9-4ZM8 12l3 3 5-6"/>',
  rae:'<path d="M4 4h16v12H9l-5 5V4ZM8 8h8M8 12h5"/>',
  wattmana:'<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',
  sage:'<path d="M12 21S2 15 2 8a5 5 0 0 1 10-1A5 5 0 0 1 22 8c0 7-10 13-10 13ZM5 12h4l2-4 3 8 2-4h3"/>',
  openclaw:'<path d="M8 3h8v5H8ZM3 16h6v5H3ZM15 16h6v5h-6ZM12 8v4M6 16v-4h12v4"/>',
  computer:'<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M7 2v3M17 2v3M7 19v3M17 19v3M6 10h4M6 14h7M16 9v6"/>',
  arrow:'<path d="M5 19 19 5M5 5h14v14"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
};
export function icon(name, className='hud-icon') {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('class',className);
  svg.innerHTML=paths[name === 'reengage' ? 'rae' : name] || paths.resume;return svg;
}
