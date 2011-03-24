(function($) {

    function publicInterface() {
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
        };
    }

    var rho = RhoSync.rho;

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

    function _open(name, version, comment, size) {
        return $.Deferred(function(dfr){
            try {
                var db = openDatabase(
                        name || rho.config.dbName,
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
                    var source = new rho.engine.Source(
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
                    var source = rho.engine.Source(
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

    $.extend(rho, {storage: publicInterface()});

})(jQuery);
