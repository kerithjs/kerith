import { Controller } from '@kerith/core';
import { Router } from 'express';
import { ProductsService } from './products.service.js';

Controller('/products');

const router = Router();
const service = new ProductsService();

router.get('/', (_req, res) => {
  res.json({ products: service.getFormattedProducts() });
});

export default router;
