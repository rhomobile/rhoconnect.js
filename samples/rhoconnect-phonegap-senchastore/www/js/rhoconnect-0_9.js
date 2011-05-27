var RhoConnect = (function($) {

    function publicInterface() {
        return {
            ERRORS: ERRORS,
            init: init,
            login: login,
            logout: logout,
            isLoggedIn: isLoggedIn,
            syncAllSources: syncAllSources
        };
    }

    var defaults = {
        syncServer: '',
        consoleServer: '',
        pollInterval: 20,
        database: {
            namePrefix: 'rhoConnectDb_',
            name: 'UNINITIALIZED',
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

    function init(modelDefs, storageType, syncProgressCb, doReset) {
        return $.Deferred(function(dfr){
            rho.storage.init(doReset).done(function(){
                rho.engine.restoreSession().done(function(){
                    _resetModels();
                    _loadModels(storageType, modelDefs, syncProgressCb).done(function(){
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

    function login(login, password, oNotify) {
        return $.Deferred(function(dfr){
            rho.engine.login(login, password, oNotify).done(function(){
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

    function _initDbSources(tx, configSources) {
        return $.Deferred(function(dfr){
            rho.storage.loadAllSources(tx).done(function (tx, dbSources) {

                var startId = rho.engine.getStartSourceId(dbSources);

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
                            rho.storage.storeSource(dbSource, tx).done(function(tx, source){
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
                        rho.storage.insertSource(cfgSource, tx).done(function(tx, source){
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
    
    function _loadModels(storageType, modelDefs, syncProgressCb) {
        if (allModelsLoaded) return $.Deferred().resolve().promise();

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
                rho.engine.getNotify().setNotification(src, new rho.notify.SyncNotification(function(){
                    if ("function" == typeof syncProgressCb) {
                        syncProgressCb(name);
                        return false;
                    }
                }, false));
            });
        });
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
        storage: null
    };

    return $.extend(publicInterface(), {rho: rho});

})(jQuery);
(function($) {

    function publicInterface() {
        return {
            Logger: Logger,
            ERRORS: RhoConnect.ERRORS,
            deferredMapOn: deferredMapOn,
            passRejectTo: passRejectTo
        };
    }

    var rho = RhoConnect.rho;

    function Logger(name) {

        var levels = {
            trace: 0,
            info: 1,
            warning: 2,
            error: 3,
            fatal: 4
        };
        var levelTag = ['Trace', 'Info', 'Warning', 'Error', 'Fatal'];

        var level = parseLogLevel(rho.config.logLevel);

        this.trace = function(message) {
            var l = levels.trace;
            if (level > l) return;
            withConsole(function(c){
                c.info(buildMsg(l, message));
            });
        };

        this.info = function(message) {
            var l = levels.info;
            if (level > l) return;
            withConsole(function(c){
                c.info(buildMsg(l, message));
            });
        };

        this.warning = function(message, exception) {
            var l = levels.warning;
            if (level > l) return;
            withConsole(function(c){
                c.warn(buildMsg(l, message));
                if (exception) {
                    c.warn('EXCEPTION: ' +exception);
                }
            });
        };

        this.error = function(message, exception) {
            var l = levels.error;
            if (level > l) return;
            withConsole(function(c){
                c.error(buildMsg(l, message));
                if (exception) {
                    c.error('EXCEPTION: ' +exception);
                }
            });
        };

        this.fatal = function(message, exception) {
            var l = levels.fatal;
            if (level > l) return;
            withConsole(function(c){
                c.error(buildMsg(l, message));
                if (exception) {
                    c.error('EXCEPTION: ' +exception);
                }
            });
        };

        function parseLogLevel(name) {
            var isValid = ("string" == typeof name && name.toLowerCase() in levels);
            return isValid ? levels[name.toLowerCase()] : levels.warning;
        }

        function withConsole(callback) {
          if (window.console) {
            callback(window.console)
          }
        }

        function buildMsg(severity, text) {
            var date = Date().replace(/\S+\s(.*?)\sGMT\+.*$/, '$1');
            return date +' [' +levelTag[severity] +']' +' (' +name +') ' +text;
        }
    }

    function passRejectTo(dfr, doReport) {
        return function() {
            if (doReport) {
                //TODO: some log output
            }
            dfr.reject(arguments);
        };
    }

    function deferredMapOn(obj) {
        var dfrMap = {}; // to resolve/reject each exact item
        var dfrs = []; // to watch on all of them

        $.each(obj, function(key, value){
            var dfr = new $.Deferred();
            dfrMap[key] = dfr;
            dfrs.push(dfr.promise());
        });

        return {
            resolve: function(key, args) {
                if (dfrMap[key]) dfrMap[key].resolve.apply(dfrMap[key], args);
            },
            reject: function(key, args) {
                if (dfrMap[key]) dfrMap[key].reject.apply(dfrMap[key], args);
            },
            when: function() {
                return $.when.apply(this, dfrs);
            }
        };
    }

    $.extend(rho, publicInterface());
    $.extend(RhoConnect, {Logger: Logger});

})(jQuery);
(function($) {

    function publicInterface() {
        return {
            getVersion: getVersion,
            getErrCodeFromXHR: getErrCodeFromXHR,
            getSession: getSession,
            setSession: setSession,
            deleteSession: deleteSession,
            getServerQueryUrl: getServerQueryUrl,
            login: login,
            logout: logout,
            clientCreate: clientCreate,
            clientReset: clientReset,
            serverQuery: serverQuery,
            postData: postData
        };
    }

    var rho = RhoConnect.rho;

    var SESSION_COOKIE = 'rhosync_session';

    var RESP_CODES = {
        HTTP_OK: 200,
        HTTP_PARTIAL_CONTENT: 206,
        HTTP_MOVED_TEMPORARILY: 302,
        HTTP_MOVED_PERMANENTLY: 301,
        HTTP_MOVED_PERM: 301,
        HTTP_BAD_REQUEST: 400,
        HTTP_NOT_FOUND: 404,
        HTTP_UNAUTHORIZED: 401,
        HTTP_RANGENOTSATISFY: 416,
        HTTP_INTERNAL_ERROR: 500,
        HTTP_NOTMODIFIED: 304
    };

    function getErrCodeFromXHR(xhr) {
        switch(xhr.status) {
            case RESP_CODES.HTTP_UNAUTHORIZED: return rho.ERRORS.ERR_UNATHORIZED;
            case RESP_CODES.HTTP_OK: return rho.ERRORS.ERR_NONE;
            case RESP_CODES.HTTP_PARTIAL_CONTENT: return rho.ERRORS.ERR_NONE;
            default: return rho.ERRORS.ERR_REMOTESERVER;
        }
    }

    function getVersion() {
        return 3;
    }

    function getSession() {
        return _getCookie(SESSION_COOKIE);
    }

    function setSession(value) {
        return _setCookie(SESSION_COOKIE, value, 365, '/', window.location.hostname, false);
    }

    function deleteSession() {
        return _deleteCookie(SESSION_COOKIE, '/', window.location.hostname);
    }

    function getServerQueryUrl() {
        return rho.config.syncServer;
    }

    function _setCookie(name, value, days, path, domain, secure) {
        //TODO: to re-implement
//        if (days) {
//            var expDate = new Date();
//            expDate.setTime(expDate.getTime() + (days * 24 * 60 * 60 * 1000));
//        }
//        document.cookie = name + "=" + /*encodeURIComponent( */value /*)*/ +
//            ((days) ? "; expires=" + expDate.toGMTString() : "") +
//            ((path) ? "; path=" + path : "") +
//            ((domain) ? "; domain=" + domain : "") +
//            ((secure) ? "; secure" : "");
    }

    function _getCookie(name) {
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var cookie = cookies[i].split('=');
            var cName = cookie[0].replace(/^\s+|\s+$/g, ''); // trim side spaces
            if (cName == name) {
                return (1 < cookie.length) ? cookie[1].replace(/^\s+|\s+$/g, '') : ''; // trim side spaces
            }
        }
        return null;
    }

    function _deleteCookie(name, path, domain) {
        if (_getCookie(name)) {
            document.cookie = name + "=" +
                ((path) ? "; path=" + path : "") +
                ((domain) ? "; domain=" + domain : "") +
                "; expires=Thu, 01-Jan-1970 00:00:01 GMT";
        }
    }

    var session = null;

    function _net_call(url, data, method /*='post'*/, contentType /*='application/json'*/) {
        return $.Deferred(function(dfr){
            function _getOrigin() {
                var loc = document.location;
                return loc.href.substring(0, loc.href.length - loc.pathname.length);
            }

            var sParam = (/\?/.test(url) ? '&' : '?') + SESSION_COOKIE+'='+session;
            $.ajax({
                url: url + (session ? sParam : ''),
                type: method || 'post',
                contentType: contentType || 'application/json',
                processData: false,
                data: $.toJSON(data),
                dataType: 'json',
                headers: {'X-Origin': _getOrigin()},
                xhrFields: {withCredentials: true}
            }).done(function(data, status, xhr){
                rho.notify.byEvent(rho.EVENTS.GENERIC_NOTIFICATION, status, data, xhr);
                dfr.resolve(status, data, xhr);
            }).fail(function(xhr, status, error){
                rho.notify.byEvent(rho.EVENTS.GENERIC_NOTIFICATION, status, error, xhr);
                dfr.reject(status, error, xhr);
            });
        }).promise();
    }

    function login(login, password) {
        return $.Deferred(function(dfr){
            _net_call(rho.config.syncServer+'/clientlogin',
                {login:login, password:password, rememberme: 1}).done(function(status, data, xhr){
                if (data) {
                    session = data[SESSION_COOKIE] || null;
                }
                dfr.resolve(data, status, xhr);
            }).fail(function(error, status, xhr){
                dfr.reject(error, status, xhr);
            });
        }).promise();
    }

    function isLoggedIn() {
        return session ? true : false;
    }

    function logout() {
        session = null;
    }

    var clientCreate = function() {
        return _net_call(rho.config.syncServer+'/clientcreate', "", "get", "text/plain");
    };

    var clientReset = function(id) {
        // Request: GET /application/clientreset?client_id=7771137f497b4a8789e62da321117f50
        return _net_call(rho.config.syncServer+'/clientreset', {client_id: id}, "get", "text/plain");
    };

    function serverQuery(srcName, clientId, pageSize, token) {
/*
        var params = $.extend({
            version: 3,
            client_id: clientId,
            p_size: pageSize
        }, srcName ? {source_name: srcName}:{}, token ? {token: token}:{});
*/
        var url = "?version=3" +"&client_id=" +clientId +"&p_size=" +pageSize;
        url += srcName ? ("&source_name=" +srcName) : "";
        url += token ? ("&token=" +token) : "";
        return _net_call(rho.config.syncServer+url, '', 'get', 'text/plain');
    }

    function postData(data) {
        return _net_call(rho.config.syncServer+'', data);
    }

    $.extend(rho, {protocol: publicInterface()});

})(jQuery);
(function($) {

    function publicInterface() {
        return {
            SyncObject: SyncObject,
            Model: Model
        };
    }

    var rho = RhoConnect.rho;

    function SyncObject(defn) {
        this.id = null;
        this.fields = defn.fields;
        this.values = {};

        var isNew = true;
        this.__defineGetter__('isNew', function() {
            return isNew;
        });

        var isChanged = false;
        this.__defineGetter__('isChanged', function() {
            return isChanged;
        });

        var _setValue =  function(name, v) {
            this.values[name] = v;
            isChanged = true;
            // db write goes here
        };

        this.addField = function(name, type) {
            this.__defineGetter__(name, function() {
                return this.values[name];
            });
            this.__defineSetter__(name, function(v) {
                _setValue(name, v);
            });
        };

        this.deleteField = function(name) {
            this.__defineGetter__(name, undefined);
            this.__defineSetter__(name, undefined);
            delete this.fields[name];
            delete this.values[name];
        };

        this.clearNotifications = function () {};
        this.destroy = function() {};

        this.updateAttributes = function(attribs) {

            this.save();
        };

        this.save = function() {
            // do save in db
            isNew = false;
            isChanged = false;
        };

    }

    function Model(defn) {

        this.source = new rho.engine.Source(defn.sourceId, defn.name, 'incremental', rho.storage, rho.engine, this);

        this.__defineGetter__('name', function() {
            return this.source.name;
        });
        this.__defineSetter__('name', function(v) {
            this.source.name = v;
        });

        this.belongsTo = defn.belongsTo;

        // Rhom API methods
        this.deleteAll = function(conditions) {};
        this.find = function(args) {};
        this.findAll = function(args) {};
        this.findBySql = function(query) {};

        this.newObject = function(attribs) {
            return new SyncObject(attribs);
        };

        this.createObject = function(attribs) {
            var obj = this.newObject(attribs);
            obj.save();
            return obj;
        };

        this.paginate = function(args) {};
        this.sync = function(callback, cbData, showStatusPopup) {};
        this.setNotification = function(url, params) {};
        this.save = function() {};
        this.canModify = function() {};
    }

    $.extend(rho, {domain: publicInterface()});

})(jQuery);
(function($) {

    function publicInterface() {
        return {
        // AttrManager
        attrManager: attrManager,
        // Client
        listClientsId: listClientsId,
        loadClient: loadClient,
        loadAllClients: loadAllClients,
        storeClient: storeClient,
        insertClient: insertClient,
        deleteClient: deleteClient,
        // Client
        listSourcesId: listSourcesId,
        loadSource: loadSource,
        loadAllSources: loadAllSources,
        storeSource: storeSource,
        insertSource: insertSource,
        deleteSource: deleteSource,
        // low-level
        init: _init,
        open: _open,
        tx: _tx,
        roTx: _roTx,
        rwTx: _rwTx,
        executeSql: _executeSql,
        executeBatchSql: _executeBatchSql,
        initSchema: _initSchema,
        getAllTableNames: _getAllTableNames
        };
    }

    var rho = RhoConnect.rho;

    var initDbSchemaSQL = ''
        +'DROP TABLE IF EXISTS client_info;'
        +'CREATE TABLE client_info ('
                +' "client_id" VARCHAR(255) default NULL,'
                +' "session" VARCHAR(255) default NULL,'
                +' "token" VARCHAR(255) default NULL,'
                +' "token_sent" BIGINT default 0,'
                +' "reset" BIGINT default 0,'
                +' "port" VARCHAR(10) default NULL,'
                +' "last_sync_success" VARCHAR(100) default NULL);'
        +'DROP TABLE IF EXISTS object_values;'
        +'CREATE TABLE object_values ('
                +' "source_id" BIGINT default NULL,'
                +' "attrib" varchar(255) default NULL,'
                +' "object" varchar(255) default NULL,'
                +' "value" varchar default NULL);'
        +'DROP TABLE IF EXISTS changed_values;'
        +'CREATE TABLE changed_values ('
                +' "source_id" BIGINT default NULL,'
                +' "attrib" varchar(255) default NULL,'
                +' "object" varchar(255) default NULL,'
                +' "value" varchar default NULL,'
                +' "attrib_type" varchar(255) default NULL,'
                +' "update_type" varchar(255) default NULL,'
                +' "sent" BIGINT default 0);'
        +'DROP TABLE IF EXISTS sources;'
        +'CREATE TABLE sources ('
                +' "source_id" BIGINT PRIMARY KEY,'
                +' "name" VARCHAR(255) default NULL,'
                +' "token" BIGINT default NULL,'
                +' "sync_priority" BIGINT,'
                +' "partition" VARCHAR(255),'
                +' "sync_type" VARCHAR(255),'
                +' "metadata" varchar default NULL,'
                +' "last_updated" BIGINT default 0,'
                +' "last_inserted_size" BIGINT default 0,'
                +' "last_deleted_size" BIGINT default 0,'
                +' "last_sync_duration" BIGINT default 0,'
                +' "last_sync_success" BIGINT default 0,'
                +' "backend_refresh_time" BIGINT default 0,'
                +' "source_attribs" varchar default NULL,'
                +' "schema" varchar default NULL,'
                +' "schema_version" varchar default NULL,'
                +' "associations" varchar default NULL,'
                +' "blob_attribs" varchar default NULL);'
        +'DROP INDEX IF EXISTS by_src_id;'
        +'CREATE INDEX by_src_id on object_values ("source_id");'
        +'DROP INDEX IF EXISTS by_src_object;'
        +'CREATE UNIQUE INDEX by_src_object ON object_values ("object", "attrib", "source_id");'
        +'DROP INDEX IF EXISTS by_src_value;'
        +'CREATE INDEX by_src_value ON object_values ("attrib", "source_id", "value");'
        ;

    // low-level functions ========================

    var _dbMap = {};

    function _open(name, version, comment, size) {
        function _getDb(name, version) {
            if (!_dbMap[name]) {
                _dbMap[name] = {};
            }
            if (!_dbMap[name][version]) {
                _dbMap[name][version] = null;
            }
            return _dbMap[name][version];
        }
        function _setDb(name, version, db) {
            if (!_dbMap[name]) {
                _dbMap[name] = {};
            }
            _dbMap[name][version] = db;
            return db;
        }

        return $.Deferred(function(dfr){
            var nm = name || rho.config.database.name;
            var vn = version || rho.config.database.version;
            var ct = comment || rho.config.database.comment;
            var sz = size || rho.config.database.size;

            var db = _getDb(nm, vn);

            if (db) {
                dfr.resolve(db);
                return;
            }
            try {
                db = _setDb(nm, vn, openDatabase(nm, vn, ct, sz));
                dfr.resolve(db);
            } catch(ex) {
                dfr.reject(ex);
            }
        }).promise();
    }

    function _tx(readWrite, optionalDb) {
        var readyDfr = $._Deferred();
        var dfr = $.Deferred();
        function resolveTx(db) {
            // Some old browsers have incomplete WebSQL support where db.readTransaction hasn't implemented yet
            // http://stackoverflow.com/questions/3809229/html5-readtransaction-not-supported-on-ipad-ios-3-2
            var txFn = ("function" == typeof db.readTransaction) ? db.readTransaction : db.transaction;
            // select proper type of transaction
            if (readWrite && readWrite != "read-only") {
                txFn = db.transaction;
            }
            // run it
            try {
                txFn.apply(db, [function(tx){
                    readyDfr.resolve(db, tx);
                }, function (err) {
                    dfr.reject(db, err);
                }, function(){
                    dfr.resolve(db, "ok");
                }]);
            } catch(ex) {
                dfr.reject(db, ex.message);
            }
        }
        if (optionalDb) {
             resolveTx(optionalDb);
        } else {
            _open().done(function(db){
               resolveTx(db);
            }).fail(function(ex){
                dfr.reject(null, ex);
            });
        }
        dfr.promise();
        dfr.ready = readyDfr.done;
        return dfr;
    }

    function _roTx(optionalDb) {
        return _tx(false, optionalDb);
    }

    function _rwTx(optionalDb) {
        return _tx("read-write", optionalDb);
    }

    function _executeSql(sql, values, optionalTx) {
        return $.Deferred(function(dfr){
            function execInTx(tx, sql, values) {
                tx.executeSql(sql, values, function(tx, rs){
                    dfr.resolve(tx, rs);
                }, function(tx, err){
                    dfr.reject(tx, err);
                });
            }
            if (optionalTx) {
                execInTx(optionalTx, sql, values);
            } else {
                // ok, going to use new tx from default database
                var readWrite = !sql.match(/^\s*select\s+/i);
                _tx(readWrite).ready(function(db, tx){
                    execInTx(tx, sql, values);
                }).done(function(obj, status){
                    dfr.resolve(obj, status);
                }).fail(function(obj, err){
                    dfr.reject(obj, err);
                });
            }
        }).promise();
    }

    function _executeBatchSql(sql, optionalTx)
    {
        var statements = sql.replace(/^\s+|;\s*$/, '').split(";");

        var dfrs = [];
        var dfrIdx = 0;

        // Deferred object for wrapping db/tx
        var dfr = $.Deferred();
        dfrs.push(dfr);
        dfrIdx++;

        // Accumulate deferred objects for aggregate
        // resolving, one per each statement
        $.each(statements, function(idx, val){
            dfrs.push($.Deferred());
        });

        function execBatchInTx(tx, sqlArray) {
            var dfr = dfrs[dfrIdx];
            if (0 < sqlArray.length) {
                var sql = sqlArray.shift();
                // execute current statement
                _executeSql(sql, null, tx).done(function(tx, rs){
                    // so far, so good
                    dfr.resolve(tx, rs, sql);
                    // execute next statement recursively
                    dfrIdx++;
                    execBatchInTx(tx, sqlArray);
                }).fail(function(tx, err){
                    dfr.reject(tx, err);
                });
            }
        }

        if(optionalTx) {
            execBatchInTx(optionalTx, statements);
        } else {
            _tx("read-write" /*anything evaluated as true*/).ready(function(db, tx){
                execBatchInTx(tx, statements);
            }).done(function(obj, status){
                dfr.resolve(obj, status);
            }).fail(function(obj, err){
                dfr.reject(obj, err);
            });
        }

        var promises = [];
        $.each(dfrs, function(idx, dfr){
            promises.push(dfr.promise());
        });

        return $.when.apply(this, promises);
    }

    function _initSchema()
    {
        return _executeBatchSql(initDbSchemaSQL);
    }

    function _getAllTableNames(optionalTx)
    {
        return $.Deferred(function(dfr){
            _executeSql("SELECT name FROM sqlite_master WHERE type='table'",
                    null, optionalTx).done(function(tx, rs){
                var tableNames = [];
                for(var i=0; i<rs.rows.length; i++) {
                    tableNames.push(rs.rows.item(i)['name']);
                }
                dfr.resolve(tx, tableNames);
            }).fail(function(obj, err){
                dfr.reject(obj, err);
            });
        }).promise();
    }

    function _init(doReset) {
        return $.Deferred(function(dfr){
            _getAllTableNames().done(function(tx, names){
                if ((4/*explicitly defined tables*/ +1/*implicit system table*/) != names.length
                        || doReset) {
                    _initSchema().done(function(){
                        dfr.resolve(null, "db schema initialized");
                    }).fail(function(obj, err){
                        dfr.reject(obj, "db schema initialization error: " +err);
                    });
                }
                dfr.resolve(null, "db schema is ok");
            }).fail(function(obj, err){
                dfr.reject(obj, "db tables read error: " +err);
            });
        }).promise();
    }

    // Client-related ========================

    function listClientsId(optionalTx) {
        return $.Deferred(function(dfr){
            _executeSql('SELECT client_id FROM client_info', null, optionalTx).done(function(tx, rs) {
                var ids = [];
                for(var i=0; i<rs.rows.length; i++) {
                    ids.push(rs.rows.item(i)['client_id']);
                }
                dfr.resolve(tx, ids);
            }).fail(function(obj, err) {
                dfr.reject(obj, err);
            });
        }).promise();
    }

    function loadClient(id, optionalTx) {
        return $.Deferred(function(dfr){
            _executeSql('SELECT * FROM client_info WHERE client_id = ?', [id],
                    optionalTx).done(function(tx, rs) {
                if (0 == rs.rows.length) {
                    dfr.reject(id, 'Not found');
                } else {
                    var client = new rho.engine.Client(id);
                    client.session           = rs.rows.item(0)['session'];
                    client.token             = rs.rows.item(0)['token'];
                    client.token_sent        = rs.rows.item(0)['token_sent'];
                    client.reset             = rs.rows.item(0)['reset'];
                    client.port              = rs.rows.item(0)['port'];
                    client.last_sync_success = rs.rows.item(0)['last_sync_success'];
                    dfr.resolve(tx, client);
                }
            }).fail(function(obj, err) {
                dfr.reject(obj, err);
            });
        }).promise();
    }

    function loadAllClients(optionalTx) {
        return $.Deferred(function(dfr){
            _executeSql('SELECT * FROM client_info', null, optionalTx).done(function(tx, rs) {
                var clients = [];
                for(var i=0; i<rs.rows.length; i++) {
                    var client = new rho.engine.Client(rs.rows.item(i)['client_id']);
                    client.session           = rs.rows.item(i)['session'];
                    client.token             = rs.rows.item(i)['token'];
                    client.token_sent        = rs.rows.item(i)['token_sent'];
                    client.reset             = rs.rows.item(i)['reset'];
                    client.port              = rs.rows.item(i)['port'];
                    client.last_sync_success = rs.rows.item(i)['last_sync_success'];
                    clients.push(client);
                }
                dfr.resolve(tx, clients);
            }).fail(function(obj, err) {
                dfr.reject(obj, err);
            });
        }).promise();
    }

    function storeClient(client, optionalTx, isNew) {
        var updateQuery = 'UPDATE client_info SET'
            +' session = ?,'
            +' token = ?,'
            +' token_sent = ?,'
            +' reset = ?,'
            +' port = ?,'
            +' last_sync_success = ?'
            +' WHERE client_id = ?';
        var insertQuery = 'INSERT INTO client_info ('
            +' session,'
            +' token,'
            +' token_sent,'
            +' reset,'
            +' port,'
            +' last_sync_success,'
            +' client_id'
            +' ) VALUES (?, ?, ?, ?, ?, ?, ?)';
        return $.Deferred(function(dfr){
            _executeSql(isNew ? insertQuery : updateQuery, [
                client.session,
                client.token,
                client.token_sent,
                client.reset,
                client.port,
                client.last_sync_success,
                client.id], optionalTx).done(function(tx, rs) {
                dfr.resolve(tx, client);
            }).fail(function(obj, err) {
                dfr.reject(obj, err);
            });
        }).promise();
    }

    function insertClient(client, optionalTx) {
        return storeClient(client, optionalTx, true);
    }

    function deleteClient(clientOrId, optionalTx) {
        var id = ("object" == typeof clientOrId) ? clientOrId.id : clientOrId;
        return $.Deferred(function(dfr){
            _executeSql('DELETE FROM client_info WHERE client_id = ?', [id], optionalTx).done(function(tx, rs) {
                    dfr.resolve(tx, null);
            }).fail(function(obj, err) {
                dfr.reject(obj, err);
            });
        }).promise();
    }

    // Source-related ========================

    function listSourcesId(optionalTx) {
        return $.Deferred(function(dfr){
            _executeSql('SELECT source_id FROM sources', null, optionalTx).done(function(tx, rs) {
                var ids = [];
                for(var i=0; i<rs.rows.length; i++) {
                    ids.push(rs.rows.item(i)['source_id']);
                }
                dfr.resolve(tx, ids);
            }).fail(function(obj, err) {
                dfr.reject(obj, err);
            });
        }).promise();
    }

    function loadSource(id, optionalTx) {
        return $.Deferred(function(dfr){
            _executeSql('SELECT * FROM sources WHERE source_id = ?', [id],
                    optionalTx).done(function(tx, rs) {
                if (0 == rs.rows.length) {
                    dfr.reject(id, 'Not found');
                } else {
                    var source = new rho.engine.Source(
                            rs.rows.item(0)['source_id'],
                            rs.rows.item(0)['name'],
                            rs.rows.item(0)['sync_type'],
                            rho.storage,
                            rho.engine
                            );
                    source.token                = rs.rows.item(0)['token'];
                    source.sync_priority        = rs.rows.item(0)['sync_priority'];
                    source.partition            = rs.rows.item(0)['partition'];
                    source.sync_type            = rs.rows.item(0)['sync_type'];
                    source.metadata             = rs.rows.item(0)['metadata'];
                    source.last_updated         = rs.rows.item(0)['last_updated'];
                    source.last_inserted_size   = rs.rows.item(0)['last_inserted_size'];
                    source.last_deleted_size    = rs.rows.item(0)['last_deleted_size'];
                    source.last_sync_duration   = rs.rows.item(0)['last_sync_duration'];
                    source.last_sync_success    = rs.rows.item(0)['last_sync_success'];
                    source.backend_refresh_time = rs.rows.item(0)['backend_refresh_time'];
                    source.source_attribs       = rs.rows.item(0)['source_attribs'];
                    source.schema               = rs.rows.item(0)['schema'];
                    source.schema_version       = rs.rows.item(0)['schema_version'];
                    source.associations         = rs.rows.item(0)['associations'];
                    source.blob_attribs         = rs.rows.item(0)['blob_attribs'];
                    source.parseAssociations();
                    dfr.resolve(tx, source);
                }
            }).fail(function(obj, err) {
                dfr.reject(obj, err);
            });
        }).promise();
    }

    function loadAllSources(optionalTx) {
        return $.Deferred(function(dfr){
            _executeSql('SELECT * FROM sources ORDER BY sync_priority', null, optionalTx).done(function(tx, rs) {
                var sources = [];
                for(var i=0; i<rs.rows.length; i++) {
                    var source = new rho.engine.Source(
                            rs.rows.item(i)['source_id'],
                            rs.rows.item(i)['name'],
                            rs.rows.item(i)['sync_type'],
                            rho.storage,
                            rho.engine
                            );
                    source.token                = rs.rows.item(i)['token'];
                    source.sync_priority        = rs.rows.item(i)['sync_priority'];
                    source.partition            = rs.rows.item(i)['partition'];
                    source.sync_type            = rs.rows.item(i)['sync_type'];
                    source.metadata             = rs.rows.item(i)['metadata'];
                    source.last_updated         = rs.rows.item(i)['last_updated'];
                    source.last_inserted_size   = rs.rows.item(i)['last_inserted_size'];
                    source.last_deleted_size    = rs.rows.item(i)['last_deleted_size'];
                    source.last_sync_duration   = rs.rows.item(i)['last_sync_duration'];
                    source.last_sync_success    = rs.rows.item(i)['last_sync_success'];
                    source.backend_refresh_time = rs.rows.item(i)['backend_refresh_time'];
                    source.source_attribs       = rs.rows.item(i)['source_attribs'];
                    source.schema               = rs.rows.item(i)['schema'];
                    source.schema_version       = rs.rows.item(i)['schema_version'];
                    source.associations         = rs.rows.item(i)['associations'];
                    source.blob_attribs         = rs.rows.item(i)['blob_attribs'];
                    source.parseAssociations();
                    sources.push(source);
                }
                dfr.resolve(tx, sources);
            }).fail(function(obj, err) {
                dfr.reject(obj, err);
            });
        }).promise();
    }

    function storeSource(source, optionalTx, isNew) {
        var updateQuery = 'UPDATE sources SET'
            +' name = ?,'
            +' token = ?,'
            +' sync_priority = ?,'
            +' partition = ?,'
            +' sync_type = ?,'
            +' metadata = ?,'
            +' last_updated = ?,'
            +' last_inserted_size = ?,'
            +' last_deleted_size = ?,'
            +' last_sync_duration = ?,'
            +' last_sync_success = ?,'
            +' backend_refresh_time = ?,'
            +' source_attribs = ?,'
            +' schema = ?,'
            +' schema_version = ?,'
            +' associations = ?,'
            +' blob_attribs = ?'
            +' WHERE source_id = ?';
        var insertQuery = 'INSERT INTO sources ('
            +' name,'
            +' token,'
            +' sync_priority,'
            +' partition,'
            +' sync_type,'
            +' metadata,'
            +' last_updated,'
            +' last_inserted_size,'
            +' last_deleted_size,'
            +' last_sync_duration,'
            +' last_sync_success,'
            +' backend_refresh_time,'
            +' source_attribs,'
            +' schema,'
            +' schema_version,'
            +' associations,'
            +' blob_attribs,'
            +' source_id'
            +' ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        return $.Deferred(function(dfr){
            _executeSql(isNew ? insertQuery : updateQuery, [
                source.name,
                source.token,
                source.sync_priority,
                source.partition,
                source.sync_type,
                source.metadata,
                source.last_updated,
                source.last_inserted_size,
                source.last_deleted_size,
                source.last_sync_duration,
                source.last_sync_success,
                source.backend_refresh_time,
                source.source_attribs,
                source.schema,
                source.schema_version,
                source.associations,
                source.blob_attribs,
                source.id], optionalTx).done(function(tx, rs) {
                dfr.resolve(tx, source);
            }).fail(function(obj, err) {
                dfr.reject(obj, err);
            });
        }).promise();
    }

    function insertSource(source, optionalTx) {
        return storeSource(source, optionalTx, true);
    }

    function deleteSource(sourceOrId, optionalTx) {
        var id = ("object" == typeof sourceOrId) ? sourceOrId.id : sourceOrId;
        return $.Deferred(function(dfr){
            _executeSql('DELETE FROM sources WHERE source_id = ?', [id], optionalTx).done(function(tx, rs) {
                    dfr.resolve(tx, null);
            }).fail(function(obj, err) {
                dfr.reject(obj, err);
            });
        }).promise();
    }

    var attrManager = new AttrManager();

    function AttrManager() {
        this.blobAttrs = {};
        this.srcNames = {};

        this.initAttrManager = function() {
            return this.loadAttrs();
        };

        this.isBlobAttr = function(nSrcID, szAttr) {
            var mapAttr = this.blobAttrs[nSrcID];
            return mapAttr ? (szAttr in mapAttr) : false;
        };

        this.loadAttrs = function() {
            var that = this;
            return $.Deferred(function(dfr){

                that.blobAttrs = {};
                var strSql = "SELECT source_id,";
                strSql += "blob_attribs" + ",name from sources";

                rho.storage.executeSql(strSql).done(function(tx, rs){
                    for (var i=0; i<rs.rows.length; i++) {

                        var nSrcID = rs.rows.item(0)['source_id'];
                        var strAttribs = rs.rows.item(0)['blob_attribs'];
                        if (!strAttribs) return;

                        var mapAttr = new {};
                        var strAttr = "";

                        $.each(strAttribs.split(','), function(idx, tok){
                            if (!tok) return;
                            if (strAttr) {
                                mapAttr[strAttr] = +tok;
                                strAttr = "";
                            } else {
                                strAttr = tok;
                            }
                        });

                        that.blobAttrs[nSrcID] = mapAttr;
                        if ( that.srcNames != null )
                            that.srcNames[rs.rows.item(i)['name'].toUpperCase()] = nSrcID;
                    }
                    dfr.resolve();
                }).fail(function(obj, err){
                    dfr.reject(obj, err);
                });
            }).promise();
        }
    }

    $.extend(rho, {storage: publicInterface()});

})(jQuery);
(function($) {

    function publicInterface() {
        return {
            // classes
            Client: Client,
            Source: Source,
            // fields
            STATES: STATES,
            getSession: function() {return session},
            restoreSession: restoreSession,
            getSources: function() {return sources},
            getSourcesArray: function() {return sourcesArray},
            maxConfigSrcId: 1,
            // methods
            login: login,
            logout: logout,
            getState: getState,
            setState: setState,
            isSearch: isInSearch,
            doSyncAllSources: doSyncAllSources,
            stopSync: stopSync,
            getNotify: getNotify,
            getSyncPageSize:  function() {return syncPageSize},
            getClientId:  function() {return clientId},
            getStartSourceId: getStartSourceId,
            findSourceBy: findSourceBy,
            getSourceOptions: getSourceOptions,
            isNoThreadedMode: isNoThreadedMode,
            isSessionExist: isSessionExist,
            isContinueSync: isContinueSync,
            setSchemaChanged: function(value) {schemaChanged = value},
            isSchemaChanged: isSchemaChanged,
            isStoppedByUser: function() {return isStoppedByUser}
        };
    }

    var rho = RhoConnect.rho;

    var STATES = {
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
            var strValue = this.getProperty(nSrcID, szPropName);
            return (strValue == "1" || strValue == "true");
        }
    }

    var notify = null;
    function getNotify() {
        notify = notify || new rho.notify.SyncNotify(rho.engine);
        return notify;
    }

    var syncState = STATES.none;
    var isSearch = false;
    var errCode = rho.ERRORS.ERR_NONE;
    var error = "";
    var serverError = "";
    var schemaChanged = false;
    var session = null;
    var clientId = null;
    var syncPageSize = 2000;


    var LOG = new rho.Logger('SyncEngine');

    function isInSearch() {
        return isSearch;
    }

    function isSchemaChanged() {
        return schemaChanged;
    }

    function restoreSession() {
        return $.Deferred(function(dfr){
            session = "";
            rho.storage.executeSql("SELECT session FROM client_info").done(function(tx, rs){
                for (var i=0; i<rs.rows.length; i++) {
                    var s = rs.rows.item(i)['session'];
                    if (s) {
                        session = s;
                        break;
                    }
                }
                //rho.protocol.setSession(session);
                dfr.resolve();
            }).fail(_rejectOnDbAccessEror(dfr));
        }).promise();
    }

    function logout() {
        return $.Deferred(function(dfr){
            _cancelRequests();
            rho.storage.executeSql("UPDATE client_info SET session = NULL").done(function(){
                session = "";
                rho.protocol.logout();
                dfr.resolve();
            }).fail(_rejectOnDbAccessEror(dfr));
            //loadAllSources();
        }).promise();
    }

    function login(login, password, oNotify) {
        return $.Deferred(function(dfr){
            isStoppedByUser = false;
            
            rho.protocol.login(login, password).done(function(){
                session = /*rho.protocol.getSession()*/ login;

                rho.config.database.name = rho.config.database.namePrefix + login;
                if(!session) {
                    LOG.error("Server responds with empty session cookie.");
                }

                rho.storage.init(/*false - don't reset any data by default*/).done(function(){
                    if(!session) {
                        LOG.error("DB doesn't contains this session.");
                        var errCode = rho.ERRORS.ERR_UNEXPECTEDSERVERRESPONSE;
                        getNotify().callLoginCallback(oNotify, errCode, "" );
                        dfr.reject(errCode, "");
                        return;
                    }

                    if (isStoppedByUser) {
                        dfr.reject(rho.ERRORS.ERR_CANCELBYUSER, "Stopped by user");
                        return;
                    }

                    _updateClientSession(/*rho.protocol.getSession()*/ login).done(function(client){
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
                        getNotify().callLoginCallback(oNotify, rho.ERRORS.ERR_NONE, "" );

                        dfr.resolve();
                    }).fail(_rejectPassThrough(dfr));
                }).fail(_rejectPassThrough(dfr));

            }).fail(function(status, error, xhr){
                var errCode = rho.protocol.getErrCodeFromXHR(xhr);
                if (_isTimeout(error)) {
                    errCode = rho.ERRORS.ERR_NOSERVERRESPONSE;
                }
                if (errCode != rho.ERRORS.ERR_NONE) {
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
                    }).fail(_rejectOnDbAccessEror(dfr));
                } else {
                    var client = new Client(null);
                    client.session = session;
                    rho.storage.insertClient(client).done(function(tx, client){
                        dfr.resolve(client);
                    }).fail(_rejectOnDbAccessEror(dfr));
                }
            }).fail(_rejectOnDbAccessEror(dfr));
        }).promise();
    }

    function _updateClientId(id) {
        return $.Deferred(function(dfr){
            // obtain client id from the server
            rho.storage.loadAllClients().done(function(tx, clients){
                if (0 < clients.length) {
                    rho.storage.executeSql("UPDATE client_info SET client_id=?", [id]).done(function(tx, rs){
                        dfr.resolve(id);
                    }).fail(_rejectOnDbAccessEror(dfr));
                } else {
                    var client = new Client(null);
                    client.id = id;
                    rho.storage.insertClient(client).done(function(tx, client){
                        dfr.resolve(id);
                    }).fail(_rejectOnDbAccessEror(dfr));
                }
            }).fail(_rejectOnDbAccessEror(dfr));
        }).promise();
    }

    function _createClient() {
        return $.Deferred(function(dfr){
            // obtain client id from the server
            rho.protocol.clientCreate().done(function(status, data){
                if (data && data.client && data.client.client_id){
                    // persist new client
                    _updateClientId(data.client.client_id).done(function(id){
                        dfr.resolve(id);
                    }).fail(_rejectPassThrough(dfr));
                } else {
                    dfr.reject(rho.ERRORS.ERR_UNEXPECTEDSERVERRESPONSE, data);
                }
            }).fail(function(status, error){
                var errCode = _isTimeout(error) ? rho.ERRORS.ERR_NOSERVERRESPONSE : rho.ERRORS.ERR_NETWORK;
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
                    dfr.reject(rho.ERRORS.ERR_UNEXPECTEDSERVERRESPONSE, data);
                }
            }).fail(function(status, error){
                var errCode = _isTimeout(error) ? rho.ERRORS.ERR_NOSERVERRESPONSE : rho.ERRORS.ERR_NETWORK;
                dfr.reject(errCode, error);
            });

        }).promise();
    }

    function _isTimeout(msg) {
        return (msg && msg.match(/time(d)?\s+out/i));
    }

    function doSyncAllSources() {
        return $.Deferred(function(dfr){

            prepareSync(STATES.syncAllSources, null).done(function(){
                if (isContinueSync()) {
                    syncAllSources().done(function(){
                        _finally();
                        _localAfterIsContinueSync();
                    }).fail(function(errCode, errMsg){
                        _finally();
                        rho.notify.byEvent(rho.EVENTS.ERROR, "Sync failed", errMsg);
                        dfr.reject(errCode, errMsg);
                    });
                } else {_localAfterIsContinueSync();}

                function _finally(){
                    if (getState() != STATES.exit) {
                        setState(STATES.none);
                    }
                }

                function _localAfterIsContinueSync() {
                    getNotify().cleanCreateObjectErrors();
                    dfr.resolve();
                }
            }).fail(function(errCode, errMsg){
                dfr.reject(errCode, errMsg);
            });
        }).promise();
    }

    function prepareSync(eState, oSrcID) {
        return $.Deferred(function(dfr){
            setState(eState);
            isSearch =  (eState == STATES.search);
            isStoppedByUser = false;
            errCode = rho.ERRORS.ERR_NONE;
            error = "";
            serverError = "";
            schemaChanged = false;

            loadAllSources().done(function(){
                loadSession().done(function(s){
                    session = s;
                    if (isSessionExist()) {
                        loadClientID().done(function(clnId){
                            clientId = clnId;
                            if (errCode == rho.ERRORS.ERR_NONE) {
                                getNotify().cleanLastSyncObjectCount();
                                //doBulkSync();
                                dfr.resolve();
                                return;
                            }
                            _localFireErrorNotification();
                            stopSync();
                            dfr.reject(errCode, error);
                        }).fail(_rejectPassThrough(dfr));
                    }else {
                        errCode = rho.ERRORS.ERR_CLIENTISNOTLOGGEDIN;
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

                }).fail(_rejectPassThrough(dfr));
            }).fail(_rejectPassThrough(dfr));
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
                var s = null;
                for (var i=0; i<clients.length; i++) {
                    if (clients[i].session) {
                        s = clients[i].session;
                        break;
                    }
                }
                dfr.resolve(s);
            }).fail(_rejectOnDbAccessEror(dfr));

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
                    _createClient().done(function(id){
                        dfr.resolve(id);
                    }).fail(_rejectPassThrough(dfr));
                } else if (resetClient) {
                    _resetClient(clnId).done(function(clientId){
                        client.reset = 0;
                        rho.storage.storeClient(client).done(function(){
                            dfr.resolve(clientId);
                        }).fail(function(obj, err){
                            stopSync();
                            _rejectOnDbAccessEror(dfr)(obj, err);
                        });
                    }).fail(function(errCode, error){
                        stopSync();
                        dfr.reject(errCode, error);
                    });
                } else {
                    dfr.resolve(clnId);
                }
            }).fail(_rejectOnDbAccessEror(dfr));
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
                $.each(srcs, function(idx, src){
                    if (src.sync_type == 'none') return;
                    src.storage = rho.storage;
                    src.engine = rho.engine;
                    sources[src.name] = src;
                });
                checkSourceAssociations();
                dfr.resolve();
            }).fail(_rejectOnDbAccessEror(dfr));
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

        
        for(var nCurSrc = srcArray.length-1; nCurSrc > 0;) {
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

            var dfrMap = rho.deferredMapOn($.extend({}, srcMap, {'rhoStartSyncSource': 'noMatterValue_itUseJustKeys'}));

            var syncErrors = [];

            var startSrcIndex = getStartSourceIndex();
            var startSrc = (0 <= startSrcIndex ? sourcesArray[startSrcIndex] : null);
            if (0 <= startSrcIndex) {
                syncOneSource(startSrcIndex).done(function(){
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

            $.each(sourcesArray, function(i, src){
                syncOneSource(i).done(function(){
                    dfrMap.resolve(src.name, ["ok"]);
                }).fail(function(errCode, error){
                    isError = true;
                    syncErrors.push({source: src.name, errCode: errCode, error: error});
                    // We shouldn't stop the whole sync process on current source error,
                    // so resolve it instead of reject. Error is handled later.
                    dfrMap.resolve(src.name, ["error", errCode, error]);
                });
            });

            dfrMap.when().done(function(){
                if (!isError && !isSchemaChanged()) {
                    // TODO: to implement RhoAppAdapter.getMessageText("sync_completed")
                    getNotify().fireSyncNotification(null, true, rho.ERRORS.ERR_NONE, "sync_completed");
                    dfr.resolve(rho.ERRORS.NONE, "Sync completed");
                } else {
                    dfr.reject('Error for source"' +syncErrors[0].source +'": ' +(syncErrors[0].error||syncErrors[0].errCode));
                }
            }).fail(function(){
                // it shouldn't happen, because we resolving on errors
                LOG.error('Implementation error in SyncEngine.syncAllSources: some source has been rejected!');
                dfr.reject(syncErrors);
            });
        }).promise();
    }

    function getStartSourceIndex() {
        for(var i=0; i<sourcesArray.length; i++) {
            if (!sourcesArray[i].isEmptyToken()) return i;
        }
        return -1;
    }

    function syncOneSource(index) {
        return $.Deferred(function(dfr){
            var source = sourcesArray[index];
            
            if ( source.sync_type == "bulk_sync_only") {
                dfr.resolve(null); //TODO: do resolve it as a source?
            } else if (isSessionExist() && getState() != STATES.stop ) {
                source.sync().done(function(){
                    dfr.resolve(source);
                }).fail(function(obj, error){
                    if (source.errCode == rho.ERRORS.ERR_NONE) {
                        source.errCode = rho.ERRORS.ERR_RUNTIME;
                    }
                    setState(STATES.stop);
                    dfr.reject(rho.ERRORS.ERR_RUNTIME, "sync is stopped: " +error);
                }).then(_finally, _finally);
                function _finally() {
                    getNotify().onSyncSourceEnd(index, sourcesArray);
                }
            } else {
                dfr.reject(rho.ERRORS.ERR_RUNTIME, "sync is stopped");
            }
        }).promise();
    }

    function getState() { return syncState; }
    function setState(state) {
        syncState = state;
    }
    
    function isContinueSync() {
        var st = getState();
        return st != STATES.exit && st != STATES.stop;
    }

    function isSyncing() {
        var st = getState();
        return st == STATES.syncAllSources || st == STATES.syncSource;
    }

    function stopSync() {
        if (isContinueSync()) {
            setState(STATES.stop);
            _cancelRequests();
        }
    }

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
            setState(STATES.exit);
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
        this.errCode = rho.ERRORS.ERR_NONE;
        this.error = '';
        this.serverError = '';

        this.totalCount = 0;
        this.curPageCount = 0;
        this.serverObjectsCount = 0;

        this.insertedCount = 0;
        this.deletedCount = 0;

        this.getAtLeastOnePage = false;
        this.refreshTime = 0;

        this.multipartItems = [];
        this.blobAttrs = [];
        this.schemaSource = false;

        this.progressStep = -1;

        function SourceAssociation(strSrcName, strAttrib) {
            this.m_strSrcName = strSrcName;
            this.m_strAttrib = strAttrib;
        }

        this.isEmptyToken = function() {
            return this.token == 0;
        };

        this.setToken = function(token) {
            this.token = token;
            this.isTokenFromDb = false;
        };

        this.processToken = function(token) {
            var that = this;
            return $.Deferred(function(dfr){
                if ( token > 1 && that.token == token ){
                    //Delete non-confirmed records

                    that.setToken(token); //For m_bTokenFromDB = false;
                    //getDB().executeSQL("DELETE FROM object_values where source_id=? and token=?", getID(), token );
                    //TODO: add special table for id,token
                    dfr.resolve();
                }else
                {
                    that.setToken(token);
                    rho.storage.executeSql("UPDATE sources SET token=? where source_id=?", [+that.token, that.id]).done(function(){
                        dfr.resolve();
                    }).fail(_rejectOnDbAccessEror(dfr));
                }
            }).promise();
        };

        this.parseAssociations = function(strAssociations) {
            var that = this;
            if (!strAssociations) return;

            var srcName = "";
            $.each(strAssociations.split(','), function(idx, attrName){
                if (srcName) {
                    that.arAssociations.push(new SourceAssociation(srcName, attrName) );
                    srcName = "";
                } else {
                    srcName = attrName;
                }
            });
        };

        this.syncServerChanges = function() {
            var that = this;
            return $.Deferred(function(dfr){
                LOG.info("Sync server changes source ID :" + that.id);

                _localAsyncWhile();
                function _localAsyncWhile() {
                    that.curPageCount =0;

                    var strUrl = rho.protocol.getServerQueryUrl("");
                    var clnId = that.engine.getClientId();
                    var pgSize = that.engine.getSyncPageSize();
                    var tkn = (!that.isTokenFromDb && that.token>1) ? that.token:null;
                    LOG.info( "Pull changes from server. Url: " + (strUrl+_localGetQuery(that.name, clnId, pgSize, tkn)));

                    rho.protocol.serverQuery(that.name, clnId, pgSize, tkn
                            /*, that.engine*/).done(function(status, data, xhr){

                        //var testResp = that.engine.getSourceOptions().getProperty(that.id, "rho_server_response");
                        //data = testResp ? $.parseJSON(testResp) : data;

                        that.processServerResponse_ver3(data).done(function(){

                            if (that.engine.getSourceOptions().getBoolProperty(that.id, "pass_through")) {
                                that.processToken(0).done(function(){
                                    _localNextIfContinued();
                                }).fail(function(errCode, err) {
                                    _rejectPassThrough(dfr)(errCode, err);
                                });
                            } else {_localNextIfContinued();}

                            function _localNextIfContinued() {
                                if (that.token && that.engine.isContinueSync()) {
                                    // go next in async while loop
                                    _localAsyncWhile()
                                } else {
                                    _localWhileExit();
                                }
                            }

                        }).fail(function(errCode, err) {
                            _rejectPassThrough(dfr)(errCode, err);
                        });
                    }).fail(function(status, error, xhr){
                        that.engine.stopSync();
                        that.errCode = rho.protocol.getErrCodeFromXHR(xhr);
                        that.error = error;
                        dfr.reject(errCode, error);
                        //_localWhileExit(); //TODO: am I sure?
                    });
                }
                var _whileEnded = false;
                function _localWhileExit() {
                    if (!_whileEnded) {
                        _whileEnded = true;
                        if (that.engine.isSchemaChanged()) {
                            that.engine.stopSync();
                        }
                        dfr.resolve();
                    }
                }

                function _localGetQuery(srcName, clnId, pgSize, token) {
                    var strQuery = "?client_id=" + clnId +
                        "&p_size=" + pgSize + "&version=3";
                    strQuery += srcName ? ("&source_name=" + srcName) : '';
                    return strQuery += token ? ("&token=" + token) : '';
                }
            }).promise();
        };

        this.processServerResponse_ver3 = function(data) {
            var that = this;
            return $.Deferred(function(dfr){
                var itemIndex = 0;
                var item = null;
                
                item = data[itemIndex];
                if (undefined != item.version){
                    itemIndex++;
                    if (item.version != rho.protocol.getVersion()) {
                        LOG.error("Sync server send data with incompatible version. Client version: " +rho.protocol.getVersion()
                            +"; Server response version: " +item.version +". Source name: " +that.name);
                        that.engine.stopSync();
                        that.errrCode = rho.ERRORS.ERR_UNEXPECTEDSERVERRESPONSE;
                        dfr.reject(that.errCode, "Sync server send data with incompatible version.");
                        return;
                    }
                }

                item = data[itemIndex];
                if (undefined != item.token){
                    itemIndex++;
                    that.processToken(+item.token).done(function(){
                        _localAfterProcessToken();
                    }).fail(function(errCode, error){
                        dfr.reject(that.errCode, error);
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
                        that.curPageCount = (+item.count);
                    }
                    item = data[itemIndex];
                    if (undefined != item['refresh_time']) {
                        itemIndex++;
                        that.refreshTime = (+item['refresh_time']);
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
                        that.totalCount = (+item['total_count']);
                    }
                    //if ( getServerObjectsCount() == 0 )
                    //    that.getNotify().fireSyncNotification(this, false, RhoAppAdapter.ERR_NONE, "");

                    if (that.token == 0) {
                        //oo conflicts
                        rho.storage.executeSql("DELETE FROM changed_values where source_id=? and sent>=3", [that.id]).done(function(){
                            _localAfterTokenIsZero();
                        }).fail(_rejectOnDbAccessEror(dfr));
                        //
                    } else {_localAfterTokenIsZero();}

                    function _localAfterTokenIsZero(){
                        LOG.info("Got " + that.curPageCount + "(Processed: " +  that.serverObjectsCount
                                + ") records of " + that.totalCount + " from server. Source: " + that.name
                                + ". Version: " + item.version );

                        if (that.engine.isContinueSync()) {
                            item = data[itemIndex];
                            itemIndex++;

                            var oCmds = item;

                            if (undefined != oCmds['schema-changed']) {
                                that.engine.setSchemaChanged(true);
                                _localAfterProcessServerErrors();
                            } else if (!that.processServerErrors(oCmds)) {
                                rho.storage.rwTx().ready(function(db, tx){
                                    if (that.engine.getSourceOptions().getBoolProperty(that.id, "pass_through")) {
                                        if (that.schemaSource) {
                                            //rho.storage.executeSql( "DELETE FROM " + that.name );
                                        } else {
                                            rho.storage.executeSql( "DELETE FROM object_values WHERE source_id=?", [that.id], tx).done(function(tx, rs){
                                                _localAfterDeleteObjectValues();
                                            }).fail(_rejectOnDbAccessEror(dfr));
                                        }
                                    } else {_localAfterDeleteObjectValues();}

                                    function _localAfterDeleteObjectValues() {
                                        if (undefined != oCmds["metadata"] && that.engine.isContinueSync() ) {
                                            var strMetadata = oCmds["metadata"];
                                            rho.storage.executeSql("UPDATE sources SET metadata=? WHERE source_id=?", [strMetadata, that.id], tx).done(function(){
                                                _localAfterSourcesUpdate();
                                            }).fail(_rejectOnDbAccessEror(dfr));
                                        } else {_localAfterSourcesUpdate();}

                                        function _localAfterSourcesUpdate(){
                                            if (undefined != oCmds["links"] && that.engine.isContinueSync() ) {
                                                that.processSyncCommand("links", oCmds["links"], true, tx);
                                            }
                                            if (undefined != oCmds["delete"] && that.engine.isContinueSync() ) {
                                                that.processSyncCommand("delete", oCmds["delete"], true, tx);
                                            }
                                            if (undefined != oCmds["insert"] && that.engine.isContinueSync() ) {
                                                that.processSyncCommand("insert", oCmds["insert"], true, tx);
                                            }

                                            that.getNotify().fireObjectsNotification();
                                            _localAfterProcessServerErrors();
                                        }
                                    }
                                }).done(function(db, status){
                                    dfr.resolve();
                                }).fail(function(obj,err){
                                    _rejectOnDbAccessEror(dfr)(obj,err);
                                });
                            } else {_localAfterProcessServerErrors();}

                            function _localAfterProcessServerErrors() {
                                _localAfterIfContinueSync();
                            }
                        } else {_localAfterIfContinueSync();}

                        function _localAfterIfContinueSync(){
                            if (that.curPageCount > 0) {
                                that.getNotify().fireSyncNotification(this, false, rho.ERRORS.ERR_NONE, "");
                            }
                            dfr.resolve(); //TODO: do we need dfr.reject() on errors happen? reporting at least?
                        }
                    }
                }
            }).promise();
        };

        this.processSyncCommand = function(strCmd, oCmdEntry, bCheckUIRequest, tx) {
            var that = this;
            return $.Deferred(function(dfr){

                var dfrMap = rho.deferredMapOn(oCmdEntry);
                $.each(oCmdEntry, function(strObject, attrs){
                    if (!that.engine.isContinueSync()) return;

                    if (that.schemaSource) {
                        //that.processServerCmd_Ver3_Schema(strCmd,strObject,attrIter);
                    } else {
                        $.each(attrs, function(strAttrib, strValue){
                            if (!that.engine.isContinueSync()) return;

                            that.processServerCmd_Ver3(strCmd,strObject,strAttrib,strValue, tx).done(function(){
                                _localAfterIfSchemaSource();
                            }).fail(function(errCode, error){
                                LOG.error("Sync of server changes failed for " + that.name + "; \object: " + strObject, error);
                                dfrMap.reject(strObject, [errCode, error]);
                            });

                        });

                    } /* else {_localAfterIfSchemaSource()}*/

                    function _localAfterIfSchemaSource() {
                        dfrMap.resolve(strObject, [tx]);

                        if (that.sync_type == "none") {
                            return;
                        }

                        if (bCheckUIRequest) {
                            var nSyncObjectCount  = that.getNotify().incLastSyncObjectCount(that.id);
                            if ( that.progressStep > 0 && (nSyncObjectCount % that.progressStep == 0) ) {
                                that.getNotify().fireSyncNotification(this, false, rho.ERRORS.ERR_NONE, "");
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
                dfrMap.when().done(function(){
                    dfr.resolve(tx);
                }).fail(_rejectPassThrough(dfr));

            }).promise();
        };

        function CAttrValue(strAttrib, strValue) {
            this.m_strAttrib = strAttrib;
            this.m_strValue = strValue;
            this.m_strBlobSuffix = "";

            if ("string" == typeof this.m_strAttrib && this.m_strAttrib.match(/\-rhoblob$/)) {
                this.m_strBlobSuffix = "-rhoblob";
                this.m_strAttrib = this.m_strAttrib.substring(0, this.m_strAttrib.length-this.m_strBlobSuffix.length);
            }
        }

        this.processServerCmd_Ver3 = function(strCmd, strObject, strAttrib, strValue, tx) {
            var that = this;
            return $.Deferred(function(dfr){

                var oAttrValue = new CAttrValue(strAttrib,strValue);

                if (strCmd == "insert") {

                    //if ( !processBlob(strCmd,strObject,oAttrValue) )
                    //    return;

                    rho.storage.executeSql("SELECT source_id FROM object_values "+
                            "WHERE object=? and attrib=? and source_id=? LIMIT 1 OFFSET 0",
                            [strObject, oAttrValue.m_strAttrib, that.id], tx).done(function(tx, rs){
                        if (0 == rs.rows.length) {
                            rho.storage.executeSql("INSERT INTO object_values "+
                                    "(attrib, source_id, object, value) VALUES(?,?,?,?)",
                                    [oAttrValue.m_strAttrib, that.id, strObject, oAttrValue.m_strValue], tx).done(function(tx, rs){

                                _localAfterInserOrUpdate();
                            }).fail(_rejectOnDbAccessEror(dfr));

                        } else {
                            
                            rho.storage.executeSql("UPDATE object_values " +
                                "SET value=? WHERE object=? and attrib=? and source_id=?",
                                 [oAttrValue.m_strValue, strObject, oAttrValue.m_strAttrib, that.id], tx).done(function(tx, rs){

                                if (that.sync_type != "none") {
                                    // oo conflicts
                                    rho.storage.executeSql("UPDATE changed_values SET sent=4 where object=? "+
                                            "and attrib=? and source_id=? and sent>1",
                                            [strObject, oAttrValue.m_strAttrib, that.id], tx).done(function(tx, rs){
                                        _localAfterSyncTypeNone();
                                    }).fail(_rejectOnDbAccessEror(dfr));
                                    //
                                } else {_localAfterSyncTypeNone();}

                                function _localAfterSyncTypeNone() {
                                    _localAfterInserOrUpdate();
                                }
                            }).fail(_rejectOnDbAccessEror(dfr));

                        }
                    }).fail(_rejectOnDbAccessEror(dfr));

                    function _localAfterInserOrUpdate() {
                        if (that.sync_type != "none") {
                            that.getNotify().onObjectChanged(that.id, strObject, rho.notify.ACTIONS.update);
                        }
                        that.insertedCount++;
                        dfr.resolve(tx);
                    }

                } else if (strCmd == "delete") {

                    rho.storage.executeSql("DELETE FROM object_values where object=? and attrib=? and source_id=?",
                            [strObject, oAttrValue.m_strAttrib, that.id], tx).done(function(tx, rs){

                        if (that.sync_type != "none") {
                            that.getNotify().onObjectChanged(that.id, strObject, rho.notify.ACTIONS['delete']);
                            // oo conflicts
                            rho.storage.executeSql("UPDATE changed_values SET sent=3 where object=? "+
                                    "and attrib=? and source_id=?",
                                    [strObject, oAttrValue.m_strAttrib, that.id], tx).done(function(tx, rs){
                                _localAfterSyncTypeNone();
                            }).fail(_rejectOnDbAccessEror(dfr));
                            //
                        } else {_localAfterSyncTypeNone();}

                        function _localAfterSyncTypeNone() {
                            that.deletedCount++;
                            dfr.resolve(tx);
                        }
                    }).fail(_rejectOnDbAccessEror(dfr));

                } else if (strCmd == "links") {

                    that.processAssociations(strObject, oAttrValue.m_strValue, tx).done(function(tx){
                        rho.storage.executeSql("UPDATE object_values SET object=? where object=? and source_id=?",
                                [oAttrValue.m_strValue, strObject, that.id], tx).done(function(){
                            rho.storage.executeSql("UPDATE changed_values SET object=?,sent=3 where object=? "+
                                    "and source_id=?",
                                    [oAttrValue.m_strValue, strObject, that.id], tx).done(function(){
                                that.getNotify().onObjectChanged(that.id, strObject, rho.notify.ACTIONS.create);
                                dfr.resolve(tx);
                            }).fail(_rejectOnDbAccessEror(dfr));
                        }).fail(_rejectOnDbAccessEror(dfr));
                    }).fail(_rejectPassThrough(dfr));
                }
            }).promise();
        };

        this.processAssociations = function(strOldObject, strNewObject, tx) {
            var that = this;
            return $.Deferred(function(dfr){
                if (that.associations.length == 0) {
                    dfr.resolve();
                    return;
                }

                var dfrMap = rho.deferredMapOn(that.associations);
                //TODO: do we need recursion (via .done()) here?
                for (var i=0; i < that.associations.length; i++) {
                    var pSrc = engine.findSourceBy('name', (/*(SourceAssociation)*/that.associations[i]).m_strSrcName);
                    if (pSrc) {
                        pSrc.updateAssociation(strOldObject, strNewObject,
                                (/*(SourceAssociation)*/that.associations[i]).m_strAttrib, tx).done(function(){
                            dfrMap.resolve(i, []);
                        }).fail(function(errCode, err){
                            dfrMap.reject(i, [errCode, err]);
                        });
                    }
                }
                dfrMap.when().done(function(){
                    dfr.resolve(tx);
                }).fail(_rejectPassThrough(dfr));
            }).promise();
        };

        this.updateAssociation = function (strOldObject, strNewObject, strAttrib, tx) {
            var that = this;
            return $.Deferred(function(dfr){
                if (that.schemaSource) {
                    //var strSqlUpdate = "UPDATE ";
                    //strSqlUpdate += that.name + " SET " + strAttrib + "=? where " + strAttrib + "=?";
                    //
                    //rho.storage.executeSql(strSqlUpdate, [strNewObject, strOldObject], tx).done(function(){
                    //    _localAfterIfSchemaSource();
                    //}).fail(_rejectOnDbAccessEror(dfr));

                    _localAfterIfSchemaSource(); // because real logic is commented out above
                } else {
                    rho.storage.executeSql("UPDATE object_values SET value=? where attrib=? and source_id=? and value=?",
                        [strNewObject, strAttrib, that.id, strOldObject], tx).done(function(){
                        _localAfterIfSchemaSource();
                    }).fail(_rejectOnDbAccessEror(dfr));
                } /* else {_localAfterIfSchemaSource();}*/

                function _localAfterIfSchemaSource() {
                    rho.storage.executeSql("UPDATE changed_values SET value=? "+
                            "where attrib=? and source_id=? and value=?",
                            [strNewObject, strAttrib, that.id, strOldObject], tx).done(function(){
                        dfr.resolve(tx);
                    }).fail(_rejectOnDbAccessEror(dfr));
                }
            }).promise();
        };

        this.processServerErrors = function(oCmds) {
            var that = this;
            var errorsFound = false;

            $.each(oCmds, function(errType, errObj){
                if (errType.match(/^(source|search)-error$/i)) {
                    _localSetSourceErrors(errType);
                } else if (errType.match(/-error$/i)) {
                    _localSetObjectErrors(errType);
                }
            });

            function _localSetSourceErrors(errType) {
                errorsFound = true;
                that.ErrCode =rho.ERRORS.ERR_CUSTOMSYNCSERVER;

                $.each(oCmds[errType], function(errSubtype, errObj){
                    that.serverError += that.serverError ? '&' : '';
                    that.serverError += "server_errors[" + encodeURI(errSubtype) + "][message]=" + encodeURI(errObj["message"]);
                });
            }

            function _localSetObjectErrors(errType) {
                errorsFound = true;
                that.ErrCode =rho.ERRORS.ERR_CUSTOMSYNCSERVER;

                $.each(oCmds[errType], function(objId, err){
                    if (objId.match(/-error$/i)) {
                        // it is object error message
                        objId = objId.substring(0, objId.length-'-error'.length);
                        that.serverError += that.serverError ? '&' : '';
                        that.serverError += "server_errors[" + encodeURI(errType) + "][" + encodeURI(objId) + "][message]=" + encodeURI(err["message"]);
                    } else {
                        // it is object error attribs
                        $.each(err, function(attrName, attrValue){
                            that.serverError += that.serverError ? '&' : '';
                            that.serverError += "server_errors[" + encodeURI(errType) + "][" + encodeURI(objId) + "][attributes][" + encodeURI(attrName) + "]=" + encodeURI(attrValue);
                        });
                    }
                });
            }
            return errorsFound;
        };

        this.syncClientChanges = function() {
            var that = this;
            return $.Deferred(function(dfr){

                var bSyncedServer = false;

                that.isPendingClientChanges().done(function(found){
                    if (found) {
                        LOG.info( "Client has unconfirmed created items. Call server to update them." );
                        that.syncServerChanges().done(function(){
                            bSyncedServer = true;
                            _localAfterIfClientHaveUnconfirmedItems();
                        }).fail(_rejectPassThrough(dfr));
                    } else {_localAfterIfClientHaveUnconfirmedItems();}
                }).fail(_rejectOnDbAccessEror(dfr));

                function _localAfterIfClientHaveUnconfirmedItems() {

                    that.isPendingClientChanges().done(function(found){
                        if (bSyncedServer && found) {
                            LOG.info( "Server does not sent created items. Stop sync." );
                            that.engine.setState(STATES.stop);
                            _localAfterIfServerSentCreatedItems();
                        } else {
                            rho.storage.executeSql("SELECT object FROM changed_values "+
                                    "WHERE source_id=? LIMIT 1 OFFSET 0", [that.id]).done(function(tx, rs){
                                var bSyncClient = false;
                                // TODO: to investigate later
                                // some interference between webkit debugger and rs.rows happens here,
                                // so extra checks were added to eliminate the problem.
                                bSyncClient = (rs.rows && rs.rows.length && 0 < rs.rows.length);
                                //bSyncClient = (0 < rs.rows.length);

                                if (bSyncClient) {
                                    that.doSyncClientChanges().done(function(){

                                        bSyncedServer = false;
                                        _localAfterIfSyncClient();
                                    }).fail(_rejectPassThrough(dfr));
                                } else {_localAfterIfSyncClient();}

                                function _localAfterIfSyncClient() {
                                    _localAfterIfServerSentCreatedItems();
                                }
                            }).fail(_rejectOnDbAccessEror(dfr));
                        } /* else {_localAfterIfServerSentCreatedItems();}*/
                    }).fail(_rejectOnDbAccessEror(dfr));

                    function _localAfterIfServerSentCreatedItems() {
                        // just a stub
                        //dfr.resolve(false /*it means: no, server changes hasn't been synchronized*/);
                        dfr.resolve(bSyncedServer);
                    }
                }
            }).promise();
        };

        this.isPendingClientChanges = function() {
            var that = this;
            return $.Deferred(function(dfr){
                rho.storage.executeSql("SELECT object FROM changed_values "+
                        "WHERE source_id=? and update_type='create' and sent>1  LIMIT 1 OFFSET 0",
                        [that.id]).done(function(tx, rs){
                    // TODO: to investigate later
                    // some interference between webkit debugger and rs.rows happens here,
                    // so extra checks were added to eliminate the problem.
                    dfr.resolve(rs.rows && rs.rows.length && 0 < rs.rows.length);
                    //dfr.resolve(0 < rs.rows.length);
                }).fail(function(obj, err){
                    dfr.reject(obj, err);
                });
            }).promise();
        };

        this.doSyncClientChanges = function() {
            var that = this;
            return $.Deferred(function(dfr){

                var arUpdateTypes = ["create", "update", "delete"];
                var arUpdateSent = {};

                that.multipartItems = [];
                that.blobAttrs = [];

                var bSend = false;

                var body = {
                    source_name: that.name,
                    client_id: that.engine.getClientId()
                };

                var dfrMap = rho.deferredMapOn(arUpdateTypes);
                $.each(arUpdateTypes, function(idx, updateType){
                    if (that.engine.isContinueSync()) {
                        arUpdateSent[updateType] = true;
                        bSend = true;
                        that.makePushBody_Ver3(updateType, true).done(function(part){
                            body[updateType] = part;
                            dfrMap.resolve(idx, []);
                        }).fail(function(obj, err){
                            dfrMap.reject(idx, [obj, err]);
                        });
                    } else {
                        dfrMap.resolve(idx, []);
                    }
                });
                dfrMap.when().done(function(){
                    _localAfterBodyUpdatePartsPrepared();
                }).fail(_rejectPassThrough(dfr));


                function _localAfterBodyUpdatePartsPrepared() {
                    /*
                    var blobPart = {blob_fields: []};
                    $.each(that.blobAttrs, function(idx, id){
                        blobPart.blob_fields.push(id);
                    });
                    body = $.extend(body, blobPart);
                    */

                    if (bSend) {
                        LOG.info( "Push client changes to server. Source: " + that.name);
                        LOG.trace("Push body: " + $.toJSON(body));

                        if (that.multipartItems.length > 0) {
                            /*
                            MultipartItem oItem = new MultipartItem();
                            oItem.m_strBody = strBody;
                            //oItem.m_strContentType = getProtocol().getContentType();
                            oItem.m_strName = "cud";
                            m_arMultipartItems.addElement(oItem);

                            NetResponse resp = getNet().pushMultipartData( getProtocol().getClientChangesUrl(), m_arMultipartItems, getSync(), null );
                            if ( !resp.isOK() )
                            {
                                getSync().setState(SyncEngine.esStop);
                                m_nErrCode = RhoAppAdapter.ERR_REMOTESERVER;
                                m_strError = resp.getCharData();
                            }
                            */
                            _localAfterIfMultipartItems();
                        } else {
                            rho.protocol.postData(body).done(function(status, data, xhr){
                                _localAfterIfMultipartItems();
                            }).fail(function(status, error, xhr){
                                that.engine.setState(rho.states.stop);
                                that.errCode = rho.protocol.getErrCodeFromXHR(xhr);
                                that.errCode = _isTimeout(error) ? rho.ERRORS.ERR_NOSERVERRESPONSE : that.errCode;
                                that.error = error;
                                dfr.reject(that.errCode, that.error);
                            });
                        } /* else {_localAfterIfMultipartItems();}*/
                    } else {_localAfterIfMultipartItems();}

                    function _localAfterIfMultipartItems() {
                        var dfrMap = rho.deferredMapOn(arUpdateSent);

                        $.each(arUpdateSent, function(updateType, isDone){
                            if (that.engine.isContinueSync() && isDone /*isDone is always true, no false values there*/) {
                                //oo conflicts
                                if (updateType == 'create') {
                                    that.storage.executeSql("UPDATE changed_values SET sent=2 "+
                                            "WHERE source_id=? and update_type=? and sent=1",
                                            [that.id, updateType]).done(function(){
                                        dfrMap.resolve(updateType, []);
                                    }).fail(function(obj, err){
                                        dfrMap.reject(updateType, [rho.ERRORS.ERR_RUNTIME, "db access error: " +err]);
                                    });
                                } else {
                                //
                                    that.storage.executeSql("DELETE FROM changed_values "+
                                            "WHERE source_id=? and update_type=? and sent=1",
                                            [that.id, updateType]).done(function(){
                                        dfrMap.resolve(updateType, []);
                                    }).fail(function(obj, err){
                                        dfrMap.reject(updateType, [rho.ERRORS.ERR_RUNTIME, "db access error: " +err]);
                                    });
                                }
                            } else {
                                dfrMap.resolve(updateType, []);
                            }
                        });

                        dfrMap.when().done(function(){
                            that.multipartItems = [];
                            that.blobAttrs = [];
                            dfr.resolve();
                        }).fail(_rejectPassThrough(dfr));
                    }
                }

            }).promise();
        };

        this.makePushBody_Ver3 = function(strUpdateType, isSync) {
            var that = this;
            return $.Deferred(function(dfr){
                var bodyPart = {};

                //getDB().Lock(); //TODO: ?!
                if (isSync) {
                    _updateAllAttribChanges().done(function(){
                        _localAfterChangesUpdated();
                    }).fail(_rejectOnDbAccessEror(dfr));
                } else {_localAfterChangesUpdated();}

                function _localAfterChangesUpdated() {
                    rho.storage.executeSql("SELECT attrib, object, value, attrib_type "+
                        "FROM changed_values where source_id=? and update_type =? and sent<=1 ORDER BY object",
                            [that.id, strUpdateType]).done(function(tx, rs){
                        _localSelectedChangedValues(tx, rs);
                    }).fail(_rejectOnDbAccessEror(dfr));

                    function _localSelectedChangedValues(tx, rs) {
                        // TODO: to investigate later
                        // some interference between webkit debugger and rs.rows happens here,
                        // so extra checks were added to eliminate the problem.
                        //if (0 == rs.rows.length) {
                        if (rs.rows && rs.rows.length && 0 == rs.rows.length) {
                            //getDB().Unlock(); //TODO: ?!
                            dfr.resolve(bodyPart);
                            return;
                        }
                        for(var i=0; i<rs.rows.length; i++) {
                            var strAttrib = rs.rows.item(i)['attrib'];
                            var strObject = rs.rows.item(i)['object'];
                            var value = rs.rows.item(i)['value'];
                            var attribType = rs.rows.item(i)['update_type'];

                            if (attribType == "blob.file") {
                                //MultipartItem oItem = new MultipartItem();
                                //oItem.m_strFilePath = RhodesApp.getInstance().resolveDBFilesPath(value);
                                //oItem.m_strContentType = "application/octet-stream";
                                //oItem.m_strName = strAttrib + "-" + strObject;
                                //
                                //m_arBlobAttrs.addElement(strAttrib);
                                //m_arMultipartItems.addElement(oItem);
                            }
                            if (!bodyPart[strObject]) bodyPart[strObject] = {};
                            bodyPart[strObject][strAttrib] = value;
                        }
                        if (isSync) {
                            rho.storage.executeSql("UPDATE changed_values SET sent=1 "+
                                    "WHERE source_id=? and update_type=? and sent=0",
                                    [that.id, strUpdateType]).done(function(){
                                dfr.resolve(bodyPart);
                            }).fail(_rejectOnDbAccessEror(dfr));
                        }
                        //getDB().Unlock(); //TOOD: ?!
                    }
                }
            }).promise();
        };

        function _updateAllAttribChanges() {
            var that = this;
            return $.Deferred(function(dfr){
                //Check for attrib = object
                rho.storage.rwTx().ready(function(db, tx){
                    rho.storage.executeSql("SELECT object, source_id, update_type " +
                        "FROM changed_values where attrib = 'object' and sent=0", [], tx).done(function(tx, rsChanges){

                        if (0 == rsChanges.rows.length)  return; //TODO: dfr.resolve() ?!
                        _localChangedValuesSelectedInTx(tx, rsChanges);

                    })/*.fail(_rejectOnDbAccessEror(dfr))*/;
                }).done(function(){
                    dfr.resolve();
                }).fail(function(obj,err){
                    _rejectOnDbAccessEror(dfr)(obj,err);
                });

                function _localChangedValuesSelectedInTx(tx, rsChanges) {
                    var arObj = [];
                    var arUpdateType = [];
                    var arSrcID = [];

                    for (var i=0; i<rsChanges.rows.length; i++) {
                        arObj.push(rsChanges.rows.item(i)['object']);
                        arSrcID.push(rsChanges.rows.item(i)['source_id']);
                        arUpdateType.push(rsChanges.rows.item(i)['update_type']);
                    }

                    var dfrMap = rho.deferredMapOn(arObj);
                    $.each(arObj, function(objIdx, obj) {
                        rho.storage.executeSql("SELECT name, schema FROM sources " +
                                "WHERE source_id=?", [arSrcID[objIdx]], tx).done(function(tx, resSrc){

                            var isSchemaSrc = false;
                            var strTableName = "object_values";
                            if (resSrc.rows.length > 0) {
                                isSchemaSrc = (resSrc.rows.item(0)['schema']);
                                if (isSchemaSrc)
                                    strTableName = resSrc.rows.item(0)['name'];
                            }

                            if (isSchemaSrc) {
                                /*
                                IDBResult res2 = executeSQL( "SELECT * FROM " + strTableName + " where object=?", arObj.elementAt(i) );
                                for( int j = 0; j < res2.getColCount(); j ++)
                                {
                                    String strAttrib = res2.getColName(j);
                                    String value = res2.getStringByIdx(j);
                                    String attribType = getAttrMgr().isBlobAttr((Integer)arSrcID.elementAt(i), strAttrib) ? "blob.file" : "";

                                    executeSQLReportNonUnique("INSERT INTO changed_values (source_id,object,attrib,value,update_type,attrib_type,sent) VALUES(?,?,?,?,?,?,?)",
                                            arSrcID.elementAt(i), arObj.elementAt(i), strAttrib, value, arUpdateType.elementAt(i), attribType, new Integer(0) );
                                }
                                */
                                dfrMap.resolve(objIdx, []);
                            } else {
                                rho.storage.executeSql("SELECT attrib, value FROM " + strTableName +
                                        " where object=? and source_id=?",
                                         [obj, arSrcID[objIdx]], tx).done(function(tx, rsAttribs){
                                    _localSelectedAttribs(tx, rsAttribs);
                                }).fail(_rejectOnDbAccessEror(dfr));

                                function _localSelectedAttribs(tx, rsAttribs) {
                                    for (var attrIdx=0; attrIdx<rsAttribs.rows.length; attrIdx++) {
                                        var strAttrib = rsAttribs.rows.item(attrIdx)['attrib'];
                                        var value = rsAttribs.rows.item(attrIdx)['value'];

                                        var attribType = rho.storage.attrManager.isBlobAttr(arSrcID[objIdx], strAttrib) ? "blob.file" : "";

                                        rho.storage.executeSql("INSERT INTO changed_values (source_id,object,attrib,value,update_type,attrib_type,sent) VALUES(?,?,?,?,?,?,?)",
                                            [arSrcID[objIdx], obj, strAttrib, value, arUpdateType[objIdx], attribType, 0], tx).done(function(){
                                        }).fail(_rejectOnDbAccessEror(dfr));
                                    }
                                    dfrMap.resolve(objIdx, []);
                                }
                            }
                        }).fail(function(obj, err){
                            dfrMap.reject(objIdx, [obj, err]);
                        });
                    });

                    dfrMap.when().done(function(){
                        rho.storage.executeSql("DELETE FROM changed_values WHERE attrib=?", ['object'], tx);
                    }).fail(_rejectOnDbAccessEror(dfr));
                }
            }).promise();
        }

        this.sync = function(){
            var that = this;
            return $.Deferred(function(dfr){
                //TODO: to implement RhoAppAdapter.getMessageText("syncronizing")
                that.getNotify().reportSyncStatus("syncronizing" + that.name + "...", that.errCode, that.error);

                var startTime = Date.now();

                if (that.isTokenFromDb && that.token > 1) {
                    that.syncServerChanges().done(function(){
                        _finally();
                        dfr.resolve();
                    }).fail(_catch);
                } else {
                    if (that.isEmptyToken()) {
                        that.processToken(1).done(function(){
                            _localSyncClient();
                        }).fail(_catch);
                    } else {_localSyncClient();}

                    function _localSyncClient() {
                        that.syncClientChanges().done(function(serverSyncDone){
                            if (!serverSyncDone) that.syncServerChanges().done(function(){
                                _finally();
                                dfr.resolve();
                            }).fail(_catch);
                        }).fail(_catch);
                    }
                }
                function _catch(errCode, error) {
                    that.engine.stopSync();
                    _finally();
                    dfr.reject(errCode, error);
                }
                function _finally() {
                    var endTime = Date.now();

                    rho.storage.executeSql(
                            "UPDATE sources set last_updated=?,last_inserted_size=?,last_deleted_size=?, "
                            +"last_sync_duration=?,last_sync_success=?, backend_refresh_time=? WHERE source_id=?",
                            [(endTime/1000), that.getInsertedCount(), that.getDeletedCount(),
                              endTime - startTime,
                              (that.getAtLeastOnePage ? 1 : 0), that.refreshTime, that.id] );
                }
            }).promise();
        };

        this.getNotify = function() {
            return this.engine.getNotify();
        };

        this.getInsertedCount = function() {
            return this.insertedCount;
        };

        this.getDeletedCount = function() {
            return this.deletedCount;
        }

    }

    function _rejectOnDbAccessEror(deferred) {
        return function(obj, error){
            var err = error;
            //if ('object' == typeof error && undefined != error['message']) {
            //    err = error.message;
            //}
            deferred.reject(rho.ERRORS.ERR_RUNTIME, "db access error: " +err);
        };
    }

    function _rejectPassThrough(deferred){
        return function(errCode, err){
            deferred.reject(errCode, err);
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
(function($) {

    function publicInterface() {
        return {
            ACTIONS: ACTIONS,
            SyncNotify: SyncNotify,
            SyncNotification: SyncNotification,
            byEvent: notifyByEvent
        };
    }

    var rho = RhoConnect.rho;

    var ACTIONS = {
        'none': 0,
        'delete': 1,
        'update': 2,
        'create': 3
    };

    function SyncNotification(params, removeAfterFire){
        this.params = params || '';
        this.removeAfterFire = removeAfterFire || false;
        this.toString = function() {
            return "SyncNotification({removeAfterFire: " +this.removeAfterFire +"})";
        }
    }

    function SyncNotify(engine) {

        var LOG = new rho.Logger('SyncNotify');

        var srcIDAndObject = {};
        var singleObjectSrcName = '';
        var singleObjectID = '';
        var hashCreateObjectErrors = {};
        var searchNotification = null;
        var syncNotifications = {};
        var allNotification = null;
        var emptyNotify = SyncNotification();
        var /*ISyncStatusListener*/ syncStatusListener = null;
        var enableReporting = false;
        var enableReportingGlobal = true;
        var strNotifyBody = "";
        var hashSrcObjectCount = {};


        function addObjectNotify(source, objectId) {
            if ("string" == typeof source) { // if source by name
                singleObjectSrcName = source;
                singleObjectID = objectId.match(/^\{/) ? objectId.substring(1, objectId.length-2) : objectId ;
            } else { // else it is source by id or by reference
                var srcId = ("number" == typeof source) ? source : /*then it is an object*/ source.id;
                if (srcId) {
                    var hashObject = srcIDAndObject[srcId];
                    if (hashObject) {
                        hashObject = {};
                        srcIDAndObject[srcId] = hashObject;
                    }
                    hashObject[objectId] = ACTIONS.none;
                }
            }
        }

        function cleanObjectNotifications() {
            singleObjectSrcName = "";
            singleObjectID = "";
            srcIDAndObject = {};
        }

        this.cleanCreateObjectErrors = function() {
            hashCreateObjectErrors = {};
        };

        function processSingleObject() {
            if (!singleObjectSrcName) return;

            var src = engine.getSources()[singleObjectSrcName];
            if (src) {
                addObjectNotify(src,singleObjectID);
            }
            singleObjectSrcName = "";
            singleObjectID = "";
        }

        this.fireObjectsNotification = function() {
            var body = {};
            var strBody = "";

            $.each(srcIDAndObject, function(srcId, hashObject) {
                $.each(hashObject, function(strObject, nNotifyType) {

                    if (nNotifyType == ACTIONS.none) return;

                    if (strBody) {
                        strBody += "&rho_callback=1&";
                    }

                    if (nNotifyType == ACTIONS['delete']) {
                        strBody += "deleted[][object]=" + strObject;
                        strBody += "&deleted[][source_id]=" + srcId;
                    } else if (nNotifyType == ACTIONS.update) {
                        strBody += "updated[][object]=" + strObject;
                        strBody += "&updated[][source_id]=" + srcId;
                    } else if (nNotifyType == ACTIONS.create) {
                        strBody += "created[][object]=" + strObject;
                        strBody += "&created[][source_id]=" + srcId;
                    }

                    hashObject[strObject] = ACTIONS.none;
                });
            });

            if (!strBody) return;
            callNotify(new SyncNotification("", false), strBody);
        };

        this.onObjectChanged = function(srcId, objectId, actionType) {
            processSingleObject();

            var hashObject = srcIDAndObject[srcId];
            if (!hashObject) return;

            if(objectId in hashObject) {
                hashObject[objectId] = actionType;
            }
        };

        function addCreateObjectError(srcId, objectId, error) {
            var hashErrors = hashCreateObjectErrors.get(srcId);
            if ( hashErrors == null ) {
                hashErrors = {};
                hashCreateObjectErrors[srcId] = hashErrors;
            }
            hashErrors[objectId] = error;
        }

        function makeCreateObjectErrorBody(srcId) {
            var hashErrors = hashCreateObjectErrors[srcId];
            if (!hashErrors) return "";

            var strBody = "";
            $.each(srcIDAndObject, function(strObject, strError) {
                strBody += "&create_error[][object]=" + strObject;
                strBody += "&create_error[][error_message]=" + strError;
            });
            return strBody;
        }

         this.onSyncSourceEnd = function(nSrc, sourcesArray) {
            var src = sourcesArray[nSrc];

            if (engine.getState() == engine.STATES.stop && src.errCode != rho.ERRORS.ERR_NONE) {
                var pSN = getSyncNotifyBySrc(src);
                if (pSN != null) {
                    this.fireSyncNotification(src, true, src.errCode, "");
                } else {
                    this.fireAllSyncNotifications(true, src.errCode, src.error, "");
                }
            }
            else {
                this.fireSyncNotification(src, true, src.errCode, "");
            }

            this.cleanCreateObjectErrors();
        };

        function setSearchNotification(params) {
            LOG.info( "Set search notification. Params: " +params );
            searchNotification = new SyncNotification(params, true);
            LOG.info( "Done Set search notification. Params: " +params );
        }

        function setSyncStatusListener(listener) {
                syncStatusListener = listener;
        }

        this.reportSyncStatus = function(status, errCode, details) {
            if (syncStatusListener != null
                    && (isReportingEnabled() || errCode == rho.ERRORS.ERR_SYNCVERSION)) {
                if (errCode == rho.ERRORS.ERR_SYNCVERSION) {
                    status = __getErrorText(errCode);
                } else {
                    details = details || __getErrorText(errCode);
                    status += (details ? __getMessageText("details")+details : "");
                }
                LOG.info("Status: " +status);
                rho.notify.byEvent(rho.EVENTS.STATUS_CHANGED, status, errCode);
            }
        };

/*
        void fireBulkSyncNotification( boolean bFinish, String status, String partition, int nErrCode )
        {
            if ( getSync().getState() == SyncEngine.esExit )
                return;

            if( nErrCode != RhoAppAdapter.ERR_NONE)
            {
                String strMessage = RhoAppAdapter.getMessageText("sync_failed_for") + "bulk.";
                reportSyncStatus(strMessage,nErrCode,"");
            }

            String strParams = "";
            strParams += "partition=" + partition;
            strParams += "&bulk_status="+status;
            strParams += "&sync_type=bulk";

            doFireSyncNotification( null, bFinish, nErrCode, "", strParams, "" );
        }
*/

        this.fireAllSyncNotifications = function(isFinish, errCode, error, serverError ) {
            if (engine.getState() == engine.STATES.exit) return;

            if(errCode != rho.ERRORS.ERR_NONE) {
                if (!engine.isSearch()) {
                    var strMessage = __getMessageText("sync_failed_for") + "all.";
                    this.reportSyncStatus(strMessage,errCode,error);
                }
            }
            var sn = getSyncNotifyBySrc(null);
            if (sn) {
                this.doFireSyncNotification(null, isFinish, errCode, error, "", serverError);
            }
        };

        this.fireSyncNotification = function(src, isFinish, errCode, message ) {
            if (engine.getState() == engine.STATES.exit) return;

            if (message || errCode != rho.ERRORS.ERR_NONE) {
                if (!engine.isSearch()) {
                    if (src != null && !message)
                        message = __getMessageText("sync_failed_for") + src.name + ".";

                    this.reportSyncStatus(message, errCode, src != null ? src.error : "");
                }
            }
            this.doFireSyncNotification(src, isFinish, errCode, "", "", "" );
        };

        function getSyncNotifyBySrc(src) {
            var sn = null; // sync notification
            if (engine.isSearch()) {
                sn = searchNotification;
            } else {
                if (src != null) sn = syncNotifications[src.id];
                if (sn == null) sn = allNotification;
            }
            if (sn == null && !engine.isNoThreadedMode()) return null;
            return sn != null ? sn : emptyNotify;
        }

        this.doFireSyncNotification = function(src, isFinish, errCode, error, params, serverError) {
            if (engine.isStoppedByUser()) return;

            try {
                var pSN = null;

                var strBody = "";
                var bRemoveAfterFire = isFinish;
                {
                    pSN = getSyncNotifyBySrc(src);
                    if (!pSN) return;

                    strBody = "";

                    if (src) {
                        strBody += "total_count=" + src.totalCount;
                        strBody += "&processed_count=" + src.curPageCount;
                        strBody += "&processed_objects_count=" + getLastSyncObjectCount(src.id);
                        strBody += "&cumulative_count=" + src.serverObjectsCount;
                        strBody += "&source_id=" + src.id;
                        strBody += "&source_name=" + src.name;
                    }

                    strBody += (strBody ? "&" : "") +(params || "sync_type=incremental");

                    strBody += "&status=";
                    if (isFinish) {
                        if (errCode == rho.ERRORS.ERR_NONE) {
                            //if (engine.isSchemaChanged()) {
                            //    strBody += "schema_changed";
                            //} else {
                                strBody += (!src && !params) ? "complete" : "ok";
                            //}
                        } else {
                            if (engine.isStoppedByUser()) {
                                errCode = rho.ERRORS.ERR_CANCELBYUSER;
                            }

                            strBody += "error";
                            strBody += "&error_code=" + errCode;

                            if (error) {
                                strBody += "&error_message=" + __urlEncode(error);
                            } else if (src) {
                                strBody += "&error_message=" + __urlEncode(src.error);
                            }

                            if (serverError) {
                                strBody += "&" + serverError;
                            } else if (src && src.serverError) {
                                strBody += "&" + src.serverError;
                            }
                        }

                        if (src) {
                            strBody += makeCreateObjectErrorBody(src.id);
                        }
                    } else {
                        strBody += "in_progress";
                    }

                    strBody += "&rho_callback=1";
                    /*
                    if (pSN.params) {
                        if (!pSN.params.match(/^&/)) {
                            strBody += "&";
                        }
                        strBody += pSN.params;
                    }
                    */

                    bRemoveAfterFire = bRemoveAfterFire && pSN.removeAfterFire;
                }
                if (bRemoveAfterFire) {
                    this.clearNotification(src);
                }
                LOG.info("Fire notification. Source: " +(src ? src.name : "") +"; " +pSN.toString());

                if (callNotify(pSN, strBody)) {
                    this.clearNotification(src);
                }
            } catch(exc) {
                LOG.error("Fire notification failed.", exc);
            }
        };

        function callNotify(oNotify, strBody) {
            if (engine.isNoThreadedMode()) {
                strNotifyBody = strBody;
                return false;
            }

            //TODO: implement real notification here!

            // let's try this as an implementation
            if (oNotify && "function" == typeof oNotify.params) {
                return oNotify.params();
            } else {
                return true;
            }

            //NetResponse resp = getNet().pushData( oNotify.m_strUrl, strBody, null );
            //if ( !resp.isOK() )
            //    LOG.error( "Fire object notification failed. Code: " + resp.getRespCode() + "; Error body: " + resp.getCharData() );
            //else
            //{
            //    String szData = resp.getCharData();
            //    return szData != null && szData.equals("stop");
            //}

        }

        this.setNotification = function(src, notification) {
            if (!src) return;
            this.setSyncNotification(src.id, notification);
        };

        this.setSyncNotification = function(srcId, notification) {
            LOG.info("Set notification. Source ID: " +srcId +";" +(notification ? notification.toString() : ""));
            if (srcId == -1) {
                allNotification = notification;
            } else {
                syncNotifications[srcId] = notification;
            }
        };

        this.clearNotification = function(src) {
            LOG.info("Clear notification. Source: " +(src ? src.name : ""));
            if (engine.isSearch()) searchNotification = null;
            else syncNotifications[src.id] = null;
        };

        this.clearSyncNotification = function(srcId) {
            LOG.info("Clear notification. Source ID: " +srcId);
            if (srcId == -1) allNotification = null; //Clear all
            else syncNotifications[srcId] = null;
        };

        this.cleanLastSyncObjectCount = function() {
            hashSrcObjectCount = {};
        };

        this.incLastSyncObjectCount = function(srcId) {
            var nCount = hashSrcObjectCount[srcId] || 0;
            nCount += 1;

            hashSrcObjectCount[srcId] = nCount;

            return nCount || 0;
        };

        function getLastSyncObjectCount(srcId) {
            return hashSrcObjectCount[srcId] || 0;
        }


        this.callLoginCallback = function(oNotify, nErrCode, strMessage) {
            //try {
                if (engine.isStoppedByUser())
                    return;

                var strBody = "error_code=" + nErrCode;

                strBody += "&error_message=" + __urlEncode(strMessage != null? strMessage : "");
                strBody += "&rho_callback=1";

                LOG.info("Login callback: " +oNotify.toString() +". Body: " +strBody);

                callNotify(oNotify, strBody);
            //} catch (Exception exc) {
            //    LOG.error("Call Login callback failed.", exc);
            //}
        };

        function isReportingEnabled() {
            return enableReporting && enableReportingGlobal;
        }

    }

    function __getErrorText(key) {
        //TODO: to implement
        return key;
    }

    function __getMessageText(key) {
        //TODO: to implement
        return key;
    }

    function __urlEncode(value) {
        return value;
    }

    function notifyByEvent(type /*, arg1, arg2, ... argN*/) {
        $(window).trigger(jQuery.Event(type), $.makeArray(arguments).slice(1));
        // fire exact notifications here
    }

    $.extend(rho, {
        notify: publicInterface()
    });
    $.extend(RhoConnect, {SyncNotification: SyncNotification});

})(jQuery);
if(Ext){(function($, Ext) {

    var baseTempId = null;

    /**
     * @author DmitryP@rhomobile.com
     * @class Ext.data.RhoconnectStorageProxy
     * @extends Ext.data.ClientProxy
     *
     * <p>The RhoconnectStorageProxy uses the new HTML5 WebSQL API to save {@link Ext.data.Model Model} data locally on
     * the client browser in the database instance with Rhoconnect schema.</p>
     *
     * @constructor
     * Creates the proxy, throws an error if Rhoconnect WebSQL database is not available
     * @param {Object} config Optional config object
     */
    Ext.data.RhoconnectStorageProxy = Ext.extend(Ext.data.ClientProxy, {

        LOG: new RhoConnect.rho.Logger('Rhoconnect.plugin-extjs.js'),

        /**
         * @cfg {String} dbName The Rhoconnect database instance name to store all record data
         */
        dbName: undefined,

        /**
         * @ignore
         */
        constructor: function(config) {
            Ext.data.RhoconnectStorageProxy.superclass.constructor.call(this, config);

            //ensures that the reader has been instantiated properly
            this.setReader(this.reader);

            if (this.getStorageObject() == undefined) {
                throw "Rhoconnect Storage is not available, please ensure you have rhoconnect.js scripts properly loaded";
            }

            //if an dbName is not given, try to use the store's id instead
            this.dbName = this.dbName || (this.store ? this.store.storeId : undefined);

            if (this.dbName == undefined) {
                throw "No database name was provided to the rhoconnect storage proxy. " +
                        "See Ext.data.RhoconnectStorageProxy documentation for details";
            }

            this.initialize();
        },

        //inherit docs
        create: function(operation, callback, scope) {
            var that = this;
            var records = operation.records;
            var id;

            operation.setStarted();

            var dfrMap = RhoConnect.rho.deferredMapOn(records);

            $.each(records, function(i, record){
                if (record.phantom) {
                    record.phantom = false;
                    id = that.getNextId();
                } else {
                    id = record.getId();
                }
                that.setRecord(record, id).done(function(record){
                    dfrMap.resolve(i, [record]);
                }).fail(function(obj, err){
                    dfrMap.reject(i, [obj, err]);
                });
            });

            dfrMap.when().done(function(){
                operation.setSuccessful();
                _localAfterCreate();
            }).fail(function(){
                _localAfterCreate();
                that.LOG.error('update() object update error');
            });

            function _localAfterCreate() {
                operation.setCompleted();

                if (typeof callback == 'function') {
                    callback.call(scope || this, operation);
                }
            }
        },

        //inherit docs
        read: function(operation, callback, scope) {
            //TODO: respect sorters, filters, start and limit options on the Operation
            var that = this;
            var modelName = that.model.modelName;
            var reader = that.getReader();
            var records = [];

            //read a single record
            if (operation.id) {
                that.getRecord(operation.id).done(function(record){
                    if (record) {
                        records.push(record);
                        operation.setSuccessful();
                    }
                    _localAfterRead();
                }).fail(function(obj, err){
                    that.LOG.error('read() single object read error: ' +err);
                    _localAfterRead();
                });
            } else {
                that.findAll(modelName).done(function(recs){
                    records = recs;
                    operation.setSuccessful();
                    _localAfterRead();
                }).fail(function(obj, err){
                    that.LOG.error('read() all objects read error: ' +err);
                    _localAfterRead();
                });
            }

            function _localAfterRead() {
                var result = null;

                if (that.root) {
                    var rooted = {};
                    rooted.name = modelName;
                    rooted[that.root] = records;
                    result = reader.read(rooted);
                } else {
                    result = reader.read(records);
                }

                Ext.apply(operation, {
                    resultSet: result
                });

                operation.setCompleted();

                if (typeof callback == 'function') {
                    callback.call(scope || that, operation);
                }
            }
        },

        //inherit docs
        update: function(operation, callback, scope) {
            var that = this;
            var records = operation.records;

            operation.setStarted();

            var dfrMap = RhoConnect.rho.deferredMapOn(records);

            $.each(records, function(i, record){
                that.setRecord(record).done(function(record){
                    dfrMap.resolve(i, [record]);
                }).fail(function(obj, err){
                    dfrMap.reject(i, [obj, err]);
                });
            });

            dfrMap.when().done(function(){
                operation.setSuccessful();
                _localAfterUpdate();
            }).fail(function(){
                _localAfterUpdate();
                that.LOG.error('update() object update error');
            });

            function _localAfterUpdate() {
                operation.setCompleted();

                if (typeof callback == 'function') {
                    callback.call(scope || this, operation);
                }
            }
        },

        //inherit
        destroy: function(operation, callback, scope) {
            var that = this;
            var records = operation.records;

            operation.setStarted();

            var dfrMap = RhoConnect.rho.deferredMapOn(records);

            $.each(records, function(i, record){
                that.removeRecord(record).done(function(record){
                    dfrMap.resolve(i, [record]);
                }).fail(function(obj, err){
                    dfrMap.reject(i, [obj, err]);
                });
            });

            dfrMap.when().done(function(){
                operation.setSuccessful();
                _localAfterDelete();
            }).fail(function(){
                _localAfterDelete();
                that.LOG.error('update() object update error');
            });

            function _localAfterDelete() {
                operation.setCompleted();

                if (typeof callback == 'function') {
                    callback.call(scope || this, operation);
                }
            }

        },

        findAll: function(srcName) {
            var that = this;
            var storage = that.getStorageObject();

            function _setupObject(map, id, attrib, value) {
                if (!map[id]) map[id] = {};
                map[id][attrib] = value;
            }

            function _buildRecord(id, objAttrs) {
                var data    = {},
                    Model   = that.model,
                    fields  = Model.prototype.fields.items,
                    length  = fields.length,
                    i, field, name, record;
                for (i = 0; i < length; i++) {
                    field = fields[i];
                    name  = field.name;

                    if (typeof field.decode == 'function') {
                        data[name] = field.decode(objAttrs[name]);
                    } else {
                        data[name] = objAttrs[name];
                    }
                }
                data.id = id;
                //data.leaf = true;
                return data;
    //            record = new Model(data, id);
    //            record.phantom = false;
    //            return record;
            }

            return $.Deferred(function(dfr){
                storage.executeSql("SELECT source_id FROM sources WHERE name=? LIMIT 1 OFFSET 0",
                        [srcName]).done(function(tx, rs){
                    var srcId = null;
                    if (rs.rows && rs.rows.length && rs.rows.length > 0) {
                        srcId = rs.rows.item(0)['source_id'];
                    }
                    _localSrcIdFound(srcId);
                }).fail(function(obj, err){
                    that.LOG.error('findAll() source_id select error: ' +err);
                    dfr.reject(obj, err);
                });

                function _localSrcIdFound(srcId) {
                    storage.executeSql("SELECT * FROM object_values WHERE source_id=?",
                            [srcId]).done(function(tx, rs){
                        var objects = {};
                        for(var i=0; i<rs.rows.length; i++) {
                            var objId = rs.rows.item(i)['object'];
                            var attrib = rs.rows.item(i)['attrib'];
                            var value = rs.rows.item(i)['value'];
                            _setupObject(objects, objId, attrib, value);
                        }
                        _localObjectsAreRead(objects);
                    }).fail(function(obj, err){
                        that.LOG.error('findAll() select all objects for source error: ' +err);
                        dfr.reject(obj, err);
                    });

                }

                function _localObjectsAreRead(objects) {
                    var records = [];
                    $.each(objects, function(id, object){
                        records.push(_buildRecord(id, object));
                    });

                    dfr.resolve(records);
                }
            }).promise();
        },


        /**
         * @private
         * Fetches a model instance from the Proxy by ID. Runs each field's decode function (if present) to decode the data
         * @param {String} id The record's unique ID
         * @return The deferred object to resolve with {Ext.data.Model} model instance or to reject with error code and
         * error message
         */
        getRecord: function(id) {
            var that = this;
            var storage = that.getStorageObject();

            function _buildRecord(rs) {
                var data    = {},
                    Model   = that.model,
                    fields  = Model.prototype.fields.items,
                    length  = fields.length,
                    i, field, name, record;
                var rawData = {};
                for(i=0; i<rs.rows.length; i++) {
                    var attrName = rs.rows.item(i)['attrib'];
                    rawData[attrName] = rs.rows.item(i)['value'];
                }
                for (i = 0; i < length; i++) {
                    field = fields[i];
                    name  = field.name;

                    if (typeof field.decode == 'function') {
                        data[name] = field.decode(rawData[name]);
                    } else {
                        data[name] = rawData[name];
                    }
                }
                data.id = id;
                //data.leaf = true;
                return data;
    //            record = new Model(data, id);
    //            record.phantom = false;
    //            return record;
            }

            return $.Deferred(function(dfr){
                storage.executeSql("SELECT * FROM object_values WHERE object=?", [id.toString()]).done(function(tx, rs){
                    dfr.resolve(_buildRecord(rs));
                }).fail(function(obj, err){
                    that.LOG.error('getRecord() error: ' +err);
                    dfr.reject(obj, err);
                });
            }).promise();
        },

        /**
         * Saves the given record in the Proxy. Runs each field's encode function (if present) to encode the data
         * @param {Ext.data.Model} record The model instance
         * @param {String} id The id to save the record under (defaults to the value of the record's getId() function)
         */
        setRecord: function(record, id) {
            var that = this;
            var storage = that.getStorageObject();
            var srcName = that.model.modelName;
            var srcId = null;
            var isNew = false;

            if (id) {
                record.setId(id);
                isNew = true;
            } else {
                id = record.getId();
            }

            var rawData = record.data,
                data    = {},
                model   = that.model,
                fields  = model.prototype.fields.items;

            return $.Deferred(function(dfr){

                if(undefined != record.dirty && !record.dirty) {
                    dfr.resolve(id);
                    return;
                }

                // Read source_id for stored object (object should be already stored)
                storage.executeSql("SELECT source_id FROM sources WHERE name=?",
                        [srcName]).done(function(tx, rs){
                    if (rs.rows && rs.rows.length && rs.rows.length > 0) {
                        srcId = rs.rows.item(0)['source_id'];
                    }
                    _localWithSrcId();
                }).fail(function(obj, err){
                    that.LOG.error('setRecord() read source_id error: ' +err);
                    dfr.reject(obj, err);
                });

                // to select UPDATE/INSERT query we firstly need to know which attributes already present for the object
                var attrsToUpdate = {};
                function _localWithSrcId() {
                    storage.executeSql("SELECT attrib FROM object_values WHERE object=?",
                            [id.toString()]).done(function(tx, rs){
                        for (var i=0; i< rs.rows.length; i++) {
                            var attrName = rs.rows.item(i)['attrib'];
                            if (attrName) attrsToUpdate[attrName] = true;
                        }
                        _localWithAttrsToUpdate();
                    }).fail(function(obj, err){
                        that.LOG.error('setRecord() read attr names error: ' +err);
                        dfr.reject(obj, err);
                    });
                }

                function _localWithAttrsToUpdate() {
                    var updateQuery = 'UPDATE object_values SET'
                            +' value=?'
                            +' WHERE source_id=? and object=? and attrib=?';

                    var insertQuery = 'INSERT INTO object_values ('
                            +' value,'
                            +' source_id,'
                            +' object,'
                            +' attrib'
                            +' ) VALUES (?, ?, ?, ?)';

                    var insertChangedQuery = 'INSERT INTO changed_values ('
                            +' value,'
                            +' source_id,'
                            +' object,'
                            +' attrib,'
                            +' update_type'
                            +' ) VALUES (?, ?, ?, ?, ?)';

                    //var dfrMap = RhoConnect.rho.deferredMapOn(fields);
                    storage.rwTx().ready(function(db, tx){
                        $.each(fields, function(i, field) {
                            var name = field.name;

                            if (typeof field.encode == 'function') {
                                data[name] = field.encode(rawData[name], record);
                            } else {
                                data[name] = rawData[name];
                            }

                            var query = attrsToUpdate[name] ? updateQuery : insertQuery;
                            var value = data[name];
                            if (name != 'id') {
                                storage.executeSql(query, [value, srcId.toString(), id.toString(), name], tx)/*.done(function(tx, rs){
                                    //dfrMap.resolve(i, []);
                                    that.LOG.warning('OK: setRecord() update/insert object_values ok');
                                    //that.LOG.warning('  "' +query +'", [' +value +', ' +srcId +', ' +id +', ' +name +']');
                                    //that.LOG.warning('  rs.rowsaffected: ' +rs.rowsAffected);
                                }).fail(function(obj, err){
                                    //dfrMap.reject(i, [obj, err]);
                                    that.LOG.warning('ERR: setRecord() update/insert object_values error: ' +err);
                                })*/;
                                if (!isNew) {
                                    storage.executeSql(insertChangedQuery,
                                            [value, srcId.toString(), id.toString(), name, 'update'], tx)/*.done(function(tx, rs){
                                        //dfrMap.resolve(i, []);
                                        that.LOG.warning('OK: setRecord() update/insert changed_values ok');
                                        that.LOG.warning('  "' +query +'", [' +value +', ' +srcId +', ' +id +', ' +name +']');
                                        that.LOG.warning('  rs.rowsaffected: ' +rs.rowsAffected);
                                    }).fail(function(obj, err){
                                        //dfrMap.reject(i, [obj, err]);
                                        that.LOG.warning('ERR: setRecord() update/insert changed_values error: ' +err);
                                    })*/;
                                }
                            }
                        });
                        if (isNew) {
                            storage.executeSql(insertChangedQuery,
                                    [null/*id.toString()*/, srcId.toString(), id.toString(), 'object', 'create'], tx)/*.done(function(tx, rs){
                                //dfrMap.resolve(i, []);
                                that.LOG.warning('OK: setRecord() update/insert changed_values ok');
                                that.LOG.warning('  "' +query +'", [' +value +', ' +srcId +', ' +id +', ' +name +']');
                                that.LOG.warning('  rs.rowsaffected: ' +rs.rowsAffected);
                            }).fail(function(obj, err){
                                //dfrMap.reject(i, [obj, err]);
                                that.LOG.warning('ERR: setRecord() update/insert changed_values error: ' +err);
                            })*/;
                        }
                    }).done(function(db){
                        record.dirty = false;
                        dfr.resolve(id);
                    }).fail(function(obj, err){
                        dfr.reject(null, 'setRecord() update/insert attr error');
                    });
                }
            }).promise();
        },

        /**
         * Physically removes a given record from the rhoconnect storage. Used internally by {@link #destroy}.
         * @param {Ext.data.Model} record The model instance
         * @param {String} id The id of record to remove
         */
        removeRecord: function(record) {
            var that = this;
            var storage = that.getStorageObject();
            var srcName = that.model.modelName;
            var srcId = null;
            var id = null;

            if (record && record.data && record.data.id) {
                id = record.data.id;
            }

            return $.Deferred(function(dfr){

                // Read source_id for stored object (object should be already stored)
                storage.executeSql("SELECT source_id FROM sources WHERE name=?",
                        [srcName]).done(function(tx, rs){
                    if (rs.rows && rs.rows.length && rs.rows.length > 0) {
                        srcId = rs.rows.item(0)['source_id'];
                    }
                    _localWithSrcId();
                }).fail(function(obj, err){
                    that.LOG.error('setRecord() read source_id error: ' +err);
                    dfr.reject(obj, err);
                });

                function _localWithSrcId() {
                    storage.rwTx().ready(function(db, tx) {

                        var attrsToDelete = {};
                        storage.executeSql("SELECT * FROM object_values WHERE object=? AND source_id=?", [id.toString(), srcId.toString()], tx).done(function(tx, rs){
                            for (var i=0; i< rs.rows.length; i++) {
                                var attrName = rs.rows.item(i)['attrib'];
                                var attrValue = rs.rows.item(i)['value'];
                                if (attrName) attrsToDelete[attrName] = attrValue;
                            }
                            storage.executeSql("DELETE FROM object_values WHERE object=? AND source_id=?", [id.toString(), srcId.toString()], tx).done(function(tx, rs){
                                _localWithObjValsDeleted();
                            });
                        });

                        function _localWithObjValsDeleted() {

                            var updateType = 'delete';
                            storage.executeSql("SELECT update_type FROM changed_values WHERE object=? AND update_type=? AND sent=?", [id.toString(), 'create', 0], tx).done(function(tx, rs){
                                if (0 < rs.rows.length) {
                                    updateType = null;
                                }
                                storage.executeSql("DELETE FROM changed_values WHERE object=? AND source_id=? AND sent=?", [id.toString(), srcId.toString(), 0], tx).done(function(tx, rs){

                                    var doInsert = false;
                                    $.each(attrsToDelete, function(name, value) {
                                        if (updateType) doInsert = true;
                                    });

                                    if (doInsert) {
                                        _localDoInsertDelete();
                                    }
                                });
                            });

                            function _localDoInsertDelete() {
                                var insertChangedQuery = 'INSERT INTO changed_values ('
                                        +' value,'
                                        +' source_id,'
                                        +' object,'
                                        +' attrib,'
                                        +' update_type'
                                        +' ) VALUES (?, ?, ?, ?, ?)';
                                $.each(attrsToDelete, function(name, value) {
                                    storage.executeSql(insertChangedQuery, [value, srcId.toString(), id.toString(), name, updateType], tx)/*.done(function(tx, rs){
                                    //dfrMap.resolve(i, []);
                                        that.LOG.warning('OK: setRecord() update/insert changed_values ok');
                                        that.LOG.warning('  "' +query +'", [' +value +', ' +srcId +', ' +id +', ' +name +']');
                                        that.LOG.warning('  rs.rowsaffected: ' +rs.rowsAffected);
                                        }).fail(function(obj, err){
                                    //dfrMap.reject(i, [obj, err]);
                                        that.LOG.warning('ERR: setRecord() update/insert changed_values error: ' +err);
                                    })*/;
                                });
                            }
                        }
                    }).done(function(db) {
                        record.dirty = false;
                        dfr.resolve(id);
                    }).fail(function(obj, err) {
                        dfr.reject(null, 'setRecord() remove attr error');
                    });
                }
            }).promise();
        },

        /**
         * @private
         * Physically removes a given record from the rhoconnect storage. Used internally by {@link #destroy}, which you should
         * use instead because it updates the list of currently-stored record ids
         * @param {String|Number|Ext.data.Model} id The id of the record to remove, or an Ext.data.Model instance
         */
    /*
        removeRecord: function(id, updateIds) {
            if (id instanceof Ext.data.Model) {
                id = id.getId();
            }

            if (updateIds !== false) {
                var ids = this.getIds();
                ids.remove(id);
                this.setIds(ids);
            }

            this.getStorageObject().removeItem(this.getRecordKey(id));
        },
    */


        /**
         * @private
         */
        initialize: function() {
        },

        /**
         * Destroys all records stored in the proxy and removes values used to support the proxy from the storage object
         */
        clear: Ext.emptyFn,
    /*
        clear: function() {
            // unsure we need it
            var storage = this.getStorageObject();

            storage.executeSql('DELETE FROM object_values').done(function(){
            }).fail(function(errCode, err){
                that.LOG.error('clear() error: ' +(err || errCode));
            });
        },
    */

        /**
         * @private
         * @return {Object} The storage object
         */
        getStorageObject: function() {
            return RhoConnect.rho.storage;
        },

        getNextId: function() {
            baseTempId = baseTempId || (Date.now() - (new Date(2009, 1, 1)).getTime());
            baseTempId = baseTempId + 1;
            return baseTempId;
        }
    });

    Ext.data.ProxyMgr.registerType('rhoconnect', Ext.data.RhoconnectStorageProxy);

})(jQuery, Ext)}
