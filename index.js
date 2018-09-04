const express = require('express')
const sqlite = require('sqlite')
const bodyParser = require('body-parser')
const debug = require('debug')('link-shortener')
const {URL} = require('url')

const dbPromise = sqlite.open('./urls.db', { Promise })
const port = process.env.PORT || 3000
const app = express()

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
    if (!id) {
      let exists = true
      while(exists) {
        id = Math.random().toString(36).slice(2)
        exists = await this.hasId(id)
      }
    }
    id = String(id)
    await (await this.db).run('INSERT INTO urls VALUES(?, ?)', id, url)
    return {id, url}
  }

}

app.post('/', auth, urlFromBody(), asyncHandler(async (req, res) => {
  const urls = new UrlsTable(dbPromise)
  const result = await urls.getByUrl(req.params.url)
  if (result) {
    return res.redirect(`${result.id}`)
  }
  const {id} = await urls.add(req.params.url)
  res.redirect(`${id}`)
}))

app.post('/:id', urlFromBody(), asyncHandler(async (req, res) => {
  const urls = new UrlsTable(dbPromise)
  const result = await urls.getByUrl(req.params.url)
  if (result) {
    return res.status(409).send('Already a URL with that id!')
  }
  const {id} = urls.add(req.params.url, req.params.id)
  res.redirect(`${id}`)
}))

app.get('/:id', asyncHandler(async (req, res) => {
  const result = await (new UrlsTable(dbPromise).getById(req.params.id))
  if (result) {
    res.redirect(result.url)
    await (await dbPromise).run('INSERT INTO stats VALUES(?, ?, ?);', result.id, 200, JSON.stringify(req.headers))
  } else {
    res.status(404).send("Sorry can't find that!")
    await (await dbPromise).run('INSERT INTO stats VALUES(?, ?, ?);', req.params.id, 400, JSON.stringify(req.headers))
  }
}))

app.listen(port)
