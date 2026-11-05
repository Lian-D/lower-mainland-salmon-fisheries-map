#!/usr/bin/env bash
# Build and (re)start the salmon map with Docker Compose.
# Safe to run again after pulling a newer version: your .env and the data volume are kept.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

# docker (with sudo if this user isn't in the docker group)
DOCKER="docker"
command -v docker >/dev/null || die "Docker isn't installed. Install it first: https://docs.docker.com/engine/install/"
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null && sudo docker info >/dev/null 2>&1; then DOCKER="sudo docker"; else die "Can't talk to the Docker daemon. Is it running, and is $USER in the docker group?"; fi
fi
$DOCKER compose version >/dev/null 2>&1 || die "The Docker Compose plugin is missing (docker compose). Install docker-compose-plugin."

# first run: create .env with a free port and a refresh token
if [ ! -f .env ]; then
  port=3080
  if command -v ss >/dev/null; then
    while ss -ltnH "sport = :$port" | grep -q .; do port=$((port + 1)); done
  fi
  token=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  printf 'SALMON_PORT=%s\nREFRESH_TOKEN=%s\n' "$port" "$token" > .env
  chmod 600 .env
  say "Created .env (port $port, refresh token saved there)"
fi
# older installs (or a hand-made .env) may lack a token; the forced pull below needs one
if ! grep -q '^REFRESH_TOKEN=.\+' .env; then
  sed -i '/^REFRESH_TOKEN=/d' .env
  [ -s .env ] && [ -n "$(tail -c1 .env)" ] && echo >> .env
  echo "REFRESH_TOKEN=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')" >> .env
  say "Added a refresh token to .env"
fi
set -a; . ./.env; set +a

say "Building and starting (first build takes a few minutes)…"
$DOCKER compose up -d --build --remove-orphans
$DOCKER image prune -f >/dev/null 2>&1 || true

say "Waiting for the app to report healthy…"
for _ in $(seq 1 60); do
  status=$($DOCKER inspect --format '{{.State.Health.Status}}' salmon-map 2>/dev/null || echo starting)
  [ "$status" = "healthy" ] && break
  [ "$status" = "unhealthy" ] && { $DOCKER compose logs --tail 40; die "Container is unhealthy (logs above)"; }
  sleep 3
done
[ "${status:-}" = "healthy" ] || say "Still starting. Check with: $DOCKER compose logs -f"

