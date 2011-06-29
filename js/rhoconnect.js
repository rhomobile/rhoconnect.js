var RhoConnect = (function($) {

    function publicInterface() {
        return {
            ERRORS: ERRORS,
            // Actions and checks
            init: init,
            login: login,
            logout: logout,
            isLoggedIn: isLoggedIn,
            syncAllSources: syncAllSources,
            // Notifications
            setModelNotification: setModelNotification,
            clearModelNotification: clearModelNotification,
            setAllNotification: setAllNotification,
            clearAllNotification: clearAllNotification,
            setObjectsNotification: setObjectsNotification,
            clearObjectsNotification: clearObjectsNotification,
            addObjectNotify: addObjectNotify,
            clearObjectsNotify: clearObjectsNotify,
            // Data access
            dataAccessObjects: dataAccessObjects
        };
    }

    var defaults = {
        appName: 'rhoConnect',
        syncServer: '',
        pollInterval: 20,
        logLevel: 'warning',
        database: {
            nameSuffix: 'Db_',
            version: '1.0',
            comment: 'RhoConnect database',
            size: (2*1024*1024)
        }
    };

    var ERRORS = {
        ERR_NONE: 'No error',
        ERR_NETWORK: 'Network error',
        ERR_REMOTESERVER: 'Remote server access error',
        ERR_RUNTIME: 'Runtime error',
        ERR_UNEXPECTEDSERVERRESPONSE: 'Unexpected server response',
        ERR_DIFFDOMAINSINSYNCSRC: 'Different synchronization domain error',
        ERR_NOSERVERRESPONSE: 'No server response',
        ERR_CLIENTISNOTLOGGEDIN: 'Client not logged in',
        ERR_CUSTOMSYNCSERVER: 'Custom sync server',
        ERR_UNATHORIZED: 'Unauthorized access',
        ERR_CANCELBYUSER: 'Canceled by user',
        ERR_SYNCVERSION: 'Synchronization version error',
        ERR_GEOLOCATION: 'Geolocation error'
    };

    var EVENTS = {
        GENERIC_NOTIFICATION: 'rhoConnectGenericNotification',
        ERROR: 'rhoConnectError',
        CLIENT_CREATED: 'rhoConnectClientCreated',
        STATUS_CHANGED: 'rhoConnectStatusChanged',
        SYNCHRONIZING: 'rhoConnectSourceSynchronizing',
        SYNC_SOURCE_END: 'rhoConnectSourceSynchronizationEnd'
    };

    function init(modelDefs, storageType, doReset, sourceSyncCallback) {
        return $.Deferred(function(dfr){
            rho.storage.init(doReset).done(function(){
                rho.engine.restoreSession().done(function(){
                    _resetModels();
                    _loadModels(storageType, modelDefs, sourceSyncCallback).done(function(){
                        dfr.resolve();
                    }).fail(function(obj, error){
                        dfr.reject("models load error: " +error);
                    });
                }).fail(function(errCode, error){
                    dfr.reject("session restoring error: " +error);
                });
            }).fail(function(error){
                dfr.reject("storage initialization error: " +error);
            });
        }).promise();
    }

    function login(login, password, /*oNotify,*/ doInitDb) {
        return $.Deferred(function(dfr){
            rho.engine.login(login, password, /*oNotify,*/ doInitDb).done(function(){
                dfr.resolve();
            }).fail(function(errCode, errMsg){
                dfr.reject(errCode, errMsg);
            });
        }).promise();
    }

    function logout() {
        return rho.engine.logout();
    }

    function isLoggedIn() {
        return rho.engine.isSessionExist();
    }

    function syncAllSources() {
        return rho.engine.doSyncAllSources();
    }

    function dataAccessObjects() {
        return _getStoragePlugin().dataAccessObjects();
    }

    function _getStoragePlugin() {
        if (!storageType) return rho.plugins.emptyStoragePlugin;
        return rho.plugins[storageType] || rho.plugins.emptyStoragePlugin;
    }

    function _initDbSources(tx, configSources) {
        return $.Deferred(function(dfr){
            rho.storage.loadAllSources(tx).done(function (tx, dbSources) {

                var startId = rho.engine.getStartSourceId(dbSources);

                var dbSourceMap = {};
                $.each(dbSources, function(idx, src){
                    dbSourceMap[src.name] = src;
                });

                var dfrMap = rho.deferredMapOn(configSources);

                $.each(configSources, function(name, cfgSource){
                    // if source from config is already present in db
                    var dbSource = dbSourceMap[cfgSource.name];
                    if (dbSource) { // then update it if needed
                        var updateNeeded = false;

                        if (dbSource.sync_priority != cfgSource.sync_priority) {
                            dbSource.sync_priority = cfgSource.sync_priority;
                            updateNeeded = true;
                        }
                        if (dbSource.sync_type != cfgSource.sync_type) {
                            dbSource.sync_type = cfgSource.sync_type;
                            updateNeeded = true;
                        }
                        if (dbSource.associations != cfgSource.associations) {
                            dbSource.associations = cfgSource.associations;
                            updateNeeded = true;
                        }
                        if (!cfgSource.id) {
                            cfgSource.id = dbSource.id;
                        }
                        if (updateNeeded) {
                            rho.storage.storeSource(dbSource, tx).done(function(tx, source){
                                dfrMap.resolve(name, [source]);
                            }).fail(function(obj, err){
                                dfrMap.reject(name, [obj, err]);
                            });
                        } else {
                            dfrMap.resolve(name, [dbSource]);
                        }
                    } else { // if configured source not in db yet
                        if (!cfgSource.id) {
                            cfgSource.id = startId;
                            startId += 1;
                        }
                        rho.storage.insertSource(cfgSource, tx).done(function(tx, source){
                            dfrMap.resolve(name, [source]);
                        }).fail(function(obj, err){
                            dfrMap.reject(name, [obj, err]);
                        });
                    }
                });
                dfrMap.when().done(function(){
                    dfr.resolve();
                }).fail(function(obj, err){
                    dfr.reject(obj, err);
                });
            }).fail(function(obj, err) {
                dfr.reject(obj, err);
            });
        }).promise();
    }

    function _initSources(sources) {
        return $.Deferred(function(dfr){
            $.each(sources, function(name, source){
                source.associations = '';
            });
            $.each(sources, function(name, source){
                if (!source || !source.model || !source.model.belongsTo) return;
                $.each(source.model.belongsTo, function(keyAttr, ownerName){
                    var ownerSrc = sources[ownerName];
                    if (!ownerSrc) {
                        //TODO: report the error
                        //puts ( "Error: belongs_to '#{source['name']}' : source name '#{src_name}' does not exist."  )
                        return;
                    }
                    var str = ownerSrc.associations || '';
                    str += (0 < str.length) ? ', ' : '';
                    str += (source.name +', ' +keyAttr);
                    ownerSrc.associations = str;
                });
            });

            rho.storage.open().done(function(db){
                rho.storage.rwTx(db).ready(function(db, tx){
                    _initDbSources(tx, sources).done(function(){
                        dfr.resolve();
                    }).fail(function(obj, err) {
                        dfr.reject(obj, err);
                    });
                    //initSyncSourceProperties(sources, tx);
                }).fail(function(obj, err){
                    //TODO: report the error
                    dfr.reject(obj, err);
                });
            });
        }).promise();
    }


    var models = {}; // name->model map

    var allModelsLoaded = false;

    function _resetModels() {
        models = {};
        allModelsLoaded = false;
    }

    var storageType;
    
    function _loadModels(stType, modelDefs, sourceSyncCallback) {
        if (allModelsLoaded) return $.Deferred().resolve().promise();

        storageType = stType || 'rhom';
        _getStoragePlugin().initModels(modelDefs);

        function _addLoadedModel(defn) {
            var model = new rho.domain.Model(defn);
            model.source.sync_priority = parseInt(defn['sync_priority'] || 1000);
            model.source.sync_type = 'incremental';
            model.source.partition = 'user';
            var sourceId = defn['source_id'] ? parseInt(defn['source_id']) : null;
            model.source.id = sourceId;
            if (sourceId && rho.engine.maxConfigSrcId < sourceId) {
                rho.engine.maxConfigSrcId = sourceId;
            }
            models[defn.name] = model;
            rho.engine.getSources()[defn.name] = model.source;
        }

        function _loadModel(defn) {
            if (!defn || defn.isLoaded) return;
            defn.isLoaded = true;
            if ('string' == typeof defn.name) {
                _addLoadedModel(defn)
            }
        }

        if (modelDefs && 'object' == typeof modelDefs) {
            if ($.isArray(modelDefs)) {
                $.each(modelDefs, function(idx, defn){_loadModel(defn);});
            } else {
                _loadModel(modelDefs);
            }
        }
        allModelsLoaded = true;

        return _initSources(rho.engine.getSources()).done(function(){
            $.each(rho.engine.getSources(), function(name, src){
                rho.engine.getNotify().setNotification(src, new rho.notify.SyncNotification(function(notifyBody){
                    if ("function" == typeof sourceSyncCallback) {
                        sourceSyncCallback(notifyBody);
                        return false;
                    }
                }, false));
            });
        });
    }

    function validSourceWithName(name) {
        if (name
                && "object" == typeof rho.engine.getSources()
                && "object" == typeof rho.engine.getSources()[name]
                && rho.engine.getSources()[name].id
                ) return rho.engine.getSources()[name];
        else return false;
    }

    function setModelNotification(srcName, callback, removeAfterFire) {
        var src = validSourceWithName(srcName);
        if (src) {
            rho.engine.getNotify().setNotification(src, new rho.notify.SyncNotification(callback, removeAfterFire));
        }
    }

    function clearModelNotification(srcName) {
        rho.engine.getNotify().clearNotification(srcName);
    }

    function setAllNotification(callback, removeAfterFire) {
        rho.engine.getNotify().setAllNotification(new rho.notify.SyncNotification(callback, removeAfterFire));
    }

    function clearAllNotification() {
        rho.engine.getNotify().clearAllNotification();
    }

    function setObjectsNotification(callback, removeAfterFire) {
        // Call callback function only if there are any real changes
        function nonEmptyChanges(notifyBody) {
            if (notifyBody.deleted.length == 0
                    && notifyBody.updated.length == 0
                    && notifyBody.created.length == 0
                    ) return false;
            return callback(notifyBody);
        }
        rho.engine.getNotify().setObjectsNotification(new rho.notify.SyncNotification(nonEmptyChanges, removeAfterFire));
    }

    function clearObjectsNotification() {
        rho.engine.getNotify().clearObjectsNotification();
    }

    function addObjectNotify(srcName, objId) {
        var src = validSourceWithName(srcName);
        if (src) {
            rho.engine.getNotify().addObjectNotify(src.id, objId);
        } else {
            rho.engine.getNotify().addObjectNotify(srcName, objId);
        }
    }

    function clearObjectsNotify() {
        rho.engine.getNotify().cleanObjectsNotify();
    }

    // rhoconnect internal parts we _have_to_ make a public
    var rho = {
        config: $.extend({}, defaults, RhoConfig),
        EVENTS: EVENTS,
        getModels: function() {return models;},

        domain: null,
        protocol: null,
        engine: null,
        notify: null,
        storage: null,

        plugins: {
            emptyStoragePlugin: {
                initModels: function(){},
                dataAccessObjects: function(){return {}}
            }
        }
    };

    return $.extend(publicInterface(), {rho: rho});

})(jQuery);
