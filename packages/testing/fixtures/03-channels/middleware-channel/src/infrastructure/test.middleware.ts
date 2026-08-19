import { Middleware } from '@kerith/app'
import type { Request, NextFunction } from 'express'

export const TestMiddleware = Middleware('test-header', (req, _res, next) => {
  (req as Request).headers['x-kerith-test'] = 'middleware-active';
  (next as NextFunction)()
})
