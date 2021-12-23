const { Octokit } = require('octokit')
const YAML = require('yaml')
const core = require('@actions/core')

const getRepos = async () => {
  const GITHUB_TOKEN = core.getInput('github_token')
  const repositoryType = core.getInput('repository_type') || 'all'
  const repositoryFilter = core.getInput('repository_filter') || '.*'
  const owner = core.getInput('github_owner')
  const catalogFile = core.getInput('catalog_file') || 'catalog-info.yaml'
  const repositoryFilterRegex = new RegExp(repositoryFilter)

  const octokit = new Octokit({ auth: GITHUB_TOKEN })

  const repos = await octokit.paginate('GET /orgs/{owner}/repos',
    {
      owner: owner,
      type: repositoryType,
      sort: 'full_name',
      per_page: 100
    })
  core.info(`Using repository filter: ${repositoryFilter}`)
  core.info(`Found ${repos.length} github repositories, now getting service data for those that match the filter ...`)
  const repoData = []
  for (const repo of repos) {
    if (repo.name.match(repositoryFilterRegex)) {
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
  }

  // Now we want to sort the repositories based on their name, and the number of dependencies
  repoData.sort((a, b) => {
    const aDependsOn = a.spec?.dependsOn?.length || 0
    const bDependsOn = b.spec?.dependsOn?.length || 0
    const aSort = aDependsOn + '.' + a._repo.name
    const bSort = bDependsOn + '.' + b._repo.name
    if (aSort < bSort) return -1
    if (aSort > bSort) return 1
    return 0
  })

  core.info(`Processed ${repoData.length} matching repositories`)
  return repoData
}

exports.getRepos = getRepos
