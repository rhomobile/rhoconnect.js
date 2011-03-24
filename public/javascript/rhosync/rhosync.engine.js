(function($) {

    function publicInterface() {
        return {
            Client: Client,
            Source: Source,
            sources: sources,
            login: login,
            syncAllSources: syncAllSources,
            stopSync: stopSync
        };
    }

    var rho = RhoSync.rho;

    var sources = {}; // name->source map

    const states = {
        none: 0,
        syncAllSources: 1,
        syncSource: 2,
        search: 3,
        stop: 4,
        exit: 5
    };

    var syncState = states.none;

    function Source(id, name, model) {
        this.model = model;

        this.id = id;
        this.name = name;
        this.token = null;
        this.sync_priority = null /*bigint, no default*/;
        this.partition = null /*varchar, no default*/;
        this.sync_type = null /*varchar, no default*/;
        this.metadata = null;
        this.last_updated = 0;
        this.last_inserted_size = 0;
        this.last_deleted_size = 0;
        this.last_sync_duration = 0;
        this.last_sync_success = 0;
        this.backend_refresh_time = 0;
        this.source_attribs = null;
        this.schema = null;
        this.schema_version = null;
        this.associations = null;
        this.blob_attribs = null;

        this.isTokenFromDb = true;
        this.errCode = rho.errors.ERR_NONE;
        this.strError = '';

        this.__defineGetter__('isEmptyToken', function() {
            return this.token == 0;
        });

        function setToken(token) {
            this.token = token;
            this.isTokenFromDb = false;
        }

        function processToken(token) {
            return $.Deferred(function(dfr){
                if ( token > 1 && this.token == token ){
                    //Delete non-confirmed records
                    setToken(token); //For m_bTokenFromDB = false;
                    //getDB().executeSQL("DELETE FROM object_values where source_id=? and token=?", getID(), token );
                    //TODO: add special table for id,token
                    dfr.resolve();
                }else
                {
                    setToken(token);
                    rho.storage.executeSQL("UPDATE sources SET token=? where source_id=?", +this.token, this.id).done(function(){
                        dfr.resolve();
                    }).fail(rho.passRejectTo(dfr));
                }
            }).promise();
        }

        function syncServerChanges() {
            return $.Deferred(function(dfr){
                //TODO: to implement
            }).promise();
        }

        function syncClientChanges() {
            return $.Deferred(function(dfr){
                //TODO: to implement
            }).promise();
        }

        this.sync = function(){
            return $.Deferred(function(dfr){
                var startTime = Date.now();

                function _finally() {
                    var endTime = Date.now();
                    //TODO: to implement
/*
                    rho.storage.executeSQL(
                            "UPDATE sources set last_updated=?,last_inserted_size=?,last_deleted_size=?, "
                            +"last_sync_duration=?,last_sync_success=?, backend_refresh_time=? WHERE source_id=?",
                            (endTime/1000), new Integer(getInsertedCount()), new Integer(getDeletedCount()),
                      new Long((endTime.minus(startTime)).toULong()),
                      new Integer(m_bGetAtLeastOnePage?1:0), new Integer(m_nRefreshTime), getID() );
*/
                }

                function _catch(obj, err) {
                    stopSync();
                    _finally();
                    dfr.reject(obj, err);
                }

                rho.notify(rho.events.SYNCHRONIZING, 'synchronizing' +this.name +'...', this.errCode, this.strError);
                if (this.isTokenFromDb && this.token > 1) {
                    syncServerChanges();
                } else {
                    if (this.token == 0) {
                        processToken(1).done(function(){
                            syncClientChanges().done(function(serverSyncDone){
                                if (!serverSyncDone) syncServerChanges().done(function(){
                                    dfr.resolve(); //TODO: params to resolve
                                }).fail(_catch);
                            }).fail(_catch);
                        }).fail(_catch);
                    }
                }
            }).promise();
        };
    }

    function Client(id) {
        this.id = id;
        this.session = null;
        this.token = null;
        this.token_sent = 0;
        this.reset = 0;
        this.port = null;
        this.last_sync_success = null;
    }

/*
        function run(client) {
            return $.Deferred(function(dfr){
            // TODO: to implement the body
                dfr.resolve(client);
            }).promise();
        }
*/
    function _createClient() {
        return $.Deferred(function(dfr){
            // obtain client id from the server
            rho.protocol.clientCreate().done(function(status, data){
                if (data && data.client && data.client.client_id){
                    // persist new client
                    var client = new Client(data.client.client_id);
                    rho.storage.insertClient(client).done(function(tx, client){
                        dfr.resolve(client);
                        rho.notify(rho.events.CLIENT_CREATED, client);
                    }).fail(function(tx, error){
                        dfr.reject("db access error");
                        rho.notify(rho.events.ERROR, 'Db access error in clientCreate');
                    });
                } else {
                    dfr.reject("server response error");
                    rho.notify(rho.events.ERROR, 'Server response error in clientCreate');
                }
            }).fail(function(status, error){
                dfr.reject("server request error");
                rho.notify(rho.events.ERROR, 'Server request error clientCreate');
            });
        }).promise();
    }

    function login(login, password) {
        return $.Deferred(function(dfr){
            rho.protocol.login(login, password).done(function(){
                rho.storage.listClientsId().done(function(tx, ids){
                    // if any?
                    if (0 < ids.length) {
                        // ok, load first (for now)
                        // TODO: to decide which on to load if there are many stored
                        rho.storage.loadClient(ids[0]).done(function(tx, client){
                            dfr.resolve(client);
                        }).fail(function(){
                            dfr.reject("db access error");
                            rho.notify(rho.events.ERROR, 'Db access error in engine.login');
                        });
                    } else {
                        // None of them, going to obtain from the server
                        _createClient().done(function(client){
                            dfr.resolve(client);
                        }).fail(function(error){
                            dfr.reject("client creation error: " +error);
                            rho.notify(rho.events.ERROR, "Client creation error in engine.login");
                        });
                    }
                }).fail(function(){
                    dfr.reject("db access error");
                });
            }).fail(function(){
                dfr.reject("server login error");
            });
        }).promise();
    }

    function isContinueSync() { return syncState != states.exit && syncState != states.stop; }
    function isSyncing() { return syncState == states.syncAllSources || syncState == states.syncSource; }

    function _cancelRequests() {
        //TODO: to implement
        /*
        if (m_NetRequest!=null)
            m_NetRequest.cancel();

        if (m_NetRequestClientID!=null)
            m_NetRequestClientID.cancel();
        */
    }

    function stopSync() {
        if (isContinueSync()) {
            syncState = states.stop;
            _cancelRequests();
        }
    }
    var isStopedByUser = false;
    function stopSyncByUser() { isStopedByUser = true; stopSync(); }
    function isStoppedByUser() { return isStopedByUser; }

    function exitSync() {
        if (isContinueSync()) {
            syncState = states.exit;
            _cancelRequests();
        }
    }

    function getStartSource() {
        $.each(sources, function(src) {
            if (!src.isEmptyToken) return src;
        });
        return null;
    }

    function isSessionExist() {
        return true; //TODO: to obtain and check cookie from the browser
    }

    function syncOneSource(source) {
        return $.Deferred(function(dfr){
            if (isSessionExist() && syncState != states.stop )
                source.sync().done(function(){
                    rho.notify(rho.events.SYNC_SOURCE_END, source);
                    dfr.resolve(source);
                }).fail(function(obj, error){
                    if (source.errCode == rho.errors.ERR_NONE) {
                        source.errCode = rho.errors.ERR_RUNTIME;
                    }
                    syncState = states.stop;
                    rho.notify(rho.events.SYNC_SOURCE_END, source);
                    dfr.reject(obj, error);
                });
        }).promise();
    }

    function syncAllSources() {
        return $.Deferred(function(dfr){
            var dfrMap = rho.deferredMapOn($.extend({}, sources, {'rhoStartSyncSource': startSrc}));
            var syncErrors = [];

            var startSrc = getStartSource();
            if (startSrc) {
                syncOneSource(startSrc).done(function(){
                    dfrMap.resolve('rhoStartSyncSource', ["ok"]);
                }).fail(function(obj, error){
                    syncErrors.push({source: startSrc.name, errObject: obj, error: error});
                    dfrMap.resolve('rhoStartSyncSource', ["error", obj, error]);
                });
            } else {
                dfrMap.resolve('rhoStartSyncSource', ["ok"]);
            }

            $.each(sources, function(src) {
                syncOneSource(src).done(function(){
                    dfrMap.resolve(src.name, ["ok"]);
                }).fail(function(obj, error){
                    syncErrors.push({source: src.name, errObject: obj, error: error});
                    dfrMap.resolve(src.name, ["error", obj, error]);
                });
            });

            dfrMap.when().done(function(){
                if (syncErrors.length == 0) dfr.resolve("ok");
                else dfr.reject(syncErrors);
            }).fail(function(){
                dfr.reject(syncErrors);
            });
        }).promise();
    }

    $.extend(rho, {engine: publicInterface()});

})(jQuery);
