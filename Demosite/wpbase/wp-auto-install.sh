#!/bin/bash
set -e

echo "🔄 Starting WordPress auto-installer..."

# Wait for WordPress files to be ready (wp-config.php is created by entrypoint)
echo "⏳ Waiting for WordPress files..."
MAX_WAIT=30
COUNTER=0
until [ -f /var/www/html/wp-config.php ] || [ $COUNTER -gt $MAX_WAIT ]; do
    sleep 0.2
    COUNTER=$((COUNTER+1))
done

if [ ! -f /var/www/html/wp-config.php ]; then
    echo "❌ WordPress files not ready after ${MAX_WAIT}s"
    exit 1
fi

echo "✅ WordPress files ready!"

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
# Extract host without port
DB_HOST_ONLY=$(echo "$WORDPRESS_DB_HOST" | cut -d: -f1)
MAX_DB_WAIT=15
DB_COUNTER=0
until mysql -h"$DB_HOST_ONLY" -u"$WORDPRESS_DB_USER" -p"$WORDPRESS_DB_PASSWORD" --skip-ssl -e "SELECT 1" >/dev/null 2>&1 || [ $DB_COUNTER -gt $MAX_DB_WAIT ]; do
    sleep 0.5
    DB_COUNTER=$((DB_COUNTER+1))
done

if ! mysql -h"$DB_HOST_ONLY" -u"$WORDPRESS_DB_USER" -p"$WORDPRESS_DB_PASSWORD" --skip-ssl -e "SELECT 1" >/dev/null 2>&1; then
    echo "❌ Database not ready after ${MAX_DB_WAIT}s"
    exit 1
fi

echo "✅ Database is ready!"

# Check if WordPress is already installed
if ! wp core is-installed --allow-root --path=/var/www/html 2>/dev/null; then
    echo "🚀 Installing WordPress..."
    
    # Install WordPress
    wp core install \
        --url="${WP_SITE_URL:-http://localhost}" \
        --title="${WP_SITE_TITLE:-Demo Site}" \
        --admin_user="${WP_ADMIN_USER:-admin}" \
        --admin_password="${WP_ADMIN_PASS:-admin}" \
        --admin_email="${WP_ADMIN_EMAIL:-admin@example.com}" \
        --skip-email \
        --allow-root \
        --path=/var/www/html
    
    echo "✅ WordPress installed successfully!"
    
    # Copy auto-login plugin to mu-plugins
    mkdir -p /var/www/html/wp-content/mu-plugins
    cp /usr/local/share/auto-login.php /var/www/html/wp-content/mu-plugins/
    chown www-data:www-data /var/www/html/wp-content/mu-plugins/auto-login.php
    echo "✅ Auto-login plugin installed"
    
    # Activate plugins
    echo "🔌 Activating Tutor plugin..."
    wp plugin activate tutor --allow-root --path=/var/www/html 2>/dev/null && echo "✅ Plugin activated!" || echo "⚠️ Plugin activation failed"
    
    # Get auto-login token (no sleep needed, token is generated immediately)
    TOKEN=$(wp option get auto_login_token --allow-root --path=/var/www/html 2>/dev/null || echo "")
    if [ -n "$TOKEN" ]; then
        echo "AUTO_LOGIN_TOKEN=$TOKEN" > /var/www/html/auto-login-token.txt
        echo "✅ Auto-login token generated"
    fi
else
    echo "ℹ️ WordPress is already installed"
fi

echo "✅ Setup complete!"
