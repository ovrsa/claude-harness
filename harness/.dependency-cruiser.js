/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      comment:
        'Circular dependencies inside the local control plane tend to create fragile maintenance loops.',
      from: {},
      to: {
        circular: true
      }
    }
  ],
  options: {
    doNotFollow: {
      path: ['node_modules']
    },
    includeOnly: ['^harness/(hooks|scripts)'],
    exclude: {
      path: [
        '^node_modules',
        '^plugins',
        '^skills',
        '^agents',
        '^projects',
        '^file-history',
        '^session-env',
        '^sessions',
        '^shell-snapshots',
        '^cache',
        '^backups',
        '^debug',
        '^paste-cache'
      ]
    },
    moduleSystems: ['cjs', 'es6'],
    combinedDependencies: true
  }
};
