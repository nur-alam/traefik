import fs from 'node:fs';
import path from 'node:path';
import docker from './docker.js';

async function followProgress(stream) {
	return new Promise((resolve, reject) => {
		docker.modem.followProgress(stream, (err, res) => {
			if (err) return reject(err);
			resolve(res);
		});
	});
}

async function ensureImage(imageRef) {
	try {
		await docker.getImage(imageRef).inspect();
		console.log(`WordPress image ${imageRef} already exists locally`);
	} catch {
		console.log(`Pulling ${imageRef}...`);
		const stream = await docker.pull(imageRef);
		await followProgress(stream);
		console.log('Pull complete!');
	}
}

async function cleanupContainer(name) {
	try {
		const container = docker.getContainer(name);
		const info = await container.inspect();
		if (info?.State?.Running) {
			await container.stop();
		}
		await container.remove({ force: true });
		console.log(`Removed existing container: ${name}`);
	} catch {
		// Not found or already removed
	}
}

async function waitForMySQL(maxAttempts = 60) {
	console.log('Waiting for MySQL to be ready...');
	const mysql = docker.getContainer('demo-mysql');
	for (let i = 0; i < maxAttempts; i++) {
		try {
			await execShell(mysql, `mysql -uroot -p${process.env.DB_ROOT_PASSWORD || 'root'} -e "SHOW DATABASES;"`);
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

async function execShell(container, cmd) {
	const exec = await container.exec({
		Cmd: ['sh', '-lc', cmd],
		AttachStdout: true,
		AttachStderr: true,
	});
	return new Promise((resolve, reject) => {
		exec.start((err, stream) => {
			if (err) return reject(err);
			let stdout = '';
			let stderr = '';
			stream.on('data', (chunk) => {
				const s = chunk.toString();
				stdout += s;
				// Optionally print progress logs to console
				// process.stdout.write(s);
			});
			stream.on('error', reject);
			stream.on('end', async () => {
				try {
					const info = await exec.inspect();
					resolve({ exitCode: info.ExitCode, stdout, stderr });
				} catch (e) {
					reject(e);
				}
			});
		});
	});
}

async function waitForFile(container, filePath, maxAttempts = 60) {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	for (let i = 0; i < maxAttempts; i++) {
		const { exitCode } = await execShell(container, `test -f ${filePath}`);
		if (exitCode === 0) return true;
		if (i % 5 === 0) console.log(`Waiting for ${filePath}... (attempt ${i + 1}/${maxAttempts})`);
		await sleep(2000);
	}
	throw new Error(`File not present in time: ${filePath}`);
}

async function createGoldenContainer({ name, dbHost, dbPort, dbUser, dbPassword, dbName, hostBackups, image }) {
	const container = await docker.createContainer({
		Image: image,
		name,
		Env: [
			`WORDPRESS_DB_HOST=${dbHost}`,
			`WORDPRESS_DB_PORT=${dbPort}`,
			`WORDPRESS_DB_USER=${dbUser}`,
			`WORDPRESS_DB_PASSWORD=${dbPassword}`,
			`WORDPRESS_DB_NAME=${dbName}`,
		],
		ExposedPorts: { '80/tcp': {} },
		HostConfig: {
			NetworkMode: 'traefik',
			PortBindings: { '80/tcp': [{ HostPort: '9009' }] },
			Binds: hostBackups ? [`${hostBackups}:/backups:ro`] : [],
		},
	});
	await container.start();
	return container;
}

async function installWpCli(container) {
	console.log('Installing WP-CLI...');
	await execShell(container, 'curl -fsSL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o /usr/local/bin/wp');
	await execShell(container, 'chmod +x /usr/local/bin/wp');
}

async function installWordPress(container) {
	console.log('Running wp core install...');
	const cmd = [
		'wp core install',
		'--url=http://localhost:9009',
		'--title="Golden Site"',
		'--admin_user=admin',
		'--admin_password=demo',
		'--admin_email=nuralam@gmail.com',
		'--allow-root',
	].join(' ');
	const res = await execShell(container, cmd);
	if (res.exitCode !== 0) throw new Error(`wp core install failed: ${res.stderr}`);
}

async function installPluginsAndTheme(container) {
	console.log('Installing plugins and theme...');
	// Ensure unzip is available
	await execShell(container, 'apt-get update && apt-get install -y unzip');

	// Create target dirs
	await execShell(container, 'mkdir -p /usr/src/wordpress/wp-content/plugins');
	await execShell(container, 'mkdir -p /usr/src/wordpress/wp-content/themes');

    // Robust mount detection using exec exit code
    const { exitCode } = await execShell(container, 'test -d /backups');
    const backupsMounted = exitCode === 0;
    console.log('backupsMounted', backupsMounted);
	if (backupsMounted) {
		// droip plugin
		await execShell(container, 'if [ -f /backups/droip-2.5.0.zip ]; then unzip -q /backups/droip-2.5.0.zip -d /usr/src/wordpress/wp-content/plugins; fi');
		// tutor plugin
		await execShell(container, 'if [ -f /backups/tutor-3.9.3.zip ]; then unzip -q /backups/tutor-3.9.3.zip -d /usr/src/wordpress/wp-content/plugins; fi');
		await execShell(container, 'if [ -d /backups/tutor-3.9.3 ]; then cp -r /backups/tutor-3.9.3 /usr/src/wordpress/wp-content/plugins/tutor; fi');
		// tutor-pro plugin
		await execShell(container, 'if [ -f /backups/tutor-pro-3.9.3.zip ]; then unzip -q /backups/tutor-pro-3.9.3.zip -d /usr/src/wordpress/wp-content/plugins; fi');
		await execShell(container, 'if [ -d /backups/tutor-pro-3.9.3 ]; then cp -r /backups/tutor-pro-3.9.3 /usr/src/wordpress/wp-content/plugins/tutor-pro; fi');
		// theme
		await execShell(container, 'if [ -f /backups/tutorbase-1.0.1.zip ]; then unzip -q /backups/tutorbase-1.0.1.zip -d /usr/src/wordpress/wp-content/themes; fi');
		await execShell(container, 'if [ -d /usr/src/wordpress/wp-content/themes/tutorbase-1.0.1 ]; then mv /usr/src/wordpress/wp-content/themes/tutorbase-1.0.1 /usr/src/wordpress/wp-content/themes/tutorbase; fi');
		// uploads
		await execShell(container, 'if [ -d /backups/uploads ]; then mkdir -p /usr/src/wordpress/wp-content/uploads && cp -r /backups/uploads/. /usr/src/wordpress/wp-content/uploads/ && chown -R www-data:www-data /usr/src/wordpress/wp-content/uploads; fi');
	}
}

async function commitGoldenImage(container, repo = 'wordpress-golden', tag = 'latest') {
	const res = await container.commit({ repo, tag });
	const id = typeof res === 'string' ? res : res?.Id;
	
	if (!id) {
		throw new Error('Commit returned empty image Id');
	}
	
	// Explicitly tag the image by ID to ensure repo:tag exists
	try {
		await docker.getImage(id).tag({ repo, tag });
		console.log(`Tagged image ${id} as ${repo}:${tag}`);
	} catch (e) {
		console.log(`ℹ️ Tagging fallback failed: ${e.message}`);
	}
	
	// Verify the tag exists on the daemon
	try {
		const inspect = await docker.getImage(`${repo}:${tag}`).inspect();
		console.log(`Golden image created: ${repo}:${tag} (${inspect?.Id || id})`);
	} catch {
		throw new Error(`Image ${repo}:${tag} not found after commit; check Docker daemon permissions and socket mount`);
	}
}

function getContainerByName(name) {
	return docker.getContainer(name);
}

export async function initGoldenImage() {
	console.log('Initializing pool of WordPress sites...');

	// Wait for MySQL
	// console.log('Waiting for MySQL to be ready...');
	await waitForMySQL();

	// // Ensure WordPress image
	const wpImage = 'wordpress:latest';
	await ensureImage(wpImage);

	// // Create DB if not exists
	const goldenDb = 'wp_golden';
	const mysql = docker.getContainer('demo-mysql');
	await execShell(mysql, `mysql -uroot -p${process.env.DB_ROOT_PASSWORD || 'root'} -e "CREATE DATABASE IF NOT EXISTS ${goldenDb};"`);

	// // Clean any previous container
	const goldenContainerName = 'wp_golden';
	await cleanupContainer(goldenContainerName);

	// // Mount host backups directory to /backups
	// // Defaults to your workspace path; override via HOST_BACKUPS_PATH if different
	const hostBackups = process.env.HOST_BACKUPS_PATH || '/home/traefik/demo/server/backups';
	console.log(`Using HOST_BACKUPS_PATH: ${hostBackups}`);
	// if (!fs.existsSync(hostBackups)) {
	// 	console.log(`Backups directory not found at ${hostBackups}; proceeding without mounts.`);
	// 	return true;
	// }

	// Create and start golden container
	const goldenContainer = await createGoldenContainer({
		name: goldenContainerName,
		dbHost: 'demo-mysql', // use container_name; service DNS is 'mysql' in Compose, both work on the traefik network
		dbPort: 3306,
		dbUser: 'root',
		dbPassword: process.env.DB_ROOT_PASSWORD || 'root',
		dbName: goldenDb,
		hostBackups,
		image: wpImage,
	});

	// Verify the mount inside the container before proceeding
    const mountProbe = await execShell(goldenContainer, 'set -e; test -d /backups && echo "mounted" || echo "not-mounted"; ls -lah /backups || true');
    console.log('backups mount status:', mountProbe.stdout.trim());

	// console.log('Waiting for golden WordPress files...');
	await waitForFile(goldenContainer, '/var/www/html/wp-config.php', 90);

	await installWpCli(goldenContainer);
	await installWordPress(goldenContainer);
	await installPluginsAndTheme(goldenContainer);

	// // Stop container before committing
	console.log('Stopping golden container before commit...');
	await goldenContainer.stop();
	
	console.log('Committing golden container to image...');
	await commitGoldenImage(goldenContainer, 'wp-golden', 'latest');
	
	console.log('Removing golden container...');
	await goldenContainer.remove({ force: true });
	
	console.log('Golden image created successfully!');
}

(async () => {
	console.log('Golden image worker started...');
	try {
		await initGoldenImage();
		console.log('Golden image worker finished.');
	} catch (err) {
		console.error('Golden image worker error:', err);
	}
})();