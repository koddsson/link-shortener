import koa from 'koa'
import { get } from 'koa-route'
import { StatsTable } from './models'
import createDebug from 'debug'
const debug = createDebug('app:links')

const app = new koa()

app.use(
  get('/', async (ctx, id, next) => {
    const stats = await new StatsTable(ctx.database).allBy()
    for (let [page, count] of Object.entries(await stats.countBy('page'))) {
      ctx.body += `hits_by_page{page="${page}"} ${count} ${Date.now()}\n`
    }
    for (let [ip, count] of Object.entries(await stats.countBy('ip'))) {
      ctx.body += `hits_by_ip{page="${ip}"} ${count} ${Date.now()}\n`
    }
    for (let [status, count] of Object.entries(await stats.countBy('status'))) {
      ctx.body += `hits_by_ip{page="${ip}"} ${count} ${Date.now()}\n`
    }
  })
)

export default app
