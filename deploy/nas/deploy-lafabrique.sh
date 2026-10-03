#!/bin/bash
# La Fabrique on the Synology NAS — DSM › Planificateur de tâches › Script défini par
# l'utilisateur, utilisateur **root**, "ne pas répéter", then "Exécuter" once.
# Procedure and reverse proxy: docs/tech/03-deploiement.md.

IMAGE="ghcr.io/guillaumebarbier/lafabrique:latest"
CONTAINER="lafabrique"
PORT_HOST=3020                         # 3000 is To Do Love's
DATA="/volume1/docker/lafabrique"      # SQLite + illustrations + fonts: back this folder up
SETUP_TOKEN=""                         # optional code for the first account; empty it afterwards

# The image runs as uid 1001: give it the data folder.
mkdir -p "$DATA"
chown -R 1001:1001 "$DATA"

docker pull "$IMAGE"
docker stop "$CONTAINER" 2>/dev/null || true
docker rm "$CONTAINER" 2>/dev/null || true
docker run -d --name "$CONTAINER" \
  --restart unless-stopped \
  -p ${PORT_HOST}:3000 \
  -v "$DATA":/data \
  -e APP_URL=https://lafabrique.guillaume-barbier.com \
  -e SETUP_TOKEN="$SETUP_TOKEN" \
  "$IMAGE"

# Watchtower watches containers by name. KEEP every app already listed (To Do Love…),
# or it stops updating them. Check first: docker inspect watchtower --format '{{.Args}}'
WATCHED="to-do-love lafabrique"
docker stop watchtower 2>/dev/null || true
docker rm watchtower 2>/dev/null || true
docker run -d --name watchtower \
  --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower \
  --interval 300 --cleanup \
  $WATCHED

docker ps --filter name=lafabrique --filter name=watchtower
