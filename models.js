import {URL} from 'url'
import {LinksTable as PgLinksTable, StatsTable as PgStatsTable} from './models.postgres'
import {LinksTable as SQLinksTable, StatsTable as SQStatsTable} from './models.sqlite'
import {LinksTable as MemLinksTable, StatsTable as MemStatsTable} from './models.memory'

export class LinksTable {

  constructor(url) {
    url = new URL(url)
    if (url.protocol === 'postgresql:') return new PgLinksTable(url.toString())
    if (url.protocol === 'sqlite:') return new SQLinksTable(url.toString())
    if (url.protocol === 'memory:') return new MemLinksTable(url.toString())
    throw new Error(`unknown database protocol ${url.protocol}`)
  }

}

export class StatsTable {

  constructor(url) {
    url = new URL(url)
    if (url.protocol === 'postgresql:') return new PgStatsTable(url.toString())
    if (url.protocol === 'sqlite:') return new SQStatsTable(url.toString())
    if (url.protocol === 'memory:') return new MemStatsTable(url.toString())
    throw new Error(`unknown database protocol ${url.protocol}`)
  }

}
