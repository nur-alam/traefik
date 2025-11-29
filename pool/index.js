import express from 'express';
import { fork } from 'node:child_process';
import { execSync } from 'node:child_process';
import fs, { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const app = express();
app.use(express.json());

let containerCounter = 100; // Start from 100 to avoid conflicts with prewarmed containers

const GOLDEN_SQL = process.env.GOLDEN_SQL_PATH || 'backups/golden.sql';

let goldenImageCreating = false;
function goldenImageExists() {
	try {
		execSync('docker image inspect wordpress-golden:latest', { stdio: 'ignore' });
		return true;
	} catch (err) {
		return false;
	}
}

app.get('/create', async (req, res) => {
	// if pool.json available array is empty then create new container from golden image other wise use available container
	const pool = JSON.parse(fs.readFileSync('pool.json', 'utf8'));
	if (pool.available.length !== 0) {
		console.log('Using available container...');
		const containerInfo = pool.available.pop();
		const { containerName, dbName, port } = containerInfo;
		pool.used.push(containerInfo);
		fs.writeFileSync('pool.json', JSON.stringify(pool, null, 2));
		return res.json({
			success: true,
			id: containerInfo.id,
			container: containerName,
			siteUrl: containerInfo.siteUrl,
			adminUsername: containerInfo.adminUsername,
			adminPassword: containerInfo.adminPassword,
		});
	}
	try {
		console.log('No available containers, creating new one...');

		const { username = 'admin', password = 'demo' } = req.query;
		
		containerCounter = pool.used.length + 1;
		const containerName = `wp_${containerCounter}`;
		const dbName = `wordpress_${containerCounter}`;
		const port = 10000 + containerCounter;

		console.log(`Creating new container ${containerName}...`);

		// Create new database
		execSync(`docker exec prewarm_mysql mysql -u root -prootpass -e "CREATE DATABASE IF NOT EXISTS ${dbName};"`, { stdio: 'inherit' });

		// Import golden database
		execSync(`docker exec -i prewarm_mysql mysql -u root -prootpass ${dbName} < ${GOLDEN_SQL}` , { stdio: 'inherit' });

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
            wordpress-golden:latest`, { stdio: 'inherit' });

		// Wait for container to be ready
		for (let i = 0; i < 30; i++) {
			try {
				execSync(`docker exec ${containerName} ls /var/www/html/wp-config.php`, { stdio: 'ignore' });
				break;
			} catch (err) {
				execSync('sleep 1');
			}
		}

		if (fs.existsSync('backups/uploads')) {
			execSync(`docker exec ${containerName} sh -c "mkdir -p /var/www/html/wp-content/uploads"`, { stdio: 'inherit' });
			execSync(`docker cp backups/uploads/. ${containerName}:/var/www/html/wp-content/uploads/`, { stdio: 'inherit' });
			execSync(`docker exec ${containerName} sh -c "chown -R www-data:www-data /var/www/html/wp-content/uploads"`, { stdio: 'inherit' });
		}

		// execSync(`docker exec ${containerName} wp plugin activate classic-editor --allow-root`, { stdio: 'inherit' });
		try { execSync(`docker exec ${containerName} wp plugin activate tutor --allow-root`, { stdio: 'inherit' }); } catch (e) {}
		try { execSync(`docker exec ${containerName} wp plugin activate droip --allow-root`, { stdio: 'inherit' }); } catch (e) {}
		try { execSync(`docker exec ${containerName} wp plugin activate tutor-pro --allow-root`, { stdio: 'inherit' }); } catch (e) {}
		try { execSync(`docker exec ${containerName} wp theme activate tutorbase --allow-root`, { stdio: 'inherit' }); } catch (e) {}

		// Update site URL
		execSync(`docker exec ${containerName} wp option update home "http://localhost:${port}" --allow-root`, { stdio: 'inherit' });
		execSync(`docker exec ${containerName} wp option update siteurl "http://localhost:${port}" --allow-root`, { stdio: 'inherit' });

		// Update admin credentials
		execSync(`docker exec ${containerName} wp user update admin --user_pass="${password}" --allow-root`, { stdio: 'inherit' });
		if (username !== 'admin') {
			execSync(`docker exec ${containerName} wp user update admin --user_login="${username}" --allow-root`, { stdio: 'inherit' });
		}

		// Add container info to pool
		pool.used.push({
			id: containerCounter,
			containerName,
			siteUrl: `http://localhost:${port}`,
			adminUsername: username,
			adminPassword: password,
			dbName,
			dbPass: 'rootpass',
			port
		});
		fs.writeFileSync('pool.json', JSON.stringify(pool, null, 2));

		res.json({
			success: true,
			id: containerCounter,
			container: containerName,
			url: `http://localhost:${port}`,
			admin: { username, password },
			port
		});
	} catch (error) {
		console.error('Error creating container:', error);
		res.status(500).json({ success: false, error: error.message });
	}
});

app.get('/', (req, res) => {
	console.log('Docker Pool');
	return res.json('Docker Pool');
})

app.get('/pool', (req, res) => {
	const worker = fork('./prewarm.js');
	res.json({ message: 'Pool creation started' });
	worker.on('exit', (code, signal) => {
		if (code === 0) {
			console.log(`Pool created with code ${code}`);
		} else {
			console.error(`Child process exited with code ${code} and signal ${signal}`);
		}
	});
})

app.listen(9000, () => {
	console.log('Server running on port', 9000);
	if (!goldenImageExists() && !goldenImageCreating) {
		goldenImageCreating = true;
		const worker = fork('./goldenImage.js');
		worker.on('exit', (code) => {
			goldenImageCreating = false;
			if (code === 0) {
				console.log('Golden image created successfully!');
			} else {
				console.error(`Golden image creation process exited with code ${code}`);
			}
		});
	} else {
		console.log('Golden image already exists or is being created, skipping.');
	}
});
