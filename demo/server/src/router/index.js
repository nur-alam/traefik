import express from 'express';
import { getSites, createSite } from '../controller/index.js';

const router = express.Router();

router.get('/sites', getSites);
router.post('/site', createSite);

export default router;
