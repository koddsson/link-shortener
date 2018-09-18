import koa from 'koa'
import { post, get } from 'koa-route'
import { LinksTable } from './models'
import createDebug from 'debug'
const debug = createDebug('app:links')

const app = new koa()

app.use(
  get('/:id', async (ctx, id, next) => {
    const links = new LinksTable(ctx.database)

    let result = await links.findBy({ id })
    debug(result ? `found link ${id}` : `could not find link ${id} in table`)
    ctx.assert(result, 404)

    ctx.set('location', result.url)
    ctx.status = 302

    if (ctx.accepts('html')) {
      debug(`rendering html for ${id}`)
      ctx.body = `<!DOCTYPE html><html><head><title>Moved permanently</title><body><a href="${
        result.url
      }">moved here</a></body></html>`
      ctx.type = 'html'
    } else if (ctx.accepts('json')) {
      debug(`rendering json for ${id}`)
      ctx.body = result
      ctx.type = 'json'
    } else {
      debug(`rendering text for ${id}`)
      ctx.body = `Redirecting to ${result.id}`
      ctx.type = 'text'
    }
  })
)

export default app
