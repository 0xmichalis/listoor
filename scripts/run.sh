#!/bin/sh

podman run -d \
  --name listoor \
  --env-file .env \
  -v $(pwd)/data/collections.json:/app/data/collections.json \
  listoor:latest
