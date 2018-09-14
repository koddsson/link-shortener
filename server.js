import koa from 'koa'
import mount from 'koa-mount'
import { get } from 'koa-route'
import session from './session'
import { authMiddleware, redirectWithoutAuth, authRoute } from './auth'
import links from './links'
import editLinks from './editlinks'
import stats from './stats'
import createDebug from 'debug'
const debug = createDebug('app')
import dotenv from 'dotenv'
dotenv.config()

const app = new koa()

app.use(async (ctx, next) => {
  debug(`${ctx.method} ${ctx.url}`)
  const start = Date.now()
  await next()
  debug(`${ctx.method} ${ctx.url} - ${Date.now() - start}ms`)
})

app.use(session())
app.use(authMiddleware({ token: process.env.AUTH }))

// Routes
app.use(mount(authRoute)) // /login
app.use(mount(links)) // /:id
app.use(redirectWithoutAuth(mount(editLinks))) // POST /:id
app.use(redirectWithoutAuth(mount('/_/stats', stats))) // GET /stats

if (require.main === module) {
  app.context.database = process.env.DB || 'memory://1'
  app.context.port = process.env.PORT || 3000
  app.listen(app.context.port, () => console.log(`up: http://localhost:${app.context.port}`))
}
