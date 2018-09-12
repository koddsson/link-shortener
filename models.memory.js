import { URL } from 'url'
import { randomBytes } from 'crypto'

const any = Symbol()
const dbs = {}
const opendb = url => {
  return (dbs[url] = dbs[url] || { links: [], stats: [] })
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

export class StatsTable {
  constructor(id) {
    this.db = opendb(id).stats
  }

  async migrate() {}

  async countBy(column) {
    return this.db.reduce((obj, row) => {
      obj[row[column]] = (obj[row[column]] || 0) + 1
      return obj
    }, {})
  }

  async allBy({ page, created, status, agent, ip } = {}) {
    page = page || any
    created = created ? Number(new Date(created)) : any
    status = status ? Number(status) : any
    agent = agent || any
    ip = ip || any
    return this.db.filter(
      row =>
        (page == any || page == row.page) &&
        (created == any || created == Number(row.created)) &&
        (status == any || status == row.status) &&
        (agent == any || agent == row.agent) &&
        (ip == any || ip == row.ip)
    )
  }

  async add({ page, created, status, agent, ip }) {
    page = String(page)
    created = created || new Date()
    status = Number(status)
    agent = String(agent)
    ip = String(ip)
    const result = { page, created, status, agent, ip }
    this.db.push(result)
    return result
  }
}
