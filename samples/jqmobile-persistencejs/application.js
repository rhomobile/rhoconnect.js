onLoad = (function($) {

    var APP_TAG = 'GMap-RhoConnect';

    // let's start here
    function doAppLaunch() {
        // iPhone emu doesn't support this PhoneGap event, so it just commented out.
        //document.addEventListener("deviceready", function(){
            $.mobile.changePage($('#loginPage'));

            $('#loginPage a[data-role="button"]').live('tap',function(event, ui){
                var login = $('#loginPage #username')[0].value;
                var pass = $('#loginPage #password')[0].value;
                loginRhoConnect(login, pass).done(function(){
                    // doSync();
                    $.mobile.changePage($('#listPage'));
                    fillTheList();
                }).fail(function(errCode, err) {
                    alert(errCode);
                });
            });

        //}, false);
    }

    function fillTheList() {
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

    // Here is model definitions. RhoConnect.js don't need field definitions,
    // but it is needed for Ext.data.Model instances initializing.
    // At the moment RhoConnect.js stores all values as strings.
    var modelDefinitions = [
        {
            name: 'Product',
            fields: [
                {name: 'name',     type: 'string'},
                {name: 'brand',    type: 'string'},
                {name: 'price',    type: 'string'},
                {name: 'quantity', type: 'string'},
                {name: 'sku',      type: 'string'}
            ]
        }
    ];

    function loginRhoConnect(username, password) {
        persistence.store.rhoconnect.config(persistence);

        return $.Deferred(function(dfr){
            RhoConnect.login(username, password, true /*do db init*/).done(function(){
                // Init DB for the user on success
                RhoConnect.init(modelDefinitions, 'persistencejs').done(function(){
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

    return doAppLaunch;
})(jQuery);
