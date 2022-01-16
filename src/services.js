const core = require('@actions/core')
const { ensureLinks } = require('./links')
const { getDependsOn } = require('./depends')
const { mappingFn } = require('./mappingFn')
const hash = require('object-hash')

let createdServices = 0
let updatedServices = 0
let skippedServices = 0
let erroredServices = 0

const updateServices = async (repositories, { notion, database, systems, owners, structure, services }) => {
  for (const repo of repositories) {
    // Lets see if we can find the row
    const repoName = repo.metadata?.name || repo._repo.name
    // Lets look the service up
    if (services[repoName]) {
      const pageId = services[repoName].pageId
      const pageHash = services[repoName].pageHash
      await updateNotionRow(repo, pageId, pageHash, { notion, database, systems, owners, structure })
    } else {
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
      core.debug(`Updating notion info for ${repo._repo.name}`)
      await notion.pages.update({
        page_id: pageId,
        properties
      })
      if (repo.metadata?.links) {
        await ensureLinks(pageId, repo.metadata.links, { notion })
      }
      updatedServices++
    } else {
      core.debug(`Not updating notion info for ${repo._repo.name} as hash unchanged`)
      skippedServices++
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
    core.debug(`Creating notion info for ${repo._repo.name}`)
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
  const hashProperties = properties
  // Add the links if they exist to the hash
  if (repo.metadata?.links) {
    hashProperties.links = repo.metadata?.links
  }
  const newPageHash = hash(hashProperties, {
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
