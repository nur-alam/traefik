import { initPool } from './initPool.js';

(async () => {
	console.log('Prewarm worker started...');

	try {
		await initPool(); // Creates 10 pre-warmed WP containers
		console.log('Prewarm worker finished.');
	} catch (err) {
		console.error('Prewarm worker error:', err);
	}
})();
