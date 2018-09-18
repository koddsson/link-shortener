import { URL } from 'url'
import { LinksTable as SQLinksTable } from './models.sqlite'
import { LinksTable as MemLinksTable } from './models.memory'
import createDebug from 'debug'
import dotenv from 'dotenv'

const debug = createDebug('models')
dotenv.config()

export class LinksTable {
  constructor(url) {
    url = new URL(url)
    if (url.protocol === 'sqlite:') return new SQLinksTable(url.toString())
    if (url.protocol === 'memory:') return new MemLinksTable(url.toString())
    throw new Error(`unknown database protocol ${url.protocol}`)
  }
}

if (require.main === module) {
  debug(`Migrating ${process.env.DB}`)
  new LinksTable(process.env.DB).migrate().then(() => console.log(`Migrations complete`))
}
