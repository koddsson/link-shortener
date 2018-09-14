import editLinksApp from '../editlinks'
import { LinksTable, StatsTable } from '../models'
import chai, { expect } from 'chai'
import chaiHttp from 'chai-http'
import { describe, it, beforeEach } from 'mocha'
chai.use(chaiHttp)
const { request } = chai

describe('edit links app', () => {
  let app
  let id = 0
  beforeEach(() => {
    id++
    editLinksApp.context.database = `memory://${id}`
    editLinksApp.context.authToken = 'foobar'
    app = request(editLinksApp.callback())
  })

  describe('POST /', () => {
    it('accepts url encoded `url` field', async () => {
      const response = await app
        .post('/')
        .redirects(0)
        .type('form')
        .send({ url: 'https://example.com' })
      expect(response)
        .to.have.status(302)
        .and.have.header('location')
    })

    it('rejects url encoded `url` field if url is empty', async () => {
      const response = await app
        .post('/')
        .redirects(0)
        .type('form')
        .send({ url: '' })
      expect(response).to.have.status(400)
    })

    it('accepts and returns json encoded `url` field', async () => {
      const response = await app
        .post('/')
        .redirects(0)
        .type('json')
        .accept('json')
        .send({ url: 'https://example.com' })
      expect(response)
        .to.have.status(302)
        .and.have.header('location')
        .and.have.property('body')
        .with.keys(['created', 'id', 'url'])
        .and.property('url', 'https://example.com')
    })

    it('rejects json encoded `url` field if url is empty', async () => {
      const response = await app
        .post('/')
        .redirects(0)
        .type('json')
        .accept('json')
        .send({ url: '' })
      expect(response).to.have.status(400)
    })

    it('accepts plain text encoded `url` field', async () => {
      const response = await app
        .post('/')
        .redirects(0)
        .type('text')
        .accept('text')
        .send('https://example.com')
      expect(response)
        .to.have.status(302)
        .and.have.header('location')
        .and.have.property('text')
        .that.contains('Redirecting to')
    })

    it('rejects plain text encoded `url` field if url is empty', async () => {
      const response = await app
        .post('/')
        .redirects(0)
        .type('text')
        .accept('text')
        .send('')
      expect(response).to.have.status(400)
    })

    it('returns html if asked for it', async () => {
      const response = await app
        .post('/')
        .redirects(0)
        .type('form')
        .accept('html')
        .send({ url: 'https://example.com' })
      expect(response)
        .to.have.status(302)
        .and.have.header('location')
        .and.have.property('text')
        .that.contains('<!DOCTYPE html>')
    })
  })

  describe('POST /:id', () => {
    it('accepts url encoded `url` field', async () => {
      const response = await app
        .post('/aa')
        .redirects(0)
        .type('form')
        .send({ url: 'https://example.com' })
      expect(response)
        .to.have.status(302)
        .and.have.header('location', 'aa')
    })

    it('accepts and returns json encoded `url` field', async () => {
      const response = await app
        .post('/aa')
        .redirects(0)
        .type('json')
        .accept('json')
        .send({ url: 'https://example.com' })
      expect(response)
        .to.have.status(302)
        .and.have.header('location', 'aa')
        .and.have.property('body')
        .with.keys(['created', 'id', 'url'])
        .and.property('url', 'https://example.com')
    })

    it('accepts plain text encoded `url` field', async () => {
      const response = await app
        .post('/aa')
        .redirects(0)
        .type('text')
        .accept('text')
        .send('https://example.com')
      expect(response)
        .to.have.status(302)
        .and.have.header('location', 'aa')
        .and.have.property('text')
        .that.contains('Redirecting to')
    })

    it('conflicts if giving the same url twice', async () => {
      app.keepOpen()
      let response = await app
        .post('/aa')
        .redirects(0)
        .type('json')
        .accept('json')
        .send({ url: 'https://example.com' })
      const created = response.body.created
      expect(response)
        .to.have.status(302)
        .and.have.header('location', 'aa')
      response = await app
        .post('/aa')
        .redirects(0)
        .type('form')
        .accept('json')
        .send({ url: 'https://example.com' })
      expect(response)
        .to.have.status(409)
        .and.have.header('location', 'aa')
        .and.have.property('body')
        .deep.equal({ url: 'https://example.com', id: 'aa', created })
    })
  })
})
