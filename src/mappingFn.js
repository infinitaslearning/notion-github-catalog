/**
 * For each possible field name in the service catalogue, expose a mapping function
 * If a function is not found the field will be skipped
 */
const mappingFn = {
  Name: (repo) => {
    return {
      title: [
        {
          text: {
            content: repo.metadata?.name || repo._repo.name
          }
        }
      ]
    }
  },
  Description: (repo) => {
    return {
      rich_text: [
        {
          text: {
            content: repo.metadata?.description || repo._repo.description || repo._repo.name
          }
        }
      ]
    }
  },
  Updated: () => {
    return {
      date: {
        start: new Date().toISOString()
      }
    }
  },
  System: (repo, { systems }) => {
    let system
    const systemSpec = repo?.spec?.system
    if (systems) {
      // Segments are a relation
      system = {
        relation: [
          { id: systems[systemSpec?.toLowerCase()] || systems.unknown }
        ]
      }
    } else {
      // Segments are a tag
      system = {
        select: {
          name: systemSpec || 'Unknown'
        }
      }
    }
    return system
  },
  URL: (repo) => {
    // We can use the catalog file location to locate the right path within the repo if it is a monorepo
    const htmlUrl = repo.fromLocation ? repo._catalog_file.substring(0, repo._catalog_file.lastIndexOf('/')) : repo._repo.html_url
    return {
      url: htmlUrl
    }
  },
  Kind: (repo) => {
    return {
      select: {
        name: repo.kind || 'Unknown'
      }
    }
  },
  Tags: (repo) => {
    return {
      multi_select: repo.metadata?.tags ? repo.metadata.tags.flatMap(tag => { return { name: tag } }) : []
    }
  },
  Lifecycle: (repo) => {
    return {
      select: {
        name: repo.spec?.lifecycle || 'Unknown'
      }
    }
  },
  Owner: (repo, { owners }) => {
    let owner
    const ownerSpec = repo?.spec?.owner
    if (owners) {
      // Owners are a relation
      owner = {
        relation: [
          { id: owners[ownerSpec?.toLowerCase()] || owners.unknown }
        ]
      }
    } else {
      // owners are a tag
      owner = {
        select: {
          name: ownerSpec || 'Unknown'
        }
      }
    }
    return owner
  },
  Visibility: (repo) => {
    return {
      select: {
        name: repo._repo.visibility
      }
    }
  },
  Language: (repo) => {
    return {
      select: {
        name: repo._repo.language || 'Unknown'
      }
    }
  },
  Status: (repo) => {
    return {
      select: {
        name: repo.status
      }
    }
  },
  DependsOn: (repo, { dependsOn }) => {
    return { relation: dependsOn }
  },
  Environments: (repo) => {
    return {
      multi_select: repo.metadata?.annotations?.environments ? repo.metadata?.annotations?.environments.split(',').flatMap(env => { return { name: env } }) : []
    }
  },
  Deployment: (repo) => {
    return {
      select: {
        name: repo.metadata?.annotations?.deployment || 'Unknown'
      }
    }
  },
  DependencyOf: null // Skip this field
}

exports.mappingFn = mappingFn
