var map = null;
var definedModels = {};
var firstName = null;
var secondName = null;

onLoad = (function($) {

    var APP_TAG = 'GMap-RhoConnect';

    // let's start here
    function doAppLaunch() {
        // iPhone emu doesn't support this PhoneGap event, so it just commented out.
            //document.addEventListener("deviceready", function(){
            $.mobile.changePage('form');
            
            initDeviceId();
            // UI initialization
            initGMap();
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

            //alert('Device uuid: ' + myUuid);
            //alert('Device name: ' + myName);
        } else {
            myUuid = 'UNDEFINED';
            myName = 'UNDEFINED';
        }
    }

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

        $('div#map').live('pageshow',function(event, ui){
            //alert('Page show, RESIZE!');
            google.maps.event.trigger(map, 'resize');
        });

    }


    var syncInterval = null;

    function startSync() {
        syncInterval = setInterval(doSync, 5 * 1000); // preform data sync every 5 seconds
        //doSync();
    }

    // Perform data synchronization with the server
    function doSync(){
        if (!firstName && !secondName) return;
        
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
            var model = definedModels['Customer'];

            persistence.loadFromRhoConnect(function() {
                storeLoaded();
            });

            function storeLoaded() {
                var myRecord = null;

                model.all().each(null /*no tx*/, function(customer){
                    var city = customer.city || '';
                    var address = customer.address || '';
                    if (city == APP_TAG && address == myUuid) {
                        myRecord = customer;
                    }
                    //TODO: is async?
                });

                //alert('My record is: ' + myRecord);

                var lat = position.coords.latitude +'';
                var lng = position.coords.longitude +'';

                var doSave = false;
                try {
                    if (!myRecord) {
                        myRecord = new model();
                        myRecord.city = APP_TAG;
                        myRecord.address = myUuid;
                        myRecord.first = firstName;
                        myRecord.last = secondName;
                        myRecord.lat = lat;
                        myRecord['long'] = lng;
                        persistence.add(myRecord);
                        doSave = true;
                    } else if (myRecord.lat != lat || myRecord['long'] != lng) {
                        myRecord.city = APP_TAG;
                        myRecord.address = myUuid;
                        myRecord.first = firstName;
                        myRecord.last = secondName;
                        myRecord.lat = lat;
                        myRecord['long'] = lng;
                        doSave = true;
                    }

                    if (doSave) {
                        persistence.flush();
                        persistence.saveToRhoConnect(function() {
                            //alert("All data saved!");
                        });
                    }
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
        var model = definedModels['Customer'];

        persistence.loadFromRhoConnect(function() {
            storeLoaded();
        });

        function storeLoaded() {
            model.all().each(null /*no tx*/, function(customer){
                var city = customer.city || '';
                var address = customer.address || '';
                var first = customer.first || '';
                var last = customer.last || '';

                var lat = customer.lat;
                var lng = customer['long'];

                if (city == APP_TAG && address && lat && lng) {
                    updateMarker(city+' '+address, first+' '+last, lat, lng);
                    //if (last == 'UNDEFINED-2') alert('UNDEFINED-2\n' +'lat: ' +lat +'\n' +'long: ' +lng +'\n');
                }
            });
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
                {name: persistence.store.rhoconnect.RHO_ID, type: 'string'}, // id of the object in RhoConnect db
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

    function initStore() {

        persistence.store.rhoconnect.config(persistence);


        function convertType(type) {
            if (!type) return 'TEXT';
            switch(type) {
                case 'string': return 'TEXT';
                default: return type.toUpperCase();
            }
        }

        $.each(modelDefinitions, function(idx, model){
            var mHash = {};
            $.each(model.fields, function(idx, fld){
                mHash[fld.name] = convertType(fld.type);
            });
            definedModels[model.name] = persistence.define(model.name, mHash);
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
})(jQuery);
