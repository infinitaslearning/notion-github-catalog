const core = require('@actions/core')

const loadData = async ({ notion }) => {
  const systemDb = core.getInput('system_database')
  const ownerDb = core.getInput('owner_database')
  const serviceDb = core.getInput('database')

  const getDatabaseRows = async (databaseId, rowFunction, startCursor) => {
    try {
      const pageRows = await notion.databases.query({
        database_id: databaseId,
        start_cursor: startCursor
      })
      pageRows.results.forEach(rowFunction)
      if (pageRows.has_more) {
        return await getDatabaseRows(databaseId, rowFunction, pageRows.next_cursor)
      }
    } catch (ex) {
      error = true
      core.error(`Failed to retrieve data: ${ex.message}`)
    }
  }

  // Get core DB structure
  const dbStructure = await notion.databases.retrieve({
    database_id: serviceDb
  })
  const structure = Object.keys(dbStructure.properties).map((property) => {
    return { name: dbStructure.properties[property].name, type: dbStructure.properties[property].type }
  })

  // Get the system and owner db
  const systems = {}
  if (systemDb) {
    await getDatabaseRows(systemDb, (row) => {
      const name = row.properties.Name?.title[0]?.plain_text?.toLowerCase()
      if (name) systems[name] = row.id
    })
  }

  const owners = {}
  if (ownerDb) {
    await getDatabaseRows(ownerDb, (row) => {
      const name = row.properties.Name?.title[0]?.plain_text?.toLowerCase()
      if (name) owners[name] = row.id
    })
  }

  let error = false

  if (ownerDb && !owners.unknown) {
    error = true
    core.error('Your owner table does not contain an "unknown" row!')
  }
  if (systemDb && !systems.unknown) {
    error = true
    core.error('Your system table does not contain an "unknown" row!')
  }

  // Get the current service matrix and hashes in bulk to speed up updates
  const services = {}
  await getDatabaseRows(serviceDb, (item) => {
    const pageId = item.id
    const pageHash = item.properties?.Hash?.rich_text[0]?.text?.content
    const pageName = item.properties?.Name?.title[0]?.text?.content
    services[pageName] = { pageId, pageHash }
  })

  if (error) {
    process.exit(1)
  }

  return {
    systems,
    owners,
    structure,
    services
  }
}

exports.loadData = loadData
