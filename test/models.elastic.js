import { tmpdir } from 'os'
import { LinksTable } from '../models.elastic'
import { expect } from 'chai'
import { describe, it, beforeEach } from 'mocha'
import nock from 'nock'

describe('models: elastic', () => {
  describe('LinksTable', () => {
    let links
    let scope
    let url
    let created
    beforeEach(async () => {
      links = new LinksTable('http://localhost:9200')
      url = 'https://example.com'
      created = new Date()
      scope = nock('http://localhost:9200')
        .get('/links')
        .reply(200, {})
        .put('/links/_mappings/link')
        .reply(200, {})
        .put(/links\/link\/\w+$/, row => row.url && row['@timestamp'])
        .optionally()
        .times(2)
        .reply(201, { result: 'created' })
      await links.migrate()
    })

    afterEach(() => scope.done())

    it('adds rows with add()', async () => {
      const row = { url, id: 'a', created }
      expect(await links.add(row)).to.deep.equal(row)
    })

    it('will supply created if not given to add()', async () => {
      const result = await links.add({ url, id: 'a' })
      expect(result)
        .to.have.property('created')
        .instanceof(Date)
      expect(Number(result.created)).to.be.closeTo(Number(created), 100)
    })

    it('will supply id if not given to add()', async () => {
      const result = await links.add({ url })
      expect(result)
        .to.have.property('id')
        .that.is.a('string')
      expect(result).to.have.keys(['id', 'url', 'created'])
      expect(result)
        .to.have.property('created')
        .instanceof(Date)
      expect(Number(result.created)).to.be.closeTo(Number(created), 100)
      expect(result)
        .to.have.property('id')
        .match(/^[a-z0-9]{2}$/)
    })

    it('will generate unique ids if not given to add()', async () => {
      const resultA = await links.add({ url })
      const resultB = await links.add({ url })
      expect(resultA)
        .to.have.property('id')
        .that.is.not.equal(resultB.id)
    })

    it('returns null from findBy()', async () => {
      expect(await links.findBy()).to.equal(null)
    })

    it('returns row from findBy({id})', async () => {
      const result = { url: 'https://example.com', id: 'a', created: new Date() }
      scope
        .get('/links/link/a/_source')
        .reply(200, { '@timestamp': result.created, url: result.url })
        .get(/.*/)
        .reply(404)
      expect(await links.findBy({ id: 'a' })).to.deep.equal(result)
      expect(await links.findBy({ id: 'https://example.com' })).to.equal(null)
      expect(await links.findBy({ id: 'non-existant' })).to.equal(null)
    })

    it('returns row from findBy({created})', async () => {
      const result = { url: 'https://example.com', id: 'a', created: new Date('2018-01-01') }
      scope
        .persist()
        .post('/links/link/_search', body =>
          Boolean(
            body.query &&
              body.query.constant_score &&
              body.query.constant_score.filter &&
              body.query.constant_score.filter.term &&
              '@timestamp' in body.query.constant_score.filter.term
          )
        )
        .reply(200, (uri, request) => ({
          hits: {
            hits: [
              {
                _id: 'a',
                _source: {
                  '@timestamp': '2018-01-01T00:00:00.000Z',
                  url: 'https://example.com',
                },
              },
            ].filter(row => row._source['@timestamp'] === request.query.constant_score.filter.term['@timestamp']),
          },
        }))
      expect(await links.findBy({ created: new Date('2018-01-01') }), 'real date').to.deep.equal(result)
      expect(await links.findBy({ created: '2018-01-01T00:00:00Z' }), 'string date').to.deep.equal(result)
      expect(await links.findBy({ created: '2019-01-01T00:00:00Z' }), 'wrong date').to.deep.equal(null)
      expect(await links.findBy({ created: 'https://example.com' }), 'other field').to.equal(null)
      expect(await links.findBy({ created: 'non-existant' }), 'non-existant').to.equal(null)
    })

    it('returns row from findBy({url})', async () => {
      const result = { url: 'https://example.com', id: 'a', created: new Date('2018-01-01') }
      scope
        .persist()
        .post('/links/link/_search', body => Boolean(body.query && body.query.match && 'url' in body.query.match))
        .reply(200, (uri, request) => ({
          hits: {
            hits: [
              {
                _id: 'a',
                _source: {
                  '@timestamp': '2018-01-01T00:00:00.000Z',
                  url: 'https://example.com',
                },
              },
            ].filter(row => row._source.url === request.query.match.url),
          },
        }))
      expect(await links.findBy({ url: 'https://example.com' })).to.deep.equal(result)
      expect(await links.findBy({ url: 'a' })).to.equal(null)
      expect(await links.findBy({ url: 'non-existant' })).to.equal(null)
    })
  })
})
