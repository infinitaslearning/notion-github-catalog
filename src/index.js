const core = require('@actions/core')
const { Client, LogLevel } = require('@notionhq/client')
const { updateServices } = require('./services')
const { getRepos } = require('./github')
const { loadData } = require('./data')

try {
  const NOTION_TOKEN = core.getInput('notion_token')
  const database = core.getInput('database')

  core.debug('Creating notion client ...')
  const notion = new Client({
    auth: NOTION_TOKEN,
    logLevel: LogLevel.ERROR
  })

  const refreshData = async () => {
    core.startGroup('Loading systems and owners ...')
    const { systems, owners } = await loadData({ core, notion })
    core.info(`Loaded ${Object.keys(systems || {}).length} systems`)
    core.info(`Loaded ${Object.keys(owners || {}).length} owners`)
    core.endGroup()
    core.startGroup('🌀 Getting github repositories')
    const repositories = await getRepos({ core })
    core.endGroup()
    core.startGroup(`✨ Updating notion with ${repositories.length} services ...`)
    await updateServices(repositories, { core, notion, database, systems, owners })
    core.endGroup()
  }

  refreshData()
} catch (error) {
  core.setFailed(error.message)
}
