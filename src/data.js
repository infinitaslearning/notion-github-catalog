const core = require('@actions/core')

const loadData = async ({ notion }) => {
  const systemDb = core.getInput('system_database')
  const ownerDb = core.getInput('owner_database')
  const database = core.getInput('database')

  const processRows = (data) => {
    const parent = {}
    data.results.forEach((row) => {
      const name = row.properties.Name.title[0].plain_text.toLowerCase()
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

  if (error) {
    process.exit(1)
  }

  return {
    systems,
    owners,
    structure
  }
}

exports.loadData = loadData
