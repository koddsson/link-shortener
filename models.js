import {URL} from 'url'
import {LinksTable as SQLinksTable, StatsTable as SQStatsTable} from './models.sqlite'
import {LinksTable as MemLinksTable, StatsTable as MemStatsTable} from './models.memory'

export class LinksTable {

  constructor(url) {
    url = new URL(url)
    if (url.protocol === 'sqlite:') return new SQLinksTable(url)
    if (url.protocol === 'memory:') return new MemLinksTable(url)
    throw new Error(`unknown database protocol ${url.protocol}`)
  }

}

export class StatsTable {

  constructor(url) {
    url = new URL(url)
    if (url.protocol === 'sqlite:') return new SQStatsTable(url)
    if (url.protocol === 'memory:') return new MemStatsTable(url)
    throw new Error(`unknown database protocol ${url.protocol}`)
  }

}
