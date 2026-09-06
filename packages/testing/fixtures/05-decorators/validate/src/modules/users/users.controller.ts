import { Controller, Post, Body, Res } from '@kerith/app';
import { Validate } from '@kerith/identifiers';
import { createUserSchema } from './user.schema.js';
import type { Response } from 'express';

Validate('createUser', createUserSchema);

@Controller('/users', { metadata: { validate: 'createUser' } })
export default class UsersController {
  @Post('/')
  create(@Body() body: unknown, @Res() res: Response) {
    res.status(201).json({ created: body });
  }
}
