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
  // A wrist dive computer: case, two buttons on the side, strap, and a face with depth, time and an ascent bar.
  computer:'<rect x="4" y="6" width="15" height="12" rx="3"/><path d="M8 6V2.5h7V6M8 18v3.5h7V18M19 9.5h1.6M19 14.5h1.6M7.5 10h4.5M7.5 14h3M15.5 9.5v5"/>',
  arrow:'<path d="M5 19 19 5M5 5h14v14"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  // Dive gear and hand signals.
  tank:'<rect x="8" y="7" width="8" height="14" rx="3.2"/><path d="M10.5 7V4.5h3V7M12 4.5V2.5M9.5 2.5h5M8 12h8"/>',
  regulator:'<circle cx="10.5" cy="13" r="5.5"/><circle cx="10.5" cy="13" r="1.8"/><path d="M16 13h3.5v-2.5M14.6 9.2 18 3.5M5 13H2.5"/>',
  mask:'<path d="M4 8h16a2 2 0 0 1 2 2v3a4 4 0 0 1-4 4h-1.5L14 14h-4l-2.500 3H6a4 4 0 0 1-4-4v-3a2 2 0 0 1 2-2ZM12 8v3"/>',
  flag:'<path d="M4 6h16v12H4ZM4 9.500 15.500 18M8.500 6 20 14.500"/>',
  ok:'<circle cx="8.5" cy="14.5" r="3.6"/><path d="M11.300 12.200 13.500 3.500M12.100 14.800 17 6M11.500 17.300 20 10.500M6 17.300 3.500 21.500"/>',
  ascend:'<path d="M8 21H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3m0 10V11l3.5-7.5c1.6 0 2.5 1.2 2.5 2.600V10h4.600a1.900 1.900 0 0 1 1.900 2.300l-1.300 7a2 2 0 0 1-2 1.700H8Z"/>',
  descend:'<path d="M8 3H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3M8 3v10l3.500 7.500c1.600 0 2.500-1.200 2.500-2.600V14h4.600a1.900 1.900 0 0 0 1.900-2.300l-1.300-7A2 2 0 0 0 17.200 3H8Z"/>',
  level:'<path d="M3 11.500h13.500c1.800 0 3.300.700 4.500 2M3 11.500c0-1.200.800-2 2-2h9M5 15.500h9M2 19c2-1.600 4 1.600 6 0s4 1.600 6 0 4 1.600 8 0"/>',
};
export function icon(name, className='hud-icon') {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('class',className);
  svg.innerHTML=paths[name === 'reengage' ? 'rae' : name] || paths.resume;return svg;
}
