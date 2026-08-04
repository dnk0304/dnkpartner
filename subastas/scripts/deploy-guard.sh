#!/bin/sh
# dnksubastas deploy guard — standing deploy rules (Ken, 2026-08-04)
#
# INSTALLED ON THE BOX AT /data/dnksubastas-deploy/deploy-guard.sh
# This file is the source of truth; the box copy is a deployment of it. It was
# box-only until 2026-08-04 — that was a gap, nothing should be box-only.
#
#   acquire <actor>              take the deploy lock (never proceeds if held)
#   release <actor>              release the lock
#   pulse-safe                   exit 0 only when NO pulse is in flight
#   preflight <actor>            pulse-safe + box-vs-origin sanity + acquire
#   preflight-app <actor> <svc…> app-only deploys: PROVES the scheduler is not
#                                in the target set, then box sanity + acquire.
#                                Skips the pulse gate — and ONLY because the
#                                proof holds.
#   verify-app                   after an app-only deploy: proves every
#                                protected container is byte-identical to the
#                                pre-state preflight-app recorded.
LOCK=/data/dnksubastas-deploy/.deploy.lock
PRESTATE=/data/dnksubastas-deploy/.protected-prestate
REPO=/data/dnksubastas-deploy/repo
DEPLOY_DIR=/data/dnksubastas-deploy
SELF=/data/dnksubastas-deploy/deploy-guard.sh
LOG=/data/dnksubastas-deploy/scheduler-logs/scheduler_$(date +%Y%m%d).log

pulse_safe() {
    last=$(grep -n -e 'Running pulse mode' -e 'Pulse targeting' -e 'Pulse complete' \
                   -e 'Pulse finished' -e 'DNKSUBASTAS SCHEDULER STARTED' "$LOG" 2>/dev/null | tail -1)
    case "$last" in
        *'Pulse targeting'*|*'Running pulse mode'*)
            echo "PULSE IN FLIGHT -> $last"
            echo "DO NOT RECREATE THE SCHEDULER — a recreate kills the run mid-flight."
            return 1 ;;
        *)
            echo "no pulse in flight (last lifecycle line: ${last:-none}) — safe to recreate"
            return 0 ;;
    esac
}

box_sane() {
    cd "$REPO" || return 1
    git fetch origin -q
    ab=$(git rev-list --left-right --count HEAD...origin/dnksubastas)
    dirty=$(git status --porcelain | head -1)
    echo "box vs origin (ahead behind): $ab"
    if [ "$ab" != "0	0" ]; then
        echo "STOP: box has diverged from origin — report, do not reconcile unilaterally."; return 1
    fi
    if [ -n "$dirty" ]; then
        echo "STOP: box working tree is dirty ($dirty) — report, do not reconcile unilaterally."; return 1
    fi
    echo "box clean and in sync with origin"
    return 0
}

