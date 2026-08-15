import { Module } from '@kerith/core';

Module('catalog', {
  imports: [],
  shared: ['@shared'],
  exports: ['ProductsService']
});

export { ProductsService } from './products/products.service.js';
