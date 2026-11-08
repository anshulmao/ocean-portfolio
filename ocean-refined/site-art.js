// The line drawings of the sites and reef features, and a line about each feature: shared by the dive planner
// (dive-plan.js) and the dive log's chart (dive-summary.js).
const art = paths => `<svg viewBox="0 0 96 64" aria-hidden="true">${paths}<path class="art-floor" d="M6 59h84"/></svg>`;
export const ART = {
  about: art('<circle cx="48" cy="11" r="5"/><path d="M48 16v38M36 25h24M24 37c2 12 12 17 24 17s22-5 24-17M20 42l4-7 6 5M76 42l-4-7-6 5"/>'),
  experience: art('<path d="M8 38h62l16-9-7 25H19zM33 38V12M53 38V19M33 18h13M53 25h10M33 12l-12 22M22 46h2M34 46h2M46 46h2M58 46h2"/>'),
  projects: art('<path d="M12 35h32v20H12zM12 35c0-12 32-12 32 0M25 41h6v7h-6zM52 41h30v14H52zM52 41c0-10 30-10 30 0M64 45h6v5h-6zM66 10v10M61 15h10M82 22v6M79 25h6"/>'),
  'Table coral tower': art('<path d="M47 58c-3-18 5-33 2-50"/><ellipse cx="46" cy="46" rx="20" ry="3"/><ellipse cx="50" cy="35" rx="17" ry="2.6"/><ellipse cx="46" cy="25" rx="13" ry="2.3"/><ellipse cx="50" cy="15" rx="9" ry="2"/>'),
  'Brain coral dome': art('<path d="M14 50c0-42 68-42 68 0zM24 43c6-6 10 6 16 0s10 6 16 0 10 6 16 0M30 31c5-5 9 5 14 0s9 5 14 0 5 2 8 0M40 20c4-3 8 3 12 0M8 50h80M30 50v8M66 50v8"/>'),
  'Pillar coral cathedral': art('<path d="M14 58V34a4 4 0 0 1 8 0v24M26 58V22a4 4 0 0 1 8 0v36M39 58V10a5 5 0 0 1 10 0v48M54 58V16a4 4 0 0 1 8 0v42M66 58V28a4 4 0 0 1 8 0v30M78 58V40a3 3 0 0 1 6 0v18"/>'),
  'Kelp grove': art('<path d="M24 58c-7-12 7-18 0-30s6-14 1-22M48 58c7-13-7-19 0-32s-5-12 0-20M72 58c-6-11 6-17 0-28s5-13 1-20M24 40l8-4M24 22l-8-3M48 44l-8-4M48 26l8-4M72 42l8-3M72 24l-7-4"/>'),
  'Giant clam': art('<path d="M10 40c8-26 68-26 76 0M10 40c10 20 66 20 76 0M10 40q9.5 7 19 0t19 0 19 0 19 0M30 26l4 9M48 21v12M66 26l-4 9"/>'),
  'Soft coral spire': art('<path d="M38 58l5-50 9 7 7 43z"/><circle cx="34" cy="42" r="5"/><circle cx="60" cy="32" r="5"/><circle cx="36" cy="24" r="4"/><circle cx="62" cy="48" r="4"/>'),
  'Lantern garden': art('<path d="M20 58V42M38 58V30M56 58V38M74 58V46M38 14v-5M28 18l-4-3M48 18l4-3"/><circle cx="20" cy="36" r="6"/><circle cx="38" cy="23" r="7"/><circle cx="56" cy="32" r="6"/><circle cx="74" cy="41" r="5"/>'),
  'The arch': art('<path d="M12 58V32c0-30 72-30 72 0v26H68V36c0-14-40-14-40 0v22zM20 30l6 3M70 22l-5 4M46 12l2 6"/>')
};

export const SCENERY = {
  'Table coral tower': 'Plates of table coral spiral up a leaning stone trunk.',
  'Brain coral dome': 'A wide dome on a stone ledge, with a swim-through underneath.',
  'Pillar coral cathedral': 'Organ-pipe columns in a horseshoe, tallest at the back.',
  'Kelp grove': 'Kelp and sea whips. Nothing solid, so you can drift straight through.',
  'Giant clam': 'One enormous clam. Its shell breathes and the mantle glows.',
  'Soft coral spire': 'A rock spire dressed in soft coral.',
  'Lantern garden': 'Sea pens and glowing bulbs that light the deep shelf.',
  'The arch': 'A limestone arch over the drop-off, wide enough to swim straight through.'
};
