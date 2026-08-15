import { Middleware } from '@kerith/app'
import type { Request, Response, NextFunction } from 'express'

export const TestMiddleware = Middleware('test-header', (req: Request, res: Response, next: NextFunction) => {
  req.headers['x-kerith-test'] = 'middleware-active'
  next()
})
