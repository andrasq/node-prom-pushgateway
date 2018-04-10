prom-pushgateway
=============================
[![Build Status](https://api.travis-ci.org/andrasq/node-prom-pushgateway.svg?branch=master)](https://travis-ci.org/andrasq/node-prom-pushgateway?branch=master)
[![Coverage Status](https://codecov.io/github/andrasq/node-prom-pushgateway/coverage.svg?branch=master)](https://codecov.io/github/andrasq/node-prom-pushgateway?branch=master)


Embeddable aggregating Prometheus push gateway.

`prom-pushgateway` is a low overhead embeddable nodejs nanoservice.  It can be
included in other apps to expose a Promptheus compatible metrics endpoint, or can run
standalone to provide an independent, Prometheus scrapable metrics push service.

Accepts stats from an app and presents them to be scraped by Prometheus.  Same-named
stats are subsampled (averaged), which allows stats to be gathered more frequently
than the scrape interval, and simplifies stats reporting from multi-threaded apps.

Also implements a Stackdriver compatible push endpoint to simplify the upload of
legacy Stackdriver metrics to Prometheus.

The HELP and TYPE attributes are remembered and associated with the named metrics;
untyped metrics are reported as gauges.  Use `/push` or `gateway.ingestMetrics()` to set
typing information with comment lines `# TYPE <name> <type>\n`.


Overview
--------

The gateway forks itself into a separate process and listens for requests.

    const gw = require('prom-pushgateway');
    const worker = gw.forkServer({ port: 9091 }, (err, info) => {
        // => { pid: 12345, port: 9091 }
    })


Api
---

### gw.createServer( config, [callback] )

Create a pushgateway http server listening on `config.port`, and return the server.

With a callback tries for up to `listenTimeout` ms to acquire and listen on the socket
and returns any error or the port and process id of the server to its callback.

Without a callback it does not retry, it throws a listen error if the port is not
available, or emits an `'error'` event on the server if there is a listener for it.

    // publish prom-client default metrics on port 9091
    const promClient = require('prom-client');
    promClient.collectDefaultMetrics();
    const gw = require('prom-pushgateway').createServer({
        readPromMetrics: function() { return promClient.register.metrics() }
    });

    // add to that our our own custom metrics
    const myMetrics =
        'my_metric_a 1\n' +
        '# TYPE my_metric_b counter\n' +
        'my_metric_b 2\n';
    gw.gateway.ingestMetrics(myMetrics, function(err) {
        // ingested
    })

### gw.forkServer( config, [callback] )

Run `createServer` in a child process, and return its port and pid back to the parent.
This decouples the gateway from the event loop of the application.  The worker will
exit soon after the parent exits.  On error the worker is killed.

Internally `createServer` is called with a callback; if `forkServer` is called with a
callback, errors and port/pid are returned to the caller, without a callback errors
are rethrown.

### gw.createGateway( config )

Create a pushgateway, usable by `createServer`.

The pushgateway has methods
- `ingestMetrics(report, cb)` - cache the metrics contained in the prom-client format
  newline delimited metrics report string
- `ingestMetricsStackdriver(body, cb)` - cache the metrics contained in the
  legacy stackdriver format metrics upload string
- `reportMetrics()` - average the cached metrics, and return a prom-client formatted
  metrics report string.  Metrics are reported as values, not deltas; if no new metrics
  arrived, the last reported values are sent again.
- `clear()` - forget all seen metrics and HELP and TYPE information


Config
------

Server options:
- `port` - port to listen on, default 9091 (same as prometheus-pushgateway).
  A `port` must be given unless `anyPort` is  is specified.
- `verbose` - whether to log service start/stop messages, default false
- `listenTimeout` - how long to retry to listen() on the configured socket
  before giving up
- `gateway` - use the proviced Gateway object instead of creating a new one.
  This option is ignored by `forkServer`.
- `anyPort` - if unable to listen on `port`, listen on any available port (port 0).
  `createServer` returns the port the server is listening on.  If both `port` and
  `anyPort` are specified, `port` is tried first.

Gateway options:
- `labels` - hash of labels to add to reported metrics, default `{}` none
- `readPromMetrics` - function to retrieve Prometheus metrics for inclusion in a
  `/metrics` report, default none
- `maxMetricAgeMs` - discard metrics that have been collected more than millisec
  before being reported (ie, before when `reportMetrics()` runs)
- `omitTimestamps` - omit collection timestamps from the output of `reportMetrics()`.
  This makes prom-pushgateway report bare metrics, letting prometheus add its own
  notion of the collection time.

Other config settings are ignored.


Http Api
--------

The gateway listens on the configured port (default 9091) for http requests.

### GET /healthcheck

Returns 200 OK status code and "OK" body, just to confirm that the service is up.

### POST /push

Push prometheus-pushgateway format stats to the gateway to be scraped by Prometheus.
The stats are cached until collected by a call to /metrics.
Metrics ingestion is done by `gateway.ingestMetrics()`.

    $ curl --data-binary @- << EOF http://localhots:9091/push
    metric1 11.5
    metric2{host="host-01"} 12.5
    metric2{host="host-02"} 13.5
    # TYPE metric3 counter
    metric3 7
    EOF

    $ curl http://localhost:9091/metrics
    # HELP metric1 custom metric
    # TYPE metric1 gauge
    metric1 11.5 1519998877123

    # HELP metric2 custom metric
    # TYPE metric2 gauge
    metric2{host="host-01"} 12.5 1519998877123
    metric2{host="host-02"} 13.5 1519998877123

    # HELP metric3 custom metric
    # TYPE metric3 counter
    metric3 7 1519998877123

### POST /push/stackdriver
### POST /v1/custom

Push legacy-Stackdriver format stats to the gateway to be scraped by Prometheus.
Metrics ingestion is done by `gateway.ingestMetricsStackdriver()`.

    $ curl --data-binary @- << EOF http://localhost:9091/push/stackdriver
    { "timestamp":1519534800,
      "proto_version":1,
      "data":[
        {"name":"metric1","value":1.5,"collected_at":1519534800,"instance":"i-001234"},
        {"name":"metric2","value":2.5,"collected_at":1519534800}
      ]
    }
    EOF
    // => Published

    $ curl http://localhost:9091/metrics
    # HELP metric1 custom metric
    # TYPE metric1 gauge
    metric1{instance="i-001234"} 1.5 1519534800000

    # HELP metric2 custom metric
    # TYPE metric2 gauge
    metric2 2.5 1519534800000

### GET /metrics

Endpoint used by Prometheus to scrape stats. The cached stats are aggregated when reported
(averaged, with the most recent timestamp).  Each call to /metrics will report all known metrics,
whether or not new samples have been pushed since the last call.  If no new samples arrived, the
last reported values are sent again.  Aggretation and reporting is done by `gateway.reportMetrics()`.

    $ curl -v http://localhost:9091/metrics
    < HTTP/1.1 200 OK
    < Content-Type: text/plain
    < Date: Sat, 24 Feb 2018 19:28:16 GMT
    < Connection: keep-alive
    < Transfer-Encoding: chunked
    <
    # HELP metric1 custom metric
    # TYPE metric1 gauge
    metric1 11.5 1519500493638

    # HELP metric2 custom metric
    # TYPE metric2 gauge
    metric2 12.5 1519500493638


Change Log
----------

- 0.10.0 - `config.omitTimestamps` and `config.maxMetricAgeMs` options, fix server options passing
- 0.9.0 - `gateway.clear` method, `config.anyPort`, reuse HELP and TYPE attributes by metric name
- 0.8.0 - `createGateway` method, and `createServer` `gateway` option
- 0.7.0 - preserve prom metrics HELP and TYPE info, `readPromMetrics` callout function constructor option
- 0.6.3 - publish the readme edits and package.json readme test
- 0.6.2 - report metrics grouped by name, with help and type tags
- 0.6.1 - retry to listen, `listenTimeout`
- 0.6.0 - `config.labels` support, rename to prom-pushgateway, /v1/custom endpoint
- 0.5.2 - 100% test coverage
- 0.5.0 - fully working


Related Work
------------

- [prometheus](https://github.com/prometheus) - Prometheus monitoring
- [prometheus-pushgateway](https://github.com/prometheus/pushgateway) - prometheus-pushgateway
  scrapable metrics cache
- [google-custom-metrics](https://npmjs.com/package/google-custom-metrics) - library to
  convert and push legacy Stackdriver metrics to Google Stackdriver

Todo
----

- checkpoint metrics into a local journal (to back up the in-memory copy).
  Load journal on start, empty when scraped.
- report metrics with a configurable separation gap to not split clusters of points
- cache aggregates, not samples
- support `config.omitTimestamps` to report just stats, without collection times
