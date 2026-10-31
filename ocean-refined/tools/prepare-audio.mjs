// Cuts the recordings in assets/audio/source/ into the clips ambient-audio.js plays, in assets/audio/clips/: each one
// trimmed, folded to mono where the engine places it itself, filtered where the source has a fault, faded at both ends
// so no cut clicks, peak-normalised to -1 dBFS (clicks to -4, as their sharp peaks overshoot once encoded; a group
// shares one gain, so the breaths keep their natural differences)
// and encoded as MP3, which every browser can decode. Needs ffmpeg on the PATH. Run it again after changing a cut.
//   node tools/prepare-audio.mjs        (from ocean-refined/)
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';

const SOURCE = 'assets/audio/source/', OUT = 'assets/audio/clips/';
const scuba = 'freesound_community-underwater-scuba-diver-28467.mp3', clicking = 'dragon-studio-dolphin-clicking-487655.mp3';
// The breathing recording is cut into whole cycles, each from just before one inhale to just before the next, so the
// water noise under the breaths never drops out when the engine joins them. Inhales start at these seconds.
const inhales = [0.16, 6.76, 15.7, 22.72, 28.16, 34.76, 39.24, 45.14], lead = .25;
// [name, source, from, to, { stereo, filter, fadeIn, fadeOut, group, peak, kbps }]
const CLIPS = [
  ...inhales.slice(0, -1).map((at, i) => [`breath${i}`, scuba, Math.max(0, at - lead), inhales[i + 1] - lead, { group: 'breath', fadeIn: i ? .05 : .02, fadeOut: .05, kbps: 64 }]),
  ['clicks0', clicking, 0, .97, { fadeOut: .02, peak: -4 }], ['clicks1', clicking, 1.1, 2.02, { fadeIn: .01, fadeOut: .02, peak: -4 }],
  ['chitter', 'dragon-studio-dolphin-chittering-487654.mp3', 0, .7, { fadeOut: .05 }],
  ['whale0', 'dragon-studio-whale-song-382729.mp3', 0, 3.19, { fadeOut: .1 }], ['whale1', 'dragon-studio-humpback-whale-382727.mp3', 0, 3.19, { fadeOut: .1 }],
  // The loud thunder carries a faint whine near 14 kHz; the storm recording has rain under it from 10 s, so only its dry first clap is used.
  ['thunder0', 'universfield-loud-thunder-192165.mp3', 0, 5.46, { filter: 'lowpass=f=9000', fadeOut: .4 }],
  ['thunder1', 'soundreality-thunder-sound-375727.mp3', 5.5, 9.6, { filter: 'lowpass=f=9000', fadeIn: .05, fadeOut: 1 }],
  // The ambience fades in and out at its ends; the engine folds the trimmed middle into a seamless loop.
  ['sea', 'dragon-studio-underwater-ambience-376890.mp3', .75, 19.75, { stereo: true, fadeIn: .02, fadeOut: .02, kbps: 112 }]
];

const ffmpeg = args => execFileSync('ffmpeg', ['-hide_banner', '-nostats', '-y', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const chain = ([, , from, to, o]) => [o.stereo ? 'aformat=channel_layouts=stereo' : 'aformat=channel_layouts=mono', o.filter, `afade=t=in:d=${o.fadeIn ?? .01}`, `afade=t=out:st=${(to - from - (o.fadeOut ?? .05)).toFixed(3)}:d=${o.fadeOut ?? .05}`].filter(Boolean).join(',');
// The loudest sample after the clip's own filters, from ffmpeg's volumedetect (which reports on stderr).
function measure(clip) {
  const [, file, from, to] = clip;
  const result = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -ss ${from} -to ${to} -i "${SOURCE + file}" -af "${chain(clip)},volumedetect" -f null - 2>&1`], { encoding: 'utf8' });
  return Number(/max_volume: (-?[\d.]+) dB/.exec(result)[1]);
}

rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const loudest = {};
for (const clip of CLIPS) { const key = clip[4].group ?? clip[0]; loudest[key] = Math.max(loudest[key] ?? -Infinity, measure(clip)); }
let total = 0;
for (const clip of CLIPS) {
  const [name, file, from, to, o] = clip, gain = (o.peak ?? -1) - loudest[o.group ?? name];
  ffmpeg(['-ss', String(from), '-to', String(to), '-i', SOURCE + file, '-af', `${chain(clip)},volume=${gain.toFixed(2)}dB`, '-c:a', 'libmp3lame', '-b:a', `${o.kbps ?? 96}k`, OUT + name + '.mp3']);
  const size = statSync(OUT + name + '.mp3').size; total += size;
  console.log(`${name.padEnd(9)} ${(to - from).toFixed(2).padStart(6)} s  ${(gain >= 0 ? '+' : '') + gain.toFixed(1)} dB  ${(size / 1024).toFixed(0).padStart(4)} KB`);
}
console.log(`${CLIPS.length} clips, ${(total / 1024).toFixed(0)} KB`);
