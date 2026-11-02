// Static SVG counterpart of AuroraFooter; shared ocean tokens follow day/night.
export function auroraFooter(){
  const heights=[290,400,480,530,584,530,480,400,290];
  const colors=['var(--o-abyss)','var(--o-twilight)','var(--o-sunlit)','var(--o-sunlit-2)','var(--o-world)','var(--o-engage)','var(--o-surface-2)','var(--o-surface-0)'];
  const offsets=[0,.182709,.283673,.413484,.586565,.682722,.802892,1];
  return `<div class="reading-aurora" aria-hidden="true"><svg viewBox="0 0 1567 584" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><filter id="footer-aurora-blur" x="-30" y="-30" width="1627" height="644" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="15"/></filter>${heights.map((height,i)=>`<linearGradient id="footer-aurora-${i}" x1="0" y1="584" x2="0" y2="${584-height}" gradientUnits="userSpaceOnUse">${colors.map((color,j)=>`<stop offset="${offsets[j]}" stop-color="${color}" stop-opacity="${j===7?0:1}"/>`).join('')}</linearGradient>`).join('')}</defs><g filter="url(#footer-aurora-blur)">${heights.map((height,i)=>`<path d="M${i*174} 584h${i===8?175:174}V${584-height}H${i*174}Z" fill="url(#footer-aurora-${i})"/>`).join('')}</g></svg></div>`;
}
