fireman-pushgateway
===================

Embeddable aggregating Prometheus push gateway.

Accepts stats from an app and presents them to be scraped by Prometheus.  Same-named
stats are averaged, which allows stats to be gathered more frequently than the scrape
interval, and simplifies stats reporting from multi-threaded apps.

All metrics are treated as untyped values, ie gauges.


Overview
--------

The gateway forks itself into a separate process and listens for requests.


Api
---


Http Api
--------

The gateway listens on the configured port (default 9091) for http requests.

### /push

Push stats to prometheus.

### /metrics

Endpoint used by prometheus to scrape 

### /healthcheck

Returns 200 OK status code and "OK" body.


Todo
----

- checkpoint metrics into a local journal (to back up the in-memory copy).
  Load journal on start, empty when scraped.
- report metrics with a configurable separation gap to not split clusters of points
