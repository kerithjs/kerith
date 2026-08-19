import { Repository } from '@kerith/core';
import type { Product } from './product.schema.js';

Repository('ProductsRepository');

export class ProductsRepository {
  getProducts(): Product[] {
    return [
      { id: 'p1', name: 'Keyboard', price: 100 },
      { id: 'p2', name: 'Mouse', price: 50 },
    ];
  }
}
