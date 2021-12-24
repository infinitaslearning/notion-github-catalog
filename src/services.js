const core = require('@actions/core')
const { ensureLinks } = require('./links')
const { getDependsOn } = require('./depends')
const { mappingFn } = require('./mappingFn')

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
      core.debug(`Updating notion info for ${repoName}`)
      await updateNotionRow(repo, pageId, { notion, database, systems, owners, structure })
    } else {
      core.debug(`Creating notion info for ${repoName}`)
      await createNotionRow(repo, { notion, database, systems, owners, structure })
    }
  }
}

const updateNotionRow = async (repo, pageId, { notion, database, systems, owners, structure }) => {
  try {
    let dependsOn = []
    if (repo.spec?.dependsOn?.length > 0) {
      dependsOn = await getDependsOn(repo.spec.dependsOn, { notion, database })
    }
    await notion.pages.update({
      page_id: pageId,
      properties: createProperties(repo, dependsOn, { systems, owners, structure })
    })
    if (repo.metadata?.links) {
      await ensureLinks(pageId, repo.metadata.links, { notion })
    }
  } catch (ex) {
    core.warning(`Error updating notion document for ${repo._repo.name}: ${ex.message} ...`)
  }
}

const createNotionRow = async (repo, { notion, database, systems, owners, structure }) => {
  try {
    let dependsOn = []
    if (repo.spec?.dependsOn?.length > 0) {
      dependsOn = await getDependsOn(repo.spec.dependsOn, { notion, database })
    }
    const page = await notion.pages.create({
      parent: {
        database_id: database
      },
      properties: createProperties(repo, dependsOn, { systems, owners, structure })
    })
    if (repo.metadata?.links) {
      await ensureLinks(page.id, repo.metadata.links, { notion })
    }
  } catch (ex) {
    core.warning(`Error creating notion document for ${repo._repo.name}: ${ex.message}`)
  }
}

const createProperties = (repo, dependsOn, { systems, owners, structure }) => {
  // This iterates over the structure, executes a mapping function for each based on the data provided
  const page = {}
  for (const field of structure) {
    if (mappingFn[field.name]) {
      page[field.name] = mappingFn[field.name](repo, { dependsOn, systems, owners })
    }
  }
  console.log(page)
  return page
}

exports.updateServices = updateServices
