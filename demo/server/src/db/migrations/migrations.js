import pool from '../index.js';
// create demo_sites table
export const createDemoSitesTable = async () => {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS sites (
			id INT AUTO_INCREMENT PRIMARY KEY,
			containerid VARCHAR(255),
			siteurl VARCHAR(255),
			user VARCHAR(255),	
			password VARCHAR(255),
			email VARCHAR(255),
			db_name VARCHAR(255),
			db_user VARCHAR(255),
			db_pass VARCHAR(255),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`);

	await pool.query(`
		CREATE TABLE IF NOT EXISTS sitepool (
			id INT AUTO_INCREMENT PRIMARY KEY,
			containerid VARCHAR(255),
			siteurl VARCHAR(255),
			user VARCHAR(255),
			password VARCHAR(255),
			email VARCHAR(255),
			db_name VARCHAR(255),
			db_user VARCHAR(255),
			db_pass VARCHAR(255),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`);
}
