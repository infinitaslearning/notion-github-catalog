const getDependsOn = async (dependsOn, { notion, database }) => {
  const dependencies = []
  for (const dependency of dependsOn) {
    // Lets see if we can find the row
    const search = await notion.databases.query({
      database_id: database,
      filter: {
        property: 'Name',
        text: {
          equals: dependency
        }
      }
    })
    if (search.results.length > 0) {
      dependencies.push({ id: search.results[0].id })
    }
  }
  return dependencies
}

exports.getDependsOn = getDependsOn
