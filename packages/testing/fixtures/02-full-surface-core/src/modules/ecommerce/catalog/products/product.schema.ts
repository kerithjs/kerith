import { Schema } from '@kerith/core';

Schema('ProductSchema');

export interface Product {
  id: string;
  name: string;
  price: number;
}
