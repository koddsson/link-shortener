import { URL } from 'url'
import { randomBytes } from 'crypto'
import fetch, { Request } from 'node-fetch'
import { LinksTable as MemLinks } from './models.memory'

const prepareId = id => id.replace(/[^\w-]/g, '_').replace(/_+/g, '_')

const createFetcher = domain => async (path, initOptions = {}) => {
  const url = `${domain}${path}`
  if (typeof initOptions.body === 'object') initOptions.body = JSON.stringify(initOptions.body)
  const request = new Request(url, initOptions)
  request.headers.set('Accept', 'application/json')
  request.headers.set('Content-Type', 'application/json')
  const response = await fetch(request)
  const json = await response.json()
  if (!response.ok) {
    console.error(json)
    throw new Error(json.error && json.error.reason ? json.error.reason : json.error || json)
  }
  return json
}

export class LinksTable {
  constructor(url) {
    this.db = createFetcher(new URL(url))
    this.cache = new MemLinks(url)
  }

  async migrate() {
    try {
      // Check if links index exists
      await this.db('links')
    } catch (e) {
      // Links index does not exist, create it
      await this.db('links', {
        method: 'PUT',
        body: {
          settings: {
            index: { number_of_shards: 1 },
          },
        },
      })
    }

    await this.db('links/_mappings/link', {
      method: 'PUT',
      body: {
        properties: {
          '@timestamp': {
            type: 'date',
          },
          url: {
            type: 'text',
            analyzer: 'standard',
          },
        },
      },
    })
  }

  async findBy({ id, url, created } = {}) {
    if (!id && !url && !created) return null
    let result
    if (id) {
      id = prepareId(id)
      try {
        result = await this.db(`links/link/${id}/_source`)
      } catch (e) {
        return null
      }
      result = { id, url: result.url, created: new Date(result['@timestamp']) }
      this.cache.add(result)
      return result
    } else if (url) {
      const response = await this.db(`links/link/_search`, {
        method: 'POST',
        body: { query: { match: { url } } },
      })
      const result = response.hits.hits.filter(row => row._source.url === url)[0]
      if (!result) return null
      return { id: result._id, url: result._source.url, created: new Date(result._source['@timestamp']) }
    } else if (created) {
      const timestamp = new Date(created).toJSON()
      if (!timestamp) return null
      const response = await this.db(`links/link/_search`, {
        method: 'POST',
        body: { query: { constant_score: { filter: { term: { '@timestamp': timestamp } } } } },
      })
      const result = response.hits.hits[0]
      if (!result) return null
      return { id: result._id, url: result._source.url, created: new Date(result._source['@timestamp']) }
    }
    return null
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
    id = prepareId(id)
    const result = await this.db(`links/link/${id}`, {
      method: 'PUT',
      body: { '@timestamp': created, url },
    })
    if (result.result === 'created') {
      this.cache.add({ url, id, created })
      return { url, id, created }
    } else {
      throw new Error(`Unexpected result ${result.result}`)
    }
  }
}
