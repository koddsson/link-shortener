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
  if (req.header('auth') !== process.env.AUTH_HEADER) {
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

class UrlsTable {
  constructor(db) {
    this.db = db
  }

  async getById(id) {
    return (await this.db).get('SELECT url,id FROM urls WHERE id = ? LIMIT 1', String(id))
  }

  async getByUrl(url) {
    return (await this.db).get('SELECT url,id FROM urls WHERE url = ? LIMIT 1', String(url))
  }

  async hasId(id) {
    return (await (await this.db).get('SELECT COUNT(id) FROM urls WHERE id = ?', String(id))) > 0
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
    await (await this.db).run('INSERT INTO urls VALUES(?, ?)', id, url)
    return {id, url}
  }

}

class StatsTable {
  constructor(db) {
    this.db = db
  }

  async add(id, status, meta) {
    id = String(id)
    status = Number(status)
    await (await this.db).run('INSERT INTO stats VALUES(?, ?, ?)', id, status, JSON.stringify(meta))
    return {id, status, meta}
  }
}

app.post('/:id?', urlFromBody(), asyncHandler(async (req, res) => {
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
  let status
  stats.add(req.params.id, status, req.headers).catch(error => {
    console.log(`Could not save stats! ${error}`)
  })
  if (result) {
    status = 302
    // Cannot use `res.redirect` and `res.format` in same path
    res.status(status)
    res.header('Location', result.url)
    res.format({
      'application/json': () => res.send(result),
      'text/html': () => res.render('redirect', result),
      default: () => res.send(`Redirecting to ${result.url}`),
    })
  } else {
    status = 404
    res.status(status)
    res.format({
      'application/json': () => res.send({ code: status }),
      'text/html': () => res.render('404'),
      default: () => res.send(`Could not find ${id}`),
    })
  }
}))

app.listen(port)
