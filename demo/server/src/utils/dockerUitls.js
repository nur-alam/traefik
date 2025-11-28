import fs from 'node:fs';
import path from 'node:path';
import docker from '../docker.js';

export async function installWordPress(container) {
	console.log('Running wp core install...');
	const cmd = [
		'wp core install',
		'--url=http://localhost:9009',
		'--title="Golden Site"',
		'--admin_user=admin',
		'--admin_password=password',
		'--admin_email=nuralam@gmail.com',
		'--allow-root',
	].join(' ');
	const res = await execShell(container, cmd);
	if (res.exitCode !== 0) throw new Error(`wp core install failed: ${res.stderr}`);
}

export async function installWpCli(container) {
	console.log('Installing WP-CLI...');
	await execShell(container, 'curl -fsSL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o /usr/local/bin/wp');
	await execShell(container, 'chmod +x /usr/local/bin/wp');
}

export async function installPluginsAndTheme(container) {
	console.log('Installing plugins and theme...');
	// Ensure unzip is available
	await execShell(container, 'apt-get update && apt-get install -y unzip');

	// Create target dirs
	await execShell(container, 'mkdir -p /usr/src/wordpress/wp-content/plugins');
	await execShell(container, 'mkdir -p /usr/src/wordpress/wp-content/themes');

	// Tutor plugin example (download public plugin)
	await execShell(container, 'curl -fsSL https://downloads.wordpress.org/plugin/tutor.3.9.2.zip -o /tmp/tutor.3.9.2.zip');
	await execShell(container, 'unzip -q /tmp/tutor.3.9.2.zip -d /usr/src/wordpress/wp-content/plugins');

	// If backups are mounted, install from /backups
	const backupsMounted = (await execShell(container, 'test -d /backups; echo $?')).stdout.trim().split('\n').pop() === '0';

	if (backupsMounted) {
		// droip plugin
		await execShell(container, 'if [ -f /backups/droip-2.5.0.zip ]; then unzip -q /backups/droip-2.5.0.zip -d /usr/src/wordpress/wp-content/plugins; fi');
		// tutor-pro plugin
		await execShell(container, 'if [ -f /backups/tutor-pro-3.9.2.zip ]; then unzip -q /backups/tutor-pro-3.9.2.zip -d /usr/src/wordpress/wp-content/plugins; fi');
		await execShell(container, 'if [ -d /backups/tutor-pro-3.9.2 ]; then cp -r /backups/tutor-pro-3.9.2 /usr/src/wordpress/wp-content/plugins/tutor-pro; fi');
		// theme
		await execShell(container, 'if [ -f /backups/tutorbase-1.0.1.zip ]; then unzip -q /backups/tutorbase-1.0.1.zip -d /usr/src/wordpress/wp-content/themes; fi');
		await execShell(container, 'if [ -d /usr/src/wordpress/wp-content/themes/tutorbase-1.0.1 ]; then mv /usr/src/wordpress/wp-content/themes/tutorbase-1.0.1 /usr/src/wordpress/wp-content/themes/tutorbase; fi');
		// uploads
		await execShell(container, 'if [ -d /backups/uploads ]; then mkdir -p /usr/src/wordpress/wp-content/uploads && cp -r /backups/uploads/. /usr/src/wordpress/wp-content/uploads/ && chown -R www-data:www-data /usr/src/wordpress/wp-content/uploads; fi');
	}
}

export async function waitForWordPressReady(container, maxAttempts = 90) {
    for (let i = 0; i < maxAttempts; i++) {
        const cfg = await execShell(container, 'test -f /var/www/html/wp-config.php');
        if (cfg.exitCode === 0) {
            const installed = await execShell(container, 'wp core is-installed --allow-root --path=/var/www/html');
            if (installed.exitCode === 0) return;
        }
        await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('WordPress not ready in time');
}

export async function waitForMySQL(maxAttempts = 60) {
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

export async function execShell(container, cmd) {
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