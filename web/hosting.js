'use strict';

// Managed hosting imports the entry file; it does not execute it as require.main.
require('./server').startStudio().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
