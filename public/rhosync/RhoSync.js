(function($) {
    RhoSync = function(cfg) {

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

            this.source = new Source(defn.sourceId, defn.name, this);

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
            this.errCode = errors.ERR_NONE;
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
                        storage.executeSQL("UPDATE sources SET token=? where source_id=?", +this.token, this.id).done(function(){
                            dfr.resolve();
                        }).fail(passRejectTo(dfr));
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
                        storage.executeSQL(
                                "UPDATE sources set last_updated=?,last_inserted_size=?,last_deleted_size=?, "
                                +"last_sync_duration=?,last_sync_success=?, backend_refresh_time=? WHERE source_id=?",
                                (endTime/1000), new Integer(getInsertedCount()), new Integer(getDeletedCount()),
                          new Long((endTime.minus(startTime)).toULong()),
                          new Integer(m_bGetAtLeastOnePage?1:0), new Integer(m_nRefreshTime), getID() );
*/
                    }

                    function _catch(obj, err) {
                        engine.stopSync();
                        _finally();
                        dfr.reject(obj, err);
                    }

                    _notify(events.SYNCHRONIZING, 'synchronizing' +this.name +'...', this.errCode, this.strError);
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


        // utility functions ========================

        function passRejectTo(dfr, doReport) {
            return function() {
                if (doReport) {
                    //TODO: some log output
                }
                dfr.reject(arguments);
            };
        }

        function DeferredMapOn(obj) {
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

        // storage class ========================

        var storage = function(dbName) {

            // low-level functions ========================

            function _open(name, version, comment, size) {
                return $.Deferred(function(dfr){
                    try {
                        var db = openDatabase(
                                name || dbName,
                                version || '1.0',
                                comment || 'RhoSync database',
                                size || (2*1024*1024)
                                );
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
                    if (readWrite && readWrite != "read-only") {
                        db.transaction($.proxy(function(tx){
                            readyDfr.resolve(db, tx);
                        }, this), $.proxy(function (err) {
                            dfr.reject(db, err);
                        }, this), $.proxy(function(){
                            dfr.resolve(db, "ok");
                        }, this));
                    } else {
                        db.readTransaction($.proxy(function(tx){
                            readyDfr.resolve(db, tx);
                        }, this), $.proxy(function (err) {
                            dfr.reject(db, err);
                        }, this), $.proxy(function(){
                            dfr.resolve(db, "ok");
                        }, this));
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

            function _executeSQL(sql, values, optionalTx) {
                return $.Deferred(function(dfr){
                    function execInTx(tx, sql, values) {
                        tx.executeSql(sql, values, $.proxy(function(tx, rs){
                            dfr.resolve(tx, rs);
                        }, this), $.proxy(function(tx, err){
                            dfr.reject(tx, err);
                        }, this));
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

            function _executeBatchSQL(sql, optionalTx)
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
                        _executeSQL(sql, null, tx).done(function(tx, rs){
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

                return $['when'].apply(this, promises);
            }

            function _initSchema()
            {
                return _executeBatchSQL(initDbSchemaSQL);
            }

            function _getAllTableNames(optionalTx)
            {
                return $.Deferred(function(dfr){
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
                }).promise();
            }

            function _init() {
                return $.Deferred(function(dfr){
                    _getAllTableNames().done(function(names){
                        if (4+1 != names.length) {
                            _initSchema().done(function(){
                                dfr.resolve("db schema initialized");
                            }).fail(function(){
                                dfr.reject("db schema initialization error");
                            });
                        }
                    }).fail(function(){
                        dfr.reject("db tables read error");
                    });
                }).promise();
            }

            // Client-related ========================

            function listClientsId(optionalTx) {
                return $.Deferred(function(dfr){
                    _executeSQL('SELECT client_id FROM client_info', null, optionalTx).done(function(tx, rs) {
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
                    _executeSQL('SELECT * FROM client_info WHERE client_id = ?', [id],
                            optionalTx).done(function(tx, rs) {
                        if (0 == rs.rows.length) {
                            dfr.reject(id, 'Not found');
                        } else {
                            var client = new Client(id);
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
                    _executeSQL(isNew ? insertQuery : updateQuery, [
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
                    _executeSQL('DELETE FROM client_info WHERE client_id = ?', [id], optionalTx).done(function(tx, rs) {
                            dfr.resolve(tx, null);
                    }).fail(function(obj, err) {
                        dfr.reject(obj, err);
                    });
                }).promise();
            }

            // Source-related ========================

            function listSourcesId(optionalTx) {
                return $.Deferred(function(dfr){
                    _executeSQL('SELECT source_id FROM sources', null, optionalTx).done(function(tx, rs) {
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
                    _executeSQL('SELECT * FROM sources WHERE source_id = ?', [id],
                            optionalTx).done(function(tx, rs) {
                        if (0 == rs.rows.length) {
                            dfr.reject(id, 'Not found');
                        } else {
                            var source = new Source(
                                    rs.rows.item(0)['source_id'],
                                    rs.rows.item(0)['name'],
                                    null /*as model*/
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
                            dfr.resolve(tx, source);
                        }
                    }).fail(function(obj, err) {
                        dfr.reject(obj, err);
                    });
                }).promise();
            }

            function loadAllSources(optionalTx) {
                return $.Deferred(function(dfr){
                    _executeSQL('SELECT * FROM sources', null, optionalTx).done(function(tx, rs) {
                        var sources = [];
                        for(var i=0; i<rs.rows.length; i++) {
                            var source = new Source(
                                    rs.rows.item(0)['source_id'],
                                    rs.rows.item(0)['name'],
                                    null /*as model*/
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
                    _executeSQL(isNew ? insertQuery : updateQuery, [
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
                    _executeSQL('DELETE FROM sources WHERE source_id = ?', [id], optionalTx).done(function(tx, rs) {
                            dfr.resolve(tx, null);
                    }).fail(function(obj, err) {
                        dfr.reject(obj, err);
                    });
                }).promise();
            }

            return {
                // Client
                listClientsId: listClientsId,
                loadClient: loadClient,
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
                executeSQL: _executeSQL,
                executeBatchSQL: _executeBatchSQL,
                initSchema: _initSchema,
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
                return $.Deferred(function(dfr){
                    $.ajax({
                        url: url,
                        type: method || 'post',
                        contentType: contentType || 'application/json',
                        processData: false,
                         data: $.toJSON(data),
                        dataType: 'json'
                    }).done(function(data, status, xhr){
                        _notify(events.GENERIC_NOTIFICATION, status, data, xhr);
                        dfr.resolve(status, data, xhr);
                    }).fail(function(xhr, status, error){
                        _notify(events.GENERIC_NOTIFICATION, status, error, xhr);
                        dfr.reject(status, error, xhr);
                    });
                }).promise();
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
                return _net_call(config.syncserver+'/clientcreate', "", "get", "text/plain");
            };

            return {
                login: login,
                clientCreate: clientCreate
            };
        }();

        var engine = function(){

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
                    protocol.clientCreate().done(function(status, data){
                        if (data && data.client && data.client.client_id){
                            // persist new client
                            var client = new Client(data.client.client_id);
                            storage.insertClient(client).done(function(tx, client){
                                dfr.resolve(client);
                                _notify(events.CLIENT_CREATED, client);
                            }).fail(function(tx, error){
                                dfr.reject("db access error");
                                _notify(events.ERROR, 'Db access error in clientCreate');
                            });
                        } else {
                            dfr.reject("server response error");
                            _notify(events.ERROR, 'Server response error in clientCreate');
                        }
                    }).fail(function(status, error){
                        dfr.reject("server request error");
                        _notify(events.ERROR, 'Server request error clientCreate');
                    });
                }).promise();
            }

            function login(login, password) {
                return $.Deferred(function(dfr){
                    protocol.login(login, password).done(function(){
                        storage.listClientsId().done(function(ids){
                            // if any?
                            if (0 < ids.length) {
                                // ok, load first (for now)
                                // TODO: to decide which on to load if there are many stored
                                storage.loadClient(ids[0]).done(function(client){
                                    dfr.resolve(client);
                                }).fail(function(){
                                    dfr.reject("db access error");
                                    _notify(events.ERROR, 'Db access error in engine.login');
                                });
                            } else {
                                // None of them, going to obtain from the server
                                _createClient().done(function(client){
                                    dfr.resolve(client);
                                }).fail(function(error){
                                    dfr.reject("client creation error: " +error);
                                    _notify(events.ERROR, "Client creation error in engine.login");
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

            function syncSource(source) {
                return $.Deferred(function(dfr){
                    if (isSessionExist() && syncState != states.stop )
                        source.sync().done(function(){
                            _notify(events.SYNC_SOURCE_END, source);
                            dfr.resolve(source);
                        }).fail(function(obj, error){
                            if (source.errCode == errors.ERR_NONE) {
                                source.errCode = errors.ERR_RUNTIME;
                            }
                            syncState = states.stop;
                            _notify(events.SYNC_SOURCE_END, source);
                            dfr.reject(obj, error);
                        });
                }).promise();
            }

            function syncAllSources() {
                return $.Deferred(function(dfr){
                    var dfrMap = DeferredMapOn($.extend({}, sources, {'rhoStartSyncSource': startSrc}));
                    var syncErrors = [];

                    var startSrc = getStartSource();
                    if (startSrc) {
                        syncSource(startSrc).done(function(){
                            dfrMap.resolve('rhoStartSyncSource', ["ok"]);
                        }).fail(function(obj, error){
                            syncErrors.push({source: startSrc.name, errObject: obj, error: error});
                            dfrMap.resolve('rhoStartSyncSource', ["error", obj, error]);
                        });
                    } else {
                        dfrMap.resolve('rhoStartSyncSource', ["ok"]);
                    }

                    $.each(sources, function(src) {
                        syncSource(src).done(function(){
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

            return {
                Client: Client,
                Source: Source,
                sources: sources,
                login: login,
                syncAllSources: syncAllSources,
                stopSync: stopSync
            }
        }();


        function _notify(type /*, arg1, arg2, ... argN*/) {
            $(window).trigger(jQuery.Event(type), $.makeArray(arguments).slice(1));
            // fire exact notifications here
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
                storage.loadAllSources(tx).done(function (tx, dbSources) {

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
                                storage.storeSource(dbSource, tx).done(function(tx, source){
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
                            storage.insertSource(cfgSource, tx).done(function(tx, source){
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

                storage.open().done(function(db){
                    storage.rwTx(db).ready(function(db, tx){
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
                var model = new Model(defn);
                model.source.sync_priority = parseInt(defn['sync_priority'] || 1000);
                model.source.sync_type = 'incremental';
                model.source.partition = 'user';
                var sourceId = defn['source_id'] ? parseInt(defn['source_id']) : null;
                model.source.id = sourceId;
                if (sourceId && maxConfigSrcId < sourceId) {
                    maxConfigSrcId = sourceId;
                }
                models[defn.name] = model;
                engine.sources[defn.name] = model.source;
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

            return initSources(engine.sources);
        }

        function login(login, password) {
            return $.Deferred(function(dfr){
                engine.login(login, password).done(function(client){
                    engine.run(client).done(function(client){
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
                storage.init().done(function(){
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

		return {
			api: {
                events: events,
                protocol: protocol,
                engine: engine,
                storage: storage
			},
            config: config,
            models: models,
            init: init
		}
	}
})(jQuery);
