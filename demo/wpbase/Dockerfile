FROM wordpress:latest

# Copy the pre-installer mu plugin
# COPY mu-plugins/pre-install.php /var/www/html/wp-content/mu-plugins/

# Install unzip utility, WP-CLI, and mysql-client
RUN apt-get update && apt-get install -y unzip curl default-mysql-client && rm -rf /var/lib/apt/lists/* && \
    curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && \
    chmod +x wp-cli.phar && \
    mv wp-cli.phar /usr/local/bin/wp

# Optional: pre-install plugins
RUN set -ex; \
	cd /var/www/html/wp-content/plugins; \
	curl -LO https://downloads.wordpress.org/plugin/tutor.3.9.1.zip; \
	unzip -q tutor.3.9.1.zip; \
	rm *.zip; \
	chown -R www-data:www-data /var/www/html;

# Create WordPress auto-install and plugin activation script
RUN echo '#!/bin/bash\n\
# Wait for database to be ready\n\
echo "Waiting for database connection..."\n\
while ! mysqladmin ping -h"$WORDPRESS_DB_HOST" --silent 2>/dev/null; do\n\
    sleep 1\n\
done\n\
\n\
# Wait for WordPress files to be ready\n\
while [ ! -f /var/www/html/wp-config.php ]; do\n\
    echo "Waiting for WordPress files..."\n\
    sleep 2\n\
done\n\
\n\
# Check if WordPress is already installed\n\
if ! wp core is-installed --allow-root --path=/var/www/html 2>/dev/null; then\n\
    echo "Installing WordPress..."\n\
    wp core install \\\n\
        --url="$WP_SITE_URL" \\\n\
        --title="$WP_SITE_TITLE" \\\n\
        --admin_user="$WP_ADMIN_USER" \\\n\
        --admin_password="$WP_ADMIN_PASS" \\\n\
        --admin_email="$WP_ADMIN_EMAIL" \\\n\
        --skip-email \\\n\
        --allow-root \\\n\
        --path=/var/www/html\n\
    echo "WordPress installed successfully!"\n\
else\n\
    echo "WordPress already installed"\n\
fi\n\
\n\
# Activate plugins\n\
echo "Activating Tutor plugin..."\n\
wp plugin activate tutor --allow-root --path=/var/www/html 2>/dev/null || echo "Plugin activation will retry"\n\
' > /usr/local/bin/activate-plugins.sh && \
chmod +x /usr/local/bin/activate-plugins.sh

# Create custom entrypoint wrapper
RUN echo '#!/bin/bash\n\
# Start the plugin activation script in background\n\
/usr/local/bin/activate-plugins.sh &\n\
\n\
# Start WordPress normally\n\
exec docker-entrypoint.sh apache2-foreground\n\
' > /usr/local/bin/custom-entrypoint.sh && \
chmod +x /usr/local/bin/custom-entrypoint.sh

# Use our custom entrypoint
ENTRYPOINT ["/usr/local/bin/custom-entrypoint.sh"]
