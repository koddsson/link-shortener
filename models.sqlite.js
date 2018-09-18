import { URL } from 'url'
import { randomBytes } from 'crypto'
import { open } from 'sqlite'
import SQL from 'sql-template-strings'
import { LinksTable as MemLinks } from './models.memory'

const dbs = {}
const opendb = url => {
  const path = new URL(url).pathname
  return (dbs[path] = dbs[path] || open(path))
}

export class LinksTable {
  constructor(url) {
    this.url = url
    this.db = opendb(url)
    this.cache = new MemLinks(url)
  }

  async migrate() {
    try {
      await this.cache.migrate()
      await (await this.db).run(SQL`
        CREATE TABLE IF NOT EXISTS links (
          id varchar(128),
          created text,
          url text
        );
      `)
      await (await this.db).run('PRAGMA user_version = 1;')
    } catch (error) {
      if (error.code === 'SQLITE_CANTOPEN') {
        console.log(`Unable to open database file: ${this.url}`)
        process.exit(1)
      }
      throw error
    }
  }

  async findBy({ id, url, created } = {}) {
    if (!id && !url && !created) return null
    let result = await this.cache.findBy({ id, url, created })
    if (result) return result
    const sql = SQL`SELECT * FROM links WHERE true `
    if (id) sql.append(SQL`AND id = ${id}`)
    if (url) sql.append(SQL`AND url = ${url}`)
    if (created) sql.append(SQL`AND created = ${new Date(created).toJSON()}`)
    result = await (await this.db).get(sql.append('LIMIT 1'))
    if (result) {
      result.created = new Date(result.created)
      this.cache.add(result)
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
    await (await this.db).run(SQL`INSERT INTO links (id, created, url) VALUES(${id}, ${created.toJSON()}, ${url})`)
    const result = { id, url, created }
    this.cache.db.push(result)
    return result
  }
}
