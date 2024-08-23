#!/bin/sh

CONTAINER_NAME="listoor"

podman stop ${CONTAINER_NAME} > /dev/null 2>&1
podman rm -f ${CONTAINER_NAME} > /dev/null 2>&1

echo "Starting ${CONTAINER_NAME}..."
podman run -d \
  --name ${CONTAINER_NAME} \
  --env-file .env \
  -v $(pwd)/data/collections.json:/app/data/collections.json \
  listoor:latest
