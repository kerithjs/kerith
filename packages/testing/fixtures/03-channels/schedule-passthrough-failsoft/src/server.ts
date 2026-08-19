import express from 'express'
import { createApp, KerithError, useLogger, useHttpLogger } from '@kerith/app'

import './infrastructure/broken.provider.js'

const log = useLogger('app')
const httpLogger = useHttpLogger({ ignore: ['/health'] })

const app = express()
app.use(express.json())
app.use(httpLogger.requests())

try {
  const kerith = await createApp(app)
  
  if (!kerith.runtime.preloaderActive) {
    log.warn('Pre-loader not detected. Run: npm run setup')
  }
  
  log.info(`Mounted ${kerith.routes.length} route(s)`)
  
  const port = process.env.PORT !== undefined ? Number(process.env.PORT) : 3000
  const server = app.listen(port, () => {
    const addr = server.address()
    const actualPort = typeof addr === 'object' && addr ? addr.port : port
    log.info(`Server running on http://localhost:${actualPort}`)
  })
  
  kerith.listen(server, {
    onShutdown: async () => {
      log.info('Cleaning up resources...')
      // await db.disconnect()
    }
  })
  
  // Error handler — must be the last middleware in the pipeline
  app.use(httpLogger.errors())
} catch (err) {
  if (err instanceof KerithError) {
    log.error(`[${err.code}] ${err.message}`)
    if (err.details) log.error(err.details)
    process.exit(1)
  }
  log.error(err instanceof Error ? err.message : String(err))
  throw err
}
