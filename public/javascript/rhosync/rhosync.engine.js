(function($) {

    function publicInterface() {
        return {
            // classes
            Client: Client,
            Source: Source,
            // fields
            states: states,
            session: null,
            sources: sources,
            maxConfigSrcId: 1,
            // methods
            login: login,
            getState: getState,
            isSearch: isInSearch,
            doSyncAllSources: doSyncAllSources,
            stopSync: stopSync,
            getStartSourceId: getStartSourceId,
            isNoThreadedMode: isNoThreadedMode,
            isSessionExist: isSessionExist,
            isStopedByUser: function() {return isStopedByUser}
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
    var isSearch = false;

    function getState() {
        return syncState;
    }

    function isInSearch() {
        return isSearch;
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
                        }).fail(function(tx, error){
                            dfr.reject(rho.errors.ERR_RUNTIME, "db access error" +error);
                        });
                    } else {
                        // None of them, going to obtain from the server
                        _createClient().done(function(client){
                            dfr.resolve(client);
                        }).fail(function(errCode, errMsg){
                            dfr.reject(errCode, errMsg);
                        });
                    }
                }).fail(function(tx, error){
                    dfr.reject(rho.errors.ERR_RUNTIME, "db access error" +error);
                });
            }).fail(function(status, error){
                var errCode = _isTimeout(error) ? rho.errors.ERR_NOSERVERRESPONSE : rho.errors.ERR_NETWORK;
                dfr.reject(errCode, error);
            });
        }).promise();
    }

    function _createClient() {
        return $.Deferred(function(dfr){
            // obtain client id from the server
            rho.protocol.clientCreate().done(function(status, data){
                if (data && data.client && data.client.client_id){
                    // persist new client
                    var client = new Client(data.client.client_id);
                    rho.storage.insertClient(client).done(function(tx, client){
                        dfr.resolve(client);
                    }).fail(function(tx, error){
                        dfr.reject(rho.errors.ERR_RUNTIME, "db access error" +error);
                    });
                } else {
                    dfr.reject(rho.errors.ERR_UNEXPECTEDSERVERRESPONSE, data);
                }
            }).fail(function(status, error){
                var errCode = _isTimeout(error) ? rho.errors.ERR_NOSERVERRESPONSE : rho.errors.ERR_NETWORK;
                dfr.reject(errCode, error);
            });
        }).promise();
    }

    function _isTimeout(msg) {
        return (msg && msg.match(/time(d)?\s+out/i));
    }

    function doSyncAllSources() {
        function _finally(){
            if (syncState != states.exit) {
                syncState = states.none;
            }
        }
        return syncAllSources().fail(function(errCode, errMsg){
            rho.notify(rho.events.ERROR, "Sync failed", errMsg);
        }).then(_finally, _finally);
        //TODO: ? getNotify().cleanCreateObjectErrors();
    }

    function syncAllSources() {
        return $.Deferred(function(dfr){
            var dfrMap = rho.deferredMapOn($.extend({}, sources, {'rhoStartSyncSource': startSrc}));
            var syncErrors = [];

            var startSrc = _getStartSource();
            if (startSrc) {
                _syncOneSource(startSrc).done(function(){
                    dfrMap.resolve('rhoStartSyncSource', ["ok"]);
                }).fail(function(obj, error){
                    syncErrors.push({source: startSrc.name, errObject: obj, error: error});
                    dfrMap.resolve('rhoStartSyncSource', ["error", obj, error]);
                });
            } else {
                dfrMap.resolve('rhoStartSyncSource', ["ok"]);
            }

            $.each(sources, function(src) {
                _syncOneSource(src).done(function(){
                    dfrMap.resolve(src.name, ["ok"]);
                }).fail(function(obj, error){
                    syncErrors.push({source: src.name, errObject: obj, error: error});
                    dfrMap.resolve(src.name, ["error", obj, error]);
                });
            });

            //if ( !bError && !isSchemaChanged() )
            //    getNotify().fireSyncNotification(null, true, RhoAppAdapter.ERR_NONE, RhoAppAdapter.getMessageText("sync_completed"));

            dfrMap.when().done(function(){
                if (syncErrors.length == 0) {
                    dfr.resolve(rho.errors.NONE, "Sync completed");
                }
                else dfr.reject(syncErrors);
            }).fail(function(){
                dfr.reject(syncErrors);
            });
        }).promise();
    }

    function _getStartSource() {
        $.each(sources, function(src) {
            if (!src.isEmptyToken) return src;
        });
        return null;
    }

    function _syncOneSource(source) {
        return $.Deferred(function(dfr){
            if ( source.sync_type == "bulk_sync_only") {
                dfr.resolve(null); //TODO: do resolve it as a source?
            } else if (isSessionExist() && syncState != states.stop ) {
                source.sync().done(function(){
                    rho.notify(rho.events.SYNC_SOURCE_END, source);
                    dfr.resolve(source);
                }).fail(function(obj, error){
                    if (source.errCode == rho.errors.ERR_NONE) {
                        source.errCode = rho.errors.ERR_RUNTIME;
                    }
                    syncState = states.stop;
                    rho.notify(rho.events.SYNC_SOURCE_END, source);
                    dfr.reject(rho.errors.ERR_RUNTIME, "sync is stopped: " +error);
                });
            } else {
                dfr.reject(rho.errors.ERR_RUNTIME, "sync is stopped");
            }
        }).promise();
    }

    function stopSync() {
        if (_isContinueSync()) {
            syncState = states.stop;
            _cancelRequests();
        }
    }

    function _isContinueSync() { return syncState != states.exit && syncState != states.stop; }
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

    function getStartSourceId(dbSources) {
        var startId = 0;
        $.each(dbSources, function(name, dbSource){
            startId = (dbSource.id > startId) ? dbSource.id : startId;
        });
        if (startId < rho.engine.maxConfigSrcId) {
            startId =  rho.engine.maxConfigSrcId + 2;
        } else {
            startId += 1;
        }
        return startId;
    }

    function isNoThreadedMode() {
        return false;
    }

    function isSessionExist() {
        return rho.engine.session ? true : false;
    }

/*
        function run(client) {
            return $.Deferred(function(dfr){
            // TODO: to implement the body
                dfr.resolve(client);
            }).promise();
        }
*/

    var isStopedByUser = false;
    function _stopSyncByUser() { isStopedByUser = true; stopSync(); }
    function _isStoppedByUser() { return isStopedByUser; }

    function _exitSync() {
        if (_isContinueSync()) {
            syncState = states.exit;
            _cancelRequests();
        }
    }

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
        this.error = '';

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

                rho.notify(rho.events.SYNCHRONIZING, 'synchronizing' +this.name +'...', this.errCode, this.error);
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

    $.extend(rho, {engine: publicInterface()});

})(jQuery);
