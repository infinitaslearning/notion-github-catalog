const core = require('@actions/core')
const { Client, LogLevel } = require('@notionhq/client')
const { Octokit } = require('octokit')
const YAML = require('yaml')

try {
  const NOTION_TOKEN = core.getInput('notion_token')
  const GITHUB_TOKEN = core.getInput('github_token')
  const database = core.getInput('database')
  const systemDb = core.getInput('system_database')
  const segmentDb = core.getInput('segment_database')
  const teamDb = core.getInput('team_database')
  const owner = core.getInput('github_owner')
  const catalogFile = core.getInput('catalog_file') || 'catalog-info.yaml'
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

  const createProperties = (repo, { systems, segments, teams }) => {
    let segment, team, system
    const segmentAnnotation = repo?.metadata?.annotations?.segment
    const systemAnnotation = repo?.metadata?.annotations?.system
    const teamAnnotation = repo?.metadata?.annotations?.team

    if (segments) {
      // Segments are a relation
      segment = {
        relation: [
          { id: segments[segmentAnnotation?.toLowerCase()] || segments.unknown }
        ]
      }
    } else {
      // Segments are a tag
      segment = {
        select: {
          name: segmentAnnotation || 'Unknown'
        }
      }
    }

    if (teams) {
      // Teams are a relation
      team = {
        relation: [
          { id: teams[teamAnnotation?.toLowerCase()] || teams.unknown }
        ]
      }
    } else {
      // Teams are a tag
      team = {
        select: {
          name: teamAnnotation || 'Unknown'
        }
      }
    }

    if (systems) {
      // Segments are a relation
      system = {
        relation: [
          { id: systems[systemAnnotation?.toLowerCase()] || systems.unknown }
        ]
      }
    } else {
      // Segments are a tag
      system = {
        select: {
          name: systemAnnotation || 'Unknown'
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
      Segment: segment,
      Team: team,
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

  const updateNotionRow = async (repo, pageId, { systems, segments, teams }) => {
    try {
      await notion.pages.update({
        page_id: pageId,
        properties: createProperties(repo, { systems, segments, teams })
      })
    } catch (ex) {
      core.error(`Error updating notion document for ${repo._repo.name}: ${ex.message} ...`)
    }
  }

  const createNotionRow = async (repo, { systems, segments, teams }) => {
    try {
      await notion.pages.create({
        parent: {
          database_id: database
        },
        properties: createProperties(repo, { systems, segments, teams })
      })
    } catch (ex) {
      core.error(`Error creating notion document for ${repo._repo.name}: ${ex.message} ...`)
    }
  }

  const updateNotion = async (repositories, { systems, segments, teams }) => {
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
        await updateNotionRow(repo, pageId, { systems, segments, teams })
      } else {
        await createNotionRow(repo, { systems, segments, teams })
      }
    }
  }

  const loadData = async () => {
    const processRows = (data) => {
      const parent = {}
      data.results.forEach((row) => {
        const name = row.properties.Name.title[0].plain_text.toLowerCase()
        if (name) parent[name] = row.id
      })
      return parent
    }

    let systemRows, segmentRows, teamRows

    if (systemDb) {
      systemRows = await notion.databases.query({
        database_id: systemDb
      })
    }

    if (segmentDb) {
      segmentRows = await notion.databases.query({
        database_id: segmentDb
      })
    }

    if (teamDb) {
      teamRows = await notion.databases.query({
        database_id: teamDb
      })
    }

    const systems = processRows(systemRows) || null
    const teams = processRows(teamRows) || null
    const segments = processRows(segmentRows) || null
    let error = false

    if (segmentDb && !segments.unknown) {
      error = true
      core.error('Your segment table does not contain an "unknown" row!')
    }
    if (teamDb && !teams.unknown) {
      error = true
      core.error('Your team table does not contain an "unknown" row!')
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
      segments,
      teams
    }
  }

  const refreshData = async () => {
    core.startGroup('Loading systems, segments and teams')
    const { systems, segments, teams } = await loadData()
    core.info(`Loaded ${Object.keys(systems || {}).length} systems`)
    core.info(`Loaded ${Object.keys(segments || {}).length} segments`)
    core.info(`Loaded ${Object.keys(teams || {}).length} teams`)
    core.endGroup()
    core.startGroup('🌀 Getting github repositories')
    const repositories = await getRepos()
    core.endGroup()
    core.startGroup(`✨ Updating notion with ${repositories.length} services ...`)
    await updateNotion(repositories, { systems, segments, teams })
    core.endGroup()
  }

  refreshData()
} catch (error) {
  core.setFailed(error.message)
}
