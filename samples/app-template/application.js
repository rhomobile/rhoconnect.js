// ===========================================================================
// This template doesn't show you all the details on how to use any exact
// UI or data API library. Instead, it just demonstrate a good way to organize
// application code, providing a usable template for quick start. Also, some
// possible glitches and quirks of used libraries are described here.
//
// For information on how to use exact UI or data API library look for
// appropriate documents from a library provider, please.
// ===========================================================================

// NOTE: It is a good behavior to isolate your code in anonymous namespace
(function($ /*, Ext*/) { // Anonymous namespace begin, uncomment Ext argument to use SenchaTouch in your app

    // Application initialization using jQuery once application is loaded COMPLETELY
    $(window).bind('load', function(){

        // Use this pattern to start application with PhoneGap
        // NOTE: it looks like iPhone emulator doesn't support this PhoneGap event, so comment it out for debug.
        /*
        document.addEventListener("deviceready", function(){
            appStart();
        }, false);
        */
        appStart(); // Or start your application directly
    });

    function appStart() {
        initUI();
        initRhoConnect()
    }

    function initUI() {
        // Using jQuery Mobile you can force UI to switch visible page once application started
        //$.mobile.changePage($('#loginPage'));
    }

    // Here is sample of models definition. RhoConnect.js don't need
    // a field definitions for models, but it may be needed for each
    // exact data API used in your app. So it is mandatory for now.
    // At the moment RhoConnect.js stores all values as strings.
    var modelDefinitions = [
        {
            name: 'Product',
            fields: [
                {name: 'id',        type: 'int'},
                {name: 'brand',     type: 'string'},
                {name: 'name',      type: 'string'},
                {name: 'sku',       type: 'string'},
                {name: 'price',     type: 'string'},
                {name: 'quantity',  type: 'string'}
            ]
        }
    ];

    function initRhoConnect() {
        // Uncomment line below if your application using Persistence.js
        //persistence.store.rhoconnect.config(persistence);

        RhoConnect.login('someUsername', 'someValidPassword').done(function(){
            // Init DB for the user on success
            RhoConnect.init(modelDefinitions, 'persistencejs' /*or 'extjs' for SenchaTouch*/).done(function(){
                rhoConnectIsReadyToUse();
            }).fail(function(errCode, err){
                // Feel free to use more UI-specific errors reporting
                //alert('RhoConnect init error: ' +errCode);
            });
        }).fail(function(errCode, err){
            // Feel free to use more UI-specific errors reporting
            //alert('RhoConnect login error: ' +errCode);
        });
    }

    function rhoConnectIsReadyToUse() {
        // Once RhoConnect.js is initialized and connected to the server, you
        // can call synchronization and use data API to access data objects
        RhoConnect.syncAllSources().done(function() {
            // Reload some lists, just for example
            //reloadLists();
        }).fail(function(errCode, err){
            // NOTE:
            // RhoConnect.syncAllSource will not fail on some exact model synchronizing error.
            // Instead, it will be reported as sync progress notification. See the reference guide.

            // Show error message on failure, just for example
            //showError('Synchronization error', errCode, err);
        });
    }

})(jQuery /*, Ext*/); // Anonymous namespace end, uncomment Ext argument to use SenchaTouch in your app
