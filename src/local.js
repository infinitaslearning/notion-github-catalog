const { spawn } = require('child_process')
const path = require('path')
const process = require('process')

process.env.INPUT_DATABASE = '2b26b4290cc84d95ad3e93c3255277a1'
process.env.INPUT_NOTION_TOKEN = process.env.NOTION_TOKEN
process.env.INPUT_GITHUB_TOKEN = process.env.GITHUB_TOKEN

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
