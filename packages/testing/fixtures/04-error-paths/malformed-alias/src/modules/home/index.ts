import { Module } from '@kerith/core'
// This import intentionally references a non-existent module alias.
// At runtime the resolve hook cannot find '@modules/no-existe', which causes
// Node to throw ERR_MODULE_NOT_FOUND before Module() ever runs.
// @ts-ignore
import { X } from '@modules/no-existe'

void X // prevent "unused variable" warnings

Module('home', {
  imports: [],
  exports: [],
})
