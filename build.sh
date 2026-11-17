#!/bin/bash
# Bundles the land cover data and the map code into the one file that gets hosted.
cd "$(dirname "$0")"
cat ../lcdb-auckland.js src/nature-grid-map.js > nature-grid-embed.js
echo "Built nature-grid-embed.js ($(wc -c < nature-grid-embed.js | tr -d ' ') bytes)"
