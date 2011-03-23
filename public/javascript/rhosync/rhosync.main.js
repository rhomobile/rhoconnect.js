(function($) {

    const SESSION_COOKIE = 'rhosync_session';

    const events = {
        GENERIC_NOTIFICATION: 'rhoSyncGenericNotification',
        ERROR: 'rhoSyncErrorNotification',
        CLIENT_CREATED: 'rhoSyncClientCreatedNotification',
        SYNCHRONIZING: 'rhoSyncSourceSynchronizing',
        SYNC_SOURCE_END: 'rhoSyncSourceSynchronizationEnd'
    };

    const errors = {
        ERR_NONE: 'ERR_NONE',
        ERR_RUNTIME: 'ERR_RUNTIME'
    };

    const defaults = {
        dbName: 'rhoSyncDb',
        syncServer: '',
        pollInterval: 20
    };

    var api = {
        config: $.extend({}, defaults, RhoConfig),
        events: events,
        errors: errors,

        domain: null,
        protocol: null,
        engine: null,
        storage: null,

        internal: {
            deferredMapOn: _deferredMapOn,
            passRejectTo: _passRejectTo,
            notify: _notify
        }
    };


    function _notify(type /*, arg1, arg2, ... argN*/) {
        $(window).trigger(jQuery.Event(type), $.makeArray(arguments).slice(1));
        // fire exact notifications here
    }

    // utility functions ========================

    function _passRejectTo(dfr, doReport) {
        return function() {
            if (doReport) {
                //TODO: some log output
            }
            dfr.reject(arguments);
        };
    }

    function _deferredMapOn(obj) {
        var dfrMap = {}; // to resolve/reject each exact item
        var dfrs = []; // to watch on all of them

        $.each(obj, function(key, value){
            var dfr = new $.Deferred();
            dfrMap[key] = dfr;
            dfrs.push(dfr.promise());
        });

        return {
            resolve: function(name, args) {
                if (dfrMap[name]) dfrMap[name].resolve.apply(dfrMap[name], args);
            },
            reject: function(name, args) {
                if (dfrMap[name]) dfrMap[name].reject.apply(dfrMap[name], args);
            },
            when: function() {
                return $.when(dfrs);
            }
        };
    }



/*
    function initSyncSourceProperties(cfgSources, optTx){
        $.each(cfgSources, function(key, item) {
        });
//            uniq_sources.each do|src|
//                ['pass_through'].each do |prop|
//                    next unless src.has_key?(prop)
//                    SyncEngine.set_source_property(src['source_id'], prop, src[prop] ? src[prop].to_s() : '' )
//                end
//            end
    }
*/


    var maxConfigSrcId = 1;

    function getStartId(dbSources) {
        var startId = 0;
        $.each(dbSources, function(name, dbSource){
            startId = (dbSource.id > startId) ? dbSource.id : startId;
        });
        if (startId < maxConfigSrcId) {
            startId =  maxConfigSrcId + 2;
        } else {
            startId += 1;
        }
        return startId;
    }

    function initDbSources(tx, configSources) {
        return $.Deferred(function(dfr){
            api.storage.loadAllSources(tx).done(function (tx, dbSources) {

                var startId = getStartId(dbSources);

                var dbSourceMap = {};
                $.each(dbSources, function(idx, src){
                    dbSourceMap[src.name] = src;
                });

                var dfrMap = {}; // to resolve/reject each exact item
                var dfrs = []; // to watch on all of them
                $.each(configSources, function(name, cfgSource){
                    var dfr = new $.Deferred();
                    dfrMap[name] = dfr;
                    dfrs.push(dfr.promise());
                });

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
                            api.storage.storeSource(dbSource, tx).done(function(tx, source){
                                dfrMap[name].resolve(source);
                            }).fail(function(obj, err){
                                dfrMap[name].reject(obj, err);
                            });
                        }
                    } else { // if configured source not in db yet
                        if (!cfgSource.id) {
                            cfgSource.id = startId;
                            startId =+ 1;
                        }
                        api.storage.insertSource(cfgSource, tx).done(function(tx, source){
                            dfrMap[name].resolve(source);
                        }).fail(function(obj, err){
                            dfrMap[name].reject(obj, err);
                        });
                    }
                });
                $.when(dfrs).done(function(resolvedDfrs){
                    dfr.resolve();
                }).fail(function(obj, err){
                    dfr.reject(obj, err);
                });
            }).fail(function(obj, err) {
                dfr.reject(obj, err);
            });
        }).promise();
    }

    function initSources(sources) {
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

            api.storage.open().done(function(db){
                api.storage.rwTx(db).ready(function(db, tx){
                    initDbSources(tx, sources).done(function(){
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

    function loadModels(storageType, modelDefs) {
        if (allModelsLoaded) return $.Deferred().done().promise();

        function _addLoadedModel(defn) {
            var model = new api.domain.Model(defn);
            model.source.sync_priority = parseInt(defn['sync_priority'] || 1000);
            model.source.sync_type = 'incremental';
            model.source.partition = 'user';
            var sourceId = defn['source_id'] ? parseInt(defn['source_id']) : null;
            model.source.id = sourceId;
            if (sourceId && maxConfigSrcId < sourceId) {
                maxConfigSrcId = sourceId;
            }
            models[defn.name] = model;
            api.engine.sources[defn.name] = model.source;
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

        return initSources(api.engine.sources);
    }

    function login(login, password) {
        return $.Deferred(function(dfr){
            api.engine.login(login, password).done(function(client){
                api.engine.run(client).done(function(client){
                    dfr.resolve();
                }).fail(function(error){
                    dfr.reject("engine run error: " +error);
                });
            }).fail(function(error){
                dfr.reject("client initialization error: " +error);
            });
        }).promise();
    }

    function init(storageType, modelDefs) {
        return $.Deferred(function(dfr){
            api.storage.init().done(function(){
                loadModels(storageType, modelDefs).done(function(){
                    dfr.resolve();
                }).fail(function(obj, error){
                    dfr.reject("models load error: " +error);
                });
            }).fail(function(error){
                dfr.reject("storage initialization error: " +error);
            });
        }).promise();
    }

    RhoSync = {
        api: api,
        models: models,
        init: init
    };

})(jQuery);
