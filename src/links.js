const core = require('@actions/core')

const processRows = (data) => {
  const parent = {}
  data.results.forEach((row) => {
    const name = row.properties.Name.title[0].plain_text.toLowerCase()
    const url = row.properties.URL.url
    if (name) parent[name] = { id: row.id, url }
  })
  return parent
}

const updateNotionLink = async (linkId, link, linkUrl, { notion }) => {
  try {
    await notion.pages.update({
      page_id: linkId,
      properties: {
        URL: {
          url: linkUrl
        }
      }
    })
  } catch (ex) {
    core.error(`Error updating notion link for ${link}: ${ex.message} ...`)
  }
}

const createNotionLink = async (linkDatabaseId, link, linkUrl, { notion }) => {
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
                content: link
              }
            }
          ]
        },
        URL: {
          url: linkUrl
        }
      }
    })
  } catch (ex) {
    core.error(`Error creating notion link for ${link.title}: ${ex.message} ...`)
  }
}

const updateLinks = async (linkDatabaseId, links, { notion }) => {
  // First get all of the existing rows in one go
  const existingLinkRows = await notion.databases.query({
    database_id: linkDatabaseId
  })

  const existingLinks = processRows(existingLinkRows)
  // Now scan for any that have changed or are new
  const linkKeys = Object.keys(links)
  for (const link of linkKeys) {
    // Check if our links are an object or simple attributes
    let newLink
    let newLinkUrl
    if (links[link].url) {
      newLinkUrl = links[link].url
      newLink = links[link].title
    } else {
      newLinkUrl = links[link]
      newLink = link
    }

    const key = newLink.toLowerCase();

    // Now lets see if we can find the row
    if (existingLinks[key]) {
      const linkId = existingLinks[key].id
      const linkUrl = existingLinks[key].url

      if (newLinkUrl !== linkUrl) { // url has changed
        await updateNotionLink(linkId, newLink, newLinkUrl, { notion })
      }
    } else {
      await createNotionLink(linkDatabaseId, newLink, newLinkUrl, { notion })
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
