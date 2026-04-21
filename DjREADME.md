# OpenDeck Four

A single-file, open-source DJ workstation prototype in Python with a NiceGUI-style feel, built here as a Qt desktop app because real four-deck audio/video sync is more practical in native GUI code.

## Included
- Four decks.
- Load your own audio or video files.
- Play, pause, stop, seek +/- 5 seconds.
- Per-deck volume, trim, six-band EQ, and effect knobs.
- Master volume and crossfade.
- MIDI hook placeholder.

## Notes
- This is a starter architecture, not a finished production mixer.
- True low-latency synchronized audio/video scrubbing and controller mapping usually needs deeper DSP and transport code.
- You can extend this into a fully modular open-source project.
