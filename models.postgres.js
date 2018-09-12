import {URL} from 'url'
import {randomBytes} from 'crypto'
import {Pool} from 'pg'
import SQL from 'sql-template-strings'
import {LinksTable as MemLinks} from './models.memory'
import {LinksTable as SQLLinks, StatsTable as SQLStats} from './models.sqlite'

const dbs = {}
const opendb = url => {
  dbs[url] = dbs[url] || new Pool({ connectionString: url })
  return dbs[url]
}

export class LinksTable {
  constructor(url) {
    this.db = opendb(url)
    this.database = new URL(url).pathname
    this.cache = new MemLinks(url)
  }

  async migrate() {
    await this.cache.migrate()
    await this.db.query(SQL`
      CREATE TABLE IF NOT EXISTS links (
        id varchar(128),
        created date,
        url text
      )
    `);
  }

  async findBy({ id, url, created } = {}) {
    if (!id && !url && !created) return null
    let result = await this.cache.findBy({ id, url, created })
    if (result) return result
    const sql = SQL`SELECT * FROM links WHERE true `
    if (id) sql.append(SQL`AND id = ${id}`)
    if (url) sql.append(SQL`AND url = ${url}`)
    if (created) sql.append(SQL`AND created = ${new Date(created).toJSON()}`)
    result = (await this.db.query(sql.append('LIMIT 1'))).rows[0]
    if (result) {
      this.cache.add(result)
      return result
    }
    return result || null
  }

  async add({ url, id = '', created = Date.now() }) {
    url = String(url)
    id = String(id)
    created = new Date(created)
    if (!id) {
      let exists = true
      while (exists) {
        id += randomBytes(1).toString('hex')
        exists = Boolean(await this.findBy({ id }))
      }
    }
    await this.db.query(SQL`INSERT INTO links (id, created, url) VALUES(${id}, ${created.toJSON()}, ${url})`)
    const result = { id, url, created }
    // this.cache.db.push(result)
    return result
  }
}

export class StatsTable {
  constructor(url) {
    this.db = opendb(url)
  }

  async migrate() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS stats (
        page varchar(128),
        date date,
        status smallint,
        agent text,
        ip text
      );
    `)
  }

  async countBy(column) {
    if (!['page', 'created', 'status', 'agent', 'ip'].includes(column)) {
      throw new Error('countBy called with invalid column')
    }
    const rows = await this.db.query(`SELECT count(${column}) as v, ${column} as k FROM stats GROUP BY ${column}`)
    return rows.reduce((obj, {k, v}) => {
      obj[k] = v
      return obj
    }, {})
  }

  async allBy({ page, created, status, agent, ip } = {}) {
    if (!page && !created && !status && !agent && !ip) return []
    const sql = SQL`SELECT * FROM stats WHERE true `
    if (page) sql.append(SQL`AND page = ${page}`)
    if (created) sql.append(SQL`AND created = ${new Date(created).toJSON()}`)
    if (status) sql.append(SQL`AND status = ${status}`)
    if (agent) sql.append(SQL`AND agent = ${agent}`)
    if (ip) sql.append(SQL`AND ip = ${ip}`)
    return (await this.db.query(sql)).rows.map(row =>
      Object.assign(row, { created: new Date(row.created) })
    )
  }

  async add({ page, created = Date.now(), status, agent, ip }) {
    page = String(page)
    created = new Date(created)
    status = Number(status)
    agent = String(agent)
    ip = String(ip)
    await this.db.query(
      SQL`INSERT INTO stats (page, created, status, agent, ip) VALUES(${page}, ${created.toJSON()}, ${status}, ${agent}, ${ip})`
    )
    return { page, created, status, agent, ip }
  }
}
