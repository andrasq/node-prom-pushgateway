kinvey-prometheus-pushgateway
=============================

Embeddable aggregating Prometheus push gateway.

Accepts stats from an app and presents them to be scraped by Prometheus.  Same-named
stats are subsampled (averaged), which allows stats to be gathered more frequently
than the scrape interval, and simplifies stats reporting from multi-threaded apps.

All metrics values are treated as untyped, unconstrained numbers, ie gauges.


Overview
--------

The gateway forks itself into a separate process and listens for requests.

    const gw = require('kinvey-prometheus-pushgateway');
    gw.forkServer({ port: 9091 }, (err, info) => {
        // => { pid: 12345, port: 9091 }
    })

Api
---

### gw.createServer( config, [callback] )

Create a pushgateway server listening on `config.port`, and return its port and
process id to the `callback`.

### gw.forkServer( config, [callback] )

Create a child process running `createServer`.  This decouples the gateway from the
event loop of the application.


Config
------

- `port` - port to listen on, default 9091 (same as prometheus-pushgateway)
- `labels` - hash of labels to add to reported metrics, default `{}` none
- `verbose` - whether to log service start/stop messages, default false.

Http Api
--------

The gateway listens on the configured port (default 9091) for http requests.

### /healthcheck

Returns 200 OK status code and "OK" body, just confirm that the service is up.

### /push

Push prometheus-pushgateway style stats to the gateway to be scrapable by prometheus.
The stats are cached until collected by calling /metrics.

    curl --data-binary @- << EOF http://localhots:9091/push
    metric1 11.5
    metric2 12.5
    EOF

### /metrics

Endpoint used by prometheus to scrape stats.

    curl -v http://localhost:9091/metrics
    < HTTP/1.1 200 OK
    < Content-Type: text/plain
    < Date: Sat, 24 Feb 2018 19:28:16 GMT
    < Connection: keep-alive
    < Transfer-Encoding: chunked
    <
    metric2 12.5 1519500493638
    metric1 11.5 1519500493638


Todo
----

- checkpoint metrics into a local journal (to back up the in-memory copy).
  Load journal on start, empty when scraped.
- report metrics with a configurable separation gap to not split clusters of points
- create /push/stackdriver to accept metrics in legacy Stackdriver format
