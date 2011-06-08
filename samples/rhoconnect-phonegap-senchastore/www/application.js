onLoad = (function($, Ext) {

    var APP_TAG = 'GMap-RhoConnect';

    // let's start here
    function doAppLaunch() {
        // iPhone emu doesn't support this PhoneGap event, so it just commented out.
        //document.addEventListener("deviceready", function(){
            initDeviceId();
            // UI initialization
            initGMap();
            //initLocationTest();
            initStore();
            loginRhoConnect("testUserToFailAuth", "userpass").done(function(){
                startSync();
            });
        //}, false);
    }

    var myUuid = null;
    var myName = null;

    function initDeviceId() {
        if ("undefined" != typeof device && (!myUuid || !myName)) {
            myUuid = device['uuid'];
            myName = device['name'];

            alert('Device uuid: ' + myUuid);
            alert('Device name: ' + myName);
        } else {
            myUuid = 'UNDEFINED';
            myName = 'UNDEFINED';
        }
    }

    var map = null;
    var markers = {};

    function initGMap() {
        var startHere = new google.maps.LatLng(37.317306, -121.947556);
        //var startHere = new google.maps.LatLng(60.02463,30.421507);
        var mapOpts = {
            zoom: 0,
            center: startHere,
            mapTypeId: google.maps.MapTypeId.ROADMAP
        };
        map = new google.maps.Map(document.getElementById("map_canvas"), mapOpts);
    }

    function initLocationTest() {
        alert('initLocationTest()');
        // Options: retrieve the location every 3 seconds
        //
        var watchID = navigator.geolocation.watchPosition(function(position){
            alert(  'Latitude: '  + position.coords.latitude + '\n' +
                    'Longitude: ' + position.coords.longitude + '\n');
        }, function(error){
            alert('code: '    + error.code    + '\n' +
                  'message: ' + error.message + '\n');
        }, { frequency: 3000, enableHighAccuracy: true });
    }


    var syncInterval = null;

    function startSync() {
        syncInterval = setInterval(doSync, 5 * 1000); // preform data sync every 5 seconds
    }

    // Perform data synchronization with the server
    function doSync(){
        RhoConnect.syncAllSources().done(function(){
            //alert('data sync OK!');
            // set my location
            setMyLocation();
            // update locations
            updateLocations();
        }).fail(function(errCode, err){
            alert('Data sync error: ' +errCode);
            clearInterval(syncInterval);
            syncInterval = null;
        });
    }

    function setMyLocation() {
        if ("undefined" == typeof navigator || null == navigator) return;

        navigator.geolocation.getCurrentPosition(function(position){
            var store = stores['Customer'];
            store.load(storeLoaded);

            function storeLoaded(records, operation, success) {
                var myRecord = null;

                for (var i=0; i<store.getCount(); i++) {
                    var record = store.getAt(i);
                    var first = record.get('first') || '';
                    var last = record.get('last') || '';
                    if (first == APP_TAG && last == myUuid) {
                        myRecord = record;
                    }
                }
                //alert('My record is: ' + myRecord);

                var lat = position.coords.latitude +'';
                var lng = position.coords.longitude +'';

                try {
                    if (!myRecord) {
                        myRecord = store.add({
                            city: APP_TAG,
                            address: myUuid,
                            first: APP_TAG,
                            last: myUuid,
                            lat: lat,
                            'long': lng
                         })[0];
                    } else {
                        myRecord.set('city', APP_TAG);
                        myRecord.set('address', myUuid);
                        myRecord.set('first', APP_TAG);
                        myRecord.set('last', myUuid);
                        myRecord.set('lat', lat);
                        myRecord.set('long', lng);
                    }
                    myRecord.save();
                    store.sync();
                } catch(ex) {
                    alert('Exception while updating my position: ' +ex);
                    //alert('Unable to read position via PhoneGap API');
                }
            }

        }, function(error){
            alert('PhoneGap location error! \n' +
                    'code: '    + error.code    + '\n' +
                    'message: ' + error.message + '\n');
        }, { enableHighAccuracy: true });


    }

    function updateLocations() {
        var store = stores['Customer'];
        store.load(storeLoaded);

        function storeLoaded(records, operation, success) {
            for (var i=0; i<store.getCount(); i++) {
                var record = store.getAt(i);

                var city = record.get('city') || '';
                var address = record.get('address') || '';
                var first = record.get('first') || '';
                var last = record.get('last') || '';

                var lat = record.get('lat');
                var lng = record.get('long');

                if (city == APP_TAG && address && lat && lng) {
                    updateMarker(city+' '+address, first+' '+last, lat, lng);
                    //if (last == 'UNDEFINED-2') alert('UNDEFINED-2\n' +'lat: ' +lat +'\n' +'long: ' +lng +'\n');
                }
            }
        }
    }

    function updateMarker(id, name, lat, lng) {
        var pos = new google.maps.LatLng(lat, lng);
        if (!markers[id]) {
            markers[id] = new google.maps.Marker({
                position: pos,
                map: map,
                title: name
            });
        } else {
            markers[id].setPosition(pos);
        }
    }

    // ========= RhoConnect related code goes from here ====================

    // Here is model definitions. RhoConnect.js don't need field definitions,
    // but it is needed for Ext.data.Model instances initializing.
    // At the moment RhoConnect.js stores all values as strings.
    var modelDefinitions = [
        {
            name: 'Customer',
            fields: [
                {name: 'id',      type: 'int'},
                {name: 'first',   type: 'string'},
                {name: 'last',    type: 'string'},
                {name: 'phone',   type: 'string'},
                {name: 'email',   type: 'string'},
                {name: 'address', type: 'string'},
                {name: 'city',    type: 'string'},
                {name: 'state',   type: 'string'},
                {name: 'zip',     type: 'string'},
                {name: 'lat',     type: 'string'},
                {name: 'long',    type: 'string'}
            ]
        }
    ];

    var stores = {};

    function initStore() {
        var proxy = {
            type: 'rhoconnect',
            // Here is special type of Proxy used. It is
            // Ext.data.RhoconnectStorageProxy defined in the rhoconnect.plugin-extjs.js file
            dbName: 'rhoConnectDb',
            root: 'items',
            reader: {
                type: 'json',
                root: 'items'
            }
        };
        // This function builds store for provided model
        function buildStoreFor(model) {
            return new Ext.data.Store({
                // It forms id as <ModelName>Store
                id: model.name+'Store',
                autoLoad: false,
                model: model.name,
                proxy: proxy
            });
        }
        // For each of model definition
        $.each(modelDefinitions, function(idx, model){
            // we are register the model with Ext.ModelMgr
            Ext.regModel(model.name, Ext.apply(model, {proxy: proxy}));
            // build store, list and form
            stores[model.name] = buildStoreFor(model);
        });
    }

    function loginRhoConnect(username, password) {
        return $.Deferred(function(dfr){
            RhoConnect.login(username, password,
                    new RhoConnect.SyncNotification(), true /*do db init*/).done(function(){
                // Init DB for the user on success
                initRhoconnect(username, false).done(function(){
                    dfr.resolve();
                }).fail(function(errCode, err){
                    alert('DB init error: ' +errCode);
                    dfr.reject(errCode, err);
                });
            }).fail(function(errCode, err){
                alert('RhoConnect login error: ' +errCode);
                dfr.reject(errCode, err);
            });
        }).promise();
    }

    // RhoConnect.js initialization
    function initRhoconnect(username, doReset) {
        return RhoConnect.init(modelDefinitions, 'native', null, doReset);
    }

    return doAppLaunch;
})(jQuery, Ext);
