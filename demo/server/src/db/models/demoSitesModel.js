const pool = require('../index.js');
const demoSitesModel = {
	async getAll() {
		const [rows] = await pool.query('SELECT * FROM demo_sites');
		return rows;
	},
	async getById(id) {
		const [rows] = await pool.query('SELECT * FROM demo_sites WHERE id = ?', [id]);
		return rows[0];
	},
};
