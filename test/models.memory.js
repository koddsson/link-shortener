import { LinksTable } from '../models.memory'
import { expect } from 'chai'
import { describe, it, beforeEach } from 'mocha'

describe('memory models', () => {
  let id = 0
  beforeEach(() => id++)
  describe('LinksTable', () => {
    let links
    beforeEach(async () => {
      links = new LinksTable(id)
      await links.migrate()
    })

    it('adds rows with add()', async () => {
      const row = { url: 'https://example.com', id: 'a', created: new Date() }
      const result = await links.add(row)
      expect(result).to.deep.equal(row)
      expect(links.db).to.deep.equal([result])
    })

    it('will supply created if not given to add()', async () => {
      const row = { url: 'https://example.com', id: 'a' }
      const result = await links.add(row)
      expect(result)
        .to.have.property('created')
        .instanceof(Date)
      expect(Number(result.created)).to.be.closeTo(Date.now(), 100)
      expect(links.db).to.deep.equal([result])
    })

    it('will supply id if not given to add()', async () => {
      const result = await links.add({ url: 'https://example.com' })
      expect(result)
        .to.have.property('id')
        .that.is.a('string')
      expect(links.db).to.deep.equal([result])
    })

    it('will generate unique ids if not given to add()', async () => {
      const resultA = await links.add({ url: 'https://example.com' })
      const resultB = await links.add({ url: 'https://example.com' })
      expect(resultA)
        .to.have.property('id')
        .that.is.not.equal(resultB.id)
      expect(links.db).to.deep.equal([resultA, resultB])
    })

    it('returns null from findBy()', async () => {
      expect(await links.findBy()).to.equal(null)
    })

    it('returns row from findBy({id})', async () => {
      const result = { url: 'https://example.com', id: 'a', created: new Date() }
      links.db.push(result)
      expect(await links.findBy({ id: 'a' })).to.deep.equal(result)
      expect(await links.findBy({ id: 'https://example.com' })).to.equal(null)
      expect(await links.findBy({ id: 'non-existant' })).to.equal(null)
    })

    it('returns row from findBy({created})', async () => {
      const result = { url: 'https://example.com', id: 'a', created: new Date('2018-01-01') }
      links.db.push(result)
      expect(await links.findBy({ created: new Date('2018-01-01') }), 'real date').to.deep.equal(result)
      expect(await links.findBy({ created: '2018-01-01T00:00:00Z' }), 'string date').to.deep.equal(result)
      expect(await links.findBy({ created: 'https://example.com' }), 'other field').to.equal(null)
      expect(await links.findBy({ created: 'non-existant' }), 'non-existant').to.equal(null)
    })

    it('returns row from findBy({url})', async () => {
      const result = { url: 'https://example.com', id: 'a', created: new Date() }
      links.db.push(result)
      expect(await links.findBy({ url: 'https://example.com' })).to.deep.equal(result)
      expect(await links.findBy({ url: 'a' })).to.equal(null)
      expect(await links.findBy({ url: 'non-existant' })).to.equal(null)
    })
  })
})
