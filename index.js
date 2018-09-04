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
    (req, res, next) => {
      debug('extract url from body')
      let url = ''
      if (req.is('text')) {
        url = req.body.toString('utf-8')
        debug(`Found url as text: ${url}`)
      } else if (req.is('json')) {
        url = req.body.url
        debug(`Found url as json: ${url}`)
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

app.post('/', auth, urlFromBody(), async (req, res) => {
  const {url} = req.params
  const db = await dbPromise
  let results = await db.get('SELECT id FROM urls WHERE url = ?', String(url))
  debug(`got results: ${JSON.stringify(results)}`)
  if (results) {
    return res.redirect(`${results.id}`)
  }

  let id = Math.random().toString(36).slice(2)
  results = await db.get('SELECT id FROM urls WHERE id = ?', id)
  while(results) {
    results = await db.get('SELECT id FROM urls WHERE id = ?', id)
    id = Math.random().toString(36).slice(2)
  }

  await db.run('INSERT INTO urls VALUES(?, ?);', id, String(url))
  res.redirect(`${id}`)
})

app.post('/:id', urlFromBody(), async (req, res) => {
  const db = await dbPromise
  const url = await db.get('SELECT url FROM urls WHERE id = ?', req.params.id)
  if (url) {
    res.status(409).send('Already a URL with that id!')
  } else {
    await db.run('INSERT INTO urls VALUES(?, ?);', req.params.id, String(req.params.url))
    res.redirect(`${req.params.id}`)
  }
})

app.get('/:id', async (req, res) => {
  const db = await dbPromise
  const results = await db.get('SELECT url FROM urls WHERE id = ?', req.params.id)
  debug(`got results ${JSON.stringify(results)}`)
  if (results) {
    res.redirect(results.url)
    await db.run('INSERT INTO stats VALUES(?, ?, ?);', req.params.id, 200, JSON.stringify(req.headers))
  } else {
    res.status(404).send("Sorry can't find that!")
    await db.run('INSERT INTO stats VALUES(?, ?, ?);', req.params.id, 400, JSON.stringify(req.headers))
  }
})

app.listen(port)
