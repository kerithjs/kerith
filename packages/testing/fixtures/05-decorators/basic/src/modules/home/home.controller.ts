import { Controller, Get } from '@kerith/app';
import type { Request, Response } from 'express';

// NOTE: This controller is purely decorated. There is no `Controller()` function call in this module.
@Controller('/')
export default class HomeController {
  @Get('/')
  home(_req: Request, res: Response) {
    res.json({ message: 'Hello World! Welcome to Kerith Express (decorated)' });
  }
}
