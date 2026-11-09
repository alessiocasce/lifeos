#!/bin/sh
set -eu
# Run as root from the transferred, reviewed release directory. Does not touch ubuntu's PM2.
test "$(id -u)" = 0
test "$(uname -m)" = aarch64
base=/opt/lifeos-workout-push
id lifeos-push >/dev/null 2>&1 || useradd --system --home-dir /var/lib/lifeos-push --shell /usr/sbin/nologin lifeos-push
install -d -m 700 -o lifeos-push -g lifeos-push /var/lib/lifeos-push
install -d -m 755 "$base/node" "$base/app/scripts" "$base/app/ops/workout-push"
install -d -m 750 -o root -g lifeos-push /etc/lifeos-workout-push
if ! test -x "$base/node/bin/node"; then
  archive=$(mktemp /var/tmp/lifeos-node.XXXXXX)
  curl --fail --silent --show-error --proto '=https' --tlsv1.2 https://nodejs.org/dist/v24.22.2/node-v24.22.2-linux-arm64.tar.xz -o "$archive"
  printf '%s  %s\n' eb187837a2230d4047161ac0be008584e16b46f726e9c9490ee35dc6b17d9ba8 "$archive" | sha256sum -c -
  tar -xJf "$archive" -C "$base/node" --strip-components=1
fi
"$base/node/bin/node" --version
install -m 644 scripts/workout-push-worker.js "$base/app/scripts/"
install -m 644 package.json "$base/app/"
install -m 644 ops/workout-push/ecosystem.config.cjs ops/workout-push/healthcheck.mjs "$base/app/ops/workout-push/"
install -m 644 ops/workout-push/pm2-lifeos-push.service ops/workout-push/lifeos-push-health.service ops/workout-push/lifeos-push-health.timer /etc/systemd/system/
install -m 644 ops/workout-push/logrotate.conf /etc/logrotate.d/lifeos-workout-push
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/pm2-lifeos-push.service /etc/systemd/system/lifeos-push-health.service /etc/systemd/system/lifeos-push-health.timer
logrotate --debug /etc/logrotate.d/lifeos-workout-push
printf 'Installed isolated runtime and units; worker not started.\n'
