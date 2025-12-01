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

export async function initPool() {
	// Now create containers from the golden image
	for (let i = 1; i <= 2; i++) {
		console.log(`Creating site ${i}/10 from golden image...`);

		const containerName = `prewarm_${i}`;
		const dbName = `wordpress_${i}`;
		const port = 9000 + i;

		cleanupContainer(containerName);

		const GOLDEN_SQL = process.env.GOLDEN_SQL_PATH || 'backups/golden.sql';
		execSync(`docker exec -i prewarm_mysql mysql -u root -prootpass ${dbName} < ${GOLDEN_SQL}`);

		// Create container from golden image
		try { execSync('docker network create prewarm_net', { stdio: 'ignore' }); } catch (e) {}
		execSync(`docker run -d --name ${containerName} \
            --network prewarm_net \
            -p ${port}:80 \
            -e WORDPRESS_DB_HOST=prewarm_mysql \
            -e WORDPRESS_DB_PORT=3306 \
            -e WORDPRESS_DB_USER=root \
            -e WORDPRESS_DB_PASSWORD=rootpass \
            -e WORDPRESS_DB_NAME=${dbName} \
            wordpress-golden:latest`);

		// Wait for container to be ready
		waitForContainer(containerName);

		if (fs.existsSync('backups/uploads')) {
			execSync(`docker exec ${containerName} sh -c "mkdir -p /var/www/html/wp-content/uploads"`);
			execSync(`docker cp backups/uploads/. ${containerName}:/var/www/html/wp-content/uploads/`);
			execSync(`docker exec ${containerName} sh -c "chown -R www-data:www-data /var/www/html/wp-content/uploads"`);
		}

		// try { execSync(`docker exec ${containerName} wp plugin activate classic-editor --allow-root`); } catch (e) {}
		try { execSync(`docker exec ${containerName} wp plugin activate tutor --allow-root`); } catch (e) {}
		try { execSync(`docker exec ${containerName} wp plugin activate tutor-pro --allow-root`); } catch (e) {}
		// try { execSync(`docker exec ${containerName} wp plugin activate droip --allow-root`); } catch (e) {}
		try { execSync(`docker exec ${containerName} wp theme activate tutorbase --allow-root`); } catch (e) {}

		// need to change admin user & password
		execSync(`docker exec ${containerName} wp user update admin --user_pass="demo" --allow-root`);

		// Update site URL for this instance
		execSync(`docker exec ${containerName} wp option update home "http://localhost:${port}" --allow-root`);
		execSync(`docker exec ${containerName} wp option update siteurl "http://localhost:${port}" --allow-root`);

		console.log(`Site ${i} ready at http://localhost:${port}`);

		// store container info into pool.json with available array with containerName, siteUrl, adminUsername, adminPassword, dbName, dbPass, port etc
		const pool = JSON.parse(fs.readFileSync('pool.json', 'utf8'));
		pool.available.push({
			id: i,
			containerName,
			siteUrl: `http://localhost:${port}`,
			adminUsername: 'admin',
			adminPassword: 'demo',
			dbName,
			dbPass: 'rootpass',
			port
		});
		fs.writeFileSync('pool.json', JSON.stringify(pool, null, 2));
	}

	console.log('All 10 sites prewarmed.');
}
