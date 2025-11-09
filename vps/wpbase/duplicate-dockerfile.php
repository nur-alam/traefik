FROM wordpress:latest

# Copy the pre-installer mu plugin
COPY mu-plugins/ /var/www/html/wp-content/mu-plugins/

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

# Create custom entrypoint wrapper
RUN echo '#!/bin/bash\n\
# Just use the standard WordPress entrypoint\n\
exec docker-entrypoint.sh apache2-foreground\n\
' > /usr/local/bin/custom-entrypoint.sh && \
chmod +x /usr/local/bin/custom-entrypoint.sh

# Use our custom entrypoint
ENTRYPOINT ["/usr/local/bin/custom-entrypoint.sh"]
