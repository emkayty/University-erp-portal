module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === '@prisma/config' && pkg.dependencies?.['deepmerge-ts'] === '7.1.5') {
        pkg.dependencies['deepmerge-ts'] = '8.0.1';
      }
      return pkg;
    },
  },
};
