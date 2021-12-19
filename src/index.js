const core = require('@actions/core')
const { Client, LogLevel } = require('@notionhq/client')
const { Octokit } = require('octokit')

try {
  const NOTION_TOKEN = core.getInput('notion_token')
  const GITHUB_TOKEN = core.getInput('github_token')
  const database = core.getInput('database')
  const owner = core.getInput('github_owner')
  const repositoryType = core.getInput('repository_type') || 'all'

  core.debug('Creating notion client ...')
  const notion = new Client({
    auth: NOTION_TOKEN,
    logLevel: LogLevel.ERROR
  })

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
          path: 'service.json'
        })
        if (data) {
          const base64content = Buffer.from(data.content, 'base64')
          const serviceJson = JSON.parse(base64content.toString('utf8'))
          serviceJson._repo = repo
          repoData.push(serviceJson)
        }
      } catch (ex) {
        repoData.push({
          segment: 'Unknown',
          team: 'Unknown',
          status: 'No service.json found',
          _repo: repo
        })
      }
    }
    return repoData
  }

  const updateNotion = async (repositories) => {
    for (const repo of repositories) {
      // Date to log as updated
      const date = new Date().toISOString()

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
        await notion.pages.update({
          page_id: pageId,
          properties: {
            Name: {
              title: [
                {
                  text: {
                    content: repo._repo.name
                  }
                }
              ]
            },
            URL: {
              url: repo._repo.html_url
            },
            Segment: {
              select: {
                name: repo.segment
              }
            },
            Team: {
              select: {
                name: repo.team
              }
            },
            Updated: {
              date: {
                start: date
              }
            }
          }
        })
      } else {
        await notion.pages.create({
          parent: {
            database_id: database
          },
          properties: {
            Name: {
              title: [
                {
                  text: {
                    content: repo._repo.name
                  }
                }
              ]
            },
            URL: {
              url: repo._repo.html_url
            },
            Segment: {
              select: {
                name: repo.segment
              }
            },
            Team: {
              select: {
                name: repo.team
              }
            },
            Updated: {
              date: {
                start: date
              }
            }
          }
        })
      }
    }
  }

  const refreshData = async () => {
    core.startGroup('🌀 Getting github repositories')
    const repositories = await getRepos()
    core.endGroup()
    core.startGroup(`✨ Updating notion with ${repositories.length} services ...`)
    updateNotion(repositories)
    core.endGroup()
  }

  refreshData()
} catch (error) {
  core.setFailed(error.message)
}
