import { Module } from '@kerith/app'

/**
 * catalog module — uses the infrastructure composition chain.
 * Imports: @config/app, @client/http, @store/cache, @provider/data
 * through the alias channel, so all four identifiers must be resolved
 * before this module can serve requests.
 */
Module('catalog', {
  imports: [],
  exports: [],
})
