console.log('Testing electron require...');
console.log('process.versions.electron:', process.versions.electron);
console.log('__dirname:', __dirname);

try {
  const electron = require('electron');
  console.log('typeof electron:', typeof electron);
  console.log('electron:', electron);
  if (typeof electron === 'string') {
    console.log('electron is a path string - this means node_modules/electron is being loaded');
  } else if (electron.app) {
    console.log('electron.app exists - SUCCESS!');
  }
} catch (e) {
  console.log('Error:', e.message);
}
