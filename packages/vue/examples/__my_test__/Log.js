const Log = {
  log(...args) {
    console.log(
      `%c ------------------------->`,
      'background:#10efd0; color: white;font-size: 20px;',
      ...args
    )
  }
}

// Log.log(12)
// Log.log({ name: 'a' })
// Log.log([1,2,3])
// Log.log('===', 1000)
// Log.log('array', [1,23])
