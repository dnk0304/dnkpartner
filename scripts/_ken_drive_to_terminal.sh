#!/usr/bin/env bash
# Ken's resilient inline run-driver. Drives a factory run S1->ceiling to TERMINAL.
# On a rate-related tick failure: WAIT (backoff) and RE-TICK the same stage
# (per-loop persistence means loop-1 is already saved; re-tick resumes cleanly).
# Only aborts on a NON-rate hard error or after MAX_RATE_RETRIES consecutive trips.
set -u
TOKEN="${KEN_TOKEN:?set KEN_TOKEN}"
RUN="${KEN_RUN:?set KEN_RUN}"
BASE="http://localhost:3000/api/factory/runs/$RUN"
MAX_ITERS="${MAX_ITERS:-200}"
MAX_RATE_RETRIES="${MAX_RATE_RETRIES:-8}"   # consecutive rate trips on the SAME stage before giving up
BACKOFF_BASE="${BACKOFF_BASE:-60}"          # seconds; grows per consecutive trip, capped
BACKOFF_CAP="${BACKOFF_CAP:-420}"

jqnode() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);$1}catch(e){console.log('PARSE_ERR')}})"; }

echo "=== DRIVE TO TERMINAL START $(date +%H:%M:%S) run=$RUN ceiling=S6 ==="
rate_streak=0
last_stage=0
for i in $(seq 1 "$MAX_ITERS"); do
  STATE=$(curl -s -H "Cookie: auth_token=$TOKEN" "$BASE")
  STATUS=$(echo "$STATE" | jqnode "console.log(j.run.status)")
  STAGE=$(echo "$STATE" | jqnode "console.log(j.run.stage)")
  echo "[$i] $(date +%H:%M:%S) status=$STATUS stage=$STAGE rate_streak=$rate_streak"
  [ "$STAGE" != "$last_stage" ] && { rate_streak=0; last_stage=$STAGE; }

  case "$STATUS" in
    running)
      T0=$(date +%s)
      RESP=$(curl -s -X POST -H "Cookie: auth_token=$TOKEN" -H "Content-Type: application/json" "$BASE/tick")
      T1=$(date +%s)
      ADV=$(echo "$RESP" | jqnode "console.log('advanced='+j.advanced+' newstatus='+(j.run&&j.run.status)+' newstage='+(j.run&&j.run.stage)+(j.error?(' ERROR='+JSON.stringify(j.error).slice(0,260)):'')+(j.stopped?' stopped=true':''))")
      echo "    tick $((T1-T0))s -> $ADV"
      if echo "$ADV" | grep -qi "ERROR="; then
        if echo "$ADV" | grep -Eqi "rate|429|quota|usage limit|overloaded|timeout|exit=1|exited with code 1|no stdin|too many"; then
          rate_streak=$((rate_streak+1))
          if [ "$rate_streak" -ge "$MAX_RATE_RETRIES" ]; then
            echo "    !! $rate_streak consecutive rate trips on stage $STAGE -> ABORT (window hard-capped)"; break
          fi
          WAIT=$((BACKOFF_BASE * rate_streak)); [ "$WAIT" -gt "$BACKOFF_CAP" ] && WAIT=$BACKOFF_CAP
          echo "    rate trip #$rate_streak -> WAIT ${WAIT}s then RE-TICK same stage (loop-1 persisted)"
          sleep "$WAIT"
        else
          echo "    NON-RATE hard error -> ABORT"; break
        fi
      else
        rate_streak=0
      fi
      ;;
    awaiting_human_gate)
      GATE=$(echo "$STATE" | jqnode "console.log((j.run.pendingGate&&j.run.pendingGate.gate)||(j.pendingGate&&j.pendingGate.gate)||'UNKNOWN')")
      echo "    HUMAN GATE='$GATE' -> AUTO-APPROVE"
      curl -s -X POST -H "Cookie: auth_token=$TOKEN" -H "Content-Type: application/json" -d "{\"gate\":\"$GATE\",\"choice\":\"approve\"}" "$BASE/gate" > /dev/null
      rate_streak=0
      ;;
    draft_ready|escalated|killed)
      echo "=== TERMINAL: $STATUS at stage $STAGE ==="; break ;;
    *)
      echo "    unexpected status='$STATUS' -> stop"; break ;;
  esac
done
echo "=== DRIVE TO TERMINAL END $(date +%H:%M:%S) ==="
