import { Controller } from '@kerith/core';
import { Router } from 'express';

Controller('/legacy');

const router = Router();

router.get('/', (_req, res) => {
  res.json({ legacy: true });
});

export default router;