# ---------------------------------------------------------------------------
# PROTECTED CONTAINERS — resolved STRUCTURALLY from the compose file.
#
# Ken's condition on preflight-app (2026-08-04): the guard "may NOT trust an
# --app-only flag; check the property, don't believe the caller." So we never
# ask the caller what is safe. We read the deployment definition to learn which
# containers must not be touched, then we ask COMPOSE ITSELF what the requested
# command would do, and compare.
#
# A protected container is any compose service that carries the pulse — i.e.
# whose service name, container_name or image identifies it as a scheduler.
# Resolution failure is FATAL (fail closed): if we cannot tell which container
# is the scheduler, we cannot prove it is untouched, so we refuse.
# ---------------------------------------------------------------------------
protected_containers() {
    cd "$DEPLOY_DIR" || return 1
    docker compose config --format json 2>/dev/null | jq -r '
        .services | to_entries[]
        | select(
            (.key            | test("scheduler"; "i")) or
            ((.value.container_name // "") | test("scheduler"; "i")) or
            ((.value.image          // "") | test("scheduler"; "i"))
          )
        | (.value.container_name // .key)
    '
}

# Ask compose what the command would actually do. `--dry-run` performs no
# changes; the plan names every container in the target set.
planned_containers() {
    cd "$DEPLOY_DIR" || return 1
    # shellcheck disable=SC2068
    docker compose --dry-run up -d --no-deps $@ 2>&1 \
        | sed -n 's/^[[:space:]]*Container[[:space:]]\{1,\}\([^[:space:]]\{1,\}\).*/\1/p'
}

record_prestate() {
    : > "$PRESTATE"
    for ct in $(protected_containers); do
        line=$(docker inspect "$ct" --format '{{.Id}} {{.State.StartedAt}} {{.Config.Image}}' 2>/dev/null)
        [ -n "$line" ] && printf '%s %s\n' "$ct" "$line" >> "$PRESTATE"
    done
    echo "recorded protected pre-state ->"
    sed 's/^/    /' "$PRESTATE"
}

preflight_app() {
    actor=$1; shift
    if [ $# -eq 0 ]; then
        echo "STOP: preflight-app needs the service list you intend to deploy."
        echo "usage: deploy-guard.sh preflight-app <actor> <service> [service…]"
        return 1
    fi

    prot=$(protected_containers)
    if [ -z "$prot" ]; then
        echo "STOP: could not resolve the protected (scheduler) container from the compose file."
        echo "Refusing: an unprovable claim is not a proof. Use full preflight instead."
        return 1
    fi
    echo "protected containers (resolved from compose, not from the caller):"
    echo "$prot" | sed 's/^/    /'

    plan=$(planned_containers "$@")
    if [ -z "$plan" ]; then
        echo "STOP: compose --dry-run produced no plan for: $*"
        echo "Refusing (fail closed) — cannot prove what the deploy would touch."
        return 1
    fi
    echo "compose --dry-run plan for 'up -d --no-deps $*':"
    echo "$plan" | sed 's/^/    /'

    # THE GATE: any protected container appearing in the plan means this is not
    # an app-only deploy, whatever the caller called it.
    for ct in $prot; do
        if echo "$plan" | grep -qx "$ct"; then
            echo "STOP: protected container '$ct' IS in the target set of this deploy."
            echo "This is NOT app-only. Use 'preflight <actor>' — the pulse gate applies."
            return 1
        fi
    done
    echo "PROVEN: no protected container is in the target set — pulse gate does not apply."

    box_sane || return 1
    sh "$SELF" acquire "${actor:-unknown}" || return 1
    record_prestate
    echo "PREFLIGHT-APP OK — cleared to deploy (app-only). Run 'verify-app' after."
    return 0
}

verify_app() {
    if [ ! -s "$PRESTATE" ]; then
        echo "STOP: no recorded pre-state — run preflight-app before the deploy."; return 1
    fi
    rc=0
    while read -r ct id started image; do
        now=$(docker inspect "$ct" --format '{{.Id}} {{.State.StartedAt}} {{.Config.Image}}' 2>/dev/null)
        if [ "$now" = "$id $started $image" ]; then
            echo "OK   $ct untouched (Id + StartedAt + image identical)"
        else
            echo "FAIL $ct CHANGED"
            echo "     pre : $id $started $image"
            echo "     post: ${now:-<container missing>}"
            rc=1
        fi
    done < "$PRESTATE"
    [ $rc -eq 0 ] && echo "VERIFY-APP OK — every protected container is byte-identical."
    return $rc
}

case "$1" in
    acquire)
        if [ -f "$LOCK" ]; then
            echo "DEPLOY LOCK HELD -> $(cat "$LOCK")"
            echo "ABORTING (never proceed on a held lock — wait or abort)."; exit 1
        fi
        printf 'actor=%s pid=%s acquired=%s\n' "${2:-unknown}" "$$" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$LOCK"
        echo "DEPLOY LOCK ACQUIRED -> $(cat "$LOCK")"; exit 0 ;;
    release)
        if [ -f "$LOCK" ]; then echo "RELEASING -> $(cat "$LOCK")"; rm -f "$LOCK"; else echo "no lock held"; fi
        exit 0 ;;
    pulse-safe)
        pulse_safe; exit $? ;;
    preflight)
        pulse_safe || exit 1
        box_sane   || exit 1
        sh "$SELF" acquire "${2:-unknown}" || exit 1
        echo "PREFLIGHT OK — cleared to deploy."; exit 0 ;;
    preflight-app)
        shift
        preflight_app "$@"; exit $? ;;
    verify-app)
        verify_app; exit $? ;;
    *)
        echo "usage: deploy-guard.sh {acquire <actor>|release <actor>|pulse-safe|preflight <actor>|preflight-app <actor> <service…>|verify-app}"; exit 2 ;;
esac
