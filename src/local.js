const { spawn } = require('child_process')
const path = require('path')
const process = require('process')

process.env.INPUT_NOTION_TOKEN = process.env.NOTION_TOKEN
process.env.INPUT_GITHUB_TOKEN = process.env.GITHUB_TOKEN
process.env.INPUT_REPOSITORY_TYPE = 'public'
process.env.INPUT_GITHUB_OWNER = 'infinitaslearning'
process.env.INPUT_REPOSITORY_FILTER = 'notion-github-catalog' // '.*'
process.env.INPUT_REPOSITORY_BATCH_SIZE = '50'
process.env.INPUT_PUSH_MISSING = 'true'
process.env.INPUT_DATABASE = 'cecaf0beb15945158d155866ff9acce8'
process.env.INPUT_OWNER_DATABASE = '7943615f4dba43b3a3b0f991f4f7136d'
process.env.INPUT_SYSTEM_DATABASE = '121534684fe840a1953500e603c2b602'
// process.env.INPUT_DATABASE = '2b26b4290cc84d95ad3e93c3255277a1'
// process.env.INPUT_OWNER_DATABASE = '3ee0d01944924634990b42b44253d370'
// process.env.INPUT_SYSTEM_DATABASE = 'c721d8f0e6e34961ba037c67ad632585'

const ip = path.join(__dirname, 'index.js')
const options = {
  env: process.env
}

const ls = spawn('node', [ip], options)

ls.stdout.on('data', (data) => {
  process.stdout.write(`${data}`)
})

ls.stderr.on('data', (data) => {
  process.stdout.write(`${data}`)
})

ls.on('close', (code) => {
  console.log(`child process exited with code ${code}`)
})
