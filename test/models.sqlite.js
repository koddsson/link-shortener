import { tmpdir } from 'os'
import { LinksTable } from '../models.sqlite'
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
})
