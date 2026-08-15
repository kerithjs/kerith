import { Domain } from '@kerith/core';

Domain('ecommerce', {
  subModules: ['catalog'],
  modules: ['orders']
});
