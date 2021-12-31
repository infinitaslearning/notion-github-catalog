const { Octokit } = require('octokit')
const YAML = require('yaml')
const core = require('@actions/core')

const chunk = (arr, len) => {
  const chunks = []
  let i = 0
  const n = arr.length
  while (i < n) {
    chunks.push(arr.slice(i, i += len))
  }
  return chunks
}

const getRepos = async () => {
  const GITHUB_TOKEN = core.getInput('github_token')
  const repositoryType = core.getInput('repository_type') || 'all'
  const repositoryFilter = core.getInput('repository_filter') || '.*'
  const repositoryBatchSize = parseInt(core.getInput('repository_batch_size') || '10')
  const owner = core.getInput('github_owner')
  const catalogFile = core.getInput('catalog_file') || 'catalog-info.yaml'
  const repositoryFilterRegex = new RegExp(repositoryFilter)
  const octokit = new Octokit({ auth: GITHUB_TOKEN })

  const parseServiceDefinition = async (repo, path, pushMissing) => {
    const repoData = []
    core.debug(`Processing ${path} in ${repo.name} ...`)
    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: repo.full_name.split('/')[0],
        repo: repo.name,
        path
      })
      if (data) {
        const base64content = Buffer.from(data.content, 'base64')
        const serviceDefinition = YAML.parse(base64content.toString('utf8'))
        if (serviceDefinition.kind?.toLowerCase() === 'location') {
          repoData.push(...await parseLocationFile(serviceDefinition, repo, path))
        } else {
          serviceDefinition._catalog_file = data.html_url
          serviceDefinition._repo = repo
          serviceDefinition.status = 'OK'
          repoData.push(serviceDefinition)
        }
      }
    } catch (ex) {
      if (pushMissing) {
        repoData.push({
          status: `${catalogFile} missing`,
          _repo: repo
        })
      } else {
        core.warning(`Unable to find ${path} in ${repo.name}, not processing`)
      }
    }
    core.info(`Completed ${repo.name}`)
    return repoData
  }

  const parseLocationFile = async (serviceDefinition, repo, path) => {
    const repoData = []
    const targets = serviceDefinition.spec?.targets
    if (targets && targets.length > 0) {
      for (const target of targets) {
        const pushMissing = false
        const targetDefinition = await parseServiceDefinition(repo, target, pushMissing)
        targetDefinition.fromLocation = true
        repoData.push(...targetDefinition)
      }
    } else {
      core.warning(`Location file in ${repo._repo.name} at ${path} specified without valid spec.targets, will be skipped`)
    }
    return repoData
  }

  const repos = await octokit.paginate('GET /orgs/{owner}/repos',
    {
      owner: owner,
      type: repositoryType,
      sort: 'full_name',
      per_page: 100
    })
  core.info(`Using repository filter: ${repositoryFilter}`)
  core.info(`Found ${repos.length} github repositories, now getting service data for those that match the filter ...`)

  // We will create an array of batches to speed up execution, run each batch
  // In series, and then join them together.
  const repoFns = []
  const repoBatches = []

  for (const repo of repos) {
    if (repo.name.match(repositoryFilterRegex)) {
      const pushMissing = true
      repoFns.push(parseServiceDefinition(repo, catalogFile, pushMissing))
    }
  }

  // Break into batches
  core.info(`Fetching with batch size of ${repositoryBatchSize} ...`)
  const batchRepos = chunk(repoFns, repositoryBatchSize)

  // Iterate over those
  for (const batch of batchRepos) {
    core.debug(`Fetching ${batch.length} repos ...`)
    repoBatches.push(await Promise.all(batch))
  }

  let repoData = await Promise.all(repoBatches)

  // Now flatten it
  repoData = repoData.flat(2)

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
