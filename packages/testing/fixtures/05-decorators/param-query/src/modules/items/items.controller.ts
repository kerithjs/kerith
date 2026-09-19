import { Controller, Get, Param, Query, Res } from '@kerith/app';
import type { Response } from 'express';

@Controller('/items')
export default class ItemsController {
  // Ruta A: keys puntuales — resolveArgs() rama `def.key ? req.params[key] : ...`
  @Get('/:id')
  getById(@Param('id') id: string, @Query('sort') sort: string | undefined, @Res() res: Response) {
    res.status(200).json({ id, sort: sort ?? null });
  }

  // Ruta B: sin key — resolveArgs() rama `req.params` / `req.query` completos
  @Get('/:id/raw')
  getRaw(@Param() params: unknown, @Query() query: unknown, @Res() res: Response) {
    res.status(200).json({ params, query });
  }
}
