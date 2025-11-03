import Docker from 'dockerode';
import { exec } from 'child_process';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export async function execShell(cmd) {
	return new Promise((resolve, reject) => {
		exec(cmd, (err, stdout, stderr) => {
			if (err) reject(err);
			else resolve(stdout || stderr);
		});
	});
}

export default docker;
