FROM wordpress:latest

# Copy the pre-installer mu plugin
# COPY mu-plugins/pre-install.php /var/www/html/wp-content/mu-plugins/

# Install unzip utility and WP-CLI
RUN apt-get update && apt-get install -y unzip curl && rm -rf /var/lib/apt/lists/* && \
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

# Create plugin activation script
RUN echo '#!/bin/bash\n\
# Wait for WordPress to be ready\n\
while ! wp core is-installed --allow-root --path=/var/www/html 2>/dev/null; do\n\
    echo "Waiting for WordPress installation..."\n\
    sleep 2\n\
done\n\
\n\
# Activate plugins\n\
echo "Activating Tutor plugin..."\n\
wp plugin activate tutor --allow-root --path=/var/www/html\n\
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
