const core = require('@actions/core')

const loadData = async ({ notion }) => {
  const systemDb = core.getInput('system_database')
  const ownerDb = core.getInput('owner_database')
  const database = core.getInput('database')

  const processRows = (data) => {
    const parent = {}
    data.results.forEach((row) => {
      const name = row.properties.Name?.title[0]?.plain_text?.toLowerCase()
      if (name) parent[name] = row.id
    })
    return parent
  }

  // Get core DB structure
  const dbStructure = await notion.databases.retrieve({
    database_id: database
  })
  const structure = Object.keys(dbStructure.properties).map((property) => {
    return { name: dbStructure.properties[property].name, type: dbStructure.properties[property].type }
  })

  // Get the system and owner db
  let systemRows, ownerRows

  if (systemDb) {
    systemRows = await notion.databases.query({
      database_id: systemDb
    })
  }

  if (ownerDb) {
    ownerRows = await notion.databases.query({
      database_id: ownerDb
    })
  }

  const systems = processRows(systemRows) || null
  const owners = processRows(ownerRows) || null
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
  const getDatabaseRows = async (startCursor) => {
    const pageRows = await notion.databases.query({
      database_id: database,
      start_cursor: startCursor
    })
    pageRows.results.forEach((item) => {
      const pageId = item.id
      const pageHash = item.properties?.Hash?.rich_text[0]?.text?.content
      const pageName = item.properties?.Name?.title[0]?.text?.content
      services[pageName] = { pageId, pageHash }
    })
    if (pageRows.has_more) {
      return await getDatabaseRows(pageRows.next_cursor)
    }
  }
  await getDatabaseRows()

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
