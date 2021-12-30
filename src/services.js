const core = require('@actions/core')
const { ensureLinks } = require('./links')
const { getDependsOn } = require('./depends')
const { mappingFn } = require('./mappingFn')
const hash = require('object-hash')

let createdServices = 0
let updatedServices = 0
let skippedServices = 0
let erroredServices = 0

const updateServices = async (repositories, { notion, database, systems, owners, structure }) => {
  for (const repo of repositories) {
    // Lets see if we can find the row
    const repoName = repo.metadata?.name || repo._repo.name
    const search = await notion.databases.query({
      database_id: database,
      filter: {
        property: 'Name',
        text: {
          equals: repoName
        }
      }
    })

    // If we have found any results, lets update
    // If multiple are found we have an issue, but for now
    // Lets just update the first one to not make the problem worse
    if (search.results.length > 0) {
      const pageId = search.results[0].id
      const pageHash = search.results[0].properties?.Hash?.rich_text[0]?.text?.content
      core.debug(`Updating notion info for ${repoName}`)
      await updateNotionRow(repo, pageId, pageHash, { notion, database, systems, owners, structure })
    } else {
      core.debug(`Creating notion info for ${repoName}`)
      await createNotionRow(repo, { notion, database, systems, owners, structure })
    }
  }
  core.info(`Completed with ${createdServices} created, ${updatedServices} updated, ${skippedServices} unchanged and ${erroredServices} with errors`)
}

const updateNotionRow = async (repo, pageId, pageHash, { notion, database, systems, owners, structure }) => {
  try {
    let dependsOn = []
    if (repo.spec?.dependsOn?.length > 0) {
      dependsOn = await getDependsOn(repo.spec.dependsOn, { notion, database })
    }
    const { properties, doUpdate } = createProperties(repo, pageHash, dependsOn, { systems, owners, structure })
    if (doUpdate) {
      await notion.pages.update({
        page_id: pageId,
        properties
      })
      updatedServices++
    } else {
      skippedServices++
    }
    if (repo.metadata?.links) {
      await ensureLinks(pageId, repo.metadata.links, { notion })
    }
  } catch (ex) {
    erroredServices++
    core.warning(`Error updating notion document for ${repo._repo.name}: ${ex.message} ...`)
  }
}

const createNotionRow = async (repo, { notion, database, systems, owners, structure }) => {
  try {
    let dependsOn = []
    if (repo.spec?.dependsOn?.length > 0) {
      dependsOn = await getDependsOn(repo.spec.dependsOn, { notion, database })
    }
    const { properties } = createProperties(repo, null, dependsOn, { systems, owners, structure })
    const page = await notion.pages.create({
      parent: {
        database_id: database
      },
      properties
    })
    createdServices++
    if (repo.metadata?.links) {
      await ensureLinks(page.id, repo.metadata.links, { notion })
    }
  } catch (ex) {
    erroredServices++
    core.warning(`Error creating notion document for ${repo._repo.name}: ${ex.message}`)
  }
}

const createProperties = (repo, pageHash, dependsOn, { systems, owners, structure }) => {
  // This iterates over the structure, executes a mapping function for each based on the data provided
  const properties = {}
  for (const field of structure) {
    if (mappingFn[field.name]) {
      properties[field.name] = mappingFn[field.name](repo, { dependsOn, systems, owners })
    }
  }
  // Always have to check the hash afterwards, excluding the hash and the key
  const newPageHash = hash(properties, {
    excludeKeys: (key) => {
      return key === 'Hash' || key === 'Updated'
    }
  })

  const doUpdate = newPageHash && newPageHash !== pageHash
  properties.Hash = {
    rich_text: [
      {
        text: {
          content: newPageHash
        }
      }
    ]
  }
  return { properties, doUpdate }
}

exports.updateServices = updateServices
