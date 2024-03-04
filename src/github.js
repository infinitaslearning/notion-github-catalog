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

let monoRepoCount = 0

const getRepos = async () => {
  const GITHUB_TOKEN = core.getInput('github_token')
  const repositoryType = core.getInput('repository_type') || 'all'
  const repositoryFilter = core.getInput('repository_filter') || '.*'
  const repositoryBatchSize = parseInt(core.getInput('repository_batch_size') || '10')
  const pushMissing = core.getBooleanInput('push_missing')
  const owner = core.getInput('github_owner')
  const catalogFile = core.getInput('catalog_file') || 'catalog-info.yaml'
  const repositoryFilterRegex = new RegExp(repositoryFilter)
  const octokit = new Octokit({ auth: GITHUB_TOKEN })
  const retrieveDotNetVersions = true
  const retrieveTeams = false
  const retrieveLanguages = false

  const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

  const getRatelimitInfo = async (info) => {
    const { data } = await octokit.request('GET /rate_limit')
    core.info(`Ratelimit info "${info}": ${JSON.stringify(data.resources.core)}`)
  }

  const getServiceDefinitionFile = async (repo, path) => {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: repo.full_name.split('/')[0],
      repo: repo.name,
      path
    })
    return data
  }

  const getLanguages = async (repo) => {
    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/languages', {
        owner: repo.full_name.split('/')[0],
        repo: repo.name
      })
      const languages = Object.keys(data)
      return languages
    } catch (ex) {
      core.info(`   Error in ${repo.name}: ${ex.message}`)
      return []
    }
  }

  const getTeams = async (repo) => {
    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/teams', {
        owner: repo.full_name.split('/')[0],
        repo: repo.name
      })
      const teams = data.map((t) => t.name)
      return teams
    } catch (ex) {
      core.info(`   Error in ${repo.name}: ${ex.message}`)
      return []
    }
  }

  const getTree = async (repo) => {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1', {
      owner: repo.full_name.split('/')[0],
      repo: repo.name,
      default_branch: repo.default_branch
    })
    return data
  }

  const getFileContent = async (url) => {
    const { data } = await octokit.request('GET {url}', {
      url: url
    })
    const base64content = Buffer.from(data.content, 'base64')
    const fileContent = base64content.toString('utf8')
    return fileContent
  }

  const getStringBetween = (str, start, end) => {
    const result = str.match(new RegExp(start + '(.*)' + end))

    if (result === undefined || result === null) {
      return ''
    }

    return result[1]
  }

  const getDotNetVersions = async (fileTree) => {
    const csprojBlobUrls = fileTree.tree.filter((n) => n.path.endsWith('.csproj')).map((n) => n.url)

    const csprojContents = []
    for (const index in csprojBlobUrls) {
      const csprojBlobUrl = csprojBlobUrls[index]
      const content = await getFileContent(csprojBlobUrl)
      csprojContents.push(content)
    }

    const targetFrameworks = csprojContents.map((c) => getStringBetween(c, '<TargetFramework>', '</TargetFramework>'))
    const targetFrameworkVersions = csprojContents.map((c) => getStringBetween(c, '<TargetFrameworkVersion>', '</TargetFrameworkVersion>'))
    targetFrameworks.push(...targetFrameworkVersions)
    // unique values + not empty + prefix with C#
    const versions = targetFrameworks.filter((x, i, a) => a.indexOf(x) === i).filter((v) => v !== '').map((v) => 'C# ' + v)

    return versions
  }

  const enrichTags = async (serviceDefinition) => {
    if (serviceDefinition.metadata.tags === undefined || serviceDefinition.metadata.tags === null) {
      serviceDefinition.metadata.tags = []
    }

    if (retrieveTeams) {
      const teams = await getTeams(serviceDefinition._repo)
      serviceDefinition.metadata.tags.push(...teams)
    }

    if (retrieveLanguages) {
      const languages = await getLanguages(serviceDefinition._repo)
      serviceDefinition.metadata.tags.push(...languages)
    }

    if (retrieveDotNetVersions) {
      if (serviceDefinition._repo.topics.includes('analyse-dotnet-versions')) {
        try {
          await getRatelimitInfo(`start ${serviceDefinition.metadata.name}`)
          serviceDefinition.metadata.tags.push('retrieving-dotnet-info')

          const fileTree = await getTree(serviceDefinition._repo)

          const versions = await getDotNetVersions(fileTree)
          serviceDefinition.metadata.tags.push(...versions)
        } catch (ex) {
          core.info(`   Error in ${serviceDefinition.name}: ${ex.message}`)
          serviceDefinition.metadata.tags.push('failed-retrieve-dotnet')
        }

        await getRatelimitInfo(`end ${serviceDefinition.metadata.name}`)
      }
    }

    serviceDefinition.metadata.tags = serviceDefinition.metadata.tags.filter((x, i, a) => a.indexOf(x) === i) // only unique values
  }

  const parseServiceDefinition = async (repo, path) => {
    const repoData = []
    try {
      const data = await getServiceDefinitionFile(repo, path)
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
      core.debug(`🌟 Processed ${data.name} in ${repo.name} ...`)
    } catch (ex) {
      if (ex.name === 'YAMLSemanticError') {
        core.info(`   YAML parse error in ${repo.name} - ${path}: ${ex.message}`)
      }
      if (pushMissing) {
        repoData.push({
          status: `${catalogFile} missing`,
          _repo: repo
        })
        core.debug(`- Loaded basic service data for ${repo.name} as no ${path} found`)
      } else {
        core.debug(`✋ Unable to find ${path} in ${repo.name}, not processing as 'push_missing' is false`)
      }
    }

    return repoData
  }

  const parseLocationFile = async (serviceDefinition, repo, path) => {
    const repoData = []
    const targets = serviceDefinition.spec?.targets
    if (targets && targets.length > 0) {
      for (const target of targets) {
        const targetDefinition = await parseServiceDefinition(repo, target)
        targetDefinition.fromLocation = true
        repoData.push(...targetDefinition)
        monoRepoCount++
      }
    } else {
      core.warning(`✋ Location file in ${repo._repo.name} at ${path} specified without valid spec.targets, will be skipped`)
    }
    return repoData
  }

  const repos = await octokit.paginate('GET /orgs/{owner}/repos', {
    owner: owner,
    type: repositoryType,
    sort: 'full_name',
    per_page: 100
  })

  core.info(`Found ${repos.length} github repositories, now getting service data for those that match ${repositoryFilter}`)

  await getRatelimitInfo('Start all')

  // We will create an array of batches to speed up execution, run each batch
  // In series, and then join them together.
  const repoFns = []
  const repoBatches = []

  for (const repo of repos) {
    if (repo.name.match(repositoryFilterRegex)) {
      repoFns.push(parseServiceDefinition(repo, catalogFile))
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

  await sleep(5000)
  for (const index in repoData) {
    const serviceDefinition = repoData[index]
    if (serviceDefinition.metadata !== undefined) {
      await enrichTags(serviceDefinition)

      await sleep(1000)
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

  core.info(`Processed ${repoData.length} total repositories, after adding ${monoRepoCount} from mono-repos`)
  return repoData
}

exports.getRepos = getRepos
