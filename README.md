RhoConnect.js
===

A javascript client library for the [RhoConnect](http://rhomobile.com/products/rhosync) App Integration Server.

Using rhoconnect.js, your application's model data will transparently synchronize with a mobile application built using the [Rhodes framework](http://rhomobile.com/products/rhodes), or any of the available [RhoConnect clients](http://rhomobile.com/products/rhosync/).  This client includes built-in support for [SenchaTouch](http://www.sencha.com/) data API and [Persistence.js](http://persistencejs.org/) models.

Rhoconnect.js is completely UI-agnostic framework, so feel free to use any type of UI javascript library.

Due to to the CORS support in [RhoConnect](http://rhomobile.com/products/rhosync) server, you able to create cross-domain applications and standalone mobile applications using [PhoneGap](http://www.phonegap.com/) framework.

It depends on:
* [jQuery](http://jquery.com/) library
* jQuery [Base64](http://github.com/carlo/jquery-base64) plugin
* jQuery [JSON](http://jollytoad.googlepages.com/json.js) plugin

Rhoconnect.js actively using *deferred/promise* objects from jQuery API. All asynchronous results are returned as parameter values of *done(..)* method call of returned *promise* object.

## Getting started

Load the rhoconnect.js library:

    <html>
	<head>
        <script type="text/javascript" charset="utf-8" src="external/jquery/jquery-1.6.1.min.js"></script>
        <script type="text/javascript" charset="utf-8" src="external/jquery/jquery.base64.min.js"></script>
        <script type="text/javascript" charset="utf-8" src="external/jquery/json.js"></script>

        <script type="text/javascript">
            RhoConfig = {
                // is used to form the websql database name as <appName>_<login>
                appName: 'rhoPGapSenchaDataSample',
                // RhoConnect application URL
                syncServer: 'http://rhohub-lars-692f63a7.rhosync.com/application'
            };
        </script>

        <script type="text/javascript" charset="utf-8" src="js/rhoconnect-0_9.min.js"></script>
        <script type="text/javascript" charset="utf-8" src="js/your_application.js"></script>
	</head>
    <body>
    </body>
    </html>

To use rhoconnect.js you need to login and initialize rhoconnect.js with model definitions this way:

    function onSomeClick() {
        loginRhoConnect("someUser", "somePass", false).done(function(){
            // start you business logic here, say..

            var syncInterval = setInterval(function(){

                RhoConnect.syncAllSources().done(function(){
                    // updateSomeUI();
                }).fail(function(errCode, err){
                    alert('Data sync error: ' +errCode);
                    clearInterval(syncInterval);
                    syncInterval = null;
                });

            }, 3 * 1000)
        });
    }

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

    function loginRhoConnect(username, password, doDataReset) {
        return $.Deferred(function(dfr){

            RhoConnect.login(username, password,
                    new RhoConnect.SyncNotification(), doDataReset).done(function(){

                // Init DB for the user on success
                RhoConnect.init(modelDefinitions /*, dataApiType, syncProgressCallback */).done(function(){
                    dfr.resolve();
                }).fail(function(errCode, errMessage){
                    alert('DB init error: ' +errCode);
                    dfr.reject(errCode, errMessage);
                });

                initRhoconnect(username, false).done(function(){
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

You can use *RhoConnect.dataAccessObjects()* to obtain data API specific objects to access you data. See the API reference.

## Meta
Created and maintained by Dmitry Prokhorov.

Released under the [MIT License](http://www.opensource.org/licenses/mit-license.php).
