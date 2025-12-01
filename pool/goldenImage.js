import { execSync } from 'node:child_process';
import fs, { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

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

export async function initGoldenImage() {
	console.log('Initializing pool of WordPress sites...');

	// Create backups directory if it doesn't exist
	mkdirSync('backups', { recursive: true });

	// Setup single MySQL container
	cleanupContainer('prewarm_mysql');
	console.log('Creating shared MySQL container...');
	try { execSync('docker network create prewarm_net', { stdio: 'ignore' }); } catch (e) {}
	execSync(`docker run -d --name prewarm_mysql \
		--network prewarm_net \
		-e MYSQL_ROOT_PASSWORD=rootpass \
		mysql:8.0`, { stdio: 'inherit' });

	waitForMySQL();

	// Create databases for each site
	for (let i = 1; i <= 2; i++) {
		const dbName = `wordpress_${i}`;
		console.log(`Creating database ${dbName}...`);
		execSync(`docker exec prewarm_mysql mysql -u root -prootpass -e "CREATE DATABASE IF NOT EXISTS ${dbName};"`);
	}

	// Create golden container with WP-CLI and plugins
	console.log('Creating golden WordPress container...');
	const wpImage = 'wordpress:latest';
	// Check if image exists, if not try to pull with better error handling
	let imageExists = false;
	try { 
		execSync(`docker image inspect ${wpImage}`, { stdio: 'ignore' });
		console.log('WordPress image already exists locally');
		imageExists = true;
	} catch (e) { 
		console.log(`WordPress image not found locally. Attempting to pull ${wpImage}...`);
		console.log('Note: If this hangs, you may need to restart Docker or pull the image manually.');
		console.log('Manual command: docker pull wordpress:latest');
		try {
			// Try pulling with a more aggressive approach
			execSync(`docker pull ${wpImage}`, { 
				stdio: 'inherit',
				timeout: 180000, // 3 minute timeout
				killSignal: 'SIGKILL'
			});
			console.log('Pull complete!');
			imageExists = true;
		} catch (pullError) {
			console.error('Failed to pull WordPress image. Please run manually: docker pull wordpress:latest');
			throw new Error('Docker pull failed or timed out');
		}
	}
	
	if (!imageExists) {
		throw new Error('WordPress image not available');
	}
	const goldenContainer = 'prewarm_golden';
	const goldenDb = 'wordpress_golden';
	execSync(`docker exec prewarm_mysql mysql -u root -prootpass -e "CREATE DATABASE IF NOT EXISTS ${goldenDb};"`);
	
	cleanupContainer(goldenContainer);

	// Create golden WordPress container
	execSync(`docker run -d --name ${goldenContainer} \
        --network prewarm_net \
        -p 9009:80 \
        -e WORDPRESS_DB_HOST=prewarm_mysql \
        -e WORDPRESS_DB_PORT=3306 \
        -e WORDPRESS_DB_USER=root \
        -e WORDPRESS_DB_PASSWORD=rootpass \
        -e WORDPRESS_DB_NAME=${goldenDb} \
        ${wpImage}`, { stdio: 'inherit' });

	console.log('Waiting for golden WordPress...');
	waitForContainer(goldenContainer);

	// Install WP-CLI
	console.log('Installing WP-CLI...');
	execSync(`docker exec ${goldenContainer} sh -c "curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp"`);

	// Install WordPress
	execSync(`docker exec ${goldenContainer} wp core install \
		--url=http://localhost:9009 \
		--title="Golden Site" \
		--admin_user=admin \
		--admin_password=password \
		--admin_email=admin@example.com \
		--allow-root`);

	// Install plugins
	console.log('Installing plugins...');
	execSync(`docker exec ${goldenContainer} sh -c "apt-get update && apt-get install -y unzip"`);
	execSync(`docker exec ${goldenContainer} sh -c "mkdir -p /usr/src/wordpress/wp-content/plugins"`);
	execSync(`docker cp backups/droip-2.5.0.zip ${goldenContainer}:/tmp/droip-2.5.0.zip`);
	execSync(`docker exec ${goldenContainer} sh -c "unzip -q /tmp/droip-2.5.0.zip -d /usr/src/wordpress/wp-content/plugins"`);
	execSync(`docker cp backups/tutor-3.9.2.zip ${goldenContainer}:/tmp/tutor-3.9.2.zip`);
	execSync(`docker exec ${goldenContainer} sh -c "unzip -q /tmp/tutor-3.9.2.zip -d /usr/src/wordpress/wp-content/plugins"`);
	if (fs.existsSync('backups/tutor-pro-3.9.2.zip')) {
		execSync(`docker cp backups/tutor-pro-3.9.2.zip ${goldenContainer}:/tmp/tutor-pro-3.9.2.zip`);
		execSync(`docker exec ${goldenContainer} sh -c "unzip -q /tmp/tutor-pro-3.9.2.zip -d /usr/src/wordpress/wp-content/plugins"`);
	} else {
		execSync(`docker cp backups/tutor-pro-3.9.2 ${goldenContainer}:/usr/src/wordpress/wp-content/plugins/tutor-pro`);
	}

	execSync(`docker exec ${goldenContainer} sh -c "mkdir -p /usr/src/wordpress/wp-content/themes"`);
	execSync(`docker cp backups/tutorbase-1.0.1.zip ${goldenContainer}:/tmp/tutorbase-1.0.1.zip`);
	execSync(`docker exec ${goldenContainer} sh -c "unzip -q /tmp/tutorbase-1.0.1.zip -d /usr/src/wordpress/wp-content/themes"`);
	execSync(`docker exec ${goldenContainer} sh -c "if [ -d /usr/src/wordpress/wp-content/themes/tutorbase-1.0.1 ]; then mv /usr/src/wordpress/wp-content/themes/tutorbase-1.0.1 /usr/src/wordpress/wp-content/themes/tutorbase; fi"`);

	if (fs.existsSync('backups/uploads')) {
		execSync(`docker exec ${goldenContainer} sh -c "mkdir -p /usr/src/wordpress/wp-content/uploads"`);
		execSync(`docker cp backups/uploads/. ${goldenContainer}:/usr/src/wordpress/wp-content/uploads/`);
		execSync(`docker exec ${goldenContainer} sh -c "chown -R www-data:www-data /usr/src/wordpress/wp-content/uploads"`);
	}

	// Stop the golden container
	execSync(`docker stop ${goldenContainer}`);

	// Commit the golden container to an image
	console.log('Creating golden image...');
	execSync(`docker commit ${goldenContainer} wordpress-golden:latest`);

	// Remove golden container
	execSync(`docker rm ${goldenContainer}`);

	// const GOLDEN_SQL = process.env.GOLDEN_SQL_PATH || 'backups/golden.sql';
	// if (!process.env.GOLDEN_SQL_PATH) {
	// 	execSync(`docker exec prewarm_mysql mysqldump -u root -prootpass ${goldenDb} > ${GOLDEN_SQL}`);
	// }

	console.log('Golden image created successfully!');
}

(async () => {
	console.log('Golden image worker started...');

	try {
		await initGoldenImage(); // Creates 10 pre-warmed WP containers
		console.log('Golden image worker finished.');
	} catch (err) {
		console.error('Golden image worker error:', err);
	}
})();
