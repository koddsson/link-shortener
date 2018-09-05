const sqlite = require('sqlite')
const {readFile} = require('fs')
const {promisify} = require('util')
const readFileAsync = promisify(readFile)
!(async () => {
  const db = await sqlite.open('./urls.db', { Promise })

  await db.run(await readFileAsync('./urls.sql', 'utf-8'))
  await db.run(await readFileAsync('./stats.sql', 'utf-8'))
})().catch(e => {
  console.error(e)
  process.exit(1)
})
