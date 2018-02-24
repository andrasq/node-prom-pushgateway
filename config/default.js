module.exports = {
  // port to listen on (default is same as prometheus-pushgateway)
  port: 9091,

  verbose: true,

  logDir: ".",
  journalName: "metrics.jrn",

  // hostname -s
  host: require('os').hostname().replace(/\..*$/, ''),

  // labels to prepend to each metric
  labels: {
  }
}
