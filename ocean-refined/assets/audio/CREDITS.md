# Sound recordings

`source/` holds the recordings as supplied; `clips/` holds the cuts the site plays, made by `tools/prepare-audio.mjs`
(`npm run prepare:audio` from the repository root, with ffmpeg installed). Only `clips/` ships in the build. The engine
that plays them is `ambient-audio.js`; each clip replaces a synthesised sound once it has loaded, and the synthesis
plays in its place until then or if it cannot load.

The file names follow Pixabay's download naming (`author-title-id.mp3`), so these are taken to be from Pixabay under
the [Pixabay Content License](https://pixabay.com/service/license-summary/): free to use, including commercially,
with no attribution required. Credit is kept here regardless. **To confirm:** that each file was downloaded from Pixabay
(search the ID there to find its page).

| Source file | Author (Pixabay) | ID | Used as | Clips |
| --- | --- | ---: | --- | --- |
| `freesound_community-underwater-scuba-diver-28467.mp3` | freesound_community | 28467 | The diver's breathing | `breath0`–`breath6` |
| `dragon-studio-underwater-ambience-376890.mp3` | Dragon Studio | 376890 | The sea bed under the water | `sea` |
| `dragon-studio-dolphin-clicking-487655.mp3` | Dragon Studio | 487655 | Dolphin and orca clicks | `clicks0`, `clicks1` |
| `dragon-studio-dolphin-chittering-487654.mp3` | Dragon Studio | 487654 | Dolphin chatter | `chitter` |
| `dragon-studio-whale-song-382729.mp3` | Dragon Studio | 382729 | Whale calls, passing and far | `whale0` |
| `dragon-studio-humpback-whale-382727.mp3` | Dragon Studio | 382727 | Whale calls, passing and far | `whale1` |
| `universfield-loud-thunder-192165.mp3` | Universfield | 192165 | Thunder | `thunder0` |
| `soundreality-thunder-sound-375727.mp3` | SoundReality | 375727 | Thunder | `thunder1` |

## Changes made

- **Breathing:** cut into seven whole breath cycles (4.5–8.9 s), each from just before one inhale to just before the
  next. The cycles share one gain, so their natural differences in strength are kept.
- **Dolphin clicking:** split at its silent gap into two click trains, normalised to -4 dBFS. Their sharp peaks
  overshoot once encoded.
- **Humpback whale:** raised 21 dB to match the whale song.
- **Thunder:** low-passed at 9 kHz to remove a faint whine near 14 kHz.
  - The storm recording has rain under it from 10 s, so only its dry first clap (5.5–9.6 s) is used.
- **Ambience:** trimmed to 0.75–19.75 s, where its level is steady. The engine folds its last second under its first
  to make a seamless loop.
- **All clips:**
  - folded to mono, except the ambience;
  - faded at both ends;
  - peak-normalised to -1 dBFS unless noted above;
  - encoded as MP3 (breaths 64 kb/s, ambience 112 kb/s, the rest 96 kb/s).
- **Size:** 15 clips, 838 KB, from 3.9 MB of sources.
