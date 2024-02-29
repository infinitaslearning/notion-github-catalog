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
    core.startGroup('🗂️  Loading services, systems and owners ...')
    const { systems, owners, structure, services } = await loadData({ core, notion })
    core.info(`Found ${structure.length} fields in the Service database: ${structure.map((item) => item.name)}`)
    core.info(`Loaded ${Object.keys(systems || {}).length} systems`)
    core.info(`Loaded ${Object.keys(owners || {}).length} owners`)
    core.info(`Loaded ${Object.keys(services || {}).length} existing services`)
    core.endGroup()
    core.startGroup('🌀 Getting github repositories (tst debug info)')
    const repositories = await getRepos({ core })
    core.endGroup()
    core.startGroup(`✨ Updating notion with ${repositories.length} services ...`)
    await updateServices(repositories, { core, notion, database, systems, owners, structure, services })
    core.endGroup()
  }

  refreshData()
} catch (error) {
  core.setFailed(error.message)
}
