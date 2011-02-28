(function($) {
    RhoSync = function(cfg) {

        const SESSION_COOKIE = 'rhosync_session';

        const NOTIFY_GENERIC = 'rhoSyncNotifyGeneric';
        const NOTIFY_ERROR = 'rhoSyncNotifyError';
        const NOTIFY_CLIENT_CREATED = 'rhoSyncNotifyClientCreated';

        var defaults = {
			syncserver: "",
			pollinterval: 20
		};

		var config = $.extend({}, defaults, cfg);

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

        function Client(id) {
            this.session = null;
            this.token = null;
            this.token_sent = 0;
            this.reset = 0;
            this.port = null;
            this.last_sync_success = null;
            this.sources = {};
            this.id = function(){return id;}; // is read-only
        }

        function Source(id) {
            this.id = function(){return id;}; // is read-only
        }

        var storage = function(dbName) {

            // low-level functions ========================

            function _open() {
                return $.Deferred(function(dfr){
                    try {
                        var db = openDatabase(dbName, '1.0', 'RhoSync database', 2 * 1024 * 1024);
                        dfr.resolve(db);
                    } catch(ex) {
                        dfr.reject(ex);
                    }
                }).promise();
            }

            function _tx(db) {
                return $.Deferred(function(dfr){
                    function resolveTx(db) {
                        db.transaction(function (tx) {
                            dfr.resolve(tx);
                        }, function(err){
                            dfr.reject(err);
                        });
                    }
                    if (db) {
                        resolveTx(db);
                    } else {
                        _open().done(function(db){
                          resolveTx(db);
                        }).fail(function(ex){
                            dfr.reject(ex);
                        });
                    }
                }).promise();
            }

            function _execInTx(tx, sql, values) {
                return $.Deferred(function(dfr){
                    tx.executeSql(sql, values, function(tx, rs){
                        dfr.resolve(tx, rs);
                    }, function(tx, err){
                        dfr.reject(tx, err);
                    });
                }).promise();
            }

            function _executeSQL(sql, values, optionalTx)
            {
                return $.Deferred(function(dfr){
                    if (optionalTx) {
                        _execInTx(optionalTx, sql, values).done(function(tx, rs){
                            dfr.resolve(tx, rs);
                        }).fail(function(obj, err){
                            dfr.reject(obj, err);
                        });
                    } else {
                        _tx().done(function(tx){
                            _execInTx(tx, sql, values).done(function(tx, rs){
                                dfr.resolve(tx, rs);
                            }).fail(function(obj, err){
                                dfr.reject(obj, err);
                            });
                        }).fail(function(ex){
                            dfr.reject(null, ex);
                        });
                    }
                }).promise();
            }

            function _executeBatchSQL(sql, optionalTx)
            {
                var statements = sql.replace(/^\s+|;\s*$/, '').split(";");

                var dfrs = [];
                var dfrIdx = 0;

                // Deffered object for wrapping db/tx
                var dfr = $.Deferred();
                dfrs.push(dfr);
                dfrIdx++;

                var ni = dfrIdx;
                // Accumulate deferred objects for aggregate
                // resolving, one per each statement
                $.each(statements, function(idx, val){
                    dfrs.push($.Deferred());
                });

                function _executeBatchInTx(tx, sqlArray) {
                    var dfr = dfrs[dfrIdx];
                    if (0 < sqlArray.length) {
                        var sql = sqlArray.shift();
                        // execute current statement
                        _execInTx(tx, sql).done(function(tx, rs){
                            // so far, so good
                            dfr.resolve(tx, rs, sql);
                            // execute next statement recursively
                            dfrIdx++;
                            _executeBatchInTx(tx, sqlArray);
                        }).fail(function(tx, err){
                            dfr.reject(tx, err);
                        });
                    }
                }

                if(optionalTx) {
                    _executeBatchInTx(optionalTx, statements);
                } else {
                    _tx().done(function(tx){
                        _executeBatchInTx(tx, statements);
                        dfr.resolve(tx, statements);
                    }).fail(function(db, err){
                        dfr.reject(db, err);
                    });
                }

                var promises = [];
                $.each(dfrs, function(idx, dfr){
                    promises.push(dfr.promise());
                });

                return $['when'].apply(this, promises);
            }

            function _iniSchema()
            {
                return _executeBatchSQL(initDbSchemaSQL);
            }

            function _getAllTableNames(optionalTx)
            {
                var dfr = $.Deferred();
                _executeSQL("SELECT name FROM sqlite_master WHERE type='table'",
                        null, optionalTx).done(function(tx, rs){
                    var tableNames = [];
                    for(var i=0; i<rs.rows.length; i++) {
                        tableNames.push(rs.rows.item(i)['name']);
                    }
                    dfr.resolve(tx, tableNames);
                }).fail(function(obj, err){
                    dfr.reject(obj, err);
                });
                return dfr.promise();
            }

            // Client-related ========================

            function listClientsId(optionalTx) {
                var dfr = $.Deferred();
                _executeSQL('SELECT client_id FROM client_info', null, optionalTx).done(function(tx, rs) {
                    var ids = [];
                    for(var i=0; i<rs.rows.length; i++) {
                        ids.push(rs.rows.item(i)['client_id']);
                    }
                    dfr.resolve(tx, ids);
                }).fail(function(obj, err) {
                    dfr.reject(obj, err);
                });
                return dfr.promise();
            }

            function loadClient(id, optionalTx) {
                var dfr = $.Deferred();
                _executeSQL('SELECT * FROM client_info WHERE client_id = ?', [id], optionalTx).done(function(tx, rs) {
                    if (0 == rs.rows.length) {
                        dfr.reject(id, 'Not found');
                    } else {
                        var client = new Client(id);
                        client.session = rs.rows.item(0)['session'];
                        client.token = rs.rows.item(0)['token'];
                        client.token_sent = rs.rows.item(0)['token_sent'];
                        client.reset = rs.rows.item(0)['reset'];
                        client.port = rs.rows.item(0)['port'];
                        client.last_sync_success = rs.rows.item(0)['last_sync_success'];
                        dfr.resolve(tx, client);
                    }
                }).fail(function(obj, err) {
                    dfr.reject(obj, err);
                });
                return dfr.promise();
            }

            function storeClient(client, optionalTx, isNew) {
                var updateQuery = 'UPDATE client_info SET'
                    +' session = ?'
                    +' token = ?'
                    +' token_sent = ?'
                    +' reset = ?'
                    +' port = ?'
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
                var dfr = $.Deferred();
                _executeSQL(isNew ? insertQuery : updateQuery, [
                    client.session,
                    client.token,
                    client.token_sent,
                    client.reset,
                    client.port,
                    client.last_sync_success,
                    client.id()], optionalTx).done(function(tx, rs) {
                    dfr.resolve(tx, client);
                }).fail(function(obj, err) {
                    dfr.reject(obj, err);
                });
                return dfr.promise();
            }

            function insertClient(client, optionalTx) {
                return storeClient(client, optionalTx, true);
            }

            function deleteClient(clientOrId, optionalTx) {
                var id = ("object" == typeof clientOrId) ? clientOrId.id() : clientOrId;
                var dfr = $.Deferred();
                _executeSQL('DELETE client_info WHERE client_id = ?', [id], optionalTx).done(function(tx, rs) {
                        dfr.resolve(tx, null);
                }).fail(function(obj, err) {
                    dfr.reject(obj, err);
                });
                return dfr.promise();
            }

            return {
                // Client
                listClientsId: listClientsId,
                loadClient: loadClient,
                storeClient: storeClient,
                insertClient: insertClient,
                deleteClient: deleteClient,
                // low-level
                open: _open,
                tx: _tx,
                executeSQL: _executeSQL,
                executeBatchSQL: _executeBatchSQL,
                initSchema: _iniSchema,
                getAllTableNames: _getAllTableNames
            }
        }('rhoSyncDb');

        var protocol = function() {

            function _setCookie(name, value, days, path, domain, secure) {
                if (days) {
                    var expDate = new Date();
                    expDate.setTime(expDate.getTime() + (days * 24 * 60 * 60 * 1000));
                }
                document.cookie = name + "=" + encodeURIComponent( value ) +
                    ((days) ? "; expires=" + expDate.toGMTString() : "") +
                    ((path) ? "; path=" + path : "") +
                    ((domain) ? "; domain=" + domain : "") +
                    ((secure) ? "; secure" : "");
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

            function _net_call(url, data, method /*='post'*/, contentType /*='application/json'*/) {
                var dfr = $.Deferred();
                $.ajax({
                    url: url,
                    type: method || 'post',
                    contentType: contentType || 'application/json',
                    processData: false,
                     data: $.toJSON(data),
                    dataType: 'json'
                }).done(function(data, status, xhr){
                    _notify(NOTIFY_GENERIC, status, data, xhr);
                    dfr.resolve(status, data, xhr);
                }).fail(function(xhr, status, error){
                    _notify(NOTIFY_GENERIC, status, error, xhr);
                    dfr.reject(status, error, xhr);
                });
                return dfr.promise();
            }

            function login(login, password) {
                return _net_call(config.syncserver+'/clientlogin', {login:login, password:password, rememberme: 1});
            }

            /*
            function isLoggedIn() {
                return _getCookie(SESSION_COOKIE) ? true : false;
            }

            function logout() {
                _deleteCookie(SESSION_COOKIE);
            }
            */

            var clientCreate = function() {
                var dfr = $.Deferred();
                return _net_call(config.syncserver+'/clientcreate', "", "get", "text/plain").done(function(status, data){
                    dfr.resolve(data);
                }).fail(function(status, error){
                    dfr.reject(error);
                });
            };

            return {
                login: login,
                clientCreate: clientCreate
            };
        }();

        var engine = function(){

            function _initStorage() {
                var dfr = $.Deferred();
                storage.getAllTableNames().done(function(names){
                    if (4+1 != names.length) {
                        storage.initSchema().done(function(){
                            dfr.resolve("db schema initialized");
                        }).fail(function(){
                            dfr.reject("db schema initialization error");
                        });
                    }
                }).fail(function(){
                    dfr.reject("db tables read error");
                });
                return dfr.promise();
            }

            function _createClient() {
                var dfr = $.Deferred();
                // obtain client id from the server
                protocol.clientCreate().done(function(data){
                    if (data && data.client && data.client.client_id){
                        // persist new client
                        var client = new Client(data.client.client_id);
                        storage.insertClient(client).done(function(tx, client){
                            dfr.resolve(client);
                            _notify(NOTIFY_CLIENT_CREATED, client);
                        }).fail(function(tx, error){
                            dfr.reject("db access error");
                            _notify(NOTIFY_ERROR, 'Db access error in clientCreate');
                        });
                    } else {
                        dfr.reject("server response error");
                        _notify(NOTIFY_ERROR, 'Server response error in clientCreate');
                    }
                }).fail(function(error){
                    dfr.reject("server request error");
                    _notify(NOTIFY_ERROR, 'Server request error clientCreate');
                });
                return dfr.promise();
            }

            function _initClient() {
                var dfr = $.Deferred();
                storage.listClientsId().done(function(ids){
                    // if any?
                    if (0 < ids.length) {
                        // ok, load first (for now)
                        // TODO: to decide which on to load if there are many stored 
                        storage.loadClient(ids[0]).done(function(client){
                            dfr.resolve(client);
                        }).fail(function(){
                            dfr.reject("db access error");
                            _notify(NOTIFY_ERROR, 'Db access error in initClient');
                        });
                    } else {
                        // None of them, going to obtain from the server
                        _createClient().done(function(client){
                            dfr.resolve(client);
                        }).fail(function(error){
                            dfr.reject("client creation error: " +error);
                            _notify(NOTIFY_ERROR, "Client creation error in initClient");
                        });
                    }
                }).fail(function(){
                    dfr.reject("db access error");
                });
                return dfr.promise();
            }

            function _run(client) {
                var dfr = $.Deferred();
                // TODO: to implement the body
                return dfr.promise();
            }

            function start() {
                var dfr = $.Deferred();
                _initStorage().done(function(){
                    _initClient().done(function(client){
                        _run(client).done(function(){
                            dfr.resolve();
                        }).fail(function(error){
                            dfr.reject("engine run error: " +error);
                        });
                    }).fail(function(error){
                        dfr.reject("client initialization error: " +error);
                    });
                }).fail(function(error){
                    dfr.reject("storage initialization error: " +error);
                });
                return dfr.promise();
            }

            return {
                clientCreate: _createClient
            }
        }();

        function _notify(type /*, arg1, arg2, ... argN*/) {
            $(window).trigger(jQuery.Event(type), $.makeArray(arguments).slice(1));
            // fire exact notifications here
        }

		return {
			api: {
                events: {
                    NOTIFY_GENERIC: NOTIFY_GENERIC,
                    NOTIFY_CLIENT_CREATED: NOTIFY_CLIENT_CREATED
                },
                models: {
                    Client: Client,
                    Source: Source
                },
                protocol: protocol,
                engine: engine,
                storage: storage
			},
			rhoconfig: config
		}
	}
})(jQuery);
