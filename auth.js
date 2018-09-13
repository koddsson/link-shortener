import koa from 'koa'
import bodyParser from 'koa-bodyparser'
import { post } from 'koa-route'
import createDebug from 'debug'
const debug = createDebug('app:auth')

export const authMiddleware = ({ token }) => async (ctx, next) => {
  let userAuth = ctx.session.authorization
  const headerAuth = ctx.headers['authorization']
  if (!userAuth && headerAuth && headerAuth.startsWith('Bearer ')) {
    debug(`user attempting to log in via auth header`)
    userAuth = headerAuth.slice(7)
  }
  if (userAuth === token) {
    ctx.session.loggedIn = true
    debug('user logged in')
  } else {
    ctx.session.loggedIn = false
    debug('user logged out')
  }
  return next()
}

export const redirectWithoutAuth = (fn, { path = '/' } = {}) => async (ctx, next) => {
  ctx.assert(ctx.session.loggedIn, 401)
  return fn(ctx, next)
}

const app = new koa()

app.use(bodyParser())

app.use(
  post('/login', async (ctx, id) => {
    ctx.session.authorization = ctx.request.body.authorization
    debug('user attempted to login, redirecting')
    ctx.redirect('/')
  })
)

export const authRoute = app
