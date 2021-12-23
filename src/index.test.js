const path = require('path')
const process = require('process')
const cp = require('child_process')

jest.setTimeout(180000)

test('complete input should succeed with default inputs', () => {
  process.env.INPUT_DATABASE = process.env.NOTION_DATABASE // cecaf0beb15945158d155866ff9acce8
  process.env.INPUT_NOTION_TOKEN = process.env.NOTION_TOKEN
  process.env.INPUT_GITHUB_TOKEN = process.env.GITHUB_TOKEN
  process.env.INPUT_REPOSITORY_TYPE = 'public'
  process.env.INPUT_GITHUB_OWNER = 'infinitaslearning'
  process.env.INPUT_OWNER_DATABASE = '7943615f4dba43b3a3b0f991f4f7136d'  
  process.env.INPUT_SYSTEM_DATABASE = '121534684fe840a1953500e603c2b602'

  const ip = path.join(__dirname, 'index.js')
  const options = {
    env: process.env
  }
  const result = cp.execSync(`node ${ip}`, options).toString()
  expect(result).toBeDefined()
})
