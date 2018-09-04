const express = require('express')
const sqlite = require('sqlite')
const bodyParser = require('body-parser')
const debug = require('debug')('link-shortener')
const {randomBytes} = require('crypto')
const {URL} = require('url')

const dbPromise = sqlite.open('./urls.db', { Promise })
const port = process.env.PORT || 3000
const app = express()

app.set('x-powered-by', false)

if (!process.env.AUTH_HEADER) {
  console.log('AUTH_HEADER not set')
  process.exit(1)
}

const asyncHandler = fn => (req, res, next) => fn(req, res).catch(next)

function auth(req, res, next) {
  if (req.header('authorization') !== process.env.AUTH_HEADER) {
    debug(`Auth was ${req.header('authorization')}`)
    return res.status(401).send('Authentication failed!')
  }
  next()
}

function urlFromBody() {
  return [
    bodyParser.text(),
    bodyParser.json(),
    bodyParser.urlencoded(),
    (req, res, next) => {
      debug('extract url from body')
      let url = ''
      if (req.is('text')) {
        url = req.body.toString('utf-8')
        debug(`Found url as text: ${url}`)
      } else if (req.is('json')) {
        url = req.body.url
        debug(`Found url as json: ${url}`)
      } else if (req.is('urlencoded')) {
        url = req.body.url
        debug(`Found url as urlencoded: ${url}`)
      } else {
        return res.status(400).send('Expecting Content-Type: text/plain')
      }
      try {
        url = new URL(url)
      } catch(e) {
        return res.status(400).send(`Malformed URL: ${url}`)
      }
      req.params = Object.assign(req.params || {}, { url })
      next()
    }
  ]
}

const urlByIdCache = {}
const idByUrlCache = {}
class UrlsTable {
  constructor(db) {
    this.db = db
  }

  async getById(id) {
    if (id in urlByIdCache) return { id, url: urlByIdCache[id] }
    const result = (await this.db).get('SELECT url,id FROM urls WHERE id = ? LIMIT 1', String(id))
    if (result) urlByIdCache[result.id] = result.url
    return result
  }

  async getByUrl(url) {
    if (url in idByUrlCache) return { url, id: idByUrlCache[url] }
    const result = (await this.db).get('SELECT url,id FROM urls WHERE url = ? LIMIT 1', String(url))
    if (result) idByUrlCache[result.url] = result.id
    return result
  }

  async hasId(id) {
    return id in urlByIdCache || (await (await this.db).get('SELECT COUNT(id) FROM urls WHERE id = ?', String(id))) > 0
  }

  async add(url, id) {
    url = String(url)
    id = String(id || '')
    if (!id) {
      let exists = true
      while(exists) {
        id += randomBytes(1).toString('hex')
        exists = await this.hasId(id)
      }
    }
    await (await this.db).run('INSERT INTO urls VALUES(?, ?, datetime("now"))', id, url)
    urlByIdCache[id] = url
    idByUrlCache[url] = id
    return {id, url}
  }

}

class StatsTable {
  constructor(db) {
    this.db = db
  }

  async getById(id) {
    const db = await this.db
    const rows = await (await this.db).all('SELECT status,headers,created_at FROM stats WHERE urlId = ?', String(id))
    return rows.map(({created_at, headers, status}) => Object.assign(JSON.parse(headers), { date: new Date(created_at), status }))
  }

  async add(id, status, meta) {
    id = String(id)
    status = Number(status)
    await (await this.db).run('INSERT INTO stats VALUES(?, ?, ?, datetime("now"))', id, status, JSON.stringify(meta))
    return {id, status, meta}
  }
}

app.post('/:id?', auth, urlFromBody(), asyncHandler(async (req, res) => {
  const urls = new UrlsTable(dbPromise)
  const result = await urls.getByUrl(req.params.url)
  if (result) {
    const conflict = Boolean(req.params.id)
    let plainMessage
    if (conflict) {
      plainMessage = `${result.url} already exists under id ${result.id}`
      res.status(409)
    } else {
      plainMessage = `Redirecting to ${result.url}`
      res.redirect(`${result.id}`)
    }
    res.format({
      'application/json': () => res.send(result),
      'text/html': () => res.render('redirect', result),
      default: () => res.send(plainMessage),
    })
  }
  const {id} = urls.add(req.params.url, req.params.id)
  res.redirect(`${id}`)
}))

app.get('/:id', asyncHandler(async (req, res) => {
  const result = await (new UrlsTable(dbPromise).getById(req.params.id))
  const stats = new StatsTable(dbPromise)
  stats.add(req.params.id, result ? 302 : 404, req.headers).catch(error => {
    console.log(`Could not save stats! ${error}`)
  })
  if (result) {
    // Cannot use `res.redirect` and `res.format` in same path
    res.status(302)
    res.header('Location', result.url)
    res.format({
      'application/json': () => res.send(result),
      'text/html': () => res.render('redirect', result),
      default: () => res.send(`Redirecting to ${result.url}`),
    })
  } else {
    res.status(404)
    res.format({
      'application/json': () => res.send({ code: 404 }),
      'text/html': () => res.render('404'),
      default: () => res.send(`Could not find ${id}`),
    })
  }
}))

app.get('/stats/:id', auth, asyncHandler(async (req, res) => {
  const result = await (new UrlsTable(dbPromise).getById(req.params.id))
  if (!result) {
    status = 404
    res.status(status)
    res.format({
      'application/json': () => res.send({ code: status }),
      'text/html': () => res.render('404'),
      default: () => res.send(`Could not find ${id}`),
    })
    return
  }
  const stats = await (new StatsTable(dbPromise)).getById(req.params.id)
  const json = { url: result.url, stats }
  res.format({
    'application/json': () => res.send(json),
    'text/html': () => res.render('redirect', json),
    default: () => res.send(`Try requesting JSON or HTML :)`),
  })
}))

app.listen(port)
