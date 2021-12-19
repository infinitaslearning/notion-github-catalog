const path = require('path')
const process = require('process')
const cp = require('child_process')

jest.setTimeout(180000)

test('complete input should succeed with default inputs', () => {
  process.env.INPUT_DATABASE = '2b26b4290cc84d95ad3e93c3255277a1'
  process.env.INPUT_NOTION_TOKEN = process.env.NOTION_TOKEN
  process.env.INPUT_GITHUB_TOKEN = process.env.GITHUB_TOKEN  
  const ip = path.join(__dirname, 'index.js')
  const options = {
    env: process.env
  }
  const result = cp.execSync(`node ${ip}`, options).toString()  
  expect(result).toBeDefined()
})
