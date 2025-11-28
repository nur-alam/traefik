import fs from 'node:fs';
import path from 'node:path';
import docker from './docker.js';
import { execShell, waitForMySQL, waitForWordPressReady, ensureImage, cleanupContainer, waitForFile } from './utils/dockerUitls.js';
import { WP_GOLDEN_DB_NAME, WP_GOLDEN_IMAGE_NAME, TRAEFIK_NETWORK, DB_ROOT_USER, DB_ROOT_PASSWORD, DB_HOST, DB_PORT, MYSQL_CONTAINER_NAME, WP_CLI_URL } from './config/index.js';

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
			NetworkMode: TRAEFIK_NETWORK,
			PortBindings: { '80/tcp': [{ HostPort: '9009' }] },
			Binds: hostBackups ? [`${hostBackups}:/backups:ro`] : [],
		},
	});
	await container.start();
	return container;
}

async function installWpCli(container) {
	console.log('Installing WP-CLI...');
	await execShell(container, `curl -fsSL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o /usr/local/bin/wp`);
	// await execShell(container, `curl -fsSL ${WP_CLI_URL}`);
	await execShell(container, 'chmod +x /usr/local/bin/wp');
}

async function installWordPress(container) {
	console.log('Running wp core install...');
	const check = await execShell(container, 'wp core is-installed --allow-root --path=/var/www/html');
	if (check.exitCode === 0) {
		console.log('WordPress already installed, skipping core install');
		return;
	}
	const cmd = [
		'wp core install',
		'--url=http://localhost:9009',
		'--title="Golden Site"',
		'--admin_user=admin',
		'--admin_password=demo',
		'--admin_email=nuralam@gmail.com',
		'--allow-root',
		'--path=/var/www/html',
		'--skip-email',
	].join(' ');
	const res = await execShell(container, cmd);
	if (res.exitCode !== 0) throw new Error(`wp core install failed: ${res.stderr || res.stdout}`);
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

async function commitGoldenImage(container, repo = WP_GOLDEN_DB_NAME, tag = 'latest') {
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
	console.log('Creating golden image...');

	// Wait for MySQL
	// console.log('Waiting for MySQL to be ready...');
	await waitForMySQL();
	// // Ensure WordPress image
	const wpImage = 'wordpress:latest';
	await ensureImage(wpImage);
	
	// Create DB if not exists
	const goldenDb = WP_GOLDEN_DB_NAME;
	const mysqlContainer = docker.getContainer(MYSQL_CONTAINER_NAME || 'mysql');
	await execShell(mysqlContainer, `mysql -u${DB_ROOT_USER} -p${DB_ROOT_PASSWORD} -e "CREATE DATABASE IF NOT EXISTS ${WP_GOLDEN_DB_NAME};"`);

	// Clean any previous container
	const goldenContainerName = WP_GOLDEN_IMAGE_NAME;
	await cleanupContainer(goldenContainerName);

	// Mount host backups directory to /backups
	// Defaults to your workspace path; override via HOST_BACKUPS_PATH if different
	const hostBackups = process.env.HOST_BACKUPS_PATH || '/home/traefik/demo/server/backups';
	console.log(`Using HOST_BACKUPS_PATH: ${hostBackups}`);

	// Create and start golden container
	const goldenContainer = await createGoldenContainer({
		name: goldenContainerName,
		dbHost: DB_HOST,
		dbPort: DB_PORT,
		dbUser: DB_ROOT_USER,
		dbPassword: DB_ROOT_PASSWORD,
		dbName: WP_GOLDEN_DB_NAME,
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

	//Stop container before committing
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