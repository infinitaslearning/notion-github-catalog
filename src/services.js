const core = require('@actions/core')
const { ensureLinks } = require('./links')

const updateServices = async (repositories, { notion, database, systems, owners }) => {
  for (const repo of repositories) {
    // Lets see if we can find the row
    const search = await notion.databases.query({
      database_id: database,
      filter: {
        property: 'Name',
        text: {
          equals: repo._repo.name
        }
      }
    })

    // If we have found any results, lets update
    // If multiple are found we have an issue, but for now
    // Lets just update the first one to not make the problem worse
    if (search.results.length > 0) {
      const pageId = search.results[0].id
      await updateNotionRow(repo, pageId, { notion, database, systems, owners })
    } else {
      await createNotionRow(repo, { notion, database, systems, owners })
    }
  }
}

const updateNotionRow = async (repo, pageId, { notion, database, systems, owners }) => {
  try {
    await notion.pages.update({
      page_id: pageId,
      properties: createProperties(repo, { systems, owners })
    })
    if (repo.metadata?.links) {
      await ensureLinks(pageId, repo.metadata.links, { notion })
    }
  } catch (ex) {
    core.error(`Error updating notion document for ${repo._repo.name}: ${ex.message} ...`)
  }
}

const createNotionRow = async (repo, { notion, database, systems, owners }) => {
  try {
    const page = await notion.pages.create({
      parent: {
        database_id: database
      },
      properties: createProperties(repo, { systems, owners })
    })
    if (repo.metadata?.links) {
      await ensureLinks(page.id, repo.metadata.links, { notion })
    }
  } catch (ex) {
    core.error(`Error creating notion document for ${repo._repo.name}: ${ex.message} ...`)
  }
}

const createProperties = (repo, { systems, owners }) => {
  let owner, system
  const ownerSpec = repo?.spec?.owner
  const systemSpec = repo?.spec?.system

  if (owners) {
    // Owners are a relation
    owner = {
      relation: [
        { id: owners[ownerSpec?.toLowerCase()] || owners.unknown }
      ]
    }
  } else {
    // owners are a tag
    owner = {
      select: {
        name: ownerSpec || 'Unknown'
      }
    }
  }

  if (systems) {
    // Segments are a relation
    system = {
      relation: [
        { id: systems[systemSpec?.toLowerCase()] || systems.unknown }
      ]
    }
  } else {
    // Segments are a tag
    system = {
      select: {
        name: systemSpec || 'Unknown'
      }
    }
  }

  return {
    Name: {
      title: [
        {
          text: {
            content: repo._repo.name
          }
        }
      ]
    },
    Description: {
      rich_text: [
        {
          text: {
            content: repo.metadata?.description || repo._repo.description || repo._repo.name
          }
        }
      ]
    },
    Kind: {
      select: {
        name: repo.kind || 'Unknown'
      }
    },
    URL: {
      url: repo._repo.html_url
    },
    Owner: owner,
    System: system,
    Visibility: {
      select: {
        name: repo._repo.visibility
      }
    },
    Language: {
      select: {
        name: repo._repo.language || 'Unknown'
      }
    },
    Status: {
      select: {
        name: repo.status
      }
    },
    Tags: {
      multi_select: repo.metadata?.tags ? repo.metadata.tags.flatMap(tag => { return { name: tag } }) : []
    },
    Updated: {
      date: {
        start: new Date().toISOString()
      }
    }
  }
}

exports.updateServices = updateServices
