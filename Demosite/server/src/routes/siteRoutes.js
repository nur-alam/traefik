import express from 'express';
import SiteController from '../controllers/SiteController.js';

const router = express.Router();

// Render the main UI page
router.get('/', SiteController.index);

// API endpoint to get all active sites
router.get('/sites', SiteController.getAllSites);

// API endpoint to create a new site
router.post('/create-site', SiteController.createSite);

// API endpoint for cleanup
router.post('/cleanup', SiteController.cleanup);

export default router;