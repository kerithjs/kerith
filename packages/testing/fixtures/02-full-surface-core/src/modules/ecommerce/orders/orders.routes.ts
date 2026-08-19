import { Controller } from '@kerith/core';
import { Router } from 'express';
import { ProductsService } from '@modules/catalog/index.js';

Controller('/orders');

const router = Router();
const productsService = new ProductsService();

router.get('/', (_req, res) => {
  const products = productsService.getFormattedProducts();
  res.json({ orders: [{ id: 'o1', product: products[0] }] });
});

export default router;
