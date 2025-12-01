import pool from './db/index.js';
import { createSite } from './controller/siteController.js';
import { nanoid } from 'nanoid';

export async function initPool(minSize = 2) {
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM sitepool');
    const count = (rows && rows[0] && rows[0].cnt) || 0;
    const deficit = Math.max(0, minSize - count);
    for (let i = 0; i < deficit; i++) {
        const site = await createSite();
        const id = nanoid(12);
        await pool.query(
            `INSERT INTO sitepool (containerid, siteurl, user, password, db_name, db_user, db_pass) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                site.containerId,
                site.siteurl,
                site.user,
                site.password,
                site.db_name,
                site.db_user,
                site.db_pass,
            ]
        );
    }
}

(async () => {
    console.log('Pull creation started...');
    try {
        await initPool(2);
        console.log('Pull creation finished.');
    } catch (err) {
        console.error('Pull creation error:', err);
    }
})();
