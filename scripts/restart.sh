#!/bin/sh

podman-compose -p listoor-pod down
podman-compose -p listoor-pod up -d
