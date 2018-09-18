import { URL } from 'url'
import { randomBytes } from 'crypto'

const any = Symbol()
const dbs = {}
const opendb = url => {
  return (dbs[url] = dbs[url] || { links: [] })
}

export class LinksTable {
  constructor(id) {
    this.db = opendb(id).links
  }

  async migrate() {}

  async findBy({ id, url, created } = {}) {
    if (!id && !url && !created) return null
    id = id || any
    url = url || any
    created = created ? Number(new Date(created)) : any
    return (
      this.db.find(
        row =>
          (id == any || id == row.id) &&
          (url == any || url === row.url) &&
          (created === any || created === Number(row.created))
      ) || null
    )
  }

  async add({ id, created, url }) {
    id = String(id || '')
    created = created || new Date()
    url = String(url)
    if (!id) {
      let exists = true
      while (exists) {
        id += randomBytes(1).toString('hex')
        exists = Boolean(await this.findBy({ id }))
      }
    }
    const result = { id, url, created }
    this.db.push(result)
    return result
  }
}
