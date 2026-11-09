#!/bin/sh
# Mercurial server hook. Install in the server repo's .hg/hgrc:
#   [hooks]
#   pretxnchangegroup.agentic = /path/to/hg-pretxnchangegroup.sh
# Refuses incoming topics/bookmarks outside the binding's patterns. It runs on the server, so
# the package (npm i -g "agentic-sdlc@${AGENTIC_SDLC_VERSION:-next}") and the binding must be available there.
for ref in $(hg log -r "$HG_NODE:tip" --template '{topics} {bookmarks}\n' | tr ' ' '\n' | sort -u); do
  [ -n "$ref" ] || continue
  agentic-sdlc gate branch-names --ref "$ref" || exit 1
done
exit 0
