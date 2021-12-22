const { spawn } = require('child_process')
const path = require('path')
const process = require('process')

process.env.INPUT_DATABASE = 'cecaf0beb15945158d155866ff9acce8' // '2b26b4290cc84d95ad3e93c3255277a1'
process.env.INPUT_NOTION_TOKEN = process.env.NOTION_TOKEN
process.env.INPUT_GITHUB_TOKEN = process.env.GITHUB_TOKEN
process.env.INPUT_REPOSITORY_TYPE = 'public'
process.env.INPUT_GITHUB_OWNER = 'infinitaslearning'
process.env.INPUT_SEGMENT_DATABASE = '7943615f4dba43b3a3b0f991f4f7136d'
process.env.INPUT_TEAM_DATABASE = 'c11736fe61b941149de098676bde8d92'
process.env.INPUT_SYSTEM_DATABASE = '121534684fe840a1953500e603c2b602'

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
