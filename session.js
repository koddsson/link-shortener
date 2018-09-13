import { randomBytes } from 'crypto'
import createDebug from 'debug'
const debug = createDebug('app:session')

const sessions = new Map()
const defaultStore = {
  create: async obj => {
    const token = randomBytes(10).toString('hex')
    const session = Object.assign({}, obj, { token, new: true, created: Date.now() })
    sessions.set(token, session)
    return session
  },
  read: async token => sessions.get(token),
  update: async (oldToken, obj) => {
    const oldSession = sessions.get(oldToken)
    const newToken = randomBytes(10).toString('hex')
    const session = Object.assign({}, oldSession, obj, { token: newToken, new: false, created: oldSession.created })
    sessions.set(newToken, session)
    sessions.delete(oldToken)
    return session
  },
  delete: async token => {
    sessions.delete(token)
  },
}

export default ({ store = defaultStore } = {}) => async (ctx, next) => {
  debug('->session')
  let session = await store.read(ctx.cookies.get('s'))
  if (!session) {
    debug(`creating new session for client`)
    session = await store.create({})
  }
  const token = session.token
  ctx.session = session
  await next()
  session = await store.update(token, ctx.session)
  debug(`generating new session for client`)
  ctx.cookies.set('s', session.token, { overwrite: true })
}
