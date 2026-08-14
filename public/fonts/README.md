# Fonts

Both self-hosted so the app has no CDN dependency and works if the wifi at the
draft is bad. Both are SIL Open Font License 1.1.

- **DSEG14 Classic** (`dseg14-*.woff2`) — 14-segment LCD face. Used for the OSD
  chrome only: status lamps, counters, timecode, panel labels. License in
  `DSEG-OFL.txt`. Source: https://github.com/keshikan/DSEG
- **Saira Condensed** (`saira-condensed-*.woff2`) — player names, headings, and
  tabular data. Latin subset from Google Fonts.
  Source: https://fonts.google.com/specimen/Saira+Condensed

Deliberate split: the segmented face is the viewfinder's voice, but a 14-segment
font is slow to read in bulk. Player names are the one thing James must read
instantly on the clock, so they get the condensed grotesque instead.