say "Forcing a fresh pull from DFO (Region 2 + Area 29)…"
PULL_JS='fetch("http://127.0.0.1:3000/api/refresh?what=regs",{method:"POST",headers:{Authorization:"Bearer "+process.env.REFRESH_TOKEN},signal:AbortSignal.timeout(300000)}).then(r=>r.text()).then(t=>console.log(t)).catch(e=>console.log(JSON.stringify({ok:false,error:String(e)})))'
out=$($DOCKER exec salmon-map node -e "$PULL_JS" 2>&1 || true)
if ! printf '%s' "$out" | grep -q '"ok":true'; then
  echo "    First try failed ($(printf '%s' "$out" | grep -o '"error":"[^"]*"' | head -1 | cut -d'"' -f4)); retrying in 15 s…"
  sleep 15
  out=$($DOCKER exec salmon-map node -e "$PULL_JS" 2>&1 || true)
fi
if printf '%s' "$out" | grep -q '"ok":true'; then
  modified=$(printf '%s' "$out" | grep -o '"modified":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
  waters=$(printf '%s' "$out" | grep -o '"waters":[0-9]*' | head -1 | cut -d: -f2 || true)
  status29=$(printf '%s' "$out" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
  echo "    Region 2: ${waters:-?} entries, DFO page dated ${modified:-?}"
  echo "    Area 29 (tidal Fraser): ${status29:-$(printf '%s' "$out" | grep -o '"error":"[^"]*"' | tail -1)}"
  nwarn=$(printf '%s' "$out" | grep -c 'Unrecognised\|Could not read\|No species' || true)
  [ "${nwarn:-0}" -gt 0 ] && echo "    Parser warnings: $nwarn (see: $DOCKER compose logs | grep warnings)"
  # show what was read from Area 29's Salmon tab
  $DOCKER exec salmon-map node -e 'fetch("http://127.0.0.1:3000/api/regulations").then(r=>r.json()).then(({area29:a})=>{console.log("      read from: "+(a.scope==="salmon-tab"?"Salmon tab":"whole page - Salmon tab not found")+(a.salmonUpdated?" (DFO updated "+a.salmonUpdated+")":""));for(const r of a.regs||[])console.log("      "+r.species.padEnd(8)+" "+r.areaText.padEnd(30)+" "+r.statusText.padEnd(14)+" limit "+r.limit.replace(/\s+/g," ").slice(0,40));const c=(a.restrictions||[]).filter(r=>r.closes).length;if(a.restrictions)console.log("      + "+a.restrictions.length+" restrictions ("+c+" closures)");for(const x of a.rows||[])console.log("      ["+x.kind+"] "+x.text.slice(0,140))})' 2>/dev/null || true
else
  echo "    Pull failed: $(printf '%s' "$out" | grep -o '"error":"[^"]*"' | head -1 | cut -d'"' -f4)"
  [ -n "$out" ] && echo "    Raw: $out"
  echo "    The app keeps working on its last good data and retries at the next daily check."
fi

say "Checking Area 29 subarea boundaries…"
SUBS_JS='fetch("http://127.0.0.1:3000/api/rivers",{cache:"no-store"}).then(r=>r.json()).then(g=>console.log(g.subareas?g.subareas.length:0))'
nsubs=$($DOCKER exec salmon-map node -e "$SUBS_JS" 2>/dev/null || echo 0)
if [ "${nsubs:-0}" -lt 5 ]; then
  $DOCKER exec salmon-map node -e 'fetch("http://127.0.0.1:3000/api/refresh?what=subareas",{method:"POST",headers:{Authorization:"Bearer "+process.env.REFRESH_TOKEN}}).then(r=>r.text()).then(t=>{})' >/dev/null 2>&1 || true
  nsubs=$($DOCKER exec salmon-map node -e "$SUBS_JS" 2>/dev/null || echo 0)
fi
if [ "${nsubs:-0}" -ge 5 ]; then echo "    $nsubs subareas on the map"; else echo "    Not downloaded yet (DFO map service). It retries every 30 min; see: $DOCKER compose logs | grep -i subarea"; fi

SHAPES_JS='fetch("http://127.0.0.1:3000/api/rivers",{cache:"no-store"}).then(r=>r.json()).then(g=>console.log(Object.keys(g.shapes||{}).length+" of "+Object.keys(g.sections||{}).length))'
shapes=$($DOCKER exec salmon-map node -e "$SHAPES_JS" 2>/dev/null || echo "?")
case "$shapes" in
  0\ of*|"?")
    say "Downloading river outlines from OpenStreetMap (one time, up to a few minutes)…"
    AREAS_JS='fetch("http://127.0.0.1:3000/api/refresh?what=areas",{method:"POST",headers:{Authorization:"Bearer "+process.env.REFRESH_TOKEN},signal:AbortSignal.timeout(900000)}).then(r=>r.text()).then(console.log).catch(e=>console.log(String(e)))'
    res=$($DOCKER exec salmon-map node -e "$AREAS_JS" 2>&1 || true)
    shapes=$($DOCKER exec salmon-map node -e "$SHAPES_JS" 2>/dev/null || echo "?")
    case "$shapes" in
      0\ of*|"?") echo "    Not downloaded ($res). Lines show meanwhile; it retries every 30 min. Logs: $DOCKER compose logs | grep -i outline" ;;
      *) echo "    River outlines matched for $shapes open stretches (zoom in to see them; the rest are creeks drawn as lines)" ;;
    esac ;;
  *) echo "    River outlines matched for $shapes open stretches (zoom in to see them; the rest are creeks drawn as lines)" ;;
esac

ip=$(hostname -I 2>/dev/null | awk '{print $1}')
say "Salmon map is up: http://${ip:-localhost}:${SALMON_PORT:-3080}"
echo "    River lines, outlines and Area 29 subareas download once; after that only the DFO pages are checked."
echo "    Daily check re-processes a page only when its DFO 'Date modified' changes."
echo "    Logs:            $DOCKER compose logs -f"
echo "    Force a pull again: bash deploy.sh   (or POST /api/refresh with the token in .env)"
