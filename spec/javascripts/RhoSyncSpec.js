describe("RhoSync", function() {
//    var syncUrl = "http://rhodes-store-server.heroku.com/application";
    var syncUrl = "http://localhost:9292/application";

    function waitsForSpies(spy, msg, timeout) {
        timeout = timeout || 1000;
        var spies = $.isArray(spy) ? spy : [spy];
        for(var i in spies) {
            spies[i].refCallCount = spies[i].refCallCount || 0;
            //jasmine.log(spies[i].identity +': ' +spies[i].refCallCount.toString() +' = ' +spies[i].callCount.toString());
        }
        waitsFor(function(){
            for (var i in spies) {
                //jasmine.log(spies[i].identity +': ' +spies[i].refCallCount.toString() +' <? ' +spies[i].callCount.toString());
                if (spies[i].refCallCount < spies[i].callCount) {
                    spies[i].refCallCount = spies[i].callCount;
                    return true;
                }
            }
            return false;
        }, msg, timeout);
    }

	beforeEach(function() {
		rhosync = RhoSync({syncserver:syncUrl});
        notified = false;
        notify = function(evt, obj){
            jasmine.log(evt.type + ': ' + $.toJSON(obj));
            notified = true;
        };
	});
  
    it("able to be configured", function() {
        expect(rhosync.config.syncserver).toEqual(syncUrl);
    });

    it("is able to be initialized with models", function() {

        var okHdlr = jasmine.createSpy('for ok');
        var errHdlr = jasmine.createSpy('for errors');

        expect(rhosync.init).toBeDefined();

        var models = [
            {name: 'Product', fields: [
                {name: 'name',      type: 'string'},
                {name: 'price',     type: 'int'},
                {name: 'available', type: 'boolean', defaultValue: true}
                ]},
            {name: 'Order', fields: [
                {name: 'unmber',       type: 'int'},
                {name: 'productName',  type: 'string'},
                {name: 'customerName', type: 'string'},
                {name: 'address',      type: 'string'},
                {name: 'phone',        type: 'string'}
                ]}
        ];

        rhosync.init("lars", "larspass", 'native', models).done(okHdlr).fail(errHdlr);

        waitsForSpies([okHdlr, errHdlr], 'RhoSync init timeout', 3000);
        runs(function(){
            expect(errHdlr).not.toHaveBeenCalled();
            if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);

            expect(rhosync.models).toBeDefined('models map');
            expect(rhosync.api.engine.sources).toBeDefined('sources map');

            expect(rhosync.models.Product).toBeSet('Product model');
            expect(rhosync.models.Product.name).toBeSet('Product model');
            expect(rhosync.api.engine.sources.Product).toBeSet('Product model');
            expect(rhosync.api.engine.sources.Product.name).toBeSet('Product model');
            expect(rhosync.api.engine.sources.Product.id).toBeGreaterThan(0);
            expect(rhosync.models.Product.name).toEqual(rhosync.api.engine.sources.Product.name);
            jasmine.log(rhosync.models.Product.name +' source id = ' +rhosync.api.engine.sources.Product.id);

            expect(rhosync.models.Order).toBeSet('Order model');
            expect(rhosync.models.Order.name).toBeSet('Order model');
            expect(rhosync.api.engine.sources.Order).toBeSet('Order model');
            expect(rhosync.api.engine.sources.Order.name).toBeSet('Order model');
            expect(rhosync.api.engine.sources.Order.id).toBeGreaterThan(0);
            expect(rhosync.models.Order.name).toEqual(rhosync.api.engine.sources.Order.name);
            jasmine.log(rhosync.models.Order.name +' source id = ' +rhosync.api.engine.sources.Order.id);

            expect(rhosync.api.engine.sources.Product.name).not.toEqual(rhosync.api.engine.sources.Order.name);
            expect(rhosync.api.engine.sources.Product.id).not.toEqual(rhosync.api.engine.sources.Order.id);
        });
    });

    it("should login ok with proper credentials", function() {
        //fakeAjax({urls: {'/login': {successData: 'login'}}});

        var okHdlr = jasmine.createSpy('ajax handler spy');

        $(window).bind(rhosync.api.events.GENERIC_NOTIFICATION, null, notify);

        rhosync.api.protocol.login("lars", "larspass").done(function(data, response){
            okHdlr("success", response);
        }).fail(function(data, response){
            okHdlr("error", response);
        });

        waitsForSpies(okHdlr, 'login timeout');
        runs(function(){
            expect(okHdlr).toHaveBeenCalledWith("success", null);
            expect(notified).toBeTruthy();
            $(window).unbind(rhosync.api.events.GENERIC_NOTIFICATION, notify);
        });
    });

    it("should fail to login with wrong credentials", function() {
        //fakeAjax({urls: {'/login': {successData: 'error'}}});

        var okHdlr = jasmine.createSpy('ajax handler spy');

        $(window).bind(rhosync.api.events.GENERIC_NOTIFICATION, null, notify);

        rhosync.api.protocol.login("not_lars", "not_larspass").done(function(data, response){
            okHdlr("success", response);
        }).fail(function(data, response){
            okHdlr("error", response);
        });

        waitsForSpies(okHdlr, 'login timeout');
        runs(function(){
            expect(okHdlr).toHaveBeenCalledWith("error", "Unauthorized");
            expect(notified).toBeTruthy();
            $(window).unbind(rhosync.api.events.GENERIC_NOTIFICATION, notify);
        });
    });
/*
    it("should be able to start sync engine", function() {
        $(window).bind(rhosync.api.events.NOTIFY_CLIENT_CREATED, null, notify);

        rhosync.api.protocol.login("lars", "larspass").done(function(){
            rhosync.api.engine.clientCreate();
        });

        waitsFor(function(){ return notified;}, 'createClient timeout', 3000);
        runs(function(){
            expect(notified).toBeTruthy();
            $(window).unbind(rhosync.api.events.NOTIFY_CLIENT_CREATED, notify);
        });
    });
*/

    describe("Rhomobile.db.DbStorage", function() {

        beforeEach(function() {
            rhosync = RhoSync({syncserver:syncUrl});
        });

        it("is able to open database and transaction", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            runs(function(){
                expect(rhosync.api.storage.open).toBeDefined();
                rhosync.api.storage.open().done(okHdlr).fail(errHdlr);
            });
            waitsForSpies([okHdlr, errHdlr], 'open database timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);
            });
            runs(function(){
                try {
                    expect(rhosync.api.storage.tx).toBeDefined();
                    rhosync.api.storage.tx().ready(okHdlr).fail(errHdlr);
                } catch (ex) {
                    jasmine.log(ex);
                }
            });
            waitsForSpies([okHdlr, errHdlr], 'open database timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);
            });
        });

        it("is able to perform a query", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            expect(rhosync.api.storage.executeSQL).toBeDefined();
            rhosync.api.storage.executeSQL("SELECT name FROM sqlite_master WHERE type='table'", null).done(function(){
                okHdlr(arguments);
            }).fail(function(){
                errHdlr(arguments);
            });

            waitsForSpies([okHdlr, errHdlr], 'db query timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);
            });
        });

        it("is able to be initialized", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            expect(rhosync.api.storage.initSchema).toBeDefined();
            rhosync.api.storage.initSchema().done(okHdlr).fail(errHdlr);

            waitsForSpies([okHdlr, errHdlr], 'db initialization timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);
            });

            runs(function(){
                expect(rhosync.api.storage.getAllTableNames).toBeDefined();
                rhosync.api.storage.getAllTableNames().done($.proxy(function(tx, tbNames){
                    okHdlr(arguments);
                    this.names = tbNames;
                }, this)).done(okHdlr).fail(errHdlr);
            });

            waitsForSpies([okHdlr, errHdlr], 'table names read timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);
                expect(this.names).toBeDefined();
                jasmine.log('Table names are: "' +this.names.toString().replace(/,/g, '", "') +'"');
                expect(this.names.length).toEqual(4+1);
                expect(this.names).toContain('sources');
            });
        });

        it("is able to store clients", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            expect(rhosync.api.engine.Client).toBeDefined();
            expect(rhosync.api.storage.listClientsId).toBeDefined();
            expect(rhosync.api.storage.insertClient).toBeDefined();
            expect(rhosync.api.storage.storeClient).toBeDefined();
            expect(rhosync.api.storage.loadClient).toBeDefined();
            expect(rhosync.api.storage.deleteClient).toBeDefined();

            var id1 = 'testId1_#' +Date.now().toString();
            var id2 = 'testId2_#' +Date.now().toString();

            // create clients
            var client1 = new rhosync.api.engine.Client(id1);
            client1.session = "session1";
            var client2 = new rhosync.api.engine.Client(id2);
            client2.session = "session2";

            // store them
            runs(function(){
                jasmine.log('insertClient()');
                rhosync.api.storage.insertClient(client1).done(function(){
                        rhosync.api.storage.insertClient(client2).done(okHdlr).fail(errHdlr);
                }).fail(errHdlr);
            });
            waitsForSpies([okHdlr, errHdlr], 'clients insert query timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);
            });

            // check there are two clients at least
            runs(function(){
                jasmine.log('listClientsId()');
                rhosync.api.storage.listClientsId().done($.proxy(function(tx, ids){
                    this.ids = ids;
                    this.idsLengthWithTestClients = ids.length;
                }, this)).done(okHdlr).fail(errHdlr);
            });
            waitsForSpies([okHdlr, errHdlr], 'clients list select query timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);
                expect(this.ids).toBeDefined();
                expect(this.ids.length).toBeDefined();
                expect(this.ids.length).toBeGreaterThan(1);
            });

            // read and verify clients
            runs(function(){
                jasmine.log('loadClient()');
                rhosync.api.storage.tx().ready($.proxy(function(db, tx){
                    $.when(
                            rhosync.api.storage.loadClient(id1, tx).done($.proxy(function(tx, client){
                                this.client1 = client;
                            }, this)),
                            rhosync.api.storage.loadClient(id2, tx).done($.proxy(function(tx, client){
                                this.client2 = client;
                            }, this))
                    ).done(okHdlr).fail(errHdlr);
                }, this)).fail(errHdlr);
            });
            waitsForSpies([okHdlr, errHdlr], 'clients select query timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);

                expect(this.client1).toBeDefined();
                expect(this.client1.id).toEqual(id1);
                expect(this.client1.session).toBeDefined();
                expect(this.client1.session).toEqual("session1");

                expect(this.client2).toBeDefined();
                expect(this.client2.id).toEqual(id2);
                expect(this.client2.session).toBeDefined();
                expect(this.client2.session).toEqual("session2");
            });

            // update them
            runs(function(){
                client1.session = "updatedSession1";
                client2.session = "updatedSession2";
                jasmine.log('storeClient()');
//                rhosync.api.storage.storeClient(client1).done(function(){
//                        rhosync.api.storage.storeClient(client2).done(okHdlr).fail(errHdlr);
//                }).fail(errHdlr);
                rhosync.api.storage.tx("read-write").ready(function(db, tx){
                    $.when(
                            rhosync.api.storage.storeClient(client1, tx).done(function(tx, client){
                            }),
                            rhosync.api.storage.storeClient(client2, tx).done(function(tx, client){
                            })
                    ).done(function(obj, status){
                        okHdlr(obj, status);
                    }).fail(function(obj, error){
                        errHdlr(obj, error);
                    });
                }).done(function(obj, status){
                    okHdlr(obj, status);
                }).fail(function(obj, error){
                    errHdlr(obj, error);
                });
            });
            waitsForSpies([okHdlr, errHdlr], 'clients update query timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);
            });

            // read and verify updates
            runs(function(){
                jasmine.log('loadClient()');
                rhosync.api.storage.tx().ready($.proxy(function(db, tx){
                    $.when(
                            rhosync.api.storage.loadClient(id1, tx).done($.proxy(function(tx, client){
                                this.client1 = client;
                            }, this)),
                            rhosync.api.storage.loadClient(id2, tx).done($.proxy(function(tx, client){
                                this.client2 = client;
                            }, this))
                    ).done(okHdlr).fail(errHdlr);
                }, this)).fail(errHdlr);
            });
            waitsForSpies([okHdlr, errHdlr], 'clients select query timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);

                expect(this.client1).toBeDefined();
                expect(this.client1.id).toEqual(id1);
                expect(this.client1.session).toBeDefined();
                expect(this.client1.session).toEqual("updatedSession1");

                expect(this.client2).toBeDefined();
                expect(this.client2.id).toEqual(id2);
                expect(this.client2.session).toBeDefined();
                expect(this.client2.session).toEqual("updatedSession2");
            });

            // delete them
            runs(function(){
                jasmine.log('deleteClient()');
                rhosync.api.storage.deleteClient(this.client1).done($.proxy(function(tx, client){
                    this.client1 = client;
                    rhosync.api.storage.deleteClient(this.client2).done($.proxy(function(tx, client){
                        this.client2 = client;
                    }, this)).done(okHdlr).fail(errHdlr);
                }, this)).fail(errHdlr);
            });
            waitsForSpies([okHdlr, errHdlr], 'clients delete query timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);
            });

            // check there are two clients has been deleted
            runs(function(){
                jasmine.log('listClientsId()');
                rhosync.api.storage.listClientsId().done($.proxy(function(tx, ids){
                    this.ids = ids;
                }, this)).done(okHdlr).fail(errHdlr);
            });
            waitsForSpies([okHdlr, errHdlr], 'clients list select query timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);

                expect(this.ids).toBeDefined();
                expect(this.ids.length).toBeDefined();
                expect(this.ids.length).toEqual(this.idsLengthWithTestClients - 2);
            });

            // check load failure for absent clients
            runs(function(){
                jasmine.log('loadClient()');
                rhosync.api.storage.tx().ready($.proxy(function(db, tx){
                    $.when(
                            rhosync.api.storage.loadClient(id1, tx).done($.proxy(function(tx, client){
                                this.client1 = client;
                            }, this)),
                            rhosync.api.storage.loadClient(id2, tx).done($.proxy(function(tx, client){
                                this.client2 = client;
                            }, this))
                    ).done(okHdlr).fail(errHdlr);
                }, this)).fail(errHdlr);
            });
            waitsForSpies([okHdlr, errHdlr], 'clients select query timeout');
            runs(function(){
                expect(errHdlr).toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);
                expect(this.client1).toBeNull();
                expect(this.client2).toBeNull();
            });
        });

        it("is able to store sources", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            expect(rhosync.api.engine.Source).toBeDefined();
            expect(rhosync.api.storage.listSourcesId).toBeDefined();
            expect(rhosync.api.storage.insertSource).toBeDefined();
            expect(rhosync.api.storage.storeSource).toBeDefined();
            expect(rhosync.api.storage.loadSource).toBeDefined();
            expect(rhosync.api.storage.deleteSource).toBeDefined();

            var id1 = 'testId1_#' +Date.now().toString();  // It shouldn't work at all!!! client_id is BIGINT !
            var id2 = 'testId2_#' +Date.now().toString();

            // create sources
            var source1 = new rhosync.api.engine.Source(id1);
            source1.name = "name1";
            var source2 = new rhosync.api.engine.Source(id2);
            source2.name = "name2";

            // store them
            runs(function(){
                jasmine.log('insertSource()');
                rhosync.api.storage.insertSource(source1).done(function(){
                        rhosync.api.storage.insertSource(source2).done(okHdlr).fail(errHdlr);
                }).fail(errHdlr);
            });
            waitsForSpies([okHdlr, errHdlr], 'sources insert query timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);
            });

            // check there are two sources at least
            runs(function(){
                jasmine.log('listSourcesId()');
                rhosync.api.storage.listSourcesId().done($.proxy(function(tx, ids){
                    this.ids = ids;
                    this.idsLengthWithTestSources = ids.length;
                }, this)).done(okHdlr).fail(errHdlr);
            });
            waitsForSpies([okHdlr, errHdlr], 'sources list select query timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);
                expect(this.ids).toBeDefined();
                expect(this.ids.length).toBeDefined();
                expect(this.ids.length).toBeGreaterThan(1);
            });

            // read and verify sources
            runs(function(){
                jasmine.log('loadSource()');
                rhosync.api.storage.tx().ready($.proxy(function(db, tx){
                    $.when(
                            rhosync.api.storage.loadSource(id1, tx).done($.proxy(function(tx, source){
                                this.source1 = source;
                            }, this)),
                            rhosync.api.storage.loadSource(id2, tx).done($.proxy(function(tx, source){
                                this.source2 = source;
                            }, this))
                    ).done(okHdlr).fail(errHdlr);
                }, this)).fail(errHdlr);
            });
            waitsForSpies([okHdlr, errHdlr], 'sources select query timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);

                expect(this.source1).toBeDefined();
                expect(this.source1.id).toEqual(id1);
                expect(this.source1.name).toBeDefined();
                expect(this.source1.name).toEqual("name1");

                expect(this.source2).toBeDefined();
                expect(this.source2.id).toEqual(id2);
                expect(this.source2.name).toBeDefined();
                expect(this.source2.name).toEqual("name2");
            });

            // update them
            runs(function(){
                source1.name = "updatedName1";
                source2.name = "updatedName2";
                jasmine.log('storeSource()');
//                rhosync.api.storage.storeSource(source1).done(function(){
//                        rhosync.api.storage.storeSource(source2).done(okHdlr).fail(errHdlr);
//                }).fail(errHdlr);
                rhosync.api.storage.tx("read-write").ready(function(db, tx){
                    $.when(
                            rhosync.api.storage.storeSource(source1, tx).done(function(tx, source){
                            }),
                            rhosync.api.storage.storeSource(source2, tx).done(function(tx, source){
                            })
                    ).done(function(obj, status){
                        okHdlr(obj, status);
                    }).fail(function(obj, error){
                        errHdlr(obj, error);
                    });
                }).done(function(obj, status){
                    okHdlr(obj, status);
                }).fail(function(obj, error){
                    errHdlr(obj, error);
                });
            });
            waitsForSpies([okHdlr, errHdlr], 'sources update query timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);
            });

            // read and verify updates
            runs(function(){
                jasmine.log('loadSource()');
                rhosync.api.storage.tx().ready($.proxy(function(db, tx){
                    $.when(
                            rhosync.api.storage.loadSource(id1, tx).done($.proxy(function(tx, source){
                                this.source1 = source;
                            }, this)),
                            rhosync.api.storage.loadSource(id2, tx).done($.proxy(function(tx, source){
                                this.source2 = source;
                            }, this))
                    ).done(okHdlr).fail(errHdlr);
                }, this)).fail(errHdlr);
            });
            waitsForSpies([okHdlr, errHdlr], 'sources select query timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);

                expect(this.source1).toBeDefined();
                expect(this.source1.id).toEqual(id1);
                expect(this.source1.name).toBeDefined();
                expect(this.source1.name).toEqual("updatedName1");

                expect(this.source2).toBeDefined();
                expect(this.source2.id).toEqual(id2);
                expect(this.source2.name).toBeDefined();
                expect(this.source2.name).toEqual("updatedName2");
            });

            // delete them
            runs(function(){
                jasmine.log('deleteSource()');
                rhosync.api.storage.deleteSource(this.source1).done($.proxy(function(tx, source){
                    this.source1 = source;
                    rhosync.api.storage.deleteSource(this.source2).done($.proxy(function(tx, source){
                        this.source2 = source;
                    }, this)).done(okHdlr).fail(errHdlr);
                }, this)).fail(errHdlr);
            });
            waitsForSpies([okHdlr, errHdlr], 'sources delete query timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);
            });

            // check there are two sources has been deleted
            runs(function(){
                jasmine.log('listSourcesId()');
                rhosync.api.storage.listSourcesId().done($.proxy(function(tx, ids){
                    this.ids = ids;
                }, this)).done(okHdlr).fail(errHdlr);
            });
            waitsForSpies([okHdlr, errHdlr], 'sources list select query timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);
                expect(this.ids).toBeDefined();
                expect(this.ids.length).toBeDefined();
                expect(this.ids.length).toEqual(this.idsLengthWithTestSources - 2);
            });

            // check load failure for absent sources
            runs(function(){
                jasmine.log('loadSource()');
                rhosync.api.storage.tx().ready($.proxy(function(db, tx){
                    $.when(
                            rhosync.api.storage.loadSource(id1, tx).done($.proxy(function(tx, source){
                                this.source1 = source;
                            }, this)),
                            rhosync.api.storage.loadSource(id2, tx).done($.proxy(function(tx, source){
                                this.source2 = source;
                            }, this))
                    ).done(okHdlr).fail(errHdlr);
                }, this)).fail(errHdlr);
            });
            waitsForSpies([okHdlr, errHdlr], 'sources select query timeout');
            runs(function(){
                expect(errHdlr).toHaveBeenCalled();
                if(0 < errHdlr.callCount) jasmine.log(errHdlr.mostRecentCall.args);
                expect(this.source1).toBeNull();
                expect(this.source2).toBeNull();
            });
        });
    });
});