import koa from 'koa'
import { post, get } from 'koa-route'
import bodyParser from 'koa-bodyparser'
import { LinksTable } from './models'
import createDebug from 'debug'
const debug = createDebug('app:editLinks')

const app = new koa()

app.use(bodyParser({ enableTypes: ['json', 'form', 'text'] }))

app.use(
  post('/:id?', async (ctx, id) => {
    const url = ctx.is('text') ? ctx.request.body : ctx.request.body.url
    ctx.assert(url, 400)

    debug(`asked to create link ${id} -> ${url}`)
    const links = new LinksTable(ctx.database)

    let result = await links.findBy({ url })
    if (id && !result) result = await links.findBy({ id })
    const found = Boolean(result)
    if (!found) result = await links.add({ id, url })

    const conflict = Boolean(found && id)
    ctx.type = 'text'
    if (conflict) {
      debug(`link ${id} -> ${url} conflicts with ${result.url}`)
      const error = `${result.url} already exists under id ${result.id}`
      ctx.body = error
      ctx.status = 409

      if (ctx.accepts('html')) {
        ctx.body = `<!DOCTYPE html><html><head><title>Conflict</title><body>${error}</body></html>`
        ctx.type = 'html'
      } else if (ctx.accepts('json')) {
        ctx.body = { error }
        ctx.type = 'json'
      }
    } else {
      debug(`link ${id} -> ${url} already exists at ${result.id}`)
      ctx.body = `Redirecting to ${result.id}`
      ctx.set('location', result.id)
      ctx.status = 302

      if (ctx.accepts('html')) {
        ctx.body = `<!DOCTYPE html><html><head><title>Moved permanently</title><body><a href="${
          result.url
        }">moved here</a></body></html>`
        ctx.type = 'html'
      } else if (ctx.accepts('json')) {
        ctx.body = result
        ctx.type = 'json'
      }
    }
  })
)

export default app
