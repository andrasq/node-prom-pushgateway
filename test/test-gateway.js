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

'use strict';

const Gateway = require('../lib/gateway');

module.exports = {
    beforeEach: function(done) {
        this.gw = new Gateway({});
        done();
    },

    'constructor': {
        'should set metricLineFormat': function(t) {
            t.ok(new Gateway({}).metricLineFormat instanceof RegExp);
            t.done();
        },

        'should convert labels hash to labels prefix': function(t) {
            var i, gw, tests = [
                [ '', '' ],
                [ 'a="one"', 'a="one",' ],
                [ 'a="one",b="two"', 'a="one",b="two",' ],
                [ {a: 'one', b: 'two'}, 'a="one",b="two",' ],
            ];
            for (i=0; i<tests.length; i++) {
                gw = new Gateway({ labels: tests[i][0] });
                t.equal(gw.labels, tests[i][1]);
            }
            t.done();
        },
    },

    'trace should write to stdout': function(t) {
        var output;
        t.stubOnce(process.stdout, 'write', function(data) { output = data });
        this.gw.trace('struct is', {a:1, b:2});
        t.contains(output, 'struct is { a: 1, b: 2 }\n');
        t.done();
    },

    'ingestMetrics': {
        'should parse metrics lines': function(t) {
            const self = this;
            const spy = t.spyOnce(this.gw, 'parseMetricsLines');
            this.gw.ingestMetrics('metric1 1\nmetric2 2\n', function(err, ret) {
                t.ok(spy.called);
                t.deepEqual(spy.args[0][0], ['metric1 1', 'metric2 2', '']);
                t.deepEqual(spy.args[0][1], []);
                t.deepEqual(spy.args[0][2].length, 2);
                t.deepEqual(spy.args[0][3], self.gw.samples);
                t.done();
            })
        },

        'should upload zero': function(t) {
            const self = this;
            const spyParse = t.spyOnce(this.gw, 'parseMetricsLines');
            const contents = '\n\n';
            this.gw.ingestMetrics(contents, function(err) {
                // spyParse is called with (contents, badLines, goodLines, samples)
                // goodLines and badLines are populated by parseMetricsLines
                t.deepEqual(spyParse.args[0], [['', '', ''], [], [], self.gw.samples]);
                t.done();
            })
        },

        'should separate good lines and bad lines and complain about bad lines': function(t) {
            const spyParse = t.spyOnce(this.gw, 'parseMetricsLines');
            const spyWrite = t.stubOnce(process.stdout, 'write');
            const contents =
                'metric1\n' +
                '1234\n' +
                '# TYPE gauge\n' +
                '# TYPE counter\n' +
                'metric2 2\n' +
                '# comment\n' +
                '';
            this.gw.ingestMetrics(contents, function(err) {
                t.ok(spyWrite.called);
                t.contains(spyWrite.args[0][0], 'unable to parse');
                t.contains(spyWrite.args[0][0], '\nmetric1\n');
                t.contains(spyWrite.args[0][0], '\n1234\n');
                t.notContains(spyWrite.args[0][0], '\n# TYPE\n');
                // spyParse is called with (contents, badLines, goodLines, samples)
                // goodLines and badLines are populated by parseMetricsLines
                t.deepEqual(spyParse.args[0][1], ['metric1', '1234']);
                t.equal(spyParse.args[0][2].length, 1);
                t.ok(spyParse.args[0][2][0].match(/^metric2 2 \d+$/));
                t.done();
            })
        },

        'should remember help and type attributes until cleared': function(t) {
            const gw = this.gw;
            const typeMetrics =
                '# TYPE t1 my-type\n' +
                '# HELP t2 my-help\n' +
                '# TYPE t1 my-type-t1\n' +
                '# TYPE t2 my-type-t2\n' +
                '';
            const valueMetrics =
                '\n' +
                't1 1 1500000001000\n' +
                '\n' +
                't2 2 1500000002000\n' +
                '';
            gw.ingestMetrics(typeMetrics + valueMetrics, function(err) {
                t.ifError(err);
                t.contains(gw.helpInfo, { t2: '# HELP t2 my-help' });
                t.contains(gw.typeInfo, { t1: '# TYPE t1 my-type-t1' });

                const report = gw.reportMetrics().join('\n') + '\n';
                t.contains(report, '# HELP t1 custom metric\n# TYPE t1 my-type-t1\nt1 1 1500000001000\n');
                t.contains(report, '# HELP t2 my-help\n# TYPE t2 my-type-t2\nt2 2 1500000002000\n');

                const report2 = gw.reportMetrics().join('\n') + '\n';
                t.contains(report2, '# HELP t1 custom metric\n# TYPE t1 my-type-t1\nt1 1 1500000001000\n');
                t.contains(report2, '# HELP t2 my-help\n# TYPE t2 my-type-t2\nt2 2 1500000002000\n');

                gw.clear();
                gw.ingestMetrics(valueMetrics, function(err) {
                    t.ifError(err);

                    const report3 = gw.reportMetrics().join('\n') + '\n';
                    t.contains(report3, '# HELP t1 custom metric\n# TYPE t1 gauge\nt1 1 1500000001000\n');
                    t.contains(report3, '# HELP t2 custom metric\n# TYPE t2 gauge\nt2 2 1500000002000\n');

                    t.done();
                })
            })
        },

        'should associate remembered type attributes with labeled metric name': function(t) {
            const gw = this.gw;
            gw.ingestMetrics('# TYPE t1 my-type', function(err) {
                t.ifError(err);
                gw.ingestMetrics('\n\nt2 23\n\nt1{x="1"} 12\n', function(err) {
                    t.ifError(err);
                    t.contains(gw.reportMetrics().join('\n'), '# TYPE t1 my-type\nt1{x="1"} 12');
                    t.done();
                })
            })
        },

        'should retain last metric value until cleared': function(t) {
            const gw = this.gw;
            const metrics =
                't1 1 1500000001000\n' +
                't2 2 1500000002000\n' +
                '';
            gw.ingestMetrics(metrics, function(err) {
                t.ifError(err);
                const report = gw.reportMetrics().join('\n');
                t.contains(report, 't1 1 1500000001000');
                t.contains(report, 't2 2 1500000002000');

                const report2 = gw.reportMetrics().join('\n');
                t.contains(report2, 't1 1 1500000001000');
                t.contains(report2, 't2 2 1500000002000');

                gw.clear();
                const report3 = gw.reportMetrics().join('\n');
                t.equal(report3, '');

                gw.ingestMetrics('t3 3', function(err) {
                    t.ifError(err);
                    const report4 = gw.reportMetrics().join('\n');
                    t.contains(report4, 't3 3');

                    t.done();
                })
            })
        },

        'should discard samples if cleared': function(t) {
            const gw = this.gw;
            gw.ingestMetrics('t1 1', function(err) {
                gw.clear();
                t.equal(gw.reportMetrics().join('\n'), '');
                t.done();
            })
        },
    },

    'ingestMetricsStackdriver': {
        'should throw on wrong protocol': function(t) {
            const gw = this.gw;
            const metrics = {
                timestamp: 2000000001,
                proto_version: 2,
                data: [
                    { name: 'metric1', value: 1, collected_at: 1234 },
                ]
            };
            t.throws(function(){ gw.ingestMetricsStackdriver(JSON.stringify(metrics), function(){}) }, /unsupported.* proto_version/);
            t.done();
        },

        'should convert and ingest metrics, retaining instance name': function(t) {
            const gw = this.gw;
            const metrics = {
                timestamp: 2111111111,
                proto_version: 1,
                data: [
                    { name: 'metric1', value: 1.5, collected_at: 1234, instance: 'i-000123' },
                    { name: 'metric2', value: 2.5, collected_at: 1235 },
                    { name: 'metric3', value: NaN },
                ]
            };
            gw.ingestMetricsStackdriver(JSON.stringify(metrics), function(err) {
                t.equal(gw.samples.length, 3);
                t.deepEqual(gw.samples[0], { id: 'metric1{instance="i-000123"}', name: 'metric1', value: '1.5', ts: '1234000', labels: 'instance="i-000123"' });
                t.deepEqual(gw.samples[1], { id: 'metric2', name: 'metric2', value: '2.5', ts: '1235000', labels: '' });
                t.deepEqual(gw.samples[2], { id: 'metric3', name: 'metric3', value: 'NaN', ts: '2111111111000', labels: '' });
                t.done();
            })
        },
    },

    'parseMetricsLines': {
        beforeEach: function(done) {
            this.lines = (
                'metric1 1 2111111111000\n' +
                '# TYPE counter\n' +
                'metric2 2 2111111112000\n' +
                '# comment\n' +
                'bad_metric\n' +
                '# TYPE gauge\n' +
                'metric3 3\n' +
                '').split('\n');
            this.badLines = [];
            this.goodLines = [];
            this.samples = [];
            done();
        },

        'should retain existing timestamp': function(t) {
            this.gw.parseMetricsLines(this.lines, this.badLines, this.goodLines, this.samples);
            t.contains(this.samples, { name: 'metric1', value: '1', ts: '2111111111000' });
            t.contains(this.samples, { name: 'metric2', value: '2', ts: '2111111112000' });
            t.done();
        },

        'should parse lines into samples': function(t) {
            const lines = ['metric1_name 1.25 2000000001000', 'metric2_name{a="one",b="two",} 2.5'];
            const now = Date.now();
            this.gw.parseMetricsLines(lines, this.badLines, this.goodLines, this.samples);
            t.equal(this.samples.length, 2);
            t.contains(this.samples[0], { name: 'metric1_name', value: '1.25', ts: '2000000001000', id: 'metric1_name' });
            t.contains(this.samples[1], { name: 'metric2_name', value: '2.5', id: 'metric2_name{a="one",b="two",}', labels: 'a="one",b="two",' });
            t.ok(this.samples[1].ts >= now);
            t.done();
        },

        'should assign timestamp if not present': function(t) {
            const lines = [ 'metric1 1', 'metric2 2' ];
            const now = Date.now();
            this.gw.parseMetricsLines(lines, this.badLines, this.goodLines, this.samples);
            t.equal(this.samples.length, 2);
            t.ok(this.samples[0].ts >= now);
            t.ok(this.samples[1].ts >= now);
            t.done();
        },

        'should separate bad lines': function(t) {
            this.gw.parseMetricsLines(this.lines, this.badLines, this.goodLines, this.samples);
            t.contains(this.badLines, 'bad_metric');
            t.done();
        },

        'should separate and timestamp good metrics lines': function(t) {
            this.gw.parseMetricsLines(this.lines, this.badLines, this.goodLines, this.samples);
            t.equal(this.goodLines.length, 3);
            t.equal(this.goodLines[0], 'metric1 1 2111111111000');
            t.equal(this.goodLines[1], 'metric2 2 2111111112000');
            t.ok(/^metric3 3 \d+$/.test(this.goodLines[2]));
            t.done();
        },
    },

    'reportMetrics': {
        beforeEach: function(done) {
            this.metrics =
                '# comment\n' +
                'metric1 1   1500000002000\n' +
                'metric2 2   1500000002000\n' +
                'metric1 1.2 1500000001000\n' +
                'metric2 3   1500000003000\n' +
                'metric3{name="value"} 3' +
                '';
            done();
        },

        'should sort samples into by time asc': function(t) {
            const gw = this.gw;
            const metrics =
                'm1 1 2\n' +
                'm2 2 1\n' +
                'm3 3 4\n' +
                'm4 4 3\n' +
                '';
            gw.ingestMetrics(metrics, function(err) {
                t.ifError(err);
                const report = gw.reportMetrics();
                t.contains(report, ['m2 2 1', 'm1 1 2', 'm4 4 3',  'm3 3 4']);
                t.done();
            })
        },

        'should consume samples from samples array': function(t) {
            const gw = this.gw;
            gw.ingestMetrics(this.metrics, function(err) {
                t.ifError(err);
                const lenPre = gw.samples.length;
                const report = gw.reportMetrics();
                const lenPost = gw.samples.length;
                t.equal(lenPre, 5);
                t.ok(lenPre > lenPost, "should have fewer samples");
                t.done();
            })
        },

        'should average samples with the same id': function(t) {
            const gw = this.gw;
            gw.ingestMetrics(this.metrics, function(err) {
                t.ifError(err);
                const report = gw.reportMetrics();
                t.contains(report, 'metric1 1.1 1500000002000');
                t.contains(report, 'metric2 2.5 1500000003000');
                t.done();
            })
        },

        'should honor omitTimestamps': function(t) {
            const gw = new Gateway({ omitTimestamps: true, maxMetricAgeMs: Infinity });
            gw.ingestMetrics(this.metrics, function(err) {
                t.ifError(err);
                const report = gw.reportMetrics();
                t.contains(report, 'metric1 1.1');
                t.contains(report, 'metric2 2.5');
                t.done();
            })
        },

        'should discard old samples': function(t) {
            const gw = new Gateway({ omitTimestamps: true, maxMetricAgeMs: 1000 });
            t.stub(gw, 'getTimestamp', () => 1500000003000);
            gw.ingestMetrics(this.metrics, function(err) {
                t.ifError(err);
                const report = gw.reportMetrics();
                t.contains(report, 'metric1 1');
                t.contains(report, 'metric2 2.5');
                t.contains(report, 'metric3{name="value"} 3');
                t.done();
            })
        },

        'should report metrics with most recent timestamp': function(t) {
            const start = Date.now();
            const gw = this.gw;
            gw.ingestMetrics(this.metrics, function(err) {
                t.ifError(err);
                const report = gw.reportMetrics();
                t.contains(report, 'metric1 1.1 1500000002000');
                t.contains(report, 'metric2 2.5 1500000003000');
                t.ok('metric3{name="value"} 3 ' + start <= report[10] && report[10] <= 'metric3{name="value"} 3 ' + Date.now());
                t.done();
            })
        },

        'should group same-named metrics': function(t) {
            const gw = this.gw;
            const metrics =
                'metric1{host="host-01"} 1 1500000001000\n' +
                'metric2{host="host-02"} 2 1500000002000\n' +
                'metric1{host="host-03"} 3 1500000003000\n' +
                '';
            gw.ingestMetrics(metrics, function(err) {
                t.ifError(err);
                const report = gw.reportMetrics().join('\n') + '\n';
                t.contains(report, '# HELP metric1 custom metric\n# TYPE metric1 gauge\nmetric1{host="host-01"} 1 1500000001000\nmetric1{host="host-03"} 3 1500000003000\n\n');
                t.contains(report, '# HELP metric2 custom metric\n# TYPE metric2 gauge\n');
                t.contains(report, 'metric2{host="host-02"} 2 1500000002000\n');
                t.done();
            })
        },

        'should preserve prom HELP and TYPE': function(t) {
            const gw = this.gw;
            const metrics =
                'metric1 1 1500000001000\n' +
                '\n' +
                '# HELP metric2 my metric\n' +
                '# TYPE metric2 my-type\n' +
                'metric2{a="1"} 1\n' +
                'metric2{a="2"} 2\n' +
                '\n' +
                '# HELP metric3 my other metric\n' +
                '# TYPE metric3 my-other-type\n' +
                'metric3{b="1"} 3 1500000003000\n' +
                '\n' +
                'metric4 4 1500000004000\n' +
                '';
            gw.ingestMetrics(metrics, function(err) {
                t.ifError(err);
                const report = gw.reportMetrics().join('\n') + '\n';
                t.contains(report, '# HELP metric1 custom metric\n# TYPE metric1 gauge\nmetric1 1 1500000001000\n');
                t.contains(report, '# HELP metric2 my metric\n# TYPE metric2 my-type\nmetric2{a="1"} 1');
                t.contains(report, '# HELP metric3 my other metric\n# TYPE metric3 my-other-type\nmetric3{b="1"} 3 1500000003000');
                t.contains(report, '# HELP metric4 custom metric\n# TYPE metric4 gauge\nmetric4 4 1500000004000\n');
                t.done();
            })
        },

        'should include readPromMetrics() values': function(t) {
            var called;
            var promMetrics = "other metrics";
            const gw = new Gateway({ readPromMetrics: function() { called = true; return promMetrics } });
            const spyIngest = t.spyOnce(gw, 'ingestMetrics');
            gw.reportMetrics();
            t.ok(called);
            t.ok(spyIngest.called);
            t.equal(spyIngest.args[0][0], promMetrics);
            t.done();
        },

        'should tolerate readPromMetrics errors': function(t) {
            var promMetrics = "other metrics";
            const readPromMetrics = function() { throw new Error('readPromMetrics error') };
            const spy = t.spyOnce(readPromMetrics);
            const gw = new Gateway({ readPromMetrics: spy, omitTimestamps: true });
            gw.ingestMetrics('my_metric 123', function(err) {
                t.ifError(err);
                const report = gw.reportMetrics();
                t.ok(spy.called);
                t.equal(report.length, 3);
                t.equal(report[2], 'my_metric 123');
                t.done();
            })
        },

        'should report previous values': function(t) {
            const gw = this.gw;
            gw.ingestMetrics('metric1 1 1500000001000\n', function(err) {
                t.ifError(err);
                const report1 = gw.reportMetrics();
                gw.ingestMetrics('metric2 2 1500000002000\n', function(err) {
                    t.ifError(err);
                    const report2 = gw.reportMetrics();
                    t.equal(report1.length, 3);
                    t.contains(report1[0], 'HELP');
                    t.contains(report1[1], 'TYPE');
                    t.contains(report1[2], 'metric1 1');
                    t.equal(report2.length, 7);
                    t.contains(report2[2], 'metric1 1');
                    t.contains(report2[6], 'metric2 2');
                    const report3 = gw.reportMetrics();
                    t.deepEqual(report3, report2);
                    t.done();
                })
            })
        },

        'should merge configured labels with metrics labels': function(t) {
            const metrics = 'metric1{host="host-name-01"} 11.5 1500000001000\n' + 'metric1{host="host-name-01"} 13.5 1500000021000\n';
            var gw, report;

            gw = new Gateway({ labels: { host: 'host-02' } });
            gw.ingestMetrics('metric1 11.5 1600000001000\n', function(err) {
                t.ifError(err);
                report = gw.reportMetrics();
                t.contains(report[2], 'metric1{host="host-02",} 11.5 1600000001000');

            gw = new Gateway({ labels: { } });
            gw.ingestMetrics(metrics, function(err) {
                t.ifError(err);
                report = gw.reportMetrics();
                t.equal(report.length, 3);
                t.contains(report[2], 'metric1{host="host-name-01"} 12.5 1500000021000');

            gw = new Gateway({ labels: { one: 1, } });
            gw.ingestMetrics(metrics, function(err) {
                t.ifError(err);
                report = gw.reportMetrics();
                t.equal(report.length, 3);
                t.contains(report[2], 'metric1{one="1",host="host-name-01"} 12.5 1500000021000');

            gw = new Gateway({ labels: { a: 'one', b: 'two' } });
            gw.ingestMetrics(metrics, function(err) {
                t.ifError(err);
                report = gw.reportMetrics();
                t.equal(report.length, 3);
                t.contains(report[2], 'metric1{a="one",b="two",host="host-name-01"} 12.5 1500000021000');

                t.done();

            }) }) }) })
        },
    },
}
