#!/bin/bash
# Start WordPress auto-install in background
/usr/local/bin/wp-auto-install.sh &

# Start WordPress normally
exec docker-entrypoint.sh apache2-foreground
