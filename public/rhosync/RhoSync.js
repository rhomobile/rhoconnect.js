(function($) {
    RhoSync = function(cfg) {

        const SESSION_COOKIE = 'rhosync_session';

        const NOTIFY_GENERIC = 'rhoSyncNotifyGeneric';
        const NOTIFY_CLIENT_CREATED = 'rhoSyncNotifyClientCreated';

        var defaults = {
			syncserver: "",
			pollinterval: 20
		};

		var config = $.extend({}, defaults, cfg);

        var initDbSchemaSQL = ''
            +'CREATE TABLE client_info ('
                    +' "client_id" VARCHAR(255) default NULL,'
                    +' "session" VARCHAR(255) default NULL,'
                    +' "token" VARCHAR(255) default NULL,'
                    +' "token_sent" BIGINT default 0,'
                    +' "reset" BIGINT default 0,'
                    +' "port" VARCHAR(10) default NULL,'
                    +' "last_sync_success" VARCHAR(100) default NULL);'
            +'CREATE TABLE object_values ('
                    +' "source_id" BIGINT default NULL,'
                    +' "attrib" varchar(255) default NULL,'
                    +' "object" varchar(255) default NULL,'
                    +' "value" varchar default NULL);'
            +'CREATE TABLE changed_values ('
                    +' "source_id" BIGINT default NULL,'
                    +' "attrib" varchar(255) default NULL,'
                    +' "object" varchar(255) default NULL,'
                    +' "value" varchar default NULL,'
                    +' "attrib_type" varchar(255) default NULL,'
                    +' "update_type" varchar(255) default NULL,'
                    +' "sent" BIGINT default 0);'
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
            +'CREATE INDEX by_src_id on object_values ("source_id");'
            +'CREATE UNIQUE INDEX by_src_object ON object_values ("object", "attrib", "source_id");'
            +'CREATE INDEX by_src_value ON object_values ("attrib", "source_id", "value");'
            ;

        var dropDbSchemaSQL = ''
            +'DROP INDEX IF EXISTS by_src_value;'
            +'DROP INDEX IF EXISTS by_src_object;'
            +'DROP INDEX IF EXISTS by_src_id;'
            +'DROP TABLE IF EXISTS sources;'
            +'DROP TABLE IF EXISTS changed_values;'
            +'DROP TABLE IF EXISTS object_values;'
            +'DROP TABLE IF EXISTS client_info;'
            ;

        var storage = function(dbName) {

            function _tx(db) {
                var dfr = $.Deferred();
                db.transaction(function (tx) {
                    dfr.resolve(tx);
                }, function(err){
                    dfr.reject(err);
                });
                return dfr.promise();
            }

            function _execSql(tx, sql, values) {
                var dfr = $.Deferred();
                tx.executeSql(sql, values, function(tx, rs){
                    dfr.resolve(tx, rs);
                }, function(tx, err){
                    dfr.reject(tx, err);
                });
                return dfr.promise();
            }

            function _execInTx(db, sql, values) {
                var dfr = $.Deferred();
                _tx(db).done(function(tx) {
                    _execSql(tx, sql, values).done(function(tx, rs){
                        dfr.resolve(tx, rs);
                    }).fail(function(tx, err){
                        dfr.reject(tx, err);
                    });
                }).fail(function(err){
                    dfr.reject(db, err);
                });
                return dfr.promise();
            }

            function open()
            {
                var dfr = $.Deferred();
                try {
                    var db = openDatabase(dbName, '1.0', 'RhoSync database', 2 * 1024 * 1024);
                    dfr.resolve(db);
                } catch(ex) {
                    dfr.reject(ex);
                }
                return dfr.promise();
            }

            function close()/*throws DBException*/{}

            function executeSQL(sql, values)
            {
                var dfr = $.Deferred();
                open().done(function(db){
                    _execInTx(db, sql, values).done(function(tx, rs){
                        dfr.resolve(tx, rs);
                    }).fail(function(obj, err){
                        dfr.reject(obj, err);
                    });
                }).fail(function(ex){
                    dfr.reject(null, ex);
                });
                return dfr.promise();
            }

            function executeBatchSQL(sql)
            {
                var dfr = $.Deferred();
                var statements = sql.split(";");
                for(var i in statements) {
                    var stmt = statements[i];
                    if(stmt) { // means: it is defined and not null and not empty string
                        executeSQL(statements[i], null).fail(function(obj, err){
                            dfr.reject(obj, err);
                        });
                    }
                }
                dfr.resolve();
                return dfr.promise();
            }

            function iniDb()
            {
                return executeBatchSQL(initDbSchemaSQL);
            }

            function getAllTableNames()
            {
                var dfr = $.Deferred();
                executeSQL("SELECT name FROM sqlite_master WHERE type='table'", null).done(function(tx, rs){
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

            return {
                open: open,
                close: close,
                executeSQL: executeSQL,
                executeBatchSQL: executeBatchSQL,
                initSchema: iniDb,
                getAllTableNames: getAllTableNames
            }
        }('rhoSyncDb');

        var engine = function(){
            var client = null;

            function _clientCreate() {
                return _net_call(config.syncserver+'/clientcreate', "", "get", "text/plain");
            }

            function clientInfo() {
                return $.extend({}, client);
            }

            function clientCreate() {
                _clientCreate().done(function(status, data){
                    client = data;
                    _notify(NOTIFY_CLIENT_CREATED, clientInfo());
                }).fail(function(status, error){
                    client = null;
                    _notify(NOTIFY_CLIENT_CREATED, error);
                });
            }

            return {
                clientInfo: clientInfo,
                clientCreate: clientCreate
            }
        }();

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

        function _notify(type /*, arg1, arg2, ... argN*/) {
            $(window).trigger(jQuery.Event(type), $.makeArray(arguments).slice(1));
            // fire exact notifications here
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

		return {
			api: {
                events: {
                    NOTIFY_GENERIC: NOTIFY_GENERIC,
                    NOTIFY_CLIENT_CREATED: NOTIFY_CLIENT_CREATED
                },
                login: login,
                engine: engine,
                storage: storage
			},
			rhoconfig: config
		}
	}
})(jQuery);
