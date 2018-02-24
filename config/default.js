module.exports = {
  "port": 9091,
  "logDir": ".",
  "journalName": "metrics.jrn",
  "host": require('os').hostname().replace(/\..*$/, ''),
  "labels": {
  }
}
