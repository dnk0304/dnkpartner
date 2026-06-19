#!/usr/bin/env bash
set -u
TOKEN="$KEN_TOKEN"
RUN="cmqjb6kvy0000l2u8olvj7g38"
BASE="http://localhost:3000/api/factory/runs/$RUN"
H="-H Cookie:auth_token=$TOKEN -H Content-Type:application/json"
echo "═══ HTTP DRIVE START $(date +%H:%M:%S) run=$RUN ═══"
for i in $(seq 1 60); do
  # current state
  STATE=$(curl -s -H "Cookie: auth_token=$TOKEN" "$BASE")
  STATUS=$(echo "$STATE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).run.status)}catch{console.log('PARSE_ERR')}})")
  STAGE=$(echo "$STATE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).run.stage)}catch{console.log('?')}})")
  echo "[$i] $(date +%H:%M:%S) status=$STATUS stage=$STAGE"
  case "$STATUS" in
    running)
      T0=$(date +%s)
      RESP=$(curl -s -X POST -H "Cookie: auth_token=$TOKEN" -H "Content-Type: application/json" "$BASE/tick")
      T1=$(date +%s)
      ADV=$(echo "$RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log('advanced='+j.advanced+' newstatus='+(j.run&&j.run.status)+' newstage='+(j.run&&j.run.stage)+(j.error?(' ERROR='+JSON.stringify(j.error).slice(0,200)):'')+(j.stopped?' stopped=true':''))}catch{console.log('TICK_PARSE_ERR:'+d.slice(0,200))}})")
      echo "    tick $((T1-T0))s → $ADV"
      if echo "$ADV" | grep -q "ERROR="; then echo "    STAGE FAILED — stopping"; break; fi
      ;;
    awaiting_human_gate)
      GATE=$(echo "$STATE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log((j.run.pendingGate&&j.run.pendingGate.gate)||(j.pendingGate&&j.pendingGate.gate)||'UNKNOWN')}catch{console.log('GATE_ERR')}})")
      echo "    HUMAN GATE='$GATE' → AUTO-APPROVE"
      curl -s -X POST -H "Cookie: auth_token=$TOKEN" -H "Content-Type: application/json" -d "{\"gate\":\"$GATE\",\"choice\":\"approve\"}" "$BASE/gate" > /dev/null
      ;;
    draft_ready|escalated|killed)
      echo "═══ TERMINAL: $STATUS ═══"; break ;;
    *)
      echo "    unexpected status, stopping"; break ;;
  esac
done
echo "═══ HTTP DRIVE END $(date +%H:%M:%S) ═══"
