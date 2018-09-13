import { tmpdir } from 'os'
import { LinksTable, StatsTable } from '../models.sqlite'
import { unlink } from 'fs'
import { promisify } from 'util'
import { open } from 'sqlite'
import { expect } from 'chai'
import { describe, it, beforeEach } from 'mocha'

describe('sqlite models', () => {
  let id = 0
  let tableFile = ''
  beforeEach(done => {
    id++
    tableFile = `${tmpdir()}/${id}.db`
    unlink(tableFile, () => done())
  })
  describe('LinksTable', () => {
    let links
    beforeEach(async () => {
      links = new LinksTable(`sqlite://${tableFile}`)
      await links.migrate()
    })

    it('migrates with migrate()', async () => {
      await links.migrate()
    })

    it('adds rows with add()', async () => {
      const row = { url: 'https://example.com', id: 'a', created: new Date() }
      const result = await links.add(row)
      expect(result).to.deep.equal(row)
      const dbRow = await (await open(tableFile)).get('SELECT * FROM links WHERE id = "a"')
      result.created = result.created.toJSON()
      expect(dbRow).to.deep.equal(result)
    })

    it('will supply created if not given to add()', async () => {
      const row = { url: 'https://example.com', id: 'a' }
      const result = await links.add(row)
      expect(result)
        .to.have.property('created')
        .instanceof(Date)
      expect(Number(result.created)).to.be.closeTo(Date.now(), 100)
      const dbRow = await (await open(tableFile)).get('SELECT * FROM links WHERE id = "a"')
      result.created = result.created.toJSON()
      expect(dbRow).to.deep.equal(result)
    })

    it('will supply id if not given to add()', async () => {
      const result = await links.add({ url: 'https://example.com' })
      expect(result)
        .to.have.property('id')
        .that.is.a('string')
      const dbRow = await (await open(tableFile)).get('SELECT * FROM links WHERE id = ?', result.id)
      result.created = result.created.toJSON()
      expect(dbRow).to.deep.equal(result)
    })

    it('will generate unique ids if not given to add()', async () => {
      const resultA = await links.add({ url: 'https://example.com' })
      const resultB = await links.add({ url: 'https://example.com' })
      expect(resultA)
        .to.have.property('id')
        .that.is.not.equal(resultB.id)
      const dbRowA = await (await open(tableFile)).get('SELECT * FROM links WHERE id = ?', resultA.id)
      const dbRowB = await (await open(tableFile)).get('SELECT * FROM links WHERE id = ?', resultB.id)
      resultA.created = resultA.created.toJSON()
      resultB.created = resultB.created.toJSON()
      expect(dbRowA).to.deep.equal(resultA)
      expect(dbRowB).to.deep.equal(resultB)
    })

    it('returns null from findBy()', async () => {
      expect(await links.findBy()).to.equal(null)
    })

    it('returns row from findBy({id})', async () => {
      const result = { url: 'https://example.com', id: 'a', created: new Date() }
      const db = await open(tableFile)
      await db.run(
        'INSERT INTO links (id, created, url) VALUES(?, ?, ?)',
        result.id,
        result.created.toJSON(),
        result.url
      )
      expect(await links.findBy({ id: 'a' })).to.deep.equal(result)
      expect(await links.findBy({ id: 'https://example.com' })).to.equal(null)
      expect(await links.findBy({ id: 'non-existant' })).to.equal(null)
    })

    it('returns row from findBy({created})', async () => {
      const result = { url: 'https://example.com', id: 'a', created: new Date('2018-01-01') }
      const db = await open(tableFile)
      await db.run(
        'INSERT INTO links (id, created, url) VALUES(?, ?, ?)',
        result.id,
        result.created.toJSON(),
        result.url
      )
      expect(await links.findBy({ created: new Date('2018-01-01') }), 'real date').to.deep.equal(result)
      expect(await links.findBy({ created: '2018-01-01T00:00:00Z' }), 'string date').to.deep.equal(result)
      expect(await links.findBy({ created: 'https://example.com' }), 'other field').to.equal(null)
      expect(await links.findBy({ created: 'non-existant' }), 'non-existant').to.equal(null)
    })

    it('returns row from findBy({url})', async () => {
      const result = { url: 'https://example.com', id: 'a', created: new Date() }
      const db = await open(tableFile)
      await db.run(
        'INSERT INTO links (id, created, url) VALUES(?, ?, ?)',
        result.id,
        result.created.toJSON(),
        result.url
      )
      expect(await links.findBy({ url: 'https://example.com' })).to.deep.equal(result)
      expect(await links.findBy({ url: 'a' })).to.equal(null)
      expect(await links.findBy({ url: 'non-existant' })).to.equal(null)
    })
  })

  describe('StatsTable', () => {
    let stats
    beforeEach(async () => {
      stats = new StatsTable(`sqlite://${tableFile}`)
      await stats.migrate()
    })

    it('migrates with migrate()', async () => {
      await stats.migrate()
    })

    it('adds rows with add()', async () => {
      const row = { page: 'a', status: 200, created: new Date(), agent: 'mocha', ip: '1.1.1.1' }
      const result = await stats.add(row)
      expect(result).to.deep.equal(row)
      const dbRow = await (await open(tableFile)).get('SELECT * FROM stats WHERE page = "a"')
      result.created = result.created.toJSON()
      expect(dbRow).to.deep.equal(result)
    })

    it('will supply created if not given to add()', async () => {
      const row = { page: 'a', status: 200, agent: 'mocha', ip: '1.1.1.1' }
      const result = await stats.add(row)
      expect(result)
        .to.have.property('created')
        .instanceof(Date)
      expect(Number(result.created)).to.be.closeTo(Date.now(), 100)
      const dbRow = await (await open(tableFile)).get('SELECT * FROM stats WHERE page = "a"')
      result.created = result.created.toJSON()
      expect(dbRow).to.deep.equal(result)
    })

    it('returns count of rows grouped by page from countBy({page})', async () => {
      await stats.add({ page: 'a', status: 200, agent: 'mocha', ip: '1.1.1.1' })
      await stats.add({ page: 'a', status: 200, agent: 'mocha', ip: '1.1.1.1' })
      await stats.add({ page: 'b', status: 200, agent: 'mocha', ip: '1.1.1.1' })
      expect(await stats.countBy('page')).to.deep.equal({
        'a': 2,
        'b': 1
      })
    })

    it('returns [] from allBy()', async () => {
      expect(await stats.allBy()).to.deep.equal([])
    })

    it('returns rows from allBy({page})', async () => {
      const result = { page: 'a', status: 200, created: new Date(), agent: 'mocha', ip: '1.1.1.1' }
      const db = await open(tableFile)
      await db.run(
        'INSERT INTO stats (page, created, status, agent, ip) VALUES(?, ?, ?, ?, ?)',
        result.page,
        result.created.toJSON(),
        result.status,
        result.agent,
        result.ip
      )
      expect(await stats.allBy({ page: 'a' })).to.deep.equal([result])
      expect(await stats.allBy({ page: 'https://example.com' })).to.deep.equal([])
      expect(await stats.allBy({ page: 'non-existant' })).to.deep.equal([])
    })

    it('returns rows from allBy({status})', async () => {
      const result = { page: 'a', status: 200, created: new Date(), agent: 'mocha', ip: '1.1.1.1' }
      const db = await open(tableFile)
      await db.run(
        'INSERT INTO stats (page, created, status, agent, ip) VALUES(?, ?, ?, ?, ?)',
        result.page,
        result.created.toJSON(),
        result.status,
        result.agent,
        result.ip
      )
      expect(await stats.allBy({ status: 200 })).to.deep.equal([result])
      expect(await stats.allBy({ status: 'https://example.com' })).to.deep.equal([])
      expect(await stats.allBy({ status: 404 })).to.deep.equal([])
    })

    it('returns rows from allBy({agent})', async () => {
      const result = { page: 'a', status: 200, created: new Date(), agent: 'mocha', ip: '1.1.1.1' }
      const db = await open(tableFile)
      await db.run(
        'INSERT INTO stats (page, created, status, agent, ip) VALUES(?, ?, ?, ?, ?)',
        result.page,
        result.created.toJSON(),
        result.status,
        result.agent,
        result.ip
      )
      expect(await stats.allBy({ agent: 'mocha' })).to.deep.equal([result])
      expect(await stats.allBy({ agent: 'https://example.com' })).to.deep.equal([])
      expect(await stats.allBy({ agent: 'Chrome' })).to.deep.equal([])
    })

    it('returns rows from allBy({ip})', async () => {
      const result = { page: 'a', status: 200, created: new Date(), agent: 'mocha', ip: '1.1.1.1' }
      const db = await open(tableFile)
      await db.run(
        'INSERT INTO stats (page, created, status, agent, ip) VALUES(?, ?, ?, ?, ?)',
        result.page,
        result.created.toJSON(),
        result.status,
        result.agent,
        result.ip
      )
      expect(await stats.allBy({ ip: '1.1.1.1' })).to.deep.equal([result])
      expect(await stats.allBy({ ip: 'https://example.com' })).to.deep.equal([])
      expect(await stats.allBy({ ip: '1.2.1.1' })).to.deep.equal([])
    })

    it('returns rows from allBy({created})', async () => {
      const result = { page: 'a', status: 200, created: new Date('2018-01-01'), agent: 'mocha', ip: '1.1.1.1' }
      const db = await open(tableFile)
      await db.run(
        'INSERT INTO stats (page, created, status, agent, ip) VALUES(?, ?, ?, ?, ?)',
        result.page,
        result.created.toJSON(),
        result.status,
        result.agent,
        result.ip
      )
      expect(await stats.allBy({ created: new Date('2018-01-01') }), 'real date').to.deep.equal([result])
      expect(await stats.allBy({ created: '2018-01-01T00:00:00Z' }), 'string date').to.deep.equal([result])
      expect(await stats.allBy({ created: 'https://example.com' }), 'other field').to.deep.equal([])
      expect(await stats.allBy({ created: 'non-existant' }), 'non-existant').to.deep.equal([])
    })

    it('returns rows from allBy(<combination of fields>)', async () => {
      const result = { page: 'a', status: 200, created: new Date('2018-01-01'), agent: 'mocha', ip: '1.1.1.1' }
      const db = await open(tableFile)
      await db.run(
        'INSERT INTO stats (page, created, status, agent, ip) VALUES(?, ?, ?, ?, ?)',
        result.page,
        result.created.toJSON(),
        result.status,
        result.agent,
        result.ip
      )
      expect(await stats.allBy({ created: new Date('2018-01-01'), status: 200 }), 'real date').to.deep.equal([result])
      expect(await stats.allBy({ created: new Date('2018-01-01'), status: 300 }), 'real date').to.deep.equal([])
      expect(await stats.allBy({ page: 'a', status: 200 }), 'string date').to.deep.equal([result])
      expect(await stats.allBy({ page: 'b', status: 200 }), 'string date').to.deep.equal([])
    })
  })
})
