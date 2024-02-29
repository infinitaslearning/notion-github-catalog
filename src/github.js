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

  const getServiceDefinitionFile = async (repo, path) => {
    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: repo.full_name.split('/')[0],
        repo: repo.name,
        path
      })
      return data
    } catch (ex) {
      // Try it now with a .yml file instead only for default version!
      if (catalogFile === 'catalog-info.yaml') {
        const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
          owner: repo.full_name.split('/')[0],
          repo: repo.name,
          path: path.replace('catalog-info.yaml', 'catalog-info.yml')
        })
        return data
      } else {
        throw ex
      }
    }
  }

  const getLanguages = async (repo) => {
    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/languages', {
        owner: repo.full_name.split('/')[0],
        repo: repo.name,
      })
      const languages = Object.keys(data); 
      return languages
    } catch (ex) {
      throw ex
    }    
  }
  
  const getTeams = async (repo) => {
    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/teams', {
        owner: repo.full_name.split('/')[0],
        repo: repo.name,
      })
      const teams = data.map((t) => t.name);
      return teams
    } catch (ex) {
      throw ex
    }    
  }

 
  const getDotNetVersions = async (repo, keyword) => {
    try {
      const { data } = await octokit.request('GET https://api.github.com/search/code?q={keyword}+repo:{repo}', {
        repo: repo.full_name,
        keyword: keyword,
        headers: {
          accept: 'application/vnd.github.text-match+json'
        }
      })
      const matches = data.items.map((i) => {
        const split = i.text_matches[0].fragment.split(keyword);
        const foundValue = split[1]

        const foundValue2 = foundValue.split(keyword.substring(1))[0]

        const version = foundValue2.substring(0, foundValue2.length-2);
        return 'C# ' + version;
      });
      return matches.filter((x, i, a) => a.indexOf(x) == i); //only unique values
    } catch (ex) {
      throw ex
    }    
  }

  const enrichTags = async (serviceDefinition) => {
    if (serviceDefinition.metadata.tags === undefined || serviceDefinition.metadata.tags === null)
    {
      serviceDefinition.metadata.tags = [];
    }

    const languages = await getLanguages(serviceDefinition._repo);
    serviceDefinition.metadata.tags.push(...languages);

    const teams = await getTeams(serviceDefinition._repo);
    serviceDefinition.metadata.tags.push(...teams);

    if (languages.includes('C#'))
    {
      const targetFrameworkVersions = await getDotNetVersions(serviceDefinition._repo, '<TargetFramework>');
      serviceDefinition.metadata.tags.push(...targetFrameworkVersions);

      const targetFrameworkVersions2 = await getDotNetVersions(serviceDefinition._repo, '<TargetFrameworkVersion>');
      serviceDefinition.metadata.tags.push(...targetFrameworkVersions2);

//SLEEP NEEDED BECAUSE OF MAX CALLS/MINUTE - https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#rate-limit

    }

    serviceDefinition.metadata.tags = serviceDefinition.metadata.tags.filter((x, i, a) => a.indexOf(x) == i); //only unique values
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

          await enrichTags(serviceDefinition);

          repoData.push(serviceDefinition)
        }
      }
      core.debug(`🌟 Processed ${data.name} in ${repo.name} ...`)
    } catch (ex) {
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

  const repos = await octokit.paginate('GET /orgs/{owner}/repos',
    {
      owner: owner,
      type: repositoryType,
      sort: 'full_name',
      per_page: 100
    })
  core.info(`Found ${repos.length} github repositories, now getting service data for those that match ${repositoryFilter}`)

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
