const core = require('@actions/core')

const loadData = async ({ notion }) => {
  const systemDb = core.getInput('system_database')
  const ownerDb = core.getInput('owner_database')

  const processRows = (data) => {
    const parent = {}
    data.results.forEach((row) => {
      const name = row.properties.Name.title[0].plain_text.toLowerCase()
      if (name) parent[name] = row.id
    })
    return parent
  }

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
    owners
  }
}

exports.loadData = loadData
