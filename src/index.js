const core = require('@actions/core')
const { Client, LogLevel } = require('@notionhq/client')
const { Octokit } = require('octokit')
const YAML = require('yaml')
const { markdownToBlocks } = require('@tryfabric/martian')

try {
  const NOTION_TOKEN = core.getInput('notion_token')
  const GITHUB_TOKEN = core.getInput('github_token')
  const database = core.getInput('database')
  const owner = core.getInput('github_owner')
  const catalogFile = core.getInput('catalog_file') || 'catalog-info.yaml'
  const repositoryType = core.getInput('repository_type') || 'all'

  core.debug('Creating notion client ...')
  const notion = new Client({
    auth: NOTION_TOKEN,
    logLevel: LogLevel.ERROR
  })

  console.log(database, owner)

  const octokit = new Octokit({ auth: GITHUB_TOKEN })

  const getRepos = async () => {
    const repos = await octokit.paginate('GET /orgs/{owner}/repos',
      {
        owner: owner,
        type: repositoryType,
        sort: 'full_name',
        per_page: 100
      })
    core.info(`Found ${repos.length} github repositories, now getting service data ...`)
    const repoData = []        
    for (const repo of repos) {      
      try {
        const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
          owner: repo.full_name.split('/')[0],
          repo: repo.name,
          path: catalogFile
        })
        if (data) {
          const base64content = Buffer.from(data.content, 'base64')
          const serviceDefinition = YAML.parse(base64content.toString('utf8'))
          serviceDefinition._repo = repo
          serviceDefinition.status = 'OK'
          repoData.push(serviceDefinition)
        }
      } catch (ex) {
        repoData.push({
          status: `${catalogFile} missing`,
          _repo: repo
        })
      }
    }
    return repoData
  }

  const createProperties = (repo) => {
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
      Segment: {
        select: {
          name: repo?.metadata?.annotations?.segment || 'Unknown'
        }
      },
      Team: {
        select: {
          name: repo?.metadata?.annotations?.team || 'Unknown'
        }
      },
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

  const updateNotionRow = async (repo, pageId) => {    
    try {
      await notion.pages.update({
        page_id: pageId,
        properties: createProperties(repo)
      })
    } catch(ex) {
      core.error(`Error updating notion document for ${repo._repo.name}: ${ex.message} ...`);
    }
  }

  const createNotionRow = async (repo) => {    
    try {
      await notion.pages.create({
        parent: {
          database_id: database
        },
        properties: createProperties(repo)
      })
    } catch(ex) {      
      core.error(`Error creating notion document for ${repo._repo.name}: ${ex.message} ...`);
    }
  }

  const updateNotion = async (repositories) => {
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
        await updateNotionRow(repo, pageId)
      } else {
        await createNotionRow(repo)
      }
    }
  }

  const refreshData = async () => {
    core.startGroup('🌀 Getting github repositories')
    const repositories = await getRepos()
    core.endGroup()
    core.startGroup(`✨ Updating notion with ${repositories.length} services ...`)
    await updateNotion(repositories)
    core.endGroup()    
  }

  refreshData()
} catch (error) {
  core.setFailed(error.message)
}
