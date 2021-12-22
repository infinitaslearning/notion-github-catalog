# Notion Github Catalog

This action will scan all of the Github repositories available to the provided token and update their information in the specified Notion database.

## Notion integration and token

First, you need to have an integration access token - which you can get from https://www.notion.so/my-integrations after creating an integration.  Give the integration a friendly name like 'Github Actions'.

By default integrations cant access any content so you you *must* share your database (or the parent page / tree it is contained within) with the integration you created earlier to be able to access it.

## Notion Databases

This action expects a Notion database with the following properties, this will become the 

  - Name: text
  - Description: text
  - Kind: select
  - URL: url
  - Segment: select
  - Team: select
  - Tags: multi_select
  - Visibility: select
  - Language: select
  - Status: select
  - Updated: date

The following notion page and database is connected to the tests by default, and can be used as a template: https://infinitaslearning.notion.site/Notion-Github-Catalogue-ac2395eda37144e698e6b8faef1003c7

It looks like this after it has run:

<img width="1451" alt="Screenshot 2021-12-19 at 12 55 39" src="https://user-images.githubusercontent.com/239305/146673989-01187d53-d2fd-42ba-9968-31442b8cc92d.png">

## Relation Databases

You have an option to provide additional 'lookup' databases to convert some of the above selects into relations:

### Segment, Team, System

1. Create a database that has *at least* a `Name` column that is unique, all other columns are up to you.
2. Create an 'Unknown' row - this is what services that cannot be mapped go to (this name matters).
3. In the config of the action, provide the input variable `segment_database` pointing to this database.
4. In the main service catalogue table convert the `Segment` column to a relation, pointing at the above database.

This can be repeated for `Team` and `System`.  The full config is below in the usage.

## Service Descriptor Format

This action expects each of your repositories to have a descriptor file format in the root of the repo in the form of a Backstage `catalog-info` file.  This is because we are testing this approach against using Backstage directly, and wanted to leverage a format that perhaps has a chance of becoming a defacto standard.  It does not currently map all fields from Backstage, but if you look at the code you can see what it does map.  I may add a config option to allow mapping to be more dynamic in future (a good PR!). 

Information on the format: https://backstage.io/docs/features/software-catalog/descriptor-format

## Usage

https://www.notion.so/infinitaslearning/2b26b4290cc84d95ad3e93c3255277a1?v=8648fdba9c0b4fe08d680cefa9825174

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
         segment_database: 7943615f4dba43b3a3b0f991f4f7136d
         team_database: c11736fe61b941149de098676bde8d92
         system_database: 121534684fe840a1953500e603c2b602
         repository_type: all
         catalog_file: catalog-info.yaml

```

To get the database ID, simply browse to it, click on the '...' in Notion, and get a 'Copy link'.  The GUID at the end of the URL (but before the `?v=`) is the id, this works on both embedded and full page databases.

## Development

Assumes you have `@vercel/ncc` installed globally.
After changes ensure you `npm run build`, commit and then submit a PR.

For the tests to run you need to have the environment variables set for GITHUB_TOKEN, NOTION_TOKEN and NOTION_DATABASE.
