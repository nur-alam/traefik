import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

function cleanupContainer(name) {
	try {
		execSync(`docker rm -f ${name}`, { stdio: 'ignore' });
	} catch (err) {
		// Container doesn't exist, that's fine
	}
}

function waitForMySQL(maxAttempts = 60) {
	console.log('Waiting for MySQL to be ready...');
	for (let i = 0; i < maxAttempts; i++) {
		try {
			execSync('docker exec prewarm_mysql mysql -u root -prootpass -e "SELECT 1;"', { stdio: 'ignore' });
			console.log('MySQL is ready!');
			return true;
		} catch (err) {
			if (i % 5 === 0) {
				console.log(`Still waiting... (attempt ${i + 1}/${maxAttempts})`);
			}
			execSync('sleep 2');
		}
	}
	throw new Error('MySQL failed to become ready');
}

function waitForContainer(name, maxAttempts = 30) {
	for (let i = 0; i < maxAttempts; i++) {
		try {
			execSync(`docker exec ${name} ls /var/www/html/wp-config.php`, { stdio: 'ignore' });
			return true;
		} catch (err) {
			execSync('sleep 2');
		}
	}
	throw new Error(`Container ${name} failed to become ready`);
}

export async function initPool() {
	console.log('Initializing pool of WordPress sites...');

	// Create backups directory if it doesn't exist
	mkdirSync('backups', { recursive: true });

	// Setup single MySQL container
	cleanupContainer('prewarm_mysql');
	console.log('Creating shared MySQL container...');
	execSync(`docker run -d --name prewarm_mysql \
		-e MYSQL_ROOT_PASSWORD=rootpass \
		mysql:8.0`);

	waitForMySQL();

	// Create databases for each site
	for (let i = 1; i <= 10; i++) {
		const dbName = `wordpress_${i}`;
		console.log(`Creating database ${dbName}...`);
		execSync(`docker exec prewarm_mysql mysql -u root -prootpass -e "CREATE DATABASE IF NOT EXISTS ${dbName};"`);
	}

	// Create WordPress containers
	for (let i = 1; i <= 2; i++) {
		console.log(`Creating site ${i}/10 ...`);

		const containerName = `prewarm_${i}`;
		const dbName = `wordpress_${i}`;
		const port = 9000 + i; // Maps to ports 9001-8010

		cleanupContainer(containerName);

		// Create WordPress container linked to shared MySQL
		execSync(`docker run -d --name ${containerName} \
			-p ${port}:80 \
			--link prewarm_mysql:mysql \
			-e WORDPRESS_DB_HOST=prewarm_mysql:3306 \
			-e WORDPRESS_DB_USER=root \
			-e WORDPRESS_DB_PASSWORD=rootpass \
			-e WORDPRESS_DB_NAME=${dbName} \
			wordpress:latest`);

		// Wait for WordPress to be ready
		console.log(`Waiting for WordPress ${i}...`);
		waitForContainer(containerName);

		// Install WP-CLI inside container
		console.log(`Installing WP-CLI in ${containerName}...`);
		execSync(`docker exec ${containerName} sh -c "curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp"`);

		// Run wp core install inside container
		execSync(`
			docker exec ${containerName} wp core install \
			--url=http://localhost:${port} \
			--title="Site ${i}" \
			--admin_user=admin \
			--admin_password=password \
			--admin_email=admin@example.com \
			--allow-root
		`);

		// Install plugins
		execSync(`
			docker exec ${containerName} wp plugin install classic-editor --activate --allow-root
		`);

		// Export dump for fast cloning
		execSync(`docker exec prewarm_mysql mysqldump -u root -prootpass ${dbName} > backups/site_${i}.sql`);

		console.log(`Site ${i} ready at http://localhost:${port}`);
	}

	console.log('All 10 sites prewarmed.');
}
