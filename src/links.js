const core = require('@actions/core')

const updateNotionLink = async (linkId, link, { notion }) => {
  try {
    await notion.pages.update({
      page_id: linkId,
      properties: {
        URL: {
          url: link.url
        }
      }
    })
  } catch (ex) {
    core.error(`Error updating notion link for ${link.title}: ${ex.message} ...`)
  }
}

const createNotionLink = async (linkDatabaseId, link, { notion }) => {
  try {
    await notion.pages.create({
      parent: {
        database_id: linkDatabaseId
      },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: link.title
              }
            }
          ]
        },
        URL: {
          url: link.url
        }
      }
    })
  } catch (ex) {
    core.error(`Error creating notion link for ${link.title}: ${ex.message} ...`)
  }
}

const updateLinks = async (linkDatabaseId, links, { notion }) => {
  for (const link of links) {
    // Lets see if we can find the row
    const search = await notion.databases.query({
      database_id: linkDatabaseId,
      filter: {
        property: 'Name',
        text: {
          equals: link.title
        }
      }
    })
    if (search.results.length > 0) {
      const linkId = search.results[0].id
      await updateNotionLink(linkId, link, { notion })
    } else {
      await createNotionLink(linkDatabaseId, link, { notion })
    }
  }
}

const ensureLinks = async (pageId, links, { notion }) => {
  // Ensure that the service page has a correct database of links
  const pageContent = await notion.blocks.children.list({
    block_id: pageId
  })
  let linkDatabase = pageContent.results.find((block) => block.type === 'child_database' && block.child_database?.title === 'Links')
  if (!linkDatabase) {
    // Create it
    linkDatabase = await notion.databases.create({
      parent: {
        page_id: pageId
      },
      title: [{
        type: 'text',
        text: {
          content: 'Links'
        }
      }],
      properties: {
        Name: {
          title: {}
        },
        URL: {
          url: {}
        }
      }
    })
  }

  // Update links
  await updateLinks(linkDatabase.id, links, { notion })
}

exports.ensureLinks = ensureLinks
