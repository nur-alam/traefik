FROM wordpress:latest

# Copy the auto-login mu-plugin
# COPY mu-plugins/auto-login.php /usr/local/share/auto-login.php

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

RUN set -ex; \
	cd /var/www/html/wp-content/plugins; \
	curl -LO https://downloads.wordpress.org/plugin/versatile-toolkit.1.0.4.zip; \
	unzip -q versatile-toolkit.1.0.4.zip; \
	rm *.zip; \
	chown -R www-data:www-data /var/www/html;

# Copy WordPress auto-install script
COPY wp-installer.sh /usr/local/bin/wp-installer.sh
RUN chmod +x /usr/local/bin/wp-installer.sh

# Copy custom entrypoint wrapper
COPY custom-entrypoint.sh /usr/local/bin/custom-entrypoint.sh
RUN chmod +x /usr/local/bin/custom-entrypoint.sh

# Use our custom entrypoint
ENTRYPOINT ["/usr/local/bin/custom-entrypoint.sh"]