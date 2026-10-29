// World metres, not displayed dive depths. Scenic viewpoints stay outside the
// solid formations; the runtime planner checks the complete rounded body route.
const scenic = (key, place, title, point, focus, via, lines, touchLines = lines) =>
  ({ key, place, kicker: place, title, point, focus, via, lines, short: lines, touchLines, scenic: true, signal: '#8ff4ff' });
export const STOPS = [
  { key: 'welcome', place: 'Welcome below', kicker: 'Guided dive · Welcome below', title: 'Welcome to my reef.',
    point: [0, -8, -4], focus: [8, -13, -26], signal: '#8ff4ff',
    lines: 'I’ll lead the swim; you can look around freely. Press C for your dive computer. Three lights mark About, Experience and Projects. Press N when you’re ready.',
    short: 'I’ll lead; look around freely. C opens your dive computer. N continues when you’re ready.',
    touchLines: 'I’ll lead the swim. Drag the water to look around. Open Settings for Dive computer, then tap Continue when you’re ready.' },
  { key: 'about', landmark: 'about', title: 'About me · The Anchor', place: 'About · The Anchor', kicker: 'About · The Anchor', signal: '#7ff0cf',
    lines: 'I’m Anshul. Welcome to the world I’ve made for you. The Anchor is where you can learn about me. Here’s my portfolio at a glance; take your time, then continue the dive.',
    short: 'I’m Anshul. The Anchor is where you can learn about me. Take a look, then continue the dive.',
    touchLines: 'I’m Anshul. The Anchor is where you can learn about me. Tap Read it whenever you want to return to the portfolio.' },
  scenic('cathedral', 'Pillar coral cathedral', 'A reef shaped like a horseshoe.', [40, -20, -30], [48, -20, -28],
    [[-21, -7, -24], [-13, -8, -28], [10, -10, -17], [33, -12, -18]],
    'A nurse shark rests on the sand near the Anchor. Ahead, coral pillars form a horseshoe. Try V to switch view; your look never changes our route.',
    'A nurse shark rests near the Anchor. Ahead, coral pillars form a horseshoe. Settings → View switches perspective; dragging never changes our route.'),
  scenic('bait-ball', 'Soft coral spire · Bait ball', 'A little room for everyone.', [42, -31, -73], [50, -32, -72],
    [[42, -24, -43], [44, -28, -56], [48, -31, -64], [48, -31, -69]],
    'We’re descending past the Soft Coral Spire and through the bait ball. Watch the silver fish part around us. H takes a photo in first person; V brings you back to that view.',
    'We’re passing the Soft Coral Spire and through the bait ball. Watch the silver fish part around us. Settings → View → Take a photo keeps a picture in first person.'),
  { key: 'experience', landmark: 'experience', title: 'Experience · The Wreck', place: 'Experience · The Wreck', kicker: 'Experience · The Wreck', signal: '#ffcf7a',
    via: [[33, -29, -61], [31, -23, -49]],
    lines: 'The wreck holds my experience: the roles, teams and work that brought me here. Press F to open it, or N to keep diving. Look for fish sheltering around the ship.',
    short: 'The wreck holds my experience. F opens it; N keeps us diving. Look for fish around the ship.',
    touchLines: 'The wreck holds my experience. Tap Read it to open it, or Continue to keep diving. Look for fish around the ship.' },
  scenic('deep', 'Below the wreck', 'Look back toward the light.', [-2, -36, -63], [12, -17, -32],
    [[28, -23, -47], [27, -32, -60], [16, -37, -68]],
    'Look up: the reef rises above us. Q toggles your flashlight here. Hold E for a scooter boost while we swim, or save it for your own exploration.',
    'Look up: the reef rises above us. Tap the lamp button for your flashlight. Hold the scooter button for a boost, or save it for your own exploration.'),
  { key: 'projects', landmark: 'projects', title: 'Projects · The Treasure', place: 'Projects · The Treasure', kicker: 'Projects · The Treasure', signal: '#c9a2ff',
    via: [[-4, -40, -76]],
    lines: 'The treasure marks my projects. Open it to explore what I’ve built and the thinking behind the work. Press F to read, or N for one last view of the reef.',
    short: 'The treasure marks my projects. F opens the work; N takes us to one last reef view.',
    touchLines: 'The treasure marks my projects. Tap Read it to explore the work, or Continue for one last reef view.' },
  scenic('overview', 'Reef overview', 'The reef is yours.', [-43, -16, -56], [0, -26, -49],
    [[-35, -38, -85], [-48, -28, -73], [-49, -20, -63]],
    'A last look across my reef. Keep exploring, or surface with an optional safety stop.')
];
export const SPEED = 3.6;
export const SCENIC_SECONDS = 3;
