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
            getSyncPageSize:  function() {return syncPageSize},
            getClientId:  function() {return clientId},
            getStartSourceId: getStartSourceId,
            getSourceOptions: getSourceOptions,
            isNoThreadedMode: isNoThreadedMode,
            isSessionExist: isSessionExist,
            isContinueSync: isContinueSync,
            setSchemaChanged: function(value) {isSchemaChanged = value},
            isSchemaChanged: function() {return isSchemaChanged},
            isStoppedByUser: function() {return isStoppedByUser}
        };
    }

    var rho = RhoSync.rho;

    const states = {
        none: 0,
        syncAllSources: 1,
        syncSource: 2,
        search: 3,
        stop: 4,
        exit: 5
    };

    var sources = {}; // name->source map
    // to be ordered by priority and associations after checkSourceAssociations() call
    var sourcesArray = [];

    var sourceOptions = new SourceOptions();

    function SourceOptions() {
        var srcOptions = {};

        this.setProperty = function(srcId, name, value) {
            var hashOptions = srcOptions[srcId];
            if (!hashOptions) {
                hashOptions = {};
                srcOptions[srcId] = hashOptions;
            }
            hashOptions[name] = value || "";
        };
        
        this.getProperty = function(srcId, name) {
            var hashOptions = srcOptions[srcId];
            if (hashOptions) {
                return hashOptions[name] || "";
            }
            return "";
        };

        this.getBoolProperty = function(nSrcID, szPropName)
        {
            var strValue = getProperty(nSrcID, szPropName);
            return (strValue == "1" || strValue == "true");
        }
    }

    var notify = null;
    var syncState = states.none;
    var isSearch = false;
    var errCode = rho.errors.ERR_NONE;
    var error = "";
    var serverError = "";
    var isSchemaChanged = false;
    var session = null;
    var clientId = null;
    var syncPageSize = 2000;


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
                var errCode = rho.protocol.getErrCodeFromXHR(xhr);
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
                // TODO: to implement RhoAppAdapter.getMessageText("sync_completed")
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
            if (!sourcesArray[i].isEmptyToken()) return i;
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

    function getNotify() {
        notify = notify || new rho.notify.SyncNotify(rho.engine);
        return notify;
    }

    function getSourceOptions() {
        return sourceOptions;
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
        var LOG = new rho.Logger('SyncSource');

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

        this.arAssociations = [];
        this.getAssociations = function() {
            return this.arAssociations;
        };

        this.isTokenFromDb = true;
        this.errCode = rho.errors.ERR_NONE;
        this.error = '';
        this.serverError = '';

        this.totalCount = 0;
        this.curPageCount = 0;
        this.serverObjectsCount = 0;

        this.insertedCount = 0;
        this.deletedCount = 0;

        this.getAtLeastOnePage = false;
        this.refreshTime = 0;

        //TODO: do we need to implement real value setup?
        this.schemaSource = false;

        this.progressStep = -1;

        function SourceAssociation(strSrcName, strAttrib) {
            this.m_strSrcName = strSrcName;
            this.m_strAttrib = strAttrib;
        }

        this.isEmptyToken = function() {
            return this.token == 0;
        };

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
                    }).fail(function(obj, error){
                            dfr.reject(rho.errors.ERR_RUNTIME, "db access error: " +error);
                    });
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
                LOG.info("Sync server changes source ID :" + this.id);

                _localAsyncWhile();
                function _localAsyncWhile() {
                    this.curPageCount =0;

                    var strUrl = rho.protocol.getServerQueryUrl("");
                    var clnId = this.engine.getClientId();
                    var pgSize = this.engine.getSyncPageSize();
                    var tkn = (!this.isTokenFromDb && this.token>1) ? this.token:null;
                    LOG.info( "Pull changes from server. Url: " + (strUrl+_localGetQuery(this.name, clnId, pgSize, tkn)));

                    rho.protocol.serverQuery(this.name, clnId, pgSize, tkn
                            /*, this.engine*/).done(function(status, data, xhr){

                        //var testResp = this.engine.getSourceOptions().getProperty(this.id, "rho_server_response");
                        //data = testResp ? $.parseJSON(testResp) : data;

                        processServerResponse_ver3(data).done(function(){

                            if (this.engine.getSourceOptions().getBoolProperty(this.id, "pass_through")) {
                                processToken(0).done(function(){
                                    _localNextIfContinued();
                                }).fail(function(errCode, error){
                                    dfr.reject(errCode, error);
                                });
                            } else {_localNextIfContinued();}

                            function _localNextIfContinued() {
                                if (this.token && this.engine.isContinueSync()) {
                                    // go next in async while loop
                                    _localAsyncWhile()
                                } else {
                                    _localAfterWhile();
                                }
                            }

                        }).fail(function(errCode, error){
                            dfr.reject(errCode, error);
                        });
                    }).fail(function(status, error, xhr){
                        this.engine.stopSync();
                        this.errCode = rho.protocol.getErrCodeFromXHR(xhr);
                        this.error = error;
                        //_localAfterWhile(); //TODO: am I sure?
                        dfr.reject(errCode, error);
                    });
                }
                function _localAfterWhile() {
                    if (!_whileEnded) {
                        _whileEnded = true;
                        if (this.engine.isSchemaChanged()) {
                            this.engine.stopSync();
                        }
                        dfr.resolve();
                    }
                }
                var _whileEnded = false;

                function _localGetQuery(srcName, clnId, pgSize, token) {
                    var strQuery = "?client_id=" + clnId +
                        "&p_size=" + pgSize + "&version=3";
                    strQuery += srcName ? ("&source_name=" + srcName) : '';
                    return strQuery += token ? ("&token=" + token) : '';
                }
            }).promise();
        }

        function processServerResponse_ver3(data) {
            return $.Deferred(function(dfr){
                var itemIndex = 0;
                var item = null;
                
                item = data[itemIndex];
                if (item.version != rho.protocol.getVersion()) {
                    itemIndex++;
                    LOG.error("Sync server send data with incompatible version. Client version: " +rho.protocol.getVersion()
                        +"; Server response version: " +item.version +". Source name: " +this.name);
                    this.engine.stopSync();
                    this.errrCode = rho.errors.ERR_UNEXPECTEDSERVERRESPONSE;
                    dfr.reject(this.errCode, "Sync server send data with incompatible version.");
                    return;
                }

                item = data[itemIndex];
                if (undefined != item.token){
                    itemIndex++;
                    processToken(item.token +0).done(function(){
                        _localAfterProcessToken();
                    }).fail(function(errCode, error){
                        dfr.reject(this.errCode, error);
                    });
                } else {_localAfterProcessToken();}

                function _localAfterProcessToken() {
                    item = data[itemIndex];
                    if (undefined != item.source) {
                        itemIndex++;
                        //skip it. it uses in search only
                    }
                    item = data[itemIndex];
                    if (undefined != item.count) {
                        itemIndex++;
                        this.curPageCount = (item.count +0);
                    }
                    item = data[itemIndex];
                    if (undefined != item['refresh_time']) {
                        itemIndex++;
                        this.refreshTime = (item['refresh_time'] +0);
                    }
                    item = data[itemIndex];
                    if (undefined != item['progress_count']) {
                        itemIndex++;
                        //TODO: progress_count
                        //setTotalCount(oJsonArr.getCurItem().getInt("progress_count"));
                    }
                    item = data[itemIndex];
                    if (undefined != item['total_count']) {
                        itemIndex++;
                        this.totalCount = (item['total_count'] +0);
                    }
                    //if ( getServerObjectsCount() == 0 )
                    //    getNotify().fireSyncNotification(this, false, RhoAppAdapter.ERR_NONE, "");

                    if (this.token == 0) {
                        //oo conflicts
                        rho.storage.executeSql("DELETE FROM changed_values where source_id=? and sent>=3", this.id).done(function(){
                            _localAfterTokenIsZero();
                        }).fail(function(){
                            dfr.reject(rho.errors.ERR_RUNTIME, "db access error: " +error);
                        });
                        //
                    } else {_localAfterTokenIsZero();}

                    function _localAfterTokenIsZero(){
                        LOG.info("Got " + this.curPageCount + "(Processed: " +  this.serverObjectsCount
                                + ") records of " + this.totalCount + " from server. Source: " + this.name
                                + ". Version: " + item.version );

                        if (this.engine.isContinueSync()) {
                            item = data[itemIndex];
                            var oCmds = item;
                            itemIndex++;

                            if (undefined != oCmds['schema-changed']) {
                                this.engine.setSchemaChanged(true);
                                _localAfterProcessServerErrors();
                            } else if (!processServerErrors(oCmds)) {
                                rho.storage.tx('rw').done(function(db, tx){
                                    if (this.engine.getSourceOptions().getBoolProperty(this.id, "pass_through")) {
                                        if (this.schemaSource) {
                                            //rho.storage.executeSql( "DELETE FROM " + this.name );
                                        } else {
                                            rho.storage.executeSql( "DELETE FROM object_values WHERE source_id=?", [this.id], tx).done(function(tx, rs){
                                                _localAfterDeleteObjectValues();
                                            }).fail(function(obj, error){
                                                dfr.reject(rho.errors.ERR_RUNTIME, "db access error: " +error);
                                            });
                                        }
                                    } else {_localAfterDeleteObjectValues();}

                                    function _localAfterDeleteObjectValues() {
                                        if (undefined != oCmds["metadata"] && this.engine.isContinueSync() ) {
                                            var strMetadata = oCmds["metadata"];
                                            rho.storage.executeSql("UPDATE sources SET metadata=? WHERE source_id=?", [strMetadata, this.id], tx).done(function(){
                                                _localAfterSourcesUpdate();
                                            }).fail(function(obj, error){
                                                dfr.reject(rho.errors.ERR_RUNTIME, "db access error: " +error);
                                            });
                                        } else {_localAfterSourcesUpdate();}

                                        function _localAfterSourcesUpdate(){
                                            if (undefined != oCmds["links"] && this.engine.isContinueSync() ) {
                                                processSyncCommand("links", oCmds["links"], true);
                                            }
                                            if (undefined != oCmds["delete"] && this.engine.isContinueSync() ) {
                                                processSyncCommand("delete", oCmds["delete"], true);
                                            }
                                            if (undefined != oCmds["insert"] && this.engine.isContinueSync() ) {
                                                processSyncCommand("insert", oCmds["insert"], true);
                                            }

                                            getNotify().fireObjectsNotification();
                                            _localAfterProcessServerErrors();
                                        }
                                    }
                                }).fail(function(){
                                    dfr.reject(rho.errors.ERR_RUNTIME, "db access error: " +error);
                                });
                            } else {_localAfterProcessServerErrors();}

                            function _localAfterProcessServerErrors() {
                                _localAfterIfContinueSync();
                            }
                        } else {_localAfterIfContinueSync();}

                        function _localAfterIfContinueSync(){
                            if (this.curPageCount > 0) {
                                getNotify().fireSyncNotification(this, false, rho.errors.ERR_NONE, "");
                            }
                            dfr.resolve();
                        }
                    }
                }

            }).promise();
        }

        function processSyncCommand(strCmd, oCmdEntry, bCheckUIRequest) {
            return $.Deferred(function(dfr){

                $.each(oCmdEntry, function(strObject, attrs){
                    if (!this.engine.isContinueSync()) return;

                    if (this.schemaSource) {
                        //processServerCmd_Ver3_Schema(strCmd,strObject,attrIter);
                    } else {
                        $.each(attrs, function(strAttrib, strValue){
                            if (!this.engine.isContinueSync()) return;

                            processServerCmd_Ver3(strCmd,strObject,strAttrib,strValue).done(function(){
                                _localAfterIfSchemaSource();
                            }).fail(function(errCode, error){
                                LOG.error("Sync of server changes failed for " + getName() + ";object: " + strObject, error);
                                dfr.reject(errCode, error);
                            });

                        });

                    } /* else {_localAfterIfSchemaSource()}*/

                    function _localAfterIfSchemaSource() {
                        if (this.sync_type == "none") return;

                        if (bCheckUIRequest) {
                            var nSyncObjectCount  = getNotify().incLastSyncObjectCount(this.id);
                            if ( this.progressStep > 0 && (nSyncObjectCount % this.progressStep == 0) ) {
                                getNotify().fireSyncNotification(this, false, rho.errors.ERR_NONE, "");
                            }

                            //TODO: to discuss with Evgeny
                            //if (getDB().isUIWaitDB()) {
                            //    LOG.INFO("Commit transaction because of UI request.");
                            //    getDB().endTransaction();
                            //    SyncThread.getInstance().sleep(1000);
                            //    getDB().startTransaction();
                            //}
                        }
                    }
                });

            }).promise();
        }

        function processServerCmd_Ver3(strCmd, strObject, strAttrib, strValue) {
            //TODO: to implement
        }

        function processServerErrors(oCmds) {
            //TODO: to implement
            return false;
        }

        function syncClientChanges() {
            return $.Deferred(function(dfr){
                // just a stub
                dfr.resolve(false /*it means server changes hasn't been synchronized*/);
                //TODO: to implement
            }).promise();
        }

        this.sync = function(){
            return $.Deferred(function(dfr){
                //TODO: to implement RhoAppAdapter.getMessageText("syncronizing")
                getNotify().reportSyncStatus("syncronizing" + this.name + "...", this.errCode, this.error);

                var startTime = Date.now();

                if (this.isTokenFromDb && this.token > 1) {
                    syncServerChanges().done(function(){
                        _finally();
                        dfr.resolve();
                    }).fail(_catch);
                } else {
                    if (isEmptyToken()) {
                        processToken(1).done(function(){
                            _localSyncClient();
                        }).fail(_catch);
                    }
                    _localSyncClient();

                    function _localSyncClient() {
                        syncClientChanges().done(function(serverSyncDone){
                            if (!serverSyncDone) syncServerChanges().done(function(){
                                _finally();
                                dfr.resolve(); //TODO: params to resolve
                            }).fail(_catch);
                        }).fail(_catch);
                    }
                }
                function _catch(errCode, error) {
                    engine.stopSync();
                    _finally();
                    dfr.reject(errCode, error);
                }
                function _finally() {
                    var endTime = Date.now();

                    this.storage.executeSql(
                            "UPDATE sources set last_updated=?,last_inserted_size=?,last_deleted_size=?, "
                            +"last_sync_duration=?,last_sync_success=?, backend_refresh_time=? WHERE source_id=?",
                            (endTime/1000), getInsertedCount(), getDeletedCount(),
                      endTime - startTime,
                      (this.getAtLeastOnePage ? 1 : 0), this.refreshTime, this.id );
                }
            }).promise();
        };

        function getNotify() {
            return this.engine.notify;
        }

        function getInsertedCount() {
            return this.insertedCount;
        }

        function getDeletedCount() {
            return this.deletedCount;
        }

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
