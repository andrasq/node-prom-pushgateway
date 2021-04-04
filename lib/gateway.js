/**
 * Copyright (C) 2018 Kinvey, Inc.
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */

/**
 * prometheus push gateway
 * Push metrics to the push gateway, let prometheus scrape the gateway.
 *
 * 2018-02-20 - AR.
 */

'use strict';

const util = require('util');
// const QFputs = require('qfputs');

module.exports = Gateway;

function Gateway( config ) {
    // TODO: checkpoint to journal
    // if (!config.journalFilename) throw new Error('config.journalFilename required');

    // formats described in https://prometheus.io/docs/concepts/data_model/
    this.metricNameFormat = /[a-zA-Z_:][a-zA-Z_:0-9]*/;
    this.labelNameFormat = /[a-zA-Z_][a-zA-Z_0-9]*/;
    this.metricLineFormat = /^(([^\s\{]+)({(.*)})?)\s+([0-9.]+|NaN)(\s+([0-9]+))?$/;
    this.samples = new Array();

    // function to fetch promClient.register.metrics() to include when /metrics is called
    this.readPromMetrics = config.readPromMetrics;

    this.journalFilename = config.journalFilename;
    this.labels = config.labels || "";
    this.maxMetricAgeMs = config.maxMetricAgeMs;
    this.omitTimestamps = config.omitTimestamps;

    // convert a labels hash into a labels substring to prepend
    if (typeof this.labels !== 'string') {
        var key, labelsString = "";
        for (key in this.labels) labelsString += key + '="' + this.labels[key] + '",';
        this.labels = labelsString;
    }
    if (this.labels && this.labels[this.labels.length - 1] !== ',') this.labels += ',';

    // this.journal = new QFputs(this.journalFilename);
    this.previousValues = {};
    this.helpInfo = {};
    this.typeInfo = {};
}

Gateway.trace = function trace( /* VARARGS */ ) {
    var argv = new Array();
    for (var i=0; i<arguments.length; i++) argv[i] = arguments[i];
    console.log("%s -- %s", new Date().toISOString(), util.format.apply(util, argv));
}


Gateway.prototype.clear = function clear( ) {
    this.samples.splice(0);
    this.previousValues = {};
    this.helpInfo = {};
    this.typeInfo = {};
}

Gateway.prototype.getTimestamp = function getTimestamp( ) {
    return Date.now();
}

Gateway.prototype.ingestMetrics = function ingestMetrics( contents, callback ) {
    const timestamp = this.getTimestamp();
    var lines, i, line, parsed, metric;

    // TODO: checkpoint metrics to a journal to not lose samples
    // TODO: on startup, read existing journal into memory

    var badLines = new Array();
    var goodLines = new Array();

    lines = contents.split('\n');
    this.parseMetricsLines(lines, badLines, goodLines, this.samples);

    if (badLines.length > 0) {
        this.trace("unable to parse metric lines:\n%s", badLines.join('\n'));
    }

    if (goodLines.length > 0) {
        // this.journal.fputs(goodLines.join('\n'));
    }

    setImmediate(callback);
    // this.journal.fflush((err) => {
    //     callback(err);
    // })
}

Gateway.prototype.ingestMetricsStackdriver = function ingestMetricsStackdriver( body, callback ) {
    body = JSON.parse(body);
    if (body.proto_version != 1) throw new Error(body.proto_version + ': unsupported stackdriver proto_version');
    const timestamp = body.timestamp;
    var i, id, value;

    var lines = new Array();
    for (i=0; i<body.data.length; i++) {
        id =  body.data[i].name;
        value = body.data[i].value;
        // skip NaN samples?
        if (value === null) value = NaN;
        if (body.data[i].instance) id += '{instance=' + JSON.stringify(String(body.data[i].instance)) + '}';
        lines.push(util.format('%s %s %s\n', id, value, 1000 * (body.data[i].collected_at || timestamp)));
    }
    return this.ingestMetrics(lines.join(''), callback);
}

Gateway.prototype.parseMetricsLines = function parseMetricsLines( lines, badLines, goodLines, samples ) {
    const timestamp = this.getTimestamp();
    var i, line, sample, parsed;
    var match;

    for (i=0; i<lines.length; i++) {
        line = lines[i].trim();
        if (!line) continue;

        if (line[0] === '#') {
            // HELP and TYPE describe the named metrics, reuse to not default known types
            if (match = /^# HELP ([^ ]+)/.exec(line))    { this.helpInfo[match[1]] = line; continue }
            if (match = /^# TYPE ([^ ]+) .+/.exec(line)) { this.typeInfo[match[1]] = line; continue }
            continue;
        }

        // TODO: move parsing out-of-band to not delay the upload
        // TODO: console.log and skip stale metrics (backfilled metrics), prometheus does not handle them right
        // TODO: accept non-numeric timestamps (ie, iso datetime strings)
        parsed = this.metricLineFormat.exec(line);

        if (!parsed) {
            badLines.push(line);
            continue;
        }

        sample = {
            id: parsed[1],
            name: parsed[2],
            value: parsed[5],
            ts: parsed[7] || timestamp,
            labels: parsed[4] || '',
        };
        samples.push(sample);

        if (parsed[6]) goodLines.push(line);
        else goodLines.push(line + ' ' + timestamp);
    }
}

function safeRunFunc( fn ) {
    try { return fn() } catch (e) { return null }
}

Gateway.prototype.reportMetrics = function reportMetrics( ) {
    // note: ingestMetrics is immediate, the callback not needed yet
    if (this.readPromMetrics) this.ingestMetrics(safeRunFunc(this.readPromMetrics) || '', function(){});

    var samples = this.samples;
    var i, k, lines;

    // pre-sort the samples for easier inspection
    samples.sort((a, b) => (a.ts <= b.ts ? -1 : 1));

    // TODO: skip too-old metrics (report to process output), it confuses prometheus
    // TODO: hold "too new" samples for the next scrape (ie samples that are from the next cluster)
    // TODO: report metrics with a lag (guard band), to not split clusters of samples
    samples = samples.splice(0);

    // discard samples older than the configured cutoff
    if (this.maxMetricAgeMs >= 0) {
        const now = this.getTimestamp();
        const oldestKeepTs = now - this.maxMetricAgeMs;
        for (i=0; i<samples.length && samples[i].ts < oldestKeepTs; i++) ;
        if (i > 0) {
            Gateway.trace("discarding %d samples older than %d ms, from %d to %d",
                i, this.maxMetricAgeMs, samples[0].ts, samples[i-1].ts);
            samples = samples.slice(i);
        }
    }

    var id, map = {}, averages = new Array();
    samples.forEach((metric) => {
        id = metric.id;
        if (!map[id]) {
            map[id] = { id: id, name: metric.name, value: 0, labels: metric.labels, ts: 0, count: 0 };
            averages.push(map[id]);
        }
        map[id].count += 1;
        map[id].value += +metric.value;
        // tag the reported value with the freshest timestamp (pre-sorted)
        map[id].ts = +metric.ts;
    })

    for (i=0; i<averages.length; i++) averages[i].value /= averages[i].count;

    // never omit any known metrics, report the previous value if no change
    // This allows /metrics to be called more frequently than the /push interval.
    var allValues = {};
    for (id in this.previousValues) allValues[id] = this.previousValues[id];
    for (id in map) allValues[id] = map[id];
    this.previousValues = allValues;

    return this.reportAllValues(allValues);
}

Gateway.prototype.reportAllValues = function reportAllValues( allValues ) {
    var i, j, metric, line;
    var nameIdMap = {}, names, name, id, metric;
    var reportLines = new Array();

    // report metrics sorted by tagged metric name
    // This breaks for numeric tags, since 10 comes before 9, but should mostly help
    var allKeys = Object.keys(allValues).sort(function(a, b) { return a < b ? -1 : +1 });

    for (i=0; i<allKeys.length; i++) {
        metric = allValues[allKeys[i]];
        nameIdMap[metric.name] = nameIdMap[metric.name] || new Array();
        nameIdMap[metric.name].push(metric);
    }

    // report stats in alpha order grouped by name
    names = Object.keys(nameIdMap);
    names = names.sort();

    for (i=0; i<names.length; i++) {
        name = names[i];
        // tag with most recently seen HELP and TYPE info
        reportLines.push(this.helpInfo[name] || util.format('# HELP %s custom metric', name));
        reportLines.push(this.typeInfo[name] || util.format('# TYPE %s gauge', name));
        for (j=0; j<nameIdMap[name].length; j++) {
            metric = nameIdMap[name][j];
            id = metric.name;
            if (this.labels || metric.labels) id += '{' + this.labels + metric.labels + '}';
            line = util.format('%s %s', id, metric.value);
            if (!this.omitTimestamps) line += ' ' + metric.ts;
            reportLines.push(line);
        }
        reportLines.push('');
    }

    // remove the trailing blank line
    reportLines.pop();

    return reportLines;
}

Gateway.prototype.trace = Gateway.trace;
