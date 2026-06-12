import { Controller } from '../../../../src/index.js';
import { Router } from 'express';

Controller('/refunds');
const router = Router();
router.get('/', (req, res) => res.json({ status: 'ok' }));
export default router;