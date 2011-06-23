if('undefined' != typeof window.persistence){(function($, persistence) {

    function publicInterface() {
        return {
            initModels: initModels,
            dataAccessObjects: dataAccessObjects
        };
    }

    var rho = RhoConnect.rho;

    var definedModels = {};

    if (!persistence.store) {
        persistence.store = {};
    }

    persistence.store.rhoconnect = {};
    persistence.store.rhoconnect.RHO_ID = '_rhoId';

    persistence.store.rhoconnect.config = function(persistence, dbname) {

        var argspec = persistence.argspec;
        dbname = dbname || 'persistenceData';

        var allObjects = {}; // entityName -> LocalQueryCollection

        persistence.getAllObjects = function() {
            return allObjects;
        };

        var defaultAdd = persistence.add;

        persistence.add = function(obj) {
            if (!this.trackedObjects[obj.id]) {
                defaultAdd.call(this, obj);
                var entityName = obj._type;
                if (!allObjects[entityName]) {
                    allObjects[entityName] = new persistence.LocalQueryCollection();
                    allObjects[entityName]._session = persistence;
                }
                allObjects[entityName].add(obj);
            }
            return this;
        };

        var defaultRemove = persistence.remove;

        persistence.remove = function(obj) {
            defaultRemove.call(this, obj);
            var entityName = obj._type;
            allObjects[entityName].remove(obj);
        };

        persistence.schemaSync = function (tx, callback, emulate) {
            var args = argspec.getArgs(arguments, [
                { name: "tx", optional: true, check: persistence.isTransaction, defaultValue: null },
                { name: "callback", optional: true, check: argspec.isCallback(), defaultValue: function() {
                } },
                { name: "emulate", optional: true, check: argspec.hasType('boolean') }
            ]);

            args.callback();
        };

        persistence.flush = function (tx, callback) {
            var args = argspec.getArgs(arguments, [
                { name: "tx", optional: true, check: persistence.isTransaction },
                { name: "callback", optional: true, check: argspec.isCallback(), defaultValue: function() {
                } }
            ]);

            var fns = persistence.flushHooks;
            persistence.asyncForEach(fns, function(fn, callback) {
                fn(session, tx, callback);
            }, function() {
                var trackedObjects = persistence.trackedObjects;
                for (var id in trackedObjects) {
                    if (trackedObjects.hasOwnProperty(id)) {
                        if (persistence.objectsToRemove.hasOwnProperty(id)) {
                            delete trackedObjects[id];
                        } else {
                            trackedObjects[id]._dirtyProperties = {};
                        }
                    }
                }
                args.callback();
            });
        };

        persistence.transaction = function(callback) {
            setTimeout(function() {
                callback({executeSql: function() {
                } });
            }, 0);
        };



        persistence.loadFromRhoConnect = function(callback) {

            var models = {};
            $.each(definedModels, function(modelName, model) {
                if (definedModels.hasOwnProperty(modelName)) {
                    models[modelName] = 'anything';
                }
            });
            var dfrMap = RhoConnect.rho.deferredMapOn(models);

            $.each(definedModels, function(modelName, model) {
                if (definedModels.hasOwnProperty(modelName)) {
                    loadAll(modelName).done(function(){
                        dfrMap.resolve(modelName);
                    }).fail(function(){
                        dfrMap.reject(modelName);
                    });
                }
            });

            dfrMap.when().done(done).fail(done);
            function done() {
                persistence.flush();
                if(callback) {
                    callback();
                }
            }
        };


        persistence.saveToRhoConnect = function(callback) {

            var models = {};
            $.each(definedModels, function(modelName, model) {
                if (definedModels.hasOwnProperty(modelName)) {
                    models[modelName] = 'anything';
                }
            });
            var dfrMap = RhoConnect.rho.deferredMapOn(models);

            $.each(definedModels, function(modelName, model) {
                if (definedModels.hasOwnProperty(modelName)) {
                    saveAll(modelName).done(function(){
                        dfrMap.resolve(modelName);
                    }).fail(function(){
                        dfrMap.reject(modelName);
                    });
                }
            });

            dfrMap.when().done(done).fail(done);
            function done() {
                //persistence.flush();
                if(callback) {
                    callback();
                }
            }

        };

        function getStorageObject() {
            return RhoConnect.rho.storage;
        }

        function loadAll(srcName) {
            var that = this;
            var storage = getStorageObject();

            function _setupObject(map, id, attrib, value) {
                if (!map[id]) map[id] = {};
                map[id][attrib] = value;
                map[id][persistence.store.rhoconnect.RHO_ID] = id;
            }

            function _buildRecord(id, objAttrs) {
                var record = new definedModels[srcName]();
                record.rhoId = id;
                $.each(objAttrs, function(name, val){
                    record[name] = val;
                });
                return record;
            }

            function _setupRecord(record) {
                var recId = record[persistence.store.rhoconnect.RHO_ID];
                var idAttr = persistence.store.rhoconnect.RHO_ID;
                definedModels[srcName].findBy(persistence, null, idAttr, recId, function(found) {
                    if (found) {
                        $.each(record, function(attrName, value) {
                            if (record.hasOwnProperty(attrName)) {
                                found[attrName] = value;
                            }
                        })
                    } else {
                        persistence.add(record);
                    }
                });
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
                    $.each(objects, function(id, object){
                        _setupRecord(_buildRecord(id, object));
                    });
                    dfr.resolve();
                }
            }).promise();
        }

        function saveAll(srcName) {
            var that = this;
            var storage = getStorageObject();

            var records = {};
            definedModels[srcName].all().each(null, function(record){
                function _hasDirtyProps(record) {
                    for (var p in record._dirtyProperties) {
                        if (record._dirtyProperties.hasOwnProperty(p)) {
                            return true;
                        }
                    }
                    return false;
                }

                if (record._new || _hasDirtyProps(record)) {
                    records[record.id] = record;
                }
            });

            var dfrMap = RhoConnect.rho.deferredMapOn(records);

            $.each(records, function(id, record){
                persistRecord(record).done(function(){
                    dfrMap.resolve(id);
                }).fail(function(obj, err){
                    dfrMap.reject(id);
                });
            });
            return dfrMap.when();

            function persistRecord(record) {
                var srcId = null;
                var id = record[persistence.store.rhoconnect.RHO_ID].toString() || getNextId();
                var isNew = record._new;

                var objHash = {};
                $.each(record, function(fldName, value){
                    // skip persistence.js specific props
                    if (record.hasOwnProperty(fldName) && !(fldName.match(/^_/))  && ('object' != typeof value)) {
                       objHash[fldName] = value;
                    }
                });

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

                    // to select UPDATE/INSERT query we firstly need to know which attributes already present for the object
                    var attrsToUpdate = {};
                    function _localWithSrcId() {
                        storage.executeSql("SELECT attrib FROM object_values WHERE object=?",
                                [id]).done(function(tx, rs){
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
                            $.each(objHash, function(name, value) {

                                var query = attrsToUpdate[name] ? updateQuery : insertQuery;
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
                            dfr.resolve(id);
                        }).fail(function(obj, err){
                            dfr.reject(null, 'setRecord() update/insert attr error');
                        });
                    }
                }).promise();
            }
        }

        var baseTempId = null;
        function getNextId() {
            baseTempId = baseTempId || (Date.now() - (new Date(2009, 1, 1)).getTime());
            baseTempId = baseTempId + 1;
            return baseTempId;
        }

        /**
         * Remove all tables in the database (as defined by the model)
         */
        persistence.reset = function (tx, callback) {
            var args = argspec.getArgs(arguments, [
                { name: "tx", optional: true, check: persistence.isTransaction, defaultValue: null },
                { name: "callback", optional: true, check: argspec.isCallback(), defaultValue: function() {
                } }
            ]);
            tx = args.tx;
            callback = args.callback;

            allObjects = {};
            definedModels = {};
            this.clean();
            callback();
        };

        /**
         * Dummy
         */
        persistence.close = function() {
        };

        // QueryCollection's list

        function makeLocalClone(otherColl) {
            var coll = allObjects[otherColl._entityName];
            if (!coll) {
                coll = new persistence.LocalQueryCollection();
            }
            coll = coll.clone();
            coll._filter = otherColl._filter;
            coll._prefetchFields = otherColl._prefetchFields;
            coll._orderColumns = otherColl._orderColumns;
            coll._limit = otherColl._limit;
            coll._skip = otherColl._skip;
            coll._reverse = otherColl._reverse;
            return coll;
        }

        /**
         * Asynchronous call to actually fetch the items in the collection
         * @param tx transaction to use
         * @param callback function to be called taking an array with
         *   result objects as argument
         */
        persistence.DbQueryCollection.prototype.list = function (tx, callback) {
            var args = argspec.getArgs(arguments, [
                { name: 'tx', optional: true, check: persistence.isTransaction, defaultValue: null },
                { name: 'callback', optional: false, check: argspec.isCallback() }
            ]);
            tx = args.tx;
            callback = args.callback;

            var coll = makeLocalClone(this);
            coll.list(null, callback);
        };

        /**
         * Asynchronous call to remove all the items in the collection.
         * Note: does not only remove the items from the collection, but
         * the items themselves.
         * @param tx transaction to use
         * @param callback function to be called when clearing has completed
         */
        persistence.DbQueryCollection.prototype.destroyAll = function (tx, callback) {
            var args = argspec.getArgs(arguments, [
                { name: 'tx', optional: true, check: persistence.isTransaction, defaultValue: null },
                { name: 'callback', optional: true, check: argspec.isCallback(), defaultValue: function() {
                } }
            ]);
            tx = args.tx;
            callback = args.callback;

            var coll = makeLocalClone(this);
            coll.destroyAll(null, callback);
        };

        /**
         * Asynchronous call to count the number of items in the collection.
         * @param tx transaction to use
         * @param callback function to be called when clearing has completed
         */
        persistence.DbQueryCollection.prototype.count = function (tx, callback) {
            var args = argspec.getArgs(arguments, [
                { name: 'tx', optional: true, check: persistence.isTransaction, defaultValue: null },
                { name: 'callback', optional: false, check: argspec.isCallback() }
            ]);
            tx = args.tx;
            callback = args.callback;

            var coll = makeLocalClone(this);
            coll.count(null, callback);
        };

        persistence.ManyToManyDbQueryCollection = function(session, entityName) {
            this.init(session, entityName, persistence.ManyToManyDbQueryCollection);
            this._items = [];
        };

        persistence.ManyToManyDbQueryCollection.prototype = new persistence.LocalQueryCollection();

        persistence.ManyToManyDbQueryCollection.prototype.initManyToMany = function(obj, coll) {
            this._obj = obj;
            this._coll = coll; // column name
        };

        persistence.ManyToManyDbQueryCollection.prototype.add = function(item, recursing) {
            persistence.LocalQueryCollection.prototype.add.call(this, item);
            if (!recursing) { // prevent recursively adding to one another
                // Let's find the inverse collection
                var meta = persistence.getMeta(this._obj._type);
                var inverseProperty = meta.hasMany[this._coll].inverseProperty;
                persistence.get(item, inverseProperty).add(this._obj, true);
            }
        };

        persistence.ManyToManyDbQueryCollection.prototype.remove = function(item, recursing) {
            persistence.LocalQueryCollection.prototype.remove.call(this, item);
            if (!recursing) { // prevent recursively adding to one another
                // Let's find the inverse collection
                var meta = persistence.getMeta(this._obj._type);
                var inverseProperty = meta.hasMany[this._coll].inverseProperty;
                persistence.get(item, inverseProperty).remove(this._obj, true);
            }
        };
    };

    function initModels(modelDefs) {
        function convertType(type) {
            if (!type) return 'TEXT';
            switch(type) {
                case 'string': return 'TEXT';
                default: return type.toUpperCase();
            }
        }

        $.each(modelDefs, function(idx, model){
            var mHash = {};
            $.each(model.fields, function(idx, fld){
                mHash[fld.name] = convertType(fld.type);
            });
            // we need additional id field for rhosync support
            mHash[persistence.store.rhoconnect.RHO_ID] = convertType('string');
            definedModels[model.name] = persistence.define(model.name, mHash);
        });
    }

    function dataAccessObjects() {
        return definedModels;
    }

    try {
        exports.config = persistence.store.rhoconnect.config;
        exports.getSession = function() {
            return persistence;
        };
    } catch(e) {
    }

    $.extend(rho.plugins, {persistencejs: publicInterface()});

})(jQuery, window.persistence)}
