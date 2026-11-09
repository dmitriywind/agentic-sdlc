#!/bin/sh
# Perforce trigger. Install with `p4 triggers`, one line:
#   agentic-names change-submit //streams/... "/path/p4-change-submit.sh %changelist%"
# Refuses a submit to a stream outside the binding's patterns (trunk mainline, task and release streams).
# The server needs the package (npm i -g "agentic-sdlc@${AGENTIC_SDLC_VERSION:-next}") and the binding.
change="$1"
stream=$(p4 -ztag change -o "$change" | sed -n 's/^\.\.\. Stream //p')
[ -n "$stream" ] || exit 0
exec agentic-sdlc gate branch-names --ref "$stream"
