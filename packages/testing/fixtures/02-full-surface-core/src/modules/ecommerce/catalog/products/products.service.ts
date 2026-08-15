import { Service } from '@kerith/core';
import { ProductsRepository } from './products.repository.js';
import { getSharedPrefix } from '@shared/utils.js';

Service('ProductsService');

export class ProductsService {
  private repo = new ProductsRepository();

  getFormattedProducts() {
    const products = this.repo.getProducts();
    const prefix = getSharedPrefix();
    return products.map(p => ({
      ...p,
      name: `${prefix} ${p.name}`
    }));
  }
}
