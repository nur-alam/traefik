import SiteService from '../services/SiteService.js';
import cleanupExpiredSites from '../cleanup.js';

class SiteController {
    static async index(req, res) {
        res.render('index');
    }

    static async getAllSites(req, res) {
        try {
            const sites = await SiteService.getAllSites();
            res.json({ success: true, sites });
        } catch (error) {
            console.error('❌ Error fetching sites:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    static async createSite(req, res) {
        try {
            const { username } = req.body;
            console.log(`🟢 Creating new site for user: ${username || 'anonymous'}`);

            const result = await SiteService.createNewSite(username);
            res.json({ success: true, ...result });
        } catch (error) {
            console.error('❌ Error creating site:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    static async cleanup(req, res) {
        try {
            await cleanupExpiredSites();
            res.json({ success: true });
        } catch (error) {
            console.error('❌ Error during cleanup:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

export default SiteController;