const core = require('@actions/core')
const { Client, LogLevel } = require('@notionhq/client')
const { markdownToBlocks } = require('@tryfabric/martian')
const { Octokit, App } = require("octokit");

try {
  const notion_token = core.getInput('notion_token')
  const github_token = core.getInput('github_token')
  const database = core.getInput('database')
  const date = new Date().toISOString()

  core.debug('Creating notion client ...')
  const notion = new Client({
    auth: notion_token,
    logLevel: LogLevel.ERROR
  })

  const octokit = new Octokit({ auth: github_token });

  const getRepos = async () => {
    let repos = await octokit.paginate('GET /orgs/{owner}/repos',
      {
        owner: 'infinitaslearning',
        type: 'all',
        sort: 'full_name',
        per_page: 100,
      });    
    core.info(`Found ${repos.length} github repositories, now getting service data ...`)    
    let repoData = [];
    //repos = [repos[0],repos[1]]
    for(const repo of repos) {      
      try {        
        const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
          owner: repo.full_name.split('/')[0],
          repo: repo.name,
          path: 'service.json'
        })        
        if(data) {
          const base64content = Buffer.from(data.content, 'base64');          
          let serviceJson = JSON.parse(base64content.toString('utf8'));          
          serviceJson._repo = repo;
          repoData.push(serviceJson);          
        }
      } catch(ex) {        
        repoData.push({
          segment: 'Unknown',
          team: 'Unknown',
          status: 'No service.json found',
          _repo: repo
        });
      }
      
    }    
    return repoData;
  }

  const updateNotion = async (repositories) => {    
    for(const repo of repositories) {
      const result = await notion.pages.create({
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
        }
      });
    }
    return;
  }

  const refreshData = async () => {
    core.startGroup(`🌀 Getting github repositories`)
    const repositories = await getRepos()
    core.endGroup()
    core.startGroup(`✨ Updating notion with ${repositories.length} services ...`)
    updateNotion(repositories);
    core.endGroup()
  }    

  refreshData();
} catch (error) {
  core.setFailed(error.message)
}
