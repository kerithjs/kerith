import { Domain } from '@kerith/core';

Domain('commerce', {
  subModules: ['catalog'],
  modules: ['store']
});
