import docker from './docker.js';

// Run every hour
export default async function cleanupExpiredSites() {
	console.log('🧹 Running cleanup job...');
	const { DB_ROOT_PASSWORD } = process.env;
	try {
		const containers = await docker.listContainers({ all: true });

		for (const c of containers) {
			const labels = c.Labels || {};
			if (!labels['demoserver.created_at']) continue;

			const createdAt = parseInt(labels['demoserver.created_at'], 10);
			const ageMinutes = (Date.now() - createdAt) / (1000 * 60);

			if (ageMinutes > 2) {
				const username = labels['demoserver.username'];
				const dbName = labels['demoserver.dbname'];
				const dbUser = labels['demoserver.dbuser'];

				console.log(`🗑️ Removing demo: ${username}`);

				// Stop and remove container
				const container = docker.getContainer(c.Id);
				await container.stop().catch(() => { });
				await container.remove({ v: true, force: true });

				// Drop MySQL database and user
				const mysqlContainer = docker.getContainer('demo-mysql');
				const exec = await mysqlContainer.exec({
					Cmd: ['mysql', '-uroot', `-p${DB_ROOT_PASSWORD}`, '-e', `DROP DATABASE IF EXISTS ${dbName}; DROP USER IF EXISTS '${dbUser}'@'%'; FLUSH PRIVILEGES;`],
					AttachStdout: true,
					AttachStderr: true
				});
				exec.start();
			}
		}

		console.log('✅ Cleanup complete');
	} catch (err) {
		console.error('❌ Cleanup failed:', err);
	}
}
