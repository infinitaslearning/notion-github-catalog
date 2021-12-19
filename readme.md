# Notion Github Catalog

This action will scan all of the Github repositories available to the provided token and update their information in the specified Notion database.

## Notion integration and token

First, you need to have an integration access token - which you can get from https://www.notion.so/my-integrations after creating an integration.  Give the integration a friendly name like 'Github Actions'.

By default integrations cant access any contentm so you you *must* share your database with the integration you created earlier to be able to access it!

## Notion Database

This action expects a Notion database with the following properties:

  - Name: text
  - URL: url
  - Segment: select
  - Team: select
  - Tags: multi_select
  - Updated: date

It looks like this after it has run:

<img width="1451" alt="Screenshot 2021-12-19 at 12 55 39" src="https://user-images.githubusercontent.com/239305/146673989-01187d53-d2fd-42ba-9968-31442b8cc92d.png">

## Usage

This is typically deployed as a scheduled action:

```yaml
name: Catalog
on:
  schedule:
    - cron:  '30 5 * * *'
  workflow_dispatch:
jobs:
  catalog:
    runs-on: ubuntu-latest
    steps:
     - name: Notion github catalog     
       uses: infinitaslearning/notion-github-catalog@main        
       with:          
         github_owner: infinitaslearning
         github_token: ${{ secrets.PAT_GITHUB_TOKEN }}
         notion_token: ${{ secrets.NOTION_TOKEN }}
         database: 2b26b4290cc84d95ad3e93c3255277a1    
         repository_type: all

```

To get the database ID, simply browse to it, click on the '...' in Notion, and get a 'Copy link'.  The GUID at the end of the URL is the id, this works on both embedded and full page databases.

## Development

Assumes you have `@vercel/ncc` installed globally.
After changes ensure you `npm run build`, commit and then submit a PR.

For the tests to run you need to have the environment variables set for GITHUB_TOKEN, NOTION_TOKEN and NOTION_DATABASE.
