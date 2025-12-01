#!/bin/bash
# Helper script to check if WordPress is installed and ready

CONTAINER_NAME=$1

if [ -z "$CONTAINER_NAME" ]; then
    echo "Usage: ./check-wp-ready.sh <container_name>"
    exit 1
fi

echo "Checking WordPress installation status in container: $CONTAINER_NAME"

docker exec $CONTAINER_NAME wp core is-installed --allow-root --path=/var/www/html

if [ $? -eq 0 ]; then
    echo "✅ WordPress is installed and ready!"
    docker exec $CONTAINER_NAME wp plugin list --allow-root --path=/var/www/html
else
    echo "❌ WordPress is not yet installed"
    exit 1
fi
