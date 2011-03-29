(function($) {

    function publicInterface() {
        return {
            // classes
            Client: Client,
            Source: Source,
            // fields
            states: states,
            getSession: function() {return session},
            sources: sources,
            maxConfigSrcId: 1,
            // methods
            login: login,
            logout: logout,
            getState: getState,
            isSearch: isInSearch,
            doSyncAllSources: doSyncAllSources,
            stopSync: stopSync,
            getStartSourceId: getStartSourceId,
            isNoThreadedMode: isNoThreadedMode,
            isSessionExist: isSessionExist,
            isStoppedByUser: function() {return isStoppedByUser}
        };
    }

    var rho = RhoSync.rho;

    var sources = {}; // name->source map
    // to be ordered by priority and associations after checkSourceAssociations() call
    var sourcesArray = [];

    const states = {
        none: 0,
        syncAllSources: 1,
        syncSource: 2,
        search: 3,
        stop: 4,
        exit: 5
    };
    
    var notify = null;
    function getNotify() {
        notify = notify || new rho.notify.SyncNotify(rho.engine);
        return notify;
    }
    
    var syncState = states.none;
    var isSearch = false;
    var errCode = rho.errors.ERR_NONE;
    var error = "";
    var serverError = "";
    var isSchemaChanged = false;
    var session = null;
    var clientId = null;

    var LOG = new rho.Logger('SyncEngine');

    function getState() {
        return syncState;
    }

    function isInSearch() {
        return isSearch;
    }

    function logout() {
        return $.Deferred(function(dfr){
            _cancelRequests();
            rho.storage.executeSql("UPDATE client_info SET session = NULL").done(function(){
                session = "";
                dfr.resolve();
            }).fail(function(obj, error){
                dfr.reject(rho.errors.ERR_RUNTIME, "db access error: " +error);
            });
            //loadAllSources();
        }).promise();
    }

    function login(login, password, oNotify) {
        return $.Deferred(function(dfr){
            isStoppedByUser = false;
            
            rho.protocol.login(login, password).done(function(){
                session = rho.protocol.getSession();

                if(!session) {
                    LOG.error("Return empty session.");
                    var errCode = rho.errors.ERR_UNEXPECTEDSERVERRESPONSE;
                    getNotify().callLoginCallback(oNotify, errCode, "" );
                    dfr.reject(errCode, "");
                    return;
                }

                if (isStoppedByUser) {
                    dfr.reject(rho.errors.ERR_CANCELBYUSER, "Stopped by user");
                    return;
                }

                _updateClientSession(rho.protocol.getSession()).done(function(client){
                    if (rho.config["rho_sync_user"]) {
                        var strOldUser = rho.config["rho_sync_user"];
                        if (name != strOldUser) {
                            //if (isNoThreadedMode()) {
                            //    // RhoAppAdapter.resetDBOnSyncUserChanged();
                            //} else {
                            //    // NetResponse resp1 = getNet().pushData( getNet().resolveUrl("/system/resetDBOnSyncUserChanged"), "", null );
                            //}
                        }
                    }
                    
                    rho.config["rho_sync_user"] = name;
                    getNotify().callLoginCallback(oNotify, rho.errors.ERR_NONE, "" );

                    dfr.resolve();
                }).fail(function(errCode, errMsg){
                    dfr.reject(errCode, errMsg);
                });
            }).fail(function(status, error, xhr){
                var errCode = rho.protocol.getErrorFromXHR(xhr);
                if (_isTimeout(error)) {
                    errCode = rho.errors.ERR_NOSERVERRESPONSE;
                }
                if (errCode != rho.errors.ERR_NONE) {
                    getNotify().callLoginCallback(oNotify, errCode, xhr.responseText);
                }
                dfr.reject(errCode, error);
            });
        }).promise();
    }

    function _updateClientSession(session) {
        return $.Deferred(function(dfr){
            // obtain client id from the server
            rho.storage.loadAllClients().done(function(clients){
                if (0 < clients.length) {
                    rho.storage.executeSql("UPDATE client_info SET session=?", [session]).done(function(tx, rs){
                        dfr.resolve(clients[0]);
                    }).fail(function(tx, error){
                        dfr.reject(rho.errors.ERR_RUNTIME, "db access error: " +error);
                    });
                } else {
                    var client = new Client(null);
                    client.session = session;
                    rho.storage.insertClient(client).done(function(tx, client){
                        dfr.resolve(client);
                    }).fail(function(tx, error){
                        dfr.reject(rho.errors.ERR_RUNTIME, "db access error: " +error);
                    });
                }
            }).fail(function(obj, error){
                dfr.reject(rho.errors.ERR_RUNTIME, "db access error: " +error);
            });
        }).promise();
    }

    function _updateClientId(id) {
        return $.Deferred(function(dfr){
            // obtain client id from the server
            rho.storage.loadAllClients().done(function(clients){
                if (0 < clients.length) {
                    rho.storage.executeSql("UPDATE client_info SET client_id=?", [id]).done(function(tx, rs){
                        dfr.resolve(clients[0]);
                    }).fail(function(tx, error){
                        dfr.reject(rho.errors.ERR_RUNTIME, "db access error: " +error);
                    });
                } else {
                    var client = new Client(null);
                    client.id = id;
                    rho.storage.insertClient(client).done(function(tx, client){
                        dfr.resolve(client);
                    }).fail(function(tx, error){
                        dfr.reject(rho.errors.ERR_RUNTIME, "db access error: " +error);
                    });
                }
            }).fail(function(obj, error){
                dfr.reject(rho.errors.ERR_RUNTIME, "db access error: " +error);
            });
        }).promise();
    }

    function _createClient() {
        return $.Deferred(function(dfr){
            // obtain client id from the server
            rho.protocol.clientCreate().done(function(status, data){
                if (data && data.client && data.client.client_id){
                    // persist new client
                    _updateClientId(data.client.client_id).done(function(client){
                        dfr.resolve(client);
                    }).fail(function(errCode, error){
                        dfr.reject(errCode, error);
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

    function _resetClient(clientId) {
        return $.Deferred(function(dfr){
            rho.protocol.clientReset(clientId).done(function(status, data){
                if (data && data.sources){
                    dfr.resolve();
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

        prepareSync(states.syncAllSources, null);
        
        if (isContinueSync()) {
            syncAllSources().fail(function(errCode, errMsg){
                rho.notify.byEvent(rho.events.ERROR, "Sync failed", errMsg);
            }).then(_finally, _finally);
        }

        getNotify().cleanCreateObjectErrors();
    }

    function prepareSync(eState, oSrcID) {
        return $.Deferred(function(dfr){
            syncState = eState;
            isSearch =  (eState == states.search);
            isStoppedByUser = false;
            errCode = rho.errors.ERR_NONE;
            error = "";
            serverError = "";
            isSchemaChanged = false;

            loadAllSources().done(function(){
                loadSession().done(function(s){
                    session = s;
                    if (isSessionExist()) {
                        loadClientID().done(function(clnId){
                            clientId = clnId;
                            if (errCode == rho.errors.ERR_NONE) {
                                getNotify().cleanLastSyncObjectCount();
                                //doBulkSync();
                                dfr.resolve();
                            }
                            _localFireErrorNotification();
                            stopSync();
                            dfr.reject(errCode, error);
                        }).fail(function(errCode, error){
                            dfr.reject(errCode, error);
                        });
                    }else {
                        errCode = rho.errors.ERR_CLIENTISNOTLOGGEDIN;
                        _localFireErrorNotification();
                        stopSync();
                        dfr.reject(errCode, error);
                    }

                    function _localFireErrorNotification() {
                        var src = null;
                        if (oSrcID) {
                            src = findSourceBy('id', oSrcID);
                        }
                        if (src) {
                            src.errCode = errCode;
                            src.error = error;
                            getNotify().fireSyncNotification(src, true, src.errCode, "");
                        } else {
                            getNotify().fireAllSyncNotifications(true, errCode, error, "");
                        }
                    }

                }).fail(function(errCode, error){
                    dfr.reject(errCode, error);
                });
            }).fail(function(errCode, error){
                dfr.reject(errCode, error);
            });
        }).promise();
    }

    function findSourceBy(key, value) {
        for(var i = 0; i < sourcesArray.length; i++) {
            if ((sourcesArray[i])[key] == value)
                return sourcesArray[i];
        }
        return null;
    }

    function loadSession() {
        return $.Deferred(function(dfr){
            rho.storage.loadAllClients().done(function(tx, clients){
                dfr.resolve((0 < clients.length) ? clients[0].session : null);
            }).fail(function(obj, err){
                dfr.reject(rho.errors.ERR_RUNTIME, "db access error: " +err);
            });

        }).promise();
    }

    function loadClientID() {
        return $.Deferred(function(dfr){
            var clnId = '';
            var resetClient = false;
            
            rho.storage.loadAllClients().done(function(tx, clients){
                var client = null;

                if (0 < clients.length) {
                    client = clients[0];
                    clnId = client.id;
                    resetClient = client.reset;
                }

                if (!clnId) {
                    _createClient().done(function(client){
                        dfr.resolve(client.id);
                    }).fail(function(errCode, error){
                        dfr.reject(errCode, error);
                    });
                } else if (resetClient) {
                    _resetClient(clnId).done(function(clientId){
                        client.reset = 0;
                        rho.storage.storeClient(client).done(function(){
                            dfr.resolve(clientId);
                        }).fail(function(obj, error){
                            stopSync();
                            dfr.reject(rho.errors.ERR_RUNTIME, "db access error: " +error);
                        });
                    }).fail(function(errCode, error){
                        stopSync();
                        dfr.reject(errCode, error);
                    });
                } else {
                    dfr.resolve(clnId);
                }
            }).fail(function(obj, error){
                dfr.reject(rho.errors.ERR_RUNTIME, "db access error: " +error);
            });
        }).promise();
    }

    function loadAllSources() {
        return $.Deferred(function(dfr){
            //if (isNoThreadedMode()) {
            //    // RhoAppAdapter.loadAllSyncSources();
            //} else {
            //    // getNet().pushData( getNet().resolveUrl("/system/loadallsyncsources"), "", null );
            //}
            sources = {};

            rho.storage.loadAllSources().done(function(tx, srcs){
                $.each(srcs, function(src){
                    if (src.sync_type == 'none') return;
                    src.storage = rho.storage;
                    src.engine = this;
                    sources[src.name] = src;
                });
                checkSourceAssociations();
                dfr.resolve();
            }).fail(function(obj, err){
                dfr.reject(rho.errors.ERR_RUNTIME, "db access error: " +err);
            });
        }).promise();
    }


    function checkSourceAssociations() {
        var hashPassed = {};

        function _insertIntoArray(array, index, value) {
            if (index >= array.length) return array.concat(value);
            if (index < 0) index = 0;
            return array.slice(0, index).concat(value, array.slice(index));
        }

        function _findSrcIndex(srcArray, strSrcName) {
            for (var i = 0; i < srcArray.length; i++) {
                if (strSrcName == srcArray[i].name) return i;
            }
            return -1;
        }

        // map to array
        var srcArray = [];
        $.each(sources, function(name, src){
            srcArray.push(src);
        });
        // sorted by priority
        srcArray.sort(function(srcA, srcB){
            if(srcA.sync_priority < srcB.sync_priority) return -1;
            if(srcA.sync_priority > srcB.sync_priority) return +1;
            return 0;
        });

        
        for(var nCurSrc = srcArray.size()-1; nCurSrc > 0;) {
            var oCurSrc = srcArray[nCurSrc];
            if (oCurSrc.getAssociations().length == 0 || oCurSrc.name in hashPassed ) {
                nCurSrc--;
            } else {
                var nSrc = nCurSrc;
                for(var i = 0; i < oCurSrc.getAssociations().length; i++) {
                    var oAssoc = oCurSrc.getAssociations()[i];
                    var nAssocSrcIndex = _findSrcIndex(srcArray, oAssoc.m_strSrcName);
                    if (nAssocSrcIndex >=0 && nAssocSrcIndex < nSrc )
                    {
                        srcArray.splice(nSrc, 1);
                        _insertIntoArray(srcArray, nAssocSrcIndex, oCurSrc);
                        nSrc = nAssocSrcIndex;
                    }
                }
            }
            hashPassed[oCurSrc.name] = true;
        }

        // back to map
        sources = {};
        $.each(srcArray, function(idx, src){
            sources[src.name] = src;
        });
        // and instance field
        sourcesArray = srcArray;
    }

    function syncAllSources() {
        return $.Deferred(function(dfr){
            var isError = false;

            // The sources field may be inconsistent with sourceArray
            // field after checkSourceAssociations(), so we cannot
            // rely on it here. Going to build new map for deferred objects handling.
            var srcMap = {};
            $.each(sourcesArray, function(idx, src){
                srcMap[src.name] = src;
            });

            var dfrMap = rho.deferredMapOn($.extend({}, srcMap, {'rhoStartSyncSource': startSrc}));

            var syncErrors = [];

            var startSrcIndex = _getStartSourceIndex();
            var startSrc = (0 <= startSrcIndex ? sourcesArray[startSrcIndex] : null);
            if (0 <= startSrcIndex) {
                _syncOneSource(startSrcIndex).done(function(){
                    dfrMap.resolve('rhoStartSyncSource', ["ok"]);
                }).fail(function(errCode, error){
                    isError = true;
                    syncErrors.push({source: startSrc.name, errCode: errCode, error: error});
                    // We shouldn't stop the whole sync process on current source error,
                    // so resolve it instead of reject. Error is handled later.
                    dfrMap.resolve('rhoStartSyncSource', ["error", errCode, error]);
                });
            } else {
                dfrMap.resolve('rhoStartSyncSource', ["ok"]);
            }

            for(var i=0; i<sourcesArray.length; i++) {
                var src = sourcesArray[i];
                _syncOneSource(i).done(function(){
                    dfrMap.resolve(src.name, ["ok"]);
                }).fail(function(errCode, error){
                    isError = true;
                    syncErrors.push({source: startSrc.name, errCode: errCode, error: error});
                    // We shouldn't stop the whole sync process on current source error,
                    // so resolve it instead of reject. Error is handled later.
                    dfrMap.resolve('rhoStartSyncSource', ["error", errCode, error]);
                });
            }

            if (!isError && !isSchemaChanged()) {
                getNotify().fireSyncNotification(null, true, rho.errors.ERR_NONE, "sync_completed");
            }

            dfrMap.when().done(function(){
                if (syncErrors.length == 0) {
                    dfr.resolve(rho.errors.NONE, "Sync completed");
                } else {
                    dfr.reject(syncErrors);
                }
            }).fail(function(){
                // it shouldn't happen, because we resolving on errors
                LOG.error('Implementation error in SyncEngine.syncAllSources: some source has been rejected!');
                dfr.reject(syncErrors);
            });
        }).promise();
    }

    function _getStartSourceIndex() {
        for(var i=0; i<sourcesArray.length; i++) {
            if (!sourcesArray[i].isEmptyToken) return i;
        }
        return -1;
    }

    function _syncOneSource(index) {
        return $.Deferred(function(dfr){
            var source = sourcesArray[index];
            
            if ( source.sync_type == "bulk_sync_only") {
                dfr.resolve(null); //TODO: do resolve it as a source?
            } else if (isSessionExist() && syncState != states.stop ) {
                source.sync().done(function(){
                    dfr.resolve(source);
                }).fail(function(obj, error){
                    if (source.errCode == rho.errors.ERR_NONE) {
                        source.errCode = rho.errors.ERR_RUNTIME;
                    }
                    syncState = states.stop;
                    dfr.reject(rho.errors.ERR_RUNTIME, "sync is stopped: " +error);
                }).then(_finally, _finally);
                function _finally() {
                    getNotify().onSyncSourceEnd(index, sourcesArray);
                }
            } else {
                dfr.reject(rho.errors.ERR_RUNTIME, "sync is stopped");
            }
        }).promise();
    }

    function stopSync() {
        if (isContinueSync()) {
            syncState = states.stop;
            _cancelRequests();
        }
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
        return session ? true : false;
    }

    var isStoppedByUser = false;

    function _stopSyncByUser() {
        isStoppedByUser = true;
        stopSync();
    }

    function _exitSync() {
        if (isContinueSync()) {
            syncState = states.exit;
            _cancelRequests();
        }
    }

    function Source(id, name, syncType, storage, engine) {
        this.storage = storage;
        this.engine = engine;

        this.id = id;
        this.name = name;
        this.token = null;
        this.sync_priority = null;  // bigint, no default
        this.partition = null;      // varchar, no default
        this.sync_type = syncType;  // varchar, no default
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
        this.serverError = '';

        this.totalCount = 0;
        this.curPageCount = 0;
        this.serverObjectsCount = 0;

        this.arAssociations = [];
        this.getAssociations = function() {
            return this.arAssociations;
        };

        function SourceAssociation(strSrcName, strAttrib) {
            this.m_strSrcName = strSrcName;
            this.m_strAttrib = strAttrib;
        }

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
                    this.storage.executeSql("UPDATE sources SET token=? where source_id=?", +this.token, this.id).done(function(){
                        dfr.resolve();
                    }).fail(rho.passRejectTo(dfr));
                }
            }).promise();
        }

        this.parseAssociations = function(strAssociations) {
            if (!strAssociations) return;

            var srcName = "";
            $.each(strAssociations.split(','), function(idx, attrName){
                if (srcName) {
                    this.arAssociations.push(new SourceAssociation(srcName, attrName) );
                    srcName = "";
                } else {
                    srcName = attrName;
                }
            });
        };

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
                    this.storage.executeSql(
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

                rho.notify.byEvent(rho.events.SYNCHRONIZING, 'synchronizing' +this.name +'...', this.errCode, this.error);
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
